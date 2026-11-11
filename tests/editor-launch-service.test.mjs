import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditorActiveTimerLock } from '../src/js/editor-active-lock.mjs';
import { createNativeSessionLaunchService } from '../src/js/editor-launch-service.mjs';
import { createEditorRuntimeBridge } from '../src/js/editor-runtime-bridge.mjs';
import { EDITOR_STORAGE_KEY } from '../src/js/editor-storage.mjs';
import { createEditorStoreWriter } from '../src/js/editor-storage-lock.mjs';
import { createNativeEditorTemplateIntegration } from '../src/js/editor-template-integration.mjs';

const prepared = () => ({
    id: 'template-1',
    name: 'Workshop',
    category: 'workshop',
    transitionMode: 'manual',
    preparedInformation: '**Prepared**',
    phases: [{
        id: 'phase-1',
        title: 'Opening',
        durationSeconds: 600,
        category: 'presentation',
        notes: '*Welcome*',
        resources: [{ label: 'Board', url: 'https://example.com/board' }],
    }],
});

function deferred() {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
}

function lockManager() {
    const held = new Set();
    return {
        held,
        request(name, options, callback) {
            assert.deepEqual(options, { mode: 'exclusive', ifAvailable: true });
            if (held.has(name)) return Promise.resolve(callback(null));
            held.add(name);
            return Promise.resolve()
                .then(() => callback({ name, mode: 'exclusive' }))
                .finally(() => held.delete(name));
        },
    };
}

function memory(locks) {
    const values = new Map();
    const state = {
        reads: 0,
        writes: 0,
        failWrite: null,
        failReadAfterWrite: false,
        readback: undefined,
        faultAfterWrites: 0,
    };
    return {
        values,
        state,
        getItem(key) {
            state.reads += 1;
            if (state.failReadAfterWrite && state.writes > state.faultAfterWrites) {
                throw new Error('synthetic readback failure');
            }
            if (state.readback !== undefined && state.writes > state.faultAfterWrites) {
                return state.readback;
            }
            return values.get(key) ?? null;
        },
        setItem(key, value) {
            assert.equal(locks.held.has('easyTimerEditor.v1.write'), true);
            if (state.failWrite) {
                const error = new Error('synthetic write failure');
                error.name = state.failWrite;
                throw error;
            }
            state.writes += 1;
            values.set(key, value);
        },
    };
}

async function setup({ locks = lockManager(), storage = null } = {}) {
    const actualStorage = storage ?? memory(locks);
    const writer = createEditorStoreWriter({ getStorage: () => actualStorage, locks });
    const activeLock = createEditorActiveTimerLock({ locks });
    const runtimeBridge = createEditorRuntimeBridge({ writer, activeLock });
    let executionNumber = 0;
    let runtimeNumber = 0;
    const service = createNativeSessionLaunchService({
        writer,
        runtimeBridge,
        createExecutionId: () => `execution-${++executionNumber}`,
        createRuntimeRunId: () => `runtime-${++runtimeNumber}`,
        now: () => 1000,
    });
    const templates = createNativeEditorTemplateIntegration({ writer });
    await templates.createTemplate(prepared(), { expectedAggregateRevision: 0 });
    return { locks, storage: actualStorage, writer, activeLock, runtimeBridge, service };
}

test('plans one independent execution through the native writer without changing its Template', async () => {
    const { storage, service } = await setup();
    const before = JSON.parse(storage.values.get(EDITOR_STORAGE_KEY));
    const result = await service.planFromTemplate({
        templateId: 'template-1', expectedAggregateRevision: before.revision,
    });

    assert.equal(result.status, 'planned');
    assert.equal(result.executionId, 'execution-1');
    assert.equal(result.record.executions.length, 1);
    assert.equal(result.record.executions[0].execution.lifecycle, 'planned');
    assert.deepEqual(result.record.templates, before.templates);
    assert.notEqual(result.record.executions[0].execution.currentPlan, result.record.templates[0].plan);
    assert.equal(storage.values.has('easyTimerTemplates'), false);
});

test('activates an existing PLANNED execution as READY without starting its clock', async () => {
    const { activeLock, service } = await setup();
    const planned = await service.planFromTemplate({
        templateId: 'template-1', expectedAggregateRevision: 1,
    });
    const execution = planned.record.executions[0].execution;
    const ready = await service.activatePlanned({
        executionId: execution.id,
        expectedAggregateRevision: planned.record.revision,
        expectedExecutionRevision: execution.revision,
        expectedRuntimeRevision: execution.runtimeRevision,
    });

    assert.equal(ready.status, 'ready');
    assert.equal(ready.runtimeRunId, 'runtime-1');
    assert.equal(ready.savedAt, 1000);
    assert.equal(ready.record.executions[0].execution.lifecycle, 'active');
    assert.equal(ready.record.executions[0].execution.attempt, null);
    assert.equal(ready.runtime.clock.status, 'READY');
    assert.equal(ready.runtime.run.runId, 'runtime-1');
    assert.equal(activeLock.held, true);
    await activeLock.release();
});

test('launches Template to confirmed READY in two writes with stable identities and no START', async () => {
    const { storage, activeLock, service } = await setup();
    const result = await service.launchTemplateToReady({
        templateId: 'template-1', expectedAggregateRevision: 1,
    });

    assert.equal(result.status, 'ready');
    assert.equal(result.executionId, 'execution-1');
    assert.equal(result.record.revision, 3);
    assert.equal(result.record.executions.length, 1);
    assert.equal(result.record.executions[0].execution.attempt, null);
    assert.equal(result.record.activeRuntime.clock.status, 'READY');
    assert.equal(storage.state.writes, 3, 'Template seed, planning and activation each write once');
    await activeLock.release();
});

test('keeps a confirmed PLANNED execution when activation fails and never creates a duplicate', async () => {
    const components = await setup();
    const blocker = createEditorActiveTimerLock({ locks: components.locks });
    await blocker.claim();
    const result = await components.service.launchTemplateToReady({
        templateId: 'template-1', expectedAggregateRevision: 1,
    });

    assert.equal(result.status, 'partial');
    assert.equal(result.stage, 'activation');
    assert.equal(result.executionId, 'execution-1');
    assert.deepEqual(result.activation.error, { type: 'lock', code: 'lockBusy' });
    const persisted = JSON.parse(components.storage.values.get(EDITOR_STORAGE_KEY));
    assert.equal(persisted.executions.length, 1);
    assert.equal(persisted.executions[0].execution.id, 'execution-1');
    assert.equal(persisted.executions[0].execution.lifecycle, 'planned');
    assert.equal(persisted.activeRuntime, null);
    await blocker.release();

    const unavailableBridge = createEditorRuntimeBridge({
        writer: components.writer,
        activeLock: createEditorActiveTimerLock({ locks: null }),
    });
    const unavailableService = createNativeSessionLaunchService({
        writer: components.writer,
        runtimeBridge: unavailableBridge,
        createExecutionId: () => 'unused-execution',
        createRuntimeRunId: () => 'runtime-unavailable',
        now: () => 1000,
    });
    const unavailable = await unavailableService.activatePlanned({
        executionId: 'execution-1', expectedAggregateRevision: 2,
        expectedExecutionRevision: 1, expectedRuntimeRevision: 0,
    });
    assert.deepEqual(unavailable.error, { type: 'lock', code: 'lockUnavailable' });
    assert.equal(components.storage.state.writes, 2);
});

test('rejects stale, missing, invalid lifecycle and existing ACTIVE targets without hidden retry', async () => {
    const { storage, activeLock, service } = await setup();
    const stale = await service.planFromTemplate({
        templateId: 'template-1', expectedAggregateRevision: 0,
    });
    assert.deepEqual(stale.error, { type: 'conflict', code: 'conflict' });
    const missingTemplate = await service.planFromTemplate({
        templateId: 'missing', expectedAggregateRevision: 1,
    });
    assert.deepEqual(missingTemplate.error, { type: 'missing', code: 'templateNotFound' });

    const first = await service.planFromTemplate({
        templateId: 'template-1', expectedAggregateRevision: 1,
    });
    const execution = first.record.executions[0].execution;
    const missing = await service.activatePlanned({
        executionId: 'missing', expectedAggregateRevision: first.record.revision,
        expectedExecutionRevision: 1, expectedRuntimeRevision: 0,
    });
    assert.deepEqual(missing.error, { type: 'missing', code: 'executionNotFound' });
    await activeLock.release();
    const staleExecution = await service.activatePlanned({
        executionId: execution.id, expectedAggregateRevision: first.record.revision,
        expectedExecutionRevision: 2, expectedRuntimeRevision: 0,
    });
    assert.deepEqual(staleExecution.error, { type: 'conflict', code: 'conflict' });
    await activeLock.release();
    const ready = await service.activatePlanned({
        executionId: execution.id, expectedAggregateRevision: first.record.revision,
        expectedExecutionRevision: 1, expectedRuntimeRevision: 0,
    });
    await activeLock.release();
    const repeated = await service.activatePlanned({
        executionId: execution.id, expectedAggregateRevision: ready.record.revision,
        expectedExecutionRevision: 2, expectedRuntimeRevision: 1,
    });
    assert.deepEqual(repeated.error, { type: 'validation', code: 'invalidLifecycle' });

    const persisted = JSON.parse(storage.values.get(EDITOR_STORAGE_KEY));
    assert.equal(persisted.executions.length, 1);
    assert.equal(persisted.activeRuntime.executionId, execution.id);
    await activeLock.release();
});

test('an existing ACTIVE execution blocks activation of another PLANNED execution', async () => {
    const { activeLock, service } = await setup();
    const first = await service.planFromTemplate({
        templateId: 'template-1', expectedAggregateRevision: 1,
    });
    const second = await service.planFromTemplate({
        templateId: 'template-1', expectedAggregateRevision: first.record.revision,
    });
    const firstExecution = second.record.executions[0].execution;
    const firstReady = await service.activatePlanned({
        executionId: firstExecution.id, expectedAggregateRevision: second.record.revision,
        expectedExecutionRevision: 1, expectedRuntimeRevision: 0,
    });
    await activeLock.release();
    const other = firstReady.record.executions[1].execution;
    const blocked = await service.activatePlanned({
        executionId: other.id, expectedAggregateRevision: firstReady.record.revision,
        expectedExecutionRevision: 1, expectedRuntimeRevision: 0,
    });
    assert.deepEqual(blocked.error, { type: 'conflict', code: 'activeExecutionExists' });
    assert.equal(blocked.status, 'error');
    await activeLock.release();
});

test('planning reports storage, lock and ambiguous acknowledgement without retrying', async () => {
    const quota = await setup();
    quota.storage.state.failWrite = 'QuotaExceededError';
    const quotaResult = await quota.service.planFromTemplate({
        templateId: 'template-1', expectedAggregateRevision: 1,
    });
    assert.deepEqual(quotaResult.error, { type: 'storage', code: 'storageQuota' });
    assert.equal(quota.storage.state.writes, 1);

    const busy = await setup();
    const gate = deferred();
    const held = busy.locks.request(
        'easyTimerEditor.v1.write', { mode: 'exclusive', ifAvailable: true }, () => gate.promise,
    );
    await new Promise(resolve => setImmediate(resolve));
    const busyResult = await busy.service.planFromTemplate({
        templateId: 'template-1', expectedAggregateRevision: 1,
    });
    assert.deepEqual(busyResult.error, { type: 'lock', code: 'lockBusy' });
    gate.resolve();
    await held;

    const uncertain = await setup();
    uncertain.storage.state.faultAfterWrites = uncertain.storage.state.writes;
    uncertain.storage.state.failReadAfterWrite = true;
    const ambiguous = await uncertain.service.planFromTemplate({
        templateId: 'template-1', expectedAggregateRevision: 1,
    });
    assert.equal(ambiguous.status, 'uncertain');
    assert.equal(ambiguous.executionId, 'execution-1');
    assert.deepEqual(ambiguous.error, { type: 'storage', code: 'storageUnconfirmed' });
    assert.equal(uncertain.storage.state.writes, 2);
    uncertain.storage.state.failReadAfterWrite = false;
    const observed = await uncertain.service.observeExecution('execution-1');
    assert.equal(observed.status, 'observed');
    assert.equal(observed.lifecycle, 'planned');
    assert.equal(uncertain.storage.state.writes, 2, 'observation is read-only');
});

test('activation uncertainty uses the existing Bridge reconciliation contract', async () => {
    const { storage, activeLock, service } = await setup();
    const planned = await service.planFromTemplate({
        templateId: 'template-1', expectedAggregateRevision: 1,
    });
    storage.state.faultAfterWrites = storage.state.writes;
    storage.state.failReadAfterWrite = true;
    const uncertain = await service.activatePlanned({
        executionId: planned.executionId,
        expectedAggregateRevision: planned.record.revision,
        expectedExecutionRevision: 1,
        expectedRuntimeRevision: 0,
    });
    assert.equal(uncertain.status, 'uncertain');
    assert.equal(uncertain.runtimeRunId, 'runtime-1');
    const blockedByPending = await service.activatePlanned({
        executionId: planned.executionId,
        expectedAggregateRevision: planned.record.revision,
        expectedExecutionRevision: 1,
        expectedRuntimeRevision: 0,
    });
    assert.deepEqual(blockedByPending.error, { type: 'pending', code: 'pendingActivation' });
    storage.state.failReadAfterWrite = false;
    const writes = storage.state.writes;
    const reads = storage.state.reads;
    const wrongExecution = await service.reconcilePendingActivation({
        executionId: 'foreign-execution',
        runtimeRunId: uncertain.runtimeRunId,
    });
    assert.deepEqual(wrongExecution.error, {
        type: 'pending', code: 'pendingActivationMismatch',
    });
    const wrongRuntime = await service.reconcilePendingActivation({
        executionId: uncertain.executionId,
        runtimeRunId: 'foreign-runtime',
    });
    assert.deepEqual(wrongRuntime.error, {
        type: 'pending', code: 'pendingActivationMismatch',
    });
    assert.equal(storage.state.reads, reads, 'identity mismatches never read or clear pending');
    assert.equal(storage.state.writes, writes);
    assert.equal(activeLock.held, true);
    const reconciled = await service.reconcilePendingActivation({
        executionId: uncertain.executionId,
        runtimeRunId: uncertain.runtimeRunId,
    });
    assert.equal(reconciled.status, 'ready');
    assert.equal(reconciled.runtime.clock.status, 'READY');
    assert.equal(storage.state.writes, writes, 'reconciliation performs no retry write');
    await activeLock.release();
});

test('failed readback can reconcile to the unchanged PLANNED source without retry', async () => {
    const { storage, activeLock, service } = await setup();
    const planned = await service.planFromTemplate({
        templateId: 'template-1', expectedAggregateRevision: 1,
    });
    const source = JSON.stringify(planned.record);
    storage.state.faultAfterWrites = storage.state.writes;
    storage.state.readback = null;
    const uncertain = await service.activatePlanned({
        executionId: planned.executionId,
        expectedAggregateRevision: planned.record.revision,
        expectedExecutionRevision: 1,
        expectedRuntimeRevision: 0,
    });
    storage.state.readback = undefined;
    storage.values.set(EDITOR_STORAGE_KEY, source);
    const reconciled = await service.reconcilePendingActivation({
        executionId: uncertain.executionId,
        runtimeRunId: uncertain.runtimeRunId,
    });
    assert.equal(reconciled.status, 'partial');
    assert.equal(reconciled.stage, 'planned');
    assert.equal(reconciled.record.activeRuntime, null);
    await activeLock.release();
});
