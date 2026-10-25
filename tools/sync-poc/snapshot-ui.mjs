import { validateSnapshot } from './snapshots.mjs';

export function attachSnapshotUI({ client, execute, record, result }) {
    const $ = id => document.getElementById(id);
    let known = null;
    const run = () => $('run-id').value.trim();
    const ticket = async () => {
        let operation;
        try { operation = JSON.parse($('snapshot-ticket').value); } catch { throw new Error('SNAPSHOT_INVALID'); }
        await validateSnapshot(operation.snapshot, run()); return operation;
    };
    execute('snapshot-discover', async epoch => {
        const discovered = await client.snapshots.discover(run());
        result(epoch, () => {
            known = discovered;
            $('snapshot-view').textContent = JSON.stringify(discovered, null, 2);
            record({ snapshotDiscovery: { fileCount: discovered.files.length, heads: discovered.heads.map(n => n.snapshotId), conflict: discovered.heads.length > 1 } });
            $('result').textContent = 'Discovery verified all listed snapshot contents and ancestry. This is an observation, not proof of global synchronization.';
        });
    });
    execute('snapshot-prepare', async epoch => {
        if (!known || known.nodes.some(node => node.runId !== run())) throw new Error('DISCOVER_SNAPSHOTS_FIRST');
        const parents = $('snapshot-parents').value.trim().split(/\s+/).filter(Boolean);
        if (parents.some(id => !known.nodes.some(node => node.snapshotId === id))) throw new Error('MISSING_ANCESTOR');
        if (parents.length === 0 && known.nodes.length > 0) throw new Error('ROOT_ALREADY_EXISTS');
        const operation = await client.snapshots.prepare(run(), parents, $('snapshot-role').value);
        result(epoch, () => {
            $('snapshot-ticket').value = JSON.stringify(operation, null, 2);
            record({ snapshotPrepared: { operationId: operation.snapshot.operationId, fileId: operation.fileId, snapshotId: operation.snapshot.snapshotId, parents } });
            $('result').textContent = 'Prepared only. Retain this exact recovery ticket before publishing. Preparing again creates a DIFFERENT operation; do not use it as retry.';
        });
    });
    for (const [id, lose] of [['snapshot-publish', false], ['snapshot-lost', true]]) execute(id, async epoch => {
        const operation = await ticket();
        const outcome = await client.snapshots.publish(operation, lose);
        result(epoch, () => {
            $('snapshot-view').textContent = JSON.stringify(outcome, null, 2);
            record({ snapshotPublication: { fileId: outcome.fileId, snapshotId: outcome.snapshot.snapshotId, duplicate: outcome.duplicate, fullContentVerified: true } });
            $('result').textContent = 'Complete stored content verified against this exact operation. Re-list for branch discovery; upload confirmation is not synchronization.';
        });
    });
    execute('snapshot-recover', async epoch => {
        const outcome = await client.snapshots.verify(await ticket());
        result(epoch, () => {
            $('snapshot-view').textContent = JSON.stringify(outcome, null, 2);
            record({ snapshotRecovery: { fileId: outcome.fileId, snapshotId: outcome.snapshot.snapshotId, fullContentVerified: true } });
            $('result').textContent = 'Recovered by original file ID and verified complete content; no new upload operation created.';
        });
    });
    return () => { known = null; $('snapshot-ticket').value = ''; $('snapshot-view').textContent = ''; };
}
