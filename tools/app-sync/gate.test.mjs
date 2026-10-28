import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createTemplateStore } from '../../src/js/templates.mjs';
import { startServer, developmentEntry } from './server.mjs';
import { syncFeedback } from './panel.mjs';
import { serializeRundowns, parseRundowns } from '../../src/js/portability.mjs';

test('cleared editor feedback is empty; genuine failures are not hidden in either language', () => {
    for (const language of ['de', 'en']) {
        assert.equal(syncFeedback('', language), '');
        assert(syncFeedback('syncError', language).length > 0);
        assert.equal(syncFeedback('unexpectedFailure', language), syncFeedback('syncError', language));
        assert.notEqual(syncFeedback('legacyConflict', language), syncFeedback('syncError', language));
    }
});

test('empty-library backup is complete parseable schema-version-1 JSON (44 UTF-8 bytes)', () => {
    const library = { schemaVersion: 1, templates: [] };
    const bytes = serializeRundowns(library);
    assert.equal(Buffer.byteLength(bytes), 44);
    assert.deepEqual(JSON.parse(bytes), library);
    // DATA-001 intentionally rejects importing a file containing no Rundowns.
    assert.throws(() => parseRundowns(bytes), /importEmpty/);
});
test('legacy writer is blocked only for explicit activation at the approved development origin', () => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'location');
    const data = new Map([['easyTimerDevelopmentSyncStorage', 'active']]);
    const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
    try {
        Object.defineProperty(globalThis, 'location', { configurable: true, value: { origin: 'http://localhost:8000' } });
        assert.throws(() => createTemplateStore(() => storage).load(), /storageBlocked/);
        for (const origin of ['https://et.rbsnet.at', 'https://easytimer.at', 'http://localhost:8001']) {
            globalThis.location.origin = origin; assert.equal(createTemplateStore(() => storage).load().templates.length, 0);
        }
        globalThis.location.origin = 'http://localhost:8000'; data.delete('easyTimerDevelopmentSyncStorage');
        const local = createTemplateStore(() => storage); local.load(); local.save({ schemaVersion: 1, templates: [] });
        assert(data.has('easyTimerTemplates'));
        assert.throws(() => createTemplateStore(() => ({ getItem() { throw Error('SecurityError'); } })).load(), /storageRead/);
    } finally { if (previous) Object.defineProperty(globalThis, 'location', previous); else delete globalThis.location; }
});
test('normal server exposes no Google tools; explicit development server changes only its entry path', async () => {
    for (const enabled of [false, true]) {
        const server = await startServer({ port: 0, enabled });
        try {
            const url = 'http://127.0.0.1:' + server.address().port;
            const html = await (await fetch(url)).text();
            assert.equal(html.includes('/tools/app-sync/entry.mjs'), enabled);
            assert.equal((await fetch(url + '/tools/app-sync/panel.mjs')).status, enabled ? 200 : 404);
            assert.equal((await fetch(url + '/tools/app-sync/account.mjs')).status, enabled ? 200 : 404);
            assert.equal((await fetch(url + '/tools/app-sync/diagnostics.mjs')).status, enabled ? 200 : 404);
            assert.equal((await fetch(url + '/service-worker.js')).status, enabled ? 404 : 200);
            assert.equal((await fetch(url + '/docs/backlog.md')).status, 404);
        } finally { await new Promise(done => server.close(done)); }
    }
    for (const path of ['../../src/index.html', '../../src/js/app.js', '../../src/js/planner.js', '../../src/service-worker.js']) {
        const source = await readFile(new URL(path, import.meta.url), 'utf8');
        assert(!source.includes('apps.googleusercontent.com') && !source.includes('accounts.google.com/gsi/client'));
    }
});

test('a running development server follows changed HTML versions and fails closed if the entry is missing or ambiguous', async () => {
    let html = '<script type="module" src="js/app.js?v=46"></script>';
    const server = await startServer({ port: 0, enabled: true, read: async () => Buffer.from(html) });
    try {
        const url = 'http://127.0.0.1:' + server.address().port;
        for (const version of [46, 47, 999]) {
            html = `<script type="module" src="js/app.js?v=${version}"></script>`;
            const response = await fetch(url);
            assert.equal(response.status, 200);
            const body = await response.text();
            assert.ok(body.includes('src="/tools/app-sync/entry.mjs"'));
            assert.ok(!body.includes('js/app.js?v='));
        }
        for (const invalid of ['<main>No entry</main>', html + html]) {
            assert.throws(() => developmentEntry(invalid), /DEVELOPMENT_ENTRY_MISMATCH/);
            html = invalid;
            const response = await fetch(url);
            assert.equal(response.status, 503, 'Never silently fall back to the normal localStorage app');
            assert.ok(!(await response.text()).includes('js/app.js?v='));
        }
    } finally { await new Promise(done => server.close(done)); }
});

test('wrong normal entry with an activated development store blocks a valid draft without replacing stored data', () => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'location');
    const legacy = JSON.stringify({ schemaVersion: 1, templates: [{ id: 'retained', name: 'Retained fixture', transitionMode: 'manual', phases: [{ id: 'kept', title: 'Kept', durationSeconds: 60 }] }] });
    const data = new Map([['easyTimerDevelopmentSyncStorage', 'active'], ['easyTimerTemplates', legacy]]);
    let writes = 0;
    try {
        Object.defineProperty(globalThis, 'location', { configurable: true, value: { origin: 'http://localhost:8000' } });
        const store = createTemplateStore(() => ({ getItem: key => data.get(key) ?? null, setItem: () => { writes += 1; } }));
        assert.throws(() => store.load(), /storageBlocked/);
        const draft = { id: 'new-fixture', name: 'REL-001B acceptance fixture', transitionMode: 'manual',
            phases: [5, 10, 5].map((minutes, i) => ({ id: 'phase-' + i, title: 'Phase ' + (i + 1), durationSeconds: minutes * 60 })) };
        assert.throws(() => store.save({ schemaVersion: 1, templates: [draft] }), /storageBlocked/);
        assert.equal(writes, 0); assert.equal(data.get('easyTimerTemplates'), legacy);
    } finally { if (previous) Object.defineProperty(globalThis, 'location', previous); else delete globalThis.location; }
});
