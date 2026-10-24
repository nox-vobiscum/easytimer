import { formatTime, formatOvertime } from './timer.mjs?v=26';

export function formatTimerReadout(clock) {
    return ['FINISHED', 'OVERTIME_PAUSED', 'OVERTIME_STOPPED'].includes(clock.status)
        ? formatOvertime(clock.overtimeMs) : formatTime(clock.remainingMs);
}

// Fixed buckets use the current timebox budget, never display rounding or percentages.
export function endgameThreshold(durationMs) {
    if (durationMs <= 180000) return 10000;
    if (durationMs <= 600000) return 30000;
    if (durationMs <= 1800000) return 60000;
    if (durationMs <= 3600000) return 180000;
    return 300000;
}

export function timeVisualState(clock, totalMs) {
    if (clock.status === 'READY') return 'NORMAL';
    if (['FINISHED', 'OVERTIME_PAUSED', 'OVERTIME_STOPPED'].includes(clock.status) || clock.remainingMs <= 0) return 'EXPIRED';
    return clock.remainingMs <= endgameThreshold(totalMs) ? 'ENDGAME' : 'NORMAL';
}
