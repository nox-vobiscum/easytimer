import { activatePlannedExecutionInRecord } from './editor-storage.mjs';

export function createEditorRuntimeBridge({ writer, activeLock }) {
    return {
        async activatePlanned(options) {
            await activeLock.claim();
            return writer.write(record => activatePlannedExecutionInRecord(record, options));
        },
    };
}
