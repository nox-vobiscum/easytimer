import { openLocalStore, DB_PREFIX } from '../local-store-poc/adapter.mjs';
import { canonicalJSON, exactKeys, HASH, parseCanonicalSnapshot, requireThat as check } from '../sync-core/canonical.mjs';
import { buildGraph } from '../sync-core/graph.mjs';

export const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const same = (a, b) => canonicalJSON(a) === canonicalJSON(b);
export async function validateTicket(ticket) {
    exactKeys(ticket, ['operationId', 'fileId', 'libraryId', 'localRevision', 'parents', 'snapshotBytes', 'snapshotHash', 'accountKey']);
    check(UUID.test(ticket.operationId) && UUID.test(ticket.libraryId) && /^[a-zA-Z0-9_-]{1,200}$/.test(ticket.fileId), 'INVALID_TICKET');
    check(HASH.test(ticket.accountKey) && Number.isSafeInteger(ticket.localRevision) && ticket.localRevision > 0, 'INVALID_TICKET');
    const snapshot = await parseCanonicalSnapshot(ticket.snapshotBytes);
    check(snapshot.snapshotId === ticket.snapshotHash && snapshot.operationId === ticket.operationId && snapshot.libraryId === ticket.libraryId && same(snapshot.parents, ticket.parents), 'INVALID_TICKET');
    return snapshot;
}
export async function openIntegrationStore({ runId, clientId, fault, factory } = {}) {
    check(UUID.test(runId) && /^[a-zA-Z0-9_-]{1,40}$/.test(clientId), 'SYNTHETIC_NAMESPACE_REQUIRED');
    const raw = await openLocalStore({ name: DB_PREFIX + 'C-' + runId + '-' + clientId, fault, factory,
        integration: { libraryId: runId, validateTicket } });
    const assertBinding = (records, accountKey) => {
        check(records.bindings?.accountKey === accountKey && records.bindings?.runId === runId, 'ACCOUNT_MISMATCH');
    };
    return {
        close: () => raw.close(),
        async read() {
            const records = await raw.recover();
            if (records.library) check(records.library.libraryId === runId, 'LIBRARY_MISMATCH');
            if (records.bindings) {
                exactKeys(records.bindings, ['accountKey', 'runId', 'history', 'files', 'base', 'lastPublication', 'observation']);
                assertBinding(records, records.bindings.accountKey);
                check(HASH.test(records.bindings.accountKey), 'INVALID_ACCOUNT');
                await buildGraph(records.bindings.history, { complete: true });
            }
            if (records.outbox) check(records.outbox.ticket.accountKey === records.bindings?.accountKey, 'ACCOUNT_MISMATCH');
            return records;
        },
        save: (library, revision) => raw.save(library, revision),
        async bind(accountKey, guard = () => {}) {
            check(HASH.test(accountKey), 'INVALID_ACCOUNT');
            return raw.atomicUpdate(records => {
                guard();
                if (records.bindings) assertBinding(records, accountKey);
                else records.bindings = { accountKey, runId, history: [], files: {}, base: null, lastPublication: null, observation: null };
            });
        },
        async prepare(ticket, guard = () => {}) {
            const retained = structuredClone(ticket), snapshot = await validateTicket(retained);
            return raw.atomicUpdate(records => {
                guard(); assertBinding(records, retained.accountKey);
                if (records.outbox) { check(same(records.outbox.ticket, retained), 'OUTBOX_FIXED'); return records.outbox; }
                check(records.library?.localRevision === retained.localRevision && same(records.library.library, snapshot.library), 'REVISION_CONFLICT');
                check(records.library.libraryId === snapshot.libraryId && records.metadata.syncDirty, 'REVISION_CONFLICT');
                check(same(snapshot.parents, records.bindings.base ? [records.bindings.base] : []), 'BASE_CHANGED');
                const observation = records.bindings.observation;
                check(observation?.status === 'checked' && same(observation.heads, snapshot.parents), 'DISCOVER_FIRST_OR_CONFLICT');
                records.outbox = { ticket: retained, stage: 'prepared' }; return records.outbox;
            });
        },
        async verified(ticket, snapshot, guard = () => {}) {
            const retained = structuredClone(ticket), validated = await validateTicket(retained);
            check(same(validated, snapshot), 'READBACK_MISMATCH');
            return raw.atomicUpdate(records => {
                guard(); assertBinding(records, retained.accountKey);
                check(records.outbox && same(records.outbox.ticket, retained), 'OUTBOX_FIXED');
                records.outbox.stage = 'verified';
                // Dirty is cleared only by subsequent complete, non-divergent discovery.
            });
        },
        async observe(accountKey, discovery, guard = () => {}) {
            const retained = structuredClone(discovery);
            const graph = await buildGraph(retained.nodes, { complete: true });
            check(graph.status === 'validated', 'HISTORY_BLOCKED');
            return raw.atomicUpdate(records => {
                guard(); assertBinding(records, accountKey);
                const binding = records.bindings;
                // Previously known files may not disappear, even if Drive returned a terminal page.
                for (const [id, hash] of Object.entries(binding.files)) check(retained.files[id] === hash, 'KNOWN_FILE_MISSING');
                for (const old of binding.history) check(graph.get(old.snapshotId) && same(graph.get(old.snapshotId), old), 'KNOWN_HISTORY_MISSING');
                binding.history = graph.list(); binding.files = retained.files;
                binding.observation = { status: 'checked', heads: [...graph.heads] };
                const entry = records.outbox;
                if (entry?.stage === 'verified') {
                    check(retained.files[entry.ticket.fileId] === entry.ticket.snapshotHash, 'PUBLISHED_FILE_MISSING');
                    binding.base = entry.ticket.snapshotHash;
                    binding.lastPublication = entry.ticket;
                    records.outbox = null;
                    if (graph.heads.length === 1 && graph.heads[0] === binding.base && records.library.localRevision === entry.ticket.localRevision) records.metadata.syncDirty = false;
                }
                const remoteChanged = records.library && !same([...graph.heads], binding.base ? [binding.base] : []);
                return { heads: [...graph.heads], status: graph.divergent ? 'conflict' : !records.library ? (graph.heads.length ? 'remote-library-available' : 'empty') : remoteChanged ? 'remote-review-required' : records.metadata?.syncDirty ? 'pending' : 'last-checked' };
            });
        },
        async adopt(accountKey, guard = () => {}) {
            const before = await this.read();
            check(!before.library && !before.outbox && before.bindings?.observation?.heads.length === 1, 'ADOPT_EMPTY_ONLY');
            const graph = await buildGraph(before.bindings.history, { complete: true });
            const snapshot = graph.get(graph.heads[0]);
            return raw.atomicUpdate(records => {
                guard(); assertBinding(records, accountKey);
                check(!records.library && !records.outbox && same(records.bindings, before.bindings), 'REVISION_CONFLICT');
                records.library = { libraryId: runId, localRevision: 1, library: snapshot.library };
                records.metadata = { syncDirty: false, dirtyRevision: 1, migration: null };
                records.bindings.base = snapshot.snapshotId;
            });
        },
    };
}
