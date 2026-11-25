import assert from 'node:assert/strict';
import { parseEditorPortability } from '../src/js/editor-portability.mjs';

export async function checkUnspecifiedTimeboxes({ evaluate, click, waitForBrowserState, assertPrimaryView }) {
    const raw = () => evaluate("localStorage.getItem('easyTimerEditor.v1')");
    const record = async () => JSON.parse(await raw());
    const wait = (expression, message) => waitForBrowserState(expression, message);
    const library = () => wait("!!document.querySelector('#planner:not([hidden]) > section > .planner-actions')", 'Library did not open');
    const row = name => `[...document.querySelectorAll('#planner .template-library > li')]
        .find(item => item.querySelector('h3')?.textContent === ${JSON.stringify(name)})`;
    const action = (label, scope = "document.querySelector('#planner')") => evaluate(`(() => {
        const button = [...(${scope}).querySelectorAll('button')].find(item => item.textContent === ${JSON.stringify(label)});
        if (!button || button.disabled) throw Error('Missing usable action: ' + ${JSON.stringify(label)});
        button.click();
    })()`);
    const field = (selector, value) => evaluate(`(() => {
        const input = document.querySelector(${JSON.stringify(selector)});
        input.focus(); input.value = ${JSON.stringify(value)};
        input.dispatchEvent(new Event('input', { bubbles:true }));
    })()`);
    const phaseField = (index, key) => `#planner [data-native-phase-id]:nth-child(${index}) [data-field="${key}"]`;
    const duration = (index, value) => field(phaseField(index, 'duration'), value);
    const save = () => evaluate("document.querySelector('#planner form').requestSubmit()");
    const saveToLibrary = async () => { await save(); await library(); };
    const selectPicker = async value => {
        await wait(`[...document.querySelector('#session-template').options].some(option => option.value === ${JSON.stringify(value)})`,
            'Picker did not load the expected plan');
        await evaluate(`(() => {
            const select = document.querySelector('#session-template');
            select.value = ${JSON.stringify(value)}; select.dispatchEvent(new Event('change', { bubbles:true }));
        })()`);
    };
    const assertSummary = async (total, missing) => {
        const actual = await evaluate(`[
            document.querySelector('#planner [data-duration-total]').textContent,
            document.querySelector('#planner [data-duration-missing]').textContent,
            document.querySelector('#planner [data-duration-missing]').hidden
        ]`);
        assert.deepEqual(actual, [total, missing, missing === '']);
    };
    const quickClock = () => evaluate(`(() => {
        const id = sessionStorage.getItem('easyTimerRuntimeContext.v1');
        const { status, deadlineMs, durationMs } = JSON.parse(localStorage.getItem('easyTimerRuntime.v1.' + id)).clock;
        return { id, status, deadlineMs, durationMs };
    })()`);

    await evaluate("document.querySelector('[data-language=en]').click()");
    await click('#home-quick');
    await click('[data-preset="60000"]');
    await click('[data-preset="60000"]');
    await click('#primary');
    const quick = await quickClock();
    assert.equal(quick.status, 'RUNNING');
    await click('#open-planner');
    await library();
    await action('New Event Template');
    await field('#planner [data-field=name]', 'Mixed timeboxes');
    for (const [index, title] of ['   ', 'Unnamed Phase', 'Closing'].entries()) {
        await action('Add phase');
        assert.equal(await evaluate(`document.querySelector(${JSON.stringify(phaseField(index + 1, 'duration'))}).value`),
            '10', 'Add Phase retains its existing initial duration');
        await field(phaseField(index + 1, 'title'), title);
    }
    await duration(1, '7');
    await duration(2, '');
    await duration(3, '0000');
    const displayedTitle = () => evaluate(`(() => {
        const field = document.querySelector(${JSON.stringify(phaseField(1, 'title'))});
        return [field.value, field.placeholder, field.closest('li').querySelector('[data-action=drag]').getAttribute('aria-label')];
    })()`);
    assert.deepEqual((await displayedTitle()).slice(0, 2), ['', 'Unnamed Phase']);
    assert.match((await displayedTitle())[2], /Unnamed Phase/);
    await assertSummary('Total: 7 min', '1 timebox missing.');
    const invalidState = () => evaluate(`(() => {
        const input = document.querySelector(${JSON.stringify(phaseField(3, 'duration'))});
        return { value:input.value, message:input.validationMessage, invalid:input.getAttribute('aria-invalid'),
            feedback:document.getElementById(input.getAttribute('aria-describedby')).textContent, focused:document.activeElement===input };
    })()`);
    assert.deepEqual(await invalidState(), { value:'0000', message:'Enter a whole number from 1 to 6,000 minutes.',
        invalid:'true', feedback:'Enter a whole number from 1 to 6,000 minutes.', focused:true });
    await evaluate("document.querySelector('[data-language=de]').click()");
    assert.deepEqual((await displayedTitle()).slice(0, 2), ['', 'Unnamed Phase']);
    assert.match((await displayedTitle())[2], /Unnamed Phase/);
    await assertSummary('Gesamt: 7 Min.', '1 Timebox fehlt.');
    await evaluate("document.querySelector('#planner [data-field=name]').focus()");
    const beforeInvalid = await raw();
    await save();
    assert.deepEqual(await invalidState(), { value:'0000', message:'Eine ganze Zahl von 1 bis 6.000 Minuten eingeben.',
        invalid:'true', feedback:'Eine ganze Zahl von 1 bis 6.000 Minuten eingeben.', focused:true });
    assert.equal(await raw(), beforeInvalid, 'Invalid raw duration cannot trigger an authoritative write');
    await evaluate("document.querySelector('[data-language=en]').click()");
    await duration(3, ' ');
    assert.equal((await invalidState()).value, ' ');
    await assertSummary('Total: 7 min', '1 timebox missing.');
    await duration(3, '');
    await assertSummary('Total: 7 min', '2 timeboxes missing.');
    assert.equal(await evaluate("Array.from(document.querySelectorAll('#planner [data-field=duration]')).every(field => field.validity.valid)"), true);
    const ids = await evaluate("[...document.querySelectorAll('#planner [data-native-phase-id]')].map(row => row.dataset.nativePhaseId)");
    await saveToLibrary();
    const template = (await record()).templates[0];
    assert.deepEqual(template.plan.phases.map(phase => phase.title), ['', 'Unnamed Phase', 'Closing']);
    assert.deepEqual(template.plan.phases.map(phase => [phase.id, phase.durationSeconds]), ids.map((id, index) => [id, [420,null,null][index]]));
    assert.equal(await evaluate(`(${row('Mixed timeboxes')}).querySelector('.start-unavailable').textContent`),
        'Set the 2 missing timeboxes before starting.');
    console.log('PASS: null and invalid duration stay distinct through editing, live totals, DE/EN feedback, invalid Save focus and confirmed planning persistence.');

    await evaluate(`(() => {
        const create = URL.createObjectURL.bind(URL);
        const click = HTMLAnchorElement.prototype.click;
        const objects = new Map();
        URL.createObjectURL = blob => {
            const url = create(blob); objects.set(url, blob); return url;
        };
        HTMLAnchorElement.prototype.click = function() {
            const blob = objects.get(this.href);
            if (!this.download || !blob) return click.call(this);
            objects.delete(this.href);
            void blob.text().then(text => { window.timeboxExport = text; });
        };
    })()`);
    await action('Export JSON', row('Mixed timeboxes'));
    const exported = await wait('window.timeboxExport', 'Expected Template export');
    assert.deepEqual(parseEditorPortability(exported).template, template);
    await evaluate(`(() => {
        const data = new DataTransfer();
        data.items.add(new File([${JSON.stringify(exported)}], 'timeboxes.json', { type:'application/json' }));
        const input = document.querySelector('#planner input[type=file]');
        input.files = data.files; input.dispatchEvent(new Event('change', { bubbles:true }));
    })()`);
    await wait("!!document.querySelector('#planner [data-action=confirm-import]')", 'Template with null durations must reach import review');
    await click('#planner [data-action=confirm-import]');
    await wait(`JSON.parse(localStorage.getItem('easyTimerEditor.v1')).templates.length === 2
        && !document.querySelector('#planner [data-action=confirm-import]')`, 'Import did not return to the library');
    const copied = (await record()).templates.find(item => item.id !== template.id);
    assert.deepEqual(copied.plan, template.plan);
    const originalRow = `[...document.querySelectorAll('#planner .template-library > li')]
        .find(item => item.querySelector('h3 + p')?.textContent.startsWith(${JSON.stringify(`ID: ${template.id} ·`)}))`;
    await action('Plan Event', originalRow);
    assert.deepEqual(await evaluate("[...document.querySelectorAll('#planner [data-field=duration]')].map(input=>input.value)"), ['7','','']);
    await field('#planner [data-field=name]', 'Independent timeboxes');
    await saveToLibrary();
    const planned = (await record()).executions[0].execution;
    assert.notEqual(planned.id, template.id);
    assert.deepEqual(planned.currentPlan, { ...template.plan, name: 'Independent timeboxes' });
    for (const item of [originalRow, row('Independent timeboxes')]) {
        assert.equal(await evaluate(`![...(${item}).querySelectorAll('button')].some(button=>button.textContent==='Start Event')`), true);
    }
    const beforeClose = await raw();
    await click('#planner .planner-back');
    await assertPrimaryView('quick', 'Leaving planning goes back to the running Quick Timer');
    assert.deepEqual(await quickClock(), quick);
    assert.equal(await raw(), beforeClose);
    await click('#stop');
    await click('#open-session');
    console.log('PASS: incomplete Template export/import and independent Event planning preserve the phases and the running Quick Timer.');

    await selectPicker(`template:${template.id}`);
    assert.equal(await evaluate("document.querySelector('#prepare-session').textContent"), 'Edit Event Template');
    assert.equal(await evaluate("document.querySelector('#session-feedback').textContent"), 'Set the 2 missing timeboxes before starting.');
    await evaluate("document.querySelector('[data-language=de]').click()");
    assert.equal(await evaluate("document.querySelector('#session-feedback').textContent"), 'Zum Starten die 2 fehlenden Timeboxes festlegen.');
    await evaluate("document.querySelector('[data-language=en]').click()");
    await click('#prepare-session');
    await wait("document.querySelector('#planner [data-field=name]')?.value === 'Mixed timeboxes'", 'Picker did not open the selected Template');
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('#planner [data-field=duration]')]
        .map(input => [input.value, input.placeholder])`), [['7','-- min'],['','-- min'],['','-- min']]);
    await assertSummary('Total: 7 min', '2 timeboxes missing.');
    await field(phaseField(1, 'title'), 'Edited title');
    assert.equal((await displayedTitle())[0], 'Edited title');
    await field(phaseField(1, 'title'), '');
    await saveToLibrary();
    const reopenedTemplate = (await record()).templates.find(item => item.id === template.id);
    assert.deepEqual(reopenedTemplate, { ...template, revision: template.revision + 1 });
    await click('#planner .planner-back');
    await selectPicker(`planned:${planned.id}`);
    assert.equal(await evaluate("document.querySelector('#prepare-session').textContent"), 'Edit planned event');
    await click('#prepare-session');
    await wait("document.querySelector('#planner [data-field=name]')?.value === 'Independent timeboxes'", 'Picker did not open the selected Planned Event');
    await duration(2, '8');
    await assertSummary('Total: 15 min', '1 timebox missing.');
    await evaluate(`(() => {
        const get = Storage.prototype.getItem; const set = Storage.prototype.setItem;
        let fail = false; let armed = true;
        Storage.prototype.setItem = function(key, value) {
            const result = set.call(this, key, value);
            if (key === 'easyTimerEditor.v1' && armed) { armed = false; fail = true; }
            return result;
        };
        Storage.prototype.getItem = function(key) {
            if (key === 'easyTimerEditor.v1' && fail) { fail = false; throw Error('Unconfirmed synthetic Save'); }
            return get.call(this, key);
        };
    })()`);
    await save();
    await wait("!!document.querySelector('#planner [data-native-recheck]')", 'Uncertain Planned Save did not expose its recheck');
    const pending = await raw();
    assert.deepEqual(JSON.parse(pending).executions[0].execution.currentPlan.phases.map(phase => phase.durationSeconds), [420,480,null]);
    await click('#planner [data-native-recheck]');
    await library();
    assert.equal(await raw(), pending, 'Read-only recheck must preserve exact authoritative bytes');
    await click('#planner .planner-back');
    await selectPicker(`planned:${planned.id}`);
    assert.equal(await evaluate("document.querySelector('#session-feedback').textContent"), '1 timebox missing. Set it before starting.');
    await click('#prepare-session');
    await wait("!!document.querySelector('#planner [data-field=name]')", 'Edited plan did not reopen');
    await duration(3, '9');
    await assertSummary('Total: 24 min', '');
    await saveToLibrary();
    await click('#planner .planner-back');
    await selectPicker(`planned:${planned.id}`);
    assert.equal(await evaluate("document.querySelector('#prepare-session').textContent"), 'Start Event');
    await click('#prepare-session');
    await wait(`document.querySelector('#session-picker').hidden
        && JSON.parse(localStorage.getItem('easyTimerEditor.v1')).activeRuntime?.clock.status === 'READY'`,
    'Corrected Event did not enter READY');
    const ready = await record();
    assert.equal(ready.activeRuntime.executionId, planned.id);
    assert.equal(ready.activeRuntime.attemptId, null);
    assert.deepEqual(ready.activeRuntime.run.phases.map(phase => [phase.id, phase.durationSeconds]), [[ids[0],420],[ids[1],480],[ids[2],540]]);
    assert.deepEqual(ready.executions[0].execution.currentPlan.phases.map(phase => phase.title), ['Unnamed Phase', 'Unnamed Phase', 'Closing']);
    assert.deepEqual(ready.activeRuntime.run.phases.map(phase => phase.title), ['Unnamed Phase', 'Unnamed Phase', 'Closing']);
    assert.deepEqual(ready.templates.find(item => item.id === template.id), reopenedTemplate);
    console.log('PASS: Picker reasons count missing timeboxes; direct editing, reopen and uncertain Save recheck lead to READY only after every duration is set.');
}
