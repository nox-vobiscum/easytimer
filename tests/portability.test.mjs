import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRundowns, serializeRundowns, independentCopies, rundownCollisions, rundownFromRun, exportFilename, MAX_IMPORT_BYTES } from '../src/js/portability.mjs';
import { createTemplateStore } from '../src/js/templates.mjs';
import { prepareSession, transitionSession } from '../src/js/session.mjs';

const template = (id='one', mode='manual') => ({id,name:'Example Rundown',transitionMode:mode,phases:[
    {id:id+'-opening',title:'Opening',durationSeconds:60}, {id:id+'-discussion',title:'Discussion',durationSeconds:360000},
]});
const library = (...templates) => ({schemaVersion:1,templates});
const parse = value => parseRundowns(JSON.stringify(value));

test('single/all export and import round trips preserve the canonical schema, order, modes and exact minutes', () => {
    for(const data of [library(template()),library(template(),template('two','automatic'))]) {
        assert.deepEqual(parseRundowns(serializeRundowns(data)),data);
        assert.deepEqual(parseRundowns('\uFEFF'+serializeRundowns(data)),data);
    }
    assert.deepEqual(JSON.parse(serializeRundowns(library())),library());
    const source=template();source.deadlineMs=123;source.phases[0].overtimeMs=12;
    assert.deepEqual(JSON.parse(serializeRundowns(library(source))),library(template()),'Export includes definitions only');
});

test('empty, malformed, oversized and wrong/versioned envelopes fail without invented defaults', () => {
    for(const value of ['', ' ', null])assert.throws(()=>parseRundowns(value),/importEmpty/);
    assert.throws(()=>parseRundowns('{'),/importJSON/);
    for(const value of [null, [], {}, {templates:[]}, {schemaVersion:1,templates:{}}, {schemaVersion:1}])assert.throws(()=>parse(value),/importInvalid|importVersion/);
    assert.throws(()=>parse({schemaVersion:2,templates:[template()]}),/importVersion/);
    assert.throws(()=>parse(library()),/importEmpty/);
    assert.throws(()=>parseRundowns(' '.repeat(MAX_IMPORT_BYTES)+'x'),/importSize/);
    assert.throws(()=>parseRundowns('é'.repeat(MAX_IMPORT_BYTES/2+1)),/importSize/,'Size is UTF-8 bytes, not character count');
});

test('unknown fields, runtime state and prototype-like keys are rejected at every import level', () => {
    for(const modify of [data=>data.extra=true,data=>data.templates[0].runId='runtime',data=>data.templates[0].phases[0].extra='ignored?']) {
        const data=library(template());modify(data);assert.throws(()=>parse(data),/importInvalid/);
    }
    assert.throws(()=>parseRundowns('{"schemaVersion":1,"templates":[],"__proto__":{}}'),/importInvalid/);
});

test('canonical missing-field, ID, mode, phase and duration rules remain authoritative', () => {
    for(const modify of [t=>delete t.id,t=>t.name='',t=>t.transitionMode='auto',t=>t.phases=[],t=>t.phases[0].title='',t=>t.phases[1].id=t.phases[0].id]) {
        const source=template();modify(source);assert.throws(()=>parse(library(source)),/importInvalid/);
    }
    assert.throws(()=>parse(library(template(),template())),/importInvalid/);
    for(const duration of [0,-60,61,0.5,'60',360060,Number.MAX_SAFE_INTEGER]) {
        const source=template();source.phases[0].durationSeconds=duration;assert.throws(()=>parse(library(source)),/importDuration/);
    }
    const source=template();source.phases=Array.from({length:11},(_,i)=>({id:String(i),title:'Phase',durationSeconds:360000}));
    assert.throws(()=>parse(library(source)),/importLimit/);
    source.phases.pop();assert.equal(parse(library(source)).templates[0].phases.length,10);
});

test('collisions include existing IDs, normalized names and repeated names within the file without deduplication', () => {
    const incoming=library(template(),{...template('two'),name:'EXAMPLE RUNDOWN'});
    assert.deepEqual(rundownCollisions(incoming,library(template())),[{id:true,name:true},{id:false,name:true}]);
    assert.deepEqual(rundownCollisions(incoming,library()),[{id:false,name:true},{id:false,name:true}]);
});

test('copies regenerate every ID, preserve values/order, allow duplicate names and never mutate inputs', () => {
    const incoming=library(template(),template('two','automatic')),existing=structuredClone(incoming),before=structuredClone(incoming);
    let id=0;const fresh=()=>++id===1?'one':`new-${id}`;
    const copies=independentCopies(incoming,existing,fresh);
    assert.deepEqual(incoming,before);assert.deepEqual(existing,before);
    const previous=new Set(incoming.templates.flatMap(t=>[t.id,...t.phases.map(p=>p.id)]));
    const all=copies.templates.flatMap(t=>[t.id,...t.phases.map(p=>p.id)]);
    assert.equal(new Set(all).size,all.length);assert.ok(all.every(id=>!previous.has(id)));
    copies.templates.forEach((t,i)=>{assert.equal(t.name,incoming.templates[i].name);assert.equal(t.transitionMode,incoming.templates[i].transitionMode);assert.deepEqual(t.phases.map(p=>[p.title,p.durationSeconds]),incoming.templates[i].phases.map(p=>[p.title,p.durationSeconds]));});
    assert.notEqual(independentCopies(incoming,existing).templates[0].id,independentCopies(incoming,existing).templates[0].id,'Reimport creates additional copies');
    assert.throws(()=>independentCopies(incoming,existing,()=> 'one'),/importInvalid/);
});

test('phase IDs are scoped to their Rundown on input and globally fresh across imported copies', () => {
    const first=template(),second=template('two');second.phases[0].id=first.phases[0].id;
    const incoming=parse(library(first,second));const copies=independentCopies(incoming,library());
    assert.notEqual(copies.templates[0].phases[0].id,copies.templates[1].phases[0].id);
});

test('batch confirmation uses one store write and rejects conflicts/quota errors without partial records', () => {
    let raw=serializeRundowns(library(template('saved'))),writes=0,fail=false;
    const storage={getItem:()=>raw,setItem:(_,value)=>{writes++;if(fail)throw new Error('quota');raw=value;}};
    const store=createTemplateStore(()=>storage);const existing=store.load();
    const imported=independentCopies(library(template(),template('two','automatic')),existing);
    const batch={schemaVersion:1,templates:[...existing.templates,...imported.templates]};
    raw=serializeRundowns(library(template('remote')));const remote=raw;
    assert.throws(()=>store.save(batch),/conflict/);assert.equal(raw,remote);assert.equal(writes,0);
    const fresh=store.load();fail=true;
    assert.throws(()=>store.save({...fresh,templates:[...fresh.templates,...imported.templates]}),/storageWrite/);assert.equal(raw,remote);assert.equal(writes,1);
    fail=false;store.save({...fresh,templates:[...fresh.templates,...imported.templates]});assert.equal(writes,2);assert.equal(JSON.parse(raw).templates.length,3);
});

test('active Session exports use the original definition and omit all live timing metadata', () => {
    for(const mode of ['manual','automatic']) {
        const source=template('source',mode);let {run,clock}=prepareSession(source);
        ({run,clock}=transitionSession(run,clock,{type:'START'},0));
        ({run,clock}=transitionSession(run,clock,{type:'TICK'},999999999));
        const before=structuredClone({run,clock});
        assert.deepEqual(rundownFromRun(run),library(source));assert.deepEqual({run,clock},before);
        const keys=serializeRundowns(rundownFromRun(run));assert.doesNotMatch(keys,/runId|deadline|overtime|currentIndex|stage|remaining/);
    }
});

test('filenames remain readable JSON names without path separators, control characters or reserved bare names', () => {
    for(const name of ['../CON\u0000 / test','', 'Ründown: Intro?', 'x'.repeat(500), '讨论']) {
        const filename=exportFilename(name);assert.match(filename,/^easytimer-.+\.json$/u);assert.doesNotMatch(filename,/[\\/\u0000-\u001f:]/);assert.ok(filename.length<100);
    }
});
