import test from 'node:test';
import assert from 'node:assert/strict';
import { createTimer, transition, timeBudget } from '../src/js/timer.mjs';
import { createRecovery, validateRuntime, restoreRuntime } from '../src/js/recovery.mjs';
import { prepareSession, transitionSession, sessionRemaining } from '../src/js/session.mjs';

const prefix = 'easyTimerRuntime.v1.';
const contextKey = 'easyTimerRuntimeContext.v1';
function memory() {
    const data = new Map();
    return { data, writes: 0, fail: false, get length() { return data.size; }, key(i) { return [...data.keys()][i]; },
        getItem(key) { if (this.fail) throw new Error('blocked'); return data.get(key) ?? null; },
        setItem(key, value) { if (this.fail) throw new Error('quota'); this.writes++; data.set(key, value); },
        removeItem(key) { if (this.fail) throw new Error('blocked'); this.writes++; data.delete(key); } };
}
function lockManager() {
    const held = new Set();
    return { query: async () => ({ held: [...held].map(name => ({ name })) }), request(name, options, callback) {
        if (held.has(name)) return Promise.resolve(callback(null));
        held.add(name);
        return Promise.resolve(callback({ name })).finally(() => held.delete(name));
    } };
}
const record = clock => ({ schemaVersion: 1, contextId: 'test-context', savedAt: 10000, mode: 'quick', clock });
const act = (clock, type, now = 10000, extra = {}) => transition(clock, { type, ...extra }, now);

for (const status of ['READY', 'RUNNING', 'PAUSED', 'FINISHED']) {
    test(`${status}: validated roundtrip and authoritative elapsed time`, () => {
        let clock = createTimer(60000);
        if (status !== 'READY') clock = act(clock, 'START', 0);
        if (status === 'PAUSED') clock = act(clock, 'PAUSE', 10000);
        if (status === 'FINISHED') clock = act(clock, 'TICK', 80000);
        else clock = act(clock, 'TICK', 10000);
        const saved = { ...record(clock), savedAt: status === 'FINISHED' ? 80000 : 10000 };
        const restored = restoreRuntime(JSON.parse(JSON.stringify(saved)), 90000);
        assert.deepEqual(restored, act(clock, 'TICK', 90000));
        assert.equal(restored.status, status === 'RUNNING' ? 'FINISHED' : status);
    });
}
test('extensions preserve original duration, paused budget, Stop and Restart semantics', () => {
    let clock = act(createTimer(60000), 'START', 0);
    clock = act(clock, 'ADJUST', 10000, { amountMs: 30000 });
    clock = act(clock, 'PAUSE');
    const restored = restoreRuntime(record(clock), 9000000);
    assert.deepEqual(timeBudget(restored), timeBudget(clock));
    assert.equal(act(restored, 'STOP').remainingMs, 60000);
    assert.equal(act(restored, 'RESTART').deadlineMs, 70000);
});
test('actual start metadata survives extensions, pause/resume and reload; old records stay explicitly unknown', async () => {
    const storage = memory(), tabs = memory(), locks = lockManager(); let now = 10000;
    const options = { storage, tabs, locks, now: () => now, uuid: () => 'started' };
    let runtime = await createRecovery(options);
    let clock = createTimer(60000); runtime.save(clock);
    clock = act(clock, 'START', now); runtime.save(clock, 'START');
    const saved = () => JSON.parse(storage.getItem(prefix + 'started'));
    assert.equal(saved().startedAt, 10000);
    now = 20000; clock = act(clock, 'ADJUST', now, { amountMs: 30000 }); runtime.save(clock, 'ADJUST');
    assert.equal(saved().startedAt, 10000); assert.equal(saved().clock.durationMs + saved().clock.adjustmentMs, 90000);
    clock = act(clock, 'PAUSE', now); runtime.save(clock, 'PAUSE');
    now = 40000; clock = act(clock, 'RESUME', now); runtime.save(clock, 'RESUME');
    assert.equal(saved().startedAt, 10000); assert.notEqual(saved().savedAt, saved().startedAt);
    runtime.close(); await Promise.resolve(); runtime = await createRecovery(options);
    runtime.save(runtime.restored); assert.equal(saved().startedAt, 10000);
    now = 50000; clock = act(runtime.restored, 'RESTART', now); runtime.save(clock, 'RESTART');
    assert.equal(saved().startedAt, 50000);
    runtime.save(act(clock, 'STOP', now), 'STOP'); assert.equal(saved().startedAt, null); runtime.close();
    const old = record(act(createTimer(), 'START'));
    assert.equal(Object.hasOwn(validateRuntime(old), 'startedAt'), false, 'No inferred legacy start');
    assert.throws(() => validateRuntime({ ...old, startedAt: -1 }), /INVALID_START/);
});

test('availability inspection is read-only and stale availability never grants ownership', async () => {
    const storage = memory(), locks = lockManager();
    const a = await createRecovery({ storage, locks, tabs: memory(), now: () => 10000, uuid: () => 'owner' });
    a.save(createTimer());
    const c = await createRecovery({ storage, locks, tabs: memory(), now: () => 10000, uuid: () => 'chooser' });
    assert.equal(c.candidates[0].activeElsewhere, true);
    const before = storage.writes;
    await c.refreshAvailability(); assert.equal(storage.writes, before);
    a.close(); await Promise.resolve(); await c.refreshAvailability();
    assert.equal(c.candidates[0].activeElsewhere, false);
    const newOwner = await createRecovery({ storage, locks, tabs: { ...memory(), getItem: () => 'owner' }, now: () => 10000 });
    await assert.rejects(c.recover('owner'), /CONTEXT_ACTIVE/);
    assert.equal(c.candidates[0].activeElsewhere, true); assert.equal(storage.writes, before);
    newOwner.close(); c.close();
});
test('corrupt, unsupported and inconsistent records never restore', () => {
    const valid = record(createTimer());
    for (const invalid of [null, {}, { ...valid, schemaVersion: 2 }, { ...valid, mode: 'session' },
        { ...valid, contextId: '../unsafe' }, { ...valid, extra: true },
        { ...valid, clock: { ...valid.clock, remainingMs: 1 } },
        { ...valid, clock: { ...valid.clock, policy: 'session' } },
        { ...valid, clock: { ...valid.clock, status: 'PAUSED', overtimeMs: 1000 } },
        { ...valid, clock: { ...valid.clock, status: 'FINISHED', remainingMs: 0, deadlineMs: 5000 } }]) {
        assert.throws(() => validateRuntime(invalid));
    }
    assert.throws(() => restoreRuntime(record(act(createTimer(), 'START')), 9999), /CLOCK_ANOMALY/);
});
test('same-tab reload restores; duplicated live tab ID cannot overwrite owner', async () => {
    const storage = memory(), tabs = memory(), locks = lockManager();
    let now = 10000;
    const options = { storage, tabs, locks, now: () => now, uuid: () => 'first' };
    const first = await createRecovery(options);
    first.save(act(createTimer(60000), 'START'));
    const duplicateTabs = memory(); duplicateTabs.setItem(contextKey, tabs.getItem(contextKey));
    const duplicate = await createRecovery({ ...options, tabs: duplicateTabs, uuid: () => 'duplicate' });
    assert.equal(duplicate.restored, null);
    duplicate.save(createTimer(120000));
    assert.equal(JSON.parse(storage.getItem(prefix + 'first')).clock.durationMs, 60000);
    await assert.rejects(duplicate.recover('first'), /CONTEXT_ACTIVE/);
    duplicate.close(); first.close(); await Promise.resolve();
    now = 80000;
    const reload = await createRecovery(options);
    assert.equal(reload.restored.status, 'FINISHED');
    assert.equal(reload.restored.overtimeMs, 10000);
    reload.close();
});
test('restart without association offers all candidates; explicit selection rechecks ownership', async () => {
    const storage = memory(), locks = lockManager();
    for (const id of ['one', 'two']) {
        const runtime = await createRecovery({ storage, locks, tabs: memory(), now: () => 10000, uuid: () => id });
        runtime.save(createTimer(id === 'one' ? 60000 : 120000)); runtime.close(); await Promise.resolve();
    }
    const runtime = await createRecovery({ storage, locks, tabs: memory(), now: () => 20000, uuid: () => 'new' });
    assert.equal(runtime.restored, null); assert.equal(runtime.candidates.length, 2);
    runtime.save(act(createTimer(180000), 'START', 20000));
    const restored = await runtime.recover('two');
    assert.equal(restored.status, 'READY'); assert.equal(restored.durationMs, 120000);
    assert.equal(storage.getItem(prefix + 'new'), null, 'Explicitly replaced timer cannot reappear');
    runtime.close();
});
test('Stop, Restart and mode replacement persist immediately without old run resurrection', async () => {
    const storage = memory(), tabs = memory(), locks = lockManager();
    const options = { storage, tabs, locks, now: () => 10000, uuid: () => 'stop' };
    let runtime = await createRecovery(options);
    let clock = act(createTimer(60000), 'START'); runtime.save(clock);
    clock = act(clock, 'STOP'); runtime.save(clock); runtime.close(); await Promise.resolve();
    runtime = await createRecovery(options); assert.equal(runtime.restored.status, 'READY');
    runtime.save(act(runtime.restored, 'RESTART')); runtime.close(); await Promise.resolve();
    runtime = await createRecovery(options); assert.equal(runtime.restored.deadlineMs, 70000);
    runtime.save(null); runtime.close(); await Promise.resolve();
    runtime = await createRecovery(options); assert.equal(runtime.restored, null); runtime.close();
});
test('ticks and repeated renders cause no periodic writes', async () => {
    const storage = memory(); let now = 10000;
    const runtime = await createRecovery({ storage, tabs: memory(), locks: lockManager(), now: () => now, uuid: () => 'ticks' });
    const clock = act(createTimer(60000), 'START'); runtime.save(clock);
    const writes = storage.writes;
    for (let i = 0; i < 100; i++) { now += 100; runtime.save(act(clock, 'TICK', now)); }
    assert.equal(storage.writes, writes); runtime.close();
});
test('unavailable locks, storage and quota fail visibly without throwing into timer operation', async () => {
    for (const kind of ['locks', 'storage', 'quota']) {
        const storage = memory(); if (kind === 'storage') storage.fail = true;
        const runtime = await createRecovery({ storage, tabs: memory(), locks: kind === 'locks' ? null : lockManager(), now: () => 10000, uuid: () => kind });
        if (kind === 'quota') storage.fail = true;
        assert.equal(runtime.save(createTimer()), false); assert.ok(runtime.error);
        assert.equal(act(createTimer(), 'START').status, 'RUNNING'); runtime.close();
    }
});
test('invalid associated record is not restored; backward clock invalidates persistence', async () => {
    const storage = memory(), tabs = memory(); let now = 10000;
    tabs.setItem(contextKey, 'bad'); storage.setItem(prefix + 'bad', '{broken');
    const runtime = await createRecovery({ storage, tabs, locks: lockManager(), now: () => now });
    assert.equal(runtime.restored, null); assert.ok(runtime.error);
    const clock = act(createTimer(), 'START'); runtime.save(clock); now = 9000;
    assert.equal(runtime.save(clock), false); assert.equal(runtime.error, 'CLOCK_ANOMALY'); runtime.close();
});
test('stale recovery review does not install another context', async () => {
    const storage = memory(), locks = lockManager();
    storage.setItem(prefix + 'test-context', JSON.stringify(record(createTimer())));
    const tabs = memory();
    const runtime = await createRecovery({ storage, tabs, locks, now: () => 10000, uuid: () => 'local' });
    await assert.rejects(runtime.recover('test-context', () => false), /STALE_RECOVERY/);
    assert.equal(tabs.getItem(contextKey), 'local'); runtime.save(createTimer());
    assert.ok(storage.getItem(prefix + 'local')); runtime.close();
});

const sessionTemplate = (mode = 'manual') => ({ id: 'saved-rundown', name: 'Synthetic workshop', transitionMode: mode,
    phases: [60, 120, 60].map((durationSeconds, index) => ({ id: `phase-${index}`, title: `Phase ${index}`, durationSeconds })) });
const sessionAct = (state, type, now) => transitionSession(state.run, state.clock, { type }, now);
const sessionRecord = (state, now) => ({ schemaVersion: 1, contextId: 'session-context', savedAt: now,
    mode: 'session', run: state.run, clock: state.clock, quickDurationMs: 90000, startedAt: null });

for (const mode of ['manual', 'automatic']) for (const status of ['READY', 'RUNNING', 'PAUSED']) {
    test(`Session ${mode} ${status} restores the original run/snapshot with one authoritative clock`, () => {
        const source = sessionTemplate(mode);
        let state = prepareSession(source, 'stable-run');
        if (status !== 'READY') state = sessionAct(state, 'START', 0);
        state = sessionAct(state, status === 'PAUSED' ? 'PAUSE' : 'TICK', 10000);
        const saved = JSON.parse(JSON.stringify(sessionRecord(state, 10000)));
        source.name = 'Changed saved definition'; source.phases[0].durationSeconds = 600;
        const at = status === 'PAUSED' ? 9000000 : 20000;
        const restored = restoreRuntime(saved, at);
        assert.deepEqual(restored, { ...sessionAct(state, 'TICK', at), quickDurationMs: 90000 });
        assert.equal(restored.run.runId, 'stable-run'); assert.equal(restored.run.name, 'Synthetic workshop');
        assert.equal(restored.clock.status, status); assert.equal(restored.run.phases[0].durationSeconds, 60);
        assert.equal(sessionRemaining(restored.run, restored.clock), sessionRemaining(state.run, sessionAct(state, 'TICK', at).clock));
        assert.equal(restored.run === state.run, false, 'Restoration does not alias the input snapshot');
    });
}

test('manual absence retains current-phase overtime; Next settles it and restores a full READY phase', () => {
    const running = sessionAct(prepareSession(sessionTemplate(), 'manual-overtime'), 'START', 0);
    const checkpoint = sessionAct(running, 'TICK', 10000);
    let restored = restoreRuntime(sessionRecord(checkpoint, 10000), 180000);
    assert.equal(restored.run.currentIndex, 0); assert.equal(restored.clock.overtimeMs, 120000);
    assert.equal(sessionRemaining(restored.run, restored.clock), 180000);
    restored = sessionAct(restored, 'NEXT', 180000);
    restored = restoreRuntime(sessionRecord(restored, 180000), 3600000);
    assert.equal(restored.clock.status, 'READY'); assert.equal(restored.clock.remainingMs, 120000);
    assert.deepEqual(restored.run.phaseOvertime, { 'phase-0': 120000 });
});

test('automatic recovery catches up at exact scheduled boundaries without callback drift', () => {
    const running = sessionAct(prepareSession(sessionTemplate('automatic'), 'automatic-run'), 'START', 0);
    const saved = sessionRecord(sessionAct(running, 'TICK', 10000), 10000);
    for (const now of [60000, 180000, 240000, 3600000]) {
        const restored = restoreRuntime(saved, now);
        let timely = running;
        for (const boundary of [60000, 180000, 240000].filter(time => time <= now)) timely = sessionAct(timely, 'TICK', boundary);
        timely = sessionAct(timely, 'TICK', now);
        assert.deepEqual(restored, { ...timely, quickDurationMs: 90000 });
        assert.deepEqual(restoreRuntime(sessionRecord(restored, now), now), restored, 'Repeated restoration is idempotent');
    }
    const complete = restoreRuntime(saved, 3600000);
    assert.equal(complete.clock.deadlineMs, 240000); assert.equal(complete.clock.overtimeMs, 3360000);
    assert.equal(complete.run.stage, 'COMPLETED'); assert.equal(sessionRemaining(complete.run, complete.clock), 0);
});

test('paused phase overtime and final paused/stopped overtime remain frozen across long interruptions', () => {
    let state = sessionAct(prepareSession(sessionTemplate(), 'frozen-run'), 'START', 0);
    state = sessionAct(state, 'PAUSE', 75000);
    let restored = restoreRuntime(sessionRecord(state, 75000), 3600000);
    assert.equal(restored.clock.status, 'OVERTIME_PAUSED'); assert.equal(restored.clock.overtimeMs, 15000);
    restored = sessionAct(restored, 'RESUME', 3600000);
    restored = sessionAct(restored, 'NEXT', 3605000);
    assert.equal(restored.run.phaseOvertime['phase-0'], 20000);
    restored = sessionAct(restored, 'NEXT', 3605000);
    restored = sessionAct(restored, 'COMPLETE', 3606000);
    assert.equal(restored.clock.deadlineMs, 3606000, 'Early manual completion starts overtime at the explicit completion');
    restored = sessionAct(restored, 'PAUSE', 3616000);
    restored = restoreRuntime(sessionRecord(restored, 3616000), 9000000);
    assert.equal(restored.clock.status, 'OVERTIME_PAUSED'); assert.equal(restored.clock.overtimeMs, 10000);
    restored = sessionAct(restored, 'RESUME', 9000000);
    restored = sessionAct(restored, 'STOP_OVERTIME', 9005000);
    restored = restoreRuntime(sessionRecord(restored, 9005000), 999999999);
    assert.equal(restored.clock.status, 'OVERTIME_STOPPED'); assert.equal(restored.clock.overtimeMs, 15000);
    for (const type of ['TICK', 'PRIMARY', 'START', 'RESUME']) assert.deepEqual(sessionAct(restored, type, 1000000000), { run: restored.run, clock: restored.clock });
});

test('Session Stop, replacement and mode invalidation cannot resurrect an old run', async () => {
    const storage = memory(), tabs = memory(), locks = lockManager(); let now = 10000;
    const options = { storage, tabs, locks, now: () => now, uuid: () => 'session-persist' };
    let runtime = await createRecovery(options);
    let state = prepareSession(sessionTemplate(), 'first-run'); runtime.save(state.clock, null, state.run, 90000);
    state = sessionAct(state, 'START', now); runtime.save(state.clock, 'START', state.run, 90000);
    const original = JSON.parse(storage.getItem(prefix + 'session-persist'));
    assert.equal(original.startedAt, 10000);
    const writes = storage.writes;
    for (let i = 0; i < 100; i++) { now += 100; const ticked = sessionAct(state, 'TICK', now); runtime.save(ticked.clock, 'TICK', ticked.run, 90000); }
    assert.equal(storage.writes, writes, 'Session countdown ticks do not write periodically');
    runtime.close(); await Promise.resolve(); runtime = await createRecovery(options);
    assert.equal(runtime.restored.run.runId, 'first-run'); assert.equal(runtime.restored.quickDurationMs, 90000);
    state = sessionAct(runtime.restored, 'NEXT', now); runtime.save(state.clock, 'NEXT', state.run, 90000);
    assert.equal(JSON.parse(storage.getItem(prefix + 'session-persist')).startedAt, 10000, 'Later READY phases retain workshop start identity');
    state = sessionAct(state, 'PRIMARY', now); runtime.save(state.clock, 'PRIMARY', state.run, 90000);
    assert.equal(JSON.parse(storage.getItem(prefix + 'session-persist')).startedAt, 10000);
    state = sessionAct(state, 'STOP_WORKSHOP', now); runtime.save(state.clock, 'STOP_WORKSHOP', state.run, 90000);
    runtime.close(); await Promise.resolve(); runtime = await createRecovery(options);
    assert.equal(runtime.restored.clock.status, 'READY'); assert.equal(runtime.restored.run.currentIndex, 0);
    assert.deepEqual(runtime.restored.run.phaseOvertime, {});
    state = prepareSession(sessionTemplate('automatic'), 'replacement-run'); runtime.save(state.clock, null, state.run, 90000);
    runtime.close(); await Promise.resolve(); runtime = await createRecovery(options);
    assert.equal(runtime.restored.run.runId, 'replacement-run'); assert.equal(runtime.restored.clock.status, 'READY');
    runtime.save(null); runtime.close(); await Promise.resolve(); runtime = await createRecovery(options);
    assert.equal(runtime.restored, null); runtime.close();
});

test('invalid or uncertain Session states are blocked before execution', () => {
    const valid = sessionRecord(prepareSession(sessionTemplate(), 'validated-run'), 10000);
    for (const mutate of [
        r => { r.run.currentIndex = 99; }, r => { r.run.stage = 'COMPLETED'; },
        r => { r.run.runId = ''; }, r => { r.run.phases[0].title = ' Leading whitespace'; },
        r => { r.run.phaseOvertime = { unknown: 5 }; }, r => { r.clock.durationMs = 120000; r.clock.remainingMs = 120000; },
        r => { r.clock.policy = 'quick'; }, r => { r.clock.adjustmentMs = 1000; },
        r => { r.clock.status = 'OVERTIME_STOPPED'; r.clock.remainingMs = 0; },
        r => { r.quickDurationMs = 0; }, r => { delete r.run; },
    ]) { const invalid = structuredClone(valid); mutate(invalid); assert.throws(() => restoreRuntime(invalid, 10000)); }
    let auto = sessionAct(prepareSession(sessionTemplate('automatic'), 'auto-invalid'), 'START', 0);
    assert.throws(() => validateRuntime(sessionRecord({ run: auto.run, clock: act(auto.clock, 'TICK', 60000) }, 60000)), /UNRECONCILED_SESSION/);
    auto = sessionAct(auto, 'TICK', 60000); auto.run.phaseOvertime['phase-0'] = 1;
    assert.throws(() => validateRuntime(sessionRecord(auto, 60000)), /INVALID_STATISTICS/);
    const impossible = sessionAct(prepareSession(sessionTemplate('automatic'), 'impossible'), 'START', 0);
    impossible.clock = { ...impossible.clock, status: 'OVERTIME_PAUSED', deadlineMs: null, remainingMs: 0, overtimeMs: 5000 };
    assert.throws(() => validateRuntime(sessionRecord(impossible, 65000)), /INVALID_SESSION_CLOCK/);
    let progressed = prepareSession(sessionTemplate(), 'invalid-stat-keys');
    progressed = sessionAct(sessionAct(progressed, 'NEXT', 10000), 'NEXT', 10000);
    progressed.run.phaseOvertime = { 'phase-0,phase-1': 0 };
    assert.throws(() => validateRuntime(sessionRecord(progressed, 10000)), /INVALID_STATISTICS/, 'Joined IDs must not masquerade as separate phase keys');
});

test('two Session contexts stay independent; explicit recovery respects live ownership and retains run identity', async () => {
    const storage = memory(), locks = lockManager();
    const tabs = memory(); const options = { storage, tabs, locks, now: () => 10000, uuid: () => 'session-owner' };
    const a = await createRecovery(options);
    const state = prepareSession(sessionTemplate(), 'owned-run'); a.save(state.clock, null, state.run);
    const duplicateTabs = memory(); duplicateTabs.setItem(contextKey, tabs.getItem(contextKey));
    const b = await createRecovery({ ...options, tabs: duplicateTabs, uuid: () => 'session-duplicate' });
    const other = prepareSession(sessionTemplate('automatic'), 'other-run'); b.save(other.clock, null, other.run);
    assert.equal(JSON.parse(storage.getItem(prefix + 'session-owner')).run.runId, 'owned-run');
    await assert.rejects(b.recover('session-owner'), /CONTEXT_ACTIVE/);
    a.close(); await Promise.resolve();
    const recovered = await b.recover('session-owner');
    assert.equal(recovered.run.runId, 'owned-run'); assert.equal(recovered.clock.status, 'READY');
    assert.equal(storage.getItem(prefix + 'session-duplicate'), null); b.close();
});

test('corrupt Session storage never reconstructs a partial or guessed run', async () => {
    const storage = memory(), tabs = memory();
    const damaged = sessionRecord(prepareSession(sessionTemplate(), 'damaged-run'), 10000);
    damaged.run.currentIndex = 999; tabs.setItem(contextKey, 'session-context');
    const raw = JSON.stringify(damaged); storage.setItem(prefix + 'session-context', raw);
    const runtime = await createRecovery({ storage, tabs, locks: lockManager(), now: () => 20000 });
    assert.equal(runtime.restored, null); assert.ok(runtime.error);
    assert.equal(storage.getItem(prefix + 'session-context'), raw, 'Inspection itself leaves invalid contents untouched');
    runtime.close();
});

test('Session storage/quota failure remains visible and never partially commits a new phase', async () => {
    const storage = memory(); const tabs = memory();
    const runtime = await createRecovery({ storage, tabs, locks: lockManager(), now: () => 10000, uuid: () => 'quota-session' });
    const first = prepareSession(sessionTemplate(), 'quota-run'); runtime.save(first.clock, null, first.run);
    const raw = storage.getItem(prefix + 'quota-session'); storage.fail = true;
    const next = sessionAct(first, 'NEXT', 10000);
    assert.equal(runtime.save(next.clock, 'NEXT', next.run), false); assert.equal(runtime.error, 'STORAGE_UNAVAILABLE');
    assert.equal(storage.data.get(prefix + 'quota-session'), raw);
    assert.equal(tabs.getItem(contextKey), null, 'A known failed write does not retain an automatic tab association');
    assert.equal(next.clock.status, 'READY', 'Live Session engine remains usable without durable storage'); runtime.close();
});

test('100-hour phases and a 1000-hour workshop recover without applying Quick limits', () => {
    const template = { id: 'long-workshop', name: 'Long workshop', transitionMode: 'automatic',
        phases: Array.from({ length: 10 }, (_, i) => ({ id: `long-${i}`, title: `Long phase ${i}`, durationSeconds: 360000 })) };
    const state = sessionAct(prepareSession(template, 'long-run'), 'START', 0);
    const complete = restoreRuntime(sessionRecord(state, 0), 3600000000 + 300000);
    assert.equal(complete.run.stage, 'COMPLETED'); assert.equal(complete.clock.deadlineMs, 3600000000);
    assert.equal(complete.clock.overtimeMs, 300000); assert.equal(sessionRemaining(complete.run, complete.clock), 0);
});

test('recovery does not add unsupported Session restart or duration-adjustment actions', () => {
    const state = prepareSession(sessionTemplate(), 'supported-actions');
    const original = structuredClone(state);
    for (const type of ['RESTART', 'RESTART_WORKSHOP', 'ADJUST']) assert.throws(() => sessionAct(state, type, 10000), /Unknown session action/);
    assert.deepEqual(state, original);
});
