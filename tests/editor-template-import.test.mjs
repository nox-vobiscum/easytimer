import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeTemplateImportService } from '../src/js/editor-template-import.mjs';
import { createPlannedExecution, validateTemplate } from '../src/js/editor-domain.mjs';
import {
    MAX_EDITOR_PORTABILITY_BYTES,
    serializeEditorTemplate, serializeEditorBackup, serializeEditorExecution,
} from '../src/js/editor-portability.mjs';
import {
    EDITOR_STORAGE_KEY, validateEditorStoreRecord, insertTemplateInRecord,
    activatePlannedExecutionInRecord, startReadyExecutionInRecord,
    suspendActiveExecutionInRecord,
} from '../src/js/editor-storage.mjs';
import { createEditorStoreWriter, EDITOR_STORE_WRITE_LOCK } from '../src/js/editor-storage-lock.mjs';

const template = (id = 'source') => validateTemplate({
    schemaVersion: 2, kind: 'template', id, revision: 7,
    plan: {
        name: 'Workshop', category: 'workshop', transitionMode: 'automatic',
        preparedInformation: '**Prepared** information',
        phases: [
            { id: 'opening', title: 'Opening', durationSeconds: 60, category: 'presentation',
                notes: '*Welcome*', resources: [{ label: 'Board', url: 'https://example.com/board' }] },
            { id: 'closing', title: 'Closing', durationSeconds: 120, category: 'discussion',
                notes: '- Reflect', resources: [{ label: 'Slides', url: 'https://example.com/slides' }] },
        ],
    },
});
const empty = () => ({ schemaVersion: 1, revision: 0, templates: [], executions: [], activeRuntime: null });
const document = () => serializeEditorTemplate(template());

function setup(record = empty(), generatedId = 'imported') {
    let raw = JSON.stringify(record);
    const state = { reads: 0, writes: 0, claims: 0, held: false, ids: 0,
        failRead: false, failWrite: null, acknowledgement: null, lock: 'available' };
    const storage = {
        getItem(key) {
            assert.equal(key, EDITOR_STORAGE_KEY, 'never access V1 or recovery storage');
            state.reads += 1;
            if (state.failRead) throw new Error('private read details');
            return raw;
        },
        setItem(key, value) {
            assert.equal(key, EDITOR_STORAGE_KEY);
            state.writes += 1;
            if (state.failWrite) {
                const error = new Error('private write details'); error.name = state.failWrite; throw error;
            }
            if (state.acknowledgement === 'source') return;
            raw = value;
            if (state.acknowledgement === 'readFailure') state.failRead = true;
        },
    };
    const locks = {
        async request(name, options, callback) {
            assert.equal(name, EDITOR_STORE_WRITE_LOCK, 'no active timer ownership claim');
            assert.deepEqual(options, { mode: 'exclusive', ifAvailable: true });
            state.claims += 1;
            if (state.lock === 'error') throw new Error('private lock details');
            if (state.lock === 'busy' || state.held) return callback(null);
            state.held = true;
            try {
                const result = callback({ name });
                if (state.lock === 'lateError') throw new Error('late lock failure');
                return result;
            } finally { state.held = false; }
        },
    };
    const writer = createEditorStoreWriter({ getStorage: () => storage, locks });
    const service = createNativeTemplateImportService({ writer, createId: () => { state.ids += 1; return generatedId; } });
    return { state, storage, writer, service,
        get raw() { return raw; }, set raw(value) { raw = value; } };
}

function activeRecord() {
    const source = template();
    const planned = createPlannedExecution(source, 'planned');
    let record = { ...empty(), revision: 2, templates: [source], executions: [
        { execution: planned, suspendedCheckpoint: null },
        { execution: createPlannedExecution(source, 'active'), suspendedCheckpoint: null },
    ] };
    record = activatePlannedExecutionInRecord(record, {
        executionId: 'active', expectedAggregateRevision: 2, expectedExecutionRevision: 1,
        expectedRuntimeRevision: 0, runtimeRunId: 'independent-run', savedAt: 1000,
    });
    const execution = record.executions[1].execution;
    return startReadyExecutionInRecord(record, {
        executionId: 'active', expectedAggregateRevision: record.revision,
        expectedExecutionRevision: execution.revision, expectedRuntimeRevision: execution.runtimeRevision,
        attemptId: 'independent-attempt', startedAt: 1000,
    });
}

test('preview is isolated, read/write-free and generates one fresh identity with revision one', () => {
    const c = setup();
    const text = document();
    const result = c.service.prepareImport(text, 0);
    assert.equal(result.status, 'prepared');
    assert.deepEqual(result.candidate, { expectedAggregateRevision: 0,
        template: { ...template(), id: 'imported', revision: 1 } });
    assert.deepEqual([c.state.reads, c.state.writes, c.state.claims, c.state.ids], [0, 0, 0, 1]);
    result.candidate.template.plan.phases[0].resources[0].label = 'Draft only';
    assert.equal(template().plan.phases[0].resources[0].label, 'Board');
    assert.equal(text, document());
    assert.equal(c.raw, JSON.stringify(empty()), 'abandoned preview has no persistence effect');
});

test('explicit import preserves every planning field, existing templates, executions and running runtime', async () => {
    const before = activeRecord();
    const c = setup(before);
    const { candidate } = c.service.prepareImport(document(), before.revision);
    const review = structuredClone(candidate);
    const result = await c.service.persistImport(candidate);
    const expected = insertTemplateInRecord(before, { template: candidate.template, expectedAggregateRevision: before.revision });
    assert.equal(result.status, 'confirmed');
    assert.equal(result.templateId, 'imported');
    assert.deepEqual(result.record, expected);
    assert.deepEqual(JSON.parse(c.raw), expected);
    assert.deepEqual(result.record.executions, before.executions);
    assert.deepEqual(result.record.activeRuntime, before.activeRuntime);
    assert.deepEqual(result.record.templates[0], before.templates[0]);
    assert.deepEqual(result.record.templates[1].plan, template().plan);
    assert.deepEqual(candidate, review);
    assert.equal(c.state.writes, 1);
    assert.equal(c.state.ids, 1);
    candidate.template.plan.phases[0].resources[0].label = 'Changed review';
    result.record.templates[1].plan.phases[0].notes = 'Changed result';
    assert.deepEqual(JSON.parse(c.raw), expected);
    assert.deepEqual(before, activeRecord());
    const repeated = await c.service.persistImport(review);
    assert.deepEqual(repeated.error, { type: 'conflict', code: 'conflict' });
    assert.equal(c.state.writes, 1, 'no duplicate write on repeated confirmation');
});

test('import preserves suspended progress and checkpoint as well as historical source references', async () => {
    const active = activeRecord();
    const execution = active.executions[1].execution;
    const before = suspendActiveExecutionInRecord(active, {
        executionId: execution.id, expectedAggregateRevision: active.revision,
        expectedExecutionRevision: execution.revision, expectedRuntimeRevision: execution.runtimeRevision,
        expectedAttemptId: execution.attempt.id, expectedRunId: active.activeRuntime.run.runId,
        suspendedAt: 1500, workshopNotes: execution.workshopNotes,
    });
    const c = setup(before);
    const { candidate } = c.service.prepareImport(document(), before.revision);
    const result = await c.service.persistImport(candidate);
    assert.equal(result.status, 'confirmed');
    assert.deepEqual(result.record, insertTemplateInRecord(before, {
        template: candidate.template, expectedAggregateRevision: before.revision,
    }));
    assert.deepEqual(result.record.executions, before.executions);
});

test('revision changes between preview and confirmation reject without rebasing or modifying the draft', async () => {
    const c = setup();
    const { candidate } = c.service.prepareImport(document(), 0);
    const before = structuredClone(candidate);
    const concurrent = insertTemplateInRecord(empty(), { template: template('other'), expectedAggregateRevision: 0 });
    c.raw = JSON.stringify(concurrent);
    const result = await c.service.persistImport(candidate);
    assert.deepEqual(result, { status: 'error', error: { type: 'conflict', code: 'conflict' }, candidate: before });
    assert.equal(c.raw, JSON.stringify(concurrent));
    assert.deepEqual(candidate, before);
    assert.equal(c.state.writes, 0);
});

test('source identity, invalid generated IDs and existing identity collisions never overwrite or regenerate', async () => {
    for (const id of ['source', null, '', 42]) {
        const c = setup(empty(), id);
        assert.equal(c.service.prepareImport(document(), 0).status, 'error');
        assert.equal(c.state.ids, 1);
        assert.equal(c.state.writes, 0);
    }
    const before = { ...empty(), templates: [template('imported')] };
    const c = setup(before);
    const { candidate } = c.service.prepareImport(document(), 0);
    const result = await c.service.persistImport(candidate);
    assert.deepEqual(result.error, { type: 'conflict', code: 'duplicateId' });
    assert.equal(c.raw, JSON.stringify(before));
    assert.equal(c.state.writes, 0);
    assert.equal(c.state.ids, 1);
});

test('malformed, invalid, oversized UTF-8 and unsupported documents never reach persistence', () => {
    const c = setup();
    const invalid = JSON.parse(document()); invalid.template.plan.phases[0].resources[0].url = 'javascript:alert(1)';
    const extra = JSON.parse(document()); extra.template.extra = true;
    const cases = [
        ['', 'portabilityEmpty'], ['{', 'portabilityJSON'],
        [JSON.stringify({ ...JSON.parse(document()), formatVersion: 2 }), 'portabilityVersion'],
        [JSON.stringify({ ...JSON.parse(document()), kind: 'unknown' }), 'portabilityKind'],
        [JSON.stringify(invalid), 'portabilityInvalid'], [JSON.stringify(extra), 'portabilityInvalid'],
        ['é'.repeat(MAX_EDITOR_PORTABILITY_BYTES / 2 + 1), 'portabilitySize'],
        [serializeEditorBackup(empty()), 'unsupportedImportKind'],
        [serializeEditorExecution({ execution: createPlannedExecution(template(), 'execution'), suspendedCheckpoint: null }), 'unsupportedImportKind'],
        [serializeEditorBackup(activeRecord()), 'unsupportedImportKind'],
    ];
    for (const [text, code] of cases) {
        assert.deepEqual(c.service.prepareImport(text, 0), { status: 'error', error: { type: 'validation', code } });
    }
    assert.deepEqual([c.state.writes, c.state.reads, c.state.claims, c.state.ids], [0, 0, 0, 0]);
});

test('missing store imports from revision zero while corrupt storage is preserved', async () => {
    const c = setup(); c.raw = null;
    const { candidate } = c.service.prepareImport(document(), 0);
    assert.equal((await c.service.persistImport(candidate)).status, 'confirmed');
    const broken = setup(); broken.raw = '{';
    const result = await broken.service.persistImport(candidate);
    assert.deepEqual(result.error, { type: 'storage', code: 'storageValidation' });
    assert.equal(broken.raw, '{');
    assert.equal(broken.state.writes, 0);
});

test('storage and lock failures retain the candidate, expose established codes and never retry', async () => {
    for (const [key, value, code, type] of [
        ['failRead', true, 'storageRead', 'storage'],
        ['failWrite', 'Error', 'storageWrite', 'storage'],
        ['failWrite', 'QuotaExceededError', 'storageQuota', 'storage'],
        ['lock', 'busy', 'lockBusy', 'lock'], ['lock', 'error', 'lockRequest', 'lock'],
    ]) {
        const c = setup();
        const { candidate } = c.service.prepareImport(document(), 0);
        c.state[key] = value;
        const result = await c.service.persistImport(candidate);
        assert.deepEqual(result, { status: 'error', error: { type, code }, candidate });
        assert.equal(c.raw, JSON.stringify(empty()));
        assert.ok(c.state.writes <= 1);
        assert.equal(c.state.claims, 1);
        assert.equal(c.state.held, false);
    }
    const writer = createEditorStoreWriter({ getStorage: () => assert.fail('no storage without lock'), locks: null });
    const service = createNativeTemplateImportService({ writer });
    const candidate = setup().service.prepareImport(document(), 0).candidate;
    assert.equal((await service.persistImport(candidate)).error.code, 'lockUnavailable');
});

test('unconfirmed acknowledgement retains full stable snapshots and reconciles the exact target read-only', async () => {
    const c = setup(activeRecord());
    const { candidate } = c.service.prepareImport(document(), activeRecord().revision);
    c.state.acknowledgement = 'readFailure';
    const result = await c.service.persistImport(candidate);
    assert.equal(result.status, 'uncertain');
    assert.equal(result.error.code, 'storageUnconfirmed');
    assert.deepEqual(result.reconciliation.candidate, candidate);
    assert.deepEqual(result.reconciliation.source, activeRecord());
    assert.deepEqual(result.reconciliation.target, JSON.parse(c.raw));
    const ticketBefore = structuredClone(result.reconciliation);
    assert.equal((await c.service.reconcileImport(result.reconciliation)).status, 'unresolved');
    c.state.failRead = false;
    const observed = await c.service.reconcileImport(result.reconciliation);
    assert.deepEqual(observed, { status: 'confirmed', templateId: candidate.template.id, record: JSON.parse(c.raw) });
    assert.deepEqual(result.reconciliation, ticketBefore);
    assert.deepEqual([c.state.writes, c.state.ids], [1, 1]);
    assert.equal(c.state.held, false);
});

test('failed readback with exact source confirms current absence without an automatic second import', async () => {
    const c = setup();
    const { candidate } = c.service.prepareImport(document(), 0);
    c.state.acknowledgement = 'source';
    const result = await c.service.persistImport(candidate);
    assert.equal(result.status, 'uncertain');
    assert.equal(result.error.code, 'storageReadback');
    assert.deepEqual(await c.service.reconcileImport(result.reconciliation), {
        status: 'absent', templateId: 'imported', record: empty(),
    });
    assert.deepEqual([c.state.writes, c.state.ids], [1, 1]);
});

test('changed aggregates and later edits to an imported template remain unresolved, never false success', async () => {
    const c = setup();
    const { candidate } = c.service.prepareImport(document(), 0);
    c.state.acknowledgement = 'readFailure';
    const { reconciliation } = await c.service.persistImport(candidate);
    c.state.failRead = false;
    for (const record of [
        insertTemplateInRecord(empty(), { template: template('other'), expectedAggregateRevision: 0 }),
        { ...reconciliation.target, revision: 2, templates: [{ ...candidate.template, revision: 2 }] },
    ]) {
        c.raw = JSON.stringify(record);
        const result = await c.service.reconcileImport(reconciliation);
        assert.deepEqual(result, { status: 'unresolved', templateId: 'imported', record, reconciliation });
        assert.equal(c.raw, JSON.stringify(record));
    }
    c.raw = '{';
    const corrupt = await c.service.reconcileImport(reconciliation);
    assert.equal(corrupt.status, 'unresolved');
    assert.equal(corrupt.error.code, 'storageValidation');
    assert.deepEqual(corrupt.reconciliation, reconciliation);
    assert.deepEqual([c.state.writes, c.state.ids], [1, 1]);
});

test('a late lock request rejection after a completed callback is uncertain and reconcilable', async () => {
    const c = setup();
    const { candidate } = c.service.prepareImport(document(), 0);
    c.state.lock = 'lateError';
    const result = await c.service.persistImport(candidate);
    assert.equal(result.status, 'uncertain');
    assert.equal(result.error.code, 'lockRequest');
    c.state.lock = 'available';
    assert.equal((await c.service.reconcileImport(result.reconciliation)).status, 'confirmed');
    assert.equal(c.state.writes, 1);
});

test('invalid candidates and modified reconciliation tickets are rejected before storage access', async () => {
    const c = setup();
    const { candidate } = c.service.prepareImport(document(), 0);
    for (const invalid of [null, { ...candidate, extra: true },
        { ...candidate, expectedAggregateRevision: -1 },
        { ...candidate, template: { ...candidate.template, revision: 2 } }]) {
        assert.equal((await c.service.persistImport(invalid)).status, 'error');
    }
    assert.equal(c.state.reads, 0);
    const target = insertTemplateInRecord(empty(), { template: candidate.template, expectedAggregateRevision: 0 });
    target.templates[0].plan.name = 'Not the reviewed target';
    const result = await c.service.reconcileImport({ candidate, source: empty(), target });
    assert.deepEqual(result, { status: 'error', error: { type: 'validation', code: 'invalidImportReconciliation' } });
    assert.equal(c.state.reads, 0);
    assert.equal(c.state.writes, 0);
});
