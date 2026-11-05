import {
    suspendStartedExecution,
    validateStartedExecution,
    validateSuspendedStartedExecution,
} from './editor-domain.mjs';
import { validateRuntime } from './recovery.mjs';
import { transitionSession } from './session.mjs';

export const EXECUTION_RUNTIME_CHECKPOINT_SCHEMA_VERSION = 1;
export const EXECUTION_RUNTIME_CHECKPOINT_KIND = 'execution-runtime-checkpoint';

const CHECKPOINT_CONTEXT_ID = 'execution-runtime-checkpoint';

const fail = code => { throw new Error(code); };

function exactFields(value, fields) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)
        || Object.keys(value).length !== fields.length
        || fields.some(field => !Object.hasOwn(value, field))) fail('invalidCheckpoint');
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
        || checkpoint.runtimeRevision !== started.runtimeRevision) fail('invalidCheckpointBinding');
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
    const suspended = suspendStartedExecution(started);
    const rebound = validateExecutionRuntimeCheckpoint({
        ...frozen,
        runtimeRevision: suspended.runtimeRevision,
    }, suspended);
    return { execution: suspended, checkpoint: rebound };
}
