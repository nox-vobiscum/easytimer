export function createTimer(durationMs = 300000) {
    if (!Number.isSafeInteger(durationMs) || durationMs <= 0 || durationMs > 359999000) throw new RangeError('Invalid duration');
    return { status: 'READY', durationMs, remainingMs: durationMs, deadlineMs: null };
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
        current = { ...state, remainingMs, status: remainingMs ? 'RUNNING' : 'FINISHED', deadlineMs: remainingMs ? state.deadlineMs : null };
    }
    switch (action.type) {
        case 'TICK': return current;
        case 'CONFIGURE': return ['READY', 'FINISHED'].includes(current.status) ? createTimer(action.durationMs) : current;
        case 'START':
            if (!['READY', 'FINISHED'].includes(current.status)) return current;
            return { ...current, status: 'RUNNING', remainingMs: current.durationMs, deadlineMs: now + current.durationMs };
        case 'PAUSE': return current.status === 'RUNNING' ? { ...current, status: 'PAUSED', deadlineMs: null } : current;
        case 'RESUME': return current.status === 'PAUSED' ? { ...current, status: 'RUNNING', deadlineMs: now + current.remainingMs } : current;
        case 'RESTART': return { ...current, status: 'RUNNING', remainingMs: current.durationMs, deadlineMs: now + current.durationMs };
        case 'STOP': return createTimer(current.durationMs);
        default: throw new TypeError('Unknown action');
    }
}
export function formatTime(ms) {
    const seconds = Math.ceil(Math.max(0, ms) / 1000);
    const parts = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60];
    return (parts[0] ? parts : parts.slice(1)).map(v => String(v).padStart(2, '0')).join(':');
}
