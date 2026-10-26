import { validateLibrary } from '../../src/js/templates.mjs';

export const DB_PREFIX = 'easyTimer-SYNC-002A-test-';
const stores = ['library', 'metadata', 'outbox', 'bindings'];
const key = 'current';
const fail = code => { throw new Error(code); };
export function canonical(value) {
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
    return JSON.stringify(value);
}
export function strictLibrary(value) {
    const valid = validateLibrary(value);
    if (canonical(value) !== canonical(valid)) fail('CONTENT_WOULD_CHANGE');
    return valid;
}
export async function digest(bytes) {
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(bytes)))].map(v => v.toString(16).padStart(2, '0')).join('');
}
export async function makeTestTicket(state, operationId = crypto.randomUUID(), fileId = 'synthetic-file-A') {
    const snapshotBytes = JSON.stringify({ libraryId: state.libraryId, localRevision: state.localRevision, library: state.library });
    return { operationId, fileId, libraryId: state.libraryId, localRevision: state.localRevision,
        parents: [], snapshotBytes, snapshotHash: await digest(snapshotBytes) };
}
async function validateTicket(ticket) {
    if (!ticket || Object.keys(ticket).sort().join(',') !== 'fileId,libraryId,localRevision,operationId,parents,snapshotBytes,snapshotHash' ||
        !/^[0-9a-f-]{36}$/i.test(ticket.operationId) || !/^[a-zA-Z0-9_-]{1,200}$/.test(ticket.fileId) ||
        typeof ticket.libraryId !== 'string' || !Number.isSafeInteger(ticket.localRevision) || ticket.localRevision < 1 ||
        !Array.isArray(ticket.parents) || ticket.parents.some(p => !/^[a-f0-9]{64}$/.test(p)) ||
        typeof ticket.snapshotBytes !== 'string' || ticket.snapshotHash !== await digest(ticket.snapshotBytes)) fail('INVALID_TICKET');
    let parsed;
    try { parsed = JSON.parse(ticket.snapshotBytes); } catch { fail('INVALID_TICKET'); }
    strictLibrary(parsed.library);
    if (Object.keys(parsed).sort().join(',') !== 'library,libraryId,localRevision' || parsed.libraryId !== ticket.libraryId || parsed.localRevision !== ticket.localRevision) fail('INVALID_TICKET');
    return parsed;
}
export function openLocalStore({ name, factory = globalThis.indexedDB, fault = () => {}, onVersionChange = () => {}, integration = null } = {}) {
    if (!name?.startsWith(DB_PREFIX)) return Promise.reject(new Error('TEST_DATABASE_REQUIRED'));
    return new Promise((resolve, reject) => {
        let request, finished = false;
        const rejected = code => { if (!finished) { finished = true; reject(new Error(code)); } };
        try { request = factory.open(name, 1); } catch { rejected('STORAGE_BLOCKED'); return; }
        request.onblocked = () => rejected('OPEN_BLOCKED');
        request.onerror = () => rejected(request.error?.name || 'OPEN_FAILED');
        request.onupgradeneeded = () => { if (finished) { request.transaction.abort(); return; } for (const store of stores) request.result.createObjectStore(store); };
        request.onsuccess = () => {
            const db = request.result;
            if (finished) { db.close(); return; }
            finished = true;
            let closed = false;
            db.onversionchange = () => { closed = true; db.close(); onVersionChange(); };
            function transaction(mode, work) {
                return new Promise((done, rejectTx) => {
                    let tx, cause, result;
                    if (closed) { rejectTx(new Error('DATABASE_CLOSED')); return; }
                    try { tx = db.transaction(stores, mode, mode === 'readwrite' ? { durability: 'strict' } : {}); }
                    catch (error) { rejectTx(new Error(error.name)); return; }
                    const objects = Object.fromEntries(stores.map(store => [store, tx.objectStore(store)]));
                    const abort = error => { cause = error; try { tx.abort(); } catch {} };
                    const safe = fn => (...args) => { try { fn(...args); } catch (error) { abort(error); } };
                    tx.oncomplete = () => done(structuredClone(result));
                    tx.onabort = () => rejectTx(new Error(cause?.message || tx.error?.name || 'TRANSACTION_ABORTED'));
                    tx.onerror = () => { /* Do not preventDefault: request failures must abort the whole transaction. */ };
                    try { work({ tx, objects, safe, abort, setResult: value => { result = value; } }); }
                    catch (error) { abort(error); }
                });
            }
            function readAll() {
                return transaction('readonly', ({ objects, safe, setResult }) => {
                    const result = {};
                    for (const store of stores) objects[store].get(key).onsuccess = safe(event => { result[store] = event.target.result ?? null; setResult(result); });
                });
            }
            function commitLibrary(library, expectedRevision, migration = null) {
                const valid = strictLibrary(library);
                return transaction('readwrite', ({ objects, safe, setResult }) => {
                    objects.library.get(key).onsuccess = safe(event => {
                        const current = event.target.result;
                        if (current) {
                            strictLibrary(current.library);
                            if (!Number.isSafeInteger(current.localRevision) || current.localRevision < 1 || typeof current.libraryId !== 'string') fail('CORRUPT_STATE');
                        }
                        const revision = current?.localRevision || 0;
                        if (revision !== expectedRevision) fail('REVISION_CONFLICT');
                        if (revision === Number.MAX_SAFE_INTEGER) fail('REVISION_OVERFLOW');
                        objects.metadata.get(key).onsuccess = safe(event => {
                        const oldMetadata = event.target.result;
                        if (current ? (integration ? typeof oldMetadata?.syncDirty !== 'boolean' : !oldMetadata?.syncDirty) || oldMetadata.dirtyRevision !== revision : Boolean(oldMetadata)) fail('CORRUPT_STATE');
                        const state = { libraryId: current?.libraryId || integration?.libraryId || crypto.randomUUID(), localRevision: revision + 1, library: valid };
                        fault('before-library');
                        objects.library.put(state, key);
                        fault('after-library-request', { tx: objects.library.transaction, objects });
                        const metadata = { ...oldMetadata, syncDirty: true, dirtyRevision: state.localRevision, migration };
                        objects.metadata.put(metadata, key);
                        fault('after-dirty-request');
                        // Wait for actual request success, still inside the transaction, for late-abort experiments.
                        objects.metadata.get(key).onsuccess = safe(() => { fault('before-commit'); setResult(state); });
                        });
                    });
                });
            }
            resolve({
                read: readAll,
                // Test-only integration seam: reuse the same strict transaction and abort handling.
                ...(integration ? { atomicUpdate(update) {
                    return transaction('readwrite', ({ objects, safe, setResult }) => {
                        const records = {}; let remaining = stores.length;
                        for (const store of stores) objects[store].get(key).onsuccess = safe(event => {
                            records[store] = event.target.result ?? null;
                            if (--remaining) return;
                            const result = update(records);
                            if (result?.then) fail('ASYNC_TRANSACTION_CALLBACK');
                            fault('before-integration-write');
                            for (const store of stores) {
                                if (records[store] === null) objects[store].delete(key);
                                else objects[store].put(records[store], key);
                            }
                            fault('after-integration-write');
                            objects.metadata.get(key).onsuccess = safe(() => { fault('before-integration-commit'); setResult(result); });
                        });
                    });
                } } : {}),
                save: (library, expectedRevision) => commitLibrary(library, expectedRevision),
                close() { closed = true; db.close(); },
                async prepareTicket(ticket) {
                    const retained = structuredClone(ticket); // Freeze input before asynchronous hashing.
                    const snapshot = await (integration?.validateTicket || validateTicket)(retained);
                    return transaction('readwrite', ({ objects, safe, setResult }) => {
                        objects.library.get(key).onsuccess = safe(event => {
                            const state = event.target.result;
                            if (!state || state.localRevision !== retained.localRevision || state.libraryId !== retained.libraryId || canonical(state.library) !== canonical(snapshot.library)) fail('REVISION_CONFLICT');
                            objects.outbox.get(key).onsuccess = safe(event => {
                                if (event.target.result) {
                                    if (canonical(event.target.result.ticket) !== canonical(retained)) fail('OUTBOX_FIXED');
                                    setResult(event.target.result); return;
                                }
                                fault('before-ticket');
                                const entry = { ticket: retained, stage: 'prepared' };
                                objects.outbox.add(entry, key);
                                fault('after-ticket-request');
                                objects.outbox.get(key).onsuccess = safe(() => { fault('before-ticket-commit'); setResult(entry); });
                            });
                        });
                    });
                },
                async recover() {
                    const state = await readAll();
                    if (!state.library && (state.metadata || state.outbox)) fail('CORRUPT_STATE');
                    if (state.library) {
                        strictLibrary(state.library.library);
                        if (typeof state.library.libraryId !== 'string' || !Number.isSafeInteger(state.library.localRevision) || state.library.localRevision < 1 ||
                            (integration ? typeof state.metadata?.syncDirty !== 'boolean' : !state.metadata?.syncDirty) || state.metadata.dirtyRevision !== state.library.localRevision) fail('CORRUPT_STATE');
                    }
                    if (state.outbox) {
                        await (integration?.validateTicket || validateTicket)(state.outbox.ticket);
                        if (!(integration ? ['prepared', 'verified'] : ['prepared']).includes(state.outbox.stage) || state.outbox.ticket.localRevision > state.library.localRevision || state.outbox.ticket.libraryId !== state.library.libraryId) fail('CORRUPT_STATE');
                    }
                    return { ...state, needsTicket: Boolean(state.metadata?.syncDirty && !state.outbox),
                        newerDirtyRevision: Boolean(state.outbox && state.library.localRevision > state.outbox.ticket.localRevision) };
                },
                async migrationPreview(readLegacy) {
                    const raw = readLegacy(); // Caller supplies a synthetic legacy origin; no automatic localStorage access.
                    if (raw === null) fail('LEGACY_MISSING');
                    let library;
                    try { library = strictLibrary(JSON.parse(raw)); } catch { fail('LEGACY_INVALID'); }
                    return { raw, library, sourceHash: await digest(raw) };
                },
                async migrationCopy(preview, readLegacy) {
                    if (preview.sourceHash !== await digest(preview.raw) || canonical(strictLibrary(JSON.parse(preview.raw))) !== canonical(preview.library)) fail('LEGACY_INVALID');
                    if (readLegacy() !== preview.raw) fail('LEGACY_CHANGED');
                    const saved = await commitLibrary(preview.library, 0, { sourceHash: preview.sourceHash, status: 'copy-only-unverified' });
                    fault('after-migration-commit');
                    const readback = await readAll();
                    if (canonical(saved) !== canonical(readback.library)) fail('READBACK_MISMATCH');
                    const sourceUnchanged = readLegacy() === preview.raw;
                    return { readback, sourceUnchanged, authoritative: false, status: sourceUnchanged ? 'copy-verified-no-cutover' : 'source-changed-no-cutover' };
                },
            });
        };
    });
}
