import test from 'node:test';
import assert from 'node:assert/strict';
import { createTimer, transition, timeBudget } from '../src/js/timer.mjs';
import { createRecovery, validateRuntime, restoreRuntime } from '../src/js/recovery.mjs';

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
