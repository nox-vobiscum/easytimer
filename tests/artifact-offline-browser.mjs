import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, extname } from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { packageProduction, verifyArtifact } from '../tools/release/package.mjs';
import { checkInformation, checkInformationContinuity, checkHeaderIntents } from './information-browser.mjs';

const artifact = await packageProduction();
await verifyArtifact(artifact.directory);
for (const negativeControl of [false, true]) await checkOffline(negativeControl);
console.log(`Artifact: ${artifact.directory}`);

async function checkOffline(negativeControl) {
    const server = createServer(async (req, res) => {
        try {
            const url = new URL(req.url, 'http://localhost');
            const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
            // Serve only the generated artifact, never the repository or tools.
            assert(artifact.inventory.files.some(file => file.path === 'src/' + relative));
            const path = resolve(artifact.webRoot, relative), body = await readFile(path);
            res.writeHead(200, { 'Content-Type': ({ '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.webmanifest':'application/manifest+json', '.png':'image/png', '.ico':'image/x-icon' })[extname(path)] });
            res.end(body);
        } catch { res.writeHead(404); res.end(); }
    });
    await new Promise(done => server.listen(0, '127.0.0.1', done));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const profile = await mkdtemp(join(tmpdir(), 'easytimer-artifact-browser-'));
    const browser = spawn(process.env.EASYTIMER_BROWSER || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-allow-origins=*', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'],
        { windowsHide: true, stdio: 'ignore' });
    let socket, launchError; browser.on('error', error => { launchError = error; });
    try {
        let port;
        for (let n = 0; n < 100; n++) {
            if (launchError) throw launchError;
            try { port = Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break; } catch { await delay(100); }
        }
        assert(port, 'Browser debugging port must be available');
        const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
        socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
        await new Promise((done, reject) => { socket.onopen = done; socket.onerror = reject; });
        let sequence = 0; const pending = new Map(), external = [], exceptions = [], dialogs = [];
        let acceptConfirmation = true;
        socket.onmessage = ({ data }) => {
            const message = JSON.parse(data);
            if (message.method === 'Network.requestWillBeSent' && !message.params.request.url.startsWith(origin + '/')) external.push(message.params.request.url);
            if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails.text);
            if (message.method === 'Page.javascriptDialogOpening') {
                dialogs.push(message.params.type);
                cdp('Page.handleJavaScriptDialog', { accept: message.params.type !== 'beforeunload' && acceptConfirmation });
            }
            const request = pending.get(message.id);
            if (request) { clearTimeout(request.timeout); pending.delete(message.id); message.error ? request.reject(Error(JSON.stringify(message.error))) : request.resolve(message.result); }
        };
        const cdp = (method, params = {}) => new Promise((resolve, reject) => {
            const id = ++sequence, timeout = setTimeout(() => reject(Error(`CDP timeout: ${method}`)), 10000);
            pending.set(id, { resolve, reject, timeout }); socket.send(JSON.stringify({ id, method, params }));
        });
        const evaluate = async expression => {
            const result = await cdp('Runtime.evaluate', { expression, returnByValue:true, awaitPromise:true, userGesture:true });
            assert(!result.exceptionDetails, JSON.stringify(result.exceptionDetails)); return result.result.value;
        };
        const wait = async expression => {
            for (let n = 0; n < 100; n++) { if (await evaluate(expression)) return; await delay(50); }
            assert.fail(`Timed out: ${expression}`);
        };
        const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
        await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('Network.enable');
        await cdp('Page.navigate', { url: origin + '/' });
        await wait('Boolean(document.getElementById("primary")?.title)&&Boolean(navigator.serviceWorker.controller)');
        assert.equal(await evaluate('document.getElementById("time").textContent'), '00:00');
        assert.deepEqual(await evaluate('Promise.all(["/tools/app-sync/account.mjs","/tools/sync-poc/index.html","/tests/browser-check.mjs","/docs/backlog.md"].map(url=>fetch(url).then(r=>r.status)))'), [404,404,404,404]);
        assert.equal(await evaluate('document.querySelectorAll("#account-toggle,#account-menu-entry,.development-sync").length'), 0);
        assert.equal(await evaluate('typeof globalThis.easyTimerDevelopment'), 'undefined');
        if (!negativeControl) {
            await checkInformation({ cdp, evaluate, wait, origin, screenshots:profile });
            await checkInformationContinuity({ cdp, evaluate, wait });
            await checkHeaderIntents({ cdp, evaluate, wait, setConfirmation: value => { acceptConfirmation = value; }, confirmations: () => dialogs.filter(type => type === 'confirm').length });
            await click('#menu-toggle');
            assert.equal(await evaluate('document.querySelectorAll(".menu-information a").length'), 4);
            await click('#open-planner');
            assert.equal(await evaluate('document.querySelector(".backup-subtitle").textContent'), 'Local JSON import and export');
            await evaluate('Array.from(document.querySelectorAll("#planner button")).find(b=>b.textContent==="Create Rundown").click()');
            await evaluate('const name=document.querySelector("#template-name");name.value="Unsaved information test";name.dispatchEvent(new Event("input",{bubbles:true}))');
            // A real pointer gesture activates native beforeunload protection.
            await click('#menu-toggle');
            const point = await evaluate('(()=>{const r=document.querySelector("[data-information=about]").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()');
            await cdp('Input.dispatchMouseEvent', { type:'mousePressed', button:'left', clickCount:1, ...point });
            await cdp('Input.dispatchMouseEvent', { type:'mouseReleased', button:'left', clickCount:1, ...point });
            await wait('document.querySelector("#template-name")?.value === "Unsaved information test"');
            await delay(200);
            assert(dialogs.includes('beforeunload'), 'Native draft warning is preserved for information links');
            assert.equal(await evaluate('location.pathname'), '/');
            await click('#menu-toggle');
            await evaluate('Array.from(document.querySelectorAll("#planner button")).find(b=>b.textContent==="Cancel").click()');
            await click('.planner-back');
        }
        const urls = await evaluate('(async()=>{const cache=await caches.open("easytimer-shell-v' + artifact.inventory.pwaVersion + '");return (await cache.keys()).map(r=>new URL(r.url).pathname+new URL(r.url).search)})()');
        for (const file of artifact.inventory.files.filter(file => file.path !== 'src/service-worker.js')) assert(urls.some(url => url.split('?')[0] === '/' + file.path.slice(4)), `Precached file: ${file.path}`);
        if (negativeControl) {
            await evaluate('(async()=>{const cache=await caches.open("easytimer-shell-v' + artifact.inventory.pwaVersion + '");await cache.delete("./js/templates.mjs?v=37")})()');
        }
        await cdp('Network.clearBrowserCache'); await cdp('Network.setCacheDisabled', { cacheDisabled:true });
        await new Promise(done => server.close(done));
        await assert.rejects(fetch(origin + '/'), 'The actual server must be unreachable');
        // Do not rely on CDP offline emulation: a worker can still have network access.
        const before = await evaluate('performance.timeOrigin'); await cdp('Page.reload');
        await wait(`performance.timeOrigin!==${before}&&Boolean(document.getElementById('time'))`);
        if (negativeControl) {
            await delay(1000);
            assert.equal(await evaluate('Boolean(document.getElementById("primary").title)'), false);
            assert.equal(await evaluate('document.getElementById("time").textContent'), '');
            console.log('PASS: negative control with a missing templates cache entry fails actual offline initialization.');
        } else {
            await wait('Boolean(document.getElementById("primary")?.title)');
            await click('[data-language="en"]');
            await click('#primary'); await wait('document.getElementById("status").textContent==="Running"');
            await click('#primary'); assert.equal(await evaluate('document.getElementById("status").textContent'), 'Paused');
            await click('#stop'); await click('#menu-toggle'); await click('#open-planner');
            await evaluate('Array.from(document.querySelectorAll("#planner button")).find(b=>b.textContent==="Create Rundown").click()');
            for (const [selector, value] of [['#template-name','Offline artifact'],['.phase-title input','Opening']]) {
                await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}))})()`);
            }
            await evaluate('document.querySelector("#planner form").requestSubmit()');
            const library = await evaluate('JSON.parse(localStorage.getItem("easyTimerTemplates"))');
            assert.equal(library.templates[0].name, 'Offline artifact');
            await evaluate('document.querySelector(".rundown-launch").click()');
            assert.equal(await evaluate('document.body.dataset.mode'), 'session');
            assert.equal(await evaluate('document.getElementById("status").textContent'), 'Ready');
            await click('#primary'); await click('#primary');
            const run = await evaluate('JSON.parse(localStorage.getItem("easyTimerRuntime.v1."+sessionStorage.getItem("easyTimerRuntimeContext.v1")))');
            assert.equal(run.clock.status, 'PAUSED');
            const pausedOrigin = await evaluate('performance.timeOrigin');
            await cdp('Page.reload'); await wait(`performance.timeOrigin!==${pausedOrigin} && document.body?.dataset.mode==="session" && document.getElementById("status")?.textContent==="Paused"`);
            assert.equal(await evaluate('document.body.dataset.mode'), 'session');
            assert.equal(await evaluate('JSON.parse(localStorage.getItem("easyTimerTemplates")).templates[0].id'), library.templates[0].id);
            assert.equal(await evaluate('JSON.parse(localStorage.getItem("easyTimerRuntime.v1."+sessionStorage.getItem("easyTimerRuntimeContext.v1"))).run.runId'), run.run.runId);
            await checkInformation({ cdp, evaluate, wait, origin, screenshots:profile, offline:true });
            assert.deepEqual(exceptions, []);
            console.log('PASS: packaged production cold-starts with server stopped and HTTP cache disabled; Quick, Editor save, Session READY/pause and reload recovery work offline.');
            console.log(`Information screenshots: ${profile}`);
        }
        assert.deepEqual(external, [], 'No external SDK, API or profile-image request');
        await cdp('Browser.close');
    } finally {
        socket?.close(); browser.kill(); server.close();
    }
}
