import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createVirtualClock } from './virtual-clock.mjs';
import { exportFilename } from '../src/js/portability.mjs';

export async function checkPortability({evaluate,click,text,cdp,configure}) {
    const baseline=await evaluate(`localStorage.getItem('easyTimerTemplates')`),clock=createVirtualClock(evaluate);
    const output=await mkdtemp(join(tmpdir(),'easytimer-data-review-')),images=[];
    const one={id:'data-example',name:'Example Rundown',transitionMode:'manual',phases:[{id:'data-opening',title:'Opening',durationSeconds:600}]};
    const two={id:'data-auto',name:'Automatic Rundown',transitionMode:'automatic',phases:[{id:'data-phase',title:'Discussion',durationSeconds:900},{id:'data-close',title:'Closing',durationSeconds:60}]};
    const library={schemaVersion:1,templates:[one,two]},single={schemaVersion:1,templates:[one]};
    const raw=()=>evaluate(`localStorage.getItem('easyTimerTemplates')`);
    const menu=async selector=>{if(await evaluate(`document.querySelector('#preferences').hidden`))await click('#menu-toggle');await click(selector);};
    const open=()=>menu('#open-planner');
    const action=label=>evaluate(`Array.from(document.querySelectorAll('#planner button')).find(b=>(b.textContent===${JSON.stringify(label)}||b.getAttribute('aria-label')?.startsWith(${JSON.stringify(label)}+': '))).click()`);
    const field=(selector,value)=>evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    const wait=async expression=>{for(let i=0;i<100;i++){if(await evaluate(expression))return;await delay(25);}assert.fail('Timed out: '+expression);};
    const upload=async(value,name='rundowns.json')=>{
        await evaluate("if(document.getElementById('data-backup'))document.getElementById('data-backup').open=true");
        const content=typeof value==='string'?value:JSON.stringify(value);
        await evaluate(`(()=>{const transfer=new DataTransfer();transfer.items.add(new File([${JSON.stringify(content)}],${JSON.stringify(name)},{type:'application/json'}));const input=document.querySelector('#rundown-import-file');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
        await wait(`Boolean(document.querySelector('#import-heading'))||Boolean(document.querySelector('#planner-feedback')?.textContent)`);
    };
    const capture=async(name,label)=>{
        const size=await evaluate(`({width:innerWidth,height:Math.max(innerHeight,document.documentElement.scrollHeight)})`);
        const shot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,...size,scale:1}});
        await writeFile(join(output,name+'.png'),Buffer.from(shot.data,'base64'));images.push([name+'.png',label]);
    };
    const device=async width=>{await cdp('Emulation.setTouchEmulationEnabled',{enabled:width===320});await cdp('Emulation.setDeviceMetricsOverride',{width,height:width===320?568:800,screenWidth:width,screenHeight:width===320?568:800,mobile:width===320,deviceScaleFactor:1});};
    const download=async(selector,filename)=>{
        const directory=await mkdtemp(join(output,'download-'));
        await cdp('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:directory});
        await click(selector);
        for(let i=0;i<100;i++) {try{return JSON.parse(await readFile(join(directory,filename),'utf8'));}catch{await delay(25);}}
        assert.fail('Expected native JSON download: '+filename);
    };
    await device(1280);await click('[data-language="en"]');await clock.install(await evaluate('Date.now()'));
    await evaluate(`window.dataConfirm=window.confirm;window.dataAccept=true;window.confirm=()=>window.dataAccept;localStorage.setItem('easyTimerTemplates',${JSON.stringify(JSON.stringify(library))})`);
    try {
        await configure(0,5,0);await click('#primary');await clock.advance('40s');await open();
        const activeTime=await text('#time'),initial=await raw();
        assert.equal(await text('#export-all'),'Export all as JSON');
        await click('[data-language="de"]');assert.equal(await text('#export-all'),'Alle als JSON exportieren');await click('[data-language="en"]');
        await click('#backup-summary');
        assert.equal(await evaluate(`document.querySelector('#rundown-import-file').type==='file'&&document.querySelector('#rundown-import-file').accept.includes('.json')&&document.querySelector('#rundown-import-file').getBoundingClientRect().height>=44`),true,'Import uses a visible labelled native file control');
        assert.deepEqual(await download('.template-library li:first-child .rundown-export',exportFilename(one.name)),single);
        assert.deepEqual(await download('#export-all','easytimer-rundowns.json'),library);
        assert.equal(await raw(),initial);assert.equal(await text('#time'),activeTime,'Library downloads do not change the active Quick Timer');
        await clock.advance('10s');assert.equal(await text('#time'),'04:10');
        await upload(single,'single.json');assert.equal(await raw(),initial);
        assert.match(await text('.import-review'),/Matching ID|Possible duplicate/);assert.equal(await evaluate('document.activeElement.id'),'import-heading');
        await click('#cancel-import');assert.equal(await raw(),initial);assert.equal(await evaluate('document.activeElement.id'),'rundown-import-file');
        await upload(single);await click('#confirm-import');
        assert.equal(await evaluate('document.activeElement.id'),'template-name');assert.equal(await evaluate(`document.querySelector('#template-name').value`),one.name);
        const importedPhase=await evaluate(`document.querySelector('.phase-list li').dataset.phaseId`);assert.notEqual(importedPhase,one.phases[0].id);
        assert.equal(await evaluate(`document.querySelector('.phase-duration input').value`),'10');assert.equal(await raw(),initial);
        await evaluate('window.dataAccept=false');await click('.planner-back');assert.equal(await evaluate(`Boolean(document.querySelector('#planner form'))`),true,'An imported populated draft is protected before the first edit');
        await menu('#open-session');assert.equal(await evaluate('document.body.dataset.mode'),'quick','Cancel guards also protect mode departure');
        if(!await evaluate(`document.querySelector('#preferences').hidden`))await click('#menu-toggle');
        await evaluate('window.dataAccept=true');await field('#template-name','Imported edited');await action('Save');
        let saved=JSON.parse(await raw());assert.equal(saved.templates.length,3);assert.equal(saved.templates[2].phases[0].id,importedPhase);assert.deepEqual(saved.templates.slice(0,2),library.templates);
        const newId=saved.templates[2].id;assert.notEqual(newId,one.id);
        await click('.planner-back');await menu('#open-session');
        await evaluate(`(()=>{const e=document.querySelector('#session-template');e.value=${JSON.stringify(newId)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`);await click('#prepare-session');await click('#primary');await clock.advance('1s');
        assert.equal(await text('#time'),'09:59','Imported edited Rundown executes through the existing engine');
        const sessionTime=await text('#time');
        await evaluate(`window.dataCreateURL=URL.createObjectURL;URL.createObjectURL=()=>{throw new Error('download unavailable');}`);
        await click('#export-rundown');assert.match(await text('#export-feedback'),/could not be prepared/);
        await click('[data-language="de"]');assert.match(await text('#export-feedback'),/konnte nicht vorbereitet/);
        await evaluate('URL.createObjectURL=window.dataCreateURL');await click('[data-language="en"]');
        const expectedRun={schemaVersion:1,templates:[saved.templates[2]]};
        await evaluate(`(()=>{const data=JSON.parse(localStorage.getItem('easyTimerTemplates'));data.templates.find(t=>t.id===${JSON.stringify(newId)}).name='Changed source';localStorage.setItem('easyTimerTemplates',JSON.stringify(data));})()`);
        const exportedRun=await download('#export-rundown',exportFilename('Imported edited'));assert.deepEqual(exportedRun,expectedRun);assert.equal(await text('#time'),sessionTime);assert.equal(await text('#status'),'Running');
        assert.doesNotMatch(JSON.stringify(exportedRun),/deadline|remaining|runId|overtime|currentIndex/);
        if(!await evaluate(`document.querySelector('#preferences').hidden`))await click('#menu-toggle');
        await menu('#open-quick');await evaluate(`localStorage.setItem('easyTimerTemplates',${JSON.stringify(JSON.stringify(library))})`);await open();
        await upload(library);await click('#confirm-import');saved=JSON.parse(await raw());assert.equal(saved.templates.length,4);assert.deepEqual(saved.templates.slice(0,2),library.templates);
        assert.equal(saved.templates[3].transitionMode,'automatic');assert.deepEqual(saved.templates[3].phases.map(p=>p.durationSeconds),[900,60]);
        await upload(library);await click('#confirm-import');assert.equal(JSON.parse(await raw()).templates.length,6,'Reimport creates copies, not merges');
        await upload(library);const beforeConflict=await raw();
        await evaluate(`void(window.dataOther=window.open(location.href,'data-portability-conflict'))`);
        await wait(`window.dataOther?.document.querySelector('#primary')?.title`);
        await evaluate(`(()=>{const data=JSON.parse(window.dataOther.localStorage.getItem('easyTimerTemplates'));data.templates[0].name='Remote revision';window.dataOther.localStorage.setItem('easyTimerTemplates',JSON.stringify(data));})()`);
        await delay(50);const remote=await raw();assert.notEqual(remote,beforeConflict);
        await click('#confirm-import');assert.equal(await raw(),remote);assert.equal(await evaluate(`Boolean(document.querySelector('#import-heading'))`),true);assert.equal(await text('#planner-feedback'),'Import blocked: Rundowns changed in another tab. Existing Rundowns remain unchanged; the import preview is retained.');
        await click('[data-language="de"]');assert.equal(await text('#planner-feedback'),'Import blockiert: Rundowns wurden in einem anderen Tab geändert. Bestehende Rundowns bleiben unverändert; die Importvorschau bleibt erhalten.');await click('[data-language="en"]');
        await capture('conflict','Conflict keeps the review and remote data');
        await evaluate('window.dataOther.close()');await cdp('Page.bringToFront');await click('#refresh-import');
        await evaluate(`window.dataSetItem=Storage.prototype.setItem;window.dataWrites=0;Storage.prototype.setItem=function(key,value){if(key==='easyTimerTemplates'){window.dataWrites++;throw new Error('quota');}return window.dataSetItem.call(this,key,value);}`);
        await click('#confirm-import');assert.equal(await raw(),remote);assert.equal(await evaluate('window.dataWrites'),1);assert.equal(await text('#planner-feedback'),'Import failed: the data could not be saved. Existing Rundowns remain unchanged; the import preview is retained.');
        await click('[data-language="de"]');assert.equal(await text('#planner-feedback'),'Import fehlgeschlagen: Die Daten konnten nicht gespeichert werden. Bestehende Rundowns bleiben unverändert; die Importvorschau bleibt erhalten.');await click('[data-language="en"]');
        assert.equal(await evaluate(`Boolean(document.querySelector('#import-heading'))`),true);await capture('quota-failure','Failed write preserves data and complete preview');
        await evaluate('Storage.prototype.setItem=window.dataSetItem');await click('#confirm-import');assert.equal(JSON.parse(await raw()).templates.length,8);
        await upload('{','broken.json');assert.match(await text('#planner-feedback'),/not valid JSON/);
        await evaluate(`window.dataFileText=File.prototype.text;File.prototype.text=()=>Promise.reject(new Error('read failure'))`);await upload(single);assert.match(await text('#planner-feedback'),/could not be read/);await evaluate('File.prototype.text=window.dataFileText');
        await evaluate(`(()=>{const transfer=new DataTransfer();transfer.items.add(new File([new Uint8Array(10*1024*1024+1)],'large.json'));const input=document.querySelector('#rundown-import-file');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
        assert.match(await text('#planner-feedback'),/too large/);
        await upload({schemaVersion:1,templates:[one,{...two,phases:[]} ]});assert.match(await text('#planner-feedback'),/invalid Rundowns/);assert.equal(JSON.parse(await raw()).templates.length,8,'One invalid batch entry imports nothing');
        const unsafe={schemaVersion:1,templates:[{...one,name:'<img src=x onerror=window.dataPwned=true>'}]};
        await upload(unsafe,'<img onerror=bad>.json');assert.match(await text('.import-review'),/<img/);assert.equal(await evaluate(`Boolean(document.querySelector('#planner img'))||Boolean(window.dataPwned)`),false);await click('#cancel-import');
        // An asynchronous file read cannot replace a subsequently opened draft.
        await evaluate(`File.prototype.text=()=>new Promise(resolve=>window.dataReadResolve=resolve);(()=>{const transfer=new DataTransfer();transfer.items.add(new File(['{}'],'pending.json'));const input=document.querySelector('#rundown-import-file');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
        await action('Create Rundown');await field('#template-name','Keep this draft');await evaluate(`File.prototype.text=window.dataFileText;window.dataReadResolve(${JSON.stringify(JSON.stringify(single))})`);await delay(25);
        assert.equal(await evaluate(`document.querySelector('#template-name').value`),'Keep this draft');assert.equal(await evaluate(`Boolean(document.querySelector('#import-heading'))`),false);await action('Cancel');
        await upload({schemaVersion:1,templates:Array.from({length:50},(_,i)=>({...one,id:'large-'+i,name:'Rundown '+(i+1)}))});
        assert.equal(await evaluate(`(()=>{const list=document.querySelector('.import-list');list.focus();return list.scrollHeight>list.clientHeight&&list.clientHeight<=innerHeight*.45+1;})()`),true,'A large import review stays bounded and independently scrollable');
        await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'End',code:'End',windowsVirtualKeyCode:35});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'End',code:'End',windowsVirtualKeyCode:35});
        await wait(`document.querySelector('.import-list').scrollTop>0`);await capture('large-review','Keyboard-scrollable 50-Rundown review');await click('#cancel-import');
        await click('.planner-back');await evaluate(`localStorage.setItem('easyTimerTemplates',${JSON.stringify(JSON.stringify(library))})`);await open();
        for(const width of [1280,320])for(const language of ['de','en'])for(const theme of ['light','dark']) {
            await device(width);await click(`[data-language="${language}"]`);await click(`[data-theme="${theme}"]`);
            assert.equal(await text('#backup-heading'),language==='de'?'Daten & Sicherung':'Data & Backup');
            assert.equal(await evaluate(`document.documentElement.scrollWidth<=innerWidth&&[...document.querySelectorAll('.template-library button')].every(b=>{const r=b.getBoundingClientRect();return r.width>=44&&r.height>=44;})`),true);
            await capture(`library-${width}-${language}-${theme}`,`Library / contextual export / Data & Backup ${width}px ${language} ${theme}`);
            await upload(single);assert.equal(await text('#confirm-import'),language==='de'?'Als ungespeicherten Entwurf öffnen':'Open as unsaved draft');
            await capture(`single-${width}-${language}-${theme}`,`Single review / collisions ${width}px ${language} ${theme}`);await click('#cancel-import');
            await upload(library);await evaluate(`document.querySelector('#confirm-import').focus()`);
            await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});assert.equal(await evaluate('document.activeElement.id'),'cancel-import');
            assert.equal(await evaluate(`document.documentElement.scrollWidth<=innerWidth&&document.querySelector('.import-list').clientHeight<=innerHeight*.45+1`),true);
            await capture(`bulk-${width}-${language}-${theme}`,`Bulk review / new copies ${width}px ${language} ${theme}`);await click('#cancel-import');
            await upload('{');await capture(`invalid-${width}-${language}-${theme}`,`Invalid file ${width}px ${language} ${theme}`);
            await upload(library);await click('#confirm-import');await capture(`success-${width}-${language}-${theme}`,`Successful additive import ${width}px ${language} ${theme}`);
            await click('.planner-back');await evaluate(`localStorage.setItem('easyTimerTemplates',${JSON.stringify(JSON.stringify(library))})`);await open();
        }
        // Empty backup behavior and offline-capable native downloads.
        await click('.planner-back');await evaluate(`localStorage.setItem('easyTimerTemplates',JSON.stringify({schemaVersion:1,templates:[]}))`);await open();assert.equal(await evaluate(`document.querySelector('#export-all').disabled`),true);
        await click('.planner-back');await evaluate(`localStorage.setItem('easyTimerTemplates',${JSON.stringify(JSON.stringify(library))})`);await open();
        await cdp('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:-1,uploadThroughput:-1});assert.deepEqual(await download('#export-all','easytimer-rundowns.json'),library);await upload(single);assert.equal(await text('#confirm-import'),'Open as unsaved draft');await click('#cancel-import');await cdp('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
        if(process.env.EASYTIMER_DATA_BEFORE)for(const width of [1280,320])for(const language of ['de','en'])for(const theme of ['light','dark']) {
            const file=`before-${width}-${language}-${theme}.png`;await copyFile(join(process.env.EASYTIMER_DATA_BEFORE,file),join(output,file));images.unshift([file,`BEFORE library ${width}px ${language} ${theme}`]);
        }
        await writeFile(join(output,'index.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>DATA-001 review</title><style>body{font:16px system-ui;margin:24px;background:#f6f8fc;color:#172337}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr));gap:20px}img{width:100%;border:1px solid #c8d1e0}h2{font-size:16px}</style><h1>DATA-001 visual acceptance</h1><p>Native downloads, additive import review and error retention. All files and screenshots are temporary test artifacts outside the repository.</p><main>${images.map(([file,label])=>`<article><h2>${label}</h2><a href="${file}"><img src="${file}" alt="${label}" loading="lazy"></a></article>`).join('')}</main></html>`);
        console.log(`PASS: real JSON downloads/offline, single/bulk import, fresh IDs, edit/run/export snapshot, cancel/dirty/read-race guards, actual cross-tab conflict, quota safety, unsafe content, native file errors and responsive localized review. Gallery: ${join(output,'index.html')}`);
    } finally {
        await clock.restore();
        await evaluate(`window.dataOther?.close();window.confirm=()=>true;if(window.dataCreateURL)URL.createObjectURL=window.dataCreateURL;if(window.dataSetItem)Storage.prototype.setItem=window.dataSetItem;if(window.dataFileText)File.prototype.text=window.dataFileText;${baseline===null?"localStorage.removeItem('easyTimerTemplates')":`localStorage.setItem('easyTimerTemplates',${JSON.stringify(baseline)})`};`);
        await cdp('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});await cdp('Browser.setDownloadBehavior',{behavior:'default'});
        await device(1280);await click('[data-language="en"]');await click('[data-theme="system"]');
        if(!await evaluate(`document.querySelector('#planner').hidden`))await click('.planner-back');
        await menu('#open-quick');if(!await evaluate(`document.querySelector('#preferences').hidden`))await click('#menu-toggle');
        await evaluate('window.confirm=window.dataConfirm');
    }
}
