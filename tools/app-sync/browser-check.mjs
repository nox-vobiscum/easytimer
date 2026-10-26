// Integrated synthetic transport + real IndexedDB experiments; no real Google calls.
// Uses the same native Chromium/CDP approach as tests/browser-check.mjs, without dependencies.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep, basename } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { startServer } from './server.mjs';
import { fakeDrive } from '../sync-integration/fake-drive.mjs';
const drive = fakeDrive();
const server = await startServer({port:0,enabled:true});
const profile = await mkdtemp(join(tmpdir(), 'easytimer-application-sync-browser-'));
const output = await mkdtemp(join(tmpdir(), 'easytimer-application-sync-shots-'));
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
    const browserEndpoint = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
    socket = new WebSocket(browserEndpoint.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let id = 0, mainSession;
    const pending = new Map(), errors = [], external = [];
    socket.onmessage = ({ data }) => {
        const msg = JSON.parse(data);
        if (msg.method === 'Runtime.consoleAPICalled' && msg.params.args[0]?.value?.startsWith('CHECK: ')) console.log(msg.params.args[0].value);
        if (msg.method === 'Runtime.exceptionThrown') errors.push('Unexpected browser exception');
        if (msg.method === 'Network.requestWillBeSent' && /^https:/.test(msg.params.request.url)) external.push(msg.params.request.url);
        if (msg.method === 'Fetch.requestPaused') {
            const requestId = msg.params.requestId;
            const send = (method, params) => cdp(method, params, msg.sessionId);
            (async()=>{
                const request=msg.params.request;
                if(request.url.startsWith('http://localhost:8000/')) {
                    // Serve a virtual authorized origin from our own ephemeral loopback server; never stop another listener.
                    const url=new URL(request.url),response=await fetch(`http://127.0.0.1:${server.address().port}${url.pathname}${url.search}`);
                    await send('Fetch.fulfillRequest',{requestId,responseCode:response.status,responseHeaders:[...response.headers].map(([name,value])=>({name,value})),body:Buffer.from(await response.arrayBuffer()).toString('base64')});
                } else if(request.url==='https://accounts.google.com/gsi/client') {
                    const script=`globalThis.google={accounts:{oauth2:{initTokenClient(config){return {requestAccessToken(){config.callback({access_token:'BROWSER_APPLICATION_FAKE_ONLY',expires_in:3600,scope:'https://www.googleapis.com/auth/drive.appdata'})}}}}}};`;
                    await send('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'text/javascript'}],body:Buffer.from(script).toString('base64')});
                } else if(request.url.startsWith('https://www.googleapis.com/')) {
                    const response=request.method==='OPTIONS'?new Response(null,{status:204}):await drive.fetch(request.url,{method:request.method,body:request.postData});
                    await send('Fetch.fulfillRequest',{requestId,responseCode:response.status,responseHeaders:[{name:'Access-Control-Allow-Origin',value:'http://localhost:8000'},{name:'Access-Control-Allow-Methods',value:'GET,POST,OPTIONS'},{name:'Access-Control-Allow-Headers',value:'authorization,content-type'},{name:'Content-Type',value:'application/json'}],body:Buffer.from(await response.arrayBuffer()).toString('base64')});
                } else await send('Fetch.failRequest',{requestId,errorReason:'BlockedByClient'});
            })().catch(()=>send('Fetch.failRequest',{requestId,errorReason:'Failed'}).catch(()=>{}));
        }
        const task = pending.get(msg.id);
        if (task) { pending.delete(msg.id); clearTimeout(task.timeout); msg.error ? task.reject(new Error('CDP command failed: ' + task.method + ': ' + msg.error.message)) : task.resolve(msg.result); }
    };
    function cdp(method, params = {}, sessionId) {
        return new Promise((resolve, reject) => {
            const key = ++id, timeout = setTimeout(() => { pending.delete(key); reject(new Error(`CDP timeout: ${method}`)); }, 45000);
            const targetSession = sessionId || (/^(Page|Runtime|Network|Fetch|Emulation)\./.test(method) ? mainSession : undefined);
            pending.set(key, { resolve, reject, timeout, method }); socket.send(JSON.stringify({ id: key, method, params, ...(targetSession ? { sessionId: targetSession } : {}) }));
        });
    }
    async function evaluate(expression) {
        const result = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
        assert(!result.exceptionDetails, JSON.stringify(result.exceptionDetails)); return result.result.value;
    }
    mainSession = (await cdp('Target.attachToTarget', { targetId: targets.find(target => target.type === 'page').id, flatten: true })).sessionId;
    await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('Network.enable');
    await cdp('Fetch.enable', { patterns: [{ urlPattern: 'https://*' }, { urlPattern: 'http://localhost:8000/*' }] });
    await cdp('Page.navigate',{url:'http://localhost:8000/'});
    const wait=async expression=>{for(let n=0;n<150;n++){if(await evaluate(expression))return;await delay(50);}throw Error('Wait failed: '+expression+'; status='+await evaluate('document.getElementById("drive-status")?.textContent')+'; mock requests='+JSON.stringify(drive.calls));};
    await wait('Boolean(globalThis.easyTimerDevelopment)');
    await wait('document.getElementById("primary")?.title?.length > 0');
    assert.equal(external.length,0,'No unsolicited Google traffic');
    const report=await evaluate("import('/tools/app-sync/experiments.mjs').then(m=>m.runApplicationExperiments())");
    assert.equal(report.count,14);assert(report.checks.every(c=>c.result==='PASS'));
    await writeFile(join(output,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
    const fixture={schemaVersion:1,templates:[{id:'ui-stable-id',name:'UI workshop',transitionMode:'manual',phases:[{id:'ui-phase',title:'Opening',durationSeconds:600}]}]};
    await evaluate(`document.querySelector('[data-language="en"]').click();localStorage.setItem('easyTimerTemplates',${JSON.stringify(JSON.stringify(fixture))});window.confirm=()=>true;document.getElementById('open-planner').click()`);
    await wait('Boolean(document.getElementById("drive-activate"))');
    assert.equal(await evaluate('document.querySelector(".planner-feedback").textContent'), '');
    assert.equal(await evaluate('document.getElementById("drive-disconnect").hidden'), true);
    await evaluate('document.getElementById("drive-activate").click()');
    await wait('localStorage.getItem("easyTimerDevelopmentSyncStorage")==="active" && !document.getElementById("drive-connect").disabled');
    await evaluate('document.getElementById("drive-connect").click()');await wait('Boolean(globalThis.google?.accounts?.oauth2)');
    await evaluate('document.getElementById("drive-connect").click()');await wait('!document.getElementById("drive-sync").disabled');
    await evaluate('document.getElementById("drive-sync").click()');await wait('document.getElementById("drive-status").textContent==="Synced (last checked)"');
    assert.equal(drive.files.size,1);
    await evaluate(`document.querySelector('[aria-label="Edit: UI workshop"]').click();document.getElementById("template-name").value="IDB workshop";document.getElementById("template-name").dispatchEvent(new Event("input"));document.querySelector("#planner form").requestSubmit()`);
    await wait(`Boolean(document.querySelector('[aria-label="Edit: IDB workshop"]'))`);
    assert.equal(await evaluate('JSON.parse(localStorage.getItem("easyTimerTemplates")).templates[0].name'),'UI workshop');
    assert.equal(await evaluate('document.getElementById("drive-status").textContent'),'Changes pending');
    await evaluate(`document.querySelector('[aria-label="Edit: IDB workshop"]').click();document.getElementById("template-name").value="Unsaved preserved";document.getElementById("template-name").dispatchEvent(new Event("input"));window.confirm=()=>false;document.querySelector(".planner-back").click()`);
    assert.equal(await evaluate('document.getElementById("template-name").value'),'Unsaved preserved');
    await evaluate('window.confirm=()=>true;document.querySelector("#planner form button[type=button]").focus();[...document.querySelectorAll("#planner button")].find(b=>b.textContent==="Cancel").click()');
    await wait('Boolean(document.getElementById("drive-sync"))');
    await cdp('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:output});
    await evaluate('document.getElementById("export-all").click()');
    let exported;for(let n=0;n<100;n++){try{exported=JSON.parse(await readFile(join(output,'easytimer-rundowns.json'),'utf8'));break;}catch{await delay(30);}}
    assert.equal(exported.templates[0].name,'IDB workshop');assert.equal(exported.templates[0].id,'ui-stable-id');
    for(const language of ['de','en'])for(const theme of ['light','dark','system']){
        await evaluate(`document.querySelector('[data-language="${language}"]').click();document.querySelector('[data-theme="${theme}"]').click()`);
        await cdp('Emulation.setDeviceMetricsOverride',{width:320,height:900,deviceScaleFactor:1,mobile:true});
        assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
        assert(await evaluate('document.getElementById("drive-connect").textContent.length>5'));
        await evaluate('document.getElementById("drive-connect").focus()');assert.equal(await evaluate('document.activeElement.id'),'drive-connect');
        const screenshot=await cdp('Page.captureScreenshot',{format:'png'});await writeFile(join(output,language+'-'+theme+'-320.png'),Buffer.from(screenshot.data,'base64'));
    }
    await cdp('Page.reload');await wait('Boolean(globalThis.easyTimerDevelopment)');await wait('document.getElementById("primary")?.title?.length > 0');
    await evaluate('document.getElementById("open-planner").click()');await wait(`Boolean(document.querySelector('[aria-label="Edit: IDB workshop"]'))`);
    assert.equal(await evaluate('document.getElementById("drive-status").textContent'),'Reconnect required');
    await evaluate('document.getElementById("drive-connect").click()');await wait('Boolean(globalThis.google?.accounts?.oauth2)');
    await evaluate('document.getElementById("drive-connect").click()');await wait('!document.getElementById("drive-sync").disabled');
    await evaluate('document.getElementById("drive-sync").click()');await wait('document.getElementById("drive-status").textContent==="Synced (last checked)"');
    const {browserContextId}=await cdp('Target.createBrowserContext');
    const {targetId}=await cdp('Target.createTarget',{url:'about:blank',browserContextId});
    const {sessionId}=await cdp('Target.attachToTarget',{targetId,flatten:true});
    const inSecond=async expression=>{const r=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true},sessionId);assert(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value;};
    const waitSecond=async expression=>{for(let n=0;n<150;n++){if(await inSecond(expression))return;await delay(50);}throw Error('Clean context wait failed: '+expression);};
    await cdp('Page.enable',{},sessionId);await cdp('Runtime.enable',{},sessionId);
    await cdp('Fetch.enable',{patterns:[{urlPattern:'https://*'},{urlPattern:'http://localhost:8000/*'}]},sessionId);
    await cdp('Page.navigate',{url:'http://localhost:8000/'},sessionId);await waitSecond('document.getElementById("primary")?.title?.length>0');
    assert.equal(await inSecond('localStorage.getItem("easyTimerTemplates")'),null);
    await inSecond(`window.confirm=()=>true;document.querySelector('[data-language="en"]').click();document.getElementById('open-planner').click()`);
    await waitSecond('Boolean(document.getElementById("drive-activate"))');
    assert.equal(await inSecond('document.querySelector(".planner-feedback").textContent'), '');
    assert.equal(await inSecond('document.getElementById("drive-disconnect").hidden'), true);
    await inSecond('globalThis.beforeSmokeReload=true');
    await cdp('Page.reload',{},sessionId);await waitSecond('!globalThis.beforeSmokeReload && document.getElementById("primary")?.title?.length>0');
    await inSecond('window.confirm=()=>true;document.getElementById("open-planner").click()');
    await waitSecond('Boolean(document.getElementById("drive-activate"))');
    assert.equal(await inSecond('document.querySelector(".planner-feedback").textContent'), '');
    await inSecond('document.getElementById("drive-activate").click()');
    await waitSecond('!document.getElementById("drive-connect").disabled');
    assert.equal(await inSecond('document.querySelector(".planner-feedback").textContent'), '');
    assert.equal(await inSecond('document.getElementById("drive-status").textContent'), 'Local only');
    assert.equal(await inSecond('localStorage.getItem("easyTimerTemplates")'), null);
    assert.deepEqual(await inSecond('easyTimerDevelopment.createStore().load()'), {schemaVersion:1,templates:[]});
    const emptyDownloads=join(output,'empty-library');await mkdir(emptyDownloads);
    await cdp('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:emptyDownloads,browserContextId});
    await inSecond('document.getElementById("drive-backup").click()');
    let emptyBackup;for(let n=0;n<100;n++){try{emptyBackup=await readFile(join(emptyDownloads,'easytimer-rundowns.json'),'utf8');if(emptyBackup.length)break;}catch{}await delay(30);}
    assert.equal(Buffer.byteLength(emptyBackup),44);assert.deepEqual(JSON.parse(emptyBackup),{schemaVersion:1,templates:[]});
    await inSecond('globalThis.originalCreateObjectURL=URL.createObjectURL;URL.createObjectURL=()=>{throw Error("INJECTED_DOWNLOAD_FAILURE")};document.getElementById("drive-backup").click()');
    await waitSecond('document.getElementById("drive-status").textContent.startsWith("The backup could not be prepared")');
    assert.deepEqual(await readdir(emptyDownloads), ['easytimer-rundowns.json']);
    assert.equal((await readFile(join(emptyDownloads,'easytimer-rundowns.json'))).length,44);
    await inSecond('URL.createObjectURL=globalThis.originalCreateObjectURL');
    console.log('PASS: fresh/reloaded/empty activated editor has no false errors, 44-byte downloaded JSON is valid, backup preparation failures are specific, disconnect is hidden before authorization.');
    await waitSecond('!document.getElementById("drive-connect").disabled');await inSecond('document.getElementById("drive-connect").click()');await waitSecond('Boolean(globalThis.google?.accounts?.oauth2)');
    await inSecond('document.getElementById("drive-connect").click()');await waitSecond('!document.getElementById("drive-sync").disabled');await inSecond('document.getElementById("drive-sync").click()');
    await waitSecond('!document.getElementById("drive-adopt").hidden');
    assert.equal(await inSecond('easyTimerDevelopment.createStore().load().then(data=>data.templates.length)'),0);
    await inSecond('document.getElementById("drive-adopt").click()');await waitSecond(`Boolean(document.querySelector('[aria-label="Edit: IDB workshop"]'))`);
    assert.equal(await inSecond('easyTimerDevelopment.createStore().load().then(data=>data.templates[0].id)'),'ui-stable-id');
    await inSecond(`document.querySelector('[aria-label="Edit: IDB workshop"]').click();document.getElementById('template-name').value='Second clean context';document.getElementById('template-name').dispatchEvent(new Event('input'));document.querySelector('#planner form').requestSubmit()`);
    await waitSecond(`Boolean(document.querySelector('[aria-label="Edit: Second clean context"]'))`);
    await inSecond('document.getElementById("drive-sync").click()');await waitSecond('document.getElementById("drive-status").textContent==="Synced (last checked)"');
    await evaluate('document.getElementById("drive-sync").click()');await wait(`Boolean(document.querySelector('[aria-label="Edit: Second clean context"]'))`);
    await cdp('Target.disposeBrowserContext',{browserContextId});
    console.log('PASS: independent clean browser context explicitly adopts stable IDs, edits, publishes and fast-forwards a clean first client.');
    assert.deepEqual(errors,[]);console.log('PASS: actual Editor activation/upload/edit/export/draft guards, reload, DE/EN/themes/320px and focus. Evidence: '+output);
    await cdp('Browser.close');
} finally {
    socket?.close(); browser.kill(); await new Promise(done => server.close(done)); await delay(500);
    assert(resolve(profile).startsWith(resolve(tmpdir()) + sep) && basename(profile).startsWith('easytimer-application-sync-browser-'), 'Cleanup target must be this test temporary profile');
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
}
