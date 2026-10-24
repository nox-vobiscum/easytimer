import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createVirtualClock } from './virtual-clock.mjs';

export async function checkClockView({ evaluate, click, text, cdp, configure }) {
    const baseline = await evaluate(`localStorage.getItem('easyTimerTemplates')`);
    const clock = createVirtualClock(evaluate);
    const output = await mkdtemp(join(tmpdir(), 'easytimer-clock-view-'));
    const shots = [];
    const menu = async selector => { await click('#menu-toggle'); await click(selector); };
    const snapshot = () => evaluate(`({time:document.querySelector('#time').textContent,status:document.querySelector('#status').textContent,title:document.title,budget:document.querySelector('#time-budget').textContent,phase:document.querySelector('#phase-number').textContent,progress:document.querySelector('#progress').style.getPropertyValue('--remaining')})`);
    const key = async (key, code, number) => {
        await cdp('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode:number,...(key==='Enter'?{text:'\r'}:{})});
        await cdp('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:number});
    };
    const point = selector => evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    const tap = async target => {
        await cdp('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[target]});
        await cdp('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        await delay(40);
    };
    const phone = async (width=568,height=320) => {
        await cdp('Emulation.setTouchEmulationEnabled',{enabled:true});
        await cdp('Emulation.setDeviceMetricsOverride',{width,height,screenWidth:320,screenHeight:568,deviceScaleFactor:1,mobile:true,screenOrientation:{type:width>height?'landscapePrimary':'portraitPrimary',angle:width>height?90:0}});
        await cdp('Page.captureScreenshot',{format:'png'});
    };
    const geometry = async () => {
        const actual = await evaluate(`(()=>{const r=document.querySelector('#time').getBoundingClientRect();const t=document.querySelector('#clock-view-toggle');const main=getComputedStyle(document.querySelector('main'));return {fits:r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight,centered:Math.abs((r.top+r.bottom)/2-(parseFloat(main.paddingTop)+innerHeight-parseFloat(main.paddingBottom))/2)<1,fixedBrand:getComputedStyle(document.querySelector('.presentation-brand')).position==='fixed',overflow:document.documentElement.scrollWidth>innerWidth,role:document.querySelector('#time').getAttribute('role'),live:document.querySelector('#time').getAttribute('aria-live'),duplicates:document.querySelectorAll('#overtime,#overtime-time,.overtime').length,focus:document.activeElement===t,targets:Array.from(document.querySelectorAll('button,a,input,select,[tabindex]')).filter(e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden').map(e=>e.id),statusVisible:document.querySelector('#status').getClientRects().length>0};})()`);
        assert.deepEqual(actual,{fits:true,centered:true,fixedBrand:true,overflow:false,role:'timer',live:'off',duplicates:0,focus:true,targets:['clock-view-toggle'],statusVisible:false});
    };
    const capture = async name => {
        const file=name+'.png';const shot=await cdp('Page.captureScreenshot',{format:'png'});
        await writeFile(join(output,file),Buffer.from(shot.data,'base64'));shots.push(file);
    };
    await clock.install(await evaluate('Date.now()'));
    await evaluate(`window.clockViewConfirm=window.confirm;window.confirm=()=>true;localStorage.setItem('easyTimerTemplates',JSON.stringify({schemaVersion:1,templates:[{id:'clock-view',name:'Clock view workshop',transitionMode:'manual',phases:[{id:'first',title:'First phase',durationSeconds:300},{id:'last',title:'Last phase',durationSeconds:300}]}]}))`);
    try {
        await click('[data-language="en"]');
        for (const mode of ['quick','session']) {
            for (const state of ['READY','RUNNING','PAUSED','OVERTIME','OVERTIME_PAUSED','OVERTIME_STOPPED']) {
                if (mode==='quick'&&['OVERTIME_PAUSED','OVERTIME_STOPPED'].includes(state)) continue;
                await menu('#open-quick');
                if (await evaluate(`!document.querySelector('#stop').hidden`)) await click('#stop');
                if (mode==='quick') { await configure(0,5,0); }
                else {
                    await menu('#open-session');
                    await evaluate(`(()=>{const s=document.querySelector('#session-template');s.value='clock-view';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
                    await click('#prepare-session');
                }
                if (state!=='READY') await click('#primary');
                if (state==='PAUSED') { await clock.advance('1m');await click('#primary'); }
                if (state.startsWith('OVERTIME')) {
                    await clock.advance('310s');
                    if (state==='OVERTIME_STOPPED') { await click('#next');await click('#next');await clock.advance('10s');await click('#stop-overtime'); }
                    else if (state==='OVERTIME_PAUSED') await click('#primary');
                }
                await phone();
                const before=await snapshot();const exitPoint=await point(state==='OVERTIME_STOPPED'?'#stop':'#primary');
                await tap(await point('#time'));
                assert.equal(await evaluate(`document.body.classList.contains('clock-only')`),true);
                assert.deepEqual(await snapshot(),before,'Entering changes no timer action/state');
                await geometry();
                await clock.advance('2s');
                const after=await snapshot();
                if (['READY','PAUSED','OVERTIME_PAUSED','OVERTIME_STOPPED'].includes(state)) assert.deepEqual(after,before,'Paused/ready/stopped values remain frozen');
                else assert.notEqual(after.time,before.time,'The authoritative active clock continues in Clock-only');
                await tap(exitPoint);
                assert.equal(await evaluate(`document.body.classList.contains('clock-only')`),false);
                assert.deepEqual(await snapshot(),after,'Restoring tap does not activate the underlying primary/stop control');
                for (const theme of ['light','dark']) {
                    await click(`[data-theme="${theme}"]`);
                    if (['RUNNING','OVERTIME'].includes(state)) await capture(`${mode}-${state.toLowerCase()}-${theme}-normal`);
                    await click('#clock-view-toggle');await geometry();
                    if (['RUNNING','OVERTIME'].includes(state)) await capture(`${mode}-${state.toLowerCase()}-${theme}-clock-only`);
                    await key('Escape','Escape',27);
                    assert.equal(await evaluate(`document.activeElement.id`),'clock-view-toggle');
                    await key(' ','Space',32);await geometry();await key('Enter','Enter',13);
                    assert.equal(await evaluate(`document.body.classList.contains('clock-only')`),false);
                }
                await click('#clock-view-toggle');
                const frozen=await snapshot();await phone(320,568);
                assert.equal(await evaluate(`document.body.classList.contains('clock-only')||!document.querySelector('#clock-view-toggle').hidden||document.activeElement.id==='clock-view-toggle'`),false);
                await phone();assert.equal(await evaluate(`document.body.classList.contains('clock-only')`),false);
                assert.deepEqual(await snapshot(),frozen,'Rotation retains the exact timer and defaults to normal landscape');
                await click('[data-language="de"]');assert.equal(await evaluate(`document.querySelector('#clock-view-toggle').getAttribute('aria-label')`),'Nur die Uhr anzeigen');
                await click('#clock-view-toggle');assert.equal(await evaluate(`document.querySelector('#clock-view-toggle').getAttribute('aria-label')`),'Timer-Bedienung anzeigen');
                await key('Escape','Escape',27);await click('[data-language="en"]');
                if (state==='OVERTIME') {
                    await clock.advance('1000h');
                    for (const [width,height] of [[568,320],[667,240],[844,390]]) {
                        await phone(width,height);
                        for (const size of ['100%','150%']) {
                            await evaluate(`document.documentElement.style.fontSize=${JSON.stringify(size)}`);
                            const ordinary=await evaluate(`(()=>{const r=document.querySelector('#time').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&document.documentElement.scrollWidth<=innerWidth;})()`);
                            assert.equal(ordinary,true,'Long positive hours fit the ordinary view');
                            await click('#clock-view-toggle');await geometry();await key('Escape','Escape',27);
                        }
                        await evaluate(`document.documentElement.style.fontSize=''`);
                    }
                }
            }
        }
        await menu('#open-quick');await configure(0,5,0);await phone();
        await click('#clock-view-toggle');
        await clock.restore();
        const origin=await evaluate('performance.timeOrigin');await cdp('Page.reload');
        for(let i=0;i<100;i++){if(await evaluate(`performance.timeOrigin!==${origin}&&Boolean(document.querySelector('#primary')?.title)`))break;await delay(50);}
        assert.equal(await evaluate(`document.body.classList.contains('clock-only')`),false,'Clock-only is never restored on reload');
        await evaluate(`window.clockViewConfirm=window.confirm;window.confirm=()=>true`);
        for (const [width,height,screenWidth,screenHeight,touch] of [[1280,800,1280,800,false],[667,320,1024,768,true],[1024,768,1024,768,true]]) {
            await cdp('Emulation.setTouchEmulationEnabled',{enabled:touch});
            await cdp('Emulation.setDeviceMetricsOverride',{width,height,screenWidth,screenHeight,mobile:false,deviceScaleFactor:1});
            await cdp('Page.captureScreenshot',{format:'png'});
            assert.equal(await evaluate(`document.querySelector('#clock-view-toggle').hidden`),true,'Desktop/tablet including split view cannot enter Clock-only');
        }
        await phone();await menu('#open-planner');
        assert.equal(await evaluate(`document.querySelector('#clock-view-toggle').hidden`),true);
        await click('.planner-back');
        await writeFile(join(output,'index.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><title>UX-009 / UX-010 review</title><style>body{font:16px system-ui}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:1rem}img{width:100%}h2{font-size:1rem}</style><h1>Normal landscape and Clock-only</h1><main>${shots.map(file=>`<article><h2>${file}</h2><a href="${file}"><img src="${file}" alt="${file}"></a></article>`).join('')}</main></html>`);
        console.log(`PASS: unified positive overtime; Clock-only touch/keyboard/focus/rotation/reload, all Quick/Session states, phone-only classification, long hours and text scaling. Screenshots: ${output}`);
    } finally {
        await clock.restore();
        await evaluate(`document.documentElement.style.fontSize='';window.confirm=window.clockViewConfirm;${baseline===null?"localStorage.removeItem('easyTimerTemplates')":`localStorage.setItem('easyTimerTemplates',${JSON.stringify(baseline)})`};`);
        await cdp('Emulation.setTouchEmulationEnabled',{enabled:false});
        await cdp('Emulation.setDeviceMetricsOverride',{width:1280,height:800,screenWidth:1280,screenHeight:800,mobile:false,deviceScaleFactor:1});
        await click('[data-language="en"]');await click('[data-theme="system"]');
    }
}
