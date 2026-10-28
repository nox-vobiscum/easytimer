import { createTimer, transition } from './timer.mjs?v=53';
import { transitionSession } from './session.mjs?v=53';
import { validateTemplate } from './templates.mjs?v=37';

const PREFIX = 'easyTimerRuntime.v1.';
const CONTEXT = 'easyTimerRuntimeContext.v1';
const integer = value => Number.isSafeInteger(value) && value >= 0;
const exact = (value, keys) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const actual = Object.keys(value).sort(), expected = [...keys].sort();
    return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
};

function validateRun(run) {
    if (!exact(run, ['runId', 'sourceTemplateId', 'name', 'phases', 'transitionMode', 'currentIndex', 'stage', 'phaseOvertime'])
        || typeof run.runId !== 'string' || !run.runId.trim()) throw new Error('INVALID_RUN');
    const snapshot = validateTemplate({ id: run.sourceTemplateId, name: run.name, phases: run.phases, transitionMode: run.transitionMode });
    if (snapshot.name !== run.name || JSON.stringify(snapshot.phases) !== JSON.stringify(run.phases)
        || !integer(run.currentIndex) || run.currentIndex >= run.phases.length
        || !['PHASE', 'COMPLETED'].includes(run.stage)
        || (run.stage === 'COMPLETED' && run.currentIndex !== run.phases.length - 1)) throw new Error('INVALID_PHASE');
    const settled = run.phases.slice(0, run.stage === 'COMPLETED' ? run.phases.length : run.currentIndex);
    if (!exact(run.phaseOvertime, settled.map(phase => phase.id))
        || Object.values(run.phaseOvertime).some(value => !integer(value) || (run.transitionMode === 'automatic' && value !== 0))) throw new Error('INVALID_STATISTICS');
}

// Runtime records are separate from saved Rundowns, exports and account data.
export function validateRuntime(record) {
    const keys = ['schemaVersion', 'contextId', 'savedAt', 'mode', 'clock'];
    if (record && Object.hasOwn(record, 'startedAt')) keys.push('startedAt');
    if (record && Object.hasOwn(record, 'recoveryPending')) keys.push('recoveryPending');
    if (record?.mode === 'session') keys.push('run', 'quickDurationMs');
    if (!exact(record, keys)
        || record.schemaVersion !== 1 || !['quick', 'session'].includes(record.mode)
        || typeof record.contextId !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(record.contextId) || !integer(record.savedAt)) throw new Error('INVALID_RUNTIME');
    if (Object.hasOwn(record, 'startedAt') && record.startedAt !== null && !integer(record.startedAt)) throw new Error('INVALID_START');
    if (Object.hasOwn(record, 'recoveryPending') && typeof record.recoveryPending !== 'boolean') throw new Error('INVALID_RECOVERY_DECISION');
    const session = record.mode === 'session';
    if (session) { validateRun(record.run); createTimer(record.quickDurationMs); }
    const c = record.clock;
    const clockKeys = ['status', 'durationMs', 'adjustmentMs', 'remainingMs', 'deadlineMs', 'overtimeMs'];
    if (session) clockKeys.push('policy');
    if (!exact(c, clockKeys)
        || !['READY', 'RUNNING', 'PAUSED', 'FINISHED', ...(session ? ['OVERTIME_PAUSED', 'OVERTIME_STOPPED'] : [])].includes(c.status)) throw new Error('INVALID_CLOCK');
    createTimer(c.durationMs, session ? 'session' : 'quick');
    if (!session && ((c.status === 'READY' && record.startedAt != null) || (c.durationMs === 0 && c.status !== 'READY'))) throw new Error('INVALID_START');
    if (session && (c.policy !== 'session' || c.adjustmentMs !== 0
        || c.durationMs !== record.run.phases[record.run.currentIndex].durationSeconds * 1000
        || (record.run.stage === 'COMPLETED' && !['FINISHED', 'OVERTIME_PAUSED', 'OVERTIME_STOPPED'].includes(c.status))
        || (record.run.stage === 'PHASE' && (c.status === 'OVERTIME_STOPPED'
            || (record.run.transitionMode === 'automatic' && c.status === 'OVERTIME_PAUSED'))))) throw new Error('INVALID_SESSION_CLOCK');
    const total = c.durationMs + c.adjustmentMs;
    if (!Number.isSafeInteger(c.adjustmentMs) || ![c.remainingMs, c.overtimeMs].every(integer) || !Number.isSafeInteger(total) || total < 0
        || total > (session ? 360000000 : 359999000) || c.remainingMs > total) throw new Error('INVALID_BUDGET');
    if (['READY', 'PAUSED'].includes(c.status)) {
        if (c.deadlineMs !== null || c.overtimeMs !== 0 || (session && c.remainingMs <= 0)) throw new Error('INVALID_PAUSE');
        if (c.status === 'READY' && (c.adjustmentMs !== 0 || c.remainingMs !== c.durationMs)) throw new Error('INVALID_READY');
    } else if (['OVERTIME_PAUSED', 'OVERTIME_STOPPED'].includes(c.status)) {
        if (c.deadlineMs !== null || c.remainingMs !== 0) throw new Error('INVALID_OVERTIME');
    } else {
        if (!integer(c.deadlineMs) || (c.status === 'RUNNING' && (c.remainingMs <= 0 || c.overtimeMs !== 0))
            || (c.status === 'FINISHED' && c.remainingMs !== 0)) throw new Error('INVALID_DEADLINE');
        const calculated = transition(c, { type: 'TICK' }, record.savedAt);
        if (calculated.status !== c.status || calculated.remainingMs !== c.remainingMs || calculated.overtimeMs !== c.overtimeMs) throw new Error('INCONSISTENT_CLOCK');
    }
    if (session) {
        const reconciled = transitionSession(record.run, c, { type: 'TICK' }, record.savedAt);
        if (JSON.stringify(reconciled.run) !== JSON.stringify(record.run)
            || JSON.stringify(reconciled.clock) !== JSON.stringify(c)) throw new Error('UNRECONCILED_SESSION');
    }
    return structuredClone(record);
}

export function restoreRuntime(record, now) {
    const valid = validateRuntime(record);
    if (!integer(now) || (now < valid.savedAt && ['RUNNING', 'FINISHED'].includes(valid.clock.status))) throw new Error('CLOCK_ANOMALY');
    return valid.mode === 'session'
        ? { ...transitionSession(valid.run, valid.clock, { type: 'TICK' }, now), quickDurationMs: valid.quickDurationMs }
        : transition(valid.clock, { type: 'TICK' }, now);
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
    let previousRunId = null;
    let cachedRun = null;
    let runSemantic = null;
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
    let pending = false;
    try {
        if (!locks?.request) throw new Error('ISOLATION_UNAVAILABLE');
        const previous = tabs.getItem(CONTEXT);
        if (previous && /^[a-zA-Z0-9-]{1,80}$/.test(previous) && await claim(previous)) {
            id = previous;
            if (storage.getItem(PREFIX + id) !== null) {
                try {
                    const saved = read(id);
                    pending = saved.recoveryPending === true;
                    restored = restoreRuntime(saved, now());
                    startedAt = saved.startedAt ?? null;
                    previousStatus = saved.clock.status;
                    previousRunId = saved.run?.runId ?? null;
                }
                catch (cause) { error = cause.message; }
            }
        } else {
            id = uuid();
            if (!await claim(id)) throw new Error('ISOLATION_UNAVAILABLE');
        }
        tabs.setItem(CONTEXT, id);
        // An unresolved choice survives restoring this tab's independent fallback clock.
        for (let index = 0; index < storage.length; index++) {
            if (restored && !pending) break;
            const key = storage.key(index);
            if (!key?.startsWith(PREFIX) || key === PREFIX + id) continue;
            try { candidates.push(read(key.slice(PREFIX.length))); }
            catch { error ||= 'INVALID_RUNTIME'; }
        }
        pending ||= candidates.length > 0;
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
        get pending() { return pending; },
        get candidates() { return candidates.map(record => ({ ...structuredClone(record), activeElsewhere: activity.get(record.contextId) ?? null })); },
        refreshAvailability,
        // Only semantic transitions write. Deadline-based ticks need no persistence.
        save(clock, action = null, run = null, quickDurationMs = 300000) {
            if (!healthy) return false;
            if (run?.runId !== (previousRunId ?? undefined)) startedAt = null;
            if (!clock || (!run && clock.status === 'READY') || action === 'STOP_WORKSHOP') startedAt = null;
            else if (clock.status === 'RUNNING' && ((!run && action === 'RESTART')
                || (['START', 'PRIMARY'].includes(action) && previousStatus === 'READY' && (!run || run.currentIndex === 0) && startedAt === null)
                || (!run && action === 'START' && previousStatus === 'FINISHED'))) {
                // START/RESTART reset the original budget in the existing engine.
                startedAt = clock.deadlineMs - clock.durationMs;
            }
            previousStatus = clock?.status ?? null;
            previousRunId = run?.runId ?? null;
            // Session metadata is immutable in the coordinator; ordinary ticks reuse it.
            if (run !== cachedRun) { cachedRun = run; runSemantic = run ? JSON.stringify(run) : null; }
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
                startedAt, recoveryPending: pending, run: runSemantic, ...(run ? { quickDurationMs } : {}),
                ...(['PAUSED', 'OVERTIME_PAUSED', 'OVERTIME_STOPPED'].includes(clock.status) ? { remainingMs: clock.remainingMs, overtimeMs: clock.overtimeMs } : {}) }) : 'none';
            if (semantic === lastSemantic) return true;
            try {
                if (clock) {
                    const savedAt = now();
                    const current = run ? transitionSession(run, clock, { type: 'TICK' }, savedAt) : { clock: transition(clock, { type: 'TICK' }, savedAt) };
                    const record = validateRuntime({ schemaVersion: 1, contextId: id, savedAt, mode: run ? 'session' : 'quick', startedAt,
                        ...(pending ? { recoveryPending: true } : {}),
                        clock: current.clock, ...(run ? { run: current.run, quickDurationMs } : {}) });
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
                startedAt = saved.startedAt ?? null;
                previousStatus = saved.clock.status; previousRunId = saved.run?.runId ?? null;
                oldRelease(); id = candidateId; lastSemantic = null; candidates = []; pending = false;
                return clock;
            } catch (cause) {
                if (acquired) { release(); release = oldRelease; }
                lastSemantic = null;
                throw cause;
            } finally { recovering = false; }
        },
        dismiss() { candidates = []; pending = false; },
        close() { release?.(); healthy = false; },
    };
}
