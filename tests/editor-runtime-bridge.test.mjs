import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlannedExecution } from '../src/js/editor-domain.mjs';
import { createEditorActiveTimerLock } from '../src/js/editor-active-lock.mjs';
import { createEditorRuntimeBridge } from '../src/js/editor-runtime-bridge.mjs';
import { EDITOR_STORAGE_KEY, activatePlannedExecutionInRecord,
    completeExecutionInRecord, updateCompletedReflectionInRecord } from '../src/js/editor-storage.mjs';
import { createEditorStoreWriter } from '../src/js/editor-storage-lock.mjs';
import { transitionSession } from '../src/js/session.mjs';

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
    }, {
        id: 'phase-2',
        title: 'Discussion',
        durationSeconds: 120,
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

const startOptions = (changes = {}) => ({
    executionId: 'execution-1',
    expectedAggregateRevision: 1,
    expectedExecutionRevision: 2,
    expectedRuntimeRevision: 1,
    attemptId: 'attempt-1',
    startedAt: 2000,
    ...changes,
});

function sessionActionOptions(source, actionType, occurredAt, changes = {}) {
    const execution = source.executions.find(item => item.execution.lifecycle === 'active').execution;
    return {
        executionId: execution.id,
        expectedAggregateRevision: source.revision,
        expectedExecutionRevision: execution.revision,
        expectedRuntimeRevision: execution.runtimeRevision,
        expectedAttemptId: execution.attempt.id,
        expectedRunId: execution.attempt.runtimeRunId,
        actionType,
        occurredAt,
        ...changes,
    };
}

const completeWorkshopNotes = () => ({
    rundown: 'Complete rundown notes',
    phases: [
        { phaseId: 'phase-1', text: 'Opening notes' },
        { phaseId: 'phase-2', text: 'Discussion notes' },
    ],
});

function suspendOptions(source, suspendedAt, workshopNotes = completeWorkshopNotes(), changes = {}) {
    const execution = source.executions.find(item => item.execution.lifecycle === 'active').execution;
    return {
        executionId: execution.id,
        expectedAggregateRevision: source.revision,
        expectedExecutionRevision: execution.revision,
        expectedRuntimeRevision: execution.runtimeRevision,
        expectedAttemptId: execution.attempt?.id ?? null,
        expectedRunId: source.activeRuntime.run.runId,
        suspendedAt,
        workshopNotes,
        ...changes,
    };
}

function resumeOptions(source, resumedAt, changes = {}) {
    const execution = source.executions.find(item => item.execution.lifecycle === 'suspended').execution;
    return {
        executionId: execution.id,
        expectedAggregateRevision: source.revision,
        expectedExecutionRevision: execution.revision,
        expectedRuntimeRevision: execution.runtimeRevision,
        expectedAttemptId: execution.attempt?.id ?? null,
        expectedRunId: execution.attempt?.runtimeRunId ?? null,
        ...(execution.attempt === null ? { runtimeRunId: 'runtime-resumed-1' } : {}),
        resumedAt,
        ...changes,
    };
}

function deferred() {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
}

function lockManager(events = []) {
    const held = new Set();
    return {
        held,
        storeGate: null,
        request(name, options, callback) {
            events.push(['request', name, structuredClone(options)]);
            if (held.has(name)) return Promise.resolve(callback(null));
            held.add(name);
            events.push(['acquired', name]);
            return Promise.resolve()
                .then(async () => {
                    if (name === 'easyTimerEditor.v1.write' && this.storeGate) {
                        await this.storeGate.promise;
                    }
                    return callback({ name, mode: 'exclusive' });
                })
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
        faultAfterWrites: 0,
        readback: undefined,
    };
    return {
        state,
        values,
        getItem(key) {
            events.push(['read', new Set(locks.held)]);
            if (state.failRead) throw new Error('read failed');
            if (state.failReadAfterWrite && state.writes > state.faultAfterWrites) {
                throw new Error('readback failed');
            }
            if (state.readback !== undefined && state.writes > state.faultAfterWrites) return state.readback;
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

function executionExitOptions(source, changes = {}) {
    const execution = source.executions[0].execution;
    return {
        executionId: execution.id, expectedLifecycle: execution.lifecycle,
        expectedAggregateRevision: source.revision, expectedExecutionRevision: execution.revision,
        expectedRuntimeRevision: execution.runtimeRevision, expectedAttemptId: execution.attempt?.id ?? null,
        expectedRunId: execution.lifecycle === 'active' ? source.activeRuntime.run.runId : execution.attempt?.runtimeRunId ?? null,
        ...changes,
    };
}

test('retain and discard persist ACTIVE READY/STARTED without releasing ownership or mutating the source', async () => {
    for (const method of ['retainExecutionPlan', 'discardExecution']) {
        for (const hasStarted of [false, true]) {
            const c = setup();
            let source = await c.bridge.activatePlanned(activationOptions());
            if (hasStarted) source = await c.bridge.startReady(startOptions());
            const before = structuredClone(source);
            const options = executionExitOptions(source);
            const writes = c.storage.state.writes;
            const target = await c.bridge[method](options);
            assert.equal(target.activeRuntime, null);
            assert.equal(target.revision, source.revision + 1);
            assert.deepEqual(target.templates, source.templates);
            if (method === 'retainExecutionPlan') {
                const execution = source.executions[0].execution;
                const expectedExecution = { ...execution };
                delete expectedExecution.phaseOutcomes;
                assert.deepEqual(target.executions, [{ execution: { ...expectedExecution, lifecycle: 'planned',
                    revision: execution.revision + 1, runtimeRevision: execution.runtimeRevision + 1,
                    attempt: null, workshopNotes: { rundown: '', phases: [] } }, suspendedCheckpoint: null }]);
            } else assert.deepEqual(target.executions, []);
            assert.deepEqual(await c.writer.read(), target);
            assert.deepEqual(source, before);
            assert.deepEqual(options, executionExitOptions(before));
            assert.equal(c.storage.state.writes, writes + 1);
            assert.equal(c.activeLock.held, true);
            await c.activeLock.release();
        }
    }
});

test('suspended exits need only the Store lock and preserve a different controller and ACTIVE runtime', async () => {
    for (const method of ['retainExecutionPlan', 'discardExecution']) {
        for (const prepare of [suspendedReadyBridgeSetup, suspendedStartedBridgeSetup]) {
            const events = [];
            const c = await prepare(events);
            const source = activatePlannedExecutionInRecord({ ...c.suspended, executions: [
                ...c.suspended.executions,
                { execution: createPlannedExecution(template(), 'other-execution'), suspendedCheckpoint: null },
            ] }, { ...activationOptions(), executionId: 'other-execution',
                expectedAggregateRevision: c.suspended.revision, runtimeRunId: 'other-run', savedAt: 20_000 });
            c.storage.values.set(EDITOR_STORAGE_KEY, JSON.stringify(source));
            const otherOwner = createEditorActiveTimerLock({ locks: c.locks });
            await otherOwner.claim();
            const requestCount = events.filter(event => event[0] === 'request' && event[1] === 'easyTimerEditor.v1.active-runtime').length;
            const writes = c.storage.state.writes;
            const result = await c.bridge[method](executionExitOptions(source));
            assert.deepEqual(result.activeRuntime, source.activeRuntime);
            assert.deepEqual(result.executions.at(-1), source.executions[1]);
            assert.deepEqual(result.templates, source.templates);
            assert.equal(result.revision, source.revision + 1);
            assert.deepEqual(await c.writer.read(), result);
            assert.equal(c.storage.state.writes, writes + 1);
            assert.equal(otherOwner.held, true);
            assert.equal(c.activeLock.held, false);
            assert.equal(events.filter(event => event[0] === 'request' && event[1] === 'easyTimerEditor.v1.active-runtime').length, requestCount);
            await otherOwner.release();
        }
    }
});

test('execution exits reject absent/lost ownership, stale callers, busy locks and storage errors without release', async () => {
    for (const method of ['retainExecutionPlan', 'discardExecution']) {
        const c = await startedBridgeSetup();
        const options = executionExitOptions(c.started);
        const initialWrites = c.storage.state.writes;
        const unavailable = createEditorRuntimeBridge({ activeLock: c.activeLock,
            writer: createEditorStoreWriter({ getStorage: () => c.storage, locks: null }) });
        await assert.rejects(unavailable[method](options), /lockUnavailable/);
        await assert.rejects(c.bridge[method]({ ...options, expectedAggregateRevision: 0 }), /conflict/);
        await assert.rejects(c.bridge[method]({ ...options, expectedLifecycle: 'suspended' }), /invalidLifecycle/);
        assert.equal(c.storage.state.writes, initialWrites);
        for (const [key, value, code] of [
            ['failRead', true, 'storageRead'], ['failWrite', 'QuotaExceededError', 'storageQuota'],
            ['failWrite', 'Error', 'storageWrite'],
        ]) {
            c.storage.state[key] = value;
            await assert.rejects(c.bridge[method](options), new RegExp(code));
            c.storage.state[key] = key === 'failRead' ? false : null;
            assert.equal(c.storage.state.writes, initialWrites);
            assert.equal(c.activeLock.held, true);
            assert.deepEqual(await c.writer.read(), c.started);
        }
        c.locks.held.add('easyTimerEditor.v1.write');
        await assert.rejects(c.bridge[method](options), /lockBusy/);
        c.locks.held.delete('easyTimerEditor.v1.write');
        assert.equal(c.activeLock.held, true);
        const gate = deferred(); c.locks.storeGate = gate;
        const waiting = c.bridge[method](options);
        const rejected = assert.rejects(waiting, /activeLockRequired/);
        await assert.rejects(c.bridge[method](options), /bridgeBusy/);
        await c.activeLock.release(); gate.resolve(); await rejected;
        assert.equal(c.storage.state.writes, initialWrites);
        const events = c.storage.state.writes;
        await assert.rejects(c.bridge[method](options), /activeLockRequired/);
        assert.equal(c.storage.state.writes, events);
    }
});

test('uncertain ACTIVE and SUSPENDED exits reconcile source/target/conflict read-only without duplicate deletion', async () => {
    for (const method of ['retainExecutionPlan', 'discardExecution']) {
        for (const suspended of [false, true]) {
            for (const outcome of ['source', 'target', 'conflict']) {
                const c = suspended ? await suspendedStartedBridgeSetup() : await startedBridgeSetup();
                const source = suspended ? c.suspended : c.started;
                const options = executionExitOptions(source);
                c.storage.state.faultAfterWrites = c.storage.state.writes;
                c.storage.state.failReadAfterWrite = true;
                await assert.rejects(c.bridge[method](options), /storageUnconfirmed/);
                const target = JSON.parse(c.storage.values.get(EDITOR_STORAGE_KEY));
                const writes = c.storage.state.writes;
                await assert.rejects(c.bridge[method](options), /pendingOperation/);
                await assert.rejects(c.bridge.reconcilePendingOperation(), /storageRead/);
                c.storage.state.failReadAfterWrite = false;
                let observed = target;
                if (outcome === 'source') observed = source;
                if (outcome === 'conflict') {
                    observed = structuredClone(target); observed.revision += 1;
                    observed.templates[0].plan.name = 'Concurrent change';
                }
                c.storage.values.set(EDITOR_STORAGE_KEY, JSON.stringify(observed));
                const result = await c.bridge.reconcilePendingOperation();
                assert.deepEqual(result, { kind: method === 'retainExecutionPlan' ? 'retainPlan' : 'discard', outcome, record: observed });
                assert.equal(c.storage.state.writes, writes);
                assert.equal(c.activeLock.held, !suspended);
                assert.deepEqual(await c.writer.read(), observed);
                if (outcome === 'conflict') await assert.rejects(c.bridge[method](options), /pendingOperation/);
                else await assert.rejects(c.bridge.reconcilePendingOperation(), /noPendingOperation/);
                if (c.activeLock.held) await c.activeLock.release();
            }
        }
    }
});

test('readback mismatch retains a pending exit and requires ownership for ACTIVE reconciliation', async () => {
    for (const method of ['retainExecutionPlan', 'discardExecution']) {
        const c = await startedBridgeSetup();
        c.storage.state.faultAfterWrites = c.storage.state.writes;
        c.storage.state.readback = 'invalid readback';
        const options = executionExitOptions(c.started);
        await assert.rejects(c.bridge[method](options), /storageReadback/);
        c.storage.state.readback = undefined;
        const writes = c.storage.state.writes;
        await c.activeLock.release();
        await assert.rejects(c.bridge.reconcilePendingOperation(), /activeLockRequired/);
        await c.activeLock.claim();
        assert.equal((await c.bridge.reconcilePendingOperation()).outcome, 'target');
        assert.equal(c.storage.state.writes, writes);
        await c.activeLock.release();
    }
});

test('exit options are captured before waiting, so mutation cannot bypass ACTIVE ownership', async () => {
    for (const method of ['retainExecutionPlan', 'discardExecution']) {
        const c = await suspendedStartedBridgeSetup();
        const active = await c.bridge.resumeSuspended(resumeOptions(c.suspended, 20_000));
        await c.activeLock.release();
        const options = executionExitOptions(c.suspended);
        const gate = deferred(); c.locks.storeGate = gate;
        const writes = c.storage.state.writes;
        const pending = c.bridge[method](options);
        const rejected = assert.rejects(pending, /conflict|invalidLifecycle/);
        Object.assign(options, executionExitOptions(active));
        gate.resolve(); await rejected;
        assert.deepEqual(await c.writer.read(), active);
        assert.equal(c.storage.state.writes, writes);
        assert.equal(c.activeLock.held, false);
    }
});

test('exit acknowledgement lost after the writer callback is reconciled without a retry', async () => {
    for (const method of ['retainExecutionPlan', 'discardExecution', 'suspendActive']) {
        const c = await startedBridgeSetup();
        const normalRequest = c.locks.request;
        c.locks.request = async function(name, options, callback) {
            const result = await normalRequest.call(this, name, options, callback);
            if (name === 'easyTimerEditor.v1.write') throw new Error('Late request failure');
            return result;
        };
        const before = c.storage.state.writes;
        await assert.rejects(c.bridge[method](method === 'suspendActive'
            ? suspendOptions(c.started, 12_000) : executionExitOptions(c.started)), /lockRequest/);
        c.locks.request = normalRequest;
        const target = JSON.parse(c.storage.values.get(EDITOR_STORAGE_KEY));
        const result = await c.bridge.reconcilePendingOperation();
        assert.equal(result.outcome, 'target');
        assert.deepEqual(result.record, target);
        assert.equal(c.storage.state.writes, before + 1);
        assert.equal(c.activeLock.held, true);
        await c.activeLock.release();
    }
});

test('late lock request failures for activation and resume retain exact source and target for read-only reconciliation', async () => {
    for (const kind of ['activation', 'resume']) {
        for (const outcome of ['source', 'target', 'conflict']) {
            const c = kind === 'activation' ? setup() : await suspendedStartedBridgeSetup();
            const source = kind === 'activation' ? initialRecord() : c.suspended;
            const options = kind === 'activation' ? activationOptions() : resumeOptions(source, 20_000);
            const method = kind === 'activation' ? 'activatePlanned' : 'resumeSuspended';
            const normalRequest = c.locks.request;
            c.locks.request = async function(name, lockOptions, callback) {
                const result = await normalRequest.call(this, name, lockOptions, callback);
                if (name === 'easyTimerEditor.v1.write') throw new Error('Late request failure');
                return result;
            };
            const writes = c.storage.state.writes;
            await assert.rejects(c.bridge[method](options), /lockRequestUnconfirmed/);
            c.locks.request = normalRequest;
            const target = JSON.parse(c.storage.values.get(EDITOR_STORAGE_KEY));
            let observed = outcome === 'source' ? source : target;
            if (outcome === 'conflict') {
                observed = structuredClone(target);
                observed.revision += 1;
                observed.templates[0].plan.name = 'Concurrent valid change';
            }
            c.storage.values.set(EDITOR_STORAGE_KEY, JSON.stringify(observed));
            await assert.rejects(c.bridge[method](options), kind === 'activation' ? /pendingActivation/ : /pendingOperation/);
            const result = kind === 'activation'
                ? await c.bridge.reconcilePendingActivation({
                    executionId: 'execution-1',
                    runtimeRunId: kind === 'activation' ? 'runtime-ready-1' : target.activeRuntime.run.runId,
                })
                : await c.bridge.reconcilePendingOperation();
            assert.equal(result.outcome, outcome);
            assert.deepEqual(result.record, observed);
            assert.equal(c.storage.state.writes, writes + 1, 'reconciliation never retries the write');
            assert.equal(c.activeLock.held, true, 'uncertain entry retains active ownership');
            if (outcome === 'conflict') {
                await assert.rejects(c.bridge[method](options), kind === 'activation' ? /pendingActivation/ : /pendingOperation/);
            } else {
                await assert.rejects(c.bridge.reconcilePendingOperation(), /noPendingOperation/);
            }
            await c.activeLock.release();
        }
    }
});

test('native reload adoption exposes current outcomes read-only and later writes do not double count them', async () => {
    for (const transitionMode of ['manual', 'automatic']) {
        const c = await persistedActiveSetup({ started: true, transitionMode });
        const writes = c.storage.state.writes;
        const before = structuredClone(c.record);
        const adopted = await c.bridge.adoptPersistedActive({ observedAt: 70_000 });
        assert.deepEqual(adopted.record, before, 'adoption does not rewrite the persisted observation');
        assert.deepEqual(adopted.runtime.phaseOutcomes, transitionMode === 'manual' ? [
            { phaseId: 'phase-1', conducted: true, activeMs: 68_000, overtimeMs: 8000 },
            { phaseId: 'phase-2', conducted: false, activeMs: 0, overtimeMs: 0 },
        ] : [
            { phaseId: 'phase-1', conducted: true, activeMs: 60_000, overtimeMs: 0 },
            { phaseId: 'phase-2', conducted: true, activeMs: 8000, overtimeMs: 0 },
        ]);
        assert.deepEqual(await c.writer.read(), before);
        assert.equal(c.storage.state.writes, writes);
        const paused = await c.bridge.applySessionAction(sessionActionOptions(before, 'PAUSE', 72_000));
        assert.deepEqual(paused.executions[0].execution.phaseOutcomes, transitionMode === 'manual' ? [
            { phaseId: 'phase-1', conducted: true, activeMs: 70_000, overtimeMs: 10_000 },
            { phaseId: 'phase-2', conducted: false, activeMs: 0, overtimeMs: 0 },
        ] : [
            { phaseId: 'phase-1', conducted: true, activeMs: 60_000, overtimeMs: 0 },
            { phaseId: 'phase-2', conducted: true, activeMs: 10_000, overtimeMs: 0 },
        ]);
        assert.deepEqual(paused.executions[0].execution.attempt, before.executions[0].execution.attempt);
        assert.equal(c.storage.state.writes, writes + 1);
        await c.activeLock.release();
    }
});

test('uncertain NEXT reconciles the complete captured phase outcome without retry or duplicated duration', async () => {
    const c = await startedBridgeSetup();
    c.storage.state.faultAfterWrites = c.storage.state.writes;
    c.storage.state.failReadAfterWrite = true;
    await assert.rejects(c.bridge.applySessionAction(sessionActionOptions(c.started, 'NEXT', 12_000)), /storageUnconfirmed/);
    const target = JSON.parse(c.storage.values.get(EDITOR_STORAGE_KEY));
    assert.deepEqual(target.executions[0].execution.phaseOutcomes, [
        { phaseId: 'phase-1', conducted: true, activeMs: 10_000, overtimeMs: 0 },
        { phaseId: 'phase-2', conducted: false, activeMs: 0, overtimeMs: 0 },
    ]);
    const writes = c.storage.state.writes;
    c.storage.state.failReadAfterWrite = false;
    assert.deepEqual(await c.bridge.reconcilePendingOperation(), { kind: 'sessionAction', outcome: 'target', record: target });
    assert.equal(c.storage.state.writes, writes);
    assert.equal(c.activeLock.held, true);
    await c.activeLock.release();
});

test('adoption rejects incomplete native started history without replacing the Store or claiming ownership', async () => {
    const c = await persistedActiveSetup({ started: true });
    delete c.record.executions[0].execution.phaseOutcomes;
    const raw = JSON.stringify(c.record);
    c.storage.values.set(EDITOR_STORAGE_KEY, raw);
    const writes = c.storage.state.writes;
    await assert.rejects(c.bridge.adoptPersistedActive({ observedAt: 10_000 }), /storageValidation/);
    assert.equal(c.storage.values.get(EDITOR_STORAGE_KEY), raw);
    assert.equal(c.storage.state.writes, writes);
    assert.equal(c.activeLock.held, false);
});

function completionOptions(source, completedAt = 12_000, changes = {}) {
    return { ...executionExitOptions(source), completedAt, workshopNotes: completeWorkshopNotes(), ...changes };
}

function reflectionOptions(source, reflection = 'Retrospective', changes = {}) {
    const execution = source.executions[0].execution;
    return { executionId: execution.id, expectedAggregateRevision: source.revision,
        expectedExecutionRevision: execution.revision, reflection, ...changes };
}

async function archivalBridgeSetup(kind) {
    if (kind === 'suspended') {
        const c = await suspendedStartedBridgeSetup();
        return { ...c, source: c.suspended, method: 'completeExecution', options: completionOptions(c.suspended, 1_000_000) };
    }
    const c = await startedBridgeSetup();
    if (kind === 'active') return { ...c, source: c.started, method: 'completeExecution', options: completionOptions(c.started) };
    const completed = await c.bridge.completeExecution(completionOptions(c.started));
    await c.activeLock.release();
    return { ...c, source: completed, method: 'updateCompletedReflection', options: reflectionOptions(completed) };
}

test('ACTIVE archive is one confirmed write with complete final notes and no ownership release', async () => {
    const c = await startedBridgeSetup();
    const options = completionOptions(c.started);
    const before = structuredClone(c.started);
    const writes = c.storage.state.writes;
    const completed = await c.bridge.completeExecution(options);
    assert.deepEqual(completed, completeExecutionInRecord(before, options));
    assert.equal(completed.activeRuntime, null);
    assert.deepEqual(completed.executions[0].execution.phaseOutcomes, [
        { phaseId: 'phase-1', conducted: true, activeMs: 10_000, overtimeMs: 0 },
        { phaseId: 'phase-2', conducted: false, activeMs: 0, overtimeMs: 0 },
    ]);
    assert.deepEqual(completed.executions[0].execution.workshopNotes, completeWorkshopNotes());
    assert.deepEqual(c.started, before);
    assert.equal(c.storage.state.writes, writes + 1);
    assert.deepEqual(await c.writer.read(), completed);
    assert.equal(c.activeLock.held, true);
    await c.activeLock.release();
});

test('suspended completion and reflection preserve another ACTIVE owner and its full runtime', async () => {
    const events = [];
    const c = await suspendedStartedBridgeSetup(events);
    const source = activatePlannedExecutionInRecord({ ...c.suspended, executions: [
        ...c.suspended.executions, { execution: createPlannedExecution(template(), 'other'), suspendedCheckpoint: null },
    ] }, { ...activationOptions(), executionId: 'other', expectedAggregateRevision: c.suspended.revision,
        runtimeRunId: 'other-run', savedAt: 20_000 });
    c.storage.values.set(EDITOR_STORAGE_KEY, JSON.stringify(source));
    const otherOwner = createEditorActiveTimerLock({ locks: c.locks }); await otherOwner.claim();
    const claims = events.filter(event => event[0] === 'request' && event[1] === 'easyTimerEditor.v1.active-runtime').length;
    const completed = await c.bridge.completeExecution(completionOptions(source, 1_000_000));
    assert.deepEqual(completed, completeExecutionInRecord(source, completionOptions(source, 1_000_000)));
    assert.deepEqual(completed.activeRuntime, source.activeRuntime);
    assert.deepEqual(completed.executions[1], source.executions[1]);
    const updated = await c.bridge.updateCompletedReflection(reflectionOptions(completed));
    assert.deepEqual(updated, updateCompletedReflectionInRecord(completed, reflectionOptions(completed)));
    assert.deepEqual(updated.activeRuntime, source.activeRuntime);
    assert.deepEqual(await c.writer.read(), updated);
    assert.equal(otherOwner.held, true);
    assert.equal(c.activeLock.held, false);
    assert.equal(events.filter(event => event[0] === 'request' && event[1] === 'easyTimerEditor.v1.active-runtime').length, claims);
    await otherOwner.release();
});

test('new archival operations preserve source records on storage/lock errors and never release ownership', async () => {
    for (const kind of ['active', 'suspended', 'reflection']) {
        const c = await archivalBridgeSetup(kind);
        const writes = c.storage.state.writes;
        const unavailable = createEditorRuntimeBridge({ activeLock: c.activeLock,
            writer: createEditorStoreWriter({ getStorage: () => c.storage, locks: null }) });
        await assert.rejects(unavailable[c.method](c.options), /lockUnavailable/);
        c.locks.held.add('easyTimerEditor.v1.write');
        await assert.rejects(c.bridge[c.method](c.options), /lockBusy/);
        c.locks.held.delete('easyTimerEditor.v1.write');
        await assert.rejects(c.bridge[c.method]({ ...c.options, expectedAggregateRevision: 0 }), /conflict/);
        await assert.rejects(c.bridge[c.method]({ ...c.options, expectedExecutionRevision: 0 }), /conflict|invalidRevision/);
        for (const [key, value, error] of [['failRead', true, 'storageRead'],
            ['failWrite', 'QuotaExceededError', 'storageQuota'], ['failWrite', 'Error', 'storageWrite']]) {
            c.storage.state[key] = value;
            await assert.rejects(c.bridge[c.method](c.options), new RegExp(error));
            c.storage.state[key] = key === 'failRead' ? false : null;
            assert.deepEqual(await c.writer.read(), c.source);
            assert.equal(c.storage.state.writes, writes);
            assert.equal(c.activeLock.held, kind === 'active');
        }
        if (c.activeLock.held) await c.activeLock.release();
    }
});

test('uncertain completion/reflection reconciles source, target or conflict without reconstructing or retrying', async () => {
    for (const kind of ['active', 'suspended', 'reflection']) {
        for (const failure of ['unconfirmed', 'readback', 'lateRequest']) {
            for (const outcome of ['source', 'target', 'conflict']) {
                const c = await archivalBridgeSetup(kind);
                const normalRequest = c.locks.request;
                c.storage.state.faultAfterWrites = c.storage.state.writes;
                if (failure === 'unconfirmed') c.storage.state.failReadAfterWrite = true;
                if (failure === 'readback') c.storage.state.readback = 'Mismatching readback';
                if (failure === 'lateRequest') c.locks.request = async function(name, options, callback) {
                    const result = await normalRequest.call(this, name, options, callback);
                    if (name === 'easyTimerEditor.v1.write') throw new Error('Late acknowledgement failure');
                    return result;
                };
                await assert.rejects(c.bridge[c.method](c.options), /storageUnconfirmed|storageReadback|lockRequest/);
                const target = JSON.parse(c.storage.values.get(EDITOR_STORAGE_KEY));
                c.storage.state.failReadAfterWrite = false; c.storage.state.readback = undefined;
                c.locks.request = normalRequest;
                const writes = c.storage.state.writes;
                await assert.rejects(c.bridge[c.method](c.options), /pendingOperation/);
                c.storage.state.failRead = true;
                await assert.rejects(c.bridge.reconcilePendingOperation(), /storageRead/);
                c.storage.state.failRead = false;
                let observed = outcome === 'source' ? c.source : target;
                if (outcome === 'conflict') {
                    observed = structuredClone(target); observed.revision += 1;
                    observed.templates[0].plan.name = 'Concurrent change';
                }
                c.storage.values.set(EDITOR_STORAGE_KEY, JSON.stringify(observed));
                assert.deepEqual(await c.bridge.reconcilePendingOperation(), {
                    kind: kind === 'reflection' ? 'reflection' : 'complete', outcome, record: observed,
                });
                assert.equal(c.storage.state.writes, writes);
                assert.equal(c.activeLock.held, kind === 'active');
                assert.deepEqual(await c.writer.read(), observed);
                if (outcome === 'conflict') await assert.rejects(c.bridge[c.method](c.options), /pendingOperation/);
                else await assert.rejects(c.bridge.reconcilePendingOperation(), /noPendingOperation/);
                if (c.activeLock.held) await c.activeLock.release();
            }
        }
    }
});

test('completion checks ownership at write entry, captures note input and blocks overlapping operations', async () => {
    for (const loseOwnership of [false, true]) {
        const c = await startedBridgeSetup();
        const gate = deferred(); c.locks.storeGate = gate;
        const options = completionOptions(c.started);
        const writes = c.storage.state.writes;
        const pending = c.bridge.completeExecution(options);
        const checked = loseOwnership ? assert.rejects(pending, /activeLockRequired/) : pending;
        options.workshopNotes.rundown = 'Changed while waiting';
        await assert.rejects(c.bridge.completeExecution(options), /bridgeBusy/);
        if (loseOwnership) await c.activeLock.release();
        gate.resolve();
        const result = await checked;
        if (loseOwnership) {
            assert.equal(c.storage.state.writes, writes);
            assert.deepEqual(await c.writer.read(), c.started);
            await assert.rejects(c.bridge.completeExecution(options), /activeLockRequired/);
        } else {
            assert.equal(result.executions[0].execution.workshopNotes.rundown, 'Complete rundown notes');
            assert.equal(c.activeLock.held, true);
            await c.activeLock.release();
        }
    }
});

test('never-started ACTIVE/SUSPENDED cannot archive and ACTIVE pending reconciliation needs retained ownership', async () => {
    const readyContext = setup();
    const ready = await readyContext.bridge.activatePlanned(activationOptions());
    await assert.rejects(readyContext.bridge.completeExecution(completionOptions(ready)), /invalidAttempt/);
    await readyContext.activeLock.release();
    const dormant = await suspendedReadyBridgeSetup();
    await assert.rejects(dormant.bridge.completeExecution(completionOptions(dormant.suspended)), /invalidAttempt/);
    const c = await archivalBridgeSetup('active');
    c.storage.state.faultAfterWrites = c.storage.state.writes;
    c.storage.state.failReadAfterWrite = true;
    await assert.rejects(c.bridge.completeExecution(c.options), /storageUnconfirmed/);
    c.storage.state.failReadAfterWrite = false;
    await c.activeLock.release();
    await assert.rejects(c.bridge.reconcilePendingOperation(), /activeLockRequired/);
    await c.activeLock.claim();
    assert.equal((await c.bridge.reconcilePendingOperation()).outcome, 'target');
    await c.activeLock.release();
});

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
    const result = await bridge.reconcilePendingOperation();

    assert.equal(result.kind, 'activation');
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

test('activation identity guard rejects foreign reconciliation before reading or clearing pending', async () => {
    const events = [];
    const locks = lockManager(events);
    const storage = memory(initialRecord(), locks, events);
    storage.state.failReadAfterWrite = true;
    const { activeLock, bridge } = setup({ locks, storage });

    await assert.rejects(bridge.activatePlanned(activationOptions()), /storageUnconfirmed/);
    storage.state.failReadAfterWrite = false;
    const writes = storage.state.writes;
    const reads = events.filter(event => event[0] === 'read').length;
    await assert.rejects(bridge.reconcilePendingActivation({
        executionId: 'foreign-execution', runtimeRunId: 'runtime-ready-1',
    }), /pendingActivationMismatch/);
    await assert.rejects(bridge.reconcilePendingActivation({
        executionId: 'execution-1', runtimeRunId: 'foreign-runtime',
    }), /pendingActivationMismatch/);
    assert.equal(storage.state.writes, writes);
    assert.equal(events.filter(event => event[0] === 'read').length, reads);
    assert.equal(activeLock.held, true);

    const result = await bridge.reconcilePendingActivation({
        executionId: 'execution-1', runtimeRunId: 'runtime-ready-1',
    });
    assert.equal(result.outcome, 'target');
    assert.equal(storage.state.writes, writes);
    assert.equal(activeLock.held, true);
    await activeLock.release();
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

test('starts READY under existing ownership without a second claim and confirms the bound RUNNING attempt', async () => {
    const events = [];
    const locks = lockManager(events);
    const storage = memory(initialRecord(), locks, events);
    const { activeLock, bridge } = setup({ locks, storage });
    const ready = await bridge.activatePlanned(activationOptions());
    const activeRequests = () => events.filter(event => event[0] === 'request'
        && event[1] === 'easyTimerEditor.v1.active-runtime').length;
    assert.equal(activeRequests(), 1);

    const result = await bridge.startReady(startOptions());

    assert.equal(activeRequests(), 1);
    assert.equal(storage.state.writes, 2);
    assert.equal(result.revision, ready.revision + 1);
    assert.equal(result.executions[0].execution.attempt.id, 'attempt-1');
    assert.equal(result.executions[0].execution.attempt.runtimeRunId, 'runtime-ready-1');
    assert.equal(result.activeRuntime.attemptId, 'attempt-1');
    assert.equal(result.activeRuntime.run.runId, 'runtime-ready-1');
    assert.equal(result.activeRuntime.clock.status, 'RUNNING');
    assert.equal(activeLock.held, true);
    result.executions[0].execution.attempt.startSnapshot.name = 'Changed result';
    assert.equal(JSON.parse(storage.values.get(EDITOR_STORAGE_KEY))
        .executions[0].execution.attempt.startSnapshot.name, 'Workshop');
    await assert.rejects(bridge.reconcilePendingOperation(), /noPendingOperation/);

    await activeLock.release();
});

test('rejects START without ownership before store access', async () => {
    let storageRequests = 0;
    const locks = lockManager();
    const activeLock = createEditorActiveTimerLock({ locks });
    const writer = createEditorStoreWriter({
        getStorage: () => { storageRequests += 1; return memory(initialRecord(), locks); },
        locks,
    });
    const bridge = createEditorRuntimeBridge({ writer, activeLock });

    await assert.rejects(bridge.startReady(startOptions()), /activeLockRequired/);
    assert.equal(storageRequests, 0);
});

test('rejects stale and backward first START operations without a write or ownership release', async () => {
    const { storage, activeLock, bridge } = setup();
    await bridge.activatePlanned(activationOptions());
    const writes = storage.state.writes;

    await assert.rejects(bridge.startReady(startOptions({
        expectedAggregateRevision: 0,
    })), /conflict/);
    await assert.rejects(bridge.startReady(startOptions({ startedAt: 999 })), /CLOCK_ANOMALY/);
    assert.equal(storage.state.writes, writes);
    assert.equal(activeLock.held, true);

    await activeLock.release();
});

async function pendingStartSetup(failureMode) {
    const locks = lockManager();
    const source = initialRecord();
    const storage = memory(source, locks);
    const components = setup({ locks, storage });
    const ready = await components.bridge.activatePlanned(activationOptions());
    storage.state.faultAfterWrites = storage.state.writes;
    if (failureMode === 'unconfirmed') storage.state.failReadAfterWrite = true;
    else storage.state.readback = null;
    await assert.rejects(
        components.bridge.startReady(startOptions()),
        failureMode === 'unconfirmed' ? /storageUnconfirmed/ : /storageReadback/,
    );
    storage.state.failReadAfterWrite = false;
    storage.state.readback = undefined;
    return { ...components, ready };
}

test('reconciles an unconfirmed first START as target without another write', async () => {
    const { locks, storage, activeLock, bridge } = await pendingStartSetup('unconfirmed');
    const writes = storage.state.writes;

    const result = await bridge.reconcilePendingOperation();

    assert.equal(result.kind, 'start');
    assert.equal(result.outcome, 'target');
    assert.equal(result.record.executions[0].execution.attempt.id, 'attempt-1');
    assert.equal(result.record.activeRuntime.clock.status, 'RUNNING');
    assert.equal(storage.state.writes, writes);
    assert.equal(activeLock.held, true);
    await assert.rejects(bridge.reconcilePendingOperation(), /noPendingOperation/);

    await activeLock.release();
    assert.equal(locks.held.size, 0);
});

test('reconciles an unconfirmed first START as source without retrying it', async () => {
    const { storage, activeLock, bridge, ready } = await pendingStartSetup('readback');
    storage.values.set(EDITOR_STORAGE_KEY, JSON.stringify(ready));
    const writes = storage.state.writes;

    const result = await bridge.reconcilePendingOperation();

    assert.equal(result.kind, 'start');
    assert.equal(result.outcome, 'source');
    assert.deepEqual(result.record, ready);
    assert.equal(storage.state.writes, writes);
    assert.equal(activeLock.held, true);
    await activeLock.release();
});

test('keeps a conflicting START pending and blocks START and activation mutations', async () => {
    const { storage, activeLock, bridge } = await pendingStartSetup('readback');
    const third = JSON.parse(storage.values.get(EDITOR_STORAGE_KEY));
    third.templates[0].plan.name = 'Concurrent valid change';
    storage.values.set(EDITOR_STORAGE_KEY, JSON.stringify(third));
    const writes = storage.state.writes;

    const result = await bridge.reconcilePendingOperation();

    assert.equal(result.kind, 'start');
    assert.equal(result.outcome, 'conflict');
    await assert.rejects(bridge.startReady(startOptions()), /pendingOperation/);
    await assert.rejects(bridge.activatePlanned(activationOptions()), /pendingActivation/);
    assert.equal(storage.state.writes, writes);
    assert.equal(activeLock.held, true);
    await activeLock.release();
});

test('retains a pending START and ownership after a failed reconciliation read', async () => {
    const { storage, activeLock, bridge } = await pendingStartSetup('unconfirmed');
    storage.state.failRead = true;

    await assert.rejects(bridge.reconcilePendingOperation(), /storageRead/);
    assert.equal(activeLock.held, true);
    storage.state.failRead = false;
    assert.equal((await bridge.reconcilePendingOperation()).outcome, 'target');
    await activeLock.release();
});

test('blocks overlapping bridge mutations while the first writer is pending', async () => {
    const locks = lockManager();
    const storage = memory(initialRecord(), locks);
    const { activeLock, bridge } = setup({ locks, storage });
    await bridge.activatePlanned(activationOptions());
    locks.storeGate = deferred();

    const first = bridge.startReady(startOptions());
    await new Promise(resolve => setImmediate(resolve));
    await assert.rejects(bridge.startReady(startOptions()), /bridgeBusy/);
    await assert.rejects(bridge.activatePlanned(activationOptions()), /bridgeBusy/);
    assert.equal(storage.state.writes, 1);

    locks.storeGate.resolve();
    const result = await first;
    assert.equal(result.activeRuntime.clock.status, 'RUNNING');
    assert.equal(storage.state.writes, 2);
    assert.equal(activeLock.held, true);
    await activeLock.release();
});

async function startedBridgeSetup(events = []) {
    const locks = lockManager(events);
    const storage = memory(initialRecord(), locks, events);
    const components = setup({ locks, storage });
    await components.bridge.activatePlanned(activationOptions());
    const started = await components.bridge.startReady(startOptions());
    return { ...components, started };
}

test('persists every supported session action without changing execution identities or revisions', async () => {
    const events = [];
    const { storage, activeLock, bridge, started } = await startedBridgeSetup(events);
    const originalExecution = structuredClone(started.executions[0].execution);
    const activeRequests = () => events.filter(event => event[0] === 'request'
        && event[1] === 'easyTimerEditor.v1.active-runtime').length;

    const pause = await bridge.applySessionAction(sessionActionOptions(started, 'PAUSE', 12_000));
    assert.equal(pause.activeRuntime.clock.status, 'PAUSED');
    assert.equal(pause.activeRuntime.clock.remainingMs, 50_000);
    const resume = await bridge.applySessionAction(sessionActionOptions(pause, 'RESUME', 20_000));
    assert.equal(resume.activeRuntime.clock.status, 'RUNNING');
    assert.equal(resume.activeRuntime.clock.deadlineMs, 70_000);
    const next = await bridge.applySessionAction(sessionActionOptions(resume, 'NEXT', 30_000));
    assert.equal(next.activeRuntime.run.currentIndex, 1);
    assert.equal(next.activeRuntime.clock.status, 'READY');
    const laterStart = await bridge.applySessionAction(sessionActionOptions(next, 'START', 31_000));
    assert.equal(laterStart.activeRuntime.clock.status, 'RUNNING');
    assert.equal(laterStart.activeRuntime.clock.deadlineMs, 151_000);
    const complete = await bridge.applySessionAction(sessionActionOptions(laterStart, 'COMPLETE', 40_000));
    assert.equal(complete.activeRuntime.run.stage, 'COMPLETED');
    assert.equal(complete.activeRuntime.clock.status, 'FINISHED');
    assert.equal(complete.executions[0].execution.lifecycle, 'active');
    const stopped = await bridge.applySessionAction(sessionActionOptions(complete, 'STOP_OVERTIME', 45_000));
    assert.equal(stopped.activeRuntime.clock.status, 'OVERTIME_STOPPED');
    assert.equal(stopped.activeRuntime.clock.overtimeMs, 5000);
    assert.equal(stopped.executions[0].execution.lifecycle, 'active');

    for (const [index, result] of [pause, resume, next, laterStart, complete, stopped].entries()) {
        const execution = result.executions[0].execution;
        assert.equal(result.revision, started.revision + index + 1);
        assert.equal(execution.id, originalExecution.id);
        assert.equal(execution.revision, originalExecution.revision);
        assert.equal(execution.runtimeRevision, originalExecution.runtimeRevision);
        assert.deepEqual(execution.attempt, originalExecution.attempt);
        assert.deepEqual(execution.currentPlan, originalExecution.currentPlan);
        assert.deepEqual(execution.workshopNotes, originalExecution.workshopNotes);
        assert.equal(result.activeRuntime.run.runId, originalExecution.attempt.runtimeRunId);
    }
    assert.equal(activeRequests(), 1);
    assert.equal(storage.state.writes, 8);
    assert.equal(activeLock.held, true);
    await activeLock.release();
});

test('rejects session actions without ownership, with stale time or unsupported and no-op actions', async () => {
    const { storage, activeLock, bridge, started } = await startedBridgeSetup();
    await activeLock.release();
    const writes = storage.state.writes;
    await assert.rejects(
        bridge.applySessionAction(sessionActionOptions(started, 'PAUSE', 12_000)),
        /activeLockRequired/,
    );
    assert.equal(storage.state.writes, writes);

    await activeLock.claim();
    await assert.rejects(bridge.applySessionAction(sessionActionOptions(started, 'PAUSE', 12_000, {
        expectedAggregateRevision: started.revision - 1,
    })), /conflict/);
    await assert.rejects(
        bridge.applySessionAction(sessionActionOptions(started, 'PAUSE', 1000)),
        /CLOCK_ANOMALY/,
    );
    for (const actionType of ['TICK', 'PRIMARY', 'STOP_WORKSHOP', 'UNKNOWN', 'START', 'RESUME']) {
        await assert.rejects(
            bridge.applySessionAction(sessionActionOptions(started, actionType, 3000)),
            /invalidSessionAction/,
        );
    }
    assert.equal(storage.state.writes, writes);
    assert.equal(activeLock.held, true);
    await activeLock.release();
});

async function pendingSessionActionSetup(failureMode) {
    const components = await startedBridgeSetup();
    components.storage.state.faultAfterWrites = components.storage.state.writes;
    if (failureMode === 'unconfirmed') components.storage.state.failReadAfterWrite = true;
    else components.storage.state.readback = null;
    await assert.rejects(
        components.bridge.applySessionAction(
            sessionActionOptions(components.started, 'PAUSE', 12_000),
        ),
        failureMode === 'unconfirmed' ? /storageUnconfirmed/ : /storageReadback/,
    );
    components.storage.state.failReadAfterWrite = false;
    components.storage.state.readback = undefined;
    return components;
}

test('reconciles an unconfirmed session action as target without another write', async () => {
    const { storage, activeLock, bridge } = await pendingSessionActionSetup('unconfirmed');
    const writes = storage.state.writes;
    const result = await bridge.reconcilePendingOperation();

    assert.equal(result.kind, 'sessionAction');
    assert.equal(result.outcome, 'target');
    assert.equal(result.record.activeRuntime.clock.status, 'PAUSED');
    assert.equal(storage.state.writes, writes);
    assert.equal(activeLock.held, true);
    await activeLock.release();
});

test('reconciles an unconfirmed session action as source without retrying it', async () => {
    const { storage, activeLock, bridge, started } = await pendingSessionActionSetup('readback');
    storage.values.set(EDITOR_STORAGE_KEY, JSON.stringify(started));
    const writes = storage.state.writes;
    const result = await bridge.reconcilePendingOperation();

    assert.equal(result.kind, 'sessionAction');
    assert.equal(result.outcome, 'source');
    assert.deepEqual(result.record, started);
    assert.equal(storage.state.writes, writes);
    assert.equal(activeLock.held, true);
    await activeLock.release();
});

test('keeps a conflicting session action pending and blocks every mutation', async () => {
    const { storage, activeLock, bridge, started } = await pendingSessionActionSetup('readback');
    const third = JSON.parse(storage.values.get(EDITOR_STORAGE_KEY));
    third.templates[0].plan.name = 'Concurrent valid change';
    storage.values.set(EDITOR_STORAGE_KEY, JSON.stringify(third));
    const writes = storage.state.writes;
    const result = await bridge.reconcilePendingOperation();

    assert.equal(result.kind, 'sessionAction');
    assert.equal(result.outcome, 'conflict');
    await assert.rejects(
        bridge.applySessionAction(sessionActionOptions(started, 'PAUSE', 12_000)),
        /pendingOperation/,
    );
    await assert.rejects(bridge.startReady(startOptions()), /pendingOperation/);
    await assert.rejects(bridge.activatePlanned(activationOptions()), /pendingActivation/);
    assert.equal(storage.state.writes, writes);
    assert.equal(activeLock.held, true);
    await activeLock.release();
});

test('retains a pending session action and ownership after a failed reconciliation read', async () => {
    const { storage, activeLock, bridge } = await pendingSessionActionSetup('unconfirmed');
    storage.state.failRead = true;

    await assert.rejects(bridge.reconcilePendingOperation(), /storageRead/);
    assert.equal(activeLock.held, true);
    storage.state.failRead = false;
    assert.equal((await bridge.reconcilePendingOperation()).outcome, 'target');
    await activeLock.release();
});

test('blocks overlapping session actions while the first writer is pending', async () => {
    const { locks, storage, activeLock, bridge, started } = await startedBridgeSetup();
    locks.storeGate = deferred();

    const first = bridge.applySessionAction(sessionActionOptions(started, 'PAUSE', 12_000));
    await new Promise(resolve => setImmediate(resolve));
    await assert.rejects(
        bridge.applySessionAction(sessionActionOptions(started, 'PAUSE', 12_000)),
        /bridgeBusy/,
    );
    assert.equal(storage.state.writes, 2);
    locks.storeGate.resolve();
    assert.equal((await first).activeRuntime.clock.status, 'PAUSED');
    assert.equal(storage.state.writes, 3);
    assert.equal(activeLock.held, true);
    await activeLock.release();
});

test('rejects an in-flight session action when ownership is lost before the write begins', async () => {
    const { locks, storage, activeLock, bridge, started } = await startedBridgeSetup();
    locks.storeGate = deferred();

    const operation = bridge.applySessionAction(sessionActionOptions(started, 'PAUSE', 12_000));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(await activeLock.release(), true);
    assert.equal(activeLock.held, false);
    assert.equal(storage.state.writes, 2);

    locks.storeGate.resolve();
    await assert.rejects(operation, /activeLockRequired/);
    assert.equal(storage.state.writes, 2);
    assert.equal(activeLock.held, false);
    assert.equal(JSON.parse(storage.values.get(EDITOR_STORAGE_KEY)).activeRuntime.clock.status, 'RUNNING');
    await assert.rejects(bridge.reconcilePendingOperation(), /noPendingOperation/);
});

test('rejects an in-flight first START when ownership is lost before the write begins', async () => {
    const locks = lockManager();
    const storage = memory(initialRecord(), locks);
    const { activeLock, bridge } = setup({ locks, storage });
    await bridge.activatePlanned(activationOptions());
    locks.storeGate = deferred();

    const operation = bridge.startReady(startOptions());
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(await activeLock.release(), true);
    assert.equal(storage.state.writes, 1);

    locks.storeGate.resolve();
    await assert.rejects(operation, /activeLockRequired/);
    assert.equal(storage.state.writes, 1);
    const persisted = JSON.parse(storage.values.get(EDITOR_STORAGE_KEY));
    assert.equal(persisted.executions[0].execution.attempt, null);
    assert.equal(persisted.activeRuntime.clock.status, 'READY');
    await assert.rejects(bridge.reconcilePendingOperation(), /noPendingOperation/);
});

test('rejects activation when claimed ownership is lost before its write begins', async () => {
    const events = [];
    const locks = lockManager(events);
    const storage = memory(initialRecord(), locks, events);
    const { activeLock, bridge } = setup({ locks, storage });
    locks.storeGate = deferred();

    const operation = bridge.activatePlanned(activationOptions());
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(activeLock.held, true);
    assert.equal(await activeLock.release(), true);
    assert.equal(storage.state.writes, 0);

    locks.storeGate.resolve();
    await assert.rejects(operation, /activeLockRequired/);
    assert.equal(storage.state.writes, 0);
    assert.deepEqual(JSON.parse(storage.values.get(EDITOR_STORAGE_KEY)), initialRecord());
    assert.equal(events.filter(event => event[0] === 'request'
        && event[1] === 'easyTimerEditor.v1.active-runtime').length, 1);
    await assert.rejects(bridge.reconcilePendingOperation(), /noPendingOperation/);
});

test('suspends ACTIVE READY with complete notes and retains ownership until explicit release', async () => {
    const events = [];
    const locks = lockManager(events);
    const storage = memory(initialRecord(), locks, events);
    const { writer, activeLock, bridge } = setup({ locks, storage });
    const ready = await bridge.activatePlanned(activationOptions());
    const before = structuredClone(ready);
    const notes = completeWorkshopNotes();

    const result = await bridge.suspendActive(suspendOptions(ready, 2000, notes));

    assert.deepEqual(ready, before);
    assert.equal(result.revision, ready.revision + 1);
    assert.equal(result.executions[0].execution.lifecycle, 'suspended');
    assert.equal(result.executions[0].execution.revision, ready.executions[0].execution.revision + 1);
    assert.equal(result.executions[0].execution.runtimeRevision,
        ready.executions[0].execution.runtimeRevision + 1);
    assert.equal(result.executions[0].execution.attempt, null);
    assert.equal(result.executions[0].suspendedCheckpoint, null);
    assert.equal(result.activeRuntime, null);
    assert.deepEqual(result.executions[0].execution.workshopNotes, notes);
    assert.equal(result.executions[0].execution.workshopNotes.phases[1].text, 'Discussion notes');
    assert.deepEqual(result.executions[0].execution.currentPlan, before.executions[0].execution.currentPlan);
    assert.equal(events.filter(event => event[0] === 'request'
        && event[1] === 'easyTimerEditor.v1.active-runtime').length, 1);
    assert.equal(activeLock.held, true);
    assert.deepEqual(await writer.read(), result);
    assert.equal(activeLock.held, true);

    notes.rundown = 'Changed input';
    result.executions[0].execution.workshopNotes.phases[0].text = 'Changed result';
    const persisted = await writer.read();
    assert.equal(persisted.executions[0].execution.workshopNotes.rundown, 'Complete rundown notes');
    assert.equal(persisted.executions[0].execution.workshopNotes.phases[0].text, 'Opening notes');
    assert.equal(await activeLock.release(), true);
    assert.equal(locks.held.size, 0);
});

test('suspends ACTIVE STARTED with one bound frozen checkpoint and unchanged attempt baseline', async () => {
    const events = [];
    const { writer, activeLock, bridge, started } = await startedBridgeSetup(events);
    const paused = await bridge.applySessionAction(sessionActionOptions(started, 'PAUSE', 12_000));
    const before = structuredClone(paused);
    const notes = completeWorkshopNotes();

    const result = await bridge.suspendActive(suspendOptions(paused, 13_000, notes));
    const execution = result.executions[0].execution;
    const checkpoint = result.executions[0].suspendedCheckpoint;

    assert.deepEqual(paused, before);
    assert.equal(result.revision, paused.revision + 1);
    assert.equal(execution.lifecycle, 'suspended');
    assert.equal(execution.revision, paused.executions[0].execution.revision + 1);
    assert.equal(execution.runtimeRevision, paused.executions[0].execution.runtimeRevision + 1);
    assert.deepEqual(execution.attempt, before.executions[0].execution.attempt);
    assert.deepEqual(execution.attempt.startSnapshot, before.executions[0].execution.attempt.startSnapshot);
    assert.deepEqual(execution.currentPlan, before.executions[0].execution.currentPlan);
    assert.deepEqual(execution.workshopNotes, notes);
    assert.equal(result.activeRuntime, null);
    assert.equal(checkpoint.executionId, execution.id);
    assert.equal(checkpoint.attemptId, execution.attempt.id);
    assert.equal(checkpoint.runtimeRevision, execution.runtimeRevision);
    assert.equal(checkpoint.run.runId, execution.attempt.runtimeRunId);
    assert.equal(checkpoint.clock.status, 'PAUSED');
    assert.equal(checkpoint.capturedAt, 13_000);
    assert.equal(events.filter(event => event[0] === 'request'
        && event[1] === 'easyTimerEditor.v1.active-runtime').length, 1);
    assert.equal(activeLock.held, true);
    assert.deepEqual(await writer.read(), result);
    assert.equal(await activeLock.release(), true);
});

test('suspends a runtime-completed session without completing the execution lifecycle', async () => {
    const { activeLock, bridge, started } = await startedBridgeSetup();
    const next = await bridge.applySessionAction(sessionActionOptions(started, 'NEXT', 10_000));
    const second = await bridge.applySessionAction(sessionActionOptions(next, 'START', 11_000));
    const completed = await bridge.applySessionAction(sessionActionOptions(second, 'COMPLETE', 20_000));

    const result = await bridge.suspendActive(suspendOptions(completed, 21_000));

    assert.equal(result.executions[0].execution.lifecycle, 'suspended');
    assert.equal(result.executions[0].suspendedCheckpoint.run.stage, 'COMPLETED');
    assert.equal(result.executions[0].suspendedCheckpoint.clock.status, 'OVERTIME_PAUSED');
    assert.equal(result.activeRuntime, null);
    assert.equal(activeLock.held, true);
    await activeLock.release();
});

test('rejects invalid suspend requests without a write or automatic ownership release', async () => {
    const { storage, activeLock, bridge, started } = await startedBridgeSetup();
    const writes = storage.state.writes;
    const duplicateNotes = completeWorkshopNotes();
    duplicateNotes.phases[1].phaseId = 'phase-1';

    await assert.rejects(bridge.suspendActive(suspendOptions(started, 3000, completeWorkshopNotes(), {
        expectedAggregateRevision: started.revision - 1,
    })), /conflict/);
    await assert.rejects(bridge.suspendActive(suspendOptions(started, 1000)), /CLOCK_ANOMALY/);
    await assert.rejects(bridge.suspendActive(suspendOptions(started, 3000, duplicateNotes)), /invalidNotes/);
    const unknownNotes = completeWorkshopNotes();
    unknownNotes.phases[1].phaseId = 'unknown-phase';
    await assert.rejects(bridge.suspendActive(suspendOptions(started, 3000, unknownNotes)), /invalidNotes/);
    assert.equal(storage.state.writes, writes);
    assert.equal(activeLock.held, true);

    await activeLock.release();
    await assert.rejects(bridge.suspendActive(suspendOptions(started, 3000)), /activeLockRequired/);
    assert.equal(storage.state.writes, writes);
});

test('does not report or release ownership after a quota-failed suspend', async () => {
    const { locks, storage, activeLock, bridge, started } = await startedBridgeSetup();
    const writes = storage.state.writes;
    storage.state.failWrite = 'QuotaExceededError';

    await assert.rejects(bridge.suspendActive(suspendOptions(started, 3000)), /storageQuota/);
    assert.equal(storage.state.writes, writes);
    assert.equal(activeLock.held, true);
    await activeLock.release();
    assert.equal(locks.held.size, 0);
});

async function pendingSuspendSetup(failureMode) {
    const components = await startedBridgeSetup();
    components.storage.state.faultAfterWrites = components.storage.state.writes;
    if (failureMode === 'unconfirmed') components.storage.state.failReadAfterWrite = true;
    else components.storage.state.readback = null;
    await assert.rejects(
        components.bridge.suspendActive(suspendOptions(components.started, 3000)),
        failureMode === 'unconfirmed' ? /storageUnconfirmed/ : /storageReadback/,
    );
    components.storage.state.failReadAfterWrite = false;
    components.storage.state.readback = undefined;
    return components;
}

test('reconciles an unconfirmed suspend as target without releasing ownership', async () => {
    const { storage, activeLock, bridge } = await pendingSuspendSetup('unconfirmed');
    const writes = storage.state.writes;
    const result = await bridge.reconcilePendingOperation();

    assert.equal(result.kind, 'suspend');
    assert.equal(result.outcome, 'target');
    assert.equal(result.record.executions[0].execution.lifecycle, 'suspended');
    assert.equal(result.record.activeRuntime, null);
    assert.equal(storage.state.writes, writes);
    assert.equal(activeLock.held, true);
    await activeLock.release();
});

test('reconciles an unconfirmed suspend as source without retrying or releasing', async () => {
    const { storage, activeLock, bridge, started } = await pendingSuspendSetup('readback');
    storage.values.set(EDITOR_STORAGE_KEY, JSON.stringify(started));
    const writes = storage.state.writes;
    const result = await bridge.reconcilePendingOperation();

    assert.equal(result.kind, 'suspend');
    assert.equal(result.outcome, 'source');
    assert.deepEqual(result.record, started);
    assert.equal(storage.state.writes, writes);
    assert.equal(activeLock.held, true);
    await activeLock.release();
});

test('keeps a conflicting suspend pending and blocks further mutations', async () => {
    const { storage, activeLock, bridge, started } = await pendingSuspendSetup('readback');
    const third = JSON.parse(storage.values.get(EDITOR_STORAGE_KEY));
    third.templates[0].plan.name = 'Concurrent valid change';
    storage.values.set(EDITOR_STORAGE_KEY, JSON.stringify(third));
    const writes = storage.state.writes;
    const result = await bridge.reconcilePendingOperation();

    assert.equal(result.kind, 'suspend');
    assert.equal(result.outcome, 'conflict');
    await assert.rejects(bridge.suspendActive(suspendOptions(started, 3000)), /pendingOperation/);
    await assert.rejects(
        bridge.applySessionAction(sessionActionOptions(started, 'PAUSE', 3000)),
        /pendingOperation/,
    );
    assert.equal(storage.state.writes, writes);
    assert.equal(activeLock.held, true);
    await activeLock.release();
});

test('retains a pending suspend and ownership after a failed reconciliation read', async () => {
    const { storage, activeLock, bridge } = await pendingSuspendSetup('unconfirmed');
    storage.state.failRead = true;

    await assert.rejects(bridge.reconcilePendingOperation(), /storageRead/);
    assert.equal(activeLock.held, true);
    storage.state.failRead = false;
    assert.equal((await bridge.reconcilePendingOperation()).outcome, 'target');
    await activeLock.release();
});

test('blocks overlapping suspend operations while the first writer is pending', async () => {
    const { locks, storage, activeLock, bridge, started } = await startedBridgeSetup();
    locks.storeGate = deferred();
    const operation = bridge.suspendActive(suspendOptions(started, 3000));
    await new Promise(resolve => setImmediate(resolve));

    await assert.rejects(bridge.suspendActive(suspendOptions(started, 3000)), /bridgeBusy/);
    assert.equal(storage.state.writes, 2);
    locks.storeGate.resolve();
    assert.equal((await operation).executions[0].execution.lifecycle, 'suspended');
    assert.equal(storage.state.writes, 3);
    assert.equal(activeLock.held, true);
    await activeLock.release();
});

test('rejects suspend when ownership is lost while waiting for the writer', async () => {
    const { locks, storage, activeLock, bridge, started } = await startedBridgeSetup();
    locks.storeGate = deferred();
    const operation = bridge.suspendActive(suspendOptions(started, 3000));
    await new Promise(resolve => setImmediate(resolve));

    assert.equal(await activeLock.release(), true);
    const writes = storage.state.writes;
    locks.storeGate.resolve();
    await assert.rejects(operation, /activeLockRequired/);
    assert.equal(storage.state.writes, writes);
    assert.equal(JSON.parse(storage.values.get(EDITOR_STORAGE_KEY))
        .executions[0].execution.lifecycle, 'active');
    await assert.rejects(bridge.reconcilePendingOperation(), /noPendingOperation/);
});

async function suspendedReadyBridgeSetup(events = []) {
    const locks = lockManager(events);
    const storage = memory(initialRecord(), locks, events);
    const components = setup({ locks, storage });
    const ready = await components.bridge.activatePlanned(activationOptions());
    const suspended = await components.bridge.suspendActive(suspendOptions(ready, 2000));
    assert.deepEqual(await components.writer.read(), suspended);
    assert.equal(await components.activeLock.release(), true);
    return { ...components, ready, suspended };
}

async function suspendedStartedBridgeSetup(events = []) {
    const components = await startedBridgeSetup(events);
    const paused = await components.bridge.applySessionAction(
        sessionActionOptions(components.started, 'PAUSE', 12_000),
    );
    const suspended = await components.bridge.suspendActive(suspendOptions(paused, 13_000));
    assert.deepEqual(await components.writer.read(), suspended);
    assert.equal(await components.activeLock.release(), true);
    return { ...components, paused, suspended };
}

test('resumes SUSPENDED READY with a new explicit READY runtime under reacquired ownership', async () => {
    const events = [];
    const { writer, storage, activeLock, bridge, suspended } = await suspendedReadyBridgeSetup(events);
    const before = structuredClone(suspended);

    const result = await bridge.resumeSuspended(resumeOptions(suspended, 100_000));

    assert.deepEqual(suspended, before);
    assert.equal(result.revision, suspended.revision + 1);
    assert.equal(result.executions[0].execution.lifecycle, 'active');
    assert.equal(result.executions[0].execution.attempt, null);
    assert.equal(result.executions[0].suspendedCheckpoint, null);
    assert.equal(result.activeRuntime.attemptId, null);
    assert.equal(result.activeRuntime.run.runId, 'runtime-resumed-1');
    assert.equal(result.activeRuntime.clock.status, 'READY');
    assert.equal(result.activeRuntime.savedAt, 100_000);
    assert.deepEqual(result.executions[0].execution.workshopNotes,
        suspended.executions[0].execution.workshopNotes);
    assert.deepEqual(result.executions[0].execution.currentPlan,
        suspended.executions[0].execution.currentPlan);
    assert.equal(events.filter(event => event[0] === 'request'
        && event[1] === 'easyTimerEditor.v1.active-runtime').length, 2);
    assert.equal(activeLock.held, true);
    assert.deepEqual(await writer.read(), result);
    result.executions[0].execution.workshopNotes.rundown = 'Changed result';
    assert.equal(JSON.parse(storage.values.get(EDITOR_STORAGE_KEY))
        .executions[0].execution.workshopNotes.rundown, 'Complete rundown notes');
    await activeLock.release();
});

test('resumes SUSPENDED STARTED without advancing its frozen clock and only runs after explicit RESUME', async () => {
    const events = [];
    const { writer, activeLock, bridge, paused, suspended } = await suspendedStartedBridgeSetup(events);
    const checkpoint = structuredClone(suspended.executions[0].suspendedCheckpoint);
    const originalExecution = structuredClone(suspended.executions[0].execution);

    const result = await bridge.resumeSuspended(resumeOptions(suspended, 1_000_000));

    const execution = result.executions[0].execution;
    assert.equal(result.revision, suspended.revision + 1);
    assert.equal(execution.lifecycle, 'active');
    assert.equal(execution.revision, originalExecution.revision + 1);
    assert.equal(execution.runtimeRevision, originalExecution.runtimeRevision + 1);
    assert.deepEqual(execution.attempt, originalExecution.attempt);
    assert.deepEqual(execution.attempt.startSnapshot, originalExecution.attempt.startSnapshot);
    assert.deepEqual(execution.currentPlan, originalExecution.currentPlan);
    assert.deepEqual(execution.workshopNotes, originalExecution.workshopNotes);
    assert.equal(result.executions[0].suspendedCheckpoint, null);
    assert.equal(result.activeRuntime.runtimeRevision, execution.runtimeRevision);
    assert.equal(result.activeRuntime.run.runId, execution.attempt.runtimeRunId);
    assert.deepEqual(result.activeRuntime.run, checkpoint.run);
    assert.deepEqual(result.activeRuntime.clock, checkpoint.clock);
    assert.equal(result.activeRuntime.clock.remainingMs, paused.activeRuntime.clock.remainingMs);
    assert.equal(result.activeRuntime.savedAt, 1_000_000);
    assert.equal(events.filter(event => event[0] === 'request'
        && event[1] === 'easyTimerEditor.v1.active-runtime').length, 2);
    assert.equal(activeLock.held, true);
    assert.deepEqual(await writer.read(), result);

    const running = await bridge.applySessionAction(
        sessionActionOptions(result, 'RESUME', 1_000_001),
    );
    assert.equal(running.activeRuntime.clock.status, 'RUNNING');
    assert.equal(running.activeRuntime.clock.deadlineMs,
        1_000_001 + checkpoint.clock.remainingMs);
    assert.equal(activeLock.held, true);
    await activeLock.release();
});

test('resumes a started between-phase READY checkpoint without starting its clock', async () => {
    const components = await startedBridgeSetup();
    const between = await components.bridge.applySessionAction(
        sessionActionOptions(components.started, 'NEXT', 10_000),
    );
    const suspended = await components.bridge.suspendActive(suspendOptions(between, 11_000));
    const checkpoint = structuredClone(suspended.executions[0].suspendedCheckpoint);
    await components.activeLock.release();

    const result = await components.bridge.resumeSuspended(resumeOptions(suspended, 100_000));

    assert.equal(result.activeRuntime.clock.status, 'READY');
    assert.deepEqual(result.activeRuntime.clock, checkpoint.clock);
    assert.equal(result.activeRuntime.run.currentIndex, 1);
    assert.equal(result.executions[0].execution.attempt.id,
        components.started.executions[0].execution.attempt.id);
    await components.activeLock.release();
});

test('resumes completed overtime-paused and overtime-stopped checkpoints unchanged', async () => {
    for (const stopped of [false, true]) {
        const components = await startedBridgeSetup();
        const next = await components.bridge.applySessionAction(
            sessionActionOptions(components.started, 'NEXT', 10_000),
        );
        const second = await components.bridge.applySessionAction(sessionActionOptions(next, 'START', 11_000));
        const completed = await components.bridge.applySessionAction(
            sessionActionOptions(second, 'COMPLETE', 20_000),
        );
        const source = stopped
            ? await components.bridge.applySessionAction(
                sessionActionOptions(completed, 'STOP_OVERTIME', 25_000),
            )
            : completed;
        const suspended = await components.bridge.suspendActive(suspendOptions(source, 30_000));
        const checkpoint = structuredClone(suspended.executions[0].suspendedCheckpoint);
        await components.activeLock.release();

        const result = await components.bridge.resumeSuspended(resumeOptions(suspended, 1_000_000));
        assert.equal(result.activeRuntime.run.stage, 'COMPLETED');
        assert.equal(result.executions[0].execution.lifecycle, 'active');
        assert.equal(result.activeRuntime.clock.status, stopped ? 'OVERTIME_STOPPED' : 'OVERTIME_PAUSED');
        assert.deepEqual(result.activeRuntime.clock, checkpoint.clock);
        await components.activeLock.release();
    }
});

test('failed resume claims never access the store', async () => {
    const { locks, storage, suspended } = await suspendedReadyBridgeSetup();
    const owner = createEditorActiveTimerLock({ locks });
    await owner.claim();
    let storageRequests = 0;
    const busyBridge = createEditorRuntimeBridge({
        activeLock: createEditorActiveTimerLock({ locks }),
        writer: createEditorStoreWriter({
            getStorage: () => { storageRequests += 1; return storage; },
            locks,
        }),
    });
    await assert.rejects(busyBridge.resumeSuspended(resumeOptions(suspended, 100_000)), /lockBusy/);
    assert.equal(storageRequests, 0);
    await owner.release();

    const unavailable = createEditorRuntimeBridge({
        activeLock: createEditorActiveTimerLock({ locks: null }),
        writer: createEditorStoreWriter({
            getStorage: () => { storageRequests += 1; return storage; },
            locks,
        }),
    });
    await assert.rejects(unavailable.resumeSuspended(resumeOptions(suspended, 100_000)), /lockUnavailable/);
    assert.equal(storageRequests, 0);
});

test('rejects invalid resume requests without a write or automatic ownership release', async () => {
    const { storage, activeLock, bridge, suspended } = await suspendedStartedBridgeSetup();
    const writes = storage.state.writes;

    await assert.rejects(bridge.resumeSuspended(resumeOptions(suspended, 100_000, {
        expectedAggregateRevision: suspended.revision - 1,
    })), /conflict/);
    assert.equal(activeLock.held, true);
    assert.equal(storage.state.writes, writes);
    await activeLock.release();

    for (const changes of [
        { expectedAttemptId: 'foreign-attempt' },
        { expectedRunId: 'foreign-run' },
        { runtimeRunId: 'forbidden-new-run' },
        { resumedAt: 12_999 },
    ]) {
        await assert.rejects(bridge.resumeSuspended(resumeOptions(suspended, 100_000, changes)));
        assert.equal(storage.state.writes, writes);
        assert.equal(activeLock.held, true);
        await activeLock.release();
    }
});

test('does not report or release ownership after a quota-failed resume', async () => {
    const { locks, storage, activeLock, bridge, suspended } = await suspendedReadyBridgeSetup();
    const writes = storage.state.writes;
    storage.state.failWrite = 'QuotaExceededError';

    await assert.rejects(bridge.resumeSuspended(resumeOptions(suspended, 100_000)), /storageQuota/);
    assert.equal(storage.state.writes, writes);
    assert.equal(activeLock.held, true);
    await activeLock.release();
    assert.equal(locks.held.size, 0);
});

async function pendingResumeSetup(failureMode) {
    const components = await suspendedStartedBridgeSetup();
    components.storage.state.faultAfterWrites = components.storage.state.writes;
    if (failureMode === 'unconfirmed') components.storage.state.failReadAfterWrite = true;
    else components.storage.state.readback = null;
    await assert.rejects(
        components.bridge.resumeSuspended(resumeOptions(components.suspended, 100_000)),
        failureMode === 'unconfirmed' ? /storageUnconfirmed/ : /storageReadback/,
    );
    components.storage.state.failReadAfterWrite = false;
    components.storage.state.readback = undefined;
    return components;
}

test('reconciles an unconfirmed resume as target without another write or release', async () => {
    const { storage, activeLock, bridge } = await pendingResumeSetup('unconfirmed');
    const writes = storage.state.writes;
    const result = await bridge.reconcilePendingOperation();

    assert.equal(result.kind, 'resume');
    assert.equal(result.outcome, 'target');
    assert.equal(result.record.executions[0].execution.lifecycle, 'active');
    assert.notEqual(result.record.activeRuntime, null);
    assert.equal(storage.state.writes, writes);
    assert.equal(activeLock.held, true);
    await activeLock.release();
});

test('reconciles an unconfirmed resume as source without retrying or releasing', async () => {
    const { storage, activeLock, bridge, suspended } = await pendingResumeSetup('readback');
    storage.values.set(EDITOR_STORAGE_KEY, JSON.stringify(suspended));
    const writes = storage.state.writes;
    const result = await bridge.reconcilePendingOperation();

    assert.equal(result.kind, 'resume');
    assert.equal(result.outcome, 'source');
    assert.deepEqual(result.record, suspended);
    assert.equal(storage.state.writes, writes);
    assert.equal(activeLock.held, true);
    await activeLock.release();
});

test('keeps a conflicting resume pending and blocks further mutations', async () => {
    const { storage, activeLock, bridge, suspended } = await pendingResumeSetup('readback');
    const third = JSON.parse(storage.values.get(EDITOR_STORAGE_KEY));
    third.templates[0].plan.name = 'Concurrent valid change';
    storage.values.set(EDITOR_STORAGE_KEY, JSON.stringify(third));
    const writes = storage.state.writes;
    const result = await bridge.reconcilePendingOperation();

    assert.equal(result.kind, 'resume');
    assert.equal(result.outcome, 'conflict');
    await assert.rejects(bridge.resumeSuspended(resumeOptions(suspended, 100_000)), /pendingOperation/);
    await assert.rejects(bridge.activatePlanned(activationOptions()), /pendingActivation/);
    assert.equal(storage.state.writes, writes);
    assert.equal(activeLock.held, true);
    await activeLock.release();
});

test('retains a pending resume and ownership after a failed reconciliation read', async () => {
    const { storage, activeLock, bridge } = await pendingResumeSetup('unconfirmed');
    storage.state.failRead = true;

    await assert.rejects(bridge.reconcilePendingOperation(), /storageRead/);
    assert.equal(activeLock.held, true);
    storage.state.failRead = false;
    assert.equal((await bridge.reconcilePendingOperation()).outcome, 'target');
    await activeLock.release();
});

test('blocks overlapping resume operations while the first writer is pending', async () => {
    const { locks, storage, activeLock, bridge, suspended } = await suspendedReadyBridgeSetup();
    locks.storeGate = deferred();
    const operation = bridge.resumeSuspended(resumeOptions(suspended, 100_000));
    await new Promise(resolve => setImmediate(resolve));

    await assert.rejects(bridge.resumeSuspended(resumeOptions(suspended, 100_000)), /bridgeBusy/);
    assert.equal(storage.state.writes, 2);
    locks.storeGate.resolve();
    assert.equal((await operation).executions[0].execution.lifecycle, 'active');
    assert.equal(storage.state.writes, 3);
    assert.equal(activeLock.held, true);
    await activeLock.release();
});

test('rejects resume when newly claimed ownership is lost while waiting for the writer', async () => {
    const { locks, storage, activeLock, bridge, suspended } = await suspendedReadyBridgeSetup();
    locks.storeGate = deferred();
    const operation = bridge.resumeSuspended(resumeOptions(suspended, 100_000));
    await new Promise(resolve => setImmediate(resolve));

    assert.equal(activeLock.held, true);
    assert.equal(await activeLock.release(), true);
    const writes = storage.state.writes;
    locks.storeGate.resolve();
    await assert.rejects(operation, /activeLockRequired/);
    assert.equal(storage.state.writes, writes);
    assert.equal(JSON.parse(storage.values.get(EDITOR_STORAGE_KEY))
        .executions[0].execution.lifecycle, 'suspended');
    await assert.rejects(bridge.reconcilePendingOperation(), /noPendingOperation/);
});

async function persistedActiveSetup({ started = false, transitionMode = 'manual' } = {}) {
    const locks = lockManager();
    const source = initialRecord();
    source.templates[0].plan.transitionMode = transitionMode;
    source.executions[0].execution.currentPlan.transitionMode = transitionMode;
    const storage = memory(source, locks);
    const components = setup({ locks, storage });
    let record = await components.bridge.activatePlanned(activationOptions());
    if (started) record = await components.bridge.startReady(startOptions());
    await components.activeLock.release();
    return { ...components, record };
}

test('adoption reports no ACTIVE runtime without claiming ownership or writing', async () => {
    const events = [];
    const locks = lockManager(events);
    const storage = memory(initialRecord(), locks, events);
    const { activeLock, bridge } = setup({ locks, storage });

    const result = await bridge.adoptPersistedActive({ observedAt: 5000 });

    assert.equal(result.outcome, 'none');
    assert.equal(result.runtime, null);
    assert.equal(result.record.activeRuntime, null);
    assert.equal(activeLock.held, false);
    assert.equal(storage.state.writes, 0);
    assert.equal(events.some(event => event[0] === 'request'
        && event[1] === 'easyTimerEditor.v1.active-runtime'), false);
});

test('adopts ACTIVE READY after a claimed re-read and keeps its clock frozen and ownership held', async () => {
    const { locks, storage, record } = await persistedActiveSetup();
    const writes = storage.state.writes;
    const activeLock = createEditorActiveTimerLock({ locks });
    const reads = [];
    const writer = createEditorStoreWriter({
        getStorage: () => ({
            ...storage,
            getItem(key) { reads.push(new Set(locks.held)); return storage.getItem(key); },
        }),
        locks,
    });
    const bridge = createEditorRuntimeBridge({ writer, activeLock });

    const result = await bridge.adoptPersistedActive({ observedAt: 50_000 });

    assert.equal(result.outcome, 'adopted');
    assert.equal(reads.length, 2);
    assert.equal(reads[0].has('easyTimerEditor.v1.active-runtime'), false);
    assert.equal(reads[1].has('easyTimerEditor.v1.active-runtime'), true);
    assert.equal(result.runtime.clock.status, 'READY');
    assert.deepEqual(result.runtime.clock, record.activeRuntime.clock);
    assert.equal(result.runtime.persistedAt, record.activeRuntime.savedAt);
    assert.equal(result.runtime.observedAt, 50_000);
    assert.equal(storage.state.writes, writes);
    assert.equal(activeLock.held, true);
    result.record.activeRuntime.clock.remainingMs = 1;
    result.runtime.clock.remainingMs = 2;
    assert.notEqual(JSON.parse(storage.values.get(EDITOR_STORAGE_KEY)).activeRuntime.clock.remainingMs, 1);
    assert.notEqual(JSON.parse(storage.values.get(EDITOR_STORAGE_KEY)).activeRuntime.clock.remainingMs, 2);
    await activeLock.release();
});

test('adopts ACTIVE STARTED by reconciling running time and automatic phase catch-up without a write', async () => {
    const { locks, storage, record } = await persistedActiveSetup({ started: true, transitionMode: 'automatic' });
    const writes = storage.state.writes;
    const activeLock = createEditorActiveTimerLock({ locks });
    const writer = createEditorStoreWriter({ getStorage: () => storage, locks });
    const bridge = createEditorRuntimeBridge({ writer, activeLock });

    const running = await bridge.adoptPersistedActive({ observedAt: 32_000 });
    assert.equal(running.runtime.clock.status, 'RUNNING');
    assert.equal(running.runtime.clock.remainingMs, 30_000);
    assert.equal(running.runtime.run.currentIndex, 0);
    assert.equal(running.runtime.attemptId, record.executions[0].execution.attempt.id);
    assert.equal(running.runtime.run.runId, record.activeRuntime.run.runId);
    assert.equal(storage.state.writes, writes);
    await activeLock.release();

    const catchupLock = createEditorActiveTimerLock({ locks });
    const catchupBridge = createEditorRuntimeBridge({ writer, activeLock: catchupLock });
    const caughtUp = await catchupBridge.adoptPersistedActive({ observedAt: 72_000 });
    assert.equal(caughtUp.runtime.run.currentIndex, 1);
    assert.equal(caughtUp.runtime.clock.status, 'RUNNING');
    assert.equal(caughtUp.runtime.clock.remainingMs, 110_000);
    assert.equal(storage.state.writes, writes);
    await catchupLock.release();
});

test('adoption preserves paused and completed overtime-frozen clocks without automatic resume', async () => {
    for (const stopped of [null, false, true]) {
        const components = await persistedActiveSetup({ started: true });
        let current = components.record;
        const owner = createEditorActiveTimerLock({ locks: components.locks });
        await owner.claim();
        const ownerBridge = createEditorRuntimeBridge({ writer: components.writer, activeLock: owner });
        if (stopped === null) {
            current = await ownerBridge.applySessionAction(sessionActionOptions(current, 'PAUSE', 12_000));
        } else {
            current = await ownerBridge.applySessionAction(sessionActionOptions(current, 'NEXT', 10_000));
            current = await ownerBridge.applySessionAction(sessionActionOptions(current, 'START', 11_000));
            current = await ownerBridge.applySessionAction(sessionActionOptions(current, 'COMPLETE', 20_000));
            if (stopped) {
                current = await ownerBridge.applySessionAction(
                    sessionActionOptions(current, 'STOP_OVERTIME', 25_000),
                );
            } else {
                current = await ownerBridge.applySessionAction(sessionActionOptions(current, 'PAUSE', 25_000));
            }
        }
        await owner.release();
        const writes = components.storage.state.writes;
        const activeLock = createEditorActiveTimerLock({ locks: components.locks });
        const bridge = createEditorRuntimeBridge({ writer: components.writer, activeLock });

        const result = await bridge.adoptPersistedActive({ observedAt: 1_000_000 });
        const expected = stopped === null ? 'PAUSED' : stopped ? 'OVERTIME_STOPPED' : 'OVERTIME_PAUSED';
        assert.equal(result.runtime.clock.status, expected);
        assert.deepEqual(result.runtime.clock, current.activeRuntime.clock);
        if (stopped !== null) assert.equal(result.runtime.run.stage, 'COMPLETED');
        assert.equal(components.storage.state.writes, writes);
        await activeLock.release();
    }
});

test('adoption uses only the post-claim record and releases a new claim when ACTIVE disappears', async () => {
    const active = await persistedActiveSetup();
    const noActive = initialRecord();
    let reads = 0;
    const writer = {
        read() {
            reads += 1;
            return structuredClone(reads === 1 ? active.record : noActive);
        },
    };
    const activeLock = createEditorActiveTimerLock({ locks: active.locks });
    const bridge = createEditorRuntimeBridge({ writer, activeLock });

    const result = await bridge.adoptPersistedActive({ observedAt: 5000 });

    assert.equal(reads, 2);
    assert.equal(result.outcome, 'none');
    assert.deepEqual(result.record, noActive);
    assert.equal(activeLock.held, false);
    assert.equal(active.locks.held.size, 0);
});

test('adoption ignores a stale initial ACTIVE snapshot and returns only the changed post-claim runtime', async () => {
    const components = await persistedActiveSetup({ started: true });
    const changed = structuredClone(components.record);
    changed.activeRuntime.savedAt = 12_000;
    const paused = transitionSession(
        changed.activeRuntime.run,
        changed.activeRuntime.clock,
        { type: 'PAUSE' },
        12_000,
    );
    changed.activeRuntime.run = paused.run;
    changed.activeRuntime.clock = paused.clock;
    let reads = 0;
    const activeLock = createEditorActiveTimerLock({ locks: components.locks });
    const bridge = createEditorRuntimeBridge({
        activeLock,
        writer: { read: () => structuredClone(++reads === 1 ? components.record : changed) },
    });

    const result = await bridge.adoptPersistedActive({ observedAt: 50_000 });

    assert.equal(reads, 2);
    assert.equal(result.outcome, 'adopted');
    assert.equal(result.runtime.persistedAt, 12_000);
    assert.equal(result.runtime.clock.status, 'PAUSED');
    assert.deepEqual(result.record, changed);
    await activeLock.release();
});

test('adoption rejects competing ownership, unavailable locks and lock request failures without adoption', async () => {
    const components = await persistedActiveSetup();
    const owner = createEditorActiveTimerLock({ locks: components.locks });
    await owner.claim();
    const busy = createEditorRuntimeBridge({
        writer: components.writer,
        activeLock: createEditorActiveTimerLock({ locks: components.locks }),
    });
    await assert.rejects(busy.adoptPersistedActive({ observedAt: 5000 }), /lockBusy/);
    await owner.release();

    const unavailable = createEditorRuntimeBridge({
        writer: components.writer,
        activeLock: createEditorActiveTimerLock({ locks: null }),
    });
    await assert.rejects(unavailable.adoptPersistedActive({ observedAt: 5000 }), /lockUnavailable/);

    const failingLocks = lockManager();
    const originalRequest = failingLocks.request.bind(failingLocks);
    failingLocks.request = (name, options, callback) => (name === 'easyTimerEditor.v1.active-runtime'
        ? Promise.reject(new Error('failed request')) : originalRequest(name, options, callback));
    const failingStorage = memory(components.record, failingLocks);
    const failing = setup({ locks: failingLocks, storage: failingStorage });
    await assert.rejects(failing.bridge.adoptPersistedActive({ observedAt: 5000 }), /lockRequest/);
    assert.equal(failing.activeLock.held, false);
    assert.equal(failingLocks.held.size, 0);
});

test('adoption failures before or after claim never write or leak newly acquired ownership', async () => {
    const components = await persistedActiveSetup({ started: true });
    const writes = components.storage.state.writes;

    components.storage.state.failRead = true;
    const before = setup({ locks: components.locks, storage: components.storage });
    await assert.rejects(before.bridge.adoptPersistedActive({ observedAt: 5000 }), /storageRead/);
    assert.equal(before.activeLock.held, false);
    components.storage.state.failRead = false;

    let reads = 0;
    const afterLock = createEditorActiveTimerLock({ locks: components.locks });
    const after = createEditorRuntimeBridge({
        activeLock: afterLock,
        writer: {
            read() {
                reads += 1;
                if (reads === 2) throw new Error('storageRead');
                return structuredClone(components.record);
            },
        },
    });
    await assert.rejects(after.adoptPersistedActive({ observedAt: 5000 }), /storageRead/);
    assert.equal(afterLock.held, false);
    assert.equal(components.locks.held.size, 0);

    const anomalyLock = createEditorActiveTimerLock({ locks: components.locks });
    const anomaly = createEditorRuntimeBridge({ writer: components.writer, activeLock: anomalyLock });
    await assert.rejects(anomaly.adoptPersistedActive({ observedAt: 1999 }), /CLOCK_ANOMALY/);
    assert.equal(anomalyLock.held, false);
    assert.equal(components.storage.state.writes, writes);
    for (const observedAt of [undefined, null, -1, 1.5, '5000']) {
        await assert.rejects(anomaly.adoptPersistedActive({ observedAt }), /INVALID_RUNTIME/);
    }
    for (const options of [null, [], 'invalid']) {
        await assert.rejects(anomaly.adoptPersistedActive(options), /INVALID_RUNTIME/);
    }
});

test('adoption rejects ownership lost during the second read and never releases pre-existing ownership', async () => {
    const components = await persistedActiveSetup();
    const activeLock = createEditorActiveTimerLock({ locks: components.locks });
    const gate = deferred();
    let reads = 0;
    const bridge = createEditorRuntimeBridge({
        activeLock,
        writer: {
            async read() {
                reads += 1;
                if (reads === 2) await gate.promise;
                return structuredClone(components.record);
            },
        },
    });
    const operation = bridge.adoptPersistedActive({ observedAt: 5000 });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(activeLock.held, true);
    await activeLock.release();
    gate.resolve();
    await assert.rejects(operation, /activeLockRequired/);
    assert.equal(activeLock.held, false);

    const preOwned = createEditorActiveTimerLock({ locks: components.locks });
    await preOwned.claim();
    const invalid = createEditorRuntimeBridge({
        activeLock: preOwned,
        writer: { read: () => { throw new Error('storageRead'); } },
    });
    await assert.rejects(invalid.adoptPersistedActive({ observedAt: 5000 }), /storageRead/);
    assert.equal(preOwned.held, true);
    await preOwned.release();
});

test('adoption blocks overlap and unresolved pending operations', async () => {
    const components = await persistedActiveSetup();
    const gate = deferred();
    let reads = 0;
    const bridge = createEditorRuntimeBridge({
        activeLock: createEditorActiveTimerLock({ locks: components.locks }),
        writer: {
            async read() { reads += 1; await gate.promise; return structuredClone(components.record); },
        },
    });
    const operation = bridge.adoptPersistedActive({ observedAt: 5000 });
    await new Promise(resolve => setImmediate(resolve));
    await assert.rejects(bridge.adoptPersistedActive({ observedAt: 5000 }), /bridgeBusy/);
    gate.resolve();
    const adopted = await operation;
    assert.equal(adopted.outcome, 'adopted');
    assert.equal(reads, 2);

    const pending = await pendingStartSetup('unconfirmed');
    await assert.rejects(pending.bridge.adoptPersistedActive({ observedAt: 5000 }), /pendingOperation/);
    await pending.activeLock.release();
});

test('pending reconciliation retains pending state if ownership is lost during its read', async () => {
    const components = await pendingStartSetup('unconfirmed');
    const gate = deferred();
    components.locks.storeGate = gate;
    const reconciliation = components.bridge.reconcilePendingOperation();
    await new Promise(resolve => setImmediate(resolve));
    await components.activeLock.release();
    gate.resolve();
    await assert.rejects(reconciliation, /activeLockRequired/);
    components.locks.storeGate = null;
    await components.activeLock.claim();
    assert.equal((await components.bridge.reconcilePendingOperation()).outcome, 'target');
    await components.activeLock.release();
});
