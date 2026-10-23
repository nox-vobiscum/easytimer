export function createTimer(durationMs = 300000, policy = 'quick') {
    if (!['quick', 'session'].includes(policy) || !Number.isSafeInteger(durationMs) || durationMs <= 0 || durationMs > (policy === 'session' ? 360000000 : 359999000)) throw new RangeError('Invalid duration');
    return { status: 'READY', durationMs, adjustmentMs: 0, remainingMs: durationMs, deadlineMs: null, overtimeMs: 0, ...(policy === 'session' ? { policy } : {}) };
}
export function durationFromFields(...fields) {
    if (fields.length !== 3 || fields.some(v => !/^\d+$/.test(String(v)))) return null;
    const [h, m, s] = fields.map(Number);
    if (h > 99 || m > 59 || s > 59) return null;
    return (h * 3600 + m * 60 + s) * 1000 || null;
}
export function transition(state, action, now) {
    if (!Number.isFinite(now)) throw new TypeError('Invalid clock');
    let current = state;
    if (state.status === 'RUNNING') {
        const remainingMs = Math.max(0, state.deadlineMs - now);
        current = { ...state, remainingMs, status: remainingMs ? 'RUNNING' : 'FINISHED', overtimeMs: Math.max(0, now - state.deadlineMs) };
    } else if (state.status === 'FINISHED') {
        current = { ...state, overtimeMs: Math.max(0, now - state.deadlineMs) };
    }
    switch (action.type) {
        case 'TICK': return current;
        case 'CONFIGURE': return current.status === 'READY' ? createTimer(action.durationMs, current.policy) : current;
        case 'ADJUST': {
            if (current.policy === 'session') return current;
            if (!Number.isSafeInteger(action.amountMs) || action.amountMs <= 0 || current.durationMs + current.adjustmentMs + action.amountMs > 359999000) return current;
            if (current.status === 'READY') return createTimer(current.durationMs + action.amountMs);
            const adjustmentMs = current.adjustmentMs + action.amountMs;
            if (current.status === 'PAUSED') return { ...current, adjustmentMs, remainingMs: current.remainingMs + action.amountMs };
            const deadlineMs = current.deadlineMs + action.amountMs;
            const remainingMs = Math.max(0, deadlineMs - now);
            return { ...current, adjustmentMs, deadlineMs, remainingMs, overtimeMs: Math.max(0, now - deadlineMs), status: remainingMs ? 'RUNNING' : 'FINISHED' };
        }
        case 'START':
            if (!['READY', 'FINISHED'].includes(current.status)) return current;
            return { ...createTimer(current.durationMs, current.policy), status: 'RUNNING', deadlineMs: now + current.durationMs };
        case 'PAUSE': return current.status === 'RUNNING' ? { ...current, status: 'PAUSED', deadlineMs: null } : current;
        case 'RESUME': return current.status === 'PAUSED' ? { ...current, status: 'RUNNING', deadlineMs: now + current.remainingMs, overtimeMs: 0 } : current;
        case 'RESTART': return { ...createTimer(current.durationMs, current.policy), status: 'RUNNING', deadlineMs: now + current.durationMs };
        case 'STOP': return createTimer(current.durationMs, current.policy);
        case 'BEGIN_OVERTIME': return current.policy === 'session' ? { ...current, status: 'FINISHED', remainingMs: 0, overtimeMs: 0, deadlineMs: now } : current;
        case 'PAUSE_OVERTIME': return current.policy === 'session' && current.status === 'FINISHED' ? { ...current, status: 'OVERTIME_PAUSED', deadlineMs: null } : current;
        case 'RESUME_OVERTIME': return current.policy === 'session' && current.status === 'OVERTIME_PAUSED' ? { ...current, status: 'FINISHED', deadlineMs: now - current.overtimeMs } : current;
        case 'STOP_OVERTIME': return current.policy === 'session' && ['FINISHED', 'OVERTIME_PAUSED'].includes(current.status) ? { ...current, status: 'OVERTIME_STOPPED', deadlineMs: null } : current;
        default: throw new TypeError('Unknown action');
    }
}
export function formatTime(ms) {
    const seconds = Math.ceil(Math.max(0, ms) / 1000);
    const parts = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60];
    return (parts[0] ? parts : parts.slice(1)).map(v => String(v).padStart(2, '0')).join(':');
}
export function timeBudget(state) {
    const totalMs = state.durationMs + state.adjustmentMs;
    return {
        plannedMs: state.durationMs,
        adjustmentMs: state.adjustmentMs,
        totalMs,
        elapsedMs: state.status === 'READY' ? 0 : totalMs - state.remainingMs + state.overtimeMs,
    };
}
export function formatOvertime(ms) {
    const seconds = Math.floor(Math.max(0, ms) / 1000);
    const parts = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60];
    return `+${(parts[0] ? parts : parts.slice(1)).map(v => String(v).padStart(2, '0')).join(':')}`;
}
