import { canonicalJSON, normalizeState, requireThat, validId, fail } from './canonical.mjs';

const equal = (a, b) => canonicalJSON(a) === canonicalJSON(b);
const absent = () => ({ kind: 'absent' });
export function numberedCopyName(name, names) {
    const used = new Set(names.map(value => value.normalize('NFC').toLowerCase()));
    const stem = name.replace(/\s+\(\d+\)$/u, '');
    for (let number = 1; number <= 100000; number++) {
        const suffix = ` (${number})`; let prefix = '';
        for (const point of stem) { if (prefix.length + point.length + suffix.length > 120) break; prefix += point; }
        const candidate = prefix.trimEnd() + suffix;
        if (!used.has(candidate.normalize('NFC').toLowerCase())) return candidate;
    }
    fail('COPY_NAME_LIMIT');
}
export function itemStates(input) {
    const state = normalizeState(input), map = new Map();
    for (const template of state.library.templates) map.set(template.id, { kind: 'live', template });
    for (const id of state.deletedRundownIds) map.set(id, { kind: 'deleted' });
    return map;
}
function stateOf(map, id) { return map.get(id) || absent(); }
export function compareLibraries(base, next) {
    const a = itemStates(base), b = itemStates(next);
    return [...new Set([...a.keys(), ...b.keys()])].sort().map(id => {
        const before = stateOf(a, id), after = stateOf(b, id), changes = [];
        if (equal(before, after)) changes.push('unchanged');
        else if (after.kind === 'deleted') changes.push('deleted');
        else if (before.kind === 'deleted' && after.kind === 'live') changes.push('restored');
        else if (before.kind === 'absent' && after.kind === 'live') changes.push('added');
        else if (after.kind === 'absent') changes.push('missing-without-tombstone');
        else if (before.kind === 'live' && after.kind === 'live') {
            if (before.template.name !== after.template.name) changes.push('renamed');
            if (before.template.transitionMode !== after.template.transitionMode) changes.push('transition-mode');
            const x = before.template.phases, y = after.template.phases;
            if (!equal(x.map(p => p.id), y.map(p => p.id))) changes.push('phase-order-or-membership');
            const old = new Map(x.map(p => [p.id, p]));
            if (y.some(p => old.has(p.id) && !equal(old.get(p.id), p))) changes.push('phase-content');
        }
        return { id, changes, before: structuredClone(before), after: structuredClone(after) };
    });
}
function baseOrderChanged(base, next) {
    const live = new Set(next.library.templates.map(t => t.id));
    const oldIds = new Set(base.library.templates.map(t => t.id));
    return !equal(base.library.templates.filter(t => live.has(t.id)).map(t => t.id), next.library.templates.filter(t => oldIds.has(t.id)).map(t => t.id));
}
export function proposeReconciliation(baseInput, leftInput, rightInput) {
    const base = normalizeState(baseInput), left = normalizeState(leftInput), right = normalizeState(rightInput);
    const b = itemStates(base), a = itemStates(left), c = itemStates(right);
    const rows = [], conflicts = [];
    for (const id of [...new Set([...b.keys(), ...a.keys(), ...c.keys()])].sort()) {
        const before = stateOf(b, id), l = stateOf(a, id), r = stateOf(c, id);
        const row = { id, base: before, left: l, right: r, proposed: null, conflict: null };
        if (before.kind !== 'absent' && (l.kind === 'absent' || r.kind === 'absent')) row.conflict = 'missing-without-tombstone';
        else if (before.kind === 'deleted' && (l.kind === 'live' || r.kind === 'live') && !equal(l, r)) row.conflict = 'restoration-review';
        else if (equal(l, r)) row.proposed = l;
        else if (equal(before, l)) row.proposed = r;
        else if (equal(before, r)) row.proposed = l;
        else row.conflict = l.kind === 'deleted' || r.kind === 'deleted' ? 'delete-versus-edit' : 'concurrent-content';
        rows.push(row); if (row.conflict) conflicts.push(structuredClone(row));
    }
    return { base, left, right, rows: structuredClone(rows), conflicts,
        blocked: baseOrderChanged(base, left) || baseOrderChanged(base, right) ? 'LIBRARY_ORDER_POLICY_PENDING' : null };
}
export function applyChoices(input, decisions = [], reviewedRestorations = []) {
    // Recompute instead of trusting a caller-edited proposal or its proposed content.
    const proposal = proposeReconciliation(input.base, input.left, input.right);
    for (const id of reviewedRestorations) {
        const row = proposal.rows.find(row => row.id === id);
        requireThat(row && !equal(row.left, row.right), 'INVALID_RESTORATION_REVIEW');
        row.proposed = null; row.conflict = 'restoration-review';
    }
    proposal.conflicts = proposal.rows.filter(row => row.conflict).map(row => structuredClone(row));
    requireThat(!proposal.blocked, proposal.blocked || 'BLOCKED');
    requireThat(Array.isArray(decisions), 'INVALID_DECISION');
    const choices = new Map();
    for (const decision of decisions) {
        requireThat(!choices.has(decision.id) && proposal.conflicts.some(c => c.id === decision.id), 'UNEXPECTED_DECISION');
        requireThat(['left', 'right', 'both'].includes(decision.choice), 'INVALID_CHOICE'); choices.set(decision.id, decision);
    }
    requireThat(choices.size === proposal.conflicts.length, 'UNRESOLVED_CONFLICT');
    const used = new Set();
    for (const state of [proposal.base, proposal.left, proposal.right]) {
        for (const id of state.deletedRundownIds) used.add(id);
        for (const t of state.library.templates) { used.add(t.id); for (const p of t.phases) used.add(p.id); }
    }
    const templates = new Map(), deleted = new Set(), copies = [];
    const names = [proposal.base, proposal.left, proposal.right].flatMap(s => s.library.templates.map(t => t.name));
    for (const row of proposal.rows) {
        const decision = choices.get(row.id); let selected = row.proposed;
        if (decision) {
            if (decision.choice !== 'both') {
                requireThat(decision.copy === null, 'UNEXPECTED_COPY'); selected = row[decision.choice];
            } else {
                const leftLive = row.left.kind === 'live', rightLive = row.right.kind === 'live';
                requireThat(leftLive || rightLive, 'NOTHING_TO_COPY');
                const source = rightLive ? row.right.template : row.left.template;
                selected = leftLive && rightLive ? row.left : { kind: 'deleted' };
                const copy = decision.copy;
                requireThat(copy && Array.isArray(copy.phaseIds) && copy.phaseIds.length === source.phases.length, 'INVALID_COPY');
                for (const id of [copy.id, ...copy.phaseIds]) { validId(id); requireThat(!used.has(id), 'COPY_ID_COLLISION'); used.add(id); }
                if (Object.hasOwn(copy, 'name')) requireThat(copy.name === numberedCopyName(source.name, names), 'INVALID_COPY_NAME');
                const name = copy.name ?? source.name; names.push(name);
                copies.push({ ...structuredClone(source), name, id: copy.id, phases: source.phases.map((p, i) => ({ ...p, id: copy.phaseIds[i] })) });
            }
        }
        requireThat(selected && selected.kind !== 'absent', 'MISSING_DECISION_DATA');
        if (selected.kind === 'live') templates.set(row.id, structuredClone(selected.template)); else deleted.add(row.id);
    }
    const ordered = [];
    for (const t of proposal.base.library.templates) if (templates.has(t.id)) { ordered.push(templates.get(t.id)); templates.delete(t.id); }
    ordered.push(...[...templates.values()].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    ordered.push(...copies.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const state = normalizeState({ library: { schemaVersion: 1, templates: ordered }, deletedRundownIds: [...deleted].sort() });
    const restoredRundownIds = state.library.templates.filter(t => [proposal.left, proposal.right].some(s => s.deletedRundownIds.includes(t.id))).map(t => t.id).sort();
    return { ...state, restoredRundownIds };
}
export function allocateChoices(proposal, choices, createId, numberedCopies = false) {
    requireThat(typeof createId === 'function', 'ID_FACTORY_REQUIRED');
    canonicalJSON(choices);
    requireThat(choices && !Array.isArray(choices) && Object.keys(choices).every(id => proposal.conflicts.some(c => c.id === id)), 'UNEXPECTED_DECISION');
    const used = new Set();
    for (const state of [proposal.base, proposal.left, proposal.right]) {
        state.deletedRundownIds.forEach(id => used.add(id));
        for (const t of state.library.templates) { used.add(t.id); t.phases.forEach(p => used.add(p.id)); }
    }
    const fresh = () => {
        for (let i = 0; i < 100; i++) { const id = createId(); validId(id); if (!used.has(id)) { used.add(id); return id; } }
        fail('ID_FACTORY_COLLISION');
    };
    const names = [proposal.base, proposal.left, proposal.right].flatMap(s => s.library.templates.map(t => t.name));
    return proposal.conflicts.map(conflict => {
        const choice = choices[conflict.id]; requireThat(['left', 'right', 'both'].includes(choice), 'UNRESOLVED_CONFLICT');
        const source = conflict.right.kind === 'live' ? conflict.right.template : conflict.left.template;
        const copy = choice === 'both' ? { id: fresh(), phaseIds: source.phases.map(() => fresh()) } : null;
        if (copy && numberedCopies) { copy.name = numberedCopyName(source.name, names); names.push(copy.name); }
        return { id: conflict.id, choice, copy };
    });
}
