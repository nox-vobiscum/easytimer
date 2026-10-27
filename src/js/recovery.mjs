import { createTimer, transition } from './timer.mjs?v=35';

const PREFIX = 'easyTimerRuntime.v1.';
const CONTEXT = 'easyTimerRuntimeContext.v1';
const integer = value => Number.isSafeInteger(value) && value >= 0;
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join(',') === [...keys].sort().join(',');

// Runtime records are separate from saved Rundowns, exports and account data.
export function validateRuntime(record) {
    const keys = ['schemaVersion', 'contextId', 'savedAt', 'mode', 'clock'];
    if (record && Object.hasOwn(record, 'startedAt')) keys.push('startedAt');
    if (!exact(record, keys)
        || record.schemaVersion !== 1 || record.mode !== 'quick'
        || typeof record.contextId !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(record.contextId) || !integer(record.savedAt)) throw new Error('INVALID_RUNTIME');
    if (Object.hasOwn(record, 'startedAt') && record.startedAt !== null && !integer(record.startedAt)) throw new Error('INVALID_START');
    const c = record.clock;
    if (!exact(c, ['status', 'durationMs', 'adjustmentMs', 'remainingMs', 'deadlineMs', 'overtimeMs'])
        || !['READY', 'RUNNING', 'PAUSED', 'FINISHED'].includes(c.status)) throw new Error('INVALID_CLOCK');
    createTimer(c.durationMs);
    if (c.status === 'READY' && record.startedAt != null) throw new Error('INVALID_START');
    const total = c.durationMs + c.adjustmentMs;
    if (![c.adjustmentMs, c.remainingMs, c.overtimeMs].every(integer) || !Number.isSafeInteger(total)
        || total > 359999000 || c.remainingMs > total) throw new Error('INVALID_BUDGET');
    if (['READY', 'PAUSED'].includes(c.status)) {
        if (c.deadlineMs !== null || c.overtimeMs !== 0 || c.remainingMs <= 0) throw new Error('INVALID_PAUSE');
        if (c.status === 'READY' && (c.adjustmentMs !== 0 || c.remainingMs !== c.durationMs)) throw new Error('INVALID_READY');
    } else {
        if (!integer(c.deadlineMs) || (c.status === 'RUNNING' && (c.remainingMs <= 0 || c.overtimeMs !== 0))
            || (c.status === 'FINISHED' && c.remainingMs !== 0)) throw new Error('INVALID_DEADLINE');
        const calculated = transition(c, { type: 'TICK' }, record.savedAt);
        if (calculated.status !== c.status || calculated.remainingMs !== c.remainingMs || calculated.overtimeMs !== c.overtimeMs) throw new Error('INCONSISTENT_CLOCK');
    }
    return structuredClone(record);
}

export function restoreRuntime(record, now) {
    const valid = validateRuntime(record);
    if (!integer(now) || (now < valid.savedAt && ['RUNNING', 'FINISHED'].includes(valid.clock.status))) throw new Error('CLOCK_ANOMALY');
    return transition(valid.clock, { type: 'TICK' }, now);
}

// A live Web Lock is the ownership authority, not a racy localStorage lease.
// Neither timestamps nor a copied sessionStorage ID can grant ownership.
export async function createRecovery({ storage, tabs, locks, now = () => Date.now(), uuid = () => crypto.randomUUID() }) {
    let id;
    let release;
    let healthy = true;
    let lastSemantic = null;
    let error = null;
    let recovering = false;
    let startedAt = null;
    let previousStatus = null;
    const activity = new Map();
    let lastObserved = now();
    const claim = async candidate => {
        let resolve;
        const acquired = new Promise(done => { resolve = done; });
        locks.request(`${PREFIX}${candidate}`, { ifAvailable: true }, lock => {
            if (!lock) { resolve(false); return; }
            return new Promise(done => { release = done; resolve(true); });
        }).catch(() => resolve(false));
        return acquired;
    };
    const fail = reason => { healthy = false; error = reason; };
    const read = key => {
        const record = validateRuntime(JSON.parse(storage.getItem(PREFIX + key)));
        if (record.contextId !== key) throw new Error('INVALID_CONTEXT');
        restoreRuntime(record, now());
        return record;
    };
    let restored = null;
    let candidates = [];
    try {
        if (!locks?.request) throw new Error('ISOLATION_UNAVAILABLE');
        const previous = tabs.getItem(CONTEXT);
        if (previous && /^[a-zA-Z0-9-]{1,80}$/.test(previous) && await claim(previous)) {
            id = previous;
            if (storage.getItem(PREFIX + id) !== null) {
                try {
                    const saved = read(id);
                    restored = restoreRuntime(saved, now());
                    startedAt = saved.startedAt ?? null;
                    previousStatus = saved.clock.status;
                }
                catch (cause) { error = cause.message; }
            }
        } else {
            id = uuid();
            if (!await claim(id)) throw new Error('ISOLATION_UNAVAILABLE');
        }
        tabs.setItem(CONTEXT, id);
        // An unambiguous same-tab restore must not become a restart chooser.
        for (let index = 0; index < storage.length; index++) {
            if (restored) break;
            const key = storage.key(index);
            if (!key?.startsWith(PREFIX) || key === PREFIX + id) continue;
            try { candidates.push(read(key.slice(PREFIX.length))); }
            catch { error ||= 'INVALID_RUNTIME'; }
        }
    } catch (cause) { fail(cause.message); }

    const refreshAvailability = async () => {
        // An advisory, read-only observation. Only claim() can grant ownership.
        try {
            if (!candidates.length || !locks?.query) return;
            const { held } = await locks.query();
            const names = new Set(held.map(lock => lock.name));
            for (const candidate of candidates) activity.set(candidate.contextId, names.has(PREFIX + candidate.contextId));
        } catch { activity.clear(); }
    };
    await refreshAvailability();

    return {
        restored,
        get error() { return error; },
        get candidates() { return candidates.map(record => ({ ...structuredClone(record), activeElsewhere: activity.get(record.contextId) ?? null })); },
        refreshAvailability,
        // Only semantic transitions write. Deadline-based ticks need no persistence.
        save(clock, action = null) {
            if (!healthy) return false;
            if (!clock || clock.status === 'READY') startedAt = null;
            else if (clock.status === 'RUNNING' && (action === 'RESTART'
                || (action === 'START' && ['READY', 'FINISHED'].includes(previousStatus)))) {
                // START/RESTART reset the original budget in the existing engine.
                startedAt = clock.deadlineMs - clock.durationMs;
            }
            previousStatus = clock?.status ?? null;
            const observed = now();
            if (!integer(observed) || (observed < lastObserved && clock && ['RUNNING', 'FINISHED'].includes(clock.status))) {
                try { tabs.removeItem(CONTEXT); storage.removeItem(PREFIX + id); } catch { /* Warn instead of promising recovery. */ }
                fail('CLOCK_ANOMALY'); return false;
            }
            // Frozen/READY clocks do not derive elapsed time from wall-clock changes.
            if (observed < lastObserved) lastSemantic = null;
            lastObserved = observed;
            const semantic = clock ? JSON.stringify({ status: clock.status, durationMs: clock.durationMs,
                adjustmentMs: clock.adjustmentMs, deadlineMs: clock.deadlineMs,
                startedAt, ...(clock.status === 'PAUSED' ? { remainingMs: clock.remainingMs } : {}) }) : 'none';
            if (semantic === lastSemantic) return true;
            try {
                if (clock) {
                    const savedAt = now();
                    const record = validateRuntime({ schemaVersion: 1, contextId: id, savedAt, mode: 'quick', startedAt,
                        clock: transition(clock, { type: 'TICK' }, savedAt) });
                    storage.setItem(PREFIX + id, JSON.stringify(record));
                } else storage.removeItem(PREFIX + id);
                lastSemantic = semantic;
                return true;
            } catch {
                // Invalidate the association and obsolete record where storage permits.
                try { tabs.removeItem(CONTEXT); } catch { /* No recovery guarantee. */ }
                try { storage.removeItem(PREFIX + id); } catch { /* Report failure visibly. */ }
                fail('STORAGE_UNAVAILABLE');
                return false;
            }
        },
        async recover(candidateId, accept = () => true) {
            if (!healthy || recovering || !candidates.some(record => record.contextId === candidateId)) throw new Error('RECOVERY_UNAVAILABLE');
            recovering = true;
            // Keep the current lock until the selected context is proven unowned.
            const oldRelease = release;
            let acquired = false;
            try {
                acquired = await claim(candidateId);
                if (!acquired) { activity.set(candidateId, true); throw new Error('CONTEXT_ACTIVE'); }
                const saved = read(candidateId);
                const clock = restoreRuntime(saved, now());
                if (!healthy || !accept()) throw new Error('STALE_RECOVERY');
                // The explicitly replaced current timer must not reappear as a candidate.
                storage.removeItem(PREFIX + id);
                tabs.setItem(CONTEXT, candidateId);
                startedAt = saved.startedAt ?? null; previousStatus = clock.status;
                oldRelease(); id = candidateId; lastSemantic = null; candidates = [];
                return clock;
            } catch (cause) {
                if (acquired) { release(); release = oldRelease; }
                lastSemantic = null;
                throw cause;
            } finally { recovering = false; }
        },
        dismiss() { candidates = []; },
        close() { release?.(); healthy = false; },
    };
}
