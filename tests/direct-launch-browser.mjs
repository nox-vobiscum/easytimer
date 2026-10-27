import assert from 'node:assert/strict';
import { createVirtualClock } from './virtual-clock.mjs';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function checkDirectLaunch({ evaluate, click, text, cdp }) {
    const saved = await evaluate("localStorage.getItem('easyTimerTemplates')");
    const library = { schemaVersion: 1, templates: ['manual', 'automatic'].map(mode => ({
        id: 'launch-' + mode, name: 'Launch ' + mode, transitionMode: mode,
        phases: [1, 2].map(n => ({ id: mode + n, title: 'Phase ' + n, durationSeconds: 60 })),
    })) };
    const clock = createVirtualClock(evaluate);
    const menu = async selector => { if (await evaluate("document.getElementById('preferences').hidden")) await click('#menu-toggle'); await click(selector); };
    const editor = () => menu('#open-planner');
    const launch = id => click(`[data-rundown-id="launch-${id}"]`);
    const output = await mkdtemp(join(tmpdir(), 'easytimer-direct-launch-'));
    await clock.install(await evaluate('Date.now()'));
    await evaluate(`window.launchConfirm=window.confirm;window.launchAccept=true;window.launchPrompts=[];window.confirm=m=>{window.launchPrompts.push(m);return window.launchAccept};localStorage.setItem('easyTimerTemplates',${JSON.stringify(JSON.stringify(library))})`);
    try {
        await menu('#open-quick');
        await click('#stop');
        await click('[data-language="en"]');
        for (const mode of ['manual', 'automatic']) {
            await editor(); await launch(mode);
            assert.equal(await text('#status'), 'Ready');
            assert.equal(await text('#time'), '01:00');
            assert.equal(await evaluate('document.activeElement.id'), 'primary');
            await clock.advance('2m'); assert.equal(await text('#time'), '01:00');
            assert.equal(await evaluate("document.getElementById('automatic-preview').hidden"), mode === 'manual');
            await click('#primary'); await clock.advance('10s'); assert.equal(await text('#time'), '00:50');
            await editor(); await evaluate('window.launchAccept=false'); await launch('manual');
            assert.equal(await evaluate("document.body.classList.contains('planner-open')"), true);
            await click('.planner-back'); assert.equal(await text('#time'), '00:50');
            await click('#primary'); await editor(); await launch('manual');
            assert.equal(await evaluate("document.body.classList.contains('planner-open')"), true, 'Paused run survives cancelled replacement');
            await evaluate('window.launchAccept=true'); await launch('manual');
            assert.equal(await text('#status'), 'Ready');
        }
        // Progressed READY and phase overtime both require confirmation.
        await click('#primary'); await click('#next'); await editor();
        await evaluate('window.launchAccept=false;window.launchPrompts=[]'); await launch('automatic');
        assert.equal(await evaluate('window.launchPrompts.length'), 1);
        await click('.planner-back'); assert.equal(await text('#status'), 'Ready');
        await click('#primary'); await clock.advance('70s'); await editor(); await launch('manual');
        assert.equal(await evaluate("document.body.classList.contains('planner-open')"), true);
        await evaluate('window.launchAccept=true'); await launch('manual');
        // Final workshop overtime, paused overtime and Quick paused/overtime use the same guard.
        await click('#primary'); await click('#next'); await click('#next');
        await clock.advance('10s'); await editor();
        await evaluate('window.launchAccept=false;window.launchPrompts=[]'); await launch('automatic');
        assert.equal(await evaluate('window.launchPrompts.length'), 1);
        await click('.planner-back'); await click('#primary'); await editor(); await launch('automatic');
        assert.equal(await evaluate("document.body.classList.contains('planner-open')"), true, 'Paused final overtime is retained');
        await evaluate('window.launchAccept=true'); await launch('manual');
        await menu('#open-quick'); await click('#primary'); await editor();
        await evaluate('window.launchAccept=false'); await launch('manual');
        assert.equal(await evaluate("document.body.dataset.mode"), 'quick');
        assert.equal(await evaluate("document.body.classList.contains('planner-open')"), true);
        await click('.planner-back'); await click('#primary'); await editor(); await launch('manual');
        assert.equal(await evaluate("document.body.dataset.mode"), 'quick', 'Paused Quick Timer is retained');
        await click('.planner-back'); await click('#primary'); await clock.advance('100h'); await editor(); await launch('manual');
        assert.equal(await evaluate("document.body.dataset.mode"), 'quick', 'Quick overtime is retained');
        await evaluate('window.launchAccept=true'); await launch('manual');
        // Fresh storage is read by ID, rather than the stale displayed row.
        await editor();
        await evaluate("const l=JSON.parse(localStorage.getItem('easyTimerTemplates'));l.templates[0].phases[0].durationSeconds=180;localStorage.setItem('easyTimerTemplates',JSON.stringify(l))");
        await launch('manual'); assert.equal(await text('#time'), '03:00');
        await editor();
        await evaluate("localStorage.setItem('easyTimerTemplates',JSON.stringify({schemaVersion:1,templates:[]}))");
        await launch('manual'); assert.equal(await evaluate("document.body.classList.contains('planner-open')"), true);
        assert.match(await text('.planner-feedback'), /could not be loaded/);
        await click('.planner-back'); assert.equal(await text('#time'), '03:00');
        await evaluate(`localStorage.setItem('easyTimerTemplates',${JSON.stringify(JSON.stringify(library))})`);
        await editor();
        await evaluate("window.launchGetItem=Storage.prototype.getItem;Storage.prototype.getItem=function(k){if(k==='easyTimerTemplates')throw Error('synthetic read failure');return window.launchGetItem.call(this,k)}");
        await launch('manual'); assert.match(await text('.planner-feedback'), /could not be loaded/);
        await evaluate('Storage.prototype.getItem=window.launchGetItem');
        await evaluate("Array.from(document.querySelectorAll('#planner button')).find(b=>b.textContent==='Refresh list').click()");
        for (const language of ['de', 'en']) for (const theme of ['light', 'dark']) {
            await click(`[data-language="${language}"]`); await click(`[data-theme="${theme}"]`);
            await cdp('Emulation.setDeviceMetricsOverride', { width: theme === 'dark' ? 320 : 1280, height: 900, deviceScaleFactor: 1, mobile: theme === 'dark' });
            const label = language === 'de' ? 'Session starten' : 'Launch session';
            assert.equal(await evaluate("document.querySelector('.rundown-launch span').textContent"), label);
            assert.equal(await evaluate("document.querySelector('.rundown-launch').nextElementSibling.textContent"), language === 'de' ? 'Bearbeiten' : 'Edit');
            assert(await evaluate("document.querySelector('.rundown-launch').getBoundingClientRect().height>=44"));
            assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
            await evaluate("document.querySelector('.rundown-launch').focus()");
            const shot = await cdp('Page.captureScreenshot', { format: 'png' });
            await writeFile(join(output, `${language}-${theme}.png`), Buffer.from(shot.data, 'base64'));
        }
        await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
        await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
        assert.equal(await evaluate('document.activeElement.id'), 'primary');
        assert.deepEqual(JSON.parse(await evaluate("localStorage.getItem('easyTimerTemplates')")), library);
        await evaluate('window.launchAccept=true');
        await menu('#open-quick'); await click('#stop');
        await click('[data-language="en"]');
        console.log('PASS: direct launch, fresh storage, manual/automatic READY, replacement guards/errors, DE/EN/themes/320px and keyboard. Screenshots: ' + output);
    } finally {
        await evaluate(`Storage.prototype.getItem=window.launchGetItem||Storage.prototype.getItem;window.confirm=window.launchConfirm;${saved === null ? "localStorage.removeItem('easyTimerTemplates')" : `localStorage.setItem('easyTimerTemplates',${JSON.stringify(saved)})`}`);
        await clock.restore();
        await cdp('Emulation.clearDeviceMetricsOverride');
    }
}
