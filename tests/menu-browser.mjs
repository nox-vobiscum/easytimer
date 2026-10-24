import assert from 'node:assert/strict';
import { mkdtemp, writeFile, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';


export async function checkMenuPolish({evaluate,click,text,cdp}) {
    const output=await mkdtemp(join(tmpdir(),'easytimer-menu-review-'));
    const images=[],dimensions=[];
    const menu=async selector=>{await click('#menu-toggle');await click(selector);};
    const capture=async(name,label)=>{
        const shot=await cdp('Page.captureScreenshot',{format:'png'});
        await writeFile(join(output,name+'.png'),Buffer.from(shot.data,'base64'));
        images.push([name+'.png',label]);
    };
    for(const [width,height] of [[1280,800],[390,844],[320,568],[844,390]])for(const language of ['de','en'])for(const theme of ['light','dark'])for(const mode of ['quick','session']) {
        await cdp('Emulation.setTouchEmulationEnabled',{enabled:width!==1280});
        await cdp('Emulation.setDeviceMetricsOverride',{width,height,screenWidth:width===1280?1280:390,screenHeight:width===1280?800:844,mobile:width!==1280,deviceScaleFactor:1});
        await click(`[data-language="${language}"]`);await click(`[data-theme="${theme}"]`);
        await menu(mode==='quick'?'#open-quick':'#open-session');
        if(await evaluate(`document.querySelector('#preferences').hidden`))await click('#menu-toggle');
        await cdp('Page.captureScreenshot',{format:'png'});
        assert.equal(await text('#open-planner [data-copy="planner"]'),language==='de'?'Session-Editor':'Session Editor');
        assert.equal(await text('.editor-subtitle'),language==='de'?'Sessions erstellen & verwalten':'Create & manage sessions');
        const geometry=await evaluate(`(()=>{const panel=document.querySelector('#preferences'),r=panel.getBoundingClientRect(),groups=[...document.querySelectorAll('.menu-settings .switch')].map(e=>e.getBoundingClientRect()),q=document.querySelector('#open-quick').getBoundingClientRect(),s=document.querySelector('#open-session').getBoundingClientRect(),editor=document.querySelector('#open-planner');return {width:r.width,height:r.height,fit:r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight&&panel.scrollWidth<=panel.clientWidth,row:Math.abs(groups[0].top-groups[1].top)<1&&groups[0].right<=groups[1].left,tiles:Math.abs(q.width-s.width)<1&&q.top===s.top,targets:[...panel.querySelectorAll('button')].every(b=>{const r=b.getBoundingClientRect();return r.width>=44&&r.height>=44}),selected:document.querySelector('#open-'+document.body.dataset.mode).getAttribute('aria-pressed')==='true',subtitle:editor.scrollWidth<=editor.clientWidth,labels:[...document.querySelectorAll('.menu-settings [role="group"]')].every(e=>Boolean(e.getAttribute('aria-label')))};})()`);
        for(const field of ['fit','row','tiles','targets','selected','subtitle','labels'])assert.equal(geometry[field],true,`${width}/${language}/${theme}/${mode}: ${field}`);
        dimensions.push({width,language,theme,mode,menuWidth:geometry.width,menuHeight:geometry.height});
        await evaluate(`document.querySelector('#preferences').scrollTop=0`);
        await capture(`menu-${width}-${language}-${theme}-${mode}`,`${width}px · ${language} · ${theme} · ${mode}`);
        // A short landscape panel must scroll every preference into view for keyboard users.
        await evaluate(`document.querySelector('[data-theme="system"]').focus()`);
        assert.equal(await evaluate(`(()=>{const r=document.activeElement.getBoundingClientRect(),p=document.querySelector('#preferences').getBoundingClientRect();return r.top>=p.top&&r.bottom<=p.bottom;})()`),true,'Focused final theme control remains inside the scrollable panel');
        await click('#menu-toggle');
    }
    await menu('#open-quick');await menu('#open-planner');
    assert.equal(await text('#planner h1'),'Session Editor');
    assert.equal(await evaluate(`document.querySelector('#planner').getAttribute('aria-label')`),'Session Editor');
    await click('[data-language="de"]');
    assert.equal(await text('#planner h1'),'Session-Editor');
    assert.equal(await evaluate(`document.querySelector('#planner').getAttribute('aria-label')`),'Session-Editor');
    await click('.planner-back');
    assert.equal(await evaluate(`document.querySelector('#open-quick').getAttribute('aria-pressed')`),'true');
    await cdp('Emulation.setTouchEmulationEnabled',{enabled:false});
    await cdp('Emulation.setDeviceMetricsOverride',{width:1280,height:800,screenWidth:1280,screenHeight:800,mobile:false,deviceScaleFactor:1});
    await click('[data-language="en"]');await click('[data-theme="dark"]');await click('#menu-toggle');
    await evaluate(`document.querySelector('#open-session').focus()`);
    assert.equal(await evaluate(`getComputedStyle(document.activeElement).outlineStyle`),'solid');
    await capture('mode-keyboard-focus','Keyboard focus on Session Timer');await click('#menu-toggle');
    await menu('#open-session');
    for(const theme of ['light','dark'])for(const size of [24,28,32]) {
        await click(`[data-theme="${theme}"]`);
        if(await evaluate(`document.querySelector('#preferences').hidden`))await click('#menu-toggle');
        await evaluate(`(()=>{const icon=document.querySelector('.session-stopwatch');icon.style.width='${size}px';icon.style.height='${size}px';})()`);
        assert.equal(await evaluate(`(()=>{const icon=document.querySelector('.session-stopwatch'),near=getComputedStyle(icon.querySelector('.stopwatch-echo-near')),far=getComputedStyle(icon.querySelector('.stopwatch-echo-far'));return icon.querySelectorAll('circle').length===3&&icon.querySelectorAll('.stopwatch-echo').length===2&&Number(near.opacity)>Number(far.opacity)&&Number(near.opacity)<.7&&getComputedStyle(icon.querySelector('.stopwatch-face')).fill===getComputedStyle(document.querySelector('#open-session')).backgroundColor;})()`),true,'Selected stopwatch dominates two theme-aware rear echoes without transparent foreground overlap');
        await capture('stopwatch-echo-'+theme+'-'+size,'Selected Stopwatch + Echo | '+theme+' | '+size+'px | actual menu');
        await evaluate(`document.querySelector('.session-stopwatch').removeAttribute('style')`);
    }
    await click('#menu-toggle');
    if(process.env.EASYTIMER_MENU_BEFORE) {
        for(const file of ['menu-hierarchy-1280-de-dark.png','menu-hierarchy-320-de-light.png','menu-hierarchy-667-en-dark.png']) {
            await copyFile(join(process.env.EASYTIMER_MENU_BEFORE,file),join(output,'before-'+file));
            images.unshift(['before-'+file,'BEFORE · '+file]);
        }
    }
    await writeFile(join(output,'dimensions.json'),JSON.stringify(dimensions,null,2));
    await writeFile(join(output,'index.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Menu polish review</title><style>body{font:16px system-ui;margin:24px;background:#f6f8fc;color:#172337}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr));gap:20px}img{width:100%;border:1px solid #c8d1e0}h2{font-size:16px}</style><h1>Menu polish — owner review</h1><p>Before: desktop 320px wide, narrow portrait 256px; 112px tiles. After: up to 288px wide, 96px tiles; language/theme share one row. <a href="dimensions.json">Measured after dimensions</a>. Selected icon: Variant B - Stopwatch + Echo from the owner reference. Size checks show the actual menu at 24, 28 and 32px.</p><main>${images.map(([file,label])=>`<article><h2>${label}</h2><a href="${file}"><img src="${file}" alt="${label}" loading="lazy"></a></article>`).join('')}</main></html>`);
    await click('[data-theme="system"]');await menu('#open-quick');
    if(!await evaluate(`document.querySelector('#preferences').hidden`))await click('#menu-toggle');
    console.log(`PASS: compact menu, single settings row, Editor terminology, mode/Editor navigation, targets, focus and responsive DE/EN/Light/Dark. Gallery: ${join(output,'index.html')}`);
}
