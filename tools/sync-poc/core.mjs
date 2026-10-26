import { createSnapshotOperations } from './snapshots.mjs';
export const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
export const PURPOSE = 'easytimer-sync-001-disposable-v1';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fields = 'id,name,appProperties,version,spaces';
const requireRun = runId => { if (!uuid.test(runId)) throw new Error('INVALID_RUN_ID'); };
export function synthetic(runId, parentRevisionId = null, role = 'A') {
    requireRun(runId);
    if (!['A', 'B'].includes(role) || (parentRevisionId !== null && !uuid.test(parentRevisionId))) throw new Error('INVALID_FIXTURE');
    return { purpose: PURPOSE, runId, revisionId: crypto.randomUUID(), parentRevisionId, role,
        library: { schemaVersion: 1, templates: [{ id: `poc-${runId}`, name: `Disposable fixture ${role}`, transitionMode: 'manual',
            phases: [{ id: `phase-${runId}`, title: 'Synthetic opening', durationSeconds: 600 }] }] } };
}
export function validateSynthetic(data, runId) {
    requireRun(runId);
    if (!data || data.purpose !== PURPOSE || data.runId !== runId || !uuid.test(data.revisionId) ||
        (data.parentRevisionId !== null && !uuid.test(data.parentRevisionId)) || !['A', 'B'].includes(data.role)) throw new Error('NOT_OUR_FIXTURE');
    const expected = synthetic(runId, data.parentRevisionId, data.role);
    expected.revisionId = data.revisionId;
    if (JSON.stringify(data) !== JSON.stringify(expected)) throw new Error('NOT_OUR_FIXTURE');
    return data;
}
export function assertOwned(file, runId) {
    requireRun(runId);
    if (file?.appProperties?.purpose !== PURPOSE || file.appProperties.runId !== runId ||
        !file.spaces?.includes('appDataFolder') || file.name !== `easytimer-SYNC-001-POC-${runId}.json`) throw new Error('NOT_OUR_FILE');
}
// Proposed fallback only: immutable nodes never replace a previously published revision.
export function revisionHeads(nodes) {
    const ids = new Map();
    for (const node of nodes) {
        if (!uuid.test(node.revisionId) || (node.parentRevisionId !== null && !uuid.test(node.parentRevisionId))) throw new Error('INVALID_REVISION');
        if (ids.has(node.revisionId) && JSON.stringify(ids.get(node.revisionId)) !== JSON.stringify(node)) throw new Error('REVISION_COLLISION');
        ids.set(node.revisionId, node);
    }
    const parents = new Set();
    for (const node of ids.values()) {
        if (node.parentRevisionId !== null && !ids.has(node.parentRevisionId)) throw new Error('MISSING_ANCESTOR');
        const seen = new Set([node.revisionId]);
        let parent = node.parentRevisionId;
        while (parent !== null) {
            if (seen.has(parent)) throw new Error('CYCLIC_HISTORY');
            seen.add(parent); parents.add(parent); parent = ids.get(parent).parentRevisionId;
        }
    }
    return [...ids.values()].filter(node => !parents.has(node.revisionId));
}

export function createPocClient({ fetchImpl = fetch, now = Date.now, evidence = () => {}, timeoutMs = 15000 } = {}) {
    let token = null, expiresAt = 0, generation = 0, account = null;
    const pending = new Set();
    function disconnect() {
        token = null; expiresAt = 0; account = null; generation++;
        for (const controller of pending) controller.abort();
        pending.clear();
    }
    function abort() { for (const controller of pending) controller.abort(); }
    async function request(path, { method = 'GET', body, headers = {}, raw = false } = {}) {
        if (!token || now() >= expiresAt) { disconnect(); throw new Error('REAUTHORIZE'); }
        if (!/^\/(?:drive\/v3\/(?:about\?|files(?:\?|\/))|upload\/drive\/v3\/files(?:\?|\/))/.test(path)) throw new Error('INVALID_ENDPOINT');
        const epoch = generation, controller = new AbortController(); pending.add(controller);
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetchImpl(`https://www.googleapis.com${path}`, { method, body, headers: { ...headers, Authorization: `Bearer ${token}` },
                signal: controller.signal, cache: 'no-store', credentials: 'omit', redirect: 'error' });
            if (epoch !== generation) throw new Error('DISCONNECTED');
            evidence({ method, status: response.status, resource: path.includes('generateIds?') ? 'generateIds' : path.startsWith('/upload/') ? 'file-upload' :
                path.includes('alt=media') ? 'file-content' : path.startsWith('/drive/v3/about?') ? 'account-identification' : 'file-metadata-or-list',
                etagExposed: Boolean(response.headers.get('etag')) });
            if (response.status === 401) { disconnect(); throw new Error('REAUTHORIZE'); }
            // Do not log raw Google responses, token responses, request headers or errors.
            if (!response.ok) throw new Error(`HTTP_${response.status}`);
            const value = raw ? new Uint8Array(await response.arrayBuffer()) : await response.json();
            if (epoch !== generation) throw new Error('DISCONNECTED');
            return { value, etag: response.headers.get('etag') };
        } catch (error) {
            if (/^(HTTP_\d{3}|REAUTHORIZE|DISCONNECTED)$/.test(error.message)) throw error;
            throw new Error(controller.signal.aborted ? 'ABORTED_OUTCOME_UNKNOWN' : 'NETWORK_OR_CORS_OUTCOME_UNKNOWN');
        } finally { clearTimeout(timeout); pending.delete(controller); }
    }
    async function metadata(id, runId) {
        if (!/^[a-zA-Z0-9_-]{1,200}$/.test(id)) throw new Error('INVALID_FILE_ID');
        const result = await request(`/drive/v3/files/${id}?fields=${encodeURIComponent(fields)}`);
        assertOwned(result.value, runId); return result;
    }
    return {
        // Isolated integration capability; token remains in this closure and is never returned.
        integrationSession() {
            if (!token || now() >= expiresAt || !account) throw new Error('REAUTHORIZE');
            const epoch = generation, identity = account;
            return {
                async accountKey() {
                    if (epoch !== generation) throw new Error('DISCONNECTED');
                    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity));
                    if (epoch !== generation) throw new Error('DISCONNECTED');
                    return 'sha256:' + [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
                },
                assertCurrent() { if (epoch !== generation || !token || now() >= expiresAt) throw new Error('REAUTHORIZE'); },
                request(path, options = {}) {
                    if (epoch !== generation) throw new Error('DISCONNECTED');
                    // C has no capability to PATCH or delete any remote object.
                    if (options.method && options.method !== 'GET' && !(options.method === 'POST' && path.startsWith('/upload/drive/v3/files?'))) throw new Error('IMMUTABLE_ONLY');
                    return request(path, options);
                },
            };
        },
        snapshots: Object.fromEntries(['prepare', 'publish', 'verify', 'read', 'discover'].map(method => [method, (...args) => {
            const epoch = generation;
            return createSnapshotOperations((...requestArgs) => {
                if (epoch !== generation) throw new Error('DISCONNECTED');
                return request(...requestArgs);
            })[method](...args);
        }])),
        disconnect, abort,
        get connected() { return Boolean(token && now() < expiresAt && account); },
        get expiresAt() { return expiresAt; },
        async authorize(response) {
            disconnect();
            if (!response?.access_token || !Number.isFinite(Number(response.expires_in)) || Number(response.expires_in) <= 0 ||
                response.scope?.split(' ').filter(Boolean).length !== 1 || response.scope !== SCOPE) throw new Error('SCOPE_OR_TOKEN_REJECTED');
            token = response.access_token; expiresAt = now() + Number(response.expires_in) * 1000;
            try {
                const { value } = await request('/drive/v3/about?fields=user(permissionId)');
                if (!value.user?.permissionId) throw new Error('ACCOUNT_UNRESOLVED');
                account = value.user.permissionId;
                const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(account));
                return [...new Uint8Array(digest)].slice(0, 6).map(byte => byte.toString(16).padStart(2, '0')).join('');
            } catch (error) { disconnect(); throw error; }
        },
        async list(runId) {
            requireRun(runId); let pageToken = '', files = [];
            do {
                const params = new URLSearchParams({ spaces: 'appDataFolder', q: `appProperties has { key='purpose' and value='${PURPOSE}' } and appProperties has { key='runId' and value='${runId}' }`,
                    fields: `nextPageToken,files(${fields})`, pageSize: '100' });
                if (pageToken) params.set('pageToken', pageToken);
                const { value } = await request(`/drive/v3/files?${params}`);
                for (const file of value.files || []) { assertOwned(file, runId); files.push(file); }
                pageToken = value.nextPageToken || '';
                if (files.length > 1000) throw new Error('POC_LIST_LIMIT');
            } while (pageToken);
            return files;
        },
        async create(runId) {
            const data = synthetic(runId);
            const meta = { name: `easytimer-SYNC-001-POC-${runId}.json`, parents: ['appDataFolder'], appProperties: { purpose: PURPOSE, runId } };
            const boundary = `poc_${crypto.randomUUID()}`;
            const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(data)}\r\n--${boundary}--`;
            const result = await request(`/upload/drive/v3/files?uploadType=multipart&fields=${encodeURIComponent(fields)}`, {
                method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body });
            assertOwned(result.value, runId); return result.value;
        },
        async read(id, runId) {
            const before = await metadata(id, runId);
            const media = await request(`/drive/v3/files/${id}?alt=media`);
            validateSynthetic(media.value, runId);
            const after = await metadata(id, runId);
            if (before.value.version !== after.value.version) throw new Error('CHANGED_DURING_READ');
            return { fileId: id, runId, version: after.value.version, data: media.value,
                etag: before.etag, mediaEtag: media.etag };
        },
        async update(baseline, role, mode = 'conditional', validator = baseline?.etag) {
            if (!baseline) throw new Error('READ_FIRST');
            validateSynthetic(baseline.data, baseline.runId);
            if (!['conditional', 'unconditional-test', 'invalid-validator-test'].includes(mode)) throw new Error('INVALID_MODE');
            const owned = await metadata(baseline.fileId, baseline.runId);
            // A changed version deliberately does NOT replace the stale baseline in this experiment.
            evidence({ observedVersionChanged: owned.value.version !== baseline.version });
            const headers = { 'Content-Type': 'application/json' };
            if (mode !== 'unconditional-test') {
                const tag = mode === 'invalid-validator-test' ? `"poc-deliberately-invalid-${crypto.randomUUID()}"` : validator;
                if (typeof tag !== 'string' || !/^"[^"\r\n]+"$/.test(tag)) throw new Error('STRONG_ETAG_UNAVAILABLE');
                headers['If-Match'] = tag;
            }
            const data = synthetic(baseline.runId, baseline.data.revisionId, role);
            const result = await request(`/upload/drive/v3/files/${baseline.fileId}?uploadType=media&fields=${encodeURIComponent(fields)}`, { method: 'PATCH', headers, body: JSON.stringify(data) });
            assertOwned(result.value, baseline.runId);
            return { attemptedRevisionId: data.revisionId, mode };
        },
    };
}
