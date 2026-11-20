import test from 'node:test';
import assert from 'node:assert/strict';
import {
    EDITOR_ACTIVE_TIMER_LOCK,
    createEditorActiveTimerLock,
} from '../src/js/editor-active-lock.mjs';

function deferred() {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
}

function lockManager(events = []) {
    const held = new Set();
    return {
        held,
        requests: 0,
        failSync: false,
        failAsync: false,
        beforeCallback: null,
        afterBusy: null,
        rejectBusyCompletion: false,
        afterCallback: null,
        request(name, options, callback) {
            this.requests += 1;
            events.push(['request', name, structuredClone(options)]);
            if (this.failSync) throw new Error('synthetic synchronous failure');
            if (this.failAsync) return Promise.reject(new Error('synthetic asynchronous failure'));
            return (async () => {
                if (this.beforeCallback) await this.beforeCallback.promise;
                if (held.has(name)) {
                    const result = callback(null);
                    if (this.afterBusy) await this.afterBusy.promise;
                    if (this.rejectBusyCompletion) throw new Error('synthetic late busy failure');
                    return result;
                }
                held.add(name);
                events.push(['acquired', name]);
                try { return await callback({ name, mode: 'exclusive' }); }
                finally {
                    events.push(['callback-complete', name]);
                    if (this.afterCallback) await this.afterCallback.promise;
                    held.delete(name);
                    events.push(['released', name]);
                }
            })();
        },
    };
}

test('claims the fixed exclusive lock and keeps its callback open after claim resolves', async () => {
    const events = [];
    const locks = lockManager(events);
    const controller = createEditorActiveTimerLock({ locks });
    assert.equal(controller.held, false);
    assert.equal(await controller.claim(), true);
    assert.equal(EDITOR_ACTIVE_TIMER_LOCK, 'easyTimerEditor.v1.active-runtime');
    assert.deepEqual(events.slice(0, 2), [
        ['request', EDITOR_ACTIVE_TIMER_LOCK, { mode: 'exclusive', ifAvailable: true }],
        ['acquired', EDITOR_ACTIVE_TIMER_LOCK],
    ]);
    assert.equal(controller.held, true);
    assert.equal(locks.held.has(EDITOR_ACTIVE_TIMER_LOCK), true);
    assert.equal(events.some(event => event[0] === 'callback-complete'), false);
    assert.equal(await controller.release(), true);
    assert.equal(controller.held, false);
    assert.equal(locks.held.size, 0);
});

test('another controller is busy until explicit release and can claim afterwards', async () => {
    const locks = lockManager();
    const first = createEditorActiveTimerLock({ locks });
    const second = createEditorActiveTimerLock({ locks });
    await first.claim();
    await assert.rejects(second.claim(), /lockBusy/);
    assert.equal(first.held, true);
    assert.equal(second.held, false);
    await first.release();
    assert.equal(await second.claim(), true);
    assert.equal(second.held, true);
    await second.release();
});

test('release resolves only after the lock manager confirms actual release', async () => {
    const events = [];
    const locks = lockManager(events);
    const controller = createEditorActiveTimerLock({ locks });
    await controller.claim();
    locks.afterCallback = deferred();
    let completed = false;
    const release = controller.release().then(value => { completed = true; return value; });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(completed, false);
    assert.equal(controller.held, true);
    assert.equal(locks.held.has(EDITOR_ACTIVE_TIMER_LOCK), true);
    assert.equal(events.some(event => event[0] === 'callback-complete'), true);
    locks.afterCallback.resolve();
    assert.equal(await release, true);
    assert.equal(controller.held, false);
    assert.equal(locks.held.size, 0);
});

test('missing Web Locks fails closed', async () => {
    const controller = createEditorActiveTimerLock({ locks: null });
    await assert.rejects(controller.claim(), /lockUnavailable/);
    assert.equal(controller.held, false);
    assert.equal(await controller.release(), false);
});

test('synchronous and asynchronous request failures are controlled and retryable', async () => {
    for (const mode of ['failSync', 'failAsync']) {
        const locks = lockManager();
        locks[mode] = true;
        const controller = createEditorActiveTimerLock({ locks });
        await assert.rejects(controller.claim(), /lockRequest/);
        assert.equal(controller.held, false);
        assert.equal(await controller.release(), false);
        locks[mode] = false;
        assert.equal(await controller.claim(), true);
        assert.equal(controller.held, true);
        await controller.release();
    }
});

test('one controller cannot claim twice or overwrite its release capability', async () => {
    const locks = lockManager();
    const controller = createEditorActiveTimerLock({ locks });
    await controller.claim();
    await assert.rejects(controller.claim(), /lockAlreadyHeld/);
    assert.equal(locks.requests, 1);
    assert.equal(controller.held, true);
    assert.equal(await controller.release(), true);
    assert.equal(locks.held.size, 0);
});

test('simultaneous claims from one controller do not create double ownership', async () => {
    const locks = lockManager();
    locks.beforeCallback = deferred();
    const controller = createEditorActiveTimerLock({ locks });
    const first = controller.claim();
    await assert.rejects(controller.claim(), /lockClaimPending/);
    assert.equal(locks.requests, 1);
    assert.equal(controller.held, false);
    locks.beforeCallback.resolve();
    assert.equal(await first, true);
    assert.equal(controller.held, true);
    await controller.release();
});

test('release without ownership is harmless and never releases a foreign lock', async () => {
    const locks = lockManager();
    const owner = createEditorActiveTimerLock({ locks });
    const other = createEditorActiveTimerLock({ locks });
    await owner.claim();
    assert.equal(await other.release(), false);
    assert.equal(owner.held, true);
    assert.equal(locks.held.has(EDITOR_ACTIVE_TIMER_LOCK), true);
    assert.equal(await other.release(), false);
    assert.equal(locks.requests, 1);
    await owner.release();
});

test('failed busy claim can be retried after the owner releases', async () => {
    const locks = lockManager();
    const owner = createEditorActiveTimerLock({ locks });
    const candidate = createEditorActiveTimerLock({ locks });
    await owner.claim();
    await assert.rejects(candidate.claim(), /lockBusy/);
    await owner.release();
    assert.equal(await candidate.claim(), true);
    await candidate.release();
});

test('late completion of an old busy request cannot clear newer ownership', async () => {
    const locks = lockManager();
    const owner = createEditorActiveTimerLock({ locks });
    const candidate = createEditorActiveTimerLock({ locks });
    await owner.claim();
    const oldCompletion = deferred();
    locks.afterBusy = oldCompletion;
    await assert.rejects(candidate.claim(), /lockBusy/);
    await owner.release();
    locks.afterBusy = null;
    assert.equal(await candidate.claim(), true);
    assert.equal(candidate.held, true);
    oldCompletion.resolve();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(candidate.held, true);
    assert.equal(await candidate.release(), true);
    assert.equal(locks.held.size, 0);
});

test('late asynchronous failure of an old request cannot clear newer ownership', async () => {
    const locks = lockManager();
    const owner = createEditorActiveTimerLock({ locks });
    const candidate = createEditorActiveTimerLock({ locks });
    await owner.claim();
    const oldCompletion = deferred();
    locks.afterBusy = oldCompletion;
    locks.rejectBusyCompletion = true;
    await assert.rejects(candidate.claim(), /lockBusy/);
    await owner.release();
    locks.afterBusy = null;
    locks.rejectBusyCompletion = false;
    await candidate.claim();
    oldCompletion.resolve();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(candidate.held, true);
    assert.equal(await candidate.release(), true);
    assert.equal(locks.held.size, 0);
});

test('the same controller can release and claim again', async () => {
    const locks = lockManager();
    const controller = createEditorActiveTimerLock({ locks });
    await controller.claim();
    await controller.release();
    assert.equal(await controller.claim(), true);
    assert.equal(controller.held, true);
    await controller.release();
    assert.equal(locks.requests, 2);
});

test('repeated release shares completion and cannot affect a later foreign owner', async () => {
    const locks = lockManager();
    const owner = createEditorActiveTimerLock({ locks });
    const other = createEditorActiveTimerLock({ locks });
    await owner.claim();
    locks.afterCallback = deferred();
    const firstRelease = owner.release();
    const secondRelease = owner.release();
    locks.afterCallback.resolve();
    assert.equal(await firstRelease, true);
    assert.equal(await secondRelease, true);
    locks.afterCallback = null;
    await other.claim();
    assert.equal(await owner.release(), false);
    assert.equal(other.held, true);
    await other.release();
});

test('the controller has no storage, timer or recovery side effects', async () => {
    const locks = lockManager();
    const controller = createEditorActiveTimerLock({ locks });
    const before = new Set(locks.held);
    await controller.claim();
    assert.deepEqual(before, new Set());
    assert.deepEqual([...locks.held], [EDITOR_ACTIVE_TIMER_LOCK]);
    await controller.release();
    assert.deepEqual([...locks.held], []);
});
