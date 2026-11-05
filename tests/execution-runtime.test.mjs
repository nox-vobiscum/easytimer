import test from 'node:test';
import assert from 'node:assert/strict';
import {
    activatePlannedExecution,
    createPlannedExecution,
    startActiveExecution,
} from '../src/js/editor-domain.mjs';
import {
    EXECUTION_RUNTIME_CHECKPOINT_KIND,
    EXECUTION_RUNTIME_CHECKPOINT_SCHEMA_VERSION,
    captureExecutionRuntimeCheckpoint,
    validateExecutionRuntimeCheckpoint,
} from '../src/js/execution-runtime.mjs';
import { prepareSession, transitionSession } from '../src/js/session.mjs';

const plan = (transitionMode = 'manual') => ({
    name: 'Workshop',
    transitionMode,
    phases: [
        { id: 'phase-1', title: 'Opening', durationSeconds: 60 },
        { id: 'phase-2', title: 'Discussion', durationSeconds: 120 },
        { id: 'phase-3', title: 'Closing', durationSeconds: 60 },
    ],
});

const template = (transitionMode = 'manual') => ({
    schemaVersion: 2,
    kind: 'template',
    id: 'template-1',
    revision: 1,
    plan: plan(transitionMode),
});

const startedExecution = (transitionMode = 'manual') => startActiveExecution(
    activatePlannedExecution(createPlannedExecution(template(transitionMode), 'execution-1')),
    'attempt-1',
    1000,
);

const runtimeTemplate = transitionMode => ({
    id: 'legacy-runtime-source',
    name: 'Workshop',
    transitionMode,
    phases: plan(transitionMode).phases,
});

const runtime = (transitionMode = 'manual', runId = 'runtime-run-distinct-from-domain-ids') =>
    prepareSession(runtimeTemplate(transitionMode), runId);

const act = (state, type, now) => transitionSession(state.run, state.clock, { type }, now);

test('running runtime is reconciled and frozen as PAUSED with explicit domain bindings', () => {
    const execution = startedExecution();
    const running = act(runtime(), 'START', 1000);
    const executionBefore = structuredClone(execution);
    const runtimeBefore = structuredClone(running);
    const checkpoint = captureExecutionRuntimeCheckpoint(execution, running.run, running.clock, 21_000);
    assert.equal(checkpoint.schemaVersion, EXECUTION_RUNTIME_CHECKPOINT_SCHEMA_VERSION);
    assert.equal(checkpoint.kind, EXECUTION_RUNTIME_CHECKPOINT_KIND);
    assert.equal(checkpoint.executionId, execution.id);
    assert.equal(checkpoint.attemptId, execution.attempt.id);
    assert.equal(checkpoint.runtimeRevision, execution.runtimeRevision);
    assert.equal(checkpoint.capturedAt, 21_000);
    assert.equal(checkpoint.run.runId, 'runtime-run-distinct-from-domain-ids');
    assert.notEqual(checkpoint.run.runId, checkpoint.executionId);
    assert.notEqual(checkpoint.run.runId, checkpoint.attemptId);
    assert.equal(checkpoint.clock.status, 'PAUSED');
    assert.equal(checkpoint.clock.remainingMs, 40_000);
    assert.equal(checkpoint.clock.deadlineMs, null);
    assert.deepEqual(validateExecutionRuntimeCheckpoint(checkpoint, execution), checkpoint);
    assert.deepEqual(execution, executionBefore);
    assert.deepEqual(running, runtimeBefore);
    assert.notEqual(checkpoint.run, running.run);
    assert.notEqual(checkpoint.run.phases, running.run.phases);
    assert.notEqual(checkpoint.clock, running.clock);
});

test('manual phase overtime freezes from FINISHED to OVERTIME_PAUSED', () => {
    const execution = startedExecution();
    const running = act(runtime(), 'START', 1000);
    const checkpoint = captureExecutionRuntimeCheckpoint(execution, running.run, running.clock, 66_000);
    assert.equal(checkpoint.clock.status, 'OVERTIME_PAUSED');
    assert.equal(checkpoint.clock.remainingMs, 0);
    assert.equal(checkpoint.clock.overtimeMs, 5000);
    assert.equal(checkpoint.clock.deadlineMs, null);
});

test('automatic runtime catches up across phases before freezing without callback drift', () => {
    const execution = startedExecution('automatic');
    const running = act(runtime('automatic'), 'START', 1000);
    const checkpoint = captureExecutionRuntimeCheckpoint(execution, running.run, running.clock, 91_000);
    assert.equal(checkpoint.run.currentIndex, 1);
    assert.deepEqual(checkpoint.run.phaseOvertime, { 'phase-1': 0 });
    assert.equal(checkpoint.clock.status, 'PAUSED');
    assert.equal(checkpoint.clock.remainingMs, 90_000);
    assert.equal(checkpoint.clock.deadlineMs, null);
});

test('already frozen phase and overtime states remain unchanged', () => {
    const execution = startedExecution();
    const running = act(runtime(), 'START', 1000);
    const paused = act(running, 'PAUSE', 11_000);
    const frozenPause = captureExecutionRuntimeCheckpoint(execution, paused.run, paused.clock, 9_000_000);
    assert.deepEqual(frozenPause.clock, paused.clock);

    const overtimePaused = act(running, 'PAUSE', 66_000);
    const frozenOvertime = captureExecutionRuntimeCheckpoint(execution, overtimePaused.run, overtimePaused.clock, 9_000_000);
    assert.deepEqual(frozenOvertime.clock, overtimePaused.clock);
});

test('terminal overtime remains stopped', () => {
    const execution = startedExecution();
    let state = act(runtime(), 'NEXT', 1000);
    state = act(state, 'NEXT', 1000);
    state = act(state, 'COMPLETE', 2000);
    state = act(state, 'STOP_OVERTIME', 7000);
    const checkpoint = captureExecutionRuntimeCheckpoint(execution, state.run, state.clock, 9_000_000);
    assert.equal(checkpoint.run.stage, 'COMPLETED');
    assert.equal(checkpoint.clock.status, 'OVERTIME_STOPPED');
    assert.equal(checkpoint.clock.overtimeMs, 5000);
    assert.equal(checkpoint.clock.deadlineMs, null);
});

test('between-phase READY remains READY instead of becoming artificially paused', () => {
    const execution = startedExecution();
    let state = act(runtime(), 'START', 1000);
    state = act(state, 'NEXT', 21_000);
    const checkpoint = captureExecutionRuntimeCheckpoint(execution, state.run, state.clock, 9_000_000);
    assert.equal(checkpoint.run.currentIndex, 1);
    assert.equal(checkpoint.clock.status, 'READY');
    assert.equal(checkpoint.clock.remainingMs, 120_000);
    assert.equal(checkpoint.clock.deadlineMs, null);
});

test('checkpoint validation rejects invalid execution, bindings and runtime data', () => {
    const execution = startedExecution();
    const running = act(runtime(), 'START', 1000);
    const checkpoint = captureExecutionRuntimeCheckpoint(execution, running.run, running.clock, 21_000);
    const planned = createPlannedExecution(template(), 'planned-execution');
    assert.throws(() => captureExecutionRuntimeCheckpoint(planned, running.run, running.clock, 21_000), /invalidLifecycle/);
    for (const change of [
        value => { value.executionId = 'another-execution'; },
        value => { value.attemptId = 'another-attempt'; },
        value => { value.runtimeRevision += 1; },
    ]) {
        const invalid = structuredClone(checkpoint);
        change(invalid);
        assert.throws(() => validateExecutionRuntimeCheckpoint(invalid, execution), /invalidCheckpointBinding/);
    }
    const invalidRuntime = structuredClone(checkpoint);
    invalidRuntime.clock.durationMs = 120_000;
    assert.throws(() => validateExecutionRuntimeCheckpoint(invalidRuntime, execution), /INVALID_SESSION_CLOCK/);
});

test('checkpoint validation rejects otherwise consistent running and finished clocks', () => {
    const execution = startedExecution();
    const started = act(runtime(), 'START', 1000);
    const base = captureExecutionRuntimeCheckpoint(execution, started.run, started.clock, 21_000);
    const running = act(started, 'TICK', 21_000);
    assert.throws(() => validateExecutionRuntimeCheckpoint({
        ...base,
        run: running.run,
        clock: running.clock,
    }, execution), /invalidCheckpointClock/);

    const finished = act(started, 'TICK', 66_000);
    assert.throws(() => validateExecutionRuntimeCheckpoint({
        ...base,
        capturedAt: 66_000,
        run: finished.run,
        clock: finished.clock,
    }, execution), /invalidCheckpointClock/);
});

test('checkpoint validation accepts every supported frozen clock status', () => {
    const execution = startedExecution();
    const started = act(runtime(), 'START', 1000);
    const paused = act(started, 'PAUSE', 11_000);
    const overtimePaused = act(started, 'PAUSE', 66_000);
    let stopped = act(runtime(), 'NEXT', 1000);
    stopped = act(stopped, 'NEXT', 1000);
    stopped = act(stopped, 'COMPLETE', 2000);
    stopped = act(stopped, 'STOP_OVERTIME', 7000);
    const ready = act(started, 'NEXT', 21_000);
    for (const [state, now, status] of [
        [ready, 21_000, 'READY'],
        [paused, 11_000, 'PAUSED'],
        [overtimePaused, 66_000, 'OVERTIME_PAUSED'],
        [stopped, 7000, 'OVERTIME_STOPPED'],
    ]) {
        const checkpoint = captureExecutionRuntimeCheckpoint(execution, state.run, state.clock, now);
        assert.equal(checkpoint.clock.status, status);
        assert.deepEqual(validateExecutionRuntimeCheckpoint(checkpoint, execution), checkpoint);
    }
});

test('capturing never changes the attempt, its start snapshot or a later current plan', () => {
    const execution = startedExecution();
    execution.currentPlan.name = 'Current plan changed after first start';
    execution.currentPlan.phases[0].notes = 'Current prepared information';
    const before = structuredClone(execution);
    const running = act(runtime(), 'START', 1000);
    const checkpoint = captureExecutionRuntimeCheckpoint(execution, running.run, running.clock, 21_000);
    assert.deepEqual(execution, before);
    assert.equal(execution.attempt.startSnapshot.name, 'Workshop');
    assert.equal(execution.attempt.startSnapshot.phases[0].notes, '');
    assert.equal(execution.currentPlan.name, 'Current plan changed after first start');
    checkpoint.run.phases[0].title = 'Checkpoint-only mutation';
    assert.equal(running.run.phases[0].title, 'Opening');
    assert.deepEqual(execution.attempt, before.attempt);
});
