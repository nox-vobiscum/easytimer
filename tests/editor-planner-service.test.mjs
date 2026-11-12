import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativePlannerService, createNativePlannedExecutionService } from '../src/js/editor-planner-service.mjs';
import { editNativeTemplateDraft, editNativePhaseDraft, insertNativeDraftPhase,
    removeNativeDraftPhase, repositionNativeDraftPhase } from '../src/js/editor-template-draft.mjs';
import { createNativeEditorTemplateIntegration } from '../src/js/editor-template-integration.mjs';
import {
    EDITOR_STORAGE_KEY,
    activatePlannedExecutionInRecord,
    planExecutionFromTemplateInRecord,
    updatePlannedExecutionPlanInRecord,
    startReadyExecutionInRecord,
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
            assert.equal(key, EDITOR_STORAGE_KEY, 'No V1 Store access');
            if (state.failRead) throw new Error('synthetic read failure');
            if (state.failReadAfterWrite && state.writes > state.faultAfterWrites) throw new Error('Readback unavailable');
            if (state.readback !== undefined && state.writes > state.faultAfterWrites) return state.readback;
            return values.get(key) ?? null;
        },
        setItem(key, value) {
            assert.equal(key, EDITOR_STORAGE_KEY, 'No V1 Store access');
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

async function executionSetup() {
    const c = setup();
    const draft = c.service.prepareNewDraft((await c.service.loadLibrary()).library, 'template-1').draft;
    draft.template = prepared({ phases: [...prepared().phases,
        { ...prepared().phases[0], id: 'phase-2', title: 'Discussion', category: 'discussion' }] });
    await c.service.saveDraft(draft);
    const unrelated = c.service.prepareNewDraft((await c.service.loadLibrary()).library, 'template-2').draft;
    unrelated.template = prepared({ id: 'template-2', name: 'Unrelated Template' });
    await c.service.saveDraft(unrelated);
    for (const executionId of ['planned-1', 'active-1']) {
        await c.writer.write(record => planExecutionFromTemplateInRecord(record, {
            templateId: 'template-1', executionId, expectedAggregateRevision: record.revision,
        }));
    }
    await c.writer.write(record => activatePlannedExecutionInRecord(record, {
        executionId: 'active-1', expectedAggregateRevision: record.revision,
        expectedExecutionRevision: 1, expectedRuntimeRevision: 0, runtimeRunId: 'active-run', savedAt: 1000,
    }));
    const record = await c.writer.write(record => startReadyExecutionInRecord(record, {
        executionId: 'active-1', expectedAggregateRevision: record.revision,
        expectedExecutionRevision: 2, expectedRuntimeRevision: 1, attemptId: 'active-attempt', startedAt: 2000,
    }));
    return { ...c, record, executionService: createNativePlannedExecutionService({ writer: c.writer }) };
}

test('PLANNED drafts reuse all existing edit operations without persistence or Template identity semantics', async () => {
    const c = await executionSetup();
    const writes = c.storage.state.writes;
    const loaded = await c.executionService.loadDraft('planned-1');
    assert.deepEqual(loaded, { status: 'success', draft: {
        executionId: 'planned-1', expectedAggregateRevision: c.record.revision, expectedExecutionRevision: 1,
        template: { id: 'planned-1', ...c.record.executions[0].execution.currentPlan },
    } });
    const before = structuredClone(loaded.draft);
    let draft = editNativeTemplateDraft(loaded.draft, { name: 'Independent agenda', category: 'training',
        preparedInformation: '**Changed** information', transitionMode: 'automatic' });
    draft = editNativePhaseDraft(draft, 'phase-1', { title: 'New opening', durationSeconds: 900, category: 'breakout',
        notes: '*Edited* phase notes', resources: [{ label: 'Changed board', url: 'https://example.test/board' }] });
    draft = repositionNativeDraftPhase(draft, 'phase-2', 1);
    draft = insertNativeDraftPhase(draft, { phaseId: 'new-phase', beforePhaseId: 'phase-1' });
    draft = editNativePhaseDraft(draft, 'new-phase', { title: 'Break' });
    draft = removeNativeDraftPhase(draft, 'phase-2');
    assert.deepEqual(draft.template.phases.map(phase => phase.id), ['new-phase', 'phase-1']);
    assert.deepEqual(loaded.draft, before);
    assert.equal(c.storage.state.writes, writes);
    assert.deepEqual(await c.writer.read(), c.record, 'Editing and cancelling do not persist');
    const saved = await c.executionService.saveDraft(draft);
    const { id, ...currentPlan } = draft.template;
    const expectedExecution = { ...c.record.executions[0].execution, revision: 2, currentPlan: structuredClone(currentPlan) };
    const expectedRecord = { ...c.record, revision: c.record.revision + 1,
        executions: [{ execution: expectedExecution, suspendedCheckpoint: null }, c.record.executions[1]] };
    assert.equal(id, 'planned-1');
    assert.deepEqual(saved, { status: 'success', record: expectedRecord, execution: expectedExecution });
    assert.deepEqual(await c.writer.read(), expectedRecord);
    assert.equal(c.storage.state.writes, writes + 1);
    assert.deepEqual(loaded.draft, before);
    assert.deepEqual(draft.template, { id, ...currentPlan });
    saved.execution.currentPlan.phases[0].title = 'Result only';
    saved.record.templates[0].plan.phases[0].resources[0].label = 'Result only';
    draft.template.phases[0].title = 'Draft only';
    assert.deepEqual(await c.writer.read(), expectedRecord);
});

test('PLANNED service rejects missing, unsupported and malformed inputs and retains complete invalid drafts', async () => {
    const c = await executionSetup();
    assert.deepEqual((await c.executionService.loadDraft('missing')).error, { type: 'missing', code: 'executionNotFound' });
    assert.deepEqual((await c.executionService.loadDraft('active-1')).error, { type: 'validation', code: 'invalidLifecycle' });
    assert.deepEqual((await c.executionService.loadDraft(null)).error, { type: 'validation', code: 'invalidData' });
    const draft = (await c.executionService.loadDraft('planned-1')).draft;
    const writes = c.storage.state.writes;
    for (const mutate of [
        value => { value.template.name = ''; },
        value => { value.template.phases[0].durationSeconds = 'not finished'; },
        value => { value.template.phases[0].resources = null; },
        value => { value.template.phases[1].id = value.template.phases[0].id; },
        value => { value.template.id = 'template-1'; },
        value => { value.expectedExecutionRevision = -1; },
        value => { value.expectedAggregateRevision = NaN; },
        value => { value.extra = true; },
        value => { value.template.extra = true; },
    ]) {
        const invalid = structuredClone(draft); mutate(invalid); const before = structuredClone(invalid);
        const rejected = await c.executionService.saveDraft(invalid);
        assert.equal(rejected.status, 'error');
        assert.equal(rejected.error.type, 'validation');
        assert.deepEqual(rejected.draft, before);
        assert.deepEqual(invalid, before);
    }
    const foreign = { ...draft, executionId: 'missing', template: { ...draft.template, id: 'missing' } };
    assert.equal((await c.executionService.saveDraft(foreign)).error.code, 'executionNotFound');
    const active = { ...draft, executionId: 'active-1', template: { ...draft.template, id: 'active-1' } };
    assert.equal((await c.executionService.saveDraft(active)).error.code, 'invalidLifecycle');
    assert.equal(c.storage.state.writes, writes);
    assert.deepEqual(await c.writer.read(), c.record);
    assert.throws(() => createNativePlannedExecutionService(), /invalidPlannerService/);
});

test('concurrent PLANNED saves reject stale revisions without merging, retry or loss of draft input', async () => {
    const c = await executionSetup();
    const other = createNativePlannedExecutionService({ writer: createEditorStoreWriter({ getStorage: () => c.storage, locks: locks() }) });
    const first = (await c.executionService.loadDraft('planned-1')).draft;
    const second = (await other.loadDraft('planned-1')).draft;
    second.template.preparedInformation = 'My complete unsaved draft';
    const before = structuredClone(second);
    first.template.name = 'Other tab saved';
    const saved = await c.executionService.saveDraft(first);
    const writes = c.storage.state.writes;
    const rejected = await other.saveDraft(second);
    assert.deepEqual(rejected, { status: 'error', error: { type: 'conflict', code: 'conflict' }, draft: before });
    const staleExecution = { ...second, expectedAggregateRevision: saved.record.revision };
    assert.equal((await other.saveDraft(staleExecution)).error.code, 'conflict');
    assert.deepEqual(second, before);
    assert.equal(c.storage.state.writes, writes);
    assert.deepEqual(await c.writer.read(), saved.record);
});

test('PLANNED service preserves data and drafts on corrupt/missing storage, lock and storage failures', async () => {
    const c = await executionSetup();
    const draft = (await c.executionService.loadDraft('planned-1')).draft;
    const before = structuredClone(draft);
    const writes = c.storage.state.writes;
    for (const [lockManager, code] of [[null, 'lockUnavailable'], [locks(false), 'lockBusy'],
        [{ request() { throw new Error('Denied'); } }, 'lockRequest']]) {
        const service = createNativePlannedExecutionService({ writer: createEditorStoreWriter({ getStorage: () => c.storage, locks: lockManager }) });
        assert.equal((await service.loadDraft('planned-1')).error.code, code);
        assert.deepEqual((await service.saveDraft(draft)).draft, before);
        assert.equal((await service.saveDraft(draft)).error.code, code);
    }
    for (const [field, value, code] of [['failRead', true, 'storageRead'],
        ['failWrite', 'QuotaExceededError', 'storageQuota'], ['failWrite', 'Error', 'storageWrite']]) {
        c.storage.state[field] = value;
        const result = await c.executionService.saveDraft(draft);
        assert.equal(result.error.code, code); assert.deepEqual(result.draft, before);
        c.storage.state[field] = field === 'failRead' ? false : null;
    }
    c.storage.values.set(EDITOR_STORAGE_KEY, '{broken');
    assert.equal((await c.executionService.loadDraft('planned-1')).error.code, 'storageValidation');
    assert.equal((await c.executionService.saveDraft(draft)).error.code, 'storageValidation');
    assert.equal(c.storage.values.get(EDITOR_STORAGE_KEY), '{broken');
    c.storage.values.delete(EDITOR_STORAGE_KEY);
    assert.equal((await c.executionService.loadDraft('planned-1')).error.code, 'executionNotFound');
    assert.equal(c.storage.state.writes, writes);
    assert.deepEqual(draft, before);
});

test('uncertain PLANNED saves reconcile full source/target/conflict read-only with stable identities', async () => {
    for (const failure of ['unconfirmed', 'readback', 'lateRequest']) {
        for (const outcome of ['source', 'target', 'conflict']) {
            const c = await executionSetup();
            const draft = (await c.executionService.loadDraft('planned-1')).draft;
            draft.template.preparedInformation = '**Unsaved** user content';
            const before = structuredClone(draft);
            c.storage.state.faultAfterWrites = c.storage.state.writes;
            if (failure === 'unconfirmed') c.storage.state.failReadAfterWrite = true;
            if (failure === 'readback') c.storage.state.readback = 'Different readback';
            const service = failure === 'lateRequest' ? createNativePlannedExecutionService({ writer: createEditorStoreWriter({
                getStorage: () => c.storage, locks: { async request(name, options, callback) {
                    const result = await locks().request(name, options, callback);
                    throw new Error('Late acknowledgement lost');
                } },
            }) }) : c.executionService;
            const result = await service.saveDraft(draft);
            assert.equal(result.status, 'uncertain');
            assert.deepEqual(result.draft, before);
            assert.deepEqual(result.reconciliation.target, updatePlannedExecutionPlanInRecord(c.record, {
                executionId: draft.executionId, expectedAggregateRevision: draft.expectedAggregateRevision,
                expectedExecutionRevision: draft.expectedExecutionRevision,
                currentPlan: (({ id, ...plan }) => plan)(draft.template),
            }));
            c.storage.state.failReadAfterWrite = false; c.storage.state.readback = undefined;
            const observed = structuredClone(outcome === 'source' ? c.record : result.reconciliation.target);
            if (outcome === 'conflict') { observed.revision++; observed.templates[0].plan.name = 'Concurrent Template change'; }
            c.storage.values.set(EDITOR_STORAGE_KEY, JSON.stringify(observed));
            const writes = c.storage.state.writes;
            c.storage.state.failRead = true;
            const failedRead = await c.executionService.reconcileSave(result.reconciliation);
            assert.equal(failedRead.status, 'unresolved');
            assert.deepEqual(failedRead.reconciliation, result.reconciliation);
            c.storage.state.failRead = false;
            const reconciled = await c.executionService.reconcileSave(result.reconciliation);
            assert.equal(reconciled.status, { source: 'absent', target: 'confirmed', conflict: 'unresolved' }[outcome]);
            assert.deepEqual(reconciled.record, observed);
            assert.equal(c.storage.state.writes, writes);
            assert.deepEqual(draft, before);
        }
    }
});

test('PLANNED reconciliation rejects altered tickets before reading and retains real lifecycle conflicts', async () => {
    const c = await executionSetup();
    const draft = (await c.executionService.loadDraft('planned-1')).draft;
    c.storage.state.faultAfterWrites = c.storage.state.writes;
    c.storage.state.failReadAfterWrite = true;
    const saved = await c.executionService.saveDraft(draft);
    assert.equal(saved.status, 'uncertain');
    c.storage.state.failReadAfterWrite = false;
    let reads = 0;
    const service = createNativePlannedExecutionService({ writer: { write: c.writer.write,
        read() { reads++; return c.writer.read(); } } });
    for (const change of [
        value => { value.draft.template.id = 'foreign'; },
        value => { value.target.executions[0].execution.currentPlan.name = 'Unrelated target'; },
        value => { value.extra = true; },
    ]) {
        const invalid = structuredClone(saved.reconciliation); change(invalid);
        assert.equal((await service.reconcileSave(invalid)).status, 'error');
        assert.equal(reads, 0);
    }
    const changed = structuredClone(saved.reconciliation.target);
    changed.revision++; changed.executions = changed.executions.filter(entry => entry.execution.id !== 'planned-1');
    c.storage.values.set(EDITOR_STORAGE_KEY, JSON.stringify(changed));
    const writes = c.storage.state.writes;
    const result = await service.reconcileSave(saved.reconciliation);
    assert.equal(result.status, 'unresolved');
    assert.deepEqual(result.record, changed);
    assert.deepEqual(result.reconciliation, saved.reconciliation);
    assert.equal(c.storage.state.writes, writes);
});
