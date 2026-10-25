import { createPocClient, SCOPE } from './core.mjs';
import { attachSnapshotUI } from './snapshot-ui.mjs';

// Standalone harness only. No production imports, browser storage or automatic Google requests.
// A future real-device staging origin requires separate explicit approval and an exact allowlist.
if (!['localhost', '127.0.0.1'].includes(location.hostname)) {
    document.body.replaceChildren(document.createTextNode('This unreleased PoC is restricted to loopback. No Google requests are enabled on this origin.'));
    throw new Error('POC_ORIGIN_NOT_APPROVED');
}
const $ = id => document.getElementById(id);
let baseline = null, authEpoch = 0, connected = false, busy = false, gisLoaded = false;
let clearSnapshots = () => {};
const observations = [];
function record(event) {
    observations.push({ at: new Date().toISOString(), ...event });
    $('observations').textContent = JSON.stringify(observations.slice(-100), null, 2);
}
const client = createPocClient({ evidence: record });
$('run-id').value = crypto.randomUUID();
function controls() {
    for (const id of ['create', 'list', 'read', 'snapshot-discover', 'snapshot-prepare', 'snapshot-publish', 'snapshot-lost', 'snapshot-recover']) $(id).disabled = !connected || busy || !$('approved').checked;
    // Owner-observed failure: do not continue the rejected If-Match strategy.
    for (const id of ['update', 'probe', 'crud']) $(id).disabled = true;
    for (const id of ['snapshot-ticket', 'snapshot-role', 'snapshot-parents']) $(id).disabled = busy;
    for (const id of ['client-id', 'run-id', 'file-id', 'role', 'validator']) $(id).disabled = busy;
    $('connect').disabled = !gisLoaded || busy || !$('approved').checked;
    $('load-gis').disabled = gisLoaded || busy;
}
function reset() {
    authEpoch++; client.disconnect(); baseline = null; connected = false;
    clearSnapshots();
    $('connection').textContent = 'Disconnected locally. Token and baseline cleared; Google grant and remote file retained.';
    controls();
}
function fail(error) {
    const allowed = /^(HTTP_\d{3}|REAUTHORIZE|DISCONNECTED|ABORTED_OUTCOME_UNKNOWN|NETWORK_OR_CORS_OUTCOME_UNKNOWN|INVALID_RUN_ID|INVALID_FILE_ID|NOT_OUR_FILE|NOT_OUR_FIXTURE|READ_FIRST|CHANGED_DURING_READ|STRONG_ETAG_UNAVAILABLE|SCOPE_OR_TOKEN_REJECTED|ACCOUNT_UNRESOLVED|POC_LIST_LIMIT|AUTH_CANCELLED|GIS_UNAVAILABLE)$/;
    const snapshotError = /^(SNAPSHOT_INVALID|NOT_OUR_SNAPSHOT|SNAPSHOT_CONTENT_MISMATCH|GENERATED_ID_INVALID|INCOMPLETE_SNAPSHOT_LIST|SNAPSHOT_LIST_LIMIT|SNAPSHOT_COLLISION|MISSING_ANCESTOR|CYCLIC_HISTORY|DISCOVER_SNAPSHOTS_FIRST|ROOT_ALREADY_EXISTS|SIMULATED_LOST_ACK_VERIFY_SAME_OPERATION)$/;
    const code = allowed.test(error?.message) || snapshotError.test(error?.message) ? error.message : 'UNRESOLVED_ERROR';
    $('result').textContent = `${code}. No automatic retry. Retain observations and verify remote content before retrying a write.`;
    record({ error: code });
    if (!client.connected) { baseline = null; connected = false; }
    controls();
}
$('load-gis').addEventListener('click', () => {
    if (!$('approved').checked) { $('result').textContent = 'Confirm the separate test project first.'; return; }
    if (!/^\d+-[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test($('client-id').value.trim())) { $('result').textContent = 'Enter only a public OAuth web client ID.'; return; }
    busy = true; controls();
    const script = document.createElement('script'); script.src = 'https://accounts.google.com/gsi/client'; script.async = true;
    script.onload = () => { busy = false; gisLoaded = true; controls(); $('result').textContent = 'GIS loaded. Click Authorize to open the user-triggered popup.'; };
    script.onerror = () => { script.remove(); busy = false; fail(new Error('GIS_UNAVAILABLE')); };
    document.head.append(script);
});
$('connect').addEventListener('click', () => {
    reset();
    const epoch = authEpoch;
    busy = true; controls();
    try {
        const tokenClient = google.accounts.oauth2.initTokenClient({ client_id: $('client-id').value.trim(), scope: SCOPE,
            include_granted_scopes: false, prompt: 'select_account',
            callback: async response => {
                if (epoch !== authEpoch) return;
                try {
                    if (response.error) throw new Error('AUTH_CANCELLED');
                    const fingerprint = await client.authorize(response);
                    if (epoch !== authEpoch) return;
                    connected = true;
                    $('connection').textContent = `Authorized. Test-account fingerprint ${fingerprint}; expiry ${new Date(client.expiresAt).toISOString()}. Not a production sign-in.`;
                    record({ authorization: 'token-and-about-request-completed' });
                } catch (error) { if (epoch === authEpoch) fail(error); }
                finally { if (epoch === authEpoch) { busy = false; controls(); } }
            },
            error_callback: error => {
                if (epoch !== authEpoch) return;
                busy = false; reset();
                $('result').textContent = ['popup_closed', 'popup_failed_to_open'].includes(error.type) ? error.type : 'OAuth popup unresolved';
                record({ popup: ['popup_closed', 'popup_failed_to_open'].includes(error.type) ? error.type : 'unknown' });
            },
        });
        tokenClient.requestAccessToken();
    } catch (error) { busy = false; reset(); fail(error); }
});
$('disconnect').addEventListener('click', () => { busy = false; reset(); });
$('abort').addEventListener('click', () => client.abort());
$('approved').addEventListener('change', () => { if (!$('approved').checked) { busy = false; reset(); } controls(); });
for (const id of ['run-id', 'file-id']) $(id).addEventListener('input', () => { baseline = null; });
const execute = (id, action) => $(id).addEventListener('click', async () => {
    if (busy || !connected || !$('approved').checked) return;
    const epoch = authEpoch; busy = true; controls();
    try { await action(epoch); }
    catch (error) { if (epoch === authEpoch) fail(error); }
    finally { if (epoch === authEpoch) { busy = false; controls(); } }
});
execute('create', async epoch => {
    baseline = null;
    const file = await client.create($('run-id').value.trim());
    if (epoch !== authEpoch) return;
    $('file-id').value = file.id; $('result').textContent = `Disposable file created: ${file.id}. Read it before updating. Copy Run ID and File ID to client B.`;
    record({ operation: 'create-completed', fileId: file.id });
});
execute('list', async epoch => {
    const files = await client.list($('run-id').value.trim());
    if (epoch !== authEpoch) return;
    $('result').textContent = `Found ${files.length} matching disposable files. IDs: ${files.map(file => file.id).join(', ')}. Duplicate files must not be silently merged.`;
    record({ operation: 'list-completed', count: files.length });
});
execute('read', async epoch => {
    const read = await client.read($('file-id').value.trim(), $('run-id').value.trim());
    if (epoch !== authEpoch) return;
    baseline = read;
    record({ operation: 'baseline-read', fileId: read.fileId, version: read.version, revisionId: read.data.revisionId,
        parentRevisionId: read.data.parentRevisionId, role: read.data.role, metadataEtag: read.etag, mediaEtag: read.mediaEtag });
    $('result').textContent = 'Baseline retained in memory. Do not read again on client B before its stale-write experiment. Missing readable ETags leave conditional writes UNRESOLVED.';
});
for (const [id, mode] of [['update', 'conditional'], ['probe', 'invalid-validator-test'], ['crud', 'unconditional-test']]) execute(id, async epoch => {
    if (!baseline) throw new Error('READ_FIRST');
    const validator = $('validator').value === 'media' ? baseline.mediaEtag : baseline.etag;
    const result = await client.update(baseline, $('role').value, mode, validator);
    if (epoch !== authEpoch) return;
    record({ operation: 'patch-completed', ...result });
    $('result').textContent = mode === 'invalid-validator-test'
        ? 'Invalid If-Match was accepted: this tested precondition is unsafe (FAIL). Verify file contents with Read.'
        : 'PATCH accepted. Reread from a separate client and compare revision IDs. Acceptance alone does not prove safe concurrency. The old baseline remains retained.';
});
clearSnapshots = attachSnapshotUI({ client, execute, record, result: (epoch, action) => { if (epoch === authEpoch) action(); } });
window.addEventListener('pagehide', () => { busy = false; reset(); });
window.addEventListener('pageshow', () => controls());
controls();
