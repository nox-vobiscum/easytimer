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
        assert.equal(await evaluate("document.getElementById('data-backup').open"), false, 'Backup starts collapsed');
        assert.equal(await evaluate("document.getElementById('rundown-import-file').checkVisibility()"), false);
        const beforeToggle = await evaluate("localStorage.getItem('easyTimerTemplates')");
        await evaluate("window.backupFetch=fetch;window.backupSetItem=Storage.prototype.setItem;window.backupEffects=0;globalThis.fetch=(...a)=>{window.backupEffects++;return window.backupFetch(...a)};Storage.prototype.setItem=function(...a){window.backupEffects++;return window.backupSetItem.apply(this,a)};document.getElementById('backup-summary').scrollIntoView()");
        try {
            const point = await evaluate("(()=>{const r=document.getElementById('backup-summary').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()");
            await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
            await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
            assert.equal(await evaluate("document.getElementById('data-backup').open"), true);
            for (const [key, code, expected] of [['Enter', 13, false], [' ', 32, true]]) {
                await evaluate("document.getElementById('backup-summary').focus()");
                await cdp('Page.bringToFront');
                await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key === 'Enter' ? 'Enter' : 'Space', windowsVirtualKeyCode: code, text: key === 'Enter' ? '\r' : ' ', unmodifiedText: key === 'Enter' ? '\r' : ' ' });
                await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key === 'Enter' ? 'Enter' : 'Space', windowsVirtualKeyCode: code });
                assert.equal(await evaluate("document.getElementById('data-backup').open"), expected);
            }
            assert.equal(await evaluate('window.backupEffects'), 0, 'Disclosure never writes storage or fetches');
            assert.equal(await evaluate("localStorage.getItem('easyTimerTemplates')"), beforeToggle);
        } finally { await evaluate('globalThis.fetch=window.backupFetch;Storage.prototype.setItem=window.backupSetItem'); }
        for (const count of [0, 1, 2]) {
            await evaluate(`localStorage.setItem('easyTimerTemplates',${JSON.stringify(JSON.stringify({ ...library, templates: library.templates.slice(0, count) }))});Array.from(document.querySelectorAll('#planner button')).find(b=>b.textContent==='Refresh list').click()`);
            assert.equal(await evaluate("document.querySelectorAll('.template-library li').length"), count);
            assert.equal(await evaluate("document.getElementById('rundown-list-heading').tagName"), 'H2');
            assert.equal(await evaluate("document.querySelector('.template-library').getAttribute('aria-labelledby')"), 'rundown-list-heading');
            assert.equal(await evaluate("Array.from(document.querySelectorAll('.template-library li h3')).length"), count);
            assert(await evaluate("Array.from(document.querySelectorAll('.template-library li')).every((row,i,rows)=>getComputedStyle(row).borderBottomWidth===(i===rows.length-1?'0px':'1px'))"));
            assert.equal(await evaluate("getComputedStyle(document.getElementById('data-backup')).borderTopWidth"), '1px');
        }
        for (const language of ['de', 'en']) for (const theme of ['light', 'dark']) for (const width of [1280, 320]) {
            await click(`[data-language="${language}"]`); await click(`[data-theme="${theme}"]`);
            await cdp('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width === 320 });
            const label = language === 'de' ? 'Session starten' : 'Launch session';
            assert.equal(await evaluate("document.querySelector('.rundown-launch span').textContent"), label);
            assert.equal(await evaluate("document.querySelector('.rundown-launch').getAttribute('aria-label')"), `${label}: Launch manual`);
            assert.equal(await evaluate("document.querySelector('.rundown-launch').innerText"), width === 320 ? language === 'de' ? 'Starten' : 'Launch' : label);
            assert.deepEqual(await evaluate("Array.from(document.querySelector('.rundown-actions').children).map(b=>b.getAttribute('aria-label'))"), language === 'de' ? ['Session starten: Launch manual', 'Bearbeiten: Launch manual', 'Rundown exportieren: Launch manual', 'Löschen: Launch manual'] : ['Launch session: Launch manual', 'Edit: Launch manual', 'Export Rundown: Launch manual', 'Delete: Launch manual']);
            assert(await evaluate("Array.from(document.querySelectorAll('.rundown-icon')).every(b=>!b.textContent.trim()&&b.querySelector('svg')&&b.title&&b.getBoundingClientRect().width>=44&&b.getBoundingClientRect().height>=44)"));
            assert(await evaluate("(()=>{const r=Array.from(document.querySelector('.rundown-actions').children).map(b=>b.getBoundingClientRect());return r.every(b=>Math.abs(b.top-r[0].top)<1&&b.left>=0&&b.right<=innerWidth);})()"), 'All four actions fit one aligned row at desktop and 320px');
            assert(await evaluate("document.querySelector('.rundown-launch').getBoundingClientRect().height>=44"));
            assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
            assert.equal(await evaluate("getComputedStyle(document.getElementById('backup-heading')).textTransform"), 'uppercase');
            assert.equal(await evaluate("document.getElementById('rundown-list-heading').textContent"), language === 'de' ? 'Meine Rundowns' : 'My Rundowns');
            assert(await evaluate("(()=>{const a=getComputedStyle(document.getElementById('rundown-list-heading'));const b=getComputedStyle(document.getElementById('backup-heading'));return ['fontSize','fontWeight','letterSpacing','textTransform','color'].every(k=>a[k]===b[k]);})()"), 'List heading reuses backup utility typography');
            assert.equal(await evaluate("document.getElementById('backup-heading').textContent"), language === 'de' ? 'Daten & Sicherung' : 'Data & Backup');
            assert(await evaluate(`(()=>{const launch=getComputedStyle(document.querySelector('.rundown-launch'));const edit=getComputedStyle(document.querySelector('.rundown-launch').nextElementSibling);const back=getComputedStyle(document.querySelector('.planner-back'));return launch.backgroundColor!==edit.backgroundColor&&edit.backgroundColor==='rgba(0, 0, 0, 0)'&&back.backgroundColor==='rgba(0, 0, 0, 0)'&&back.borderTopColor==='rgba(0, 0, 0, 0)'&&document.querySelector('.planner-back').getBoundingClientRect().height>=44;})()`), 'Launch is visually primary; secondary navigation retains its touch target');
            await evaluate("document.querySelector('.rundown-launch').focus()");
            await evaluate("document.getElementById('data-backup').open=false");
            const shot = await cdp('Page.captureScreenshot', { format: 'png' });
            await writeFile(join(output, `${language}-${theme}-${width}.png`), Buffer.from(shot.data, 'base64'));
            await click('#backup-summary');
            assert.equal(await evaluate("document.getElementById('rundown-import-file').checkVisibility()"), true);
            const expanded = await cdp('Page.captureScreenshot', { format: 'png' });
            await writeFile(join(output, `${language}-${theme}-${width}-expanded.png`), Buffer.from(expanded.data, 'base64'));
        }
        await cdp('Emulation.setDeviceMetricsOverride', { width: 280, height: 900, deviceScaleFactor: 1, mobile: true });
        assert(await evaluate("(()=>{const r=Array.from(document.querySelector('.rundown-actions').children).map(b=>b.getBoundingClientRect());return r[0].bottom<=r[1].top&&r.slice(1).every(b=>Math.abs(b.top-r[1].top)<1)&&document.documentElement.scrollWidth<=innerWidth;})()"), 'Very narrow fallback keeps the three icons together');
        await cdp('Emulation.setDeviceMetricsOverride', { width: 320, height: 900, deviceScaleFactor: 1, mobile: true });
        await evaluate("document.querySelector('.rundown-launch').focus()");
        for (const action of ['rundown-edit', 'rundown-export', 'rundown-delete']) {
            await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
            await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
            assert(await evaluate(`document.activeElement.classList.contains('${action}')&&getComputedStyle(document.activeElement).outlineStyle!=='none'`));
        }
        await evaluate("document.querySelector('.rundown-launch').focus()");
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
