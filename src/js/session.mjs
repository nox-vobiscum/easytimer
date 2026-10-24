import { createTimer, transition } from './timer.mjs?v=27';
import { validateTemplate } from './templates.mjs?v=27';

export function prepareSession(template, runId = crypto.randomUUID()) {
    const snapshot = validateTemplate(template);
    if (snapshot.transitionMode !== 'manual') throw new RangeError('Automatic execution is not supported');
    return {
        run: { runId, sourceTemplateId: snapshot.id, name: snapshot.name, phases: snapshot.phases,
            currentIndex: 0, stage: 'PHASE', phaseOvertime: {} },
        clock: createTimer(snapshot.phases[0].durationSeconds * 1000, 'session'),
    };
}

export function sessionRemaining(run, clock) {
    if (run.stage === 'COMPLETED') return 0;
    return clock.remainingMs + run.phases.slice(run.currentIndex + 1).reduce((sum, phase) => sum + phase.durationSeconds * 1000, 0);
}

export function hasSessionProgress(run, clock) {
    return run.currentIndex > 0 || run.stage === 'COMPLETED' || clock.status !== 'READY';
}

// The caller owns this one clock. Session metadata never runs an independent timer.
export function transitionSession(run, clock, action, now) {
    if (clock.policy !== 'session') throw new TypeError('Invalid session clock');
    let current = transition(clock, { type: 'TICK' }, now);
    const last = run.currentIndex === run.phases.length - 1;
    const settle = () => ({ ...run.phaseOvertime, [run.phases[run.currentIndex].id]: current.overtimeMs });
    let type = action.type;
    if (type === 'PRIMARY') {
        type = current.status === 'READY' ? 'START' : ['RUNNING', 'FINISHED'].includes(current.status) ? 'PAUSE' : 'RESUME';
    }
    switch (type) {
        case 'TICK': break;
        case 'START':
            if (run.stage === 'PHASE' && current.status === 'READY') current = transition(current, { type: 'START' }, now);
            break;
        case 'PAUSE': current = transition(current, { type: current.status === 'FINISHED' ? 'PAUSE_OVERTIME' : 'PAUSE' }, now); break;
        case 'RESUME': current = transition(current, { type: current.status === 'OVERTIME_PAUSED' ? 'RESUME_OVERTIME' : 'RESUME' }, now); break;
        case 'NEXT':
            if (run.stage === 'PHASE' && !last) {
                run = { ...run, currentIndex: run.currentIndex + 1, phaseOvertime: settle() };
                current = createTimer(run.phases[run.currentIndex].durationSeconds * 1000, 'session');
            }
            break;
        case 'COMPLETE':
            if (run.stage === 'PHASE' && last) {
                run = { ...run, stage: 'COMPLETED', phaseOvertime: settle() };
                current = transition(current, { type: 'BEGIN_OVERTIME' }, now);
            }
            break;
        case 'STOP_OVERTIME':
            if (run.stage === 'COMPLETED') current = transition(current, { type }, now);
            break;
        case 'STOP_WORKSHOP':
            run = { ...run, stage: 'PHASE', currentIndex: 0, phaseOvertime: {} };
            current = createTimer(run.phases[0].durationSeconds * 1000, 'session');
            break;
        default: throw new TypeError('Unknown session action');
    }
    return { run, clock: current };
}
