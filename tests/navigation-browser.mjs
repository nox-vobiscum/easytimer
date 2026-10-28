import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

// Uses only the regression harness's disposable profile and synthetic definitions.
export async function checkNavigation({ evaluate, click, text, cdp }) {
    const key = 'easyTimerView.v1';
    const library = await evaluate("localStorage.getItem('easyTimerTemplates')");
    const wait = async expression => {
        for (let i = 0; i < 100; i++) {
            if (await evaluate(expression)) return;
            await delay(50);
        }
        assert.fail('Navigation timeout: ' + expression);
    };
    const menu = async selector => {
        if (await evaluate("document.querySelector('#preferences').hidden")) await click('#menu-toggle');
        await click(selector);
    };
    const record = () => evaluate("JSON.parse(localStorage.getItem('easyTimerRuntime.v1.'+sessionStorage.getItem('easyTimerRuntimeContext.v1')))");
    const checkDuplicateDecision = async mode => {
        const owner = await record();
        const ownerContext = await evaluate("sessionStorage.getItem('easyTimerRuntimeContext.v1')");
        const targets = new Set((await cdp('Target.getTargets')).targetInfos.map(t => t.targetId));
        await evaluate("Boolean(window.navigationDecision=window.open('/','navigation-decision'))");
        await wait("Boolean(navigationDecision.document.querySelector('#primary')?.title)");
        const target = (await cdp('Target.getTargets')).targetInfos.find(t => t.type === 'page' && !targets.has(t.targetId));
        assert.ok(target, 'Independent duplicate test target exists');
        const { sessionId } = await cdp('Target.attachToTarget', { targetId: target.targetId, flatten: false });
        try {
            for (const hard of [false, true]) {
                const origin = await evaluate('navigationDecision.performance.timeOrigin');
                if (hard) await cdp('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id: 1, method: 'Page.reload', params: { ignoreCache: true } }) });
                else await evaluate('navigationDecision.location.reload()');
                await wait(`navigationDecision.performance.timeOrigin!==${origin}&&Boolean(navigationDecision.document.querySelector('#primary')?.title)`);
                assert.equal(await evaluate("navigationDecision.document.querySelector('#runtime-recovery').hidden"), false, `${mode}: unresolved selection survives ${hard ? 'hard' : 'ordinary'} reload`);
                assert.equal(await evaluate("navigationDecision.document.querySelector('#recovery-select').value"), '');
                assert.equal(await evaluate(`Array.from(navigationDecision.document.querySelector('#recovery-select').options).some(o=>o.value===${JSON.stringify(ownerContext)})`), true);
                const current = await record();
                assert.equal(current.clock.deadlineMs, owner.clock.deadlineMs);
                if (owner.run) assert.deepEqual(current.run, owner.run);
            }
            await evaluate(`(()=>{const w=navigationDecision,s=w.document.querySelector('#recovery-select');s.value=${JSON.stringify(ownerContext)};s.dispatchEvent(new w.Event('change'));w.document.querySelector('#recovery-restore').click()})()`);
            await wait("/another tab|anderen Tab/.test(navigationDecision.document.querySelector('#recovery-feedback').textContent)");
            assert.equal(await evaluate('navigationDecision.document.body.dataset.mode'), 'quick');
            await evaluate("navigationDecision.document.querySelector('#recovery-dismiss').click()");
            assert.equal(await evaluate("navigationDecision.document.querySelector('#runtime-recovery').hidden"), true);
            const origin = await evaluate('navigationDecision.performance.timeOrigin');
            await evaluate('navigationDecision.location.reload()');
            await wait(`navigationDecision.performance.timeOrigin!==${origin}&&Boolean(navigationDecision.document.querySelector('#primary')?.title)`);
            assert.equal(await evaluate("navigationDecision.document.querySelector('#runtime-recovery').hidden"), true, 'An explicit independent-timer decision stays resolved');
            assert.equal((await record()).clock.deadlineMs, owner.clock.deadlineMs);
        } finally {
            await cdp('Target.detachFromTarget', { sessionId });
            // Only this disposable test window's own temporary record is removed.
            await evaluate("localStorage.removeItem('easyTimerRuntime.v1.'+navigationDecision.sessionStorage.getItem('easyTimerRuntimeContext.v1'));navigationDecision.close()");
        }
    };
    let bootScript;
    const reload = async (hold = false) => {
        const origin = await evaluate('performance.timeOrigin');
        if (hold) bootScript = (await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `
            const request = navigator.locks.request.bind(navigator.locks);
            let release; const gate = new Promise(done => release = done);
            navigator.locks.request = (...args) => gate.then(() => request(...args));
            window.releaseNavigationTest = release;
        ` })).identifier;
        await cdp('Page.reload');
        if (hold) {
            await wait(`performance.timeOrigin!==${origin}&&Boolean(window.releaseNavigationTest)&&Boolean(document.querySelector('#timer-view'))`);
            assert.equal(await evaluate("getComputedStyle(document.querySelector('#timer-view')).visibility"), 'hidden');
            assert.equal(await text('#time'), '', 'No incorrect default timer before restoration');
            await evaluate('releaseNavigationTest()');
        }
        await wait(`performance.timeOrigin!==${origin}&&document.querySelector('main')?.getAttribute('aria-busy')===null`);
        await evaluate('window.confirm=()=>true');
        if (bootScript) { await cdp('Page.removeScriptToEvaluateOnNewDocument', { identifier: bootScript }); bootScript = null; }
    };
    try {
        await evaluate('window.confirm=()=>true');
        const history = await evaluate('history.length');
        await menu('#open-quick');
        assert.equal(await evaluate(`sessionStorage.getItem('${key}')`), 'quick');
        await reload(); assert.equal(await evaluate('document.body.dataset.mode'), 'quick');
        await click('#primary'); await checkDuplicateDecision('quick'); await click('#primary');
        const paused = await record();
        for (const language of ['de', 'en']) for (const theme of ['light', 'dark']) {
            await click(`[data-language="${language}"]`); await click(`[data-theme="${theme}"]`);
            await menu('#open-planner');
            await reload(true);
            assert.equal(await evaluate("document.body.classList.contains('planner-open')"), true);
            assert.equal(await evaluate('document.documentElement.lang'), language);
            assert.equal(await evaluate('document.documentElement.dataset.theme'), theme);
            assert.deepEqual((await record()).clock, paused.clock, 'Restoring Editor does not change paused Quick runtime');
            assert.equal(await evaluate("localStorage.getItem('easyTimerTemplates')"), library);
            await cdp('Emulation.setDeviceMetricsOverride', { width: 320, height: 800, mobile: true, deviceScaleFactor: 1 });
            assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true);
            await click('.planner-back');
        }
        await cdp('Emulation.clearDeviceMetricsOverride');
        await click('[data-language="en"]'); await click('#stop');
        await menu('#open-planner');
        await evaluate("Array.from(document.querySelectorAll('#planner button')).find(b=>b.textContent==='Create Rundown').click()");
        await evaluate("document.querySelector('#template-name').value='Unsaved navigation fixture';document.querySelector('#template-name').dispatchEvent(new Event('input',{bubbles:true}))");
        assert.equal(await evaluate("(()=>{const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented})()"), true, 'Existing unsaved-draft unload guard remains installed');
        await evaluate('window.confirm=()=>false'); await click('.planner-back');
        assert.equal(await evaluate("document.body.classList.contains('planner-open')"), true);
        assert.equal(await evaluate(`sessionStorage.getItem('${key}')`), 'editor');
        await evaluate('window.confirm=()=>true');
        await evaluate("Array.from(document.querySelectorAll('#planner button')).find(b=>b.textContent==='Cancel').click()");
        await click('.planner-back');
        const fixture = { schemaVersion: 1, templates: [{ id: 'navigation-fixture', name: 'Navigation fixture', transitionMode: 'manual', phases: [{ id: 'nav-phase', title: 'Navigation phase', durationSeconds: 60 }] }] };
        await evaluate(`localStorage.setItem('easyTimerTemplates',${JSON.stringify(JSON.stringify(fixture))})`);
        await menu('#open-session');
        await evaluate("document.querySelector('#session-template').value='navigation-fixture';document.querySelector('#session-template').dispatchEvent(new Event('change'))");
        await click('#prepare-session'); const ready = await record();
        await reload(); assert.equal(await evaluate('document.body.dataset.mode'), 'session');
        assert.equal((await record()).run.runId, ready.run.runId); assert.equal((await record()).clock.deadlineMs, null);
        await click('#primary'); const running = await record();
        await checkDuplicateDecision('session');
        await menu('#open-planner'); await reload(true);
        assert.equal(await evaluate("document.body.classList.contains('planner-open')"), true);
        assert.equal((await record()).run.runId, running.run.runId); assert.equal((await record()).clock.deadlineMs, running.clock.deadlineMs);
        await click('.planner-back');
        await evaluate(`sessionStorage.setItem('${key}','obsolete-view')`); await reload();
        assert.equal(await evaluate('document.body.dataset.mode'), 'session', 'Invalid view falls back to authoritative recovered runtime');
        await click('#next'); const completed = await record();
        await menu('#open-planner'); await reload(); await click('.planner-back');
        assert.equal((await record()).run.stage, 'COMPLETED'); assert.equal((await record()).run.runId, completed.run.runId);
        assert.equal((await record()).clock.deadlineMs, completed.clock.deadlineMs);
        assert.equal(await evaluate('history.length'), history, 'Internal view navigation/reloads add no history entries');
        await menu('#open-planner');
        await evaluate("Boolean(window.navigationClone=window.open('/','navigation-clone'))");
        await wait("Boolean(navigationClone.document.querySelector('#primary')?.title)");
        assert.equal(await evaluate('navigationClone.document.body.dataset.mode'), 'quick', 'Duplicated tab cannot take over inherited Session ownership');
        assert.equal(await evaluate("navigationClone.document.querySelector('#recovery-select').value"), '');
        assert.equal(await evaluate("navigationClone.document.querySelector('#runtime-recovery').hidden"), false);
        await evaluate("navigationClone.document.querySelector('#open-planner').click()");
        await wait("navigationClone.document.body.classList.contains('planner-open')");
        await click('.planner-back');
        assert.equal(await evaluate(`navigationClone.sessionStorage.getItem('${key}')`), 'editor', 'Subsequent cloned-tab navigation stays independent');
        await evaluate('navigationClone.close()');
        await evaluate("Boolean(window.navigationFresh=window.open('about:blank','navigation-fresh'));navigationFresh.sessionStorage.clear();navigationFresh.location='/'");
        await wait("Boolean(navigationFresh.document.querySelector('#primary')?.title)");
        assert.equal(await evaluate('navigationFresh.document.body.dataset.mode'), 'quick');
        assert.equal(await evaluate("navigationFresh.document.querySelector('#recovery-select').value"), '', 'Fresh context never selects another timer automatically');
        await evaluate('navigationFresh.close()');
        await menu('#open-quick');
        // Synthetic unsupported view with no record: picker is the safe Session fallback.
        await evaluate(`for(const k of Object.keys(localStorage))if(k.startsWith('easyTimerRuntime.v1.'))localStorage.removeItem(k);sessionStorage.setItem('${key}','session')`);
        await reload();
        assert.equal(await evaluate("document.querySelector('#session-picker').hidden"), false);
        assert.equal(await evaluate("document.querySelector('#session-template').options.length"), 2);
        assert.equal(await evaluate("document.querySelector('#prepare-session').disabled"), true);
        await menu('#open-quick');
        await menu('#open-planner');
        const originalURL = await evaluate('location.href');
        await cdp('Page.navigate', { url: await evaluate("location.origin+'/index.html?navigation-history-check'") });
        await wait("location.search==='?navigation-history-check'&&document.body.classList.contains('planner-open')&&Boolean(document.querySelector('.planner-back'))");
        await evaluate('history.back()');
        await wait(`location.href===${JSON.stringify(originalURL)}&&document.body.classList.contains('planner-open')&&Boolean(document.querySelector('.planner-back'))`);
        await evaluate('history.forward()');
        await wait("location.search==='?navigation-history-check'&&document.body.classList.contains('planner-open')&&Boolean(document.querySelector('.planner-back'))");
        await evaluate('history.back()');
        await wait(`location.href===${JSON.stringify(originalURL)}&&document.body.classList.contains('planner-open')&&Boolean(document.querySelector('.planner-back'))`);
        await click('.planner-back');
        console.log('PASS: tab-scoped Quick/Session/Editor refresh, no default-view flash, paused/running/READY/completed runtime identity, draft warning/cancel, invalid view, safe picker fallback, independent cloned/fresh tabs, explicit recovery, DE/EN/themes/320px and unchanged history length.');
    } finally {
        if (bootScript) await cdp('Page.removeScriptToEvaluateOnNewDocument', { identifier: bootScript });
        await evaluate('window.navigationClone?.close();window.navigationFresh?.close();window.confirm=()=>true');
        await evaluate(library === null ? "localStorage.removeItem('easyTimerTemplates')" : `localStorage.setItem('easyTimerTemplates',${JSON.stringify(library)})`);
        await cdp('Emulation.clearDeviceMetricsOverride');
    }
}
