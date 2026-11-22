import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeTemplateDraftRecoveryService } from '../src/js/editor-template-draft-recovery-service.mjs';
import { createEditorDraftRecoveryStore, EDITOR_DRAFT_RECOVERY_PREFIX } from '../src/js/editor-draft-recovery.mjs';

function memory() {
    const values = new Map();
    const calls = [];
    return {
        values,
        calls,
        get length() { return values.size; },
        key(index) { return [...values.keys()][index] ?? null; },
        getItem(key) { calls.push(['get', key]); return values.get(key) ?? null; },
        setItem(key, value) { calls.push(['set', key]); values.set(key, value); },
        removeItem(key) { calls.push(['remove', key]); values.delete(key); },
    };
}

const phase = (changes = {}) => ({
    id: 'phase-1', title: 'Opening', durationSeconds: 600, category: 'presentation', notes: '', resources: [], ...changes,
});
const draft = (changes = {}) => ({
    mode: 'create',
    expectedAggregateRevision: 4,
    expectedTemplateRevision: null,
    template: {
        id: 'template-1', name: '', category: 'workshop', transitionMode: 'manual',
        preparedInformation: '', phases: [],
    },
    ...changes,
});

function fixture({ store: injectedStore, times = [100, 100, 100], ids = ['recovery-1', 'context-1'] } = {}) {
    const storage = memory();
    const store = injectedStore ?? createEditorDraftRecoveryStore(storage);
    const queue = [...times];
    const idQueue = [...ids];
    const service = createNativeTemplateDraftRecoveryService({
        store,
        createId: () => idQueue.shift(),
        now: () => queue.shift() ?? times.at(-1),
    });
    return { storage, store, service };
}

test('new Template drafts checkpoint immediately and retain the complete immutable baseline', () => {
    const { storage, service } = fixture();
    const initial = draft();
    const result = service.begin(initial);
    initial.template.name = 'Caller mutation';

    assert.equal(result.status, 'success');
    assert.equal(storage.values.size, 1);
    const stored = JSON.parse(storage.values.get(`${EDITOR_DRAFT_RECOVERY_PREFIX}recovery-1`));
    assert.equal(stored.savedAt, 100);
    assert.equal(stored.baseline.template.name, '');
    assert.equal(stored.draft.template.name, '');
    assert.equal(stored.entityId, 'template-1');
    assert.equal(stored.contextId, 'context-1');
});

test('existing Templates create no entry until the first mutation and then checkpoint every input synchronously', () => {
    const { storage, service } = fixture({ times: [200, 200, 200, 200] });
    const initial = draft({
        mode: 'update', expectedTemplateRevision: 3,
        template: { ...draft().template, name: 'Saved name', phases: [phase()] },
    });
    assert.equal(service.begin(initial).status, 'ready');
    assert.equal(storage.values.size, 0);

    const first = structuredClone(initial); first.template.name = 'A';
    const firstResult = service.checkpoint(first);
    assert.equal(firstResult.status, 'success');
    assert.equal(firstResult.record.savedAt, 200);
    const second = structuredClone(first); second.template.name = 'AB';
    const secondResult = service.checkpoint(second);
    assert.equal(secondResult.status, 'success');
    assert.equal(secondResult.record.savedAt, 201);
    assert.equal(JSON.parse([...storage.values.values()][0]).draft.template.name, 'AB');
    assert.equal(secondResult.record.baseline.template.name, 'Saved name');
});

test('checkpoint preserves recoverable intermediate text, notes, resources and structural mutations', () => {
    const { service } = fixture({ times: [300, 301] });
    service.begin(draft());
    const changed = draft({
        template: {
            ...draft().template,
            name: 'Unsaved workshop',
            category: 'training',
            transitionMode: 'automatic',
            preparedInformation: 'Bring **notes**',
            phases: [phase({
                title: '',
                durationSeconds: '1x',
                category: 'discussion',
                notes: 'Partial note',
                resources: [{ label: 'Slides', url: '' }, { label: '', url: 'https://example.test' }],
            })],
        },
    });
    const result = service.checkpoint(changed);

    assert.equal(result.status, 'success');
    assert.deepEqual(result.record.draft, changed);
    assert.deepEqual(result.record.baseline, draft());
});

test('confirmed Store versions are adopted and caller drafts remain copy-isolated', () => {
    const calls = [];
    const store = {
        create(record) { calls.push(['create', structuredClone(record)]); return { ...structuredClone(record), savedAt: 900 }; },
        update(record, expectedSavedAt) {
            calls.push(['update', structuredClone(record), expectedSavedAt]);
            return { ...structuredClone(record), savedAt: expectedSavedAt + 7 };
        },
    };
    const { service } = fixture({ store, times: [10, 11, 12] });
    const initial = draft();
    assert.equal(service.begin(initial).record.savedAt, 900);
    const changed = structuredClone(initial); changed.template.name = 'One';
    const checkpoint = service.checkpoint(changed);
    assert.equal(checkpoint.record.savedAt, 907);
    changed.template.name = 'Caller changed again';
    assert.equal(checkpoint.record.draft.template.name, 'One');
    assert.deepEqual(calls.map(call => call[0]), ['create', 'update']);
    assert.equal(calls[1][2], 900);
});

test('checkpoint failures stay visible to the caller and never retry an unconfirmed mutation', () => {
    let creates = 0; let updates = 0;
    const store = {
        create(record) { creates += 1; return structuredClone(record); },
        update() { updates += 1; throw new Error('recoveryStorageWriteUnconfirmed'); },
    };
    const { service } = fixture({ store, times: [100, 101, 102] });
    service.begin(draft());
    const changed = draft({ template: { ...draft().template, name: 'At risk' } });
    const failed = service.checkpoint(changed);
    assert.equal(failed.status, 'error');
    assert.equal(failed.error, 'recoveryStorageWriteUnconfirmed');
    assert.equal(failed.record.draft.template.name, '');
    assert.equal(service.checkpoint(changed).status, 'blocked');
    assert.deepEqual({ creates, updates }, { creates: 1, updates: 1 });
});

test('deactivation and a fresh existing edit never remove recovery records', () => {
    const { storage, service } = fixture({
        times: [100, 101, 200],
        ids: ['recovery-1', 'context-1', 'recovery-2', 'context-2'],
    });
    service.begin(draft());
    service.deactivate();
    const existing = draft({ mode: 'update', expectedTemplateRevision: 1 });
    assert.equal(service.begin(existing).status, 'ready');
    assert.equal(storage.values.size, 1);
    assert.equal(storage.calls.some(([operation]) => operation === 'remove'), false);
});
