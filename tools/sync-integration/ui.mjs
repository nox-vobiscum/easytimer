import { openIntegrationStore } from './store.mjs';
import { createTransport } from './transport.mjs';
import { createCoordinator, syntheticLibrary } from './coordinator.mjs';
import { createPocClient, SCOPE } from '../sync-poc/core.mjs';
if (!['localhost', '127.0.0.1'].includes(location.hostname)) throw Error('LOCAL_ONLY');
const $ = id => document.getElementById(id);
let store, coordinator, runId, clientSlot, busy = false, gisLoaded = false, authEpoch = 0;
const evidence = [];
const client = createPocClient({ evidence: event => { evidence.push(event); $('evidence').textContent = JSON.stringify(evidence.slice(-100), null, 2); } });
function report(code) { $('status').textContent = code; }
async function show() {
    if (!store) return;
    const state = await store.read();
    // Do not print recovery tickets or account identifiers to logs or DOM.
    $('state').textContent = JSON.stringify({ experiment: runId, clientSlot, localRevision: state.library?.localRevision, name: state.library?.library.templates[0]?.name,
        dirty: state.metadata?.syncDirty, needsTicket: state.needsTicket, newerDirtyRevision: state.newerDirtyRevision,
        outboxStage: state.outbox?.stage || null, accountBound: Boolean(state.bindings),
        heads: state.bindings?.observation?.heads || [], retainedSnapshots: state.bindings?.history.length || 0 }, null, 2);
}
function reset() { authEpoch++; client.disconnect(); coordinator = null; report('Disconnected locally. Pending work retained; reconnect the SAME account.'); }
function safeError(error) { return /^[A-Z][A-Z0-9_]{1,100}$/.test(error?.message) ? error.message : 'OPERATION_FAILED'; }
function controls() {
    for (const button of document.querySelectorAll('button')) button.disabled = busy && !['disconnect', 'abort'].includes(button.id);
    for (const input of document.querySelectorAll('input:not([type=checkbox])')) input.disabled = busy;
    $('authorize').disabled = busy || !gisLoaded;
}
function action(id, fn) { $(id).onclick = async () => {
    if (busy) return;
    if (!$('approved').checked) { report('Confirm disposable test data first.'); return; }
    busy = true; controls();
    try { const result = await fn(); report(typeof result === 'string' ? result : JSON.stringify(result ?? { result: 'complete' })); await show(); }
    catch (error) { report(safeError(error) + '. No automatic retry; data and existing ticket retained.'); }
    finally { busy = false; controls(); }
}; }
const requireStore = () => { if (!store) throw Error('OPEN_STORE_FIRST'); return store; };
const requireCoordinator = () => { if (!coordinator || !client.connected) throw Error('REAUTHORIZE'); return coordinator; };
action('new-run', () => { $('run').value = crypto.randomUUID(); return 'New UUID entered. Open explicitly; existing stores retained.'; });
action('open', async () => {
    const selectedRun = $('run').value.trim(), selectedSlot = $('slot').value.trim();
    const next = await openIntegrationStore({ runId: selectedRun, clientId: selectedSlot });
    reset(); store?.close(); store = next; runId = selectedRun; clientSlot = selectedSlot; await store.read(); return 'Isolated store opened. No legacy storage read.';
});
action('seed', async () => {
    const db = requireStore(), state = await db.read();
    if (state.library) throw Error('SEED_EMPTY_ONLY'); await db.save(syntheticLibrary(), 0);
});
action('edit', async () => {
    const db = requireStore(), state = await db.read(); if (!state.library) throw Error('SEED_OR_ADOPT_FIRST');
    const library = structuredClone(state.library.library); library.templates[0].name = 'Synthetic edit ' + (state.library.localRevision + 1);
    await db.save(library, state.library.localRevision);
});
action('load', async () => {
    if (location.origin !== 'http://localhost:8000') throw Error('USE_APPROVED_LOCALHOST_ORIGIN');
    if (gisLoaded) return 'GIS already loaded.';
    await new Promise((done, fail) => { const script = document.createElement('script'); script.src = 'https://accounts.google.com/gsi/client'; script.onload = done; script.onerror = () => fail(Error('GIS_UNAVAILABLE')); document.head.append(script); });
    gisLoaded = true; return 'GIS loaded. Authorize explicitly.';
});
$('authorize').onclick = () => {
    if (busy || !gisLoaded || !$('approved').checked || !store) { report('Open store and load GIS first.'); return; }
    reset(); const epoch = authEpoch; busy = true; controls();
    const finish = () => { if (epoch === authEpoch) { busy = false; controls(); } };
    try {
        if (location.origin !== 'http://localhost:8000' || !/^\d+-[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test($('oauth').value.trim())) throw Error('AUTH_CONFIGURATION_REQUIRED');
        google.accounts.oauth2.initTokenClient({ client_id: $('oauth').value.trim(), scope: SCOPE, include_granted_scopes: false, prompt: 'select_account',
            callback: async response => {
                if (epoch !== authEpoch) return;
                try {
                    if (response.error) throw Error('AUTH_CANCELLED');
                    await client.authorize(response); if (epoch !== authEpoch) return;
                    const session = client.integrationSession();
                    await store.bind(await session.accountKey(), () => session.assertCurrent());
                    coordinator = createCoordinator(store, createTransport(session, runId));
                    report('Authorized and bound. Discover before preparing.'); await show();
                } catch (error) { if (epoch === authEpoch) { client.disconnect(); coordinator = null; report(safeError(error)); } }
                finally { finish(); }
            },
            error_callback: error => { if (epoch === authEpoch) { report(['popup_closed', 'popup_failed_to_open'].includes(error.type) ? error.type : 'AUTH_FAILED'); finish(); } },
        }).requestAccessToken();
    } catch { report('AUTH_FAILED'); finish(); }
};
$('disconnect').onclick = () => { busy = false; reset(); controls(); };
$('abort').onclick = () => client.abort();
$('approved').onchange = () => { if (!$('approved').checked) { busy = false; reset(); controls(); } };
action('discover', () => requireCoordinator().discover());
action('adopt', () => requireCoordinator().adopt());
action('prepare', async () => { await requireCoordinator().prepare(); return 'Complete immutable ticket is durable. No upload yet.'; });
action('publish', () => requireCoordinator().publish());
action('lost', () => requireCoordinator().publish({ loseAcknowledgement: true }));
action('duplicate', () => requireCoordinator().publish({ repeatCreate: true }));
action('read', () => { requireStore(); return 'Durable state inspected.'; });
action('conflicts', async () => { const analysis = await requireCoordinator().inspectConflicts(); return { status: analysis.status, reason: analysis.reason, conflicts: analysis.proposal?.conflicts.map(row => ({ id: row.id, type: row.conflict })) }; });
controls();
