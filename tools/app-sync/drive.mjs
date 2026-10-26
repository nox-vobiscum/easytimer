// Append-only application-development transport. Deliberately separate from synthetic C markers.
import { parseCanonicalSnapshot, requireThat as check } from '../sync-core/canonical.mjs';
export const PURPOSE = 'easytimer-development-application-sync-v1';
const fields = 'id,name,spaces,appProperties';
const fileId = id => check(typeof id === 'string' && /^[a-zA-Z0-9_-]{1,200}$/.test(id), 'INVALID_FILE_ID');
export function applicationDrive(session) {
    const request = session.request.bind(session);
    async function read(id) {
        fileId(id); const { value: meta } = await request(`/drive/v3/files/${id}?fields=${encodeURIComponent(fields)}`);
        check(meta.id === id && meta.spaces?.includes('appDataFolder') && meta.appProperties?.purpose === PURPOSE, 'FOREIGN_FILE');
        const { value: bytes } = await request(`/drive/v3/files/${id}?alt=media`, { raw: true });
        check(bytes.byteLength <= 10 * 1024 * 1024, 'SNAPSHOT_SIZE');
        const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes), snapshot = await parseCanonicalSnapshot(text);
        check(snapshot.libraryId === meta.appProperties.libraryId && snapshot.operationId === meta.appProperties.operationId && snapshot.snapshotId === meta.appProperties.snapshotId, 'REMOTE_IDENTITY_MISMATCH');
        return { snapshot, text };
    }
    return {
        session,
        async recover(ticket) {
            check(await session.accountKey() === ticket.accountKey, 'accountMismatch');
            try { const result = await read(ticket.fileId); check(result.text === ticket.snapshotBytes, 'READBACK_MISMATCH'); return result.snapshot; }
            catch (e) { if (e.message === 'HTTP_404') return null; throw e; }
        },
        async generateId() { const { value } = await request('/drive/v3/files/generateIds?space=appDataFolder&type=files&count=1'); check(value.ids?.length === 1, 'GENERATED_ID_INVALID'); fileId(value.ids[0]); return value.ids[0]; },
        async discover() {
            const files = new Map(), tokens = new Set(); let page = '';
            do {
                check(tokens.size < 200, 'LIST_LIMIT');
                const params = new URLSearchParams({ spaces: 'appDataFolder', q: `trashed = false and appProperties has { key='purpose' and value='${PURPOSE}' }`, fields: `nextPageToken,incompleteSearch,files(${fields})`, pageSize: '100' });
                if (page) params.set('pageToken', page);
                const { value } = await request('/drive/v3/files?' + params);
                check(!value.incompleteSearch && Array.isArray(value.files), 'historyIncomplete');
                for (const f of value.files) { fileId(f.id); check(!files.has(f.id) || JSON.stringify(files.get(f.id)) === JSON.stringify(f), 'FILE_COLLISION'); files.set(f.id, f); }
                check(files.size <= 200, 'LIST_LIMIT'); page = value.nextPageToken || ''; check(typeof page === 'string' && (!page || !tokens.has(page)), 'historyIncomplete'); tokens.add(page);
            } while (page);
            const nodes = [], identities = [];
            for (const file of files.values()) { const { snapshot } = await read(file.id); check(snapshot.snapshotId === file.appProperties.snapshotId, 'CHANGED_DURING_DISCOVERY'); nodes.push(snapshot); identities.push([file.id, snapshot.snapshotId]); }
            return { nodes, files: Object.fromEntries(identities) };
        },
        async publish(ticket) {
            check(await session.accountKey() === ticket.accountKey, 'accountMismatch');
            const verify = async () => { const result = await read(ticket.fileId); check(result.text === ticket.snapshotBytes, 'READBACK_MISMATCH'); return result.snapshot; };
            try { return await verify(); } catch (e) { if (e.message !== 'HTTP_404') throw e; }
            const boundary = 'application_' + crypto.randomUUID();
            const meta = { id: ticket.fileId, name: `easytimer-${ticket.libraryId}-${ticket.operationId}.json`, parents: ['appDataFolder'],
                appProperties: { purpose: PURPOSE, libraryId: ticket.libraryId, operationId: ticket.operationId, snapshotId: ticket.snapshotHash } };
            const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${ticket.snapshotBytes}\r\n--${boundary}--`;
            try { await request('/upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'POST', body, headers: { 'Content-Type': `multipart/related; boundary=${boundary}` } }); }
            catch (e) { if (!['HTTP_409', 'NETWORK_OR_CORS_OUTCOME_UNKNOWN', 'ABORTED_OUTCOME_UNKNOWN'].includes(e.message)) throw e; }
            return verify();
        },
    };
}
