import { createTemplateStore } from '../../src/js/templates.mjs';
import { openApplicationStorage, MARKER } from './storage.mjs';
import { createPocClient } from '../sync-poc/core.mjs';
import { applicationDrive } from './drive.mjs';
import { createSnapshot, canonicalJSON, PURPOSE, strictLibrary, requireThat as check } from '../sync-core/canonical.mjs';
import { buildGraph } from '../sync-core/graph.mjs';
export function createApplicationSync({ storage, factory, fetchImpl, fault, changed = () => {} }) {
    const client = createPocClient({ ...(fetchImpl ? { fetchImpl } : {}) });
    let database, opening, transport = null, busy = false, error = '', adoption = false;
    const active = () => { try { return storage.getItem(MARKER) === 'active'; } catch { return false; } };
    const db = async () => database || (opening ||= openApplicationStorage({ storage, factory, fault }).then(value => database = value));
    const notify = () => changed();
    const run = async fn => {
        check(!busy, 'busy'); busy = true; error = ''; notify();
        try { return await fn(); }
        catch (e) { error = e.message; throw e; }
        finally { busy = false; notify(); }
    };
    return {
        client, active, get busy() { return busy; }, get adoptionAvailable() { return adoption; },
        async activate() { return run(async () => { await (await db()).activate(); }); },
        async authorize(response) {
            return run(async () => {
                transport = null;
                try {
                    check(active(), 'storageBlocked'); await client.authorize(response);
                    const session = client.integrationSession();
                    await (await db()).bind(await session.accountKey(), () => session.assertCurrent());
                    transport = applicationDrive(session);
                } catch (e) { client.disconnect(); throw e; }
            });
        },
        disconnect() { client.disconnect(); transport = null; adoption = false; error = ''; notify(); },
        createStore() {
            const local = createTemplateStore(() => storage); let revision;
            return {
                load() {
                    if (!active()) return local.load();
                    return db().then(value => value.read()).then(records => { revision = records.library.localRevision; return structuredClone(records.library.library); });
                },
                save(library) {
                    if (!active()) return local.save(library);
                    return db().then(value => { check(Number.isSafeInteger(revision), 'storageBlocked'); return value.save(library, revision); })
                        .then(saved => { revision = saved.localRevision; error = ''; notify(); return structuredClone(saved.library); })
                        .catch(e => { error = e.message; notify(); throw e; });
                },
            };
        },
        async status() {
            if (busy) return 'busy';
            if (error) return ['legacyConflict', 'migrationBlocked'].includes(error) ? 'legacyConflict' : error === 'accountMismatch' ? 'accountMismatch' : ['REAUTHORIZE', 'DISCONNECTED'].includes(error) ? 'reconnect' : ['reviewRequired', 'LIBRARY_MISMATCH', 'HISTORY_BLOCKED'].includes(error) ? 'reviewRequired' : 'syncError';
            if (!active()) return 'localOnly';
            try {
                const records = await (await db()).read();
                if (!client.connected) return records.bindings.accountKey ? 'reconnect' : 'localOnly';
                if (adoption) return 'adoptAvailable';
                if (records.bindings.heads?.length > 1) return 'reviewRequired';
                return records.metadata.syncDirty || records.outbox ? 'pending' : records.bindings.base && records.bindings.heads?.[0] === records.bindings.base ? 'lastChecked' : 'pending';
            } catch (e) { return e.message === 'legacyConflict' ? 'legacyConflict' : 'syncError'; }
        },
        async sync({ adopt = false, loseAcknowledgement = false } = {}) {
            return run(async () => {
                check(client.connected && transport, 'REAUTHORIZE');
                const store = await db(), session = transport.session, guard = () => session.assertCurrent(), key = await session.accountKey();
                await store.bind(key, guard);
                let records = await store.read();
                // Recover the existing fixed operation before interpreting new work.
                if (records.outbox) {
                    const ticket = records.outbox.ticket;
                    await transport.publish(ticket); if (loseAcknowledgement) throw Error('SIMULATED_LOST_ACK');
                    await store.verified(ticket, guard);
                }
                let discovery = await transport.discover();
                let result = await store.observe(key, discovery, guard); adoption = result.adopt;
                if (adoption) {
                    if (!adopt) return 'adoptAvailable';
                    records = await store.read(); await store.adopt(key, records.library.localRevision, guard); adoption = false; return 'lastChecked';
                }
                records = await store.read();
                if (result.conflict && !records.metadata.syncDirty && records.bindings.base && result.heads.length === 1) {
                    await store.adopt(key, records.library.localRevision, guard, { fastForward: true }); return 'lastChecked';
                }
                check(!result.conflict, 'reviewRequired');
                if (!records.metadata.syncDirty) return 'lastChecked';
                const b = records.bindings, graph = await buildGraph(b.history, { complete: true });
                check(graph.status === 'validated' && graph.heads.length <= 1 && canonicalJSON([...graph.heads]) === canonicalJSON(b.base ? [b.base] : []), 'reviewRequired');
                const parent = b.base ? graph.get(b.base) : null, live = new Set(records.library.library.templates.map(t => t.id));
                check(!parent?.deletedRundownIds.some(id => live.has(id)), 'reviewRequired');
                const deletedRundownIds = [...new Set([...(parent?.deletedRundownIds || []), ...(parent?.library.templates || []).filter(t => !live.has(t.id)).map(t => t.id)])];
                const snapshot = await createSnapshot({ purpose: PURPOSE, syncFormatVersion: 1, libraryId: records.library.libraryId, operationId: crypto.randomUUID(),
                    parents: parent ? [parent.snapshotId] : [], library: records.library.library, deletedRundownIds, restoredRundownIds: [], resolution: null });
                check((await buildGraph([...graph.list(), snapshot], { complete: true })).status === 'validated', 'reviewRequired');
                const ticket = { accountKey: key, operationId: snapshot.operationId, fileId: await transport.generateId(), libraryId: snapshot.libraryId,
                    localRevision: records.library.localRevision, parents: snapshot.parents, snapshotHash: snapshot.snapshotId, snapshotBytes: canonicalJSON(snapshot) };
                await store.prepare(ticket, guard); await transport.publish(ticket);
                if (loseAcknowledgement) throw Error('SIMULATED_LOST_ACK');
                await store.verified(ticket, guard);
                discovery = await transport.discover(); result = await store.observe(key, discovery, guard);
                check(!result.conflict, 'reviewRequired');
                const after = await store.read(); return after.metadata.syncDirty || after.outbox ? 'pending' : 'lastChecked';
            });
        },
        async backup() { const records = await (await db()).read({ recovery: true }); check(records.library, 'storageBlocked'); return structuredClone(records.library.library); },
        legacyBackup() { const raw = storage.getItem('easyTimerTemplates'); check(raw !== null, 'storageBlocked'); return strictLibrary(JSON.parse(raw)); },
        close() { client.disconnect(); database?.close(); },
    };
}
