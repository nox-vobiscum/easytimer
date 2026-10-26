import test from 'node:test';
import assert from 'node:assert/strict';
import { createDiagnosticReport } from './diagnostics.mjs';
import { createApplicationSync } from './controller.mjs';
import { canonicalJSON, createSnapshot, PURPOSE } from '../sync-core/canonical.mjs';

test('no existing connection: diagnostics opens no database, writes nothing and never calls fetch',async()=>{
    let reads=0;
    const manager=createApplicationSync({storage:{getItem(){reads++;return null;},setItem(){throw Error('WRITE');}},factory:{open(){throw Error('OPEN');}},fetchImpl(){throw Error('NETWORK');}});
    const report=await manager.diagnosticReport();
    assert.equal(reads,1);assert.equal(report.storage.readState,'no-existing-connection');
    assert.equal(report.storage.activated,false);assert.equal(report.storage.accountBound,null);
    assert.equal(report.ordinaryUpload.present,false);assert.equal(report.controller.cachedStatus,'localOnly');
    manager.close();
});

test('denied activation metadata stays unknown, not falsely inactive',async()=>{
    const manager=createApplicationSync({storage:{getItem(){throw Error('PRIVATE_DATA');}},factory:{open(){throw Error('OPEN');}},fetchImpl(){throw Error('NETWORK');}});
    const report=await manager.diagnosticReport();assert.equal(report.storage.activated,null);assert.equal(report.controller.cachedStatus,'unavailable');
    assert(!JSON.stringify(report).includes('PRIVATE_DATA'));manager.close();
});

test('strict projection excludes secrets, account identity and content; graph reasons are sanitized',async()=>{
    const secret='NEVER_EXPORT_THIS_SENTINEL';
    const report=await createDiagnosticReport({library:{localRevision:3,library:{schemaVersion:1,templates:[{name:secret,phases:[{title:secret}]}]}},metadata:{syncDirty:true,dirtyRevision:3},
        bindings:{accountKey:secret,email:secret,base:secret,heads:[secret],history:[{snapshotId:secret,parents:[],secret}]},
        outbox:{stage:secret,ticket:{snapshotHash:secret,parents:[secret],accountKey:secret,localRevision:2,snapshotBytes:secret,access_token:secret}}},
        {readState:'read',activated:true,connected:true,error:secret,access_token:secret,authResponse:{email:secret}});
    const text=JSON.stringify(report);assert(!text.includes(secret));
    assert.equal(report.controller.lastErrorCode,'UNRECOGNIZED_CODE');assert.equal(report.history.validation,'invalid');
    assert.equal(report.ordinaryUpload.stage,'unrecognized');assert.equal(report.ordinaryUpload.newerLocalRevision,true);
    assert.deepEqual(Object.keys(report),['diagnosticVersion','source','remoteState','storage','controller','ordinaryUpload','reconciliation','retainedReview','history','limitations']);
    assert.deepEqual(Object.keys(report.storage),['readState','activated','accountBound','localRevision','dirtyRevision','dirty','dirtyRevisionMatchesLocal','base','knownHeads','knownHeadCount','cachedSnapshotCount']);
    assert.deepEqual(Object.keys(report.controller),['connected','busy','lastErrorCode','cachedStatus','statusIsFreshRemoteCheck']);
    assert(!/snapshotBytes|access_token|authResponse|email/.test(text));
});

test('known graph and pending resolution expose only stable metadata and meaningful consistency indicators',async()=>{
    const library={schemaVersion:1,templates:[{id:'private-id',name:'Private Rundown',transitionMode:'manual',phases:[{id:'private-phase',title:'Private Phase',durationSeconds:300}]}]};
    const root=await createSnapshot({purpose:PURPOSE,syncFormatVersion:1,libraryId:'00000000-0000-4000-8000-000000000001',operationId:'00000000-0000-4000-8000-000000000002',parents:[],library,deletedRundownIds:[],restoredRundownIds:[],resolution:null});
    const ticket={snapshotHash:root.snapshotId,parents:[root.snapshotId],localRevision:2,accountKey:'not-exported',snapshotBytes:canonicalJSON(root)};
    const records={library:{localRevision:3,library},metadata:{dirtyRevision:3,syncDirty:true},bindings:{base:root.snapshotId,accountKey:'not-exported',heads:[root.snapshotId],history:[root],reconciliation:{ticket,anchor:{revision:2,base:root.snapshotId,library}}},outbox:{ticket,stage:'prepared'}};
    const before=canonicalJSON(records),report=await createDiagnosticReport(records,{readState:'read',activated:true,connected:true,error:'unsupportedConflict'});
    assert.equal(canonicalJSON(records),before);assert.equal(report.reconciliation.present,true);assert.equal(report.ordinaryUpload.present,false);
    assert.equal(report.reconciliation.intentMatchesOutbox,true);assert.equal(report.reconciliation.newerLocalRevision,true);assert.equal(report.reconciliation.baselineRevisionMatchesLocal,false);
    assert.equal(report.reconciliation.acknowledgement,'not-locally-verified');assert.equal(report.history.unsupportedReason,'HEAD_COUNT_NOT_TWO');
    assert.equal(report.history.localContentMatchesBase,true);assert.equal(report.controller.lastErrorCode,'unsupportedConflict');
    assert(!/Private|private-id|private-phase|not-exported/.test(JSON.stringify(report)));
});
