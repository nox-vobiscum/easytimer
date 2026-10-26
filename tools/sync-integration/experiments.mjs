import { openIntegrationStore } from './store.mjs';
import { createPocClient, SCOPE } from '../sync-poc/core.mjs';
import { createTransport } from './transport.mjs';
import { createCoordinator, syntheticLibrary } from './coordinator.mjs';
import { canonicalJSON, createSnapshot, PURPOSE } from '../sync-core/canonical.mjs';
import { fakeDrive } from './fake-drive.mjs';
const check = (condition, message = 'ASSERTION_FAILED') => { if (!condition) throw Error(message); };
const equal = (a, b) => check(canonicalJSON(a) === canonicalJSON(b), 'VALUE_MISMATCH');
async function rejects(action, code) { try { await action(); } catch (error) { check(error.message === code, 'EXPECTED_' + code + '_GOT_' + error.message); return; } throw Error('EXPECTED_' + code); }
const auth = { access_token: 'BROWSER_TEST_FAKE_ONLY', expires_in: 3600, scope: SCOPE };
if (typeof window !== 'undefined') window.integrationTest = { openIntegrationStore, syntheticLibrary };
export async function runExperiments() {
    const checks = [], connections = []; let peer;
    const open = async options => { const store = await openIntegrationStore(options); connections.push(store); return store; };
    async function setup(options = {}) {
        const runId = crypto.randomUUID(), drive = fakeDrive(), client = createPocClient({ fetchImpl: drive.fetch });
        await client.authorize(auth);
        const store = await open({ runId, clientId: 'A', ...options }), transport = createTransport(client.integrationSession(), runId);
        const coordinator = createCoordinator(store, transport);
        await store.save(syntheticLibrary(), 0); await coordinator.discover();
        return { runId, drive, client, store, transport, coordinator };
    }
    async function test(name, fn) { console.info('CHECK: ' + name); await fn(); checks.push({ test: name, result: 'PASS' }); }
    try {
        await test('atomic library + dirty save and canonical fixed publication round trip', async () => {
            const { store, coordinator } = await setup(); const ticket = await coordinator.prepare();
            check((await store.read()).outbox.stage === 'prepared'); await coordinator.publish();
            let state = await store.read(); check(state.metadata.syncDirty && state.outbox.stage === 'verified');
            const observation = await coordinator.discover(); check(observation.status === 'last-checked');
            state = await store.read(); check(!state.metadata.syncDirty && !state.outbox); equal(state.bindings.lastPublication, ticket);
        });
        await test('subsequent local edit survives earlier publication and gets its own child ticket', async () => {
            const { store, coordinator } = await setup(); const original = await coordinator.prepare();
            await store.save(syntheticLibrary('Synthetic later edit'), 1); await coordinator.publish(); await coordinator.discover();
            let state = await store.read(); check(state.metadata.syncDirty && state.library.localRevision === 2 && !state.outbox);
            const child = await coordinator.prepare(); equal(child.parents, [original.snapshotHash]);
            await coordinator.publish(); await coordinator.discover(); state = await store.read(); check(!state.metadata.syncDirty);
            await store.save(syntheticLibrary('Synthetic after clean'), 2); check((await store.read()).metadata.syncDirty);
        });
        await test('unknown upload acknowledgement, close/reopen and recovery reuse exact durable ticket', async () => {
            const { store, coordinator, transport, runId, drive } = await setup(); const ticket = await coordinator.prepare();
            await rejects(() => coordinator.publish({ loseAcknowledgement: true }), 'SIMULATED_LOST_ACK'); store.close();
            const reopened = await open({ runId, clientId: 'A' }); equal((await reopened.read()).outbox.ticket, ticket);
            const resumed = createCoordinator(reopened, transport); await resumed.publish(); await resumed.discover();
            check(!(await reopened.read()).metadata.syncDirty); check(drive.files.size === 1);
        });
        await test('dirty revision with no ticket survives reopen', async () => {
            const { store, runId } = await setup(); store.close(); const reopened = await open({ runId, clientId: 'A' }); check((await reopened.read()).needsTicket);
        });
        await test('abort at all integration transaction boundaries leaves ticket absent and dirty intact', async () => {
            for (const point of ['before-integration-write', 'after-integration-write', 'before-integration-commit']) {
                const { store, runId, coordinator } = await setup(), ticket = await coordinator.prepare();
                // Use a second empty client with the same validated ticket contents and account binding.
                const db = await open({ runId, clientId: 'fault' }); await db.save(syntheticLibrary(), 0); await db.bind(ticket.accountKey);
                const discovery = { nodes: [], files: {} }; await db.observe(ticket.accountKey, discovery);
                const before = await db.read();
                const failed = await open({ runId, clientId: 'fault', fault: where => { if (where === point) throw Error('INTERRUPTED'); } });
                await rejects(() => failed.prepare(ticket), 'INTERRUPTED'); equal(await db.read(), before); check((await store.read()).outbox);
            }
        });
        await test('quota/storage failure rolls back library and dirty marker together', async () => {
            const { runId, store } = await setup(), before = await store.read();
            const failed = await open({ runId, clientId: 'A', fault: point => { if (point === 'after-library-request') throw Error('QuotaExceededError'); } });
            await rejects(() => failed.save(syntheticLibrary('Synthetic quota'), 1), 'QuotaExceededError'); equal(await store.read(), before);
            await rejects(() => open({ runId, clientId: 'blocked', factory: { open() { throw Error('SecurityError'); } } }), 'STORAGE_BLOCKED');
        });
        await test('failure to persist verified publication or discovery retains recoverable ticket', async () => {
            const { store, coordinator, transport, runId } = await setup(); const ticket = await coordinator.prepare();
            const snapshot = await transport.publish(ticket), before = await store.read();
            const failed = await open({ runId, clientId: 'A', fault: point => { if (point === 'after-integration-write') throw Error('QuotaExceededError'); } });
            await rejects(() => failed.verified(ticket, snapshot), 'QuotaExceededError'); equal(await store.read(), before);
            await store.verified(ticket, snapshot); const verified = await store.read();
            const discovery = await transport.discover();
            await rejects(() => failed.observe(ticket.accountKey, discovery), 'QuotaExceededError'); equal(await store.read(), verified);
            await coordinator.discover(); check(!(await store.read()).metadata.syncDirty);
        });
        await test('stale precomputed ticket fails after concurrent local save', async () => {
            const { coordinator, store, transport, runId } = await setup();
            const generate = transport.generateId.bind(transport);
            transport.generateId = async () => { const id = await generate(); await store.save(syntheticLibrary('Synthetic concurrent'), 1); return id; };
            await rejects(() => coordinator.prepare(), 'REVISION_CONFLICT');
            const state = await store.read(); check(!state.outbox && state.metadata.syncDirty && state.library.localRevision === 2);
            check(runId === state.library.libraryId);
        });
        await test('pending ticket cannot be replaced and token-shaped fields are rejected', async () => {
            const { store, coordinator } = await setup(); const ticket = await coordinator.prepare();
            await rejects(() => store.prepare({ ...ticket, fileId: 'replacement' }), 'OUTBOX_FIXED');
            let rejected = false; try { await store.prepare({ ...ticket, access_token: 'FAKE_ONLY' }); } catch { rejected = true; } check(rejected);
            equal(await coordinator.prepare(), ticket);
        });
        await test('account change blocks pending publication and leaves old binding/ticket intact', async () => {
            const { store, coordinator, runId, client, drive } = await setup(); await coordinator.prepare(); const before = await store.read();
            client.disconnect(); const other = createPocClient({ fetchImpl: async (url, init) => url.includes('/about?') ? new Response(JSON.stringify({ user: { permissionId: 'synthetic-account-B' } })) : drive.fetch(url, init) });
            await other.authorize(auth); const switched = createCoordinator(store, createTransport(other.integrationSession(), runId));
            await rejects(() => switched.publish(), 'ACCOUNT_MISMATCH'); equal(await store.read(), before);
        });
        await test('offline/authorization failures retain prepared ticket and allow local edits', async () => {
            const { coordinator, store, drive } = await setup(); const ticket = await coordinator.prepare();
            drive.fault = () => { throw Error('Offline'); }; await rejects(() => coordinator.publish(), 'NETWORK_OR_CORS_OUTCOME_UNKNOWN');
            equal((await store.read()).outbox.ticket, ticket);
            drive.fault = () => new Response('{}', { status: 401 }); await rejects(() => coordinator.publish(), 'REAUTHORIZE');
            await store.save(syntheticLibrary('Synthetic offline edit'), 1); check((await store.read()).newerDirtyRevision);
        });
        await test('partial listing, missing cached file and corrupt content never clear dirty or overwrite known graph', async () => {
            const { coordinator, store, drive } = await setup(); const ticket = await coordinator.prepare(); await coordinator.publish(); await coordinator.discover();
            await store.save(syntheticLibrary('Synthetic pending'), 1); const before = await store.read();
            drive.incomplete = true; await rejects(() => coordinator.discover(), 'INCOMPLETE_DISCOVERY'); equal(await store.read(), before);
            drive.incomplete = false; drive.omit = ticket.fileId; await rejects(() => coordinator.discover(), 'KNOWN_FILE_MISSING'); equal(await store.read(), before);
            drive.omit = null; drive.files.get(ticket.fileId).bytes = '{}';
            let rejected = false; try { await coordinator.discover(); } catch { rejected = true; } check(rejected); equal(await store.read(), before);
        });
        await test('missing ancestors are blocked without persisting partial history', async () => {
            const { store, transport, coordinator } = await setup(), ticket = await coordinator.prepare();
            const snapshot = JSON.parse(ticket.snapshotBytes); snapshot.parents = ['sha256:' + '1'.repeat(64)]; delete snapshot.snapshotId;
            const node = await createSnapshot(snapshot); const before = await store.read();
            await rejects(() => store.observe(ticket.accountKey, { nodes: [node], files: {} }), 'HISTORY_BLOCKED'); equal(await store.read(), before); check(transport);
        });
        await test('two independent clients publish divergent children; paginated history and conflicts retained', async () => {
            const { coordinator: a, store: storeA, transport, runId, drive } = await setup();
            await a.prepare(); await a.publish(); await a.discover();
            const storeB = await open({ runId, clientId: 'B' }), clientB = createPocClient({ fetchImpl: drive.fetch }); await clientB.authorize(auth);
            const b = createCoordinator(storeB, createTransport(clientB.integrationSession(), runId)); await b.discover(); await b.adopt();
            await storeA.save(syntheticLibrary('Synthetic branch A'), 1); await storeB.save(syntheticLibrary('Synthetic branch B'), 1);
            await a.prepare(); await b.prepare(); await Promise.all([a.publish(), b.publish()]);
            drive.duplicatePage = true; const result = await a.discover(); await b.discover(); check(result.status === 'conflict' && result.heads.length === 2 && drive.files.size === 3);
            const analysis = await a.inspectConflicts(); check(analysis.status === 'conflict'); await rejects(() => a.prepare(), 'DISCOVER_FIRST_OR_CONFLICT');
            check((await storeA.read()).bindings.history.length === 3); check(transport);
        });
        await test('unsupported unrelated roots remain blocked for reconciliation', async () => {
            const { store, coordinator } = await setup(), ticket = await coordinator.prepare(); const root = JSON.parse(ticket.snapshotBytes);
            const other = await createSnapshot({ purpose: PURPOSE, syncFormatVersion: 1, libraryId: root.libraryId, operationId: crypto.randomUUID(), parents: [], library: syntheticLibrary('Synthetic independent root'), deletedRundownIds: [], restoredRundownIds: [], resolution: null });
            await store.observe(ticket.accountKey, { nodes: [root, other], files: {} });
            const result = await coordinator.inspectConflicts(); check(result.status === 'blocked' && result.reason === 'NO_COMMON_ANCESTOR');
        });
        await test('two actual tabs serialize same-revision writes with one explicit loser', async () => {
            const runId = crypto.randomUUID(), store = await open({ runId, clientId: 'two-tabs' }); await store.save(syntheticLibrary(), 0);
            peer = window.open('about:blank', 'sync002c-independent-tab'); check(peer, 'POPUP_BLOCKED');
            // about:blank inherits the isolated opener origin. Load before any navigation can discard the bridge.
            const script = peer.document.createElement('script'); script.type = 'module'; script.src = location.origin + '/tools/sync-integration/experiments.mjs';
            await new Promise((done, fail) => { script.onload = done; script.onerror = () => fail(Error('SECOND_TAB_MODULE_FAILED')); peer.document.head.append(script); });
            check(peer.integrationTest, 'SECOND_TAB_NOT_READY');
            peer.integrationDb = await peer.integrationTest.openIntegrationStore({ runId, clientId: 'two-tabs' });
            const results = await Promise.allSettled([store.save(syntheticLibrary('Synthetic tab A'), 1), peer.integrationDb.save(peer.integrationTest.syntheticLibrary('Synthetic tab B'), 1)]);
            check(results.filter(result => result.status === 'fulfilled').length === 1);
            equal(results.filter(result => result.status === 'rejected').map(result => result.reason.message), ['REVISION_CONFLICT']);
            const state = await store.read(); check(state.library.localRevision === 2 && state.metadata.dirtyRevision === 2 && state.metadata.syncDirty);
            peer.integrationDb.close(); peer.close(); peer = null;
        });
        return { checks, count: checks.length, realDrive: 'NOT TESTED; deterministic HTTP double only', nativeIndexedDB: 'PASS', ios: 'NOT TESTED' };
    } finally { peer?.integrationDb?.close(); peer?.close(); connections.forEach(store => store.close()); }
}
