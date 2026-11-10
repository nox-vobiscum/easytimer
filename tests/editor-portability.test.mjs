import test from 'node:test';
import assert from 'node:assert/strict';
import {
    activatePlannedExecution,
    createPlannedExecution,
    startActiveExecution,
    suspendReadyExecution,
} from '../src/js/editor-domain.mjs';
import {
    captureExecutionRuntimeCheckpoint,
    suspendStartedExecutionWithCheckpoint,
} from '../src/js/execution-runtime.mjs';
import {
    EDITOR_PORTABILITY_FORMAT_VERSION,
    EDITOR_PORTABILITY_KINDS,
    MAX_EDITOR_PORTABILITY_BYTES,
    parseEditorPortability,
    serializeEditorBackup,
    serializeEditorExecution,
    serializeEditorTemplate,
} from '../src/js/editor-portability.mjs';
import { prepareSession, transitionSession } from '../src/js/session.mjs';

const plan = name => ({
    name,
    category: 'workshop',
    transitionMode: 'manual',
    preparedInformation: '**Prepared** information',
    phases: [
        {
            id: `phase-${name.toLowerCase().replaceAll(' ', '-')}`,
            title: 'Opening',
            durationSeconds: 60,
            category: 'presentation',
            notes: '*Welcome*',
            resources: [{ label: 'Board', url: 'https://example.com/board' }],
        },
    ],
});

const template = (id = 'template-1', revision = 1) => ({
    schemaVersion: 2,
    kind: 'template',
    id,
    revision,
    plan: plan(`Workshop ${id}`),
});

const entry = (execution, suspendedCheckpoint = null) => ({ execution, suspendedCheckpoint });

function runtimeState(execution, runId, startedAt, savedAt) {
    const prepared = prepareSession({
        id: execution.source?.id ?? execution.id,
        name: execution.currentPlan.name,
        transitionMode: execution.currentPlan.transitionMode,
        phases: execution.currentPlan.phases,
    }, runId);
    const running = transitionSession(prepared.run, prepared.clock, { type: 'START' }, startedAt);
    return transitionSession(running.run, running.clock, { type: 'TICK' }, savedAt);
}

function activeFixture() {
    const ready = activatePlannedExecution(createPlannedExecution(template('template-deleted'), 'execution-active'));
    const execution = startActiveExecution(ready, 'attempt-active', 1000, 'run-active');
    const state = runtimeState(execution, 'run-active', 1000, 1500);
    return {
        entry: entry(execution),
        activeRuntime: {
            executionId: execution.id,
            attemptId: execution.attempt.id,
            runtimeRevision: execution.runtimeRevision,
            savedAt: 1500,
            run: state.run,
            clock: state.clock,
        },
    };
}

function suspendedStartedFixture() {
    const ready = activatePlannedExecution(createPlannedExecution(template('template-deleted'), 'execution-suspended-started'));
    const started = startActiveExecution(ready, 'attempt-suspended', 1000, 'run-suspended');
    const state = runtimeState(started, 'run-suspended', 1000, 1500);
    const checkpoint = captureExecutionRuntimeCheckpoint(started, state.run, state.clock, 1500);
    const suspended = suspendStartedExecutionWithCheckpoint(started, checkpoint);
    return entry(suspended.execution, suspended.checkpoint);
}

function completeRecord() {
    const active = activeFixture();
    const planned = createPlannedExecution(template('template-deleted'), 'execution-planned');
    const suspendedReady = suspendReadyExecution(
        activatePlannedExecution(createPlannedExecution(template('template-2'), 'execution-suspended-ready')),
    );
    return {
        schemaVersion: 1,
        revision: 12,
        templates: [template('template-1', 3), template('template-2', 2)],
        executions: [entry(planned), entry(suspendedReady), suspendedStartedFixture(), active.entry],
        activeRuntime: active.activeRuntime,
    };
}

test('complete backup round-trips every currently supported native aggregate field', () => {
    const source = completeRecord();
    const before = structuredClone(source);
    const parsed = parseEditorPortability(serializeEditorBackup(source));

    assert.deepEqual(source, before);
    assert.equal(parsed.formatVersion, EDITOR_PORTABILITY_FORMAT_VERSION);
    assert.equal(parsed.kind, EDITOR_PORTABILITY_KINDS.BACKUP);
    assert.deepEqual(parsed.record, source);
    assert.equal(parsed.record.executions[0].execution.source.id, 'template-deleted');
    assert.equal(parsed.record.executions[2].suspendedCheckpoint.attemptId, 'attempt-suspended');
    assert.equal(parsed.record.activeRuntime.attemptId, 'attempt-active');
    assert.notEqual(parsed.record, source);
    assert.notEqual(parsed.record.executions[0], source.executions[0]);
    parsed.record.templates[0].plan.name = 'Changed copy';
    assert.equal(source.templates[0].plan.name, 'Workshop template-1');
});

test('empty and multi-template backups serialize deterministically without source mutation', () => {
    const empty = { schemaVersion: 1, revision: 0, templates: [], executions: [], activeRuntime: null };
    const first = serializeEditorBackup(empty);
    const second = serializeEditorBackup(structuredClone(empty));
    assert.equal(first, second);
    assert.deepEqual(parseEditorPortability(first).record, empty);
    assert.match(first, /"kind": "editor-backup"/);
    assert.ok(first.endsWith('\n'));
});

test('individual Template export preserves complete Schema-2 planning data and isolation', () => {
    const source = template('template-1', 7);
    const before = structuredClone(source);
    const parsed = parseEditorPortability(serializeEditorTemplate(source));
    assert.deepEqual(source, before);
    assert.deepEqual(parsed, {
        formatVersion: 1,
        kind: 'editor-template',
        template: source,
    });
    assert.notEqual(parsed.template, source);
    assert.notEqual(parsed.template.plan.phases[0], source.plan.phases[0]);
});

test('individual Execution exports preserve planned, suspended and active snapshot contracts', () => {
    const planned = entry(createPlannedExecution(template(), 'execution-planned'));
    const suspended = suspendedStartedFixture();
    const active = activeFixture();

    const plannedDocument = parseEditorPortability(serializeEditorExecution(planned));
    const suspendedDocument = parseEditorPortability(serializeEditorExecution(suspended));
    const activeDocument = parseEditorPortability(serializeEditorExecution(active.entry, active.activeRuntime));

    assert.deepEqual(plannedDocument.entry, planned);
    assert.equal(plannedDocument.activeRuntime, null);
    assert.deepEqual(suspendedDocument.entry, suspended);
    assert.equal(suspendedDocument.activeRuntime, null);
    assert.deepEqual(activeDocument.entry, active.entry);
    assert.deepEqual(activeDocument.activeRuntime, active.activeRuntime);
    assert.notEqual(activeDocument.entry, active.entry);
    assert.notEqual(activeDocument.activeRuntime, active.activeRuntime);
});

test('individual active exports reject missing, foreign and inconsistent runtime snapshots', () => {
    const active = activeFixture();
    assert.throws(() => serializeEditorExecution(active.entry), /portabilityInvalid/);
    assert.throws(() => serializeEditorExecution(active.entry, {
        ...active.activeRuntime,
        executionId: 'foreign-execution',
    }), /portabilityInvalid/);
    assert.throws(() => serializeEditorExecution(active.entry, {
        ...active.activeRuntime,
        runtimeRevision: active.activeRuntime.runtimeRevision + 1,
    }), /portabilityInvalid/);
    assert.throws(() => serializeEditorExecution(
        entry(createPlannedExecution(template(), 'execution-planned')),
        active.activeRuntime,
    ), /portabilityInvalid/);
});

test('strict parser rejects malformed, unknown, V1, oversized and structurally invalid documents', () => {
    assert.throws(() => parseEditorPortability(''), /portabilityEmpty/);
    assert.throws(() => parseEditorPortability('{broken'), /portabilityJSON/);
    assert.throws(() => parseEditorPortability(JSON.stringify({
        formatVersion: 2, kind: 'editor-template', template: template(),
    })), /portabilityVersion/);
    assert.throws(() => parseEditorPortability(JSON.stringify({
        formatVersion: 1, kind: 'unknown', template: template(),
    })), /portabilityKind/);
    assert.throws(() => parseEditorPortability(JSON.stringify({ schemaVersion: 1, templates: [] })), /portabilityVersion/);
    assert.throws(() => parseEditorPortability(JSON.stringify({
        formatVersion: 1, kind: 'editor-template', template: template(), extra: true,
    })), /portabilityInvalid/);
    assert.throws(() => parseEditorPortability(JSON.stringify({
        formatVersion: 1, kind: 'editor-template',
    })), /portabilityInvalid/);
    assert.throws(() => parseEditorPortability(JSON.stringify({
        formatVersion: 1, kind: 'editor-template', template: { ...template(), revision: -1 },
    })), /portabilityInvalid/);
    assert.throws(() => parseEditorPortability(JSON.stringify({
        formatVersion: 1, kind: 'editor-template', template: { ...template(), id: '' },
    })), /portabilityInvalid/);
    assert.throws(() => parseEditorPortability('x'.repeat(MAX_EDITOR_PORTABILITY_BYTES + 1)), /portabilitySize/);
});

test('serialization rejects output exceeding the shared UTF-8 byte limit without truncation or mutation', () => {
    const source = template();
    source.plan.preparedInformation = 'ä'.repeat(Math.floor(MAX_EDITOR_PORTABILITY_BYTES / 2) + 1);
    const before = structuredClone(source);
    assert.ok(JSON.stringify(source).length < MAX_EDITOR_PORTABILITY_BYTES);
    assert.ok(new TextEncoder().encode(source.plan.preparedInformation).byteLength > MAX_EDITOR_PORTABILITY_BYTES);
    assert.throws(() => serializeEditorTemplate(source), /portabilitySize/);
    assert.deepEqual(source, before);
});

test('native validation rejects duplicate identities, invalid checkpoints and unsupported completed lifecycle', () => {
    const duplicate = completeRecord();
    duplicate.templates[1] = structuredClone(duplicate.templates[0]);
    assert.throws(() => serializeEditorBackup(duplicate), /portabilityInvalid/);

    const suspended = suspendedStartedFixture();
    const invalidCheckpoint = structuredClone(suspended);
    invalidCheckpoint.suspendedCheckpoint.attemptId = 'foreign-attempt';
    assert.throws(() => serializeEditorExecution(invalidCheckpoint), /portabilityInvalid/);

    const completed = entry({
        ...createPlannedExecution(template(), 'execution-completed'),
        lifecycle: 'completed',
    });
    assert.throws(() => serializeEditorExecution(completed), /portabilityInvalid/);
});

test('serialization and parsing are passive and never require storage, locks, ownership or timer actions', () => {
    const source = completeRecord();
    let effects = 0;
    const guarded = new Proxy(source, {
        set() { effects += 1; return false; },
        deleteProperty() { effects += 1; return false; },
    });
    const raw = serializeEditorBackup(guarded);
    const parsed = parseEditorPortability(raw);
    assert.equal(effects, 0);
    assert.deepEqual(parsed.record, source);
    assert.deepEqual(source, completeRecord());
});
