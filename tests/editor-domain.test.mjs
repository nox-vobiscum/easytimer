import test from 'node:test';
import assert from 'node:assert/strict';
import {
    DEFAULT_PHASE_CATEGORY,
    DEFAULT_RUNDOWN_CATEGORY,
    EDITOR_KINDS,
    EDITOR_SCHEMA_VERSION,
    EXECUTION_LIFECYCLES,
    MAX_PHASE_SECONDS,
    MAX_TOTAL_SECONDS,
    PHASE_CATEGORIES,
    RUNDOWN_CATEGORIES,
    activatePlannedExecution,
    createPlannedExecution,
    retainCurrentPlan,
    resumeReadyExecution,
    startActiveExecution,
    suspendStartedExecution,
    suspendReadyExecution,
    validatePlannedExecution,
    validateReadyExecution,
    validateRundownPlan,
    validateStartedExecution,
    validateSuspendedReadyExecution,
    validateSuspendedStartedExecution,
    validateTemplate,
} from '../src/js/editor-domain.mjs';

const plan = () => ({
    name: ' Workshop ',
    transitionMode: 'manual',
    preparedInformation: '**Goal:** align the team\n\n- First\n- Second',
    phases: [
        {
            id: 'phase-1',
            title: ' Opening ',
            durationSeconds: 600,
            notes: '*Welcome* everyone.',
            resources: [{ label: ' Board ', url: 'https://example.test/board' }],
        },
        { id: 'phase-2', title: 'Discussion', durationSeconds: 1200, category: 'discussion' },
    ],
});

const template = () => ({
    schemaVersion: EDITOR_SCHEMA_VERSION,
    kind: EDITOR_KINDS.TEMPLATE,
    id: 'template-1',
    revision: 1,
    plan: plan(),
});

test('constants expose the approved schema, kinds, lifecycle values and neutral categories', () => {
    assert.equal(EDITOR_SCHEMA_VERSION, 2);
    assert.equal(EDITOR_KINDS.TEMPLATE, 'template');
    assert.deepEqual(Object.values(EXECUTION_LIFECYCLES), ['planned', 'active', 'suspended', 'completed']);
    assert.equal(DEFAULT_RUNDOWN_CATEGORY, 'uncategorized');
    assert.equal(DEFAULT_PHASE_CATEGORY, 'uncategorized');
    assert.deepEqual(RUNDOWN_CATEGORIES, ['uncategorized', 'workshop', 'meeting', 'training', 'conference']);
    assert.deepEqual(PHASE_CATEGORIES, ['uncategorized', 'presentation', 'discussion', 'breakout', 'break']);
});

test('plans normalize optional fields and retain prepared Markdown source as an uninterpreted string', () => {
    const source = plan();
    const before = structuredClone(source);
    const valid = validateRundownPlan(source);
    assert.equal(valid.name, 'Workshop');
    assert.equal(valid.category, 'uncategorized');
    assert.equal(valid.phases[0].category, 'uncategorized');
    assert.equal(valid.phases[1].notes, '');
    assert.deepEqual(valid.phases[1].resources, []);
    assert.equal(valid.preparedInformation, source.preparedInformation);
    assert.equal(valid.phases[0].notes, source.phases[0].notes);
    assert.deepEqual(source, before);
});

test('missing optional content uses defaults while explicit null remains invalid', () => {
    const missing = plan();
    delete missing.preparedInformation;
    delete missing.phases[0].notes;
    delete missing.phases[0].resources;
    const valid = validateRundownPlan(missing);
    assert.equal(valid.preparedInformation, '');
    assert.equal(valid.phases[0].notes, '');
    assert.deepEqual(valid.phases[0].resources, []);

    for (const change of [
        value => { value.preparedInformation = null; },
        value => { value.phases[0].notes = null; },
        value => { value.phases[0].resources = null; },
    ]) {
        const value = plan(); change(value);
        assert.throws(() => validateRundownPlan(value), /invalidNotes|invalidResource/);
    }
});

test('plan validation rejects unknown fields, categories, malformed resources and duplicate phase IDs', () => {
    for (const change of [
        value => { value.extra = true; },
        value => { value.category = 'custom'; },
        value => { value.preparedInformation = 7; },
        value => { value.phases[0].extra = true; },
        value => { value.phases[0].category = 'exercise'; },
        value => { value.phases[0].notes = 7; },
        value => { value.phases[0].resources[0].extra = true; },
        value => { value.phases[0].resources[0].label = ''; },
        value => { value.phases[0].resources[0].url = 'javascript:alert(1)'; },
        value => { value.phases[1].id = value.phases[0].id; },
    ]) {
        const value = plan(); change(value);
        assert.throws(() => validateRundownPlan(value));
    }
});

test('invalid resource collection types fail with the controlled resource validation code', () => {
    for (const resources of [null, {}, 'https://example.test', 7]) {
        const value = plan(); value.phases[0].resources = resources;
        assert.throws(() => validateRundownPlan(value), error => error.message === 'invalidResource');
    }
});

test('plan validation preserves existing duration and identity boundaries', () => {
    const valid = plan();
    valid.phases = Array.from({ length: 10 }, (_, index) => ({
        id: `phase-${index}`,
        title: 'Phase',
        durationSeconds: MAX_PHASE_SECONDS,
    }));
    assert.equal(valid.phases.reduce((sum, phase) => sum + phase.durationSeconds, 0), MAX_TOTAL_SECONDS);
    assert.equal(validateRundownPlan(valid).phases.length, 10);
    valid.phases.push({ id: 'too-much', title: 'Phase', durationSeconds: 60 });
    assert.throws(() => validateRundownPlan(valid), /totalLimit/);
    for (const durationSeconds of [0, 59, 61, MAX_PHASE_SECONDS + 60]) {
        const value = plan(); value.phases[0].durationSeconds = durationSeconds;
        assert.throws(() => validateRundownPlan(value), /duration/);
    }
    const missingId = plan(); missingId.phases[0].id = '   ';
    assert.throws(() => validateRundownPlan(missingId), /invalidData/);
});

test('template validation is strict, normalized and non-mutating', () => {
    const source = template();
    const before = structuredClone(source);
    const valid = validateTemplate(source);
    assert.equal(valid.plan.name, 'Workshop');
    assert.deepEqual(source, before);
    for (const change of [
        value => { value.schemaVersion = 1; },
        value => { value.kind = 'execution'; },
        value => { value.revision = 0; },
        value => { value.unknown = true; },
    ]) {
        const value = template(); change(value);
        assert.throws(() => validateTemplate(value));
    }
});

test('planned execution validation enforces lifecycle, revisions, absent attempt and note references', () => {
    const execution = createPlannedExecution(template(), 'execution-1');
    execution.workshopNotes = {
        rundown: 'General note',
        phases: [{ phaseId: 'phase-2', text: 'Discuss this later.' }],
    };
    execution.revision = 2;
    execution.runtimeRevision = 1;
    assert.deepEqual(validatePlannedExecution(execution).workshopNotes, execution.workshopNotes);

    for (const change of [
        value => { value.lifecycle = 'active'; },
        value => { value.attempt = {}; },
        value => { value.runtimeRevision = value.revision + 1; },
        value => { value.startSnapshot = value.currentPlan; },
        value => { value.workshopNotes.phases = [{ phaseId: 'missing', text: 'Note' }]; },
        value => { value.workshopNotes.phases = [
            { phaseId: 'phase-1', text: 'One' }, { phaseId: 'phase-1', text: 'Two' },
        ]; },
        value => { value.workshopNotes.phases = [{ phaseId: 'phase-1', text: '   ' }]; },
    ]) {
        const value = createPlannedExecution(template(), 'execution-invalid'); change(value);
        assert.throws(() => validatePlannedExecution(value));
    }
});

test('execution creation makes an independent planned copy and never mutates or aliases the template', () => {
    const source = template();
    const before = structuredClone(source);
    const execution = createPlannedExecution(source, 'execution-1');
    assert.equal(execution.id, 'execution-1');
    assert.equal(execution.lifecycle, 'planned');
    assert.equal(execution.revision, 1);
    assert.equal(execution.runtimeRevision, 0);
    assert.equal(execution.attempt, null);
    assert.equal(Object.hasOwn(execution, 'startSnapshot'), false);
    assert.equal(Object.hasOwn(execution, 'phaseResults'), false);
    assert.deepEqual(execution.currentPlan.phases.map(phase => phase.id), ['phase-1', 'phase-2']);

    execution.currentPlan.name = 'Execution only';
    execution.currentPlan.phases[0].notes = 'Changed only in execution';
    execution.currentPlan.phases[0].resources[0].label = 'Changed link';
    assert.deepEqual(source, before);
    assert.notEqual(execution.currentPlan, source.plan);
    assert.notEqual(execution.currentPlan.phases[0], source.plan.phases[0]);
    assert.notEqual(execution.currentPlan.phases[0].resources[0], source.plan.phases[0].resources[0]);
});

test('activation changes a planned execution to active READY without creating an attempt', () => {
    const planned = createPlannedExecution(template(), 'execution-1');
    const before = structuredClone(planned);
    const ready = activatePlannedExecution(planned);
    assert.equal(ready.lifecycle, 'active');
    assert.equal(ready.attempt, null);
    assert.equal(ready.revision, planned.revision + 1);
    assert.equal(ready.runtimeRevision, planned.runtimeRevision + 1);
    assert.deepEqual(planned, before);
    assert.deepEqual(validateReadyExecution(ready), ready);
    assert.throws(() => validateStartedExecution(ready), /invalidAttempt/);
});

test('the first actual start creates one deterministic attempt and an isolated planning baseline', () => {
    const sourceTemplate = template();
    const templateBefore = structuredClone(sourceTemplate);
    const ready = activatePlannedExecution(createPlannedExecution(sourceTemplate, 'execution-1'));
    const readyBefore = structuredClone(ready);
    const started = startActiveExecution(ready, 'attempt-1', 1_700_000_000_000);
    assert.equal(started.lifecycle, 'active');
    assert.equal(started.attempt.id, 'attempt-1');
    assert.equal(started.attempt.startedAt, 1_700_000_000_000);
    assert.deepEqual(started.attempt.startSnapshot, ready.currentPlan);
    assert.notEqual(started.attempt.startSnapshot, started.currentPlan);
    assert.notEqual(started.attempt.startSnapshot.phases[0], started.currentPlan.phases[0]);
    assert.equal(started.revision, ready.revision + 1);
    assert.equal(started.runtimeRevision, ready.runtimeRevision + 1);
    assert.deepEqual(ready, readyBefore);
    assert.deepEqual(sourceTemplate, templateBefore);
    assert.deepEqual(validateStartedExecution(started), started);

    started.currentPlan.name = 'Changed after start';
    started.currentPlan.phases[0].notes = 'Changed after start';
    started.currentPlan.phases[0].resources[0].label = 'Changed after start';
    assert.equal(started.attempt.startSnapshot.name, 'Workshop');
    assert.equal(started.attempt.startSnapshot.phases[0].notes, '*Welcome* everyone.');
    assert.equal(started.attempt.startSnapshot.phases[0].resources[0].label, 'Board');
});

test('later timer starts preserve the original attempt, baseline and revisions', () => {
    const first = startActiveExecution(
        activatePlannedExecution(createPlannedExecution(template(), 'execution-1')),
        'attempt-1',
        1_700_000_000_000,
    );
    const before = structuredClone(first);
    const second = startActiveExecution(first, 'attempt-2', 1_800_000_000_000);
    assert.deepEqual(second, before);
    assert.notEqual(second, first);
    assert.notEqual(second.attempt, first.attempt);
    assert.notEqual(second.attempt.startSnapshot, first.attempt.startSnapshot);
});

test('activation and first start reject invalid lifecycle transitions and attempt inputs', () => {
    const planned = createPlannedExecution(template(), 'execution-1');
    const ready = activatePlannedExecution(planned);
    assert.throws(() => activatePlannedExecution(ready), /invalidLifecycle/);
    assert.throws(() => startActiveExecution(planned, 'attempt-1', 1000), /invalidLifecycle/);
    assert.throws(() => startActiveExecution({ ...ready, lifecycle: 'suspended' }, 'attempt-1', 1000), /invalidLifecycle/);
    assert.throws(() => startActiveExecution(ready, '', 1000), /invalidData/);
    assert.throws(() => startActiveExecution(ready, 'attempt-1', -1), /invalidAttempt/);
});

test('retaining a READY execution keeps its current plan and identity while clearing workshop notes', () => {
    const sourceTemplate = template();
    const templateBefore = structuredClone(sourceTemplate);
    const ready = activatePlannedExecution(createPlannedExecution(sourceTemplate, 'execution-1'));
    ready.currentPlan.name = 'Latest workshop plan';
    ready.currentPlan.phases[0].notes = 'Latest prepared note';
    ready.workshopNotes = {
        rundown: 'Discard this run note',
        phases: [{ phaseId: 'phase-1', text: 'Discard this phase note' }],
    };
    const before = structuredClone(ready);
    const planned = retainCurrentPlan(ready);
    assert.equal(planned.lifecycle, 'planned');
    assert.equal(planned.attempt, null);
    assert.equal(planned.id, ready.id);
    assert.deepEqual(planned.source, ready.source);
    assert.equal(planned.currentPlan.name, 'Latest workshop plan');
    assert.equal(planned.currentPlan.phases[0].notes, 'Latest prepared note');
    assert.deepEqual(planned.workshopNotes, { rundown: '', phases: [] });
    assert.equal(planned.revision, ready.revision + 1);
    assert.equal(planned.runtimeRevision, ready.runtimeRevision + 1);
    assert.deepEqual(ready, before);
    assert.deepEqual(sourceTemplate, templateBefore);
    assert.notEqual(planned.source, ready.source);
    assert.notEqual(planned.currentPlan, ready.currentPlan);
    assert.notEqual(planned.currentPlan.phases[0], ready.currentPlan.phases[0]);
});

test('retaining a started execution discards its attempt but never restores its baseline or template plan', () => {
    const sourceTemplate = template();
    const started = startActiveExecution(
        activatePlannedExecution(createPlannedExecution(sourceTemplate, 'execution-1')),
        'attempt-1',
        1_700_000_000_000,
    );
    started.currentPlan.name = 'Adapted during workshop';
    started.currentPlan.phases[0].durationSeconds = 900;
    started.currentPlan.phases[0].resources.push({ label: 'New board', url: 'https://example.test/new' });
    started.workshopNotes = {
        rundown: 'Discarded observation',
        phases: [{ phaseId: 'phase-2', text: 'Discarded discussion note' }],
    };
    const before = structuredClone(started);
    const planned = retainCurrentPlan(started);
    assert.equal(planned.attempt, null);
    assert.equal(planned.currentPlan.name, 'Adapted during workshop');
    assert.equal(planned.currentPlan.phases[0].durationSeconds, 900);
    assert.equal(planned.currentPlan.phases[0].resources.at(-1).label, 'New board');
    assert.notEqual(planned.currentPlan.name, before.attempt.startSnapshot.name);
    assert.notEqual(planned.currentPlan.phases[0].durationSeconds, before.attempt.startSnapshot.phases[0].durationSeconds);
    assert.notEqual(planned.currentPlan.name, sourceTemplate.plan.name.trim());
    assert.deepEqual(planned.workshopNotes, { rundown: '', phases: [] });
    assert.deepEqual(started, before);
});

test('a retained plan can be activated and started later with a fresh attempt and baseline', () => {
    const first = startActiveExecution(
        activatePlannedExecution(createPlannedExecution(template(), 'execution-1')),
        'attempt-1',
        1000,
    );
    first.currentPlan.name = 'Plan for the next attempt';
    const retained = retainCurrentPlan(first);
    const second = startActiveExecution(activatePlannedExecution(retained), 'attempt-2', 2000);
    assert.equal(second.attempt.id, 'attempt-2');
    assert.equal(second.attempt.startedAt, 2000);
    assert.equal(second.attempt.startSnapshot.name, 'Plan for the next attempt');
    assert.notDeepEqual(second.attempt.startSnapshot, first.attempt.startSnapshot);
});

test('retaining the current plan rejects non-active lifecycle states', () => {
    const planned = createPlannedExecution(template(), 'execution-1');
    assert.throws(() => retainCurrentPlan(planned), /invalidLifecycle/);
    for (const lifecycle of ['suspended', 'completed']) {
        assert.throws(() => retainCurrentPlan({ ...planned, lifecycle }), /invalidLifecycle/);
    }
});

test('suspending READY preserves its plan, identity, source and all saved workshop notes', () => {
    const sourceTemplate = template();
    const templateBefore = structuredClone(sourceTemplate);
    const ready = activatePlannedExecution(createPlannedExecution(sourceTemplate, 'execution-1'));
    ready.currentPlan.name = 'Prepared individual execution';
    ready.currentPlan.phases[0].notes = 'Prepared execution-only information';
    ready.workshopNotes = {
        rundown: 'Saved rundown observation',
        phases: [
            { phaseId: 'phase-1', text: 'Saved opening observation' },
            { phaseId: 'phase-2', text: 'Saved discussion observation' },
        ],
    };
    const before = structuredClone(ready);
    const suspended = suspendReadyExecution(ready);
    assert.equal(suspended.lifecycle, 'suspended');
    assert.equal(suspended.attempt, null);
    assert.equal(suspended.id, ready.id);
    assert.deepEqual(suspended.source, ready.source);
    assert.deepEqual(suspended.currentPlan, ready.currentPlan);
    assert.deepEqual(suspended.workshopNotes, ready.workshopNotes);
    assert.equal(suspended.revision, ready.revision + 1);
    assert.equal(suspended.runtimeRevision, ready.runtimeRevision + 1);
    assert.deepEqual(validateSuspendedReadyExecution(suspended), suspended);
    assert.deepEqual(ready, before);
    assert.deepEqual(sourceTemplate, templateBefore);
    assert.notEqual(suspended.source, ready.source);
    assert.notEqual(suspended.currentPlan, ready.currentPlan);
    assert.notEqual(suspended.currentPlan.phases[0], ready.currentPlan.phases[0]);
    assert.notEqual(suspended.workshopNotes, ready.workshopNotes);
    assert.notEqual(suspended.workshopNotes.phases[0], ready.workshopNotes.phases[0]);
});

test('suspending READY rejects planned, completed and already-started executions', () => {
    const planned = createPlannedExecution(template(), 'execution-1');
    const ready = activatePlannedExecution(planned);
    const started = startActiveExecution(ready, 'attempt-1', 1000);
    assert.throws(() => suspendReadyExecution(planned), /invalidLifecycle/);
    assert.throws(() => suspendReadyExecution({ ...planned, lifecycle: 'completed' }), /invalidLifecycle/);
    assert.throws(() => suspendReadyExecution(started), /invalidAttempt/);
});

test('suspending READY validates workshop note references instead of retaining invalid data', () => {
    const ready = activatePlannedExecution(createPlannedExecution(template(), 'execution-1'));
    ready.workshopNotes = {
        rundown: 'Valid rundown note',
        phases: [{ phaseId: 'missing-phase', text: 'Invalid phase note' }],
    };
    assert.throws(() => suspendReadyExecution(ready), /invalidNotes/);
});

test('resuming suspended READY preserves its plan, identity, source and all saved workshop notes', () => {
    const sourceTemplate = template();
    const templateBefore = structuredClone(sourceTemplate);
    const ready = activatePlannedExecution(createPlannedExecution(sourceTemplate, 'execution-1'));
    ready.currentPlan.name = 'Prepared individual execution';
    ready.currentPlan.phases[0].notes = 'Prepared execution-only information';
    ready.workshopNotes = {
        rundown: 'Saved rundown observation',
        phases: [
            { phaseId: 'phase-1', text: 'Saved opening observation' },
            { phaseId: 'phase-2', text: 'Saved discussion observation' },
        ],
    };
    const suspended = suspendReadyExecution(ready);
    const before = structuredClone(suspended);
    const resumed = resumeReadyExecution(suspended);
    assert.equal(resumed.lifecycle, 'active');
    assert.equal(resumed.attempt, null);
    assert.equal(resumed.id, suspended.id);
    assert.deepEqual(resumed.source, suspended.source);
    assert.deepEqual(resumed.currentPlan, suspended.currentPlan);
    assert.deepEqual(resumed.workshopNotes, suspended.workshopNotes);
    assert.equal(resumed.revision, suspended.revision + 1);
    assert.equal(resumed.runtimeRevision, suspended.runtimeRevision + 1);
    assert.deepEqual(validateReadyExecution(resumed), resumed);
    assert.deepEqual(suspended, before);
    assert.deepEqual(sourceTemplate, templateBefore);
    assert.notEqual(resumed.source, suspended.source);
    assert.notEqual(resumed.currentPlan, suspended.currentPlan);
    assert.notEqual(resumed.currentPlan.phases[0], suspended.currentPlan.phases[0]);
    assert.notEqual(resumed.workshopNotes, suspended.workshopNotes);
    assert.notEqual(resumed.workshopNotes.phases[0], suspended.workshopNotes.phases[0]);
});

test('resuming READY rejects planned, active, started and contradictory suspended executions', () => {
    const planned = createPlannedExecution(template(), 'execution-1');
    const ready = activatePlannedExecution(planned);
    const started = startActiveExecution(ready, 'attempt-1', 1000);
    assert.throws(() => resumeReadyExecution(planned), /invalidLifecycle/);
    assert.throws(() => resumeReadyExecution(ready), /invalidLifecycle/);
    assert.throws(() => resumeReadyExecution(started), /invalidLifecycle/);
    assert.throws(() => resumeReadyExecution({ ...started, lifecycle: 'suspended' }), /invalidAttempt/);

    const suspended = suspendReadyExecution(ready);
    suspended.workshopNotes.phases = [{ phaseId: 'missing-phase', text: 'Invalid phase note' }];
    assert.throws(() => resumeReadyExecution(suspended), /invalidNotes/);
});

test('the first actual start after resuming READY creates one new isolated attempt baseline', () => {
    const ready = activatePlannedExecution(createPlannedExecution(template(), 'execution-1'));
    const suspended = suspendReadyExecution(ready);
    suspended.currentPlan.name = 'Plan resumed before first start';
    const resumed = resumeReadyExecution(suspended);
    const started = startActiveExecution(resumed, 'attempt-1', 2000);
    assert.equal(started.attempt.id, 'attempt-1');
    assert.equal(started.attempt.startedAt, 2000);
    assert.deepEqual(started.attempt.startSnapshot, resumed.currentPlan);
    assert.notEqual(started.attempt.startSnapshot, started.currentPlan);
    assert.notEqual(started.attempt.startSnapshot.phases[0], started.currentPlan.phases[0]);
    assert.deepEqual(startActiveExecution(started, 'attempt-2', 3000), started);
});

test('suspending STARTED preserves attempt, plan and notes while incrementing both revisions', () => {
    const sourceTemplate = template();
    const sourceBefore = structuredClone(sourceTemplate);
    const started = startActiveExecution(
        activatePlannedExecution(createPlannedExecution(sourceTemplate, 'execution-1')),
        'attempt-1',
        1000,
    );
    started.currentPlan.name = 'Current execution plan';
    started.workshopNotes = {
        rundown: 'Saved observation',
        phases: [{ phaseId: 'phase-1', text: 'Saved phase observation' }],
    };
    const before = structuredClone(started);
    const suspended = suspendStartedExecution(started);
    assert.equal(suspended.lifecycle, 'suspended');
    assert.equal(suspended.id, started.id);
    assert.deepEqual(suspended.source, started.source);
    assert.deepEqual(suspended.currentPlan, started.currentPlan);
    assert.deepEqual(suspended.workshopNotes, started.workshopNotes);
    assert.deepEqual(suspended.attempt, started.attempt);
    assert.equal(suspended.revision, started.revision + 1);
    assert.equal(suspended.runtimeRevision, started.runtimeRevision + 1);
    assert.deepEqual(validateSuspendedStartedExecution(suspended), suspended);
    assert.deepEqual(started, before);
    assert.deepEqual(sourceTemplate, sourceBefore);
    assert.notEqual(suspended.currentPlan, started.currentPlan);
    assert.notEqual(suspended.workshopNotes, started.workshopNotes);
    assert.notEqual(suspended.attempt, started.attempt);
    assert.notEqual(suspended.attempt.startSnapshot, started.attempt.startSnapshot);
});

test('suspending STARTED rejects READY, other lifecycles and revision overflow', () => {
    const planned = createPlannedExecution(template(), 'execution-1');
    const ready = activatePlannedExecution(planned);
    const started = startActiveExecution(ready, 'attempt-1', 1000);
    assert.throws(() => suspendStartedExecution(ready), /invalidAttempt/);
    assert.throws(() => suspendStartedExecution(planned), /invalidLifecycle/);
    assert.throws(() => suspendStartedExecution({ ...started, lifecycle: 'suspended' }), /invalidLifecycle/);
    assert.throws(() => suspendStartedExecution({
        ...started,
        revision: Number.MAX_SAFE_INTEGER,
    }), /invalidRevision/);
    assert.throws(() => suspendStartedExecution({
        ...started,
        revision: Number.MAX_SAFE_INTEGER,
        runtimeRevision: Number.MAX_SAFE_INTEGER,
    }), /invalidRevision/);
});
