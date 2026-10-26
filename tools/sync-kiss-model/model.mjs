// Isolated Node-only feasibility model. Files are entries in a synthetic Map, never remote objects.
import { createHash } from 'node:crypto';
import { canonicalJSON, strictLibrary } from '../sync-core/canonical.mjs';
const clone = structuredClone;
const hash = value => createHash('sha256').update(canonicalJSON(value)).digest('hex');
const same = (a, b) => canonicalJSON(a) === canonicalJSON(b);
const requireThat = (condition, code) => { if (!condition) throw Error(code); };
const nameKey = name => name.normalize('NFC').toLowerCase();
export function numberedName(name, occupied) {
    for (let n = 1; n <= occupied.size + 1; n++) {
        const suffix = ` (${n})`; let base = '';
        for (const scalar of name) { if (base.length + scalar.length + suffix.length > 120) break; base += scalar; }
        const candidate = base.trimEnd() + suffix;
        if (!occupied.has(nameKey(candidate))) return candidate;
    }
    throw Error('NAME_ALLOCATION_FAILED');
}
export function ticket(operationId, action) {
    requireThat(typeof operationId === 'string' && /^[a-zA-Z0-9_-]+$/.test(operationId), 'INVALID_OPERATION');
    const bytes = canonicalJSON({ operationId, action });
    return Object.freeze({ fileId: 'file-' + operationId, operationId, bytes, hash: hash({ operationId, action }) });
}
function parse(entry) {
    const decoded = JSON.parse(entry.bytes);
    requireThat(entry.bytes === canonicalJSON(decoded) && entry.hash === hash(decoded) && entry.operationId === decoded.operationId && entry.fileId === 'file-' + decoded.operationId, 'INVALID_TICKET');
    return decoded;
}
function normalizeNames(state) {
    const variants = Object.values(state.items).flat();
    const occupied = new Set(variants.filter(v => v.template && !v.generated).map(v => nameKey(v.template.name)));
    for (const v of variants.filter(v => v.generated && v.template).sort((a, b) => a.token < b.token ? -1 : 1)) {
        v.template.name = numberedName(v.generated, occupied); occupied.add(nameKey(v.template.name));
    }
    for (const v of variants) if (v.template) strictLibrary({ schemaVersion: 1, templates: [v.template] });
}
function copyVariant(state, variant, operationId) {
    requireThat(variant.template, 'NOTHING_TO_COPY');
    const template = clone(variant.template), seed = 'copy-' + hash({ operationId, source: variant.token }).slice(0, 24);
    const used = new Set([...Object.keys(state.items), ...Object.values(state.items).flatMap(vs => vs.flatMap(v => [v.template?.id, ...(v.template?.phases || []).map(p => p.id)]))]);
    template.id = seed;
    template.phases = template.phases.map((p, i) => ({ ...p, id: seed + '-phase-' + i }));
    requireThat([template.id, ...template.phases.map(p => p.id)].every(id => !used.has(id)), 'COPY_ID_COLLISION');
    state.items[template.id] = [{ token: 'copy:' + operationId, base: null, template, generated: template.name }];
}
function apply(state, entry) {
    const { operationId, action: a } = parse(entry);
    if (Object.hasOwn(state.receipts, operationId)) { requireThat(state.receipts[operationId] === entry.hash, 'OPERATION_COLLISION'); return; }
    requireThat(['upsert', 'delete', 'resolve'].includes(a.kind) && typeof a.id === 'string' && a.id && !['__proto__', 'constructor', 'prototype'].includes(a.id), 'UNSUPPORTED_ACTION');
    const current = state.items[a.id] || [], token = 'op:' + operationId;
    if (a.kind === 'resolve') {
        requireThat(Array.isArray(a.variants) && a.variants.length === 2 && ['A', 'B', 'both'].includes(a.choice), 'INVALID_RESOLUTION');
        const round = hash({ id: a.id, variants: [...a.variants].sort() });
        requireThat(!Object.hasOwn(state.decisions, round), 'CONTRADICTORY_RESOLUTION');
        requireThat(current.length === 2 && same(current.map(v => v.token).sort(), [...a.variants].sort()), 'STALE_REVIEW');
        requireThat(same([...current].sort((a, b) => a.token < b.token ? -1 : 1), a.reviewed), 'REVIEW_CONTENT_MISMATCH');
        const [left, right] = [...current].sort((a, b) => a.token < b.token ? -1 : 1);
        const selected = a.choice === 'B' ? right : left;
        if (a.choice === 'both') copyVariant(state, right.template ? right : left, operationId);
        const template = a.choice === 'both' && (!left.template || !right.template) ? null : clone(selected.template);
        for (const v of current) state.closed.push(v.token, ...(v.base ? [v.base] : []));
        state.closed = [...new Set(state.closed)].sort();
        state.items[a.id] = [{ token, base: null, template }]; state.decisions[round] = operationId;
    } else {
        const template = a.kind === 'delete' ? null : strictLibrary({ schemaVersion: 1, templates: [a.template] }).templates[0];
        requireThat(!template || template.id === a.id, 'IDENTITY_MISMATCH');
        const next = { token, base: a.base, template };
        if (state.closed.includes(a.base)) {
            if (template) copyVariant(state, next, operationId); // Stale deletion is acknowledged but cannot delete today's value.
        } else if (!current.length) {
            requireThat(a.base === null && template, 'UNKNOWN_BASE'); state.items[a.id] = [next];
        } else if (current.some(v => v.token === a.base)) {
            state.items[a.id] = current.map(v => v.token === a.base ? next : v);
        } else if (current.every(v => v.base === a.base) && a.base !== null) {
            state.items[a.id] = [...current, next];
        } else throw Error('UNKNOWN_BASE');
    }
    state.receipts[operationId] = entry.hash; normalizeNames(state);
}
function covers(a, b) {
    return Object.entries(b.receipts).every(([id, digest]) => a.receipts[id] === digest) &&
        b.closed.every(token => a.closed.includes(token)) && Object.entries(b.decisions).every(([id, op]) => a.decisions[id] === op);
}
export function createModel(library) {
    const valid = strictLibrary(clone(library)), root = hash(valid), files = new Map();
    const state = { root, items: Object.fromEntries(valid.templates.map(t => [t.id, [{ token: 'root:' + t.id, base: null, template: t }]])), receipts: {}, closed: [], decisions: {} };
    files.set('checkpoint-root', { kind: 'checkpoint', state, hash: hash(state) });
    function view(visibleIds = [...files.keys()]) {
        try {
            const entries = visibleIds.map(id => { requireThat(files.has(id), 'MISSING_FILE'); return files.get(id); });
            const checkpoints = entries.filter(f => f.kind === 'checkpoint');
            requireThat(checkpoints.length, 'NO_CHECKPOINT');
            for (const c of checkpoints) requireThat(c.hash === hash(c.state) && c.state.root === root, 'INVALID_CHECKPOINT');
            const candidates = checkpoints.filter(c => checkpoints.every(other => covers(c.state, other.state)));
            requireThat(candidates.length, 'INCOMPARABLE_CHECKPOINTS');
            requireThat(candidates.every(c => same(c.state, candidates[0].state)), 'INCONSISTENT_CHECKPOINTS');
            const result = clone(candidates[0].state), pending = entries.filter(f => f.kind === 'change').map(f => f.ticket);
            const operations = new Map();
            for (const t of pending) { parse(t); requireThat(!operations.has(t.operationId) || same(operations.get(t.operationId), t), 'OPERATION_COLLISION'); operations.set(t.operationId, t); }
            const remaining = [...operations.values()].sort((a, b) => a.operationId < b.operationId ? -1 : 1);
            // Only dependency ordering of unincorporated files, not a persistent historical DAG engine.
            while (remaining.length) {
                const index = remaining.findIndex(t => {
                    const { action } = parse(t), deps = action.kind === 'resolve' ? action.variants : [action.base];
                    return deps.every(dep => !dep?.startsWith('op:') || !remaining.some(other => 'op:' + other.operationId === dep));
                });
                requireThat(index >= 0, 'CYCLIC_DEPENDENCIES'); apply(result, remaining.splice(index, 1)[0]);
            }
            const conflicts = Object.entries(result.items).filter(([, vs]) => vs.length > 1).map(([id, vs]) => ({ id, variants: clone(vs) }));
            const templates = Object.entries(result.items).sort(([a], [b]) => a < b ? -1 : 1).flatMap(([, vs]) => vs.length === 1 && vs[0].template ? [vs[0].template] : []);
            strictLibrary({ schemaVersion: 1, templates });
            return { status: conflicts.length ? 'conflict' : 'current', state: result, library: { schemaVersion: 1, templates }, conflicts };
        } catch (error) { return { status: 'blocked', reason: error.message }; }
    }
    return {
        files, view,
        publish(entry, { loseAcknowledgement = false } = {}) {
            parse(entry);
            if (files.has(entry.fileId)) requireThat(same(files.get(entry.fileId), { kind: 'change', ticket: entry }), 'FILE_COLLISION');
            else files.set(entry.fileId, { kind: 'change', ticket: clone(entry) });
            if (loseAcknowledgement) throw Error('SIMULATED_LOST_ACK');
            return 'stored';
        },
        checkpoint(id, visibleIds) {
            const current = view(visibleIds); requireThat(current.status !== 'blocked', current.reason);
            requireThat(!files.has(id), 'FILE_COLLISION');
            files.set(id, { kind: 'checkpoint', state: clone(current.state), hash: hash(current.state) }); return id;
        },
        cleanup(keeperId) {
            const current = view(); requireThat(current.status !== 'blocked', current.reason);
            const keeper = files.get(keeperId); requireThat(keeper?.kind === 'checkpoint' && keeper.hash === hash(keeper.state), 'INVALID_CHECKPOINT');
            const remove = [];
            for (const [id, f] of files) if (id !== keeperId) {
                if (f.kind === 'checkpoint') requireThat(covers(keeper.state, f.state), 'UNCOVERED_CHECKPOINT');
                else if (keeper.state.receipts[f.ticket.operationId] !== f.ticket.hash) continue;
                remove.push(id);
            }
            remove.forEach(id => files.delete(id)); return remove;
        },
        recover(entry) {
            parse(entry); const current = view(); if (current.status === 'blocked') return current;
            const receipt = current.state.receipts[entry.operationId];
            if (receipt) { requireThat(receipt === entry.hash, 'OPERATION_COLLISION'); return { status: 'covered', exactFilePresent: files.has(entry.fileId) }; }
            return { status: 'pending' };
        },
    };
}
