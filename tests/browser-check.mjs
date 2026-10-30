import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, extname } from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { checkPlanner } from './planner-browser.mjs';
import { checkSession } from './session-browser.mjs';
import { checkTimeVisuals } from './time-visuals-browser.mjs';
import { checkClockView } from './clock-view-browser.mjs';
import { checkAutomaticSession } from './automatic-session-browser.mjs';
import { checkMenuPolish } from './menu-browser.mjs';
import { checkRundownEntry } from './rundown-entry-browser.mjs';
import { checkDirectLaunch } from './direct-launch-browser.mjs';
import { checkRecovery, checkRecoveryCorrections } from './recovery-browser.mjs';
import { checkSessionRecovery } from './session-recovery-browser.mjs';
import { checkNavigation } from './navigation-browser.mjs';
import { checkSubtraction } from './subtraction-browser.mjs';
import { configureQuickTimebox } from './quick-timebox.mjs';
import { checkTimeboxControls } from './timebox-browser.mjs';
import { checkSessionNavigation } from './session-navigation-browser.mjs';
import { checkPortability } from './portability-browser.mjs';
import { parseTimeTravelOptions, runTimeTravel, timeTravelHelp } from './time-travel.mjs';

const timeTravelOptions=parseTimeTravelOptions(process.argv.slice(2));
if(timeTravelOptions.help||timeTravelOptions.list) {console.log(timeTravelHelp());process.exit(0);}

const root = resolve(process.env.EASYTIMER_WEB_ROOT || 'src');
const server = createServer(async (req, res) => {
    try {
        const requestPath = new URL(req.url, 'http://localhost').pathname;
        const path = resolve(root, '.' + (requestPath === '/' ? '/index.html' : requestPath));
        if (!path.startsWith(root + '/') && !path.startsWith(root + '\\')) throw new Error('Invalid path');
        const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
        res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'text/plain' });
        // A previous service worker may still serve stale files at unversioned URLs.
        if (!new URL(req.url, 'http://localhost').searchParams.has('v')) {
            if (requestPath === '/js/app.js') return res.end('throw new Error("Stale unversioned app resource loaded");');
            if (requestPath === '/js/timer.mjs') return res.end('throw new Error("Stale unversioned timer resource loaded");');
            if (requestPath === '/css/styles.css') return res.end('#preferences { display:none !important; }');
        }
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
const errors = [];
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
    const click = selector => evaluate(`(()=>{const target=document.querySelector(${JSON.stringify(selector)});const preference=target.closest('#preferences');const wasHidden=preference?.hidden;if(wasHidden)document.querySelector('#menu-toggle').click();target.click();if(wasHidden)document.querySelector('#menu-toggle').click();})()`);
    const text = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).textContent`);
    async function reloadReady(expectedMode = 'quick') {
        const origin = await evaluate('performance.timeOrigin');
        await cdp('Page.reload');
        for (let i = 0; i < 100; i++) {
            if (await evaluate(`performance.timeOrigin !== ${origin} && document.body?.dataset.mode === ${JSON.stringify(expectedMode)} && Boolean(document.querySelector('#primary')?.title)`)) return;
            await delay(50);
        }
        assert.fail('Reloaded application did not initialize in expected mode: ' + expectedMode);
    }
    async function checkTitle(state) {
        const { title, time, overtime } = await evaluate(`({title:document.title,time:document.querySelector('#time').textContent,overtime:document.querySelector('#time').textContent})`);
        const expected = state === 'READY' ? 'easyTimer' : `${state === 'FINISHED' ? overtime : time}${state === 'PAUSED' ? ' ⏸' : ''} · easyTimer`;
        assert.equal(title,expected,`Title matches ${state}`);
    }
    async function configure(h, m, s) {
        await configureQuickTimebox(evaluate, (h * 3600 + m * 60 + s) * 1000);
    }
    async function checkMenu(state) {
        const before=await evaluate(`({status:document.querySelector('#status').textContent,time:document.querySelector('#time').textContent,budget:document.querySelector('#time-budget').textContent,presentation:document.body.classList.contains('presentation')})`);
        assert.equal(await evaluate(`document.querySelectorAll('#menu-toggle').length===1&&document.querySelectorAll('#preferences').length===1&&document.querySelectorAll('button[data-language]').length===2&&document.querySelectorAll('button[data-theme]').length===3`),true,'One shared menu and preferences');
        const point=await evaluate(`(()=>{const button=document.querySelector('#menu-toggle');const r=button.getBoundingClientRect();const x=r.left+r.width/2,y=r.top+r.height/2;return {x,y,hit:button.contains(document.elementFromPoint(x,y)),touch:matchMedia('(pointer:coarse)').matches&&!document.fullscreenElement}})()`);
        assert.equal(point.hit,true,'Menu is hit-testable at its visible center');
        if(point.touch) {
            // Send the complete tap before waiting for compositor acknowledgements.
            await Promise.all([
                cdp('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:point.x,y:point.y}]}),
                cdp('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}),
                cdp('Page.captureScreenshot',{format:'png'}),
            ]);
            await delay(100);
        } else {
            await cdp('Input.dispatchMouseEvent',{type:'mousePressed',x:point.x,y:point.y,button:'left',clickCount:1});
            await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x,y:point.y,button:'left',clickCount:1});
        }
        const geometry=await evaluate(`(()=>{const trigger=document.querySelector('#menu-toggle').getBoundingClientRect();const panel=document.querySelector('#preferences').getBoundingClientRect();const fullscreen=document.querySelector('#fullscreen').getBoundingClientRect();return {expanded:document.querySelector('#menu-toggle').getAttribute('aria-expanded'),visible:!document.querySelector('#preferences').hidden,triggerFits:trigger.width>=44&&trigger.height>=44&&trigger.left>=0&&trigger.top>=0&&trigger.right<=innerWidth&&trigger.bottom<=innerHeight,panelFits:panel.left>=0&&panel.right<=innerWidth&&panel.top>=trigger.bottom&&panel.bottom<=innerHeight,noCollision:trigger.right<=fullscreen.left||fullscreen.right<=trigger.left||trigger.bottom<=fullscreen.top||fullscreen.bottom<=trigger.top}})()`);
        assert.ok(geometry.expanded==='true'&&geometry.visible&&geometry.triggerFits&&geometry.panelFits&&geometry.noCollision,JSON.stringify(geometry));
        assert.equal(await evaluate(`(()=>{const quick=document.querySelector('#open-quick'),session=document.querySelector('#open-session'),group=quick.parentElement;return !quick.hidden&&!session.hidden&&group===session.parentElement&&group.getAttribute('role')==='group'&&group.getAttribute('aria-labelledby')==='mode-heading'&&quick.getAttribute('aria-pressed')===String(document.body.dataset.mode==='quick')&&session.getAttribute('aria-pressed')===String(document.body.dataset.mode==='session')&&!group.contains(document.querySelector('#open-planner'))&&[quick,session].every(b=>b.querySelector('svg[aria-hidden="true"]')&&b.textContent.trim());})()`),true,'Two visible modes expose one active selection; Planner remains a separate tool');
        if(process.env.EASYTIMER_SCREENSHOT_DIR&&state==='PAUSED') {
            const view=await evaluate(`innerWidth+'-'+(document.body.classList.contains('presentation')?'presentation':'standard')`);
            const screenshot=await cdp('Page.captureScreenshot',{format:'png'});
            await writeFile(join(process.env.EASYTIMER_SCREENSHOT_DIR,`universal-menu-${view}.png`),Buffer.from(screenshot.data,'base64'));
        }
        await evaluate(`document.querySelector('#menu-toggle').focus()`);
        await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
        await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
        assert.equal(await evaluate(`document.activeElement===document.querySelector('#open-quick')`),true,'Tab reaches Quick Timer mode choice first');
        await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
        await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
        assert.equal(await evaluate(`document.activeElement===document.querySelector('#open-session')`),true,'Tab reaches Session Timer mode choice next');
        await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
        await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
        assert.equal(await evaluate(`document.activeElement===document.querySelector('#open-planner')&&getComputedStyle(document.activeElement).outlineStyle!=='none'`),true,'Planner follows modes with visible keyboard focus');
        await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
        assert.equal(await evaluate(`document.querySelector('#preferences').hidden&&document.activeElement===document.querySelector('#menu-toggle')`),true,'Escape closes menu and restores focus');
        assert.equal(await evaluate(`document.body.classList.contains('presentation')`),before.presentation,'Menu Escape preserves presentation');
        await click('#menu-toggle');
        await evaluate(`document.querySelector('[data-theme="system"]').focus()`);
        await click('main');
        assert.equal(await evaluate(`document.querySelector('#preferences').hidden&&document.activeElement===document.querySelector('#menu-toggle')`),true,'Outside close never leaves focus hidden');
        assert.equal(await text('#status'),before.status,'Menu preserves timer state');
        assert.equal(await text('#time-budget'),before.budget,'Menu preserves budget');
        if(state==='READY'||state==='PAUSED') assert.equal(await text('#time'),before.time,'Menu preserves frozen time');
    }
    await cdp('Runtime.enable');
    await cdp('Page.enable');
    await cdp('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` });
    for (let i = 0; i < 100; i++) {
        if (await evaluate(`document.querySelector('#primary')?.title?.length > 0`)) break;
        await delay(50);
    }
    if(timeTravelOptions.names.length) {
        await runTimeTravel({evaluate,click,text,cdp,configure},timeTravelOptions);
        assert.equal(errors.length,0,JSON.stringify(errors));
    } else if (process.env.EASYTIMER_UX011_ONLY === '1') {
        await checkSessionNavigation({evaluate,click,text,cdp,configure});
        assert.equal(errors.length,0,JSON.stringify(errors));
    } else {
    assert.equal(await text('#time'), '00:00');
    await checkTimeboxControls({ evaluate, click, text, cdp, configure });
    await checkRecovery({ evaluate, click, text, cdp, configure });
    await checkRecoveryCorrections({ evaluate, click, text, cdp, configure });
    await checkSessionRecovery({ evaluate, click, text, cdp });
    await checkNavigation({ evaluate, click, text, cdp });
    await checkSubtraction({ evaluate, click, text, cdp, configure });
    await checkTitle('READY');
    assert.equal(await evaluate("document.getElementById('account-toggle')"), null, 'Normal application has no Google account control');
    assert.equal(await evaluate("document.getElementById('account-menu-entry')"), null, 'Normal application has no development Drive menu entry');
    assert.equal((await text('footer')).replace(/\uFE0E/g,''),'Crafted with ♥ by Roland B. Seper | rbsnet.at © 2026');
    assert.deepEqual(await evaluate(`Array.from(document.querySelectorAll('footer a')).map(a=>({href:a.getAttribute('href'),target:a.target,rel:a.rel}))`),[{href:'https://rolandseper.at',target:'_blank',rel:'noopener noreferrer'},{href:'https://rbsnet.at',target:'_blank',rel:'noopener noreferrer'}]);
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('.footer-heart')).color===getComputedStyle(document.querySelector('footer')).color&&document.querySelector('.footer-heart').textContent.includes('\uFE0E')`),true,'Monochrome Unicode heart follows the footer text color');
    assert.equal(await evaluate(`(()=>{const css=document.querySelector('link[rel="stylesheet"]').getAttribute('href');const js=document.querySelector('script[type="module"]').getAttribute('src');return css==='css/styles.css?v=62'&&js==='js/app.js?v=62'})()`),true,'New HTML bypasses stale unversioned app resources');
    assert.equal(await evaluate(`fetch('service-worker.js').then(r=>r.text()).then(source=>Object.entries({'styles.css':'62','app.js':'62','info.js':'59','header.mjs':'59','recovery.mjs':'54','planner.js':'55','templates.mjs':'37','timer.mjs':'54','session.mjs':'54','time-visuals.mjs':'54','portability.mjs':'37'}).every(([file,version])=>source.includes(file+'?v='+version)))`),true,'Worker precaches matching versioned resources including information pages, recovery, the engine, Session and shared visual helper');
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('.presentation-brand')).display`), 'none');
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('#menu-toggle')).display`), 'grid');
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('#preferences')).display`), 'none');
    await checkMenu('READY');
    await click('#menu-toggle'); await click('#open-session');
    assert.equal(await evaluate(`document.querySelector('#open-session').getAttribute('aria-pressed')==='true'&&document.querySelector('#open-quick').getAttribute('aria-pressed')==='false'`),true,'Session picker marks Session active');
    await click('#menu-toggle'); await click('#open-planner');
    assert.equal(await evaluate(`!document.querySelector('#planner').hidden&&document.querySelector('#open-session').getAttribute('aria-pressed')==='true'&&!document.querySelector('#open-planner').hasAttribute('aria-pressed')`),true,'Planner does not become a third mode');
    await click('.planner-back'); await click('#menu-toggle'); await click('#open-quick');
    assert.equal(await text('#time'),'05:00'); await checkTitle('READY');
    await checkMenuPolish({evaluate,click,text,cdp});
    await checkRundownEntry({evaluate,click,text,cdp});
    await checkDirectLaunch({evaluate,click,text,cdp});
    await checkSessionNavigation({evaluate,click,text,cdp,configure});
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
    // An open menu remains anchored and usable across responsive changes.
    await click('#menu-toggle');
    for(const [width,height] of [[1920,1080],[1280,720],[1024,768],[844,390],[667,375],[390,844],[320,568],[568,240]]) {
        await cdp('Emulation.setTouchEmulationEnabled',{enabled:width<900});
        await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<900,screenOrientation:{type:width>height?'landscapePrimary':'portraitPrimary',angle:width>height?90:0}});
        await cdp('Page.captureScreenshot',{format:'png'});
        assert.equal(await evaluate(`(()=>{const p=document.querySelector('#preferences').getBoundingClientRect();return !document.querySelector('#preferences').hidden&&p.left>=0&&p.top>=0&&p.right<=innerWidth&&p.bottom<=innerHeight})()`),true,'Open menu survives resize/rotation without clipping');
        assert.equal(await evaluate(`Array.from(document.querySelectorAll('#preferences button:not([hidden])')).every(b=>{const r=b.getBoundingClientRect();return r.width>=44&&r.height>=44})`),true,'Visible preferences retain touch targets');
        for(const language of ['de','en'])for(const theme of ['light','dark','system']) {
            await click(`[data-language="${language}"]`);await click(`[data-theme="${theme}"]`);
            assert.equal(await text('#mode-heading'),language==='de'?'Modus':'Mode');
            assert.equal(await evaluate(`(()=>{const q=document.querySelector('#open-quick').getBoundingClientRect(),s=document.querySelector('#open-session').getBoundingClientRect(),p=document.querySelector('#open-planner').getBoundingClientRect(),g=document.querySelector('#preferences');return Math.abs(q.top-s.top)<1&&Math.abs(q.width-s.width)<1&&q.right<=s.left&&q.height>p.height&&s.bottom<p.top&&g.scrollWidth<=g.clientWidth;})()`),true,'Equal mode tiles stay side by side above the separate Planner without horizontal overflow');
            if(process.env.EASYTIMER_SCREENSHOT_DIR&&['light','dark'].includes(theme)&&[1280,320,667].includes(width)) {
                await evaluate(`document.querySelector('#preferences').scrollTop=0`);
                const shot=await cdp('Page.captureScreenshot',{format:'png'});
                await writeFile(join(process.env.EASYTIMER_SCREENSHOT_DIR,`menu-hierarchy-${width}-${language}-${theme}.png`),Buffer.from(shot.data,'base64'));
            }
        }
        await checkTitle('READY');
    }
    await click('#menu-toggle');
    await cdp('Emulation.setTouchEmulationEnabled',{enabled:false});
    await cdp('Emulation.clearDeviceMetricsOverride');
    await cdp('Emulation.setDeviceMetricsOverride', {width:1280,height:720,deviceScaleFactor:1,mobile:false});
    await cdp('Page.captureScreenshot',{format:'png'});
    const shortPageDock = await evaluate(`(()=>{
        const dock=document.querySelector('.bottom-dock').getBoundingClientRect();
        const footer=document.querySelector('footer').getBoundingClientRect();
        return {footerVisible:footer.top<innerHeight&&footer.bottom<=innerHeight+1,dockAboveFooter:dock.bottom<=footer.top+1,scrollHeight:document.documentElement.scrollHeight};
    })()`);
    assert.equal(shortPageDock.footerVisible,true,'Compact footer is visible on a short standard page');
    assert.equal(shortPageDock.dockAboveFooter,true,'Dock remains directly above the footer');
    await evaluate(`(()=>{const spacer=document.createElement('div');spacer.id='dock-test-spacer';spacer.style.height='180vh';spacer.setAttribute('aria-hidden','true');document.querySelector('main').append(spacer);window.scrollTo(0,0);})()`);
    await delay(50);
    const pinnedDock = await evaluate(`(()=>{
        const dock=document.querySelector('.bottom-dock').getBoundingClientRect();
        const budget=document.querySelector('#time-budget').getBoundingClientRect();
        const progress=document.querySelector('#progress').getBoundingClientRect();
        const marker=document.querySelector('.progress-marker').getBoundingClientRect();
        const footer=document.querySelector('footer').getBoundingClientRect();
        return {footerBelow:footer.top>innerHeight,dockBottom:dock.bottom,viewportBottom:innerHeight,budgetAboveProgress:budget.bottom<=progress.top+1,
            progressHeight:progress.height,progressInset:progress.left>=11&&progress.right<=innerWidth-11,
            markerWithin:marker.left>=progress.left-1&&marker.right<=progress.right+1,
            progressRadius:parseFloat(getComputedStyle(document.querySelector('#progress')).borderTopLeftRadius),overflow:document.documentElement.scrollWidth>innerWidth};
    })()`);
    assert.equal(pinnedDock.footerBelow,true,'Long page keeps the footer below the viewport');
    assert.ok(Math.abs(pinnedDock.dockBottom-pinnedDock.viewportBottom)<2,'Sticky dock stays at the visible bottom edge');
    assert.equal(pinnedDock.budgetAboveProgress,true,'Budget remains above the progress strip');
    assert.equal(pinnedDock.progressHeight,5,'Progress strip remains five pixels high');
    assert.equal(pinnedDock.progressInset,true,'Progress strip has a horizontal inset');
    assert.equal(pinnedDock.markerWithin,true,'Progress marker stays within the inset strip at 100%');
    assert.ok(pinnedDock.progressRadius>=2,'Progress strip has rounded ends');
    assert.equal(pinnedDock.overflow,false,'Dock does not cause horizontal overflow');
    await evaluate('window.scrollTo(0,document.documentElement.scrollHeight)');
    await delay(50);
    const dockAtFooter = await evaluate(`(()=>{
        const dock=document.querySelector('.bottom-dock').getBoundingClientRect();
        const footer=document.querySelector('footer').getBoundingClientRect();
        return {touching:Math.abs(dock.bottom-footer.top)<2,footerVisible:footer.top<innerHeight&&footer.bottom<=innerHeight+1};
    })()`);
    assert.equal(dockAtFooter.touching,true,'Dock settles directly above the footer at page end');
    assert.equal(dockAtFooter.footerVisible,true,'Footer remains visible and reachable');
    await evaluate(`document.querySelector('#dock-test-spacer').remove();window.scrollTo(0,0)`);
    await cdp('Emulation.clearDeviceMetricsOverride');
    // Screen dimensions remain independent of viewport dimensions in tablet split view.
    await evaluate(`window.stageRealNow=Date.now;window.stageNow=Date.now();Date.now=()=>window.stageNow`);
    for(const profile of [
        {width:1920,height:1080,screenWidth:1920,screenHeight:1080,touch:false,phone:false},
        {width:1280,height:720,screenWidth:1920,screenHeight:1080,touch:false,phone:false},
        {width:500,height:720,screenWidth:1920,screenHeight:1080,touch:false,phone:false},
        {width:768,height:1024,screenWidth:768,screenHeight:1024,touch:true,phone:false},
        {width:1024,height:768,screenWidth:1024,screenHeight:768,touch:true,phone:false},
        {width:667,height:320,screenWidth:1024,screenHeight:768,touch:true,phone:false},
        {width:390,height:600,screenWidth:768,screenHeight:1024,touch:true,phone:false},
        {width:390,height:844,screenWidth:390,screenHeight:844,touch:true,phone:true},
        {width:320,height:568,screenWidth:320,screenHeight:568,touch:true,phone:true},
        {width:844,height:390,screenWidth:844,screenHeight:390,touch:true,phone:true},
        {width:667,height:375,screenWidth:667,screenHeight:375,touch:true,phone:true},
        {width:667,height:320,screenWidth:667,screenHeight:375,touch:true,phone:true},
    ]) {
        const {width,height,screenWidth,screenHeight,touch,phone}=profile;
        await cdp('Emulation.setTouchEmulationEnabled',{enabled:touch});
        await cdp('Emulation.setDeviceMetricsOverride',{width,height,screenWidth,screenHeight,deviceScaleFactor:1,mobile:phone,screenOrientation:{type:width>height?'landscapePrimary':'portraitPrimary',angle:width>height?90:0}});
        await cdp('Page.captureScreenshot',{format:'png'});
        await configure(1,0,0);
        let readySize;
        for(const state of ['READY','RUNNING','PAUSED','FINISHED']) {
            if(state==='RUNNING'||state==='PAUSED') await click('#primary');
            if(state==='FINISHED') {
                await click('#primary');
                await evaluate(`window.stageNow+=3665000;document.dispatchEvent(new Event('visibilitychange'))`);
            }
            const expectedPresentation=phone&&width>height;
            const stage=await evaluate(`(()=>{const r=document.querySelector('#time').getBoundingClientRect();const s=document.querySelector('.timer-stage').getBoundingClientRect();return {device:document.body.dataset.device,presentation:document.body.classList.contains('presentation'),brand:getComputedStyle(document.querySelector('.presentation-brand')).display!=='none',header:getComputedStyle(document.querySelector('header')).display!=='none',toggle:document.querySelector('#fullscreen').getClientRects().length>0,presets:document.querySelector('.duration-config').getClientRects().length>0,font:parseFloat(getComputedStyle(document.querySelector('#time')).fontSize),fits:r.left>=0&&r.right<=innerWidth&&r.top>=s.top-1&&r.bottom<=s.bottom+1,centered:Math.abs((r.left+r.right)/2-(s.left+s.right)/2)<1,overflow:document.documentElement.scrollWidth>innerWidth}})()`);
            assert.equal(stage.device,phone?'smartphone':'desktop-tablet');
            assert.equal(stage.presentation,expectedPresentation,JSON.stringify(profile));
            assert.equal(stage.brand,expectedPresentation);
            assert.equal(stage.header,!expectedPresentation);
            assert.equal(stage.toggle,!phone,'Only desktop/tablet exposes Presentation');
            assert.equal(stage.presets,state==='READY');
            assert.ok(stage.fits&&stage.centered&&!stage.overflow&&stage.font>=32,JSON.stringify({profile,state,stage}));
            if(expectedPresentation) assert.equal(await evaluate('document.documentElement.scrollHeight<=innerHeight+1'),true,'Supported phone landscape needs no vertical scrolling');
            if(state==='READY') readySize=stage.font;
            if(state==='RUNNING'&&expectedPresentation) assert.ok(stage.font>=readySize,'Active timer uses space freed by presets');
            if(process.env.EASYTIMER_SCREENSHOT_DIR) {
                const screenshot=await cdp('Page.captureScreenshot',{format:'png'});
                await writeFile(join(process.env.EASYTIMER_SCREENSHOT_DIR,`stage-${phone?'phone':'desktop-tablet'}-${width}-${height}-${state}.png`),Buffer.from(screenshot.data,'base64'));
            }
            await checkTitle(state);
            if(state==='PAUSED') {
                await checkMenu('PAUSED');
                if(!phone) {
                    await evaluate(`document.documentElement.requestFullscreen=()=>Promise.reject(new Error('Stage fallback test'))`);
                    await click('#fullscreen');
                    assert.equal(await evaluate('document.body.classList.contains("presentation")'),true);
                    assert.equal(await evaluate(`(()=>{const e=document.querySelector('#fullscreen').getBoundingClientRect();const m=document.querySelector('#menu-toggle').getBoundingClientRect();return e.width>=44&&e.right<=m.left})()`),true,'Desktop/tablet exit remains left of hamburger');
                    await checkMenu('PAUSED');
                    await click('#fullscreen');
                    assert.equal(await evaluate('document.body.classList.contains("presentation")'),false);
                    await evaluate('delete document.documentElement.requestFullscreen');
                } else {
                    await click('#fullscreen');
                    assert.equal(await evaluate('Boolean(document.fullscreenElement)'),false,'Phone never requests native fullscreen');
                }
            }
        }
        await click('#stop');
    }
    await configure(0,5,0);
    await click('#primary');
    await click('[data-adjustment="30000"]');
    for(const overtime of [false,true]) {
        if(overtime) await evaluate(`window.stageNow+=333000;document.dispatchEvent(new Event('visibilitychange'))`);
        const preserved=await evaluate(`({time:document.querySelector('#time').textContent,overtime:document.querySelector('#time').textContent,title:document.title,budget:document.querySelector('#time-budget').textContent,status:document.querySelector('#status').textContent})`);
        for(const profile of [
            {width:390,height:844,screenWidth:390,screenHeight:844},
            {width:844,height:390,screenWidth:844,screenHeight:390},
            {width:667,height:320,screenWidth:1024,screenHeight:768},
        ]) {
            await cdp('Emulation.setDeviceMetricsOverride',{...profile,deviceScaleFactor:1,mobile:true});
            await cdp('Page.captureScreenshot',{format:'png'});
            if(profile.screenWidth===1024) {
                await evaluate(`document.documentElement.requestFullscreen=()=>Promise.reject(new Error('Running fallback test'))`);
                await click('#fullscreen');
                await checkMenu(overtime?'FINISHED':'RUNNING');
                await click('#fullscreen');
                await evaluate('delete document.documentElement.requestFullscreen');
            }
            assert.deepEqual(await evaluate(`({time:document.querySelector('#time').textContent,overtime:document.querySelector('#time').textContent,title:document.title,budget:document.querySelector('#time-budget').textContent,status:document.querySelector('#status').textContent})`),preserved,'Rotation, tablet split view and presentation preserve the exact active clock and additions');
        }
    }
    assert.equal(await text('#time'),'+00:03');
    await click('#stop');
    await evaluate('Date.now=window.stageRealNow;delete window.stageRealNow;delete window.stageNow');
    await cdp('Emulation.setTouchEmulationEnabled',{enabled:false});
    await cdp('Emulation.clearDeviceMetricsOverride');
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
                assert.ok(Math.abs(await evaluate(`document.querySelector('#time').getBoundingClientRect().top`) - top)<180,`Deliberate readout transition at ${width}px (${label})`);
                assert.equal(await evaluate(`Array.from(document.querySelectorAll('${ready ? '[data-preset], #reset-timebox' : '[data-adjustment]'}')).every(b=>{const r=b.getBoundingClientRect();return !b.disabled&&r.height>=44&&r.left>=0&&r.right<=innerWidth})`),true);
            }
            const labels = language === 'de' ? ['Timebox ergänzen','Restzeit verlängern','Timebox verlängern'] : ['Add to Timebox','Extend remaining time','Extend Timebox'];
            await checkContext(true,labels[0]);
            await click('#primary');
            await checkContext(false,labels[1]);
            await click('#primary');
            await checkContext(false,labels[1]);
            await click('#stop');
    await click('#primary');
            await checkContext(false,labels[1]);
            await delay(1200);
            await checkContext(false,labels[2]);
            await click('#stop');
            await checkContext(true,labels[0]);
        }
    }
    await cdp('Emulation.clearDeviceMetricsOverride');
    assert.equal(await evaluate(`document.querySelector('#restart')`),null,'No dedicated Restart UI');
    // Width-based controls use the same handlers in standard and automatic landscape views.
    for (const [width,height] of [[1920,1080],[1280,720],[1024,768],[844,390],[667,375],[390,844],[320,568],[568,320],[568,240]]) {
        await cdp('Emulation.setTouchEmulationEnabled',{enabled:width<900});
        await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<900,screenOrientation:{type:width>height?'landscapePrimary':'portraitPrimary',angle:width>height?90:0}});
        await cdp('Page.captureScreenshot',{format:'png'});
        for (const language of ['de','en']) {
            await click(`[data-language="${language}"]`);
            await configure(1,0,0);
            for (const state of ['READY','RUNNING','PAUSED']) {
                if (state !== 'READY') await click('#primary');
                await checkMenu(state);
                if(height<280) {
                    await evaluate('window.scrollTo(0,document.documentElement.scrollHeight)');
                    await cdp('Page.captureScreenshot',{format:'png'});
                }
                const geometry = await evaluate(`(()=>{
                    const bar=document.querySelector('.control-bar');
                    const buttons=Array.from(bar.querySelectorAll('button')).filter(b=>b.getClientRects().length);
                    const rects=buttons.map(b=>b.getBoundingClientRect());
                    const budget=document.querySelector('#time-budget').getBoundingClientRect();
                    const time=document.querySelector('#time').getBoundingClientRect();
                    return {count:buttons.length,fit:rects.every(r=>r.width>=44&&r.height>=44&&r.left>=0&&r.right<=innerWidth),
                        names:buttons.every(b=>b.getAttribute('aria-label')?.length>0),
                        separate:rects.every((r,i)=>rects.every((other,j)=>i===j||r.right<=other.left||other.right<=r.left||r.bottom<=other.top||other.bottom<=r.top)),
                        belowTime:rects.every(r=>r.top>=time.bottom),aboveBudget:rects.every(r=>r.bottom<=budget.top),
                        preset:document.querySelector('.duration-config').getClientRects().length>0,
                        compact:getComputedStyle(document.querySelector('#primary-label')).display==='none',
                        oneRow:Math.max(...rects.map(r=>r.top))-Math.min(...rects.map(r=>r.top))<3,
                        overflow:document.documentElement.scrollWidth>innerWidth};})()`);
                assert.equal(geometry.count,state==='READY'?1:6);
                assert.equal(geometry.preset,state==='READY',`READY presets at ${width}x${height}`);
                assert.ok(geometry.fit&&geometry.names&&geometry.separate&&geometry.belowTime&&geometry.aboveBudget&&!geometry.overflow,JSON.stringify({width,height,state,language,geometry}));
                assert.equal(geometry.compact,width<704);
                if(width>320||state==='READY') assert.equal(geometry.oneRow,true,`Controls fit one row: ${JSON.stringify({width,height,state,language,geometry})}`);
            }
            await evaluate(`document.querySelector('#stop').focus()`);
            await click('#stop');
            assert.equal(await evaluate(`document.activeElement===document.querySelector('#primary')`),true,'Stop returns focus to Start before hiding');
            assert.equal(await evaluate(`document.querySelector('.duration-config').getClientRects().length>0`),true);
            await evaluate('window.scrollTo(0,0)');
        }
    }
    await cdp('Emulation.setTouchEmulationEnabled',{enabled:false});
    await cdp('Emulation.clearDeviceMetricsOverride');
    await configure(0,5,0);
    for (const state of ['READY','RUNNING','PAUSED']) {
        if(state!=='READY') await click('#primary');
        for (const amount of (state === 'READY' ? [3600000,300000,60000] : [3600000,300000,60000,30000])) {
            const before=await text('#time-budget');
            await click(`[${state === 'READY' ? 'data-preset' : 'data-adjustment'}="${amount}"]`);
            assert.notEqual(await text('#time-budget'),before,'Every addition updates the budget');
            await checkTitle(state);
        }
    }
    await click('#stop');
    await configure(0,0,1);
    await click('#primary');
    // Advance the injected wall clock to verify long overtime without real-time waiting.
    await evaluate(`window.originalNow=Date.now;Date.now=()=>window.originalNow()+36000000;document.dispatchEvent(new Event('visibilitychange'));`);
    assert.match(await evaluate('document.title'),/^\+09:59:/);
    for (const amount of [3600000,300000,60000,30000]) {
        await click(`[data-adjustment="${amount}"]`);
        await checkTitle('FINISHED');
        assert.equal(await evaluate(`(document.querySelector('#time').dataset.visualState !== 'EXPIRED')`),false);
    }
    await click('#primary');
    await checkTitle('RUNNING');
    assert.equal(await text('#time-budget'),'Timebox 00:01','New Run clears additions');
    await click('#stop');
    await evaluate('Date.now=window.originalNow;delete window.originalNow');
    await cdp('Emulation.setDeviceMetricsOverride',{width:320,height:568,deviceScaleFactor:1,mobile:true});
    await evaluate(`document.documentElement.style.fontSize='150%'`);
    await configure(0,5,0);
    await click('#primary');
    assert.equal(await evaluate(`Array.from(document.querySelectorAll('.control-bar button')).filter(b=>b.getClientRects().length).every(b=>{const r=b.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.height>=44&&r.width>=44})`),true,'150% text scaling preserves control access');
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,'Text scaling does not cause horizontal overflow');
    await click('#stop');
    await evaluate(`document.documentElement.style.fontSize=''`);
    await cdp('Emulation.clearDeviceMetricsOverride');
    await cdp('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
    await click('[data-language="en"]');
    assert.equal(await text('#status'), 'Ready');
    assert.deepEqual(await evaluate(`Array.from(document.querySelectorAll('[data-preset]')).map(b=>b.textContent)`), ['+1 min','+2 min','+3 min','+5 min','+10 min','+15 min','+30 min','+60 min']);
    assert.equal(await evaluate(`new Set(Array.from(document.querySelectorAll('[data-preset]')).map(b=>b.getBoundingClientRect().top)).size`),1,'Desktop presets use one row');
    assert.equal(await evaluate(`document.querySelectorAll('.timer input').length`),0,'Quick Timer has no manual duration inputs; hidden Editor drafts are independent');
    assert.equal(await evaluate(`['primary','stop'].every(id=>document.getElementById(id).querySelector('svg')&&document.getElementById(id).textContent.trim())`),true);
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('[data-preset]')).backgroundColor !== getComputedStyle(document.querySelector('[data-adjustment]')).backgroundColor`),true);
    await click('#reset-timebox');
    await click('[data-preset="300000"]');
    assert.equal(await text('#time'),'05:00');
    assert.equal(await text('#time-budget'),'Timebox 05:00');
    assert.equal(await evaluate(`document.querySelectorAll('[data-preset][aria-pressed="true"]').length`),0);
    await click('#primary');
    await click('[data-adjustment="30000"]');
    assert.equal(await text('#status'),'Running');
    await checkTitle('RUNNING');
    await click('#primary');
    const pausedBeforeAddition = await text('#time');
    await click('[data-adjustment="300000"]');
    assert.equal(await text('#status'),'Paused');
    assert.equal(await text('#time-budget'),'Timebox 10:30 · Planned 05:00 + 05:30');
    await checkTitle('PAUSED');
    assert.notEqual(await text('#time'),pausedBeforeAddition);
    await click('#stop');
    await click('#primary');
    assert.equal(await text('#time-budget'),'Timebox 05:00');
    await click('#stop');
    await configure(99,59,59);
    await click('#primary');
    assert.equal(await evaluate('document.title'),'99:59:59 · easyTimer');
    await click('#stop');
    await click('[data-preset="60000"]');
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
    await checkTitle('PAUSED');
    const frozenTitle = await evaluate('document.title');
    await evaluate(`window.titleMutations=0;window.titleObserver=new MutationObserver(records=>{window.titleMutations+=records.length});window.titleObserver.observe(document.querySelector('title'),{childList:true,subtree:true,characterData:true});`);
    await click('[data-language="de"]');
    assert.equal(await text('#status'), 'Pausiert');
    assert.equal(await evaluate(`document.querySelector('#primary').getAttribute('aria-label')`), 'Fortsetzen');
    await click('[data-theme="dark"]');
    assert.equal(await text('#time'), frozen);
    assert.equal(await evaluate('document.title'),frozenTitle);
    await evaluate(`document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('pageshow'));`);
    assert.equal(await evaluate('window.titleMutations'),0,'Unchanged titles are not reassigned');
    await evaluate('window.titleObserver.disconnect()');
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
    await checkTitle('RUNNING');
    await delay(1100);
    await checkTitle('RUNNING');
    assert.notEqual(await evaluate('document.title'),`${frozen} · easyTimer`,'Resume advances the remaining title time');
    await click('#stop');
    await click('#primary');
    assert.equal(await text('#time'), '00:05');
    assert.equal(await evaluate('document.title'),'00:05 · easyTimer');
    assert.equal(await text('#status'), 'Läuft');
    await click('#stop');
    assert.equal(await text('#time'), '00:05');
    assert.equal(await text('#status'), 'Bereit');
    await checkTitle('READY');
    await configure(0,0,1);
    await click('#primary');
    await delay(1200);
    assert.match(await text('#time'), /^\+/);
    assert.equal(await text('#status'), 'Zeit abgelaufen');
    await checkTitle('FINISHED');
    assert.equal(await evaluate(`(document.querySelector('#time').dataset.visualState !== 'EXPIRED')`), false);
    assert.match(await text('#time'), /^\+00:0[01]$/);
    assert.equal(await evaluate(`Array.from(document.querySelectorAll('[data-preset]')).every(b=>b.disabled)`),true);
    const overtimeBeforePreferences = await text('#time');
    await click('[data-language="en"]');
    assert.equal(await text('#status'), 'Time’s up');
    assert.match(await evaluate(`document.querySelector('#time').getAttribute('aria-label')`), /^Overtime:/);
    await click('[data-theme="light"]');
    await checkTitle('FINISHED');
    assert.ok(await text('#time') >= overtimeBeforePreferences);
    assert.equal(await text('#primary'), 'Start again');
    await click('#primary');
    assert.equal(await text('#time'), '00:01');
    assert.equal(await evaluate(`(document.querySelector('#time').dataset.visualState !== 'EXPIRED')`), true);
    await click('#stop');
    // Emulate a tab whose callbacks cannot execute, then resume past its deadline.
    await configure(0,0,2);
    await click('#primary');
    await cdp('Page.setWebLifecycleState', { state: 'frozen' });
    await delay(3400);
    await cdp('Page.setWebLifecycleState', { state: 'active' });
    await cdp('Page.bringToFront');
    await delay(1200);
    assert.match(await text('#time'), /^\+/);
    assert.equal(await text('#status'), 'Time’s up');
    assert.equal(await evaluate(`(document.querySelector('#time').dataset.visualState !== 'EXPIRED')`), false);
    assert.ok(Number((await text('#time')).slice(-2)) >= 1);
    await checkTitle('FINISHED');
    await click('[data-adjustment="30000"]');
    assert.equal(await text('#status'),'Running');
    assert.equal(await text('#time-budget'),'Timebox 00:32 · Planned 00:02 + 00:30');
    await checkTitle('RUNNING');
    assert.ok(await evaluate(`parseFloat(document.querySelector('#progress').style.getPropertyValue('--remaining')) > 0`));
    await click('#stop');
    await click('#primary');
    assert.equal(await evaluate(`(document.querySelector('#time').dataset.visualState !== 'EXPIRED')`), true);
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
    await checkMenu('PAUSED');
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
    await checkMenu('PAUSED');
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
        assert.equal(await evaluate(`getComputedStyle(document.querySelector('.presentation-brand')).display`), 'flex');
        assert.equal(await evaluate(`Array.from(document.querySelectorAll('[data-adjustment]')).every(b=>{const r=b.getBoundingClientRect();return r.height>=44&&r.left>=0&&r.right<=innerWidth&&r.bottom<document.querySelector('#time-budget').getBoundingClientRect().top})`),true,'Adjustments fit landscape');
        assert.equal(await evaluate(`(()=>{const a=document.querySelector('.actions').getBoundingClientRect();const d=document.querySelector('.duration-adjustments').getBoundingClientRect();return a.right<=d.left||a.bottom<=d.top})()`),true,'Actions and adjustments do not overlap');
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
    await cdp('Emulation.setTouchEmulationEnabled',{enabled:false});
    await cdp('Emulation.setDeviceMetricsOverride',{width:1280,height:720,screenWidth:1280,screenHeight:720,deviceScaleFactor:1,mobile:false});
    await cdp('Page.captureScreenshot',{format:'png'});
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
        if ((await text('#time')).startsWith('+')) break;
        await delay(100);
    }
    assert.equal(await evaluate(`document.querySelector('#progress').style.getPropertyValue('--remaining')`), '0%');
    assert.equal(await evaluate(`(()=>{const progress=document.querySelector('#progress').getBoundingClientRect();const marker=document.querySelector('.progress-marker').getBoundingClientRect();return marker.left>=progress.left-1&&marker.right<=progress.right+1})()`),true,'Progress marker stays within the inset strip at 0%');
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
        await checkMenu('READY');
        assert.equal(await evaluate(`document.querySelector('.duration-config').getClientRects().length>0`),true,'READY presets visible in expanded view');
        assert.equal(await evaluate(`(()=>{const p=document.querySelector('.duration-config').getBoundingClientRect();const t=document.querySelector('#time').getBoundingClientRect();const a=document.querySelector('.actions').getBoundingClientRect();return p.top>=t.bottom&&a.top>=t.bottom&&(p.bottom<=a.top||p.right<=a.left||a.right<=p.left)&&p.left>=0&&p.right<=innerWidth})()`),true,'READY builders and Start fit below the readout without overlap');
        const readyTop = await evaluate(`document.querySelector('#time').getBoundingClientRect().top`);
        await click('#primary');
        assert.equal(await evaluate(`document.querySelector('.duration-config').getClientRects().length`),0,'Running presets hidden');
        assert.ok(Math.abs(await evaluate(`document.querySelector('#time').getBoundingClientRect().top`)-readyTop)<height*.2,'Room readout transition stays deliberate');
        await click('#primary');
        assert.equal(await evaluate(`document.querySelector('.duration-config').getClientRects().length`),0,'Paused presets hidden');
        await click('#stop');
    await click('#primary');
        assert.equal(await evaluate(`document.querySelector('.duration-config').getClientRects().length`),0,'Stop then Start keeps presets hidden');
        await click('#stop');
        assert.equal(await evaluate(`document.querySelector('.duration-config').getClientRects().length>0`),true,'Stop restores room presets');
        assert.equal(await evaluate(`Array.from(document.querySelectorAll('[data-preset],#reset-timebox')).every(b=>b.getClientRects().length>0)&&document.querySelector('.duration-adjustments').hidden`),true,'Expanded READY shows only time-building controls');
        assert.equal(await evaluate(`(()=>{const b=document.querySelector('#time-budget').getBoundingClientRect();const d=document.querySelector('.duration-adjustments').getBoundingClientRect();const p=document.querySelector('#progress').getBoundingClientRect();return d.bottom<=b.top&&b.bottom<=p.top+1&&p.bottom<=innerHeight})()`),true,'Budget line fits above progress and below additions');
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
    const overtimeBeforePresentation = await text('#time');
    await click('#fullscreen');
    await delay(100);
    assert.equal(await evaluate('document.body.classList.contains("presentation")'),true);
    assert.equal(await evaluate(`(document.querySelector('#time').dataset.visualState !== 'EXPIRED')`),false);
    await checkMenu('FINISHED');
    assert.equal(await evaluate(`document.querySelector('.duration-config').getClientRects().length`),0,'Overtime presets hidden in presentation');
    assert.ok(await text('#time') >= overtimeBeforePresentation);
    assert.equal(await evaluate(`(()=>{const r=document.querySelector('#time').getBoundingClientRect();const t=document.querySelector('#time').getBoundingClientRect();const a=document.querySelector('.actions').getBoundingClientRect();return r.bottom<=a.top&&r.left>=0&&r.right<=innerWidth})()`),true,'Overtime fits presentation view');
    await cdp('Emulation.setDeviceMetricsOverride', {width:568,height:320,deviceScaleFactor:1,mobile:true,screenOrientation:{type:'landscapePrimary',angle:90}});
    assert.equal(await evaluate(`(()=>{const r=document.querySelector('#time').getBoundingClientRect();const t=document.querySelector('#time').getBoundingClientRect();const a=document.querySelector('.actions').getBoundingClientRect();return r.bottom<=a.top&&r.left>=0&&r.right<=innerWidth})()`),true,'Overtime fits mobile landscape presentation');
    if (process.env.EASYTIMER_SCREENSHOT_DIR) {
        const screenshot = await cdp('Page.captureScreenshot', {format:'png'});
        await writeFile(join(process.env.EASYTIMER_SCREENSHOT_DIR,'easytimer-overtime-landscape.png'),Buffer.from(screenshot.data,'base64'));
    }
    await click('[data-language="de"]');
    assert.match(await evaluate(`document.querySelector('#time').getAttribute('aria-label')`), /^Überzeit:/);
    assert.equal(await evaluate(`(document.querySelector('#time').dataset.visualState !== 'EXPIRED')`),false);
    await click('[data-adjustment="300000"]');
    assert.equal(await text('#status'),'Läuft');
    assert.equal(await text('#time-budget'),'Timebox 05:01 · Geplant 00:01 + 05:00');
    assert.equal(await evaluate(`(()=>{const b=document.querySelector('#time-budget').getBoundingClientRect();const a=document.querySelector('.duration-adjustments').getBoundingClientRect();const p=document.querySelector('#progress').getBoundingClientRect();return b.top>=a.bottom&&b.bottom<=p.top+1&&p.bottom<=innerHeight})()`),true,'Extended budget fits short landscape');
    await click('#stop');
    assert.equal(await evaluate(`(document.querySelector('#time').dataset.visualState !== 'EXPIRED')`),true);
    await checkPlanner({ evaluate, click, text, cdp, configure });
    await checkSession({ evaluate, click, text, cdp, configure });
    await checkAutomaticSession({ evaluate, click, text, cdp });
    await checkPortability({ evaluate, click, text, cdp, configure });
    await checkTimeVisuals({ evaluate, click, text, cdp, configure });
    await checkClockView({ evaluate, click, text, cdp, configure });
    await evaluate(`(()=>{const data=JSON.parse(localStorage.getItem('easyTimerTemplates'));data.templates.push({id:'offline-session',name:'Offline workshop',transitionMode:'manual',phases:[{id:'offline-phase',title:'Offline phase',durationSeconds:60}]});localStorage.setItem('easyTimerTemplates',JSON.stringify(data));})()`);
    await cdp('Network.enable');
    await cdp('Network.emulateNetworkConditions', { offline:true, latency:0, downloadThroughput:0, uploadThroughput:0 });
    await reloadReady();
    assert.equal(await text('#time'), '05:00');
    assert.equal(await evaluate('Boolean(navigator.serviceWorker.controller)'), true);
    await click('#menu-toggle'); await click('#open-planner');
    assert.match(await text('.template-library'), /Changed elsewhere/, 'Templates and planner modules survive an offline reload');
    await reloadReady();
    assert.equal(await evaluate("document.body.classList.contains('planner-open')"), true, 'Offline refresh restores the Editor view');
    assert.match(await text('.template-library'), /Changed elsewhere/);
    await click('.planner-back');
    await click('#menu-toggle'); await click('#open-session');
    await evaluate(`(()=>{const select=document.querySelector('#session-template');select.value=Array.from(select.options).find(option=>option.value&&!option.disabled).value;select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await click('#prepare-session');
    assert.equal(await text('#status'), 'Ready', 'A saved Session template prepares offline using cached engine/modules');
    await click('#primary');
    const offlineRunId = await evaluate(`JSON.parse(localStorage.getItem('easyTimerRuntime.v1.'+sessionStorage.getItem('easyTimerRuntimeContext.v1'))).run.runId`);
    await reloadReady('session');
    assert.equal(await evaluate('document.body.dataset.mode'), 'session', 'Session runtime is restored during offline PWA reload');
    assert.equal(await evaluate(`JSON.parse(localStorage.getItem('easyTimerRuntime.v1.'+sessionStorage.getItem('easyTimerRuntimeContext.v1'))).run.runId`), offlineRunId);
    assert.equal(await text('#status'), 'Running');
    await cdp('Network.emulateNetworkConditions', { offline:false, latency:0, downloadThroughput:-1, uploadThroughput:-1 });
    assert.equal(errors.length, 0, JSON.stringify(errors));
    console.log('PASS: responsive timer stage, independent screen/viewport tablet split profiles, smartphone toggle/branding rules, exact running/overtime/addition preservation, universal menu and touch, focus, dynamic titles, presets, budget, PWA offline reload, frozen-tab timing, DE/EN, themes, responsive geometry, fullscreen/fallback and sticky progress dock.');
    }
    await cdp('Browser.close');
} catch (error) {
    if (errors.length) console.error('Browser runtime exceptions:', JSON.stringify(errors));
    throw error;
} finally {
    socket?.close();
    browser.kill();
    server.close();
    await delay(500);
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(error => console.warn(`Temporary browser profile retained: ${profile}: ${error.message}`));
}
