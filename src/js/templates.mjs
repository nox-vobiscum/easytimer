export const STORAGE_KEY = 'easyTimerTemplates';
export const MAX_PHASE_SECONDS = 6000 * 60;
export const MAX_TOTAL_SECONDS = 60000 * 60;
const fail = code => { throw new Error(code); };
const meaningful = value => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 120;
const identity = value => typeof value === 'string' && value.trim().length > 0;

export function totalDuration(phases) {
    let total = 0;
    for (const phase of phases) {
        if (!Number.isSafeInteger(phase.durationSeconds) || phase.durationSeconds < 60 || phase.durationSeconds % 60 !== 0 || phase.durationSeconds > MAX_PHASE_SECONDS) fail('duration');
        total += phase.durationSeconds;
        if (!Number.isSafeInteger(total) || total > MAX_TOTAL_SECONDS) fail('totalLimit');
    }
    return total;
}
export function validateTemplate(template) {
    if (!template || !identity(template.id)) fail('invalidData');
    if (!meaningful(template.name)) fail('name');
    if (!['manual', 'automatic'].includes(template.transitionMode)) fail('invalidData');
    if (!Array.isArray(template.phases) || !template.phases.length) fail('phasesRequired');
    const ids = new Set();
    const phases = template.phases.map(phase => {
        if (!phase || !identity(phase.id) || ids.has(phase.id)) fail('invalidData');
        ids.add(phase.id);
        if (!meaningful(phase.title)) fail('phaseTitle');
        return { id: phase.id, title: phase.title.trim(), durationSeconds: phase.durationSeconds };
    });
    totalDuration(phases);
    return { id: template.id, name: template.name.trim(), transitionMode: template.transitionMode, phases };
}
export function validateLibrary(data) {
    if (!data || data.schemaVersion !== 1 || !Array.isArray(data.templates)) fail('invalidData');
    const templates = data.templates.map(validateTemplate);
    if (new Set(templates.map(t => t.id)).size !== templates.length) fail('invalidData');
    return { schemaVersion: 1, templates };
}
export function createDraft(template = { id: crypto.randomUUID(), name: '', transitionMode: 'manual', phases: [] }) {
    return structuredClone(template);
}
export function movePhase(draft, id, direction) {
    const index = draft.phases.findIndex(p => p.id === id);
    const target = index + direction;
    if (![1, -1].includes(direction) || index < 0 || target < 0 || target >= draft.phases.length) return;
    [draft.phases[index], draft.phases[target]] = [draft.phases[target], draft.phases[index]];
}
export function phaseDuration(minutes) {
    if (!/^\d+$/.test(String(minutes))) fail('duration');
    const value = Number(minutes);
    if (!Number.isSafeInteger(value) || value < 1 || value > 6000) fail('duration');
    return value * 60;
}

// Raw snapshots detect intervening writes without a synchronization framework.
export function createTemplateStore(getStorage) {
    let snapshot;
    let loaded = false;
    function read() {
        try { return getStorage().getItem(STORAGE_KEY); } catch { fail('storageRead'); }
    }
    return {
        load() {
            loaded = false;
            const raw = read();
            let data;
            try { data = raw === null ? { schemaVersion: 1, templates: [] } : validateLibrary(JSON.parse(raw)); }
            catch { fail('invalidData'); }
            snapshot = raw;
            loaded = true;
            return structuredClone(data);
        },
        save(data) {
            if (!loaded) fail('storageBlocked');
            const valid = validateLibrary(data);
            if (read() !== snapshot) fail('conflict');
            const raw = JSON.stringify(valid);
            try { getStorage().setItem(STORAGE_KEY, raw); } catch { fail('storageWrite'); }
            snapshot = raw;
            return structuredClone(valid);
        },
    };
}
