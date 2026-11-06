import {
    EXECUTION_LIFECYCLES,
    validatePlannedExecution,
    validateReadyExecution,
    validateStartedExecution,
    validateSuspendedReadyExecution,
    validateSuspendedStartedExecution,
    validateTemplate,
} from './editor-domain.mjs';
import { validateExecutionRuntimeCheckpoint } from './execution-runtime.mjs';
import { validateRuntime } from './recovery.mjs';

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
