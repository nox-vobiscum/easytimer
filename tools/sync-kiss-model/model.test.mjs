import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalJSON } from '../sync-core/canonical.mjs';
import { createModel, ticket, numberedName } from './model.mjs';
const item = (id = 'synthetic-rundown', name = 'Sprint Planning', title = 'Synthetic opening') => ({ id, name, transitionMode: 'manual',
    phases: [{ id: id + '-phase', title, durationSeconds: 600 }] });
const seed = (...items) => ({ schemaVersion: 1, templates: items.length ? items : [item()] });
const update = (op, base, template = item()) => ticket(op, { kind: 'upsert', id: template.id, base, template });
const initial = 'root:synthetic-rundown';
function alternatives(model) {
    const a = update('A', initial, item(undefined, undefined, 'Synthetic edit 2'));
    const b = update('B', initial, item(undefined, undefined, 'Synthetic edit 3'));
    model.publish(a); model.publish(b); return [a, b];
}
function resolution(model, op = 'M', choice = 'A') {
    const reviewed = model.view().conflicts[0].variants.sort((a, b) => a.token < b.token ? -1 : 1);
    // Self-contained review values preserve the user's candidate even if its source payloads disappear.
    return ticket(op, { kind: 'resolve', id: 'synthetic-rundown', choice, variants: reviewed.map(v => v.token), reviewed });
}
function settled(choice = 'A') {
    const model = createModel(seed()), [a, b] = alternatives(model), decision = resolution(model, 'M', choice);
    model.publish(decision); model.checkpoint('checkpoint-settled'); model.cleanup('checkpoint-settled');
    return { model, a, b, decision };
}
function permutations(items) {
    return items.length ? items.flatMap((value, i) => permutations(items.filter((_, j) => j !== i)).map(rest => [value, ...rest])) : [[]];
}

test('1 ordinary sync: independent edits and dependent deliveries converge; tickets remain immutable', () => {
    const a = update('A', initial, item(undefined, undefined, 'Changed opening'));
    const b = update('B', null, item('other-rundown', 'Independent workshop'));
    const c = update('C', 'op:A', item(undefined, undefined, 'Following edit'));
    let expected;
    for (const order of permutations([a, b, c])) {
        const model = createModel(seed()); order.forEach(t => model.publish(t));
        const current = model.view(); assert.equal(current.status, 'current');
        const bytes = canonicalJSON(current); expected ??= bytes; assert.equal(bytes, expected);
        const before = a.bytes; model.publish(a); assert.equal(a.bytes, before); assert.equal(canonicalJSON(model.view()), expected);
        model.checkpoint('checkpoint-current'); model.cleanup('checkpoint-current');
        assert.equal(model.files.size, 1); assert.equal(canonicalJSON(model.view()), expected);
    }
});

test('2 explicit A/B/both: preserve independent data; validate content and fresh copy identities', () => {
    for (const choice of ['A', 'B', 'both']) {
        const source = createModel(seed(item(), item('unrelated', 'Unrelated'))), [a, b] = alternatives(source);
        const independent = update('C', 'root:unrelated', item('unrelated', 'Unrelated edited'));
        const decision = resolution(source, 'M', choice); let expected;
        for (const order of permutations([a, b, independent, decision])) {
            const model = createModel(seed(item(), item('unrelated', 'Unrelated'))); order.forEach(t => model.publish(t));
            const result = model.view(); assert.equal(result.status, 'current');
            const original = result.library.templates.find(t => t.id === 'synthetic-rundown');
            assert.equal(original.phases[0].title, choice === 'B' ? 'Synthetic edit 3' : 'Synthetic edit 2');
            assert.equal(result.library.templates.find(t => t.id === 'unrelated').name, 'Unrelated edited');
            if (choice === 'both') {
                const copy = result.library.templates.find(t => t.id.startsWith('copy-'));
                assert.equal(copy.name, 'Sprint Planning (1)'); assert.notEqual(copy.id, original.id);
                assert.notEqual(copy.phases[0].id, original.phases[0].id); assert.equal(copy.phases[0].title, 'Synthetic edit 3');
            }
            const bytes = canonicalJSON(result); expected ??= bytes; assert.equal(bytes, expected);
        }
        const unresolved = createModel(seed()); [a, b].forEach(t => unresolved.publish(t));
        assert.equal(unresolved.view().status, 'conflict'); // No automatic winner.
    }
});

test('3 stale offline edit after resolution/compaction creates one numbered copy; consumed versions do not reopen', () => {
    const { model, a, b, decision } = settled();
    assert.deepEqual([...model.files.keys()], ['checkpoint-settled']);
    const stale = update('late', initial, item(undefined, undefined, 'Weeks-late offline edit'));
    model.publish(stale); let current = model.view(); assert.equal(current.status, 'current');
    assert.equal(current.library.templates.length, 2);
    const original = current.library.templates.find(t => t.id === 'synthetic-rundown');
    const copy = current.library.templates.find(t => t.id.startsWith('copy-'));
    assert.equal(original.phases[0].title, 'Synthetic edit 2'); assert.equal(copy.name, 'Sprint Planning (1)');
    const expected = canonicalJSON(current); [b, a, decision, stale].forEach(t => model.publish(t));
    assert.equal(canonicalJSON(model.view()), expected);
    model.checkpoint('checkpoint-late'); model.cleanup('checkpoint-late'); model.publish(stale);
    assert.equal(canonicalJSON(model.view()), expected); assert.equal(model.view().conflicts.length, 0);
});

test('4 lost acknowledgement: receipt recovery after payload removal uses same ticket; unknown work stays pending', () => {
    const model = createModel(seed()), entry = update('A', initial, item(undefined, undefined, 'Durable payload'));
    const bytes = entry.bytes, id = entry.fileId;
    assert.throws(() => model.publish(entry, { loseAcknowledgement: true }), /SIMULATED_LOST_ACK/);
    model.checkpoint('checkpoint-covered'); model.cleanup('checkpoint-covered');
    assert.equal(model.files.has(id), false);
    assert.deepEqual(model.recover(entry), { status: 'covered', exactFilePresent: false });
    assert.equal(entry.bytes, bytes); assert.equal(entry.fileId, id);
    const unseen = update('unseen', 'op:A'); assert.deepEqual(model.recover(unseen), { status: 'pending' });
    model.publish(entry); assert.equal(model.view().library.templates.length, 1);
    model.cleanup('checkpoint-covered'); assert.equal(model.files.size, 1);
    const changed = update('A', initial, item(undefined, 'Different bytes'));
    assert.throws(() => model.recover(changed), /OPERATION_COLLISION/);
});

test('5 concurrent equivalent checkpoints can compact without deleting an uncovered late operation', () => {
    const model = createModel(seed()), a = update('A', initial); model.publish(a);
    const inputs = [...model.files.keys()]; model.checkpoint('checkpoint-1', inputs); model.checkpoint('checkpoint-2', inputs);
    const late = update('late', null, item('late-rundown', 'Late addition')); model.publish(late);
    const before = canonicalJSON(model.view()); const removed = model.cleanup('checkpoint-1');
    assert(!removed.includes(late.fileId)); assert(model.files.has(late.fileId)); assert.equal(canonicalJSON(model.view()), before);
    model.checkpoint('checkpoint-all'); model.cleanup('checkpoint-all'); assert.equal(model.files.size, 1);
    assert.equal(canonicalJSON(model.view()), before);
});

test('5 counterexample: incomparable checkpoints block; receipt union alone cannot merge their current content', () => {
    const model = createModel(seed()); const root = 'checkpoint-root';
    const a = update('A', initial, item(undefined, undefined, 'A current value'));
    const b = update('B', initial, item(undefined, undefined, 'B current value'));
    model.publish(a); model.publish(b);
    model.checkpoint('checkpoint-A', [root, a.fileId]); model.checkpoint('checkpoint-B', [root, b.fileId]);
    // Model separate compactors deleting only their own covered inputs, before discovering each other's checkpoint.
    model.files.delete(a.fileId); model.files.delete(b.fileId); model.files.delete(root);
    const retained = canonicalJSON([...model.files]);
    assert.deepEqual(model.view(), { status: 'blocked', reason: 'INCOMPARABLE_CHECKPOINTS' });
    assert.throws(() => model.cleanup('checkpoint-A'), /INCOMPARABLE_CHECKPOINTS/);
    assert.equal(canonicalJSON([...model.files]), retained);
    assert(model.files.get('checkpoint-A').state.items['synthetic-rundown'][0].template.phases[0].title.includes('A'));
    assert(model.files.get('checkpoint-B').state.items['synthetic-rundown'][0].template.phases[0].title.includes('B'));
});

test('6 contradictory decisions always block without deleting either self-contained candidate', () => {
    const source = createModel(seed()), [a, b] = alternatives(source);
    const first = resolution(source, 'M1', 'A'), second = resolution(source, 'M2', 'B');
    for (const order of permutations([a, b, first, second])) {
        const model = createModel(seed()); order.forEach(t => model.publish(t));
        assert.deepEqual(model.view(), { status: 'blocked', reason: 'CONTRADICTORY_RESOLUTION' });
        const before = canonicalJSON([...model.files]); assert.throws(() => model.checkpoint('unsafe'), /CONTRADICTORY_RESOLUTION/);
        assert.equal(canonicalJSON([...model.files]), before);
    }
    const { model } = settled(); model.publish(second);
    assert.equal(model.view().reason, 'CONTRADICTORY_RESOLUTION'); assert(model.files.has(second.fileId));
    assert(second.bytes.includes('Synthetic edit 3')); // Even with originals compacted, candidate data survives.
});

test('7 copy naming races: suffixes converge; explicit names and upload bytes stay unchanged', () => {
    const { model } = settled();
    model.publish(update('existing-name', null, item('manual-name', 'Sprint Planning (1)')));
    model.checkpoint('checkpoint-names'); model.cleanup('checkpoint-names');
    const a = update('late-A', initial, item(undefined, undefined, 'Late A'));
    const b = update('late-B', initial, item(undefined, undefined, 'Late B'));
    const files = [...model.files], bytes = [a.bytes, b.bytes]; let expected;
    for (const order of permutations([a, b])) {
        const current = createModel(seed()); current.files.clear(); files.forEach(([id, value]) => current.files.set(id, structuredClone(value)));
        order.forEach(t => current.publish(t)); const result = current.view(); assert.equal(result.status, 'current');
        const copies = result.library.templates.filter(t => t.id.startsWith('copy-'));
        assert.deepEqual(copies.map(t => t.name).sort(), ['Sprint Planning (2)', 'Sprint Planning (3)']);
        assert.equal(new Set(copies.flatMap(t => [t.id, ...t.phases.map(p => p.id)])).size, 4);
        expected ??= canonicalJSON(result); assert.equal(canonicalJSON(result), expected);
        order.forEach(t => current.publish(t)); assert.equal(canonicalJSON(current.view()), expected);
    }
    assert.deepEqual([a.bytes, b.bytes], bytes);
    const occupied = new Set(['sprint planning (1)']); assert.equal(numberedName('SPRINT PLANNING', occupied), 'SPRINT PLANNING (2)');
    for (const base of ['x'.repeat(120), '😀'.repeat(60), 'x'.repeat(115) + '😀']) {
        const name = numberedName(base, new Set()); assert(name.length <= 120); assert(name.endsWith(' (1)'));
        assert.equal(/\p{Surrogate}/u.test(name), false); assert.notEqual(name, base);
    }
});

test('8 missing/invalid checkpoint, unknown base and uncovered data fail closed', () => {
    const model = createModel(seed()), unseen = update('unseen', 'op:missing'); model.publish(unseen);
    assert.equal(model.view().reason, 'UNKNOWN_BASE');
    const before = canonicalJSON([...model.files]); assert.throws(() => model.cleanup('checkpoint-root'), /UNKNOWN_BASE/);
    assert.equal(canonicalJSON([...model.files]), before);
    const broken = createModel(seed()); broken.files.get('checkpoint-root').hash = 'corrupt'; assert.equal(broken.view().reason, 'INVALID_CHECKPOINT');
    assert.equal(createModel(seed()).view([]).reason, 'NO_CHECKPOINT');
});

test('9 compaction removes obsolete payloads but exact recovery receipts still grow with operations', () => {
    const model = createModel(seed()); let base = initial;
    for (let n = 1; n <= 40; n++) {
        const op = 'step-' + String(n).padStart(2, '0');
        model.publish(update(op, base, item(undefined, undefined, 'Synthetic payload ' + n))); base = 'op:' + op;
        const keeper = 'checkpoint-' + n; model.checkpoint(keeper); model.cleanup(keeper);
    }
    assert.equal(model.files.size, 1);
    const state = model.view().state;
    assert.equal(Object.keys(state.receipts).length, 40);
    assert.equal(state.items['synthetic-rundown'][0].template.phases[0].title, 'Synthetic payload 40');
    assert(!canonicalJSON(state).includes('Synthetic payload 39'));
    const stale = update('old-unclosed-base', 'op:step-01', item(undefined, undefined, 'Unknown-context edit'));
    model.publish(stale); assert.equal(model.view().reason, 'UNKNOWN_BASE'); // No historical reconstruction is hidden here.
    assert(model.files.has(stale.fileId));
});
