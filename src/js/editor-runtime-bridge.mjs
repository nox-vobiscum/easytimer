import {
    applyStartedSessionActionInRecord,
    activatePlannedExecutionInRecord,
    discardExecutionInRecord,
    retainExecutionPlanInRecord,
    resumeSuspendedExecutionInRecord,
    startReadyExecutionInRecord,
    suspendActiveExecutionInRecord,
} from './editor-storage.mjs';
import { transitionSession } from './session.mjs';
import { recordExecutionPhaseOutcomes } from './execution-runtime.mjs';

const fail = code => { throw new Error(code); };

export function createEditorRuntimeBridge({ writer, activeLock }) {
    let pendingOperation = null;
    let busy = false;

    async function writeOperation(kind, options, transform, claimOwnership, requireOwnership = true) {
        if (pendingOperation !== null) fail(kind === 'activation' ? 'pendingActivation' : 'pendingOperation');
        if (busy) fail('bridgeBusy');
        if (requireOwnership && !claimOwnership && !activeLock.held) fail('activeLockRequired');
        busy = true;
        let source = null;
        let target = null;
        try {
            if (claimOwnership) await activeLock.claim();
            return await writer.write(record => {
                if (requireOwnership && !activeLock.held) fail('activeLockRequired');
                source = structuredClone(record);
                target = structuredClone(transform(record, options));
                return target;
            });
        } catch (error) {
            if ((error?.message === 'storageUnconfirmed' || error?.message === 'storageReadback'
                || (['retainPlan', 'discard'].includes(kind) && error?.message === 'lockRequest'))
                && source !== null && target !== null) {
                pendingOperation = {
                    kind,
                    requireOwnership,
                    source: structuredClone(source),
                    target: structuredClone(target),
                };
            }
            throw error;
        } finally {
            busy = false;
        }
    }

    async function reconcile(expectedKind, includeKind, expectedIdentity = null) {
        if (pendingOperation === null || (expectedKind !== null && pendingOperation.kind !== expectedKind)) {
            fail(expectedKind === 'activation' ? 'noPendingActivation' : 'noPendingOperation');
        }
        if (expectedIdentity !== null) {
            if (typeof expectedIdentity !== 'object' || Array.isArray(expectedIdentity)
                || Object.keys(expectedIdentity).length !== 2
                || !Object.hasOwn(expectedIdentity, 'executionId')
                || !Object.hasOwn(expectedIdentity, 'runtimeRunId')
                || typeof expectedIdentity.executionId !== 'string'
                || !expectedIdentity.executionId.trim()
                || typeof expectedIdentity.runtimeRunId !== 'string'
                || !expectedIdentity.runtimeRunId.trim()) fail('invalidPendingActivationIdentity');
            const targetRuntime = pendingOperation.target?.activeRuntime;
            if (targetRuntime?.executionId !== expectedIdentity.executionId
                || targetRuntime.run?.runId !== expectedIdentity.runtimeRunId) {
                fail('pendingActivationMismatch');
            }
        }
        if (pendingOperation.requireOwnership && !activeLock.held) fail('activeLockRequired');
        if (busy) fail('bridgeBusy');
        busy = true;
        const pending = pendingOperation;
        try {
            const record = await writer.read();
            if (pending.requireOwnership && !activeLock.held) fail('activeLockRequired');
            const raw = JSON.stringify(record);
            let outcome = 'conflict';
            if (raw === JSON.stringify(pending.target)) outcome = 'target';
            else if (raw === JSON.stringify(pending.source)) outcome = 'source';
            const result = { outcome, record: structuredClone(record) };
            if (includeKind) result.kind = pending.kind;
            if (outcome !== 'conflict' && pendingOperation === pending) pendingOperation = null;
            return result;
        } finally {
            busy = false;
        }
    }

    async function adoptPersistedActive(options = {}) {
        if (pendingOperation !== null) fail('pendingOperation');
        if (busy) fail('bridgeBusy');
        if (options === null || typeof options !== 'object' || Array.isArray(options)) fail('INVALID_RUNTIME');
        const { observedAt } = options;
        if (!Number.isSafeInteger(observedAt) || observedAt < 0) fail('INVALID_RUNTIME');
        busy = true;
        let claimed = false;
        try {
            const initial = await writer.read();
            if (initial.activeRuntime === null) {
                return { outcome: 'none', record: structuredClone(initial), runtime: null };
            }
            if (!activeLock.held) {
                await activeLock.claim();
                claimed = true;
            }
            const record = await writer.read();
            if (!activeLock.held) fail('activeLockRequired');
            if (record.activeRuntime === null) {
                if (claimed) await activeLock.release();
                return { outcome: 'none', record: structuredClone(record), runtime: null };
            }

            const persisted = record.activeRuntime;
            if (observedAt < persisted.savedAt
                && ['RUNNING', 'FINISHED'].includes(persisted.clock.status)) fail('CLOCK_ANOMALY');
            const current = ['RUNNING', 'FINISHED'].includes(persisted.clock.status)
                ? transitionSession(persisted.run, persisted.clock, { type: 'TICK' }, observedAt)
                : { run: persisted.run, clock: persisted.clock };
            return {
                outcome: 'adopted',
                record: structuredClone(record),
                runtime: structuredClone({
                    executionId: persisted.executionId,
                    attemptId: persisted.attemptId,
                    runtimeRevision: persisted.runtimeRevision,
                    persistedAt: persisted.savedAt,
                    observedAt,
                    run: current.run,
                    clock: current.clock,
                    ...(persisted.attemptId === null ? {} : { phaseOutcomes: recordExecutionPhaseOutcomes(
                        record.executions.find(entry => entry.execution.id === persisted.executionId).execution,
                        current.run, current.clock,
                    ).phaseOutcomes }),
                }),
            };
        } catch (error) {
            if (claimed && activeLock.held) await activeLock.release();
            throw error;
        } finally {
            busy = false;
        }
    }

    return {
        activatePlanned(options) {
            return writeOperation('activation', options, activatePlannedExecutionInRecord, true);
        },
        startReady(options) {
            return writeOperation('start', options, startReadyExecutionInRecord, false);
        },
        applySessionAction(options) {
            return writeOperation('sessionAction', options, applyStartedSessionActionInRecord, false);
        },
        suspendActive(options) {
            return writeOperation('suspend', options, suspendActiveExecutionInRecord, false);
        },
        resumeSuspended(options) {
            return writeOperation('resume', options, resumeSuspendedExecutionInRecord, true);
        },
        retainExecutionPlan(options) {
            const snapshot = { ...options };
            return writeOperation('retainPlan', snapshot, retainExecutionPlanInRecord, false,
                snapshot.expectedLifecycle !== 'suspended');
        },
        discardExecution(options) {
            const snapshot = { ...options };
            return writeOperation('discard', snapshot, discardExecutionInRecord, false,
                snapshot.expectedLifecycle !== 'suspended');
        },
        adoptPersistedActive,
        reconcilePendingActivation(expectedIdentity = null) {
            return reconcile('activation', false, expectedIdentity);
        },
        reconcilePendingOperation() {
            return reconcile(null, true);
        },
    };
}
