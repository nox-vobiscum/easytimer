// Development-only application adapter. No automatic production storage transition.
import { openLocalStore, DB_PREFIX } from '../local-store-poc/adapter.mjs';
import { strictLibrary, canonicalJSON, requireThat as check } from '../sync-core/canonical.mjs';
import { validateTicket } from '../sync-integration/store.mjs';
import { buildGraph } from '../sync-core/graph.mjs';
export const MARKER = 'easyTimerDevelopmentSyncStorage';
export const LEGACY = 'easyTimerTemplates';
export const DATABASE = DB_PREFIX + 'SYNC-003A-application';
const same = (a, b) => canonicalJSON(a) === canonicalJSON(b);
export async function openApplicationStorage({ storage, factory, fault = () => {} }) {
    const raw = await openLocalStore({ name: DATABASE, factory, fault, integration: { validateTicket } });
    const legacy = () => { try { return storage.getItem(LEGACY); } catch { throw Error('storageRead'); } };
    const guard = records => {
        check(records.bindings?.activated && storage.getItem(MARKER) === 'active', 'storageBlocked');
        check(legacy() === records.bindings.legacyRaw, 'legacyConflict');
    };
    const account = (records, key) => check(records.bindings.accountKey === key, 'accountMismatch');
    return {
        close: () => raw.close(),
        async read({ recovery = false } = {}) {
            const records = await raw.recover();
            if (!recovery) guard(records);
            return records;
        },
        async activate() {
            const original = legacy();
            let library;
            try { library = strictLibrary(original === null ? { schemaVersion: 1, templates: [] } : JSON.parse(original)); } catch { throw Error('invalidData'); }
            const libraryId = crypto.randomUUID();
            await raw.atomicUpdate(records => {
                check(legacy() === original, 'legacyConflict');
                if (records.library) {
                    check(records.bindings?.legacyRaw === original && same(records.library.library, library) && records.library.localRevision === 1, 'migrationBlocked');
                    return;
                }
                records.library = { libraryId, localRevision: 1, library };
                records.metadata = { syncDirty: true, dirtyRevision: 1, migration: null };
                records.bindings = { legacyRaw: original, activated: false, accountKey: null, base: null, history: [], files: {}, lastPublication: null };
            });
            fault('after-migration-copy');
            const copied = await raw.recover();
            check(same(copied.library.library, library) && copied.bindings.legacyRaw === original && legacy() === original, 'migrationBlocked');
            await raw.atomicUpdate(records => { check(legacy() === original, 'legacyConflict'); check(records.library.localRevision === 1 && same(records.library.library, library), 'conflict'); records.bindings.activated = true; });
            try { storage.setItem(MARKER, 'active'); } catch { throw Error('storageWrite'); }
            check(legacy() === original, 'legacyConflict'); return this.read();
        },
        async save(library, revision) {
            guard(await raw.recover());
            let result;
            try { result = await raw.save(library, revision); }
            catch (error) { throw Error(error.message === 'REVISION_CONFLICT' ? 'conflict' : error.message === 'CORRUPT_STATE' ? 'invalidData' : 'storageWrite'); }
            guard(await raw.recover()); return result;
        },
        async bind(key, authGuard) {
            await raw.atomicUpdate(records => { guard(records); authGuard(); if (records.bindings.accountKey) account(records, key); else records.bindings.accountKey = key; });
        },
        async prepare(ticket, authGuard) {
            const retained = structuredClone(ticket), snapshot = await validateTicket(retained);
            await raw.atomicUpdate(records => {
                guard(records); authGuard(); account(records, retained.accountKey);
                if (records.outbox) { check(same(records.outbox.ticket, retained), 'outboxFixed'); return; }
                check(records.library.localRevision === retained.localRevision && records.library.libraryId === retained.libraryId && same(records.library.library, snapshot.library), 'conflict');
                check(same(snapshot.parents, records.bindings.base ? [records.bindings.base] : []) && same(records.bindings.heads || [], snapshot.parents), 'reviewRequired');
                records.outbox = { ticket: retained, stage: 'prepared' };
            });
        },
        async verified(ticket, authGuard) {
            await raw.atomicUpdate(records => { guard(records); authGuard(); account(records, ticket.accountKey); check(records.outbox && same(records.outbox.ticket, ticket), 'outboxFixed'); records.outbox.stage = 'verified'; });
        },
        async observe(key, discovery, authGuard) {
            const retained = structuredClone(discovery), graph = await buildGraph(retained.nodes, { complete: true });
            check(graph.status === 'validated', 'reviewRequired');
            return raw.atomicUpdate(records => {
                guard(records); authGuard(); account(records, key);
                const b = records.bindings;
                for (const [id, digest] of Object.entries(b.files)) check(retained.files[id] === digest, 'historyIncomplete');
                for (const old of b.history) check(graph.get(old.snapshotId) && same(old, graph.get(old.snapshotId)), 'historyIncomplete');
                b.history = graph.list(); b.files = retained.files; b.heads = [...graph.heads];
                if (records.outbox?.stage === 'verified') {
                    const ticket = records.outbox.ticket;
                    check(retained.files[ticket.fileId] === ticket.snapshotHash, 'historyIncomplete');
                    b.base = ticket.snapshotHash; b.lastPublication = ticket; records.outbox = null;
                    if (graph.heads.length === 1 && graph.heads[0] === b.base && records.library.localRevision === ticket.localRevision) records.metadata.syncDirty = false;
                }
                return { heads: [...graph.heads], adopt: !records.library.library.templates.length && !b.base && !records.outbox && graph.heads.length === 1,
                    conflict: graph.heads.length > 1 || (graph.heads.length === 1 && b.base !== graph.heads[0] && Boolean(records.library.library.templates.length)) };
            });
        },
        async adopt(key, expectedRevision, authGuard, { fastForward = false } = {}) {
            const before = await this.read();
            const graph = await buildGraph(before.bindings.history, { complete: true });
            check(graph.status === 'validated' && graph.heads.length === 1, 'reviewRequired');
            const selected = graph.get(graph.heads[0]);
            if (fastForward) check(!before.metadata.syncDirty && before.bindings.base && graph.ancestors(selected.snapshotId).includes(before.bindings.base) && same(before.library.library, graph.get(before.bindings.base).library), 'reviewRequired');
            await raw.atomicUpdate(records => {
                guard(records); authGuard(); account(records, key);
                check(records.library.localRevision === expectedRevision && (fastForward ? !records.metadata.syncDirty : !records.library.library.templates.length) && !records.outbox && same(records.bindings, before.bindings), 'conflict');
                records.library = { libraryId: selected.libraryId, localRevision: expectedRevision + 1, library: selected.library };
                records.metadata = { syncDirty: false, dirtyRevision: expectedRevision + 1, migration: null };
                records.bindings.base = selected.snapshotId;
            });
        },
    };
}
