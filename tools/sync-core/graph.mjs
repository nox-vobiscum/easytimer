import { canonicalJSON, createSnapshot, verifySnapshot, requireThat, normalizeState, normalizePayload } from './canonical.mjs';
import { proposeReconciliation, applyChoices, allocateChoices } from './reconcile.mjs';

const instances = new WeakSet();
const state = node => normalizeState({ library: node.library, deletedRundownIds: node.deletedRundownIds });
const equal = (a, b) => canonicalJSON(a) === canonicalJSON(b);
const logical = node => { const { snapshotId, ...payload } = node; return { ...normalizePayload(payload), snapshotId }; };
function ancestorsOf(nodes, id) {
    requireThat(nodes.has(id), 'UNKNOWN_SNAPSHOT'); const result = new Set();
    function visit(current) { if (result.has(current)) return; result.add(current); for (const parent of nodes.get(current).parents) visit(parent); }
    visit(id); return result;
}
function basesOf(nodes, a, b) {
    const left = ancestorsOf(nodes, a), right = ancestorsOf(nodes, b);
    const common = [...left].filter(id => right.has(id));
    return common.filter(id => !common.some(other => other !== id && ancestorsOf(nodes, other).has(id))).sort();
}
function proposalFor(nodes, baseId, leftId, rightId) {
    const proposal = proposeReconciliation(state(nodes.get(baseId)), state(nodes.get(leftId)), state(nodes.get(rightId)));
    const restored = new Set();
    for (const branch of [leftId, rightId]) for (const id of ancestorsOf(nodes, branch)) {
        if (id !== baseId && ancestorsOf(nodes, id).has(baseId)) nodes.get(id).restoredRundownIds.forEach(value => restored.add(value));
    }
    for (const row of proposal.rows) if (restored.has(row.id) && !equal(row.left, row.right)) {
        row.proposed = null; row.conflict = 'restoration-review';
    }
    proposal.conflicts = proposal.rows.filter(row => row.conflict).map(row => structuredClone(row));
    return proposal;
}
function semanticTransition(node, parent) {
    const current = new Map(node.library.templates.map(t => [t.id, t]));
    const deleted = new Set(node.deletedRundownIds), restored = new Set(node.restoredRundownIds);
    for (const template of parent.library.templates) requireThat(current.has(template.id) || deleted.has(template.id), 'MISSING_TOMBSTONE');
    for (const id of parent.deletedRundownIds) requireThat(deleted.has(id) || (current.has(id) && restored.has(id)), 'UNACKNOWLEDGED_RESTORATION');
    requireThat([...restored].every(id => parent.deletedRundownIds.includes(id)), 'INVALID_RESTORATION');
}
export async function buildGraph(input, { complete = false } = {}) {
    requireThat(Array.isArray(input) && input.length <= 1000, 'GRAPH_LIMIT');
    canonicalJSON(input);
    const source = structuredClone(input); // Caller changes during asynchronous hashing cannot change this history.
    const raw = new Map(), operations = new Map();
    for (const node of source) {
        canonicalJSON(node);
        requireThat(node && Array.isArray(node.parents), 'INVALID_STRUCTURE');
        if (raw.has(node.snapshotId)) requireThat(equal(logical(raw.get(node.snapshotId)), logical(node)), 'SNAPSHOT_COLLISION');
        if (operations.has(node.operationId)) requireThat(operations.get(node.operationId) === node.snapshotId, 'OPERATION_COLLISION');
        raw.set(node.snapshotId, node); operations.set(node.operationId, node.snapshotId);
    }
    const visited = new Set(), visiting = new Set(), ordered = [], missing = new Set();
    function visit(id) {
        requireThat(!visiting.has(id), 'CYCLIC_HISTORY'); if (visited.has(id)) return;
        if (!raw.has(id)) { missing.add(id); return; }
        visiting.add(id); for (const parent of raw.get(id).parents) visit(parent);
        visiting.delete(id); visited.add(id); ordered.push(id);
    }
    for (const id of raw.keys()) visit(id);
    const nodes = new Map();
    for (const id of ordered) nodes.set(id, await verifySnapshot(raw.get(id)));
    requireThat(new Set([...nodes.values()].map(n => n.libraryId)).size <= 1, 'LIBRARY_MISMATCH');
    const issues = [];
    if (!complete) issues.push('INCOMPLETE_DISCOVERY');
    if (missing.size) issues.push('MISSING_ANCESTOR');
    if (!issues.length) for (const node of nodes.values()) {
        if (node.parents.length === 0) requireThat(node.restoredRundownIds.length === 0, 'INVALID_RESTORATION');
        else if (node.parents.length === 1) semanticTransition(node, nodes.get(node.parents[0]));
        else {
            const [a, b] = node.parents, bases = basesOf(nodes, a, b);
            requireThat(bases.length === 1, bases.length ? 'AMBIGUOUS_BASE' : 'NO_COMMON_ANCESTOR');
            requireThat(node.resolution.base === bases[0], 'WRONG_RECONCILIATION_BASE');
            const proposal = proposalFor(nodes, bases[0], a, b);
            const applied = applyChoices(proposal, node.resolution.decisions, proposal.conflicts.filter(row => row.conflict === 'restoration-review').map(row => row.id));
            requireThat(equal(state(node), { library: applied.library, deletedRundownIds: applied.deletedRundownIds }) &&
                equal(node.restoredRundownIds, applied.restoredRundownIds), 'NOT_A_SEMANTIC_RECONCILIATION');
        }
    }
    const parentIds = new Set([...nodes.values()].flatMap(n => n.parents));
    const heads = [...nodes.keys()].filter(id => !parentIds.has(id)).sort();
    const roots = [...nodes.values()].filter(n => n.parents.length === 0).map(n => n.snapshotId).sort();
    const graph = Object.freeze({ status: issues.length ? 'blocked' : 'validated', issues: Object.freeze(issues), missing: Object.freeze([...missing].sort()),
        heads: Object.freeze(heads), roots: Object.freeze(roots), divergent: heads.length > 1,
        get: id => structuredClone(nodes.get(id)), list: () => structuredClone([...nodes.values()]),
        ancestors(id) { requireThat(!issues.length, 'HISTORY_BLOCKED'); return [...ancestorsOf(nodes, id)].sort(); },
        commonBases(a, b) { requireThat(!issues.length, 'HISTORY_BLOCKED'); return basesOf(nodes, a, b); } });
    instances.add(graph); return graph;
}
export function analyzeReconciliation(graph, first, second) {
    requireThat(instances.has(graph), 'VALIDATED_GRAPH_REQUIRED');
    if (graph.status !== 'validated') return { status: 'blocked', reason: 'HISTORY_BLOCKED', sources: graph.list() };
    requireThat(first !== second && graph.get(first) && graph.get(second), 'INVALID_PARENT_PAIR');
    const [leftId, rightId] = [first, second].sort(), bases = graph.commonBases(leftId, rightId);
    if (bases.length !== 1) return { status: 'blocked', reason: bases.length ? 'AMBIGUOUS_BASE' : 'NO_COMMON_ANCESTOR', sources: [graph.get(leftId), graph.get(rightId)] };
    const proposal = proposalFor(new Map(graph.list().map(node => [node.snapshotId, node])), bases[0], leftId, rightId);
    return { status: proposal.blocked ? 'blocked' : proposal.conflicts.length ? 'conflict' : 'proposed', reason: proposal.blocked,
        baseId: bases[0], leftId, rightId, proposal };
}
export async function createReconciliation(graph, a, b, { operationId, choices = {}, createId = () => crypto.randomUUID(), numberedCopies = false } = {}) {
    const analysis = analyzeReconciliation(graph, a, b);
    requireThat(analysis.status !== 'blocked', analysis.reason);
    // A named parent must be an observed head; late heads may remain outside this decision.
    requireThat(graph.heads.includes(a) && graph.heads.includes(b), 'PARENTS_NOT_REVIEWED_HEADS');
    const decisions = allocateChoices(analysis.proposal, choices, createId, numberedCopies);
    const applied = applyChoices(analysis.proposal, decisions, analysis.proposal.conflicts.filter(row => row.conflict === 'restoration-review').map(row => row.id));
    return createSnapshot({ purpose: 'easytimer-sync-snapshot-v1', syncFormatVersion: 1,
        libraryId: graph.get(a).libraryId, operationId, parents: [a, b], ...applied,
        resolution: { base: analysis.baseId, decisions } });
}
