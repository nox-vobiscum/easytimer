import assert from 'node:assert/strict';
import { insertTemplateInRecord } from '../src/js/editor-storage.mjs';

const key = 'easyTimerEditor.v1';
const writeLock = `${key}.write`;
const template = {
    schemaVersion: 2, kind: 'template', id: 'navigation-template', revision: 1,
    plan: { name: 'Navigation workshop', transitionMode: 'manual', phases: [
        { id: 'navigation-phase', title: 'Opening', durationSeconds: 300 },
    ] },
};

export async function checkEditorNavigation({ evaluate, click, waitForBrowserState, assertPrimaryView }) {
    const store = insertTemplateInRecord({
        schemaVersion: 1, revision: 0, templates: [], executions: [], activeRuntime: null,
    }, { template, expectedAggregateRevision: 0 });
    const stored = JSON.stringify(store);
    const raw = () => evaluate(`localStorage.getItem(${JSON.stringify(key)})`);
    const setRaw = value => evaluate(`localStorage.setItem(${JSON.stringify(key)}, ${JSON.stringify(value)})`);
    const editorLoading = () => evaluate(`document.querySelector('#planner').textContent === 'Loading the Event Editor…'`);
    const libraryReady = () => waitForBrowserState(
        "Boolean(document.querySelector('#planner:not([hidden]) > section > .planner-actions'))",
        'Navigation did not load the Editor library');
    const pickerReady = () => waitForBrowserState(
        "Boolean(document.querySelector('#session-picker:not([hidden]) option[value=\"template:navigation-template\"]'))",
        'Returning to the Picker did not refresh its Template');
    const trace = () => evaluate('navigationProbe.trace');
    const holdNext = () => evaluate('navigationProbe.holdNext = true');
    const held = request => waitForBrowserState(
        `navigationProbe.held?.request === ${request}`, 'Expected browser Store lock was not held');
    const release = () => evaluate('navigationProbe.release()');
    const waitForSettled = request => waitForBrowserState(
        `navigationProbe.trace[${request}]?.settled`, 'Browser Store read did not settle');
    const assertReads = async (count, acquired = true) => {
        const entries = await trace();
        assert.equal(entries.length, count);
        assert.deepEqual(entries.at(-1), { acquired, settled: true, ifAvailable: true, mode: 'exclusive' });
    };
    const retry = async () => {
        assert.equal(await evaluate(`[...document.querySelectorAll('#planner button')]
            .some(button => button.textContent === 'Retry loading')`), true);
        await evaluate(`[...document.querySelectorAll('#planner button')]
            .find(button => button.textContent === 'Retry loading').click()`);
        await libraryReady();
    };

    await evaluate("document.querySelector('[data-language=en]').click()");
    await setRaw(stored);
    await evaluate(`(() => {
        const request = navigator.locks.request.bind(navigator.locks);
        const probe = window.navigationProbe = { trace: [], holdNext: false, held: null };
        probe.release = () => {
            const { resolve } = probe.held;
            probe.held = null;
            resolve();
        };
        navigator.locks.request = (name, options, callback) => {
            if (name !== ${JSON.stringify(writeLock)}) return request(name, options, callback);
            const id = probe.trace.length;
            const entry = { acquired: null, settled: false, ifAvailable: options.ifAvailable, mode: options.mode };
            probe.trace.push(entry);
            const stall = probe.holdNext;
            probe.holdNext = false;
            return request(name, options, lock => {
                entry.acquired = Boolean(lock);
                if (!stall || !lock) return callback(lock);
                const outcome = Promise.resolve().then(() => callback(lock));
                void outcome.catch(() => {});
                return new Promise(resolve => { probe.held = { request: id, resolve }; }).then(() => outcome);
            }).finally(() => { entry.settled = true; });
        };
    })()`);

    for (const entry of ['#open-planner', '#create-rundown']) {
        const start = (await trace()).length;
        await holdNext();
        await click(entry === '#open-planner' ? '#home-session' : '#reload-templates');
        await held(start);
        await click('#reload-templates');
        await click('#reload-templates');
        await click(entry);
        await assertPrimaryView('editor', 'Editor opens while the Picker read is pending');
        assert.equal(await editorLoading(), true, 'Editor displays the existing loading state immediately');
        assert.equal(await evaluate("document.activeElement.matches('#planner [data-workspace-loading]')"), true,
            'Focus moves into the visible loading state while the Picker is hidden');
        assert.equal((await trace()).length, start + 1, 'Repeated refreshes coalesce and Editor has not requested the lock');
        await release();
        await libraryReady();
        await assertReads(start + 2);
        assert.equal(await evaluate("document.activeElement === document.querySelector('#planner h1')"), true);
        await click('#planner .planner-back');
        await pickerReady();
        await assertReads(start + 3);
        await assertPrimaryView('picker', 'Back restores the refreshed Picker');
        assert.equal(await evaluate("document.activeElement.id"), 'menu-toggle');
        assert.equal(await raw(), stored);
    }
    console.log('PASS: menu and Picker Editor entry wait for the actual Picker lock release; repeated Refresh coalesces and Back refreshes the Picker without writes.');

    let start = (await trace()).length;
    await setRaw('{corrupt');
    await holdNext();
    await click('#reload-templates');
    await held(start);
    await click('#create-rundown');
    assert.equal(await editorLoading(), true);
    await setRaw(stored);
    await release();
    await libraryReady();
    await assertReads(start + 2);
    await click('#planner .planner-back');
    await pickerReady();
    await assertReads(start + 3);
    assert.equal(await evaluate("document.querySelector('#session-feedback').textContent"), '',
        'A rejected and invalidated Picker read cannot publish an error into the refreshed Picker');
    assert.equal(await raw(), stored);
    console.log('PASS: an invalidated Picker read that fails validation still releases the barrier for a fresh Editor and Picker read.');

    start = (await trace()).length;
    await holdNext();
    await click('#reload-templates');
    await held(start);
    await click('#create-rundown');
    await click('#open-home');
    await assertPrimaryView('home', 'Home closes the waiting Editor');
    await release();
    await waitForSettled(start);
    await assertPrimaryView('home', 'A stale Picker result and queued Editor do not replace Home');
    assert.equal(await evaluate("document.activeElement.id"), 'home-heading');
    await assertReads(start + 1);

    start = (await trace()).length;
    await holdNext();
    await click('#home-session');
    await held(start);
    await click('#create-rundown');
    await click('#open-quick');
    await assertPrimaryView('quick', 'Quick closes the first queued opening');
    await click('#open-planner');
    assert.equal(await editorLoading(), true);
    await release();
    await libraryReady();
    await assertReads(start + 2);
    await assertPrimaryView('editor', 'Only the latest queued Editor opening loads');
    await click('#planner .planner-back');
    await assertPrimaryView('quick', 'Reopened Editor retains the current Quick origin');
    assert.equal(await raw(), stored);
    console.log('PASS: navigation away or reopening while queued discards stale work and preserves the originating view and focus.');

    start = (await trace()).length;
    await evaluate(`(() => {
        const frame = document.createElement('iframe');
        frame.hidden = true; document.body.append(frame);
        void frame.contentWindow.navigator.locks.request(${JSON.stringify(writeLock)}, lock =>
            new Promise(resolve => {
                navigationProbe.external = true;
                navigationProbe.releaseExternal = () => { resolve(); };
            })).then(() => { frame.remove(); navigationProbe.external = false; });
    })()`);
    await waitForBrowserState('navigationProbe.external', 'Sibling document did not acquire the Store lock');
    await click('#open-planner');
    await waitForBrowserState("document.querySelector('#planner').textContent.includes('could not load saved data')",
        'External lock contention did not show the Editor load error');
    await assertReads(start + 1, false);
    await evaluate('navigationProbe.releaseExternal()');
    await waitForBrowserState('!navigationProbe.external', 'Sibling document did not release the Store lock');
    await retry();
    await assertReads(start + 2);
    assert.equal(await raw(), stored);
    await click('#planner .planner-back');

    start = (await trace()).length;
    await setRaw('{corrupt');
    await click('#open-planner');
    await waitForBrowserState("document.querySelector('#planner').textContent.includes('could not load saved data')",
        'Corrupt Store did not show the Editor load error');
    await assertReads(start + 1);
    assert.equal(await raw(), '{corrupt', 'Corrupt data is retained verbatim');
    await setRaw(stored);
    await retry();
    await assertReads(start + 2);
    assert.equal(await raw(), stored);
    await click('#planner .planner-back');
    console.log('PASS: external contention and corrupted data keep the explicit error and manual Retry loading path.');

    const staleEffects = await evaluate(`(async () => {
        const { createNativeEditorWorkspace } = await import('./js/editor-workspace.mjs');
        const root = document.createElement('section');
        document.body.append(root);
        const loads = []; const observed = [];
        const workspace = createNativeEditorWorkspace({
            root,
            plannerService: { loadWorkspace: () => new Promise(resolve => loads.push(resolve)) },
            plannedExecutionService: {}, launchService: {}, importService: {},
            onRecord: value => observed.push(value?.templates[0].plan.name ?? null),
        });
        const result = name => {
            const value = JSON.parse(localStorage.getItem(${JSON.stringify(key)}));
            value.templates[0].plan.name = name;
            return { status: 'success', workspace: value };
        };
        try {
            const old = workspace.open();
            if (!workspace.close()) throw Error('Unable to leave the stale Workspace fixture');
            const current = workspace.open();
            loads[1](result('Current Workspace'));
            await current;
            document.querySelector('#menu-toggle').focus();
            loads[0](result('Stale Workspace'));
            await old;
            return {
                observed, names: [...root.querySelectorAll('h3')].map(heading => heading.textContent),
                focus: document.activeElement.id,
            };
        } finally {
            workspace.close();
            root.remove();
        }
    })()`);
    assert.deepEqual(staleEffects, { observed: ['Current Workspace'], names: ['Current Workspace'], focus: 'menu-toggle' },
        'A stale successful read cannot notify the host, replace the new Workspace record or steal focus');
    console.log('PASS: a late successful read cannot publish to the host or overwrite or refocus a reopened Workspace.');

    await click('#open-session');
    await pickerReady();
    await evaluate(`(() => {
        const select = document.querySelector('#session-template');
        select.value = 'template:navigation-template';
        select.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await click('#prepare-session');
    await waitForBrowserState(`document.querySelector('#session-picker').hidden &&
        JSON.parse(localStorage.getItem(${JSON.stringify(key)})).activeRuntime?.clock.status === 'READY'`,
    'Refreshed Picker did not launch the Event in READY');
    await assertPrimaryView('quick', 'Event Timer is visible after the Picker starts the Event');
    // Refresh the current presentation after the Picker handoff completes.
    await evaluate("window.dispatchEvent(new Event('resize'))");
    assert.equal(await evaluate("document.querySelector('#open-planner').disabled"), false);
    const ready = await raw();
    start = (await trace()).length;
    await setRaw('{corrupt');
    await holdNext();
    await click('#open-planner');
    await held(start);
    await click('#open-session');
    await assertPrimaryView('quick', 'Event Timer closes an Editor with an outstanding read');
    assert.equal(await evaluate('document.activeElement.id'), 'primary');
    await setRaw(ready);
    await release();
    await waitForSettled(start);
    assert.equal(await evaluate("document.querySelector('#runtime-recovery').hidden"), true,
        'A stale rejected Editor read must not call the Runtime failure host callback');
    assert.equal(await evaluate('document.activeElement.id'), 'primary', 'A stale Editor read does not steal Timer focus');
    assert.equal(await raw(), ready);
    await click('#open-planner');
    await libraryReady();
    await assertReads(start + 2);
    await click('#planner .planner-back');
    assert.equal(await evaluate(`document.querySelector('#runtime-recovery').hidden &&
        !document.querySelector('#primary').disabled`), true, 'The same READY Runtime remains usable');
    assert.equal(await raw(), ready, 'The Event and Run binding remain byte-identical');
    console.log('PASS: a stale rejected Editor read does not block the active READY Runtime or replace its view or focus.');
}
