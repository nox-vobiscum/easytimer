import test from 'node:test';
import assert from 'node:assert/strict';
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
    transitionMode: 'manual',
    phases: [
        { id: 'phase-1', title: 'Opening', durationSeconds: 600 },
        { id: 'phase-2', title: 'Discussion', durationSeconds: 1200 },
    ],
    ...changes,
});

function memory(raw = null) {
    const values = new Map(raw === null ? [] : [[EDITOR_STORAGE_KEY, raw]]);
    const state = { writes: 0, failWrite: null };
    return {
        values,
        state,
        getItem(key) { return values.get(key) ?? null; },
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

function locks() {
    let held = false;
    return {
        request(name, options, callback) {
            assert.equal(name, 'easyTimerEditor.v1.write');
            assert.deepEqual(options, { mode: 'exclusive', ifAvailable: true });
            if (held) return Promise.resolve(callback(null));
            held = true;
            return Promise.resolve()
                .then(() => callback({ name, mode: 'exclusive' }))
                .finally(() => { held = false; });
        },
    };
}

function setup(raw = null) {
    const storage = memory(raw);
    const writer = createEditorStoreWriter({ getStorage: () => storage, locks: locks() });
    return { storage, writer, integration: createNativeEditorTemplateIntegration({ writer }) };
}

test('creates a validated native template from prepared Editor data through the locked writer', async () => {
    const { storage, integration } = setup();
    const draft = prepared();
    const before = structuredClone(draft);

    const result = await integration.createTemplate(draft, { expectedAggregateRevision: 0 });

    assert.deepEqual(draft, before);
    assert.equal(storage.state.writes, 1);
    assert.equal(result.revision, 1);
    assert.deepEqual(result.templates[0], {
        schemaVersion: 2,
        kind: 'template',
        id: 'template-1',
        revision: 1,
        plan: {
            name: 'Workshop',
            category: 'uncategorized',
            transitionMode: 'manual',
            preparedInformation: '',
            phases: [
                { id: 'phase-1', title: 'Opening', durationSeconds: 600, category: 'uncategorized', notes: '', resources: [] },
                { id: 'phase-2', title: 'Discussion', durationSeconds: 1200, category: 'uncategorized', notes: '', resources: [] },
            ],
        },
    });
    assert.notEqual(result.templates[0].plan.phases[0], draft.phases[0]);
    assert.deepEqual(JSON.parse(storage.values.get(EDITOR_STORAGE_KEY)), result);
});

test('updates template planning data while preserving identities and independent active execution state', async () => {
    const { storage, writer, integration } = setup();
    await integration.createTemplate(prepared(), { expectedAggregateRevision: 0 });
    const withExecution = await writer.write(record => planExecutionFromTemplateInRecord(record, {
        templateId: 'template-1',
        executionId: 'execution-1',
        expectedAggregateRevision: record.revision,
    }));
    const active = await writer.write(record => activatePlannedExecutionInRecord(record, {
        executionId: 'execution-1',
        expectedAggregateRevision: record.revision,
        expectedExecutionRevision: withExecution.executions[0].execution.revision,
        expectedRuntimeRevision: withExecution.executions[0].execution.runtimeRevision,
        runtimeRunId: 'runtime-1',
        savedAt: 1000,
    }));
    const executionBefore = structuredClone(active.executions);
    const runtimeBefore = structuredClone(active.activeRuntime);
    const draft = prepared({
        name: 'Updated workshop',
        category: 'workshop',
        preparedInformation: '**Prepared** information',
        phases: [
            { id: 'phase-2', title: 'Discussion updated', durationSeconds: 1800, category: 'discussion', notes: '*Notes*', resources: [] },
            { id: 'phase-1', title: 'Opening', durationSeconds: 600 },
            { id: 'phase-3', title: 'Closing', durationSeconds: 300 },
        ],
    });
    const draftBefore = structuredClone(draft);

    const result = await integration.updateTemplate(draft, {
        expectedAggregateRevision: active.revision,
        expectedTemplateRevision: active.templates[0].revision,
    });

    assert.deepEqual(draft, draftBefore);
    assert.equal(result.revision, active.revision + 1);
    assert.equal(result.templates[0].id, 'template-1');
    assert.equal(result.templates[0].revision, 2);
    assert.deepEqual(result.templates[0].plan.phases.map(phase => phase.id), ['phase-2', 'phase-1', 'phase-3']);
    assert.deepEqual(result.executions, executionBefore);
    assert.deepEqual(result.activeRuntime, runtimeBefore);
    assert.equal(result.executions[0].execution.currentPlan.name, 'Workshop');
    assert.notEqual(result.executions[0], active.executions[0]);
    assert.notEqual(result.activeRuntime, active.activeRuntime);
    assert.equal(storage.state.writes, 4);
});

test('native validation and revision conflicts reject without changing the unsaved draft or storage', async () => {
    const { storage, integration } = setup();
    await integration.createTemplate(prepared(), { expectedAggregateRevision: 0 });
    const invalid = prepared({ name: '', editorOnly: true });
    const invalidBefore = structuredClone(invalid);
    const changed = prepared({ name: 'Unsaved change' });
    const changedBefore = structuredClone(changed);

    await assert.rejects(integration.updateTemplate(invalid, {
        expectedAggregateRevision: 1,
        expectedTemplateRevision: 1,
    }), /invalidData/);
    await assert.rejects(integration.updateTemplate(changed, {
        expectedAggregateRevision: 0,
        expectedTemplateRevision: 1,
    }), /conflict/);
    await assert.rejects(integration.updateTemplate(changed, {
        expectedAggregateRevision: 1,
        expectedTemplateRevision: 0,
    }), /invalidRevision|conflict/);

    assert.deepEqual(invalid, invalidBefore);
    assert.deepEqual(changed, changedBefore);
    assert.equal(storage.state.writes, 1);
    assert.equal(JSON.parse(storage.values.get(EDITOR_STORAGE_KEY)).templates[0].plan.name, 'Workshop');
});

test('missing templates, invalid records and storage failures remain controlled with no retry or draft mutation', async () => {
    const missing = setup();
    const draft = prepared();
    const before = structuredClone(draft);
    await assert.rejects(missing.integration.updateTemplate(draft, {
        expectedAggregateRevision: 0,
        expectedTemplateRevision: 1,
    }), /templateNotFound/);
    assert.equal(missing.storage.state.writes, 0);

    const corrupt = setup('{broken');
    await assert.rejects(corrupt.integration.createTemplate(draft, {
        expectedAggregateRevision: 0,
    }), /storageValidation/);
    assert.equal(corrupt.storage.state.writes, 0);

    const failed = setup();
    failed.storage.state.failWrite = 'QuotaExceededError';
    await assert.rejects(failed.integration.createTemplate(draft, {
        expectedAggregateRevision: 0,
    }), /storageQuota/);
    assert.equal(failed.storage.state.writes, 0);
    assert.deepEqual(draft, before);
});

test('rejects incomplete integration inputs before acquiring storage write capability', async () => {
    assert.throws(() => createNativeEditorTemplateIntegration(), /invalidWriter/);
    const { storage, integration } = setup();
    await assert.rejects(integration.createTemplate(prepared(), {}), /invalidData/);
    await assert.rejects(integration.updateTemplate(prepared(), {
        expectedAggregateRevision: 0,
    }), /invalidData/);
    assert.equal(storage.state.writes, 0);
});
