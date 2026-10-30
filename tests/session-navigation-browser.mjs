import assert from 'node:assert/strict';
import { createVirtualClock } from './virtual-clock.mjs';

export async function checkSessionNavigation({ evaluate, click, text, cdp, configure }) {
    const saved = await evaluate("localStorage.getItem('easyTimerTemplates')");
    const library = { schemaVersion: 1, templates: [
        { id:'nav-manual', name:'Navigation manual', transitionMode:'manual', phases:[
            { id:'nav-manual-1', title:'Opening', durationSeconds:60 },
            { id:'nav-manual-2', title:'Closing', durationSeconds:60 },
        ] },
        { id:'nav-automatic', name:'Navigation automatic', transitionMode:'automatic', phases:[
            { id:'nav-automatic-1', title:'Automatic', durationSeconds:60 },
        ] },
    ] };
    const clock = createVirtualClock(evaluate);
    const record = () => evaluate("JSON.parse(localStorage.getItem('easyTimerRuntime.v1.'+sessionStorage.getItem('easyTimerRuntimeContext.v1')))");
    const menu = async selector => {
        if (await evaluate("document.getElementById('preferences').hidden")) await click('#menu-toggle');
        await click(selector);
    };
    const editor = () => menu('#open-planner');
    const choose = async id => {
        await evaluate(`(()=>{const select=document.getElementById('session-template');select.value=${JSON.stringify(id)};select.dispatchEvent(new Event('change',{bubbles:true}))})()`);
        await click('#prepare-session');
    };
    const expectSameRun = async baseline => {
        const current = await record();
        assert.equal(current.run.runId, baseline.run.runId);
        assert.equal(current.run.currentIndex, baseline.run.currentIndex);
        assert.equal(current.run.stage, baseline.run.stage);
        assert.equal(current.clock.deadlineMs, baseline.clock.deadlineMs);
        return current;
    };
    const cancelQuickSwitch = async expected => {
        const before = await record();
        await evaluate('window.navigationAnswers=[false];window.navigationPrompts=[]');
        await menu('#open-quick');
        assert.deepEqual(await evaluate('window.navigationPrompts'), [expected]);
        assert.equal(await evaluate('document.body.dataset.mode'), 'session');
        assert.equal(await evaluate("document.body.classList.contains('planner-open')"), true);
        await expectSameRun(before);
    };

    await clock.install(await evaluate('Date.now()'));
    await click('[data-language="en"]');
    await evaluate(`window.navigationConfirm=window.confirm;window.navigationAnswers=[];window.navigationPrompts=[];window.confirm=message=>{window.navigationPrompts.push(message);return window.navigationAnswers.length?window.navigationAnswers.shift():true};localStorage.setItem('easyTimerTemplates',${JSON.stringify(JSON.stringify(library))})`);
    try {
        // Same-mode Quick selection is a protected view return, including dirty drafts.
        await menu('#open-quick'); await configure(0,1,0); await click('#primary');
        const quickRunning = await record(); await editor(); await evaluate('window.navigationPrompts=[]'); await menu('#open-quick');
        assert.equal(await evaluate("document.body.classList.contains('planner-open')"), false);
        assert.equal((await record()).clock.deadlineMs, quickRunning.clock.deadlineMs);
        assert.deepEqual(await evaluate('window.navigationPrompts'), []);
        assert.equal(await evaluate('document.activeElement.id'), 'primary');
        await editor();
        await evaluate("Array.from(document.querySelectorAll('#planner button')).find(button=>button.textContent==='Create Rundown').click();const input=document.getElementById('template-name');input.value='Keep draft';input.dispatchEvent(new Event('input',{bubbles:true}));window.navigationAnswers=[false];window.navigationPrompts=[]");
        await menu('#open-quick');
        assert.deepEqual(await evaluate('window.navigationPrompts'), ['Discard unsaved changes?']);
        assert.equal(await evaluate("document.body.classList.contains('planner-open')&&document.getElementById('template-name').value==='Keep draft'"), true);
        assert.equal((await record()).clock.deadlineMs, quickRunning.clock.deadlineMs);
        await evaluate('window.navigationAnswers=[true]'); await menu('#open-quick');
        assert.equal(await evaluate('document.activeElement.id'), 'primary');
        await click('#stop');

        // Same-mode Session selection reveals the existing Run and never opens a replacement picker.
        await menu('#open-session'); await choose('nav-manual');
        const untouched = await record(); await editor(); await evaluate('window.navigationPrompts=[]'); await menu('#open-session');
        assert.equal(await evaluate("document.body.classList.contains('planner-open')"), false);
        assert.equal(await evaluate("document.getElementById('session-picker').hidden"), true);
        await expectSameRun(untouched); assert.deepEqual(await evaluate('window.navigationPrompts'), []);
        assert.equal(await evaluate('document.activeElement.id'), 'primary');
        await menu('#open-session'); await expectSameRun(untouched);
        assert.deepEqual(await evaluate('window.navigationPrompts'), []);

        // The owner-approved untouched phase-1 READY exception remains confirmation-free.
        await menu('#open-quick');
        assert.equal(await evaluate('document.body.dataset.mode'), 'quick');
        assert.deepEqual(await evaluate('window.navigationPrompts'), []);

        // Progressed Session cancellation preserves Manual RUNNING, PAUSED and progressed READY.
        await menu('#open-session'); await choose('nav-manual'); await click('#primary'); await clock.advance('10s'); await editor();
        await cancelQuickSwitch('End the current Rundown and switch to Quick Timer? The current Session progress will be discarded.');
        await click('[data-language="de"]');
        await cancelQuickSwitch('Aktuellen Rundown beenden und zum Quick-Timer wechseln? Der Fortschritt dieser Session wird verworfen.');
        await click('[data-language="en"]'); await click('.planner-back'); await click('#primary');
        const paused = await record(); await editor(); await cancelQuickSwitch('End the current Rundown and switch to Quick Timer? The current Session progress will be discarded.');
        assert.equal((await record()).clock.status, 'PAUSED'); assert.equal((await record()).clock.remainingMs, paused.clock.remainingMs);
        await click('.planner-back'); await evaluate('window.navigationAnswers=[true]'); await click('#stop');
        await click('#next'); const progressedReady = await record(); await editor();
        await cancelQuickSwitch('End the current Rundown and switch to Quick Timer? The current Session progress will be discarded.');
        assert.equal((await record()).clock.status, 'READY'); await expectSameRun(progressedReady); await click('.planner-back');

        // Phase overtime and replacement use the same guard with destination-specific copy.
        await evaluate('window.navigationAnswers=[true]'); await click('#stop'); await click('#primary'); await clock.advance('70s'); await editor();
        await cancelQuickSwitch('End the current Rundown and switch to Quick Timer? The current Session progress will be discarded.');
        const phaseOvertime = await record(); await evaluate('window.navigationAnswers=[false];window.navigationPrompts=[]'); await click('[data-rundown-id="nav-automatic"]');
        assert.deepEqual(await evaluate('window.navigationPrompts'), ['Replace the current Rundown with the selected Rundown? The current Session progress will be discarded. The replacement will remain Ready until you start it.']);
        await expectSameRun(phaseOvertime);
        await evaluate('window.navigationAnswers=[true]'); await click('[data-rundown-id="nav-automatic"]');
        assert.equal((await record()).run.transitionMode, 'automatic'); assert.equal((await record()).clock.status, 'READY');

        // Automatic workshop overtime remains protected; confirmation performs the genuine mode switch.
        await click('#primary'); await clock.advance('70s'); await editor();
        await cancelQuickSwitch('End the current Rundown and switch to Quick Timer? The current Session progress will be discarded.');
        assert.equal((await record()).run.stage, 'COMPLETED');
        await evaluate('window.navigationAnswers=[true];window.navigationPrompts=[]'); await menu('#open-quick');
        assert.equal(await evaluate('document.body.dataset.mode'), 'quick');
        assert.deepEqual(await evaluate('window.navigationPrompts'), ['End the current Rundown and switch to Quick Timer? The current Session progress will be discarded.']);

        // Responsive same-mode return keeps a visible focus target and never overflows.
        await cdp('Emulation.setDeviceMetricsOverride',{width:320,height:640,screenWidth:320,screenHeight:640,mobile:true,deviceScaleFactor:1});
        await editor(); await menu('#open-quick');
        assert.equal(await evaluate("document.activeElement.id==='primary'&&document.documentElement.scrollWidth<=innerWidth"), true);
        console.log('PASS: UX-011 same-mode Quick/Session returns, dirty-draft guard, untouched READY exception, Manual/Automatic progress protection, destination copy, replacement, focus and 320px.');
    } finally {
        await clock.restore(); await cdp('Emulation.clearDeviceMetricsOverride');
        await evaluate(`window.confirm=window.navigationConfirm;${saved===null?"localStorage.removeItem('easyTimerTemplates')":`localStorage.setItem('easyTimerTemplates',${JSON.stringify(saved)})`}`);
    }
}
