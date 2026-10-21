import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, extname } from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const root = resolve('src');
const server = createServer(async (req, res) => {
    try {
        const requestPath = new URL(req.url, 'http://localhost').pathname;
        const path = resolve(root, '.' + (requestPath === '/' ? '/index.html' : requestPath));
        if (!path.startsWith(root + '/') && !path.startsWith(root + '\\')) throw new Error('Invalid path');
        const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
        res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'text/plain' });
        res.end(await readFile(path));
    } catch { res.writeHead(404); res.end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const profile = await mkdtemp(join(tmpdir(), 'easytimer-browser-'));
const browser = spawn(process.env.EASYTIMER_BROWSER || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    ['--headless=new', '--disable-gpu', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--no-first-run', '--no-default-browser-check', '--remote-allow-origins=*', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'],
    { windowsHide: true, stdio: 'ignore' });
let launchError;
browser.on('error', error => { launchError = error; });
let socket;
try {
    let port;
    for (let i = 0; i < 100; i++) {
        if (launchError) throw launchError;
        try { port = Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break; }
        catch { await delay(100); }
    }
    assert.ok(port, 'Browser must expose a debugging port');
    const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
    await new Promise((done, reject) => { socket.onopen = done; socket.onerror = reject; });
    let nextId = 0;
    const pending = new Map();
    const errors = [];
    socket.onmessage = ({ data }) => {
        const message = JSON.parse(data);
        if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
        const request = pending.get(message.id);
        if (request) { clearTimeout(request.timeout); pending.delete(message.id); message.error ? request.reject(message.error) : request.resolve(message.result); }
    };
    function cdp(method, params = {}) {
        return new Promise((resolve, reject) => {
            const id = ++nextId;
            const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`Browser command timed out: ${method}`)); }, 10000);
            pending.set(id, { resolve, reject, timeout });
            socket.send(JSON.stringify({ id, method, params }));
        });
    }
    async function evaluate(expression) {
        const result = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
        assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
        return result.result.value;
    }
    const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
    const text = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).textContent`);
    async function configure(h, m, s) {
        // Exercise the real configuration handler with short deterministic test durations.
        await evaluate(`(()=>{const el=document.querySelector('[data-preset]');const original=el.dataset.preset;el.dataset.preset=${(h*3600+m*60+s)*1000};el.click();el.dataset.preset=original;})()`);
    }
    await cdp('Runtime.enable');
    await cdp('Page.enable');
    await cdp('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` });
    for (let i = 0; i < 100; i++) {
        if (await evaluate(`document.querySelector('#primary')?.title?.length > 0`)) break;
        await delay(50);
    }
    assert.equal(await text('#time'), '05:00');
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('.presentation-brand')).display`), 'none');
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('#menu-toggle')).display`), 'none');
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('#preferences')).display`), 'flex');
    assert.equal(await evaluate(`Array.from(document.querySelectorAll('.brand-logo')).every(image => image.complete && image.naturalWidth === 96)`), true);
    assert.equal(await evaluate(`document.querySelector('link[rel="icon"]').getAttribute('href')`), 'assets/branding/favicon.ico');
    assert.equal(await evaluate(`document.querySelector('link[rel="manifest"]').getAttribute('href')`), 'manifest.webmanifest');
    assert.equal(await evaluate(`document.querySelector('link[rel="apple-touch-icon"]').getAttribute('href')`), 'assets/branding/apple-touch-icon.png');
    assert.deepEqual(await evaluate(`fetch('manifest.webmanifest').then(response => response.json()).then(manifest => ({name:manifest.name,display:manifest.display,sizes:manifest.icons.map(icon => icon.sizes)}))`), { name: 'easyTimer', display: 'standalone', sizes: ['192x192', '512x512'] });
    assert.equal(await evaluate(`Promise.race([
        navigator.serviceWorker.ready.then(registration => new Promise(resolve => {
            const worker = registration.active || registration.waiting || registration.installing;
            if (worker?.state === 'activated') return resolve('activated');
            worker?.addEventListener('statechange', () => {
                if (worker.state === 'activated') resolve('activated');
            });
        })),
        new Promise(resolve => setTimeout(() => resolve('timeout'),5000))
    ])`), 'activated');
    // Contextual controls must not move the readout when the preset section collapses.
    for (const width of [1280,390,320]) {
        await cdp('Emulation.setDeviceMetricsOverride', {width,height:900,deviceScaleFactor:1,mobile:width<500});
        for (const language of ['de','en']) {
            await click(`[data-language="${language}"]`);
            await configure(0,0,1);
            const top = await evaluate(`document.querySelector('#time').getBoundingClientRect().top`);
            async function checkContext(ready, label) {
                assert.equal(await evaluate(`document.querySelector('.duration-config').getClientRects().length > 0`),ready);
                assert.equal(await text('#adjustment-heading'),label);
                assert.ok(Math.abs(await evaluate(`document.querySelector('#time').getBoundingClientRect().top`) - top)<1,`Stable readout at ${width}px (${label})`);
                assert.equal(await evaluate(`Array.from(document.querySelectorAll('[data-adjustment]')).every(b=>{const r=b.getBoundingClientRect();return !b.disabled&&r.height>=44&&r.left>=0&&r.right<=innerWidth})`),true);
            }
            const labels = language === 'de' ? ['Dauer ergänzen','Restzeit verlängern','Zeitbudget verlängern'] : ['Add to duration','Extend remaining time','Extend time budget'];
            await checkContext(true,labels[0]);
            await click('#primary');
            await checkContext(false,labels[1]);
            await click('#primary');
            await checkContext(false,labels[1]);
            await click('#restart');
            await checkContext(false,labels[1]);
            await delay(1200);
            await checkContext(false,labels[2]);
            await click('#stop');
            await checkContext(true,labels[0]);
        }
    }
    await cdp('Emulation.clearDeviceMetricsOverride');
    await click('[data-language="en"]');
    assert.equal(await text('#status'), 'Ready');
    assert.deepEqual(await evaluate(`Array.from(document.querySelectorAll('[data-preset]')).map(b=>b.textContent)`), ['1 min','2 min','3 min','5 min','10 min','15 min','30 min','60 min']);
    assert.equal(await evaluate(`new Set(Array.from(document.querySelectorAll('[data-preset]')).map(b=>b.getBoundingClientRect().top)).size`),1,'Desktop presets use one row');
    assert.equal(await evaluate(`document.querySelectorAll('input').length`),0);
    assert.equal(await evaluate(`['primary','restart','stop'].every(id=>document.getElementById(id).querySelector('svg')&&document.getElementById(id).textContent.trim())`),true);
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('[data-preset]')).backgroundColor !== getComputedStyle(document.querySelector('[data-adjustment]')).backgroundColor`),true);
    await click('[data-preset="900000"]');
    await click('[data-adjustment="300000"]');
    assert.equal(await text('#time'),'20:00');
    assert.equal(await text('#time-budget'),'Total 20:00');
    assert.equal(await evaluate(`document.querySelectorAll('[data-preset][aria-pressed="true"]').length`),0);
    await click('#primary');
    await click('[data-adjustment="30000"]');
    assert.equal(await text('#status'),'Running');
    await click('#primary');
    const pausedBeforeAddition = await text('#time');
    await click('[data-adjustment="300000"]');
    assert.equal(await text('#status'),'Paused');
    assert.equal(await text('#time-budget'),'Total 25:30 · Planned 20:00 + 05:30');
    assert.notEqual(await text('#time'),pausedBeforeAddition);
    await click('#restart');
    assert.equal(await text('#time-budget'),'Total 20:00');
    await click('#stop');
    await configure(99,59,59);
    await click('[data-adjustment="30000"]');
    assert.equal(await text('#time'),'99:59:59');
    assert.match(await text('#help'),/99:59:59/);
    await click('#stop');
    await configure(0, 0, 5);
    await click('#primary');
    assert.equal(await text('#status'), 'Running');
    assert.equal(await evaluate(`Array.from(document.querySelectorAll('[data-preset]')).every(button=>button.disabled)`), true);
    await delay(1150);
    await click('#primary');
    const frozen = await text('#time');
    await delay(1100);
    assert.equal(await text('#time'), frozen);
    assert.equal(await text('#status'), 'Paused');
    await click('[data-language="de"]');
    assert.equal(await text('#status'), 'Pausiert');
    assert.equal(await text('#primary'), 'Fortsetzen');
    await click('[data-theme="dark"]');
    assert.equal(await text('#time'), frozen);
    assert.equal(await evaluate('document.documentElement.dataset.theme'), 'dark');
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('.brand-logo-dark')).display`), 'block');
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('.brand-logo-standard')).display`), 'none');
    if (process.env.EASYTIMER_SCREENSHOT_DIR) {
        const screenshot = await cdp('Page.captureScreenshot', { format: 'png' });
        const path = join(process.env.EASYTIMER_SCREENSHOT_DIR, 'easytimer-header-dark.png');
        await writeFile(path, Buffer.from(screenshot.data, 'base64'));
        console.log(`Screenshot: ${path}`);
    }
    await click('#primary');
    assert.equal(await text('#status'), 'Läuft');
    await click('#restart');
    assert.equal(await text('#time'), '00:05');
    assert.equal(await text('#status'), 'Läuft');
    await click('#stop');
    assert.equal(await text('#time'), '00:05');
    assert.equal(await text('#status'), 'Bereit');
    await configure(0,0,1);
    await click('#primary');
    await delay(1200);
    assert.equal(await text('#time'), '00:00');
    assert.equal(await text('#status'), 'Zeit abgelaufen');
    assert.equal(await evaluate(`document.querySelector('#overtime').hidden`), false);
    assert.match(await text('#overtime-time'), /^\+00:0[01]$/);
    assert.equal(await evaluate(`Array.from(document.querySelectorAll('[data-preset]')).every(b=>b.disabled)`),true);
    const overtimeBeforePreferences = await text('#overtime-time');
    await click('[data-language="en"]');
    assert.equal(await text('#status'), 'Time’s up');
    assert.equal(await text('.overtime-label'), 'Overtime');
    await click('[data-theme="light"]');
    assert.ok(await text('#overtime-time') >= overtimeBeforePreferences);
    assert.equal(await text('#primary'), 'Start again');
    await click('#primary');
    assert.equal(await text('#time'), '00:01');
    assert.equal(await evaluate(`document.querySelector('#overtime').hidden`), true);
    await click('#stop');
    // Emulate a tab whose callbacks cannot execute, then resume past its deadline.
    await configure(0,0,2);
    await click('#primary');
    await cdp('Page.setWebLifecycleState', { state: 'frozen' });
    await delay(3400);
    await cdp('Page.setWebLifecycleState', { state: 'active' });
    await cdp('Page.bringToFront');
    await delay(1200);
    assert.equal(await text('#time'), '00:00');
    assert.equal(await text('#status'), 'Time’s up');
    assert.equal(await evaluate(`document.querySelector('#overtime').hidden`), false);
    assert.ok(Number((await text('#overtime-time')).slice(-2)) >= 1);
    await click('[data-adjustment="30000"]');
    assert.equal(await text('#status'),'Running');
    assert.equal(await text('#time-budget'),'Total 00:32 · Planned 00:02 + 00:30');
    assert.ok(await evaluate(`parseFloat(document.querySelector('#progress').style.getPropertyValue('--remaining')) > 0`));
    await click('#restart');
    assert.equal(await evaluate(`document.querySelector('#overtime').hidden`), true);
    await click('#stop');
    await click('[data-theme="system"]');
    await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
    assert.equal(await evaluate('getComputedStyle(document.documentElement).colorScheme'), 'dark');
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('.brand-logo-dark')).display`), 'block');
    await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
    assert.equal(await evaluate('getComputedStyle(document.documentElement).colorScheme'), 'light');
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('.brand-logo-standard')).display`), 'block');
    await click('[data-theme="light"]');
    await click('[data-language="de"]');
    await cdp('Page.reload');
    await delay(500);
    assert.equal(await evaluate('document.documentElement.lang'), 'de');
    assert.equal(await evaluate('document.documentElement.dataset.theme'), 'light');
    await configure(99,59,59);
    for (const width of [320,390,1280]) {
        await cdp('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 500 });
        assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, `No horizontal overflow at ${width}px`);
        assert.equal(await evaluate(`Array.from(document.querySelectorAll('button')).filter(el=>el.getClientRects().length).every(el=>el.getBoundingClientRect().height>=44)`), true);
        assert.equal(await evaluate(`(()=>{const r=document.querySelector('#time').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth})()`), true);
        if(width===320) assert.ok(await evaluate(`new Set(Array.from(document.querySelectorAll('[data-preset]')).map(b=>b.getBoundingClientRect().top)).size`)>1,'Mobile presets wrap');
        if (process.env.EASYTIMER_SCREENSHOT_DIR) {
            const screenshot = await cdp('Page.captureScreenshot', { format: 'png' });
            const path = join(process.env.EASYTIMER_SCREENSHOT_DIR, `easytimer-${width}.png`);
            await writeFile(path, Buffer.from(screenshot.data, 'base64'));
            console.log(`Screenshot: ${path}`);
        }
    }
    await cdp('Emulation.setDeviceMetricsOverride', { width:393, height:852, deviceScaleFactor:3, mobile:true, screenOrientation:{type:'portraitPrimary',angle:0} });
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('#menu-toggle')).display`), 'grid');
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('#preferences')).display`), 'none');
    await click('#menu-toggle');
    assert.equal(await evaluate(`document.querySelector('#menu-toggle').getAttribute('aria-expanded')`), 'true');
    assert.equal(await evaluate(`(()=>{const header=document.querySelector('header').getBoundingClientRect();const preferences=document.querySelector('#preferences').getBoundingClientRect();return getComputedStyle(document.querySelector('#preferences')).display==='flex'&&preferences.top>=header.bottom&&preferences.left>=0&&preferences.right<=innerWidth})()`), true);
    if (process.env.EASYTIMER_SCREENSHOT_DIR) {
        const screenshot = await cdp('Page.captureScreenshot', { format:'png' });
        const path = join(process.env.EASYTIMER_SCREENSHOT_DIR, 'easytimer-iphone-menu.png');
        await writeFile(path,Buffer.from(screenshot.data,'base64'));
        console.log(`Screenshot: ${path}`);
    }
    await cdp('Input.dispatchKeyEvent', { type:'keyDown', key:'Escape', code:'Escape', windowsVirtualKeyCode:27 });
    assert.equal(await evaluate(`document.querySelector('#menu-toggle').getAttribute('aria-expanded')`), 'false');
    assert.equal(await evaluate(`document.activeElement === document.querySelector('#menu-toggle')`), true);
    await click('#primary');
    await click('#primary');
    const mobileFrozen = await text('#time');
    await click('#menu-toggle');
    await click('[data-theme="dark"]');
    await click('[data-language="en"]');
    assert.equal(await text('#time'), mobileFrozen);
    assert.equal(await text('#status'), 'Paused');
    await click('[data-language="de"]');
    await click('[data-theme="light"]');
    await cdp('Input.dispatchKeyEvent', { type:'keyDown', key:'Escape', code:'Escape', windowsVirtualKeyCode:27 });
    await click('#menu-toggle');
    await click('main');
    assert.equal(await evaluate(`document.querySelector('#menu-toggle').getAttribute('aria-expanded')`), 'false');
    await evaluate(`document.querySelector('#primary').focus()`);
    await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', text: '\r', unmodifiedText: '\r', windowsVirtualKeyCode: 13 });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await delay(100);
    assert.equal(await text('#status'), 'Läuft');
    // Presentation must preserve a paused timer exactly and a running deadline.
    await click('#primary');
    const presentationTime = await text('#time');
    await cdp('Emulation.clearDeviceMetricsOverride');
    await cdp('Page.bringToFront');
    await evaluate(`document.documentElement.requestFullscreen = async function(...args) {
        try { return await Element.prototype.requestFullscreen.apply(this,args); }
        catch(error) { window.fullscreenTestError = error.message; throw error; }
    }`);
    await click('#fullscreen');
    await cdp('Page.captureScreenshot', { format: 'png' });
    for (let i = 0; i < 60; i++) {
        if (await evaluate('document.body.classList.contains("presentation")')) break;
        await delay(100);
    }
    const nativeFullscreen = await evaluate('Boolean(document.fullscreenElement)');
    if (!nativeFullscreen) console.log(`SKIP: native fullscreen did not complete in this browser run (${await evaluate('window.fullscreenTestError || "request did not settle"')}); verifying fallback and API lifecycle separately.`);
    assert.equal(await evaluate('document.body.classList.contains("presentation")'), true);
    assert.equal(await evaluate('document.body.classList.contains("room-presentation")'), true);
    assert.equal(await evaluate(`Array.from(document.querySelectorAll('[data-adjustment]')).every(b=>b.getClientRects().length>0)`),true,'Additions visible in native/fallback fullscreen');
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('.presentation-brand')).display`), 'flex');
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('.presentation-brand')).opacity`), '0.94');
    assert.equal(await text('#time'), presentationTime);
    assert.equal(await evaluate(`document.querySelector('#fullscreen').getAttribute('aria-label')`), nativeFullscreen ? 'Vollbild verlassen' : 'Vergrößerte Ansicht verlassen');
    await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    for (let i=0;i<20;i++) {
        if (!await evaluate('document.body.classList.contains("room-presentation")')) break;
        await delay(100);
    }
    assert.equal(await evaluate('Boolean(document.fullscreenElement)'), false);
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('.presentation-brand')).display`), 'none');
    assert.equal(await text('#time'), presentationTime);
    // Exercise successful API lifecycle even on headless hosts that deny native fullscreen.
    await evaluate(`Object.defineProperty(document,'fullscreenElement',{configurable:true,get:()=>window.testFullscreenElement || null});
        Object.defineProperty(document,'fullscreenEnabled',{configurable:true,value:true});
        document.documentElement.requestFullscreen=async()=>{window.testFullscreenElement=document.documentElement;document.dispatchEvent(new Event('fullscreenchange'));};
        document.exitFullscreen=async()=>{window.testFullscreenElement=null;document.dispatchEvent(new Event('fullscreenchange'));};`);
    await click('#fullscreen');
    assert.equal(await evaluate(`document.querySelector('#fullscreen').getAttribute('aria-label')`), 'Vollbild verlassen');
    await click('#fullscreen');
    assert.equal(await evaluate('document.body.classList.contains("presentation")'), false);
    await evaluate('delete document.fullscreenElement; delete document.fullscreenEnabled; delete document.exitFullscreen');
    // Rejected or absent Fullscreen API uses a reversible full-viewport fallback.
    await evaluate(`document.documentElement.requestFullscreen = () => Promise.reject(new Error('Test denial'))`);
    await click('#fullscreen');
    await delay(100);
    assert.equal(await evaluate(`document.querySelector('#fullscreen').getAttribute('aria-label')`), 'Vergrößerte Ansicht verlassen');
    assert.equal(await evaluate('document.body.classList.contains("presentation")'), true);
    await click('#fullscreen');
    assert.equal(await evaluate('document.body.classList.contains("presentation")'), false);
    await evaluate(`Object.defineProperty(document, 'fullscreenEnabled', {value:false,configurable:true})`);
    await click('[data-language="en"]');
    assert.equal(await evaluate(`document.querySelector('#fullscreen').getAttribute('aria-label')`), 'Expand view');
    await click('#fullscreen');
    assert.equal(await evaluate(`document.querySelector('#fullscreen').getAttribute('aria-label')`), 'Exit expanded view');
    await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await delay(100);
    assert.equal(await evaluate('document.body.classList.contains("presentation")'), false);
    await evaluate(`delete document.fullscreenEnabled; delete document.documentElement.requestFullscreen`);
    await click('#stop');
    await configure(0,0,10);
    assert.equal(await evaluate(`document.querySelector('#progress').style.getPropertyValue('--remaining')`), '100%');
    await click('#primary');
    await delay(1100);
    await click('#primary');
    const progress = await evaluate(`parseFloat(document.querySelector('#progress').style.getPropertyValue('--remaining'))`);
    assert.ok(progress > 70 && progress < 95);
    const pausedTime = await text('#time');
    await cdp('Emulation.setTouchEmulationEnabled', { enabled: true });
    for (const [width,height] of [[852,393],[844,390],[667,375],[568,320]]) {
        await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor:1, mobile:true, screenOrientation:{type:'landscapePrimary',angle:90} });
        const screenshot = await cdp('Page.captureScreenshot', { format: 'png' });
        for (let i = 0; i < 30; i++) {
            if (await evaluate('document.body.classList.contains("presentation")')) break;
            await delay(100);
        }
        assert.equal(await evaluate('document.body.classList.contains("presentation")'), true, JSON.stringify(await evaluate(`({width:innerWidth,height:innerHeight,coarse:matchMedia('(pointer:coarse)').matches,landscape:matchMedia('(orientation:landscape)').matches})`)));
        assert.equal(await evaluate('document.body.classList.contains("room-presentation")'), false);
        assert.equal(await evaluate(`getComputedStyle(document.querySelector('.presentation-brand')).display`), 'none');
        assert.equal(await evaluate(`Array.from(document.querySelectorAll('[data-adjustment]')).every(b=>{const r=b.getBoundingClientRect();return r.height>=44&&r.left>=0&&r.right<=innerWidth&&r.bottom<document.querySelector('#time-budget').getBoundingClientRect().top})`),true,'Adjustments fit landscape');
        assert.equal(await evaluate(`(()=>{const a=document.querySelector('.actions').getBoundingClientRect();const d=document.querySelector('.duration-adjustments').getBoundingClientRect();return a.bottom<=d.top})()`),true,'Actions and adjustments do not overlap');
        assert.equal(await text('#time'), pausedTime);
        assert.equal(await evaluate(`parseFloat(document.querySelector('#progress').style.getPropertyValue('--remaining'))`), progress);
        assert.equal(await evaluate(`(()=>{const r=document.querySelector('#time').getBoundingClientRect();const a=document.querySelector('.actions').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=a.top})()`), true, `Digits fit at ${width}x${height}`);
        assert.equal(await evaluate(`(()=>{const r=document.querySelector('#time').getBoundingClientRect();return Math.abs((r.left+r.right)/2-innerWidth/2)<2})()`), true, `Digits are horizontally centered at ${width}x${height}`);
        if (process.env.EASYTIMER_SCREENSHOT_DIR && width === 852) {
            const path = join(process.env.EASYTIMER_SCREENSHOT_DIR, 'easytimer-iphone-landscape.png');
            await writeFile(path,Buffer.from(screenshot.data,'base64'));
            console.log(`Screenshot: ${path}`);
        }
    }
    await cdp('Emulation.setDeviceMetricsOverride', { width:390,height:844,deviceScaleFactor:1,mobile:true });
    await cdp('Page.captureScreenshot', { format: 'png' });
    for (let i=0;i<30;i++) {
        if (!await evaluate('document.body.classList.contains("presentation")')) break;
        await delay(100);
    }
    assert.equal(await evaluate('document.body.classList.contains("presentation")'), false);
    assert.equal(await text('#time'), pausedTime);
    await click('#primary');
    await click('#fullscreen');
    await delay(2500);
    assert.equal(await text('#status'), 'Running');
    assert.ok(Number((await text('#time')).split(':').at(-1)) < Number(pausedTime.split(':').at(-1)));
    await click('#fullscreen');
    await click('#stop');
    assert.equal(await text('#time'), '00:10');
    await configure(0,0,1);
    await click('#primary');
    for (let i=0;i<40;i++) {
        if (await text('#time') === '00:00') break;
        await delay(100);
    }
    assert.equal(await evaluate(`document.querySelector('#progress').style.getPropertyValue('--remaining')`), '0%');
    await click('#stop');
    await configure(99,59,59);
    if (await evaluate(`document.querySelector('#fullscreen').getAttribute('aria-pressed') === 'true'`)) await click('#fullscreen');
    for (let i=0;i<40;i++) {
        if (await evaluate(`document.querySelector('#fullscreen').getAttribute('aria-pressed') === 'false'`)) break;
        await cdp('Page.captureScreenshot', {format:'png'});
        await delay(100);
    }
    assert.equal(await evaluate(`document.querySelector('#fullscreen').getAttribute('aria-pressed')`), 'false');
    await evaluate(`Object.defineProperty(document, 'fullscreenEnabled', {value:false,configurable:true})`);
    await click('#fullscreen');
    await delay(100);
    assert.equal(await evaluate(`document.querySelector('#fullscreen').getAttribute('aria-pressed')`), 'true');
    for (const [width,height] of [[1920,1080],[568,320],[390,844]]) {
        await cdp('Emulation.setDeviceMetricsOverride', {width,height,deviceScaleFactor:1,mobile:width<1000});
        const screenshot = await cdp('Page.captureScreenshot', {format:'png'});
        assert.equal(await evaluate('document.body.classList.contains("presentation")'),true);
        assert.equal(await evaluate(`document.querySelector('.duration-config').getClientRects().length>0`),true,'READY presets visible in expanded view');
        assert.equal(await evaluate(`(()=>{const p=document.querySelector('.duration-config').getBoundingClientRect();const t=document.querySelector('#time').getBoundingClientRect();const a=document.querySelector('.actions').getBoundingClientRect();return p.top>=t.bottom&&p.bottom<=a.top&&p.left>=0&&p.right<=innerWidth})()`),true,'READY presets fit between readout and actions');
        const readyTop = await evaluate(`document.querySelector('#time').getBoundingClientRect().top`);
        await click('#primary');
        assert.equal(await evaluate(`document.querySelector('.duration-config').getClientRects().length`),0,'Running presets hidden');
        assert.ok(Math.abs(await evaluate(`document.querySelector('#time').getBoundingClientRect().top`)-readyTop)<1,'Room readout stable on Start');
        await click('#primary');
        assert.equal(await evaluate(`document.querySelector('.duration-config').getClientRects().length`),0,'Paused presets hidden');
        await click('#restart');
        assert.equal(await evaluate(`document.querySelector('.duration-config').getClientRects().length`),0,'Restart keeps presets hidden');
        await click('#stop');
        assert.equal(await evaluate(`document.querySelector('.duration-config').getClientRects().length>0`),true,'Stop restores room presets');
        assert.equal(await evaluate(`Array.from(document.querySelectorAll('[data-adjustment]')).every(b=>b.getClientRects().length>0)`),true,'All additions visible in expanded view');
        assert.equal(await evaluate(`(()=>{const b=document.querySelector('#time-budget').getBoundingClientRect();const d=document.querySelector('.duration-adjustments').getBoundingClientRect();return d.bottom<=b.top&&b.bottom<innerHeight-5})()`),true,'Budget line fits above progress and below additions');
        assert.equal(await evaluate(`(()=>{const r=document.querySelector('#time').getBoundingClientRect();const a=document.querySelector('.actions').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=a.top})()`),true,`Long duration fits at ${width}x${height}`);
        if (process.env.EASYTIMER_SCREENSHOT_DIR) {
            const path = join(process.env.EASYTIMER_SCREENSHOT_DIR, `easytimer-presentation-${width}.png`);
            await writeFile(path,Buffer.from(screenshot.data,'base64'));
            console.log(`Screenshot: ${path}`);
        }
    }
    await click('#fullscreen');
    await configure(0,0,1);
    await click('#primary');
    await delay(2100);
    const overtimeBeforePresentation = await text('#overtime-time');
    await click('#fullscreen');
    await delay(100);
    assert.equal(await evaluate('document.body.classList.contains("presentation")'),true);
    assert.equal(await evaluate(`document.querySelector('#overtime').hidden`),false);
    assert.equal(await evaluate(`document.querySelector('.duration-config').getClientRects().length`),0,'Overtime presets hidden in presentation');
    assert.ok(await text('#overtime-time') >= overtimeBeforePresentation);
    assert.equal(await evaluate(`(()=>{const r=document.querySelector('#overtime').getBoundingClientRect();const t=document.querySelector('#time').getBoundingClientRect();const a=document.querySelector('.actions').getBoundingClientRect();return r.top>=t.bottom&&r.bottom<=a.top&&r.left>=0&&r.right<=innerWidth})()`),true,'Overtime fits presentation view');
    await cdp('Emulation.setDeviceMetricsOverride', {width:568,height:320,deviceScaleFactor:1,mobile:true,screenOrientation:{type:'landscapePrimary',angle:90}});
    assert.equal(await evaluate(`(()=>{const r=document.querySelector('#overtime').getBoundingClientRect();const t=document.querySelector('#time').getBoundingClientRect();const a=document.querySelector('.actions').getBoundingClientRect();return r.top>=t.bottom&&r.bottom<=a.top&&r.left>=0&&r.right<=innerWidth})()`),true,'Overtime fits mobile landscape presentation');
    if (process.env.EASYTIMER_SCREENSHOT_DIR) {
        const screenshot = await cdp('Page.captureScreenshot', {format:'png'});
        await writeFile(join(process.env.EASYTIMER_SCREENSHOT_DIR,'easytimer-overtime-landscape.png'),Buffer.from(screenshot.data,'base64'));
    }
    await click('[data-language="de"]');
    assert.equal(await text('.overtime-label'),'Überzeit');
    assert.equal(await evaluate(`document.querySelector('#overtime').hidden`),false);
    await click('[data-adjustment="300000"]');
    assert.equal(await text('#status'),'Läuft');
    assert.equal(await text('#time-budget'),'Gesamt 05:01 · Geplant 00:01 + 05:00');
    assert.equal(await evaluate(`(()=>{const b=document.querySelector('#time-budget').getBoundingClientRect();const a=document.querySelector('.duration-adjustments').getBoundingClientRect();return b.top>=a.bottom&&b.bottom<innerHeight-5})()`),true,'Extended budget fits short landscape');
    await click('#stop');
    assert.equal(await evaluate(`document.querySelector('#overtime').hidden`),true);
    await cdp('Network.enable');
    await cdp('Network.emulateNetworkConditions', { offline:true, latency:0, downloadThroughput:0, uploadThroughput:0 });
    await cdp('Page.reload');
    for (let i=0;i<100;i++) {
        if (await evaluate(`document.querySelector('#primary')?.title?.length > 0`)) break;
        await delay(50);
    }
    assert.equal(await text('#time'), '05:00');
    assert.equal(await evaluate('Boolean(navigator.serviceWorker.controller)'), true);
    await cdp('Network.emulateNetworkConditions', { offline:false, latency:0, downloadThroughput:-1, uploadThroughput:-1 });
    assert.equal(errors.length, 0, JSON.stringify(errors));
    console.log('PASS: preset chips, action icons, universal additions, planned/extended budget, limit feedback, PWA offline reload, countdown and overtime regression, frozen-tab timing, DE/EN, themes, keyboard, responsive geometry, fullscreen lifecycle/fallback, landscape and progress.');
    await cdp('Browser.close');
} finally {
    socket?.close();
    browser.kill();
    server.close();
    await delay(500);
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(error => console.warn(`Temporary browser profile retained: ${profile}: ${error.message}`));
}
