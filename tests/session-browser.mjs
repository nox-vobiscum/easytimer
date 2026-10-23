import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createVirtualClock } from './virtual-clock.mjs';

export async function checkSession({ evaluate, click, text, cdp, configure }) {
    const baseline = await evaluate(`localStorage.getItem('easyTimerTemplates')`);
    const library = {schemaVersion:1,templates:[
        {id:'manual-run',name:'Workshop <safe>',transitionMode:'manual',phases:[
            {id:'opening',title:'Opening '+ 'Long title '.repeat(9).trim(),durationSeconds:60},
            {id:'discussion',title:'Discussion '+ 'Next phase '.repeat(9).trim(),durationSeconds:300},
        ]},
        {id:'automatic-run',name:'Automatic workshop',transitionMode:'automatic',phases:[{id:'auto-phase',title:'Automatic phase',durationSeconds:60}]},
        {id:'single-run',name:'One phase',transitionMode:'manual',phases:[{id:'single',title:'Single phase',durationSeconds:60}]},
        {id:'long-run',name:'1000 hours',transitionMode:'manual',phases:Array.from({length:10},(_,i)=>({id:`long-${i}`,title:`Long phase ${i+1}`,durationSeconds:360000}))},
    ]};
    const clock = createVirtualClock(evaluate);
    const tick = ms => clock.advance(ms);
    const menu = async id => { await click('#menu-toggle'); await click(id); };
    const choose = async id => {
        await evaluate(`(()=>{const select=document.querySelector('#session-template');select.value=${JSON.stringify(id)};select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
        await click('#prepare-session');
    };
    const action = label => evaluate(`Array.from(document.querySelectorAll('#planner button')).find(button=>button.textContent===${JSON.stringify(label)}).click()`);
    const key = async (key,code,number) => {
        await cdp('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode:number,...(key==='Enter'?{text:'\r'}:{})});
        await cdp('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:number});
    };
    const field = (selector,value) => evaluate(`(()=>{const input=document.querySelector(${JSON.stringify(selector)});input.value=${JSON.stringify(value)};input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    const setDesktop = async () => {
        await cdp('Emulation.setTouchEmulationEnabled',{enabled:false});
        await cdp('Emulation.setDeviceMetricsOverride',{width:1280,height:800,screenWidth:1280,screenHeight:800,mobile:false,deviceScaleFactor:1});
    };
    const capture = async name => {
        if (!process.env.EASYTIMER_SCREENSHOT_DIR) return;
        const shot = await cdp('Page.captureScreenshot',{format:'png'});
        await writeFile(join(process.env.EASYTIMER_SCREENSHOT_DIR,`session-hierarchy-${name}.png`),Buffer.from(shot.data,'base64'));
    };
    await setDesktop(); await click('[data-language="en"]');
    await evaluate(`localStorage.setItem('easyTimerTemplates',${JSON.stringify(JSON.stringify(library))});window.sessionRealConfirm=window.confirm;window.sessionPrompts=[];window.sessionAccept=false;window.sessionAnswers=[];window.confirm=message=>{window.sessionPrompts.push(message);return window.sessionAnswers.length?window.sessionAnswers.shift():window.sessionAccept;};`);
    await clock.install(await evaluate('Date.now()'));
    try {
        await configure(0,1,0); await click('#primary'); await click('[data-adjustment="30000"]');
        await menu('#open-session');
        assert.equal(await evaluate('document.body.dataset.mode'),'quick','Running Quick switch can be cancelled');
        await click('#menu-toggle'); await click('#primary');
        await menu('#open-session');
        assert.equal(await text('#status'),'Paused','Paused Quick switch also confirms');
        await click('#menu-toggle'); await click('#primary'); await tick(95000);
        await menu('#open-session'); assert.equal(await evaluate('document.body.dataset.mode'),'quick','Quick overtime is protected');
        await evaluate('window.sessionAccept=true'); await click('#open-session');
        assert.equal(await evaluate('document.activeElement.id'),'session-picker-heading');
        assert.equal(await evaluate(`document.querySelector('#session-picker').hidden`),false);
        await tick(90000); assert.equal(await evaluate('document.title'),'easyTimer','Picker has no continuing Quick clock');
        await evaluate(`localStorage.removeItem('easyTimerTemplates')`); await click('#reload-templates');
        assert.match(await text('#session-feedback'),/No workshop templates/);
        assert.equal(await evaluate(`document.querySelector('#prepare-session').disabled`),true);
        await evaluate(`localStorage.setItem('easyTimerTemplates','{broken')`); await click('#reload-templates');
        assert.match(await text('#session-feedback'),/could not be loaded/);
        assert.equal(await evaluate(`localStorage.getItem('easyTimerTemplates')`),'{broken');
        await evaluate(`window.sessionGetItem=Storage.prototype.getItem;Storage.prototype.getItem=function(key){if(key==='easyTimerTemplates')throw new Error('Blocked');return window.sessionGetItem.call(this,key);};`);
        await click('#reload-templates'); assert.match(await text('#session-feedback'),/could not be loaded/);
        await evaluate(`Storage.prototype.getItem=window.sessionGetItem;localStorage.setItem('easyTimerTemplates',${JSON.stringify(JSON.stringify(library))})`);
        await click('#reload-templates');
        assert.equal(await evaluate(`document.querySelector('#session-template option[value="automatic-run"]').disabled`),true);
        await choose('automatic-run'); assert.equal(await evaluate(`document.querySelector('#session-picker').hidden`),false);
        await evaluate(`const select=document.querySelector('#session-template');select.value='';select.focus();`);
        await key('ArrowDown','ArrowDown',40); await key('Tab','Tab',9);
        assert.equal(await evaluate('document.activeElement.id'),'prepare-session','Native picker selection and Tab reach Prepare');
        assert.equal(await evaluate(`document.activeElement.matches(':focus-visible')&&parseFloat(getComputedStyle(document.activeElement).outlineWidth)>=3`),true);
        await key('Enter','Enter',13);
        assert.equal(await text('#time'),'01:00'); assert.equal(await text('#status'),'Ready');
        assert.equal(await text('#phase-number'),'Phase 1 of 2'); assert.match(await text('#time-budget'),/06:00/);
        assert.equal(await evaluate('document.activeElement.id'),'primary');
        assert.equal(await text('#workshop-name'),library.templates[0].name);
        assert.equal(await text('#next-phase'),library.templates[0].phases[1].title);
        assert.equal(await evaluate(`document.querySelector('#next').getAttribute('aria-label')`),'Up next: '+library.templates[0].phases[1].title);
        assert.equal(await evaluate(`document.querySelectorAll('button#next').length===1&&!document.querySelector('.actions #next')`),true,'One contextual advance action, no duplicate');
        await capture('ready');
        assert.equal(await evaluate(`getComputedStyle(document.querySelector('.duration-config')).display==='none'&&getComputedStyle(document.querySelector('.duration-adjustments')).display==='none'`),true);
        assert.equal(await evaluate(`localStorage.getItem('easyTimerTemplates')`),JSON.stringify(library),'Preparing never writes template data');
        const phaseTitle = await text('#current-phase');
        await evaluate(`const data=JSON.parse(localStorage.getItem('easyTimerTemplates'));data.templates[0].phases[0].title='Changed stored title';data.templates[0].phases[0].durationSeconds=120;localStorage.setItem('easyTimerTemplates',JSON.stringify(data));`);
        const storedDuringRun = await evaluate(`localStorage.getItem('easyTimerTemplates')`);
        await click('#primary'); await tick(10000);
        await capture('running');
        assert.equal(await text('#time'),'00:50'); assert.equal(await text('#current-phase'),phaseTitle,'Run is isolated from source changes');
        await menu('#open-planner'); await action('Edit'); await field('#template-name','Unsaved planner draft');
        await evaluate('window.sessionAnswers=[true,false]'); await menu('#open-quick');
        assert.equal(await evaluate('document.body.dataset.mode'),'session','Declining draft discard cannot switch modes');
        assert.equal(await evaluate(`document.querySelector('#template-name').value`),'Unsaved planner draft');
        await click('#menu-toggle'); await action('Back to timer');
        assert.equal(await text('#time'),'00:50','Planner remains a view over the running Session clock');
        await click('#primary'); await tick(120000); assert.equal(await text('#time'),'00:50');
        await capture('paused');
        await click('#primary'); await tick(55000);
        assert.equal(await text('#time'),'00:00'); assert.equal(await text('#overtime-time'),'+00:05');
        assert.equal(await text('#phase-number'),'Phase 1 of 2');
        await click('#primary'); await tick(60000); assert.equal(await text('#overtime-time'),'+00:05');
        assert.match(await evaluate('document.title'),/\+00:05 ⏸/);
        await click('#primary'); await tick(2000); assert.equal(await text('#overtime-time'),'+00:07');
        await capture('phase-overtime');
        await evaluate(`document.querySelector('#next').focus()`);
        await key('Tab','Tab',9);
        await evaluate(`document.querySelector('#next').focus()`);
        assert.equal(await evaluate(`document.activeElement.matches(':focus-visible')&&parseFloat(getComputedStyle(document.activeElement).outlineWidth)>=3`),true);
        await key('Enter','Enter',13);
        assert.equal(await text('#time'),'05:00'); assert.equal(await text('#status'),'Ready');
        assert.equal(await evaluate('document.activeElement.id'),'primary','Advance restores focus to Start');
        assert.equal(await text('#next-label'),'Complete workshop');
        assert.equal(await evaluate(`document.querySelector('#next-phase').hidden`),true,'Last phase does not imply another phase');
        await capture('last-phase-ready');
        assert.equal(await text('#phase-number'),'Phase 2 of 2'); assert.match(await text('#time-budget'),/05:00/);
        await evaluate('window.sessionAccept=false'); await menu('#open-quick');
        assert.equal(await text('#phase-number'),'Phase 2 of 2','READY between phases protects progress');
        await click('#menu-toggle'); await evaluate('window.sessionAccept=true');
        await click('#primary'); await tick(315000);
        assert.equal(await text('#phase-number'),'Phase 2 of 2'); assert.equal(await text('#overtime-time'),'+00:15');
        assert.equal(await text('#status'),'Phase time elapsed','Last phase expiry does not complete the workshop');
        await click('#next'); assert.equal(await text('#status'),'Workshop complete');
        assert.equal(await evaluate(`document.querySelector('#next').hidden&&document.querySelector('#next').disabled`),true,'No phase advance after completion');
        await capture('final-overtime');
        assert.equal(await text('#overtime-time'),'+00:00'); assert.match(await text('#time-budget'),/00:00/);
        await tick(9000); await click('#primary'); await tick(50000);
        assert.equal(await text('#overtime-time'),'+00:09');
        await click('#primary'); await tick(5000); await click('#stop-overtime');
        assert.equal(await text('#overtime-time'),'+00:14'); assert.match(await text('#status'),/Overtime stopped/);
        await capture('final-overtime-stopped');
        await tick(999999); assert.equal(await text('#overtime-time'),'+00:14');
        assert.equal(await evaluate(`document.querySelector('#primary').hidden&&document.querySelector('#stop-overtime').hidden&&document.activeElement.id==='stop'`),true);
        await evaluate('window.sessionAccept=false'); await click('#stop');
        assert.match(await text('#status'),/Overtime stopped/);
        await evaluate('window.sessionAccept=true'); await click('#stop');
        assert.equal(await text('#phase-number'),'Phase 1 of 2'); assert.equal(await text('#time'),'01:00');
        assert.equal(await text('#status'),'Ready');
        assert.equal(await evaluate(`localStorage.getItem('easyTimerTemplates')`),storedDuringRun,'Session actions never save runtime state into templates');
        await menu('#open-session'); await choose('single-run');
        await evaluate(`document.querySelector('#next').focus()`);
        await key(' ','Space',32);
        assert.equal(await text('#status'),'Workshop complete','Early completion of an unstarted last phase is explicit');
        await menu('#open-quick');
        assert.equal(await text('#status'),'Ready'); assert.equal(await text('#time'),'01:00');
        await tick(60000); assert.equal(await text('#time'),'01:00','Returning restores Quick configuration without an active deadline');
        await menu('#open-session'); await choose('long-run');
        assert.equal(await text('#time'),'100:00:00'); assert.match(await text('#time-budget'),/1000:00:00/);
        await evaluate(`(()=>{const data=JSON.parse(localStorage.getItem('easyTimerTemplates'));data.templates[0].phases[0].title=${JSON.stringify(library.templates[0].phases[0].title)};localStorage.setItem('easyTimerTemplates',JSON.stringify(data));})()`);
        await menu('#open-session'); await choose('manual-run'); await click('#primary');
        for (const [width,height,screenWidth,screenHeight,touch] of [[1280,800,1280,800,false],[390,600,768,1024,true],[320,568,320,568,true],[844,390,390,844,true]]) {
            await cdp('Emulation.setTouchEmulationEnabled',{enabled:touch});
            await cdp('Emulation.setDeviceMetricsOverride',{width,height,screenWidth,screenHeight,mobile:touch,deviceScaleFactor:1});
            for (const lang of ['de','en']) {
                await click(`[data-language="${lang}"]`);
                for (const theme of ['light','dark','system']) {
                    await click(`[data-theme="${theme}"]`);
                    assert.equal(await text('#time'),'02:00','View changes retain the source snapshot and clock');
                    const geometry = await evaluate(`(()=>{const r=document.querySelector('#time').getBoundingClientRect();const status=document.querySelector('#status').getBoundingClientRect();const next=document.querySelector('#next').getBoundingClientRect();const controls=document.querySelector('.control-bar').getBoundingClientRect();return {overflow:document.documentElement.scrollWidth>innerWidth,timeFits:r.left>=0&&r.right<=innerWidth&&r.bottom<=status.top+1,previewFits:next.top>=controls.bottom-1&&next.bottom<=document.querySelector('#progress').getBoundingClientRect().top+1&&next.width>=44&&next.height>=44,targets:Array.from(document.querySelectorAll('.actions button:not([hidden])')).every(button=>{const b=button.getBoundingClientRect();return b.width>=44&&b.height>=44&&button.getAttribute('aria-label')&&b.left>=0&&b.right<=innerWidth})};})()`);
                    assert.deepEqual(geometry,{overflow:false,timeFits:true,previewFits:true,targets:true},`${width}x${height} ${lang}/${theme}: ${JSON.stringify(geometry)}`);
                    assert.equal(await text('#phase-number'),lang==='de'?'Phase 1 von 2':'Phase 1 of 2');
                    assert.equal(await text('#next-label'),lang==='de'?'Als Nächstes':'Up next');
                    assert.equal(await evaluate(`document.querySelector('#next').getAttribute('aria-label')`),(lang==='de'?'Als Nächstes: ':'Up next: ')+library.templates[0].phases[1].title);
                }
            }
            if (process.env.EASYTIMER_SCREENSHOT_DIR) {
                await evaluate('scrollTo(0,0)');
                const shot=await cdp('Page.captureScreenshot',{format:'png'});
                await writeFile(join(process.env.EASYTIMER_SCREENSHOT_DIR,`session-${width}-${height}.png`),Buffer.from(shot.data,'base64'));
            }
            await tick(125000);
            assert.equal(await text('#overtime-time'),'+00:05');
            assert.equal(await evaluate(`(()=>{const time=document.querySelector('#time').getBoundingClientRect();const overtime=document.querySelector('#overtime').getBoundingClientRect();const status=document.querySelector('#status').getBoundingClientRect();const next=document.querySelector('#next').getBoundingClientRect();const controls=document.querySelector('.control-bar').getBoundingClientRect();return time.bottom<=overtime.top+1&&overtime.bottom<=status.top+1&&status.bottom<=controls.top+1&&controls.bottom<=next.top+1&&time.left>=0&&time.right<=innerWidth;})()`),true, `Overtime does not overlap at ${width}x${height}`);
            await click('#stop'); await click('#primary');
        }
        await setDesktop();
        await evaluate(`window.sessionNative=false;Object.defineProperty(document,'fullscreenElement',{configurable:true,get:()=>window.sessionNative?document.documentElement:null});Object.defineProperty(document,'fullscreenEnabled',{configurable:true,value:true});document.documentElement.requestFullscreen=async()=>{window.sessionNative=true;document.dispatchEvent(new Event('fullscreenchange'));};document.exitFullscreen=async()=>{window.sessionNative=false;document.dispatchEvent(new Event('fullscreenchange'));};`);
        await click('#fullscreen'); assert.equal(await evaluate('document.body.classList.contains("presentation")'),true);
        await capture('presentation');
        const before = await text('#time'); await tick(130000);
        assert.equal(await text('#overtime-time'),'+00:10','Background gap updates the active Session only');
        await menu('#open-planner'); await action('Back to timer');
        assert.equal(await evaluate('Boolean(document.fullscreenElement)||document.body.classList.contains("presentation")'),false);
        assert.notEqual(await text('#time'),before);
        await evaluate(`delete document.fullscreenElement;delete document.fullscreenEnabled;delete document.exitFullscreen;delete document.documentElement.requestFullscreen;`);
        await evaluate(`Object.defineProperty(document,'fullscreenEnabled',{configurable:true,value:false})`);
        await click('#fullscreen'); assert.equal(await evaluate(`document.body.classList.contains('presentation')`),true,'Session supports expanded fallback');
        assert.equal(await text('#overtime-time'),'+00:10');
        await click('#fullscreen'); assert.equal(await evaluate(`document.body.classList.contains('presentation')`),false);
        await evaluate(`delete document.fullscreenEnabled`);
        await menu('#open-session'); await choose('manual-run'); await click('#primary'); await tick(1000);
        await cdp('Emulation.setTouchEmulationEnabled',{enabled:true});
        const target = await evaluate(`(()=>{const r=document.querySelector('#next').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
        await cdp('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[target]});
        await cdp('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        await delay(50);
        assert.equal(await text('#phase-number'),'Phase 2 of 2');
        assert.equal(await text('#time'),'05:00','Touch advance discards unused time and prepares the full next phase');
        assert.equal(await text('#status'),'Ready');
        await setDesktop();
        await menu('#open-quick'); await configure(0,5,0);
    } finally {
        await evaluate(`Storage.prototype.getItem=window.sessionGetItem||Storage.prototype.getItem;window.confirm=window.sessionRealConfirm;localStorage.setItem('easyTimerTemplates',${JSON.stringify(baseline)});`);
        await clock.restore();
        await setDesktop();
    }
    console.log('PASS: manual Session picker/validation/snapshot, phase and final overtime, pause/resume/stop/reset, guarded modes and Planner draft, no template writes, long durations, DE/EN/themes and responsive presentations.');
}
