import assert from 'node:assert/strict';
import { configureQuickTimebox } from './quick-timebox.mjs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createVirtualClock } from './virtual-clock.mjs';
import { validateTemplate } from '../src/js/editor-domain.mjs';
import { EDITOR_STORAGE_KEY, insertTemplateInRecord, validateEditorStoreRecord } from '../src/js/editor-storage.mjs';

const nativeKey = JSON.stringify(EDITOR_STORAGE_KEY);
const nativeRuntime = `JSON.parse(localStorage.getItem(${nativeKey}))?.activeRuntime`;
const quickRuntime = 'JSON.parse(localStorage.getItem("easyTimerRuntime.v1."+sessionStorage.getItem("easyTimerRuntimeContext.v1")))';
const appReady = 'Boolean(document.body?.dataset.mode && document.querySelector("main:not([aria-busy])"))';

async function seedInformationTemplate(evaluate, { id, name, transitionMode, phases }) {
    const original = await evaluate(`localStorage.getItem(${nativeKey})`);
    const record = validateEditorStoreRecord(original ? JSON.parse(original) : {
        schemaVersion: 1, revision: 0, templates: [], executions: [], activeRuntime: null,
    });
    assert.equal(record.activeRuntime, null, 'Information fixture starts without an active Session');
    const template = validateTemplate({
        schemaVersion: 2, kind: 'template', id, revision: 1,
        plan: {
            name, transitionMode, category: 'workshop', preparedInformation: '',
            phases: phases.map(phase => ({ ...phase, category: 'presentation', notes: '', resources: [] })),
        },
    });
    const seeded = insertTemplateInRecord(record, { template, expectedAggregateRevision: record.revision });
    await evaluate(`localStorage.setItem(${nativeKey}, ${JSON.stringify(JSON.stringify(seeded))})`);
    return original;
}

async function launchInformationTemplate(evaluate, wait, id, name) {
    const value = JSON.stringify('template:' + id);
    await wait(`[...document.querySelector('#session-template').options].some(option => option.value === ${value})`);
    await evaluate(`(() => {
        const select = document.querySelector('#session-template');
        select.value = ${value};
        select.dispatchEvent(new Event('change', { bubbles: true }));
        document.querySelector('#prepare-session').click();
    })()`);
    await wait(`document.body.dataset.mode === 'session' && (${nativeRuntime})?.clock.status === 'READY'
        && document.querySelector('#workshop-name').textContent === ${JSON.stringify(name)}`);
}

async function discardInformationSession(evaluate, wait) {
    await evaluate(`document.querySelector('#stop').click()`);
    await wait(`document.querySelector('#native-lifecycle-dialog').open`);
    await evaluate(`document.querySelector('#native-discard').click()`);
    await wait(`document.body.dataset.mode === 'home' && (${nativeRuntime}) === null`);
    await evaluate(`document.querySelector('#home-quick').click()`);
    await wait(`document.body.dataset.mode === 'quick'`);
}

async function restoreInformationStore(evaluate, original) {
    if (original === undefined) return;
    await evaluate(original === null ? `localStorage.removeItem(${nativeKey})`
        : `localStorage.setItem(${nativeKey}, ${JSON.stringify(original)})`);
}

export async function checkHeaderIntents({ cdp, evaluate, wait, setConfirmation, confirmations }) {
    let savedLibrary;
    const record = () => evaluate(quickRuntime);
    const sessionRecord = () => evaluate(nativeRuntime);
    const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
    const navigate = async (selector, info) => {
        const before = await evaluate('performance.timeOrigin'); await click(selector);
        await wait(`performance.timeOrigin!==${before} && document.readyState==='complete' && ${info ? 'Boolean(document.querySelector(".info-return")&&document.querySelector("[data-language]"))' : appReady}`);
    };
    const enter = async () => {
        await evaluate('if(document.querySelector("#preferences").hidden)document.querySelector("#menu-toggle").click()');
        await navigate('[data-information=about]', true);
        await navigate('[data-information=faq]', true); // Shared menu links preserve the origin too.
    };
    const request = async target => {
        await evaluate('document.querySelector("#menu-toggle").click()');
        await navigate('#open-' + target, false);
        assert.equal(await evaluate('new URL(location.href).searchParams.has("open")'), false);
        assert.equal(await evaluate('new URL(location.href).searchParams.has("from")'), false);
    };
    const reload = async () => {
        const before = await evaluate('performance.timeOrigin'); await cdp('Page.reload');
        await wait(`performance.timeOrigin!==${before} && ${appReady}`);
    };
    try {
        if (await evaluate('document.body.dataset.mode === "home"')) await click('#home-quick');
        await configureQuickTimebox(evaluate, 60000);
        await click('#primary'); await click('#primary');
        const quick = await record(); assert.equal(quick.clock.status, 'PAUSED');
        const initialCount = confirmations();
        await enter(); await request('quick');
        assert.deepEqual((await record()).clock, quick.clock, 'Same-mode Quick preserves the paused timer');
        assert.equal(confirmations(), initialCount);
        await reload(); assert.deepEqual((await record()).clock, quick.clock);
        await enter(); await request('planner');
        await wait('document.body.classList.contains("planner-open")');
        assert.deepEqual((await record()).clock, quick.clock, 'Editor intent leaves the timer intact');
        setConfirmation(false);
        await enter(); await request('session');
        assert.equal(await evaluate('document.body.dataset.mode'), 'quick');
        assert(await evaluate('document.body.classList.contains("planner-open")'), 'Cancellation preserves the original Editor view');
        assert.deepEqual((await record()).clock, quick.clock);
        const cancelledCount = confirmations();
        await reload(); assert.equal(confirmations(), cancelledCount, 'Reload never replays a cancelled intent');
        await enter(); await request('quick');
        assert.equal(await evaluate('document.body.classList.contains("planner-open")'), false);
        assert.deepEqual((await record()).clock, quick.clock, 'Same-mode intent reveals the existing timer from Editor');

        setConfirmation(true);
        savedLibrary = await seedInformationTemplate(evaluate, {
            id: 'header-intent', name: 'Header intent', transitionMode: 'manual',
            phases: [{ id:'header-phase', title:'Header phase', durationSeconds:60 }],
        });
        await enter(); await request('session');
        await wait('!document.querySelector("#session-picker").hidden');
        await launchInformationTemplate(evaluate, wait, 'header-intent', 'Header intent');
        await click('#primary'); await wait(`(${nativeRuntime})?.clock.status === 'RUNNING'`);
        await click('#primary'); await wait(`(${nativeRuntime})?.clock.status === 'PAUSED'`);
        const session = await sessionRecord();
        const beforeSame = confirmations(); await enter(); await request('session');
        assert.deepEqual((await sessionRecord()).run, session.run);
        assert.deepEqual((await sessionRecord()).clock, session.clock);
        assert.equal(confirmations(), beforeSame, 'Same-mode Session never enters the replacement path');
        setConfirmation(false); await enter(); await request('quick');
        assert.equal((await sessionRecord()).run.runId, session.run.runId);
        assert.equal(await evaluate('document.body.dataset.mode'), 'session');
        const beforeReload = confirmations(); await reload();
        assert.equal(confirmations(), beforeReload); assert.equal((await sessionRecord()).run.runId, session.run.runId);
        await click('#stop'); await wait('document.querySelector("#native-lifecycle-dialog").open');
        await click('#native-lifecycle-cancel');
        assert.equal((await sessionRecord()).run.runId, session.run.runId);
        setConfirmation(true);
        await discardInformationSession(evaluate, wait);
        assert.equal(await evaluate('document.body.dataset.mode'), 'quick');

        await evaluate('const key="easyTimerRuntime.v1."+sessionStorage.getItem("easyTimerRuntimeContext.v1");const pending=JSON.parse(localStorage.getItem(key));pending.recoveryPending=true;localStorage.setItem(key,JSON.stringify(pending))');
        await reload(); await wait('document.querySelector("#runtime-recovery").hidden===false');
        const beforePending = confirmations(); await enter(); await request('session');
        assert.equal(await evaluate('document.querySelector("#runtime-recovery").hidden'), false);
        assert.equal(await evaluate('document.querySelector("#recovery-select").value'), '');
        assert.equal(confirmations(), beforePending);
        await click('#recovery-dismiss');
        await reload();
        assert.equal(await evaluate('document.body.dataset.mode'), 'quick', 'Discarded intent never executes after the recovery decision');
        assert.equal(await evaluate('document.querySelector("#runtime-recovery").hidden'), true);
        console.log('PASS: shared menu handoff, same-mode Quick/Session identity, Editor return, accepted/cancelled replacement, one-time consumption and pending-recovery intent discard.');
    } finally {
        setConfirmation(true);
        await restoreInformationStore(evaluate, savedLibrary);
    }
}

export async function checkInformation({ cdp, evaluate, wait, origin, screenshots, offline = false }) {
    const appHeader = await evaluate('document.querySelector("header").outerHTML');
    for (const page of ['about', 'faq', 'imprint', 'privacy']) {
        for (const language of ['de', 'en']) {
            await cdp('Page.navigate', { url: `${origin}/${page}.html?lang=${language}` });
            await wait(`document.querySelector('[data-info-language="${language}"]:not([hidden])') && document.documentElement.lang === '${language}'`);
            assert.equal(await evaluate('document.querySelectorAll("article:not([hidden])").length'), 1);
            assert.equal(await evaluate('document.querySelectorAll("#time, #primary, #account-toggle, .development-sync").length'), 0);
            assert.equal(await evaluate('document.querySelector("script").getAttribute("src")'), 'js/info.js?v=59');
            assert(await evaluate('Boolean(document.querySelector("header .brand .brand-mark")) && Boolean(document.querySelector("#menu-toggle"))'));
            assert.equal(await evaluate('document.querySelector("header").outerHTML'), appHeader, 'The exact application header markup is shared');
            assert.equal(await evaluate('document.querySelectorAll(".info-navigation a").length'), 4);
            assert(await evaluate('document.querySelector(".info-return[data-info-back]").getBoundingClientRect().height >= 44'));
            assert.equal(await evaluate('getComputedStyle(document.querySelector("main p [data-info-back]")).textDecorationLine'), 'underline', 'Content links retain their underline');
            assert.equal(await evaluate('document.querySelectorAll(".info-draft, article [style]").length'), 0, 'No internal draft notice or inline styling enters public content');
            if (['imprint', 'privacy'].includes(page)) {
                assert(await evaluate(`Array.from(document.querySelectorAll('article a[href^="mailto:"]')).every(a=>a.getAttribute('href')==='mailto:noxvobiscum@gmail.at')`));
                assert.equal(await evaluate(`document.querySelectorAll('article a[href="mailto:noxvobiscum@gmail.at"]').length`), 2);
                assert.equal(await evaluate('document.querySelector("main").textContent.includes("office@easytimer.at")'), false);
            }
            for (const theme of ['light', 'dark', 'system']) {
                await evaluate(`document.documentElement.dataset.theme='${theme}'`);
                for (const [width, height] of [[1280, 800], [320, 640], [667, 375]]) {
                    await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor:1, mobile:false });
                    assert(await evaluate('document.documentElement.scrollWidth <= innerWidth'), `${page}/${language}/${theme}/${width} fits`);
                    assert(await evaluate('Array.from(document.querySelectorAll(".info-navigation a,[data-info-back]")).every(a=>a.getBoundingClientRect().height>=44)'));
                    if (!offline && theme !== 'system') {
                        const shot = await cdp('Page.captureScreenshot', { format:'png', captureBeyondViewport:false });
                        await writeFile(join(screenshots, `${page}-${language}-${theme}-${width}.png`), Buffer.from(shot.data, 'base64'));
                    }
                    if (page === 'about' && theme === 'dark') {
                        await evaluate('document.querySelector("#menu-toggle").click();document.querySelector("[data-information=privacy]").focus()');
                        await cdp('Page.bringToFront');
                        await cdp('Input.dispatchKeyEvent', { type:'keyDown', key:'Tab', code:'Tab', windowsVirtualKeyCode:9 });
                        await cdp('Input.dispatchKeyEvent', { type:'keyUp', key:'Tab', code:'Tab', windowsVirtualKeyCode:9 });
                        await evaluate('document.querySelector("[data-information=privacy]").focus()');
                        assert(await evaluate('(()=>{const links=[...document.querySelectorAll(".menu-information a")],r=links.map(a=>a.getBoundingClientRect());return links.every(a=>a.tagName==="A"&&a.hasAttribute("href")&&getComputedStyle(a).textDecorationLine==="none"&&a.scrollWidth<=a.clientWidth)&&r.every(a=>a.height>=44)&&Math.abs(r[0].top-r[1].top)<1&&Math.abs(r[2].top-r[3].top)<1&&r[2].top>=r[0].bottom&&r[0].left===r[2].left&&r[1].left===r[3].left})()'), 'Two fixed columns, correct row order, full touch targets and no link underlines/clipping');
                        assert.equal(await evaluate('getComputedStyle(document.activeElement).outlineStyle'), 'solid');
                        const hover = await evaluate('(()=>{const r=document.querySelector(".menu-information a").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()');
                        await cdp('Input.dispatchMouseEvent', { type:'mouseMoved', ...hover });
                        assert.notEqual(await evaluate('getComputedStyle(document.querySelector(".menu-information a")).backgroundColor'), 'rgba(0, 0, 0, 0)', 'Hover feedback replaces underlines');
                        assert(await evaluate('(()=>{const e=document.activeElement,r=e.getBoundingClientRect(),p=document.querySelector("#preferences").getBoundingClientRect();return r.height>=44&&r.bottom<=Math.min(innerHeight,p.bottom)+1})()'), 'Shared short-screen menu scrolls to its final entry');
                        if (!offline) {
                            const shot = await cdp('Page.captureScreenshot', { format:'png' });
                            await writeFile(join(screenshots, `shared-menu-${language}-${width}.png`), Buffer.from(shot.data, 'base64'));
                        }
                        await cdp('Page.bringToFront');
                        await cdp('Input.dispatchKeyEvent', { type:'keyDown', key:'Escape', code:'Escape', windowsVirtualKeyCode:27 });
                        assert.equal(await evaluate('document.activeElement.id'), 'menu-toggle');
                        await evaluate('document.querySelector("#menu-toggle").click();document.querySelector("article:not([hidden]) h1").click()');
                        assert.equal(await evaluate('document.querySelector("#preferences").hidden'), true, 'Outside click dismisses the shared menu');
                    }
                }
            }
        }
    }
    // URL language wins; an invalid value falls back to the existing preference.
    await evaluate('localStorage.setItem("easyTimerLanguage","de")');
    await cdp('Page.navigate', { url: origin + '/faq.html?lang=invalid' });
    await wait('document.documentElement.lang === "de" && Boolean(document.querySelector("#menu-toggle"))');
    const runtime = await evaluate('JSON.stringify(Object.entries(localStorage).filter(([k])=>k.startsWith("easyTimerRuntime")))');
    await evaluate('document.querySelector("#menu-toggle").click();document.querySelector("[data-language=en]").focus()');
    await cdp('Page.bringToFront');
    await cdp('Input.dispatchKeyEvent', { type:'keyDown', key:' ', code:'Space', windowsVirtualKeyCode:32 });
    await cdp('Input.dispatchKeyEvent', { type:'keyUp', key:' ', code:'Space', windowsVirtualKeyCode:32 });
    await wait('document.documentElement.lang === "en"');
    assert.equal(await evaluate('document.activeElement.dataset.language'), 'en');
    assert.equal(await evaluate('getComputedStyle(document.activeElement).outlineStyle'), 'solid');
    assert.equal(await evaluate('JSON.stringify(Object.entries(localStorage).filter(([k])=>k.startsWith("easyTimerRuntime")))'), runtime);
    for (const theme of ['light', 'dark', 'system']) {
        await evaluate(`document.querySelector('button[data-theme="${theme}"]').click()`);
        assert.equal(await evaluate('document.documentElement.dataset.theme'), theme);
        assert.equal(await evaluate(`document.querySelector('button[data-theme="${theme}"]').getAttribute('aria-pressed')`), 'true');
    }
    await cdp('Input.dispatchKeyEvent', { type:'keyDown', key:'Escape', code:'Escape', windowsVirtualKeyCode:27 });
    assert.equal(await evaluate('document.querySelector("#preferences").hidden'), true);
    assert.equal(await evaluate('document.activeElement.id'), 'menu-toggle');
    await evaluate('document.querySelector("#menu-toggle").click();document.querySelector(".info-return").click()');
    await wait('Boolean(document.querySelector("#primary")?.title)');
    await cdp('Page.navigate', { url: origin + '/faq.html?lang=en' });
    await wait('location.pathname==="/faq.html" && Boolean(document.querySelector(".info-return"))');
    await evaluate('document.querySelector("[data-info-page=about]").click()');
    await wait('location.pathname === "/about.html" && document.documentElement.lang === "en"');
    const { currentIndex, entries } = await cdp('Page.getNavigationHistory');
    await cdp('Page.navigateToHistoryEntry', { entryId: entries[currentIndex - 1].id });
    await wait('location.pathname === "/faq.html" && document.documentElement.lang === "en"');
    await cdp('Emulation.setDeviceMetricsOverride', { width:1280, height:800, deviceScaleFactor:1, mobile:false });
    await cdp('Page.navigate', { url: origin + '/' });
    await wait('Boolean(document.querySelector("#primary")?.title)');
    for (const language of ['de', 'en']) {
        await evaluate(`document.querySelector('[data-language="${language}"]').click()`);
        await cdp('Emulation.setDeviceMetricsOverride', { width:320, height:375, deviceScaleFactor:1, mobile:false });
        await evaluate('if(document.querySelector("#preferences").hidden)document.querySelector("#menu-toggle").click()');
        await evaluate('document.querySelector("[data-information=privacy]").focus()');
        assert(await evaluate('(()=>{const a=document.activeElement,r=a.getBoundingClientRect(),p=document.querySelector("#preferences").getBoundingClientRect();return a.dataset.information==="privacy"&&r.height>=44&&r.bottom<=Math.min(innerHeight,p.bottom)+1})()'), 'Short-screen menu scrolls to the final link');
        assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
        assert.equal(await evaluate('document.querySelector("[data-information=privacy]").textContent'), language === 'de' ? 'Datenschutz' : 'Privacy');
        if (!offline) {
            const shot = await cdp('Page.captureScreenshot', { format:'png' });
            await writeFile(join(screenshots, `menu-${language}-320.png`), Buffer.from(shot.data, 'base64'));
        }
        await evaluate('document.querySelector("#menu-toggle").click()');
    }
    await cdp('Emulation.setDeviceMetricsOverride', { width:1280, height:800, deviceScaleFactor:1, mobile:false });
    console.log(`PASS: ${offline ? 'actual offline' : 'online'} information pages, DE/EN, fallback, keyboard, history, themes, desktop/320px and no timer initialization.`);
}

// Only disposable browser storage is used. The existing injected clock drives
// actual recovery deadlines across real document navigations, not display text.
export async function checkInformationContinuity({ cdp, evaluate, wait }) {
    const clock = createVirtualClock(evaluate);
    let savedLibrary;
    const originKey = 'easyTimerInformationOrigin.v1';
    const readRecord = () => evaluate(quickRuntime);
    const readSession = () => evaluate(nativeRuntime);
    const readStoredState = () => evaluate(`[(${quickRuntime}), localStorage.getItem(${nativeKey})]`);
    let bootstrap;
    const syncClock = async () => {
        const now = await evaluate('Date.now()');
        if (bootstrap) await cdp('Page.removeScriptToEvaluateOnNewDocument', { identifier:bootstrap });
        bootstrap = (await cdp('Page.addScriptToEvaluateOnNewDocument', { source:`globalThis.__easyTimerTestClock={original:Date.now,now:${now}};Date.now=()=>globalThis.__easyTimerTestClock.now;` })).identifier;
    };
    const navigate = async (selector, info) => {
        await syncClock();
        const before = await evaluate('performance.timeOrigin');
        await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
        await wait(`performance.timeOrigin!==${before} && document.readyState==='complete' && ${info ? 'Boolean(document.querySelector(".info-return"))' : appReady}`);
    };
    const menu = async selector => {
        await evaluate('if(document.querySelector("#preferences").hidden)document.querySelector("#menu-toggle").click()');
        await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
    };
    const assertReturnLabels = async view => {
        const expected = {
            de: { home:'Zurück zur Startseite', quick:'Zurück zum Timer', session:'Zurück zur Session', editor:'Zurück zum Session-Editor', direct:'Zur Startseite' },
            en: { home:'Back to Home', quick:'Back to Timer', session:'Back to Session', editor:'Back to Session Editor', direct:'Go to Home' },
        };
        const hrefs = await evaluate('Array.from(document.querySelectorAll("[data-info-back]"),a=>a.getAttribute("href"))');
        for (const language of ['de', 'en']) {
            await evaluate(`document.querySelector('[data-language="${language}"]').click()`);
            assert.deepEqual(await evaluate('Array.from(document.querySelectorAll("[data-info-back]"),a=>a.textContent.trim())'), [expected[language][view], expected[language][view]], `Both ${view} return labels follow ${language}`);
            assert.deepEqual(await evaluate('Array.from(document.querySelectorAll("[data-info-back]"),a=>a.getAttribute("href"))'), hrefs, 'Label changes never alter return destinations');
        }
    };
    const excursion = async (view, duration, reload = false, beforeReturn = undefined) => {
        const context = await evaluate('sessionStorage.getItem("easyTimerRuntimeContext.v1")');
        await evaluate('if(document.querySelector("#preferences").hidden)document.querySelector("#menu-toggle").click()');
        await navigate('[data-information=about]', true);
        const origin = await evaluate(`sessionStorage.getItem('${originKey}')`);
        assert.equal(JSON.parse(origin).view, view);
        await assertReturnLabels(view);
        await navigate('[data-info-page=faq]', true);
        await navigate('[data-info-page=privacy]', true);
        await assertReturnLabels(view);
        if (reload) {
            await syncClock();
            const before = await evaluate('performance.timeOrigin'); await cdp('Page.reload');
            await wait(`performance.timeOrigin!==${before} && Boolean(document.querySelector('.info-return')&&document.querySelector('[data-language]'))`);
            await assertReturnLabels(view);
        }
        assert.equal(await evaluate(`sessionStorage.getItem('${originKey}')`), origin);
        const recordWhileAway = await readStoredState();
        await clock.advance(duration); await syncClock();
        assert.deepEqual(await readStoredState(), recordWhileAway, 'Information pages never tick or write Quick or native Session storage');
        if (view === 'editor') {
            // Prove return uses the retained origin, not merely the ordinary last-view fallback.
            await evaluate('sessionStorage.setItem("easyTimerView.v1","quick")');
        }
        await evaluate('document.querySelector(".info-return").focus()');
        assert.equal(await evaluate('getComputedStyle(document.activeElement).outlineStyle'), 'solid');
        if (beforeReturn) await beforeReturn();
        await navigate('.info-return', false);
        assert.equal(await evaluate('sessionStorage.getItem("easyTimerRuntimeContext.v1")'), context);
        assert.equal(await evaluate(`sessionStorage.getItem('${originKey}')`), null, 'Origin is consumed on application return');
    };
    try {
        await evaluate('window.confirm=()=>true');
        await clock.install(await evaluate('Date.now()')); await syncClock();
        if (await evaluate('document.body.dataset.mode==="home"')) {
            await excursion('home', '0s');
            assert.equal(await evaluate('document.body.dataset.mode'), 'home');
            await evaluate('document.querySelector("#home-quick").click()');
        }
        await configureQuickTimebox(evaluate, 60000);
        await evaluate('document.querySelector("#primary").click()');
        const running = await readRecord();
        await excursion('quick', '20s', true);
        assert.equal((await readRecord()).clock.deadlineMs, running.clock.deadlineMs);
        assert.equal(await evaluate('document.querySelector("#time").textContent'), '00:40');
        await evaluate('document.querySelector("#primary").click()');
        const paused = await readRecord();
        await excursion('quick', '2m');
        assert.equal((await readRecord()).clock.status, 'PAUSED');
        assert.equal(await evaluate('document.querySelector("#time").textContent'), '00:40');
        assert.deepEqual((await readRecord()).clock, paused.clock);
        await evaluate('document.querySelector("#primary").click()');
        await clock.advance('50s');
        await wait('document.querySelector("#time").textContent === "+00:10"');
        const overtime = await readRecord();
        await excursion('quick', '20s');
        assert.equal((await readRecord()).clock.deadlineMs, overtime.clock.deadlineMs);
        assert.equal(await evaluate('document.querySelector("#time").textContent'), '+00:30');
        await evaluate('document.querySelector("#stop").click()');

        savedLibrary = await seedInformationTemplate(evaluate, {
            id: 'information-run', name: 'Information continuity', transitionMode: 'automatic',
            phases: [{ id:'info-first', title:'First', durationSeconds:60 }, { id:'info-second', title:'Second', durationSeconds:120 }],
        });
        await evaluate('window.confirm=()=>true'); await menu('#open-session');
        await launchInformationTemplate(evaluate, wait, 'information-run', 'Information continuity');
        await evaluate('document.querySelector("#primary").click()');
        await wait(`(${nativeRuntime})?.clock.status === 'RUNNING'`);
        const session = await readSession();
        await excursion('session', '70s');
        const reached = await readSession();
        assert.equal(reached.run.runId, session.run.runId);
        assert.equal(reached.executionId, session.executionId);
        assert.equal(reached.attemptId, session.attemptId);
        // Adoption projects elapsed time locally. The next authoritative action persists that projection.
        const projectedDeadline = session.clock.deadlineMs + 120000;
        assert.equal(projectedDeadline - await evaluate('Date.now()'), 110000);
        assert.equal(await evaluate('document.querySelector("#current-phase").textContent'), 'Second');
        assert.equal(await evaluate('document.querySelector("#time").textContent'), '01:50');
        await evaluate('document.querySelector("#primary").click()');
        await wait(`(${nativeRuntime})?.clock.status === 'PAUSED'`);
        const sessionPaused = await readSession();
        assert.equal(sessionPaused.run.currentIndex, 1);
        assert.equal(sessionPaused.clock.remainingMs, projectedDeadline - await evaluate('Date.now()'));
        await excursion('session', '3m');
        assert.equal(await evaluate('document.body.classList.contains("planner-open")'), false,
            'Returning from a Session origin does not open the Editor');
        assert.deepEqual((await readSession()).run, sessionPaused.run);
        assert.deepEqual((await readSession()).clock, sessionPaused.clock);
        await menu('#open-planner');
        await excursion('editor', '10s', true);
        assert(await evaluate('document.body.classList.contains("planner-open")'));
        const editorReturn = await readSession();
        assert.equal(editorReturn.executionId, sessionPaused.executionId);
        assert.equal(editorReturn.attemptId, sessionPaused.attemptId);
        assert.deepEqual(editorReturn.run, sessionPaused.run);
        assert.deepEqual(editorReturn.clock, sessionPaused.clock);
        assert.equal(await evaluate('sessionStorage.getItem("easyTimerView.v1")'), 'editor');
        await evaluate(`sessionStorage.setItem('${originKey}', JSON.stringify({view:'editor'}))`);
        assert.equal(await evaluate('new URL(location.href).searchParams.has("from")'), false);
        await syncClock();
        const editorDocument = await evaluate('performance.timeOrigin');
        await cdp('Page.reload');
        await wait(`performance.timeOrigin !== ${editorDocument} && ${appReady}`);
        assert.deepEqual(await evaluate(`[document.body.dataset.mode,
            document.querySelector('#planner').hidden,
            document.body.classList.contains('planner-open'),
            document.querySelector('#status').textContent]`), ['session', true, false, 'Paused'],
        'Ordinary reload adopts a paused Session without opening an Editor from saved navigation metadata');
        assert.deepEqual(await readSession(), editorReturn);
        // A durable unresolved choice must win over any remembered return view.
        await discardInformationSession(evaluate, wait);
        await evaluate('const k="easyTimerRuntime.v1."+sessionStorage.getItem("easyTimerRuntimeContext.v1");const r=JSON.parse(localStorage.getItem(k));r.recoveryPending=true;localStorage.setItem(k,JSON.stringify(r))');
        await syncClock();
        const before = await evaluate('performance.timeOrigin'); await cdp('Page.reload');
        await wait(`performance.timeOrigin!==${before} && document.querySelector('#runtime-recovery')?.hidden===false`);
        await excursion('quick', '10s', true, () => evaluate(`sessionStorage.setItem('${originKey}', JSON.stringify({view:'editor'}))`));
        assert.equal(await evaluate('document.querySelector("#runtime-recovery").hidden'), false);
        assert.equal(await evaluate('document.body.classList.contains("planner-open")'), false,
            'Unresolved Quick Recovery takes precedence over an Editor return origin');
        assert.equal(await evaluate('document.querySelector("#recovery-select").value'), '');
        await evaluate('document.querySelector("#recovery-dismiss").click()');
        // With no known origin, even repeated direct visits use the normal entry.
        await syncClock();
        await cdp('Page.navigate', { url:(await evaluate('location.origin')) + '/imprint.html' });
        await wait('Boolean(document.querySelector(".info-return")&&document.querySelector("[data-language]"))');
        assert.equal(await evaluate('document.querySelector(".info-return").getAttribute("href")'), './');
        await assertReturnLabels('direct');
        await navigate('.info-return', false);
        assert.equal(await evaluate('document.body.dataset.mode'), 'quick');
        console.log('PASS: information origin survives chains/reload; real deadlines, Quick running/pause/overtime, same Session phase catch-up/pause, Editor and unresolved recovery survive explicit top return.');
    } catch (error) {
        console.error('Information continuity failure:', error);
        throw error;
    } finally {
        if (bootstrap) await cdp('Page.removeScriptToEvaluateOnNewDocument', { identifier:bootstrap });
        await clock.restore();
        await restoreInformationStore(evaluate, savedLibrary);
        // Leave the injected clock behind before another scenario starts a timer.
        const realTimeOrigin = await evaluate('performance.timeOrigin'); await cdp('Page.reload');
        await wait(`performance.timeOrigin!==${realTimeOrigin} && ${appReady}`);
    }
}
