import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareSession, transitionSession, sessionRemaining, hasSessionProgress } from '../src/js/session.mjs';
import { createTimer, transition, formatTime, formatOvertime } from '../src/js/timer.mjs';

const template = () => ({ id:'workshop', name:'Workshop', transitionMode:'manual', phases:[
    {id:'opening',title:'Opening',durationSeconds:60}, {id:'discussion',title:'Discussion',durationSeconds:300},
] });
const act = (state, type, now) => transitionSession(state.run, state.clock, {type}, now);

test('preparation validates and snapshots templates with stable phase IDs and fresh run identity', () => {
    const saved = template(); const before = structuredClone(saved);
    const first = prepareSession(saved); const second = prepareSession(saved);
    assert.notEqual(first.run.runId, second.run.runId);
    assert.equal(first.run.sourceTemplateId, saved.id);
    assert.deepEqual(first.run.phases, saved.phases);
    assert.equal(first.clock.status, 'READY');
    assert.equal(first.clock.policy, 'session');
    assert.equal(hasSessionProgress(first.run, first.clock), false);
    first.run.phases[0].title = 'Run only';
    saved.phases[1].durationSeconds = 900;
    assert.equal(first.run.phases[1].durationSeconds, 300);
    assert.equal(saved.phases[0].title, before.phases[0].title);
    assert.equal('clock' in first.run, false, 'Metadata does not own another clock');
    for (const value of [null, {}, {...template(),phases:[]}]) assert.throws(() => prepareSession(value));
    assert.throws(() => prepareSession({...template(),transitionMode:'automatic'}), /Automatic/);
});

test('manual expiry and arbitrarily late callbacks never advance phases or consume future time', () => {
    let state = act(prepareSession(template()), 'START', 1000);
    state = act(state,'TICK',61000);
    assert.equal(state.clock.status,'FINISHED'); assert.equal(state.clock.overtimeMs,0);
    assert.equal(state.run.currentIndex,0); assert.equal(state.run.stage,'PHASE');
    state = act(state,'TICK',999999);
    assert.equal(state.clock.overtimeMs,938999);
    assert.equal(state.run.currentIndex,0);
    assert.equal(sessionRemaining(state.run,state.clock),300000);
});

test('pause and resume exclude paused time before expiry and during phase overtime', () => {
    let state = act(prepareSession(template()),'START',0);
    state = act(state,'PAUSE',1250);
    assert.equal(state.clock.remainingMs,58750);
    assert.equal(act(state,'TICK',100000).clock.remainingMs,58750);
    state = act(state,'RESUME',100000);
    state = act(state,'PAUSE',160000);
    assert.equal(state.clock.status,'OVERTIME_PAUSED'); assert.equal(state.clock.overtimeMs,1250);
    assert.equal(act(state,'TICK',900000).clock.overtimeMs,1250);
    state = act(state,'RESUME',1000000);
    state = act(state,'TICK',1002000);
    assert.equal(state.clock.overtimeMs,3250);
    assert.equal(state.run.currentIndex,0);
});

test('primary action at the exact deadline pauses overtime instead of restarting or advancing', () => {
    let state = act(prepareSession(template()),'PRIMARY',0);
    state = act(state,'PRIMARY',60000);
    assert.equal(state.clock.status,'OVERTIME_PAUSED'); assert.equal(state.clock.overtimeMs,0);
    state = act(state,'PRIMARY',90000);
    assert.equal(act(state,'TICK',91000).clock.overtimeMs,1000);
});

test('next discards unused time, prepares full duration and preserves settled overrun by stable ID', () => {
    const ready = prepareSession(template());
    for (const source of [ready, act(ready,'START',0), act(act(ready,'START',0),'PAUSE',30000), act(act(ready,'START',0),'TICK',65000)]) {
        const before = structuredClone(source);
        const next = act(source,'NEXT',65000);
        assert.equal(next.run.currentIndex,1); assert.equal(next.clock.status,'READY');
        assert.equal(next.clock.remainingMs,300000);
        assert.equal(sessionRemaining(next.run,next.clock),300000);
        assert.equal(next.run.phaseOvertime.opening, source.clock.status==='PAUSED'||source.clock.status==='READY'?0:5000);
        assert.equal(hasSessionProgress(next.run,next.clock),true, 'Between-phase READY still has progress');
        assert.deepEqual(source,before, 'Transitions do not mutate their inputs');
    }
    let state = act(act(prepareSession(template()),'START',0),'TICK',65000);
    state = act(state,'PAUSE',65000); state = act(state,'NEXT',999999);
    assert.equal(state.run.phaseOvertime.opening,5000);
    assert.equal(state.clock.status,'READY');
});

test('last manual phase requires explicit completion and final overtime starts at that instant', () => {
    let state = act(prepareSession(template()),'NEXT',0);
    state = act(state,'START',1000); state = act(state,'TICK',400000);
    assert.equal(state.run.stage,'PHASE'); assert.equal(state.clock.overtimeMs,99000);
    state = act(state,'COMPLETE',410000);
    assert.equal(state.run.stage,'COMPLETED'); assert.equal(state.clock.overtimeMs,0);
    assert.equal(state.run.phaseOvertime.discussion,109000);
    assert.equal(state.clock.deadlineMs,410000);
    assert.equal(sessionRemaining(state.run,state.clock),0);
    assert.equal(act(state,'TICK',415000).clock.overtimeMs,5000);
    assert.equal(act(state,'COMPLETE',415000).clock.deadlineMs,410000, 'Repeated completion cannot reset overtime');
});

test('completion may discard the last unused duration including a one-phase unstarted workshop', () => {
    const saved = {...template(),phases:[template().phases[0]]};
    for (const source of [prepareSession(saved),act(prepareSession(saved),'START',0)]) {
        const state = act(source,'COMPLETE',5000);
        assert.equal(state.run.stage,'COMPLETED'); assert.equal(state.clock.remainingMs,0);
        assert.equal(state.clock.overtimeMs,0); assert.equal(state.run.phaseOvertime.opening,0);
    }
});

test('final overtime pause and terminal stop remain frozen across long callback gaps', () => {
    let state = act(act(prepareSession(template()),'NEXT',0),'COMPLETE',1000);
    state = act(state,'PAUSE',6500);
    assert.equal(state.clock.overtimeMs,5500);
    assert.equal(act(state,'TICK',1000000).clock.overtimeMs,5500);
    state = act(state,'RESUME',1000000); state = act(state,'STOP_OVERTIME',1002000);
    assert.equal(state.clock.status,'OVERTIME_STOPPED'); assert.equal(state.clock.overtimeMs,7500);
    for (const type of ['TICK','PRIMARY','START','RESUME','PAUSE','STOP_OVERTIME','NEXT','COMPLETE']) {
        assert.deepEqual(act(state,type,2000000),state, 'Stopped completion cannot restart implicitly');
    }
    assert.equal(formatOvertime(state.clock.overtimeMs),'+00:07');
});

test('stop resets every session stage to the original snapshot without reloading a template', () => {
    let state = act(act(prepareSession(template()),'START',0),'TICK',65000);
    const sources = [state,act(state,'PAUSE',65000),act(state,'NEXT',65000)];
    sources.push(act(sources[2],'COMPLETE',70000));
    sources.push(act(sources[3],'STOP_OVERTIME',75000));
    for (const source of sources) {
        const reset = act(source,'STOP_WORKSHOP',1000000);
        assert.equal(reset.run.runId,source.run.runId);
        assert.equal(reset.run.currentIndex,0); assert.equal(reset.run.stage,'PHASE');
        assert.deepEqual(reset.run.phaseOvertime,{});
        assert.equal(reset.clock.remainingMs,60000); assert.equal(reset.clock.status,'READY');
        assert.equal(hasSessionProgress(reset.run,reset.clock),false);
    }
});

test('session duration policy accepts all template limits without changing Quick Timer limits', () => {
    const phases = Array.from({length:10},(_,i)=>({id:`p${i}`,title:`Phase ${i}`,durationSeconds:360000}));
    let state = prepareSession({...template(),phases});
    assert.equal(formatTime(sessionRemaining(state.run,state.clock)),'1000:00:00');
    assert.equal(formatTime(state.clock.remainingMs),'100:00:00');
    for (const type of ['START','STOP_WORKSHOP','NEXT','START','STOP_WORKSHOP']) state = act(state,type,1000000000);
    assert.equal(state.clock.policy,'session'); assert.equal(state.clock.remainingMs,360000000);
    assert.throws(()=>createTimer(360000000),/Invalid duration/);
    assert.throws(()=>createTimer(360000001,'session'),/Invalid duration/);
    const quick = transition(createTimer(1000),{type:'START'},0);
    assert.equal(transition(quick,{type:'PAUSE'},2000).status,'FINISHED');
    for (const type of ['BEGIN_OVERTIME','PAUSE_OVERTIME','RESUME_OVERTIME','STOP_OVERTIME']) {
        assert.deepEqual(transition(quick,{type},500),transition(quick,{type:'TICK'},500));
    }
    assert.equal(transition(createTimer(360000000,'session'),{type:'RESTART'},0).remainingMs,360000000);
});

test('unsupported actions cannot modify session phases or bypass phase progression', () => {
    const initial = prepareSession(template());
    assert.deepEqual(act(initial,'COMPLETE',1000),initial);
    assert.deepEqual(act(initial,'STOP_OVERTIME',1000),initial);
    assert.throws(()=>act(initial,'ADJUST',1000),/Unknown session action/);
    assert.throws(()=>act(initial,'TICK',NaN),/Invalid clock/);
    assert.throws(()=>transitionSession(initial.run,createTimer(),{type:'TICK'},0),/Invalid session clock/);
});
