import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import {
    EDITOR_STORAGE_KEY,
    activatePlannedExecutionInRecord,
    applyStartedSessionActionInRecord,
    insertTemplateInRecord,
    planExecutionFromTemplateInRecord,
    startReadyExecutionInRecord,
} from '../src/js/editor-storage.mjs';

const template = {
    schemaVersion: 2,
    kind: 'template',
    id: 'browser-template',
    revision: 1,
    plan: {
        name: 'Native browser workshop',
        category: 'uncategorized',
        transitionMode: 'manual',
        preparedInformation: '',
        phases: [
            { id: 'native-first', title: 'Native first', durationSeconds: 60, category: 'uncategorized', notes: '', resources: [] },
            { id: 'native-second', title: 'Native second', durationSeconds: 120, category: 'uncategorized', notes: '', resources: [] },
        ],
    },
};

const automaticTemplate = {
    ...template,
    id: 'browser-automatic-template',
    plan: {
        ...template.plan,
        name: 'Native automatic workshop',
        transitionMode: 'automatic',
        phases: [
            { id: 'automatic-first', title: 'Automatic first', durationSeconds: 60, category: 'uncategorized', notes: '', resources: [] },
            { id: 'automatic-second', title: 'Automatic second', durationSeconds: 60, category: 'uncategorized', notes: '', resources: [] },
        ],
    },
};

function readyRecord(savedAt = 1000) {
    let record = { schemaVersion: 1, revision: 0, templates: [], executions: [], activeRuntime: null };
    record = insertTemplateInRecord(record, { template, expectedAggregateRevision: 0 });
    record = planExecutionFromTemplateInRecord(record, {
        templateId: template.id,
        executionId: 'browser-execution',
        expectedAggregateRevision: 1,
    });
    return activatePlannedExecutionInRecord(record, {
        executionId: 'browser-execution',
        expectedAggregateRevision: 2,
        expectedExecutionRevision: 1,
        expectedRuntimeRevision: 0,
        runtimeRunId: 'browser-run',
        savedAt,
    });
}

function startedRecord() {
    return startReadyExecutionInRecord(readyRecord(), {
        executionId: 'browser-execution',
        expectedAggregateRevision: 3,
        expectedExecutionRevision: 2,
        expectedRuntimeRevision: 1,
        attemptId: 'browser-attempt',
        startedAt: 2000,
    });
}

function pausedRecord() {
    return applyStartedSessionActionInRecord(startedRecord(), {
        executionId: 'browser-execution',
        expectedAggregateRevision: 4,
        expectedExecutionRevision: 3,
        expectedRuntimeRevision: 2,
        expectedAttemptId: 'browser-attempt',
        expectedRunId: 'browser-run',
        actionType: 'PAUSE',
        occurredAt: 12_000,
    });
}

function startedAutomaticRecord() {
    let record = { schemaVersion: 1, revision: 0, templates: [], executions: [], activeRuntime: null };
    record = insertTemplateInRecord(record, { template: automaticTemplate, expectedAggregateRevision: 0 });
    record = planExecutionFromTemplateInRecord(record, {
        templateId: automaticTemplate.id,
        executionId: 'browser-automatic-execution',
        expectedAggregateRevision: 1,
    });
    record = activatePlannedExecutionInRecord(record, {
        executionId: 'browser-automatic-execution',
        expectedAggregateRevision: 2,
        expectedExecutionRevision: 1,
        expectedRuntimeRevision: 0,
        runtimeRunId: 'browser-automatic-run',
        savedAt: 1000,
    });
    return startReadyExecutionInRecord(record, {
        executionId: 'browser-automatic-execution',
        expectedAggregateRevision: 3,
        expectedExecutionRevision: 2,
        expectedRuntimeRevision: 1,
        attemptId: 'browser-automatic-attempt',
        startedAt: 2000,
    });
}

export async function checkEditorRuntimeApp({ evaluate, click, text, cdp, acceptExpectedConfirm, acceptExpectedUnload }) {
    let clockScript;
    let scenarioFailed = false;
    async function cleanup(action, failed) {
        try { await action(); }
        catch (error) {
            if (!failed) throw error;
            console.error('Native runtime cleanup also failed:', error);
        }
    }
    const wait = async expression => {
        for (let i = 0; i < 100; i++) {
            if (await evaluate(expression)) return;
            await delay(50);
        }
        assert.fail(`Native runtime browser timeout: ${expression}`);
    };
    const setClock = async now => {
        if (clockScript) await cdp('Page.removeScriptToEvaluateOnNewDocument', { identifier: clockScript });
        clockScript = (await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `Date.now=()=>${now};` })).identifier;
    };
    const reload = async (expectedMode, now, expectedView = 'timer') => {
        await setClock(now);
        const origin = await evaluate('performance.timeOrigin');
        await cdp('Page.reload');
        // The Picker deliberately has no timer and never initializes its primary button.
        const rendered = expectedView === 'picker'
            ? "Boolean(document.querySelector('main:not([aria-busy]) #session-picker:not([hidden])'))"
            : "Boolean(document.querySelector('#primary')?.title)";
        await wait(`performance.timeOrigin!==${origin}&&document.body?.dataset.mode===${JSON.stringify(expectedMode)}&&${rendered}`);
    };
    const menuAction = async selector => {
        if (await evaluate(`document.querySelector('#preferences').hidden`)) await click('#menu-toggle');
        await click(selector);
    };
    const install = record => evaluate(`(()=>{
        if(window.exitProbe){exitProbe.armed=false;exitProbe.mode=null;}
        for(const key of Object.keys(localStorage)) if(key.startsWith('easyTimerRuntime.v1.')) localStorage.removeItem(key);
        sessionStorage.removeItem('easyTimerRuntimeContext.v1');
        sessionStorage.removeItem('easyTimerView.v1');
        localStorage.setItem('easyTimerLanguage','en');
        localStorage.setItem(${JSON.stringify(EDITOR_STORAGE_KEY)},${JSON.stringify(JSON.stringify(record))});
    })()`);
    const raw = () => evaluate(`localStorage.getItem(${JSON.stringify(EDITOR_STORAGE_KEY)})`);
    const noLegacyRuntime = () => evaluate(`Object.keys(localStorage).every(key=>!key.startsWith('easyTimerRuntime.v1.'))`);

    try {
        const ready = readyRecord();
        await install(ready);
        await reload('session', 5000);
        assert.equal(await text('#status'), 'Ready');
        assert.equal(await text('#time'), '01:00');
        assert.equal(await raw(), JSON.stringify(ready), 'READY adoption is read-only');
        assert.equal(await noLegacyRuntime(), true, 'Native adoption creates no legacy runtime');
        assert.deepEqual(await evaluate(`['#home-view','#timer-view','#session-picker','#planner'].map(selector=>getComputedStyle(document.querySelector(selector)).display==='none')`),
            [true, false, true, true], 'ACTIVE READY Session exposes only its Timer view');
        assert.equal(await evaluate(`document.querySelector('#open-quick').disabled&&document.querySelector('#next').disabled&&document.querySelector('#export-rundown').hidden`), true,
            'Unsupported replacement, pre-start phase progress and V1 export are unavailable');

        await click('#primary');
        await wait(`JSON.parse(localStorage.getItem(${JSON.stringify(EDITOR_STORAGE_KEY)})).revision===4`);
        let persisted = JSON.parse(await raw());
        const firstAttemptId = persisted.executions[0].execution.attempt.id;
        assert.equal(persisted.revision, 4);
        assert.equal(persisted.executions[0].execution.revision, 3);
        assert.equal(persisted.executions[0].execution.runtimeRevision, 2);
        assert.equal(persisted.executions[0].execution.attempt.startedAt, 5000);
        assert.equal(persisted.executions[0].execution.attempt.runtimeRunId, 'browser-run');
        assert.equal(persisted.activeRuntime.attemptId, firstAttemptId);
        assert.equal(persisted.activeRuntime.runtimeRevision, 2);
        assert.equal(persisted.activeRuntime.savedAt, 5000);
        assert.equal(persisted.activeRuntime.clock.status, 'RUNNING');
        assert.equal(persisted.activeRuntime.clock.deadlineMs, 65_000);
        assert.equal(await text('#status'), 'Running');
        assert.equal(await evaluate(`document.querySelector('#runtime-recovery').hidden
            && !document.querySelector('#primary').disabled`), true,
        'confirmed first START installs locally without blocking the Timer');
        assert.equal(await evaluate(`navigator.locks.request('easyTimerEditor.v1.active-runtime',
            {mode:'exclusive',ifAvailable:true},lock=>lock===null)`), true,
        'first START retains the existing Active Lock');
        assert.equal(await noLegacyRuntime(), true);

        const replacement = structuredClone(persisted);
        replacement.executions[0].execution.attempt.id = 'replacement-attempt';
        replacement.activeRuntime.attemptId = 'replacement-attempt';
        assert.equal(await evaluate(`(async()=>{
            const app=await import(document.querySelector('script[type="module"]').src);
            try{app.installNativeRecord(${JSON.stringify(replacement)});return null}
            catch(error){return error.message}
        })()`), 'invalidActiveRuntimeBinding', 'an unexpected Attempt replacement remains rejected');
        assert.equal(await raw(), JSON.stringify(persisted), 'local installation rejection never writes or repeats START');
        assert.equal(await evaluate(`(async()=>{
            const app=await import(document.querySelector('script[type="module"]').src);
            try{app.installNativeRecord(${JSON.stringify(ready)});return null}
            catch(error){return error.message}
        })()`), 'invalidActiveRuntimeBinding', 'a stale pre-Attempt record cannot replace STARTED authority');

        await reload('session', 6000);
        assert.equal(await text('#status'), 'Running');
        assert.equal(await text('#time'), '00:59');
        assert.equal(JSON.parse(await raw()).executions[0].execution.attempt.id, firstAttemptId,
            'reload adopts the single persisted first Attempt');

        await click('#primary');
        await wait(`JSON.parse(localStorage.getItem(${JSON.stringify(EDITOR_STORAGE_KEY)})).activeRuntime.clock.status==='PAUSED'`);
        persisted = JSON.parse(await raw());
        assert.equal(persisted.executions[0].execution.attempt.id, firstAttemptId,
            'subsequent actions preserve the first Attempt identity');
        assert.equal(persisted.activeRuntime.attemptId, firstAttemptId);
        assert.equal(await text('#status'), 'Paused');
        assert.equal(await evaluate(`document.querySelector('#runtime-recovery').hidden
            && !document.querySelector('#primary').disabled`), true,
        'confirmed PAUSE installs locally without blocking the Timer');
        const pausedRaw = JSON.stringify(persisted);
        await evaluate(`document.dispatchEvent(new Event('visibilitychange'))`);
        assert.equal(await raw(), pausedRaw, 'Display ticks do not persist native runtime');
        await reload('session', 50_000);
        assert.equal(await text('#status'), 'Paused');
        assert.equal(await raw(), pausedRaw, 'Paused adoption remains frozen and read-only');

        await install(ready);
        await reload('session', 7000);
        await evaluate(`(()=>{
            const locks=navigator.locks, original=locks.request.bind(locks);
            window.firstStartInstallProbe={original,armed:true,writes:0};
            locks.request=async function(name,options,callback){
                const result=await original(name,options,callback), probe=window.firstStartInstallProbe;
                if(name!=='easyTimerEditor.v1.write'||!probe.armed) return result;
                probe.armed=false;probe.writes+=1;
                const invalid=structuredClone(result);invalid.revision+=1;return invalid;
            };
        })()`);
        await click('#primary');
        await wait(`JSON.parse(localStorage.getItem(${JSON.stringify(EDITOR_STORAGE_KEY)})).revision===4
            && !document.querySelector('#runtime-recovery').hidden`);
        const persistedAfterInstallFailure = await raw();
        const recoveredAttemptId = JSON.parse(persistedAfterInstallFailure).activeRuntime.attemptId;
        assert.deepEqual(await evaluate(`[firstStartInstallProbe.writes,
            document.querySelector('#primary').disabled,
            JSON.parse(localStorage.getItem(${JSON.stringify(EDITOR_STORAGE_KEY)})).activeRuntime.clock.status]`),
        [1, true, 'RUNNING'], 'local installation failure blocks after exactly one persisted START');
        await evaluate(`document.querySelector('#primary').click()`); await delay(50);
        assert.equal(await evaluate(`firstStartInstallProbe.writes`), 1, 'blocked Runtime cannot repeat first START');
        assert.equal(await raw(), persistedAfterInstallFailure);
        assert.equal(await evaluate(`navigator.locks.request('easyTimerEditor.v1.active-runtime',
            {mode:'exclusive',ifAvailable:true},lock=>lock===null)`), true,
        'blocked local installation retains Active Lock until reload');
        await evaluate(`navigator.locks.request=firstStartInstallProbe.original;delete window.firstStartInstallProbe`);
        await reload('session', 8000);
        assert.equal(await text('#status'), 'Running');
        assert.equal(JSON.parse(await raw()).activeRuntime.attemptId, recoveredAttemptId,
            'reload recovers the persisted START without creating another Attempt');
        assert.equal(await evaluate(`document.querySelector('#runtime-recovery').hidden`), true);

        const running = startedRecord();
        await install(running);
        await reload('session', 32_000);
        assert.equal(await text('#time'), '00:30');
        assert.equal(await raw(), JSON.stringify(running), 'RUNNING reconciliation remains in memory');
        assert.equal(await evaluate(`(async()=>{
            const app=await import(document.querySelector('script[type="module"]').src);
            return app.installNativeRecord(JSON.parse(localStorage.getItem(${JSON.stringify(EDITOR_STORAGE_KEY)}))).status;
        })()`), 'unchanged');
        assert.equal(await text('#time'), '00:30', 'same-revision Workspace reads cannot rewind a running in-memory clock');
        const newerAggregate = structuredClone(running); newerAggregate.revision += 1;
        await evaluate(`localStorage.setItem(${JSON.stringify(EDITOR_STORAGE_KEY)},${JSON.stringify(JSON.stringify(newerAggregate))})`);
        assert.equal(await evaluate(`(async()=>{
            const app=await import(document.querySelector('script[type="module"]').src);
            return app.installNativeRecord(${JSON.stringify(newerAggregate)}).status;
        })()`), 'record');
        assert.equal(await text('#time'), '00:30', 'a newer aggregate with unchanged Runtime revision preserves the running clock');
        assert.equal(await evaluate(`(async()=>{
            const app=await import(document.querySelector('script[type="module"]').src);
            return app.installNativeRecord(${JSON.stringify(running)}).status;
        })()`), 'stale');
        assert.equal(await text('#time'), '00:30', 'a stale aggregate cannot replace the newer installed Runtime authority');

        await evaluate(`(()=>{
            const locks=navigator.locks, original=locks.request.bind(locks);
            window.runtimeReadProbe={original,hold:true,captured:false,release:null};
            locks.request=function(name,options,callback){
                const request=original(name,options,callback), probe=window.runtimeReadProbe;
                if(name!=='easyTimerEditor.v1.write'||!probe.hold) return request;
                probe.hold=false;
                return request.then(result=>new Promise(resolve=>{
                    probe.captured=true;probe.release=()=>resolve(result);
                }));
            };
        })()`);
        await menuAction('#open-planner');
        await wait(`runtimeReadProbe.captured`);
        assert.deepEqual(await evaluate(`['#home-view','#timer-view','#session-picker','#planner'].map(selector=>getComputedStyle(document.querySelector(selector)).display==='none')`),
            [true, true, true, false], 'Event Editor hides every other primary view');
        await evaluate(`document.querySelector('#primary').click()`);
        await wait(`JSON.parse(localStorage.getItem(${JSON.stringify(EDITOR_STORAGE_KEY)})).activeRuntime.clock.status==='PAUSED'`);
        const interleaved = JSON.parse(await raw());
        await evaluate(`runtimeReadProbe.release()`);
        await wait(`document.querySelector('#planner h1')?.textContent==='Event Editor'`);
        await click('#planner .planner-back');
        assert.equal(await text('#status'), 'Paused', 'a delayed stale Workspace read cannot replace a newer Timer write');
        assert.deepEqual(await evaluate(`['#home-view','#timer-view','#session-picker','#planner'].map(selector=>getComputedStyle(document.querySelector(selector)).display==='none')`),
            [true, false, true, true], 'Editor Back restores only the ACTIVE Session Timer');
        assert.equal(await evaluate(`document.activeElement===document.querySelector('#menu-toggle')`), true,
            'Editor Back restores keyboard focus to the menu over the active Timer');
        assert.equal(await raw(), JSON.stringify(interleaved), 'the delayed read performs no compensating write');
        await evaluate(`navigator.locks.request=runtimeReadProbe.original;delete window.runtimeReadProbe`);

        const divergentWorkspace = structuredClone(interleaved);
        divergentWorkspace.templates[0].plan.name = 'Divergent same-revision Workspace';
        await evaluate(`localStorage.setItem(${JSON.stringify(EDITOR_STORAGE_KEY)},${JSON.stringify(JSON.stringify(divergentWorkspace))})`);
        await menuAction('#open-planner');
        await wait(`!document.querySelector('#runtime-recovery').hidden`);
        assert.equal(await evaluate(`document.querySelector('#primary').disabled`), true,
            'a conflicting same-revision Workspace read blocks the active Runtime safely');
        await click('#planner .planner-back');
        await install(running);
        await reload('session', 72_000);
        assert.equal(await text('#status'), 'Phase time elapsed');
        assert.equal(await raw(), JSON.stringify(running), 'FINISHED reconciliation remains in memory');

        await evaluate(`(()=>{
            const set=Storage.prototype.setItem;
            window.bug002WriteProbe={set,writes:0};
            Storage.prototype.setItem=function(key,value){
                if(key===${JSON.stringify(EDITOR_STORAGE_KEY)}) bug002WriteProbe.writes++;
                return set.call(this,key,value);
            };
        })()`);

        await click('#next');
        await wait(`JSON.parse(localStorage.getItem(${JSON.stringify(EDITOR_STORAGE_KEY)})).activeRuntime.run.currentIndex===1`);
        assert.deepEqual(await evaluate(`[bug002WriteProbe.writes,
            JSON.parse(localStorage.getItem(${JSON.stringify(EDITOR_STORAGE_KEY)})).revision,
            document.querySelector('#runtime-recovery').hidden,
            document.querySelector('#primary').disabled]`), [1, 5, true, false],
        'NEXT performs one write and installs phase 2 READY without a blocker');
        assert.equal(await text('#current-phase'), 'Native second');
        assert.equal(await text('#status'), 'Ready');
        await evaluate(`Storage.prototype.setItem=bug002WriteProbe.set;delete window.bug002WriteProbe`);
        await reload('session', 73_000);
        assert.equal(await text('#current-phase'), 'Native second', 'reload adopts the committed phase 2');
        assert.equal(await text('#status'), 'Ready');
        await evaluate(`(()=>{
            const set=Storage.prototype.setItem;
            window.bug002WriteProbe={set,writes:0};
            Storage.prototype.setItem=function(key,value){
                if(key===${JSON.stringify(EDITOR_STORAGE_KEY)}) bug002WriteProbe.writes++;
                return set.call(this,key,value);
            };
        })()`);
        await click('#primary');
        await wait(`JSON.parse(localStorage.getItem(${JSON.stringify(EDITOR_STORAGE_KEY)})).activeRuntime.clock.status==='RUNNING'`);
        assert.deepEqual(await evaluate(`[bug002WriteProbe.writes,
            JSON.parse(localStorage.getItem(${JSON.stringify(EDITOR_STORAGE_KEY)})).revision,
            document.querySelector('#runtime-recovery').hidden,
            document.querySelector('#primary').disabled]`), [1, 6, true, false],
        'later-phase START performs one write and installs RUNNING without a blocker');
        await click('#primary');
        await wait(`JSON.parse(localStorage.getItem(${JSON.stringify(EDITOR_STORAGE_KEY)})).activeRuntime.clock.status==='PAUSED'`);
        assert.deepEqual(await evaluate(`[bug002WriteProbe.writes,
            JSON.parse(localStorage.getItem(${JSON.stringify(EDITOR_STORAGE_KEY)})).revision,
            document.querySelector('#runtime-recovery').hidden]`), [2, 7, true],
        'later-phase PAUSE installs after exactly one write');
        await click('#primary');
        await wait(`JSON.parse(localStorage.getItem(${JSON.stringify(EDITOR_STORAGE_KEY)})).activeRuntime.clock.status==='RUNNING'`);
        assert.deepEqual(await evaluate(`[bug002WriteProbe.writes,
            JSON.parse(localStorage.getItem(${JSON.stringify(EDITOR_STORAGE_KEY)})).revision,
            document.querySelector('#runtime-recovery').hidden]`), [3, 8, true],
        'later-phase RESUME installs after exactly one write');
        await click('#next');
        await wait(`JSON.parse(localStorage.getItem(${JSON.stringify(EDITOR_STORAGE_KEY)})).activeRuntime.run.stage==='COMPLETED'`);
        const completed = JSON.parse(await raw());
        assert.deepEqual(await evaluate(`[bug002WriteProbe.writes,
            JSON.parse(localStorage.getItem(${JSON.stringify(EDITOR_STORAGE_KEY)})).revision,
            document.querySelector('#runtime-recovery').hidden]`), [4, 9, true],
        'COMPLETE installs after exactly one write');
        await click('#stop-overtime');
        await wait(`JSON.parse(localStorage.getItem(${JSON.stringify(EDITOR_STORAGE_KEY)})).activeRuntime.clock.status==='OVERTIME_STOPPED'`);
        assert.deepEqual(await evaluate(`[bug002WriteProbe.writes,
            JSON.parse(localStorage.getItem(${JSON.stringify(EDITOR_STORAGE_KEY)})).revision,
            document.querySelector('#runtime-recovery').hidden]`), [5, 10, true],
        'STOP_OVERTIME installs after exactly one write');
        assert.deepEqual(await evaluate(`(()=>{const record=JSON.parse(localStorage.getItem(${JSON.stringify(EDITOR_STORAGE_KEY)}));
            return [record.executions[0].execution.attempt.id,record.activeRuntime.attemptId,
                record.executions[0].execution.attempt.runtimeRunId,record.activeRuntime.run.runId]})()`),
        ['browser-attempt', 'browser-attempt', 'browser-run', 'browser-run'],
        'every confirmed action preserves Attempt and Run identity');
        assert.equal(await evaluate(`navigator.locks.request('easyTimerEditor.v1.active-runtime',
            {mode:'exclusive',ifAvailable:true},lock=>lock===null)`), true,
        'confirmed session actions retain the Active Lock');
        assert.equal(await evaluate(`document.activeElement===document.querySelector('#fullscreen')&&!document.activeElement.disabled`), true,
            'Stopping native overtime moves focus to an enabled control');
        await evaluate(`Storage.prototype.setItem=bug002WriteProbe.set;delete window.bug002WriteProbe`);

        await install(startedRecord());
        await reload('session', 5000);
        assert.equal(await evaluate(`(async()=>{
            const app=await import(document.querySelector('script[type="module"]').src);
            try{app.installNativeRecord(${JSON.stringify(pausedRecord())});return null}
            catch(error){return error.message}
        })()`), 'nativeRecordConflict',
        'an arbitrary same-binding Runtime replacement remains rejected');
        await evaluate(`(()=>{
            const locks=navigator.locks, original=locks.request.bind(locks);
            window.sessionInstallProbe={original,armed:true,writes:0};
            locks.request=async function(name,options,callback){
                const result=await original(name,options,callback), probe=window.sessionInstallProbe;
                if(name!=='easyTimerEditor.v1.write'||!probe.armed) return result;
                probe.armed=false;probe.writes+=1;
                const invalid=structuredClone(result);invalid.revision+=1;return invalid;
            };
        })()`);
        await click('#primary');
        await wait(`JSON.parse(localStorage.getItem(${JSON.stringify(EDITOR_STORAGE_KEY)})).activeRuntime.clock.status==='PAUSED'
            && !document.querySelector('#runtime-recovery').hidden`);
        const persistedAfterSessionInstallFailure = await raw();
        assert.deepEqual(await evaluate(`[sessionInstallProbe.writes,
            document.querySelector('#primary').disabled,
            JSON.parse(localStorage.getItem(${JSON.stringify(EDITOR_STORAGE_KEY)})).revision]`),
        [1, true, 5], 'local installation failure blocks after one confirmed session-action write');
        await evaluate(`document.querySelector('#primary').click()`); await delay(50);
        assert.equal(await evaluate(`sessionInstallProbe.writes`), 1,
            'blocked Runtime cannot repeat a confirmed session action');
        assert.equal(await raw(), persistedAfterSessionInstallFailure);
        await evaluate(`navigator.locks.request=sessionInstallProbe.original;delete window.sessionInstallProbe`);
        await reload('session', 6000);
        assert.equal(await text('#status'), 'Paused',
            'reload adopts the already committed action after local installation failure');
        assert.equal(await evaluate(`document.querySelector('#runtime-recovery').hidden`), true);

        await install(completed);
        await cdp('Emulation.setTouchEmulationEnabled', { enabled: true });
        await cdp('Emulation.setDeviceMetricsOverride', {
            width: 390, height: 844, screenWidth: 390, screenHeight: 844, deviceScaleFactor: 1, mobile: true,
        });
        await reload('session', completed.activeRuntime.savedAt + 1_000);
        assert.equal(await evaluate(`document.body.dataset.device==='smartphone'&&document.querySelector('#fullscreen').hidden`), true);
        await click('#stop-overtime');
        await wait(`JSON.parse(localStorage.getItem(${JSON.stringify(EDITOR_STORAGE_KEY)})).activeRuntime.clock.status==='OVERTIME_STOPPED'`);
        assert.equal(await evaluate(`document.activeElement===document.querySelector('#menu-toggle')&&!document.activeElement.disabled`), true,
            'Stopping native overtime moves smartphone focus to the enabled menu control');
        await cdp('Emulation.setTouchEmulationEnabled', { enabled: false });
        await cdp('Emulation.clearDeviceMetricsOverride');

        const automatic = startedAutomaticRecord();
        await install(automatic);
        await reload('session', 65_000);
        assert.equal(await text('#current-phase'), 'Automatic second');
        assert.equal(await text('#time'), '00:57');
        assert.equal(await raw(), JSON.stringify(automatic), 'Automatic catch-up is derived without a speculative write');
        await click('#primary');
        await wait(`JSON.parse(localStorage.getItem(${JSON.stringify(EDITOR_STORAGE_KEY)})).activeRuntime.clock.status==='PAUSED'`);
        const automaticPaused = JSON.parse(await raw());
        assert.equal(automaticPaused.activeRuntime.run.currentIndex, 1);
        assert.equal(automaticPaused.activeRuntime.attemptId, 'browser-automatic-attempt');
        assert.equal(automaticPaused.activeRuntime.run.runId, 'browser-automatic-run');
        await reload('session', 100_000);
        assert.equal(await text('#current-phase'), 'Automatic second');
        assert.equal(await text('#status'), 'Paused');

        await install(ready);
        await reload('session', 5000);
        const concurrent = structuredClone(ready); concurrent.revision += 1;
        await evaluate(`localStorage.setItem(${JSON.stringify(EDITOR_STORAGE_KEY)},${JSON.stringify(JSON.stringify(concurrent))})`);
        await click('#primary');
        await wait(`!document.querySelector('#runtime-recovery').hidden`);
        assert.equal(await raw(), JSON.stringify(concurrent), 'A revision conflict is never overwritten');
        assert.equal(await evaluate(`document.querySelector('#primary').disabled`), true);
        assert.match(await text('#recovery-feedback'), /can no longer be changed safely/);

        await evaluate(`localStorage.setItem(${JSON.stringify(EDITOR_STORAGE_KEY)},'{broken')`);
        await reload('quick', 6000);
        assert.equal(await raw(), '{broken', 'Corrupt native storage is never reset');
        assert.equal(await evaluate(`!document.querySelector('#runtime-recovery').hidden&&document.querySelector('#open-session').disabled`), true);

        await install(ready);
        await evaluate(`Boolean(window.nativeOwner=window.open('/','native-runtime-owner'))`);
        await wait(`window.nativeOwner?.document?.body?.dataset.mode==='session'`);
        await reload('quick', 7000);
        assert.equal(await raw(), JSON.stringify(ready), 'Foreign ownership prevents native adoption without a write');
        assert.equal(await evaluate(`!document.querySelector('#runtime-recovery').hidden`), true);
        await evaluate(`Boolean(window.open('','native-runtime-owner').close())`);

        // Exercise the real module instance loaded by index.html, not a second App.
        const call = (method, options) => evaluate(`(async()=>{
            const app=await import(new URL(document.querySelector('script[type="module"]').src).href);
            return app[${JSON.stringify(method)}](${JSON.stringify(options)});
        })()`);
        const exitOptions = intent => ({ intent, executionId: 'browser-execution', attemptId: 'browser-attempt',
            runtimeRunId: 'browser-run', workshopNotes: { rundown: 'All open rundown notes',
                phases: [{ phaseId: 'native-first', text: 'First draft' }, { phaseId: 'native-second', text: 'Future draft' }] } });
        const held = () => evaluate(`navigator.locks.query().then(value=>value.held.some(lock=>lock.name==='easyTimerEditor.v1.active-runtime'))`);
        const faultScript = (await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `
            window.exitProbe={events:[],writes:0,mode:null,afterWrite:0};
            const probe=window.exitProbe, get=Storage.prototype.getItem, set=Storage.prototype.setItem;
            Storage.prototype.getItem=function(key){
                if(key==='easyTimerEditor.v1'&&probe.writes){
                    probe.afterWrite++;
                    if(probe.mode==='unconfirmed'&&probe.afterWrite===1) throw new Error('Readback unavailable');
                    if(probe.mode==='cleanup'&&probe.afterWrite===2) throw new Error('Cleanup read unavailable');
                }
                return get.call(this,key);
            };
            Storage.prototype.setItem=function(key,value){
                if(key==='easyTimerEditor.v1'&&probe.armed){
                    if(probe.mode==='quota') throw new DOMException('Full','QuotaExceededError');
                    probe.writes++; probe.afterWrite=0;
                    probe.events.push('persist');
                    if(probe.mode==='source') return;
                    if(probe.mode==='conflict'){const record=JSON.parse(value);record.revision++;value=JSON.stringify(record);}
                }
                if(key.startsWith('easyTimerRuntime.v1.')) {
                    if(JSON.parse(value).run) probe.events.push('legacy-session-write');
                    else probe.events.push('quick-write');
                }
                return set.call(this,key,value);
            };
            const request=navigator.locks.request.bind(navigator.locks);
            navigator.locks.request=function(name,options,callback){
                if(name==='easyTimerEditor.v1.write'&&probe.requestFailure) throw new Error('Request rejected before callback');
                return request(name,options,lock=>{
                    const invoke=()=>{
                        const result=callback(lock);
                        if(name==='easyTimerEditor.v1.active-runtime'&&lock) return Promise.resolve(result).then(()=>{
                            probe.events.push('release');
                            if(probe.releaseFailure){probe.releaseFailure=false;throw new Error('Release acknowledgement lost');}
                        });
                        if(name==='easyTimerEditor.v1.write'&&probe.lateFailure&&probe.writes){
                            probe.lateFailure=false;throw new Error('Late store acknowledgement lost');
                        }
                        return result;
                    };
                    if(name==='easyTimerEditor.v1.write'&&probe.gate){
                        probe.gate=false;probe.waiting=true;
                        return new Promise(resolve=>{probe.proceed=resolve;}).then(invoke);
                    }
                    return invoke();
                });
            };
        ` })).identifier;
        let exitScenarioFailed = false;
        try {
            for (const intent of ['suspend', 'retainPlan', 'discard', 'complete']) {
                await install(startedRecord()); await reload('session', 12_000);
                await evaluate(`exitProbe.armed=true`);
                assert.deepEqual(await call('exitNativeExecution', exitOptions(intent)), { status: 'exited', persisted: true });
                assert.equal(await held(), false);
                assert.equal(await evaluate(`document.body.dataset.mode`), 'home');
                const archived = JSON.parse(await raw());
                assert.equal(archived.activeRuntime, null);
                assert.equal(archived.executions[0]?.execution.lifecycle ?? null,
                    { suspend: 'suspended', retainPlan: 'planned', discard: null, complete: 'completed' }[intent]);
                if (['suspend', 'complete'].includes(intent)) {
                    assert.deepEqual(archived.executions[0].execution.workshopNotes, exitOptions(intent).workshopNotes);
                }
                assert.deepEqual(await evaluate(`exitProbe.events`), ['persist', 'release']);
                await evaluate(`document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('pageshow'))`);
                assert.equal(await raw(), JSON.stringify(archived), 'Old callbacks cannot recreate the exited runtime');
                assert.equal(await evaluate(`exitProbe.events.includes('legacy-session-write')`), false);
                await click('#open-session');
                assert.equal(await evaluate(`document.body.dataset.mode==='session'&&!document.querySelector('#session-picker').hidden`), true,
                    'Native re-entry opens the authoritative native Picker');
                await click('#picker-back');
                await click('[data-preset="60000"]'); await click('#primary');
                await reload('quick', 13_000);
                assert.equal(await text('#status'), 'Running');
                assert.equal(await text('#time'), '00:59', 'Quick recovery works after native handoff');
                assert.equal(await raw(), JSON.stringify(archived));
                const recoveredQuick = () => evaluate(`(() => {
                    const context = sessionStorage.getItem('easyTimerRuntimeContext.v1');
                    return { context, record: localStorage.getItem('easyTimerRuntime.v1.' + context) };
                })()`);
                const quickBeforeSwitch = await recoveredQuick();
                assert.equal(JSON.parse(quickBeforeSwitch.record).clock.status, 'RUNNING');
                const departure = 'Leave the current Quick Timer and open Event Timer? The current Quick Timer progress will be discarded.';
                const cancelled = await acceptExpectedConfirm([departure], () => click('#open-session'), { accept: false });
                assert.equal(cancelled.handled, true, 'A recovered running Quick Timer asks before departure');
                assert.equal(cancelled.accepted, false);
                assert.equal(await evaluate(`document.body.dataset.mode==='quick'&&document.querySelector('#session-picker').hidden`), true);
                assert.equal(await text('#status'), 'Running');
                assert.equal(await text('#time'), '00:59');
                assert.deepEqual(await recoveredQuick(), quickBeforeSwitch, 'Cancel preserves the recovered context and exact clock record');
                assert.equal(await raw(), JSON.stringify(archived), 'Cancel preserves the authoritative Event store');
                const accepted = await acceptExpectedConfirm([departure], () => click('#open-session'));
                assert.equal(accepted.accepted, true, 'The expected Quick departure confirmation was accepted');
                assert.equal(await evaluate(`document.body.dataset.mode==='session'&&!document.querySelector('#session-picker').hidden`), true,
                    'Reload after exit exposes only the native Template/Execution Picker');
                assert.equal(await raw(), JSON.stringify(archived), 'Opening the Picker leaves the Event store unchanged');
                await click('#picker-back');
            }
            console.log('PASS: recovered Quick Timer departure confirmation preserves Quick and Event records on cancel and opens the Picker on acceptance.');
            for (const mode of ['unconfirmed', 'source', 'conflict']) {
                await install(startedRecord()); await reload('session', 12_000);
                await evaluate(`exitProbe.armed=true;exitProbe.mode=${JSON.stringify(mode)}`);
                const result = await call('exitNativeExecution', exitOptions('suspend'));
                assert.equal(result.status, 'uncertain');
                assert.match(await text('#recovery-feedback'), /could not be confirmed/);
                assert.equal(await held(), true);
                assert.equal(await evaluate(`document.body.dataset.mode`), 'session');
                await click('#primary'); await click('#open-quick');
                assert.equal(await evaluate(`exitProbe.writes`), 1, 'No semantic write or navigation while uncertain');
                assert.equal((await call('exitNativeExecution', exitOptions('suspend'))).code, 'nativeExitPending');
                await evaluate(`exitProbe.mode=null`);
                const reconciliation = await call('continueNativeExecutionExit');
                assert.equal(reconciliation.status, { unconfirmed: 'exited', source: 'source', conflict: 'uncertain' }[mode]);
                assert.equal(await held(), mode !== 'unconfirmed');
                assert.equal(await evaluate(`exitProbe.writes`), 1, 'Reconciliation never repeats persistence');
                assert.equal(await evaluate(`exitProbe.events.includes('legacy-session-write')`), false);
            }
            const unresolved = await raw();
            const guardedReload = await acceptExpectedUnload(async () => {
                await install(startedRecord()); await reload('session', 12_000);
            });
            assert.equal(guardedReload.handled, true, 'Leaving an unresolved lifecycle operation requires beforeunload confirmation');
            assert.notEqual(unresolved, null, 'The unresolved scenario retained its authoritative record');
            assert.equal(await raw(), JSON.stringify(startedRecord()), 'The next scenario starts with its exact fixture');
            for (const mode of ['quota', 'cleanup', 'release', 'late']) {
                await install(startedRecord()); await reload('session', 12_000);
                await evaluate(`exitProbe.armed=true;exitProbe.mode=${JSON.stringify(mode)};
                    exitProbe.releaseFailure=${mode === 'release'};exitProbe.lateFailure=${mode === 'late'}`);
                const result = await call('exitNativeExecution', exitOptions('complete'));
                assert.equal(result.status, mode === 'quota' ? 'error' : mode === 'late' ? 'exited' : 'handoffFailed');
                assert.equal(await evaluate(`document.body.dataset.mode`), mode === 'late' ? 'home' : 'session');
                if (mode === 'quota') {
                    assert.equal(await held(), true); assert.equal(await raw(), JSON.stringify(startedRecord()));
                } else if (mode !== 'late') {
                    assert.equal(result.persisted, true);
                    assert.match(await text('#recovery-feedback'), /action for this event is saved.*timer handoff could not finish/);
                    assert.equal(JSON.parse(await raw()).executions[0].execution.lifecycle, 'completed');
                    await click('#open-quick');
                    assert.equal(await evaluate(`document.body.dataset.mode`), 'session');
                    await evaluate(`exitProbe.mode=null`);
                    assert.equal((await call('continueNativeExecutionExit')).status, 'exited');
                    assert.equal(await evaluate(`exitProbe.writes`), 1);
                    assert.equal(await evaluate(`exitProbe.events.filter(value=>value==='release').length`), 1);
                }
            }
            await install(startedRecord()); await reload('session', 12_000);
            for (const invalid of [{ executionId: 'foreign' }, { attemptId: null }, { runtimeRunId: 'foreign' }]) {
                assert.equal((await call('exitNativeExecution', { ...exitOptions('suspend'), ...invalid })).code, 'nativeExitIdentity');
            }
            await evaluate(`exitProbe.armed=true;exitProbe.gate=true;
                window.exitResult=import(new URL(document.querySelector('script[type="module"]').src).href)
                    .then(app=>app.exitNativeExecution(${JSON.stringify(exitOptions('suspend'))}));void 0;`);
            await wait('exitProbe.waiting');
            assert.equal((await call('exitNativeExecution', exitOptions('discard'))).code, 'nativeExitPending');
            assert.equal(await evaluate(`(async()=>{const app=await import(new URL(document.querySelector('script[type="module"]').src).href);
                try{app.installNativeRecord(${JSON.stringify(readyRecord())});return false;}catch(error){return error.message==='nativeExitPending';}})()`), true,
            'A different runtime cannot be installed during handoff');
            await click('#primary'); await click('#open-quick'); await click('#open-planner');
            assert.equal(await evaluate(`document.body.dataset.mode==='session'&&!document.body.classList.contains('planner-open')`), true);
            assert.equal(await evaluate(`exitProbe.writes`), 0);
            await evaluate(`exitProbe.proceed()`);
            assert.equal((await evaluate('exitResult')).status, 'exited');
            assert.equal(await evaluate(`exitProbe.writes`), 1);
            // A pre-confirmation reload recovers the authoritative ACTIVE source;
            // a post-confirmation reload above recovers only the Quick Timer.
            await install(startedRecord()); await reload('session', 12_000);
            await reload('session', 13_000);
            assert.equal(await raw(), JSON.stringify(startedRecord()));
            assert.equal(await noLegacyRuntime(), true);
            await evaluate(`exitProbe.armed=true;exitProbe.mode='cleanup'`);
            assert.equal((await call('exitNativeExecution', exitOptions('complete'))).status, 'handoffFailed');
            const persistedExit = await raw();
            const completed = JSON.parse(persistedExit);
            assert.equal(completed.revision, startedRecord().revision + 1);
            assert.equal(completed.activeRuntime, null);
            assert.equal(completed.executions[0].execution.lifecycle, 'completed');
            const historyIdentity = async () => {
                const { currentIndex, entries } = await cdp('Page.getNavigationHistory');
                return { currentIndex, entries: entries.map(({ id, url }) => ({ id, url })) };
            };
            const history = await historyIdentity();
            const cleanupReload = await acceptExpectedUnload(() => reload('session', 14_000, 'picker'));
            assert.equal(cleanupReload.handled, true, 'A pending handoff protects the confirmed exit before reload');
            assert.equal(await raw(), persistedExit, 'Reload after confirmation cannot restore the old native run');
            assert.deepEqual(await evaluate(`['#home-view','#timer-view','#session-picker','#planner'].filter(selector =>
                getComputedStyle(document.querySelector(selector)).display !== 'none')`), ['#session-picker'],
                'Session view metadata may reopen only the native Picker after a native exit');
            assert.deepEqual(await historyIdentity(), history, 'Protected reload stays on the same history entry');
            assert.equal(await evaluate('document.title'), 'easyTimer', 'The Picker clears the old timer title');
            assert.equal(await evaluate("sessionStorage.getItem('easyTimerView.v1')"), 'session');
            assert.equal(await evaluate("document.querySelector('#runtime-recovery').hidden"), true,
                'A confirmed exit does not reopen a recovery prompt');
            assert.equal(await evaluate(`Object.keys(localStorage).filter(key=>key.startsWith('easyTimerRuntime.v1.'))
                .every(key=>!JSON.parse(localStorage.getItem(key)).run)`), true);
            console.log('PASS: protected reload after confirmed exit restores only the Picker, with unchanged completed Event and no runtime recovery prompt.');
            for (const intent of ['suspend', 'retainPlan', 'discard', 'complete']) {
                await install(readyRecord()); await reload('session', 12_000);
                const result = await call('exitNativeExecution', { ...exitOptions(intent), attemptId: null });
                assert.equal(result.status, intent === 'complete' ? 'error' : 'exited');
                assert.equal(await held(), intent === 'complete');
                assert.equal(await evaluate(`document.body.dataset.mode`), intent === 'complete' ? 'session' : 'home');
            }
            await install(startedRecord()); await reload('session', 12_000);
            await evaluate(`exitProbe.armed=true;exitProbe.requestFailure=true`);
            assert.deepEqual(await call('exitNativeExecution', exitOptions('suspend')),
                { status: 'error', persisted: false, code: 'lockRequest' });
            assert.equal(await held(), true);
            assert.equal(await evaluate(`exitProbe.writes`), 0);
            await evaluate(`exitProbe.requestFailure=false`);
            const stale = startedRecord(); stale.revision++;
            await evaluate(`localStorage.setItem(${JSON.stringify(EDITOR_STORAGE_KEY)},${JSON.stringify(JSON.stringify(stale))});exitProbe.writes=0`);
            assert.equal((await call('exitNativeExecution', exitOptions('suspend'))).code, 'conflict');
            assert.equal(await held(), true);
            assert.equal(await evaluate(`exitProbe.writes`), 0);
            await install(startedRecord()); await reload('session', 12_000);
            const invalidNotes = { rundown: '', phases: [{ phaseId: 'missing', text: 'Unsaved' }] };
            assert.equal((await call('exitNativeExecution', { ...exitOptions('suspend'), workshopNotes: invalidNotes })).code, 'invalidNotes');
            assert.deepEqual(invalidNotes, { rundown: '', phases: [{ phaseId: 'missing', text: 'Unsaved' }] });
            assert.equal(await raw(), JSON.stringify(startedRecord()));
            // The native-adopted document still has an older tab association.
            // Handoff must create a fresh Quick context, not overwrite that run.
            const oldQuick = { schemaVersion: 1, contextId: 'unrelated-quick', savedAt: 10_000, mode: 'quick',
                clock: { status: 'PAUSED', durationMs: 60_000, adjustmentMs: 0, remainingMs: 50_000, deadlineMs: null, overtimeMs: 0 } };
            await evaluate(`localStorage.setItem('easyTimerRuntime.v1.unrelated-quick',${JSON.stringify(JSON.stringify(oldQuick))});
                sessionStorage.setItem('easyTimerRuntimeContext.v1','unrelated-quick');`);
            assert.equal((await call('exitNativeExecution', exitOptions('retainPlan'))).status, 'exited');
            assert.equal(await evaluate(`localStorage.getItem('easyTimerRuntime.v1.unrelated-quick')`), JSON.stringify(oldQuick));
            console.log('PASS: native App exits, ordering, reconciliation, cleanup failures, navigation gates and Quick recovery');
        } catch (error) {
            exitScenarioFailed = true;
            throw error;
        } finally {
            await cleanup(() => cdp('Page.removeScriptToEvaluateOnNewDocument', { identifier: faultScript }), exitScenarioFailed);
        }
    } catch (error) {
        scenarioFailed = true;
        throw error;
    } finally {
        await cleanup(async () => {
            await cdp('Emulation.setTouchEmulationEnabled', { enabled: false });
            await cdp('Emulation.clearDeviceMetricsOverride');
            await evaluate(`(()=>{
                if(window.firstStartInstallProbe) navigator.locks.request=window.firstStartInstallProbe.original;
                delete window.firstStartInstallProbe;
                if(window.runtimeReadProbe) navigator.locks.request=window.runtimeReadProbe.original;
                delete window.runtimeReadProbe;
                window.nativeOwner?.close();
                window.open('','native-runtime-owner').close();
                localStorage.removeItem(${JSON.stringify(EDITOR_STORAGE_KEY)});
                for(const key of Object.keys(localStorage)) if(key.startsWith('easyTimerRuntime.v1.')) localStorage.removeItem(key);
                sessionStorage.removeItem('easyTimerRuntimeContext.v1');
                sessionStorage.removeItem('easyTimerView.v1');
            })()`);
            if (clockScript) await cdp('Page.removeScriptToEvaluateOnNewDocument', { identifier: clockScript });
            const origin = await evaluate('performance.timeOrigin');
            await cdp('Page.reload');
            await wait(`performance.timeOrigin!==${origin}&&document.body?.dataset.mode==='home'`);
            await click('#home-quick');
        }, scenarioFailed);
    }
}
