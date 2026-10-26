import { parseCanonicalSnapshot, canonicalJSON, requireThat as check } from '../sync-core/canonical.mjs';
import { UUID, validateTicket } from './store.mjs';
export const MARKER = 'easytimer-sync-002c-synthetic-v1';
const fields = 'id,name,spaces,appProperties';
const validFileId = id => check(typeof id === 'string' && /^[a-zA-Z0-9_-]{1,200}$/.test(id), 'INVALID_FILE_ID');
export function createTransport(session, runId) {
    check(UUID.test(runId), 'SYNTHETIC_NAMESPACE_REQUIRED');
    const request = session.request.bind(session);
    function owned(file) {
        validFileId(file?.id);
        check(file.spaces?.includes('appDataFolder') && file.appProperties?.purpose === MARKER && file.appProperties.runId === runId &&
            file.name === `easytimer-SYNC-002C-${runId}-${file.appProperties.operationId}.json`, 'NOT_OUR_SYNTHETIC_FILE');
    }
    async function read(fileId) {
        validFileId(fileId);
        const { value: meta } = await request(`/drive/v3/files/${fileId}?fields=${encodeURIComponent(fields)}`);
        owned(meta); check(meta.id === fileId, 'FILE_ID_MISMATCH');
        const { value: bytes } = await request(`/drive/v3/files/${fileId}?alt=media`, { raw: true });
        check(bytes instanceof Uint8Array && bytes.length <= 10 * 1024 * 1024, 'SNAPSHOT_SIZE');
        const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
        const snapshot = await parseCanonicalSnapshot(text);
        check(snapshot.libraryId === runId && snapshot.snapshotId === meta.appProperties.snapshotId && snapshot.operationId === meta.appProperties.operationId, 'REMOTE_IDENTITY_MISMATCH');
        return { snapshot, text, fileId };
    }
    return {
        session,
        async generateId() {
            const { value } = await request('/drive/v3/files/generateIds?space=appDataFolder&type=files&count=1');
            check(value.ids?.length === 1, 'GENERATED_ID_INVALID'); validFileId(value.ids[0]); return value.ids[0];
        },
        read,
        async verify(ticket) {
            ticket = structuredClone(ticket);
            await validateTicket(ticket);
            check(ticket.libraryId === runId && await session.accountKey() === ticket.accountKey, 'ACCOUNT_MISMATCH');
            const result = await read(ticket.fileId);
            check(result.text === ticket.snapshotBytes, 'READBACK_MISMATCH'); return result.snapshot;
        },
        async publish(ticket, { loseAcknowledgement = false, repeatCreate = false } = {}) {
            ticket = structuredClone(ticket);
            await validateTicket(ticket);
            check(ticket.libraryId === runId && await session.accountKey() === ticket.accountKey, 'ACCOUNT_MISMATCH');
            // First recover a previous successful create, without issuing another POST.
            if (repeatCreate) await this.verify(ticket); // Owner-operated 409 probe, only for an already verified disposable file.
            else try { return await this.verify(ticket); } catch (error) { if (error.message !== 'HTTP_404') throw error; }
            const boundary = 'sync_c_' + crypto.randomUUID();
            const metadata = { id: ticket.fileId, name: `easytimer-SYNC-002C-${runId}-${ticket.operationId}.json`, parents: ['appDataFolder'],
                appProperties: { purpose: MARKER, runId, operationId: ticket.operationId, snapshotId: ticket.snapshotHash } };
            const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${ticket.snapshotBytes}\r\n--${boundary}--`;
            let outcome;
            try {
                await request('/upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'POST', body, headers: { 'Content-Type': `multipart/related; boundary=${boundary}` } });
                outcome = 'created';
            } catch (error) {
                if (!['HTTP_409', 'ABORTED_OUTCOME_UNKNOWN', 'NETWORK_OR_CORS_OUTCOME_UNKNOWN'].includes(error.message)) throw error;
                outcome = error.message;
            }
            if (loseAcknowledgement) throw new Error('SIMULATED_LOST_ACK');
            try { return await this.verify(ticket); }
            catch (error) { if (error.message === 'HTTP_404') throw new Error('PUBLICATION_UNCONFIRMED_' + outcome); throw error; }
        },
        async discover() {
            const files = new Map(), tokens = new Set(); let pageToken = '';
            do {
                check(tokens.size < 200, 'POC_LIST_LIMIT');
                const query = new URLSearchParams({ spaces: 'appDataFolder', q: `trashed = false and appProperties has { key='purpose' and value='${MARKER}' } and appProperties has { key='runId' and value='${runId}' }`,
                    fields: `nextPageToken,incompleteSearch,files(${fields})`, pageSize: '100' });
                if (pageToken) query.set('pageToken', pageToken);
                const { value } = await request('/drive/v3/files?' + query);
                check(value.incompleteSearch !== true && Array.isArray(value.files), 'INCOMPLETE_DISCOVERY');
                for (const file of value.files) {
                    owned(file);
                    if (files.has(file.id)) check(canonicalJSON(files.get(file.id)) === canonicalJSON(file), 'FILE_COLLISION');
                    files.set(file.id, file);
                }
                check(files.size <= 200, 'POC_LIST_LIMIT');
                check(value.nextPageToken === undefined || typeof value.nextPageToken === 'string', 'INVALID_PAGE_TOKEN');
                pageToken = value.nextPageToken || '';
                check(!pageToken || !tokens.has(pageToken), 'REPEATED_PAGE_TOKEN'); tokens.add(pageToken);
            } while (pageToken);
            const nodes = [], identity = new Map();
            for (const file of files.values()) {
                const result = await read(file.id);
                check(result.snapshot.snapshotId === file.appProperties.snapshotId, 'CHANGED_DURING_DISCOVERY');
                nodes.push(result.snapshot); identity.set(file.id, result.snapshot.snapshotId);
            }
            return { nodes, files: Object.fromEntries(identity) };
        },
    };
}
