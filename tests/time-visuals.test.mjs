import test from 'node:test';
import assert from 'node:assert/strict';
import { endgameThreshold, timeVisualState } from '../src/js/time-visuals.mjs';
import { createTimer, transition, timeBudget, formatTime } from '../src/js/timer.mjs';
import { prepareSession, transitionSession } from '../src/js/session.mjs';

const visual = clock => timeVisualState(clock, timeBudget(clock).totalMs);
const act = (clock,type,now,extra={}) => transition(clock,{type,...extra},now);
const sessionAct = (state,type,now) => transitionSession(state.run,state.clock,{type},now);

test('five exact fixed buckets include duration boundaries without rounding or caps', () => {
    for (const [durationMs,thresholdMs] of [
        [1,10000],[179999,10000],[180000,10000],[180001,30000],[210000,30000],
        [599999,30000],[600000,30000],[600001,60000],[630000,60000],
        [1799999,60000],[1800000,60000],[1800001,180000],[1830000,180000],
        [3599999,180000],[3600000,180000],[3600001,300000],[3630000,300000],[360000000,300000],
    ]) assert.equal(endgameThreshold(durationMs),thresholdMs,`Budget ${durationMs} ms`);
});

test('running and paused states use real positive milliseconds at every threshold', () => {
    for (const durationMs of [180000,600000,1800000,3600000,3600001]) {
        const threshold = endgameThreshold(durationMs);
        for (const status of ['RUNNING','PAUSED']) {
            for (const [remainingMs,expected] of [[threshold+1,'NORMAL'],[threshold,'ENDGAME'],[threshold-1,'ENDGAME'],[1,'ENDGAME'],[0,'EXPIRED']]) {
                assert.equal(timeVisualState({status,remainingMs},durationMs),expected);
            }
        }
    }
    assert.equal(formatTime(10001),'00:11');
    assert.equal(formatTime(9999),'00:10');
    assert.equal(timeVisualState({status:'RUNNING',remainingMs:10001},180000),'NORMAL');
});

test('READY is always normal, including tiny timeboxes and stopped/restarted runs', () => {
    for (const durationMs of [1,1000,10000,180000,3600000]) assert.equal(visual(createTimer(durationMs)),'NORMAL');
    const expired = act(act(createTimer(60000),'START',0),'TICK',65000);
    assert.equal(visual(act(expired,'STOP',65000)),'NORMAL');
    assert.equal(visual(act(expired,'START',65000)),'NORMAL');
    assert.equal(visual(act(expired,'RESTART',65000)),'NORMAL');
    assert.equal(visual(act(createTimer(1000),'START',0)),'ENDGAME','A fixed threshold is not capped to a percentage of a tiny timebox');
});

test('exact expiry and every running, paused or stopped overtime state stay expired', () => {
    let clock=act(createTimer(60000),'START',0);
    assert.equal(visual(act(clock,'TICK',59999)),'ENDGAME');
    clock=act(clock,'TICK',60000);
    assert.equal(clock.overtimeMs,0); assert.equal(visual(clock),'EXPIRED');
    assert.equal(visual(act(clock,'TICK',999999)),'EXPIRED');
    for (const status of ['FINISHED','OVERTIME_PAUSED','OVERTIME_STOPPED']) {
        assert.equal(timeVisualState({status,remainingMs:0},60000),'EXPIRED');
    }
});

test('Quick additions use effective pre-start and post-start budgets in the same run', () => {
    let clock=act(createTimer(180000),'ADJUST',0,{amountMs:30000});
    assert.equal(visual(clock),'NORMAL');
    assert.equal(endgameThreshold(timeBudget(clock).totalMs),30000);
    clock=act(clock,'START',0); clock=act(clock,'TICK',185000);
    assert.equal(clock.remainingMs,25000); assert.equal(visual(clock),'ENDGAME');
    clock=act(clock,'ADJUST',185000,{amountMs:30000});
    assert.equal(clock.remainingMs,55000); assert.equal(visual(clock),'NORMAL');
    assert.equal(clock.durationMs,210000); assert.equal(clock.adjustmentMs,30000);
    let paused=act(act(createTimer(180000),'START',0),'PAUSE',175000);
    assert.equal(visual(paused),'ENDGAME');
    paused=act(paused,'ADJUST',999999,{amountMs:30000});
    assert.equal(paused.status,'PAUSED'); assert.equal(paused.remainingMs,35000);
    assert.equal(endgameThreshold(timeBudget(paused).totalMs),30000); assert.equal(visual(paused),'NORMAL');
});

test('compensating Quick overtime derives new colors without resetting elapsed history', () => {
    const expired=act(act(createTimer(180000),'START',0),'TICK',185000);
    assert.equal(visual(expired),'EXPIRED');
    const endgame=act(expired,'ADJUST',185000,{amountMs:30000});
    assert.equal(endgame.remainingMs,25000); assert.equal(visual(endgame),'ENDGAME');
    const normal=act(endgame,'ADJUST',185000,{amountMs:30000});
    assert.equal(normal.remainingMs,55000); assert.equal(visual(normal),'NORMAL');
    assert.equal(timeBudget(normal).elapsedMs,185000);
    const exact=act(expired,'ADJUST',185000,{amountMs:5000});
    assert.equal(exact.status,'FINISHED'); assert.equal(exact.overtimeMs,0); assert.equal(visual(exact),'EXPIRED');
});

test('Session visual state uses the current phase, never the workshop total', () => {
    let state=prepareSession({id:'workshop',name:'Workshop',transitionMode:'manual',phases:[
        {id:'short',title:'Short phase',durationSeconds:60},
        {id:'long',title:'Long phase',durationSeconds:900},
    ]});
    const original=structuredClone(state);
    assert.equal(visual(state.clock),'NORMAL');
    state=sessionAct(state,'START',0); state=sessionAct(state,'TICK',45000);
    assert.equal(state.clock.remainingMs,15000); assert.equal(visual(state.clock),'NORMAL','Long workshop must not trigger a 30/60-second phase threshold');
    state=sessionAct(state,'PAUSE',50000); assert.equal(visual(state.clock),'ENDGAME');
    state=sessionAct(state,'RESUME',100000); state=sessionAct(state,'TICK',110000);
    assert.equal(visual(state.clock),'EXPIRED');
    state=sessionAct(state,'PAUSE',115000); assert.equal(visual(state.clock),'EXPIRED');
    state=sessionAct(state,'NEXT',999999);
    assert.equal(visual(state.clock),'NORMAL'); assert.equal(endgameThreshold(state.clock.durationMs),60000);
    state=sessionAct(state,'START',1000000); state=sessionAct(state,'TICK',1840000);
    assert.equal(state.clock.remainingMs,60000); assert.equal(visual(state.clock),'ENDGAME');
    state=sessionAct(state,'COMPLETE',1840000); assert.equal(visual(state.clock),'EXPIRED');
    for (const [type,now] of [['TICK',1845000],['PAUSE',1845000],['TICK',1900000],['RESUME',1900000],['STOP_OVERTIME',1901000],['TICK',9999999]]) {
        state=sessionAct(state,type,now); assert.equal(visual(state.clock),'EXPIRED');
    }
    state=sessionAct(state,'STOP_WORKSHOP',10000000); assert.equal(visual(state.clock),'NORMAL');
    assert.deepEqual(state.run.phases,original.run.phases);
});

test('visual derivation is pure and never advances or mutates the authoritative clock', () => {
    const clock=act(createTimer(60000),'START',0);
    const before=structuredClone(clock);
    for(let i=0;i<10;i++)assert.equal(visual(clock),'NORMAL');
    assert.deepEqual(clock,before);
});
