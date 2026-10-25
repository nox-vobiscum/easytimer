// Real IndexedDB experiments in isolated browser tabs; no Google/network integration.
// Uses the same native Chromium/CDP approach as tests/browser-check.mjs, without dependencies.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { startServer } from './server.mjs';
const server = await startServer(0);
const profile = await mkdtemp(join(tmpdir(), 'easytimer-local-store-browser-'));
const output = await mkdtemp(join(tmpdir(), 'easytimer-local-store-shots-'));
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
            cdp('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }).catch(() => {});
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
    await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('Network.enable');
    await cdp('Fetch.enable', { patterns: [{ urlPattern: 'https://*' }] });
    await cdp('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` });
    for(let i=0;i<100;i++){if(await evaluate('Boolean(window.storePoc)'))break;await delay(30);}
    assert.equal(await evaluate('Boolean(window.storePoc)'),true);
    const report=await evaluate(`import('/tools/local-store-poc/experiments.mjs').then(module=>module.runExperiments())`);
    assert.equal(report.checks.every(check=>check.result==='PASS'),true);
    assert.equal(external.length,0,'No external network request permitted');
    assert.deepEqual(errors,[]);
    await writeFile(join(output,'results.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify(report,null,2));
    console.log('Browser evidence: '+output);
    await cdp('Browser.close');
} finally {
    socket?.close(); browser.kill(); await new Promise(done => server.close(done)); await delay(500);
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
}
