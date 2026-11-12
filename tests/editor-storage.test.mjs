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
    recordExecutionPhaseOutcomes,
    suspendStartedExecutionWithCheckpoint,
} from '../src/js/execution-runtime.mjs';
import {
    EDITOR_STORAGE_KEY,
    EDITOR_STORE_SCHEMA_VERSION,
    applyStartedSessionActionInRecord,
    activatePlannedExecutionInRecord,
    createEditorStore,
    discardExecutionInRecord,
    deleteTemplateInRecord,
    insertTemplateInRecord,
    planExecutionFromTemplateInRecord,
    retainExecutionPlanInRecord,
    resumeSuspendedExecutionInRecord,
    startReadyExecutionInRecord,
    suspendActiveExecutionInRecord,
    updateTemplateInRecord,
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

function executionExitOptions(source, executionId = 'execution-1', changes = {}) {
    const execution = source.executions.find(item => item.execution.id === executionId).execution;
    return {
        executionId, expectedLifecycle: execution.lifecycle, expectedAggregateRevision: source.revision,
        expectedExecutionRevision: execution.revision, expectedRuntimeRevision: execution.runtimeRevision,
        expectedAttemptId: execution.attempt?.id ?? null,
        expectedRunId: execution.lifecycle === 'active' ? source.activeRuntime.run.runId : execution.attempt?.runtimeRunId ?? null,
        ...changes,
    };
}

test('retain and discard cover ACTIVE and SUSPENDED READY/STARTED with exact full-record preservation', () => {
    for (const hasStarted of [false, true]) {
        const ready = activatePlannedExecutionInRecord(record({ templates: [template()],
            executions: [entry(planned()), entry(planned('unrelated'))] }), activationOptions());
        const active = hasStarted ? startReadyExecutionInRecord(ready, startOptions()) : ready;
        const suspended = suspendActiveExecutionInRecord(active, suspendOptions(active, 3000, {
            rundown: 'Saved note', phases: [{ phaseId: 'phase-1', text: 'Phase observation' }],
        }));
        // Editing a dormant execution must not remove a different live timer.
        const withOtherActive = activatePlannedExecutionInRecord(suspended, {
            ...activationOptions(), executionId: 'unrelated', expectedAggregateRevision: suspended.revision,
            runtimeRunId: 'unrelated-run', savedAt: 4000,
        });
        for (const source of [active, withOtherActive]) {
            source.executions[0].execution.currentPlan.preparedInformation = '**Latest**';
            source.executions[0].execution.currentPlan.phases[0].notes = 'Prepared note';
            source.executions[0].execution.currentPlan.phases[0].resources = [{ label: 'Board', url: 'https://example.test' }];
            source.executions[0].execution.workshopNotes = { rundown: 'Drop', phases: [{ phaseId: 'phase-2', text: 'Drop' }] };
            const before = structuredClone(source);
            const execution = before.executions[0].execution;
            const options = executionExitOptions(source);
            const retained = retainExecutionPlanInRecord(source, options);
            const expectedExecution = { ...execution };
            delete expectedExecution.phaseOutcomes;
            const retainedEntry = { execution: { ...expectedExecution, lifecycle: 'planned',
                revision: execution.revision + 1, runtimeRevision: execution.runtimeRevision + 1,
                attempt: null, workshopNotes: { rundown: '', phases: [] } }, suspendedCheckpoint: null };
            const expectedRuntime = execution.lifecycle === 'active' ? null : before.activeRuntime;
            assert.deepEqual(retained, { ...before, revision: before.revision + 1,
                executions: [retainedEntry, before.executions[1]], activeRuntime: expectedRuntime });
            const discarded = discardExecutionInRecord(source, options);
            assert.deepEqual(discarded, { ...before, revision: before.revision + 1,
                executions: [before.executions[1]], activeRuntime: expectedRuntime });
            assert.deepEqual(source, before);
            assert.deepEqual(options, executionExitOptions(source));
            assert.deepEqual(validateEditorStoreRecord(retained), retained);
            assert.deepEqual(validateEditorStoreRecord(discarded), discarded);
            retained.executions[0].execution.currentPlan.phases[0].resources[0].label = 'Output only';
            discarded.executions[0].execution.currentPlan.name = 'Output only';
            assert.deepEqual(source, before);
        }
    }
});

test('execution exits reject stale revisions, wrong identities, invalid lifecycles and overflow without mutation', () => {
    const source = startedRecord();
    const before = structuredClone(source);
    const cases = [
        [{ executionId: '' }, 'invalidData'], [{ executionId: 'missing' }, 'executionNotFound'],
        [{ expectedLifecycle: 'planned' }, 'invalidLifecycle'], [{ expectedLifecycle: 'suspended' }, 'invalidLifecycle'],
        [{ expectedAggregateRevision: source.revision - 1 }, 'conflict'],
        [{ expectedExecutionRevision: 0 }, 'conflict'], [{ expectedRuntimeRevision: 0 }, 'conflict'],
        [{ expectedExecutionRevision: -1 }, 'invalidRevision'], [{ expectedRuntimeRevision: null }, 'invalidRuntimeRevision'],
        [{ expectedAggregateRevision: NaN }, 'invalidStoreRevision'],
        [{ expectedAttemptId: 'foreign' }, 'invalidAttemptBinding'], [{ expectedRunId: 'foreign' }, 'invalidActiveRuntimeBinding'],
        [{ expectedRunId: undefined }, 'invalidActiveRuntimeBinding'],
    ];
    for (const operation of [retainExecutionPlanInRecord, discardExecutionInRecord]) {
        for (const [changes, error] of cases) {
            assert.throws(() => operation(source, executionExitOptions(source, 'execution-1', changes)), new RegExp(error));
        }
        const overflow = { ...source, revision: Number.MAX_SAFE_INTEGER };
        assert.throws(() => operation(overflow, executionExitOptions(overflow)), /invalidStoreRevision/);
        for (const lifecycle of ['planned', 'completed']) {
            const invalid = structuredClone(source); invalid.executions[0].execution.lifecycle = lifecycle;
            assert.throws(() => operation(invalid, executionExitOptions(source)));
        }
        const foreign = structuredClone(source); foreign.activeRuntime.run.runId = 'foreign';
        assert.throws(() => operation(foreign, executionExitOptions(source)), /invalidActiveRuntimeBinding/);
    }
    const overflow = structuredClone(source);
    overflow.executions[0].execution.revision = Number.MAX_SAFE_INTEGER;
    assert.throws(() => retainExecutionPlanInRecord(overflow, executionExitOptions(overflow)), /invalidRevision/);
    assert.deepEqual(source, before);
});

test('execution exits use the real writer and reject another writer after the caller observed its revision', async () => {
    for (const operation of [retainExecutionPlanInRecord, discardExecutionInRecord]) {
        const source = startedRecord();
        const storage = memory(JSON.stringify(source));
        const writer = createEditorStoreWriter({ getStorage: () => storage, locks: aggregateLockManager() });
        const options = executionExitOptions(source);
        const concurrent = applyStartedSessionActionInRecord(source, sessionActionOptions(source, 'PAUSE', 3000));
        storage.values.set(EDITOR_STORAGE_KEY, JSON.stringify(concurrent));
        await assert.rejects(writer.write(current => operation(current, options)), /conflict/);
        assert.equal(storage.state.writes, 0);
        assert.deepEqual(await writer.read(), concurrent);
        const result = await writer.write(current => operation(current, executionExitOptions(concurrent)));
        assert.deepEqual(result, operation(concurrent, executionExitOptions(concurrent)));
        assert.deepEqual(await writer.read(), result);
        assert.equal(storage.state.writes, 1);
    }
});

const outcome = (phaseId, conducted, activeMs = 0, overtimeMs = 0) => ({ phaseId, conducted, activeMs, overtimeMs });
const phaseResults = source => source.executions[0].execution.phaseOutcomes;
const advance = (source, actionType, occurredAt) =>
    applyStartedSessionActionInRecord(source, sessionActionOptions(source, actionType, occurredAt));

test('actual outcomes distinguish early NEXT histories that previously serialized identically', () => {
    const base = startedRecord();
    function course(pausedAt) {
        const paused = advance(base, 'PAUSE', pausedAt);
        const resumed = advance(paused, 'RESUME', 10_000);
        return advance(resumed, 'NEXT', 11_000);
    }
    const a = course(9000), b = course(3000);
    assert.deepEqual(a.activeRuntime, b.activeRuntime);
    assert.equal(a.revision, b.revision);
    assert.deepEqual(phaseResults(a), [outcome('phase-1', true, 8000), outcome('phase-2', false)]);
    assert.deepEqual(phaseResults(b), [outcome('phase-1', true, 2000), outcome('phase-2', false)]);
    assert.deepEqual(a.executions[0].execution.attempt, base.executions[0].execution.attempt);
    assert.deepEqual(phaseResults(base), [outcome('phase-1', true), outcome('phase-2', false)]);
});

test('READY phases skipped with NEXT or COMPLETE are never fabricated as conducted', () => {
    const execution = planned();
    execution.currentPlan.phases.push({ ...execution.currentPlan.phases[1], id: 'phase-3' });
    const ready = activatePlannedExecutionInRecord(record({ executions: [entry(execution)] }), activationOptions());
    const started = startReadyExecutionInRecord(ready, startOptions());
    const next = advance(started, 'NEXT', 7000);
    const skipped = advance(next, 'NEXT', 8000);
    const ended = advance(skipped, 'COMPLETE', 9000);
    assert.deepEqual(phaseResults(ended), [outcome('phase-1', true, 5000), outcome('phase-2', false), outcome('phase-3', false)]);
    assert.equal(ended.executions[0].execution.lifecycle, 'active');
    assert.equal(ended.activeRuntime.run.stage, 'COMPLETED');
});

test('manual COMPLETE freezes actual phase duration while workshop overtime remains separate', () => {
    const started = startedRecord();
    const next = advance(started, 'NEXT', 12_000);
    const second = advance(next, 'START', 20_000);
    const completed = advance(second, 'COMPLETE', 25_000);
    const pausedPhase = advance(second, 'PAUSE', 25_000);
    const completedFromPause = advance(pausedPhase, 'COMPLETE', 1_000_000);
    assert.deepEqual(phaseResults(completedFromPause), phaseResults(completed));
    const stopped = advance(completed, 'STOP_OVERTIME', 35_000);
    assert.deepEqual(phaseResults(stopped), [outcome('phase-1', true, 10_000), outcome('phase-2', true, 5000)]);
    assert.equal(stopped.activeRuntime.clock.overtimeMs, 10_000);
    assert.equal(stopped.executions[0].execution.lifecycle, 'active');
    assert.equal(stopped.executions[0].execution.revision, started.executions[0].execution.revision);
    assert.equal(stopped.executions[0].execution.runtimeRevision, started.executions[0].execution.runtimeRevision);
    assert.deepEqual(stopped.executions[0].execution.attempt, started.executions[0].execution.attempt);
});

test('manual phase overtime survives pause and never counts paused wall time', () => {
    const started = startedRecord();
    const paused = advance(started, 'PAUSE', 72_000);
    assert.deepEqual(phaseResults(paused), [outcome('phase-1', true, 70_000, 10_000), outcome('phase-2', false)]);
    const resumed = advance(paused, 'RESUME', 172_000);
    const next = advance(resumed, 'NEXT', 177_000);
    assert.deepEqual(phaseResults(next), [outcome('phase-1', true, 75_000, 15_000), outcome('phase-2', false)]);
});

test('automatic deadline transitions and multi-phase catch-up record actual engine starts without callback overtime', () => {
    const started = startedRecord({ currentPlan: { ...planned().currentPlan, transitionMode: 'automatic' } });
    const exact = advance(started, 'PAUSE', 62_000);
    assert.equal(exact.activeRuntime.run.currentIndex, 1);
    assert.deepEqual(phaseResults(exact), [outcome('phase-1', true, 60_000), outcome('phase-2', true)]);
    const late = advance(started, 'PAUSE', 200_000);
    assert.deepEqual(phaseResults(late), [outcome('phase-1', true, 60_000), outcome('phase-2', true, 120_000)]);
    assert.equal(late.activeRuntime.clock.overtimeMs, 18_000);
    assert.equal(late.executions[0].execution.lifecycle, 'active');
    const pause = advance(started, 'PAUSE', 12_000);
    const resumed = advance(pause, 'RESUME', 112_000);
    const next = advance(resumed, 'PAUSE', 165_000);
    assert.deepEqual(phaseResults(next), [outcome('phase-1', true, 60_000), outcome('phase-2', true, 3000)]);
});

test('suspend captures current results and resume excludes the entire suspended interval', () => {
    const next = advance(startedRecord(), 'NEXT', 12_000);
    const running = advance(next, 'START', 20_000);
    const suspended = suspendActiveExecutionInRecord(running, suspendOptions(running, 25_000, {
        rundown: '', phases: [],
    }));
    assert.deepEqual(phaseResults(suspended), [outcome('phase-1', true, 10_000), outcome('phase-2', true, 5000)]);
    const resumed = resumeSuspendedExecutionInRecord(suspended, resumeOptions(suspended, 1_000_000));
    assert.deepEqual(phaseResults(resumed), phaseResults(suspended));
    const continued = advance(resumed, 'RESUME', 1_001_000);
    const paused = advance(continued, 'PAUSE', 1_006_000);
    assert.deepEqual(phaseResults(paused), [outcome('phase-1', true, 10_000), outcome('phase-2', true, 10_000)]);
    assert.deepEqual(paused.executions[0].execution.attempt, running.executions[0].execution.attempt);
    assert.deepEqual(validateEditorStoreRecord(suspended), suspended);
});

test('removed baseline phase IDs retain conducted and not-conducted facts without editing the baseline', () => {
    const source = advance(startedRecord(), 'NEXT', 12_000);
    const baseline = structuredClone(source.executions[0].execution.attempt.startSnapshot);
    for (const removed of ['phase-1', 'phase-2']) {
        const modified = structuredClone(source);
        modified.executions[0].execution.currentPlan.phases = modified.executions[0].execution.currentPlan.phases.filter(phase => phase.id !== removed);
        const valid = validateEditorStoreRecord(modified);
        assert.deepEqual(phaseResults(valid), [outcome('phase-1', true, 10_000), outcome('phase-2', false)]);
        assert.deepEqual(valid.executions[0].execution.attempt.startSnapshot, baseline);
    }
});

test('automatic catch-up at suspend preserves exact outcomes across dormant reactivation', () => {
    const started = startedRecord({ currentPlan: { ...planned().currentPlan, transitionMode: 'automatic' } });
    const suspended = suspendActiveExecutionInRecord(started, suspendOptions(started, 67_000, { rundown: '', phases: [] }));
    assert.deepEqual(phaseResults(suspended), [outcome('phase-1', true, 60_000), outcome('phase-2', true, 5000)]);
    const active = resumeSuspendedExecutionInRecord(suspended, resumeOptions(suspended, 1_000_000));
    assert.deepEqual(phaseResults(active), phaseResults(suspended));
    const resumed = advance(active, 'RESUME', 1_001_000);
    const paused = advance(resumed, 'PAUSE', 1_004_000);
    assert.deepEqual(phaseResults(paused), [outcome('phase-1', true, 60_000), outcome('phase-2', true, 8000)]);
});

test('incomplete native started stores fail closed and are never replaced or repaired', async () => {
    const incompatible = startedRecord();
    delete incompatible.executions[0].execution.phaseOutcomes;
    const raw = JSON.stringify(incompatible);
    const storage = memory(raw);
    assert.throws(() => createEditorStore(() => storage).load(), /storageValidation/);
    const writer = createEditorStoreWriter({ getStorage: () => storage, locks: aggregateLockManager() });
    await assert.rejects(writer.write(() => assert.fail('must not transform a rejected store')), /storageValidation/);
    assert.equal(storage.values.get(EDITOR_STORAGE_KEY), raw);
    assert.equal(storage.state.writes, 0);
    const suspended = suspendActiveExecutionInRecord(startedRecord(), suspendOptions(startedRecord(), 3000, { rundown: '', phases: [] }));
    delete suspended.executions[0].execution.phaseOutcomes;
    assert.throws(() => validateEditorStoreRecord(suspended), /invalidPhaseOutcomes/);
});

test('runtime validation rejects inconsistent or fabricated outcomes instead of silently normalizing them', () => {
    const paused = advance(startedRecord(), 'PAUSE', 12_000);
    for (const change of [
        value => { value[0].activeMs = 0; },
        value => { value[1].conducted = true; },
        value => { value[0].overtimeMs = 1; },
    ]) {
        const invalid = structuredClone(paused);
        change(invalid.executions[0].execution.phaseOutcomes);
        assert.throws(() => validateEditorStoreRecord(invalid), /invalidPhaseOutcomes/);
    }
    const next = advance(startedRecord(), 'NEXT', 12_000);
    next.executions[0].execution.phaseOutcomes[0].activeMs = 60_001;
    assert.throws(() => validateEditorStoreRecord(next), /invalidPhaseOutcomes/);
    const phantom = structuredClone(paused);
    phantom.executions[0].execution.currentPlan.phases.push({ ...plan().phases[0], id: 'phantom' });
    phantom.executions[0].execution.phaseOutcomes.push(outcome('phantom', true, 100));
    assert.throws(() => validateEditorStoreRecord(phantom), /invalidPhaseOutcomes/);
});

test('retain removes captured outcomes and discard removes only the selected execution history', () => {
    const source = advance(startedRecord(), 'NEXT', 12_000);
    source.executions.push(entry(planned('other')));
    const before = structuredClone(source);
    const retained = retainExecutionPlanInRecord(source, executionExitOptions(source));
    assert.equal(Object.hasOwn(retained.executions[0].execution, 'phaseOutcomes'), false);
    const discarded = discardExecutionInRecord(source, executionExitOptions(source));
    assert.deepEqual(discarded.executions, [source.executions[1]]);
    assert.deepEqual(source, before);
});

test('stale concurrent progress cannot overwrite recorded phase outcomes', async () => {
    const source = startedRecord();
    const target = advance(source, 'NEXT', 12_000);
    const storage = memory(JSON.stringify(target));
    const writer = createEditorStoreWriter({ getStorage: () => storage, locks: aggregateLockManager() });
    await assert.rejects(writer.write(current =>
        applyStartedSessionActionInRecord(current, sessionActionOptions(source, 'PAUSE', 13_000))), /conflict/);
    assert.deepEqual(await writer.read(), target);
    assert.equal(storage.state.writes, 0);
});

test('inserts one native Schema-2 template without changing unrelated aggregate state', () => {
    const existingTemplate = template('template-existing');
    const existingExecution = planned('execution-existing', 'template-existing');
    const active = activatePlannedExecution(existingExecution);
    const source = record({
        revision: 7,
        templates: [existingTemplate],
        executions: [entry(active)],
        activeRuntime: activeRuntime(active, session('active-run')),
    });
    const insertedTemplate = template('template-new');
    const sourceBefore = structuredClone(source);
    const templateBefore = structuredClone(insertedTemplate);

    const result = insertTemplateInRecord(source, {
        template: insertedTemplate,
        expectedAggregateRevision: 7,
    });

    assert.deepEqual(source, sourceBefore);
    assert.deepEqual(insertedTemplate, templateBefore);
    assert.equal(result.revision, 8);
    assert.deepEqual(result.templates, [existingTemplate, insertedTemplate]);
    assert.deepEqual(result.executions, source.executions);
    assert.deepEqual(result.activeRuntime, source.activeRuntime);
    assert.notEqual(result, source);
    assert.notEqual(result.templates[0], source.templates[0]);
    assert.notEqual(result.templates[1], insertedTemplate);
    assert.notEqual(result.executions[0].execution, source.executions[0].execution);
});

test('template insertion rejects invalid, duplicate, stale and overflowing input', () => {
    const source = record({ revision: 3, templates: [template()] });
    const invalid = template('invalid-template');
    invalid.schemaVersion = 1;

    assert.throws(() => insertTemplateInRecord(source, {
        template: template(), expectedAggregateRevision: 3,
    }), /duplicateId/);
    assert.throws(() => insertTemplateInRecord(source, {
        template: template('template-new'), expectedAggregateRevision: 2,
    }), /conflict/);
    assert.throws(() => insertTemplateInRecord(source, {
        template: invalid, expectedAggregateRevision: 3,
    }));
    assert.throws(() => insertTemplateInRecord(record({
        revision: Number.MAX_SAFE_INTEGER,
    }), {
        template: template('template-new'), expectedAggregateRevision: Number.MAX_SAFE_INTEGER,
    }), /invalidStoreRevision/);
});

test('updates one native template without changing its identity or independent executions', () => {
    const stored = { ...template(), revision: 4 };
    const unrelated = template('template-unrelated');
    const plannedExecution = planned('execution-planned');
    const activeExecution = activatePlannedExecution(planned('execution-active'));
    const suspendedExecution = suspendReadyExecution(activatePlannedExecution(planned('execution-suspended')));
    const source = record({
        revision: 9,
        templates: [stored, unrelated],
        executions: [entry(plannedExecution), entry(activeExecution), entry(suspendedExecution)],
        activeRuntime: activeRuntime(activeExecution, session('active-run')),
    });
    const replacement = structuredClone(stored);
    replacement.plan = {
        ...replacement.plan,
        name: 'Updated workshop',
        category: 'workshop',
        preparedInformation: '**Prepared** information',
        phases: replacement.plan.phases.map((phase, index) => index === 0 ? {
            ...phase,
            category: 'presentation',
            notes: '*Opening* notes',
            resources: [{ label: 'Workshop board', url: 'https://example.com/board' }],
        } : phase),
    };
    const sourceBefore = structuredClone(source);
    const replacementBefore = structuredClone(replacement);

    const result = updateTemplateInRecord(source, {
        template: replacement,
        expectedAggregateRevision: 9,
        expectedTemplateRevision: 4,
    });

    assert.deepEqual(source, sourceBefore);
    assert.deepEqual(replacement, replacementBefore);
    assert.equal(result.revision, 10);
    assert.equal(result.templates[0].id, stored.id);
    assert.equal(result.templates[0].revision, 5);
    assert.deepEqual(result.templates[0].plan, replacement.plan);
    assert.deepEqual(result.templates[1], unrelated);
    assert.deepEqual(result.executions, source.executions);
    assert.deepEqual(result.activeRuntime, source.activeRuntime);
    assert.notEqual(result.templates[0], replacement);
    assert.notEqual(result.executions[0].execution, source.executions[0].execution);
});

test('template update rejects stale, missing, invalid and overflowing input without mutation', () => {
    const stored = { ...template(), revision: 3 };
    const source = record({ revision: 7, templates: [stored] });
    const sourceBefore = structuredClone(source);
    const replacement = structuredClone(stored);

    assert.throws(() => updateTemplateInRecord(source, {
        template: replacement, expectedAggregateRevision: 6, expectedTemplateRevision: 3,
    }), /conflict/);
    assert.throws(() => updateTemplateInRecord(source, {
        template: replacement, expectedAggregateRevision: 7, expectedTemplateRevision: 2,
    }), /conflict/);
    assert.throws(() => updateTemplateInRecord(source, {
        template: { ...replacement, revision: 2 }, expectedAggregateRevision: 7, expectedTemplateRevision: 3,
    }), /conflict/);
    assert.throws(() => updateTemplateInRecord(source, {
        template: template('missing'), expectedAggregateRevision: 7, expectedTemplateRevision: 1,
    }), /templateNotFound/);
    assert.throws(() => updateTemplateInRecord(source, {
        template: { ...replacement, plan: { ...replacement.plan, unknown: true } },
        expectedAggregateRevision: 7, expectedTemplateRevision: 3,
    }), /invalidData/);
    assert.throws(() => updateTemplateInRecord(record({
        revision: Number.MAX_SAFE_INTEGER, templates: [stored],
    }), {
        template: replacement, expectedAggregateRevision: Number.MAX_SAFE_INTEGER, expectedTemplateRevision: 3,
    }), /invalidStoreRevision/);
    const maxTemplate = { ...stored, revision: Number.MAX_SAFE_INTEGER };
    assert.throws(() => updateTemplateInRecord(record({ revision: 7, templates: [maxTemplate] }), {
        template: maxTemplate, expectedAggregateRevision: 7, expectedTemplateRevision: Number.MAX_SAFE_INTEGER,
    }), /invalidRevision/);
    assert.deepEqual(source, sourceBefore);
});

test('deletes only the selected template while preserving independent executions and active runtime', () => {
    const selected = { ...template(), revision: 4 };
    const unrelated = template('template-unrelated');
    const plannedExecution = planned('execution-planned', selected.id);
    const activeExecution = activatePlannedExecution(planned('execution-active', selected.id));
    const suspendedExecution = suspendReadyExecution(activatePlannedExecution(planned('execution-suspended', selected.id)));
    const runtime = activeRuntime(activeExecution, session('active-run'));
    const source = record({
        revision: 9,
        templates: [selected, unrelated],
        executions: [entry(plannedExecution), entry(activeExecution), entry(suspendedExecution)],
        activeRuntime: runtime,
    });
    const before = structuredClone(source);

    const result = deleteTemplateInRecord(source, {
        templateId: selected.id,
        expectedAggregateRevision: 9,
        expectedTemplateRevision: 4,
    });

    assert.deepEqual(source, before);
    assert.equal(result.revision, 10);
    assert.deepEqual(result.templates, [unrelated]);
    assert.deepEqual(result.executions, source.executions);
    assert.deepEqual(result.activeRuntime, source.activeRuntime);
    assert.deepEqual(result.executions.map(item => item.execution.source.id), [selected.id, selected.id, selected.id]);
    assert.notEqual(result.templates[0], source.templates[1]);
    assert.notEqual(result.executions[0].execution, source.executions[0].execution);
    assert.notEqual(result.activeRuntime, source.activeRuntime);
});

test('template deletion rejects invalid, missing, stale and overflowing input without mutation', () => {
    const stored = { ...template(), revision: 3 };
    const source = record({ revision: 7, templates: [stored], executions: [entry(planned())] });
    const before = structuredClone(source);

    assert.throws(() => deleteTemplateInRecord(source, {
        templateId: '', expectedAggregateRevision: 7, expectedTemplateRevision: 3,
    }), /invalidData/);
    assert.throws(() => deleteTemplateInRecord(source, {
        templateId: 'missing', expectedAggregateRevision: 7, expectedTemplateRevision: 3,
    }), /templateNotFound/);
    assert.throws(() => deleteTemplateInRecord(source, {
        templateId: stored.id, expectedAggregateRevision: 6, expectedTemplateRevision: 3,
    }), /conflict/);
    assert.throws(() => deleteTemplateInRecord(source, {
        templateId: stored.id, expectedAggregateRevision: 7, expectedTemplateRevision: 2,
    }), /conflict/);
    assert.throws(() => deleteTemplateInRecord(record({
        revision: Number.MAX_SAFE_INTEGER, templates: [stored],
    }), {
        templateId: stored.id,
        expectedAggregateRevision: Number.MAX_SAFE_INTEGER,
        expectedTemplateRevision: 3,
    }), /invalidStoreRevision/);
    assert.deepEqual(source, before);
});

test('creates independent PLANNED executions from one stored Schema-2 template', () => {
    const storedTemplate = template();
    const unrelated = planned('execution-existing');
    const source = record({ revision: 10, templates: [storedTemplate], executions: [entry(unrelated)] });
    const sourceBefore = structuredClone(source);

    const first = planExecutionFromTemplateInRecord(source, {
        templateId: storedTemplate.id,
        executionId: 'execution-new-1',
        expectedAggregateRevision: 10,
    });
    const second = planExecutionFromTemplateInRecord(first, {
        templateId: storedTemplate.id,
        executionId: 'execution-new-2',
        expectedAggregateRevision: 11,
    });

    assert.deepEqual(source, sourceBefore);
    assert.equal(first.revision, 11);
    assert.equal(second.revision, 12);
    assert.equal(second.executions.length, 3);
    assert.deepEqual(second.templates, [storedTemplate]);
    assert.deepEqual(second.executions[0], entry(unrelated));
    for (const created of second.executions.slice(1)) {
        assert.equal(created.execution.lifecycle, 'planned');
        assert.equal(created.execution.attempt, null);
        assert.deepEqual(created.execution.workshopNotes, { rundown: '', phases: [] });
        assert.deepEqual(created.execution.currentPlan, storedTemplate.plan);
        assert.equal(created.suspendedCheckpoint, null);
    }
    assert.equal(second.activeRuntime, null);
    second.executions[1].execution.currentPlan.name = 'Execution-only edit';
    second.executions[1].execution.currentPlan.phases[0].notes = 'Independent note';
    assert.equal(second.templates[0].plan.name, storedTemplate.plan.name);
    assert.equal(second.executions[2].execution.currentPlan.name, storedTemplate.plan.name);
    assert.equal(second.executions[2].execution.currentPlan.phases[0].notes, '');
    assert.deepEqual(first.executions[1].execution.currentPlan, storedTemplate.plan);
});

test('planned execution creation rejects missing templates, duplicate IDs, stale revisions and overflow', () => {
    const source = record({ revision: 4, templates: [template()], executions: [entry(planned())] });
    assert.throws(() => planExecutionFromTemplateInRecord(source, {
        templateId: 'missing', executionId: 'execution-new', expectedAggregateRevision: 4,
    }), /templateNotFound/);
    assert.throws(() => planExecutionFromTemplateInRecord(source, {
        templateId: 'template-1', executionId: 'execution-1', expectedAggregateRevision: 4,
    }), /duplicateId/);
    assert.throws(() => planExecutionFromTemplateInRecord(source, {
        templateId: 'template-1', executionId: 'execution-new', expectedAggregateRevision: 3,
    }), /conflict/);
    assert.throws(() => planExecutionFromTemplateInRecord(record({
        revision: Number.MAX_SAFE_INTEGER, templates: [template()],
    }), {
        templateId: 'template-1', executionId: 'execution-new',
        expectedAggregateRevision: Number.MAX_SAFE_INTEGER,
    }), /invalidStoreRevision/);
});

test('writer persists and confirms native templates, updates and planned executions without an active lock', async () => {
    const storage = memory();
    const locks = aggregateLockManager();
    const writer = createEditorStoreWriter({ getStorage: () => storage, locks });

    const withTemplate = await writer.write(current => insertTemplateInRecord(current, {
        template: template(), expectedAggregateRevision: current.revision,
    }));
    const withExecution = await writer.write(current => planExecutionFromTemplateInRecord(current, {
        templateId: 'template-1', executionId: 'execution-1',
        expectedAggregateRevision: current.revision,
    }));
    const withUpdate = await writer.write(current => updateTemplateInRecord(current, {
        template: { ...current.templates[0], plan: { ...current.templates[0].plan, name: 'Updated' } },
        expectedAggregateRevision: current.revision,
        expectedTemplateRevision: current.templates[0].revision,
    }));

    assert.equal(storage.state.writes, 3);
    assert.equal(withTemplate.revision, 1);
    assert.equal(withExecution.revision, 2);
    assert.equal(withUpdate.revision, 3);
    assert.equal(withUpdate.templates[0].revision, 2);
    assert.equal(withUpdate.templates[0].plan.name, 'Updated');
    assert.deepEqual(withUpdate.executions, withExecution.executions);
    assert.deepEqual(await writer.read(), withUpdate);
    assert.equal(withUpdate.activeRuntime, null);
    assert.equal(locks.held.size, 0);
});

test('writer performs no storage write after rejected template insertion, update or execution creation', async () => {
    const initial = record({ revision: 5, templates: [template()], executions: [entry(planned())] });
    const storage = memory(JSON.stringify(initial));
    const locks = aggregateLockManager();
    const writer = createEditorStoreWriter({ getStorage: () => storage, locks });

    await assert.rejects(writer.write(current => insertTemplateInRecord(current, {
        template: template(), expectedAggregateRevision: current.revision,
    })), /duplicateId/);
    await assert.rejects(writer.write(current => updateTemplateInRecord(current, {
        template: current.templates[0], expectedAggregateRevision: current.revision,
        expectedTemplateRevision: current.templates[0].revision - 1,
    })), /conflict/);
    await assert.rejects(writer.write(current => planExecutionFromTemplateInRecord(current, {
        templateId: 'template-1', executionId: 'execution-1',
        expectedAggregateRevision: current.revision,
    })), /duplicateId/);

    assert.equal(storage.state.writes, 0);
    assert.deepEqual(await writer.read(), initial);
    assert.equal(locks.held.size, 0);
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

function suspendOptions(source, suspendedAt, workshopNotes, changes = {}) {
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

const completeWorkshopNotes = () => ({
    rundown: 'Complete rundown draft',
    phases: [
        { phaseId: 'phase-1', text: 'Opening draft' },
        { phaseId: 'phase-2', text: 'Discussion draft' },
    ],
});

function resumeOptions(source, resumedAt, changes = {}) {
    const execution = source.executions.find(item => item.execution.lifecycle === 'suspended').execution;
    return {
        executionId: execution.id,
        expectedAggregateRevision: source.revision,
        expectedExecutionRevision: execution.revision,
        expectedRuntimeRevision: execution.runtimeRevision,
        expectedAttemptId: execution.attempt?.id ?? null,
        expectedRunId: execution.attempt?.runtimeRunId ?? null,
        ...(execution.attempt === null ? { runtimeRunId: 'runtime-resumed' } : {}),
        resumedAt,
        ...changes,
    };
}

function startedRecord(changes = {}) {
    const execution = { ...planned(), ...changes };
    const ready = activatePlannedExecutionInRecord(
        record({ executions: [entry(execution)] }),
        activationOptions(),
    );
    return startReadyExecutionInRecord(ready, startOptions());
}

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

test('requires the first START time to be at or after the saved READY runtime', () => {
    const ready = activatePlannedExecutionInRecord(
        record({ executions: [entry(planned())] }),
        activationOptions(),
    );
    const before = structuredClone(ready);

    assert.throws(() => startReadyExecutionInRecord(
        ready,
        startOptions({ startedAt: ready.activeRuntime.savedAt - 1 }),
    ), /CLOCK_ANOMALY/);
    assert.deepEqual(ready, before);
    assert.equal(ready.executions[0].execution.attempt, null);
    assert.deepEqual(ready.activeRuntime, before.activeRuntime);

    const sameTime = startReadyExecutionInRecord(
        ready,
        startOptions({ startedAt: ready.activeRuntime.savedAt }),
    );
    assert.equal(sameTime.executions[0].execution.attempt.startedAt, ready.activeRuntime.savedAt);
    assert.equal(sameTime.activeRuntime.savedAt, ready.activeRuntime.savedAt);

    const later = startReadyExecutionInRecord(
        ready,
        startOptions({ startedAt: ready.activeRuntime.savedAt + 1 }),
    );
    assert.equal(later.executions[0].execution.attempt.startedAt, ready.activeRuntime.savedAt + 1);
    assert.equal(later.activeRuntime.savedAt, ready.activeRuntime.savedAt + 1);
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

test('applies pause, resume, next and later-phase start without changing execution identity', () => {
    const started = startedRecord();
    started.templates.push(template());
    started.executions.push(entry(planned('execution-2')));
    const before = structuredClone(started);
    const pause = applyStartedSessionActionInRecord(
        started,
        sessionActionOptions(started, 'PAUSE', 12_000),
    );
    assert.equal(pause.activeRuntime.clock.status, 'PAUSED');
    assert.equal(pause.activeRuntime.clock.remainingMs, 50_000);
    const resume = applyStartedSessionActionInRecord(
        pause,
        sessionActionOptions(pause, 'RESUME', 20_000),
    );
    assert.equal(resume.activeRuntime.clock.status, 'RUNNING');
    assert.equal(resume.activeRuntime.clock.deadlineMs, 70_000);
    const next = applyStartedSessionActionInRecord(
        resume,
        sessionActionOptions(resume, 'NEXT', 30_000),
    );
    assert.equal(next.activeRuntime.run.currentIndex, 1);
    assert.equal(next.activeRuntime.clock.status, 'READY');
    const laterStart = applyStartedSessionActionInRecord(
        next,
        sessionActionOptions(next, 'START', 31_000),
    );
    assert.equal(laterStart.activeRuntime.clock.status, 'RUNNING');
    assert.equal(laterStart.activeRuntime.clock.deadlineMs, 151_000);

    const originalExecution = before.executions[0].execution;
    for (const result of [pause, resume, next, laterStart]) {
        const execution = result.executions[0].execution;
        assert.equal(execution.id, originalExecution.id);
        assert.equal(execution.revision, originalExecution.revision);
        assert.equal(execution.runtimeRevision, originalExecution.runtimeRevision);
        assert.deepEqual(execution.attempt, originalExecution.attempt);
        assert.deepEqual(execution.currentPlan, originalExecution.currentPlan);
        assert.deepEqual(execution.workshopNotes, originalExecution.workshopNotes);
        assert.equal(result.activeRuntime.attemptId, originalExecution.attempt.id);
        assert.equal(result.activeRuntime.runtimeRevision, originalExecution.runtimeRevision);
        assert.equal(result.activeRuntime.run.runId, originalExecution.attempt.runtimeRunId);
        assert.deepEqual(result.templates, before.templates);
        assert.deepEqual(result.executions[1], before.executions[1]);
    }
    assert.equal(pause.revision, started.revision + 1);
    assert.equal(resume.revision, pause.revision + 1);
    assert.equal(next.revision, resume.revision + 1);
    assert.equal(laterStart.revision, next.revision + 1);
    assert.deepEqual(started, before);
    assert.notEqual(laterStart.activeRuntime, next.activeRuntime);
    assert.notEqual(laterStart.activeRuntime.run, next.activeRuntime.run);
});

test('completes the final session phase and stops overtime without completing the execution', () => {
    const started = startedRecord();
    const next = applyStartedSessionActionInRecord(
        started,
        sessionActionOptions(started, 'NEXT', 10_000),
    );
    const second = applyStartedSessionActionInRecord(
        next,
        sessionActionOptions(next, 'START', 11_000),
    );
    const complete = applyStartedSessionActionInRecord(
        second,
        sessionActionOptions(second, 'COMPLETE', 20_000),
    );
    assert.equal(complete.activeRuntime.run.stage, 'COMPLETED');
    assert.equal(complete.activeRuntime.clock.status, 'FINISHED');
    assert.equal(complete.activeRuntime.clock.deadlineMs, 20_000);
    assert.equal(complete.executions[0].execution.lifecycle, 'active');
    const stopped = applyStartedSessionActionInRecord(
        complete,
        sessionActionOptions(complete, 'STOP_OVERTIME', 25_000),
    );
    assert.equal(stopped.activeRuntime.run.stage, 'COMPLETED');
    assert.equal(stopped.activeRuntime.clock.status, 'OVERTIME_STOPPED');
    assert.equal(stopped.activeRuntime.clock.overtimeMs, 5000);
    assert.equal(stopped.executions[0].execution.lifecycle, 'active');
    assert.deepEqual(stopped.executions[0].execution.attempt, started.executions[0].execution.attempt);
});

test('uses session reconciliation for automatic phase catch-up before applying an action', () => {
    const automatic = startedRecord({
        currentPlan: { ...planned().currentPlan, transitionMode: 'automatic' },
    });
    const paused = applyStartedSessionActionInRecord(
        automatic,
        sessionActionOptions(automatic, 'PAUSE', 70_000),
    );
    assert.equal(paused.activeRuntime.run.currentIndex, 1);
    assert.equal(paused.activeRuntime.run.stage, 'PHASE');
    assert.equal(paused.activeRuntime.clock.status, 'PAUSED');
    assert.equal(paused.activeRuntime.clock.remainingMs, 112_000);
    assert.deepEqual(paused.activeRuntime.run.phaseOvertime, { 'phase-1': 0 });
});

test('rejects unsupported, inapplicable, stale, foreign and anomalous actions without mutation', () => {
    const started = startedRecord();
    const before = structuredClone(started);
    for (const actionType of ['TICK', 'PRIMARY', 'STOP_WORKSHOP', 'UNKNOWN']) {
        assert.throws(() => applyStartedSessionActionInRecord(
            started,
            sessionActionOptions(started, actionType, 3000),
        ), /invalidSessionAction/);
    }
    for (const [actionType, occurredAt] of [
        ['START', 3000],
        ['RESUME', 3000],
        ['COMPLETE', 3000],
        ['STOP_OVERTIME', 3000],
    ]) {
        assert.throws(() => applyStartedSessionActionInRecord(
            started,
            sessionActionOptions(started, actionType, occurredAt),
        ), /invalidSessionAction/);
    }
    for (const changes of [
        { expectedAggregateRevision: started.revision - 1 },
        { expectedExecutionRevision: 2 },
        { expectedRuntimeRevision: 1 },
        { expectedAttemptId: 'foreign-attempt' },
        { expectedRunId: 'foreign-run' },
        { occurredAt: -1 },
        { occurredAt: 1.5 },
        { occurredAt: 1000 },
    ]) assert.throws(() => applyStartedSessionActionInRecord(
        started,
        sessionActionOptions(started, 'PAUSE', 3000, changes),
    ));
    const overflow = { ...started, revision: Number.MAX_SAFE_INTEGER };
    assert.throws(() => applyStartedSessionActionInRecord(
        overflow,
        sessionActionOptions(overflow, 'PAUSE', 3000),
    ), /invalidStoreRevision/);
    assert.deepEqual(started, before);

    const automatic = startedRecord({
        currentPlan: { ...planned().currentPlan, transitionMode: 'automatic' },
    });
    for (const actionType of ['NEXT', 'COMPLETE']) {
        assert.throws(() => applyStartedSessionActionInRecord(
            automatic,
            sessionActionOptions(automatic, actionType, 3000),
        ), /invalidSessionAction/);
    }
});

test('suspends ACTIVE READY with a complete workshop-note snapshot and no checkpoint', () => {
    const ready = activatePlannedExecutionInRecord(
        record({ templates: [template()], executions: [entry(planned()), entry(planned('execution-2'))] }),
        activationOptions(),
    );
    const notes = completeWorkshopNotes();
    const before = structuredClone(ready);
    const notesBefore = structuredClone(notes);
    const result = suspendActiveExecutionInRecord(ready, suspendOptions(ready, 1500, notes));
    const suspended = result.executions[0];

    assert.equal(result.revision, ready.revision + 1);
    assert.equal(suspended.execution.lifecycle, 'suspended');
    assert.equal(suspended.execution.revision, ready.executions[0].execution.revision + 1);
    assert.equal(suspended.execution.runtimeRevision, ready.executions[0].execution.runtimeRevision + 1);
    assert.equal(suspended.execution.attempt, null);
    assert.equal(suspended.suspendedCheckpoint, null);
    assert.deepEqual(suspended.execution.workshopNotes, notes);
    assert.deepEqual(suspended.execution.currentPlan, ready.executions[0].execution.currentPlan);
    assert.deepEqual(result.templates, ready.templates);
    assert.deepEqual(result.executions[1], ready.executions[1]);
    assert.equal(result.activeRuntime, null);
    assert.deepEqual(ready, before);
    assert.deepEqual(notes, notesBefore);
    assert.notEqual(suspended.execution.workshopNotes, notes);
});

test('suspends ACTIVE STARTED by freezing the bound runtime and preserving attempt and plan', () => {
    const started = startedRecord();
    started.templates.push(template());
    started.executions.push(entry(planned('execution-2')));
    const notes = completeWorkshopNotes();
    const before = structuredClone(started);
    const result = suspendActiveExecutionInRecord(started, suspendOptions(started, 12_000, notes));
    const suspended = result.executions[0];

    assert.equal(result.revision, started.revision + 1);
    assert.equal(suspended.execution.lifecycle, 'suspended');
    assert.equal(suspended.execution.revision, before.executions[0].execution.revision + 1);
    assert.equal(suspended.execution.runtimeRevision, before.executions[0].execution.runtimeRevision + 1);
    assert.deepEqual(suspended.execution.attempt, before.executions[0].execution.attempt);
    assert.deepEqual(suspended.execution.attempt.startSnapshot, before.executions[0].execution.attempt.startSnapshot);
    assert.deepEqual(suspended.execution.currentPlan, before.executions[0].execution.currentPlan);
    assert.deepEqual(suspended.execution.workshopNotes, notes);
    assert.equal(suspended.suspendedCheckpoint.executionId, suspended.execution.id);
    assert.equal(suspended.suspendedCheckpoint.attemptId, suspended.execution.attempt.id);
    assert.equal(suspended.suspendedCheckpoint.run.runId, suspended.execution.attempt.runtimeRunId);
    assert.equal(suspended.suspendedCheckpoint.runtimeRevision, suspended.execution.runtimeRevision);
    assert.equal(suspended.suspendedCheckpoint.capturedAt, 12_000);
    assert.equal(suspended.suspendedCheckpoint.clock.status, 'PAUSED');
    assert.equal(suspended.suspendedCheckpoint.clock.remainingMs, 50_000);
    assert.equal(result.activeRuntime, null);
    assert.deepEqual(result.templates, before.templates);
    assert.deepEqual(result.executions[1], before.executions[1]);
    assert.deepEqual(started, before);
});

test('suspends started executions from every supported frozen state including completed sessions', () => {
    const started = startedRecord();
    const between = applyStartedSessionActionInRecord(
        started,
        sessionActionOptions(started, 'NEXT', 3000),
    );
    const paused = applyStartedSessionActionInRecord(
        started,
        sessionActionOptions(started, 'PAUSE', 3000),
    );
    const second = applyStartedSessionActionInRecord(
        between,
        sessionActionOptions(between, 'START', 4000),
    );
    const completed = applyStartedSessionActionInRecord(
        second,
        sessionActionOptions(second, 'COMPLETE', 5000),
    );
    const overtimePaused = applyStartedSessionActionInRecord(
        completed,
        sessionActionOptions(completed, 'PAUSE', 7000),
    );
    const overtimeStopped = applyStartedSessionActionInRecord(
        overtimePaused,
        sessionActionOptions(overtimePaused, 'STOP_OVERTIME', 8000),
    );
    for (const [source, suspendedAt, status, stage] of [
        [between, 3500, 'READY', 'PHASE'],
        [paused, 3500, 'PAUSED', 'PHASE'],
        [completed, 6000, 'OVERTIME_PAUSED', 'COMPLETED'],
        [overtimePaused, 7500, 'OVERTIME_PAUSED', 'COMPLETED'],
        [overtimeStopped, 8500, 'OVERTIME_STOPPED', 'COMPLETED'],
    ]) {
        const result = suspendActiveExecutionInRecord(
            source,
            suspendOptions(source, suspendedAt, completeWorkshopNotes()),
        );
        const suspended = result.executions[0];
        assert.equal(suspended.execution.lifecycle, 'suspended');
        assert.equal(suspended.suspendedCheckpoint.clock.status, status);
        assert.equal(suspended.suspendedCheckpoint.run.stage, stage);
        assert.equal(result.activeRuntime, null);
        assert.deepEqual(suspended.execution.attempt, source.executions[0].execution.attempt);
    }
});

test('rejects stale suspend requests, invalid notes, identities and times without mutation', () => {
    const started = startedRecord();
    const before = structuredClone(started);
    const notes = completeWorkshopNotes();
    for (const changes of [
        { expectedAggregateRevision: started.revision - 1 },
        { expectedExecutionRevision: started.executions[0].execution.revision - 1 },
        { expectedRuntimeRevision: started.executions[0].execution.runtimeRevision - 1 },
        { expectedAttemptId: 'foreign-attempt' },
        { expectedRunId: 'foreign-run' },
        { suspendedAt: -1 },
        { suspendedAt: 1.5 },
        { suspendedAt: 1000 },
        { workshopNotes: undefined },
        { workshopNotes: { rundown: '', phases: [{ phaseId: 'unknown', text: 'Invalid' }] } },
        { workshopNotes: { rundown: '', phases: [
            { phaseId: 'phase-1', text: 'One' },
            { phaseId: 'phase-1', text: 'Duplicate' },
        ] } },
    ]) assert.throws(() => suspendActiveExecutionInRecord(
        started,
        suspendOptions(started, 3000, notes, changes),
    ));
    const overflow = { ...started, revision: Number.MAX_SAFE_INTEGER };
    assert.throws(() => suspendActiveExecutionInRecord(
        overflow,
        suspendOptions(overflow, 3000, notes),
    ), /invalidStoreRevision/);
    const executionOverflow = {
        ...started,
        executions: [{
            ...started.executions[0],
            execution: { ...started.executions[0].execution, revision: Number.MAX_SAFE_INTEGER },
        }],
    };
    assert.throws(() => suspendActiveExecutionInRecord(
        executionOverflow,
        suspendOptions(executionOverflow, 3000, notes),
    ), /invalidRevision/);
    const suspended = suspendActiveExecutionInRecord(started, suspendOptions(started, 3000, notes));
    assert.throws(() => suspendActiveExecutionInRecord(
        suspended,
        {
            ...suspendOptions(started, 3000, notes),
            expectedAggregateRevision: suspended.revision,
            expectedExecutionRevision: suspended.executions[0].execution.revision,
            expectedRuntimeRevision: suspended.executions[0].execution.runtimeRevision,
        },
    ), /invalidLifecycle/);
    assert.deepEqual(started, before);
});

test('resumes SUSPENDED READY with a new explicit READY runtime and preserved notes', () => {
    const ready = activatePlannedExecutionInRecord(
        record({ templates: [template()], executions: [entry(planned()), entry(planned('execution-2'))] }),
        activationOptions(),
    );
    const suspended = suspendActiveExecutionInRecord(
        ready,
        suspendOptions(ready, 1500, completeWorkshopNotes()),
    );
    const before = structuredClone(suspended);
    const result = resumeSuspendedExecutionInRecord(suspended, resumeOptions(suspended, 50_000));
    const active = result.executions[0];

    assert.equal(result.revision, suspended.revision + 1);
    assert.equal(active.execution.lifecycle, 'active');
    assert.equal(active.execution.revision, suspended.executions[0].execution.revision + 1);
    assert.equal(active.execution.runtimeRevision, suspended.executions[0].execution.runtimeRevision + 1);
    assert.equal(active.execution.attempt, null);
    assert.equal(active.suspendedCheckpoint, null);
    assert.deepEqual(active.execution.currentPlan, suspended.executions[0].execution.currentPlan);
    assert.deepEqual(active.execution.workshopNotes, suspended.executions[0].execution.workshopNotes);
    assert.equal(result.activeRuntime.executionId, active.execution.id);
    assert.equal(result.activeRuntime.attemptId, null);
    assert.equal(result.activeRuntime.runtimeRevision, active.execution.runtimeRevision);
    assert.equal(result.activeRuntime.savedAt, 50_000);
    assert.equal(result.activeRuntime.run.runId, 'runtime-resumed');
    assert.equal(result.activeRuntime.clock.status, 'READY');
    assert.deepEqual(result.templates, suspended.templates);
    assert.deepEqual(result.executions[1], suspended.executions[1]);
    assert.deepEqual(suspended, before);
    assert.notEqual(active.execution, suspended.executions[0].execution);
    assert.notEqual(active.execution.currentPlan, suspended.executions[0].execution.currentPlan);
    assert.notEqual(active.execution.workshopNotes, suspended.executions[0].execution.workshopNotes);
});

test('resumes SUSPENDED STARTED without advancing its frozen runtime or replacing its attempt', () => {
    const started = startedRecord();
    const paused = applyStartedSessionActionInRecord(
        started,
        sessionActionOptions(started, 'PAUSE', 12_000),
    );
    const suspended = suspendActiveExecutionInRecord(
        paused,
        suspendOptions(paused, 13_000, completeWorkshopNotes()),
    );
    const before = structuredClone(suspended);
    const checkpoint = suspended.executions[0].suspendedCheckpoint;
    const result = resumeSuspendedExecutionInRecord(suspended, resumeOptions(suspended, 1_000_000));
    const active = result.executions[0];

    assert.equal(result.revision, suspended.revision + 1);
    assert.equal(active.execution.lifecycle, 'active');
    assert.equal(active.execution.revision, suspended.executions[0].execution.revision + 1);
    assert.equal(active.execution.runtimeRevision, suspended.executions[0].execution.runtimeRevision + 1);
    assert.equal(active.suspendedCheckpoint, null);
    assert.deepEqual(active.execution.attempt, suspended.executions[0].execution.attempt);
    assert.deepEqual(active.execution.attempt.startSnapshot, suspended.executions[0].execution.attempt.startSnapshot);
    assert.deepEqual(active.execution.currentPlan, suspended.executions[0].execution.currentPlan);
    assert.deepEqual(active.execution.workshopNotes, suspended.executions[0].execution.workshopNotes);
    assert.equal(result.activeRuntime.executionId, active.execution.id);
    assert.equal(result.activeRuntime.attemptId, active.execution.attempt.id);
    assert.equal(result.activeRuntime.runtimeRevision, active.execution.runtimeRevision);
    assert.equal(result.activeRuntime.savedAt, 1_000_000);
    assert.equal(result.activeRuntime.run.runId, checkpoint.run.runId);
    assert.deepEqual(result.activeRuntime.run, checkpoint.run);
    assert.deepEqual(result.activeRuntime.clock, checkpoint.clock);
    assert.equal(result.activeRuntime.clock.status, 'PAUSED');
    assert.equal(result.activeRuntime.clock.remainingMs, 50_000);
    assert.deepEqual(suspended, before);
    assert.notEqual(active.execution.attempt, suspended.executions[0].execution.attempt);
    assert.notEqual(
        active.execution.attempt.startSnapshot,
        suspended.executions[0].execution.attempt.startSnapshot,
    );
    assert.notEqual(result.activeRuntime.run, checkpoint.run);
    assert.notEqual(result.activeRuntime.clock, checkpoint.clock);
});

test('resumes all supported started checkpoints including between-phase and completed runtimes', () => {
    const started = startedRecord();
    const between = applyStartedSessionActionInRecord(
        started,
        sessionActionOptions(started, 'NEXT', 3000),
    );
    const paused = applyStartedSessionActionInRecord(
        started,
        sessionActionOptions(started, 'PAUSE', 3000),
    );
    const second = applyStartedSessionActionInRecord(
        between,
        sessionActionOptions(between, 'START', 4000),
    );
    const completed = applyStartedSessionActionInRecord(
        second,
        sessionActionOptions(second, 'COMPLETE', 5000),
    );
    const overtimePaused = applyStartedSessionActionInRecord(
        completed,
        sessionActionOptions(completed, 'PAUSE', 7000),
    );
    const overtimeStopped = applyStartedSessionActionInRecord(
        overtimePaused,
        sessionActionOptions(overtimePaused, 'STOP_OVERTIME', 8000),
    );
    for (const [source, suspendedAt, resumedAt, status, stage] of [
        [between, 3500, 100_000, 'READY', 'PHASE'],
        [paused, 3500, 100_000, 'PAUSED', 'PHASE'],
        [completed, 6000, 100_000, 'OVERTIME_PAUSED', 'COMPLETED'],
        [overtimePaused, 7500, 100_000, 'OVERTIME_PAUSED', 'COMPLETED'],
        [overtimeStopped, 8500, 100_000, 'OVERTIME_STOPPED', 'COMPLETED'],
    ]) {
        const suspended = suspendActiveExecutionInRecord(
            source,
            suspendOptions(source, suspendedAt, completeWorkshopNotes()),
        );
        const checkpoint = suspended.executions[0].suspendedCheckpoint;
        const resumed = resumeSuspendedExecutionInRecord(suspended, resumeOptions(suspended, resumedAt));
        assert.equal(resumed.activeRuntime.clock.status, status);
        assert.equal(resumed.activeRuntime.run.stage, stage);
        assert.deepEqual(resumed.activeRuntime.clock, checkpoint.clock);
        assert.equal(resumed.executions[0].suspendedCheckpoint, null);
        assert.deepEqual(resumed.executions[0].execution.attempt, source.executions[0].execution.attempt);
    }
});

test('rejects invalid resume identities, lifecycles, times, run IDs and revisions without mutation', () => {
    const started = startedRecord();
    const suspended = suspendActiveExecutionInRecord(
        started,
        suspendOptions(started, 3000, completeWorkshopNotes()),
    );
    const before = structuredClone(suspended);
    for (const changes of [
        { expectedAggregateRevision: suspended.revision - 1 },
        { expectedExecutionRevision: suspended.executions[0].execution.revision - 1 },
        { expectedRuntimeRevision: suspended.executions[0].execution.runtimeRevision - 1 },
        { expectedAttemptId: 'foreign-attempt' },
        { expectedRunId: 'foreign-run' },
        { runtimeRunId: 'forbidden-new-run' },
        { resumedAt: -1 },
        { resumedAt: 1.5 },
        { resumedAt: 2999 },
    ]) assert.throws(() => resumeSuspendedExecutionInRecord(
        suspended,
        resumeOptions(suspended, 4000, changes),
    ));

    const ready = activatePlannedExecutionInRecord(
        record({ executions: [entry(planned())] }),
        activationOptions(),
    );
    const suspendedReady = suspendActiveExecutionInRecord(
        ready,
        suspendOptions(ready, 1500, completeWorkshopNotes()),
    );
    for (const changes of [
        { expectedAttemptId: 'unexpected' },
        { expectedRunId: 'unexpected' },
        { runtimeRunId: undefined },
        { runtimeRunId: '' },
    ]) assert.throws(() => resumeSuspendedExecutionInRecord(
        suspendedReady,
        resumeOptions(suspendedReady, 2000, changes),
    ));

    const overflow = { ...suspended, revision: Number.MAX_SAFE_INTEGER };
    assert.throws(() => resumeSuspendedExecutionInRecord(
        overflow,
        resumeOptions(overflow, 4000),
    ), /invalidStoreRevision/);
    const executionOverflow = {
        ...suspended,
        executions: [{
            ...suspended.executions[0],
            execution: { ...suspended.executions[0].execution, revision: Number.MAX_SAFE_INTEGER },
        }],
    };
    assert.throws(() => resumeSuspendedExecutionInRecord(
        executionOverflow,
        resumeOptions(executionOverflow, 4000),
    ), /invalidRevision/);
    assert.throws(() => resumeSuspendedExecutionInRecord(
        record({ executions: [entry(planned())] }),
        {
            executionId: 'execution-1', expectedAggregateRevision: 0,
            expectedExecutionRevision: 1, expectedRuntimeRevision: 0,
            expectedAttemptId: null, expectedRunId: null,
            runtimeRunId: 'runtime-resumed', resumedAt: 2000,
        },
    ), /invalidLifecycle/);

    const otherReady = activatePlannedExecutionInRecord(
        record({ executions: [entry(planned('active-other'))] }),
        activationOptions({ executionId: 'active-other' }),
    );
    const withOtherActive = {
        ...suspended,
        executions: [...suspended.executions, otherReady.executions[0]],
        activeRuntime: otherReady.activeRuntime,
    };
    assert.throws(() => resumeSuspendedExecutionInRecord(
        withOtherActive,
        resumeOptions(withOtherActive, 4000),
    ), /activeExecutionExists/);
    assert.deepEqual(suspended, before);
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

test('persists READY, first START and later session actions while active-timer ownership remains held', async () => {
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
    await assert.rejects(writer.write(current => startReadyExecutionInRecord(current, startOptions({
        expectedAggregateRevision: 8,
        startedAt: current.activeRuntime.savedAt - 1,
    }))), /CLOCK_ANOMALY/);
    assert.equal(storage.state.writes, 1);
    assert.equal(activeLock.held, true);
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

    let current = startedRecord;
    for (const [actionType, occurredAt, expectedStatus] of [
        ['PAUSE', 12_000, 'PAUSED'],
        ['RESUME', 20_000, 'RUNNING'],
        ['NEXT', 30_000, 'READY'],
        ['START', 31_000, 'RUNNING'],
    ]) {
        const previous = current;
        current = await writer.write(loaded => {
            assert.equal(activeLock.held, true);
            return applyStartedSessionActionInRecord(
                loaded,
                sessionActionOptions(loaded, actionType, occurredAt),
            );
        });
        assert.equal(activeLock.held, true);
        assert.equal(current.revision, previous.revision + 1);
        assert.equal(current.activeRuntime.clock.status, expectedStatus);
        assert.equal(current.executions[0].execution.attempt.id, 'attempt-1');
        assert.equal(current.executions[0].execution.attempt.runtimeRunId, 'runtime-ready-1');
        assert.equal(current.activeRuntime.run.runId, 'runtime-ready-1');
    }
    assert.equal(storage.state.writes, 6);
    assert.deepEqual(await writer.read(), current);
    await assert.rejects(writer.write(loaded => applyStartedSessionActionInRecord(
        loaded,
        sessionActionOptions(loaded, 'RESUME', 32_000),
    )), /invalidSessionAction/);
    assert.equal(storage.state.writes, 6);
    assert.equal(activeLock.held, true);
    assert.equal(await activeLock.release(), true);
    assert.equal(activeLock.held, false);
    assert.equal(locks.held.size, 0);
});

test('persists a complete suspend under ownership and retains ownership after a quota failure', async () => {
    const initial = record({ revision: 20, templates: [template()], executions: [entry(planned())] });
    const storage = memory(JSON.stringify(initial));
    const locks = aggregateLockManager();
    const activeLock = createEditorActiveTimerLock({ locks });
    const writer = createEditorStoreWriter({ getStorage: () => storage, locks });
    const notes = completeWorkshopNotes();

    await activeLock.claim();
    const ready = await writer.write(current => activatePlannedExecutionInRecord(current, activationOptions({
        expectedAggregateRevision: 20,
    })));
    const started = await writer.write(current => startReadyExecutionInRecord(current, startOptions({
        expectedAggregateRevision: ready.revision,
    })));
    const paused = await writer.write(current => applyStartedSessionActionInRecord(
        current,
        sessionActionOptions(current, 'PAUSE', 12_000),
    ));
    const suspended = await writer.write(current => {
        assert.equal(activeLock.held, true);
        return suspendActiveExecutionInRecord(current, suspendOptions(current, 13_000, notes));
    });
    assert.equal(activeLock.held, true);
    assert.equal(suspended.revision, paused.revision + 1);
    assert.equal(suspended.activeRuntime, null);
    assert.equal(suspended.executions[0].execution.lifecycle, 'suspended');
    assert.deepEqual(suspended.executions[0].execution.workshopNotes, notes);
    assert.equal(suspended.executions[0].suspendedCheckpoint.clock.status, 'PAUSED');
    assert.deepEqual(await writer.read(), suspended);
    assert.equal(activeLock.held, true);
    assert.equal(await activeLock.release(), true);
    assert.equal(locks.held.size, 0);

    const frozen = structuredClone(suspended.executions[0].suspendedCheckpoint);
    await activeLock.claim();
    const resumed = await writer.write(current => resumeSuspendedExecutionInRecord(
        current,
        resumeOptions(current, 1_000_000),
    ));
    assert.equal(activeLock.held, true);
    assert.equal(resumed.activeRuntime.savedAt, 1_000_000);
    assert.deepEqual(resumed.activeRuntime.run, frozen.run);
    assert.deepEqual(resumed.activeRuntime.clock, frozen.clock);
    assert.deepEqual(resumed.executions[0].execution.attempt, suspended.executions[0].execution.attempt);
    assert.deepEqual(resumed.executions[0].execution.workshopNotes, notes);
    assert.equal(resumed.executions[0].suspendedCheckpoint, null);
    assert.deepEqual(await writer.read(), resumed);
    assert.equal(activeLock.held, true);
    assert.equal(await activeLock.release(), true);
    assert.equal(locks.held.size, 0);

    const failingStorage = memory(JSON.stringify(paused));
    const failingLocks = aggregateLockManager();
    const failingActiveLock = createEditorActiveTimerLock({ locks: failingLocks });
    const failingWriter = createEditorStoreWriter({ getStorage: () => failingStorage, locks: failingLocks });
    const originalRaw = failingStorage.values.get(EDITOR_STORAGE_KEY);
    await failingActiveLock.claim();
    failingStorage.state.failWrite = 'QuotaExceededError';
    await assert.rejects(failingWriter.write(current => suspendActiveExecutionInRecord(
        current,
        suspendOptions(current, 13_000, notes),
    )), /storageQuota/);
    assert.equal(failingStorage.state.writes, 0);
    assert.equal(failingStorage.values.get(EDITOR_STORAGE_KEY), originalRaw);
    assert.equal(failingActiveLock.held, true);
    assert.equal(await failingActiveLock.release(), true);
    assert.equal(failingLocks.held.size, 0);

    const failingResumeStorage = memory(JSON.stringify(suspended));
    const failingResumeLocks = aggregateLockManager();
    const failingResumeActiveLock = createEditorActiveTimerLock({ locks: failingResumeLocks });
    const failingResumeWriter = createEditorStoreWriter({
        getStorage: () => failingResumeStorage,
        locks: failingResumeLocks,
    });
    const suspendedRaw = failingResumeStorage.values.get(EDITOR_STORAGE_KEY);
    await failingResumeActiveLock.claim();
    failingResumeStorage.state.failWrite = 'QuotaExceededError';
    await assert.rejects(failingResumeWriter.write(current => resumeSuspendedExecutionInRecord(
        current,
        resumeOptions(current, 1_000_000),
    )), /storageQuota/);
    assert.equal(failingResumeStorage.state.writes, 0);
    assert.equal(failingResumeStorage.values.get(EDITOR_STORAGE_KEY), suspendedRaw);
    assert.equal(failingResumeActiveLock.held, true);
    assert.equal(await failingResumeActiveLock.release(), true);
    assert.equal(failingResumeLocks.held.size, 0);
});

test('persists a READY suspend and resume with a fresh run under reacquired ownership', async () => {
    const initial = record({ revision: 30, executions: [entry(planned())] });
    const storage = memory(JSON.stringify(initial));
    const locks = aggregateLockManager();
    const activeLock = createEditorActiveTimerLock({ locks });
    const writer = createEditorStoreWriter({ getStorage: () => storage, locks });

    await activeLock.claim();
    const ready = await writer.write(current => activatePlannedExecutionInRecord(current, activationOptions({
        expectedAggregateRevision: 30,
        runtimeRunId: 'runtime-before-ready-suspend',
    })));
    const suspended = await writer.write(current => suspendActiveExecutionInRecord(
        current,
        suspendOptions(current, 2000, completeWorkshopNotes()),
    ));
    assert.equal(suspended.executions[0].execution.attempt, null);
    assert.equal(suspended.executions[0].suspendedCheckpoint, null);
    assert.equal(suspended.activeRuntime, null);
    assert.deepEqual(await writer.read(), suspended);
    await activeLock.release();

    await activeLock.claim();
    const resumed = await writer.write(current => resumeSuspendedExecutionInRecord(
        current,
        resumeOptions(current, 50_000, { runtimeRunId: 'runtime-after-ready-resume' }),
    ));
    assert.equal(activeLock.held, true);
    assert.equal(resumed.executions[0].execution.attempt, null);
    assert.equal(resumed.executions[0].suspendedCheckpoint, null);
    assert.equal(resumed.activeRuntime.run.runId, 'runtime-after-ready-resume');
    assert.equal(resumed.activeRuntime.clock.status, 'READY');
    assert.deepEqual(resumed.executions[0].execution.workshopNotes, completeWorkshopNotes());
    assert.deepEqual(await writer.read(), resumed);
    await activeLock.release();
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
        const observed = transitionSession(state.run, state.clock, { type: 'TICK' }, savedAt);
        const beforeAction = recordExecutionPhaseOutcomes(execution, observed.run, observed.clock);
        const captured = recordExecutionPhaseOutcomes(beforeAction, current.run, current.clock);
        const valid = validateEditorStoreRecord(record({
            executions: [entry(captured)],
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
