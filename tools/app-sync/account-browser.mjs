import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function checkAccountHeader({ evaluate, cdp, wait, drive, external, output, setProfile }) {
    await evaluate('document.querySelector(".planner-back").click()');
    await wait('Boolean(document.getElementById("account-toggle")?.getClientRects().length)');
    const before = await evaluate('easyTimerDevelopment.createStore().load()');
    const open = async () => {
        await evaluate(`if(document.getElementById('account-popover').hidden){
            if(document.getElementById('account-toggle').getClientRects().length)document.getElementById('account-toggle').click();
            else { if(document.getElementById('preferences').hidden)document.getElementById('menu-toggle').click();document.getElementById('account-menu-entry').click(); }
        }`);
        await wait('!document.getElementById("account-connect").disabled');
    };
    const focusTarget = () => evaluate('document.getElementById("account-toggle").getClientRects().length ? "account-toggle" : "menu-toggle"');
    const disconnect = async () => {
        await open(); await evaluate('document.getElementById("account-disconnect").click()');
        await wait('document.getElementById("account-disconnect").hidden');
        assert.equal(await evaluate('document.getElementById("account-popover").hidden'), true);
        assert.equal(await evaluate('document.activeElement.id'), await focusTarget());
        assert.equal(await evaluate('document.getElementById("account-email").textContent'), '');
    };
    const connect = async () => {
        await open(); await evaluate('document.getElementById("account-connect").click()');
        await wait('!document.getElementById("account-disconnect").hidden');
        await wait('document.getElementById("account-popover").hidden');
        assert.equal(await evaluate('document.activeElement.id'), await focusTarget());
    };
    const traffic = external.length, calls = drive.calls.length;
    const authorizations = await evaluate('globalThis.headerRequestCount||0');
    await open();
    assert(external.slice(traffic).every(url=>url==='https://accounts.google.com/gsi/client'));
    assert.equal(await evaluate('globalThis.headerRequestCount||0'), authorizations, 'Library preparation never starts OAuth');
    assert.equal(drive.calls.length, calls, 'Opening account UI performs no Drive/sync request');
    assert.equal(await evaluate('document.activeElement.id'), 'account-connect');
    await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
    assert.equal(await evaluate('document.getElementById("account-popover").hidden'), true);
    assert.equal(await evaluate('document.activeElement.id'), 'account-toggle');
    setProfile({ displayName: 'Synthetic Header Account', emailAddress: 'header@example.invalid', photoLink: 'https://lh3.googleusercontent.com/header-fixture' });
    await open();
    for (const language of ['de', 'en']) for (const mode of ['cancel', 'denied', 'incomplete']) {
        await evaluate(`document.querySelector('[data-language="${language}"]').click()`); await open();
        await evaluate(`globalThis.headerAuthMode='${mode}';document.getElementById('account-connect').click()`);
        await wait('!document.getElementById("account-connect").disabled');
        assert.equal(await evaluate('document.getElementById("account-popover").hidden'), false);
        assert.equal(await evaluate('document.querySelector("#account-popover [role=status]").hidden'), false);
        assert.equal(await evaluate('document.getElementById("account-disconnect").hidden'), true);
    }
    await evaluate("globalThis.headerAuthMode='pending';document.getElementById('account-connect').click()");
    assert.equal(await evaluate('document.getElementById("account-popover").hidden'), false, 'Pending authorization does not close the account interface');
    await evaluate('delete globalThis.headerAuthMode;headerLastConfig.error_callback({type:"popup_closed"})');
    const requestsBeforeSuccess = await evaluate('headerRequestCount');
    await connect();
    assert.equal(await evaluate('headerRequestCount'), requestsBeforeSuccess + 1, 'One explicit Connect click starts one authorization');
    await wait('document.getElementById("account-toggle").querySelector("img").naturalWidth>0');
    assert.equal(await evaluate('document.getElementById("account-name").textContent'), 'Synthetic Header Account');
    assert.equal(await evaluate('headerRequestedScope'), 'https://www.googleapis.com/auth/drive.appdata');
    assert.equal(await evaluate('document.getElementById("account-toggle").querySelector("img").referrerPolicy'), 'no-referrer');
    assert.equal(await evaluate('document.getElementById("account-toggle").querySelector("img").crossOrigin'), 'anonymous');
    for (const language of ['de', 'en']) for (const theme of ['light', 'dark', 'system']) {
        await evaluate(`document.querySelector('[data-language="${language}"]').click();document.querySelector('[data-theme="${theme}"]').click()`);
        await open();
        assert.match(await evaluate('document.getElementById("account-toggle").getAttribute("aria-label")'), language === 'de' ? /Google-Konto/ : /Google account/);
        await cdp('Emulation.setDeviceMetricsOverride', { width: 320, height: 800, mobile: false, deviceScaleFactor: 1 });
        assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true);
        assert.equal(await evaluate('(()=>{const r=document.getElementById("account-popover").getBoundingClientRect();const b=document.getElementById("account-toggle").getBoundingClientRect();const brand=document.querySelector(".brand").getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&b.width>=44&&b.height>=44&&b.left>=brand.right})()'), true);
        const shot = await cdp('Page.captureScreenshot', { format: 'png' });
        await writeFile(join(output, `account-${language}-${theme}-320.png`), Buffer.from(shot.data, 'base64'));
    }
    await cdp('Emulation.clearDeviceMetricsOverride');
    const serial = await evaluate(`(async()=>{
        let result=JSON.stringify(localStorage)+JSON.stringify(sessionStorage);
        for(const info of await indexedDB.databases()) {
            if(!info.name.startsWith('easyTimer-'))continue;
            const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(info.name);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(Error('read'));});
            for(const name of db.objectStoreNames) result+=JSON.stringify(await new Promise((resolve,reject)=>{const tx=db.transaction(name,'readonly'),r=tx.objectStore(name).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(Error('read'));}));
            db.close();
        } return result;
    })()`);
    assert(!serial.includes('header@example.invalid') && !serial.includes('Synthetic Header Account') && !serial.includes('googleusercontent.com/header-fixture'), 'No profile field enters browser persistence');
    assert.deepEqual(await evaluate('easyTimerDevelopment.createStore().load()'), before);
    await evaluate('document.getElementById("menu-toggle").click()');
    assert.equal(await evaluate('document.getElementById("account-popover").hidden'), true, 'Hamburger dismisses account popover');
    await evaluate('document.getElementById("menu-toggle").click()');
    await open();
    await evaluate('document.getElementById("fullscreen").click()');
    await wait('document.body.classList.contains("presentation")');
    assert.equal(await evaluate('document.getElementById("account-toggle").getClientRects().length'), 0);
    assert.equal(await evaluate('document.getElementById("account-menu-entry").hidden'), true, 'Fullscreen has no account menu entry');
    assert.equal(await evaluate('document.getElementById("account-popover").hidden'), true);
    await evaluate('document.getElementById("fullscreen").click()');
    await wait('!document.body.classList.contains("presentation")');
    await cdp('Emulation.setTouchEmulationEnabled', { enabled: true });
    await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, screenWidth: 390, screenHeight: 844, mobile: true, deviceScaleFactor: 1, screenOrientation: { type: 'portraitPrimary', angle: 0 } });
    await wait('document.body.dataset.device==="smartphone"');
    assert.equal(await evaluate('document.getElementById("account-toggle").getClientRects().length>0'), true);
    assert.equal(await evaluate('document.getElementById("account-menu-entry").hidden'), true);
    await open();
    await cdp('Emulation.setDeviceMetricsOverride', { width: 667, height: 375, screenWidth: 375, screenHeight: 667, mobile: true, deviceScaleFactor: 1, screenOrientation: { type: 'landscapePrimary', angle: 90 } });
    await wait('document.getElementById("account-toggle").hidden');
    assert.equal(await evaluate('document.getElementById("account-toggle").getClientRects().length'), 0);
    assert.equal(await evaluate('document.getElementById("account-popover").hidden'), true, 'Orientation change dismisses the old placement');
    assert.equal(await evaluate('document.activeElement.id'), 'menu-toggle');
    assert.equal(await evaluate('document.getElementById("account-menu-entry").hidden'), false);
    await wait('document.querySelector("#account-menu-entry img").naturalWidth>0');
    assert.equal(await evaluate('document.querySelector("#account-menu-entry img").hidden'), false);
    assert.equal(await evaluate('document.querySelectorAll(".account-avatar").length'), 1, 'The same avatar moves between entry points');
    await evaluate('document.getElementById("menu-toggle").click();document.getElementById("account-menu-entry").focus()');
    assert.equal(await evaluate('document.getElementById("account-menu-entry").getBoundingClientRect().height>=44'), true);
    const menuShot = await cdp('Page.captureScreenshot', { format: 'png' });
    await writeFile(join(output, 'account-landscape-avatar-menu-667.png'), Buffer.from(menuShot.data, 'base64'));
    await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r', unmodifiedText: '\r' });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await wait('!document.getElementById("account-popover").hidden');
    assert.equal(await evaluate('document.getElementById("preferences").hidden'), true, 'Account panel replaces, rather than overlays, the hamburger menu');
    for (const language of ['de', 'en']) for (const theme of ['light', 'dark', 'system']) {
        await evaluate(`document.querySelector('[data-language="${language}"]').click();document.querySelector('[data-theme="${theme}"]').click()`); await open();
        assert.equal(await evaluate('(()=>{const p=document.getElementById("account-popover"),r=p.getBoundingClientRect();return r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight&&p.scrollWidth<=p.clientWidth&&document.documentElement.scrollWidth<=innerWidth})()'), true);
        assert.equal(await evaluate('document.getElementById("account-disconnect").getBoundingClientRect().height>=44'), true);
        assert.equal(await evaluate('(()=>{const p=document.getElementById("account-popover");p.scrollTop=p.scrollHeight;return p.scrollTop>0&&p.lastElementChild.previousElementSibling.getBoundingClientRect().bottom<=p.getBoundingClientRect().bottom})()'), true, 'Bottom explanatory text is reachable by scrolling');
        await evaluate('document.getElementById("account-disconnect").focus();document.getElementById("account-disconnect").scrollIntoView({block:"nearest"})');
        assert.equal(await evaluate('document.activeElement.id'), 'account-disconnect');
        const shot = await cdp('Page.captureScreenshot', { format: 'png' });
        await writeFile(join(output, `account-landscape-${language}-${theme}-667.png`), Buffer.from(shot.data, 'base64'));
    }
    await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
    assert.equal(await evaluate('document.getElementById("account-popover").hidden'), true);
    assert.equal(await evaluate('document.activeElement.id'), 'menu-toggle');
    await disconnect();
    assert.equal(await evaluate('document.querySelector("#account-menu-entry img").hidden && !document.querySelector("#account-menu-entry svg").hasAttribute("hidden")'), true, 'Disconnect restores the neutral menu avatar');
    setProfile({}); await connect();
    assert.equal(await evaluate('document.querySelector("#account-menu-entry img").hidden'), true, 'Missing photo uses the neutral menu avatar');
    await disconnect(); setProfile({ photoLink: 'https://lh3.googleusercontent.com/header-blocked' }); await connect();
    await wait('document.querySelector("#account-menu-entry img").hidden');
    assert.equal(await evaluate('document.querySelector("#account-menu-entry svg").hasAttribute("hidden")'), false, 'Failed photo uses the same fallback');
    await disconnect();
    for (const mode of ['cancel', 'denied']) {
        await open(); await evaluate(`globalThis.headerAuthMode='${mode}';document.getElementById('account-connect').click()`);
        assert.equal(await evaluate('document.getElementById("account-popover").hidden'), false);
        assert.equal(await evaluate('document.querySelector("#account-popover [role=status]").hidden'), false);
    }
    await evaluate('delete globalThis.headerAuthMode'); await connect();
    await open();
    await evaluate(`globalThis.headerFullscreenEvidence=false;document.addEventListener('fullscreenchange',()=>{
        if(document.fullscreenElement)globalThis.headerFullscreenEvidence=document.getElementById('account-menu-entry').hidden&&document.getElementById('account-toggle').getClientRects().length===0&&document.getElementById('account-popover').hidden;
    });document.documentElement.requestFullscreen()`);
    await wait('globalThis.headerFullscreenEvidence===true');
    await evaluate('if(document.fullscreenElement)document.exitFullscreen()');
    await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, screenWidth: 390, screenHeight: 844, mobile: true, deviceScaleFactor: 1, screenOrientation: { type: 'portraitPrimary', angle: 0 } });
    await wait('!document.getElementById("account-toggle").hidden');
    assert.equal(await evaluate('document.getElementById("account-menu-entry").hidden'), true);
    assert.equal(await evaluate('document.getElementById("account-popover").hidden'), true);
    await cdp('Emulation.setTouchEmulationEnabled', { enabled: false }); await cdp('Emulation.clearDeviceMetricsOverride');
    await wait('document.getElementById("account-toggle").getClientRects().length>0');
    await disconnect(); setProfile({}); await connect();
    assert.equal(await evaluate('document.getElementById("account-toggle").querySelector("img").hidden'), true);
    assert.equal(await evaluate('document.getElementById("account-name").hidden && document.getElementById("account-email").hidden'), true);
    await disconnect(); setProfile({ photoLink: 'https://lh3.googleusercontent.com/header-blocked' }); await connect();
    await wait('document.getElementById("account-toggle").querySelector("img").hidden');
    assert.equal(await evaluate('document.getElementById("account-toggle").querySelector("svg").hasAttribute("hidden")'), false);
    await disconnect(); setProfile({ displayName: 'Expiry fixture' });
    await evaluate('globalThis.headerTokenLifetime=.15'); await connect();
    await wait('document.getElementById("account-disconnect").hidden');
    assert.equal(await evaluate('document.getElementById("account-name").textContent'), '');
    await evaluate('delete globalThis.headerTokenLifetime'); setProfile(null);
    assert.deepEqual(await evaluate('easyTimerDevelopment.createStore().load()'), before);
    console.log('PASS: optional account header, profile/fallback/blocked image, exact scope, memory-only profile, no popup sync, expiry/disconnect, focus/Escape/hamburger, DE/EN/all themes/320px, native/fallback fullscreen and phone landscape.');
}
