import { DEFAULT_RUNDOWN_CATEGORY } from './editor-domain.mjs';
import {
    EDITOR_STORE_SCHEMA_VERSION,
    validateEditorStoreRecord,
} from './editor-storage.mjs';

const fail = code => { throw new Error(code); };
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

const validationErrors = new Set([
    'invalidData', 'invalidRevision', 'invalidStoreRevision', 'name', 'phaseTitle',
    'duration', 'totalLimit', 'phasesRequired', 'invalidCategory', 'invalidNotes',
    'invalidResource', 'invalidStore',
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
    else if (code === 'templateNotFound') type = 'missing';
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
