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
