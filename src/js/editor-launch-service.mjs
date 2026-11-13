import { EXECUTION_LIFECYCLES } from './editor-domain.mjs';
import { planExecutionFromTemplateInRecord } from './editor-storage.mjs';

const fail = code => { throw new Error(code); };
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const uncertainWrites = new Set(['storageUnconfirmed', 'storageReadback', 'lockRequestUnconfirmed']);
const conflicts = new Set(['conflict', 'duplicateId', 'activeExecutionExists']);
const missing = new Set(['templateNotFound', 'executionNotFound']);
const storage = new Set([
    'storageRead', 'storageWrite', 'storageQuota', 'storageValidation',
    'storageBlocked', 'storageUnconfirmed', 'storageReadback', 'lockRequestUnconfirmed',
]);
const locks = new Set([
    'lockUnavailable', 'lockBusy', 'lockRequest', 'activeLockRequired',
    'lockAlreadyHeld', 'lockClaimPending',
]);
const pending = new Set([
    'pendingActivation', 'pendingOperation', 'noPendingActivation', 'bridgeBusy',
    'pendingActivationMismatch',
]);

function exactOptions(value, fields) {
    if (!isObject(value)
        || Object.keys(value).length !== fields.length
        || fields.some(field => !Object.hasOwn(value, field))) fail('invalidData');
}

function identity(value) {
    if (typeof value !== 'string' || !value.trim()) fail('invalidData');
    return value;
}

function errorDetails(error) {
    const code = typeof error?.message === 'string' ? error.message : 'unexpectedError';
    let type = 'validation';
    if (conflicts.has(code)) type = 'conflict';
    else if (missing.has(code)) type = 'missing';
    else if (storage.has(code)) type = 'storage';
    else if (locks.has(code)) type = 'lock';
    else if (pending.has(code)) type = 'pending';
    else if (![
        'invalidData', 'invalidRevision', 'invalidRuntimeRevision',
        'invalidStoreRevision', 'invalidLifecycle', 'invalidActiveRuntimeBinding',
    ].includes(code)) type = 'unexpected';
    return { type, code };
}

function selectedExecution(record, executionId) {
    return record.executions.find(entry => entry.execution.id === executionId) ?? null;
}

export function createNativeSessionLaunchService({
    writer,
    runtimeBridge,
    createExecutionId = () => crypto.randomUUID(),
    createRuntimeRunId = () => crypto.randomUUID(),
    now = () => Date.now(),
} = {}) {
    if (!writer || typeof writer.read !== 'function' || typeof writer.write !== 'function'
        || !runtimeBridge || typeof runtimeBridge.activatePlanned !== 'function'
        || typeof runtimeBridge.reconcilePendingActivation !== 'function'
        || typeof createExecutionId !== 'function'
        || typeof createRuntimeRunId !== 'function'
        || typeof now !== 'function') fail('invalidLaunchService');

    async function planFromTemplate(options) {
        let executionId = null;
        try {
            exactOptions(options, ['templateId', 'expectedAggregateRevision']);
            executionId = identity(createExecutionId());
            const record = await writer.write(current => planExecutionFromTemplateInRecord(current, {
                templateId: options.templateId,
                executionId,
                expectedAggregateRevision: options.expectedAggregateRevision,
            }));
            const selected = selectedExecution(record, executionId);
            if (!selected || selected.execution.lifecycle !== EXECUTION_LIFECYCLES.PLANNED) {
                fail('invalidPlanningResult');
            }
            return {
                status: 'planned',
                executionId,
                record: structuredClone(record),
            };
        } catch (error) {
            if (executionId !== null && uncertainWrites.has(error?.message)) {
                return {
                    status: 'uncertain',
                    operation: 'plan',
                    executionId,
                    error: errorDetails(error),
                };
            }
            return { status: 'error', operation: 'plan', error: errorDetails(error) };
        }
    }

    async function activatePlanned(options) {
        let executionId = null;
        let runtimeRunId = null;
        let savedAt = null;
        try {
            exactOptions(options, [
                'executionId', 'expectedAggregateRevision',
                'expectedExecutionRevision', 'expectedRuntimeRevision',
            ]);
            executionId = identity(options.executionId);
            runtimeRunId = identity(createRuntimeRunId());
            savedAt = now();
            if (!Number.isSafeInteger(savedAt) || savedAt < 0) fail('invalidData');
            const record = await runtimeBridge.activatePlanned({
                ...options,
                runtimeRunId,
                savedAt,
            });
            return {
                status: 'ready',
                executionId,
                runtimeRunId,
                savedAt,
                record: structuredClone(record),
                runtime: structuredClone(record.activeRuntime),
            };
        } catch (error) {
            if (executionId !== null && uncertainWrites.has(error?.message)) {
                return {
                    status: 'uncertain',
                    operation: 'activate',
                    executionId,
                    runtimeRunId,
                    savedAt,
                    error: errorDetails(error),
                };
            }
            return {
                status: 'error',
                operation: 'activate',
                ...(executionId === null ? {} : { executionId }),
                error: errorDetails(error),
            };
        }
    }

    async function launchTemplateToReady(options) {
        const planned = await planFromTemplate(options);
        if (planned.status !== 'planned') {
            return { ...planned, operation: 'launch', stage: 'planning' };
        }
        const entry = selectedExecution(planned.record, planned.executionId);
        const activated = await activatePlanned({
            executionId: planned.executionId,
            expectedAggregateRevision: planned.record.revision,
            expectedExecutionRevision: entry.execution.revision,
            expectedRuntimeRevision: entry.execution.runtimeRevision,
        });
        if (activated.status === 'ready') return activated;
        return {
            status: activated.status === 'uncertain' ? 'uncertain' : 'partial',
            operation: 'launch',
            stage: 'activation',
            executionId: planned.executionId,
            plannedRecord: structuredClone(planned.record),
            activation: activated,
        };
    }

    async function observeExecution(executionId) {
        try {
            const id = identity(executionId);
            const record = await writer.read();
            const entry = selectedExecution(record, id);
            if (!entry) fail('executionNotFound');
            return {
                status: 'observed',
                executionId: id,
                lifecycle: entry.execution.lifecycle,
                record: structuredClone(record),
                execution: structuredClone(entry.execution),
            };
        } catch (error) {
            return { status: 'error', operation: 'observe', error: errorDetails(error) };
        }
    }

    async function reconcilePendingActivation(options) {
        try {
            exactOptions(options, ['executionId', 'runtimeRunId']);
            const executionId = identity(options.executionId);
            const runtimeRunId = identity(options.runtimeRunId);
            const result = await runtimeBridge.reconcilePendingActivation({ executionId, runtimeRunId });
            const entry = selectedExecution(result.record, executionId);
            if (result.outcome === 'target') {
                if (!entry || entry.execution.lifecycle !== EXECUTION_LIFECYCLES.ACTIVE
                    || result.record.activeRuntime?.executionId !== executionId
                    || result.record.activeRuntime.run?.runId !== runtimeRunId) {
                    fail('invalidReconciliationResult');
                }
                return {
                    status: 'ready',
                    executionId,
                    runtimeRunId,
                    record: structuredClone(result.record),
                    runtime: structuredClone(result.record.activeRuntime),
                };
            }
            if (result.outcome === 'source') {
                if (!entry || entry.execution.lifecycle !== EXECUTION_LIFECYCLES.PLANNED) {
                    fail('invalidReconciliationResult');
                }
                return {
                    status: 'partial',
                    operation: 'activate',
                    stage: 'planned',
                    executionId,
                    record: structuredClone(result.record),
                };
            }
            return {
                status: 'uncertain',
                operation: 'activate',
                executionId,
                runtimeRunId,
                error: { type: 'conflict', code: 'reconciliationConflict' },
                record: structuredClone(result.record),
            };
        } catch (error) {
            return { status: 'error', operation: 'reconcile', error: errorDetails(error) };
        }
    }

    return Object.freeze({
        planFromTemplate,
        activatePlanned,
        launchTemplateToReady,
        observeExecution,
        reconcilePendingActivation,
    });
}
