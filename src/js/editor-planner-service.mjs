import { DEFAULT_RUNDOWN_CATEGORY, validatePlannedExecution } from './editor-domain.mjs';
import {
    EDITOR_STORE_SCHEMA_VERSION,
    validateEditorStoreRecord,
    updatePlannedExecutionPlanInRecord,
} from './editor-storage.mjs';

const fail = code => { throw new Error(code); };
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

const validationErrors = new Set([
    'invalidData', 'invalidRevision', 'invalidStoreRevision', 'name', 'phaseTitle',
    'duration', 'totalLimit', 'phasesRequired', 'invalidCategory', 'invalidNotes',
    'invalidResource', 'invalidStore', 'invalidLifecycle',
]);
const storageErrors = new Set([
    'storageRead', 'storageWrite', 'storageQuota', 'storageUnconfirmed',
    'storageReadback', 'storageValidation', 'storageBlocked',
]);
const lockErrors = new Set(['lockUnavailable', 'lockBusy', 'lockRequest']);

function exactFields(value, fields) {
    if (!isObject(value)
        || Object.keys(value).length !== fields.length
        || fields.some(field => !Object.hasOwn(value, field))) fail('invalidData');
}

function librarySnapshot(value) {
    exactFields(value, ['revision', 'templates']);
    const valid = validateEditorStoreRecord({
        schemaVersion: EDITOR_STORE_SCHEMA_VERSION,
        revision: value.revision,
        templates: value.templates,
        executions: [],
        activeRuntime: null,
    });
    return { revision: valid.revision, templates: valid.templates };
}

function libraryFromRecord(record) {
    return librarySnapshot({ revision: record.revision, templates: record.templates });
}

function errorOutcome(error, draft) {
    const code = typeof error?.message === 'string' ? error.message : 'unexpectedError';
    let type = 'unexpected';
    if (validationErrors.has(code)) type = 'validation';
    else if (code === 'conflict' || code === 'duplicateId') type = 'conflict';
    else if (code === 'templateNotFound' || code === 'executionNotFound') type = 'missing';
    else if (storageErrors.has(code)) type = 'storage';
    else if (lockErrors.has(code)) type = 'lock';
    return {
        status: 'error',
        error: { type, code },
        ...(draft === undefined ? {} : { draft: structuredClone(draft) }),
    };
}

function validateDraft(draft) {
    exactFields(draft, [
        'mode', 'expectedAggregateRevision', 'expectedTemplateRevision', 'template',
    ]);
    if (!['create', 'update'].includes(draft.mode)
        || !Number.isSafeInteger(draft.expectedAggregateRevision)
        || draft.expectedAggregateRevision < 0
        || !isObject(draft.template)
        || typeof draft.template.id !== 'string'
        || !draft.template.id.trim()) fail('invalidData');
    if (draft.mode === 'create' && draft.expectedTemplateRevision !== null) fail('invalidData');
    if (draft.mode === 'update'
        && (!Number.isSafeInteger(draft.expectedTemplateRevision)
            || draft.expectedTemplateRevision < 1)) fail('invalidRevision');
    return structuredClone(draft);
}

export function createNativePlannerService({ integration, createId = () => crypto.randomUUID() } = {}) {
    if (!integration
        || ['readLibrary', 'createTemplate', 'updateTemplate', 'deleteTemplate']
            .some(method => typeof integration[method] !== 'function')
        || typeof createId !== 'function') fail('invalidPlannerService');

    return Object.freeze({
        async loadLibrary() {
            try {
                return { status: 'success', library: librarySnapshot(await integration.readLibrary()) };
            } catch (error) {
                return errorOutcome(error);
            }
        },

        prepareNewDraft(library, templateId) {
            try {
                const valid = librarySnapshot(library);
                const id = templateId === undefined ? createId() : templateId;
                if (typeof id !== 'string' || !id.trim()) fail('invalidData');
                return {
                    status: 'success',
                    draft: {
                        mode: 'create',
                        expectedAggregateRevision: valid.revision,
                        expectedTemplateRevision: null,
                        template: {
                            id,
                            name: '',
                            category: DEFAULT_RUNDOWN_CATEGORY,
                            transitionMode: 'manual',
                            preparedInformation: '',
                            phases: [],
                        },
                    },
                };
            } catch (error) {
                return errorOutcome(error);
            }
        },

        prepareEditDraft(library, templateId) {
            try {
                const valid = librarySnapshot(library);
                if (typeof templateId !== 'string' || !templateId.trim()) fail('invalidData');
                const selected = valid.templates.find(template => template.id === templateId);
                if (!selected) fail('templateNotFound');
                return {
                    status: 'success',
                    draft: {
                        mode: 'update',
                        expectedAggregateRevision: valid.revision,
                        expectedTemplateRevision: selected.revision,
                        template: { id: selected.id, ...structuredClone(selected.plan) },
                    },
                };
            } catch (error) {
                return errorOutcome(error);
            }
        },

        async saveDraft(draft) {
            let valid;
            try {
                valid = validateDraft(draft);
                const record = valid.mode === 'create'
                    ? await integration.createTemplate(valid.template, {
                        expectedAggregateRevision: valid.expectedAggregateRevision,
                    })
                    : await integration.updateTemplate(valid.template, {
                        expectedAggregateRevision: valid.expectedAggregateRevision,
                        expectedTemplateRevision: valid.expectedTemplateRevision,
                    });
                return { status: 'success', library: libraryFromRecord(record) };
            } catch (error) {
                return errorOutcome(error, valid ?? draft);
            }
        },

        async deleteTemplate(options = {}) {
            try {
                exactFields(options, [
                    'templateId', 'expectedAggregateRevision', 'expectedTemplateRevision',
                ]);
                const { templateId, expectedAggregateRevision, expectedTemplateRevision } = options;
                const record = await integration.deleteTemplate(templateId, {
                    expectedAggregateRevision,
                    expectedTemplateRevision,
                });
                return { status: 'success', library: libraryFromRecord(record) };
            } catch (error) {
                return errorOutcome(error);
            }
        },
    });
}

// Reuse the existing draft operations' `template` slot for an editable plan.
// It is not a Template entity: only this explicit mapping may persist it to an
// existing Execution, with Execution identity/revisions and no Template CRUD.
function executionDraftOptions(draft) {
    exactFields(draft, ['executionId', 'expectedAggregateRevision', 'expectedExecutionRevision', 'template']);
    if (typeof draft.executionId !== 'string' || !draft.executionId.trim()
        || !isObject(draft.template) || draft.template.id !== draft.executionId) fail('invalidData');
    const { id, ...currentPlan } = draft.template;
    return {
        executionId: id,
        expectedAggregateRevision: draft.expectedAggregateRevision,
        expectedExecutionRevision: draft.expectedExecutionRevision,
        currentPlan,
    };
}

export function createNativePlannedExecutionService({ writer } = {}) {
    if (!writer || typeof writer.read !== 'function' || typeof writer.write !== 'function') fail('invalidPlannerService');
    const selected = (record, executionId) => {
        const entry = record.executions.find(entry => entry.execution.id === executionId);
        if (!entry) fail('executionNotFound');
        if (entry.execution.lifecycle !== 'planned') fail('invalidLifecycle');
        return validatePlannedExecution(entry.execution);
    };
    return Object.freeze({
        async loadDraft(executionId) {
            try {
                if (typeof executionId !== 'string' || !executionId.trim()) fail('invalidData');
                const record = await writer.read();
                const execution = selected(record, executionId);
                return { status: 'success', draft: {
                    executionId,
                    expectedAggregateRevision: record.revision,
                    expectedExecutionRevision: execution.revision,
                    template: { id: executionId, ...structuredClone(execution.currentPlan) },
                } };
            } catch (error) { return errorOutcome(error); }
        },
        async saveDraft(draft) {
            let snapshot;
            try { snapshot = structuredClone(draft); }
            catch { return { status: 'error', error: { type: 'validation', code: 'invalidData' } }; }
            let source = null;
            let target = null;
            try {
                const options = executionDraftOptions(snapshot);
                const record = await writer.write(current => {
                    source = structuredClone(current);
                    target = updatePlannedExecutionPlanInRecord(current, options);
                    return target;
                });
                return { status: 'success', record, execution: selected(record, options.executionId) };
            } catch (error) {
                const result = errorOutcome(error, snapshot ?? draft);
                if (target !== null && ['storageUnconfirmed', 'storageReadback', 'lockRequest'].includes(error?.message)) {
                    return { ...result, status: 'uncertain', reconciliation: structuredClone({ draft: snapshot, source, target }) };
                }
                return result;
            }
        },
        async reconcileSave(ticket) {
            let valid;
            try {
                exactFields(ticket, ['draft', 'source', 'target']);
                const draft = structuredClone(ticket.draft);
                const options = executionDraftOptions(draft);
                const source = validateEditorStoreRecord(ticket.source);
                const target = validateEditorStoreRecord(ticket.target);
                if (JSON.stringify(target) !== JSON.stringify(updatePlannedExecutionPlanInRecord(source, options))) fail('invalidData');
                valid = { draft, source, target };
                const record = await writer.read();
                const raw = JSON.stringify(record);
                const status = raw === JSON.stringify(target) ? 'confirmed'
                    : raw === JSON.stringify(source) ? 'absent' : 'unresolved';
                return { status, record, draft, ...(status === 'unresolved'
                    ? { reconciliation: structuredClone(valid) }
                    : { execution: selected(record, options.executionId) }) };
            } catch (error) {
                return { ...errorOutcome(error, valid?.draft), status: valid ? 'unresolved' : 'error',
                    ...(valid ? { reconciliation: structuredClone(valid) } : {}) };
            }
        },
    });
}
