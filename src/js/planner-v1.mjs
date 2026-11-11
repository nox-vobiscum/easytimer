import { createDraft, phaseDuration, validateTemplate } from './templates.mjs?v=37';

// Public V1 Planner mapping only. Native plans must use their own domain contract.
export function preparePlannerDraft(template) {
    const draft = createDraft(template);
    if (!template) draft.phases.push({ id: crypto.randomUUID(), title: '', durationSeconds: 600 });
    draft.phases.forEach(phase => { phase.minutes = String(phase.durationSeconds / 60); });
    return draft;
}

export function materializePlannerDraft(draft) {
    return {
        id: draft.id,
        name: draft.name.trim(),
        transitionMode: draft.transitionMode,
        phases: draft.phases.map(phase => {
            let durationSeconds;
            try { durationSeconds = phaseDuration(phase.minutes); }
            catch (error) { error.phaseId = phase.id; throw error; }
            return { id: phase.id, title: phase.title.trim(), durationSeconds };
        }),
    };
}

export function savePlannerDraft(library, draft) {
    const valid = validateTemplate(materializePlannerDraft(draft));
    const templates = library.templates.some(item => item.id === valid.id)
        ? library.templates.map(item => item.id === valid.id ? valid : item)
        : [...library.templates, valid];
    return { schemaVersion: 1, templates };
}

export function deletePlannerTemplate(library, templateId) {
    return { schemaVersion: 1, templates: library.templates.filter(item => item.id !== templateId) };
}

export function appendPlannerImports(library, copies) {
    return { schemaVersion: 1, templates: [...library.templates, ...copies.templates] };
}
