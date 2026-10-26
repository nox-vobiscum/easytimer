import test from 'node:test';
import assert from 'node:assert/strict';
import { createSnapshot, PURPOSE } from '../sync-core/canonical.mjs';
import { buildGraph, analyzeReconciliation, createReconciliation } from '../sync-core/graph.mjs';
import { createDiagnosticReport } from './diagnostics.mjs';

const op=n=>`20000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const library=minutes=>({schemaVersion:1,templates:[
    {id:'original',name:'Synthetic',transitionMode:'manual',phases:[{id:'phase',title:'Phase',durationSeconds:minutes*60}]},
    {id:'copy',name:'Synthetic (1)',transitionMode:'manual',phases:[{id:'copy-phase',title:'Phase',durationSeconds:480}]},
]});
const payload=(n,minutes,parents=[])=>({purpose:PURPOSE,syncFormatVersion:1,libraryId:op(100),operationId:op(n),parents,library:library(minutes),deletedRundownIds:[],restoredRundownIds:[],resolution:null});
async function scenario(){
    const root=await createSnapshot(payload(1,9)),ten=await createSnapshot(payload(2,10,[root.snapshotId])),eleven=await createSnapshot(payload(3,11,[root.snapshotId]));
    const graph=await buildGraph([root,ten,eleven],{complete:true});
    const side=analyzeReconciliation(graph,ten.snapshotId,eleven.snapshotId).leftId===ten.snapshotId?'left':'right';
    const resolved=await createReconciliation(graph,ten.snapshotId,eleven.snapshotId,{operationId:op(4),choices:{original:side}});
    return {nodes:[root,ten,eleven,resolved],ten,resolved};
}

test('stale selected parent creates valid non-conflicting two heads; empty-choice join is semantically correct',async()=>{
    const {nodes,ten,resolved}=await scenario();
    assert.deepEqual(ten.library,resolved.library);
    const twelve=await createSnapshot(payload(5,12,[ten.snapshotId]));
    const graph=await buildGraph([...nodes,twelve],{complete:true});
    assert.equal(graph.status,'validated');assert.deepEqual([...graph.heads].sort(),[resolved.snapshotId,twelve.snapshotId].sort());
    assert(!graph.ancestors(twelve.snapshotId).includes(resolved.snapshotId));
    const analysis=analyzeReconciliation(graph,...graph.heads);
    assert.equal(analysis.status,'proposed');assert.equal(analysis.baseId,ten.snapshotId);assert.equal(analysis.proposal.conflicts.length,0);
    const join=await createReconciliation(graph,...graph.heads,{operationId:op(6),choices:{}});
    assert.deepEqual(join.library,library(12));assert.equal(join.resolution.decisions.length,0);
    assert.deepEqual((await buildGraph([...graph.list(),join],{complete:true})).heads,[join.snapshotId]);
    // The thirteen-minute edit remains local in the application reproducer; it is not a remote node here.
    assert.equal(graph.list().length,5);
});

test('ordinary child of the verified reconciliation consumes that head and cannot yield the observed pair',async()=>{
    const {nodes,resolved}=await scenario();
    const twelve=await createSnapshot(payload(7,12,[resolved.snapshotId]));
    const graph=await buildGraph([...nodes,twelve],{complete:true});
    assert.equal(graph.status,'validated');assert.deepEqual(graph.heads,[twelve.snapshotId]);
    assert(graph.ancestors(twelve.snapshotId).includes(resolved.snapshotId));
});

test('read-only diagnostics no longer mark a supported conflict-free proposal as unsupported',async()=>{
    const {nodes,ten}=await scenario(),twelve=await createSnapshot(payload(8,12,[ten.snapshotId]));
    const graph=await buildGraph([...nodes,twelve],{complete:true});
    const records={library:{localRevision:8,library:twelve.library},metadata:{dirtyRevision:8,syncDirty:false},bindings:{accountKey:'not-exported',base:twelve.snapshotId,heads:[...graph.heads],history:graph.list()},outbox:null};
    const report=await createDiagnosticReport(records,{readState:'read',activated:true,connected:true});
    assert.equal(report.history.reviewStatus,'proposed');assert.equal(report.history.unsupportedReason,null);
    assert.equal(report.history.commonBaseCount,1);assert.equal(report.controller.cachedStatus,'reviewRequired');
});
