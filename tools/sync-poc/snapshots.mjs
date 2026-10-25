export const SNAPSHOT_PURPOSE = 'easytimer-sync-001-snapshot-v1';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const digestId = /^[a-f0-9]{64}$/;
const fileId = /^[a-zA-Z0-9_-]{1,200}$/;
const fields = 'id,name,appProperties,spaces';
const check = (value, code) => { if (!value) throw new Error(code); };
export const canonical = value => JSON.stringify(normalize(value));
function normalize(value) {
    if (Array.isArray(value)) return value.map(normalize);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, normalize(value[key])]));
    return value;
}
async function hash(value) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(value)));
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
function payload(runId, operationId, parents, role) {
    check(uuid.test(runId) && uuid.test(operationId) && ['A', 'B', 'C', 'M'].includes(role), 'SNAPSHOT_INVALID');
    check(Array.isArray(parents) && parents.length <= 10 && parents.every(id => digestId.test(id)) && new Set(parents).size === parents.length, 'SNAPSHOT_INVALID');
    return { purpose: SNAPSHOT_PURPOSE, syncFormatVersion: 1, runId, operationId, parents: [...parents].sort(), role,
        library: { schemaVersion: 1, templates: [{ id: `poc-${runId}`, name: `Disposable snapshot ${role}`, transitionMode: 'manual',
            phases: [{ id: `phase-${runId}`, title: 'Synthetic opening', durationSeconds: 600 }] }] } };
}
export async function makeSnapshot(runId, parents = [], role = 'A', operationId = crypto.randomUUID()) {
    const data = payload(runId, operationId, parents, role);
    return { ...data, snapshotId: await hash(data) };
}
export async function validateSnapshot(data, runId) {
    check(data?.runId === runId && digestId.test(data.snapshotId), 'SNAPSHOT_INVALID');
    const expected = await makeSnapshot(runId, data.parents, data.role, data.operationId);
    check(canonical(data) === canonical(expected), 'SNAPSHOT_INVALID'); return data;
}
export function snapshotHeads(nodes) {
    const unique = new Map();
    for (const node of nodes) {
        check(digestId.test(node.snapshotId) && Array.isArray(node.parents), 'SNAPSHOT_INVALID');
        check(!unique.has(node.snapshotId) || canonical(unique.get(node.snapshotId)) === canonical(node), 'SNAPSHOT_COLLISION');
        unique.set(node.snapshotId, node);
    }
    const parents = new Set(), visiting = new Set(), visited = new Set();
    function visit(id) {
        check(unique.has(id), 'MISSING_ANCESTOR'); check(!visiting.has(id), 'CYCLIC_HISTORY');
        if (visited.has(id)) return;
        visiting.add(id);
        for (const parent of unique.get(id).parents) { parents.add(parent); visit(parent); }
        visiting.delete(id); visited.add(id);
    }
    for (const id of unique.keys()) visit(id);
    return [...unique.values()].filter(node => !parents.has(node.snapshotId));
}
export function createSnapshotOperations(request) {
    function owned(meta, runId) {
        check(meta?.appProperties?.purpose === SNAPSHOT_PURPOSE && meta.appProperties.runId === runId &&
            meta.spaces?.includes('appDataFolder') && uuid.test(meta.appProperties.operationId) &&
            meta.name === `easytimer-SNAPSHOT-POC-${meta.appProperties.operationId}.json`, 'NOT_OUR_SNAPSHOT');
    }
    async function read(id, runId) {
        check(fileId.test(id) && uuid.test(runId), 'SNAPSHOT_INVALID');
        const { value: meta } = await request(`/drive/v3/files/${id}?fields=${encodeURIComponent(fields)}`);
        owned(meta, runId);
        const { value: data } = await request(`/drive/v3/files/${id}?alt=media`);
        await validateSnapshot(data, runId);
        check(meta.appProperties.operationId === data.operationId && meta.appProperties.snapshotId === data.snapshotId, 'SNAPSHOT_INVALID');
        return data;
    }
    async function verify(operation) {
        await validateSnapshot(operation.snapshot, operation.snapshot?.runId);
        const data = await read(operation.fileId, operation.snapshot.runId);
        check(canonical(data) === canonical(operation.snapshot), 'SNAPSHOT_CONTENT_MISMATCH');
        return { fileId: operation.fileId, snapshot: data, verified: true };
    }
    return {
        read, verify,
        async prepare(runId, parents, role) {
            const snapshot = await makeSnapshot(runId, parents, role);
            const { value } = await request('/drive/v3/files/generateIds?space=appDataFolder&type=files&count=1');
            check(value.space === 'appDataFolder' && value.ids?.length === 1 && fileId.test(value.ids[0]), 'GENERATED_ID_INVALID');
            return { fileId: value.ids[0], snapshot };
        },
        async publish(operation, loseResponse = false) {
            check(operation && Object.keys(operation).sort().join(',') === 'fileId,snapshot' && fileId.test(operation.fileId), 'SNAPSHOT_INVALID');
            await validateSnapshot(operation.snapshot, operation.snapshot?.runId);
            const data = operation.snapshot;
            const meta = { id: operation.fileId, name: `easytimer-SNAPSHOT-POC-${data.operationId}.json`, parents: ['appDataFolder'],
                appProperties: { purpose: SNAPSHOT_PURPOSE, runId: data.runId, operationId: data.operationId, snapshotId: data.snapshotId } };
            const boundary = `snapshot_${data.operationId}`;
            const body = `--${boundary}\r\nContent-Type: application/json\r\n\r\n${canonical(meta)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${canonical(data)}\r\n--${boundary}--`;
            let duplicate = false;
            try {
                await request(`/upload/drive/v3/files?uploadType=multipart&fields=${encodeURIComponent(fields)}`, {
                    method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body });
            } catch (error) {
                if (error.message !== 'HTTP_409') throw error;
                duplicate = true;
            }
            // A controlled experiment: the create completed but the caller does not verify/acknowledge it.
            if (loseResponse) throw new Error('SIMULATED_LOST_ACK_VERIFY_SAME_OPERATION');
            return { ...await verify(operation), duplicate };
        },
        async discover(runId) {
            check(uuid.test(runId), 'SNAPSHOT_INVALID');
            const files = [], pages = new Set(); let pageToken = '';
            do {
                check(!pages.has(pageToken), 'INCOMPLETE_SNAPSHOT_LIST'); pages.add(pageToken);
                const params = new URLSearchParams({ spaces: 'appDataFolder', pageSize: '100',
                    q: `appProperties has { key='purpose' and value='${SNAPSHOT_PURPOSE}' } and appProperties has { key='runId' and value='${runId}' }`,
                    fields: `nextPageToken,incompleteSearch,files(${fields})` });
                if (pageToken) params.set('pageToken', pageToken);
                const { value } = await request(`/drive/v3/files?${params}`);
                check(!value.incompleteSearch && Array.isArray(value.files), 'INCOMPLETE_SNAPSHOT_LIST');
                for (const file of value.files) { owned(file, runId); files.push(file); }
                check(files.length <= 200, 'SNAPSHOT_LIST_LIMIT');
                pageToken = value.nextPageToken || '';
            } while (pageToken);
            const nodes = [], seen = new Set();
            for (const file of files) if (!seen.has(file.id)) { seen.add(file.id); nodes.push(await read(file.id, runId)); }
            const heads = snapshotHeads(nodes);
            return { files: [...seen], nodes, heads, observationOnly: true };
        },
    };
}
