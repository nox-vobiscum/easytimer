import { validateLibrary } from '../../src/js/templates.mjs';

export const PURPOSE = 'easytimer-sync-snapshot-v1';
export const HASH = /^sha256:[a-f0-9]{64}$/;
export const fail = code => { throw new Error(code); };
export const requireThat = (condition, code = 'INVALID_STRUCTURE') => { if (!condition) fail(code); };
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

// This is a restricted JSON domain, not a general JavaScript object serializer.
function inspect(value, seen = new Set()) {
    if (typeof value === 'string') {
        for (let i = 0; i < value.length; i++) {
            const code = value.charCodeAt(i);
            if (code >= 0xd800 && code <= 0xdbff) {
                const next = value.charCodeAt(++i); requireThat(next >= 0xdc00 && next <= 0xdfff, 'INVALID_UNICODE');
            } else requireThat(code < 0xdc00 || code > 0xdfff, 'INVALID_UNICODE');
        }
    } else if (typeof value === 'number') requireThat(Number.isSafeInteger(value) && !Object.is(value, -0), 'INVALID_NUMBER');
    else if (value === null || typeof value === 'boolean') return;
    else if (typeof value === 'object') {
        requireThat(!seen.has(value), 'CYCLIC_OBJECT'); seen.add(value);
        const array = Array.isArray(value);
        requireThat(array || Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
        const descriptors = Object.getOwnPropertyDescriptors(value);
        requireThat(Object.getOwnPropertySymbols(value).length === 0);
        if (array) requireThat(Object.getOwnPropertyNames(value).length === value.length + 1 && Object.keys(value).length === value.length && Object.keys(value).every((key, i) => key === String(i)), 'INVALID_ARRAY');
        for (const key of Object.keys(value)) {
            requireThat(descriptors[key].enumerable && 'value' in descriptors[key], 'ACCESSOR_NOT_ALLOWED');
            inspect(key, seen); inspect(descriptors[key].value, seen);
        }
        requireThat(array || Object.getOwnPropertyNames(value).length === Object.keys(value).length);
        seen.delete(value);
    } else fail('NON_JSON_VALUE');
}
function encode(value) {
    if (Array.isArray(value)) return '[' + value.map(encode).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + encode(value[key])).join(',') + '}';
    return JSON.stringify(value);
}
export function canonicalJSON(value) { inspect(value); return encode(value); }
export function exactKeys(value, keys) {
    requireThat(value && typeof value === 'object' && !Array.isArray(value));
    requireThat(Object.keys(value).sort().join('|') === [...keys].sort().join('|'), 'UNKNOWN_OR_MISSING_FIELD');
}
export function validId(id) { requireThat(typeof id === 'string' && id.trim().length > 0, 'INVALID_ID'); return id; }
export function stringSet(value, validate = validId) {
    requireThat(Array.isArray(value)); value.forEach(validate);
    requireThat(new Set(value).size === value.length, 'DUPLICATE_SET_ENTRY'); return [...value].sort();
}
export function strictLibrary(library) {
    canonicalJSON(library);
    const result = validateLibrary(library);
    // In particular, do not trim or normalize visible text, drop fields, or repair input silently.
    requireThat(canonicalJSON(result) === canonicalJSON(library), 'LIBRARY_WOULD_CHANGE');
    for (const template of result.templates) { validId(template.id); for (const phase of template.phases) validId(phase.id); }
    return result;
}
export function normalizeState(state) {
    exactKeys(state, ['library', 'deletedRundownIds']);
    const library = strictLibrary(state.library), deletedRundownIds = stringSet(state.deletedRundownIds);
    requireThat(!library.templates.some(t => deletedRundownIds.includes(t.id)), 'LIVE_AND_DELETED');
    return { library, deletedRundownIds };
}
export function normalizePayload(input) {
    canonicalJSON(input);
    exactKeys(input, ['purpose', 'syncFormatVersion', 'libraryId', 'operationId', 'parents', 'library', 'deletedRundownIds', 'restoredRundownIds', 'resolution']);
    requireThat(input.purpose === PURPOSE && input.syncFormatVersion === 1, 'UNSUPPORTED_SYNC_VERSION');
    requireThat(uuid.test(input.libraryId) && uuid.test(input.operationId), 'INVALID_UUID');
    const parents = stringSet(input.parents, id => requireThat(HASH.test(id), 'INVALID_HASH'));
    requireThat(parents.length <= 2, 'UNSUPPORTED_PARENT_COUNT');
    const state = normalizeState({ library: input.library, deletedRundownIds: input.deletedRundownIds });
    const restoredRundownIds = stringSet(input.restoredRundownIds);
    requireThat(restoredRundownIds.every(id => state.library.templates.some(t => t.id === id)), 'INVALID_RESTORATION');
    let resolution = null;
    if (input.resolution !== null) {
        exactKeys(input.resolution, ['base', 'decisions']);
        requireThat(HASH.test(input.resolution.base), 'INVALID_HASH');
        requireThat(Array.isArray(input.resolution.decisions));
        const decisions = input.resolution.decisions.map(decision => {
            exactKeys(decision, ['id', 'choice', 'copy']); validId(decision.id);
            requireThat(['left', 'right', 'both'].includes(decision.choice), 'INVALID_CHOICE');
            let copy = null;
            if (decision.copy !== null) {
                exactKeys(decision.copy, Object.hasOwn(decision.copy, 'name') ? ['id', 'phaseIds', 'name'] : ['id', 'phaseIds']);
                validId(decision.copy.id); requireThat(Array.isArray(decision.copy.phaseIds)); decision.copy.phaseIds.forEach(validId);
                if (Object.hasOwn(decision.copy, 'name')) requireThat(typeof decision.copy.name === 'string' && decision.copy.name.trim() === decision.copy.name && decision.copy.name.length > 0 && decision.copy.name.length <= 120, 'INVALID_COPY_NAME');
                copy = structuredClone(decision.copy);
            }
            requireThat(decision.choice === 'both' ? copy !== null : copy === null, 'INVALID_COPY');
            return { id: decision.id, choice: decision.choice, copy };
        });
        requireThat(new Set(decisions.map(d => d.id)).size === decisions.length, 'DUPLICATE_DECISION');
        resolution = { base: input.resolution.base, decisions: decisions.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0) };
    }
    requireThat(parents.length === 2 ? resolution !== null : resolution === null, 'RESOLUTION_REQUIRED');
    return { purpose: PURPOSE, syncFormatVersion: 1, libraryId: input.libraryId, operationId: input.operationId, parents, ...state, restoredRundownIds, resolution };
}
export async function hashPayload(payload) {
    const bytes = new TextEncoder().encode(canonicalJSON(normalizePayload(payload)));
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    return 'sha256:' + [...new Uint8Array(hash)].map(value => value.toString(16).padStart(2, '0')).join('');
}
export async function createSnapshot(payload) {
    const normalized = normalizePayload(payload);
    return { ...normalized, snapshotId: await hashPayload(normalized) };
}
export async function verifySnapshot(input) {
    canonicalJSON(input);
    const { snapshotId, ...payload } = input;
    requireThat(HASH.test(snapshotId), 'INVALID_HASH');
    const normalized = normalizePayload(payload);
    requireThat(await hashPayload(normalized) === snapshotId, 'HASH_MISMATCH');
    return { ...normalized, snapshotId };
}
export function snapshotBytes(snapshot) { return new TextEncoder().encode(canonicalJSON(snapshot)); }
export async function parseCanonicalSnapshot(text) {
    requireThat(typeof text === 'string' && new TextEncoder().encode(text).length <= 10 * 1024 * 1024, 'SNAPSHOT_SIZE');
    let parsed;
    try { parsed = JSON.parse(text); } catch { fail('INVALID_JSON'); }
    const verified = await verifySnapshot(parsed);
    // Exact canonical wire bytes also reject repeated JSON object keys, BOM and trailing data.
    requireThat(text === canonicalJSON(verified), 'NON_CANONICAL_BYTES'); return verified;
}
