import assert from 'node:assert/strict';

// All storage and clock changes below belong to the disposable browser harness.
export async function checkSubtraction({ evaluate, click, text, cdp, configure }) {
    let boot;
    const subtract = async amount => {
        const attribute = (await clock()).status === 'READY' ? 'data-preset' : 'data-adjustment';
        await evaluate(`document.querySelector('[${attribute}="${amount}"]').dispatchEvent(new MouseEvent('click',{bubbles:true,shiftKey:true}))`);
    };
    const tick = ms => evaluate(`window.subNow+=${ms};document.dispatchEvent(new Event('visibilitychange'))`);
    const clock = () => evaluate(`JSON.parse(localStorage.getItem('easyTimerRuntime.v1.'+sessionStorage.getItem('easyTimerRuntimeContext.v1'))).clock`);
    const reload = async (expected, advance = 0) => {
        const now = await evaluate('subNow');
        if(boot) await cdp('Page.removeScriptToEvaluateOnNewDocument',{identifier:boot});
        boot = (await cdp('Page.addScriptToEvaluateOnNewDocument',{source:`window.subRealNow=Date.now;window.subNow=${now+advance};Date.now=()=>window.subNow;`})).identifier;
        const before = await evaluate('performance.timeOrigin');
        await cdp('Page.reload');
        for(let n=0;n<100;n++) {
            if(await evaluate(`performance.timeOrigin!==${before}&&document.querySelector('#time')?.textContent===${JSON.stringify(expected)}&&Boolean(document.querySelector('#primary')?.title)`))break;
            await new Promise(resolve=>setTimeout(resolve,50));
        }
        assert.equal(await text('#time'),expected);
    };
    const key = async (value, shift) => {
        const code = value === 'Enter' ? 13 : 32;
        await cdp('Input.dispatchKeyEvent', { type:'keyDown', key:value, code:value==='Enter'?'Enter':'Space', windowsVirtualKeyCode:code, modifiers:shift?8:0, text:value==='Enter'?'\r':' ' });
        await cdp('Input.dispatchKeyEvent', { type:'keyUp', key:value, code:value==='Enter'?'Enter':'Space', windowsVirtualKeyCode:code, modifiers:shift?8:0 });
    };
    await evaluate('window.subRealNow=Date.now;window.subNow=Date.now();Date.now=()=>window.subNow');
    try {
        await click('[data-language="en"]'); await click('#stop'); await configure(0,5,0);
        await click('[data-preset="60000"]'); assert.equal(await text('#time'),'06:00');
        await subtract(60000); assert.equal(await text('#time'),'05:00'); assert.equal((await clock()).status,'READY');
        await evaluate(`document.querySelector('[data-preset="60000"]').focus()`);
        for (const value of ['Enter',' ']) {
            await key(value,true); assert.equal(await text('#time'),'04:00','One shifted keyboard activation subtracts once');
            await key(value,false); assert.equal(await text('#time'),'05:00','Ordinary keyboard activation adds once');
        }
        assert.match(await evaluate('document.getElementById("adjustment-shortcut").textContent'),/Shift/);
        await click('#primary'); await tick(280000); await subtract(60000);
        assert.equal(await text('#time'),'+00:00'); assert.equal(await evaluate('document.title'),'+00:00 · easyTimer');
        assert.equal(await evaluate('document.getElementById("time").dataset.visualState'), 'EXPIRED');
        assert.match(await text('#time-budget'),/Planned 05:00 − 00:20/);
        await tick(10000); const original = await clock();
        await subtract(30000); assert.equal(await text('#time'),'+00:10'); assert.deepEqual(await clock(),original);
        await reload('+00:20',10000); assert.equal((await clock()).deadlineMs,original.deadlineMs);
        await click('#stop'); assert.equal(await text('#time'),'05:00'); assert.equal((await clock()).adjustmentMs,0);
        await click('#primary'); await tick(240000); await click('#primary');
        await subtract(30000); assert.equal(await text('#time'),'00:30');
        for(const language of ['en','de']) {
            await click(`[data-language="${language}"]`); await subtract(60000);
            assert.equal((await clock()).status,'PAUSED'); assert.equal((await clock()).deadlineMs,null);
            assert.equal(await text('#time'),'00:00'); assert.equal(await text('#help'),'');
        }
        await tick(600000); assert.equal(await text('#time'),'00:00');
        await reload('00:00',100000); assert.equal((await clock()).status,'PAUSED');
        await click('#primary'); assert.equal(await text('#time'),'+00:00');
        await tick(10000); assert.equal(await text('#time'),'+00:10');
        await click('#stop'); await configure(0,1,1); await subtract(60000); assert.equal(await text('#time'),'00:01');
        await subtract(60000); assert.equal(await text('#time'),'00:00'); assert.equal(await text('#help'),'');
        await reload('00:00'); assert.equal((await clock()).status,'READY');
        assert.equal(await evaluate('document.getElementById("primary").disabled'),true);
        assert.equal(await evaluate('document.getElementById("progress").style.getPropertyValue("--remaining")'),'0%');
        await click('[data-preset="60000"]'); assert.equal(await text('#time'),'01:00');
        assert.equal(await evaluate('document.getElementById("primary").disabled'),false);
        await configure(99,59,59); await click('[data-preset="60000"]'); assert.equal(await text('#time'),'99:59:59'); assert.match(await text('#help'),/99:59:59/);
        await configure(0,5,0);
        await cdp('Emulation.setTouchEmulationEnabled',{enabled:true});
        const point = await evaluate(`(()=>{const r=document.querySelector('[data-preset="60000"]').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
        await cdp('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
        await cdp('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        assert.equal(await text('#time'),'06:00','Touch remains addition');
        console.log('PASS: clamped Quick subtraction, effective budget, real overtime origin/no-op subtraction, zero READY/PAUSED reload, explicit resume, keyboard once, title/colors and touch addition.');
    } finally {
        await cdp('Emulation.setTouchEmulationEnabled',{enabled:false});
        if(boot) await cdp('Page.removeScriptToEvaluateOnNewDocument',{identifier:boot});
        await click('#stop'); await configure(0,5,0);
        await evaluate('Date.now=window.subRealNow;delete window.subRealNow;delete window.subNow');
        await click('[data-language="en"]');
    }
}
