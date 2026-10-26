import test from 'node:test';
import assert from 'node:assert/strict';
import { createPocClient, SCOPE } from '../sync-poc/core.mjs';
import { createSnapshot, PURPOSE, canonicalJSON } from '../sync-core/canonical.mjs';
import { syntheticLibrary } from './coordinator.mjs';
import { validateTicket } from './store.mjs';
import { createTransport } from './transport.mjs';
import { fakeDrive } from './fake-drive.mjs';
const run = 'c2400000-0000-4000-8000-000000000001';
const auth = { access_token: 'UNIT_TEST_FAKE_ONLY_NOT_A_CREDENTIAL', expires_in: 3600, scope: SCOPE };
async function setup(options = {}) {
    const drive = fakeDrive(), events = [], client = createPocClient({ fetchImpl: drive.fetch, evidence: event => events.push(event), ...options });
    await client.authorize(auth); const session = client.integrationSession(), transport = createTransport(session, run);
    const snapshot = await createSnapshot({ purpose: PURPOSE, syncFormatVersion: 1, libraryId: run, operationId: crypto.randomUUID(),
        parents: [], library: syntheticLibrary(), deletedRundownIds: [], restoredRundownIds: [], resolution: null });
    const ticket = { operationId: snapshot.operationId, fileId: await transport.generateId(), libraryId: run, localRevision: 1,
        parents: [], snapshotBytes: canonicalJSON(snapshot), snapshotHash: snapshot.snapshotId, accountKey: await session.accountKey() };
    return { drive, client, session, transport, ticket, events };
}
test('canonical ticket binds full bytes, identity, revision and account; unknown fields and old format blocked', async () => {
    const { ticket } = await setup(); await validateTicket(ticket);
    for (const patch of [{ snapshotBytes: '{}' }, { snapshotBytes: ticket.snapshotBytes + '\n' }, { snapshotHash: 'sha256:' + '0'.repeat(64) },
        { localRevision: 0 }, { accountKey: 'short' }, { access_token: 'FAKE_ONLY' }, { parents: ['sha256:' + '1'.repeat(64)] }]) await assert.rejects(validateTicket({ ...ticket, ...patch }));
});
test('create and repeat verify exact canonical UTF-8; no overwrite or second POST', async () => {
    const { transport, ticket, drive, events } = await setup();
    await transport.publish(ticket); await transport.publish(ticket);
    assert.equal(drive.files.size, 1); assert.equal(drive.calls.filter(c => c.method === 'POST').length, 1);
    assert.equal(drive.files.get(ticket.fileId).bytes, ticket.snapshotBytes);
    assert(!JSON.stringify(events).includes(auth.access_token));
});
test('lost acknowledgement retains ID and recovers by exact readback', async () => {
    const { transport, ticket, drive } = await setup();
    await assert.rejects(transport.publish(ticket, { loseAcknowledgement: true }), /SIMULATED_LOST_ACK/);
    await transport.publish(ticket); assert.equal(drive.files.size, 1);
    assert.equal(drive.calls.filter(c => c.method === 'POST').length, 1);
});
test('real HTTP-shaped 409 race is accepted only after full readback verification', async () => {
    const { transport, ticket, drive } = await setup(); await transport.publish(ticket);
    let first = true;
    drive.fault = ({ url }) => { if (first && url.pathname.endsWith('/' + ticket.fileId)) { first = false; return new Response('{}', { status: 404 }); } };
    await transport.publish(ticket); assert.equal(drive.calls.filter(c => c.method === 'POST').length, 2);
});
test('explicit duplicate probe repeats only an already verified create and validates 409 readback', async () => {
    const { transport, ticket, drive, events } = await setup();
    await assert.rejects(transport.publish(ticket, { repeatCreate: true }), /HTTP_404/);
    assert.equal(drive.calls.filter(c => c.method === 'POST').length, 0);
    await transport.publish(ticket); await transport.publish(ticket, { repeatCreate: true });
    assert.equal(drive.files.size, 1); assert(events.some(event => event.status === 409));
});
test('unknown POST outcome attempts same-file readback and never allocates replacement', async () => {
    const { transport, ticket, drive } = await setup();
    drive.fault = ({ url }) => { if (url.pathname.startsWith('/upload/')) throw Error('Injected network failure'); };
    await assert.rejects(transport.publish(ticket), /PUBLICATION_UNCONFIRMED/);
    assert.equal(drive.calls.filter(c => c.path.endsWith('generateIds')).length, 1);
});
test('revoked, expired and disconnected sessions cannot write', async () => {
    let clock = 0; const { transport, ticket, drive, client } = await setup({ now: () => clock });
    clock = 3600000; await assert.rejects(transport.publish(ticket), /REAUTHORIZE/);
    await client.authorize(auth);
    await assert.rejects(transport.publish(ticket), /DISCONNECTED/);
    const fresh = createTransport(client.integrationSession(), run);
    drive.fault = () => new Response('{}', { status: 401 });
    await assert.rejects(fresh.publish(ticket), /REAUTHORIZE/);
    assert.equal(client.connected, false);
});
test('timeout is sanitized, aborts fetch and retains uncertain outcome', async () => {
    const { client, ticket } = await setup(); client.disconnect();
    const timed = createPocClient({ timeoutMs: 10, fetchImpl: async (url, init) => {
        if (url.includes('/about?')) return new Response(JSON.stringify({ user: { permissionId: 'synthetic-account-A' } }));
        return new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(Error('FAKE sensitive detail'))));
    } });
    await timed.authorize(auth); await assert.rejects(createTransport(timed.integrationSession(), run).publish(ticket), /ABORTED_OUTCOME_UNKNOWN/);
});
test('complete pagination deduplicates files; partial discovery and repeated tokens fail closed', async () => {
    const { transport, ticket, drive } = await setup(); await transport.publish(ticket); drive.duplicatePage = true;
    assert.equal((await transport.discover()).nodes.length, 1);
    drive.incomplete = true; await assert.rejects(transport.discover(), /INCOMPLETE_DISCOVERY/);
    drive.incomplete = false; drive.fault = ({ url }) => url.pathname === '/drive/v3/files' ? new Response(JSON.stringify({ files: [], nextPageToken: 'loop' })) : undefined;
    await assert.rejects(transport.discover(), /REPEATED_PAGE_TOKEN/);
});
test('corruption, wrong metadata, noncanonical and invalid UTF-8 bodies are blocked', async () => {
    const { transport, ticket, drive } = await setup(); await transport.publish(ticket);
    const file = drive.files.get(ticket.fileId), original = file.bytes;
    for (const bytes of [original + '\n', '\ufeff' + original, new Uint8Array([0xff]), '{}']) {
        file.bytes = bytes; await assert.rejects(transport.verify(ticket));
    }
    file.bytes = original; file.meta.appProperties.purpose = 'production'; await assert.rejects(transport.verify(ticket), /NOT_OUR_SYNTHETIC_FILE/);
});
test('Drive errors 403, 404, 429 and 503 do not authorize replacement, PATCH or DELETE', async () => {
    const { transport, ticket, drive, session } = await setup();
    for (const status of [403, 429, 503]) {
        drive.fault = () => new Response('{}', { status }); await assert.rejects(transport.publish(ticket), new RegExp('HTTP_' + status));
    }
    drive.fault = () => new Response('{}', { status: 404 }); await assert.rejects(transport.verify(ticket), /HTTP_404/);
    assert.throws(() => session.request('/upload/drive/v3/files/id?uploadType=media', { method: 'PATCH' }), /IMMUTABLE_ONLY/);
    assert.throws(() => session.request('/drive/v3/files/id', { method: 'DELETE' }), /IMMUTABLE_ONLY/);
});
