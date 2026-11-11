import { DEFAULT_PHASE_CATEGORY } from './editor-domain.mjs';

const fail = code => { throw new Error(code); };
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const templateFields = ['name', 'transitionMode', 'category', 'preparedInformation'];
const phaseFields = ['title', 'durationSeconds', 'category', 'notes', 'resources'];

// Field contents may be incomplete while editing. The Planner Service validates
// them on explicit Save; these operations only protect the draft's structure.
function copyDraft(draft) {
    if (!isObject(draft) || !isObject(draft.template)
        || !Array.isArray(draft.template.phases)) fail('invalidDraft');
    return structuredClone(draft);
}

function editFields(target, changes, allowed) {
    if (!isObject(changes)
        || Object.keys(changes).some(field => !allowed.includes(field))) fail('invalidDraftEdit');
    Object.assign(target, structuredClone(changes));
}

function phaseIndex(draft, phaseId) {
    const index = draft.template.phases.findIndex(phase => phase.id === phaseId);
    if (index < 0) fail('phaseNotFound');
    return index;
}

export function editNativeTemplateDraft(draft, changes) {
    const edited = copyDraft(draft);
    editFields(edited.template, changes, templateFields);
    return edited;
}

export function editNativePhaseDraft(draft, phaseId, changes) {
    const edited = copyDraft(draft);
    editFields(edited.template.phases[phaseIndex(edited, phaseId)], changes, phaseFields);
    return edited;
}

export function insertNativeDraftPhase(draft, options = {}) {
    const edited = copyDraft(draft);
    if (!isObject(options)
        || Object.keys(options).some(field => !['phaseId', 'beforePhaseId'].includes(field))) {
        fail('invalidDraftEdit');
    }
    const { phaseId, beforePhaseId = null } = options;
    if (typeof phaseId !== 'string' || !phaseId.trim()) fail('invalidDraftEdit');
    if (edited.template.phases.some(phase => phase.id === phaseId)) fail('duplicatePhaseId');
    const index = beforePhaseId === null
        ? edited.template.phases.length : phaseIndex(edited, beforePhaseId);
    edited.template.phases.splice(index, 0, {
        id: phaseId,
        title: '',
        durationSeconds: 600,
        category: DEFAULT_PHASE_CATEGORY,
        notes: '',
        resources: [],
    });
    return edited;
}

export function removeNativeDraftPhase(draft, phaseId) {
    const edited = copyDraft(draft);
    edited.template.phases.splice(phaseIndex(edited, phaseId), 1);
    return edited;
}

export function repositionNativeDraftPhase(draft, phaseId, position) {
    const edited = copyDraft(draft);
    const index = phaseIndex(edited, phaseId);
    if (!Number.isSafeInteger(position) || position < 1
        || position > edited.template.phases.length) fail('invalidPhasePosition');
    const [phase] = edited.template.phases.splice(index, 1);
    edited.template.phases.splice(position - 1, 0, phase);
    return edited;
}
