import test from 'node:test';
import assert from 'node:assert/strict';
import {
    preparePlannerDraft, materializePlannerDraft, savePlannerDraft,
    deletePlannerTemplate, appendPlannerImports,
} from '../src/js/planner-v1.mjs';
import { createTemplateStore, STORAGE_KEY } from '../src/js/templates.mjs';

const template = (id = 'template-1') => ({
    id, name: 'Workshop', transitionMode: 'manual',
    phases: [{ id: 'phase-1', title: 'Opening', durationSeconds: 600 }],
});

test('V1 Planner drafts preserve IDs, default phase and isolation while materializing only persisted values', () => {
    const source = template();
    const draft = preparePlannerDraft(source);
    assert.equal(draft.phases[0].minutes, '10');
    assert.deepEqual(materializePlannerDraft(draft), source);
    draft.name = '  Edited  ';
    draft.phases[0].title = '  Discussion  ';
    draft.phases[0].minutes = '12';
    assert.deepEqual(materializePlannerDraft(draft), {
        ...source, name: 'Edited',
        phases: [{ id: 'phase-1', title: 'Discussion', durationSeconds: 720 }],
    });
    assert.deepEqual(source, template());
    assert.equal(draft.name, '  Edited  ');
    const first = preparePlannerDraft(), second = preparePlannerDraft();
    assert.notEqual(first.id, second.id);
    assert.notEqual(first.phases[0].id, second.phases[0].id);
    assert.equal(first.phases[0].minutes, '10');
    assert.equal(first.phases[0].title, '');
    assert.equal(first.transitionMode, 'manual');
});

test('invalid minute drafts retain their original input and phase-specific validation error', () => {
    const draft = preparePlannerDraft(template());
    draft.phases[0].minutes = '1.5';
    const before = structuredClone(draft);
    assert.throws(() => materializePlannerDraft(draft), error =>
        error.message === 'duration' && error.phaseId === 'phase-1');
    assert.throws(() => savePlannerDraft({ schemaVersion: 1, templates: [] }, draft), /duration/);
    assert.deepEqual(draft, before);
});

test('V1 save, delete and bulk import prepare complete aggregates without mutating caller state', () => {
    const library = { schemaVersion: 1, templates: [template(), template('unrelated')] };
    const before = structuredClone(library);
    const draft = preparePlannerDraft(library.templates[0]);
    draft.name = 'Changed';
    const updated = savePlannerDraft(library, draft);
    assert.deepEqual(updated.templates.map(item => item.id), ['template-1', 'unrelated']);
    assert.equal(updated.templates[0].name, 'Changed');
    assert.deepEqual(updated.templates[1], before.templates[1]);
    const created = savePlannerDraft(updated, preparePlannerDraft(template('new')));
    assert.deepEqual(created.templates.map(item => item.id), ['template-1', 'unrelated', 'new']);
    const deleted = deletePlannerTemplate(created, 'template-1');
    assert.deepEqual(deleted.templates.map(item => item.id), ['unrelated', 'new']);
    const copies = { schemaVersion: 1, templates: [template('imported')] };
    const appended = appendPlannerImports(deleted, copies);
    assert.deepEqual(appended.templates.map(item => item.id), ['unrelated', 'new', 'imported']);
    assert.deepEqual(library, before);
    assert.equal(draft.name, 'Changed');
    assert.equal(copies.templates.length, 1);
});

test('real V1 Store keeps optimistic conflicts and failed writes from changing drafts or saved data', () => {
    let raw = JSON.stringify({ schemaVersion: 1, templates: [template()] });
    let writes = 0;
    let failWrite = false;
    const storage = {
        getItem(key) { assert.equal(key, STORAGE_KEY); return raw; },
        setItem(key, value) {
            assert.equal(key, STORAGE_KEY);
            if (failWrite) throw new Error('synthetic write failure');
            writes += 1; raw = value;
        },
    };
    const store = createTemplateStore(() => storage);
    const library = store.load();
    const draft = preparePlannerDraft(library.templates[0]);
    draft.name = 'Unsaved work';
    const before = structuredClone(draft);
    const target = savePlannerDraft(library, draft);
    raw = JSON.stringify({ schemaVersion: 1, templates: [template('remote')] });
    const remote = raw;
    assert.throws(() => store.save(target), /conflict/);
    assert.equal(raw, remote);
    assert.equal(writes, 0);
    assert.deepEqual(draft, before);
    store.load(); failWrite = true;
    assert.throws(() => store.save(target), /storageWrite/);
    assert.deepEqual(draft, before);
    assert.equal(raw, remote);
    assert.equal(writes, 0);
});
