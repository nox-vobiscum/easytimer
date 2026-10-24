import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const palettes = {
    light: { amber:'rgb(154, 87, 0)', red:'rgb(180, 35, 56)' },
    dark: { amber:'rgb(242, 188, 118)', red:'rgb(243, 161, 171)' },
};
function luminance(color) {
    const values = color.match(/[\d.]+/g).slice(0,3).map(value => {
        const channel=Number(value)/255;
        return channel<=0.04045?channel/12.92:((channel+0.055)/1.055)**2.4;
    });
    return values[0]*0.2126+values[1]*0.7152+values[2]*0.0722;
}
function contrast(a,b) {
    const values=[luminance(a),luminance(b)].sort((x,y)=>y-x);
    return (values[0]+0.05)/(values[1]+0.05);
}

export async function checkTimeVisuals({ evaluate, click, text, cdp, configure }) {
    const baseline=await evaluate(`localStorage.getItem('easyTimerTemplates')`);
    const tick=ms=>evaluate(`window.visualNow+=${ms};document.dispatchEvent(new Event('visibilitychange'))`);
    const menu=async selector=>{await click('#menu-toggle');await click(selector);};
    let variant='light';
    async function check(expected) {
        const result=await evaluate(`(()=>{const time=document.querySelector('#time');const overtime=document.querySelector('#time');const root=getComputedStyle(document.documentElement);return {state:time.dataset.visualState,main:getComputedStyle(time).color,counter:getComputedStyle(overtime).color,normal:getComputedStyle(document.body).color,background:getComputedStyle(document.body).backgroundColor,shown:!(document.querySelector('#time').dataset.visualState !== 'EXPIRED'),mainAnimation:getComputedStyle(time).animationName,counterAnimation:getComputedStyle(overtime).animationName,transition:getComputedStyle(time).transitionDuration,live:time.getAttribute('aria-live'),statusRole:document.querySelector('#status').getAttribute('role'),green:root.getPropertyValue('--progress-elapsed-color').trim()||getComputedStyle(document.querySelector('#progress')).getPropertyValue('--progress-elapsed-color').trim(),pink:getComputedStyle(document.querySelector('#progress')).getPropertyValue('--progress-remaining-color').trim(),height:document.querySelector('#progress').getBoundingClientRect().height};})()`);
        assert.equal(result.state,expected);
        assert.equal(result.main,expected==='NORMAL'?result.normal:expected==='EXPIRED'?palettes[variant].red:palettes[variant].amber);
        if(expected==='EXPIRED') {assert.equal(result.shown,true);assert.equal(result.counter,palettes[variant].red);}
        assert.equal(result.mainAnimation,'none');assert.equal(result.counterAnimation,'none');assert.equal(result.transition,'0s');
        assert.equal(result.live,'off');assert.equal(result.statusRole,'status');
        assert.equal(result.green,'#b8dfc5');assert.equal(result.pink,'#f2bfc9');assert.equal(result.height,5);
        assert.ok(contrast(palettes[variant].amber,result.background)>=4.5,'Amber contrast against actual body background');
        assert.ok(contrast(palettes[variant].red,result.background)>=4.5,'Overtime contrast against actual body background');
    }
    async function desktop() {
        await cdp('Emulation.setTouchEmulationEnabled',{enabled:false});
        await cdp('Emulation.setDeviceMetricsOverride',{width:1280,height:800,screenWidth:1280,screenHeight:800,mobile:false,deviceScaleFactor:1});
    }
    async function checkViews(expected) {
        const frozen=await evaluate(`({time:document.querySelector('#time').textContent,overtime:document.querySelector('#time').textContent,budget:document.querySelector('#time-budget').textContent})`);
        for(const [width,height,screenWidth,screenHeight,touch] of [[1280,800,1280,800,false],[768,1024,768,1024,true],[320,568,320,568,true],[844,390,390,844,true]]) {
            await cdp('Emulation.setTouchEmulationEnabled',{enabled:touch});
            await cdp('Emulation.setDeviceMetricsOverride',{width,height,screenWidth,screenHeight,mobile:touch,deviceScaleFactor:1});
            for(const lang of ['de','en']) {
                await click(`[data-language="${lang}"]`);
                for(const [theme,os] of [['light','light'],['dark','dark'],['system','light'],['system','dark']]) {
                    await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:os},{name:'prefers-reduced-motion',value:'reduce'}]});
                    await click(`[data-theme="${theme}"]`);variant=theme==='system'?os:theme;
                    await check(expected);
                    assert.equal(await evaluate(`document.documentElement.scrollWidth<=innerWidth`),true,`No visual-state overflow ${width}/${lang}/${theme}/${os}`);
                    assert.equal(await text('#time'),frozen.time);assert.equal(await text('#time'),frozen.overtime);
                }
            }
            if(process.env.EASYTIMER_SCREENSHOT_DIR) {
                const shot=await cdp('Page.captureScreenshot',{format:'png'});
                await writeFile(join(process.env.EASYTIMER_SCREENSHOT_DIR,`time-visuals-${expected}-${width}-${height}.png`),Buffer.from(shot.data,'base64'));
            }
            if(width>=768&&height>width || width===1280) {
                await evaluate(`window.visualNative=false;Object.defineProperty(document,'fullscreenElement',{configurable:true,get:()=>window.visualNative?document.documentElement:null});Object.defineProperty(document,'fullscreenEnabled',{configurable:true,value:true});document.documentElement.requestFullscreen=async()=>{window.visualNative=true;document.dispatchEvent(new Event('fullscreenchange'));};document.exitFullscreen=async()=>{window.visualNative=false;document.dispatchEvent(new Event('fullscreenchange'));};`);
                await click('#fullscreen');assert.equal(await evaluate(`Boolean(document.fullscreenElement)&&document.body.classList.contains('presentation')`),true);
                await check(expected);await click('#fullscreen');await check(expected);
                await evaluate(`delete document.fullscreenElement;delete document.fullscreenEnabled;delete document.exitFullscreen;delete document.documentElement.requestFullscreen;Object.defineProperty(document,'fullscreenEnabled',{configurable:true,value:false});`);
                await click('#fullscreen');assert.equal(await evaluate(`document.body.classList.contains('presentation')`),true);await check(expected);
                await click('#fullscreen');await evaluate(`delete document.fullscreenEnabled`);
            }
        }
        await desktop();
        await click('[data-language="en"]');await click('[data-theme="light"]');variant='light';
    }
    await desktop();await click('[data-language="en"]');await click('[data-theme="light"]');
    await evaluate(`window.visualRealNow=Date.now;window.visualNow=Date.now();Date.now=()=>window.visualNow;window.visualRealConfirm=window.confirm;window.confirm=()=>true;`);
    try {
        for(const [hours,minutes,seconds,threshold] of [[0,3,0,10000],[0,10,0,30000],[0,30,0,60000],[1,0,0,180000],[1,0,30,300000]]) {
            const duration=(hours*3600+minutes*60+seconds)*1000;
            await configure(hours,minutes,seconds);await check('NORMAL');await click('#primary');
            await tick(duration-threshold-1);await check('NORMAL');await tick(1);await check('ENDGAME');
            await click('#primary');await tick(1000);await check('ENDGAME');await click('#primary');
            await tick(1);await check('ENDGAME');await tick(threshold-1);await check('EXPIRED');
            assert.equal(await text('#time'),'+00:00','Overtime is red from its first zero display');
            await click('#primary');await check('NORMAL');await click('#stop');await check('NORMAL');
        }
        await configure(0,3,0);await click('[data-adjustment="30000"]');await check('NORMAL');
        await click('#primary');await tick(185000);await check('ENDGAME');
        await click('[data-adjustment="30000"]');await check('NORMAL');
        await tick(60000);await check('EXPIRED');assert.equal(await text('#time'),'+00:05');
        await click('[data-adjustment="30000"]');await check('ENDGAME');assert.equal(await text('#time'),'00:25');
        await click('[data-adjustment="30000"]');await check('NORMAL');assert.equal(await text('#time'),'00:55');
        await tick(85000);await check('EXPIRED');assert.equal(await text('#time'),'+00:30');
        await click('[data-adjustment="30000"]');await check('EXPIRED');assert.equal(await text('#time'),'+00:00');
        await click('#stop');await configure(0,3,0);await click('#primary');await tick(170000);
        await checkViews('ENDGAME');await tick(10000);await checkViews('EXPIRED');
        await click('#stop');
        await evaluate(`localStorage.setItem('easyTimerTemplates',JSON.stringify({schemaVersion:1,templates:[{id:'visual-session',name:'Visual workshop',transitionMode:'manual',phases:[{id:'short',title:'Short phase',durationSeconds:60},{id:'long',title:'Long phase',durationSeconds:900}]}]}))`);
        await menu('#open-session');
        await evaluate(`(()=>{const select=document.querySelector('#session-template');select.value='visual-session';select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
        await click('#prepare-session');await check('NORMAL');await click('#primary');await tick(45000);await check('NORMAL');
        assert.equal(await text('#time'),'00:15','Workshop duration must not determine the phase threshold');
        await tick(5000);await check('ENDGAME');await click('#primary');await tick(100000);await check('ENDGAME');
        await click('#primary');await tick(10000);await check('EXPIRED');
        assert.match(await evaluate(`document.querySelector('#time').getAttribute('aria-label')`), /^Phase overtime:/);
        await checkViews('EXPIRED');
        await click('#next');await check('NORMAL');assert.equal(await text('#time'),'15:00');
        await click('#primary');await tick(839999);await check('NORMAL');await tick(1);await check('ENDGAME');
        await click('#primary');await click('#next');await check('EXPIRED');
        assert.match(await evaluate(`document.querySelector('#time').getAttribute('aria-label')`), /^Workshop overtime:/);assert.equal(await text('#time'),'+00:00');
        await tick(6000);await click('#primary');await check('EXPIRED');await tick(120000);await check('EXPIRED');
        assert.equal(await text('#time'),'+00:06');
        await click('#primary');await tick(1000);await click('#stop-overtime');await check('EXPIRED');
        await tick(999999);await check('EXPIRED');assert.equal(await text('#time'),'+00:07');
        await checkViews('EXPIRED');await click('#stop');await check('NORMAL');
        await menu('#open-quick');await configure(0,5,0);await check('NORMAL');
    } finally {
        await evaluate(`Date.now=window.visualRealNow;window.confirm=window.visualRealConfirm;${baseline===null?"localStorage.removeItem('easyTimerTemplates')":`localStorage.setItem('easyTimerTemplates',${JSON.stringify(baseline)})`};`);
        await desktop();await cdp('Emulation.setEmulatedMedia',{features:[]});
        await click('[data-language="en"]');await click('[data-theme="system"]');
    }
    console.log('PASS: shared fixed endgame buckets, exact expiry, additions/recovery, current-phase and final overtime states, Light/Dark/System contrast, DE/EN, desktop/native/expanded/mobile views and unchanged progress colors.');
}
