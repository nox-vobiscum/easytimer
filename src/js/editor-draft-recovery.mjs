import {
    EDITOR_KINDS,
    EDITOR_SCHEMA_VERSION,
    PHASE_CATEGORIES,
    RUNDOWN_CATEGORIES,
    validatePersistedPlan,
    validateTemplate,
} from './editor-domain.mjs';
import {
    insertTemplateInRecord,
    updatePlannedExecutionPlanInRecord,
    updateTemplateInRecord,
    validateEditorStoreRecord,
} from './editor-storage.mjs';
import { normalizeDraftDuration } from './editor-template-draft.mjs';

export const EDITOR_DRAFT_RECOVERY_PREFIX = 'easyTimerEditorDraftRecovery.v1.';
export const EDITOR_DRAFT_RECOVERY_SCHEMA_VERSION = 1;

const RECOVERY_ID = /^[A-Za-z0-9-]{1,80}$/;
const EDITOR_KINDS_SUPPORTED = new Set(['template', 'newExecution', 'execution']);
const fail = code => { throw new Error(code); };
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function exactFields(value, fields) {
    if (!isObject(value)
        || Object.keys(value).length !== fields.length
        || fields.some(field => !Object.hasOwn(value, field))) fail('recoveryValidation');
}

function identity(value, nullable = false) {
    if (nullable && value === null) return null;
    if (typeof value !== 'string' || !value.trim()) fail('recoveryValidation');
    return value;
}

function recoveryIdentity(value) {
    if (typeof value !== 'string' || !RECOVERY_ID.test(value)) fail('recoveryValidation');
    return value;
}

function revision(value, nullable = false) {
    if (nullable && value === null) return null;
    if (!Number.isSafeInteger(value) || value < 0) fail('recoveryValidation');
    return value;
}

function validateResource(resource) {
    exactFields(resource, ['label', 'url']);
    if (typeof resource.label !== 'string' || typeof resource.url !== 'string') fail('recoveryValidation');
    return { label: resource.label, url: resource.url };
}

function validateEditablePlan(plan) {
    exactFields(plan, ['name', 'category', 'transitionMode', 'preparedInformation', 'phases']);
    if (typeof plan.name !== 'string'
        || !RUNDOWN_CATEGORIES.includes(plan.category)
        || !['manual', 'automatic'].includes(plan.transitionMode)
        || typeof plan.preparedInformation !== 'string'
        || !Array.isArray(plan.phases)) fail('recoveryValidation');
    const ids = new Set();
    const phases = plan.phases.map(phase => {
        exactFields(phase, ['id', 'title', 'durationSeconds', 'category', 'notes', 'resources']);
        const id = identity(phase.id);
        if (ids.has(id)
            || typeof phase.title !== 'string'
            || !(phase.durationSeconds === null || typeof phase.durationSeconds === 'string'
                || Number.isSafeInteger(phase.durationSeconds))
            || !PHASE_CATEGORIES.includes(phase.category)
            || typeof phase.notes !== 'string'
            || !Array.isArray(phase.resources)) fail('recoveryValidation');
        ids.add(id);
        return {
            id,
            title: phase.title,
            durationSeconds: phase.durationSeconds,
            category: phase.category,
            notes: phase.notes,
            resources: phase.resources.map(validateResource),
        };
    });
    return {
        name: plan.name,
        category: plan.category,
        transitionMode: plan.transitionMode,
        preparedInformation: plan.preparedInformation,
        phases,
    };
}

function validateEditableTemplate(template) {
    if (!isObject(template)) fail('recoveryValidation');
    const { id, ...plan } = template;
    return { id: identity(id), ...validateEditablePlan(plan) };
}

function validateTemplateDraft(draft) {
    exactFields(draft, ['mode', 'expectedAggregateRevision', 'expectedTemplateRevision', 'template']);
    if (!['create', 'update'].includes(draft.mode)) fail('recoveryValidation');
    const expectedAggregateRevision = revision(draft.expectedAggregateRevision);
    const expectedTemplateRevision = revision(draft.expectedTemplateRevision, true);
    if ((draft.mode === 'create' && expectedTemplateRevision !== null)
        || (draft.mode === 'update' && (expectedTemplateRevision === null || expectedTemplateRevision < 1))) {
        fail('recoveryValidation');
    }
    return {
        mode: draft.mode,
        expectedAggregateRevision,
        expectedTemplateRevision,
        template: validateEditableTemplate(draft.template),
    };
}

function validateNewExecutionDraft(draft) {
    exactFields(draft, [
        'executionId', 'expectedAggregateRevision', 'expectedExecutionRevision', 'template', 'sourceTemplateId',
    ]);
    if (draft.executionId !== null || draft.expectedExecutionRevision !== null) fail('recoveryValidation');
    return {
        executionId: null,
        expectedAggregateRevision: revision(draft.expectedAggregateRevision),
        expectedExecutionRevision: null,
        template: validateEditableTemplate(draft.template),
        sourceTemplateId: identity(draft.sourceTemplateId),
    };
}

function validateExecutionDraft(draft) {
    exactFields(draft, ['executionId', 'expectedAggregateRevision', 'expectedExecutionRevision', 'template']);
    const executionId = identity(draft.executionId);
    const template = validateEditableTemplate(draft.template);
    if (template.id !== executionId) fail('recoveryValidation');
    const expectedExecutionRevision = revision(draft.expectedExecutionRevision);
    if (expectedExecutionRevision < 1) fail('recoveryValidation');
    return {
        executionId,
        expectedAggregateRevision: revision(draft.expectedAggregateRevision),
        expectedExecutionRevision,
        template,
    };
}

function validateDraftForKind(draft, editorKind) {
    if (editorKind === 'template') return validateTemplateDraft(draft);
    if (editorKind === 'newExecution') return validateNewExecutionDraft(draft);
    return validateExecutionDraft(draft);
}

function assertSameBinding(baseline, draft, editorKind) {
    const fields = editorKind === 'template'
        ? ['mode', 'expectedAggregateRevision', 'expectedTemplateRevision']
        : ['executionId', 'expectedAggregateRevision', 'expectedExecutionRevision'];
    if (fields.some(field => baseline[field] !== draft[field])
        || baseline.template.id !== draft.template.id
        || (editorKind === 'newExecution' && baseline.sourceTemplateId !== draft.sourceTemplateId)) {
        fail('recoveryValidation');
    }
}

function saveSnapshotFromRecoveryDraft(draft) {
    const snapshot = structuredClone(draft);
    for (const phase of snapshot.template.phases) {
        phase.durationSeconds = normalizeDraftDuration(phase.durationSeconds);
        phase.resources = phase.resources.filter(resource => resource.label.trim() || resource.url.trim());
    }
    return snapshot;
}

function validateTemplatePending(ticket, record) {
    exactFields(ticket, ['draft', 'operation', 'source', 'target']);
    const draft = validateTemplateDraft(ticket.draft);
    if (draft.template.id !== record.draft.template.id) fail('recoveryValidation');
    const source = validateEditorStoreRecord(ticket.source);
    const target = validateEditorStoreRecord(ticket.target);
    const operation = structuredClone(ticket.operation);
    const { id, ...plan } = draft.template;
    let expectedOperation;
    try {
        const template = validateTemplate({
            schemaVersion: EDITOR_SCHEMA_VERSION,
            kind: EDITOR_KINDS.TEMPLATE,
            id,
            revision: draft.mode === 'create' ? 1 : draft.expectedTemplateRevision,
            plan,
        });
        expectedOperation = draft.mode === 'create'
            ? { kind: 'create', template, expectedAggregateRevision: draft.expectedAggregateRevision }
            : {
                kind: 'update',
                template,
                expectedAggregateRevision: draft.expectedAggregateRevision,
                expectedTemplateRevision: draft.expectedTemplateRevision,
            };
    } catch { fail('recoveryValidation'); }
    let expected;
    if (operation?.kind === 'create') {
        exactFields(operation, ['kind', 'template', 'expectedAggregateRevision']);
        expected = insertTemplateInRecord(source, operation);
    } else if (operation?.kind === 'update') {
        exactFields(operation, ['kind', 'template', 'expectedAggregateRevision', 'expectedTemplateRevision']);
        expected = updateTemplateInRecord(source, operation);
    } else fail('recoveryValidation');
    if (JSON.stringify(draft) !== JSON.stringify(saveSnapshotFromRecoveryDraft(record.draft))
        || JSON.stringify(operation) !== JSON.stringify(expectedOperation)
        || JSON.stringify(expected) !== JSON.stringify(target)
        || draft.mode !== record.draft.mode
        || draft.expectedAggregateRevision !== record.draft.expectedAggregateRevision
        || draft.expectedTemplateRevision !== record.draft.expectedTemplateRevision) fail('recoveryValidation');
    return { draft, operation, source, target };
}

function executionDraftOptions(draft) {
    const { id, ...currentPlan } = draft.template;
    return {
        executionId: id,
        expectedAggregateRevision: draft.expectedAggregateRevision,
        expectedExecutionRevision: draft.expectedExecutionRevision,
        currentPlan,
    };
}

function validateExecutionPending(ticket, record) {
    exactFields(ticket, ['draft', 'source', 'target']);
    const draft = validateExecutionDraft(ticket.draft);
    if (JSON.stringify(draft) !== JSON.stringify(saveSnapshotFromRecoveryDraft(record.draft))
        || draft.executionId !== record.draft.executionId
        || draft.expectedAggregateRevision !== record.draft.expectedAggregateRevision
        || draft.expectedExecutionRevision !== record.draft.expectedExecutionRevision) fail('recoveryValidation');
    const source = validateEditorStoreRecord(ticket.source);
    const target = validateEditorStoreRecord(ticket.target);
    const expected = updatePlannedExecutionPlanInRecord(source, executionDraftOptions(draft));
    if (JSON.stringify(expected) !== JSON.stringify(target)) fail('recoveryValidation');
    return { draft, source, target };
}

function validatePlanPending(ticket, record) {
    exactFields(ticket, ['executionId', 'retained', 'sourceTemplateId', 'expectedPlan']);
    const sourceTemplateId = identity(ticket.sourceTemplateId);
    if (sourceTemplateId !== record.sourceTemplateId) fail('recoveryValidation');
    let expectedPlan;
    try { expectedPlan = validatePersistedPlan(ticket.expectedPlan); }
    catch { fail('recoveryValidation'); }
    const retained = validateEditableTemplate(ticket.retained);
    const { id: ignored, ...baselinePlan } = record.baseline.template;
    if (JSON.stringify(retained) !== JSON.stringify(record.draft.template)
        || JSON.stringify(expectedPlan) !== JSON.stringify(baselinePlan)) fail('recoveryValidation');
    return {
        executionId: identity(ticket.executionId),
        retained,
        sourceTemplateId,
        expectedPlan,
    };
}

function validatePending(pending, record) {
    exactFields(pending, ['kind', 'ticket']);
    if (record.editorKind === 'template' && pending.kind === 'templateSave') {
        return { kind: pending.kind, ticket: validateTemplatePending(pending.ticket, record) };
    }
    if (record.editorKind === 'execution' && pending.kind === 'executionSave') {
        return { kind: pending.kind, ticket: validateExecutionPending(pending.ticket, record) };
    }
    if (record.editorKind === 'newExecution' && pending.kind === 'plan') {
        return { kind: pending.kind, ticket: validatePlanPending(pending.ticket, record) };
    }
    fail('recoveryValidation');
}

function validateRecord(record) {
    exactFields(record, [
        'schemaVersion', 'recoveryId', 'contextId', 'savedAt', 'editorKind', 'entityId',
        'sourceTemplateId', 'state', 'baseline', 'draft', 'pending',
    ]);
    if (record.schemaVersion !== EDITOR_DRAFT_RECOVERY_SCHEMA_VERSION) fail('unsupportedRecoverySchema');
    const recoveryId = recoveryIdentity(record.recoveryId);
    const contextId = recoveryIdentity(record.contextId);
    if (!EDITOR_KINDS_SUPPORTED.has(record.editorKind)
        || !['draft', 'pending'].includes(record.state)) fail('recoveryValidation');
    const baseline = validateDraftForKind(record.baseline, record.editorKind);
    const draft = validateDraftForKind(record.draft, record.editorKind);
    assertSameBinding(baseline, draft, record.editorKind);
    const entityId = identity(record.entityId, true);
    const sourceTemplateId = identity(record.sourceTemplateId, true);
    if ((record.editorKind === 'template'
        && (entityId !== draft.template.id || sourceTemplateId !== null))
        || (record.editorKind === 'newExecution'
            && (entityId !== null || sourceTemplateId !== draft.sourceTemplateId))
        || (record.editorKind === 'execution'
            && (entityId !== draft.executionId || sourceTemplateId !== null))) fail('recoveryValidation');
    const normalized = {
        schemaVersion: EDITOR_DRAFT_RECOVERY_SCHEMA_VERSION,
        recoveryId,
        contextId,
        savedAt: revision(record.savedAt),
        editorKind: record.editorKind,
        entityId,
        sourceTemplateId,
        state: record.state,
        baseline,
        draft,
        pending: null,
    };
    if (record.state === 'draft') {
        if (record.pending !== null) fail('recoveryValidation');
    } else {
        if (record.pending === null) fail('recoveryValidation');
        normalized.pending = validatePending(record.pending, normalized);
    }
    return normalized;
}

export function validateEditorDraftRecoveryRecord(record) {
    try { return structuredClone(validateRecord(record)); }
    catch (error) {
        if (['unsupportedRecoverySchema', 'recoveryValidation'].includes(error?.message)) throw error;
        fail('recoveryValidation');
    }
}

function storageError(error, fallback) {
    if (error?.name === 'QuotaExceededError') fail('recoveryStorageQuota');
    if (error?.name === 'SecurityError') fail('recoveryStorageSecurity');
    fail(fallback);
}

function sameRecoveryBinding(left, right) {
    return left.recoveryId === right.recoveryId
        && left.contextId === right.contextId
        && left.editorKind === right.editorKind
        && left.entityId === right.entityId
        && left.sourceTemplateId === right.sourceTemplateId
        && JSON.stringify(left.baseline) === JSON.stringify(right.baseline);
}

function parse(raw) {
    let value;
    try { value = JSON.parse(raw); }
    catch { fail('recoveryParse'); }
    return validateEditorDraftRecoveryRecord(value);
}

function recoveryKey(recoveryId) {
    return EDITOR_DRAFT_RECOVERY_PREFIX + recoveryIdentity(recoveryId);
}

export function createEditorDraftRecoveryStore(storage) {
    if (!storage
        || typeof storage.getItem !== 'function'
        || typeof storage.setItem !== 'function'
        || typeof storage.removeItem !== 'function'
        || typeof storage.key !== 'function') fail('invalidRecoveryStorage');

    function getRaw(key) {
        try { return storage.getItem(key); }
        catch (error) { storageError(error, 'recoveryStorageRead'); }
    }

    function setRaw(key, raw) {
        try { storage.setItem(key, raw); }
        catch (error) { storageError(error, 'recoveryStorageWrite'); }
    }

    function removeRaw(key) {
        try { storage.removeItem(key); }
        catch (error) { storageError(error, 'recoveryStorageRemove'); }
    }

    function confirmedWrite(record) {
        const key = recoveryKey(record.recoveryId);
        const raw = JSON.stringify(record);
        setRaw(key, raw);
        let readback;
        try { readback = storage.getItem(key); }
        catch { fail('recoveryStorageWriteUnconfirmed'); }
        if (readback !== raw) fail('recoveryStorageReadback');
        let confirmed;
        try { confirmed = parse(readback); }
        catch { fail('recoveryStorageReadback'); }
        if (JSON.stringify(confirmed) !== raw) fail('recoveryStorageReadback');
        return structuredClone(confirmed);
    }

    return Object.freeze({
        create(record) {
            const valid = validateEditorDraftRecoveryRecord(record);
            const key = recoveryKey(valid.recoveryId);
            if (getRaw(key) !== null) fail('recoveryConflict');
            return confirmedWrite(valid);
        },

        update(record, expectedSavedAt) {
            const valid = validateEditorDraftRecoveryRecord(record);
            revision(expectedSavedAt);
            const key = recoveryKey(valid.recoveryId);
            const raw = getRaw(key);
            if (raw === null) fail('recoveryNotFound');
            const current = parse(raw);
            if (current.savedAt !== expectedSavedAt || !sameRecoveryBinding(current, valid)) {
                fail('recoveryConflict');
            }
            if (expectedSavedAt === Number.MAX_SAFE_INTEGER) fail('recoveryVersionOverflow');
            valid.savedAt = Math.max(valid.savedAt, expectedSavedAt + 1);
            return confirmedWrite(valid);
        },

        read(recoveryId) {
            const raw = getRaw(recoveryKey(recoveryId));
            return raw === null ? null : structuredClone(parse(raw));
        },

        list() {
            let length;
            try { length = storage.length; }
            catch (error) { storageError(error, 'recoveryStorageRead'); }
            if (!Number.isSafeInteger(length) || length < 0) fail('invalidRecoveryStorage');
            const records = [];
            const errors = [];
            const keys = [];
            for (let index = 0; index < length; index += 1) {
                let key;
                try { key = storage.key(index); }
                catch (error) { storageError(error, 'recoveryStorageRead'); }
                if (typeof key === 'string' && key.startsWith(EDITOR_DRAFT_RECOVERY_PREFIX)) keys.push(key);
            }
            keys.sort();
            for (const key of keys) {
                try {
                    const raw = getRaw(key);
                    if (raw === null) errors.push({ key, code: 'recoveryNotFound' });
                    else {
                        const record = parse(raw);
                        if (key !== recoveryKey(record.recoveryId)) fail('recoveryValidation');
                        records.push(record);
                    }
                } catch (error) {
                    errors.push({ key, code: error?.message ?? 'recoveryValidation' });
                }
            }
            records.sort((left, right) => right.savedAt - left.savedAt
                || left.recoveryId.localeCompare(right.recoveryId));
            return { records: structuredClone(records), errors };
        },

        remove(recoveryId, expectedSavedAt) {
            revision(expectedSavedAt);
            const key = recoveryKey(recoveryId);
            const raw = getRaw(key);
            if (raw === null) fail('recoveryNotFound');
            const current = parse(raw);
            if (current.savedAt !== expectedSavedAt) fail('recoveryConflict');
            removeRaw(key);
            let readback;
            try { readback = storage.getItem(key); }
            catch { fail('recoveryStorageRemoveUnconfirmed'); }
            if (readback !== null) fail('recoveryStorageRemoveUnconfirmed');
            return structuredClone(current);
        },
    });
}
