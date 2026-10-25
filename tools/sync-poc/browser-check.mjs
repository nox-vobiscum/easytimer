// Local harness smoke test only. Mocked OAuth is NEVER evidence of Google feasibility.
// Uses the same native Chromium/CDP approach as tests/browser-check.mjs, without dependencies.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { startServer } from './server.mjs';
const server = await startServer(0);
const profile = await mkdtemp(join(tmpdir(), 'easytimer-sync-poc-browser-'));
const output = await mkdtemp(join(tmpdir(), 'easytimer-sync-poc-shots-'));
const browser = spawn(process.env.EASYTIMER_BROWSER || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'],
    { windowsHide: true, stdio: 'ignore' });
let socket, launchError;
browser.on('error', error => { launchError = error; });
try {
    let port;
    for (let i = 0; i < 100; i++) {
        if (launchError) throw launchError;
        try { port = Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break; }
        catch { await delay(100); }
    }
    assert(port, 'Chromium debugging port unavailable');
    const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let id = 0;
    const pending = new Map(), errors = [], external = [];
    socket.onmessage = ({ data }) => {
        const msg = JSON.parse(data);
        if (msg.method === 'Runtime.exceptionThrown') errors.push('Unexpected browser exception');
        if (msg.method === 'Network.requestWillBeSent' && /^https:/.test(msg.params.request.url)) external.push(msg.params.request.url);
        if (msg.method === 'Fetch.requestPaused') {
            const requestId = msg.params.requestId;
            if (msg.params.request.url === 'https://accounts.google.com/gsi/client') {
                cdp('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }], body: Buffer.from('/* Simulated GIS load; no real Google request. */').toString('base64') }).catch(() => {});
            } else cdp('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }).catch(() => {});
        }
        const task = pending.get(msg.id);
        if (task) { pending.delete(msg.id); clearTimeout(task.timeout); msg.error ? task.reject(new Error('CDP command failed')) : task.resolve(msg.result); }
    };
    function cdp(method, params = {}) {
        return new Promise((resolve, reject) => {
            const key = ++id, timeout = setTimeout(() => { pending.delete(key); reject(new Error(`CDP timeout: ${method}`)); }, 10000);
            pending.set(key, { resolve, reject, timeout }); socket.send(JSON.stringify({ id: key, method, params }));
        });
    }
    async function evaluate(expression) {
        const result = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
        assert(!result.exceptionDetails, 'Unexpected evaluation error'); return result.result.value;
    }
    const click = id => evaluate(`document.getElementById(${JSON.stringify(id)}).click()`);
    async function wait(expression) {
        for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await delay(30); }
        assert.fail('PoC UI did not reach expected state');
    }
    await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('Network.enable');
    // Block every real Google request; only the GIS script load is fulfilled locally.
    await cdp('Fetch.enable', { patterns: [{ urlPattern: 'https://*' }] });
    await cdp('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` });
    await wait(`document.querySelector('#run-id')?.value.length===36`);
    assert.equal(await evaluate(`document.querySelector('#client-id').value`), '896158829302-h2rlgdbilmek2b1lmkr65kealt2t5rr8.apps.googleusercontent.com', 'Owner-provided public test client is prefilled');
    assert.equal(external.length, 0, 'No Google requests on startup');
    assert.equal(await evaluate(`document.querySelector('#create').disabled&&document.querySelector('#connect').disabled`), true);
    assert.equal(await evaluate(`['snapshot-discover','snapshot-prepare','snapshot-publish','snapshot-lost','snapshot-recover','update','probe','crud'].every(id=>document.getElementById(id).disabled)`), true, 'Snapshot actions need authorization and retired PATCH actions stay disabled');
    await click('load-gis'); assert.equal(external.length, 0, 'Unapproved click must not load GIS');
    await evaluate(`document.querySelector('#client-id').value='123456-unit-test.apps.googleusercontent.com';document.querySelector('#approved').click()`);
    await click('load-gis'); await wait(`!document.querySelector('#connect').disabled`);
    assert.deepEqual(external, ['https://accounts.google.com/gsi/client']);
    await evaluate(`window.google={accounts:{oauth2:{initTokenClient:config=>{window.testConfig=config;return {requestAccessToken(){window.testRequests=(window.testRequests||0)+1;}};}}}}`);
    await click('connect');
    assert.equal(await evaluate(`window.testRequests`), 1);
    assert.equal(await evaluate(`window.testConfig.scope`), 'https://www.googleapis.com/auth/drive.appdata');
    assert.equal(await evaluate(`window.testConfig.include_granted_scopes`), false);
    await evaluate(`window.testConfig.callback({error:'access_denied'})`);
    assert.match(await evaluate(`document.querySelector('#result').textContent`), /AUTH_CANCELLED/);
    await click('connect'); await evaluate(`window.testConfig.error_callback({type:'popup_closed'})`);
    assert.equal(await evaluate(`document.querySelector('#result').textContent`), 'popup_closed');
    await click('connect'); await evaluate(`window.testConfig.error_callback({type:'popup_failed_to_open'})`);
    assert.equal(await evaluate(`document.querySelector('#result').textContent`), 'popup_failed_to_open');
    await click('connect'); await click('disconnect');
    await evaluate(`window.testConfig.callback({access_token:'BROWSER_UNIT_FAKE_ONLY',expires_in:3600,scope:'https://www.googleapis.com/auth/drive.appdata'})`);
    assert.equal(await evaluate(`document.querySelector('#create').disabled`), true, 'Late authorization after Disconnect stays ignored');
    assert.equal(await evaluate(`localStorage.length+sessionStorage.length`), 0);
    assert.equal(await evaluate(`document.body.textContent.includes('BROWSER_UNIT_FAKE_ONLY')`), false);
    for (const width of [1280, 320]) {
        await cdp('Emulation.setDeviceMetricsOverride', { width, height: 800, deviceScaleFactor: 1, mobile: false });
        assert.equal(await evaluate(`document.documentElement.scrollWidth<=innerWidth`), true);
        const shot = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
        await writeFile(join(output, `poc-${width}.png`), Buffer.from(shot.data, 'base64'));
    }
    assert.deepEqual(errors, []);
    console.log(`PASS: local-only PoC startup, no unsolicited Google traffic, authorization gating, mocked denial/closure, late callback isolation, no browser storage and responsive layout. Screenshots: ${output}`);
    console.log('REAL GOOGLE AUTH/CRUD/CONCURRENCY: UNRESOLVED. iOS Safari/PWA: NOT TESTED.');
    await cdp('Browser.close');
} finally {
    socket?.close(); browser.kill(); await new Promise(done => server.close(done)); await delay(500);
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
}
