import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlannedExecution } from '../src/js/editor-domain.mjs';
import { createEditorActiveTimerLock } from '../src/js/editor-active-lock.mjs';
import { createEditorRuntimeBridge } from '../src/js/editor-runtime-bridge.mjs';
import { EDITOR_STORAGE_KEY } from '../src/js/editor-storage.mjs';
import { createEditorStoreWriter } from '../src/js/editor-storage-lock.mjs';

const plan = () => ({
    name: 'Workshop',
    category: 'uncategorized',
    transitionMode: 'manual',
    preparedInformation: '',
    phases: [{
        id: 'phase-1',
        title: 'Opening',
        durationSeconds: 60,
        category: 'uncategorized',
        notes: '',
        resources: [],
    }],
});

const template = () => ({
    schemaVersion: 2,
    kind: 'template',
    id: 'template-1',
    revision: 1,
    plan: plan(),
});

function initialRecord() {
    return {
        schemaVersion: 1,
        revision: 0,
        templates: [template()],
        executions: [{
            execution: createPlannedExecution(template(), 'execution-1'),
            suspendedCheckpoint: null,
        }],
        activeRuntime: null,
    };
}

const activationOptions = (changes = {}) => ({
    executionId: 'execution-1',
    expectedAggregateRevision: 0,
    expectedExecutionRevision: 1,
    expectedRuntimeRevision: 0,
    runtimeRunId: 'runtime-ready-1',
    savedAt: 1000,
    ...changes,
});

function lockManager(events = []) {
    const held = new Set();
    return {
        held,
        request(name, options, callback) {
            events.push(['request', name, structuredClone(options)]);
            if (held.has(name)) return Promise.resolve(callback(null));
            held.add(name);
            events.push(['acquired', name]);
            return Promise.resolve()
                .then(() => callback({ name, mode: 'exclusive' }))
                .finally(() => {
                    held.delete(name);
                    events.push(['released', name]);
                });
        },
    };
}

function memory(record, locks, events = []) {
    const values = new Map([[EDITOR_STORAGE_KEY, JSON.stringify(record)]]);
    const state = {
        writes: 0,
        failRead: false,
        failWrite: null,
        failReadAfterWrite: false,
        readback: undefined,
    };
    return {
        state,
        values,
        getItem(key) {
            events.push(['read', new Set(locks.held)]);
            if (state.failRead) throw new Error('read failed');
            if (state.failReadAfterWrite && state.writes > 0) throw new Error('readback failed');
            if (state.readback !== undefined && state.writes > 0) return state.readback;
            return values.get(key) ?? null;
        },
        setItem(key, value) {
            events.push(['write', new Set(locks.held)]);
            if (state.failWrite) {
                const error = new Error('write failed');
                error.name = state.failWrite;
                throw error;
            }
            state.writes += 1;
            values.set(key, value);
        },
        removeItem(key) { values.delete(key); },
    };
}

function setup({ locks = lockManager(), storage = null } = {}) {
    const actualStorage = storage ?? memory(initialRecord(), locks);
    const activeLock = createEditorActiveTimerLock({ locks });
    const writer = createEditorStoreWriter({ getStorage: () => actualStorage, locks });
    const bridge = createEditorRuntimeBridge({ writer, activeLock });
    return { locks, storage: actualStorage, activeLock, writer, bridge };
}

test('activates PLANNED as confirmed ACTIVE READY after acquiring ownership first', async () => {
    const events = [];
    const locks = lockManager(events);
    const storage = memory(initialRecord(), locks, events);
    const { activeLock, bridge } = setup({ locks, storage });

    const result = await bridge.activatePlanned(activationOptions());

    assert.deepEqual(events.slice(0, 4).map(event => event.slice(0, 2)), [
        ['request', 'easyTimerEditor.v1.active-runtime'],
        ['acquired', 'easyTimerEditor.v1.active-runtime'],
        ['request', 'easyTimerEditor.v1.write'],
        ['acquired', 'easyTimerEditor.v1.write'],
    ]);
    const storageEvents = events.filter(event => ['read', 'write'].includes(event[0]));
    assert.ok(storageEvents.every(([, held]) => held.has('easyTimerEditor.v1.write')));
    assert.ok(storageEvents.every(([, held]) => held.has('easyTimerEditor.v1.active-runtime')));
    assert.equal(storage.state.writes, 1);
    assert.equal(result.revision, 1);
    assert.equal(result.executions[0].execution.lifecycle, 'active');
    assert.equal(result.executions[0].execution.attempt, null);
    assert.equal(result.activeRuntime.executionId, 'execution-1');
    assert.equal(result.activeRuntime.attemptId, null);
    assert.equal(result.activeRuntime.run.runId, 'runtime-ready-1');
    assert.equal(result.activeRuntime.clock.status, 'READY');
    assert.equal(activeLock.held, true);
    await assert.rejects(bridge.reconcilePendingActivation(), /noPendingActivation/);

    result.executions[0].execution.currentPlan.name = 'Changed result';
    const persisted = JSON.parse(storage.values.get(EDITOR_STORAGE_KEY));
    assert.equal(persisted.executions[0].execution.currentPlan.name, 'Workshop');

    await activeLock.release();
    assert.equal(locks.held.size, 0);
});

test('busy or unavailable active ownership prevents every store access and write', async () => {
    const locks = lockManager();
    const owner = createEditorActiveTimerLock({ locks });
    await owner.claim();
    const storage = memory(initialRecord(), locks);
    const { bridge } = setup({ locks, storage });

    await assert.rejects(bridge.activatePlanned(activationOptions()), /lockBusy/);
    assert.equal(storage.state.writes, 0);
    assert.equal(storage.values.get(EDITOR_STORAGE_KEY), JSON.stringify(initialRecord()));
    await owner.release();

    let storageRequests = 0;
    const unavailable = createEditorRuntimeBridge({
        activeLock: createEditorActiveTimerLock({ locks: null }),
        writer: createEditorStoreWriter({
            getStorage: () => { storageRequests += 1; return storage; },
            locks,
        }),
    });
    await assert.rejects(unavailable.activatePlanned(activationOptions()), /lockUnavailable/);
    assert.equal(storageRequests, 0);
    assert.equal(storage.state.writes, 0);
});

test('domain conflicts pass through without a write while acquired ownership remains held', async () => {
    const { locks, storage, activeLock, bridge } = setup();

    await assert.rejects(bridge.activatePlanned(activationOptions({
        expectedAggregateRevision: 1,
    })), /conflict/);
    assert.equal(storage.state.writes, 0);
    assert.equal(activeLock.held, true);

    await activeLock.release();
    assert.equal(locks.held.size, 0);
});

test('quota failure passes through without success, retry or ownership release', async () => {
    const locks = lockManager();
    const storage = memory(initialRecord(), locks);
    storage.state.failWrite = 'QuotaExceededError';
    const { activeLock, bridge } = setup({ locks, storage });

    await assert.rejects(bridge.activatePlanned(activationOptions()), /storageQuota/);
    assert.equal(storage.state.writes, 0);
    assert.equal(activeLock.held, true);

    await activeLock.release();
    assert.equal(locks.held.size, 0);
});

test('unconfirmed and failed readback writes retain ownership and are never retried', async () => {
    for (const failureMode of ['unconfirmed', 'readback']) {
        const locks = lockManager();
        const storage = memory(initialRecord(), locks);
        if (failureMode === 'unconfirmed') storage.state.failReadAfterWrite = true;
        else storage.state.readback = null;
        const { activeLock, bridge } = setup({ locks, storage });

        await assert.rejects(
            bridge.activatePlanned(activationOptions()),
            failureMode === 'unconfirmed' ? /storageUnconfirmed/ : /storageReadback/,
        );
        assert.equal(storage.state.writes, 1);
        assert.equal(activeLock.held, true);

        await activeLock.release();
        assert.equal(locks.held.size, 0);
    }
});

test('reconciles an unconfirmed activation as the complete target without writing or releasing ownership', async () => {
    const events = [];
    const locks = lockManager(events);
    const storage = memory(initialRecord(), locks, events);
    storage.state.failReadAfterWrite = true;
    const { activeLock, bridge } = setup({ locks, storage });

    await assert.rejects(bridge.activatePlanned(activationOptions()), /storageUnconfirmed/);
    storage.state.failReadAfterWrite = false;
    const writes = storage.state.writes;
    const result = await bridge.reconcilePendingActivation();

    assert.equal(result.outcome, 'target');
    assert.equal(result.record.executions[0].execution.lifecycle, 'active');
    assert.equal(result.record.activeRuntime.clock.status, 'READY');
    assert.equal(storage.state.writes, writes);
    assert.equal(activeLock.held, true);
    const lastRequest = events.filter(event => event[0] === 'request').at(-1);
    assert.equal(lastRequest[1], 'easyTimerEditor.v1.write');
    const lastRead = events.filter(event => event[0] === 'read').at(-1);
    assert.equal(lastRead[1].has('easyTimerEditor.v1.write'), true);
    assert.equal(lastRead[1].has('easyTimerEditor.v1.active-runtime'), true);
    result.record.executions[0].execution.currentPlan.name = 'Changed result';
    assert.equal(JSON.parse(storage.values.get(EDITOR_STORAGE_KEY))
        .executions[0].execution.currentPlan.name, 'Workshop');
    await assert.rejects(bridge.reconcilePendingActivation(), /noPendingActivation/);

    await activeLock.release();
    assert.equal(locks.held.size, 0);
});

test('reconciles a failed readback as the complete source and clears pending', async () => {
    const locks = lockManager();
    const source = initialRecord();
    const storage = memory(source, locks);
    storage.state.readback = null;
    const { activeLock, bridge } = setup({ locks, storage });

    await assert.rejects(bridge.activatePlanned(activationOptions()), /storageReadback/);
    storage.state.readback = undefined;
    storage.values.set(EDITOR_STORAGE_KEY, JSON.stringify(source));
    const result = await bridge.reconcilePendingActivation();

    assert.equal(result.outcome, 'source');
    assert.deepEqual(result.record, source);
    assert.equal(storage.state.writes, 1);
    assert.equal(activeLock.held, true);
    await assert.rejects(bridge.reconcilePendingActivation(), /noPendingActivation/);

    await activeLock.release();
});

test('keeps a full-record conflict pending and blocks another activation without a write', async () => {
    const locks = lockManager();
    const storage = memory(initialRecord(), locks);
    storage.state.readback = null;
    const { activeLock, bridge } = setup({ locks, storage });

    await assert.rejects(bridge.activatePlanned(activationOptions()), /storageReadback/);
    storage.state.readback = undefined;
    const third = JSON.parse(storage.values.get(EDITOR_STORAGE_KEY));
    third.templates[0].plan.name = 'Concurrent valid change';
    storage.values.set(EDITOR_STORAGE_KEY, JSON.stringify(third));
    const result = await bridge.reconcilePendingActivation();

    assert.equal(result.outcome, 'conflict');
    assert.deepEqual(result.record, third);
    assert.equal(result.record.revision, 1);
    assert.equal(result.record.activeRuntime.run.runId, 'runtime-ready-1');
    const writes = storage.state.writes;
    await assert.rejects(bridge.activatePlanned(activationOptions()), /pendingActivation/);
    assert.equal(storage.state.writes, writes);
    assert.equal(activeLock.held, true);
    const repeated = await bridge.reconcilePendingActivation();
    assert.equal(repeated.outcome, 'conflict');

    await activeLock.release();
});

test('failed reconciliation reads retain pending and ownership for a later classification', async () => {
    const locks = lockManager();
    const storage = memory(initialRecord(), locks);
    storage.state.failReadAfterWrite = true;
    const { activeLock, bridge } = setup({ locks, storage });

    await assert.rejects(bridge.activatePlanned(activationOptions()), /storageUnconfirmed/);
    storage.state.failReadAfterWrite = false;
    storage.state.failRead = true;
    await assert.rejects(bridge.reconcilePendingActivation(), /storageRead/);
    assert.equal(activeLock.held, true);
    assert.equal(storage.state.writes, 1);

    storage.state.failRead = false;
    assert.equal((await bridge.reconcilePendingActivation()).outcome, 'target');
    await activeLock.release();
});

test('rejects reconciliation after ownership is lost and keeps the pending activation', async () => {
    const locks = lockManager();
    const storage = memory(initialRecord(), locks);
    storage.state.failReadAfterWrite = true;
    const { activeLock, bridge } = setup({ locks, storage });

    await assert.rejects(bridge.activatePlanned(activationOptions()), /storageUnconfirmed/);
    storage.state.failReadAfterWrite = false;
    await activeLock.release();
    await assert.rejects(bridge.reconcilePendingActivation(), /activeLockRequired/);

    assert.equal(await activeLock.claim(), true);
    assert.equal((await bridge.reconcilePendingActivation()).outcome, 'target');
    await activeLock.release();
});
