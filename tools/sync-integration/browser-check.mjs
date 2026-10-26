// Integrated synthetic transport + real IndexedDB experiments; no real Google calls.
// Uses the same native Chromium/CDP approach as tests/browser-check.mjs, without dependencies.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { startServer } from './server.mjs';
const server = await startServer(0);
const profile = await mkdtemp(join(tmpdir(), 'easytimer-sync-integration-browser-'));
const output = await mkdtemp(join(tmpdir(), 'easytimer-sync-integration-shots-'));
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
        if (msg.method === 'Runtime.consoleAPICalled' && msg.params.args[0]?.value?.startsWith('CHECK: ')) console.log(msg.params.args[0].value);
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
            const key = ++id, timeout = setTimeout(() => { pending.delete(key); reject(new Error(`CDP timeout: ${method}`)); }, 45000);
            pending.set(key, { resolve, reject, timeout }); socket.send(JSON.stringify({ id: key, method, params }));
        });
    }
    async function evaluate(expression) {
        const result = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
        assert(!result.exceptionDetails, JSON.stringify(result.exceptionDetails)); return result.result.value;
    }
    await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('Network.enable');
    await cdp('Fetch.enable', { patterns: [{ urlPattern: 'https://*' }] });
    await cdp('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` });
    for(let i=0;i<100;i++){if(await evaluate('Boolean(document.getElementById("prepare"))'))break;await delay(30);}
    assert.equal(await evaluate('Boolean(document.getElementById("prepare"))'),true);
    const report=await evaluate(`import('/tools/sync-integration/experiments.mjs').then(module=>module.runExperiments())`);
    assert.equal(report.checks.every(check=>check.result==='PASS'),true);
    assert.equal(external.length,0,'No external network request permitted');
    assert.deepEqual(errors,[]);
    await writeFile(join(output,'results.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify(report,null,2));
    console.log('Browser evidence: '+output);
    const recoveryRun = crypto.randomUUID();
    await evaluate(`(async()=>{const m=await import('/tools/sync-integration/store.mjs');const c=await import('/tools/sync-integration/coordinator.mjs');const db=await m.openIntegrationStore({runId:'${recoveryRun}',clientId:'reload'});await db.save(c.syntheticLibrary(),0);db.close()})()`);
    await cdp('Page.reload');
    await delay(300);
    assert.equal(await evaluate(`import('/tools/sync-integration/store.mjs').then(async m=>{const db=await m.openIntegrationStore({runId:'${recoveryRun}',clientId:'reload'});const s=await db.read();db.close();return s.needsTicket})`),true);
    const expected = await evaluate(`(async()=>{
        const {openIntegrationStore}=await import('/tools/sync-integration/store.mjs');
        const {createCoordinator}=await import('/tools/sync-integration/coordinator.mjs');
        const {fakeDrive}=await import('/tools/sync-integration/fake-drive.mjs');
        const {createPocClient,SCOPE}=await import('/tools/sync-poc/core.mjs');
        const {createTransport}=await import('/tools/sync-integration/transport.mjs');
        const drive=fakeDrive(),client=createPocClient({fetchImpl:drive.fetch});
        await client.authorize({access_token:'RELOAD_TEST_FAKE_ONLY',expires_in:3600,scope:SCOPE});
        const db=await openIntegrationStore({runId:'${recoveryRun}',clientId:'reload'});
        const c=createCoordinator(db,createTransport(client.integrationSession(),'${recoveryRun}'));await c.discover();
        const t=await c.prepare();db.close();return {hash:t.snapshotHash,fileId:t.fileId,operationId:t.operationId};
    })()`);
    await cdp('Page.reload'); await delay(300);
    const recovered = await evaluate(`import('/tools/sync-integration/store.mjs').then(async m=>{
        const db=await m.openIntegrationStore({runId:'${recoveryRun}',clientId:'reload'});const s=await db.read();db.close();
        return {hash:s.outbox.ticket.snapshotHash,fileId:s.outbox.ticket.fileId,operationId:s.outbox.ticket.operationId};
    })`);
    assert.deepEqual(recovered,expected,'Real page reload must retain the same complete ticket');
    console.log('PASS: real page reload preserves dirty intent and immutable pending publication identity.');
    for (const width of [320,1280]) {
        await cdp('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width===320});
        assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'),true);
        const capture=await cdp('Page.captureScreenshot',{format:'png'});
        await writeFile(join(output,'interface-'+width+'.png'),Buffer.from(capture.data,'base64'));
    }
    assert.equal(await evaluate('localStorage.length'),0);
    await cdp('Browser.close');
} finally {
    socket?.close(); browser.kill(); await new Promise(done => server.close(done)); await delay(500);
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
}
