import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

// All storage and windows belong to the disposable regression profile.
export async function checkSessionRecovery({ evaluate, click, text, cdp }) {
    const savedLibrary = await evaluate("localStorage.getItem('easyTimerTemplates')");
    const library = { schemaVersion: 1, templates: ['manual', 'automatic'].map(mode => ({ id: 'recovery-' + mode,
        name: mode + ' recovery workshop', transitionMode: mode,
        phases: [60, 120, 60].map((durationSeconds, i) => ({ id: `${mode}-${i}`, title: `Original phase ${i}`, durationSeconds })) })) };
    let script;
    const wait = async expression => {
        for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await delay(50); }
        assert.fail('Session recovery timeout: ' + expression);
    };
    const reload = async (now, expectedMode = 'session') => {
        if (script) await cdp('Page.removeScriptToEvaluateOnNewDocument', { identifier: script });
        script = (await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `Date.now=()=>${now};window.confirm=()=>true;` })).identifier;
        const origin = await evaluate('performance.timeOrigin'); await cdp('Page.reload');
        await wait(`performance.timeOrigin!==${origin}&&document.body?.dataset.mode===${JSON.stringify(expectedMode)}&&Boolean(document.querySelector('#primary')?.title)`);
    };
    const menu = async selector => { if (await evaluate("document.querySelector('#preferences').hidden")) await click('#menu-toggle'); await click(selector); };
    const record = () => evaluate("JSON.parse(localStorage.getItem('easyTimerRuntime.v1.'+sessionStorage.getItem('easyTimerRuntimeContext.v1')))");
    const prepare = async mode => {
        await evaluate('window.confirm=()=>true'); await menu('#open-session');
        await evaluate(`(()=>{const s=document.querySelector('#session-template');s.value='recovery-${mode}';s.dispatchEvent(new Event('change'))})()`);
        await click('#prepare-session');
    };
    const resetClock = async () => {
        if (script) { await cdp('Page.removeScriptToEvaluateOnNewDocument', { identifier: script }); script = null; }
        await evaluate("(()=>{for(const key of Object.keys(localStorage))if(key.startsWith('easyTimerRuntime.v1.'))localStorage.removeItem(key);sessionStorage.removeItem('easyTimerRuntimeContext.v1');sessionStorage.removeItem('easyTimerView.v1')})()");
        const origin = await evaluate('performance.timeOrigin'); await cdp('Page.reload');
        await wait(`performance.timeOrigin!==${origin}&&Boolean(document.querySelector('#primary')?.title)`);
    };
    try {
        await click('[data-language="en"]');
        await evaluate(`localStorage.setItem('easyTimerTemplates',${JSON.stringify(JSON.stringify(library))})`);
        const base = await evaluate('Date.now()');
        await prepare('manual');
        const first = await record();
        await reload(base + 10000);
        assert.equal((await record()).run.runId, first.run.runId);
        assert.equal(await text('#time'), '01:00'); assert.equal((await record()).clock.deadlineMs, null);
        await click('#primary'); await reload(base + 25000);
        assert.equal(await text('#time'), '00:45');
        await evaluate("(()=>{const l=JSON.parse(localStorage.getItem('easyTimerTemplates'));l.templates[0].name='Edited saved definition';l.templates[0].phases[0].durationSeconds=600;localStorage.setItem('easyTimerTemplates',JSON.stringify(l))})()");
        await reload(base + 30000);
        assert.equal(await text('#time'), '00:40'); assert.equal(await text('#workshop-name'), 'manual recovery workshop');
        assert.deepEqual((await record()).run.phases, first.run.phases, 'Reload uses run snapshot, not changed stored definition');
        await click('#primary'); await reload(base + 300000);
        assert.equal(await text('#time'), '00:40'); assert.equal((await record()).clock.status, 'PAUSED');
        await click('#primary'); await reload(base + 360000);
        assert.equal(await text('#time'), '+00:20'); assert.equal((await record()).run.currentIndex, 0);
        assert.equal(await text('#time-budget'), 'Workshop remaining 03:00');
        await click('#primary'); await reload(base + 400000);
        assert.equal(await text('#time'), '+00:20'); assert.equal((await record()).clock.status, 'OVERTIME_PAUSED');
        await click('#next'); await reload(base + 450000);
        assert.equal(await text('#time'), '02:00'); assert.equal((await record()).clock.status, 'READY');
        assert.deepEqual((await record()).run.phaseOvertime, { 'manual-0': 20000 });
        await click('#next'); await click('#next'); await reload(base + 465000);
        assert.equal(await text('#time'), '+00:15'); assert.equal((await record()).run.stage, 'COMPLETED');
        await click('#primary'); await reload(base + 500000);
        assert.equal(await text('#time'), '+00:15'); assert.equal((await record()).clock.status, 'OVERTIME_PAUSED');
        await click('#primary'); await reload(base + 510000); await click('#stop-overtime');
        await reload(base + 10000000);
        assert.equal(await text('#time'), '+00:25'); assert.equal((await record()).clock.status, 'OVERTIME_STOPPED');
        assert.equal(await evaluate("document.querySelector('#primary').hidden"), true);
        await click('#stop'); await reload(base + 10000100);
        assert.equal(await text('#time'), '01:00'); assert.equal((await record()).clock.status, 'READY');
        assert.equal((await record()).run.runId, first.run.runId); assert.deepEqual((await record()).run.phaseOvertime, {});

        await evaluate(`localStorage.setItem('easyTimerTemplates',${JSON.stringify(JSON.stringify(library))})`);
        await prepare('automatic'); await click('#primary'); const automatic = await record();
        const start = automatic.clock.deadlineMs - 60000;
        await reload(start + 180000);
        assert.equal((await record()).run.currentIndex, 2); assert.equal(await text('#time'), '01:00');
        assert.deepEqual((await record()).run.phaseOvertime, { 'automatic-0': 0, 'automatic-1': 0 });
        await reload(start + 250000);
        assert.equal(await text('#time'), '+00:10'); assert.equal((await record()).clock.deadlineMs, start + 240000);
        assert.equal((await record()).run.runId, automatic.run.runId); assert.equal((await record()).run.stage, 'COMPLETED');
        for (const language of ['de', 'en']) for (const theme of ['light', 'dark']) {
            await click(`[data-language="${language}"]`); await click(`[data-theme="${theme}"]`);
            await cdp('Emulation.setDeviceMetricsOverride', { width: 320, height: 800, mobile: true, deviceScaleFactor: 1 });
            assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true);
            assert.equal((await record()).clock.deadlineMs, start + 240000);
        }
        await evaluate('window.confirm=()=>false'); await menu('#open-quick');
        assert.equal(await evaluate('document.body.dataset.mode'), 'session');
        await reload(start + 260000); assert.equal(await text('#time'), '+00:20');
        assert.equal((await record()).run.runId, automatic.run.runId, 'Cancelled mode switch preserves recoverable run');
        await evaluate('window.confirm=()=>true'); await menu('#open-quick');
        await reload(start + 270000, 'quick');
        assert.equal((await record()).mode, 'quick'); assert.equal((await record()).run, undefined);
        assert.equal(await text('#time'), '05:00');
        await cdp('Emulation.clearDeviceMetricsOverride'); await resetClock();

        // Real second window: Session owner; the first window is an independent chooser.
        await evaluate("Boolean(window.sessionOwner=window.open('/','session-recovery-owner'))");
        await wait("Boolean(sessionOwner.document.querySelector('#primary')?.title)");
        await evaluate("sessionOwner.document.querySelector('#open-session').click()");
        await wait("sessionOwner.document.querySelector('#session-template').options.length===3");
        await evaluate("(()=>{const w=sessionOwner,s=w.document.querySelector('#session-template');s.value='recovery-manual';s.dispatchEvent(new w.Event('change'));w.document.querySelector('#prepare-session').click()})()");
        await wait("sessionOwner.document.body.dataset.mode==='session'&&sessionOwner.document.querySelector('#session-picker').hidden&&sessionOwner.document.querySelector('#time').textContent==='01:00'");
        await evaluate("sessionOwner.document.querySelector('#primary').click();sessionStorage.removeItem('easyTimerRuntimeContext.v1')");
        const ownerKey = await evaluate("sessionOwner.sessionStorage.getItem('easyTimerRuntimeContext.v1')");
        const before = await evaluate(`JSON.parse(localStorage.getItem('easyTimerRuntime.v1.'+${JSON.stringify(ownerKey)}))`);
        const origin = await evaluate('performance.timeOrigin'); await cdp('Page.reload');
        await wait(`performance.timeOrigin!==${origin}&&Boolean(document.querySelector('#primary')?.title)`);
        await evaluate("Boolean(window.sessionOwner=window.open('','session-recovery-owner'))");
        await evaluate(`(()=>{const s=document.querySelector('#recovery-select');s.value=${JSON.stringify(ownerKey)};s.dispatchEvent(new Event('change'))})()`);
        await click('#recovery-restore');
        await wait("document.querySelector('#recovery-feedback').textContent.includes('another tab')");
        assert.equal((await record()).mode, 'quick');
        const unchanged = await evaluate(`JSON.parse(localStorage.getItem('easyTimerRuntime.v1.'+${JSON.stringify(ownerKey)}))`);
        assert.equal(unchanged.clock.deadlineMs, before.clock.deadlineMs); assert.equal(unchanged.run.runId, before.run.runId);
        await evaluate('sessionOwner.close()'); await delay(100); await click('#recovery-restore');
        await wait("document.body.dataset.mode==='session'");
        assert.equal((await record()).run.runId, before.run.runId); assert.equal((await record()).clock.deadlineMs, before.clock.deadlineMs);
        const activeOrigin = await evaluate('performance.timeOrigin'); await cdp('Page.reload');
        await wait(`performance.timeOrigin!==${activeOrigin}&&document.body?.dataset.mode==='session'&&Boolean(document.querySelector('#primary')?.title)`);
        assert.equal((await record()).run.runId, before.run.runId);
        assert.deepEqual(JSON.parse(await evaluate("localStorage.getItem('easyTimerTemplates')")), library);
        console.log('PASS: manual/automatic Session reload, immutable run identity/snapshot, paused/phase/final/terminal overtime, Stop, guarded mode replacement, real owner refusal/takeover, themes/DE/EN/320px.');
    } finally {
        await evaluate('window.sessionOwner?.close()');
        await resetClock();
        await evaluate(savedLibrary === null ? "localStorage.removeItem('easyTimerTemplates')" : `localStorage.setItem('easyTimerTemplates',${JSON.stringify(savedLibrary)})`);
        await cdp('Emulation.clearDeviceMetricsOverride');
    }
}
