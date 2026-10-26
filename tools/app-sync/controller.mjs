import { createTemplateStore } from '../../src/js/templates.mjs';
import { openApplicationStorage, MARKER } from './storage.mjs';
import { createPocClient } from '../sync-poc/core.mjs';
import { applicationDrive } from './drive.mjs';
import { createSnapshot, canonicalJSON, PURPOSE, strictLibrary, requireThat as check } from '../sync-core/canonical.mjs';
import { buildGraph, analyzeReconciliation, createReconciliation } from '../sync-core/graph.mjs';
import { createDiagnosticReport } from './diagnostics.mjs';
export function createApplicationSync({ storage, factory, fetchImpl, fault, changed = () => {} }) {
    const client = createPocClient({ ...(fetchImpl ? { fetchImpl } : {}) });
    let database, opening, transport = null, busy = false, error = '', adoption = false, review = null, preview = null;
    const active = () => { try { return storage.getItem(MARKER) === 'active'; } catch { return false; } };
    const db = async () => database || (opening ||= openApplicationStorage({ storage, factory, fault }).then(value => database = value));
    const notify = () => changed();
    const run = async fn => {
        check(!busy, 'busy'); busy = true; error = ''; notify();
        try { return await fn(); }
        catch (e) { error = e.message; throw e; }
        finally { busy = false; notify(); }
    };
    const reconcilePublication = async (store, key, guard, loseAcknowledgement) => {
        let records = await store.read(); const intent = records.bindings.reconciliation;
        check(intent && records.outbox && canonicalJSON(intent.ticket) === canonicalJSON(records.outbox.ticket), 'outboxFixed');
        const ticket = intent.ticket;
        const recovered = await transport.recover(ticket);
        if (!recovered) {
            const discovery = await transport.discover(); await store.observe(key, discovery, guard);
            records = await store.read();
            check(canonicalJSON(records.bindings.heads) === canonicalJSON(ticket.parents), 'staleReview');
            check(records.library.localRevision === intent.anchor.revision && canonicalJSON(records.library.library) === canonicalJSON(intent.anchor.library), 'unpublishedChanges');
            await transport.publish(ticket);
        }
        if (loseAcknowledgement) throw Error('SIMULATED_LOST_ACK');
        await store.verified(ticket, guard);
        const discovery = await transport.discover(), result = await store.observe(key, discovery, guard);
        check(!result.conflict, 'reviewRequired'); review = null; preview = null; return 'lastChecked';
    };
    return {
        client, active, get busy() { return busy; }, get adoptionAvailable() { return adoption; },
        async diagnosticReport() {
            let records = null, readState = 'no-existing-connection';
            let activated = null;
            try { activated = storage.getItem(MARKER) === 'active'; } catch { /* Unknown, never infer inactive from blocked access. */ }
            if (database) {
                try { records = await database.readDiagnosticRecords(); readState = 'read'; }
                catch { readState = 'read-unavailable'; }
            }
            return createDiagnosticReport(records, { readState, activated, connected: client.connected, busy, error, adoption,
                review, preview });
        },
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
        disconnect() { client.disconnect(); transport = null; adoption = false; error = ''; review = null; preview = null; notify(); },
        async reviewConflict() {
            return run(async () => {
                check(client.connected && transport, 'REAUTHORIZE');
                const session = transport.session, key = await session.accountKey(), guard = () => session.assertCurrent(), store = await db();
                await store.bind(key, guard);
                check(!(await store.read()).outbox, 'pendingUpload');
                await store.observe(key, await transport.discover(), guard);
                const records = await store.read(), graph = await buildGraph(records.bindings.history, { complete: true });
                check(graph.status === 'validated' && graph.heads.length === 2, 'unsupportedConflict');
                const analysis = analyzeReconciliation(graph, ...graph.heads);
                const supported = analysis.status === 'proposed' ? analysis.proposal.conflicts.length === 0 :
                    analysis.status === 'conflict' && analysis.proposal.conflicts.every(c => c.conflict === 'concurrent-content' && c.left.kind === 'live' && c.right.kind === 'live');
                check(supported, 'unsupportedConflict');
                check(graph.heads.includes(records.bindings.base) && canonicalJSON(records.library.library) === canonicalJSON(graph.get(records.bindings.base).library), 'unpublishedChanges');
                review = { id: crypto.randomUUID(), accountKey: key, anchor: { revision: records.library.localRevision, library: records.library.library, base: records.bindings.base }, analysis, history: graph.list() };
                preview = null; return structuredClone(review);
            });
        },
        async previewResolution(id, choices) {
            return run(async () => {
                check(review?.id === id && client.connected && transport, 'staleReview');
                check(await transport.session.accountKey() === review.accountKey, 'accountMismatch');
                const graph = await buildGraph(review.history, { complete: true });
                const snapshot = await createReconciliation(graph, review.analysis.leftId, review.analysis.rightId, { operationId: crypto.randomUUID(), choices, numberedCopies: true });
                check((await buildGraph([...graph.list(), snapshot], { complete: true })).status === 'validated', 'reviewRequired');
                preview = { id: crypto.randomUUID(), reviewId: id, snapshot };
                return structuredClone(preview);
            });
        },
        async confirmResolution(id, { loseAcknowledgement = false } = {}) {
            return run(async () => {
                check(preview?.id === id && review?.id === preview.reviewId && transport && client.connected, 'staleReview');
                const session = transport.session, key = await session.accountKey(), guard = () => session.assertCurrent(), store = await db();
                check(key === review.accountKey, 'accountMismatch');
                check(!(await store.read()).outbox, 'pendingUpload');
                await store.observe(key, await transport.discover(), guard);
                const records = await store.read(), snapshot = preview.snapshot;
                check(canonicalJSON(records.bindings.heads) === canonicalJSON(snapshot.parents) && records.library.localRevision === review.anchor.revision && canonicalJSON(records.library.library) === canonicalJSON(review.anchor.library), 'staleReview');
                const ticket = { accountKey: key, operationId: snapshot.operationId, fileId: await transport.generateId(), libraryId: snapshot.libraryId,
                    localRevision: records.library.localRevision, parents: snapshot.parents, snapshotHash: snapshot.snapshotId, snapshotBytes: canonicalJSON(snapshot) };
                await store.prepareResolution(ticket, review.anchor, guard);
                return reconcilePublication(store, key, guard, loseAcknowledgement);
            });
        },
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
            if (error) return ['legacyConflict', 'migrationBlocked'].includes(error) ? 'legacyConflict' : error === 'accountMismatch' ? 'accountMismatch' : ['REAUTHORIZE', 'DISCONNECTED'].includes(error) ? 'reconnect' : ['reviewRequired', 'LIBRARY_MISMATCH', 'HISTORY_BLOCKED', 'staleReview', 'unpublishedChanges', 'unsupportedConflict', 'pendingUpload'].includes(error) ? error === 'reviewRequired' ? 'reviewRequired' : error : 'syncError';
            if (!active()) return 'localOnly';
            try {
                const records = await (await db()).read();
                if (!client.connected) return records.bindings.accountKey ? 'reconnect' : 'localOnly';
                if (records.bindings.reconciliation) return 'reviewRequired';
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
                if (records.bindings.reconciliation) return reconcilePublication(store, key, guard, loseAcknowledgement);
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
                const branching = result.conflict && records.metadata.syncDirty && records.bindings.base && result.heads.length === 1;
                check(!result.conflict || branching, 'reviewRequired');
                if (!records.metadata.syncDirty) return 'lastChecked';
                const b = records.bindings, graph = await buildGraph(b.history, { complete: true });
                check(graph.status === 'validated' && graph.heads.length <= 1 && (branching ? graph.ancestors(graph.heads[0]).includes(b.base) : canonicalJSON([...graph.heads]) === canonicalJSON(b.base ? [b.base] : [])), 'reviewRequired');
                const parent = b.base ? graph.get(b.base) : null, live = new Set(records.library.library.templates.map(t => t.id));
                check(!parent?.deletedRundownIds.some(id => live.has(id)), 'reviewRequired');
                const deletedRundownIds = [...new Set([...(parent?.deletedRundownIds || []), ...(parent?.library.templates || []).filter(t => !live.has(t.id)).map(t => t.id)])];
                const snapshot = await createSnapshot({ purpose: PURPOSE, syncFormatVersion: 1, libraryId: records.library.libraryId, operationId: crypto.randomUUID(),
                    parents: parent ? [parent.snapshotId] : [], library: records.library.library, deletedRundownIds, restoredRundownIds: [], resolution: null });
                check((await buildGraph([...graph.list(), snapshot], { complete: true })).status === 'validated', 'reviewRequired');
                const ticket = { accountKey: key, operationId: snapshot.operationId, fileId: await transport.generateId(), libraryId: snapshot.libraryId,
                    localRevision: records.library.localRevision, parents: snapshot.parents, snapshotHash: snapshot.snapshotId, snapshotBytes: canonicalJSON(snapshot) };
                if (branching) await store.prepareBranch(ticket, result.heads, guard); else await store.prepare(ticket, guard);
                await transport.publish(ticket);
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
