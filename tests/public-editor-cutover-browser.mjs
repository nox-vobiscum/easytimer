import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import {
    activatePlannedExecution,
    completeStartedExecution,
    createPlannedExecution,
    startActiveExecution,
    suspendReadyExecution,
    validateTemplate,
} from '../src/js/editor-domain.mjs';
import { EDITOR_STORAGE_KEY, validateEditorStoreRecord } from '../src/js/editor-storage.mjs';

const template = validateTemplate({
    schemaVersion: 2,
    kind: 'template',
    id: 'cutover-template',
    revision: 1,
    plan: {
        name: 'Public native workshop',
        category: 'workshop',
        transitionMode: 'manual',
        preparedInformation: 'Public cutover fixture',
        phases: [
            { id: 'cutover-first', title: 'Opening', durationSeconds: 60, category: 'presentation', notes: '', resources: [] },
            { id: 'cutover-second', title: 'Discussion', durationSeconds: 120, category: 'discussion', notes: '', resources: [] },
        ],
    },
});

function libraryRecord() {
    const planned = createPlannedExecution(template, 'cutover-planned');
    const suspended = suspendReadyExecution(activatePlannedExecution(createPlannedExecution(template, 'cutover-suspended')));
    const completed = completeStartedExecution(startActiveExecution(
        activatePlannedExecution(createPlannedExecution(template, 'cutover-completed')),
        'cutover-completed-attempt', 1000, 'cutover-completed-run',
    ), { completedAt: 1000, workshopOvertimeMs: 0, workshopNotes: { rundown: 'Archived note', phases: [] } });
    return validateEditorStoreRecord({
        schemaVersion: 1,
        revision: 1,
        templates: [template],
        executions: [
            { execution: planned, suspendedCheckpoint: null },
            { execution: suspended, suspendedCheckpoint: null },
            { execution: completed, suspendedCheckpoint: null },
        ],
        activeRuntime: null,
    });
}

const legacySession = {
    schemaVersion: 1,
    contextId: 'legacy-cutover-session',
    savedAt: 1000,
    mode: 'session',
    clock: { status: 'READY', durationMs: 60000, adjustmentMs: 0, remainingMs: 60000, deadlineMs: null, overtimeMs: 0, policy: 'session' },
    run: {
        runId: 'legacy-cutover-run',
        sourceTemplateId: 'legacy-cutover-template',
        name: 'Legacy cutover session',
        phases: [{ id: 'legacy-cutover-phase', title: 'Legacy phase', durationSeconds: 60 }],
        transitionMode: 'manual',
        currentIndex: 0,
        stage: 'PHASE',
        phaseOvertime: {},
    },
    quickDurationMs: 300000,
};

const unrelatedQuick = {
    schemaVersion: 1,
    contextId: 'unrelated-cutover-quick',
    savedAt: 1000,
    mode: 'quick',
    clock: { status: 'PAUSED', durationMs: 120000, adjustmentMs: 0, remainingMs: 90000, deadlineMs: null, overtimeMs: 0 },
};

export async function checkPublicEditorCutover({ evaluate, click, text, cdp }) {
    const wait = async expression => {
        for (let index = 0; index < 100; index++) {
            if (await evaluate(expression)) return;
            await delay(50);
        }
        assert.fail(`Public native cutover timeout: ${expression}`);
    };
    const reload = async expectedMode => {
        const origin = await evaluate('performance.timeOrigin');
        await cdp('Page.reload');
        await wait(`performance.timeOrigin!==${origin}&&document.body?.dataset.mode===${JSON.stringify(expectedMode)}&&Boolean(document.querySelector('#primary')?.title)`);
    };
    const menuAction = async selector => {
        if (await evaluate(`document.querySelector('#preferences').hidden`)) await click('#menu-toggle');
        await click(selector);
    };
    const openPicker = async () => {
        if (await evaluate(`document.body.classList.contains('planner-open')`)) await click('#planner .planner-back');
        if (await evaluate(`document.body.dataset.mode!=='session'||document.querySelector('#session-picker').hidden`)) {
            await menuAction('#open-session');
        }
        await wait(`!document.querySelector('#session-picker').hidden&&document.querySelector('#session-template').options.length>1`);
    };
    const choose = async value => {
        await evaluate(`(()=>{const select=document.querySelector('#session-template');select.value=${JSON.stringify(value)};
            select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
        assert.equal(await evaluate(`document.querySelector('#prepare-session').disabled`), false, `Picker exposes ${value}`);
    };
    const record = () => evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(EDITOR_STORAGE_KEY)}))`);
    const baseline = await evaluate(`({editor:localStorage.getItem(${JSON.stringify(EDITOR_STORAGE_KEY)}),
        legacy:localStorage.getItem('easyTimerRuntime.v1.legacy-cutover-session'),
        unrelated:localStorage.getItem('easyTimerRuntime.v1.unrelated-cutover-quick'),
        language:localStorage.getItem('easyTimerLanguage')})`);

    try {
        await evaluate(`(()=>{
            for(const key of Object.keys(localStorage)) if(key.startsWith('easyTimerRuntime.v1.')) localStorage.removeItem(key);
            sessionStorage.removeItem('easyTimerRuntimeContext.v1');sessionStorage.removeItem('easyTimerView.v1');
            localStorage.setItem('easyTimerLanguage','en');
            localStorage.setItem(${JSON.stringify(EDITOR_STORAGE_KEY)},${JSON.stringify(JSON.stringify(libraryRecord()))});
        })()`);
        await reload('home');
        await click('#home-quick');

        await evaluate(`(()=>{
            const locks = navigator.locks, original = locks.request.bind(locks);
            window.pickerReadProbe = { original, holdNext: false, failNext: false, lateFailureNext: false, requests: 0, release: null };
            locks.request = function(name, options, callback) {
                const probe = window.pickerReadProbe;
                if (name === 'easyTimerEditor.v1.write') probe.requests += 1;
                if (name === 'easyTimerEditor.v1.write' && probe.failNext) {
                    probe.failNext = false; return Promise.reject(new Error('Synthetic picker read failure'));
                }
                const request = original(name, options, callback);
                if (name === 'easyTimerEditor.v1.write' && probe.lateFailureNext) {
                    probe.lateFailureNext = false;
                    return request.then(() => Promise.reject(new Error('Synthetic late request failure')));
                }
                if (name !== 'easyTimerEditor.v1.write' || !probe.holdNext) return request;
                probe.holdNext = false;
                return request.then(result => new Promise(resolve => { probe.release = () => resolve(result); }));
            };
        })()`);
        await evaluate(`pickerReadProbe.holdNext=true`);
        const navigationReads = await evaluate(`pickerReadProbe.requests`);
        await menuAction('#open-session');
        await wait(`!document.querySelector('#session-picker').hidden&&pickerReadProbe.release!==null`);
        assert.equal(await evaluate(`document.querySelector('#session-template').options.length`), 1,
            'Picker renders its loading state while the single native read is pending');
        await click('#picker-back');
        await evaluate(`pickerReadProbe.release()`);
        await wait(`document.body.dataset.mode==='quick'&&document.querySelector('#session-picker').hidden`);
        assert.equal(await evaluate(`pickerReadProbe.requests`), navigationReads + 1,
            'navigation-away handling does not add a second read');
        await delay(50);
        assert.equal(await evaluate(`document.body.dataset.mode`), 'quick',
            'a stale Picker response cannot overwrite newer navigation');

        await evaluate(`pickerReadProbe.release=null;pickerReadProbe.holdNext=true`);
        await menuAction('#open-session');
        await wait(`!document.querySelector('#session-picker').hidden&&pickerReadProbe.release!==null`);
        assert.equal(await evaluate(`document.querySelector('#session-template').options.length`), 1);
        await evaluate(`pickerReadProbe.release()`);
        await wait(`document.querySelector('#session-template').options.length>1`);
        assert.equal(await evaluate(`pickerReadProbe.requests`), navigationReads + 2,
            'the delayed successful read rerenders without an extra read');
        await evaluate(`pickerReadProbe.failNext=true`);
        await click('#reload-templates');
        await wait(`document.querySelector('#session-feedback').textContent.includes('could not be loaded')`);
        assert.equal(await evaluate(`pickerReadProbe.requests`), navigationReads + 3,
            'the failed read renders its final error state exactly once');
        await click('#reload-templates');
        await wait(`document.querySelector('#session-template').options.length>1&&!document.querySelector('#session-feedback').textContent`);

        await openPicker();
        assert.deepEqual(await evaluate(`Array.from(document.querySelector('#session-template').querySelectorAll('optgroup')).map(group=>group.label)`),
            ['Templates', 'Planned executions', 'Suspended executions', 'Completed archives']);
        await choose('template:cutover-template');
        await click('#prepare-session');
        await wait(`document.body.dataset.mode==='session'&&document.querySelector('#session-picker').hidden&&document.querySelector('#status').textContent==='Ready'`);
        let stored = await record();
        const launched = stored.executions.find(entry => entry.execution.lifecycle === 'active').execution;
        assert.equal(stored.templates.length, 1, 'Direct launch does not mutate its source Template');
        assert.equal(launched.source.id, template.id);
        assert.equal(await text('#time'), '01:00');

        await click('#primary');
        await wait(`JSON.parse(localStorage.getItem(${JSON.stringify(EDITOR_STORAGE_KEY)})).activeRuntime?.attemptId!==null`);
        stored = await record();
        const executionId = stored.activeRuntime.executionId;
        const attemptId = stored.activeRuntime.attemptId;
        const runtimeRunId = stored.activeRuntime.run.runId;
        await click('#stop');
        assert.equal(await evaluate(`document.querySelector('#native-lifecycle-dialog').open`), true);
        assert.match(await text('#native-suspend-help'), /Preserves progress/);
        assert.match(await text('#native-retain-help'), /discards actual progress/);
        await click('#native-suspend');
        await wait(`document.body.dataset.mode==='home'&&JSON.parse(localStorage.getItem(${JSON.stringify(EDITOR_STORAGE_KEY)})).activeRuntime===null`);
        stored = await record();
        assert.equal(stored.executions.find(entry => entry.execution.id === executionId).execution.lifecycle, 'suspended');
        const suspendedSnapshot = structuredClone(stored);

        await openPicker();
        await choose(`suspended:${executionId}`);
        const beforeUncertainResume = (await record()).revision;
        await evaluate(`pickerReadProbe.lateFailureNext=true`);
        await click('#prepare-session');
        await wait(`!document.querySelector('#picker-recheck').hidden`);
        stored = await record();
        assert.equal(stored.revision, beforeUncertainResume + 1);
        assert.equal(stored.activeRuntime.executionId, executionId,
            'late Resume request rejection preserves the potentially completed target');
        assert.equal(await evaluate(`!document.querySelector('#session-picker').hidden`), true,
            'late Resume rejection does not report false entry success');
        await click('#picker-recheck');
        await wait(`document.body.dataset.mode==='session'&&document.querySelector('#session-picker').hidden`);
        stored = await record();
        assert.equal(stored.revision, beforeUncertainResume + 1, 'Resume Recheck is read-only');
        assert.equal(stored.activeRuntime.attemptId, attemptId, 'Resume preserves the exact Attempt identity');
        assert.equal(stored.activeRuntime.run.runId, runtimeRunId, 'Resume preserves the exact started Run identity');

        await click('#stop');
        await click('#native-retain');
        await wait(`document.body.dataset.mode==='home'`);
        stored = await record();
        const retained = stored.executions.find(entry => entry.execution.id === executionId).execution;
        assert.equal(retained.lifecycle, 'planned');
        assert.equal(retained.attempt, null, 'Retain Plan resets progress instead of presenting a continuation');

        await openPicker();
        await choose(`planned:${executionId}`);
        const beforeUncertainActivation = (await record()).revision;
        await evaluate(`pickerReadProbe.lateFailureNext=true`);
        await click('#prepare-session');
        await wait(`!document.querySelector('#picker-recheck').hidden`);
        stored = await record();
        assert.equal(stored.revision, beforeUncertainActivation + 1);
        assert.equal(stored.activeRuntime.executionId, executionId,
            'late Activation request rejection preserves the potentially completed target');
        await click('#picker-recheck');
        await wait(`document.body.dataset.mode==='session'&&document.querySelector('#session-picker').hidden`);
        assert.equal((await record()).revision, beforeUncertainActivation + 1, 'Activation Recheck is read-only');
        await click('#primary');
        await wait(`JSON.parse(localStorage.getItem(${JSON.stringify(EDITOR_STORAGE_KEY)})).activeRuntime?.attemptId!==null`);
        await click('#stop');
        await click('#native-complete');
        await wait(`document.body.dataset.mode==='home'`);
        stored = await record();
        assert.equal(stored.executions.find(entry => entry.execution.id === executionId).execution.lifecycle, 'completed');

        await openPicker();
        await choose(`completed:${executionId}`);
        await click('#prepare-session');
        await wait(`document.body.classList.contains('planner-open')&&document.querySelector('#planner h2')?.textContent==='Completed archive'`);
        assert.match(await text('#planner'), /Public native workshop/);
        assert.equal(await evaluate(`Boolean(document.querySelector('#planner [data-field="name"]'))`), false, 'Archive is read-only');
        await click('#planner .planner-back');
        assert.equal(await evaluate(`document.body.classList.contains('planner-open')`), true, 'Archive Back returns to the single native library');
        await click('#planner .planner-back');
        assert.equal(await evaluate(`document.body.dataset.mode==='home'&&!document.body.classList.contains('planner-open')`), true,
            'Library Back restores the Home context');
        await click('#home-quick');
        if (await evaluate(`document.querySelector('#primary').disabled`)) await click('[data-preset="60000"]');
        await click('#primary'); await wait(`document.querySelector('#status').textContent==='Running'`);
        const quickBeforeEditorBack = await evaluate(`(()=>{const key=sessionStorage.getItem('easyTimerRuntimeContext.v1');return {
            key,record:JSON.parse(localStorage.getItem('easyTimerRuntime.v1.'+key))};})()`);
        await menuAction('#open-planner'); await wait(`document.body.classList.contains('planner-open')`);
        await click('#planner .planner-back');
        assert.deepEqual(await evaluate(`(()=>{const value=JSON.parse(localStorage.getItem('easyTimerRuntime.v1.'+${JSON.stringify(quickBeforeEditorBack.key)}));return [
            document.body.dataset.mode,document.body.classList.contains('planner-open'),document.querySelector('#status').textContent,
            value.contextId,value.clock.status,value.clock.deadlineMs];})()`),
        ['quick', false, 'Running', quickBeforeEditorBack.record.contextId, quickBeforeEditorBack.record.clock.status,
            quickBeforeEditorBack.record.clock.deadlineMs],
        'Library Back restores the running Quick Timer without resetting its Recovery ownership or deadline');
        await click('#stop'); await menuAction('#open-home');
        assert.equal(await evaluate(`document.body.dataset.mode`), 'home');

        await evaluate(`window.quickLifecycleConfirm=window.confirm`);
        for (const [label, lifecycle] of [
            ['Keep plan and reset progress', 'planned'], ['Discard run', null], ['Complete and archive', 'completed'],
        ]) {
            await evaluate(`localStorage.setItem(${JSON.stringify(EDITOR_STORAGE_KEY)},${JSON.stringify(JSON.stringify(suspendedSnapshot))});
                localStorage.setItem('easyTimerRuntime.v1.lifecycle-unrelated',${JSON.stringify(JSON.stringify(unrelatedQuick))})`);
            if (await evaluate(`document.body.dataset.mode!=='home'`)) await menuAction('#open-home');
            await click('#home-quick');
            if (await evaluate(`document.querySelector('#primary').disabled`)) await click('[data-preset="60000"]');
            await click('#primary'); await wait(`document.querySelector('#status').textContent==='Running'`);
            const quickBefore = await evaluate(`(()=>{const key=sessionStorage.getItem('easyTimerRuntimeContext.v1');return {key,record:JSON.parse(localStorage.getItem('easyTimerRuntime.v1.'+key))}})()`);
            const source = JSON.stringify(await record());
            await menuAction('#open-planner'); await wait(`document.body.classList.contains('planner-open')`);
            const writesBefore = await evaluate(`pickerReadProbe.requests`);
            await evaluate(`window.confirm=()=>false;Array.from(document.querySelectorAll('#planner button')).find(button=>button.textContent===${JSON.stringify(label)}).click()`);
            await click('#planner [data-native-lifecycle-dialog] .confirm-stop'); await delay(50);
            assert.equal(JSON.stringify(await record()), source, `${label}: rejected Quick departure performs no lifecycle mutation`);
            assert.equal(await evaluate(`pickerReadProbe.requests`), writesBefore, `${label}: rejected confirmation performs no Store write`);
            assert.deepEqual(await evaluate(`(()=>{const value=JSON.parse(localStorage.getItem('easyTimerRuntime.v1.'+${JSON.stringify(quickBefore.key)}));return [document.body.classList.contains('planner-open'),document.body.dataset.mode,value.contextId,value.clock.status,value.clock.deadlineMs]})()`),
                [true, 'quick', quickBefore.record.contextId, quickBefore.record.clock.status, quickBefore.record.clock.deadlineMs],
                `${label}: rejected confirmation preserves Quick identity, status and deadline`);

            await evaluate(`window.confirm=()=>true;Array.from(document.querySelectorAll('#planner button')).find(button=>button.textContent===${JSON.stringify(label)}).click()`);
            await click('#planner [data-native-lifecycle-dialog] .confirm-stop');
            await wait(`document.body.dataset.mode==='home'&&!document.body.classList.contains('planner-open')`);
            const target = await record();
            assert.equal(target.executions.find(entry => entry.execution.id === executionId)?.execution.lifecycle ?? null, lifecycle,
                `${label}: accepted confirmation writes the terminal lifecycle exactly once`);
            assert.equal(target.revision, suspendedSnapshot.revision + 1);
            assert.equal(await evaluate(`localStorage.getItem('easyTimerRuntime.v1.lifecycle-unrelated')`), JSON.stringify(unrelatedQuick),
                `${label}: unrelated recovery remains untouched`);
        }

        await evaluate(`localStorage.setItem(${JSON.stringify(EDITOR_STORAGE_KEY)},${JSON.stringify(JSON.stringify(suspendedSnapshot))})`);
        await click('#home-quick');
        if (await evaluate(`document.querySelector('#primary').disabled`)) await click('[data-preset="60000"]');
        await click('#primary'); await wait(`document.querySelector('#status').textContent==='Running'`);
        const uncertainQuick = await evaluate(`(()=>{const key=sessionStorage.getItem('easyTimerRuntimeContext.v1');return {key,record:JSON.parse(localStorage.getItem('easyTimerRuntime.v1.'+key))}})()`);
        await menuAction('#open-planner'); await wait(`document.body.classList.contains('planner-open')`);
        await evaluate(`window.confirm=()=>true;pickerReadProbe.lateFailureNext=true;Array.from(document.querySelectorAll('#planner button')).find(button=>button.textContent==='Keep plan and reset progress').click()`);
        await click('#planner [data-native-lifecycle-dialog] .confirm-stop');
        await wait(`Boolean(document.querySelector('#planner [data-native-recheck]'))`);
        assert.deepEqual(await evaluate(`(()=>{const value=JSON.parse(localStorage.getItem('easyTimerRuntime.v1.'+${JSON.stringify(uncertainQuick.key)}));return [document.body.classList.contains('planner-open'),document.body.dataset.mode,value.contextId,value.clock.status,value.clock.deadlineMs]})()`),
            [true, 'quick', uncertainQuick.record.contextId, uncertainQuick.record.clock.status, uncertainQuick.record.clock.deadlineMs],
            'uncertain lifecycle write retains the Workspace, ticket and unrelated Quick Timer');
        const uncertainRevision = (await record()).revision;
        await click('#planner [data-native-recheck]');
        await wait(`document.body.dataset.mode==='home'&&!document.body.classList.contains('planner-open')`);
        assert.equal((await record()).revision, uncertainRevision, 'read-only target Recheck closes to Home without a duplicate write');
        await evaluate(`window.confirm=window.quickLifecycleConfirm`);

        await menuAction('#open-planner');
        await wait(`document.body.classList.contains('planner-open')`);
        await evaluate(`window.cutoverConfirm=window.confirm;window.cutoverAnswers=[false,true];window.confirm=()=>window.cutoverAnswers.shift()`);
        await evaluate(`Array.from(document.querySelectorAll('#planner button')).find(button=>button.textContent==='Create template').click()`);
        await evaluate(`(()=>{const input=document.querySelector('#planner [data-field="name"]');input.value='Retained unsaved draft';input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
        await click('#planner .planner-back');
        assert.equal(await evaluate(`document.querySelector('#planner [data-field="name"]').value`), 'Retained unsaved draft', 'Rejected close preserves the complete draft');
        await menuAction('#open-home');
        assert.equal(await evaluate(`!document.body.classList.contains('planner-open')&&document.body.dataset.mode==='home'`), true,
            'confirmed Home navigation may discard the local draft only after the Workspace guard approves');
        await evaluate(`window.confirm=window.cutoverConfirm`);

        await evaluate(`(()=>{
            localStorage.setItem('easyTimerLanguage','de');
            localStorage.setItem('easyTimerRuntime.v1.legacy-cutover-session',${JSON.stringify(JSON.stringify(legacySession))});
            localStorage.setItem('easyTimerRuntime.v1.unrelated-cutover-quick',${JSON.stringify(JSON.stringify(unrelatedQuick))});
            sessionStorage.setItem('easyTimerRuntimeContext.v1','legacy-cutover-session');
            sessionStorage.removeItem('easyTimerView.v1');
        })()`);
        await reload('quick');
        assert.equal(await evaluate(`document.querySelector('#legacy-recovery-dialog').open`), true);
        assert.match(await text('#legacy-recovery-message'), /vorherigen Datenmodell/);
        await click('#legacy-recovery-keep');
        assert.notEqual(await evaluate(`localStorage.getItem('easyTimerRuntime.v1.legacy-cutover-session')`), null,
            'Keeping legacy recovery does not discard or convert it');
        assert.equal(await evaluate(`document.querySelector('#open-session').disabled`), true);
        await click('#legacy-recovery-open');
        await click('#legacy-recovery-discard');
        await wait(`!document.querySelector('#legacy-recovery-dialog').open&&!document.querySelector('#open-session').disabled`);
        assert.equal(await evaluate(`localStorage.getItem('easyTimerRuntime.v1.legacy-cutover-session')`), null);
        assert.equal(await evaluate(`localStorage.getItem('easyTimerRuntime.v1.unrelated-cutover-quick')`), JSON.stringify(unrelatedQuick),
            'Explicit legacy Session discard preserves unrelated Quick recovery');
        console.log('PASS: public native Picker/direct launch, exact started resume identities, Suspend versus Retain Plan, archive, draft close guard, and explicit DE legacy Session recovery discard.');
    } finally {
        await evaluate(`(()=>{
            if(window.pickerReadProbe) navigator.locks.request=window.pickerReadProbe.original;
            delete window.pickerReadProbe;
            if(window.quickLifecycleConfirm) window.confirm=window.quickLifecycleConfirm;
            delete window.quickLifecycleConfirm;
            if(window.cutoverConfirm) window.confirm=window.cutoverConfirm;
            const baseline=${JSON.stringify(baseline)};
            for(const key of Object.keys(localStorage)) if(key.startsWith('easyTimerRuntime.v1.')) localStorage.removeItem(key);
            for(const [key,value] of [[${JSON.stringify(EDITOR_STORAGE_KEY)},baseline.editor],['easyTimerRuntime.v1.legacy-cutover-session',baseline.legacy],['easyTimerRuntime.v1.unrelated-cutover-quick',baseline.unrelated],['easyTimerLanguage',baseline.language]]) {
                if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value);
            }
            sessionStorage.removeItem('easyTimerRuntimeContext.v1');sessionStorage.removeItem('easyTimerView.v1');
        })()`);
        await reload('home');
        await click('#home-quick');
    }
}
