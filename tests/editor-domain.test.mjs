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
    createPlannedExecution,
    validatePlannedExecution,
    validateRundownPlan,
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
