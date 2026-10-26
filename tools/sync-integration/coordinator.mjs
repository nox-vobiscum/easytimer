import { createSnapshot, canonicalJSON, PURPOSE, requireThat as check } from '../sync-core/canonical.mjs';
import { buildGraph, analyzeReconciliation } from '../sync-core/graph.mjs';
export function syntheticLibrary(name = 'Synthetic workshop A') {
    return { schemaVersion: 1, templates: [{ id: 'synthetic-rundown', name, transitionMode: 'manual', phases: [
        { id: 'synthetic-phase', title: 'Disposable test phase', durationSeconds: 600 },
    ] }] };
}
export function createCoordinator(store, transport) {
    const session = transport.session;
    const guard = () => session.assertCurrent();
    async function bound() { const account = await session.accountKey(); await store.bind(account, guard); return account; }
    return {
        async discover() {
            const account = await bound(), discovery = await transport.discover();
            return store.observe(account, discovery, guard);
        },
        async adopt() { return store.adopt(await bound(), guard); },
        async prepare() {
            const accountKey = await bound(), state = await store.read();
            if (state.outbox) return state.outbox.ticket;
            check(state.library && state.metadata.syncDirty, 'NO_DIRTY_LIBRARY');
            const binding = state.bindings;
            check(binding.observation?.status === 'checked' && binding.observation.heads.length <= 1 &&
                canonicalJSON(binding.observation.heads) === canonicalJSON(binding.base ? [binding.base] : []), 'DISCOVER_FIRST_OR_CONFLICT');
            const graph = await buildGraph(binding.history, { complete: true });
            check(graph.status === 'validated', 'HISTORY_BLOCKED');
            const parent = binding.base ? graph.get(binding.base) : null;
            const live = new Set(state.library.library.templates.map(t => t.id));
            check(!parent?.deletedRundownIds.some(id => live.has(id)), 'RESTORATION_REQUIRES_REVIEW');
            const deletedRundownIds = [...new Set([...(parent?.deletedRundownIds || []), ...(parent?.library.templates || []).filter(t => !live.has(t.id)).map(t => t.id)])];
            const snapshot = await createSnapshot({ purpose: PURPOSE, syncFormatVersion: 1, libraryId: state.library.libraryId,
                operationId: crypto.randomUUID(), parents: parent ? [parent.snapshotId] : [], library: state.library.library,
                deletedRundownIds, restoredRundownIds: [], resolution: null });
            const candidate = await buildGraph([...graph.list(), snapshot], { complete: true });
            check(candidate.status === 'validated', 'HISTORY_BLOCKED');
            const ticket = { operationId: snapshot.operationId, fileId: await transport.generateId(), libraryId: snapshot.libraryId,
                localRevision: state.library.localRevision, parents: snapshot.parents, snapshotBytes: canonicalJSON(snapshot), snapshotHash: snapshot.snapshotId, accountKey };
            await store.prepare(ticket, guard); return ticket;
        },
        async publish(options) {
            await bound(); const state = await store.read();
            check(state.outbox, 'PREPARE_FIRST');
            const ticket = state.outbox.ticket, snapshot = await transport.publish(ticket, options);
            await store.verified(ticket, snapshot, guard); return { stage: 'upload-verified', snapshotId: snapshot.snapshotId };
        },
        async inspectConflicts() {
            const state = await store.read(), graph = await buildGraph(state.bindings?.history || [], { complete: true });
            return graph.heads.length === 2 ? analyzeReconciliation(graph, ...graph.heads) : { status: graph.heads.length > 1 ? 'blocked' : 'none', reason: 'NO_AUTOMATIC_RECONCILIATION' };
        },
    };
}
