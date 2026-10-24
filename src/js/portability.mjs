import { validateLibrary } from './templates.mjs?v=35';

export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
const fail = code => { throw new Error(code); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function fields(value, allowed) {
    if (!object(value) || Object.keys(value).some(key => !allowed.includes(key))) fail('importInvalid');
}

export function parseRundowns(text) {
    if (typeof text !== 'string' || !text.trim()) fail('importEmpty');
    if (new TextEncoder().encode(text).byteLength > MAX_IMPORT_BYTES) fail('importSize');
    let data;
    try { data = JSON.parse(text.replace(/^\uFEFF/, '')); } catch { fail('importJSON'); }
    fields(data, ['schemaVersion', 'templates']);
    if (data.schemaVersion !== 1) fail('importVersion');
    if (!Array.isArray(data.templates)) fail('importInvalid');
    if (!data.templates.length) fail('importEmpty');
    for (const template of data.templates) {
        fields(template, ['id', 'name', 'transitionMode', 'phases']);
        if (!Array.isArray(template.phases)) fail('importInvalid');
        for (const phase of template.phases) fields(phase, ['id', 'title', 'durationSeconds']);
    }
    try { return validateLibrary(data); }
    catch (error) {
        if (error.message === 'duration') fail('importDuration');
        if (error.message === 'totalLimit') fail('importLimit');
        fail('importInvalid');
    }
}

export function serializeRundowns(data) {
    // Canonical validation deliberately drops runtime and UI-only properties on export.
    return JSON.stringify(validateLibrary(data), null, 2) + '\n';
}

export function rundownCollisions(incoming, existing) {
    const source = validateLibrary(incoming), saved = validateLibrary(existing);
    const nameKey = name => name.normalize('NFC').toLowerCase();
    const ids = new Set(saved.templates.map(item => item.id));
    const names = new Set(saved.templates.map(item => nameKey(item.name)));
    const counts = new Map();
    for (const item of source.templates) counts.set(nameKey(item.name), (counts.get(nameKey(item.name)) || 0) + 1);
    return source.templates.map(item => ({ id: ids.has(item.id), name: names.has(nameKey(item.name)) || counts.get(nameKey(item.name)) > 1 }));
}

export function independentCopies(incoming, existing, createId = () => crypto.randomUUID()) {
    const source = validateLibrary(incoming), saved = validateLibrary(existing);
    const used = new Set();
    for (const item of [...source.templates, ...saved.templates]) {
        used.add(item.id); for (const phase of item.phases) used.add(phase.id);
    }
    const fresh = () => {
        for (let attempt = 0; attempt < 100; attempt++) {
            const id = createId();
            if (typeof id === 'string' && id.trim() && !used.has(id)) { used.add(id); return id; }
        }
        fail('importInvalid');
    };
    return validateLibrary({ schemaVersion: 1, templates: source.templates.map(item => ({
        ...item, id: fresh(), phases: item.phases.map(phase => ({ ...phase, id: fresh() })),
    })) });
}

export function rundownFromRun(run) {
    return validateLibrary({ schemaVersion: 1, templates: [{
        id: run.sourceTemplateId, name: run.name, transitionMode: run.transitionMode, phases: run.phases,
    }] });
}

export function exportFilename(name) {
    const slug = String(name).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 64);
    return `easytimer-${slug || 'rundown'}.json`;
}

export function downloadRundowns(data, filename = 'easytimer-rundowns.json') {
    const file = new Blob([serializeRundowns(data)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(file);
    try {
        const link = document.createElement('a');
        link.href = url; link.download = filename; document.body.append(link);
        try { link.click(); } finally { link.remove(); }
    } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
