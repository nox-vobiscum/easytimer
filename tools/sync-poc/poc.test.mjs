import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { createPocClient, SCOPE, PURPOSE, synthetic, validateSynthetic, assertOwned, revisionHeads } from './core.mjs';
import { startServer } from './server.mjs';

const runId = 'a2400000-0000-4000-8000-000000000001';
const auth = { access_token: 'UNIT_TEST_FAKE_TOKEN_NOT_A_CREDENTIAL', expires_in: 3600, scope: SCOPE };
const fixture = () => ({ id: 'poc-file-id', name: `easytimer-SYNC-001-POC-${runId}.json`, appProperties: { purpose: PURPOSE, runId }, spaces: ['appDataFolder'], version: '1' });
const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers });
function mockedClient(handler, options = {}) {
    const calls = [], observations = [];
    const client = createPocClient({ ...options, evidence: event => observations.push(event), fetchImpl: async (url, init) => {
        calls.push({ url, ...init });
        if (url.includes('/about?')) return json({ user: { permissionId: 'synthetic-account' } });
        return handler(url, init);
    } });
    return { client, calls, observations };
}

test('fixtures are generated, namespaced, strictly synthetic and never accept arbitrary Rundowns', () => {
    const data = synthetic(runId); assert.equal(validateSynthetic(data, runId), data);
    for (const change of [{ purpose: 'production' }, { runId: crypto.randomUUID() }, { library: { templates: [] } }, { role: 'admin' }, { secret: 'unexpected' }]) {
        assert.throws(() => validateSynthetic({ ...data, ...change }, runId));
    }
    assert.throws(() => synthetic("' or production", null));
    assert.throws(() => assertOwned({ ...fixture(), name: 'real-rundowns.json' }, runId));
    assert.throws(() => assertOwned({ ...fixture(), spaces: ['drive'] }, runId));
});

test('scope is exact; credentials expire in memory and require explicit reauthorization', async () => {
    let time = 1000;
    const { client, calls } = mockedClient(() => json({ files: [] }), { now: () => time });
    await assert.rejects(client.list(runId), /REAUTHORIZE/); assert.equal(calls.length, 0);
    await assert.rejects(client.authorize({ ...auth, scope: `${SCOPE} profile` }), /SCOPE_OR_TOKEN_REJECTED/);
    const fingerprint = await client.authorize(auth); assert.match(fingerprint, /^[a-f0-9]{12}$/);
    assert.equal(client.connected, true); await client.list(runId);
    time += 3600000; await assert.rejects(client.list(runId), /REAUTHORIZE/); assert.equal(client.connected, false);
    await client.authorize(auth); client.disconnect(); await assert.rejects(client.list(runId), /REAUTHORIZE/);
    assert(calls.every(call => call.credentials === 'omit' && call.cache === 'no-store' && call.redirect === 'error'));
});

test('reads retain version and validators; stale conditional writes never silently retry', async () => {
    let version = '1', media = synthetic(runId), patches = 0;
    const { client, observations } = mockedClient((url, init) => {
        if (init.method === 'PATCH') {
            patches++;
            assert.equal(init.headers['If-Match'], '"read-v1"');
            return json({ ignored: 'raw error must not enter evidence' }, 412);
        }
        if (url.includes('alt=media')) return json(media, 200, { ETag: '"media-v1"' });
        return json({ ...fixture(), version }, 200, { ETag: '"read-v1"' });
    });
    await client.authorize(auth); const baseline = await client.read('poc-file-id', runId);
    version = '2'; media = synthetic(runId, baseline.data.revisionId);
    await assert.rejects(client.update(baseline, 'B'), /HTTP_412/);
    assert.equal(patches, 1); assert.equal(baseline.version, '1');
    assert(observations.some(e => e.observedVersionChanged));
    assert(!JSON.stringify(observations).includes(auth.access_token));
    assert(!JSON.stringify(observations).includes('raw error'));
});

test('ignored preconditions remain observable; no missing or weak ETag becomes an unconditional write', async () => {
    let patches = [];
    const { client } = mockedClient((url, init) => {
        if (init.method === 'PATCH') { patches.push(init); return json(fixture()); }
        if (url.includes('alt=media')) return json(synthetic(runId));
        return json(fixture());
    });
    await client.authorize(auth); const baseline = await client.read('poc-file-id', runId);
    await assert.rejects(client.update(baseline, 'A'), /STRONG_ETAG_UNAVAILABLE/);
    await assert.rejects(client.update(baseline, 'A', 'conditional', 'W/"weak"'), /STRONG_ETAG_UNAVAILABLE/);
    assert.equal(patches.length, 0);
    const result = await client.update(baseline, 'B', 'invalid-validator-test');
    assert.equal(result.mode, 'invalid-validator-test');
    assert.match(patches[0].headers['If-Match'], /^"poc-deliberately-invalid-/);
    await client.update(baseline, 'A', 'unconditional-test');
    assert.equal(patches[1].headers['If-Match'], undefined);
});

test('a real or differently marked file is never written; changed-during-read baseline is rejected', async () => {
    let metadataCount = 0, unsafe = true, writes = 0;
    const { client } = mockedClient((url, init) => {
        if (init.method === 'PATCH') { writes++; return json(fixture()); }
        if (url.includes('alt=media')) return json(synthetic(runId));
        metadataCount++;
        return json({ ...fixture(), name: unsafe ? 'production.json' : fixture().name, version: String(metadataCount) });
    });
    await client.authorize(auth); await assert.rejects(client.read('poc-file-id', runId), /NOT_OUR_FILE/);
    unsafe = false; await assert.rejects(client.read('poc-file-id', runId), /CHANGED_DURING_READ/);
    assert.equal(writes, 0);
});

test('create/list are scoped to the disposable run, including pagination', async () => {
    let lists = 0;
    const { client, calls } = mockedClient((url, init) => {
        if (init.method === 'POST') {
            assert.match(init.body, /"parents":\["appDataFolder"\]/);
            assert(init.body.includes(PURPOSE)); return json(fixture());
        }
        const params = new URL(url).searchParams;
        assert.equal(params.get('spaces'), 'appDataFolder'); assert(params.get('q').includes(runId));
        lists++;
        return json(lists === 1 ? { files: [fixture()], nextPageToken: 'page2' } : { files: [] });
    });
    await client.authorize(auth); await client.create(runId);
    assert.equal((await client.list(runId)).length, 1);
    assert.equal(lists, 2); assert(calls.some(c => c.url.includes('pageToken=page2')));
});

test('401, network failures and interrupted requests never cause automatic retries or raw error logging', async () => {
    for (const kind of ['401', 'network', 'abort', 'disconnect']) {
        const { client, observations } = mockedClient(async (url, init) => {
            if (kind === '401') return json({}, 401);
            if (kind === 'network') throw Error(`sensitive ${auth.access_token}`);
            queueMicrotask(() => kind === 'disconnect' ? client.disconnect() : client.abort());
            await new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(Error('raw abort')), { once: true }));
        });
        await client.authorize(auth);
        await assert.rejects(client.list(runId), kind === '401' ? /REAUTHORIZE/ : kind === 'network' ? /NETWORK_OR_CORS_OUTCOME_UNKNOWN/ : /ABORTED_OUTCOME_UNKNOWN/);
        assert(!JSON.stringify(observations).includes(auth.access_token));
    }
});

test('disconnect discards late responses and account identification is mandatory', async () => {
    let release;
    const { client } = mockedClient(() => new Promise(resolve => { release = resolve; }));
    await client.authorize(auth);
    const pending = client.list(runId); client.disconnect(); release(json({ files: [fixture()] }));
    await assert.rejects(pending, /DISCONNECTED/); assert.equal(client.connected, false);
    const invalid = createPocClient({ fetchImpl: async () => json({ user: {} }) });
    await assert.rejects(invalid.authorize(auth), /ACCOUNT_UNRESOLVED/); assert.equal(invalid.connected, false);
});

test('append-only ancestry detects sibling conflicts, deduplicates retries and rejects incomplete/cyclic histories', () => {
    const root = synthetic(runId), a = synthetic(runId, root.revisionId, 'A'), b = synthetic(runId, root.revisionId, 'B');
    assert.deepEqual(revisionHeads([root, a, b]).map(n => n.revisionId).sort(), [a.revisionId, b.revisionId].sort());
    assert.equal(revisionHeads([root, a, a]).length, 1);
    assert.throws(() => revisionHeads([a]), /MISSING_ANCESTOR/);
    assert.throws(() => revisionHeads([root, { ...root, role: 'B' }]), /REVISION_COLLISION/);
    assert.throws(() => revisionHeads([{ ...root, parentRevisionId: root.revisionId }]), /CYCLIC_HISTORY/);
});

test('standalone server exposes only PoC assets; no production routes, files or request logging', async () => {
    const server = await startServer(0);
    try {
        const origin = `http://127.0.0.1:${server.address().port}`;
        const page = await fetch(origin); assert.equal(page.status, 200);
        assert.equal(page.headers.get('cache-control'), 'no-store'); assert.equal(page.headers.get('x-frame-options'), 'DENY');
        for (const path of ['/src/index.html', '/.git/config', '/server.mjs', '/poc.test.mjs', '/service-worker.js', '/core.mjs?other=1']) {
            assert.equal((await fetch(origin + path)).status, 404);
        }
        assert.equal((await fetch(origin, { method: 'POST' })).status, 403);
        const rejectedHost = await new Promise((resolve, reject) => {
            const req = httpRequest(origin, { headers: { Host: 'untrusted.example' } }, res => { res.resume(); resolve(res.statusCode); });
            req.on('error', reject); req.end();
        });
        assert.equal(rejectedHost, 403);
        for (const name of ['core.mjs', 'poc.mjs']) {
            const source = await readFile(new URL(name, import.meta.url), 'utf8');
            assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|console\.|\.\.\/.*src\//);
        }
    } finally { await new Promise(done => server.close(done)); }
});
