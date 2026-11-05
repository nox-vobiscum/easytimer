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
    resumeStartedExecutionWithCheckpoint,
    suspendStartedExecutionWithCheckpoint,
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

test('started execution and frozen checkpoint suspend as one consistently rebound result', () => {
    const execution = startedExecution();
    execution.currentPlan.name = 'Current execution plan';
    execution.workshopNotes = {
        rundown: 'Saved observation',
        phases: [{ phaseId: 'phase-1', text: 'Saved phase observation' }],
    };
    const running = act(runtime(), 'START', 1000);
    const checkpoint = captureExecutionRuntimeCheckpoint(execution, running.run, running.clock, 21_000);
    const executionBefore = structuredClone(execution);
    const checkpointBefore = structuredClone(checkpoint);
    const result = suspendStartedExecutionWithCheckpoint(execution, checkpoint);
    assert.equal(result.execution.lifecycle, 'suspended');
    assert.equal(result.execution.revision, execution.revision + 1);
    assert.equal(result.execution.runtimeRevision, execution.runtimeRevision + 1);
    assert.equal(result.checkpoint.runtimeRevision, result.execution.runtimeRevision);
    assert.equal(result.checkpoint.executionId, execution.id);
    assert.equal(result.checkpoint.attemptId, execution.attempt.id);
    assert.equal(result.checkpoint.capturedAt, checkpoint.capturedAt);
    assert.deepEqual(result.checkpoint.run, checkpoint.run);
    assert.deepEqual(result.checkpoint.clock, checkpoint.clock);
    assert.deepEqual(result.execution.currentPlan, execution.currentPlan);
    assert.deepEqual(result.execution.workshopNotes, execution.workshopNotes);
    assert.deepEqual(result.execution.attempt, execution.attempt);
    assert.deepEqual(validateExecutionRuntimeCheckpoint(result.checkpoint, result.execution), result.checkpoint);
    assert.deepEqual(execution, executionBefore);
    assert.deepEqual(checkpoint, checkpointBefore);
    assert.notEqual(result.execution.currentPlan, execution.currentPlan);
    assert.notEqual(result.execution.workshopNotes, execution.workshopNotes);
    assert.notEqual(result.execution.attempt, execution.attempt);
    assert.notEqual(result.execution.attempt.startSnapshot, execution.attempt.startSnapshot);
    assert.notEqual(result.checkpoint.run, checkpoint.run);
    assert.notEqual(result.checkpoint.clock, checkpoint.clock);
});

test('suspending with a checkpoint preserves every supported frozen clock status', () => {
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
        const result = suspendStartedExecutionWithCheckpoint(execution, checkpoint);
        assert.equal(result.checkpoint.clock.status, status);
        assert.deepEqual(result.checkpoint.run, checkpoint.run);
        assert.deepEqual(result.checkpoint.clock, checkpoint.clock);
    }
});

test('suspending with a checkpoint rejects stale, foreign and invalid execution inputs', () => {
    const execution = startedExecution();
    const running = act(runtime(), 'START', 1000);
    const checkpoint = captureExecutionRuntimeCheckpoint(execution, running.run, running.clock, 21_000);
    for (const change of [
        value => { value.runtimeRevision -= 1; },
        value => { value.executionId = 'foreign-execution'; },
        value => { value.attemptId = 'foreign-attempt'; },
    ]) {
        const invalid = structuredClone(checkpoint);
        change(invalid);
        assert.throws(() => suspendStartedExecutionWithCheckpoint(execution, invalid), /invalidCheckpointBinding/);
    }
    const ready = activatePlannedExecution(createPlannedExecution(template(), 'ready-execution'));
    assert.throws(() => suspendStartedExecutionWithCheckpoint(ready, checkpoint), /invalidAttempt/);
    assert.throws(() => suspendStartedExecutionWithCheckpoint({ ...execution, lifecycle: 'planned' }, checkpoint), /invalidLifecycle/);
    assert.throws(() => suspendStartedExecutionWithCheckpoint({
        ...execution,
        revision: Number.MAX_SAFE_INTEGER,
    }, checkpoint), /invalidRevision/);
});

test('suspended execution and checkpoint resume together without advancing frozen runtime', () => {
    const execution = startedExecution();
    execution.currentPlan.name = 'Current execution plan';
    execution.workshopNotes = {
        rundown: 'Saved observation',
        phases: [{ phaseId: 'phase-1', text: 'Saved phase observation' }],
    };
    const running = act(runtime(), 'START', 1000);
    const checkpoint = captureExecutionRuntimeCheckpoint(execution, running.run, running.clock, 21_000);
    const suspended = suspendStartedExecutionWithCheckpoint(execution, checkpoint);
    const executionBefore = structuredClone(suspended.execution);
    const checkpointBefore = structuredClone(suspended.checkpoint);
    const result = resumeStartedExecutionWithCheckpoint(suspended.execution, suspended.checkpoint);
    assert.equal(result.execution.lifecycle, 'active');
    assert.equal(result.execution.revision, suspended.execution.revision + 1);
    assert.equal(result.execution.runtimeRevision, suspended.execution.runtimeRevision + 1);
    assert.equal(result.checkpoint.runtimeRevision, result.execution.runtimeRevision);
    assert.equal(result.checkpoint.executionId, execution.id);
    assert.equal(result.checkpoint.attemptId, execution.attempt.id);
    assert.equal(result.checkpoint.capturedAt, suspended.checkpoint.capturedAt);
    assert.deepEqual(result.checkpoint.run, suspended.checkpoint.run);
    assert.deepEqual(result.checkpoint.clock, suspended.checkpoint.clock);
    assert.deepEqual(result.execution.currentPlan, execution.currentPlan);
    assert.deepEqual(result.execution.workshopNotes, execution.workshopNotes);
    assert.deepEqual(result.execution.attempt, execution.attempt);
    assert.deepEqual(validateExecutionRuntimeCheckpoint(result.checkpoint, result.execution), result.checkpoint);
    assert.deepEqual(suspended.execution, executionBefore);
    assert.deepEqual(suspended.checkpoint, checkpointBefore);
    assert.notEqual(result.execution.currentPlan, suspended.execution.currentPlan);
    assert.notEqual(result.execution.workshopNotes, suspended.execution.workshopNotes);
    assert.notEqual(result.execution.attempt, suspended.execution.attempt);
    assert.notEqual(result.execution.attempt.startSnapshot, suspended.execution.attempt.startSnapshot);
    assert.notEqual(result.checkpoint.run, suspended.checkpoint.run);
    assert.notEqual(result.checkpoint.clock, suspended.checkpoint.clock);
});

test('resuming with a checkpoint preserves every supported frozen clock status', () => {
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
        const suspended = suspendStartedExecutionWithCheckpoint(execution, checkpoint);
        const result = resumeStartedExecutionWithCheckpoint(suspended.execution, suspended.checkpoint);
        assert.equal(result.checkpoint.clock.status, status);
        assert.equal(result.checkpoint.capturedAt, checkpoint.capturedAt);
        assert.deepEqual(result.checkpoint.run, checkpoint.run);
        assert.deepEqual(result.checkpoint.clock, checkpoint.clock);
    }
});

test('resuming with a checkpoint rejects stale, foreign and invalid lifecycle inputs', () => {
    const execution = startedExecution();
    const running = act(runtime(), 'START', 1000);
    const checkpoint = captureExecutionRuntimeCheckpoint(execution, running.run, running.clock, 21_000);
    const suspended = suspendStartedExecutionWithCheckpoint(execution, checkpoint);
    for (const change of [
        value => { value.runtimeRevision -= 1; },
        value => { value.executionId = 'foreign-execution'; },
        value => { value.attemptId = 'foreign-attempt'; },
    ]) {
        const invalid = structuredClone(suspended.checkpoint);
        change(invalid);
        assert.throws(() => resumeStartedExecutionWithCheckpoint(suspended.execution, invalid), /invalidCheckpointBinding/);
    }
    const ready = activatePlannedExecution(createPlannedExecution(template(), 'ready-execution'));
    assert.throws(() => resumeStartedExecutionWithCheckpoint({ ...ready, lifecycle: 'suspended' }, checkpoint), /invalidAttempt/);
    assert.throws(() => resumeStartedExecutionWithCheckpoint(execution, checkpoint), /invalidLifecycle/);
    assert.throws(() => resumeStartedExecutionWithCheckpoint({ ...execution, lifecycle: 'planned' }, checkpoint), /invalidLifecycle/);
    assert.throws(() => resumeStartedExecutionWithCheckpoint({ ...execution, lifecycle: 'completed' }, checkpoint), /invalidLifecycle/);
    assert.throws(() => resumeStartedExecutionWithCheckpoint({
        ...suspended.execution,
        revision: Number.MAX_SAFE_INTEGER,
    }, suspended.checkpoint), /invalidRevision/);
});

test('pure suspend and resume roundtrip preserves execution content and all frozen runtime data', () => {
    const execution = startedExecution();
    execution.currentPlan.name = 'Adapted current plan';
    execution.workshopNotes = {
        rundown: 'Roundtrip observation',
        phases: [{ phaseId: 'phase-2', text: 'Roundtrip phase observation' }],
    };
    const paused = act(act(runtime(), 'START', 1000), 'PAUSE', 31_000);
    const checkpoint = captureExecutionRuntimeCheckpoint(execution, paused.run, paused.clock, 31_000);
    const suspended = suspendStartedExecutionWithCheckpoint(execution, checkpoint);
    const resumed = resumeStartedExecutionWithCheckpoint(suspended.execution, suspended.checkpoint);
    assert.deepEqual(resumed.execution.attempt, execution.attempt);
    assert.deepEqual(resumed.execution.currentPlan, execution.currentPlan);
    assert.deepEqual(resumed.execution.workshopNotes, execution.workshopNotes);
    assert.equal(resumed.checkpoint.capturedAt, checkpoint.capturedAt);
    assert.deepEqual(resumed.checkpoint.run, checkpoint.run);
    assert.deepEqual(resumed.checkpoint.clock, checkpoint.clock);
    assert.equal(resumed.execution.revision, execution.revision + 2);
    assert.equal(resumed.execution.runtimeRevision, execution.runtimeRevision + 2);
    assert.equal(resumed.checkpoint.runtimeRevision, resumed.execution.runtimeRevision);
    assert.throws(() => resumeStartedExecutionWithCheckpoint(resumed.execution, resumed.checkpoint), /invalidLifecycle/);
});
