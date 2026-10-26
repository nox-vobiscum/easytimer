// Pure, allowlisted projection. Never opens storage or imports a network capability.
import { canonicalJSON, HASH } from '../sync-core/canonical.mjs';
import { buildGraph, analyzeReconciliation } from '../sync-core/graph.mjs';

const reasons = new Set(`busy legacyConflict migrationBlocked accountMismatch REAUTHORIZE DISCONNECTED reviewRequired staleReview unpublishedChanges unsupportedConflict pendingUpload outboxFixed historyIncomplete storageBlocked storageRead storageWrite conflict invalidData LIBRARY_MISMATCH HISTORY_BLOCKED INCOMPLETE_DISCOVERY MISSING_ANCESTOR AMBIGUOUS_BASE NO_COMMON_ANCESTOR LIBRARY_ORDER_POLICY_PENDING MISSING_TOMBSTONE UNACKNOWLEDGED_RESTORATION INVALID_RESTORATION NOT_A_SEMANTIC_RECONCILIATION INVALID_COPY_NAME HASH_MISMATCH INVALID_HASH UNSUPPORTED_SYNC_VERSION UNKNOWN_OR_MISSING_FIELD CYCLIC_HISTORY GRAPH_LIMIT SNAPSHOT_COLLISION OPERATION_COLLISION HTTP_401 HTTP_403 HTTP_404 HTTP_409 NETWORK_OR_CORS_OUTCOME_UNKNOWN ABORTED_OUTCOME_UNKNOWN READBACK_MISMATCH SIMULATED_LOST_ACK`.split(' '));
const reason = value => !value ? null : reasons.has(value) ? value : 'UNRECOGNIZED_CODE';
const hash = value => typeof value === 'string' && HASH.test(value) ? value : null;
const hashes = value => Array.isArray(value) ? value.map(hash) : null;
const revision = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
const same = (a,b) => { try { return canonicalJSON(a) === canonicalJSON(b); } catch { return null; } };
const stage = value => ['prepared','verified'].includes(value) ? value : value == null ? null : 'unrecognized';
function ticketInfo(ticket, ticketStage, records) {
    const local = records?.library, bindings = records?.bindings;
    return {
        present: Boolean(ticket), stage: stage(ticketStage),
        snapshot: hash(ticket?.snapshotHash), parents: hashes(ticket?.parents), sourceRevision: revision(ticket?.localRevision),
        sourceRevisionMatchesLocal: ticket && local ? ticket.localRevision === local.localRevision : null,
        newerLocalRevision: ticket && local ? local.localRevision > ticket.localRevision : null,
        accountBindingMatches: ticket && bindings?.accountKey ? ticket.accountKey === bindings.accountKey : null,
        snapshotKnownLocally: ticket && Array.isArray(bindings?.history) ? bindings.history.some(n=>n.snapshotId===ticket.snapshotHash) : null,
        snapshotIsKnownHead: ticket && Array.isArray(bindings?.heads) ? bindings.heads.includes(ticket.snapshotHash) : null,
        // Prepared may mean never sent OR uncertain outcome. Local data cannot distinguish these.
        acknowledgement: !ticket ? 'not-applicable' : ticketStage === 'verified' ? 'verified-readback' : 'not-locally-verified',
        actualRemoteExistence: 'not-queried',
    };
}
export async function createDiagnosticReport(records, memory = {}) {
    const b = records?.bindings, local = records?.library, metadata = records?.metadata;
    const intent = b?.reconciliation, outbox = records?.outbox;
    const knownHeads = hashes(b?.heads);
    const report = {
        diagnosticVersion: 1, source: 'existing-local-state-only', remoteState: 'not-queried',
        storage: {
            readState: ['read','no-existing-connection','read-unavailable'].includes(memory.readState) ? memory.readState : 'read-unavailable',
            activated: typeof memory.activated === 'boolean' ? memory.activated : null, accountBound: b ? Boolean(b.accountKey) : null,
            localRevision: revision(local?.localRevision), dirtyRevision: revision(metadata?.dirtyRevision),
            dirty: typeof metadata?.syncDirty === 'boolean' ? metadata.syncDirty : null,
            dirtyRevisionMatchesLocal: metadata && local ? metadata.dirtyRevision === local.localRevision : null,
            base: hash(b?.base), knownHeads, knownHeadCount: knownHeads?.length ?? null,
            cachedSnapshotCount: Array.isArray(b?.history) ? b.history.length : null,
        },
        controller: { connected: Boolean(memory.connected), busy: Boolean(memory.busy), lastErrorCode: reason(memory.error),
            cachedStatus: 'unavailable', statusIsFreshRemoteCheck: false },
        ordinaryUpload: ticketInfo(intent ? null : outbox?.ticket, intent ? null : outbox?.stage, records),
        reconciliation: {
            ...ticketInfo(intent?.ticket, intent ? outbox?.stage : null, records),
            reviewedHeads: hashes(intent?.ticket?.parents), baselineRevision: revision(intent?.anchor?.revision), baselineBase: hash(intent?.anchor?.base),
            baselineRevisionMatchesLocal: intent && local ? intent.anchor?.revision === local.localRevision : null,
            baselineContentMatchesLocal: intent && local ? same(intent.anchor?.library, local.library) : null,
            intentMatchesOutbox: intent ? Boolean(outbox) && same(intent.ticket,outbox.ticket) : null,
        },
        retainedReview: {
            present: Boolean(memory.review), base: hash(memory.review?.analysis?.baseId),
            heads: memory.review ? hashes([memory.review.analysis?.leftId,memory.review.analysis?.rightId]) : null,
            baselineRevision: revision(memory.review?.anchor?.revision),
            baselineRevisionMatchesLocal: memory.review && local ? memory.review.anchor?.revision === local.localRevision : null,
            baselineContentMatchesLocal: memory.review && local ? same(memory.review.anchor?.library,local.library) : null,
            previewSnapshot: hash(memory.preview?.snapshot?.snapshotId),
        },
        history: { validation: 'unavailable', reason: null, computedHeads: null, storedHeadsMatchComputed: null,
            localContentMatchesBase: null, baseAncestorOfHeads: null, commonBaseCount: null,
            reviewStatus: 'unavailable', unsupportedReason: null, conflictKinds: {} },
        limitations: ['remote-history-not-refreshed','prepared-ticket-does-not-prove-upload','memory-errors-and-review-may-be-lost-on-page-reload','last-successful-operation-result-and-time-not-persisted','memory-and-storage-not-a-cross-tab-global-snapshot','no-loaded-source-build-attestation'],
    };
    report.controller.cachedStatus = memory.busy ? 'busy' : memory.error ? 'error' : memory.activated === null ? 'unavailable' : !memory.activated ? 'localOnly' : !records ? 'unavailable' :
        !memory.connected ? b?.accountKey ? 'reconnect' : 'localOnly' : intent ? 'reviewRequired' : memory.adoption ? 'adoptAvailable' :
        knownHeads?.length > 1 ? 'reviewRequired' : metadata?.syncDirty || outbox ? 'pending' : b?.base && knownHeads?.[0] === b.base ? 'lastChecked' : 'pending';
    if (Array.isArray(b?.history)) {
        try {
            const graph = await buildGraph(b.history,{complete:true});
            report.history.validation = graph.status;
            report.history.reason = graph.status === 'validated' ? null : reason(graph.issues[0]);
            report.history.computedHeads = [...graph.heads];
            report.history.storedHeadsMatchComputed = Array.isArray(b.heads) ? same([...b.heads].sort(),graph.heads) : null;
            const base = b.base && graph.get(b.base);
            report.history.localContentMatchesBase = base && local ? same(local.library,base.library) : null;
            if (graph.status === 'validated') {
                report.history.baseAncestorOfHeads = graph.heads.map(head=>({head,baseIsAncestor:base?graph.ancestors(head).includes(b.base):null}));
                if (graph.heads.length !== 2) { report.history.reviewStatus='unsupported';report.history.unsupportedReason='HEAD_COUNT_NOT_TWO'; }
                else {
                    report.history.commonBaseCount=graph.commonBases(...graph.heads).length;
                    const analysis=analyzeReconciliation(graph,...graph.heads);
                    report.history.reviewStatus=analysis.status;
                    report.history.unsupportedReason=reason(analysis.reason);
                    const kinds=new Set(['concurrent-content','delete-versus-edit','restoration-review','missing-without-tombstone']);
                    for(const row of analysis.proposal?.conflicts || []) {
                        const kind=kinds.has(row.conflict)?row.conflict:'unrecognized';report.history.conflictKinds[kind]=(report.history.conflictKinds[kind]||0)+1;
                    }
                    if(analysis.status==='conflict'&&(analysis.proposal.conflicts.some(row=>row.conflict!=='concurrent-content'||row.left.kind!=='live'||row.right.kind!=='live')))report.history.unsupportedReason='UNSUPPORTED_CONFLICT_KIND';
                    else if(['conflict','proposed'].includes(analysis.status)&&!graph.heads.includes(b.base))report.history.unsupportedReason='LOCAL_BASE_NOT_CURRENT_HEAD';
                    else if(['conflict','proposed'].includes(analysis.status)&&report.history.localContentMatchesBase===false)report.history.unsupportedReason='UNPUBLISHED_LOCAL_CONTENT';
                    if(outbox)report.history.unsupportedReason='PENDING_TICKET';
                }
            }
        } catch(e) { report.history.validation='invalid';report.history.reason=reason(e.message); }
    }
    return report;
}
