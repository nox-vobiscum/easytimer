import test from 'node:test';
import assert from 'node:assert/strict';
import { createTimer, durationFromFields, formatOvertime, formatTime, timeBudget, transition } from '../src/js/timer.mjs';
const act = (state, type, now, extra = {}) => transition(state, { type, ...extra }, now);

test('start and background callback gaps use the original deadline', () => {
    let state = act(createTimer(60000), 'START', 1000);
    state = act(state, 'TICK', 46500);
    assert.equal(state.remainingMs, 14500);
    assert.equal(formatTime(state.remainingMs), '00:15');
    state = act(state, 'TICK', 999999);
    assert.equal(state.status, 'FINISHED');
    assert.equal(state.remainingMs, 0);
    assert.equal(state.overtimeMs, 938999);
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
    const finished = act(running, 'TICK', 20000);
    assert.deepEqual(act(finished, 'CONFIGURE', 20000, { durationMs: 5000 }), finished);
});
test('pre-start additions become planned duration; presets replace only ready configuration', () => {
    let state = act(createTimer(), 'CONFIGURE', 0, { durationMs: 900000 });
    state = act(state, 'ADJUST', 0, { amountMs: 300000 });
    assert.equal(state.durationMs, 1200000);
    assert.equal(state.adjustmentMs, 0);
    state = act(state, 'START', 1000);
    assert.equal(state.deadlineMs, 1201000);
    state = act(state, 'ADJUST', 2000, { amountMs: 300000 });
    assert.equal(state.durationMs, 1200000);
    assert.equal(state.adjustmentMs, 300000);
    assert.equal(state.deadlineMs, 1501000);
});
test('multiple additions preserve active elapsed time and paused state', () => {
    let state = act(createTimer(900000), 'START', 0);
    state = act(state, 'ADJUST', 60000, { amountMs: 300000 });
    assert.equal(state.remainingMs, 1140000);
    state = act(state, 'PAUSE', 120000);
    state = act(state, 'ADJUST', 999999, { amountMs: 90000 });
    assert.equal(state.status, 'PAUSED');
    assert.equal(state.remainingMs, 1170000);
    assert.equal(state.adjustmentMs, 390000);
    assert.equal(state.durationMs + state.adjustmentMs - state.remainingMs, 120000);
    assert.deepEqual(timeBudget(state), { plannedMs: 900000, adjustmentMs: 390000, totalMs: 1290000, elapsedMs: 120000 });
    state = act(state, 'RESUME', 2000000);
    assert.equal(state.deadlineMs, 3170000);
    assert.equal(act(state, 'TICK', 3200000).overtimeMs, 30000);
    assert.equal(act(state, 'STOP', 3200000).adjustmentMs, 0);
    const restarted = act(state, 'RESTART', 3200000);
    assert.equal(restarted.remainingMs, 900000);
    assert.equal(restarted.adjustmentMs, 0);
});
test('overtime extensions preserve the original elapsed history', () => {
    const finished = act(act(createTimer(900000), 'START', 0), 'TICK', 983000);
    const small = act(finished, 'ADJUST', 983000, { amountMs: 60000 });
    assert.equal(small.status, 'FINISHED');
    assert.equal(small.overtimeMs, 23000);
    assert.equal(timeBudget(small).elapsedMs, 983000);
    const large = act(finished, 'ADJUST', 983000, { amountMs: 300000 });
    assert.equal(large.status, 'RUNNING');
    assert.equal(large.remainingMs, 217000);
    assert.equal(large.durationMs + large.adjustmentMs - large.remainingMs, 983000);
    assert.equal(timeBudget(large).elapsedMs, 983000);
    const boundary = act(finished, 'ADJUST', 983000, { amountMs: 83000 });
    assert.equal(boundary.status, 'FINISHED');
    assert.equal(boundary.remainingMs, 0);
    assert.equal(boundary.overtimeMs, 0);
    assert.equal(act(boundary, 'TICK', 985000).overtimeMs, 2000);
    assert.equal(act(large, 'TICK', 1300000).overtimeMs, 100000);
    assert.equal(act(small, 'START', 1000000).adjustmentMs, 0);
});
test('budget limit and invalid additions leave valid state intact', () => {
    const ready = createTimer(359969000);
    assert.equal(act(ready, 'ADJUST', 0, { amountMs: 30000 }).durationMs, 359999000);
    for (const amountMs of [30001, 0, NaN, Infinity, 1.5]) {
        assert.deepEqual(act(ready, 'ADJUST', 0, { amountMs }), ready);
    }
    const running = act(ready, 'START', 0);
    const adjusted = act(running, 'ADJUST', 1000, { amountMs: 30000 });
    assert.equal(adjusted.durationMs + adjusted.adjustmentMs, 359999000);
    assert.deepEqual(act(adjusted, 'ADJUST', 1000, { amountMs: 1 }), adjusted);
});
test('invalid and zero durations are rejected without normalization', () => {
    for (const fields of [['0','0','0'], ['', '1', '0'], ['-1','0','0'], ['0','60','0'], ['0','0','60'], ['100','0','0'], ['0','1.5','0'], ['0','1e1','0'], ['NaN','0','0']]) {
        assert.equal(durationFromFields(...fields), null);
    }
    assert.equal(durationFromFields('99','59','59'), 359999000);
    for (const value of [-1, NaN, Infinity, 1.5, 360000000]) assert.throws(() => createTimer(value), RangeError);
    assert.throws(() => createTimer(0, 'session'), RangeError);
});

test('signed adjustments preserve elapsed time, exact expiry, delayed overtime and original duration', () => {
    const running = act(createTimer(300000), 'START', 1000000);
    const crossed = act(running, 'ADJUST', 1280000, { amountMs: -60000 });
    assert.equal(crossed.status, 'FINISHED'); assert.equal(crossed.overtimeMs, 0);
    assert.equal(crossed.adjustmentMs, -20000);
    assert.equal(crossed.deadlineMs, 1280000); assert.equal(timeBudget(crossed).elapsedMs, 280000);
    const more = act(crossed, 'ADJUST', 1290000, { amountMs: -30000 });
    assert.equal(more.overtimeMs, 10000); assert.equal(timeBudget(more).elapsedMs, 290000);
    assert.equal(more.deadlineMs, crossed.deadlineMs); assert.equal(more.adjustmentMs, crossed.adjustmentMs);
    const exact = act(running, 'ADJUST', 1240000, { amountMs: -60000 });
    assert.equal(exact.status, 'FINISHED'); assert.equal(exact.overtimeMs, 0);
    assert.equal(act(exact, 'TICK', 1241000).overtimeMs, 1000);
    assert.equal(act(more, 'STOP', 1300000).durationMs, 300000);
    assert.equal(act(more, 'RESTART', 1300000).deadlineMs, 1600000);
    assert.equal(act(more, 'START', 1300000).adjustmentMs, 0);
});

test('READY reductions become configuration; paused reductions clamp and freeze at zero', () => {
    const ready = act(createTimer(300000), 'ADJUST', 0, { amountMs: -60000 });
    assert.equal(ready.status, 'READY'); assert.equal(ready.durationMs, 240000);
    assert.equal(act(ready, 'RESTART', 10000).deadlineMs, 250000);
    let paused = act(act(createTimer(300000), 'START', 1000000), 'PAUSE', 1240000);
    paused = act(paused, 'ADJUST', 2000000, { amountMs: -30000 });
    assert.equal(paused.remainingMs, 30000); assert.equal(paused.deadlineMs, null);
    assert.equal(paused.status, 'PAUSED'); assert.equal(timeBudget(paused).elapsedMs, 240000);
    for (const amountMs of [-30000, -60000]) {
        const zero = act(paused, 'ADJUST', 3000000, { amountMs });
        assert.equal(zero.status, 'PAUSED'); assert.equal(zero.remainingMs, 0); assert.equal(zero.deadlineMs, null);
        assert.equal(zero.adjustmentMs, -60000); assert.equal(zero.overtimeMs, 0);
        assert.deepEqual(act(zero, 'TICK', 9000000), zero);
        const resumed = act(zero, 'RESUME', 9000000);
        assert.equal(resumed.status, 'FINISHED'); assert.equal(resumed.deadlineMs, 9000000); assert.equal(resumed.overtimeMs, 0);
        assert.equal(act(resumed, 'TICK', 9010000).overtimeMs, 10000);
    }
    assert.equal(act(paused, 'RESUME', 3000000).deadlineMs, 3030000);
});

test('signed adjustment budget boundaries reject entire operations and retain Session restrictions', () => {
    const ready = createTimer(31000);
    assert.equal(act(ready, 'ADJUST', 0, { amountMs: -30000 }).durationMs, 1000);
    for (const amountMs of [-Infinity, -1.5]) {
        assert.deepEqual(act(ready, 'ADJUST', 0, { amountMs }), ready);
    }
    for (const amountMs of [-31000, -3600000, Number.MIN_SAFE_INTEGER]) {
        const zero = act(ready, 'ADJUST', 0, { amountMs });
        assert.deepEqual(zero, createTimer(0));
        assert.deepEqual(act(zero, 'START', 0), zero); assert.deepEqual(act(zero, 'RESTART', 0), zero);
        assert.equal(act(zero, 'ADJUST', 0, { amountMs: 30000 }).durationMs, 30000);
    }
    const session = act(createTimer(60000, 'session'), 'START', 1000000);
    assert.deepEqual(act(session, 'ADJUST', 1000000, { amountMs: -30000 }), session);
});

test('subtraction uses fractional remaining milliseconds and reconciles expiry before a late action', () => {
    const running = act(createTimer(60000), 'START', 1000000);
    const shorter = act(running, 'ADJUST', 1010250, { amountMs: -30000 });
    assert.equal(shorter.remainingMs, 19750); assert.equal(timeBudget(shorter).elapsedMs, 10250);
    const zero = act(shorter, 'ADJUST', 1029750, { amountMs: -30000 });
    assert.equal(zero.adjustmentMs, -30250); assert.equal(zero.deadlineMs, 1029750); assert.equal(zero.overtimeMs, 0);
    const late = act(running, 'ADJUST', 1070000, { amountMs: -30000 });
    assert.equal(late.deadlineMs, 1060000); assert.equal(late.overtimeMs, 10000); assert.equal(late.adjustmentMs, 0);
    const immediate = act(running, 'ADJUST', 1000000, { amountMs: -3600000 });
    assert.equal(timeBudget(immediate).totalMs, 0); assert.equal(timeBudget(immediate).elapsedMs, 0);
    assert.equal(immediate.deadlineMs, 1000000);
});
test('expiry wins over a late pause; repeated start does not reset a run', () => {
    const state = act(createTimer(1000), 'START', 0);
    assert.equal(act(state, 'PAUSE', 1000).status, 'FINISHED');
    assert.equal(act(state, 'START', 500).deadlineMs, 1000);
});
test('expiry and overtime use the original deadline', () => {
    let state = act(createTimer(1000), 'START', 5000);
    state = act(state, 'TICK', 6000);
    assert.equal(state.status, 'FINISHED');
    assert.equal(state.remainingMs, 0);
    assert.equal(state.deadlineMs, 6000);
    assert.equal(state.overtimeMs, 0);
    state = act(state, 'TICK', 8750);
    assert.equal(state.overtimeMs, 2750);
    assert.equal(formatOvertime(state.overtimeMs), '+00:02');
});
test('pause before expiry never accumulates overtime', () => {
    let state = act(createTimer(10000), 'START', 0);
    state = act(state, 'PAUSE', 9000);
    state = act(state, 'TICK', 90000);
    assert.equal(state.status, 'PAUSED');
    assert.equal(state.remainingMs, 1000);
    assert.equal(state.overtimeMs, 0);
});
test('restart, stop and a new start clear overtime', () => {
    const finished = act(act(createTimer(5000), 'START', 1000), 'TICK', 9000);
    assert.equal(finished.overtimeMs, 3000);
    const restarted = act(finished, 'RESTART', 10000);
    assert.equal(restarted.overtimeMs, 0);
    assert.equal(restarted.deadlineMs, 15000);
    assert.deepEqual(act(finished, 'STOP', 10000), createTimer(5000));
    const started = act(finished, 'START', 10000);
    assert.equal(started.overtimeMs, 0);
    assert.equal(started.deadlineMs, 15000);
});
test('display rounds upward and includes hours only when necessary', () => {
    assert.equal(formatTime(1), '00:01');
    assert.equal(formatTime(60000), '01:00');
    assert.equal(formatTime(3600000), '01:00:00');
    assert.equal(formatTime(-100), '00:00');
    assert.equal(formatOvertime(0), '+00:00');
    assert.equal(formatOvertime(999), '+00:00');
    assert.equal(formatOvertime(1000), '+00:01');
    assert.equal(formatOvertime(3600000), '+01:00:00');
});
