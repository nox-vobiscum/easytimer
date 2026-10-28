import test from 'node:test';
import assert from 'node:assert/strict';
import { createPocClient, profilePhotoURL, SCOPE } from '../sync-poc/core.mjs';
import { prepareDrive } from './panel.mjs';

const auth = { access_token: 'SYNTHETIC_ACCOUNT_TEST_ONLY', expires_in: 3600, scope: SCOPE };
const response = (user, status = 200) => new Response(JSON.stringify({ user }), { status });
test('GIS preparation can retry a load failure and never initializes or requests authorization', async () => {
    const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
    const previousGoogle = Object.getOwnPropertyDescriptor(globalThis, 'google');
    let fail = true, loads = 0, initializations = 0;
    try {
        delete globalThis.google;
        Object.defineProperty(globalThis, 'document', { configurable: true, value: {
            createElement: () => ({ remove() {} }), head: { append(script) {
                loads++;
                queueMicrotask(() => {
                    if (fail) script.onerror();
                    else { globalThis.google = { accounts: { oauth2: { initTokenClient() { initializations++; } } } }; script.onload(); }
                });
            } },
        } });
        await assert.rejects(prepareDrive(), /GIS_UNAVAILABLE/);
        fail = false; await prepareDrive(); await prepareDrive();
        assert.equal(loads, 2); assert.equal(initializations, 0, 'No token client or OAuth popup during library preparation');
    } finally {
        if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument); else delete globalThis.document;
        if (previousGoogle) Object.defineProperty(globalThis, 'google', previousGoogle); else delete globalThis.google;
    }
});
test('profile and account binding share one scope-limited request; profile is transient and defensively copied', async () => {
    let now = 1000, user = { permissionId: 'synthetic-A', displayName: 'Synthetic Name', emailAddress: 'fixture@example.invalid', photoLink: 'https://lh3.googleusercontent.com/fixture' };
    const calls = [];
    const client = createPocClient({ now: () => now, fetchImpl: async (url, init) => { calls.push({ url, init }); return response(user); } });
    await client.authorize(auth); assert.equal(calls.length, 1);
    assert.match(calls[0].url, /user\(permissionId,displayName,emailAddress,photoLink\)/);
    assert.equal(client.profile.displayName, 'Synthetic Name'); const copy = client.profile; copy.displayName = 'Changed';
    assert.equal(client.profile.displayName, 'Synthetic Name');
    const accountA = await client.integrationSession().accountKey();
    user = { permissionId: 'synthetic-B' }; await client.authorize(auth);
    assert.notEqual(await client.integrationSession().accountKey(), accountA);
    assert.deepEqual(client.profile, { displayName: '', emailAddress: '', photoLink: '' });
    now += 3600000; assert.equal(client.connected, false); assert.equal(client.profile, null);
    await client.authorize(auth); client.disconnect(); assert.equal(client.profile, null);
    await assert.rejects(client.authorize({ ...auth, scope: SCOPE + ' profile' }), /SCOPE_OR_TOKEN_REJECTED/);
    assert.equal(client.profile, null);
});
test('optional field rejection falls back to mandatory binding; failed identity requests never invent authorization', async () => {
    const calls = [];
    const client = createPocClient({ fetchImpl: async url => { calls.push(url); return url.includes('displayName') ? response({}, 403) : response({ permissionId: 'synthetic-A' }); } });
    await client.authorize(auth); assert.equal(client.connected, true); assert.equal(calls.length, 2);
    assert.equal(client.profile.photoLink, ''); client.disconnect();
    for (const reply of [() => response({}, 401), () => response({}), () => { throw Error('offline'); }]) {
        const failed = createPocClient({ fetchImpl: reply });
        await assert.rejects(failed.authorize(auth)); assert.equal(failed.connected, false); assert.equal(failed.profile, null);
    }
});
test('profile URLs allow only credential-free HTTPS Google image hosts', () => {
    for (const url of ['javascript:alert(1)', 'data:image/png;base64,AA==', 'http://lh3.googleusercontent.com/a',
        'https://lh3.googleusercontent.com.evil.invalid/a', 'https://user:secret@lh3.googleusercontent.com/a',
        'https://lh3.googleusercontent.com:444/a', 'https://lh3.googleusercontent.com/a?access_token=secret']) assert.equal(profilePhotoURL(url), '');
    assert.equal(profilePhotoURL('https://lh3.googleusercontent.com/a?sz=64'), 'https://lh3.googleusercontent.com/a?sz=64');
});
