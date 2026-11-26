import assert from 'node:assert/strict';
import { parseEditorPortability } from '../src/js/editor-portability.mjs';

export async function checkZeroPhasePlanning({ evaluate, click, cdp, waitForBrowserState, assertPrimaryView, acceptExpectedUnload }) {
    const raw = () => evaluate("localStorage.getItem('easyTimerEditor.v1')");
    const store = async () => JSON.parse(await raw());
    const quickRuntime = () => evaluate(`(() => {
        const id = sessionStorage.getItem('easyTimerRuntimeContext.v1');
        const { status, deadlineMs, durationMs, adjustmentMs } = JSON.parse(localStorage.getItem('easyTimerRuntime.v1.' + id)).clock;
        return { id, status, deadlineMs, durationMs, adjustmentMs };
    })()`);
    const wait = (expression, message) => waitForBrowserState(expression, message);
    const library = () => wait("!!document.querySelector('#planner:not([hidden]) > section > .planner-actions')", 'Editor library did not load');
    const action = (label, source = "document.querySelector('#planner')") => evaluate(`(() => {
        const scope = ${source};
        const button = [...scope.querySelectorAll('button')].find(item => item.textContent === ${JSON.stringify(label)});
        if (!button || button.disabled) throw Error('Missing usable action: ' + ${JSON.stringify(label)});
        button.click();
    })()`);
    const row = name => `[...document.querySelectorAll('#planner .template-library > li')]
        .find(item => item.querySelector('h3')?.textContent === ${JSON.stringify(name)})`;
    const field = (field, value) => evaluate(`(() => {
        const input = document.querySelector('#planner [data-field="' + ${JSON.stringify(field)} + '"]');
        input.value = ${JSON.stringify(value)}; input.dispatchEvent(new Event('input', { bubbles:true }));
    })()`);
    const save = () => evaluate("document.querySelector('#planner form').requestSubmit()");
    const emptyAgenda = () => evaluate(`document.querySelector('#planner .phase-list')?.childElementCount === 0
        && document.querySelector('#planner').textContent.includes('No phases yet.')`);
    const hasNoStart = name => evaluate(`(() => {
        const item = ${row(name)};
        return item.querySelector('.start-unavailable')?.textContent === 'Add at least one phase before starting.'
            && ![...item.querySelectorAll('button')].some(button => button.textContent === 'Start Event');
    })()`);
    const leaveSavedDraft = async () => {
        await wait("document.querySelector('#planner [data-native-save]')?.disabled && document.querySelector('#planner').textContent.includes('Saved.')", 'Confirmed Save did not stay in the Editor');
        await action('Cancel', "document.querySelector('#planner .native-workspace-save-actions')");
        await library();
    };
    const saveToLibrary = async () => { await save(); await leaveSavedDraft(); };
    const installSaveFault = () => evaluate(`(() => {
        const get = Storage.prototype.getItem; const set = Storage.prototype.setItem;
        const probe = window.zeroPlanFault = { armed: true, failed: false, writes: 0 };
        Storage.prototype.setItem = function(key, value) {
            const result = set.call(this, key, value);
            if (key === 'easyTimerEditor.v1') {
                probe.writes++;
                if (probe.armed) { probe.armed = false; probe.failed = true; }
            }
            return result;
        };
        Storage.prototype.getItem = function(key) {
            if (key === 'easyTimerEditor.v1' && probe.failed) {
                probe.failed = false;
                throw Error('Controlled unconfirmed write');
            }
            return get.call(this, key);
        };
    })()`);
    const pickerSelect = async (option, description) => {
        await wait(`[...document.querySelector('#session-template').options]
            .some(item => item.value === ${JSON.stringify(option)})`, 'Picker does not include the stored record');
        await evaluate(`(() => {
            const select = document.querySelector('#session-template');
            select.value = ${JSON.stringify(option)}; select.dispatchEvent(new Event('change', { bubbles:true }));
        })()`);
        assert.equal(await evaluate("document.querySelector('#prepare-session').textContent"), description);
    };
    const addPhase = async () => {
        await action('Add phase');
        await field('title', 'Executable phase');
        await field('duration', '8');
    };

    await evaluate("document.querySelector('[data-language=en]').click()");
    await click('#home-quick');
    await click('[data-preset="60000"]');
    await click('[data-preset="60000"]');
    await click('#primary');
    const quick = await quickRuntime();
    assert.equal(quick.status, 'RUNNING');
    await click('#open-planner');
    await library();
    await action('New Event Template');
    await field('name', 'Empty workshop');
    await field('prepared', 'Prepared before creating phases');
    assert.equal(await emptyAgenda(), true);
    await installSaveFault();
    await save();
    await wait("!!document.querySelector('#planner [data-native-recheck]')", 'Template Save did not show the pending ticket');
    let current = await store();
    const template = current.templates[0];
    assert.equal(current.revision, 1);
    assert.equal(await evaluate('zeroPlanFault.writes'), 1);
    assert.deepEqual(template.plan.phases, []);
    const pending = await evaluate(`Object.keys(localStorage).filter(key=>key.startsWith('easyTimerEditorDraftRecovery.v1.'))
        .map(key=>JSON.parse(localStorage.getItem(key))).find(record=>record.state==='pending')`);
    assert.deepEqual(pending.pending.ticket.target.templates[0], template);
    const timeOrigin = await evaluate('performance.timeOrigin');
    const unload = await acceptExpectedUnload(async () => {
        await cdp('Page.reload');
        await wait(`performance.timeOrigin !== ${timeOrigin} && !!document.querySelector('#planner [data-template-recoveries]')`,
            'Reload did not reopen the Editor with the pending Template recovery');
    });
    assert.equal(unload.handled, true);
    const confirmedTemplate = await raw();
    await action('Restore', "document.querySelector('#planner [data-template-recoveries]')");
    await wait("!!document.querySelector('#planner [data-native-recheck]')", 'Recovery did not restore the pending Template ticket');
    await click('#planner [data-native-recheck]');
    await leaveSavedDraft();
    assert.equal(await raw(), confirmedTemplate, 'Reload and recovery reconciliation perform no second Save');
    assert.equal(await hasNoStart('Empty workshop'), true);
    assert.deepEqual(await quickRuntime(), quick);
    console.log('PASS: zero-phase Template Save, guarded reload, pending Draft Recovery and read-only reconciliation preserve the plan and running Quick Timer.');

    await action('Plan Event', row('Empty workshop'));
    assert.equal(await emptyAgenda(), true);
    await field('name', 'Independent empty event');
    await installSaveFault();
    await save();
    await wait("!!document.querySelector('#planner [data-native-recheck]')", 'Independent planning acknowledgement must be rechecked');
    current = await store();
    const planned = current.executions[0].execution;
    assert.equal(current.revision, 2);
    assert.notEqual(planned.id, template.id);
    assert.deepEqual(planned.source, { kind: 'template', id: template.id });
    assert.deepEqual(planned.currentPlan, template.plan);
    const plannedRaw = await raw();
    await click('#planner [data-native-recheck]');
    await wait("document.querySelector('#planner [data-field=name]')?.value === 'Independent empty event' && !document.querySelector('#planner [data-native-recheck]')",
        'Observation did not restore the retained independent edit');
    assert.equal(await raw(), plannedRaw);
    await saveToLibrary();
    current = await store();
    assert.equal(current.revision, 3);
    assert.equal(current.executions.length, 1);
    assert.deepEqual(current.templates[0], template);
    assert.deepEqual(current.executions[0].execution.currentPlan.phases, []);
    assert.equal(await hasNoStart('Independent empty event'), true);

    const beforeRejected = await raw();
    const rejected = await evaluate(`(async () => {
        const { createEditorStoreWriter } = await import('./js/editor-storage-lock.mjs');
        const { createEditorActiveTimerLock } = await import('./js/editor-active-lock.mjs');
        const { createEditorRuntimeBridge } = await import('./js/editor-runtime-bridge.mjs');
        const { createNativeSessionLaunchService } = await import('./js/editor-launch-service.mjs');
        const writer = createEditorStoreWriter({ getStorage: () => localStorage, locks: navigator.locks });
        const activeLock = createEditorActiveTimerLock({ locks: navigator.locks });
        const runtimeBridge = createEditorRuntimeBridge({ writer, activeLock });
        const service = createNativeSessionLaunchService({ writer, runtimeBridge });
        const record = await writer.read();
        const entry = record.executions[0].execution;
        const launch = await service.launchTemplateToReady({ templateId: record.templates[0].id, expectedAggregateRevision: record.revision });
        const activate = await service.activatePlanned({ executionId: entry.id, expectedAggregateRevision: record.revision,
            expectedExecutionRevision: entry.revision, expectedRuntimeRevision: entry.runtimeRevision });
        const locks = await navigator.locks.query();
        return { launch: launch.error, activate: activate.error, owns: activeLock.held,
            held: locks.held.some(lock => lock.name === 'easyTimerEditor.v1.active-runtime') };
    })()`);
    const rejection = { type: 'validation', code: 'phasesRequired' };
    assert.deepEqual(rejected, { launch: rejection, activate: rejection, owns: false, held: false });
    assert.equal(await raw(), beforeRejected, 'Both rejected start paths leave exact bytes and revisions untouched');
    assert.deepEqual(await quickRuntime(), quick);
    console.log('PASS: independent zero-phase Event creation, uncertain observation and edit preserve identity; real locked Start paths reject without writes, lock leaks or Quick Timer loss.');

    await evaluate(`(() => {
        const create = URL.createObjectURL.bind(URL);
        const click = HTMLAnchorElement.prototype.click;
        const objects = new Map();
        window.zeroPlanDownloads = [];
        URL.createObjectURL = blob => {
            const url = create(blob); objects.set(url, blob); return url;
        };
        HTMLAnchorElement.prototype.click = function() {
            const blob = objects.get(this.href);
            if (!this.download || !blob) return click.call(this);
            objects.delete(this.href);
            void blob.text().then(text => zeroPlanDownloads.push(text));
        };
    })()`);
    await action('Export JSON', row('Empty workshop'));
    await action('Export JSON', row('Independent empty event'));
    await action('Export all local data');
    await wait('zeroPlanDownloads.length === 3', 'Expected the three planning exports');
    const exports = await evaluate('zeroPlanDownloads');
    const byKind = Object.fromEntries(exports.map(text => [parseEditorPortability(text).kind, text]));
    assert.deepEqual(parseEditorPortability(byKind['editor-template']).template, template);
    assert.equal(parseEditorPortability(byKind['editor-execution']).entry.execution.id, planned.id);
    assert.deepEqual(parseEditorPortability(byKind['editor-execution']).entry.execution.currentPlan.phases, []);
    assert.deepEqual(parseEditorPortability(byKind['editor-backup']).record, current);
    await evaluate(`(() => {
        const data = new DataTransfer();
        data.items.add(new File([${JSON.stringify(byKind['editor-template'])}], 'empty.json', { type:'application/json' }));
        const input = document.querySelector('#planner input[type=file]');
        input.files = data.files; input.dispatchEvent(new Event('change', { bubbles:true }));
    })()`);
    await wait("!!document.querySelector('#planner [data-action=confirm-import]')", 'Empty Template import did not reach review');
    await click('#planner [data-action=confirm-import]');
    await wait("JSON.parse(localStorage.getItem('easyTimerEditor.v1')).templates.length === 2 && !document.querySelector('#planner [data-action=confirm-import]')",
        'Confirmed empty Template import did not return to the library');
    const imported = (await store()).templates.find(item => item.id !== template.id);
    assert.deepEqual(imported.plan, template.plan);
    assert.deepEqual(await quickRuntime(), quick);
    await click('#planner .planner-back');
    await assertPrimaryView('quick', 'Closing Editor restores the exact running Quick origin');
    await click('#stop');
    await click('#open-session');
    console.log('PASS: Template, Event and backup exports round-trip empty planning; public import creates a separate Template copy.');

    await pickerSelect(`template:${template.id}`, 'Edit Event Template');
    assert.equal(await evaluate("document.querySelector('#session-feedback').textContent"), 'Add at least one phase before starting.');
    await evaluate("document.querySelector('[data-language=de]').click()");
    assert.equal(await evaluate("document.querySelector('#prepare-session').textContent"), 'Event-Template bearbeiten');
    assert.equal(await evaluate("document.querySelector('#session-feedback').textContent"), 'Zum Starten mindestens eine Phase hinzufügen.');
    await evaluate("document.querySelector('[data-language=en]').click()");
    await click('#prepare-session');
    await wait("document.querySelector('#planner [data-field=name]')?.value === 'Empty workshop'", 'Picker did not open the selected Template draft');
    assert.equal(await emptyAgenda(), true);
    await field('name', 'Edited empty workshop');
    await saveToLibrary();
    await click('#planner .planner-back');
    await wait(`[...document.querySelector('#session-template').options].some(item => item.value === ${JSON.stringify(`template:${template.id}`)}
        && item.textContent === 'Edited empty workshop')`, 'Returning Picker did not refresh the same edited Template');
    await pickerSelect(`planned:${planned.id}`, 'Edit planned event');
    await click('#prepare-session');
    await wait("document.querySelector('#planner [data-field=name]')?.value === 'Independent empty event'", 'Picker did not open the selected Planned draft');
    assert.equal(await emptyAgenda(), true);
    await addPhase();
    await saveToLibrary();
    await action('Edit', row('Independent empty event'));
    await wait("!!document.querySelector('#planner [data-native-phase-id]')", 'Saved phase was not reopened');
    await click('#planner [data-native-phase-id] [data-action=details]');
    await action('Remove phase');
    assert.equal(await emptyAgenda(), true);
    assert.equal(await evaluate("document.activeElement.matches('#planner .add-phase')"), true);
    const beforeEmptySave = (await store()).revision;
    await evaluate('zeroPlanFault.armed = true');
    await save();
    await wait("!!document.querySelector('#planner [data-native-recheck]')", 'Zero-phase Planned Save did not expose its uncertainty');
    assert.equal((await store()).revision, beforeEmptySave + 1);
    assert.deepEqual((await store()).executions[0].execution.currentPlan.phases, []);
    const confirmedEmpty = await raw();
    await click('#planner [data-native-recheck]');
    await leaveSavedDraft();
    assert.equal(await raw(), confirmedEmpty, 'Planned Save reconciliation does not write again');
    assert.equal(await hasNoStart('Independent empty event'), true);
    await action('Edit', row('Independent empty event'));
    await wait("!!document.querySelector('#planner [data-field=name]')", 'No phase plan did not reopen after deletion');
    await addPhase();
    await saveToLibrary();
    await click('#planner .planner-back');
    await pickerSelect(`planned:${planned.id}`, 'Start Event');
    await click('#prepare-session');
    await wait(`document.querySelector('#session-picker').hidden && JSON.parse(localStorage.getItem('easyTimerEditor.v1')).activeRuntime?.clock.status === 'READY'`,
        'Edited PLANNED Event did not start into READY');
    current = await store();
    assert.equal(current.activeRuntime.executionId, planned.id);
    assert.equal(current.activeRuntime.attemptId, null);
    assert.equal(current.activeRuntime.run.phases[0].durationSeconds, 480);
    assert.deepEqual(current.templates.find(item => item.id === template.id).plan.phases, []);
    console.log('PASS: both nonstartable Picker entries have direct edit paths with DE/EN reasons; final-phase removal and uncertain Planned Save reconcile; adding a phase starts the same Event in READY.');
}
