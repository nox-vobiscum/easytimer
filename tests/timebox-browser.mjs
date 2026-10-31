import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function checkTimeboxControls({ evaluate, click, text, cdp, configure }) {
    const hexRgb = hex => {
        const compact = hex.trim().replace('#', '');
        const value = compact.length === 3 ? [...compact].map(channel => channel + channel).join('') : compact;
        return `rgb(${parseInt(value.slice(0,2),16)}, ${parseInt(value.slice(2,4),16)}, ${parseInt(value.slice(4,6),16)})`;
    };
    const contrast = (first, second) => {
        const luminance = hex => {
            const value = hex.trim().replace('#','');
            const channels = [0,2,4].map(index => parseInt(value.slice(index,index+2),16) / 255).map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4);
            return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
        };
        const values = [luminance(first),luminance(second)].sort((a,b) => b-a);
        return (values[0] + .05) / (values[1] + .05);
    };
    const actionStyle = selector => evaluate(`(()=>{const button=document.querySelector(${JSON.stringify(selector)}),style=getComputedStyle(button),root=getComputedStyle(document.documentElement);return {action:button.dataset.action||'',background:style.backgroundColor,color:style.color,border:style.borderTopColor,pageBackground:root.getPropertyValue('--bg').trim(),accent:root.getPropertyValue('--accent').trim(),onAccent:root.getPropertyValue('--on-accent').trim(),startBackground:root.getPropertyValue('--action-start-bg').trim(),startColor:root.getPropertyValue('--action-start-text').trim(),startBorder:root.getPropertyValue('--action-start-border').trim(),stopBackground:root.getPropertyValue('--action-stop-bg').trim(),stopColor:root.getPropertyValue('--action-stop-text').trim(),stopBorder:root.getPropertyValue('--action-stop-border').trim()};})()`);
    const assertTone = async (selector, tone, action = '') => {
        const style = await actionStyle(selector);
        if (action) assert.equal(style.action, action);
        assert.deepEqual([style.background,style.color,style.border],[hexRgb(style[`${tone}Background`]),hexRgb(style[`${tone}Color`]),hexRgb(style[`${tone}Border`])]);
        assert(contrast(style[`${tone}Color`],style[`${tone}Background`]) >= 4.5, `${tone} text contrast`);
        assert(contrast(style[`${tone}Border`],style[`${tone}Background`]) >= 3, `${tone} internal border contrast`);
        assert(contrast(style[`${tone}Border`],style.pageBackground) >= 3, `${tone} adjacent border contrast`);
    };
    const assertBluePrimary = async action => {
        const style = await actionStyle('#primary');
        assert.equal(style.action, action);
        assert.deepEqual([style.background,style.color,style.border],[hexRgb(style.accent),hexRgb(style.onAccent),hexRgb(style.accent)]);
    };
    const hover = async selector => {
        const point = await evaluate(`(()=>{const bounds=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:bounds.x+bounds.width/2,y:bounds.y+bounds.height/2};})()`);
        await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',...point});
    };
    const clock = () => evaluate('JSON.parse(localStorage.getItem("easyTimerRuntime.v1."+sessionStorage.getItem("easyTimerRuntimeContext.v1"))).clock');
    const wait = async expression => {
        for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await delay(50); }
        assert.fail('Timebox timeout: ' + expression);
    };
    const reload = async () => {
        const before = await evaluate('performance.timeOrigin'); await cdp('Page.reload');
        await wait(`performance.timeOrigin!==${before} && Boolean(document.querySelector('#primary')?.title)`);
    };
    const menu = async selector => {
        if (await evaluate('document.querySelector("#preferences").hidden')) await click('#menu-toggle');
        await click(selector);
    };
    const visibleGroups = async ready => {
        assert.deepEqual(await evaluate('({ready:!document.querySelector(".duration-config").hidden,runtime:!document.querySelector(".duration-adjustments").hidden})'), { ready, runtime:!ready });
    };
    const subtract = () => evaluate(`document.querySelector('[data-preset="3600000"]').dispatchEvent(new MouseEvent('click',{bubbles:true,shiftKey:true}))`);
    const key = async (value, shift) => {
        const code = value === 'Enter' ? 13 : 32;
        await cdp('Input.dispatchKeyEvent', { type:'keyDown', key:value, code:value==='Enter'?'Enter':'Space', windowsVirtualKeyCode:code, modifiers:shift?8:0, text:value==='Enter'?'\r':' ' });
        await cdp('Input.dispatchKeyEvent', { type:'keyUp', key:value, code:value==='Enter'?'Enter':'Space', windowsVirtualKeyCode:code, modifiers:shift?8:0 });
    };
    const screenshots = await mkdtemp(join(tmpdir(), 'easytimer-timebox-'));
    const savedLibrary = await evaluate('localStorage.getItem("easyTimerTemplates")');
    await click('[data-language=en]');
    assert.equal(await text('#time'), '00:00'); await visibleGroups(true);
    await assertTone('#primary','start','start');
    assert.equal((await clock()).deadlineMs, null);
    assert.equal(await evaluate('document.querySelectorAll("[data-preset]").length'), 8);
    assert.equal(await evaluate('document.querySelectorAll("[data-preset][aria-pressed]").length'), 0);
    await click('[data-preset="60000"]'); await click('[data-preset="60000"]'); await click('[data-preset="120000"]');
    assert.equal(await text('#time'), '04:00');
    await evaluate(`document.querySelector('[data-preset="60000"]').focus()`);
    await cdp('Page.bringToFront');
    for (const value of ['Enter',' ']) { await key(value, true); await key(value, false); assert.equal(await text('#time'), '04:00'); }
    await subtract(); assert.equal(await text('#time'), '00:00');
    assert.equal(await evaluate('document.querySelector("#primary").disabled'), true);
    await assertTone('#primary','start','start');
    await click('#primary'); assert.equal((await clock()).status, 'READY');
    await reload(); assert.equal(await text('#time'), '00:00'); await visibleGroups(true);
    await click('#reset-timebox'); assert.equal(await text('#time'), '00:00');
    assert.equal((await clock()).deadlineMs, null);
    await configure(0, 5, 0); await reload(); assert.equal(await text('#time'), '05:00', 'Existing five-minute configuration is not migrated');
    await menu('#open-planner'); await reload(); assert(await evaluate('document.body.classList.contains("planner-open")'));
    await click('.planner-back'); assert.equal(await text('#time'), '05:00');
    try {
        const library = { schemaVersion:1, templates:[{id:'timebox-return',name:'Synthetic Timebox return',transitionMode:'manual',phases:[{id:'timebox-phase',title:'Opening',durationSeconds:60}]}] };
        await evaluate(`localStorage.setItem('easyTimerTemplates',${JSON.stringify(JSON.stringify(library))})`);
        await menu('#open-session');
        await evaluate('const s=document.querySelector("#session-template");s.value="timebox-return";s.dispatchEvent(new Event("change"));document.querySelector("#prepare-session").click()');
        assert.equal((await clock()).policy, 'session');
        assert.deepEqual(await evaluate('({ready:!document.querySelector(".duration-config").hidden,runtime:!document.querySelector(".duration-adjustments").hidden})'), {ready:false,runtime:false});
        await reload(); await menu('#open-quick'); assert.equal(await text('#time'), '05:00', 'Session return retains configured Quick duration');
        await click('#reset-timebox'); await click('[data-preset="300000"]');
        await click('#primary'); await visibleGroups(false); await assertBluePrimary('pause'); await assertTone('#stop','stop'); await click('[data-adjustment="60000"]');
        await click('#primary'); await visibleGroups(false); await assertTone('#primary','start','resume'); await assertTone('#stop','stop');
        await hover('#primary'); await assertTone('#primary','start','resume'); await hover('#stop'); await assertTone('#stop','stop');
        await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:0,y:0}); await click('#stop');
        assert.equal(await text('#time'), '05:00'); assert.equal((await clock()).adjustmentMs, 0); await visibleGroups(true);
        await configure(0,0,1); await click('#primary'); await delay(1150); await wait('document.querySelector("#status").textContent==="Time’s up"');
        await assertBluePrimary('newRun'); await assertTone('#stop','stop');
        await visibleGroups(false); await click('#primary'); assert.equal((await clock()).status, 'RUNNING');
        assert.equal((await clock()).durationMs, 1000); assert.equal((await clock()).adjustmentMs, 0);
        await click('#stop'); assert.equal(await text('#time'), '00:01');
        await configure(99,59,59); await click('[data-preset="60000"]');
        assert.equal(await text('#time'), '99:59:59'); assert.match(await text('#help'), /99:59:59/);
        for (const language of ['de','en']) {
            await click(`[data-language="${language}"]`); await click('#reset-timebox');
            assert.equal(await evaluate('document.querySelector("#reset-timebox").getAttribute("aria-label")'), language==='de'?'Timebox auf 00:00 zurücksetzen':'Reset timebox to 00:00');
            for (const theme of ['light','dark','system']) {
                await click(`[data-theme="${theme}"]`);
                await assertTone('#primary','start','start');
                await assertTone('#stop','stop');
                for (const [width,height] of [[1280,800],[320,640],[667,375],[568,320]]) {
                    await cdp('Emulation.setTouchEmulationEnabled',{enabled:width<700});
                    await cdp('Emulation.setDeviceMetricsOverride',{width,height,screenWidth:width,screenHeight:height,deviceScaleFactor:1,mobile:width<700,screenOrientation:{type:width>height?'landscapePrimary':'portraitPrimary',angle:width>height?90:0}});
                    await wait(`document.body.dataset.device==='${width<700?'smartphone':'desktop-tablet'}'`);
                    await cdp('Page.bringToFront');
                    await click('[data-preset="60000"]');
                    await evaluate('document.querySelector("#reset-timebox").focus()');
                    await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
                    await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
                    assert.equal(await evaluate('document.activeElement.id'), 'primary');
                    assert.equal(await evaluate('getComputedStyle(document.querySelector("#primary")).outlineStyle'), 'solid');
                    assert.equal(await evaluate('getComputedStyle(document.querySelector("#primary")).outlineColor'), hexRgb((await actionStyle('#primary')).accent));
                    await evaluate('document.querySelector("#reset-timebox").focus()');
                    await key('Enter',false);
                    await visibleGroups(true);
                    assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
                    assert(await evaluate('Array.from(document.querySelectorAll(".duration-presets button")).every(b=>{const r=b.getBoundingClientRect();return r.width>=44&&r.height>=44&&r.left>=0&&r.right<=innerWidth})'));
                    assert.equal(await evaluate('document.querySelector(".duration-presets").lastElementChild.id'), 'reset-timebox');
                    if (width === 1280) assert.equal(await evaluate('new Set(Array.from(document.querySelectorAll(".duration-presets button"),b=>b.getBoundingClientRect().top)).size'), 1, 'Desktop reset stays at the right of the minute buttons');
                    assert.equal(await evaluate('document.querySelectorAll("[data-preset][aria-pressed]").length'), 0);
                    if (theme!=='system') {
                        const shot = await cdp('Page.captureScreenshot',{format:'png'});
                        await writeFile(join(screenshots, `${language}-${theme}-${width}.png`),Buffer.from(shot.data,'base64'));
                    }
                }
            }
        }
        console.log(`PASS: UX-018 additive READY/keyboard/zero/reset, existing configuration/reload/Editor/Session return, Stop/restart, bounds, exclusive groups, DE/EN/themes/320px/landscape. Screenshots: ${screenshots}`);
    } finally {
        await cdp('Emulation.setTouchEmulationEnabled',{enabled:false});
        await cdp('Emulation.clearDeviceMetricsOverride'); await click('[data-language=en]');
        await evaluate(`if(${JSON.stringify(savedLibrary)}===null)localStorage.removeItem('easyTimerTemplates');else localStorage.setItem('easyTimerTemplates',${JSON.stringify(savedLibrary)})`);
        await configure(0,5,0);
    }
}
