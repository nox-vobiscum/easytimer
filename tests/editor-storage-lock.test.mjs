import test from 'node:test';
import assert from 'node:assert/strict';
import {
    EDITOR_STORE_WRITE_LOCK,
    createEditorStoreWriter,
} from '../src/js/editor-storage-lock.mjs';
import { EDITOR_STORAGE_KEY } from '../src/js/editor-storage.mjs';

const empty = (revision = 0) => ({
    schemaVersion: 1,
    revision,
    templates: [],
    executions: [],
    activeRuntime: null,
});

function lockManager(events = []) {
    const held = new Set();
    return {
        held,
        requests: 0,
        fail: false,
        async request(name, options, callback) {
            this.requests += 1;
            events.push(['request', name, structuredClone(options)]);
            if (this.fail) throw new Error('synthetic lock failure');
            if (held.has(name)) return callback(null);
            held.add(name);
            events.push(['acquired', name]);
            try { return await callback({ name, mode: 'exclusive' }); }
            finally {
                events.push(['released', name]);
                held.delete(name);
            }
        },
    };
}

function memory(raw = null, locks = null, events = []) {
    const values = new Map(raw === null ? [] : [[EDITOR_STORAGE_KEY, raw]]);
    const state = {
        writes: 0,
        removes: 0,
        failWrite: null,
        failReadAfterWrite: false,
        readback: undefined,
    };
    return {
        values,
        state,
        getItem(key) {
            events.push(['read', locks?.held.has(EDITOR_STORE_WRITE_LOCK) ?? false]);
            if (state.failReadAfterWrite && state.writes > 0) throw new Error('synthetic readback failure');
            if (state.readback !== undefined && state.writes > 0) return state.readback;
            return values.get(key) ?? null;
        },
        setItem(key, value) {
            events.push(['write', locks?.held.has(EDITOR_STORE_WRITE_LOCK) ?? false]);
            if (state.failWrite) {
                const error = new Error('synthetic write failure');
                error.name = state.failWrite;
                throw error;
            }
            state.writes += 1;
            values.set(key, value);
        },
        removeItem(key) {
            state.removes += 1;
            values.delete(key);
        },
    };
}

const next = record => ({ ...record, revision: record.revision + 1 });

test('exports the fixed lock name and runs load, transform, save and readback inside one lock', async () => {
    const events = [];
    const locks = lockManager(events);
    const storage = memory(null, locks, events);
    const writer = createEditorStoreWriter({ getStorage: () => storage, locks });
    let transformHeld = false;
    const saved = await writer.write(record => {
        events.push(['transform', locks.held.has(EDITOR_STORE_WRITE_LOCK)]);
        transformHeld = locks.held.has(EDITOR_STORE_WRITE_LOCK);
        return next(record);
    });
    assert.equal(EDITOR_STORE_WRITE_LOCK, 'easyTimerEditor.v1.write');
    assert.equal(transformHeld, true);
    assert.deepEqual(saved, empty(1));
    assert.deepEqual(events.map(event => event[0]), [
        'request', 'acquired', 'read', 'transform', 'read', 'write', 'read', 'released',
    ]);
    assert.ok(events.filter(event => ['read', 'write'].includes(event[0])).every(event => event[1]));
    assert.equal(locks.held.size, 0);
});

test('a simultaneous writer fails with lockBusy and a later writer succeeds', async () => {
    const locks = lockManager();
    const storage = memory(null, locks);
    const first = createEditorStoreWriter({ getStorage: () => storage, locks });
    const second = createEditorStoreWriter({ getStorage: () => storage, locks });
    let concurrent;
    await first.write(record => {
        concurrent = second.write(next);
        return next(record);
    });
    await assert.rejects(concurrent, /lockBusy/);
    assert.equal(locks.held.size, 0);
    assert.deepEqual(await second.write(next), empty(2));
    assert.equal(storage.state.writes, 2);
});

test('missing Web Locks fails closed without touching storage', async () => {
    let storageRequests = 0;
    const writer = createEditorStoreWriter({
        getStorage: () => { storageRequests += 1; return memory(); },
        locks: null,
    });
    await assert.rejects(writer.write(next), /lockUnavailable/);
    assert.equal(storageRequests, 0);
});

test('unexpected lock request failures are controlled without disguising callback errors', async () => {
    const locks = lockManager();
    locks.fail = true;
    const storage = memory();
    const writer = createEditorStoreWriter({ getStorage: () => storage, locks });
    await assert.rejects(writer.write(next), /lockRequest/);
    assert.equal(storage.state.writes, 0);

    locks.fail = false;
    const failure = new Error('transformFailure');
    await assert.rejects(writer.write(() => { throw failure; }), error => error === failure);
    assert.equal(locks.held.size, 0);
});

test('transform errors and invalid transforms prevent writes and always release the lock', async () => {
    const locks = lockManager();
    const storage = memory(null, locks);
    const writer = createEditorStoreWriter({ getStorage: () => storage, locks });
    for (const transform of [null, () => { throw new Error('customTransform'); }]) {
        await assert.rejects(writer.write(transform), /invalidTransform|customTransform/);
        assert.equal(locks.held.size, 0);
    }
    assert.equal(storage.state.writes, 0);
});

test('Promise and thenable transformations are rejected without a write', async () => {
    const locks = lockManager();
    const storage = memory(null, locks);
    const writer = createEditorStoreWriter({ getStorage: () => storage, locks });
    for (const transform of [
        async record => next(record),
        async () => { throw new Error('rejected transform'); },
        record => ({ then() {}, record }),
    ]) {
        await assert.rejects(writer.write(transform), /asyncTransform/);
        assert.equal(locks.held.size, 0);
    }
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(storage.state.writes, 0);
});

test('validation and revision errors pass through unchanged', async () => {
    const locks = lockManager();
    const storage = memory(null, locks);
    const writer = createEditorStoreWriter({ getStorage: () => storage, locks });
    await assert.rejects(writer.write(record => ({ ...record, revision: 2 })), /invalidStoreRevision/);
    await assert.rejects(writer.write(record => ({ ...next(record), extra: true })), /invalidStore/);
    assert.equal(storage.state.writes, 0);
    assert.equal(locks.held.size, 0);
});

test('an intervening raw snapshot change remains a conflict', async () => {
    const locks = lockManager();
    const storage = memory(null, locks);
    const writer = createEditorStoreWriter({ getStorage: () => storage, locks });
    await assert.rejects(writer.write(record => {
        storage.values.set(EDITOR_STORAGE_KEY, JSON.stringify(empty(0)));
        return next(record);
    }), /conflict/);
    assert.equal(storage.state.writes, 0);
    assert.equal(locks.held.size, 0);
});

test('write and quota failures pass through without retry, rollback or deletion', async () => {
    for (const [name, code] of [['Error', 'storageWrite'], ['QuotaExceededError', 'storageQuota']]) {
        const locks = lockManager();
        const storage = memory(JSON.stringify(empty()), locks);
        const writer = createEditorStoreWriter({ getStorage: () => storage, locks });
        storage.state.failWrite = name;
        await assert.rejects(writer.write(next), new RegExp(code));
        assert.equal(locks.requests, 1);
        assert.equal(storage.state.writes, 0);
        assert.equal(storage.state.removes, 0);
        assert.equal(storage.values.get(EDITOR_STORAGE_KEY), JSON.stringify(empty()));
        assert.equal(locks.held.size, 0);
    }
});

test('unconfirmed and mismatched readback never report success or retry', async () => {
    const unconfirmedLocks = lockManager();
    const unconfirmedStorage = memory(null, unconfirmedLocks);
    const unconfirmed = createEditorStoreWriter({ getStorage: () => unconfirmedStorage, locks: unconfirmedLocks });
    unconfirmedStorage.state.failReadAfterWrite = true;
    await assert.rejects(unconfirmed.write(next), /storageUnconfirmed/);
    assert.equal(unconfirmedLocks.requests, 1);
    assert.equal(unconfirmedStorage.state.writes, 1);
    assert.equal(unconfirmedStorage.state.removes, 0);
    assert.equal(locksReleased(unconfirmedLocks), true);

    const readbackLocks = lockManager();
    const readbackStorage = memory(null, readbackLocks);
    const readback = createEditorStoreWriter({ getStorage: () => readbackStorage, locks: readbackLocks });
    readbackStorage.state.readback = JSON.stringify(empty());
    await assert.rejects(readback.write(next), /storageReadback/);
    assert.equal(readbackLocks.requests, 1);
    assert.equal(readbackStorage.state.writes, 1);
    assert.equal(readbackStorage.state.removes, 0);
    assert.equal(locksReleased(readbackLocks), true);
});

function locksReleased(locks) {
    return locks.held.size === 0;
}

test('every attempt creates a fresh store and reloads the newest aggregate under the lock', async () => {
    const locks = lockManager();
    const storage = memory(null, locks);
    let storageRequests = 0;
    const writer = createEditorStoreWriter({
        getStorage: () => { storageRequests += 1; return storage; },
        locks,
    });
    const seen = [];
    await writer.write(record => { seen.push(record.revision); return next(record); });
    await writer.write(record => { seen.push(record.revision); return next(record); });
    assert.deepEqual(seen, [0, 1]);
    assert.ok(storageRequests >= 6);
    assert.deepEqual(JSON.parse(storage.values.get(EDITOR_STORAGE_KEY)), empty(2));
});

test('input, confirmed result and persisted record remain copy-isolated', async () => {
    const locks = lockManager();
    const storage = memory(null, locks);
    const writer = createEditorStoreWriter({ getStorage: () => storage, locks });
    let loaded;
    const result = await writer.write(record => {
        loaded = record;
        return next(record);
    });
    assert.notEqual(result, loaded);
    result.templates.push({ invalid: true });
    loaded.executions.push({ invalid: true });
    assert.deepEqual(JSON.parse(storage.values.get(EDITOR_STORAGE_KEY)), empty(1));
});
