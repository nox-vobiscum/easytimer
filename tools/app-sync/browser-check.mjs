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
import { checkAccountHeader } from './account-browser.mjs';
const drive = fakeDrive();
let loseNextUploadAcknowledgement = false, blockResolutionReadback = false;
let profileFixture = null;
let changedHtmlVersion = false;
const server = await startServer({ port: 0, enabled: true, read: async file => {
    const body = await readFile(file);
    // Simulate updated HTML without restarting this already-running server.
    return changedHtmlVersion && basename(file) === 'index.html'
        ? Buffer.from(body.toString().replace(/js\/app\.js\?v=\d+/g, 'js/app.js?v=999')) : body;
} });
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
                    const script=`globalThis.google={accounts:{oauth2:{initTokenClient(config){globalThis.headerRequestedScope=config.scope;return {requestAccessToken(){globalThis.headerRequestCount=(globalThis.headerRequestCount||0)+1;globalThis.headerLastConfig=config;if(globalThis.headerAuthMode==='pending')return;if(globalThis.headerAuthMode==='cancel'){config.error_callback?.({type:'popup_closed'});return;}if(globalThis.headerAuthMode==='denied'){config.callback({error:'access_denied'});return;}if(globalThis.headerAuthMode==='incomplete'){config.callback({});return;}config.callback({access_token:'BROWSER_APPLICATION_FAKE_ONLY',expires_in:globalThis.headerTokenLifetime||3600,scope:'https://www.googleapis.com/auth/drive.appdata'})}}}}}};`;
                    await send('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'text/javascript'}],body:Buffer.from(script).toString('base64')});
                } else if(request.url.startsWith('https://www.googleapis.com/')) {
                    if (blockResolutionReadback && new URL(request.url).pathname.startsWith('/drive/v3/files/')) {
                        await send('Fetch.failRequest',{requestId,errorReason:'InternetDisconnected'});return;
                    }
                    let response=request.method==='OPTIONS'?new Response(null,{status:204}):await drive.fetch(request.url,{method:request.method,body:request.postData});
                    if (profileFixture && request.method === 'GET' && new URL(request.url).pathname === '/drive/v3/about') response = new Response(JSON.stringify({ user: { permissionId: 'synthetic-account-A', ...profileFixture } }));
                    if (loseNextUploadAcknowledgement && request.method==='POST' && request.url.includes('/upload/')) {
                        loseNextUploadAcknowledgement=false;blockResolutionReadback=true;
                        await send('Fetch.failRequest',{requestId,errorReason:'InternetDisconnected'});return;
                    }
                    await send('Fetch.fulfillRequest',{requestId,responseCode:response.status,responseHeaders:[{name:'Access-Control-Allow-Origin',value:'http://localhost:8000'},{name:'Access-Control-Allow-Methods',value:'GET,POST,OPTIONS'},{name:'Access-Control-Allow-Headers',value:'authorization,content-type'},{name:'Content-Type',value:'application/json'}],body:Buffer.from(await response.arrayBuffer()).toString('base64')});
                } else if (request.url === 'https://lh3.googleusercontent.com/header-fixture') {
                    await send('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'image/svg+xml' }, { name: 'Access-Control-Allow-Origin', value: '*' }], body: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28"><circle cx="14" cy="14" r="14" fill="#526078"/></svg>').toString('base64') });
                } else await send('Fetch.failRequest',{requestId,errorReason:'BlockedByClient'});
            })().catch(()=>send('Fetch.failRequest',{requestId,errorReason:'Failed'}).catch(()=>{}));
        }
        const task = pending.get(msg.id);
        if (task) { pending.delete(msg.id); clearTimeout(task.timeout); msg.error ? task.reject(new Error('CDP command failed: ' + task.method + ': ' + msg.error.message)) : task.resolve(msg.result); }
    };
    function cdp(method, params = {}, sessionId) {
        return new Promise((resolve, reject) => {
            const key = ++id, timeout = setTimeout(() => { pending.delete(key); reject(new Error(`CDP timeout: ${method}`)); }, 45000);
            const targetSession = sessionId || (/^(Page|Runtime|Network|Fetch|Emulation|Input)\./.test(method) ? mainSession : undefined);
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
    const conflicts=await evaluate("import('/tools/app-sync/conflict-experiments.mjs').then(m=>m.runConflictExperiments())");
    assert.equal(conflicts.count,28);assert(conflicts.checks.every(c=>c.result==='PASS'));console.log(JSON.stringify(conflicts,null,2));
    const diagnostics=await evaluate("import('/tools/app-sync/diagnostic-experiments.mjs').then(m=>m.runDiagnosticExperiments())");
    assert.equal(diagnostics.count,4);assert(diagnostics.checks.every(c=>c.result==='PASS'));console.log(JSON.stringify(diagnostics,null,2));
    await writeFile(join(output,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
    const fixture={schemaVersion:1,templates:[{id:'ui-stable-id',name:'UI workshop',transitionMode:'manual',phases:[{id:'ui-phase',title:'Opening',durationSeconds:600}]}]};
    await evaluate(`document.querySelector('[data-language="en"]').click();localStorage.setItem('easyTimerTemplates',${JSON.stringify(JSON.stringify(fixture))});window.confirm=()=>true;document.getElementById('open-planner').click()`);
    await wait('Boolean(document.getElementById("drive-activate"))');
    await wait('document.getElementById("drive-status").textContent==="Local only"');
    assert.equal(await evaluate('document.getElementById("data-backup").open'), false);
    assert.equal(await evaluate('document.querySelector(".backup-status-hint").hidden'), true, 'Optional disconnection is not an error');
    const disclosureTraffic = external.length;
    const disclosureLibrary = await evaluate('localStorage.getItem("easyTimerTemplates")');
    await evaluate('document.getElementById("backup-summary").click()');
    await evaluate('document.getElementById("backup-summary").click()');
    await evaluate('document.getElementById("backup-summary").click()');
    assert.equal(external.length, disclosureTraffic, 'Disclosure does not initiate Google traffic');
    assert.equal(await evaluate('localStorage.getItem("easyTimerTemplates")'), disclosureLibrary);
    assert.equal(await evaluate('document.querySelector(".planner-feedback").textContent'), '');
    assert.equal(await evaluate('document.getElementById("drive-disconnect").hidden'), true);
    const noAuthTraffic=external.length;
    await evaluate('document.getElementById("drive-diagnostics").click()');await wait('Boolean(document.getElementById("drive-diagnostic-text"))');
    assert.equal(await evaluate('JSON.parse(document.getElementById("drive-diagnostic-text").value).storage.readState'),'no-existing-connection');
    assert.equal(external.length,noAuthTraffic);assert.equal(await evaluate('document.getElementById("drive-diagnostic-text").readOnly'),true);
    await evaluate('document.querySelector("#drive-diagnostic-output button").click()');
    await evaluate('document.getElementById("drive-activate").click()');
    await wait('localStorage.getItem("easyTimerDevelopmentSyncStorage")==="active" && !document.getElementById("drive-connect").disabled');
    await evaluate('document.getElementById("drive-connect").click()');await wait('Boolean(globalThis.google?.accounts?.oauth2)');
    await evaluate('document.getElementById("drive-connect").click()');await wait('!document.getElementById("drive-sync").disabled');
    await evaluate('document.getElementById("drive-sync").click()');await wait('document.getElementById("drive-status").textContent==="Synced (last checked)"');
    assert.equal(drive.files.size,1);
    const activeToggleTraffic = external.length;
    const activeLibrary = await evaluate('easyTimerDevelopment.createStore().load()');
    await evaluate('globalThis.backupTransaction=IDBDatabase.prototype.transaction;globalThis.backupWrites=0;IDBDatabase.prototype.transaction=function(...a){if(a[1]&&a[1]!=="readonly")backupWrites++;return backupTransaction.apply(this,a)};document.getElementById("backup-summary").click()');
    await evaluate('document.getElementById("backup-summary").click()');
    assert.equal(await evaluate('globalThis.backupWrites'), 0, 'Activated disclosure never opens a write transaction');
    await evaluate('IDBDatabase.prototype.transaction=globalThis.backupTransaction');
    assert.equal(external.length, activeToggleTraffic);
    assert.deepEqual(await evaluate('easyTimerDevelopment.createStore().load()'), activeLibrary);
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
    changedHtmlVersion = true;
    await cdp('Page.reload');await wait('Boolean(globalThis.easyTimerDevelopment)');await wait('document.getElementById("primary")?.title?.length > 0');
    assert.equal(await evaluate('document.querySelector("script[type=module]").getAttribute("src")'), '/tools/app-sync/entry.mjs', 'A live server must retain the correct storage entry after a shell-version change');
    assert.equal(await evaluate('document.body.classList.contains("planner-open")'), true, 'Reload restores the asynchronous Development Editor without Google authorization');
    await evaluate('document.getElementById("open-planner").click()');await wait(`Boolean(document.querySelector('[aria-label="Edit: IDB workshop"]'))`);
    await wait('document.getElementById("drive-status").textContent==="Google Drive not connected. Reconnect if needed."');
    assert.equal(await evaluate('document.querySelector(".backup-status-hint").dataset.tone'), 'neutral', 'Missing memory-only authorization is not a sync error');
    assert.equal(await evaluate('document.querySelector(".backup-status-hint").textContent'), 'Google Drive not connected');
    assert.equal(await evaluate('getComputedStyle(document.querySelector(".backup-status-hint")).color===getComputedStyle(document.querySelector(".backup-subtitle")).color'), true);
    const signedOutTraffic = external.length;
    await evaluate('document.getElementById("backup-summary").click()');
    await evaluate('document.getElementById("backup-summary").click()');
    assert.equal(external.length, signedOutTraffic);
    await evaluate('document.querySelector("[data-language=de]").click()');
    await wait('document.querySelector(".backup-status-hint").textContent==="Google Drive nicht verbunden"');
    assert.equal(await evaluate('document.querySelector(".backup-status-hint").dataset.tone'), 'neutral');
    await evaluate('document.querySelector("[data-language=en]").click()');
    await wait('document.querySelector(".backup-status-hint").textContent==="Google Drive not connected"');
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
    await inSecond('document.getElementById("data-backup").open=false');
    assert.equal(await inSecond('document.querySelector(".backup-status-hint").hidden'), false, 'Backup error remains discoverable while collapsed');
    await inSecond('document.getElementById("data-backup").open=true');
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
    await evaluate(`document.querySelector('[aria-label="Edit: Second clean context"]').click();document.getElementById('template-name').value='Conflict first';document.getElementById('template-name').dispatchEvent(new Event('input'));document.querySelector('#planner form').requestSubmit()`);
    await wait(`Boolean(document.querySelector('[aria-label="Edit: Conflict first"]'))`);
    await inSecond(`document.querySelector('[aria-label="Edit: Second clean context"]').click();document.getElementById('template-name').value='Conflict second';document.getElementById('template-name').dispatchEvent(new Event('input'));document.querySelector('#planner form').requestSubmit()`);
    await waitSecond(`Boolean(document.querySelector('[aria-label="Edit: Conflict second"]'))`);
    await evaluate('document.getElementById("drive-sync").click()');await wait('document.getElementById("drive-status").textContent==="Synced (last checked)"');
    await inSecond('document.getElementById("drive-sync").click()');await waitSecond('!document.getElementById("drive-review").hidden');
    await evaluate('document.getElementById("drive-sync").click()');await wait('!document.getElementById("drive-review").hidden');
    const conflictLibrary = await evaluate('easyTimerDevelopment.createStore().load()');
    await evaluate('document.getElementById("drive-disconnect").click()');
    await wait('document.getElementById("drive-status").textContent.includes("locally known conflict")');
    assert.equal(await evaluate('document.querySelector(".backup-status-hint").dataset.tone'), 'attention', 'Known local conflicts remain discoverable without authorization');
    await evaluate('document.getElementById("data-backup").open=false');
    assert.equal(await evaluate('document.querySelector(".backup-status-hint").hidden'), false);
    assert.deepEqual(await evaluate('easyTimerDevelopment.createStore().load()'), conflictLibrary);
    await evaluate('document.getElementById("data-backup").open=true;document.getElementById("drive-connect").click()');
    await wait('!document.getElementById("drive-review").disabled');
    for(const language of ['de','en'])for(const theme of ['light','dark','system']){
        await evaluate(`document.querySelector('[data-language="${language}"]').click();document.querySelector('[data-theme="${theme}"]').click()`);
        await cdp('Emulation.setDeviceMetricsOverride',{width:theme==='light'?1280:320,height:900,deviceScaleFactor:1,mobile:theme!=='light'});
        await evaluate('document.getElementById("drive-review").click()');await wait('Boolean(document.getElementById("drive-conflict-review"))');
        assert.equal(await evaluate('document.querySelectorAll("#drive-conflict-review input:checked").length'),0);
        assert.equal(await evaluate('document.activeElement.id'),'drive-conflict-title');
        assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
        await evaluate('document.querySelector("#drive-conflict-review input").focus()');
        await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowDown',code:'ArrowDown',windowsVirtualKeyCode:40});
        await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowDown',code:'ArrowDown',windowsVirtualKeyCode:40});
        assert.equal(await evaluate('document.querySelector("#drive-conflict-review input:checked").value'),'right');
        const reviewTraffic = external.length;
        await evaluate('document.getElementById("data-backup").open=false');
        await wait('document.getElementById("data-backup").open');
        assert.equal(await evaluate('document.querySelector("#drive-conflict-review input:checked").value'), 'right', 'Collapse cannot hide or discard an active review');
        assert.equal(external.length, reviewTraffic);
        await evaluate('document.getElementById("drive-conflict-review").scrollIntoView()');
        const shot=await cdp('Page.captureScreenshot',{format:'png'});await writeFile(join(output,'conflict-'+language+'-'+theme+'.png'),Buffer.from(shot.data,'base64'));
    }
    await evaluate('document.querySelector("#drive-conflict-review input[value=both]").click();document.getElementById("drive-preview-resolution").click()');
    await wait('Boolean(document.getElementById("drive-confirm-resolution"))');
    assert.equal(await evaluate('easyTimerDevelopment.createStore().load().then(d=>d.templates.length)'),1,'Preview must not mutate local library');
    loseNextUploadAcknowledgement=true;
    await evaluate('document.getElementById("drive-confirm-resolution").click()');await wait('document.getElementById("drive-status").textContent.startsWith("Synchronization failed")');
    const pendingTraffic=external.length,pendingStatus=await evaluate('document.getElementById("drive-status").textContent');
    await evaluate('document.getElementById("drive-diagnostics").click()');await wait('Boolean(document.getElementById("drive-diagnostic-text"))');
    const pendingDiagnostic=await evaluate('JSON.parse(document.getElementById("drive-diagnostic-text").value)');
    assert.equal(pendingDiagnostic.reconciliation.present,true);assert.equal(pendingDiagnostic.reconciliation.stage,'prepared');
    assert.equal(pendingDiagnostic.reconciliation.acknowledgement,'not-locally-verified');
    assert.equal(external.length,pendingTraffic);assert.equal(await evaluate('document.getElementById("drive-status").textContent'),pendingStatus);
    const resolutionPosts=drive.calls.filter(c=>c.method==='POST').length;
    await evaluate('globalThis.beforeRecoveryReload=true');await cdp('Page.reload');await wait('!globalThis.beforeRecoveryReload && document.getElementById("primary")?.title?.length>0');
    blockResolutionReadback=false;
    await evaluate('document.getElementById("open-planner").click()');await wait('Boolean(document.getElementById("drive-connect"))');
    await wait('document.querySelector(".backup-status-hint").dataset.tone==="attention"');
    await evaluate('document.getElementById("drive-connect").click()');await wait('Boolean(globalThis.google?.accounts?.oauth2)');
    await evaluate('document.getElementById("drive-connect").click()');await wait('!document.getElementById("drive-sync").disabled');
    await evaluate('document.getElementById("drive-sync").click()');await wait('document.getElementById("drive-status").textContent==="Synced (last checked)"');
    assert.equal(drive.calls.filter(c=>c.method==='POST').length,resolutionPosts,'Page reload must recover the exact reconciliation using GET only');
    const resolved=await evaluate('easyTimerDevelopment.createStore().load()');
    assert.equal(resolved.templates.length,2);assert(resolved.templates[1].name.endsWith(' (1)'));
    await inSecond('document.getElementById("drive-sync").click()');await waitSecond('document.getElementById("drive-status").textContent==="Synced (last checked)"');
    assert.deepEqual(await inSecond('easyTimerDevelopment.createStore().load()'),resolved);
    console.log('PASS: actual two-context conflict, no default, DE/EN Light/Dark/System desktop/320px, native radio keyboard, explicit preview/confirmation and clean peer adoption.');
    const sameEdit=`[...document.querySelectorAll('#planner button')].find(b=>b.getAttribute('aria-label')===${JSON.stringify('Edit: '+resolved.templates[0].name)}).click();document.getElementById('template-name').value='Same content, new history';document.getElementById('template-name').dispatchEvent(new Event('input'));document.querySelector('#planner form').requestSubmit()`;
    await evaluate(sameEdit);await wait(`Boolean(document.querySelector('[aria-label="Edit: Same content, new history"]'))`);
    await inSecond(sameEdit);await waitSecond(`Boolean(document.querySelector('[aria-label="Edit: Same content, new history"]'))`);
    await evaluate('document.getElementById("drive-sync").click()');await wait('document.getElementById("drive-status").textContent==="Synced (last checked)"');
    await inSecond('document.getElementById("drive-sync").click()');await waitSecond('!document.getElementById("drive-review").hidden');
    await evaluate('document.getElementById("drive-sync").click()');await wait('!document.getElementById("drive-review").hidden');
    const beforeFree=await evaluate('easyTimerDevelopment.createStore().load()'),beforeFreePosts=drive.calls.filter(c=>c.method==='POST').length;
    for(const language of ['de','en'])for(const theme of ['light','dark','system']){
        await evaluate(`document.querySelector('[data-language="${language}"]').click();document.querySelector('[data-theme="${theme}"]').click()`);
        await cdp('Emulation.setDeviceMetricsOverride',{width:theme==='light'?1280:320,height:900,deviceScaleFactor:1,mobile:theme!=='light'});
        await evaluate('document.getElementById("drive-review").click()');await wait('Boolean(document.getElementById("drive-confirm-resolution"))');
        assert.equal(await evaluate('document.querySelectorAll("#drive-conflict-review input[type=radio]").length'),0);
        assert.equal(await evaluate('document.getElementById("drive-conflict-title").textContent'),language==='de'?'Zusammenführung prüfen':'Review reconciliation');
        assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
        for(const t of beforeFree.templates)assert(await evaluate(`document.getElementById('drive-conflict-review').textContent.includes(${JSON.stringify(t.name)})`));
        assert.deepEqual(await evaluate('easyTimerDevelopment.createStore().load()'),beforeFree);
        assert.equal(drive.calls.filter(c=>c.method==='POST').length,beforeFreePosts,'No automatic publication on review or theme changes');
        await evaluate('document.getElementById("drive-confirm-resolution").focus()');assert.equal(await evaluate('document.activeElement.id'),'drive-confirm-resolution');
        const shot=await cdp('Page.captureScreenshot',{format:'png'});await writeFile(join(output,'proposed-'+language+'-'+theme+'.png'),Buffer.from(shot.data,'base64'));
    }
    loseNextUploadAcknowledgement=true;
    await cdp('Page.bringToFront');
    await evaluate('document.getElementById("drive-confirm-resolution").focus()');
    await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'});
    await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
    await wait('document.getElementById("drive-status").textContent.startsWith("Synchronization failed")');
    const freePosts=drive.calls.filter(c=>c.method==='POST').length;
    await evaluate('globalThis.beforeFreeReload=true');await cdp('Page.reload');await wait('!globalThis.beforeFreeReload && document.getElementById("primary")?.title?.length>0');
    blockResolutionReadback=false;
    await evaluate('document.getElementById("open-planner").click()');await wait('Boolean(document.getElementById("drive-connect"))');
    await evaluate('document.getElementById("drive-connect").click()');await wait('Boolean(globalThis.google?.accounts?.oauth2)');
    await evaluate('document.getElementById("drive-connect").click()');await wait('!document.getElementById("drive-sync").disabled');
    await evaluate('document.getElementById("drive-sync").click()');await wait('document.getElementById("drive-status").textContent==="Synced (last checked)"');
    assert.equal(drive.calls.filter(c=>c.method==='POST').length,freePosts,'Conflict-free page reload recovers using GET only');
    assert.deepEqual(await evaluate('easyTimerDevelopment.createStore().load()'),beforeFree);
    await inSecond('document.getElementById("drive-sync").click()');await waitSecond('document.getElementById("drive-status").textContent==="Synced (last checked)"');
    assert.deepEqual(await inSecond('easyTimerDevelopment.createStore().load()'),beforeFree);
    console.log('PASS: conflict-free actual UI, complete preview/no choices, DE/EN/themes/320px, explicit keyboard confirmation, simulated lost acknowledgement and real page reload GET-only recovery.');
    const beforeLaunchCalls = drive.calls.length;
    await evaluate('document.querySelector(".rundown-launch").click()');
    await wait('!document.body.classList.contains("planner-open") && document.getElementById("status").textContent==="Ready"');
    assert.equal(await evaluate('document.activeElement.id'), 'primary');
    assert.deepEqual(await evaluate('easyTimerDevelopment.createStore().load()'), beforeFree);
    assert.equal(drive.calls.length, beforeLaunchCalls, 'Direct launch reads asynchronous local storage without Google requests');
    await evaluate('document.getElementById("open-planner").click()');
    await wait('Boolean(document.querySelector(".rundown-launch"))');
    console.log('PASS: direct Session launch through asynchronous activated IndexedDB, READY/focus, saved library and remote transport unchanged.');
    await cdp('Target.disposeBrowserContext',{browserContextId});
    console.log('PASS: independent clean browser context explicitly adopts stable IDs, edits, publishes and fast-forwards a clean first client.');
    await evaluate('document.querySelector(".planner-back").click();document.getElementById("primary").click()');
    const runtimeBeforeCreate = await evaluate("JSON.parse(localStorage.getItem('easyTimerRuntime.v1.'+sessionStorage.getItem('easyTimerRuntimeContext.v1')))");
    assert.equal(runtimeBeforeCreate.mode, 'session'); assert.equal(runtimeBeforeCreate.clock.status, 'RUNNING');
    await evaluate('globalThis.beforeCreateReload=true'); await cdp('Page.reload');
    await wait('!globalThis.beforeCreateReload && Boolean(globalThis.easyTimerDevelopment) && document.getElementById("primary")?.title?.length>0');
    const restoredForCreate = await evaluate("JSON.parse(localStorage.getItem('easyTimerRuntime.v1.'+sessionStorage.getItem('easyTimerRuntimeContext.v1')))");
    assert.equal(restoredForCreate.run.runId, runtimeBeforeCreate.run.runId);
    assert.equal(restoredForCreate.clock.deadlineMs, runtimeBeforeCreate.clock.deadlineMs);
    const libraryBeforeCreate = await evaluate('easyTimerDevelopment.createStore().load()');
    const legacyBeforeCreate = await evaluate('localStorage.getItem("easyTimerTemplates")');
    const callsBeforeCreate = drive.calls.length;
    await evaluate('document.getElementById("open-planner").click()');
    await wait('Boolean(document.getElementById("data-backup"))');
    assert.equal(await evaluate('document.querySelector(".planner-feedback").textContent'), '');
    await evaluate('Array.from(document.querySelectorAll("#planner button")).find(b=>b.textContent==="Create Rundown").click()');
    const enter = (selector, value) => evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}))})()`);
    await enter('#template-name', 'REL-001B acceptance fixture');
    for (let i = 0; i < 3; i++) {
        if (i) await evaluate('Array.from(document.querySelectorAll("#planner button")).find(b=>b.textContent==="+ Add phase").click()');
        await enter(`.phase-list li:nth-child(${i + 1}) .phase-title input`, `Phase ${String(i + 1).padStart(2, '0')}`);
        await enter(`.phase-list li:nth-child(${i + 1}) .phase-duration input`, String([5, 10, 5][i]));
    }
    await evaluate('document.querySelector("#planner form").requestSubmit()');
    await wait('!document.getElementById("template-name") && document.querySelector(".planner-feedback").textContent==="Template saved."');
    const libraryAfterCreate = await evaluate('easyTimerDevelopment.createStore().load()');
    assert.deepEqual(libraryAfterCreate.templates.filter(t=>t.name!=='REL-001B acceptance fixture'), libraryBeforeCreate.templates);
    assert.deepEqual(libraryAfterCreate.templates.find(t=>t.name==='REL-001B acceptance fixture').phases.map(p=>p.durationSeconds), [300,600,300]);
    assert.equal(await evaluate('localStorage.getItem("easyTimerTemplates")'), legacyBeforeCreate);
    const runtimeAfterCreate = await evaluate("JSON.parse(localStorage.getItem('easyTimerRuntime.v1.'+sessionStorage.getItem('easyTimerRuntimeContext.v1')))");
    assert.equal(runtimeAfterCreate.run.runId, runtimeBeforeCreate.run.runId);
    assert.equal(runtimeAfterCreate.clock.deadlineMs, runtimeBeforeCreate.clock.deadlineMs);
    assert.equal(drive.calls.length, callsBeforeCreate, 'Local creation after recovery makes no Google calls');
    console.log('PASS: changed shell on a live server retains development entry; after Session recovery, a new manual 5/10/5-minute Rundown saves to real IndexedDB while existing definitions, legacy storage and active Run remain intact.');
    await checkAccountHeader({ evaluate, cdp, wait, drive, external, output, setProfile: value => { profileFixture = value; } });
    assert.deepEqual(errors,[]);console.log('PASS: actual Editor activation/upload/edit/export/draft guards, reload, DE/EN/themes/320px and focus. Evidence: '+output);
    await cdp('Browser.close');
} finally {
    socket?.close(); browser.kill(); await new Promise(done => server.close(done)); await delay(500);
    assert(resolve(profile).startsWith(resolve(tmpdir()) + sep) && basename(profile).startsWith('easytimer-application-sync-browser-'), 'Cleanup target must be this test temporary profile');
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
}
