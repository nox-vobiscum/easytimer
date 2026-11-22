import {
    EDITOR_DRAFT_RECOVERY_SCHEMA_VERSION,
    validateEditorDraftRecoveryRecord,
} from './editor-draft-recovery.mjs';

const fail = code => { throw new Error(code); };
const copy = value => structuredClone(value);

export function createNativeTemplateDraftRecoveryService({
    store,
    createId = () => crypto.randomUUID(),
    now = () => Date.now(),
} = {}) {
    if (!store || typeof store.create !== 'function' || typeof store.update !== 'function'
        || typeof createId !== 'function' || typeof now !== 'function') fail('invalidTemplateRecoveryService');

    let session = null;

    function outcome(status) {
        return Object.freeze({
            status,
            error: session?.error ?? null,
            record: session?.record ? copy(session.record) : null,
        });
    }

    function stop(error) {
        session = {
            ...session,
            blocked: true,
            error: typeof error?.message === 'string' && error.message ? error.message : 'recoveryCheckpointFailed',
        };
        return outcome('error');
    }

    function persist(nextDraft) {
        if (!session) fail('templateRecoveryNotStarted');
        if (session.blocked) return outcome('blocked');
        try {
            const candidate = validateEditorDraftRecoveryRecord({
                ...session.record,
                savedAt: now(),
                draft: copy(nextDraft),
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

        deactivate() {
            session = null;
        },
    });
}
