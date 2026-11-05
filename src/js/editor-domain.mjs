export const EDITOR_SCHEMA_VERSION = 2;

export const EDITOR_KINDS = Object.freeze({
    TEMPLATE: 'template',
    EXECUTION: 'execution',
});

export const EXECUTION_LIFECYCLES = Object.freeze({
    PLANNED: 'planned',
    ACTIVE: 'active',
    SUSPENDED: 'suspended',
    COMPLETED: 'completed',
});

export const RUNDOWN_CATEGORIES = Object.freeze([
    'uncategorized',
    'workshop',
    'meeting',
    'training',
    'conference',
]);

export const PHASE_CATEGORIES = Object.freeze([
    'uncategorized',
    'presentation',
    'discussion',
    'breakout',
    'break',
]);

export const DEFAULT_RUNDOWN_CATEGORY = 'uncategorized';
export const DEFAULT_PHASE_CATEGORY = 'uncategorized';
export const MAX_PHASE_SECONDS = 6000 * 60;
export const MAX_TOTAL_SECONDS = 60000 * 60;

const fail = code => { throw new Error(code); };
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function exactFields(value, required, optional = []) {
    if (!isObject(value)) fail('invalidData');
    const allowed = new Set([...required, ...optional]);
    if (Object.keys(value).some(key => !allowed.has(key)) || required.some(key => !Object.hasOwn(value, key))) {
        fail('invalidData');
    }
}

function identity(value) {
    if (typeof value !== 'string' || !value.trim()) fail('invalidData');
    return value;
}

function text(value, code) {
    if (typeof value !== 'string') fail(code);
    const normalized = value.trim();
    if (!normalized || normalized.length > 120) fail(code);
    return normalized;
}

function note(value, code = 'invalidNotes') {
    if (typeof value !== 'string') fail(code);
    return value;
}

function revision(value, code) {
    if (!Number.isSafeInteger(value) || value < 0) fail(code);
    return value;
}

function category(value, allowed, fallback) {
    const normalized = value === undefined ? fallback : value;
    if (!allowed.includes(normalized)) fail('invalidCategory');
    return normalized;
}

function duration(value) {
    if (!Number.isSafeInteger(value) || value < 60 || value % 60 !== 0 || value > MAX_PHASE_SECONDS) {
        fail('duration');
    }
    return value;
}

function validateResource(resource) {
    exactFields(resource, ['label', 'url']);
    const label = text(resource.label, 'invalidResource');
    if (typeof resource.url !== 'string' || !resource.url.trim()) fail('invalidResource');
    const url = resource.url.trim();
    let parsed;
    try { parsed = new URL(url); } catch { fail('invalidResource'); }
    if (!['http:', 'https:'].includes(parsed.protocol)) fail('invalidResource');
    return { label, url };
}

function validateResources(resources) {
    if (!Array.isArray(resources)) fail('invalidResource');
    return resources.map(validateResource);
}

function validatePhase(phase, ids) {
    exactFields(phase, ['id', 'title', 'durationSeconds'], ['category', 'notes', 'resources']);
    const id = identity(phase.id);
    if (ids.has(id)) fail('invalidData');
    ids.add(id);
    return {
        id,
        title: text(phase.title, 'phaseTitle'),
        durationSeconds: duration(phase.durationSeconds),
        category: category(phase.category, PHASE_CATEGORIES, DEFAULT_PHASE_CATEGORY),
        notes: note(phase.notes === undefined ? '' : phase.notes),
        resources: validateResources(phase.resources === undefined ? [] : phase.resources),
    };
}

export function validateRundownPlan(plan) {
    exactFields(plan, ['name', 'transitionMode', 'phases'], ['category', 'preparedInformation']);
    if (!['manual', 'automatic'].includes(plan.transitionMode)) fail('invalidData');
    if (!Array.isArray(plan.phases) || !plan.phases.length) fail('phasesRequired');
    const ids = new Set();
    const phases = plan.phases.map(phase => validatePhase(phase, ids));
    phases.reduce((sum, phase) => {
        const next = sum + phase.durationSeconds;
        if (!Number.isSafeInteger(next) || next > MAX_TOTAL_SECONDS) fail('totalLimit');
        return next;
    }, 0);
    return {
        name: text(plan.name, 'name'),
        category: category(plan.category, RUNDOWN_CATEGORIES, DEFAULT_RUNDOWN_CATEGORY),
        transitionMode: plan.transitionMode,
        preparedInformation: note(plan.preparedInformation === undefined ? '' : plan.preparedInformation),
        phases,
    };
}

export function validateTemplate(template) {
    exactFields(template, ['schemaVersion', 'kind', 'id', 'revision', 'plan']);
    if (template.schemaVersion !== EDITOR_SCHEMA_VERSION || template.kind !== EDITOR_KINDS.TEMPLATE) fail('invalidData');
    const normalizedRevision = revision(template.revision, 'invalidRevision');
    if (normalizedRevision < 1) fail('invalidRevision');
    return {
        schemaVersion: EDITOR_SCHEMA_VERSION,
        kind: EDITOR_KINDS.TEMPLATE,
        id: identity(template.id),
        revision: normalizedRevision,
        plan: validateRundownPlan(template.plan),
    };
}

export function validateWorkshopNotes(workshopNotes, plan) {
    exactFields(workshopNotes, ['rundown', 'phases']);
    if (!Array.isArray(workshopNotes.phases)) fail('invalidNotes');
    const phaseIds = new Set(plan.phases.map(phase => phase.id));
    const seen = new Set();
    const phases = workshopNotes.phases.map(entry => {
        exactFields(entry, ['phaseId', 'text']);
        const phaseId = identity(entry.phaseId);
        if (!phaseIds.has(phaseId) || seen.has(phaseId)) fail('invalidNotes');
        seen.add(phaseId);
        const normalizedText = note(entry.text);
        if (!normalizedText.trim()) fail('invalidNotes');
        return { phaseId, text: normalizedText };
    });
    return { rundown: note(workshopNotes.rundown), phases };
}

function validateSource(source) {
    if (source === null) return null;
    exactFields(source, ['kind', 'id']);
    if (!['template', 'builtin'].includes(source.kind)) fail('invalidData');
    return { kind: source.kind, id: identity(source.id) };
}

function validateExecution(execution, lifecycle, validateAttempt) {
    exactFields(execution, [
        'schemaVersion', 'kind', 'id', 'revision', 'runtimeRevision', 'source', 'lifecycle',
        'currentPlan', 'workshopNotes', 'attempt',
    ]);
    if (execution.schemaVersion !== EDITOR_SCHEMA_VERSION || execution.kind !== EDITOR_KINDS.EXECUTION) fail('invalidData');
    if (execution.lifecycle !== lifecycle) fail('invalidLifecycle');
    const normalizedRevision = revision(execution.revision, 'invalidRevision');
    const normalizedRuntimeRevision = revision(execution.runtimeRevision, 'invalidRuntimeRevision');
    if (normalizedRevision < 1 || normalizedRuntimeRevision > normalizedRevision) fail('invalidRevision');
    const currentPlan = validateRundownPlan(execution.currentPlan);
    return {
        schemaVersion: EDITOR_SCHEMA_VERSION,
        kind: EDITOR_KINDS.EXECUTION,
        id: identity(execution.id),
        revision: normalizedRevision,
        runtimeRevision: normalizedRuntimeRevision,
        source: validateSource(execution.source),
        lifecycle,
        currentPlan,
        workshopNotes: validateWorkshopNotes(execution.workshopNotes, currentPlan),
        attempt: validateAttempt(execution.attempt),
    };
}

const absentAttempt = attempt => {
    if (attempt !== null) fail('invalidAttempt');
    return null;
};

function validateAttempt(attempt) {
    if (!isObject(attempt)) fail('invalidAttempt');
    exactFields(attempt, ['id', 'startedAt', 'startSnapshot']);
    if (!Number.isSafeInteger(attempt.startedAt) || attempt.startedAt < 0) fail('invalidAttempt');
    return {
        id: identity(attempt.id),
        startedAt: attempt.startedAt,
        startSnapshot: validateRundownPlan(attempt.startSnapshot),
    };
}

function nextRevision(value) {
    if (!Number.isSafeInteger(value) || value >= Number.MAX_SAFE_INTEGER) fail('invalidRevision');
    return value + 1;
}

export function validatePlannedExecution(execution) {
    return validateExecution(execution, EXECUTION_LIFECYCLES.PLANNED, absentAttempt);
}

export function validateReadyExecution(execution) {
    return validateExecution(execution, EXECUTION_LIFECYCLES.ACTIVE, absentAttempt);
}

export function validateStartedExecution(execution) {
    return validateExecution(execution, EXECUTION_LIFECYCLES.ACTIVE, validateAttempt);
}

export function validateSuspendedReadyExecution(execution) {
    return validateExecution(execution, EXECUTION_LIFECYCLES.SUSPENDED, absentAttempt);
}

export function createPlannedExecution(template, executionId = crypto.randomUUID()) {
    const validTemplate = validateTemplate(template);
    return validatePlannedExecution({
        schemaVersion: EDITOR_SCHEMA_VERSION,
        kind: EDITOR_KINDS.EXECUTION,
        id: executionId,
        revision: 1,
        runtimeRevision: 0,
        source: { kind: 'template', id: validTemplate.id },
        lifecycle: EXECUTION_LIFECYCLES.PLANNED,
        currentPlan: validTemplate.plan,
        workshopNotes: { rundown: '', phases: [] },
        attempt: null,
    });
}

export function activatePlannedExecution(execution) {
    const planned = validatePlannedExecution(execution);
    return validateReadyExecution({
        ...planned,
        revision: nextRevision(planned.revision),
        runtimeRevision: nextRevision(planned.runtimeRevision),
        lifecycle: EXECUTION_LIFECYCLES.ACTIVE,
    });
}

export function startActiveExecution(execution, attemptId, startedAt) {
    if (execution?.lifecycle !== EXECUTION_LIFECYCLES.ACTIVE) fail('invalidLifecycle');
    if (execution.attempt !== null) return validateStartedExecution(execution);
    const ready = validateReadyExecution(execution);
    return validateStartedExecution({
        ...ready,
        revision: nextRevision(ready.revision),
        runtimeRevision: nextRevision(ready.runtimeRevision),
        attempt: {
            id: attemptId,
            startedAt,
            startSnapshot: ready.currentPlan,
        },
    });
}

export function retainCurrentPlan(execution) {
    if (execution?.lifecycle !== EXECUTION_LIFECYCLES.ACTIVE) fail('invalidLifecycle');
    const active = execution.attempt === null
        ? validateReadyExecution(execution)
        : validateStartedExecution(execution);
    return validatePlannedExecution({
        ...active,
        revision: nextRevision(active.revision),
        runtimeRevision: nextRevision(active.runtimeRevision),
        lifecycle: EXECUTION_LIFECYCLES.PLANNED,
        workshopNotes: { rundown: '', phases: [] },
        attempt: null,
    });
}

export function suspendReadyExecution(execution) {
    if (execution?.lifecycle !== EXECUTION_LIFECYCLES.ACTIVE) fail('invalidLifecycle');
    const ready = validateReadyExecution(execution);
    return validateSuspendedReadyExecution({
        ...ready,
        revision: nextRevision(ready.revision),
        runtimeRevision: nextRevision(ready.runtimeRevision),
        lifecycle: EXECUTION_LIFECYCLES.SUSPENDED,
    });
}
