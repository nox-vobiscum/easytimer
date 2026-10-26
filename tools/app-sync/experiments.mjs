import { createApplicationSync } from './controller.mjs';
import { openApplicationStorage, LEGACY, MARKER } from './storage.mjs';
import { fakeDrive } from '../sync-integration/fake-drive.mjs';
import { SCOPE } from '../sync-poc/core.mjs';
import { serializeRundowns, parseRundowns, independentCopies } from '../../src/js/portability.mjs';
const fixture = (name = 'Facilitation workshop') => ({ schemaVersion: 1, templates: [{ id: 'workshop-stable-id', name, transitionMode: 'manual', phases: [{ id: 'phase-stable-id', title: 'Opening', durationSeconds: 600 }] }] });
const auth = { access_token: 'APPLICATION_TEST_FAKE_ONLY', expires_in: 3600, scope: SCOPE };
const check = value => { if (!value) throw Error('ASSERTION_FAILED'); };
const equal = (a, b) => check(JSON.stringify(a) === JSON.stringify(b));
async function rejects(fn, code) { try { await fn(); } catch (e) { check(!code || e.message === code); return; } throw Error('EXPECTED_FAILURE'); }
const memory = raw => { const values = new Map(raw === null ? [] : [[LEGACY, raw]]); return { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) }; };
const isolated = () => { const suffix = crypto.randomUUID(); return { open: (name, version) => indexedDB.open(name + suffix, version) }; };
export async function runApplicationExperiments() {
    const checks = [], closers = [];
    const make = (options = {}) => {
        const drive = options.drive || fakeDrive(), storage = options.storage || memory(JSON.stringify(fixture())), factory = options.factory || isolated();
        const manager = createApplicationSync({ storage, factory, fetchImpl: drive.fetch, fault: options.fault }); closers.push(() => manager.close());
        return { manager, storage, factory, drive };
    };
    const test = async (name, fn) => { console.info('CHECK: ' + name); await fn(); checks.push({ test: name, result: 'PASS' }); };
    try {
        await test('local-only operations keep localStorage and never contact Google', async () => {
            const { manager, storage, drive } = make(), store = manager.createStore(); equal(await store.load(), fixture());
            await store.save(fixture('Local edit')); equal(JSON.parse(storage.getItem(LEGACY)), fixture('Local edit'));
            check(!manager.active() && await manager.status() === 'localOnly' && drive.calls.length === 0);
        });
        await test('explicit copy/readback retains original localStorage and stable IDs; DATA-001 uses authoritative contents', async () => {
            const { manager, storage } = make(), raw = storage.getItem(LEGACY); await manager.activate();
            const store = manager.createStore(); equal(await store.load(), fixture());
            await store.save(fixture('IndexedDB edit')); equal(storage.getItem(LEGACY), raw);
            const saved = await manager.createStore().load(); equal(parseRundowns(serializeRundowns(saved)), saved);
            const imported = independentCopies(fixture('Imported'), saved); await store.save({ schemaVersion: 1, templates: [...saved.templates, ...imported.templates] });
            const result = await manager.createStore().load(); check(result.templates.length === 2 && result.templates[0].id === fixture().templates[0].id && result.templates[1].id !== result.templates[0].id);
        });
        await test('invalid migration never activates or alters legacy data', async () => {
            const { manager, storage } = make({ storage: memory('{invalid') }); await rejects(() => manager.activate(), 'invalidData');
            check(storage.getItem(MARKER) === null && storage.getItem(LEGACY) === '{invalid');
        });
        await test('activation marker failure and denied IndexedDB never silently switch or fall back to memory-only saves', async () => {
            const storage = memory(JSON.stringify(fixture())), set = storage.setItem;
            storage.setItem = (key, value) => { if (key === MARKER) throw Error('QuotaExceededError'); set(key, value); };
            const a = make({ storage }); await rejects(() => a.manager.activate(), 'storageWrite'); check(!a.manager.active());
            equal(await a.manager.backup(), fixture()); equal(JSON.parse(storage.getItem(LEGACY)), fixture());
            const b = make({ factory: { open() { throw Error('SecurityError'); } } }); await rejects(() => b.manager.activate(), 'STORAGE_BLOCKED');
            check(!b.manager.active()); equal(await b.manager.createStore().load(), fixture());
        });
        await test('interrupted copy is recoverable; original remains intact', async () => {
            let fail = true;
            const { manager, storage } = make({ fault: point => { if (fail && point === 'after-migration-copy') throw Error('INTERRUPTED'); } });
            await rejects(() => manager.activate(), 'INTERRUPTED'); check(!manager.active()); equal(await manager.backup(), fixture());
            fail = false; await manager.activate(); equal(await manager.createStore().load(), fixture()); check(storage.getItem(LEGACY) !== null);
        });
        await test('old writer during/after migration is detected; both contents are retained', async () => {
            const storage = memory(JSON.stringify(fixture()));
            const { manager } = make({ storage, fault: point => { if (point === 'after-migration-copy') storage.setItem(LEGACY, JSON.stringify(fixture('Old writer'))); } });
            await rejects(() => manager.activate(), 'migrationBlocked'); check(!manager.active()); equal(await manager.backup(), fixture()); equal(JSON.parse(storage.getItem(LEGACY)), fixture('Old writer'));
            const active = make(); await active.manager.activate(); const store = active.manager.createStore(); await store.load();
            active.storage.setItem(LEGACY, JSON.stringify(fixture('Later old writer')));
            await rejects(() => store.save(fixture('New draft retained')), 'legacyConflict'); equal(await active.manager.backup(), fixture());
            equal(JSON.parse(active.storage.getItem(LEGACY)), fixture('Later old writer')); check(await active.manager.status() === 'legacyConflict');
        });
        await test('storage/quota failure at write abort leaves draft source and saved data intact', async () => {
            let fail = false;
            const { manager } = make({ fault: point => { if (fail && point === 'after-library-request') throw Error('QuotaExceededError'); } });
            await manager.activate(); const store = manager.createStore(); await store.load(); fail = true;
            await rejects(() => store.save(fixture('Uncommitted draft')), 'storageWrite'); equal(await manager.backup(), fixture());
        });
        await test('simultaneous IDB edits allow exactly one same-revision save', async () => {
            const { manager } = make(); await manager.activate(); const a = manager.createStore(), b = manager.createStore(); await a.load(); await b.load();
            const results = await Promise.allSettled([a.save(fixture('A edit')), b.save(fixture('B edit'))]);
            check(results.filter(r => r.status === 'fulfilled').length === 1); check(results.find(r => r.status === 'rejected').reason.message === 'conflict');
        });
        await test('upload/readback then second clean context explicitly adopts stable IDs and stays editable', async () => {
            const a = make(); await a.manager.activate(); await a.manager.authorize(auth); check(await a.manager.sync() === 'lastChecked');
            const b = make({ storage: memory(null), drive: a.drive }); await b.manager.activate(); await b.manager.authorize(auth);
            check(await b.manager.sync() === 'adoptAvailable'); equal((await b.manager.createStore().load()).templates, []);
            await b.manager.sync({ adopt: true }); equal(await b.manager.createStore().load(), fixture());
            const store = b.manager.createStore(); await store.load(); await store.save(fixture('Second context edit')); check(await b.manager.status() === 'pending');
            await b.manager.sync(); equal((await b.manager.backup()).templates[0].phases[0].id, 'phase-stable-id');
            await a.manager.sync(); equal(await a.manager.backup(), fixture('Second context edit'));
        });
        await test('uncertain upload survives manager reload and recovery issues no replacement POST', async () => {
            const a = make(); await a.manager.activate(); await a.manager.authorize(auth);
            await rejects(() => a.manager.sync({ loseAcknowledgement: true }), 'SIMULATED_LOST_ACK'); a.manager.close();
            const beforePosts = a.drive.calls.filter(c => c.method === 'POST').length;
            const b = make({ storage: a.storage, factory: a.factory, drive: a.drive }); await b.manager.authorize(auth); await b.manager.sync();
            check(a.drive.calls.filter(c => c.method === 'POST').length === beforePosts && await b.manager.status() === 'lastChecked');
        });
        await test('local edit during upload remains pending until its own verified publication', async () => {
            const a = make(); await a.manager.activate(); await a.manager.authorize(auth);
            const store = a.manager.createStore(); await store.load(); let changed = false;
            a.drive.fault = async ({ url }) => { if (!changed && url.pathname.startsWith('/upload/')) { changed = true; await store.save(fixture('Later local revision')); } };
            check(await a.manager.sync() === 'pending'); check(await a.manager.status() === 'pending');
            equal(await a.manager.backup(), fixture('Later local revision')); check(a.drive.files.size === 1);
            a.drive.fault = null; await a.manager.sync(); check(await a.manager.status() === 'lastChecked' && a.drive.files.size === 2);
        });
        await test('account mismatch freezes remote work; disconnected and offline local edits remain possible', async () => {
            const a = make(); await a.manager.activate(); await a.manager.authorize(auth); await a.manager.sync(); a.manager.disconnect();
            const store = a.manager.createStore(); await store.load(); await store.save(fixture('Offline edit')); check(await a.manager.status() !== 'lastChecked');
            a.drive.fault = () => { throw Error('OFFLINE'); }; await a.manager.authorize(auth); await rejects(() => a.manager.sync()); equal(await a.manager.backup(), fixture('Offline edit'));
            const other = createApplicationSync({ storage: a.storage, factory: a.factory, fetchImpl: async (url, init) => url.includes('/about?') ? new Response(JSON.stringify({ user: { permissionId: 'different-test-account' } })) : a.drive.fetch(url, init) });
            closers.push(() => other.close()); await rejects(() => other.authorize(auth), 'accountMismatch'); check(await other.status() === 'accountMismatch');
        });
        await test('revoked authorization retains dirty work and permits explicit reauthorization', async () => {
            const a = make(); await a.manager.activate(); await a.manager.authorize(auth);
            a.drive.fault = () => new Response('{}', { status: 401 }); await rejects(() => a.manager.sync(), 'REAUTHORIZE');
            check(await a.manager.status() === 'reconnect'); equal(await a.manager.backup(), fixture());
            a.drive.fault = null; await a.manager.authorize(auth); await a.manager.sync(); check(await a.manager.status() === 'lastChecked');
        });
        await test('concurrent remote branches stop with conflict and retain both immutable versions', async () => {
            const a = make(); await a.manager.activate(); await a.manager.authorize(auth); await a.manager.sync();
            const b = make({ storage: memory(null), drive: a.drive }); await b.manager.activate(); await b.manager.authorize(auth); await b.manager.sync(); await b.manager.sync({ adopt: true });
            const sa = a.manager.createStore(), sb = b.manager.createStore(); await sa.load(); await sb.load(); await sa.save(fixture('Branch A')); await sb.save(fixture('Branch B'));
            // Delay both first POSTs until both independently prepared from the same base.
            let entered = 0, release; const barrier = new Promise(done => release = done);
            a.drive.fault = async ({ url }) => { if (url.pathname.startsWith('/upload/')) { if (++entered === 2) release(); await barrier; } };
            const outcomes = await Promise.allSettled([a.manager.sync(), b.manager.sync()]); check(outcomes.some(r => r.status === 'rejected'));
            check(a.drive.files.size === 3); check(await a.manager.status() === 'reviewRequired' || await b.manager.status() === 'reviewRequired');
            equal(await a.manager.backup(), fixture('Branch A')); equal(await b.manager.backup(), fixture('Branch B'));
        });
        return { checks, count: checks.length, realGoogle: 'NOT TESTED; mocked HTTP', realIndexedDB: true };
    } finally { closers.forEach(close => close()); }
}
