import {
    resumeStartedExecution,
    suspendStartedExecution,
    validateReadyExecution,
    validateStartedExecution,
    validateSuspendedStartedExecution,
} from './editor-domain.mjs';
import { validateRuntime } from './recovery.mjs';
import { prepareSession, transitionSession } from './session.mjs';
import { timeBudget } from './timer.mjs?v=54';

export const EXECUTION_RUNTIME_CHECKPOINT_SCHEMA_VERSION = 1;
export const EXECUTION_RUNTIME_CHECKPOINT_KIND = 'execution-runtime-checkpoint';

const CHECKPOINT_CONTEXT_ID = 'execution-runtime-checkpoint';
const ACTIVE_RUNTIME_CONTEXT_ID = 'execution-active-runtime';

const fail = code => { throw new Error(code); };

// Observes reconciled engine state; it never advances a clock or accumulates
// elapsed wall time. Manual outgoing phases must be observed before NEXT/COMPLETE.
export function recordExecutionPhaseOutcomes(execution, run, clock) {
    const valid = execution?.lifecycle === 'suspended'
        ? validateSuspendedStartedExecution(execution) : validateStartedExecution(execution);
    if (run.runId !== valid.attempt.runtimeRunId) fail('invalidAttemptBinding');
    const outcomes = new Map(valid.phaseOutcomes.map(outcome => [outcome.phaseId, outcome]));
    for (const [index, phase] of run.phases.entries()) {
        const outcome = outcomes.get(phase.id);
        if (!outcome) fail('invalidPhaseOutcomes');
        const settled = index < run.currentIndex || run.stage === 'COMPLETED';
        if (settled && run.transitionMode === 'automatic') {
            // The authoritative engine STARTs every crossed phase and settles it
            // at its planned deadline; callback delay is never phase overtime.
            Object.assign(outcome, { conducted: true, activeMs: phase.durationSeconds * 1000, overtimeMs: 0 });
        } else if (!settled && index === run.currentIndex) {
            const budget = timeBudget(clock);
            Object.assign(outcome, { conducted: clock.status !== 'READY',
                activeMs: budget.elapsedMs, overtimeMs: clock.overtimeMs });
        }
    }
    return valid.lifecycle === 'suspended'
        ? validateSuspendedStartedExecution(valid) : validateStartedExecution(valid);
}

export function validateExecutionOutcomeRuntime(execution, run, clock) {
    const recorded = recordExecutionPhaseOutcomes(execution, run, clock);
    const runIds = new Set(run.phases.map(phase => phase.id));
    const outcomes = new Map(recorded.phaseOutcomes.map(outcome => [outcome.phaseId, outcome]));
    if (recorded.phaseOutcomes.some(outcome => !runIds.has(outcome.phaseId))) fail('invalidPhaseOutcomes');
    if (JSON.stringify(recorded.phaseOutcomes) !== JSON.stringify(execution.phaseOutcomes)) fail('invalidPhaseOutcomes');
    for (const [index, phase] of run.phases.entries()) {
        const outcome = outcomes.get(phase.id);
        const settled = index < run.currentIndex || run.stage === 'COMPLETED';
        if (settled) {
            if (outcome.overtimeMs !== run.phaseOvertime[phase.id]
                || (outcome.overtimeMs > 0 && outcome.activeMs !== phase.durationSeconds * 1000 + outcome.overtimeMs)
                || (outcome.overtimeMs === 0 && outcome.activeMs > phase.durationSeconds * 1000)) fail('invalidPhaseOutcomes');
        } else if (index > run.currentIndex
            && (outcome.conducted || outcome.activeMs !== 0 || outcome.overtimeMs !== 0)) fail('invalidPhaseOutcomes');
    }
}

function exactFields(value, fields) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)
        || Object.keys(value).length !== fields.length
        || fields.some(field => !Object.hasOwn(value, field))) fail('invalidCheckpoint');
}

export function prepareReadyExecutionRuntime(execution, runtimeRunId, savedAt) {
    const ready = validateReadyExecution(execution);
    if (typeof runtimeRunId !== 'string' || !runtimeRunId.trim()) fail('INVALID_RUN');
    const plan = ready.currentPlan;
    const prepared = prepareSession({
        id: ready.source?.id ?? ready.id,
        name: plan.name,
        transitionMode: plan.transitionMode,
        phases: plan.phases.map(phase => ({
            id: phase.id,
            title: phase.title,
            durationSeconds: phase.durationSeconds,
        })),
    }, runtimeRunId);
    const runtime = validateRuntime({
        schemaVersion: 1,
        contextId: ACTIVE_RUNTIME_CONTEXT_ID,
        savedAt,
        mode: 'session',
        run: prepared.run,
        clock: prepared.clock,
        quickDurationMs: 0,
    });
    return {
        executionId: ready.id,
        attemptId: null,
        runtimeRevision: ready.runtimeRevision,
        savedAt: runtime.savedAt,
        run: runtime.run,
        clock: runtime.clock,
    };
}

export function validateExecutionRuntimeCheckpoint(checkpoint, execution) {
    const started = execution?.lifecycle === 'suspended'
        ? validateSuspendedStartedExecution(execution)
        : validateStartedExecution(execution);
    exactFields(checkpoint, [
        'schemaVersion', 'kind', 'executionId', 'attemptId', 'runtimeRevision', 'capturedAt', 'run', 'clock',
    ]);
    if (checkpoint.schemaVersion !== EXECUTION_RUNTIME_CHECKPOINT_SCHEMA_VERSION
        || checkpoint.kind !== EXECUTION_RUNTIME_CHECKPOINT_KIND
        || checkpoint.executionId !== started.id
        || checkpoint.attemptId !== started.attempt.id
        || checkpoint.runtimeRevision !== started.runtimeRevision
        || checkpoint.run?.runId !== started.attempt.runtimeRunId) fail('invalidCheckpointBinding');
    const runtime = validateRuntime({
        schemaVersion: 1,
        contextId: CHECKPOINT_CONTEXT_ID,
        savedAt: checkpoint.capturedAt,
        mode: 'session',
        run: checkpoint.run,
        clock: checkpoint.clock,
        quickDurationMs: 0,
    });
    if (!['READY', 'PAUSED', 'OVERTIME_PAUSED', 'OVERTIME_STOPPED'].includes(runtime.clock.status)) {
        fail('invalidCheckpointClock');
    }
    return {
        schemaVersion: EXECUTION_RUNTIME_CHECKPOINT_SCHEMA_VERSION,
        kind: EXECUTION_RUNTIME_CHECKPOINT_KIND,
        executionId: started.id,
        attemptId: started.attempt.id,
        runtimeRevision: started.runtimeRevision,
        capturedAt: runtime.savedAt,
        run: runtime.run,
        clock: runtime.clock,
    };
}

export function captureExecutionRuntimeCheckpoint(execution, run, clock, now) {
    const started = validateStartedExecution(execution);
    let frozen = transitionSession(run, clock, { type: 'TICK' }, now);
    if (['RUNNING', 'FINISHED'].includes(frozen.clock.status)) {
        frozen = transitionSession(frozen.run, frozen.clock, { type: 'PAUSE' }, now);
    }
    return validateExecutionRuntimeCheckpoint({
        schemaVersion: EXECUTION_RUNTIME_CHECKPOINT_SCHEMA_VERSION,
        kind: EXECUTION_RUNTIME_CHECKPOINT_KIND,
        executionId: started.id,
        attemptId: started.attempt.id,
        runtimeRevision: started.runtimeRevision,
        capturedAt: now,
        run: frozen.run,
        clock: frozen.clock,
    }, started);
}

export function suspendStartedExecutionWithCheckpoint(execution, checkpoint) {
    const started = validateStartedExecution(execution);
    const frozen = validateExecutionRuntimeCheckpoint(checkpoint, started);
    const observed = recordExecutionPhaseOutcomes(started, frozen.run, frozen.clock);
    validateExecutionOutcomeRuntime(observed, frozen.run, frozen.clock);
    const suspended = suspendStartedExecution(observed);
    const rebound = validateExecutionRuntimeCheckpoint({
        ...frozen,
        runtimeRevision: suspended.runtimeRevision,
    }, suspended);
    return { execution: suspended, checkpoint: rebound };
}

export function resumeStartedExecutionWithCheckpoint(execution, checkpoint) {
    const suspended = validateSuspendedStartedExecution(execution);
    const frozen = validateExecutionRuntimeCheckpoint(checkpoint, suspended);
    validateExecutionOutcomeRuntime(suspended, frozen.run, frozen.clock);
    const active = resumeStartedExecution(suspended);
    const rebound = validateExecutionRuntimeCheckpoint({
        ...frozen,
        runtimeRevision: active.runtimeRevision,
    }, active);
    return { execution: active, checkpoint: rebound };
}
