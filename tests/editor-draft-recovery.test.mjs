import test from 'node:test';
import assert from 'node:assert/strict';
import {
    createEditorDraftRecoveryStore,
    EDITOR_DRAFT_RECOVERY_PREFIX,
    validateEditorDraftRecoveryRecord,
} from '../src/js/editor-draft-recovery.mjs';
import {
    EDITOR_STORAGE_KEY,
    insertTemplateInRecord,
    planExecutionFromTemplateInRecord,
    updatePlannedExecutionPlanInRecord,
} from '../src/js/editor-storage.mjs';
import {
    createNativePlannerService,
    createNativePlannedExecutionService,
} from '../src/js/editor-planner-service.mjs';
import { createNativeEditorTemplateIntegration } from '../src/js/editor-template-integration.mjs';

function memory() {
    const values = new Map();
    const state = {
        getError: null,
        setError: null,
        removeError: null,
        readback: undefined,
        touched: [],
    };
    return {
        values,
        state,
        get length() { return values.size; },
        key(index) { return [...values.keys()][index] ?? null; },
        getItem(key) {
            state.touched.push(['get', key]);
            if (state.getError) throw state.getError;
            if (state.readback !== undefined) return state.readback;
            return values.get(key) ?? null;
        },
        setItem(key, value) {
            state.touched.push(['set', key]);
            if (state.setError) throw state.setError;
            values.set(key, value);
        },
        removeItem(key) {
            state.touched.push(['remove', key]);
            if (state.removeError) throw state.removeError;
            values.delete(key);
        },
    };
}

const phase = (changes = {}) => ({
    id: 'phase-1',
    title: 'Opening',
    durationSeconds: 600,
    category: 'presentation',
    notes: '',
    resources: [],
    ...changes,
});

const editableTemplate = (changes = {}) => ({
    id: 'template-1',
    name: 'Workshop',
    category: 'workshop',
    transitionMode: 'manual',
    preparedInformation: '',
    phases: [phase()],
    ...changes,
});

const templateDraft = (changes = {}) => ({
    mode: 'create',
    expectedAggregateRevision: 0,
    expectedTemplateRevision: null,
    template: editableTemplate(),
    ...changes,
});

const recovery = (changes = {}) => ({
    schemaVersion: 1,
    recoveryId: 'recovery-1',
    contextId: 'context-1',
    savedAt: 100,
    editorKind: 'template',
    entityId: 'template-1',
    sourceTemplateId: null,
    state: 'draft',
    baseline: templateDraft(),
    draft: templateDraft(),
    pending: null,
    ...changes,
});

function emptyRecord() {
    return { schemaVersion: 1, revision: 0, templates: [], executions: [], activeRuntime: null };
}

function templatePendingRecord() {
    const draft = templateDraft();
    const operation = {
        kind: 'create',
        template: {
            schemaVersion: 2,
            kind: 'template',
            id: draft.template.id,
            revision: 1,
            plan: (({ id, ...plan }) => plan)(draft.template),
        },
        expectedAggregateRevision: 0,
    };
    const source = emptyRecord();
    const target = insertTemplateInRecord(source, operation);
    return recovery({
        savedAt: 101,
        state: 'pending',
        pending: { kind: 'templateSave', ticket: { draft, operation, source, target } },
    });
}

function expectCode(code, callback) {
    assert.throws(callback, error => error?.message === code);
}

test('creates, reads and copy-isolates one complete recovery record with readback', () => {
    const storage = memory();
    const store = createEditorDraftRecoveryStore(storage);
    const input = recovery();
    const created = store.create(input);
    input.draft.template.name = 'Mutated caller';
    created.draft.template.name = 'Mutated result';

    assert.equal(store.read('recovery-1').draft.template.name, 'Workshop');
    assert.equal(storage.values.size, 1);
    assert.equal(storage.values.has(`${EDITOR_DRAFT_RECOVERY_PREFIX}recovery-1`), true);
    assert.deepEqual(storage.state.touched.map(([operation]) => operation), ['get', 'set', 'get', 'get']);
});

test('updates only with the exact prior savedAt precondition and advances same-millisecond timestamps', () => {
    const store = createEditorDraftRecoveryStore(memory());
    store.create(recovery());
    const updated = recovery({ savedAt: 100, draft: templateDraft({
        template: editableTemplate({ name: 'Updated' }),
    }) });
    const first = store.update(updated, 100);
    assert.equal(first.draft.template.name, 'Updated');
    assert.equal(first.savedAt, 101);
    assert.equal(updated.savedAt, 100, 'monotone versioning never mutates the caller record');
    const second = store.update(recovery({ savedAt: 100, draft: templateDraft({
        template: editableTemplate({ name: 'Updated again' }),
    }) }), 101);
    assert.equal(second.savedAt, 102);
    assert.equal(second.draft.template.name, 'Updated again');
    expectCode('recoveryConflict', () => store.update(recovery({ savedAt: 102 }), 100));
    expectCode('recoveryNotFound', () => store.update(recovery({ recoveryId: 'missing', savedAt: 102 }), 101));

    const overflowStore = createEditorDraftRecoveryStore(memory());
    overflowStore.create(recovery({ savedAt: Number.MAX_SAFE_INTEGER }));
    expectCode('recoveryVersionOverflow', () => overflowStore.update(
        recovery({ savedAt: Number.MAX_SAFE_INTEGER }), Number.MAX_SAFE_INTEGER,
    ));
});

test('update preserves the original context, entity, editor kind, source and baseline binding', () => {
    const store = createEditorDraftRecoveryStore(memory());
    store.create(recovery());
    expectCode('recoveryConflict', () => store.update(recovery({ contextId: 'context-2', savedAt: 101 }), 100));
    expectCode('recoveryConflict', () => store.update(recovery({
        entityId: 'template-2',
        savedAt: 101,
        baseline: templateDraft({ template: editableTemplate({ id: 'template-2' }) }),
        draft: templateDraft({ template: editableTemplate({ id: 'template-2' }) }),
    }), 100));
    expectCode('recoveryConflict', () => store.update(recovery({
        savedAt: 101,
        baseline: templateDraft({ template: editableTemplate({ name: 'Replaced baseline' }) }),
    }), 100));
    const executionDraft = {
        executionId: 'execution-1',
        expectedAggregateRevision: 0,
        expectedExecutionRevision: 1,
        template: editableTemplate({ id: 'execution-1' }),
    };
    expectCode('recoveryConflict', () => store.update(recovery({
        editorKind: 'execution',
        entityId: 'execution-1',
        savedAt: 101,
        baseline: executionDraft,
        draft: executionDraft,
    }), 100));

    const newDraft = {
        executionId: null,
        expectedAggregateRevision: 0,
        expectedExecutionRevision: null,
        template: editableTemplate({ id: 'unpersisted-execution' }),
        sourceTemplateId: 'template-source',
    };
    const newStore = createEditorDraftRecoveryStore(memory());
    newStore.create(recovery({
        editorKind: 'newExecution',
        entityId: null,
        sourceTemplateId: 'template-source',
        baseline: newDraft,
        draft: newDraft,
    }));
    const otherSourceDraft = { ...newDraft, sourceTemplateId: 'template-other' };
    expectCode('recoveryConflict', () => newStore.update(recovery({
        editorKind: 'newExecution',
        entityId: null,
        sourceTemplateId: 'template-other',
        savedAt: 101,
        baseline: otherSourceDraft,
        draft: otherSourceDraft,
    }), 100));
});

test('one of two updates from the same observed version wins and the stale update fails', () => {
    const store = createEditorDraftRecoveryStore(memory());
    const observed = store.create(recovery());
    const first = structuredClone(observed);
    first.savedAt = 101;
    first.draft.template.name = 'First tab';
    const second = structuredClone(observed);
    second.savedAt = 101;
    second.draft.template.name = 'Second tab';
    assert.equal(store.update(first, observed.savedAt).draft.template.name, 'First tab');
    expectCode('recoveryConflict', () => store.update(second, observed.savedAt));
    assert.equal(store.read('recovery-1').draft.template.name, 'First tab');
});

test('rejects create collisions without replacing the stored draft', () => {
    const store = createEditorDraftRecoveryStore(memory());
    store.create(recovery());
    expectCode('recoveryConflict', () => store.create(recovery({
        draft: templateDraft({ template: editableTemplate({ name: 'Replacement' }) }),
    })));
    assert.equal(store.read('recovery-1').draft.template.name, 'Workshop');
});

test('keeps separate recoveries for the same entity and for different tab contexts', () => {
    const store = createEditorDraftRecoveryStore(memory());
    store.create(recovery());
    store.create(recovery({ recoveryId: 'recovery-2', contextId: 'context-2', savedAt: 200 }));
    const listed = store.list();
    assert.deepEqual(listed.errors, []);
    assert.deepEqual(listed.records.map(item => [item.recoveryId, item.contextId, item.entityId]), [
        ['recovery-2', 'context-2', 'template-1'],
        ['recovery-1', 'context-1', 'template-1'],
    ]);
});

test('removes exactly one selected record with an exact precondition', () => {
    const storage = memory();
    const store = createEditorDraftRecoveryStore(storage);
    store.create(recovery());
    store.create(recovery({ recoveryId: 'recovery-2', savedAt: 200 }));
    expectCode('recoveryConflict', () => store.remove('recovery-1', 99));
    assert.equal(store.remove('recovery-1', 100).recoveryId, 'recovery-1');
    assert.equal(store.read('recovery-1'), null);
    assert.equal(store.read('recovery-2').recoveryId, 'recovery-2');
});

test('reports corrupt JSON and unsupported schemas without deleting them', () => {
    const storage = memory();
    const store = createEditorDraftRecoveryStore(storage);
    const corruptKey = `${EDITOR_DRAFT_RECOVERY_PREFIX}corrupt`;
    const futureKey = `${EDITOR_DRAFT_RECOVERY_PREFIX}future`;
    storage.values.set(corruptKey, '{');
    storage.values.set(futureKey, JSON.stringify(recovery({ recoveryId: 'future', schemaVersion: 2 })));
    expectCode('recoveryParse', () => store.read('corrupt'));
    expectCode('unsupportedRecoverySchema', () => store.read('future'));
    assert.deepEqual(store.list().errors, [
        { key: corruptKey, code: 'recoveryParse' },
        { key: futureKey, code: 'unsupportedRecoverySchema' },
    ]);
    assert.equal(storage.values.has(corruptKey), true);
    assert.equal(storage.values.has(futureKey), true);
});

test('strictly rejects invalid identities, field types and incomplete drafts', () => {
    expectCode('recoveryValidation', () => validateEditorDraftRecoveryRecord(recovery({ recoveryId: '../bad' })));
    expectCode('recoveryValidation', () => validateEditorDraftRecoveryRecord(recovery({ contextId: '' })));
    expectCode('recoveryValidation', () => validateEditorDraftRecoveryRecord(recovery({ savedAt: '100' })));
    const incomplete = recovery();
    delete incomplete.draft.template.phases;
    expectCode('recoveryValidation', () => validateEditorDraftRecoveryRecord(incomplete));
    expectCode('recoveryValidation', () => validateEditorDraftRecoveryRecord(recovery({ extra: true })));
});

test('accepts valid Domain identities longer than the Recovery identifier limit', () => {
    const longTemplateId = `template-${'x'.repeat(220)}`;
    const longPhaseId = `phase-${'y'.repeat(220)}`;
    const draft = templateDraft({
        template: editableTemplate({ id: longTemplateId, phases: [phase({ id: longPhaseId })] }),
    });
    const valid = validateEditorDraftRecoveryRecord(recovery({
        entityId: longTemplateId,
        baseline: draft,
        draft,
    }));
    assert.equal(valid.entityId, longTemplateId);
    assert.equal(valid.draft.template.phases[0].id, longPhaseId);
});

test('preserves structurally complete but not yet save-valid field contents', () => {
    const record = recovery({ draft: templateDraft({
        template: editableTemplate({
            name: '',
            phases: [phase({ title: '', durationSeconds: '', resources: [{ label: '', url: '' }] })],
        }),
    }) });
    const valid = validateEditorDraftRecoveryRecord(record);
    assert.equal(valid.draft.template.name, '');
    assert.equal(valid.draft.template.phases[0].durationSeconds, '');
    assert.deepEqual(valid.draft.template.phases[0].resources, [{ label: '', url: '' }]);
});

test('retains aggregate and entity revisions for existing Template and Execution drafts', () => {
    const template = recovery({
        baseline: templateDraft({ mode: 'update', expectedAggregateRevision: 7, expectedTemplateRevision: 3 }),
        draft: templateDraft({ mode: 'update', expectedAggregateRevision: 7, expectedTemplateRevision: 3 }),
    });
    const validTemplate = validateEditorDraftRecoveryRecord(template);
    assert.equal(validTemplate.draft.expectedAggregateRevision, 7);
    assert.equal(validTemplate.draft.expectedTemplateRevision, 3);

    const executionDraft = {
        executionId: 'execution-1',
        expectedAggregateRevision: 11,
        expectedExecutionRevision: 4,
        template: editableTemplate({ id: 'execution-1' }),
    };
    const execution = validateEditorDraftRecoveryRecord(recovery({
        editorKind: 'execution',
        entityId: 'execution-1',
        baseline: executionDraft,
        draft: executionDraft,
    }));
    assert.equal(execution.draft.expectedAggregateRevision, 11);
    assert.equal(execution.draft.expectedExecutionRevision, 4);
});

test('validates the native new Execution draft shape and its complete plan observation ticket', () => {
    const newDraft = {
        executionId: null,
        expectedAggregateRevision: 4,
        expectedExecutionRevision: null,
        template: editableTemplate({ id: 'unpersisted-execution' }),
        sourceTemplateId: 'template-source',
    };
    const record = recovery({
        editorKind: 'newExecution',
        entityId: null,
        sourceTemplateId: 'template-source',
        state: 'pending',
        baseline: newDraft,
        draft: newDraft,
        pending: {
            kind: 'plan',
            ticket: {
                executionId: 'execution-created',
                retained: editableTemplate({ id: 'unpersisted-execution' }),
                sourceTemplateId: 'template-source',
                expectedPlan: (({ id, ...plan }) => plan)(editableTemplate({ id: 'template-source' })),
            },
        },
    });
    assert.equal(validateEditorDraftRecoveryRecord(record).pending.ticket.executionId, 'execution-created');
    const incomplete = structuredClone(record);
    delete incomplete.pending.ticket.expectedPlan;
    expectCode('recoveryValidation', () => validateEditorDraftRecoveryRecord(incomplete));
});

test('accepts a complete Template reconciliation ticket and rejects a partial one', () => {
    const record = templatePendingRecord();
    assert.equal(validateEditorDraftRecoveryRecord(record).pending.kind, 'templateSave');
    const partial = structuredClone(record);
    delete partial.pending.ticket.target;
    expectCode('recoveryValidation', () => validateEditorDraftRecoveryRecord(partial));
    const mismatchedDraft = structuredClone(record);
    mismatchedDraft.pending.ticket.draft.template.name = 'Not the written operation';
    expectCode('recoveryValidation', () => validateEditorDraftRecoveryRecord(mismatchedDraft));
    const mismatchedRevision = structuredClone(record);
    mismatchedRevision.draft.expectedAggregateRevision = 1;
    mismatchedRevision.baseline.expectedAggregateRevision = 1;
    expectCode('recoveryValidation', () => validateEditorDraftRecoveryRecord(mismatchedRevision));
    const foreignRecoveryContent = structuredClone(record);
    foreignRecoveryContent.draft.template.name = 'Different editable recovery';
    expectCode('recoveryValidation', () => validateEditorDraftRecoveryRecord(foreignRecoveryContent));
});

test('allows only completely blank resources to differ between Recovery and Template save drafts', () => {
    const blankResource = templatePendingRecord();
    blankResource.draft.template.phases[0].resources = [{ label: '  ', url: '\t' }];
    const valid = validateEditorDraftRecoveryRecord(blankResource);
    assert.deepEqual(valid.draft.template.phases[0].resources, [{ label: '  ', url: '\t' }]);
    assert.deepEqual(valid.pending.ticket.draft.template.phases[0].resources, []);

    const partialResource = templatePendingRecord();
    partialResource.draft.template.phases[0].resources = [{ label: 'Board', url: '' }];
    expectCode('recoveryValidation', () => validateEditorDraftRecoveryRecord(partialResource));
});

test('accepts only a complete, reproducible PLANNED Execution reconciliation ticket', () => {
    const templateOperation = {
        kind: 'create',
        template: {
            schemaVersion: 2,
            kind: 'template',
            id: 'template-1',
            revision: 1,
            plan: (({ id, ...plan }) => plan)(editableTemplate()),
        },
        expectedAggregateRevision: 0,
    };
    const withTemplate = insertTemplateInRecord(emptyRecord(), templateOperation);
    const source = planExecutionFromTemplateInRecord(withTemplate, {
        templateId: 'template-1',
        executionId: 'execution-1',
        expectedAggregateRevision: withTemplate.revision,
    });
    const draft = {
        executionId: 'execution-1',
        expectedAggregateRevision: source.revision,
        expectedExecutionRevision: 1,
        template: editableTemplate({ id: 'execution-1', name: 'Edited execution' }),
    };
    const target = updatePlannedExecutionPlanInRecord(source, {
        executionId: draft.executionId,
        expectedAggregateRevision: draft.expectedAggregateRevision,
        expectedExecutionRevision: draft.expectedExecutionRevision,
        currentPlan: (({ id, ...plan }) => plan)(draft.template),
    });
    const record = recovery({
        editorKind: 'execution',
        entityId: 'execution-1',
        savedAt: 101,
        state: 'pending',
        baseline: {
            ...draft,
            template: editableTemplate({ id: 'execution-1' }),
        },
        draft,
        pending: { kind: 'executionSave', ticket: { draft, source, target } },
    });
    assert.equal(validateEditorDraftRecoveryRecord(record).pending.ticket.target.revision, target.revision);

    const inconsistent = structuredClone(record);
    inconsistent.pending.ticket.target.revision += 1;
    expectCode('recoveryValidation', () => validateEditorDraftRecoveryRecord(inconsistent));
    const mismatchedRevision = structuredClone(record);
    mismatchedRevision.draft.expectedAggregateRevision -= 1;
    mismatchedRevision.baseline.expectedAggregateRevision -= 1;
    expectCode('recoveryValidation', () => validateEditorDraftRecoveryRecord(mismatchedRevision));
    const foreignRecoveryContent = structuredClone(record);
    foreignRecoveryContent.draft.template.phases[0].notes = 'Different editable phase';
    expectCode('recoveryValidation', () => validateEditorDraftRecoveryRecord(foreignRecoveryContent));
});

test('accepts uncertain save tickets emitted by the existing Planner services', async () => {
    const templateSource = emptyRecord();
    const templateWriter = {
        async read() { return structuredClone(templateSource); },
        async write(transform) {
            transform(structuredClone(templateSource));
            throw new Error('storageReadback');
        },
    };
    const integration = createNativeEditorTemplateIntegration({ writer: templateWriter });
    const planner = createNativePlannerService({ integration, createId: () => 'template-1' });
    const prepared = planner.prepareNewDraft({ revision: 0, templates: [] }).draft;
    prepared.template = editableTemplate({ phases: [] });
    const templateResult = await planner.saveDraft(prepared);
    assert.equal(templateResult.status, 'uncertain');
    assert.equal(validateEditorDraftRecoveryRecord(recovery({
        state: 'pending',
        baseline: prepared,
        draft: prepared,
        pending: { kind: 'templateSave', ticket: templateResult.reconciliation },
    })).pending.kind, 'templateSave');

    const templateOperation = {
        kind: 'create',
        template: {
            schemaVersion: 2,
            kind: 'template',
            id: 'template-1',
            revision: 1,
            plan: (({ id, ...plan }) => plan)(editableTemplate()),
        },
        expectedAggregateRevision: 0,
    };
    const withTemplate = insertTemplateInRecord(emptyRecord(), templateOperation);
    const executionSource = planExecutionFromTemplateInRecord(withTemplate, {
        templateId: 'template-1',
        executionId: 'execution-1',
        expectedAggregateRevision: withTemplate.revision,
    });
    const executionWriter = {
        async read() { return structuredClone(executionSource); },
        async write(transform) {
            transform(structuredClone(executionSource));
            throw new Error('storageReadback');
        },
    };
    const executionService = createNativePlannedExecutionService({ writer: executionWriter });
    const executionDraft = (await executionService.loadDraft('execution-1')).draft;
    executionDraft.template.name = 'Edited execution';
    executionDraft.template.phases = [];
    const executionResult = await executionService.saveDraft(executionDraft);
    assert.equal(executionResult.status, 'uncertain');
    assert.equal(validateEditorDraftRecoveryRecord(recovery({
        editorKind: 'execution',
        entityId: 'execution-1',
        state: 'pending',
        baseline: (await executionService.loadDraft('execution-1')).draft,
        draft: executionDraft,
        pending: { kind: 'executionSave', ticket: executionResult.reconciliation },
    })).pending.kind, 'executionSave');
    assert.deepEqual(executionResult.reconciliation.target.executions[0].execution.currentPlan.phases, []);
});

test('binds a pending plan ticket to its zero-phase source and retains the editable draft', () => {
    const newDraft = {
        executionId: null,
        expectedAggregateRevision: 4,
        expectedExecutionRevision: null,
        template: editableTemplate({ id: 'unpersisted-execution', phases: [] }),
        sourceTemplateId: 'template-source',
    };
    const record = recovery({
        editorKind: 'newExecution',
        entityId: null,
        sourceTemplateId: 'template-source',
        state: 'pending',
        baseline: newDraft,
        draft: newDraft,
        pending: {
            kind: 'plan',
            ticket: {
                executionId: 'execution-created',
                retained: newDraft.template,
                sourceTemplateId: 'template-source',
                expectedPlan: (({ id, ...plan }) => plan)(newDraft.template),
            },
        },
    });
    assert.equal(validateEditorDraftRecoveryRecord(record).pending.kind, 'plan');
    const foreignRetained = structuredClone(record);
    foreignRetained.pending.ticket.retained.name = 'Foreign retained draft';
    expectCode('recoveryValidation', () => validateEditorDraftRecoveryRecord(foreignRetained));
    const foreignPlan = structuredClone(record);
    foreignPlan.pending.ticket.expectedPlan.name = 'Foreign source plan';
    expectCode('recoveryValidation', () => validateEditorDraftRecoveryRecord(foreignPlan));
});

test('maps quota, security, write and readback failures to stable error codes', () => {
    const quotaStorage = memory();
    quotaStorage.state.setError = Object.assign(new Error('quota'), { name: 'QuotaExceededError' });
    expectCode('recoveryStorageQuota', () => createEditorDraftRecoveryStore(quotaStorage).create(recovery()));

    const securityStorage = memory();
    securityStorage.state.getError = Object.assign(new Error('blocked'), { name: 'SecurityError' });
    expectCode('recoveryStorageSecurity', () => createEditorDraftRecoveryStore(securityStorage).read('recovery-1'));

    const writeStorage = memory();
    writeStorage.state.setError = new Error('write');
    expectCode('recoveryStorageWrite', () => createEditorDraftRecoveryStore(writeStorage).create(recovery()));

    const readbackStorage = memory();
    const readbackStore = createEditorDraftRecoveryStore(readbackStorage);
    let reads = 0;
    const originalGet = readbackStorage.getItem.bind(readbackStorage);
    readbackStorage.getItem = key => {
        reads += 1;
        return reads > 1 ? null : originalGet(key);
    };
    expectCode('recoveryStorageReadback', () => readbackStore.create(recovery()));

    const unconfirmedStorage = memory();
    const unconfirmedStore = createEditorDraftRecoveryStore(unconfirmedStorage);
    let unconfirmedReads = 0;
    const unconfirmedGet = unconfirmedStorage.getItem.bind(unconfirmedStorage);
    unconfirmedStorage.getItem = key => {
        unconfirmedReads += 1;
        if (unconfirmedReads > 1) throw Object.assign(new Error('blocked readback'), { name: 'SecurityError' });
        return unconfirmedGet(key);
    };
    expectCode('recoveryStorageWriteUnconfirmed', () => unconfirmedStore.create(recovery()));
    assert.equal(unconfirmedStorage.values.has(`${EDITOR_DRAFT_RECOVERY_PREFIX}recovery-1`), true);
});

test('reports failed and unconfirmed removes without claiming success', () => {
    const failedStorage = memory();
    const failedStore = createEditorDraftRecoveryStore(failedStorage);
    failedStore.create(recovery());
    failedStorage.state.removeError = new Error('remove');
    expectCode('recoveryStorageRemove', () => failedStore.remove('recovery-1', 100));
    assert.equal(failedStorage.values.has(`${EDITOR_DRAFT_RECOVERY_PREFIX}recovery-1`), true);

    const unconfirmedStorage = memory();
    const unconfirmedStore = createEditorDraftRecoveryStore(unconfirmedStorage);
    unconfirmedStore.create(recovery());
    unconfirmedStorage.removeItem = () => {};
    expectCode('recoveryStorageRemoveUnconfirmed', () => unconfirmedStore.remove('recovery-1', 100));

    const removedStorage = memory();
    const removedStore = createEditorDraftRecoveryStore(removedStorage);
    removedStore.create(recovery());
    let removeReads = 0;
    const removedGet = removedStorage.getItem.bind(removedStorage);
    removedStorage.getItem = key => {
        removeReads += 1;
        if (removeReads > 1) throw Object.assign(new Error('blocked readback'), { name: 'SecurityError' });
        return removedGet(key);
    };
    expectCode('recoveryStorageRemoveUnconfirmed', () => removedStore.remove('recovery-1', 100));
    assert.equal(removedStorage.values.has(`${EDITOR_DRAFT_RECOVERY_PREFIX}recovery-1`), false);
});

test('reports list enumeration and candidate read failures without deleting data', () => {
    const lengthStorage = memory();
    Object.defineProperty(lengthStorage, 'length', {
        get() { throw Object.assign(new Error('blocked length'), { name: 'SecurityError' }); },
    });
    expectCode('recoveryStorageSecurity', () => createEditorDraftRecoveryStore(lengthStorage).list());

    const keyStorage = memory();
    keyStorage.values.set(`${EDITOR_DRAFT_RECOVERY_PREFIX}recovery-1`, JSON.stringify(recovery()));
    keyStorage.key = () => { throw new Error('key failure'); };
    expectCode('recoveryStorageRead', () => createEditorDraftRecoveryStore(keyStorage).list());

    const readStorage = memory();
    const recoveryKey = `${EDITOR_DRAFT_RECOVERY_PREFIX}recovery-1`;
    readStorage.values.set(recoveryKey, JSON.stringify(recovery()));
    readStorage.state.getError = new Error('candidate read failure');
    assert.deepEqual(createEditorDraftRecoveryStore(readStorage).list(), {
        records: [],
        errors: [{ key: recoveryKey, code: 'recoveryStorageRead' }],
    });
    assert.equal(readStorage.values.has(recoveryKey), true);
});

test('lists many candidates without TTL cleanup or access to the authoritative Store key', () => {
    const storage = memory();
    storage.values.set(EDITOR_STORAGE_KEY, 'authoritative sentinel');
    const store = createEditorDraftRecoveryStore(storage);
    for (let index = 0; index < 75; index += 1) {
        store.create(recovery({
            recoveryId: `recovery-${index}`,
            contextId: `context-${index}`,
            savedAt: index,
        }));
    }
    const listed = store.list();
    assert.equal(listed.records.length, 75);
    assert.equal(listed.errors.length, 0);
    assert.equal(storage.values.get(EDITOR_STORAGE_KEY), 'authoritative sentinel');
    assert.equal(storage.state.touched.some(([, key]) => key === EDITOR_STORAGE_KEY), false);
    assert.equal(storage.values.size, 76, 'listing never deletes old recovery records');
});
