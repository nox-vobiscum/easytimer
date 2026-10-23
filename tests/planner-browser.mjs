import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function checkPlanner({ evaluate, click, text, cdp, configure }) {
    const field = (selector, value) => evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    const action = (label) => evaluate(`(()=>{const el=Array.from(document.querySelectorAll('#planner button')).find(b=>b.textContent===${JSON.stringify(label)});if(!el)throw new Error('Missing planner action');el.click();})()`);
    const open = async () => {
        await click('#menu-toggle'); await click('#open-planner');
        for (let i = 0; i < 30; i++) { if (await evaluate(`document.activeElement===document.querySelector('#planner h1')`)) return; await delay(50); }
        assert.fail('Planner heading receives focus');
    };
    const stored = () => evaluate(`JSON.parse(localStorage.getItem('easyTimerTemplates'))`);
    await cdp('Emulation.setDeviceMetricsOverride', { width:1280,height:800,deviceScaleFactor:1,mobile:false,screenWidth:1280,screenHeight:800 });
    await cdp('Emulation.setTouchEmulationEnabled', { enabled:false });
    await click('[data-language="en"]');
    await evaluate(`localStorage.removeItem('easyTimerTemplates');window.originalConfirm=window.confirm;window.confirmMessages=[];window.confirm=message=>{window.confirmMessages.push(message);return window.acceptConfirm!==false;};`);
    await evaluate(`window.plannerRealNow=Date.now;window.plannerNow=Date.now();Date.now=()=>window.plannerNow`);
    await configure(0, 1, 0); await click('#primary'); await click('[data-adjustment="30000"]');
    await open();
    assert.match(await text('#planner'), /No workshop templates/);
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('.timer')).display`), 'none');
    const before = await evaluate(`({time:document.querySelector('#time').textContent,budget:document.querySelector('#time-budget').textContent})`);
    await action('Create template');
    assert.equal(await evaluate('document.activeElement.id'), 'template-name');
    await field('#template-name', 'Workshop <safe>');
    await click('#menu-toggle'); await click('#open-planner');
    assert.equal(await evaluate(`document.querySelector('#template-name').value`), 'Workshop <safe>', 'Reopening navigation retains an unsaved draft');
    await action('Save'); assert.match(await text('.planner-feedback'), /at least one phase/);
    await action('+ Add phase');
    await field('.phase-list input[type="text"]', 'Introduction');
    await field('.phase-list input[id$="-minutes"]', '60');
    assert.match(await text('#planner-total'), /01:00:00/);
    await action('+ Add phase');
    await field('.phase-list li:last-child input[type="text"]', 'Discussion');
    const ids = await evaluate(`Array.from(document.querySelectorAll('.phase-list li')).map(el=>el.dataset.phaseId)`);
    await click('.phase-list li:last-child [data-direction="-1"]');
    assert.deepEqual(await evaluate(`Array.from(document.querySelectorAll('.phase-list li')).map(el=>el.dataset.phaseId)`), [...ids].reverse());
    await action('Save');
    assert.match(await text('.template-library'), /Workshop <safe>/);
    assert.equal(await evaluate(`document.querySelector('#planner safe')`), null, 'Template text is never parsed as HTML');
    let data = await stored(); const firstId = data.templates[0].id;
    assert.deepEqual(data.templates[0].phases.map(p=>p.id), [...ids].reverse());
    assert.equal(data.templates[0].phases[1].durationSeconds, 3600);
    await action('Edit'); await field('#template-name', 'Discard this');
    await evaluate('window.acceptConfirm=false'); await action('Cancel');
    assert.equal(await evaluate(`document.querySelector('#template-name').value`), 'Discard this');
    await evaluate('window.acceptConfirm=true'); await action('Cancel');
    assert.equal((await stored()).templates[0].name, 'Workshop <safe>');
    await action('Create template'); await field('#template-name', 'Second workshop'); await action('+ Add phase');
    await field('.phase-list input[type="text"]', 'Opening');
    await evaluate(`document.querySelector('#transition-manual').focus()`);
    await cdp('Input.dispatchKeyEvent', { type:'keyDown', key:'ArrowRight', code:'ArrowRight', windowsVirtualKeyCode:39 });
    await cdp('Input.dispatchKeyEvent', { type:'keyUp', key:'ArrowRight', code:'ArrowRight', windowsVirtualKeyCode:39 });
    assert.equal(await evaluate(`document.querySelector('#transition-automatic').checked&&document.activeElement.id==='transition-automatic'`), true, 'Native radio keyboard navigation selects Automatic');
    await click('[data-language="de"]');
    assert.deepEqual(await evaluate(`Array.from(document.querySelectorAll('.transition-choice span')).map(el=>el.textContent)`), ['Manuell','Automatisch']);
    assert.equal(await evaluate(`document.querySelector('#transition-automatic').checked`), true);
    await click('[data-language="en"]');
    assert.equal(await evaluate(`document.activeElement.id`), 'transition-automatic', 'A language change restores radio focus without text-selection errors');
    await action('Save');
    assert.equal((await stored()).templates.length, 2);
    assert.equal((await stored()).templates[1].transitionMode, 'automatic');
    await action('Edit'); await field('#template-name', 'Retained draft');
    await evaluate(`window.originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='easyTimerTemplates')throw new DOMException('Quota','QuotaExceededError');return window.originalSetItem.call(this,key,value);};`);
    await action('Save'); assert.match(await text('.planner-feedback'), /Saving failed/);
    assert.equal(await evaluate(`document.querySelector('#template-name').value`), 'Retained draft');
    assert.equal((await stored()).templates[0].name, 'Workshop <safe>');
    await evaluate(`Storage.prototype.setItem=window.originalSetItem;const data=JSON.parse(localStorage.getItem('easyTimerTemplates'));data.templates[1].name='Changed elsewhere';localStorage.setItem('easyTimerTemplates',JSON.stringify(data));window.externalRaw=localStorage.getItem('easyTimerTemplates');window.dispatchEvent(new StorageEvent('storage',{key:'easyTimerTemplates'}));`);
    await action('Save'); assert.match(await text('.planner-feedback'), /another tab/);
    assert.equal(await evaluate(`localStorage.getItem('easyTimerTemplates')===window.externalRaw`), true);
    assert.equal(await evaluate(`document.querySelector('#template-name').value`), 'Retained draft');
    await evaluate('window.acceptConfirm=false'); await action('Reload saved templates');
    assert.equal(await evaluate(`document.querySelector('#template-name').value`), 'Retained draft');
    await evaluate('window.acceptConfirm=true'); await action('Reload saved templates');
    assert.match(await text('.template-library'), /Changed elsewhere/);
    await action('Edit');
    await field('#template-name', 'Renamed workshop');
    await field('.phase-list input[id$="-minutes"]', '6001');
    await action('Save'); assert.match(await text('.planner-feedback'), /whole number/);
    assert.equal(await evaluate(`document.activeElement.id.endsWith('-minutes')&&document.activeElement.getAttribute('aria-invalid')==='true'`), true, 'Validation focuses the invalid duration field');
    assert.equal((await stored()).templates[0].name, 'Workshop <safe>');
    await field('.phase-list input[id$="-minutes"]', '10');
    await action('+ Add phase');
    await field('.phase-list li:last-child input[type="text"]', 'Temporary phase');
    await click('.phase-list li:last-child .phase-actions button:last-child');
    assert.equal(await evaluate(`document.querySelectorAll('.phase-list li').length`), 2);
    assert.equal(await evaluate(`document.activeElement.classList.contains('add-phase')`), true);
    // Check desktop, tablet, portrait and short landscape while editing the same draft.
    for (const [width, height, screenWidth, screenHeight, touch] of [[1280,800,1280,800,false],[768,1024,768,1024,true],[390,600,768,1024,true],[320,568,320,568,true],[844,390,390,844,true]]) {
        await cdp('Emulation.setTouchEmulationEnabled', { enabled:touch });
        await cdp('Emulation.setDeviceMetricsOverride', { width,height,screenWidth,screenHeight,deviceScaleFactor:1,mobile:touch });
        await delay(100);
        assert.equal(await evaluate(`document.body.classList.contains('presentation')`), false, 'Planner never uses large-clock presentation');
        assert.equal(await evaluate(`document.documentElement.scrollWidth<=innerWidth`), true, `Planner fits ${width}x${height}`);
        assert.equal(await evaluate(`Array.from(document.querySelectorAll('#planner button,#planner input,#planner select')).filter(el=>el.getClientRects().length).every(el=>{const r=el.getBoundingClientRect();return r.height>=44&&r.left>=0&&r.right<=innerWidth})`), true, 'Accessible controls fit horizontally');
        for (const theme of ['light', 'dark', 'system']) {
            await click(`[data-theme="${theme}"]`);
            assert.equal(await evaluate(`document.documentElement.dataset.theme`), theme);
        }
        await click('[data-language="de"]');
        assert.equal(await text('#planner h1'), 'Session-Planer');
        assert.equal(await evaluate(`document.querySelector('#template-name').value`), 'Renamed workshop');
        await click('[data-language="en"]');
        if (process.env.EASYTIMER_SCREENSHOT_DIR) {
            await evaluate('scrollTo(0,0)');
            const shot = await cdp('Page.captureScreenshot', { format:'png' });
            await writeFile(join(process.env.EASYTIMER_SCREENSHOT_DIR, `planner-${width}-${height}.png`), Buffer.from(shot.data, 'base64'));
        }
    }
    await action('Save');
    assert.equal((await stored()).templates[0].id, firstId);
    assert.equal((await stored()).templates[0].name, 'Renamed workshop');
    await evaluate(`window.plannerNow+=3000;document.dispatchEvent(new Event('visibilitychange'))`);
    await action('Back to timer');
    assert.equal(await evaluate('document.activeElement.id'), 'menu-toggle');
    assert.equal(await text('#time-budget'), before.budget);
    assert.notEqual(await text('#time'), before.time, 'Quick Timer advances in the workspace');
    assert.equal(await text('#time'), '01:27', 'Deadline and additions survive the complete editor workflow');
    assert.equal(await text('#status'), 'Running');
    await click('#stop');
    await configure(0,1,0); await click('#primary'); await click('#primary');
    const pausedTime = await text('#time');
    await open();
    await evaluate(`window.plannerNow+=60000;document.dispatchEvent(new Event('visibilitychange'))`);
    await action('Back to timer');
    assert.equal(await text('#status'), 'Paused'); assert.equal(await text('#time'), pausedTime);
    await click('#stop');
    await cdp('Emulation.setDeviceMetricsOverride', { width:1280,height:800,screenWidth:1280,screenHeight:800,deviceScaleFactor:1,mobile:false });
    await cdp('Emulation.setTouchEmulationEnabled', { enabled:false });
    // Explicitly model native fullscreen and prove navigation never restores it or a fallback.
    await evaluate(`Object.defineProperty(document,'fullscreenElement',{configurable:true,get:()=>window.plannerNative||null});Object.defineProperty(document,'fullscreenEnabled',{configurable:true,value:true});document.documentElement.requestFullscreen=async()=>{window.plannerNative=document.documentElement;document.dispatchEvent(new Event('fullscreenchange'));};document.exitFullscreen=async()=>{window.plannerNative=null;document.dispatchEvent(new Event('fullscreenchange'));};`);
    await click('#fullscreen');
    assert.equal(await evaluate('Boolean(document.fullscreenElement)'), true);
    await open(); await action('Back to timer');
    assert.equal(await evaluate(`Boolean(document.fullscreenElement)||document.body.classList.contains('presentation')`), false);
    await evaluate(`delete document.fullscreenElement;delete document.fullscreenEnabled;delete document.exitFullscreen;delete document.documentElement.requestFullscreen;`);
    await configure(0,0,1); await click('#primary'); await open();
    await evaluate(`window.plannerNow+=5000;document.dispatchEvent(new Event('visibilitychange'))`);
    await action('Back to timer');
    assert.equal(await text('#status'), 'Time’s up'); assert.equal(await text('#overtime-time'), '+00:04');
    await click('#stop'); await open();
    await evaluate('window.acceptConfirm=false'); await action('Delete'); assert.equal((await stored()).templates.length, 2);
    await evaluate('window.acceptConfirm=true'); await action('Delete'); assert.equal((await stored()).templates.length, 1);
    const validRaw = await evaluate(`localStorage.getItem('easyTimerTemplates')`);
    await evaluate(`localStorage.setItem('easyTimerTemplates','{broken')`);
    await action('Reload saved templates'); assert.match(await text('.planner-feedback'), /invalid/);
    await action('Create template'); await field('#template-name', 'Blocked'); await action('+ Add phase'); await field('.phase-list input[type="text"]', 'Phase'); await action('Save');
    assert.match(await text('.planner-feedback'), /before saving/);
    assert.equal(await evaluate(`localStorage.getItem('easyTimerTemplates')`), '{broken');
    await action('Cancel');
    await evaluate(`localStorage.setItem('easyTimerTemplates',${JSON.stringify(validRaw)})`);
    await action('Reload saved templates'); await action('Back to timer');
    // Exercise keyboard activation through the real browser event path.
    await click('#menu-toggle');
    await evaluate(`document.querySelector('#open-planner').focus()`);
    await cdp('Input.dispatchKeyEvent', { type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r' });
    await cdp('Input.dispatchKeyEvent', { type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13 });
    assert.equal(await evaluate(`document.activeElement===document.querySelector('#planner h1')`), true, JSON.stringify(await evaluate(`({active:document.activeElement.outerHTML,open:document.body.classList.contains('planner-open'),menu:document.querySelector('#preferences').hidden})`)));
    await cdp('Input.dispatchKeyEvent', { type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9 });
    await cdp('Input.dispatchKeyEvent', { type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9 });
    assert.equal(await evaluate(`document.activeElement.classList.contains('planner-back')`), true);
    await cdp('Input.dispatchKeyEvent', { type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r' });
    await cdp('Input.dispatchKeyEvent', { type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13 });
    assert.equal(await evaluate('document.activeElement.id'), 'menu-toggle');
    await evaluate(`window.confirm=window.originalConfirm;Date.now=window.plannerRealNow`);
    await checkPlannerCorrections({ evaluate, click, text, cdp });
    await checkCompactPlanner({ evaluate, click, text, cdp });
    console.log('PASS: Session Planner creation/edit/reorder/save/cancel/delete, storage protection, responsive themes/localization/focus, fullscreen exit and uninterrupted Quick Timer.');
}

async function checkCompactPlanner({ evaluate, click, text, cdp }) {
    const baseline = await evaluate(`localStorage.getItem('easyTimerTemplates')`);
    const field = (selector, value) => evaluate(`(()=>{const input=document.querySelector(${JSON.stringify(selector)});input.value=${JSON.stringify(value)};input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    const action = label => evaluate(`Array.from(document.querySelectorAll('#planner button')).find(b=>b.textContent===${JSON.stringify(label)}).click()`);
    await evaluate(`localStorage.setItem('easyTimerTemplates',JSON.stringify({schemaVersion:1,templates:[
        {id:'compact',name:'W'.repeat(120),transitionMode:'manual',phases:Array.from({length:12},(_,i)=>({id:'compact-'+i,title:'Phase '+(i+1)+' '+ 'T'.repeat(110),durationSeconds:900}))},
        {id:'hundred',name:'100 hours',transitionMode:'manual',phases:[{id:'hundred-phase',title:'Long phase',durationSeconds:360000}]},
        {id:'thousand',name:'1000 hours',transitionMode:'manual',phases:Array.from({length:10},(_,i)=>({id:'thousand-'+i,title:'Phase '+i,durationSeconds:360000}))}
    ]}));window.compactConfirm=window.confirm;window.confirm=()=>true;`);
    try {
        await click('#menu-toggle'); await click('#open-planner');
        assert.match(await text('.template-library li:nth-child(2)'), /100:00:00/);
        assert.match(await text('.template-library li:nth-child(3)'), /1000:00:00/);
        await action('Edit');
        assert.equal(await evaluate(`document.querySelectorAll('.phase-duration input').length`), 12);
        assert.equal(await evaluate(`document.querySelectorAll('.phase-list input').length`), 24, 'One title and one minute input per phase');
        await evaluate(`window.compactInput=document.querySelector('.phase-title input');window.compactTitle=window.compactInput.value;window.compactInput.focus();window.compactInput.setSelectionRange(5,9)`);
        await cdp('Input.insertText', { text:'edit' });
        assert.equal(await evaluate(`document.activeElement===window.compactInput&&document.activeElement.selectionStart===9`), true, 'Typing preserves the input node and cursor');
        await click('[data-theme="dark"]');
        assert.equal(await evaluate(`document.activeElement===window.compactInput`), true, 'Theme changes retain the focused input');
        await click('[data-language="de"]');
        assert.equal(await evaluate(`document.activeElement.id===window.compactInput.id&&document.activeElement.selectionStart===9&&document.activeElement.selectionEnd===9`), true, 'Language changes preserve the cursor');
        await click('[data-language="en"]');
        await field('.phase-title input', await evaluate('window.compactTitle'));
        const profiles = [
            [1920,1080,1920,1080,false],[1280,720,1280,720,false],[1024,768,1024,768,false],
            [500,720,1280,800,false],[768,1024,768,1024,true],[1024,768,768,1024,true],
            [390,600,768,1024,true],[390,844,390,844,true],[320,568,320,568,true],[844,390,390,844,true],
        ];
        for (const [width,height,screenWidth,screenHeight,touch] of profiles) {
            await cdp('Emulation.setTouchEmulationEnabled', { enabled:touch });
            await cdp('Emulation.setDeviceMetricsOverride', { width,height,screenWidth,screenHeight,mobile:touch,deviceScaleFactor:1 });
            for (const lang of ['de','en']) {
                await click(`[data-language="${lang}"]`);
                for (const theme of ['light','dark','system']) {
                    await click(`[data-theme="${theme}"]`);
                    const geometry = await evaluate(`(()=>{const row=document.querySelector('.phase-list li');const title=row.querySelector('.phase-title input').getBoundingClientRect();const duration=row.querySelector('.phase-duration input').getBoundingClientRect();const actions=row.querySelector('.phase-actions').getBoundingClientRect();return {overflow:document.documentElement.scrollWidth>innerWidth,presentation:document.body.classList.contains('presentation'),width:document.querySelector('#planner').getBoundingClientRect().width,rowHeight:row.getBoundingClientRect().height,aligned:Math.abs(title.top-duration.top)<1&&Math.abs(title.top-actions.top)<1,noOverlap:[title,duration,actions].every((a,i,all)=>all.slice(i+1).every(b=>a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top)),fit:Array.from(document.querySelectorAll('#planner input,#planner select,#planner button')).every(el=>{const r=el.getBoundingClientRect();return r.height>=44&&r.left>=0&&r.right<=innerWidth}),icons:Array.from(document.querySelectorAll('.phase-actions button')).every(el=>{const r=el.getBoundingClientRect();return r.width>=44&&el.querySelector('svg')&&el.getAttribute('aria-label')&&el.title}),labels:Array.from(document.querySelectorAll('#planner input')).every(input=>input.labels.length>0)};})()`);
                    assert.equal(geometry.overflow, false, `No overflow at ${width}x${height} ${lang}/${theme}`);
                    assert.equal(geometry.presentation, false);
                    assert.equal(geometry.fit && geometry.icons && geometry.labels && geometry.noOverlap, true, JSON.stringify(geometry));
                    if (geometry.width > 672) { assert.equal(geometry.aligned, true); assert.ok(geometry.rowHeight <= 72, 'Desktop phases use one compact row'); }
                }
                assert.equal(await evaluate(`document.querySelector('.phase-duration input').labels[0].textContent`), lang === 'de' ? 'Dauer (min)' : 'Duration (min)');
                assert.deepEqual(await evaluate(`Array.from(document.querySelectorAll('.transition-choice span')).map(el=>el.textContent)`), lang === 'de' ? ['Manuell','Automatisch'] : ['Manual','Automatic']);
                assert.equal(await evaluate(`Array.from(document.querySelectorAll('.transition-choice')).length===2&&Array.from(document.querySelectorAll('.transition-choice')).every(el=>{const r=el.getBoundingClientRect();return r.width>=44&&r.height>=44&&r.left>=0&&r.right<=innerWidth})&&document.querySelectorAll('.transition-choice input:checked').length===1`), true, 'Both radio options remain visible with touch targets');
                assert.equal(await text('.add-phase'), lang === 'de' ? '+ Phase hinzufügen' : '+ Add phase');
                const polish = await evaluate(`(()=>{const input=document.querySelector('#template-name');const label=input.labels[0].querySelector('span').getBoundingClientRect();const field=input.getBoundingClientRect();const back=document.querySelector('.planner-back');const arrow=back.querySelector('svg');return {gap:field.top-label.bottom,segmentWidth:document.querySelector('.transition-options').getBoundingClientRect().width,backText:back.textContent,decorative:arrow?.getAttribute('aria-hidden')==='true'&&arrow.getAttribute('focusable')==='false',arrowFirst:arrow?.getBoundingClientRect().right<=back.querySelector('span').getBoundingClientRect().left};})()`);
                assert.ok(polish.gap >= 7.5 && polish.gap <= 8.5, 'Workshop label leaves space for the focus outline');
                assert.ok(polish.segmentWidth < 230, 'Transition choices stay content-sized');
                assert.equal(polish.backText, lang === 'de' ? 'Zurück zum Timer' : 'Back to timer');
                assert.equal(polish.decorative && polish.arrowFirst, true, 'Back arrow precedes the unchanged localized label');
            }
            assert.equal(await evaluate(`document.querySelector('.phase-actions button[data-direction="-1"]').disabled`), true);
            assert.equal(await evaluate(`document.querySelector('.phase-list li:last-child button[data-direction="1"]').disabled`), true);
            if (process.env.EASYTIMER_SCREENSHOT_DIR) {
                await evaluate('scrollTo(0,0)');
                const screenshot = await cdp('Page.captureScreenshot', { format:'png' });
                await writeFile(join(process.env.EASYTIMER_SCREENSHOT_DIR, `planner-compact-${width}-${height}.png`), Buffer.from(screenshot.data,'base64'));
            }
            console.log(`Compact planner ${width}x${height}: ${await evaluate(`document.querySelector('.phase-list li').getBoundingClientRect().height`)} px per phase`);
        }
        const original = await evaluate(`localStorage.getItem('easyTimerTemplates')`);
        for (const [minutes,total] of [['1','02:46:00'],['90','04:15:00'],['180','05:45:00'],['6000','102:45:00']]) {
            await field('.phase-duration input', minutes); assert.match(await text('#planner-total'), new RegExp(total));
        }
        await field('.phase-duration input',''); await action('Save');
        assert.match(await text('.planner-feedback'), /whole number/);
        await click('[data-language="de"]');
        assert.equal(await evaluate(`document.querySelector('.phase-duration input').value`), '', 'Incomplete minutes survive language changes');
        assert.equal(await evaluate(`document.querySelector('.phase-duration input').getAttribute('aria-describedby')`), 'planner-feedback');
        await click('[data-language="en"]'); await action('Cancel');
        assert.equal(await evaluate(`localStorage.getItem('easyTimerTemplates')`), original);
        await click('.template-library li:nth-child(2) button:first-child');
        assert.equal(await evaluate(`document.querySelector('.phase-duration input').value`), '6000');
        assert.match(await text('#planner-total'), /100:00:00/);
        await action('Cancel'); await click('.template-library li:nth-child(3) button:first-child');
        assert.match(await text('#planner-total'), /1000:00:00/);
        await action('+ Add phase'); await field('.phase-list li:last-child .phase-title input','Over limit'); await action('Save');
        assert.match(await text('.planner-feedback'), /60,000/);
        assert.equal(await evaluate(`localStorage.getItem('easyTimerTemplates')`), original, 'An excessive total never overwrites valid data');
        await action('Cancel'); await action('Back to timer');
    } finally {
        await evaluate(`window.confirm=window.compactConfirm;localStorage.setItem('easyTimerTemplates',${JSON.stringify(baseline)})`);
        await cdp('Emulation.setTouchEmulationEnabled', { enabled:false });
        await cdp('Emulation.setDeviceMetricsOverride', { width:1280,height:800,screenWidth:1280,screenHeight:800,mobile:false,deviceScaleFactor:1 });
    }
    console.log('PASS: compact phase rows, twelve long titles, minute limits, 100/1000-hour totals, cursor preservation and responsive themes/languages.');
}

async function checkPlannerCorrections({ evaluate, click, text, cdp }) {
    const stored = () => evaluate(`JSON.parse(localStorage.getItem('easyTimerTemplates'))`);
    const baseline = await evaluate(`localStorage.getItem('easyTimerTemplates')`);
    const offset = (await stored()).templates.length;
    const field = (selector, value) => evaluate(`(()=>{const input=document.querySelector(${JSON.stringify(selector)});input.value=${JSON.stringify(value)};input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    const action = label => evaluate(`Array.from(document.querySelectorAll('#planner button')).find(b=>b.textContent===${JSON.stringify(label)}).click()`);
    const open = async () => { await click('#menu-toggle'); await click('#open-planner'); };
    const editFirst = () => click(`.template-library li:nth-child(${offset + 1}) button:first-child`);
    const mockConfirmation = () => evaluate(`window.correctionConfirm=window.confirm;window.confirmMessages=[];window.acceptConfirm=true;window.confirm=message=>{window.confirmMessages.push(message);return window.acceptConfirm;};`);
    async function reload() {
        const previous = await evaluate('performance.timeOrigin');
        await cdp('Page.reload');
        for (let i = 0; i < 100; i++) {
            if (await evaluate(`performance.timeOrigin!==${previous}&&Boolean(document.querySelector('#primary')?.title)`)) return;
            await delay(50);
        }
        assert.fail('A new document initializes after reload');
    }
    await mockConfirmation();
    try {
        await open();
        for (const title of ['First phase', 'Second phase']) {
            await action('Create template'); await field('#template-name', 'Duplicate workshop');
            await action('+ Add phase'); await field('.phase-list input[type="text"]', title); await action('Save');
        }
        let library = await stored();
        const first = library.templates[offset]; const second = library.templates[offset + 1];
        assert.equal(library.templates.length, offset + 2);
        assert.equal(first.name, second.name, 'Duplicate names are valid');
        assert.notEqual(first.id, second.id, 'Template identity is independent of the name');
        assert.notEqual(first.phases[0].id, second.phases[0].id);
        await editFirst();
        // Each field keeps its own localized error association across both language changes.
        for (const [selector, invalid, valid, messages] of [
            ['#template-name', '', first.name, ['workshop name', 'Workshopnamen']],
            ['.phase-list input[type="text"]', '', first.phases[0].title, ['phase needs a title', 'benötigt einen Titel']],
            ['.phase-list input[id$="-minutes"]', '6001', '10', ['whole number', 'ganze Zahl']],
            ['.phase-list input[id$="-minutes"]', '0', '10', ['whole number', 'ganze Zahl']],
            ['.phase-list input[id$="-minutes"]', '1.5', '10', ['whole number', 'ganze Zahl']],
            ['.phase-list input[id$="-minutes"]', '1e2', '10', ['whole number', 'ganze Zahl']],
        ]) {
            await field(selector, invalid); await action('Save');
            const id = await evaluate(`document.querySelector(${JSON.stringify(selector)}).id`);
            for (const [lang, message] of [['de', messages[1]], ['en', messages[0]]]) {
                await click(`[data-language="${lang}"]`);
                const state = await evaluate(`(()=>{const input=document.getElementById(${JSON.stringify(id)});return {invalid:input.getAttribute('aria-invalid'),description:input.getAttribute('aria-describedby'),message:document.getElementById(input.getAttribute('aria-describedby'))?.textContent,invalidIds:Array.from(document.querySelectorAll('#planner [aria-invalid="true"]')).map(el=>el.id),value:input.value};})()`);
                assert.equal(state.invalid, 'true'); assert.equal(state.description, 'planner-feedback');
                assert.ok(state.message.includes(message), 'The associated error is localized');
                assert.deepEqual(state.invalidIds, [id], 'Only the failing input is associated with this error');
                assert.equal(state.value, invalid, 'Language changes retain invalid draft values');
            }
            await field(selector, valid);
            assert.equal(await evaluate(`document.querySelector(${JSON.stringify(selector)}).hasAttribute('aria-invalid')`), false);
            assert.equal(await text('.planner-feedback'), '');
        }
        assert.deepEqual(await stored(), library, 'Validation and language changes never autosave');
        await field('.phase-list input[id$="-minutes"]', '11');
        await field('.phase-list input[id$="-minutes"]', '010');
        await field('#template-name', '  Duplicate workshop  ');
        await field('.phase-list input[type="text"]', '  First phase  ');
        await evaluate(`document.querySelector('#template-transition').value='automatic';document.querySelector('#template-transition').dispatchEvent(new Event('change'));document.querySelector('#transition-manual').click();window.confirmMessages=[];window.acceptConfirm=false;`);
        await action('Cancel');
        assert.equal(await evaluate('window.confirmMessages.length'), 0, 'Reverted and normalized values do not request discard');
        assert.equal(await evaluate(`Boolean(document.querySelector('#template-name'))`), false);
        assert.deepEqual(await stored(), library);
        await editFirst(); await field('.phase-list input[id$="-minutes"]', '');
        await action('Back to timer');
        assert.equal(await evaluate('window.confirmMessages.length'), 1, 'Incomplete duration edits still require confirmation');
        assert.equal(await evaluate(`document.querySelector('.phase-list input[id$="-minutes"]').value`), '');
        await field('.phase-list input[id$="-minutes"]', '0010');
        await action('Back to timer');
        assert.equal(await evaluate('window.confirmMessages.length'), 1, 'Restoring the original duration removes the dirty state');
        await reload(); await mockConfirmation(); await open();
        assert.deepEqual(await stored(), library, 'All template and phase IDs survive a complete page reload');
        assert.equal(await evaluate('document.querySelectorAll(".template-library li").length'), offset + 2);
        await editFirst(); await field('#template-name', 'Edited after reload'); await action('Save');
        library = await stored();
        assert.equal(library.templates[offset].id, first.id);
        assert.deepEqual(library.templates[offset].phases, first.phases);
        assert.deepEqual(library.templates[offset + 1], second, 'Editing one duplicate cannot modify the other');
        await editFirst(); await field('#template-name', 'Local unsaved draft');
        await evaluate(`void(window.correctionOther=window.open(location.href,'easytimer-storage-regression'))`);
        assert.equal(await evaluate('Boolean(window.correctionOther)'), true);
        let ready = false;
        for (let i = 0; i < 100; i++) {
            ready = await evaluate(`Boolean(window.correctionOther.document.querySelector('#primary')?.title)`);
            if (ready) break;
            await delay(50);
        }
        assert.equal(ready, true, 'The independent second tab initializes');
        await evaluate(`(()=>{const w=window.correctionOther;w.document.querySelector('#menu-toggle').click();w.document.querySelector('#open-planner').click();w.document.querySelector('.template-library li:nth-child(${offset + 1}) button:first-child').click();const input=w.document.querySelector('#template-name');input.value='Remote saved revision';input.dispatchEvent(new w.Event('input',{bubbles:true}));Array.from(w.document.querySelectorAll('#planner button')).find(b=>b.textContent==='Save').click();})()`);
        const remote = await stored();
        assert.equal(remote.templates[offset].name, 'Remote saved revision');
        let notified = false;
        for (let i = 0; i < 100; i++) {
            notified = (await text('.planner-feedback')).includes('another tab');
            if (notified) break;
            await delay(50);
        }
        assert.equal(notified, true, 'The browser delivers a genuine cross-tab storage event');
        await action('Save');
        assert.deepEqual(await stored(), remote, 'A stale tab never overwrites the remote revision');
        assert.equal(await evaluate(`document.querySelector('#template-name').value`), 'Local unsaved draft');
        await evaluate('window.acceptConfirm=false'); await action('Reload saved templates');
        assert.equal(await evaluate(`document.querySelector('#template-name').value`), 'Local unsaved draft');
        await evaluate('window.acceptConfirm=true'); await action('Reload saved templates');
        assert.match(await text('.template-library'), /Remote saved revision/);
        await action('Back to timer');
    } finally {
        await evaluate(`window.correctionOther?.close();window.confirm=window.correctionConfirm;localStorage.setItem('easyTimerTemplates',${JSON.stringify(baseline)});`);
    }
    console.log('PASS: localized validation associations, normalized dirty detection, duplicate names, reload identities and genuine cross-tab conflicts.');
}
