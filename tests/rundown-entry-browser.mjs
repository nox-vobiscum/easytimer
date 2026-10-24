import assert from 'node:assert/strict';
import { mkdtemp, writeFile, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createVirtualClock } from './virtual-clock.mjs';

export async function checkRundownEntry({evaluate,click,text,cdp}) {
    const baseline=await evaluate(`localStorage.getItem('easyTimerTemplates')`);
    const library={schemaVersion:1,templates:[
        {id:'entry-manual',name:'Example Rundown',transitionMode:'manual',phases:[{id:'entry-opening',title:'Opening',durationSeconds:600}]},
        {id:'entry-auto',name:'Automatic Rundown',transitionMode:'automatic',phases:[{id:'entry-auto-phase',title:'Automatic opening',durationSeconds:900}]},
    ]};
    const saved=JSON.stringify(library),clock=createVirtualClock(evaluate);
    const output=await mkdtemp(join(tmpdir(),'easytimer-rundown-review-')),images=[];
    const capture=async(name,label)=>{const shot=await cdp('Page.captureScreenshot',{format:'png'});await writeFile(join(output,name+'.png'),Buffer.from(shot.data,'base64'));images.push([name+'.png',label]);};
    const menu=async selector=>{if(await evaluate(`document.querySelector('#preferences').hidden`))await click('#menu-toggle');await click(selector);};
    const picker=()=>menu('#open-session');
    const select=async id=>evaluate(`(()=>{const e=document.querySelector('#session-template');e.value=${JSON.stringify(id)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    const field=(selector,value)=>evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    const raw=()=>evaluate(`localStorage.getItem('easyTimerTemplates')`);
    const tab=async()=>{await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});};
    const device=async(width,height)=>{await cdp('Emulation.setTouchEmulationEnabled',{enabled:width<900});await cdp('Emulation.setDeviceMetricsOverride',{width,height,screenWidth:width<900?390:width,screenHeight:width<900?844:height,mobile:width<900,deviceScaleFactor:1});};
    await clock.install(await evaluate('Date.now()'));
    await evaluate(`window.entryConfirm=window.confirm;window.entryAccept=false;window.entryPrompts=[];window.confirm=message=>{window.entryPrompts.push(message);return window.entryAccept;};localStorage.setItem('easyTimerTemplates',${JSON.stringify(saved)})`);
    try {
        await click('[data-language="en"]');
        for(const id of ['entry-manual','entry-auto']) {
            await picker();await select(id);await click('#prepare-session');
            assert.equal(await text('#status'),'Ready');assert.equal(await evaluate('document.activeElement.id'),'primary');
            const expected=id==='entry-manual'?'10:00':'15:00';
            await clock.advance('2h');assert.equal(await text('#time'),expected,'Load prepares READY without starting either transition mode');
            assert.equal(await evaluate(`document.querySelector('#automatic-preview').hidden`),id==='entry-manual');
            await evaluate(`(()=>{const data=JSON.parse(localStorage.getItem('easyTimerTemplates'));data.templates.find(t=>t.id===${JSON.stringify(id)}).phases[0].durationSeconds=60;localStorage.setItem('easyTimerTemplates',JSON.stringify(data));})()`);
            await clock.advance('1h');assert.equal(await text('#time'),expected,'Loaded run remains an independent copy');
            await evaluate(`localStorage.setItem('easyTimerTemplates',${JSON.stringify(saved)})`);
        }
        await picker();await select('entry-manual');await click('#reload-templates');assert.equal(await raw(),saved);
        await click('#create-rundown');
        assert.equal(await evaluate('document.activeElement.id'),'template-name');
        assert.equal(await evaluate(`document.querySelector('#template-name').value`),'');
        assert.equal(await evaluate(`document.querySelectorAll('.phase-list li').length`),1);
        const firstId=await evaluate(`document.querySelector('.phase-list li').dataset.phaseId`);
        assert.match(firstId,/^[0-9a-f-]{36}$/i);assert.equal(await evaluate(`document.querySelector('.phase-duration input').value`),'10');
        assert.equal(await evaluate(`document.querySelector('.phase-title input').value`),'');
        assert.equal(await raw(),saved,'Navigation creates only an isolated unsaved draft');
        await click('.planner-back');assert.equal(await evaluate('window.entryPrompts.length'),0,'Pristine initial draft needs no discard confirmation');
        await click('#create-rundown');
        assert.notEqual(await evaluate(`document.querySelector('.phase-list li').dataset.phaseId`),firstId);
        await field('#template-name','Unsaved Rundown');await field('.phase-title input','Custom opening');
        await click('.planner-back');assert.equal(await evaluate(`document.querySelector('#template-name').value`),'Unsaved Rundown','Cancelled Back retains draft');
        await menu('#open-quick');assert.equal(await evaluate('document.body.dataset.mode'),'session','Cancelled mode departure retains Session context');
        assert.equal(await evaluate(`document.querySelector('#template-name').value`),'Unsaved Rundown');
        await click('#create-rundown');assert.equal(await evaluate(`document.querySelector('#template-name').value`),'Unsaved Rundown','Hidden create action cannot replace an active draft');
        if(!await evaluate(`document.querySelector('#preferences').hidden`))await click('#menu-toggle');
        assert.equal(await raw(),saved);await evaluate('window.entryAccept=true');await click('.planner-back');
        assert.equal(await evaluate(`document.querySelector('#session-picker').hidden`),false);
        assert.equal(await evaluate(`document.body.classList.contains('presentation')||document.fullscreenElement!==null`),false,'Returning from Editor never activates presentation');
        await click('#create-rundown');
        const createdId=await evaluate(`document.querySelector('.phase-list li').dataset.phaseId`);
        await field('#template-name','Created via Rundown entry');await field('.phase-title input','Custom opening');await click('#planner button[type="submit"]');
        const stored=JSON.parse(await raw());assert.equal(stored.templates.length,3);assert.deepEqual(stored.templates.slice(0,2),library.templates);
        assert.equal(stored.templates[2].phases[0].id,createdId);assert.equal(stored.templates[2].phases[0].durationSeconds,600);
        await click('.planner-back');await click('#reload-templates');await select(stored.templates[2].id);await click('#prepare-session');
        assert.equal(await text('#time'),'10:00');assert.equal(await text('#status'),'Ready');
        await picker();await click('#create-rundown');await click('.phase-actions button:last-child');
        assert.equal(await evaluate(`document.querySelectorAll('.phase-list li').length`),0,'Deleted initial phase is not recreated');
        await click('.planner-back');assert.deepEqual(JSON.parse(await raw()),stored);
        await evaluate(`window.entryGetItem=Storage.prototype.getItem;Storage.prototype.getItem=function(key){if(key==='easyTimerTemplates')throw new Error('Entry read failure');return window.entryGetItem.call(this,key);}`);
        await click('#reload-templates');await click('#create-rundown');
        await field('#template-name','Blocked draft');await field('.phase-title input','Opening');await click('#planner button[type="submit"]');
        assert.match(await text('#planner-feedback'),/Load valid stored templates/);
        await evaluate('Storage.prototype.getItem=window.entryGetItem');assert.deepEqual(JSON.parse(await raw()),stored,'Read failure cannot overwrite saved Rundowns through Create');await click('.planner-back');
        await evaluate(`localStorage.setItem('easyTimerTemplates',${JSON.stringify(saved)})`);
        for(const [width,height] of [[1280,800],[390,844],[320,568],[844,390]])for(const language of ['de','en'])for(const theme of ['light','dark']) {
            await device(width,height);await click(`[data-language="${language}"]`);await click(`[data-theme="${theme}"]`);await picker();
            const de=language==='de';
            for(const [selector,expected] of [['#session-picker-heading',de?'Rundown laden':'Load Rundown'],['label[for="session-template"]','Rundown'],['#prepare-session',de?'Laden':'Load'],['#reload-templates',de?'Liste aktualisieren':'Refresh list'],['#create-rundown',de?'Neu erstellen':'Create new'],['#picker-back',de?'Zurück zum Quick-Timer':'Back to Quick Timer'],['#session-template option[value=""]',de?'Auswählen …':'Select …'],['#session-picker-note',de?'Gespeicherte Abläufe bleiben unverändert.':'Saved sequences stay unchanged.']])assert.equal((await text(selector)).trim(),expected);
            assert.equal(await evaluate(`(()=>{const select=document.querySelector('#session-template'),label=select.labels[0],r=label.getBoundingClientRect();return label.textContent==='Rundown'&&r.width===1&&r.height===1&&getComputedStyle(label).clipPath==='inset(50%)';})()`),true,'Dropdown keeps its accessible name without a visible label row');
            assert.doesNotMatch(await text('#session-picker'),/Workshop|Vorlage|template/);
            await select('entry-manual');await evaluate(`document.querySelector('#session-template').focus()`);
            for(const id of ['prepare-session','reload-templates','create-rundown','picker-back']) {await tab();assert.equal(await evaluate('document.activeElement.id'),id);assert.equal(await evaluate(`document.activeElement.matches(':focus-visible')`),true);}
            assert.equal(await evaluate(`(()=>{const page=document.querySelector('#session-picker'),r=page.getBoundingClientRect(),actions=page.querySelector('.planner-actions').getBoundingClientRect(),create=document.querySelector('#create-rundown').getBoundingClientRect();return document.documentElement.scrollWidth<=innerWidth&&r.left>=0&&r.right<=innerWidth&&actions.bottom<=create.top&&[...page.querySelectorAll('button')].every(e=>{const r=e.getBoundingClientRect();return r.height>=44&&r.width>=44&&e.scrollWidth<=e.clientWidth;});})()`),true,'Entry layout has no horizontal overflow, clipped buttons or overlapping actions');
            await evaluate(`document.querySelector('#session-picker-heading').focus();window.scrollTo(0,0)`);
            await capture(`after-${width}-${language}-${theme}`,`AFTER ${width}px ${language} ${theme}`);
            if(width===1280) {await click('#menu-toggle');await capture(`menu-subtitle-${language}-${theme}`,`Menu subtitle ${language} ${theme}`);await click('#menu-toggle');}
            if(width===320&&language==='de') {await click('#create-rundown');await capture(`new-draft-${theme}`,`New unsaved draft ${theme}`);await click('.planner-back');}
        }
        await click('[data-language="en"]');await device(1280,800);
        await evaluate(`localStorage.setItem('easyTimerTemplates',JSON.stringify({schemaVersion:1,templates:[]}))`);await picker();
        assert.equal(await evaluate(`document.querySelector('#prepare-session').disabled`),true);await capture('empty-entry','Empty library with discoverable Create action');
        await click('#create-rundown');assert.equal(await evaluate('document.activeElement.id'),'template-name');await click('.planner-back');
        if(process.env.EASYTIMER_RUNDOWN_BEFORE)for(const width of [1280,320])for(const language of ['de','en'])for(const theme of ['light','dark']) {
            const file=`before-${width}-${language}-${theme}.png`;await copyFile(join(process.env.EASYTIMER_RUNDOWN_BEFORE,file),join(output,file));images.unshift([file,`BEFORE ${width}px ${language} ${theme}`]);
        }
        await writeFile(join(output,'index.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Rundown entry review</title><style>body{font:16px system-ui;margin:24px;background:#f6f8fc;color:#172337}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr));gap:20px}img{width:100%;border:1px solid #c8d1e0}h2{font-size:16px}</style><h1>Rundown entry review</h1><p>Before/after entry, localized menu subtitle, empty library and unsaved initial draft. Test fixtures stay in the isolated browser profile.</p><main>${images.map(([file,label])=>`<article><h2>${label}</h2><a href="${file}"><img src="${file}" alt="${label}" loading="lazy"></a></article>`).join('')}</main></html>`);
        console.log(`PASS: Rundown copy, READY snapshots, direct fresh draft/defaults/save, cancellation guards, stable IDs and storage protection; responsive keyboard DE/EN/themes. Gallery: ${join(output,'index.html')}`);
    } finally {
        await clock.restore();await evaluate(`window.confirm=window.entryConfirm;if(window.entryGetItem)Storage.prototype.getItem=window.entryGetItem;${baseline===null?"localStorage.removeItem('easyTimerTemplates')":`localStorage.setItem('easyTimerTemplates',${JSON.stringify(baseline)})`};`);
        await click('[data-language="en"]');await click('[data-theme="system"]');await device(1280,800);await menu('#open-quick');
    }
}
