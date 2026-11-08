import {
    applyStartedSessionActionInRecord,
    activatePlannedExecutionInRecord,
    startReadyExecutionInRecord,
} from './editor-storage.mjs';

const fail = code => { throw new Error(code); };

export function createEditorRuntimeBridge({ writer, activeLock }) {
    let pendingOperation = null;
    let busy = false;

    async function writeOperation(kind, options, transform, claimOwnership) {
        if (pendingOperation !== null) fail(kind === 'activation' ? 'pendingActivation' : 'pendingOperation');
        if (busy) fail('bridgeBusy');
        if (!claimOwnership && !activeLock.held) fail('activeLockRequired');
        busy = true;
        let source = null;
        let target = null;
        try {
            if (claimOwnership) await activeLock.claim();
            return await writer.write(record => {
                if (!activeLock.held) fail('activeLockRequired');
                source = structuredClone(record);
                target = structuredClone(transform(record, options));
                return target;
            });
        } catch (error) {
            if ((error?.message === 'storageUnconfirmed' || error?.message === 'storageReadback')
                && source !== null && target !== null) {
                pendingOperation = {
                    kind,
                    source: structuredClone(source),
                    target: structuredClone(target),
                };
            }
            throw error;
        } finally {
            busy = false;
        }
    }

    async function reconcile(expectedKind, includeKind) {
        if (pendingOperation === null || (expectedKind !== null && pendingOperation.kind !== expectedKind)) {
            fail(expectedKind === 'activation' ? 'noPendingActivation' : 'noPendingOperation');
        }
        if (!activeLock.held) fail('activeLockRequired');
        if (busy) fail('bridgeBusy');
        busy = true;
        const pending = pendingOperation;
        try {
            const record = await writer.read();
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
        reconcilePendingActivation() {
            return reconcile('activation', false);
        },
        reconcilePendingOperation() {
            return reconcile(null, true);
        },
    };
}
