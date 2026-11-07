import test from 'node:test';
import assert from 'node:assert/strict';
import {
    activatePlannedExecution,
    createPlannedExecution,
    startActiveExecution,
    suspendReadyExecution,
} from '../src/js/editor-domain.mjs';
import {
    captureExecutionRuntimeCheckpoint,
    suspendStartedExecutionWithCheckpoint,
} from '../src/js/execution-runtime.mjs';
import {
    EDITOR_STORAGE_KEY,
    EDITOR_STORE_SCHEMA_VERSION,
    activatePlannedExecutionInRecord,
    createEditorStore,
    startReadyExecutionInRecord,
    validateEditorStoreRecord,
} from '../src/js/editor-storage.mjs';
import { createEditorStoreWriter } from '../src/js/editor-storage-lock.mjs';
import { createEditorActiveTimerLock } from '../src/js/editor-active-lock.mjs';
import { prepareSession, transitionSession } from '../src/js/session.mjs';

const plan = (name = 'Workshop') => ({
    name,
    category: 'uncategorized',
    transitionMode: 'manual',
    preparedInformation: '',
    phases: [
        { id: 'phase-1', title: 'Opening', durationSeconds: 60, category: 'uncategorized', notes: '', resources: [] },
        { id: 'phase-2', title: 'Discussion', durationSeconds: 120, category: 'uncategorized', notes: '', resources: [] },
    ],
});

const template = (id = 'template-1') => ({
    schemaVersion: 2,
    kind: 'template',
    id,
    revision: 1,
    plan: plan(`Workshop ${id}`),
});

const planned = (id = 'execution-1', templateId = 'template-1') =>
    createPlannedExecution(template(templateId), id);
const entry = (execution, suspendedCheckpoint = null) => ({ execution, suspendedCheckpoint });
const record = (changes = {}) => ({
    schemaVersion: EDITOR_STORE_SCHEMA_VERSION,
    revision: 0,
    templates: [],
    executions: [],
    activeRuntime: null,
    ...changes,
});

function session(runId = 'runtime-run-1') {
    return prepareSession({
        id: 'runtime-source',
        name: 'Runtime workshop',
        transitionMode: 'manual',
        phases: plan().phases,
    }, runId);
}

function activeRuntime(execution, state, savedAt = 1000) {
    return {
        executionId: execution.id,
        attemptId: execution.attempt?.id ?? null,
        runtimeRevision: execution.runtimeRevision,
        savedAt,
        run: state.run,
        clock: state.clock,
    };
}

function started(id = 'execution-1', runId = 'runtime-run-1') {
    return startActiveExecution(activatePlannedExecution(planned(id)), `attempt-${id}`, 1000, runId);
}

function suspendedStarted(id = 'execution-1', runId = `run-${id}`) {
    const execution = started(id, runId);
    const running = transitionSession(session(runId).run, session(runId).clock, { type: 'START' }, 1000);
    const checkpoint = captureExecutionRuntimeCheckpoint(execution, running.run, running.clock, 10_000);
    return suspendStartedExecutionWithCheckpoint(execution, checkpoint);
}

function memory(raw = null) {
    const values = new Map(raw === null ? [] : [[EDITOR_STORAGE_KEY, raw]]);
    const state = {
        failRead: false,
        failWrite: null,
        readback: undefined,
        writes: 0,
    };
    return {
        state,
        values,
        getItem(key) {
            if (state.failRead) throw new Error('read failed');
            if (state.readback !== undefined && state.writes > 0) return state.readback;
            return values.get(key) ?? null;
        },
        setItem(key, value) {
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

function aggregateLockManager() {
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

test('activates one planned execution with an initial READY runtime and exact revision progress', () => {
    const source = record({
        revision: 3,
        templates: [template()],
        executions: [entry(planned()), entry(planned('execution-2'))],
    });
    source.executions[0].execution.currentPlan.preparedInformation = '**Prepared**';
    source.executions[0].execution.workshopNotes = {
        rundown: 'Rundown note',
        phases: [{ phaseId: 'phase-1', text: 'Phase note' }],
    };
    const before = structuredClone(source);
    const result = activatePlannedExecutionInRecord(source, activationOptions({
        expectedAggregateRevision: 3,
    }));

    assert.deepEqual(source, before);
    assert.equal(result.revision, 4);
    assert.equal(result.executions[0].execution.lifecycle, 'active');
    assert.equal(result.executions[0].execution.revision, 2);
    assert.equal(result.executions[0].execution.runtimeRevision, 1);
    assert.equal(result.executions[0].execution.attempt, null);
    assert.equal(result.executions[0].suspendedCheckpoint, null);
    assert.deepEqual(result.executions[0].execution.currentPlan, before.executions[0].execution.currentPlan);
    assert.deepEqual(result.executions[0].execution.workshopNotes, before.executions[0].execution.workshopNotes);
    assert.deepEqual(result.executions[1], before.executions[1]);
    assert.deepEqual(result.templates, before.templates);
    assert.equal(result.activeRuntime.executionId, 'execution-1');
    assert.equal(result.activeRuntime.attemptId, null);
    assert.equal(result.activeRuntime.runtimeRevision, 1);
    assert.equal(result.activeRuntime.savedAt, 1000);
    assert.equal(result.activeRuntime.run.runId, 'runtime-ready-1');
    assert.equal(result.activeRuntime.run.sourceTemplateId, 'template-1');
    assert.equal(result.activeRuntime.run.currentIndex, 0);
    assert.equal(result.activeRuntime.run.stage, 'PHASE');
    assert.deepEqual(result.activeRuntime.run.phaseOvertime, {});
    assert.equal(result.activeRuntime.clock.status, 'READY');
    assert.notEqual(result.executions[0].execution, source.executions[0].execution);
    assert.notEqual(result.executions[1], source.executions[1]);
    assert.notEqual(result.templates[0], source.templates[0]);
});

test('uses the execution ID as the source-less runtime fallback', () => {
    const execution = { ...planned(), source: null };
    const result = activatePlannedExecutionInRecord(
        record({ executions: [entry(execution)] }),
        activationOptions(),
    );
    assert.equal(result.activeRuntime.run.sourceTemplateId, execution.id);
});

test('starts READY with one attempt bound to the existing run and an immutable plan snapshot', () => {
    const ready = activatePlannedExecutionInRecord(
        record({ templates: [template()], executions: [entry(planned()), entry(planned('execution-2'))] }),
        activationOptions(),
    );
    ready.executions[0].execution.currentPlan.preparedInformation = '**Latest plan**';
    ready.executions[0].execution.workshopNotes = {
        rundown: 'Saved workshop note',
        phases: [{ phaseId: 'phase-1', text: 'Saved phase note' }],
    };
    const before = structuredClone(ready);
    const result = startReadyExecutionInRecord(ready, startOptions());
    const execution = result.executions[0].execution;

    assert.deepEqual(ready, before);
    assert.equal(result.revision, 2);
    assert.equal(execution.lifecycle, 'active');
    assert.equal(execution.revision, 3);
    assert.equal(execution.runtimeRevision, 2);
    assert.equal(execution.attempt.id, 'attempt-1');
    assert.equal(execution.attempt.startedAt, 2000);
    assert.equal(execution.attempt.runtimeRunId, 'runtime-ready-1');
    assert.deepEqual(execution.attempt.startSnapshot, before.executions[0].execution.currentPlan);
    assert.deepEqual(execution.currentPlan, before.executions[0].execution.currentPlan);
    assert.deepEqual(execution.workshopNotes, before.executions[0].execution.workshopNotes);
    assert.equal(result.executions[0].suspendedCheckpoint, null);
    assert.deepEqual(result.executions[1], before.executions[1]);
    assert.deepEqual(result.templates, before.templates);
    assert.equal(result.activeRuntime.executionId, execution.id);
    assert.equal(result.activeRuntime.attemptId, execution.attempt.id);
    assert.equal(result.activeRuntime.runtimeRevision, execution.runtimeRevision);
    assert.equal(result.activeRuntime.savedAt, 2000);
    assert.equal(result.activeRuntime.run.runId, before.activeRuntime.run.runId);
    assert.equal(result.activeRuntime.clock.status, 'RUNNING');
    assert.equal(result.activeRuntime.clock.deadlineMs, 62_000);
    assert.deepEqual(ready.activeRuntime, before.activeRuntime);
    assert.notEqual(result, ready);
    assert.notEqual(execution, ready.executions[0].execution);
    assert.notEqual(execution.attempt.startSnapshot, ready.executions[0].execution.currentPlan);
    assert.notEqual(result.activeRuntime.run, ready.activeRuntime.run);
});

test('rejects invalid first START inputs, stale revisions and repeated START without mutation', () => {
    const ready = activatePlannedExecutionInRecord(
        record({ executions: [entry(planned())] }),
        activationOptions(),
    );
    const before = structuredClone(ready);
    const invalidOptions = [
        startOptions({ executionId: 'missing' }),
        startOptions({ executionId: '' }),
        startOptions({ expectedAggregateRevision: 0 }),
        startOptions({ expectedAggregateRevision: -1 }),
        startOptions({ expectedExecutionRevision: 1 }),
        startOptions({ expectedExecutionRevision: -1 }),
        startOptions({ expectedRuntimeRevision: 0 }),
        startOptions({ expectedRuntimeRevision: -1 }),
        startOptions({ attemptId: '' }),
        startOptions({ attemptId: null }),
        startOptions({ startedAt: -1 }),
        startOptions({ startedAt: 1.5 }),
    ];
    for (const options of invalidOptions) {
        assert.throws(() => startReadyExecutionInRecord(ready, options));
        assert.deepEqual(ready, before);
    }

    const startedRecord = startReadyExecutionInRecord(ready, startOptions());
    assert.throws(() => startReadyExecutionInRecord(startedRecord, startOptions({
        expectedAggregateRevision: 2,
        expectedExecutionRevision: 3,
        expectedRuntimeRevision: 2,
        attemptId: 'attempt-2',
        startedAt: 3000,
    })), /invalidAttempt/);

    const plannedRecord = record({ executions: [entry(planned())] });
    assert.throws(() => startReadyExecutionInRecord(plannedRecord, startOptions({
        expectedAggregateRevision: 0,
        expectedExecutionRevision: 1,
        expectedRuntimeRevision: 0,
    })), /invalidLifecycle/);

    const overflow = { ...ready, revision: Number.MAX_SAFE_INTEGER };
    assert.throws(() => startReadyExecutionInRecord(overflow, startOptions({
        expectedAggregateRevision: Number.MAX_SAFE_INTEGER,
    })), /invalidStoreRevision/);
    const executionOverflow = {
        ...ready,
        executions: [{
            ...ready.executions[0],
            execution: {
                ...ready.executions[0].execution,
                revision: Number.MAX_SAFE_INTEGER,
            },
        }],
    };
    assert.throws(() => startReadyExecutionInRecord(executionOverflow, startOptions({
        expectedExecutionRevision: Number.MAX_SAFE_INTEGER,
    })), /invalidRevision/);
    assert.throws(() => startReadyExecutionInRecord({ ...ready, activeRuntime: null }, startOptions()));
    assert.throws(() => startReadyExecutionInRecord({ ...ready, extra: true }, startOptions()));
});

test('rejects activation conflicts, invalid inputs and aggregate overflow without mutation', () => {
    const source = record({ executions: [entry(planned())] });
    const before = structuredClone(source);
    const invalidOptions = [
        activationOptions({ executionId: 'missing' }),
        activationOptions({ executionId: '' }),
        activationOptions({ expectedAggregateRevision: 1 }),
        activationOptions({ expectedAggregateRevision: -1 }),
        activationOptions({ expectedExecutionRevision: 2 }),
        activationOptions({ expectedExecutionRevision: -1 }),
        activationOptions({ expectedRuntimeRevision: 1 }),
        activationOptions({ expectedRuntimeRevision: -1 }),
        activationOptions({ runtimeRunId: undefined }),
        activationOptions({ runtimeRunId: '' }),
        activationOptions({ savedAt: -1 }),
    ];
    for (const options of invalidOptions) {
        assert.throws(() => activatePlannedExecutionInRecord(source, options));
        assert.deepEqual(source, before);
    }

    const active = activatePlannedExecution(planned());
    const activeRecord = record({
        executions: [entry(active)],
        activeRuntime: activeRuntime(active, session()),
    });
    assert.throws(() => activatePlannedExecutionInRecord(activeRecord, activationOptions({
        expectedExecutionRevision: active.revision,
        expectedRuntimeRevision: active.runtimeRevision,
    })), /invalidLifecycle/);

    const suspended = suspendReadyExecution(activatePlannedExecution(planned()));
    assert.throws(() => activatePlannedExecutionInRecord(
        record({ executions: [entry(suspended)] }),
        activationOptions({ expectedExecutionRevision: suspended.revision, expectedRuntimeRevision: suspended.runtimeRevision }),
    ), /invalidLifecycle/);

    const otherActive = activatePlannedExecution(planned('execution-2'));
    assert.throws(() => activatePlannedExecutionInRecord(record({
        executions: [entry(planned()), entry(otherActive)],
        activeRuntime: activeRuntime(otherActive, session('runtime-other')),
    }), activationOptions()), /activeExecutionExists/);

    const overflow = record({
        revision: Number.MAX_SAFE_INTEGER,
        executions: [entry(planned())],
    });
    assert.throws(() => activatePlannedExecutionInRecord(overflow, activationOptions({
        expectedAggregateRevision: Number.MAX_SAFE_INTEGER,
    })), /invalidStoreRevision/);
    assert.throws(() => activatePlannedExecutionInRecord({ ...source, extra: true }, activationOptions()));
});

test('activates READY and persists the first START while active-timer ownership remains held', async () => {
    const initial = record({ revision: 7, templates: [template()], executions: [entry(planned())] });
    const storage = memory(JSON.stringify(initial));
    const locks = aggregateLockManager();
    const activeLock = createEditorActiveTimerLock({ locks });
    const writer = createEditorStoreWriter({ getStorage: () => storage, locks });

    assert.equal(await activeLock.claim(), true);
    assert.equal(activeLock.held, true);
    const ready = await writer.write(current => {
        assert.equal(activeLock.held, true);
        return activatePlannedExecutionInRecord(current, activationOptions({
            expectedAggregateRevision: 7,
        }));
    });
    assert.equal(activeLock.held, true);
    assert.equal(ready.activeRuntime.clock.status, 'READY');
    assert.equal(storage.state.writes, 1);
    assert.deepEqual(await writer.read(), ready);
    const startedRecord = await writer.write(current => {
        assert.equal(activeLock.held, true);
        return startReadyExecutionInRecord(current, startOptions({
            expectedAggregateRevision: 8,
        }));
    });
    assert.equal(activeLock.held, true);
    assert.equal(storage.state.writes, 2);
    assert.equal(startedRecord.revision, 9);
    assert.equal(startedRecord.executions[0].execution.attempt.id, 'attempt-1');
    assert.equal(startedRecord.executions[0].execution.attempt.runtimeRunId, 'runtime-ready-1');
    assert.equal(startedRecord.activeRuntime.run.runId, 'runtime-ready-1');
    assert.equal(startedRecord.activeRuntime.clock.status, 'RUNNING');
    assert.deepEqual(await writer.read(), startedRecord);
    await assert.rejects(writer.write(current => startReadyExecutionInRecord(current, startOptions({
        expectedAggregateRevision: 9,
        expectedExecutionRevision: 3,
        expectedRuntimeRevision: 2,
        attemptId: 'attempt-2',
        startedAt: 3000,
    }))), /invalidAttempt/);
    assert.equal(storage.state.writes, 2);
    assert.equal(activeLock.held, true);
    assert.equal(await activeLock.release(), true);
    assert.equal(activeLock.held, false);
    assert.equal(locks.held.size, 0);
});

test('validates the empty record and multiple templates and planned executions', () => {
    const source = record({
        templates: [template('template-1'), template('template-2')],
        executions: [entry(planned('execution-1')), entry(planned('execution-2', 'template-2'))],
    });
    const before = structuredClone(source);
    const valid = validateEditorStoreRecord(source);
    assert.deepEqual(source, before);
    assert.deepEqual(valid, source);
    assert.notEqual(valid, source);
    assert.notEqual(valid.templates[0], source.templates[0]);
    assert.notEqual(valid.executions[0].execution.currentPlan, source.executions[0].execution.currentPlan);
});

test('accepts multiple suspended ready executions without checkpoints', () => {
    const executions = [
        entry(suspendReadyExecution(activatePlannedExecution(planned('execution-1')))),
        entry(suspendReadyExecution(activatePlannedExecution(planned('execution-2')))),
    ];
    assert.deepEqual(validateEditorStoreRecord(record({ executions })).executions, executions);
});

test('accepts multiple suspended started executions with independently bound checkpoints', () => {
    const first = suspendedStarted('execution-1');
    const second = suspendedStarted('execution-2');
    const executions = [entry(first.execution, first.checkpoint), entry(second.execution, second.checkpoint)];
    assert.deepEqual(validateEditorStoreRecord(record({ executions })).executions, executions);
});

test('accepts one active ready execution only with an initial READY runtime', () => {
    const execution = activatePlannedExecution(planned());
    const runtime = activeRuntime(execution, session());
    const valid = validateEditorStoreRecord(record({ executions: [entry(execution)], activeRuntime: runtime }));
    assert.deepEqual(valid.activeRuntime, runtime);

    for (const changed of [
        { ...runtime, clock: { ...runtime.clock, status: 'PAUSED' } },
        { ...runtime, run: { ...runtime.run, currentIndex: 1 } },
        { ...runtime, run: { ...runtime.run, phaseOvertime: { 'phase-1': 0 } } },
    ]) assert.throws(() => validateEditorStoreRecord(record({ executions: [entry(execution)], activeRuntime: changed })));
});

test('accepts active started runtimes in running, paused, READY and overtime states', () => {
    const execution = started();
    let state = transitionSession(session().run, session().clock, { type: 'START' }, 1000);
    const states = [
        [state, 1000],
        [transitionSession(state.run, state.clock, { type: 'PAUSE' }, 10_000), 10_000],
        [transitionSession(state.run, state.clock, { type: 'NEXT' }, 10_000), 10_000],
        [transitionSession(state.run, state.clock, { type: 'PAUSE' }, 70_000), 70_000],
    ];
    for (const [current, savedAt] of states) {
        const valid = validateEditorStoreRecord(record({
            executions: [entry(execution)],
            activeRuntime: activeRuntime(execution, current, savedAt),
        }));
        assert.equal(valid.activeRuntime.run.runId, execution.attempt.runtimeRunId);
    }
});

test('rejects missing, unexpected, stale and foreign checkpoints', () => {
    const suspended = suspendedStarted();
    const ready = suspendReadyExecution(activatePlannedExecution(planned('ready')));
    const foreign = suspendedStarted('foreign');
    for (const executionEntry of [
        entry(suspended.execution),
        entry(planned(), suspended.checkpoint),
        entry(ready, suspended.checkpoint),
        entry(suspended.execution, { ...suspended.checkpoint, runtimeRevision: suspended.checkpoint.runtimeRevision - 1 }),
        entry(suspended.execution, foreign.checkpoint),
    ]) assert.throws(() => validateEditorStoreRecord(record({ executions: [executionEntry] })));
});

test('rejects foreign active-runtime bindings and run IDs', () => {
    const execution = started();
    const runtime = activeRuntime(execution, session());
    for (const changed of [
        { ...runtime, executionId: 'foreign' },
        { ...runtime, attemptId: 'foreign' },
        { ...runtime, runtimeRevision: runtime.runtimeRevision - 1 },
        { ...runtime, run: { ...runtime.run, runId: 'foreign' } },
    ]) assert.throws(() => validateEditorStoreRecord(record({ executions: [entry(execution)], activeRuntime: changed })));
});

test('rejects duplicate IDs, multiple active executions and active-runtime mismatches', () => {
    const active = activatePlannedExecution(planned('active'));
    for (const invalid of [
        record({ templates: [template(), template()] }),
        record({ executions: [entry(planned()), entry(planned())] }),
        record({ executions: [entry(active)] }),
        record({ activeRuntime: activeRuntime(active, session()) }),
        record({
            executions: [entry(active), entry(activatePlannedExecution(planned('active-2')))],
            activeRuntime: activeRuntime(active, session()),
        }),
    ]) assert.throws(() => validateEditorStoreRecord(invalid));
});

test('strictly rejects schema, fields, lifecycle and revision errors', () => {
    const completed = { ...planned(), lifecycle: 'completed' };
    for (const invalid of [
        { ...record(), schemaVersion: 2 },
        { ...record(), extra: true },
        record({ revision: -1 }),
        record({ revision: Number.MAX_SAFE_INTEGER + 1 }),
        record({ executions: [entry(completed)] }),
        record({ executions: [{ execution: planned(), suspendedCheckpoint: null, extra: true }] }),
    ]) assert.throws(() => validateEditorStoreRecord(invalid));
});

test('load returns an isolated empty record for a missing key', () => {
    const storage = memory();
    const store = createEditorStore(() => storage);
    const first = store.load();
    assert.deepEqual(first, record());
    first.templates.push(template());
    assert.deepEqual(store.load(), record());
    assert.equal(storage.values.has(EDITOR_STORAGE_KEY), false);
});

test('save requires load, exact revision progress, one write and confirmed readback', () => {
    const storage = memory();
    const store = createEditorStore(() => storage);
    assert.throws(() => store.save(record({ revision: 1 }), 0), /storageBlocked/);
    const loaded = store.load();
    const target = { ...loaded, revision: 1, templates: [template()] };
    const before = structuredClone(target);
    const saved = store.save(target, 0);
    assert.deepEqual(target, before);
    assert.deepEqual(saved, target);
    assert.notEqual(saved.templates[0], target.templates[0]);
    assert.equal(storage.state.writes, 1);
    assert.deepEqual(JSON.parse(storage.values.get(EDITOR_STORAGE_KEY)), target);
    saved.templates[0].plan.name = 'Changed';
    assert.equal(JSON.parse(storage.values.get(EDITOR_STORAGE_KEY)).templates[0].plan.name, 'Workshop template-1');
});

test('save rejects stale expected revisions, invalid jumps and changed raw snapshots', () => {
    const storage = memory();
    const store = createEditorStore(() => storage);
    store.load();
    assert.throws(() => store.save(record({ revision: 1 }), 1), /conflict/);
    assert.throws(() => store.save(record({ revision: 2 }), 0), /invalidStoreRevision/);
    storage.values.set(EDITOR_STORAGE_KEY, JSON.stringify(record()));
    assert.throws(() => store.save(record({ revision: 1 }), 0), /conflict/);
    assert.equal(storage.state.writes, 0);
});

test('save rejects aggregate revision overflow', () => {
    const source = record({ revision: Number.MAX_SAFE_INTEGER });
    const storage = memory(JSON.stringify(source));
    const store = createEditorStore(() => storage);
    store.load();
    assert.throws(() => store.save(source, Number.MAX_SAFE_INTEGER), /invalidStoreRevision/);
});

test('corrupt data and read failures are controlled and never treated as empty', () => {
    for (const raw of ['{broken', 'null', JSON.stringify({ ...record(), schemaVersion: 2 })]) {
        const storage = memory(raw);
        assert.throws(() => createEditorStore(() => storage).load(), /storageValidation/);
        assert.equal(storage.values.get(EDITOR_STORAGE_KEY), raw);
    }
    const storage = memory();
    storage.state.failRead = true;
    assert.throws(() => createEditorStore(() => storage).load(), /storageRead/);
    assert.equal(storage.state.writes, 0);
});

test('write, quota and readback failures are distinct and do not delete data', () => {
    for (const [failure, code] of [['Error', 'storageWrite'], ['QuotaExceededError', 'storageQuota']]) {
        const storage = memory();
        const store = createEditorStore(() => storage);
        store.load(); storage.state.failWrite = failure;
        assert.throws(() => store.save(record({ revision: 1 }), 0), new RegExp(code));
        assert.equal(storage.values.has(EDITOR_STORAGE_KEY), false);
    }

    const mismatched = memory();
    const mismatchedStore = createEditorStore(() => mismatched);
    mismatchedStore.load(); mismatched.state.readback = JSON.stringify(record());
    assert.throws(() => mismatchedStore.save(record({ revision: 1 }), 0), /storageReadback/);
    assert.equal(JSON.parse(mismatched.values.get(EDITOR_STORAGE_KEY)).revision, 1);

    const unreadable = memory();
    const unreadableStore = createEditorStore(() => unreadable);
    unreadableStore.load();
    const originalGet = unreadable.getItem.bind(unreadable);
    unreadable.getItem = key => {
        if (unreadable.state.writes > 0) throw new Error('readback failed');
        return originalGet(key);
    };
    assert.throws(() => unreadableStore.save(record({ revision: 1 }), 0), /storageUnconfirmed/);
    assert.equal(JSON.parse(unreadable.values.get(EDITOR_STORAGE_KEY)).revision, 1);
});

test('validation and failed saves never remove or rewrite an existing record', () => {
    const raw = JSON.stringify(record());
    const storage = memory(raw);
    const store = createEditorStore(() => storage);
    store.load();
    assert.throws(() => store.save({ ...record({ revision: 1 }), extra: true }, 0));
    assert.equal(storage.values.get(EDITOR_STORAGE_KEY), raw);
    assert.equal(storage.state.writes, 0);
});
