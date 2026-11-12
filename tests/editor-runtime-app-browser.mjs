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

export async function checkEditorRuntimeApp({ evaluate, click, text, cdp }) {
    let clockScript;
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
    const reload = async (expectedMode, now) => {
        await setClock(now);
        const origin = await evaluate('performance.timeOrigin');
        await cdp('Page.reload');
        await wait(`performance.timeOrigin!==${origin}&&document.body?.dataset.mode===${JSON.stringify(expectedMode)}&&Boolean(document.querySelector('#primary')?.title)`);
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
        assert.equal(await evaluate(`document.querySelector('#open-quick').disabled&&document.querySelector('#next').disabled&&document.querySelector('#export-rundown').hidden`), true,
            'Unsupported replacement, pre-start phase progress and V1 export are unavailable');

        await click('#primary');
        await wait(`JSON.parse(localStorage.getItem(${JSON.stringify(EDITOR_STORAGE_KEY)})).revision===4`);
        let persisted = JSON.parse(await raw());
        assert.equal(persisted.executions[0].execution.attempt.runtimeRunId, 'browser-run');
        assert.equal(persisted.activeRuntime.clock.status, 'RUNNING');
        assert.equal(await noLegacyRuntime(), true);

        await click('#primary');
        await wait(`JSON.parse(localStorage.getItem(${JSON.stringify(EDITOR_STORAGE_KEY)})).activeRuntime.clock.status==='PAUSED'`);
        persisted = JSON.parse(await raw());
        const pausedRaw = JSON.stringify(persisted);
        await evaluate(`document.dispatchEvent(new Event('visibilitychange'))`);
        assert.equal(await raw(), pausedRaw, 'Display ticks do not persist native runtime');
        await reload('session', 50_000);
        assert.equal(await text('#status'), 'Paused');
        assert.equal(await raw(), pausedRaw, 'Paused adoption remains frozen and read-only');

        const running = startedRecord();
        await install(running);
        await reload('session', 32_000);
        assert.equal(await text('#time'), '00:30');
        assert.equal(await raw(), JSON.stringify(running), 'RUNNING reconciliation remains in memory');
        await reload('session', 72_000);
        assert.equal(await text('#status'), 'Phase time elapsed');
        assert.equal(await raw(), JSON.stringify(running), 'FINISHED reconciliation remains in memory');

        await click('#next');
        await wait(`JSON.parse(localStorage.getItem(${JSON.stringify(EDITOR_STORAGE_KEY)})).activeRuntime.clock.status==='READY'`);
        await click('#primary');
        await wait(`JSON.parse(localStorage.getItem(${JSON.stringify(EDITOR_STORAGE_KEY)})).activeRuntime.clock.status==='RUNNING'`);
        await click('#next');
        await wait(`JSON.parse(localStorage.getItem(${JSON.stringify(EDITOR_STORAGE_KEY)})).activeRuntime.run.stage==='COMPLETED'`);
        const completed = JSON.parse(await raw());
        await click('#stop-overtime');
        await wait(`JSON.parse(localStorage.getItem(${JSON.stringify(EDITOR_STORAGE_KEY)})).activeRuntime.clock.status==='OVERTIME_STOPPED'`);
        assert.equal(await evaluate(`document.activeElement===document.querySelector('#fullscreen')&&!document.activeElement.disabled`), true,
            'Stopping native overtime moves focus to an enabled control');

        await install(completed);
        await cdp('Emulation.setTouchEmulationEnabled', { enabled: true });
        await cdp('Emulation.setDeviceMetricsOverride', {
            width: 390, height: 844, screenWidth: 390, screenHeight: 844, deviceScaleFactor: 1, mobile: true,
        });
        await reload('session', 72_000);
        assert.equal(await evaluate(`document.body.dataset.device==='smartphone'&&document.querySelector('#fullscreen').hidden`), true);
        await click('#stop-overtime');
        await wait(`JSON.parse(localStorage.getItem(${JSON.stringify(EDITOR_STORAGE_KEY)})).activeRuntime.clock.status==='OVERTIME_STOPPED'`);
        assert.equal(await evaluate(`document.activeElement===document.querySelector('#menu-toggle')&&!document.activeElement.disabled`), true,
            'Stopping native overtime moves smartphone focus to the enabled menu control');
        await cdp('Emulation.setTouchEmulationEnabled', { enabled: false });
        await cdp('Emulation.clearDeviceMetricsOverride');

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
        try {
            for (const intent of ['suspend', 'retainPlan', 'discard', 'complete']) {
                await install(startedRecord()); await reload('session', 12_000);
                await evaluate(`exitProbe.armed=true`);
                assert.deepEqual(await call('exitNativeExecution', exitOptions(intent)), { status: 'exited', persisted: true });
                assert.equal(await held(), false);
                assert.equal(await evaluate(`document.body.dataset.mode`), 'quick');
                const archived = JSON.parse(await raw());
                assert.equal(archived.activeRuntime, null);
                assert.equal(archived.executions[0]?.execution.lifecycle ?? null,
                    { suspend: 'suspended', retainPlan: 'planned', discard: null, complete: 'completed' }[intent]);
                if (['suspend', 'complete'].includes(intent)) {
                    assert.deepEqual(archived.executions[0].execution.workshopNotes, exitOptions(intent).workshopNotes);
                }
                assert.deepEqual(await evaluate(`exitProbe.events`), ['persist', 'release', 'quick-write']);
                await evaluate(`document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('pageshow'))`);
                assert.equal(await raw(), JSON.stringify(archived), 'Old callbacks cannot recreate the exited runtime');
                assert.equal(await evaluate(`exitProbe.events.includes('legacy-session-write')`), false);
                await click('#open-session');
                assert.equal(await evaluate(`document.body.dataset.mode`), 'quick', 'Native re-entry cannot select a V1 definition');
                await click('[data-preset="60000"]'); await click('#primary');
                await reload('quick', 13_000);
                assert.equal(await text('#status'), 'Running');
                assert.equal(await text('#time'), '00:59', 'Quick recovery works after native handoff');
                assert.equal(await raw(), JSON.stringify(archived));
                await click('#open-session');
                assert.equal(await evaluate(`document.body.dataset.mode`), 'quick',
                    'Reload after discarding the last native execution cannot re-enable the V1 Picker');
            }
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
            for (const mode of ['quota', 'cleanup', 'release', 'late']) {
                await install(startedRecord()); await reload('session', 12_000);
                await evaluate(`exitProbe.armed=true;exitProbe.mode=${JSON.stringify(mode)};
                    exitProbe.releaseFailure=${mode === 'release'};exitProbe.lateFailure=${mode === 'late'}`);
                const result = await call('exitNativeExecution', exitOptions('complete'));
                assert.equal(result.status, mode === 'quota' ? 'error' : mode === 'late' ? 'exited' : 'handoffFailed');
                assert.equal(await evaluate(`document.body.dataset.mode`), mode === 'late' ? 'quick' : 'session');
                if (mode === 'quota') {
                    assert.equal(await held(), true); assert.equal(await raw(), JSON.stringify(startedRecord()));
                } else if (mode !== 'late') {
                    assert.equal(result.persisted, true);
                    assert.match(await text('#recovery-feedback'), /exit is saved/);
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
            await reload('quick', 14_000);
            assert.equal(await raw(), persistedExit, 'Reload after confirmation cannot restore the old native run');
            assert.equal(await evaluate(`document.querySelector('#session-picker').hidden`), true,
                'Stale Session view metadata cannot reopen the V1 Picker after a native exit');
            assert.equal(await evaluate(`Object.keys(localStorage).filter(key=>key.startsWith('easyTimerRuntime.v1.'))
                .every(key=>!JSON.parse(localStorage.getItem(key)).run)`), true);
            for (const intent of ['suspend', 'retainPlan', 'discard', 'complete']) {
                await install(readyRecord()); await reload('session', 12_000);
                const result = await call('exitNativeExecution', { ...exitOptions(intent), attemptId: null });
                assert.equal(result.status, intent === 'complete' ? 'error' : 'exited');
                assert.equal(await held(), intent === 'complete');
                assert.equal(await evaluate(`document.body.dataset.mode`), intent === 'complete' ? 'session' : 'quick');
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
        } finally {
            await cdp('Page.removeScriptToEvaluateOnNewDocument', { identifier: faultScript });
        }
    } finally {
        await cdp('Emulation.setTouchEmulationEnabled', { enabled: false });
        await cdp('Emulation.clearDeviceMetricsOverride');
        await evaluate(`(()=>{
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
        await wait(`performance.timeOrigin!==${origin}&&document.body?.dataset.mode==='quick'`);
    }
}
