import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

// Runs only inside the harness's disposable browser profile, never owner storage.
export async function checkRecovery({ evaluate, click, text, cdp, configure }) {
    let bootScript;
    const ready = async expression => {
        for (let i = 0; i < 100; i++) {
            if (await evaluate(expression)) return;
            await delay(50);
        }
        assert.fail('Recovery browser did not reach expected state: ' + expression);
    };
    const reload = async (now, holdRecovery = false) => {
        if (bootScript) await cdp('Page.removeScriptToEvaluateOnNewDocument', { identifier: bootScript });
        const gate = holdRecovery ? `const originalRequest=navigator.locks.request.bind(navigator.locks);let release;const gate=new Promise(done=>release=done);navigator.locks.request=(...args)=>gate.then(()=>originalRequest(...args));globalThis.releaseRecoveryTest=release;` : '';
        bootScript = (await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `Date.now=()=>${now};${gate}` })).identifier;
        const origin = await evaluate('performance.timeOrigin');
        await cdp('Page.reload');
        if (holdRecovery) {
            await ready(`performance.timeOrigin!==${origin}&&Boolean(document.querySelector('#time'))&&Boolean(window.releaseRecoveryTest)`);
            assert.equal(await text('#time'), '', 'No incorrect default value is present before recovery resolves');
            assert.equal(await evaluate(`getComputedStyle(document.querySelector('#timer-view')).visibility==='hidden'&&document.querySelector('main').getAttribute('aria-busy')==='true'`), true);
            await evaluate('window.releaseRecoveryTest()');
        }
        await ready(`performance.timeOrigin!==${origin}&&Boolean(document.querySelector('#primary')?.title)`);
    };
    const now = await evaluate('Date.now()');
    try {
        await click('[data-language="en"]');
        await configure(0, 1, 0); await click('#primary');
        await click('[data-adjustment="30000"]');
        const deadline = await evaluate(`JSON.parse(localStorage.getItem('easyTimerRuntime.v1.'+sessionStorage.getItem('easyTimerRuntimeContext.v1'))).clock.deadlineMs`);
        await reload(deadline - 80000, true);
        assert.equal(await text('#time'), '01:20'); assert.equal(await text('#status'), 'Running');
        assert.equal(await evaluate(`document.querySelector('#runtime-recovery').hidden`), true);
        await click('#primary');
        await reload(deadline + 3600000);
        assert.equal(await text('#time'), '01:20'); assert.equal(await text('#status'), 'Paused');
        await click('#primary');
        await reload(deadline + 3680000);
        assert.equal(await text('#time'), '+00:00');
        await reload(deadline + 3690000);
        assert.equal(await text('#time'), '+00:10');
        await click('[data-adjustment="30000"]'); assert.equal(await text('#time'), '00:20');
        await click('#stop'); await reload(deadline + 3700000);
        assert.equal(await text('#time'), '01:00'); assert.equal(await text('#status'), 'Ready');

        // A real second window inherits sessionStorage from its opener.
        await evaluate(`Boolean(window.recoveryChild=window.open('/','recovery-duplicate'))`);
        await ready(`Boolean(window.recoveryChild?.document.querySelector('#primary')?.title)`);
        assert.equal(await evaluate(`sessionStorage.getItem('easyTimerRuntimeContext.v1')!==recoveryChild.sessionStorage.getItem('easyTimerRuntimeContext.v1')`), true, 'Duplicated tab association receives a distinct exclusive owner');
        await evaluate(`recoveryChild.document.querySelector('[data-preset="900000"]').click()`);
        assert.equal(await text('#time'), '01:00', 'Second window cannot change the original clock');
        assert.equal(await evaluate(`JSON.parse(localStorage.getItem('easyTimerRuntime.v1.'+sessionStorage.getItem('easyTimerRuntimeContext.v1'))).clock.durationMs`), 60000);
        // Explicitly selecting an active context must fail, never steal its lock.
        await evaluate(`(()=>{const child=recoveryChild,s=child.document.querySelector('#recovery-select');s.value=sessionStorage.getItem('easyTimerRuntimeContext.v1');s.dispatchEvent(new child.Event('change'));child.document.querySelector('#recovery-restore').click()})()`);
        await ready(`recoveryChild.document.querySelector('#recovery-feedback').textContent.includes('another tab')`);
        await evaluate(`window.recoveryCandidate=recoveryChild.sessionStorage.getItem('easyTimerRuntimeContext.v1');recoveryChild.close();sessionStorage.removeItem('easyTimerRuntimeContext.v1')`);
        await delay(100);
        await reload(deadline + 3710000);
        assert.equal(await evaluate(`!document.querySelector('#runtime-recovery').hidden&&document.querySelector('#recovery-select').options.length>=3&&document.querySelector('#recovery-select').value===''`), true, 'Ambiguous restart offers explicit choices without a default');
        await evaluate(`(()=>{const s=document.querySelector('#recovery-select');s.selectedIndex=1;s.dispatchEvent(new Event('change'))})()`);
        for (const language of ['de', 'en']) for (const theme of ['light', 'dark']) {
            await click(`[data-language="${language}"]`); await click(`[data-theme="${theme}"]`);
            await cdp('Emulation.setDeviceMetricsOverride', { width: 320, height: 800, mobile: true, deviceScaleFactor: 1 });
            assert.equal(await evaluate(`document.documentElement.scrollWidth<=innerWidth`), true, 'Recovery fits 320px');
            assert.equal(await evaluate(`document.querySelector('#recovery-restore').getBoundingClientRect().height>=44`), true);
            assert.equal(await evaluate(`(()=>{const e=document.querySelector('#recovery-detail'),r=e.getBoundingClientRect();return !e.hidden&&e.textContent===document.querySelector('#recovery-select').selectedOptions[0].textContent&&r.left>=0&&r.right<=innerWidth})()`), true, 'Full selected identification stays readable at 320px');
        }
        // Recover the inactive 15-minute candidate (the other is the old one-minute timer).
        await evaluate(`(()=>{const s=document.querySelector('#recovery-select');s.value=Array.from(s.options).find(o=>o.textContent.includes('15:00')).value;s.dispatchEvent(new Event('change'));document.querySelector('#recovery-restore').click()})()`);
        await ready(`document.querySelector('#time').textContent==='15:00'`);
        assert.equal(await text('#status'), 'Ready');
        await reload(deadline + 3720000); assert.equal(await text('#time'), '15:00');
        assert.equal(await evaluate(`document.querySelector('#runtime-recovery').hidden`), true);
        console.log('PASS: durable Quick reload, pause/budget/expiry/overtime/Stop, real duplicated-context isolation, active-owner rejection, explicit restart selection, DE/EN/themes/320px.');
    } finally {
        await evaluate(`window.recoveryChild?.close()`);
        if (bootScript) await cdp('Page.removeScriptToEvaluateOnNewDocument', { identifier: bootScript });
        // Remove only this disposable profile's runtime fixtures, not saved Rundowns.
        await evaluate(`(()=>{for(const key of Object.keys(localStorage))if(key.startsWith('easyTimerRuntime.v1.'))localStorage.removeItem(key);sessionStorage.removeItem('easyTimerRuntimeContext.v1')})()`);
        const origin = await evaluate('performance.timeOrigin'); await cdp('Page.reload');
        await ready(`performance.timeOrigin!==${origin}&&Boolean(document.querySelector('#primary')?.title)`);
        await cdp('Emulation.clearDeviceMetricsOverride');
    }
}

export async function checkRecoveryCorrections({ evaluate, click, text, cdp, configure }) {
    const wait = async expression => {
        for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await delay(50); }
        assert.fail('Three-tab recovery check timed out: ' + expression);
    };
    try {
        await click('[data-language="en"]'); await configure(0, 1, 0); await click('#primary');
        await click('[data-adjustment="30000"]');
        await evaluate(`Boolean(window.recoveryB=window.open('/','recovery-owner-b'))`);
        await wait(`Boolean(recoveryB.document.querySelector('#primary')?.title)`);
        await evaluate(`recoveryB.document.querySelector('#primary').click()`);
        await evaluate(`Boolean(window.recoveryC=window.open('/','recovery-chooser-c'))`);
        await wait(`Boolean(recoveryC.document.querySelector('#primary')?.title)`);
        const ownerIds = await evaluate(`({a:sessionStorage.getItem('easyTimerRuntimeContext.v1'),b:recoveryB.sessionStorage.getItem('easyTimerRuntimeContext.v1')})`);
        const readOwners = () => evaluate(`(${JSON.stringify(Object.values(ownerIds))}).map(id=>JSON.parse(localStorage.getItem('easyTimerRuntime.v1.'+id)).clock.deadlineMs)`);
        const deadlines = await readOwners();
        assert.equal(await evaluate(`recoveryC.document.querySelector('#recovery-select').value`), '');
        assert.match(await evaluate(`recoveryC.document.querySelector('#recovery-feedback').textContent`), /Timers are available/);
        const labels = await evaluate(`Array.from(recoveryC.document.querySelector('#recovery-select').options).slice(1).map(o=>o.textContent)`);
        assert.equal(labels.length, 2); assert.ok(labels.every(label => label.includes('Start ') && label.includes('In use in another tab') && !label.includes('Overtime')));
        assert.ok(labels.some(label => label.includes('Total budget 01:30')));
        assert.ok(labels.some(label => label.includes('Total budget 05:00')));
        await delay(150);
        assert.deepEqual(await evaluate(`Array.from(recoveryC.document.querySelector('#recovery-select').options).slice(1).map(o=>o.textContent)`), labels, 'Identification labels do not simulate a live countdown');
        for (const language of ['de', 'en']) {
            await evaluate(`recoveryC.document.querySelector('[data-language="${language}"]').click()`);
            await evaluate(`(()=>{const w=recoveryC,s=w.document.querySelector('#recovery-select');s.value=${JSON.stringify(ownerIds.b)};s.dispatchEvent(new w.Event('change'));w.document.querySelector('#recovery-restore').click()})()`);
            await wait(`recoveryC.document.querySelector('#recovery-feedback').textContent.includes(${JSON.stringify(language === 'de' ? 'Wechsle dorthin' : 'Switch to that tab')})`);
            assert.equal(await evaluate(`(()=>{const w=recoveryC,e=w.document.querySelector('#recovery-feedback'),r=e.getBoundingClientRect();return w.document.activeElement===e&&r.top>=0&&r.bottom<=w.innerHeight})()`), true, 'Refusal is visible and receives keyboard/screen-reader focus');
            assert.equal(await evaluate(`recoveryC.document.querySelector('#time').textContent`), '05:00');
            assert.deepEqual(await readOwners(), deadlines, 'Denied takeover preserves both running originals');
        }
        // Recheck at action time: a formerly locked candidate becomes recoverable.
        await evaluate('recoveryB.close()'); await delay(100);
        await evaluate(`recoveryC.document.querySelector('#recovery-restore').click()`);
        await wait(`recoveryC.document.querySelector('#status').textContent==='Running'`);
        assert.equal(await evaluate(`recoveryC.sessionStorage.getItem('easyTimerRuntimeContext.v1')`), ownerIds.b);
        assert.equal((await readOwners())[1], deadlines[1], 'Unlocked recovery retains the original deadline');
        console.log('PASS: two live timers plus third-tab chooser, actual starts/extended budgets/advisory locks, stable labels, visible focused DE/EN refusal, unchanged originals and unlocked recovery.');
    } finally {
        await evaluate('window.recoveryB?.close();window.recoveryC?.close()');
        await evaluate(`(()=>{for(const key of Object.keys(localStorage))if(key.startsWith('easyTimerRuntime.v1.'))localStorage.removeItem(key);sessionStorage.removeItem('easyTimerRuntimeContext.v1')})()`);
        const origin = await evaluate('performance.timeOrigin'); await cdp('Page.reload');
        await wait(`performance.timeOrigin!==${origin}&&Boolean(document.querySelector('#primary')?.title)`);
    }
}
