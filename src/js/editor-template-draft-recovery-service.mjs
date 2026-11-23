import {
    EDITOR_DRAFT_RECOVERY_SCHEMA_VERSION,
    validateEditorDraftRecoveryRecord,
} from './editor-draft-recovery.mjs';
import { validateEditorStoreRecord } from './editor-storage.mjs';

const fail = code => { throw new Error(code); };
const copy = value => structuredClone(value);
const errorCode = error => typeof error?.message === 'string' && error.message
    ? error.message : 'recoveryCheckpointFailed';

function classify(record, workspace) {
    if (record.state === 'pending') return 'pending';
    const draft = record.draft;
    if (draft.mode === 'create') {
        return workspace.revision === draft.expectedAggregateRevision
            && !workspace.templates.some(template => template.id === draft.template.id)
            ? 'restorable' : 'conflict';
    }
    const template = workspace.templates.find(item => item.id === draft.template.id);
    if (!template || workspace.revision !== draft.expectedAggregateRevision
        || template.revision !== draft.expectedTemplateRevision) return 'conflict';
    const expectedBaseline = {
        mode: 'update',
        expectedAggregateRevision: workspace.revision,
        expectedTemplateRevision: template.revision,
        template: { id: template.id, ...copy(template.plan) },
    };
    return JSON.stringify(record.baseline) === JSON.stringify(expectedBaseline)
        ? 'restorable' : 'conflict';
}

export function createNativeTemplateDraftRecoveryService({
    store,
    createId = () => crypto.randomUUID(),
    now = () => Date.now(),
} = {}) {
    if (!store || ['create', 'update', 'read', 'list', 'remove'].some(method => typeof store[method] !== 'function')
        || typeof createId !== 'function' || typeof now !== 'function') fail('invalidTemplateRecoveryService');

    let session = null;

    function outcome(status, extra = {}) {
        return Object.freeze({
            status,
            error: session?.error ?? null,
            record: session?.record ? copy(session.record) : null,
            ...copy(extra),
        });
    }

    function stop(error) {
        session = {
            ...session,
            blocked: true,
            error: errorCode(error),
        };
        return outcome('error');
    }

    function persistRecord(changes) {
        if (!session) fail('templateRecoveryNotStarted');
        if (session.blocked) return outcome('blocked');
        try {
            const candidate = validateEditorDraftRecoveryRecord({
                ...session.record,
                savedAt: now(),
                ...copy(changes),
            });
            session.record = session.persisted
                ? store.update(candidate, session.record.savedAt)
                : store.create(candidate);
            session.persisted = true;
            return outcome('success');
        } catch (error) {
            return stop(error);
        }
    }

    function persist(nextDraft) {
        return persistRecord({ draft: copy(nextDraft) });
    }

    function readExact(recoveryId, expectedSavedAt) {
        const record = store.read(recoveryId);
        if (record === null) fail('recoveryNotFound');
        if (record.savedAt !== expectedSavedAt || record.editorKind !== 'template') fail('recoveryConflict');
        return record;
    }

    function removeOne(recoveryId, expectedSavedAt) {
        try {
            store.remove(recoveryId, expectedSavedAt);
            return { status: 'success', error: null, record: null };
        } catch (error) {
            const original = errorCode(error);
            try {
                const current = store.read(recoveryId);
                if (current === null) return { status: 'success', error: null, record: null };
                if (current.savedAt !== expectedSavedAt) {
                    return { status: 'conflict', error: 'recoveryConflict', record: copy(current) };
                }
                return { status: 'error', error: original, record: copy(current) };
            } catch (readError) {
                return { status: 'uncertain', error: errorCode(readError), record: null };
            }
        }
    }

    return Object.freeze({
        begin(draft) {
            session = null;
            try {
                const baseline = copy(draft);
                const record = validateEditorDraftRecoveryRecord({
                    schemaVersion: EDITOR_DRAFT_RECOVERY_SCHEMA_VERSION,
                    recoveryId: createId('recovery'),
                    contextId: createId('context'),
                    savedAt: now(),
                    editorKind: 'template',
                    entityId: baseline.template.id,
                    sourceTemplateId: null,
                    state: 'draft',
                    baseline,
                    draft: baseline,
                    pending: null,
                });
                session = { record, persisted: false, blocked: false, error: null };
                return draft.mode === 'create' ? persist(draft) : outcome('ready');
            } catch (error) {
                return stop(error);
            }
        },

        checkpoint(draft) {
            return persist(draft);
        },

        list(workspace) {
            try {
                const authoritative = validateEditorStoreRecord(workspace);
                const listed = store.list();
                return Object.freeze({
                    status: 'success',
                    error: null,
                    candidates: listed.records
                        .filter(record => record.editorKind === 'template')
                        .map(record => ({ status: classify(record, authoritative), record: copy(record) })),
                    errors: copy(listed.errors),
                });
            } catch (error) {
                return Object.freeze({
                    status: 'error', error: errorCode(error), candidates: [], errors: [],
                });
            }
        },

        adopt({ recoveryId, expectedSavedAt, workspace } = {}) {
            session = null;
            try {
                const authoritative = validateEditorStoreRecord(workspace);
                const record = readExact(recoveryId, expectedSavedAt);
                const assessment = classify(record, authoritative);
                if (assessment === 'conflict') {
                    return Object.freeze({ status: 'conflict', error: 'recoveryConflict', record: copy(record) });
                }
                session = { record, persisted: true, blocked: false, error: null };
                return outcome(record.state === 'pending' ? 'pending' : 'success', { assessment });
            } catch (error) {
                return Object.freeze({ status: 'error', error: errorCode(error), record: null });
            }
        },

        checkpointPending(pending) {
            return persistRecord({ state: 'pending', pending: copy(pending) });
        },

        resolveAbsent() {
            return persistRecord({ state: 'draft', pending: null });
        },

        current() {
            return Object.freeze({
                record: session?.record ? copy(session.record) : null,
                persisted: Boolean(session?.persisted),
                blocked: Boolean(session?.blocked),
                error: session?.error ?? null,
            });
        },

        discard(recoveryId, expectedSavedAt) {
            return Object.freeze(copy(removeOne(recoveryId, expectedSavedAt)));
        },

        discardCurrent() {
            if (!session) return outcome('success');
            if (!session.persisted && !session.blocked) { session = null; return outcome('success'); }
            const result = removeOne(session.record.recoveryId, session.record.savedAt);
            if (result.status === 'success') session = null;
            return Object.freeze(copy(result));
        },

        cleanup() {
            if (!session) return outcome('success');
            if (!session.persisted && !session.blocked) { session = null; return outcome('success'); }
            const result = removeOne(session.record.recoveryId, session.record.savedAt);
            if (result.status === 'success') session = null;
            return Object.freeze(copy(result));
        },

        deactivate() {
            session = null;
        },
    });
}
