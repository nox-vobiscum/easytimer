import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativePlannerService } from '../src/js/editor-planner-service.mjs';
import { createNativeEditorTemplateIntegration } from '../src/js/editor-template-integration.mjs';
import {
    EDITOR_STORAGE_KEY,
    activatePlannedExecutionInRecord,
    planExecutionFromTemplateInRecord,
} from '../src/js/editor-storage.mjs';
import { createEditorStoreWriter } from '../src/js/editor-storage-lock.mjs';

const prepared = (changes = {}) => ({
    id: 'template-1',
    name: 'Workshop',
    category: 'workshop',
    transitionMode: 'manual',
    preparedInformation: '**Prepared** information',
    phases: [
        {
            id: 'phase-1',
            title: 'Opening',
            durationSeconds: 600,
            category: 'presentation',
            notes: '*Welcome*',
            resources: [{ label: 'Board', url: 'https://example.com/board' }],
        },
    ],
    ...changes,
});

function memory(raw = null) {
    const values = new Map(raw === null ? [] : [[EDITOR_STORAGE_KEY, raw]]);
    const state = { writes: 0, failRead: false, failWrite: null };
    return {
        values,
        state,
        getItem(key) {
            if (state.failRead) throw new Error('synthetic read failure');
            return values.get(key) ?? null;
        },
        setItem(key, value) {
            if (state.failWrite) {
                const error = new Error('synthetic write failure');
                error.name = state.failWrite;
                throw error;
            }
            state.writes += 1;
            values.set(key, value);
        },
    };
}

function locks(available = true) {
    return {
        request(name, options, callback) {
            assert.equal(name, 'easyTimerEditor.v1.write');
            assert.deepEqual(options, { mode: 'exclusive', ifAvailable: true });
            return Promise.resolve(callback(available ? { name, mode: 'exclusive' } : null));
        },
    };
}

function setup(raw = null, available = true) {
    const storage = memory(raw);
    const writer = createEditorStoreWriter({ getStorage: () => storage, locks: locks(available) });
    const integration = createNativeEditorTemplateIntegration({ writer });
    const service = createNativePlannerService({ integration, createId: () => 'generated-template' });
    return { storage, writer, service };
}

test('loads a copy-isolated native library without writes or V1 access', async () => {
    const { storage, service } = setup();
    const empty = await service.loadLibrary();
    assert.deepEqual(empty, { status: 'success', library: { revision: 0, templates: [] } });
    assert.equal(storage.state.writes, 0);
    assert.equal(storage.values.has('easyTimerTemplates'), false);

    const draft = service.prepareNewDraft(empty.library);
    draft.draft.template.name = 'Workshop';
    draft.draft.template.phases.push({ id: 'phase-new', title: 'Opening', durationSeconds: 600 });
    const saved = await service.saveDraft(draft.draft);
    const first = await service.loadLibrary();
    const second = await service.loadLibrary();
    assert.equal(saved.status, 'success');
    assert.deepEqual(first, second);
    assert.notEqual(first.library, second.library);
    assert.notEqual(first.library.templates[0], second.library.templates[0]);
    first.library.templates[0].plan.name = 'Changed copy';
    assert.equal(second.library.templates[0].plan.name, 'Workshop');
});

test('prepares isolated create and edit drafts with stable identities and every native planning field', async () => {
    const { storage, service } = setup();
    const initial = await service.loadLibrary();
    const createdDraft = service.prepareNewDraft(initial.library);
    assert.deepEqual(createdDraft, {
        status: 'success',
        draft: {
            mode: 'create',
            expectedAggregateRevision: 0,
            expectedTemplateRevision: null,
            template: {
                id: 'generated-template',
                name: '',
                category: 'uncategorized',
                transitionMode: 'manual',
                preparedInformation: '',
                phases: [],
            },
        },
    });
    assert.equal(storage.state.writes, 0, 'preparing and cancelling a draft never writes');

    createdDraft.draft.template = prepared({ id: createdDraft.draft.template.id });
    const created = await service.saveDraft(createdDraft.draft);
    const edit = service.prepareEditDraft(created.library, 'generated-template');
    assert.equal(edit.status, 'success');
    assert.equal(edit.draft.expectedAggregateRevision, 1);
    assert.equal(edit.draft.expectedTemplateRevision, 1);
    assert.deepEqual(edit.draft.template, prepared({ id: 'generated-template' }));
    assert.notEqual(edit.draft.template, created.library.templates[0].plan);
    assert.notEqual(edit.draft.template.phases[0], created.library.templates[0].plan.phases[0]);
});

test('creates, updates and deletes through native operations while refreshing the confirmed library', async () => {
    const { storage, service } = setup();
    const initial = await service.loadLibrary();
    const create = service.prepareNewDraft(initial.library, 'template-1');
    create.draft.template = prepared();
    const created = await service.saveDraft(create.draft);
    assert.equal(created.status, 'success');
    assert.equal(created.library.revision, 1);
    assert.equal(created.library.templates[0].revision, 1);

    const update = service.prepareEditDraft(created.library, 'template-1');
    update.draft.template.name = 'Updated workshop';
    update.draft.template.phases[0].notes = '**Updated note**';
    const updated = await service.saveDraft(update.draft);
    assert.equal(updated.status, 'success');
    assert.equal(updated.library.revision, 2);
    assert.equal(updated.library.templates[0].revision, 2);
    assert.equal(updated.library.templates[0].plan.name, 'Updated workshop');
    assert.equal(updated.library.templates[0].plan.phases[0].notes, '**Updated note**');

    const deleted = await service.deleteTemplate({
        templateId: 'template-1',
        expectedAggregateRevision: updated.library.revision,
        expectedTemplateRevision: updated.library.templates[0].revision,
    });
    assert.deepEqual(deleted, { status: 'success', library: { revision: 3, templates: [] } });
    assert.equal(storage.state.writes, 3);
});

test('rejected validation and revision conflicts retain complete unsaved drafts without writes or retry', async () => {
    const { storage, service } = setup();
    const initial = await service.loadLibrary();
    const create = service.prepareNewDraft(initial.library, 'template-1');
    create.draft.template = prepared();
    const created = await service.saveDraft(create.draft);
    const edit = service.prepareEditDraft(created.library, 'template-1');
    edit.draft.template.name = '';
    const invalidBefore = structuredClone(edit.draft);
    const invalid = await service.saveDraft(edit.draft);
    assert.equal(invalid.status, 'error');
    assert.deepEqual(invalid.error, { type: 'validation', code: 'name' });
    assert.deepEqual(invalid.draft, invalidBefore);
    assert.notEqual(invalid.draft, edit.draft);
    assert.equal(storage.state.writes, 1);

    edit.draft.template.name = 'Unsaved local change';
    edit.draft.expectedAggregateRevision = 0;
    const conflictBefore = structuredClone(edit.draft);
    const conflict = await service.saveDraft(edit.draft);
    assert.deepEqual(conflict.error, { type: 'conflict', code: 'conflict' });
    assert.deepEqual(conflict.draft, conflictBefore);
    assert.equal(storage.state.writes, 1);
});

test('missing, corrupt, storage and lock failures return structured outcomes without hidden writes', async () => {
    const { storage, service } = setup();
    const missing = service.prepareEditDraft({ revision: 0, templates: [] }, 'missing');
    assert.deepEqual(missing.error, { type: 'missing', code: 'templateNotFound' });

    const corrupt = setup('{broken');
    assert.deepEqual((await corrupt.service.loadLibrary()).error, {
        type: 'storage', code: 'storageValidation',
    });
    assert.equal(corrupt.storage.state.writes, 0);

    storage.state.failRead = true;
    assert.deepEqual((await service.loadLibrary()).error, { type: 'storage', code: 'storageRead' });
    assert.equal(storage.state.writes, 0);

    const busy = setup(null, false);
    assert.deepEqual((await busy.service.loadLibrary()).error, { type: 'lock', code: 'lockBusy' });
    assert.equal(busy.storage.state.writes, 0);

    const unavailableStorage = memory();
    const unavailableIntegration = createNativeEditorTemplateIntegration({
        writer: createEditorStoreWriter({ getStorage: () => unavailableStorage, locks: null }),
    });
    const unavailable = createNativePlannerService({ integration: unavailableIntegration });
    assert.deepEqual((await unavailable.loadLibrary()).error, {
        type: 'lock', code: 'lockUnavailable',
    });

    const writeFailure = setup();
    const library = await writeFailure.service.loadLibrary();
    const draft = writeFailure.service.prepareNewDraft(library.library, 'template-1').draft;
    draft.template = prepared();
    writeFailure.storage.state.failWrite = 'QuotaExceededError';
    const failedWrite = await writeFailure.service.saveDraft(draft);
    assert.deepEqual(failedWrite.error, { type: 'storage', code: 'storageQuota' });
    assert.deepEqual(failedWrite.draft, draft);
    assert.notEqual(failedWrite.draft, draft);
    assert.equal(writeFailure.storage.state.writes, 0);
});

test('template writes preserve independent executions and ACTIVE runtime outside the Planner library view', async () => {
    const { storage, writer, service } = setup();
    let initial = await service.loadLibrary();
    let draft = service.prepareNewDraft(initial.library, 'template-1').draft;
    draft.template = prepared();
    const created = await service.saveDraft(draft);
    const planned = await writer.write(record => planExecutionFromTemplateInRecord(record, {
        templateId: 'template-1', executionId: 'execution-1', expectedAggregateRevision: record.revision,
    }));
    const active = await writer.write(record => activatePlannedExecutionInRecord(record, {
        executionId: 'execution-1',
        expectedAggregateRevision: record.revision,
        expectedExecutionRevision: planned.executions[0].execution.revision,
        expectedRuntimeRevision: planned.executions[0].execution.runtimeRevision,
        runtimeRunId: 'runtime-1',
        savedAt: 1000,
    }));
    const executionsBefore = structuredClone(active.executions);
    const runtimeBefore = structuredClone(active.activeRuntime);

    initial = await service.loadLibrary();
    draft = service.prepareEditDraft(initial.library, 'template-1').draft;
    draft.template.preparedInformation = 'Changed only on Template';
    const updated = await service.saveDraft(draft);
    const deleted = await service.deleteTemplate({
        templateId: 'template-1',
        expectedAggregateRevision: updated.library.revision,
        expectedTemplateRevision: updated.library.templates[0].revision,
    });
    const persisted = JSON.parse(storage.values.get(EDITOR_STORAGE_KEY));

    assert.equal(deleted.status, 'success');
    assert.deepEqual(persisted.executions, executionsBefore);
    assert.deepEqual(persisted.activeRuntime, runtimeBefore);
    assert.equal(persisted.executions[0].execution.source.id, 'template-1');
    assert.equal(persisted.executions[0].execution.currentPlan.preparedInformation, '**Prepared** information');
    assert.equal(created.library.templates[0].plan.preparedInformation, '**Prepared** information');
});

test('rejects invalid service and draft shapes with structured validation outcomes', async () => {
    assert.throws(() => createNativePlannerService(), /invalidPlannerService/);
    const { storage, service } = setup();
    const invalid = { mode: 'create', expectedAggregateRevision: 0, template: prepared() };
    const outcome = await service.saveDraft(invalid);
    assert.deepEqual(outcome.error, { type: 'validation', code: 'invalidData' });
    assert.deepEqual(outcome.draft, invalid);
    assert.notEqual(outcome.draft, invalid);
    assert.equal(storage.state.writes, 0);
    assert.deepEqual((await service.deleteTemplate(null)).error, {
        type: 'validation', code: 'invalidData',
    });

    const failingId = createNativePlannerService({
        integration: createNativeEditorTemplateIntegration({
            writer: createEditorStoreWriter({ getStorage: () => storage, locks: locks() }),
        }),
        createId() { throw new Error('idUnavailable'); },
    });
    assert.deepEqual(failingId.prepareNewDraft({ revision: 0, templates: [] }).error, {
        type: 'unexpected', code: 'idUnavailable',
    });
});
