import test from 'node:test';
import assert from 'node:assert/strict';
import { createTimer, durationFromFields, formatTime, transition } from '../src/js/timer.mjs';
const act = (state, type, now, extra = {}) => transition(state, { type, ...extra }, now);

test('start and background callback gaps use the original deadline', () => {
    let state = act(createTimer(60000), 'START', 1000);
    state = act(state, 'TICK', 46500);
    assert.equal(state.remainingMs, 14500);
    assert.equal(formatTime(state.remainingMs), '00:15');
    state = act(state, 'TICK', 999999);
    assert.equal(state.status, 'FINISHED');
    assert.equal(state.remainingMs, 0);
    assert.equal(formatTime(state.remainingMs), '00:00');
});
test('pause freezes fractional time; resume excludes the paused interval', () => {
    let state = act(createTimer(10000), 'START', 0);
    state = act(state, 'PAUSE', 1250);
    assert.equal(state.remainingMs, 8750);
    assert.equal(act(state, 'TICK', 90000).remainingMs, 8750);
    state = act(state, 'RESUME', 90000);
    assert.equal(act(state, 'TICK', 91000).remainingMs, 7750);
    assert.equal(act(state, 'TICK', 98750).status, 'FINISHED');
});
test('restart and stop restore original duration in every state', () => {
    const ready = createTimer(10000);
    const running = act(ready, 'START', 0);
    const paused = act(running, 'PAUSE', 2500);
    const finished = act(running, 'TICK', 20000);
    for (const state of [ready, running, paused, finished]) {
        assert.deepEqual(act(state, 'STOP', 30000), ready);
        const restarted = act(state, 'RESTART', 30000);
        assert.equal(restarted.status, 'RUNNING');
        assert.equal(restarted.remainingMs, 10000);
        assert.equal(restarted.deadlineMs, 40000);
    }
    assert.equal(act(finished, 'START', 30000).deadlineMs, 40000);
});
test('configuration cannot replace a running or paused countdown', () => {
    const running = act(createTimer(10000), 'START', 0);
    assert.equal(act(running, 'CONFIGURE', 1000, { durationMs: 5000 }).durationMs, 10000);
    const paused = act(running, 'PAUSE', 1000);
    assert.deepEqual(act(paused, 'CONFIGURE', 2000, { durationMs: 5000 }), paused);
    assert.equal(act(createTimer(), 'CONFIGURE', 0, { durationMs: 5000 }).durationMs, 5000);
});
test('invalid and zero durations are rejected without normalization', () => {
    for (const fields of [['0','0','0'], ['', '1', '0'], ['-1','0','0'], ['0','60','0'], ['0','0','60'], ['100','0','0'], ['0','1.5','0'], ['0','1e1','0'], ['NaN','0','0']]) {
        assert.equal(durationFromFields(...fields), null);
    }
    assert.equal(durationFromFields('99','59','59'), 359999000);
    for (const value of [0, -1, NaN, Infinity, 1.5, 360000000]) assert.throws(() => createTimer(value), RangeError);
});
test('expiry wins over a late pause; repeated start does not reset a run', () => {
    const state = act(createTimer(1000), 'START', 0);
    assert.equal(act(state, 'PAUSE', 1000).status, 'FINISHED');
    assert.equal(act(state, 'START', 500).deadlineMs, 1000);
});
test('display rounds upward and includes hours only when necessary', () => {
    assert.equal(formatTime(1), '00:01');
    assert.equal(formatTime(60000), '01:00');
    assert.equal(formatTime(3600000), '01:00:00');
    assert.equal(formatTime(-100), '00:00');
});
