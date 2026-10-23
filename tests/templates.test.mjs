import test from 'node:test';
import assert from 'node:assert/strict';
import { createDraft, createTemplateStore, MAX_PHASE_SECONDS, MAX_TOTAL_SECONDS, movePhase, phaseDuration, STORAGE_KEY, totalDuration, validateLibrary, validateTemplate } from '../src/js/templates.mjs';
import { createTimer } from '../src/js/timer.mjs';

const template = () => ({ id: 'workshop-1', name: ' Workshop ', transitionMode: 'manual', phases: [
    { id: 'phase-1', title: ' Introduction ', durationSeconds: 600 },
    { id: 'phase-2', title: 'Discussion', durationSeconds: 3600 },
] });
function memory(raw = null) {
    const values = new Map(raw === null ? [] : [[STORAGE_KEY, raw]]);
    return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}
test('valid templates normalize text, retain IDs, and contain only planning data', () => {
    const value = validateTemplate({ ...template(), runtime: { status: 'RUNNING' } });
    assert.equal(value.name, 'Workshop');
    assert.equal(value.phases[0].title, 'Introduction');
    assert.equal(value.id, 'workshop-1');
    assert.equal(value.phases[0].id, 'phase-1');
    assert.equal('runtime' in value, false);
    assert.equal(totalDuration(value.phases), 4200);
    assert.equal(validateTemplate({ ...value, transitionMode: 'automatic' }).transitionMode, 'automatic');
});
test('names, phase titles, phases, IDs and transition modes are validated', () => {
    for (const name of ['', '   ', 'a'.repeat(121), null]) assert.throws(() => validateTemplate({ ...template(), name }), /name/);
    for (const title of ['', ' ', 'a'.repeat(121), null]) {
        const value = template(); value.phases[0].title = title;
        assert.throws(() => validateTemplate(value), /phaseTitle/);
    }
    assert.throws(() => validateTemplate({ ...template(), phases: [] }), /phasesRequired/);
    assert.throws(() => validateTemplate({ ...template(), transitionMode: 'unknown' }), /invalidData/);
    assert.throws(() => validateTemplate({ ...template(), id: '' }), /invalidData/);
    const duplicate = template(); duplicate.phases[1].id = duplicate.phases[0].id;
    assert.throws(() => validateTemplate(duplicate), /invalidData/);
    assert.throws(() => validateLibrary({ schemaVersion: 1, templates: [template(), template()] }), /invalidData/);
});
test('minute input accepts only positive integers up to 6000 without rounding', () => {
    for (const minutes of [1, 5, 15, 45, 90, 180, 6000]) assert.equal(phaseDuration(String(minutes)), minutes * 60);
    assert.equal(phaseDuration('0015'), 900);
    assert.equal(phaseDuration('6000'), MAX_PHASE_SECONDS);
    for (const minutes of ['', 0, -1, 6001, '1.5', '1e2', 'NaN', 'Infinity', '+5', ' 5', null, Number.MAX_SAFE_INTEGER]) {
        assert.throws(() => phaseDuration(minutes), /duration/);
    }
    for (const durationSeconds of [0, -1, 0.5, 1, 59, 61, NaN, Infinity, '60', MAX_PHASE_SECONDS + 60]) {
        assert.throws(() => totalDuration([{ durationSeconds }]), /duration/);
    }
});
test('safe workshop totals allow 1000 hours and reject another minute', () => {
    const phases = Array.from({ length: 10 }, (_, id) => ({ id: String(id), title: 'Phase', durationSeconds: MAX_PHASE_SECONDS }));
    assert.equal(totalDuration(phases), MAX_TOTAL_SECONDS);
    assert.equal(MAX_TOTAL_SECONDS, 1000 * 3600);
    phases.push({ id: 'last', title: 'Last', durationSeconds: 60 });
    assert.throws(() => totalDuration(phases), /totalLimit/);
});
test('workshop limits are independent of the existing Quick Timer limit', () => {
    assert.equal(phaseDuration('6000'), 100 * 3600);
    assert.equal(createTimer(359999000).durationMs, 359999000);
    assert.throws(() => createTimer(360000000), /Invalid duration/);
});
test('draft editing, removal and cancellation never mutate saved templates', () => {
    const saved = template(); const before = structuredClone(saved);
    const draft = createDraft(saved);
    draft.name = 'Changed'; draft.phases[0].title = 'Changed'; draft.phases.pop();
    assert.deepEqual(saved, before);
    assert.deepEqual(createDraft(saved), before);
    const first = createDraft(); const second = createDraft();
    assert.notEqual(first.id, second.id);
});
test('reordering uses stable phase identity and leaves invalid moves unchanged', () => {
    const draft = createDraft(template());
    movePhase(draft, 'phase-2', -1);
    assert.deepEqual(draft.phases.map(p => p.id), ['phase-2', 'phase-1']);
    movePhase(draft, 'phase-2', 1);
    assert.deepEqual(draft.phases.map(p => p.id), ['phase-1', 'phase-2']);
    const before = structuredClone(draft);
    movePhase(draft, 'phase-1', -1); movePhase(draft, 'missing', 1); movePhase(draft, 'phase-1', 9);
    assert.deepEqual(draft, before);
});
test('multiple templates persist; failed validation and cancelled drafts preserve storage', () => {
    const storage = memory(); const store = createTemplateStore(() => storage);
    const data = store.load(); data.templates.push(template(), { ...template(), id: 'workshop-2', name: 'Other' });
    store.save(data);
    const savedRaw = storage.getItem(STORAGE_KEY);
    const draft = createDraft(data.templates[0]); draft.name = '';
    assert.throws(() => store.save({ ...data, templates: [draft] }), /name/);
    assert.equal(storage.getItem(STORAGE_KEY), savedRaw);
    assert.equal(createTemplateStore(() => storage).load().templates.length, 2);
    const edited = createDraft(data.templates[0]); edited.name = 'Renamed';
    const saved = store.save({ ...data, templates: [edited, data.templates[1]] });
    edited.name = 'Unsaved';
    assert.equal(saved.templates[0].name, 'Renamed');
});
test('corrupt, unsupported and partially invalid libraries block all writes without deleting data', () => {
    for (const raw of ['{broken', 'null', '{"schemaVersion":2,"templates":[]}', JSON.stringify({ schemaVersion: 1, templates: [template(), {}] })]) {
        const storage = memory(raw); const store = createTemplateStore(() => storage);
        assert.throws(() => store.load(), /invalidData/);
        assert.throws(() => store.save({ schemaVersion: 1, templates: [] }), /storageBlocked/);
        assert.equal(storage.getItem(STORAGE_KEY), raw);
    }
});
test('storage access and quota failures retain existing data and allow retry', () => {
    const broken = createTemplateStore(() => { throw new Error('Denied'); });
    assert.throws(() => broken.load(), /storageRead/);
    const storage = memory(JSON.stringify({ schemaVersion: 1, templates: [template()] }));
    const store = createTemplateStore(() => storage); const data = store.load();
    const before = storage.getItem(STORAGE_KEY); const write = storage.setItem;
    storage.setItem = () => { throw new Error('Quota'); };
    data.templates[0].name = 'New';
    assert.throws(() => store.save(data), /storageWrite/);
    assert.equal(storage.getItem(STORAGE_KEY), before);
    storage.setItem = write;
    assert.equal(store.save(data).templates[0].name, 'New');
});
test('optimistic conflicts protect another tab including deletion and corrupt external writes', () => {
    const storage = memory(); const first = createTemplateStore(() => storage); const second = createTemplateStore(() => storage);
    const a = first.load(); const b = second.load();
    a.templates.push(template()); first.save(a);
    const raw = storage.getItem(STORAGE_KEY);
    b.templates.push({ ...template(), id: 'other' });
    assert.throws(() => second.save(b), /conflict/);
    assert.equal(storage.getItem(STORAGE_KEY), raw);
    second.load(); storage.setItem(STORAGE_KEY, '{broken');
    assert.throws(() => second.save(b), /conflict/);
    assert.equal(storage.getItem(STORAGE_KEY), '{broken');
});

test('failed reload revokes write access and read errors during save cannot replace stored data', () => {
    const storage = memory(JSON.stringify({ schemaVersion: 1, templates: [template()] }));
    const store = createTemplateStore(() => storage); const data = store.load();
    const before = storage.getItem(STORAGE_KEY); const read = storage.getItem;
    storage.getItem = () => { throw new Error('Denied'); };
    assert.throws(() => store.save(data), /storageRead/);
    assert.equal(read(STORAGE_KEY), before);
    assert.throws(() => store.load(), /storageRead/);
    storage.getItem = read;
    assert.throws(() => store.save(data), /storageBlocked/);
    assert.equal(store.load().templates.length, 1);
});
