// Existing-connection diagnostics: native IndexedDB, synthetic libraries and HTTP only.
import { createApplicationSync } from './controller.mjs';
import { openApplicationStorage, LEGACY } from './storage.mjs';
import { fakeDrive } from '../sync-integration/fake-drive.mjs';
import { SCOPE } from '../sync-poc/core.mjs';
import { canonicalJSON } from '../sync-core/canonical.mjs';
const auth={access_token:'DIAGNOSTICS_TEST_TOKEN_NOT_FOR_EXPORT',expires_in:3600,scope:SCOPE};
const fixture=()=>({schemaVersion:1,templates:[{id:'synthetic-id',name:'DIAG_PRIVATE_TITLE',transitionMode:'manual',phases:[{id:'synthetic-phase',title:'DIAG_PRIVATE_PHASE',durationSeconds:300}]}]});
const check=(value)=>{if(!value)throw Error('DIAGNOSTIC_ASSERTION');};
async function rejects(fn){try{await fn();}catch{return;}throw Error('EXPECTED_REJECTION');}
export async function runDiagnosticExperiments(){
    const checks=[],closers=[],drive=fakeDrive();let localWrites=0;
    const make=library=>{
        const values=new Map(library?[[LEGACY,JSON.stringify(library)]]:[]),suffix=crypto.randomUUID();
        const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>{localWrites++;values.set(k,v);}},factory={open:(name,version)=>indexedDB.open(name+suffix,version)};
        const manager=createApplicationSync({storage,factory,fetchImpl:drive.fetch});closers.push(()=>manager.close());return {storage,factory,manager};
    };
    const inspect=async(client,fn)=>{
        const reader=await openApplicationStorage({storage:client.storage,factory:client.factory});closers.push(()=>reader.close());
        const before=canonicalJSON(await reader.readDiagnosticRecords()),calls=drive.calls.length,writes=localWrites,status=await client.manager.status();
        const originalOpen=IDBFactory.prototype.open,originalTransaction=IDBDatabase.prototype.transaction,originalFetch=globalThis.fetch;
        const mutators=['put','add','delete','clear'],originals=mutators.map(k=>IDBObjectStore.prototype[k]);let readTransactions=0,openAttempts=0,writeAttempts=0,networkAttempts=0;
        IDBFactory.prototype.open=()=>{openAttempts++;throw Error('DIAGNOSTICS_MUST_NOT_OPEN');};
        IDBDatabase.prototype.transaction=function(stores,mode,options){if(mode!=='readonly'){writeAttempts++;throw Error('DIAGNOSTICS_MUST_BE_READONLY');}readTransactions++;return originalTransaction.call(this,stores,mode,options);};
        mutators.forEach(k=>IDBObjectStore.prototype[k]=()=>{writeAttempts++;throw Error('DIAGNOSTICS_MUST_NOT_WRITE');});
        globalThis.fetch=()=>{networkAttempts++;throw Error('DIAGNOSTICS_MUST_NOT_FETCH');};
        let report;
        try{report=await client.manager.diagnosticReport();}finally{
            IDBFactory.prototype.open=originalOpen;IDBDatabase.prototype.transaction=originalTransaction;globalThis.fetch=originalFetch;
            mutators.forEach((k,i)=>IDBObjectStore.prototype[k]=originals[i]);
        }
        check(readTransactions===1&&openAttempts===0&&writeAttempts===0&&networkAttempts===0&&drive.calls.length===calls&&localWrites===writes);
        check(canonicalJSON(await reader.readDiagnosticRecords())===before&&await client.manager.status()===status);
        check(!/DIAG_PRIVATE|DIAGNOSTICS_TEST_TOKEN_NOT_FOR_EXPORT|snapshotBytes|access_token/.test(JSON.stringify(report)));
        await fn(report);
    };
    const test=async(name,fn)=>{await fn();checks.push({test:name,result:'PASS'});};
    try{
        const a=make(fixture());await a.manager.activate();await a.manager.authorize(auth);await a.manager.sync();
        await test('activated clean store: exactly one readonly transaction, no database open/write/network, sanitized report',()=>inspect(a,report=>{
            check(report.storage.accountBound&&report.storage.activated&&report.history.validation==='validated'&&report.history.localContentMatchesBase);
        }));
        const b=make(null);await b.manager.activate();await b.manager.authorize(auth);await b.manager.sync();await b.manager.sync({adopt:true});
        const sa=a.manager.createStore(),sb=b.manager.createStore(),la=await sa.load(),lb=await sb.load();la.templates[0].phases[0].durationSeconds=420;lb.templates[0].phases[0].durationSeconds=540;await sa.save(la);await sb.save(lb);
        await a.manager.sync();await rejects(()=>b.manager.sync());await rejects(()=>a.manager.sync());
        await test('supported conflict stays unchanged and graph analysis requires no Drive requests',()=>inspect(a,report=>{
            check(report.storage.knownHeadCount===2&&report.history.reviewStatus==='conflict'&&report.history.conflictKinds['concurrent-content']===1);
        }));
        const review=await a.manager.reviewConflict(),preview=await a.manager.previewResolution(review.id,{'synthetic-id':'both'});
        await rejects(()=>a.manager.confirmResolution(preview.id,{loseAcknowledgement:true}));
        await test('unverified pending resolution accurately retains ticket, reviewed heads and local anchor',()=>inspect(a,report=>{
            check(report.reconciliation.present&&report.reconciliation.intentMatchesOutbox&&report.reconciliation.reviewedHeads.length===2);
            check(report.reconciliation.stage==='prepared'&&report.reconciliation.acknowledgement==='not-locally-verified'&&report.reconciliation.baselineRevisionMatchesLocal);
            check(report.retainedReview.present&&!report.ordinaryUpload.present);
        }));
        await a.manager.sync();await rejects(()=>a.manager.reviewConflict());
        await test('unsupported one-head review and its error remain unchanged after diagnostics',()=>inspect(a,report=>{
            check(report.controller.lastErrorCode==='unsupportedConflict'&&report.history.unsupportedReason==='HEAD_COUNT_NOT_TWO');
            check(report.storage.knownHeadCount===1&&!report.reconciliation.present&&!report.ordinaryUpload.present);
        }));
        return {checks,count:checks.length,realGoogle:'NOT USED',nativeIndexedDB:true};
    }finally{closers.forEach(close=>close());}
}
