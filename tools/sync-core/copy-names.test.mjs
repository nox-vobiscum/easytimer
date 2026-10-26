import test from 'node:test';
import assert from 'node:assert/strict';
import { numberedCopyName } from './reconcile.mjs';
import { canonicalJSON, PURPOSE, createSnapshot, parseCanonicalSnapshot } from './canonical.mjs';
import { buildGraph, createReconciliation } from './graph.mjs';

test('numbered copies handle suffixes, NFC/case collisions and Unicode within the 120-unit name limit', () => {
    assert.equal(numberedCopyName('Sprint Planning', ['Sprint Planning (1)', 'sprint planning (2)']), 'Sprint Planning (3)');
    assert.equal(numberedCopyName('Sprint Planning (2)', ['Sprint Planning (1)', 'Sprint Planning (2)']), 'Sprint Planning (3)');
    assert.equal(numberedCopyName('Café', ['CAFE\u0301 (1)']), 'Café (2)');
    const long = numberedCopyName('😀'.repeat(60), []);
    assert(long.length <= 120 && long.endsWith(' (1)'));
    assert.doesNotThrow(() => canonicalJSON(long));
});

async function fixture() {
    const library = { schemaVersion: 1, templates: [{ id: 'r', name: 'Plan', transitionMode: 'manual', phases: [{ id: 'p', title: 'Phase', durationSeconds: 300 }] }] };
    const payload = { purpose: PURPOSE, syncFormatVersion: 1, libraryId: '00000000-0000-4000-8000-000000000001', operationId: crypto.randomUUID(), parents: [], library, deletedRundownIds: [], restoredRundownIds: [], resolution: null };
    const root = await createSnapshot(payload);
    const child = async seconds => { const library = structuredClone(payload.library); library.templates[0].phases[0].durationSeconds = seconds; return createSnapshot({ ...payload, operationId: crypto.randomUUID(), parents: [root.snapshotId], library }); };
    const a = await child(420), b = await child(540), nodes = [root, a, b];
    return { nodes, a, b, graph: await buildGraph(nodes, {complete:true}) };
}

test('numbered copy name is canonical, hash-covered and semantically recomputed', async () => {
    const {nodes,a,b,graph}=await fixture();
    const merged=await createReconciliation(graph,a.snapshotId,b.snapshotId,{operationId:crypto.randomUUID(),choices:{r:'both'},numberedCopies:true});
    assert.equal(merged.library.templates[1].name,'Plan (1)');
    assert.equal(merged.resolution.decisions[0].copy.name,'Plan (1)');
    assert.equal((await buildGraph([...nodes,merged],{complete:true})).status,'validated');
    assert.deepEqual(await parseCanonicalSnapshot(canonicalJSON(merged)),merged);
    const {snapshotId,...payload}=structuredClone(merged);
    payload.resolution.decisions[0].copy.name='Arbitrary rename';payload.library.templates[1].name='Arbitrary rename';
    const forged=await createSnapshot(payload);
    await assert.rejects(buildGraph([...nodes,forged],{complete:true}),/INVALID_COPY_NAME/);
});

test('old unnumbered reconciliation remains valid; optional naming does not weaken exact field validation',async()=>{
    const {nodes,a,b,graph}=await fixture();
    const old=await createReconciliation(graph,a.snapshotId,b.snapshotId,{operationId:crypto.randomUUID(),choices:{r:'both'}});
    assert.equal(old.library.templates[1].name,'Plan');
    assert.equal((await buildGraph([...nodes,old],{complete:true})).status,'validated');
    const {snapshotId,...payload}=structuredClone(old);payload.resolution.decisions[0].copy.unapproved='x';
    await assert.rejects(createSnapshot(payload),/UNKNOWN_OR_MISSING_FIELD/);
});

test('A/B mapping is ascending immutable snapshot identity independent of argument or discovery order',async()=>{
    const {a,b,graph}=await fixture(), operationId=crypto.randomUUID();
    const x=await createReconciliation(graph,a.snapshotId,b.snapshotId,{operationId,choices:{r:'left'}});
    const y=await createReconciliation(graph,b.snapshotId,a.snapshotId,{operationId,choices:{r:'left'}});
    assert.equal(x.snapshotId,y.snapshotId);
    assert.deepEqual(x.library,graph.get([a.snapshotId,b.snapshotId].sort()[0]).library);
});
