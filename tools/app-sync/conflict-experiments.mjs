// Native IndexedDB + deterministic local HTTP double. Never contacts Google.
import { createApplicationSync } from './controller.mjs';
import { openApplicationStorage, LEGACY } from './storage.mjs';
import { fakeDrive } from '../sync-integration/fake-drive.mjs';
import { SCOPE } from '../sync-poc/core.mjs';
import { createSnapshot, canonicalJSON } from '../sync-core/canonical.mjs';
import { buildGraph } from '../sync-core/graph.mjs';
import { serializeRundowns, parseRundowns } from '../../src/js/portability.mjs';
const fixture = () => ({ schemaVersion: 1, templates: [{ id: 'rundown', name: 'Sprint Planning', transitionMode: 'manual', phases: [{ id: 'phase', title: 'Plan', durationSeconds: 300 }] }] });
const auth = { access_token: 'CONFLICT_SYNTHETIC_ONLY', expires_in: 3600, scope: SCOPE };
const check = (value, label = 'CONFLICT_ASSERTION') => { if (!value) throw Error(label); };
const equal = (a,b) => canonicalJSON(a) === canonicalJSON(b);
const memory = library => { const map = new Map(library ? [[LEGACY, JSON.stringify(library)]] : []); return { getItem: k => map.get(k) ?? null, setItem: (k,v) => map.set(k,v) }; };
const factory = () => { const suffix = crypto.randomUUID(); return { open: (name,version) => indexedDB.open(name+suffix,version) }; };
async function rejects(fn, code) { try { await fn(); } catch (e) { check(!code || e.message === code, 'Expected '+code+' got '+e.message); return; } throw Error('EXPECTED_REJECTION '+code); }
export async function runConflictExperiments() {
    const checks = [], managers = [];
    const make = (drive, storage = memory(fixture()), db = factory(), fault) => {
        const manager = createApplicationSync({storage,factory:db,fetchImpl:drive.fetch,fault}); managers.push(manager); return {manager,storage,factory:db,drive};
    };
    const save = async (client, transform) => { const store = client.manager.createStore(), library = await store.load(); transform(library); await store.save(library); };
    const pair = async (fault, initial = fixture()) => {
        const drive = fakeDrive(), a = make(drive,memory(initial),factory(),fault); await a.manager.activate(); await a.manager.authorize(auth); await a.manager.sync();
        const b = make(drive,memory(null)); await b.manager.activate(); await b.manager.authorize(auth); await b.manager.sync(); await b.manager.sync({adopt:true});
        return {a,b,drive};
    };
    const divergent = async fault => {
        const pairValue = await pair(fault), {a,b,drive} = pairValue;
        await save(a, lib => lib.templates[0].phases[0].durationSeconds=420);
        await save(b, lib => lib.templates[0].phases[0].durationSeconds=540);
        await a.manager.sync(); await rejects(()=>b.manager.sync(),'reviewRequired');
        check(drive.files.size===3); await rejects(()=>a.manager.sync(),'reviewRequired');
        return pairValue;
    };
    const review = async (a,choice='both') => { const r=await a.manager.reviewConflict(); const choices=Object.fromEntries(r.analysis.proposal.conflicts.map(row=>[row.id,choice])); const p=await a.manager.previewResolution(r.id,choices);return {r,p}; };
    const test = async(name,fn)=>{console.info('CHECK: '+name);await fn();checks.push({test:name,result:'PASS'});};
    try {
        for (const choice of ['left','right','both']) await test('two sequentially publishing clients: '+choice+' is semantic, stable and pullable',async()=>{
            const {a,b,drive}=await divergent(); const {r,p}=await review(a,choice);
            const before=await a.manager.backup(); check(equal(before,r.anchor.library));
            const expected=choice==='right'?r.analysis.proposal.conflicts[0].right.template:r.analysis.proposal.conflicts[0].left.template;
            await a.manager.confirmResolution(p.id);check(await a.manager.status()==='lastChecked');
            const data=await a.manager.backup();check(equal(data.templates[0],expected));check(data.templates.length===(choice==='both'?2:1));
            if(choice==='both') { check(data.templates[1].id!==data.templates[0].id && data.templates[1].phases[0].id!==data.templates[0].phases[0].id);check(data.templates[1].name==='Sprint Planning (1)'); }
            await b.manager.sync();check(equal(await b.manager.backup(),data));
            check(equal(parseRundowns(serializeRundowns(data)),data));
            await a.manager.sync();check(drive.files.size===4);check((await buildGraph([...drive.files.values()].map(f=>JSON.parse(f.bytes)),{complete:true})).heads.length===1);
        });
        await test('unrelated independent changes and numbered-name collisions are retained',async()=>{
            const {a,b,drive}=await pair();
            await save(a,lib=>{lib.templates[0].phases[0].durationSeconds=420;lib.templates.push({...structuredClone(lib.templates[0]),id:'other-a',name:'Sprint Planning (1)'});});
            await save(b,lib=>{lib.templates[0].phases[0].durationSeconds=540;lib.templates.push({...structuredClone(lib.templates[0]),id:'other-b',name:'Sprint Planning (2)'});});
            await a.manager.sync();await rejects(()=>b.manager.sync(),'reviewRequired');
            const {p}=await review(a);check(p.snapshot.library.templates.length===4 && p.snapshot.library.templates.at(-1).name==='Sprint Planning (3)');
            await a.manager.confirmResolution(p.id);check(drive.files.size===4);
        });
        await test('lost acknowledgement and reload recover exact fixed reconciliation without a second POST',async()=>{
            const {a,drive}=await divergent(); const {p}=await review(a);
            await rejects(()=>a.manager.confirmResolution(p.id,{loseAcknowledgement:true}),'SIMULATED_LOST_ACK');
            const store=await openApplicationStorage({storage:a.storage,factory:a.factory}), ticket=(await store.read()).outbox.ticket;store.close();
            a.manager.close();const posts=drive.calls.filter(c=>c.method==='POST').length;
            const resumed=make(drive,a.storage,a.factory);await resumed.manager.authorize(auth);await resumed.manager.sync();
            check(drive.calls.filter(c=>c.method==='POST').length===posts && drive.files.size===4);
            check(equal((await resumed.manager.backup()),JSON.parse(ticket.snapshotBytes).library));check(await resumed.manager.status()==='lastChecked');
        });
        await test('local edit during review invalidates confirmation without upload',async()=>{
            const {a,drive}=await divergent();const {p}=await review(a);await save(a,lib=>lib.templates[0].name='New local draft saved');
            await rejects(()=>a.manager.confirmResolution(p.id),'staleReview');check(drive.files.size===3);check((await a.manager.backup()).templates[0].name==='New local draft saved');
        });
        await test('pending ordinary upload cannot be replaced by a conflict review',async()=>{
            const {a}=await pair();await save(a,lib=>lib.templates[0].name='Pending ordinary');await rejects(()=>a.manager.sync({loseAcknowledgement:true}),'SIMULATED_LOST_ACK');
            await rejects(()=>a.manager.reviewConflict(),'pendingUpload');await a.manager.sync();check(await a.manager.status()==='lastChecked');
        });
        await test('incomplete discovery and malformed remote bytes cannot publish a resolution',async()=>{
            const {a,drive}=await divergent();const {p}=await review(a);drive.incomplete=true;await rejects(()=>a.manager.confirmResolution(p.id));check(drive.files.size===3);
            drive.incomplete=false;const f=[...drive.files.values()][0],bytes=f.bytes;f.bytes=bytes+' ';await rejects(()=>a.manager.reviewConflict());f.bytes=bytes;check(drive.files.size===3);
        });
        await test('authorization expiry and account mismatch retain review and local data',async()=>{
            const {a,drive}=await divergent();const {p}=await review(a),before=await a.manager.backup();
            drive.fault=()=>new Response('{}',{status:401});await rejects(()=>a.manager.confirmResolution(p.id),'REAUTHORIZE');check(equal(before,await a.manager.backup()));
            drive.fault=null;await a.manager.authorize(auth);await a.manager.confirmResolution(p.id);check(await a.manager.status()==='lastChecked');
            const other=createApplicationSync({storage:a.storage,factory:a.factory,fetchImpl:async(url,init)=>url.includes('/about?')?new Response(JSON.stringify({user:{permissionId:'another-synthetic-account'}})):drive.fetch(url,init)});managers.push(other);
            await rejects(()=>other.authorize(auth),'accountMismatch');check(drive.files.size===4);
        });
        await test('two local tabs cannot install a review over a newer saved revision',async()=>{
            const {a,drive}=await divergent();const {p}=await review(a),tab=make(drive,a.storage,a.factory);await tab.manager.authorize(auth);
            await save(tab,lib=>lib.templates[0].name='Independent tab edit');await rejects(()=>a.manager.confirmResolution(p.id),'staleReview');
            check((await tab.manager.backup()).templates[0].name==='Independent tab edit' && drive.files.size===3);
        });
        await test('late remote head before confirmation invalidates choices',async()=>{
            const {a,drive}=await divergent();const {p}=await review(a);
            const original=[...drive.files.values()][0],root=JSON.parse(original.bytes),library=structuredClone(root.library);library.templates[0].name='Late third branch';
            const {snapshotId,...payload}=root;
            const late=await createSnapshot({...payload,operationId:crypto.randomUUID(),parents:[root.snapshotId],library});
            drive.files.set('late-file',{meta:{...structuredClone(original.meta),id:'late-file',appProperties:{...original.meta.appProperties,operationId:late.operationId,snapshotId:late.snapshotId}},bytes:canonicalJSON(late)});
            await rejects(()=>a.manager.confirmResolution(p.id),'staleReview');check(drive.files.size===4);await rejects(()=>a.manager.reviewConflict(),'unsupportedConflict');
        });
        await test('late branch during upload and newer local edit preserve both remote and local state',async()=>{
            const {a,drive}=await divergent();const {p}=await review(a),original=[...drive.files.values()][0],root=JSON.parse(original.bytes);let changed=false;
            drive.fault=async({url})=>{if(!changed&&url.pathname.startsWith('/upload/')){changed=true;const {snapshotId,...payload}=root,library=structuredClone(root.library);library.templates[0].name='Late during upload';
                const late=await createSnapshot({...payload,operationId:crypto.randomUUID(),parents:[root.snapshotId],library});
                drive.files.set('late-during',{meta:{...structuredClone(original.meta),id:'late-during',appProperties:{...original.meta.appProperties,operationId:late.operationId,snapshotId:late.snapshotId}},bytes:canonicalJSON(late)});
                await save(a,lib=>lib.templates[0].name='Local during publication');}};
            await rejects(()=>a.manager.confirmResolution(p.id),'reviewRequired');check(drive.files.size===5);check((await a.manager.backup()).templates[0].name==='Local during publication');
            drive.fault=null;await rejects(()=>a.manager.sync(),'reviewRequired');check(drive.files.size===5 && await a.manager.status()!=='lastChecked');
        });
        await test('interrupted publication before POST retains exact durable ticket and resumes once',async()=>{
            const {a,drive}=await divergent();const {p}=await review(a);let interrupted=false;
            drive.fault=({url})=>{if(url.pathname.startsWith('/upload/')){interrupted=true;throw Error('OFFLINE');}};
            await rejects(()=>a.manager.confirmResolution(p.id));check(interrupted && drive.files.size===3);
            const store=await openApplicationStorage({storage:a.storage,factory:a.factory}),before=(await store.read()).outbox.ticket;store.close();a.manager.close();drive.fault=null;
            const again=make(drive,a.storage,a.factory);await again.manager.authorize(auth);await again.manager.sync();
            check(drive.files.size===4 && drive.files.has(before.fileId));check(equal(JSON.parse(drive.files.get(before.fileId).bytes).library,p.snapshot.library));
        });
        await test('quota abort while preparing reconciliation commits neither intent nor ticket',async()=>{
            let enabled=false,transaction=0;
            const {a,drive}=await divergent(point=>{if(enabled&&point==='before-integration-write'&&++transaction===2)throw Error('QuotaExceededError');});
            const {p}=await review(a),before=await a.manager.backup();enabled=true;
            await rejects(()=>a.manager.confirmResolution(p.id));enabled=false;
            const store=await openApplicationStorage({storage:a.storage,factory:a.factory}),records=await store.read();store.close();
            check(!records.outbox&&!records.bindings.reconciliation&&equal(records.library.library,before)&&drive.files.size===3);
        });
        await test('quota abort after applying requests retains old library and verified ticket for safe retry',async()=>{
            let enabled=false,transaction=0;
            const {a,drive}=await divergent(point=>{if(enabled&&point==='before-integration-write')transaction++;if(enabled&&point==='after-integration-write'&&transaction===5)throw Error('QuotaExceededError');});
            const {p}=await review(a),before=await a.manager.backup();enabled=true;
            await rejects(()=>a.manager.confirmResolution(p.id));enabled=false;
            const store=await openApplicationStorage({storage:a.storage,factory:a.factory}),records=await store.read();store.close();
            check(records.outbox?.stage==='verified'&&records.bindings.reconciliation&&equal(records.library.library,before)&&drive.files.size===4);
            const posts=drive.calls.filter(c=>c.method==='POST').length;await a.manager.sync();
            check(equal(await a.manager.backup(),p.snapshot.library)&&drive.calls.filter(c=>c.method==='POST').length===posts);
        });
        await test('simultaneous local-tab confirmations publish only one durable resolution',async()=>{
            const {a,drive}=await divergent(),tab=make(drive,a.storage,a.factory);await tab.manager.authorize(auth);
            const first=await review(a,'left'),second=await review(tab,'both');
            const results=await Promise.allSettled([a.manager.confirmResolution(first.p.id),tab.manager.confirmResolution(second.p.id)]);
            check(results.some(r=>r.status==='fulfilled')&&drive.files.size===4);
            const graph=await buildGraph([...drive.files.values()].map(f=>JSON.parse(f.bytes)),{complete:true});check(graph.heads.length===1);
            check(equal(await a.manager.backup(),graph.get(graph.heads[0]).library));
        });
        await test('delete-versus-edit remains unsupported and preserves all versions',async()=>{
            const {a,b,drive}=await pair();await save(a,lib=>lib.templates=[]);await save(b,lib=>lib.templates[0].name='Edited rather than deleted');
            await a.manager.sync();await rejects(()=>b.manager.sync(),'reviewRequired');await rejects(()=>b.manager.reviewConflict(),'unsupportedConflict');
            check(drive.files.size===3&&(await b.manager.backup()).templates[0].name==='Edited rather than deleted');
        });
        for (const [seed,reconnect] of [[100,'none'],[200,'reauthorize'],[500,'401'],[600,'reopen']]) await test('three consecutive conflict rounds; first third-round publication with reconnect='+reconnect,async()=>{
            // Fixed UUID sequence is scoped to this isolated experiment, never application code.
            const originalUUID=crypto.randomUUID;let nextId=seed;
            crypto.randomUUID=()=> '10000000-0000-4000-8000-'+String(++nextId).padStart(12,'0');
            try {
            const initial=fixture();initial.templates[0].phases[0].durationSeconds=420;
            const {a,b,drive}=await pair(undefined,initial);
            const duration=async(client,minutes)=>save(client,lib=>lib.templates.find(t=>t.id==='rundown').phases[0].durationSeconds=minutes*60);
            await duration(a,8);await duration(b,9);await a.manager.sync();await rejects(()=>b.manager.sync(),'reviewRequired');
            const first=await review(a,'both');await a.manager.confirmResolution(first.p.id);await b.manager.sync();
            const firstLibrary=await a.manager.backup(),copy=structuredClone(firstLibrary.templates.find(t=>t.id!=='rundown'));
            check(firstLibrary.templates.length===2&&equal(firstLibrary,await b.manager.backup()));
            if(seed<=500) check(copy.phases[0].durationSeconds===480&&firstLibrary.templates.find(t=>t.id==='rundown').phases[0].durationSeconds===540,'FIRST_ROUND_OWNER_CONTENT_MISMATCH');
            await duration(a,10);await duration(b,11);await a.manager.sync();await rejects(()=>b.manager.sync(),'reviewRequired');
            const r=await b.manager.reviewConflict(),row=r.analysis.proposal.conflicts.find(c=>c.id==='rundown');
            const chosen=row.left.template.phases[0].durationSeconds===600?'left':'right';
            const p=await b.manager.previewResolution(r.id,{rundown:chosen});await b.manager.confirmResolution(p.id);await a.manager.sync();
            for (const client of [a,b]) {
                const store=await openApplicationStorage({storage:client.storage,factory:client.factory}),records=await store.read();store.close();
                check(!records.outbox&&!records.bindings.reconciliation&&!records.metadata.syncDirty,'SECOND_ROUND_NOT_FINALIZED');
                check(records.bindings.heads.length===1&&records.bindings.base===records.bindings.heads[0],'SECOND_ROUND_STALE_BASE');
                check(equal(records.library.library,records.bindings.history.find(n=>n.snapshotId===records.bindings.base).library),'SECOND_ROUND_LOCAL_BASE_MISMATCH');
                check(records.library.library.templates.find(t=>t.id==='rundown').phases[0].durationSeconds===600);
                check(equal(records.library.library.templates.find(t=>t.id===copy.id),copy));
                check(await client.manager.status()==='lastChecked');
            }
            check(drive.files.size===7);
            await duration(a,12);await duration(b,13);
            if(reconnect==='401') {
                // Simulated real HTTP-401 response, not elapsed token time or a Google request.
                drive.fault=()=>new Response('{}',{status:401});await rejects(()=>a.manager.sync(),'REAUTHORIZE');
                drive.fault=null;await a.manager.authorize(auth);
            }
            if(reconnect==='reauthorize') await a.manager.authorize(auth);
            if(reconnect==='reopen') { a.manager.close();a.manager=make(drive,a.storage,a.factory).manager;await a.manager.authorize(auth); }
            const posts=drive.calls.filter(c=>c.method==='POST').length;
            check(await a.manager.sync()==='lastChecked','SPURIOUS_FIRST_PUBLICATION_CONFLICT');
            check(drive.files.size===8&&drive.calls.filter(c=>c.method==='POST').length===posts+1);
            check((await b.manager.backup()).templates.find(t=>t.id==='rundown').phases[0].durationSeconds===780);
            const graph=await buildGraph([...drive.files.values()].map(f=>JSON.parse(f.bytes)),{complete:true});check(graph.heads.length===1);
            await rejects(()=>b.manager.sync(),'reviewRequired');const final=await b.manager.reviewConflict();
            check(final.analysis.proposal.conflicts.length===1&&final.analysis.proposal.conflicts[0].id==='rundown');
            check(equal((await a.manager.backup()).templates.find(t=>t.id===copy.id),copy));
            } finally { crypto.randomUUID=originalUUID; }
        });
        await test('stale selected parent is explicitly joined without losing the other client pending edit',async()=>{
            // Focused topology: existing independent 08:00 copy; original 09:00.
            // A's 10:00 content is selected remotely, but A has NOT pulled that resolution head.
            const initial=fixture();initial.templates[0].phases[0].durationSeconds=540;
            const copy=structuredClone(initial.templates[0]);copy.id='independent-copy';copy.name='Sprint Planning (1)';copy.phases[0].id='copy-phase';copy.phases[0].durationSeconds=480;initial.templates.push(copy);
            const {a,b,drive}=await pair(undefined,initial);
            const change=async(client,minutes)=>save(client,lib=>lib.templates.find(t=>t.id==='rundown').phases[0].durationSeconds=minutes*60);
            await change(a,10);await change(b,11);await a.manager.sync();
            const oldBase=(await a.manager.diagnosticReport()).storage.base;
            await rejects(()=>b.manager.sync(),'reviewRequired');
            const r=await b.manager.reviewConflict(),row=r.analysis.proposal.conflicts[0];
            const choice=row.left.template.phases[0].durationSeconds===600?'left':'right';
            const p=await b.manager.previewResolution(r.id,{rundown:choice});await b.manager.confirmResolution(p.id);
            const resolvedBase=(await b.manager.diagnosticReport()).storage.base;
            check(oldBase!==resolvedBase&&equal(await a.manager.backup(),await b.manager.backup()));
            check(await a.manager.status()==='lastChecked'&&await b.manager.status()==='lastChecked');
            // Crucially, do not call A.sync() between the remote resolution and its next local edit.
            await change(a,12);await change(b,13);await a.manager.authorize(auth);
            const posts=drive.calls.filter(c=>c.method==='POST').length;
            await rejects(()=>a.manager.sync(),'reviewRequired');
            check(drive.calls.filter(c=>c.method==='POST').length===posts+1,'A_MUST_HAVE_PUBLISHED_BEFORE_STOP');
            const diagnosticA=await a.manager.diagnosticReport(),diagnosticB=await b.manager.diagnosticReport();
            check(diagnosticA.storage.knownHeadCount===2&&!diagnosticA.storage.dirty&&!diagnosticA.ordinaryUpload.present&&!diagnosticA.reconciliation.present);
            check(diagnosticA.history.reviewStatus==='proposed'&&diagnosticA.history.unsupportedReason===null&&diagnosticA.history.commonBaseCount===1);
            check(diagnosticB.storage.knownHeadCount===1&&diagnosticB.storage.dirty&&diagnosticB.storage.base===resolvedBase);
            const graph=await buildGraph([...drive.files.values()].map(f=>JSON.parse(f.bytes)),{complete:true}),newHead=graph.get(diagnosticA.storage.base);
            check(equal(newHead.parents,[oldBase])&&!graph.ancestors(newHead.snapshotId).includes(resolvedBase));
            check(graph.heads.includes(resolvedBase)&&graph.commonBases(...graph.heads)[0]===oldBase);
            check(diagnosticA.storage.cachedSnapshotCount===diagnosticB.storage.cachedSnapshotCount+1);
            const reviewed=await a.manager.reviewConflict(),preview=await a.manager.previewResolution(reviewed.id,{}),join=preview.snapshot;
            check(join.resolution.decisions.length===0&&join.library.templates.find(t=>t.id==='rundown').phases[0].durationSeconds===720);
            check(equal(join.library.templates.find(t=>t.id===copy.id),copy));
            check((await buildGraph([...graph.list(),join],{complete:true})).heads.length===1);
            check((await b.manager.backup()).templates.find(t=>t.id==='rundown').phases[0].durationSeconds===780);
            await a.manager.confirmResolution(preview.id);check(await a.manager.status()==='lastChecked');
            check((await b.manager.backup()).templates.find(t=>t.id==='rundown').phases[0].durationSeconds===780);
            await rejects(()=>b.manager.sync(),'reviewRequired');
            const realConflict=await b.manager.reviewConflict();check(realConflict.analysis.status==='conflict'&&realConflict.analysis.proposal.conflicts.length===1);
        });
        const proposedPair=async(kind='independent')=>{
            const initial=fixture(),copy=structuredClone(initial.templates[0]);copy.id='copy';copy.name='Copy';copy.phases[0].id='copy-p';copy.phases[0].durationSeconds=480;initial.templates.push(copy);
            const {a,b,drive}=await pair(undefined,initial);
            await save(a,lib=>lib.templates[0].phases[0].durationSeconds=720);
            await save(b,lib=>lib.templates[kind==='identical'?0:1].phases[0].durationSeconds=kind==='identical'?720:600);
            await a.manager.sync();await rejects(()=>b.manager.sync(),'reviewRequired');
            return {a,b,drive};
        };
        for(const kind of ['independent','identical'])await test('conflict-free '+kind+' histories require explicit confirmation and validate one two-parent head',async()=>{
            const {a,b,drive}=await proposedPair(kind),before=await a.manager.backup(),r=await a.manager.reviewConflict();
            check(r.analysis.status==='proposed'&&r.analysis.proposal.conflicts.length===0);
            const p=await a.manager.previewResolution(r.id,{});check(drive.files.size===3&&equal(await a.manager.backup(),before));
            check(p.snapshot.resolution.decisions.length===0&&p.snapshot.parents.length===2);
            await a.manager.confirmResolution(p.id);await b.manager.sync();
            const result=await a.manager.backup();check(equal(result,await b.manager.backup())&&result.templates[0].phases[0].durationSeconds===720);
            check(result.templates[1].phases[0].durationSeconds===(kind==='identical'?480:600));
            check(result.templates.map(t=>t.id).join(',')==='rundown,copy'&&drive.files.size===4);
            check((await buildGraph([...drive.files.values()].map(f=>JSON.parse(f.bytes)),{complete:true})).heads.length===1);
        });
        await test('conflict-free lost acknowledgement, repeated confirmation and reopen keep one immutable operation',async()=>{
            const {a,drive}=await proposedPair(),r=await a.manager.reviewConflict(),p=await a.manager.previewResolution(r.id,{});
            await rejects(()=>a.manager.confirmResolution(p.id,{loseAcknowledgement:true}),'SIMULATED_LOST_ACK');
            await rejects(()=>a.manager.confirmResolution(p.id),'pendingUpload');await rejects(()=>a.manager.reviewConflict(),'pendingUpload');
            a.manager.close();const again=make(drive,a.storage,a.factory),posts=drive.calls.filter(c=>c.method==='POST').length;
            await again.manager.authorize(auth);await again.manager.sync();
            check(drive.files.size===4&&drive.calls.filter(c=>c.method==='POST').length===posts&&equal(await again.manager.backup(),p.snapshot.library));
        });
        await test('conflict-free review protects a newer local revision',async()=>{
            const {a,drive}=await proposedPair(),r=await a.manager.reviewConflict(),p=await a.manager.previewResolution(r.id,{});
            await save(a,lib=>lib.templates[0].name='Newer saved edit');await rejects(()=>a.manager.confirmResolution(p.id),'staleReview');
            check(drive.files.size===3&&(await a.manager.backup()).templates[0].name==='Newer saved edit');
        });
        await test('conflict-free review rejects incomplete history, expiry and account mismatch without replacement',async()=>{
            const {a,drive}=await proposedPair(),r=await a.manager.reviewConflict(),p=await a.manager.previewResolution(r.id,{});
            drive.incomplete=true;await rejects(()=>a.manager.confirmResolution(p.id));drive.incomplete=false;
            const first=[...drive.files.values()][0],bytes=first.bytes;first.bytes=bytes+' ';await rejects(()=>a.manager.confirmResolution(p.id));first.bytes=bytes;
            drive.fault=()=>new Response('{}',{status:401});await rejects(()=>a.manager.confirmResolution(p.id),'REAUTHORIZE');drive.fault=null;
            const other=createApplicationSync({storage:a.storage,factory:a.factory,fetchImpl:async(url,init)=>url.includes('/about?')?new Response(JSON.stringify({user:{permissionId:'different-synthetic-account'}})):drive.fetch(url,init)});managers.push(other);
            await rejects(()=>other.authorize(auth),'accountMismatch');check(drive.files.size===3);
            await a.manager.authorize(auth);await a.manager.confirmResolution(p.id);check(drive.files.size===4&&await a.manager.status()==='lastChecked');
        });
        await test('conflict-free review rejects a third head appearing before publication',async()=>{
            const {a,drive}=await proposedPair(),r=await a.manager.reviewConflict(),p=await a.manager.previewResolution(r.id,{});
            const file=[...drive.files.values()][0],root=JSON.parse(file.bytes),{snapshotId,...payload}=root,library=structuredClone(root.library);library.templates[0].name='Late branch';
            const late=await createSnapshot({...payload,operationId:crypto.randomUUID(),parents:[root.snapshotId],library});
            drive.files.set('late-proposed',{meta:{...structuredClone(file.meta),id:'late-proposed',appProperties:{...file.meta.appProperties,operationId:late.operationId,snapshotId:late.snapshotId}},bytes:canonicalJSON(late)});
            await rejects(()=>a.manager.confirmResolution(p.id),'staleReview');await rejects(()=>a.manager.reviewConflict(),'unsupportedConflict');check(drive.files.size===4);
        });
        return {checks,count:checks.length,realGoogle:'NOT TESTED; mocked HTTP',realIndexedDB:true};
    } finally { managers.forEach(manager=>manager.close()); }
}
