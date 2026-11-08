import {
    EXECUTION_LIFECYCLES,
    activatePlannedExecution,
    createPlannedExecution,
    resumeReadyExecution,
    startActiveExecution,
    suspendReadyExecution,
    validatePlannedExecution,
    validateReadyExecution,
    validateStartedExecution,
    validateSuspendedReadyExecution,
    validateSuspendedStartedExecution,
    validateTemplate,
} from './editor-domain.mjs';
import {
    captureExecutionRuntimeCheckpoint,
    prepareReadyExecutionRuntime,
    resumeStartedExecutionWithCheckpoint,
    suspendStartedExecutionWithCheckpoint,
    validateExecutionRuntimeCheckpoint,
} from './execution-runtime.mjs';
import { validateRuntime } from './recovery.mjs';
import { transitionSession } from './session.mjs';

export const EDITOR_STORAGE_KEY = 'easyTimerEditor.v1';
export const EDITOR_STORE_SCHEMA_VERSION = 1;

const ACTIVE_RUNTIME_CONTEXT = 'editor-active-runtime';
const fail = code => { throw new Error(code); };
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function exactFields(value, fields, code = 'invalidStore') {
    if (!isObject(value)
        || Object.keys(value).length !== fields.length
        || fields.some(field => !Object.hasOwn(value, field))) fail(code);
}

function safeRevision(value) {
    if (!Number.isSafeInteger(value) || value < 0) fail('invalidStoreRevision');
    return value;
}

function uniqueIds(values) {
    if (new Set(values.map(value => value.id)).size !== values.length) fail('duplicateId');
}

function validateActiveRuntime(activeRuntime, execution) {
    exactFields(activeRuntime, [
        'executionId', 'attemptId', 'runtimeRevision', 'savedAt', 'run', 'clock',
    ], 'invalidActiveRuntime');
    const started = execution.attempt !== null;
    if (activeRuntime.executionId !== execution.id
        || activeRuntime.attemptId !== (started ? execution.attempt.id : null)
        || activeRuntime.runtimeRevision !== execution.runtimeRevision
        || (started && activeRuntime.run?.runId !== execution.attempt.runtimeRunId)) {
        fail('invalidActiveRuntimeBinding');
    }
    const runtime = validateRuntime({
        schemaVersion: 1,
        contextId: ACTIVE_RUNTIME_CONTEXT,
        savedAt: activeRuntime.savedAt,
        mode: 'session',
        run: activeRuntime.run,
        clock: activeRuntime.clock,
        quickDurationMs: 0,
    });
    if (!started && (runtime.clock.status !== 'READY'
        || runtime.run.stage !== 'PHASE'
        || runtime.run.currentIndex !== 0
        || Object.keys(runtime.run.phaseOvertime).length !== 0)) fail('invalidReadyRuntime');
    return {
        executionId: execution.id,
        attemptId: started ? execution.attempt.id : null,
        runtimeRevision: execution.runtimeRevision,
        savedAt: runtime.savedAt,
        run: runtime.run,
        clock: runtime.clock,
    };
}

function validateExecutionEntry(entry) {
    exactFields(entry, ['execution', 'suspendedCheckpoint']);
    const { execution } = entry;
    let validExecution;
    let suspendedCheckpoint = null;
    if (execution?.lifecycle === EXECUTION_LIFECYCLES.PLANNED) {
        validExecution = validatePlannedExecution(execution);
        if (entry.suspendedCheckpoint !== null) fail('unexpectedCheckpoint');
    } else if (execution?.lifecycle === EXECUTION_LIFECYCLES.SUSPENDED) {
        if (execution.attempt === null) {
            validExecution = validateSuspendedReadyExecution(execution);
            if (entry.suspendedCheckpoint !== null) fail('unexpectedCheckpoint');
        } else {
            validExecution = validateSuspendedStartedExecution(execution);
            if (entry.suspendedCheckpoint === null) fail('missingCheckpoint');
            suspendedCheckpoint = validateExecutionRuntimeCheckpoint(entry.suspendedCheckpoint, validExecution);
        }
    } else if (execution?.lifecycle === EXECUTION_LIFECYCLES.ACTIVE) {
        validExecution = execution.attempt === null
            ? validateReadyExecution(execution)
            : validateStartedExecution(execution);
        if (entry.suspendedCheckpoint !== null) fail('unexpectedCheckpoint');
    } else if (execution?.lifecycle === EXECUTION_LIFECYCLES.COMPLETED) {
        fail('unsupportedLifecycle');
    } else {
        fail('invalidLifecycle');
    }
    return { execution: validExecution, suspendedCheckpoint };
}

export function validateEditorStoreRecord(record) {
    exactFields(record, ['schemaVersion', 'revision', 'templates', 'executions', 'activeRuntime']);
    if (record.schemaVersion !== EDITOR_STORE_SCHEMA_VERSION
        || !Array.isArray(record.templates)
        || !Array.isArray(record.executions)) fail('invalidStore');
    const templates = record.templates.map(validateTemplate);
    const executions = record.executions.map(validateExecutionEntry);
    uniqueIds(templates);
    uniqueIds(executions.map(entry => entry.execution));
    const active = executions.filter(entry => entry.execution.lifecycle === EXECUTION_LIFECYCLES.ACTIVE);
    if (active.length > 1) fail('multipleActiveExecutions');
    let activeRuntime = null;
    if (active.length === 0) {
        if (record.activeRuntime !== null) fail('unexpectedActiveRuntime');
    } else {
        if (record.activeRuntime === null) fail('missingActiveRuntime');
        activeRuntime = validateActiveRuntime(record.activeRuntime, active[0].execution);
    }
    return {
        schemaVersion: EDITOR_STORE_SCHEMA_VERSION,
        revision: safeRevision(record.revision),
        templates,
        executions,
        activeRuntime,
    };
}

export function insertTemplateInRecord(record, options) {
    const valid = validateEditorStoreRecord(record);
    if (!isObject(options)) fail('invalidData');
    const { template, expectedAggregateRevision } = options;
    safeRevision(expectedAggregateRevision);
    if (valid.revision !== expectedAggregateRevision) fail('conflict');
    if (valid.revision === Number.MAX_SAFE_INTEGER) fail('invalidStoreRevision');

    const inserted = validateTemplate(template);
    if (valid.templates.some(item => item.id === inserted.id)) fail('duplicateId');
    return validateEditorStoreRecord({
        ...valid,
        revision: valid.revision + 1,
        templates: [...valid.templates, inserted],
    });
}

export function planExecutionFromTemplateInRecord(record, options) {
    const valid = validateEditorStoreRecord(record);
    if (!isObject(options)) fail('invalidData');
    const { templateId, executionId, expectedAggregateRevision } = options;
    if (typeof templateId !== 'string' || !templateId.trim()
        || typeof executionId !== 'string' || !executionId.trim()) fail('invalidData');
    safeRevision(expectedAggregateRevision);
    if (valid.revision !== expectedAggregateRevision) fail('conflict');
    if (valid.revision === Number.MAX_SAFE_INTEGER) fail('invalidStoreRevision');

    const template = valid.templates.find(item => item.id === templateId);
    if (!template) fail('templateNotFound');
    if (valid.executions.some(entry => entry.execution.id === executionId)) fail('duplicateId');
    const execution = createPlannedExecution(template, executionId);
    return validateEditorStoreRecord({
        ...valid,
        revision: valid.revision + 1,
        executions: [...valid.executions, { execution, suspendedCheckpoint: null }],
    });
}

export function activatePlannedExecutionInRecord(record, options) {
    const valid = validateEditorStoreRecord(record);
    if (!isObject(options)) fail('invalidData');
    const {
        executionId,
        expectedAggregateRevision,
        expectedExecutionRevision,
        expectedRuntimeRevision,
        runtimeRunId,
        savedAt,
    } = options;
    if (typeof executionId !== 'string' || !executionId.trim()) fail('invalidData');
    safeRevision(expectedAggregateRevision);
    if (!Number.isSafeInteger(expectedExecutionRevision) || expectedExecutionRevision < 0) fail('invalidRevision');
    if (!Number.isSafeInteger(expectedRuntimeRevision) || expectedRuntimeRevision < 0) {
        fail('invalidRuntimeRevision');
    }
    if (valid.revision !== expectedAggregateRevision) fail('conflict');
    if (valid.revision === Number.MAX_SAFE_INTEGER) fail('invalidStoreRevision');

    const index = valid.executions.findIndex(entry => entry.execution.id === executionId);
    if (index < 0) fail('executionNotFound');
    const selected = valid.executions[index];
    if (selected.execution.revision !== expectedExecutionRevision
        || selected.execution.runtimeRevision !== expectedRuntimeRevision) fail('conflict');
    if (selected.execution.lifecycle !== EXECUTION_LIFECYCLES.PLANNED) fail('invalidLifecycle');
    if (valid.executions.some((entry, entryIndex) => entryIndex !== index
        && entry.execution.lifecycle === EXECUTION_LIFECYCLES.ACTIVE)) fail('activeExecutionExists');

    const execution = activatePlannedExecution(selected.execution);
    const activeRuntime = prepareReadyExecutionRuntime(execution, runtimeRunId, savedAt);
    const executions = valid.executions.map((entry, entryIndex) => (entryIndex === index
        ? { execution, suspendedCheckpoint: null }
        : entry));
    return validateEditorStoreRecord({
        ...valid,
        revision: valid.revision + 1,
        executions,
        activeRuntime,
    });
}

export function startReadyExecutionInRecord(record, options) {
    const valid = validateEditorStoreRecord(record);
    if (!isObject(options)) fail('invalidData');
    const {
        executionId,
        expectedAggregateRevision,
        expectedExecutionRevision,
        expectedRuntimeRevision,
        attemptId,
        startedAt,
    } = options;
    if (typeof executionId !== 'string' || !executionId.trim()) fail('invalidData');
    safeRevision(expectedAggregateRevision);
    if (!Number.isSafeInteger(expectedExecutionRevision) || expectedExecutionRevision < 0) fail('invalidRevision');
    if (!Number.isSafeInteger(expectedRuntimeRevision) || expectedRuntimeRevision < 0) {
        fail('invalidRuntimeRevision');
    }
    if (valid.revision !== expectedAggregateRevision) fail('conflict');
    if (valid.revision === Number.MAX_SAFE_INTEGER) fail('invalidStoreRevision');

    const index = valid.executions.findIndex(entry => entry.execution.id === executionId);
    if (index < 0) fail('executionNotFound');
    const selected = valid.executions[index];
    if (selected.execution.revision !== expectedExecutionRevision
        || selected.execution.runtimeRevision !== expectedRuntimeRevision) fail('conflict');
    if (selected.execution.lifecycle !== EXECUTION_LIFECYCLES.ACTIVE) fail('invalidLifecycle');
    if (selected.execution.attempt !== null) fail('invalidAttempt');
    if (selected.suspendedCheckpoint !== null || valid.activeRuntime === null
        || valid.activeRuntime.executionId !== selected.execution.id
        || valid.activeRuntime.attemptId !== null
        || valid.activeRuntime.runtimeRevision !== selected.execution.runtimeRevision) fail('invalidActiveRuntimeBinding');
    if (startedAt < valid.activeRuntime.savedAt) fail('CLOCK_ANOMALY');

    const runtimeRunId = valid.activeRuntime.run.runId;
    const execution = startActiveExecution(selected.execution, attemptId, startedAt, runtimeRunId);
    const transitioned = transitionSession(
        valid.activeRuntime.run,
        valid.activeRuntime.clock,
        { type: 'START' },
        startedAt,
    );
    const activeRuntime = {
        executionId: execution.id,
        attemptId: execution.attempt.id,
        runtimeRevision: execution.runtimeRevision,
        savedAt: startedAt,
        run: transitioned.run,
        clock: transitioned.clock,
    };
    const executions = valid.executions.map((entry, entryIndex) => (entryIndex === index
        ? { execution, suspendedCheckpoint: null }
        : entry));
    return validateEditorStoreRecord({
        ...valid,
        revision: valid.revision + 1,
        executions,
        activeRuntime,
    });
}

export function applyStartedSessionActionInRecord(record, options) {
    const valid = validateEditorStoreRecord(record);
    if (!isObject(options)) fail('invalidData');
    const {
        executionId,
        expectedAggregateRevision,
        expectedExecutionRevision,
        expectedRuntimeRevision,
        expectedAttemptId,
        expectedRunId,
        actionType,
        occurredAt,
    } = options;
    if (typeof executionId !== 'string' || !executionId.trim()) fail('invalidData');
    safeRevision(expectedAggregateRevision);
    if (!Number.isSafeInteger(expectedExecutionRevision) || expectedExecutionRevision < 0) fail('invalidRevision');
    if (!Number.isSafeInteger(expectedRuntimeRevision) || expectedRuntimeRevision < 0) {
        fail('invalidRuntimeRevision');
    }
    if (!Number.isSafeInteger(occurredAt) || occurredAt < 0) fail('INVALID_RUNTIME');
    const supported = ['START', 'PAUSE', 'RESUME', 'NEXT', 'COMPLETE', 'STOP_OVERTIME'];
    if (!supported.includes(actionType)) fail('invalidSessionAction');
    if (valid.revision !== expectedAggregateRevision) fail('conflict');
    if (valid.revision === Number.MAX_SAFE_INTEGER) fail('invalidStoreRevision');

    const selected = valid.executions.find(entry => entry.execution.id === executionId);
    if (!selected) fail('executionNotFound');
    const execution = selected.execution;
    if (execution.revision !== expectedExecutionRevision
        || execution.runtimeRevision !== expectedRuntimeRevision) fail('conflict');
    if (execution.lifecycle !== EXECUTION_LIFECYCLES.ACTIVE) fail('invalidLifecycle');
    if (execution.attempt === null) fail('invalidAttempt');
    if (selected.suspendedCheckpoint !== null || valid.activeRuntime === null
        || valid.activeRuntime.executionId !== execution.id
        || valid.activeRuntime.attemptId !== execution.attempt.id
        || valid.activeRuntime.runtimeRevision !== execution.runtimeRevision) fail('invalidActiveRuntimeBinding');
    if (expectedAttemptId !== execution.attempt.id) fail('invalidAttemptBinding');
    if (expectedRunId !== execution.attempt.runtimeRunId
        || expectedRunId !== valid.activeRuntime.run.runId) fail('invalidActiveRuntimeBinding');
    if (occurredAt < valid.activeRuntime.savedAt) fail('CLOCK_ANOMALY');

    const reconciled = transitionSession(
        valid.activeRuntime.run,
        valid.activeRuntime.clock,
        { type: 'TICK' },
        occurredAt,
    );
    const { run, clock } = reconciled;
    const last = run.currentIndex === run.phases.length - 1;
    const allowed = (actionType === 'START' && run.stage === 'PHASE'
            && run.currentIndex > 0 && clock.status === 'READY')
        || (actionType === 'PAUSE' && ['RUNNING', 'FINISHED'].includes(clock.status))
        || (actionType === 'RESUME' && ['PAUSED', 'OVERTIME_PAUSED'].includes(clock.status))
        || (actionType === 'NEXT' && run.transitionMode === 'manual' && run.stage === 'PHASE' && !last)
        || (actionType === 'COMPLETE' && run.transitionMode === 'manual' && run.stage === 'PHASE' && last)
        || (actionType === 'STOP_OVERTIME' && run.stage === 'COMPLETED'
            && ['FINISHED', 'OVERTIME_PAUSED'].includes(clock.status));
    if (!allowed) fail('invalidSessionAction');

    const transitioned = transitionSession(run, clock, { type: actionType }, occurredAt);
    if (JSON.stringify(transitioned) === JSON.stringify(reconciled)) fail('invalidSessionAction');
    return validateEditorStoreRecord({
        ...valid,
        revision: valid.revision + 1,
        activeRuntime: {
            ...valid.activeRuntime,
            savedAt: occurredAt,
            run: transitioned.run,
            clock: transitioned.clock,
        },
    });
}

export function suspendActiveExecutionInRecord(record, options) {
    const valid = validateEditorStoreRecord(record);
    if (!isObject(options)) fail('invalidData');
    const {
        executionId,
        expectedAggregateRevision,
        expectedExecutionRevision,
        expectedRuntimeRevision,
        expectedAttemptId,
        expectedRunId,
        suspendedAt,
        workshopNotes,
    } = options;
    if (typeof executionId !== 'string' || !executionId.trim()) fail('invalidData');
    safeRevision(expectedAggregateRevision);
    if (!Number.isSafeInteger(expectedExecutionRevision) || expectedExecutionRevision < 0) fail('invalidRevision');
    if (!Number.isSafeInteger(expectedRuntimeRevision) || expectedRuntimeRevision < 0) {
        fail('invalidRuntimeRevision');
    }
    if (!Number.isSafeInteger(suspendedAt) || suspendedAt < 0) fail('INVALID_RUNTIME');
    if (valid.revision !== expectedAggregateRevision) fail('conflict');
    if (valid.revision === Number.MAX_SAFE_INTEGER) fail('invalidStoreRevision');

    const index = valid.executions.findIndex(entry => entry.execution.id === executionId);
    if (index < 0) fail('executionNotFound');
    const selected = valid.executions[index];
    const execution = selected.execution;
    if (execution.revision !== expectedExecutionRevision
        || execution.runtimeRevision !== expectedRuntimeRevision) fail('conflict');
    if (execution.lifecycle !== EXECUTION_LIFECYCLES.ACTIVE) fail('invalidLifecycle');
    if (selected.suspendedCheckpoint !== null || valid.activeRuntime === null
        || valid.activeRuntime.executionId !== execution.id
        || valid.activeRuntime.attemptId !== (execution.attempt?.id ?? null)
        || valid.activeRuntime.runtimeRevision !== execution.runtimeRevision) fail('invalidActiveRuntimeBinding');
    if (expectedRunId !== valid.activeRuntime.run.runId) fail('invalidActiveRuntimeBinding');
    if (suspendedAt < valid.activeRuntime.savedAt) fail('CLOCK_ANOMALY');

    let suspended;
    let suspendedCheckpoint = null;
    if (execution.attempt === null) {
        if (expectedAttemptId !== null) fail('invalidAttemptBinding');
        const withNotes = validateReadyExecution({ ...execution, workshopNotes });
        suspended = suspendReadyExecution(withNotes);
    } else {
        if (expectedAttemptId !== execution.attempt.id) fail('invalidAttemptBinding');
        if (expectedRunId !== execution.attempt.runtimeRunId) fail('invalidActiveRuntimeBinding');
        const withNotes = validateStartedExecution({ ...execution, workshopNotes });
        const checkpoint = captureExecutionRuntimeCheckpoint(
            withNotes,
            valid.activeRuntime.run,
            valid.activeRuntime.clock,
            suspendedAt,
        );
        const result = suspendStartedExecutionWithCheckpoint(withNotes, checkpoint);
        suspended = result.execution;
        suspendedCheckpoint = result.checkpoint;
    }

    const executions = valid.executions.map((entry, entryIndex) => (entryIndex === index
        ? { execution: suspended, suspendedCheckpoint }
        : entry));
    return validateEditorStoreRecord({
        ...valid,
        revision: valid.revision + 1,
        executions,
        activeRuntime: null,
    });
}

export function resumeSuspendedExecutionInRecord(record, options) {
    const valid = validateEditorStoreRecord(record);
    if (!isObject(options)) fail('invalidData');
    const {
        executionId,
        expectedAggregateRevision,
        expectedExecutionRevision,
        expectedRuntimeRevision,
        expectedAttemptId,
        expectedRunId,
        runtimeRunId,
        resumedAt,
    } = options;
    if (typeof executionId !== 'string' || !executionId.trim()) fail('invalidData');
    safeRevision(expectedAggregateRevision);
    if (!Number.isSafeInteger(expectedExecutionRevision) || expectedExecutionRevision < 0) fail('invalidRevision');
    if (!Number.isSafeInteger(expectedRuntimeRevision) || expectedRuntimeRevision < 0) {
        fail('invalidRuntimeRevision');
    }
    if (!Number.isSafeInteger(resumedAt) || resumedAt < 0) fail('INVALID_RUNTIME');
    if (valid.revision !== expectedAggregateRevision) fail('conflict');
    if (valid.revision === Number.MAX_SAFE_INTEGER) fail('invalidStoreRevision');

    const index = valid.executions.findIndex(entry => entry.execution.id === executionId);
    if (index < 0) fail('executionNotFound');
    const selected = valid.executions[index];
    const execution = selected.execution;
    if (execution.revision !== expectedExecutionRevision
        || execution.runtimeRevision !== expectedRuntimeRevision) fail('conflict');
    if (execution.lifecycle !== EXECUTION_LIFECYCLES.SUSPENDED) fail('invalidLifecycle');
    if (valid.activeRuntime !== null || valid.executions.some((entry, entryIndex) => entryIndex !== index
        && entry.execution.lifecycle === EXECUTION_LIFECYCLES.ACTIVE)) fail('activeExecutionExists');

    let active;
    let activeRuntime;
    if (execution.attempt === null) {
        if (selected.suspendedCheckpoint !== null) fail('unexpectedCheckpoint');
        if (expectedAttemptId !== null || expectedRunId !== null) fail('invalidAttemptBinding');
        const suspended = validateSuspendedReadyExecution(execution);
        active = resumeReadyExecution(suspended);
        activeRuntime = prepareReadyExecutionRuntime(active, runtimeRunId, resumedAt);
    } else {
        if (runtimeRunId !== undefined) fail('invalidActiveRuntimeBinding');
        const suspended = validateSuspendedStartedExecution(execution);
        if (selected.suspendedCheckpoint === null) fail('missingCheckpoint');
        const checkpoint = validateExecutionRuntimeCheckpoint(selected.suspendedCheckpoint, suspended);
        if (expectedAttemptId !== suspended.attempt.id) fail('invalidAttemptBinding');
        if (expectedRunId !== suspended.attempt.runtimeRunId
            || expectedRunId !== checkpoint.run.runId) fail('invalidActiveRuntimeBinding');
        if (resumedAt < checkpoint.capturedAt) fail('CLOCK_ANOMALY');
        const resumed = resumeStartedExecutionWithCheckpoint(suspended, checkpoint);
        active = resumed.execution;
        activeRuntime = {
            executionId: active.id,
            attemptId: active.attempt.id,
            runtimeRevision: active.runtimeRevision,
            savedAt: resumedAt,
            run: resumed.checkpoint.run,
            clock: resumed.checkpoint.clock,
        };
    }

    const executions = valid.executions.map((entry, entryIndex) => (entryIndex === index
        ? { execution: active, suspendedCheckpoint: null }
        : entry));
    return validateEditorStoreRecord({
        ...valid,
        revision: valid.revision + 1,
        executions,
        activeRuntime,
    });
}

function emptyRecord() {
    return validateEditorStoreRecord({
        schemaVersion: EDITOR_STORE_SCHEMA_VERSION,
        revision: 0,
        templates: [],
        executions: [],
        activeRuntime: null,
    });
}

export function createEditorStore(getStorage) {
    let loaded = false;
    let snapshot;
    let loadedRevision;

    function read() {
        try { return getStorage().getItem(EDITOR_STORAGE_KEY); }
        catch { fail('storageRead'); }
    }

    function parse(raw) {
        try { return raw === null ? emptyRecord() : validateEditorStoreRecord(JSON.parse(raw)); }
        catch (error) {
            if (error.message === 'storageRead') throw error;
            fail('storageValidation');
        }
    }

    return {
        load() {
            loaded = false;
            const raw = read();
            const valid = parse(raw);
            snapshot = raw;
            loadedRevision = valid.revision;
            loaded = true;
            return structuredClone(valid);
        },
        save(record, expectedRevision) {
            if (!loaded) fail('storageBlocked');
            safeRevision(expectedRevision);
            const valid = validateEditorStoreRecord(record);
            if (expectedRevision !== loadedRevision) fail('conflict');
            if (expectedRevision === Number.MAX_SAFE_INTEGER
                || valid.revision !== expectedRevision + 1) fail('invalidStoreRevision');

            const currentRaw = read();
            if (currentRaw !== snapshot) fail('conflict');
            const current = parse(currentRaw);
            if (current.revision !== expectedRevision) fail('conflict');

            const raw = JSON.stringify(valid);
            try { getStorage().setItem(EDITOR_STORAGE_KEY, raw); }
            catch (error) {
                if (error?.name === 'QuotaExceededError') fail('storageQuota');
                fail('storageWrite');
            }

            let readback;
            try { readback = getStorage().getItem(EDITOR_STORAGE_KEY); }
            catch { fail('storageUnconfirmed'); }
            if (readback !== raw) fail('storageReadback');
            let confirmed;
            try { confirmed = validateEditorStoreRecord(JSON.parse(readback)); }
            catch { fail('storageReadback'); }
            if (JSON.stringify(confirmed) !== raw) fail('storageReadback');

            snapshot = raw;
            loadedRevision = confirmed.revision;
            return structuredClone(confirmed);
        },
    };
}
