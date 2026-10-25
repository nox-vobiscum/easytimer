import { openLocalStore, makeTestTicket, DB_PREFIX, canonical } from './adapter.mjs';
const fixture = (name = 'Synthetic A') => ({ schemaVersion: 1, templates: [{ id: 'synthetic-rundown', name, transitionMode: 'manual',
    phases: [{ id: 'synthetic-phase', title: 'Synthetic opening', durationSeconds: 600 }] }] });
const equal = (a, b, message) => { if (canonical(a) !== canonical(b)) throw Error(message); };
const check = (value, message) => { if (!value) throw Error(message); };
async function rejects(action, code) { try { await action(); } catch (error) { if (error.message === code) return; throw error; } throw Error('Expected ' + code); }

export async function runExperiments() {
    const results = [], connections = [];
    const name = label => DB_PREFIX + label + '-' + crypto.randomUUID();
    const open = async options => { const db = await openLocalStore(options); connections.push(db); return db; };
    const test = async (label, fn) => { await fn(); results.push({ test: label, result: 'PASS' }); };
    let peer;
    const legacyOriginal = localStorage.getItem('easyTimerTemplates');
    // Refuse unknown pre-existing data even on the test origin; never temporarily replace a user's library.
    if (legacyOriginal !== null) throw Error('LEGACY_TEST_KEY_ALREADY_PRESENT_USE_FRESH_PROFILE');
    try {
        await test('real IDB save and dirty metadata commit together; stale revision rejected', async () => {
            const db = await open({ name: name('save') });
            const saved = await db.save(fixture(), 0), read = await db.read();
            equal(read.library, saved, 'Readback differs'); equal(read.metadata.dirtyRevision, 1, 'Dirty revision missing');
            check(read.metadata.syncDirty, 'Not dirty');
            await rejects(() => db.save(fixture('stale'), 0), 'REVISION_CONFLICT');
            equal((await db.read()).library, saved, 'Stale save overwrote data');
        });
        await test('abort at each save boundary rolls back both stores', async () => {
            for (const point of ['before-library', 'after-library-request', 'after-dirty-request', 'before-commit']) {
                const dbName = name('abort'), seed = await open({ name: dbName }); await seed.save(fixture(), 0);
                const before = await seed.read();
                const failed = await open({ name: dbName, fault: where => { if (where === point) throw Error('INTERRUPTED'); } });
                await rejects(() => failed.save(fixture('not committed'), 1), 'INTERRUPTED');
                equal(await seed.read(), before, 'Partial commit at ' + point);
            }
        });
        await test('injected quota error after library request preserves original and dirty state', async () => {
            const dbName = name('quota'), seed = await open({ name: dbName }); await seed.save(fixture(), 0);
            const before = await seed.read();
            const failed = await open({ name: dbName, fault: point => { if (point === 'after-library-request') throw new DOMException('QuotaExceededError', 'QuotaExceededError'); } });
            await rejects(() => failed.save(fixture('not committed'), 1), 'QuotaExceededError');
            equal(await seed.read(), before, 'Quota caused partial data');
        });
        await test('native IDB ConstraintError aborts a transaction after its library write request', async () => {
            const dbName = name('native-error'), seed = await open({ name: dbName }); await seed.save(fixture(), 0);
            const before = await seed.read(); let durability;
            const failed = await open({ name: dbName, fault: (point, context) => {
                if (point === 'after-library-request') {
                    durability = context.tx.durability;
                    context.objects.metadata.add({ invalid: true }, 'current'); // Existing key: real request error, not a thrown mock.
                }
            } });
            await rejects(() => failed.save(fixture('must roll back'), 1), 'ConstraintError');
            equal(await seed.read(), before, 'Native request failure partly committed'); equal(durability, 'strict', 'Strict durability was not requested');
        });
        await test('storage access denied: no memory-only success fallback', async () => {
            await rejects(() => openLocalStore({ name: name('denied'), factory: { open() { throw new DOMException('blocked', 'SecurityError'); } } }), 'STORAGE_BLOCKED');
        });
        await test('dirty library recovers after close/reopen without an upload ticket', async () => {
            const dbName = name('dirty'), db = await open({ name: dbName }); await db.save(fixture(), 0); db.close();
            const reopened = await open({ name: dbName }), recovery = await reopened.recover();
            check(recovery.needsTicket && recovery.outbox === null && recovery.metadata.syncDirty, 'Dirty work lost');
        });
        await test('fixed ticket survives reopen; newer saves do not replace old bytes or clear dirty', async () => {
            const dbName = name('ticket'), db = await open({ name: dbName }); const state = await db.save(fixture(), 0);
            const ticket = await makeTestTicket(state), prepared = await db.prepareTicket(ticket);
            equal(await db.prepareTicket(ticket), prepared, 'Idempotent ticket differed');
            await rejects(async () => db.prepareTicket(await makeTestTicket(state)), 'OUTBOX_FIXED');
            await db.save(fixture('newer'), 1); db.close();
            const recovered = await (await open({ name: dbName })).recover();
            equal(recovered.outbox.ticket, ticket, 'Old ticket changed');
            check(recovered.newerDirtyRevision && recovered.metadata.syncDirty, 'New work incorrectly confirmed');
        });
        await test('hash prepared outside transaction is revision-checked inside transaction', async () => {
            const db = await open({ name: name('stale-ticket') }), old = await db.save(fixture(), 0);
            const ticket = await makeTestTicket(old); await db.save(fixture('advanced'), 1);
            await rejects(() => db.prepareTicket(ticket), 'REVISION_CONFLICT'); check((await db.read()).outbox === null, 'Stale ticket stored');
        });
        await test('ticket abort boundaries leave no partial outbox and retain dirty revision', async () => {
            for (const point of ['before-ticket', 'after-ticket-request', 'before-ticket-commit']) {
                const dbName = name('abort-ticket'), db = await open({ name: dbName }), saved = await db.save(fixture(), 0);
                const ticket = await makeTestTicket(saved), before = await db.read();
                const failed = await open({ name: dbName, fault: where => { if (where === point) throw Error('INTERRUPTED'); } });
                await rejects(() => failed.prepareTicket(ticket), 'INTERRUPTED'); equal(await db.read(), before, 'Ticket partly stored');
            }
        });
        await test('invalid library and malformed ticket rejected without writes', async () => {
            const db = await open({ name: name('invalid') });
            await rejects(() => db.save({ schemaVersion: 2, templates: [] }, 0), 'invalidData');
            await rejects(() => db.save({ ...fixture(), deadline: 100 }, 0), 'CONTENT_WOULD_CHANGE');
            const state = await db.save(fixture(), 0), ticket = await makeTestTicket(state);
            await rejects(() => db.prepareTicket({ ...ticket, access_token: 'not-a-real-token' }), 'INVALID_TICKET');
            await rejects(() => db.prepareTicket({ ...ticket, snapshotBytes: '{}' }), 'INVALID_TICKET');
        });
        await test('non-destructive synthetic legacy copy validates and reads back; original remains byte-identical', async () => {
            const raw = JSON.stringify(fixture()); localStorage.setItem('easyTimerTemplates', raw);
            const read = () => localStorage.getItem('easyTimerTemplates');
            const db = await open({ name: name('migration') }), preview = await db.migrationPreview(read);
            check((await db.read()).library === null, 'Preview wrote data');
            const copied = await db.migrationCopy(preview, read);
            check(copied.sourceUnchanged && !copied.authoritative, 'Unsafe cutover');
            equal(copied.readback.library.library, fixture(), 'Migration changed content'); equal(read(), raw, 'Legacy removed');
            await rejects(() => db.migrationCopy(preview, read), 'REVISION_CONFLICT');
        });
        await test('migration refuses invalid or changed legacy; interrupted copy is recoverable', async () => {
            const raw = JSON.stringify(fixture()), dbName = name('migration-interrupt');
            const db = await open({ name: dbName }); let source = raw;
            await rejects(() => db.migrationPreview(() => '{'), 'LEGACY_INVALID');
            await rejects(() => db.migrationPreview(() => JSON.stringify({ ...fixture(), hidden: true })), 'LEGACY_INVALID');
            const preview = await db.migrationPreview(() => source); source = JSON.stringify(fixture('other tab'));
            await rejects(() => db.migrationCopy(preview, () => source), 'LEGACY_CHANGED'); check((await db.read()).library === null, 'Changed source copied');
            source = raw;
            const failed = await open({ name: dbName, fault: point => { if (point === 'after-migration-commit') throw Error('LOST_ACK'); } });
            await rejects(() => failed.migrationCopy(preview, () => source), 'LOST_ACK'); failed.close();
            const recovered = await (await open({ name: dbName })).recover();
            equal(recovered.library.library, fixture(), 'Committed migration not recoverable'); check(recovered.metadata.migration.status === 'copy-only-unverified', 'False migration completion');
            equal(source, raw, 'Legacy changed');
        });
        await test('legacy write during migration copy is detected after readback and never cuts over', async () => {
            const raw = JSON.stringify(fixture()); let source = raw;
            const db = await open({ name: name('legacy-race'), fault: point => { if (point === 'after-migration-commit') source = JSON.stringify(fixture('legacy writer')); } });
            const preview = await db.migrationPreview(() => source);
            const copied = await db.migrationCopy(preview, () => source);
            check(!copied.authoritative && !copied.sourceUnchanged && copied.status === 'source-changed-no-cutover', 'Concurrent legacy write was hidden');
            equal(copied.readback.library.library, fixture(), 'Original copied content changed');
        });
        await test('two actual browser tabs with independent IDB connections: exactly one same-revision save wins', async () => {
            peer = window.open(location.href, 'sync002a-independent-tab');
            check(peer, 'Popup blocked; browser harness must allow user gesture');
            for (let i = 0; i < 100 && !peer.storePoc; i++) await new Promise(done => setTimeout(done, 20));
            check(peer.storePoc, 'Second tab did not initialize');
            const dbName = name('two-tabs'), db = await open({ name: dbName }); await db.save(fixture(), 0);
            peer.peerDb = await peer.storePoc.openLocalStore({ name: dbName });
            const a = await db.read(), b = await peer.peerDb.read(); equal(a.library.localRevision, b.library.localRevision, 'Base mismatch');
            const outcomes = await Promise.allSettled([db.save(fixture('tab A'), 1), peer.peerDb.save(peer.storePoc.fixture('tab B'), 1)]);
            equal(outcomes.filter(o => o.status === 'fulfilled').length, 1, 'Both tabs overwrote');
            equal(outcomes.filter(o => o.status === 'rejected').map(o => o.reason.message), ['REVISION_CONFLICT'], 'Conflict not explicit');
            const state = await db.read(); check(state.library.localRevision === 2 && state.metadata.dirtyRevision === 2 && state.metadata.syncDirty, 'Torn two-tab state');
            peer.peerDb.close(); peer.close(); peer = null;
        });
        await test('real blocked upgrade reports OPEN_BLOCKED rather than success', async () => {
            const dbName = name('blocked-upgrade');
            const blocker = await new Promise((done, reject) => { const req = indexedDB.open(dbName); req.onsuccess = () => done(req.result); req.onerror = () => reject(req.error); });
            // Keep a deliberately old connection open without its normal versionchange handler.
            blocker.onversionchange = () => {};
            try { await rejects(() => openLocalStore({ name: dbName, factory: { open: n => indexedDB.open(n, 2) } }), 'OPEN_BLOCKED'); } finally { blocker.close(); }
        });
        await test('versionchange closes the adapter; closed connection refuses new writes', async () => {
            const dbName = name('upgrade-close'), db = await open({ name: dbName }); await db.save(fixture(), 0);
            const upgraded = await new Promise((done, reject) => { const req = indexedDB.open(dbName, 2); req.onsuccess = () => done(req.result); req.onerror = () => reject(req.error); });
            upgraded.close(); await rejects(() => db.save(fixture('closed'), 1), 'DATABASE_CLOSED');
        });
        return { checks: results, count: results.length, networkUsed: false, nativeQuotaExhaustion: 'NOT TESTED; QuotaExceededError fault injection only',
            physicalCrashAndPowerLoss: 'NOT TESTED; real transaction aborts and close/reopen only', iosSafariPwa: 'NOT TESTED' };
    } finally {
        peer?.peerDb?.close(); peer?.close(); for (const db of connections) db.close();
        if (legacyOriginal === null) localStorage.removeItem('easyTimerTemplates'); else localStorage.setItem('easyTimerTemplates', legacyOriginal);
    }
}
