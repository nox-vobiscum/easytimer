import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createVirtualClock } from './virtual-clock.mjs';

export async function checkAutomaticSession({evaluate,click,text,cdp}) {
    const baseline=await evaluate(`localStorage.getItem('easyTimerTemplates')`);
    const clock=createVirtualClock(evaluate);
    const output=await mkdtemp(join(tmpdir(),'easytimer-automatic-session-'));
    const shots=[];
    const template={id:'automatic-acceptance',name:'Automatic workshop',transitionMode:'automatic',phases:[
        {id:'opening',title:'Opening '+ 'long phase title '.repeat(6).trim(),durationSeconds:60},
        {id:'discussion',title:'Discussion '+ 'upcoming topic '.repeat(6).trim(),durationSeconds:120},
        {id:'closing',title:'Closing and next steps',durationSeconds:60},
    ]};
    const saved=JSON.stringify({schemaVersion:1,templates:[template]});
    const menu=async selector=>{await click('#menu-toggle');await click(selector);};
    const prepare=async()=>{
        await evaluate('window.autoAccept=true;window.autoConfirmAdvance=0');
        if(await evaluate(`document.body.dataset.mode==='session'`))await menu('#open-quick');
        await menu('#open-session');
        await evaluate(`(()=>{const s=document.querySelector('#session-template');s.value='automatic-acceptance';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
        await click('#prepare-session');
    };
    const rawClick=(delta,selector)=>evaluate(`globalThis.__easyTimerTestClock.now+=${delta};document.querySelector(${JSON.stringify(selector)}).click()`);
    const key=async(key,code,number)=>{
        await cdp('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode:number});
        await cdp('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:number});
    };
    const device=async(width,height,touch)=>{
        await cdp('Emulation.setTouchEmulationEnabled',{enabled:touch});
        await cdp('Emulation.setDeviceMetricsOverride',{width,height,screenWidth:touch?390:width,screenHeight:touch?844:height,mobile:touch,deviceScaleFactor:1});
        await cdp('Page.captureScreenshot',{format:'png'});
    };
    const capture=async name=>{
        const file=name+'.png',shot=await cdp('Page.captureScreenshot',{format:'png'});
        await writeFile(join(output,file),Buffer.from(shot.data,'base64'));shots.push(file);
    };
    await clock.install(await evaluate('Date.now()'));
    await evaluate(`window.autoOriginalConfirm=window.confirm;window.autoAccept=true;window.autoConfirmAdvance=0;window.autoPrompts=[];window.confirm=message=>{window.autoPrompts.push({message,phase:document.querySelector('#phase-number').textContent,time:document.querySelector('#time').textContent});globalThis.__easyTimerTestClock.now+=window.autoConfirmAdvance;return window.autoAccept;};localStorage.setItem('easyTimerTemplates',${JSON.stringify(saved)})`);
    try {
        await click('[data-language="en"]');await device(1280,800,false);await prepare();
        assert.equal(await text('#status'),'Ready');assert.equal(await text('#time'),'01:00');
        assert.equal(await evaluate(`document.querySelector('#session-template option[value="automatic-acceptance"]').disabled`),false);
        assert.match(await text('#session-template'),/Automatic/);
        assert.equal(await text('#automatic-next-phase'),template.phases[1].title);
        assert.equal(await evaluate(`(()=>{const e=document.querySelector('#automatic-preview');return e.tagName==='DIV'&&e.tabIndex<0&&!e.hasAttribute('role')&&!e.querySelector('button,a,svg,[tabindex]')&&getComputedStyle(e).borderTopWidth==='0px'&&getComputedStyle(e).cursor!=='pointer'&&document.querySelector('#next').hidden&&document.querySelector('#next').disabled;})()`),true,'Preview is information, with no arrow, button styling or keyboard action');
        await click('#next');assert.equal(await text('#phase-number'),'Phase 1 of 3','Hidden legacy action cannot skip automatic phases');
        await click('#primary');await rawClick(60000,'#primary');
        assert.equal(await text('#phase-number'),'Phase 2 of 3');assert.equal(await text('#status'),'Paused');assert.equal(await text('#time'),'02:00');
        await clock.advance('1h');assert.equal(await text('#time'),'02:00');
        await click('#primary');await clock.advance('2m');
        assert.equal(await text('#phase-number'),'Phase 3 of 3');assert.equal(await text('#time'),'01:00');
        assert.equal(await text('#automatic-next-label'),'Workshop ends automatically');
        await click('[data-language="de"]');assert.equal(await text('#automatic-next-label'),'Workshop endet automatisch');await click('[data-language="en"]');
        await click('#next');assert.equal(await text('#status'),'Running','No early automatic completion');
        await clock.advance('1m');assert.equal(await text('#status'),'Workshop complete');assert.equal(await text('#time'),'+00:00');
        await click('#primary');await clock.advance('1h');assert.equal(await text('#time'),'+00:00');
        await click('#primary');await clock.advance('7s');await click('#stop-overtime');await clock.advance('1h');
        assert.equal(await text('#time'),'+00:07');assert.equal(await evaluate(`document.querySelector('#automatic-preview').hidden&&document.querySelector('#next').hidden`),true);

        await prepare();await click('#primary');
        await evaluate(`window.autoRenderTimes=[];window.autoRenderPhases=[];window.autoTimeObserver=new MutationObserver(()=>window.autoRenderTimes.push(document.querySelector('#time').textContent));window.autoTimeObserver.observe(document.querySelector('#time'),{childList:true});window.autoPhaseObserver=new MutationObserver(()=>window.autoRenderPhases.push(document.querySelector('#current-phase').textContent));window.autoPhaseObserver.observe(document.querySelector('#current-phase'),{childList:true});globalThis.__easyTimerTestClock.now+=200000;document.dispatchEvent(new Event('visibilitychange'));`);
        assert.deepEqual(await evaluate('window.autoRenderTimes'),['00:40']);
        assert.deepEqual(await evaluate('window.autoRenderPhases'),[template.phases[2].title]);
        await evaluate('window.autoTimeObserver.disconnect();window.autoPhaseObserver.disconnect()');
        assert.equal(await text('#time-budget'),'Workshop remaining 00:40');
        await evaluate(`const stored=JSON.parse(localStorage.getItem('easyTimerTemplates'));stored.templates[0].transitionMode='manual';stored.templates[0].phases[2].durationSeconds=600;localStorage.setItem('easyTimerTemplates',JSON.stringify(stored))`);
        await clock.advance('40s');assert.equal(await text('#status'),'Workshop complete','Stored template edits cannot change the active automatic snapshot');
        await evaluate(`localStorage.setItem('easyTimerTemplates',${JSON.stringify(saved)})`);

        await prepare();await click('#primary');await menu('#open-planner');
        await evaluate(`document.querySelector('.rundown-edit').click();const input=document.querySelector('#template-name');input.focus();input.value='Unsaved automatic draft';input.dispatchEvent(new Event('input',{bubbles:true}));`);
        await clock.advance('200s');
        assert.equal(await evaluate(`document.querySelector('#template-name').value`),'Unsaved automatic draft');
        assert.equal(await evaluate('document.activeElement.id'),'template-name','Automatic catch-up cannot steal Planner focus');
        assert.equal(await evaluate(`localStorage.getItem('easyTimerTemplates')`),saved);
        await click('.planner-back');assert.equal(await text('#phase-number'),'Phase 3 of 3');assert.equal(await text('#time'),'00:40');

        for(const selector of ['#stop','#open-quick']) {
            await prepare();await click('#primary');
            if(selector==='#open-quick')await click('#menu-toggle');
            await evaluate('window.autoAccept=false;window.autoConfirmAdvance=50000');
            await rawClick(200000,selector);
            const prompt=await evaluate('window.autoPrompts.at(-1)');
            assert.equal(prompt.phase,'Phase 3 of 3');assert.equal(prompt.time,'00:40','Action reconciles before confirmation');
            assert.equal(await text('#time'),'+00:10','Cancelled confirmation catches up across its elapsed time');
            if(selector==='#open-quick')await click('#menu-toggle');
        }
        await prepare();await click('#primary');await rawClick(200000,'#stop');
        assert.equal(await text('#phase-number'),'Phase 1 of 3');assert.equal(await text('#status'),'Ready');
        await clock.advance('1h');assert.equal(await text('#time'),'01:00');
        await click('#primary');await click('#menu-toggle');await rawClick(250000,'#open-quick');
        assert.equal(await evaluate('document.body.dataset.mode'),'quick');await clock.advance('1h');assert.equal(await text('#status'),'Ready','Confirmed mode departure leaves no hidden active session');

        for(const [width,height,touch] of [[1280,800,false],[320,568,true],[844,390,true]])for(const theme of ['light','dark']) {
            await device(width,height,touch);await click(`[data-theme="${theme}"]`);await prepare();
            await capture(`ready-${width}-${theme}`);
            await click('#primary');await clock.advance('50s');
            assert.equal(await evaluate(`document.querySelector('#time').dataset.visualState`),'ENDGAME');await capture(`endgame-${width}-${theme}`);
            await clock.advance('10s');assert.equal(await text('#time'),'02:00');assert.equal(await evaluate(`document.querySelector('#time').dataset.visualState`),'NORMAL');
            for(const lang of ['de','en']) {
                await click(`[data-language="${lang}"]`);
                assert.equal(await text('#automatic-next-label'),lang==='de'?'Als Nächstes':'Up next');
                assert.equal(await text('#time'),'02:00');
            }
            assert.equal(await evaluate(`(()=>{const r=document.querySelector('#automatic-preview').getBoundingClientRect(),t=document.querySelector('#time').getBoundingClientRect(),s=document.querySelector('#status').getBoundingClientRect(),a=document.querySelector('.control-bar').getBoundingClientRect(),p=document.querySelector('#progress').getBoundingClientRect();return document.documentElement.scrollWidth<=innerWidth&&t.left>=0&&t.right<=innerWidth&&t.bottom<=s.top+1&&s.bottom<=a.top+1&&a.bottom<=r.top+1&&r.bottom<=p.top+1;})()`),true,'Automatic information fits without overlap or overflow');
            await capture(`transition-${width}-${theme}`);
            if(width===844) {
                const point=await evaluate(`(()=>{const r=document.querySelector('#time').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
                await cdp('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});await cdp('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await delay(40);
                await clock.advance('125s');
                assert.equal(await text('#phase-number'),'Phase 3 of 3');assert.equal(await evaluate(`document.body.classList.contains('clock-only')&&document.activeElement.id==='clock-view-toggle'`),true);
                await capture(`clock-only-phase-${theme}`);await clock.advance('60s');
                assert.equal(await text('#time'),'+00:05');assert.equal(await evaluate(`document.body.classList.contains('clock-only')`),true);
                await capture(`clock-only-complete-${theme}`);await key('Escape','Escape',27);
            } else await clock.advance('185s');
            assert.equal(await text('#status'),'Workshop complete');await capture(`completion-${width}-${theme}`);
            await click('#stop-overtime');await clock.advance('1h');assert.equal(await text('#time'),'+00:05');
        }
        assert.equal(await evaluate(`localStorage.getItem('easyTimerTemplates')`),saved,'All runtime actions preserve saved templates');
        await menu('#open-quick');
        await writeFile(join(output,'index.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><title>ST-002B review</title><style>body{font:16px system-ui;margin:1rem}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:1rem}img{width:100%}h2{font-size:1rem}</style><h1>Automatic Session Timer</h1><main>${shots.map(file=>`<article><h2>${file}</h2><a href="${file}"><img src="${file}" alt="${file}"></a></article>`).join('')}</main></html>`);
        console.log(`PASS: automatic preparation, atomic catch-up/actions, exact pause/completion, no intermediate frames, immutable snapshots, confirmation/mode switching, localized passive preview and Clock-only across transitions. Screenshots: ${output}`);
    } finally {
        await clock.restore();
        await evaluate(`window.confirm=window.autoOriginalConfirm;${baseline===null?"localStorage.removeItem('easyTimerTemplates')":`localStorage.setItem('easyTimerTemplates',${JSON.stringify(baseline)})`};`);
        await device(1280,800,false);await click('[data-language="en"]');await click('[data-theme="system"]');
    }
}
