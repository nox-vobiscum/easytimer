import test from 'node:test';
import assert from 'node:assert/strict';
import { PURPOSE, canonicalJSON, createSnapshot, verifySnapshot, parseCanonicalSnapshot, snapshotBytes, hashPayload, strictLibrary } from './canonical.mjs';
import { buildGraph, analyzeReconciliation, createReconciliation } from './graph.mjs';
import { compareLibraries, proposeReconciliation, applyChoices, allocateChoices } from './reconcile.mjs';

const libraryId = '00000000-0000-4000-8000-000000000001';
const op = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const template = (id = 'r1', name = 'Example') => ({ id, name, transitionMode: 'manual', phases: [
    { id: id + '-p1', title: 'Opening', durationSeconds: 300 }, { id: id + '-p2', title: 'Closing', durationSeconds: 600 }] });
const state = (templates = [template()], deletedRundownIds = []) => ({ library: { schemaVersion: 1, templates }, deletedRundownIds });
const payload = (n = 1, data = state(), parents = []) => ({ purpose: PURPOSE, syncFormatVersion: 1, libraryId, operationId: op(n),
    parents, ...data, restoredRundownIds: [], resolution: null });
const root = (n = 1, data = state()) => createSnapshot(payload(n, data));
const child = (parent, n, data = state(parent.library.templates, parent.deletedRundownIds), extra = {}) =>
    createSnapshot({ ...payload(n, data, [parent.snapshotId]), ...extra });
const graph = nodes => buildGraph(nodes, { complete: true });
const edited = (name = 'Edited') => ({ ...template(), name });

test('canonical vectors: sorted keys, UTF-8, escapes, integer decimal and object order independence', async () => {
    assert.equal(canonicalJSON({ z: 60, a: 'ä\n"\\😀' }), '{"a":"ä\\n\\"\\\\😀","z":60}');
    assert.equal(Buffer.from(new TextEncoder().encode(canonicalJSON({ a: 'ä' }))).toString('hex'), '7b2261223a22c3a4227d');
    const a = await root(), b = await createSnapshot(Object.fromEntries(Object.entries(payload()).reverse()));
    assert.equal(a.snapshotId, b.snapshotId);
    assert.equal(a.snapshotId, 'sha256:dde988c4232c90f38d6afec4a8bc49e494b8f278495a5ca80b3f3084a856e6ef');
    assert.deepEqual(await verifySnapshot(b), a);
    assert.equal(a.snapshotId, await hashPayload(payload()));
});
test('phase order, Unicode composition, numeric content and operation identity affect identity', async () => {
    const normal = await root();
    const reordered = template(); reordered.phases.reverse();
    assert.notEqual((await root(1, state([reordered]))).snapshotId, normal.snapshotId);
    assert.notEqual((await root(1, state([template('r1', 'é')]))).snapshotId, (await root(1, state([template('r1', 'e\u0301')]))).snapshotId);
    const numeric = template(); numeric.phases[0].durationSeconds += 60;
    assert.notEqual((await root(1, state([numeric]))).snapshotId, normal.snapshotId);
    assert.notEqual((await root(2)).snapshotId, normal.snapshotId);
});
test('reject malformed numbers, Unicode, cycles, accessors, sparse arrays and transport metadata', async () => {
    for (const value of [NaN, Infinity, -0, 1.5, undefined, BigInt(2)]) assert.throws(() => canonicalJSON(value));
    for (const text of ['\ud800', '\udc00']) assert.throws(() => canonicalJSON(text), /INVALID_UNICODE/);
    const cycle = {}; cycle.self = cycle; assert.throws(() => canonicalJSON(cycle), /CYCLIC_OBJECT/);
    assert.throws(() => canonicalJSON(Object.defineProperty({}, 'x', { enumerable: true, get() { throw Error('getter invoked'); } })), /ACCESSOR/);
    assert.throws(() => canonicalJSON(new Array(2)), /INVALID_ARRAY/);
    await assert.rejects(createSnapshot({ ...payload(), driveFileId: 'transport-only' }), /UNKNOWN_OR_MISSING_FIELD/);
    await assert.rejects(createSnapshot({ ...payload(), libraryId: 'not-a-uuid' }), /INVALID_UUID/);
});
test('wire parser rejects repeated keys, noncanonical encoding, unknown fields and hash mismatches', async () => {
    const node = await root(), text = new TextDecoder().decode(snapshotBytes(node));
    assert.deepEqual(await parseCanonicalSnapshot(text), node);
    await assert.rejects(parseCanonicalSnapshot(text.replace('{', '{"purpose":"discarded",')), /NON_CANONICAL_BYTES/);
    await assert.rejects(parseCanonicalSnapshot(text + '\n'), /NON_CANONICAL_BYTES/);
    await assert.rejects(parseCanonicalSnapshot('{'), /INVALID_JSON/);
    await assert.rejects(verifySnapshot({ ...node, operationId: op(3) }), /HASH_MISMATCH/);
});
test('parent IDs and tombstones are sorted sets, duplicate entries rejected; visible text never trimmed', async () => {
    const a = await root(), b = await child(a, 2);
    const mergePayload = { ...payload(3, state([], ['b', 'a']), [a.snapshotId, b.snapshotId]), resolution: { base: a.snapshotId, decisions: [] } };
    assert.equal((await createSnapshot(mergePayload)).snapshotId, (await createSnapshot({ ...mergePayload, parents: [...mergePayload.parents].reverse(), deletedRundownIds: ['a', 'b'] })).snapshotId);
    await assert.rejects(createSnapshot({ ...payload(), deletedRundownIds: ['x', 'x'] }), /DUPLICATE_SET/);
    await assert.rejects(createSnapshot({ ...payload(), parents: [a.snapshotId, a.snapshotId] }), /DUPLICATE_SET/);
    assert.throws(() => strictLibrary(state([template('r1', ' padded ')]).library), /LIBRARY_WOULD_CHANGE/);
});
test('existing schema validation reused for duplicate IDs, unknown versions, invalid and large durations', async () => {
    await assert.rejects(root(1, { library: { schemaVersion: 2, templates: [] }, deletedRundownIds: [] }), /invalidData/);
    await assert.rejects(root(1, state([template(), template()])), /invalidData/);
    for (const seconds of [0, 61, 360060]) { const t = template(); t.phases[0].durationSeconds = seconds; await assert.rejects(root(1, state([t])), /duration/); }
    const t = template(); t.phases[0].durationSeconds = 360000; await root(1, state([t]));
    const tooLong = template(); tooLong.phases = Array.from({ length: 11 }, (_, i) => ({ id: String(i), title: '100 hours', durationSeconds: 360000 }));
    await assert.rejects(root(1, state([tooLong])), /totalLimit/);
});
test('linear graph, duplicates and graph return values preserve source isolation', async () => {
    const a = await root(), b = await child(a, 2), c = await child(b, 3);
    const g = await graph([c, a, b, a]);
    assert.deepEqual(g.heads, [c.snapshotId]); assert.equal(g.ancestors(c.snapshotId).length, 3);
    assert.deepEqual(g.commonBases(b.snapshotId, c.snapshotId), [b.snapshotId]);
    const copy = g.get(a.snapshotId); copy.library.templates[0].name = 'tampered';
    assert.equal(g.get(a.snapshotId).library.templates[0].name, 'Example');
});
test('partial history, missing ancestors and multiple roots never authorize merging', async () => {
    const a = await root(), b = await child(a, 2), c = await root(3, state([template('other')]));
    const partial = await buildGraph([a, b]); assert.equal(partial.status, 'blocked');
    assert.equal(analyzeReconciliation(partial, a.snapshotId, b.snapshotId).reason, 'HISTORY_BLOCKED');
    const missing = await graph([b]); assert(missing.issues.includes('MISSING_ANCESTOR'));
    const separate = await graph([a, c]); assert.equal(separate.roots.length, 2);
    assert.equal(analyzeReconciliation(separate, a.snapshotId, c.snapshotId).reason, 'NO_COMMON_ANCESTOR');
});
test('malformed cycles, conflicting snapshot IDs, operation IDs and library IDs are rejected', async () => {
    const a = await root(), b = await root(2);
    await assert.rejects(graph([{ ...a, parents: [a.snapshotId] }]), /CYCLIC_HISTORY/);
    await assert.rejects(graph([a, { ...a, library: state([]).library }]), /SNAPSHOT_COLLISION/);
    const sameOp = await root(1, state([edited()])); await assert.rejects(graph([a, sameOp]), /OPERATION_COLLISION/);
    const foreign = await createSnapshot({ ...payload(3), libraryId: op(99) }); await assert.rejects(graph([a, foreign]), /LIBRARY_MISMATCH/);
    await assert.rejects(graph([{ ...b, snapshotId: a.snapshotId }]), /HASH_MISMATCH/);
});
test('semantic comparisons identify rename, phase reorder/content, additions and explicit deletion', () => {
    const t = edited(); t.phases.reverse(); t.phases[0].title = 'Changed';
    const changes = compareLibraries(state(), state([t, template('new')])).find(row => row.id === 'r1').changes;
    assert.deepEqual(changes, ['renamed', 'phase-order-or-membership', 'phase-content']);
    assert.deepEqual(compareLibraries(state(), state([], ['r1']))[0].changes, ['deleted']);
    assert.deepEqual(compareLibraries(state([]), state([template()]))[0].changes, ['added']);
});
test('independent edits/additions and different deletions yield nonconflicting full validated combinations', async () => {
    const initial = state([template('r1'), template('r2')]);
    const p = proposeReconciliation(initial, state([template('r1', 'Left edit'), template('r2'), template('a', 'Same name')]), state([template('r1'), template('r2', 'Right edit'), template('b', 'Same name')]));
    assert.equal(p.conflicts.length, 0);
    const combined = applyChoices(p);
    assert.deepEqual(combined.library.templates.map(t => t.name), ['Left edit', 'Right edit', 'Same name', 'Same name']);
    const deletes = applyChoices(proposeReconciliation(initial, state([template('r2')], ['r1']), state([template('r1')], ['r2'])));
    assert.deepEqual(deletes.deletedRundownIds, ['r1', 'r2']); assert.equal(deletes.library.templates.length, 0);
});
test('same-ID competing field edits never silently merge; sources remain intact', () => {
    const left = edited('Left'), right = template(); right.phases[0].durationSeconds = 900;
    const a = state([left]), b = state([right]), before = canonicalJSON([a, b]);
    const p = proposeReconciliation(state(), a, b);
    assert.equal(p.conflicts[0].conflict, 'concurrent-content'); assert.throws(() => applyChoices(p), /UNRESOLVED_CONFLICT/);
    const decision = [{ id: 'r1', choice: 'right', copy: null }];
    assert.deepEqual(applyChoices(p, decision).library.templates, [right]); assert.equal(canonicalJSON([a, b]), before);
});
test('keep both allocates independent Rundown/phase IDs; collisions and missing choices fail', () => {
    const p = proposeReconciliation(state(), state([edited('Left')]), state([edited('Right')])); let n = 0;
    const choices = allocateChoices(p, { r1: 'both' }, () => `new-${++n}`), merged = applyChoices(p, choices);
    assert.equal(merged.library.templates.length, 2);
    assert.equal(merged.library.templates[0].id, 'r1'); assert.equal(merged.library.templates[1].id, 'new-1');
    assert.deepEqual(merged.library.templates[1].phases.map(p => p.id), ['new-2', 'new-3']);
    assert.throws(() => applyChoices(p, [{ id: 'r1', choice: 'both', copy: { id: 'r1', phaseIds: ['x', 'y'] } }]), /COPY_ID_COLLISION/);
    assert.throws(() => allocateChoices(p, {}, () => 'x'), /UNRESOLVED_CONFLICT/);
});
test('delete versus unchanged is safe; rename/offline edits versus deletion preserve a conflict', async () => {
    const base = await root(), deletion = await child(base, 2, state([], ['r1']));
    const unchanged = await child(base, 3), renamed = await child(base, 4, state([edited('Rename')]));
    const g = await graph([base, deletion, unchanged, renamed]);
    const safe = analyzeReconciliation(g, deletion.snapshotId, unchanged.snapshotId);
    assert.equal(safe.proposal.conflicts.length, 0); assert.deepEqual(applyChoices(safe.proposal).deletedRundownIds, ['r1']);
    const conflict = analyzeReconciliation(g, deletion.snapshotId, renamed.snapshotId);
    assert.equal(conflict.proposal.conflicts[0].conflict, 'delete-versus-edit');
    let n = 0;
    const both = applyChoices(conflict.proposal, allocateChoices(conflict.proposal, { r1: 'both' }, () => `copy-${++n}`));
    assert.deepEqual(both.deletedRundownIds, ['r1']); assert.equal(both.library.templates[0].id, 'copy-1');
});
test('missing tombstones, silent restoration and lost tombstones are invalid transitions', async () => {
    const a = await root(), deleted = await child(a, 2, state([], ['r1']));
    await assert.rejects(graph([a, await child(a, 3, state([]))]), /MISSING_TOMBSTONE/);
    await assert.rejects(graph([a, deleted, await child(deleted, 4, state())]), /UNACKNOWLEDGED_RESTORATION/);
    await assert.rejects(graph([a, deleted, await child(deleted, 5, state([]))]), /UNACKNOWLEDGED_RESTORATION/);
    const restored = await child(deleted, 6, state(), { restoredRundownIds: ['r1'] }); await graph([a, deleted, restored]);
    const keptDeleted = await child(deleted, 7, state([], ['r1']));
    const p = analyzeReconciliation(await graph([a, deleted, restored, keptDeleted]), restored.snapshotId, keptDeleted.snapshotId);
    assert.equal(p.proposal.conflicts[0].conflict, 'restoration-review');
});
test('two-parent labels with discarded content are not semantic reconciliation', async () => {
    const a = await root(1, state([template('r1'), template('r2')]));
    const left = await child(a, 2, state([template('r1', 'Changed A'), template('r2')]));
    const right = await child(a, 3, state([template('r1'), template('r2', 'Changed B')]));
    const g = await graph([a, left, right]);
    const merged = await createReconciliation(g, left.snapshotId, right.snapshotId, { operationId: op(4) });
    await graph([a, left, right, merged]);
    const { snapshotId, ...forged } = merged; forged.library = state([template('r1'), template('r2')]).library;
    await assert.rejects(graph([a, left, right, await createSnapshot(forged)]), /NOT_A_SEMANTIC_RECONCILIATION/);
});
test('actual six-snapshot SYNC-001 topology reproduced with a real semantic merge and late third branch', async () => {
    const a = await root(), ack = await child(a, 2);
    const left = await child(ack, 3, state([edited('A')])), right = await child(ack, 4, state([edited('B')]));
    const four = await graph([a, ack, left, right]); assert.equal(four.list().length, 4); assert.equal(four.heads.length, 2);
    const merged = await createReconciliation(four, left.snapshotId, right.snapshotId, { operationId: op(5), choices: { r1: 'left' } });
    const five = await graph([a, ack, left, right, merged]); assert.equal(five.list().length, 5); assert.deepEqual(five.heads, [merged.snapshotId]);
    const late = await child(ack, 6, state([edited('late C')]));
    const six = await graph([late, merged, right, left, ack, a]); assert.equal(six.list().length, 6); assert.equal(six.heads.length, 2);
    assert(six.heads.includes(late.snapshotId)); assert.deepEqual(six.commonBases(merged.snapshotId, late.snapshotId), [ack.snapshotId]);
});
test('explicit content choices are recorded and recomputed for multi-parent snapshots', async () => {
    const base = await root(), a = await child(base, 2, state([edited('A')])), b = await child(base, 3, state([edited('B')]));
    const g = await graph([base, a, b]); let next = 0;
    const merged = await createReconciliation(g, a.snapshotId, b.snapshotId, { operationId: op(4), choices: { r1: 'both' }, createId: () => `fresh-${++next}` });
    const verified = await graph([base, a, b, merged]); assert.equal(verified.get(merged.snapshotId).library.templates.length, 2);
    const { snapshotId, ...bad } = merged; bad.resolution.decisions[0].choice = 'left'; bad.resolution.decisions[0].copy = null;
    await assert.rejects(graph([base, a, b, await createSnapshot(bad)]), /NOT_A_SEMANTIC_RECONCILIATION/);
});
test('library ordering policy is conservative and caller-edited proposals cannot bypass conflicts', () => {
    const base = state([template('a'), template('b')]);
    const p = proposeReconciliation(base, state([template('b'), template('a')]), base);
    assert.equal(p.blocked, 'LIBRARY_ORDER_POLICY_PENDING'); assert.throws(() => applyChoices(p), /LIBRARY_ORDER_POLICY_PENDING/);
    const conflict = proposeReconciliation(state(), state([edited('A')]), state([edited('B')]));
    conflict.conflicts = []; conflict.rows[0].proposed = conflict.rows[0].left;
    assert.throws(() => applyChoices(conflict), /UNRESOLVED_CONFLICT/);
});
test('restore to original content versus a parallel deletion remains a historical conflict', async () => {
    const base = await root(), deleted = await child(base, 2, state([], ['r1']));
    const restored = await child(deleted, 3, state(), { restoredRundownIds: ['r1'] });
    const parallelDeletion = await child(base, 4, state([], ['r1']));
    const g = await graph([base, deleted, restored, parallelDeletion]);
    const analysis = analyzeReconciliation(g, restored.snapshotId, parallelDeletion.snapshotId);
    assert.equal(analysis.status, 'conflict'); assert.equal(analysis.proposal.conflicts[0].conflict, 'restoration-review');
    await assert.rejects(createReconciliation(g, restored.snapshotId, parallelDeletion.snapshotId, { operationId: op(5) }), /UNRESOLVED_CONFLICT/);
    const chooseRestored = analysis.leftId === restored.snapshotId ? 'left' : 'right';
    const merged = await createReconciliation(g, restored.snapshotId, parallelDeletion.snapshotId, { operationId: op(6), choices: { r1: chooseRestored } });
    await graph([base, deleted, restored, parallelDeletion, merged]);
    assert.equal(merged.library.templates.length, 1);
});
test('criss-cross common bases are ambiguous and never guessed', async () => {
    const base = await root(), a = await child(base, 2, state([edited('A')])), b = await child(base, 3, state([edited('B')]));
    const g = await graph([base, a, b]);
    const first = await createReconciliation(g, a.snapshotId, b.snapshotId, { operationId: op(4), choices: { r1: 'left' } });
    const second = await createReconciliation(g, a.snapshotId, b.snapshotId, { operationId: op(5), choices: { r1: 'right' } });
    const both = await graph([base, a, b, first, second]);
    assert.equal(both.commonBases(first.snapshotId, second.snapshotId).length, 2);
    assert.equal(analyzeReconciliation(both, first.snapshotId, second.snapshotId).reason, 'AMBIGUOUS_BASE');
});
test('identical deletions, independent additions and unordered-set duplicate observations preserve identity', async () => {
    const base = await root(), a = await child(base, 2, state([], ['r1'])), b = await child(base, 3, state([], ['r1']));
    const g = await graph([base, a, b]);
    const merged = await createReconciliation(g, a.snapshotId, b.snapshotId, { operationId: op(4) });
    const duplicate = { ...merged, parents: [...merged.parents].reverse() };
    assert.equal((await graph([base, a, b, merged, duplicate])).list().length, 4);
    assert.deepEqual(merged.deletedRundownIds, ['r1']);
    const addition = proposeReconciliation(state([]), state([template('a', 'Same')]), state([template('b', 'Same')]));
    assert.equal(applyChoices(addition).library.templates.length, 2);
});
test('root restore events, live tombstones, extra decisions and unsupported parent fan-in fail closed', async () => {
    await assert.rejects(createSnapshot({ ...payload(), deletedRundownIds: ['r1'] }), /LIVE_AND_DELETED/);
    await assert.rejects(graph([await createSnapshot({ ...payload(), restoredRundownIds: ['r1'] })]), /INVALID_RESTORATION/);
    const a = await root();
    await assert.rejects(createSnapshot({ ...payload(), parents: [a.snapshotId, 'sha256:' + 'a'.repeat(64), 'sha256:' + 'b'.repeat(64)] }), /UNSUPPORTED_PARENT_COUNT/);
    const p = proposeReconciliation(state(), state(), state());
    assert.throws(() => allocateChoices(p, { fake: 'left' }, () => 'new'), /UNEXPECTED_DECISION/);
    await assert.rejects(createSnapshot({ ...payload(), syncFormatVersion: 2 }), /UNSUPPORTED_SYNC_VERSION/);
    await assert.rejects(createSnapshot({ ...payload(), ...JSON.parse('{"__proto__":{"polluted":true}}') }), /UNKNOWN_OR_MISSING_FIELD/);
    assert.equal({}.polluted, undefined);
});
test('valid stable IDs matching JavaScript property names are identities, not object prototype operations', () => {
    const base = state([template('__proto__')]), left = state([template('__proto__', 'A')]), right = state([template('__proto__', 'B')]);
    const p = proposeReconciliation(base, left, right);
    const decisions = allocateChoices(p, JSON.parse('{"__proto__":"left"}'), () => 'new');
    assert.equal(applyChoices(p, decisions).library.templates[0].name, 'A');
    assert.equal({}.polluted, undefined);
});
