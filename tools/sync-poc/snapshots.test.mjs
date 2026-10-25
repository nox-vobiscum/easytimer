import test from 'node:test';
import assert from 'node:assert/strict';
import { canonical, makeSnapshot, validateSnapshot, snapshotHeads, createSnapshotOperations, SNAPSHOT_PURPOSE } from './snapshots.mjs';
const runId = 'a2400000-0000-4000-8000-000000000002';
function fakeDrive() {
    const files = new Map(), calls = []; let next = 0, lose = false;
    const request = async (path, init = {}) => {
        calls.push({ path, method: init.method || 'GET' });
        assert(!['PATCH', 'DELETE', 'PUT'].includes(init.method), 'Snapshot operations must never mutate a file');
        const url = new URL('https://www.googleapis.com' + path);
        if (path.includes('generateIds?')) { assert.equal(url.searchParams.get('space'), 'appDataFolder'); return { value: { space: 'appDataFolder', ids: [`file-${++next}`] } }; }
        if (init.method === 'POST') {
            const [meta, data] = [...init.body.matchAll(/\r\n\r\n(\{[^\r]*\})/g)].map(m => JSON.parse(m[1]));
            if (files.has(meta.id)) throw Error('HTTP_409');
            files.set(meta.id, { meta: { ...meta, spaces: ['appDataFolder'] }, data });
            if (lose) { lose = false; throw Error('NETWORK_OR_CORS_OUTCOME_UNKNOWN'); }
            return { value: files.get(meta.id).meta };
        }
        if (url.pathname === '/drive/v3/files') return { value: { files: [...files.values()].map(v => v.meta) } };
        const id = url.pathname.split('/').at(-1);
        if (!files.has(id)) throw Error('HTTP_404');
        return { value: structuredClone(url.searchParams.get('alt') === 'media' ? files.get(id).data : files.get(id).meta) };
    };
    return { ops: createSnapshotOperations(request), files, calls, loseNext: () => { lose = true; } };
}
test('snapshot canonical hash covers complete synthetic library, IDs and ancestry', async () => {
    const root = await makeSnapshot(runId);
    await validateSnapshot(JSON.parse(canonical(root)), runId);
    const changed = structuredClone(root); changed.library.templates[0].phases[0].durationSeconds = 120;
    await assert.rejects(validateSnapshot(changed, runId), /SNAPSHOT_INVALID/);
    await assert.rejects(validateSnapshot({ ...root, extra: 'unexpected' }, runId), /SNAPSHOT_INVALID/);
    const child = await makeSnapshot(runId, [root.snapshotId], 'B');
    assert.equal(child.library.templates[0].id, root.library.templates[0].id);
    assert.equal(child.library.templates[0].phases[0].id, root.library.templates[0].phases[0].id);
});
test('same operation and pre-generated file ID retry verifies original after simulated 409', async () => {
    const drive = fakeDrive(), op = await drive.ops.prepare(runId, [], 'A');
    const first = await drive.ops.publish(op), retry = await drive.ops.publish(op);
    assert.equal(first.duplicate, false); assert.equal(retry.duplicate, true);
    assert.equal(drive.files.size, 1); assert.deepEqual(retry.snapshot, op.snapshot);
    assert.equal(drive.calls.filter(c => c.path.includes('generateIds?')).length, 1);
});
test('lost response and controlled lost acknowledgement recover same file without a new operation', async () => {
    const drive = fakeDrive(), op = await drive.ops.prepare(runId, [], 'A');
    drive.loseNext(); await assert.rejects(drive.ops.publish(op), /OUTCOME_UNKNOWN/);
    assert.equal((await drive.ops.verify(op)).verified, true);
    assert.equal((await drive.ops.publish(op)).duplicate, true);
    await assert.rejects(drive.ops.publish(op, true), /SIMULATED_LOST_ACK/);
    assert.deepEqual((await drive.ops.verify(op)).snapshot, op.snapshot);
    assert.equal(drive.files.size, 1);
});
test('parallel branches survive reconciliation and a late branch remains unresolved', async () => {
    const drive = fakeDrive(), root = await drive.ops.prepare(runId, [], 'A'); await drive.ops.publish(root);
    const parents = [root.snapshot.snapshotId];
    const a = await drive.ops.prepare(runId, parents, 'A'), b = await drive.ops.prepare(runId, parents, 'B'), late = await drive.ops.prepare(runId, parents, 'C');
    await drive.ops.publish(a); await drive.ops.publish(b);
    const branches = await drive.ops.discover(runId);
    assert.equal(branches.heads.length, 2);
    const merge = await drive.ops.prepare(runId, branches.heads.map(n => n.snapshotId), 'M'); await drive.ops.publish(merge);
    assert.equal((await drive.ops.discover(runId)).heads.length, 1);
    assert.deepEqual(await drive.ops.read(a.fileId, runId), a.snapshot); assert.deepEqual(await drive.ops.read(b.fileId, runId), b.snapshot);
    await drive.ops.publish(late);
    assert.deepEqual((await drive.ops.discover(runId)).heads.map(n => n.snapshotId).sort(), [late.snapshot.snapshotId, merge.snapshot.snapshotId].sort());
    assert.equal(drive.files.size, 5);
});
test('corruption, foreign metadata and 409 with different content block verification', async () => {
    const drive = fakeDrive(), op = await drive.ops.prepare(runId, [], 'A'); await drive.ops.publish(op);
    drive.files.get(op.fileId).data = await makeSnapshot(runId, [], 'B');
    await assert.rejects(drive.ops.publish(op), /SNAPSHOT_INVALID/);
    drive.files.get(op.fileId).meta.appProperties.purpose = 'production';
    await assert.rejects(drive.ops.verify(op), /NOT_OUR_SNAPSHOT/);
});
test('duplicate snapshots are logical single nodes; missing history and incomplete listings fail closed', async () => {
    const root = await makeSnapshot(runId), child = await makeSnapshot(runId, [root.snapshotId]);
    assert.equal(snapshotHeads([root, child, child]).length, 1);
    assert.throws(() => snapshotHeads([child]), /MISSING_ANCESTOR/);
    const incomplete = createSnapshotOperations(async () => ({ value: { files: [], incompleteSearch: true } }));
    await assert.rejects(incomplete.discover(runId), /INCOMPLETE_SNAPSHOT_LIST/);
    const cyclic = createSnapshotOperations(async () => ({ value: { files: [], nextPageToken: 'same' } }));
    await assert.rejects(cyclic.discover(runId), /INCOMPLETE_SNAPSHOT_LIST/);
    assert.equal(SNAPSHOT_PURPOSE, 'easytimer-sync-001-snapshot-v1');
});
