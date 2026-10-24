import assert from 'node:assert/strict';
import { parseArgs } from 'node:util';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, relative, isAbsolute, sep, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { createVirtualClock, durationMs } from './virtual-clock.mjs';
import { formatTime, formatOvertime } from '../src/js/timer.mjs';
import { timeVisualState } from '../src/js/time-visuals.mjs';

export const scenarios = {
    'quick-normal': {elapsed:60000},
    'quick-before-endgame': {elapsed:269999},
    'quick-endgame': {elapsed:270000},
    'quick-expiration': {elapsed:300000},
    'quick-overtime': {elapsed:310000},
    'quick-overtime-2m': {elapsed:420000},
    'quick-paused-endgame': {elapsed:270000,pause:true},
    'quick-extension': {elapsed:270000,extension:true},
    'session-normal': {session:true,elapsed:60000},
    'session-before-endgame': {session:true,elapsed:269999},
    'session-endgame': {session:true,elapsed:270000},
    'session-expiration': {session:true,elapsed:300000},
    'session-phase-overtime': {session:true,elapsed:310000},
    'session-phase-overtime-2m': {session:true,elapsed:420000},
    'session-paused-endgame': {session:true,elapsed:270000,pause:true},
    'session-completion': {session:true,complete:true,elapsed:0},
    'session-workshop-overtime': {session:true,complete:true,elapsed:10000},
    'session-workshop-overtime-2m': {session:true,complete:true,elapsed:120000},
    'session-workshop-overtime-paused': {session:true,complete:true,elapsed:10000,pause:true},
    'session-workshop-overtime-stopped': {session:true,complete:true,elapsed:10000,stop:true},
};

export function parseTimeTravelOptions(args) {
    const {values}=parseArgs({args,options:{scenario:{type:'string',multiple:true},theme:{type:'string'},advance:{type:'string'},output:{type:'string'},viewport:{type:'string'},language:{type:'string'},'list-scenarios':{type:'boolean'},help:{type:'boolean'}}});
    const requested=(values.scenario||[]).flatMap(value=>value.split(','));
    for(const name of requested)if(name!=='all'&&!Object.hasOwn(scenarios,name))throw new Error(`Unknown scenario: ${name}. Use --list-scenarios.`);
    const names=[...new Set(requested.includes('all')?Object.keys(scenarios):requested)];
    if(!names.length&&!values.help&&!values['list-scenarios']&&Object.keys(values).length)throw new Error('Time-travel options require --scenario NAME');
    const theme=values.theme||'both';
    if(!['light','dark','both'].includes(theme))throw new Error('Theme must be light, dark or both');
    const language=values.language||'en';
    if(!['de','en'].includes(language))throw new Error('Language must be de or en');
    const viewport=/^(\d+)x(\d+)$/.exec(values.viewport||'1280x800');
    if(!viewport||viewport.slice(1).some(value=>Number(value)<1||Number(value)>4096))throw new Error('Viewport must be WIDTHxHEIGHT, each 1–4096 pixels');
    const output=values.output?resolve(values.output):undefined;
    if(output) {
        const path=relative(resolve('.'),output);
        if(!path||(!isAbsolute(path)&&path!=='..'&&!path.startsWith('..'+sep)))throw new Error('Screenshot output must be outside the repository, for example your temporary directory');
    }
    return {names,themes:theme==='both'?['light','dark']:[theme],language,width:Number(viewport[1]),height:Number(viewport[2]),advance:durationMs(values.advance||'0ms'),output,list:Boolean(values['list-scenarios']),help:Boolean(values.help)};
}

export function timeTravelHelp() {
    return `Virtual-time screenshots (isolated test profile, no production debug controls):
  node tests/browser-check.mjs --scenario quick-endgame --theme dark
  node tests/browser-check.mjs --scenario session-phase-overtime --theme both
  node tests/browser-check.mjs --scenario quick-expiration --theme both --advance 2m
Options: --scenario NAME (repeat/comma-separate, or all), --theme light|dark|both,
         --advance 10s|2m|1.5h|1250ms, --viewport 320x568, --language de|en,
         --output DIRECTORY (outside the repository), --list-scenarios, --help.
Output defaults to a unique temporary directory with PNGs, index.html and summary.json.
Without --scenario, the existing full browser regression runs unchanged.
Scenarios:\n${Object.keys(scenarios).map(name=>'  '+name).join('\n')}`;
}

const escapeHtml=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export async function runTimeTravel({evaluate,click,text,cdp,configure},options) {
    const started=performance.now();
    const clock=createVirtualClock(evaluate);
    const base=options.output||tmpdir();
    await mkdir(base,{recursive:true});
    const output=await mkdtemp(join(base,'easytimer-time-travel-'));
    const results=[];
    const epoch=1700000000000;
    async function reload() {
        await clock.restore();
        const origin=await evaluate('performance.timeOrigin');
        await cdp('Page.reload');
        for(let i=0;i<100;i++) {
            if(await evaluate(`performance.timeOrigin!==${origin}&&document.body.dataset.mode==='quick'&&Boolean(document.querySelector('#primary')?.title)`))return;
            await delay(50);
        }
        throw new Error('Application did not initialize after scenario reload');
    }
    async function snapshot() {
        return evaluate(`(()=>{const main=document.querySelector('#time');return {mode:document.body.dataset.mode,visualState:main.dataset.visualState,time:main.textContent,overtime:main.textContent,overtimeShown:main.dataset.visualState==='EXPIRED',status:document.querySelector('#status').textContent,phase:document.querySelector('#phase-number').textContent,phaseTitle:document.querySelector('#current-phase').textContent,budget:document.querySelector('#time-budget').textContent,mainColor:getComputedStyle(main).color,overtimeColor:getComputedStyle(main).color,virtualNow:Date.now()};})()`);
    }
    function verify(actual,scenario,extra,theme) {
        const elapsed=scenario.elapsed+(scenario.pause||scenario.stop?0:extra);
        const total=300000+(scenario.extension?300000:0);
        const remaining=scenario.complete?0:Math.max(0,total-elapsed);
        const overdue=scenario.complete?elapsed:Math.max(0,elapsed-total);
        const expired=scenario.complete||remaining===0;
        const status=expired?'FINISHED':scenario.pause?'PAUSED':'RUNNING';
        assert.equal(actual.mode,scenario.session?'session':'quick');
        assert.equal(actual.time,expired?formatOvertime(overdue):formatTime(remaining));
        assert.equal(actual.overtimeShown,expired);
        if(expired)assert.equal(actual.overtime,formatOvertime(overdue));
        assert.equal(actual.visualState,timeVisualState({status,remainingMs:remaining},total));
        const normal=theme==='dark'?'rgb(241, 245, 252)':'rgb(23, 35, 55)';
        const amber=theme==='dark'?'rgb(242, 188, 118)':'rgb(154, 87, 0)';
        assert.equal(actual.mainColor,actual.visualState==='NORMAL'?normal:expired?(theme==='dark'?'rgb(243, 161, 171)':'rgb(180, 35, 56)'):amber);
        if(expired)assert.equal(actual.overtimeColor,theme==='dark'?'rgb(243, 161, 171)':'rgb(180, 35, 56)');
    }
    try {
        // A small real-time control proves the ordinary app is not frozen or mocked.
        assert.equal(await evaluate(`Boolean(globalThis.__easyTimerTestClock)`),false);
        const realStarted=performance.now();
        await configure(0,0,3);await click('#primary');
        const initial=await text('#time');
        await delay(1100);
        assert.notEqual(await text('#time'),initial,'Unmodified real-time countdown still advances');
        const realTimeCheckMs=Math.round(performance.now()-realStarted);
        const scenarioStarted=performance.now();
        await cdp('Emulation.setDeviceMetricsOverride',{width:options.width,height:options.height,screenWidth:options.width,screenHeight:options.height,deviceScaleFactor:1,mobile:false});
        for(const name of options.names)for(const theme of options.themes) {
            await reload();await clock.install(epoch);
            await click(`[data-language="${options.language}"]`);await click(`[data-theme="${theme}"]`);
            const scenario=scenarios[name];
            if(scenario.session) {
                const fixture={schemaVersion:1,templates:[{id:'dev001-workshop',name:'Test workshop',transitionMode:'manual',phases:[
                    {id:'dev001-opening',title:'Opening',durationSeconds:300},{id:'dev001-discussion',title:'Discussion',durationSeconds:900},{id:'dev001-wrap',title:'Wrap-up',durationSeconds:120},
                ]}]};
                // Only this disposable browser profile/origin sees the fixture.
                await evaluate(`localStorage.setItem('easyTimerTemplates',${JSON.stringify(JSON.stringify(fixture))})`);
                await click('#open-session');
                await evaluate(`(()=>{const select=document.querySelector('#session-template');select.value='dev001-workshop';select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
                await click('#prepare-session');
            } else await configure(0,5,0);
            await click('#primary');
            if(scenario.complete) {await click('#next');await click('#next');await click('#next');}
            await clock.advance(scenario.elapsed);
            if(scenario.extension)await click('[data-adjustment="300000"]');
            if(scenario.pause)await click('#primary');
            if(scenario.stop)await click('#stop-overtime');
            verify(await snapshot(),scenario,0,theme);
            await clock.advance(options.advance);
            const state=await snapshot();verify(state,scenario,options.advance,theme);
            const file=`${name}-${theme}${options.advance?`-after-${options.advance}ms`:''}.png`;
            const shot=await cdp('Page.captureScreenshot',{format:'png'});
            await writeFile(join(output,file),Buffer.from(shot.data,'base64'));
            results.push({scenario:name,theme,file,...state,virtualElapsedMs:state.virtualNow-epoch});
            console.log(`PASS: ${name}/${theme} → ${state.time} (${state.visualState})`);
        }
        const summary={realTimeCheckMs,scenarioGenerationMs:Math.round(performance.now()-scenarioStarted),totalElapsedMs:Math.round(performance.now()-started),additionalAdvanceMs:options.advance,viewport:{width:options.width,height:options.height},language:options.language,results};
        await writeFile(join(output,'summary.json'),JSON.stringify(summary,null,2)+'\n');
        const cards=results.map(result=>`<article><h2>${escapeHtml(result.scenario)} · ${result.theme}</h2><p>${escapeHtml(result.time)} · ${result.visualState}</p><a href="${result.file}"><img src="${result.file}" alt="${escapeHtml(result.scenario+' '+result.theme)}"></a></article>`).join('\n');
        await writeFile(join(output,'index.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>easyTimer virtual-time screenshots</title><style>body{font:16px system-ui;margin:2rem;background:#f6f8fc;color:#172337}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr));gap:1rem}article{min-width:0}h2{font-size:1rem}img{width:100%;border:1px solid #c8d1e0}</style><h1>easyTimer test screenshots</h1><p>${results.length} captures in ${summary.scenarioGenerationMs} ms; separate real-time control ${realTimeCheckMs} ms. No production debug controls.</p><main>${cards}</main></html>`);
        console.log(`Screenshots: ${output}`);
        console.log(`Gallery: ${pathToFileURL(join(output,'index.html')).href}`);
        console.log(`Timing: ${results.length} scenarios/captures in ${summary.scenarioGenerationMs} ms; real-time control ${realTimeCheckMs} ms.`);
    } finally {await clock.restore();}
}
