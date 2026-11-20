import test from 'node:test';
import assert from 'node:assert/strict';
import {
    editNativeTemplateDraft, editNativePhaseDraft, insertNativeDraftPhase,
    removeNativeDraftPhase, repositionNativeDraftPhase,
} from '../src/js/editor-template-draft.mjs';
import { createNativePlannerService } from '../src/js/editor-planner-service.mjs';
import { createNativeEditorTemplateIntegration } from '../src/js/editor-template-integration.mjs';
import { createEditorStoreWriter } from '../src/js/editor-storage-lock.mjs';
import { EDITOR_STORAGE_KEY } from '../src/js/editor-storage.mjs';

const planning = () => ({
    name: 'Workshop',
    transitionMode: 'automatic',
    category: 'training',
    preparedInformation: '**Prepared**\n- Bring materials',
    phases: ['opening', 'discussion', 'closing'].map((id, index) => ({
        id, title: id, durationSeconds: (index + 1) * 600,
        category: index === 1 ? 'discussion' : 'presentation',
        notes: `*Notes* for ${id}`,
        resources: [{ label: `${id} board`, url: `https://example.com/${id}` }],
    })),
});

function setup() {
    let raw = null;
    let writes = 0;
    const storage = {
        getItem(key) { assert.equal(key, EDITOR_STORAGE_KEY, 'only native storage is accessed'); return raw; },
        setItem(key, value) { assert.equal(key, EDITOR_STORAGE_KEY); writes += 1; raw = value; },
    };
    const writer = createEditorStoreWriter({
        getStorage: () => storage,
        locks: { async request(name, options, callback) {
            assert.equal(name, 'easyTimerEditor.v1.write');
            return callback({ name, mode: options.mode });
        } },
    });
    const service = createNativePlannerService({
        integration: createNativeEditorTemplateIntegration({ writer }),
        createId: () => 'template-1',
    });
    return { service, writer, get raw() { return raw; }, get writes() { return writes; } };
}

async function savedDraft() {
    const context = setup();
    const initial = await context.service.loadLibrary();
    let draft = context.service.prepareNewDraft(initial.library).draft;
    draft = editNativeTemplateDraft(draft, {
        name: planning().name, transitionMode: planning().transitionMode,
        category: planning().category, preparedInformation: planning().preparedInformation,
    });
    for (const phase of planning().phases) {
        draft = insertNativeDraftPhase(draft, { phaseId: phase.id });
        const { id, ...changes } = phase;
        draft = editNativePhaseDraft(draft, id, changes);
    }
    assert.equal(context.writes, 0);
    const saved = await context.service.saveDraft(draft);
    assert.equal(saved.status, 'success');
    return { context, saved, draft: context.service.prepareEditDraft(saved.library, 'template-1').draft };
}

test('native creation and repeated no-op edits round-trip every planning field through the real Planner Service', async () => {
    const { context, saved, draft } = await savedDraft();
    assert.deepEqual(saved.library.templates[0].plan, planning());
    let edited = editNativeTemplateDraft(draft, {});
    for (const phase of planning().phases) edited = editNativePhaseDraft(edited, phase.id, {});
    edited = repositionNativeDraftPhase(edited, 'discussion', 2);
    assert.deepEqual(edited, draft);
    assert.notEqual(edited, draft);
    assert.notEqual(edited.template.phases[0].resources[0], draft.template.phases[0].resources[0]);
    const result = await context.service.saveDraft(edited);
    assert.equal(result.status, 'success');
    assert.deepEqual(result.library.templates[0].plan, planning());
    assert.equal(result.library.templates[0].id, 'template-1');
    assert.equal(result.library.templates[0].revision, 2, 'existing explicit Save revision rules apply');
    assert.equal(edited.expectedAggregateRevision, draft.expectedAggregateRevision);
    assert.equal(edited.expectedTemplateRevision, draft.expectedTemplateRevision);
});

test('template and phase field edits preserve unrelated fields, revisions and independent nested resources', async () => {
    const { context, draft } = await savedDraft();
    const before = structuredClone(draft);
    const raw = context.raw;
    const changes = {
        category: 'breakout', notes: '**New** notes\n- Item',
        resources: [{ label: 'New board', url: 'https://example.com/new' }],
    };
    let edited = editNativeTemplateDraft(draft, {
        name: 'Edited name', transitionMode: 'manual', category: 'workshop',
        preparedInformation: '*New* preparation',
    });
    edited = editNativePhaseDraft(edited, 'discussion', changes);
    edited = editNativePhaseDraft(edited, 'opening', { title: 'New opening', durationSeconds: 120 });
    changes.resources[0].label = 'Caller mutation';
    assert.equal(edited.template.phases[1].resources[0].label, 'New board');
    assert.equal(edited.template.phases[1].title, before.template.phases[1].title);
    assert.equal(edited.template.phases[1].durationSeconds, before.template.phases[1].durationSeconds);
    assert.deepEqual(edited.template.phases[2], before.template.phases[2]);
    assert.equal(edited.mode, before.mode);
    assert.equal(edited.template.id, before.template.id);
    assert.equal(edited.expectedAggregateRevision, before.expectedAggregateRevision);
    assert.equal(edited.expectedTemplateRevision, before.expectedTemplateRevision);
    assert.deepEqual(draft, before);
    assert.equal(context.raw, raw, 'editing or abandoning a draft never saves it');
    assert.equal(context.writes, 1);
    const saved = await context.service.saveDraft(edited);
    assert.equal(saved.status, 'success');
    assert.equal(saved.library.templates[0].plan.phases[1].category, 'breakout');
    assert.equal(saved.library.templates[0].plan.phases[1].notes, changes.notes);
});

test('insertion, removal and final-position reordering retain stable phase IDs and their notes and links', async () => {
    const { context, draft } = await savedDraft();
    let edited = insertNativeDraftPhase(draft, { phaseId: 'inserted', beforePhaseId: 'discussion' });
    assert.deepEqual(edited.template.phases.map(phase => phase.id), ['opening', 'inserted', 'discussion', 'closing']);
    assert.deepEqual(edited.template.phases[1], {
        id: 'inserted', title: '', durationSeconds: 600, category: 'uncategorized', notes: '', resources: [],
    });
    edited = editNativePhaseDraft(edited, 'inserted', { title: 'New phase' });
    edited = repositionNativeDraftPhase(edited, 'discussion', 1);
    edited = repositionNativeDraftPhase(edited, 'opening', 4);
    edited = removeNativeDraftPhase(edited, 'inserted');
    assert.deepEqual(edited.template.phases.map(phase => phase.id), ['discussion', 'closing', 'opening']);
    for (const phase of edited.template.phases) {
        assert.deepEqual(phase, draft.template.phases.find(original => original.id === phase.id));
    }
    assert.equal(context.writes, 1);
    const saved = await context.service.saveDraft(edited);
    assert.equal(saved.status, 'success');
    assert.deepEqual(saved.library.templates[0].plan.phases, edited.template.phases);
});

test('invalid field contents remain editable and rejected native Saves retain the entire unsaved draft', async () => {
    const { context, draft } = await savedDraft();
    const raw = context.raw;
    for (const [edit, code] of [
        [value => editNativePhaseDraft(value, 'opening', { durationSeconds: 'unfinished' }), 'duration'],
        [value => editNativePhaseDraft(value, 'opening', { resources: [{ label: '', url: 'unsafe' }] }), 'invalidResource'],
        [value => editNativeTemplateDraft(value, { category: 'unknown' }), 'invalidCategory'],
        [value => editNativePhaseDraft(value, 'opening', { notes: null }), 'invalidNotes'],
    ]) {
        const edited = edit(editNativeTemplateDraft(draft, { preparedInformation: 'Unsaved information' }));
        const before = structuredClone(edited);
        const result = await context.service.saveDraft(edited);
        assert.deepEqual(result.error, { type: 'validation', code });
        assert.deepEqual(result.draft, before);
        assert.deepEqual(edited, before);
        assert.equal(context.raw, raw);
    }
    let empty = draft;
    for (const phase of draft.template.phases) empty = removeNativeDraftPhase(empty, phase.id);
    assert.deepEqual((await context.service.saveDraft(empty)).error, {
        type: 'validation', code: 'phasesRequired',
    });
    assert.equal(context.writes, 1);
});

test('editing rejects identity or structural changes without mutating the original draft', async () => {
    const { context, draft } = await savedDraft();
    const before = structuredClone(draft);
    assert.throws(() => editNativeTemplateDraft(draft, { id: 'other' }), /invalidDraftEdit/);
    assert.throws(() => editNativeTemplateDraft(draft, { phases: [] }), /invalidDraftEdit/);
    assert.throws(() => editNativePhaseDraft(draft, 'opening', { id: 'other' }), /invalidDraftEdit/);
    assert.throws(() => editNativePhaseDraft(draft, 'missing', { title: 'Other' }), /phaseNotFound/);
    assert.throws(() => insertNativeDraftPhase(draft, { phaseId: 'opening' }), /duplicatePhaseId/);
    assert.throws(() => insertNativeDraftPhase(draft, null), /invalidDraftEdit/);
    assert.throws(() => insertNativeDraftPhase(draft, { phaseId: '' }), /invalidDraftEdit/);
    assert.throws(() => insertNativeDraftPhase(draft, { phaseId: 'new', beforePhaseId: 'missing' }), /phaseNotFound/);
    assert.throws(() => removeNativeDraftPhase(draft, 'missing'), /phaseNotFound/);
    assert.throws(() => repositionNativeDraftPhase(draft, 'opening', 0), /invalidPhasePosition/);
    assert.throws(() => repositionNativeDraftPhase(draft, 'opening', 4), /invalidPhasePosition/);
    assert.deepEqual(draft, before);
    assert.equal(context.writes, 1);
});
