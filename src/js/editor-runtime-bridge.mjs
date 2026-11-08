import { activatePlannedExecutionInRecord } from './editor-storage.mjs';

const fail = code => { throw new Error(code); };

export function createEditorRuntimeBridge({ writer, activeLock }) {
    let pendingActivation = null;

    return {
        async activatePlanned(options) {
            if (pendingActivation !== null) fail('pendingActivation');
            await activeLock.claim();
            let source = null;
            let target = null;
            try {
                const confirmed = await writer.write(record => {
                    source = structuredClone(record);
                    target = structuredClone(activatePlannedExecutionInRecord(record, options));
                    return target;
                });
                return confirmed;
            } catch (error) {
                if ((error?.message === 'storageUnconfirmed' || error?.message === 'storageReadback')
                    && source !== null && target !== null) {
                    pendingActivation = {
                        source: structuredClone(source),
                        target: structuredClone(target),
                    };
                }
                throw error;
            }
        },
        async reconcilePendingActivation() {
            if (pendingActivation === null) fail('noPendingActivation');
            if (!activeLock.held) fail('activeLockRequired');
            const record = await writer.read();
            const raw = JSON.stringify(record);
            let outcome = 'conflict';
            if (raw === JSON.stringify(pendingActivation.target)) outcome = 'target';
            else if (raw === JSON.stringify(pendingActivation.source)) outcome = 'source';
            const result = { outcome, record: structuredClone(record) };
            if (outcome !== 'conflict') pendingActivation = null;
            return result;
        },
    };
}
