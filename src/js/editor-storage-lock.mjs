import { createEditorStore } from './editor-storage.mjs';

export const EDITOR_STORE_WRITE_LOCK = 'easyTimerEditor.v1.write';

const fail = code => { throw new Error(code); };

export function createEditorStoreWriter({ getStorage, locks }) {
    async function withLock(operation) {
        if (!locks || typeof locks.request !== 'function') fail('lockUnavailable');
        let callbackError = null;
        try {
            return await locks.request(
                EDITOR_STORE_WRITE_LOCK,
                { mode: 'exclusive', ifAvailable: true },
                lock => {
                    try {
                        if (!lock) fail('lockBusy');
                        return operation();
                    } catch (error) {
                        callbackError = error;
                        throw error;
                    }
                },
            );
        } catch (error) {
            if (error === callbackError) throw error;
            fail('lockRequest');
        }
    }

    return {
        read() {
            return withLock(() => createEditorStore(getStorage).load());
        },
        write(transform) {
            return withLock(() => {
                if (typeof transform !== 'function') fail('invalidTransform');
                const store = createEditorStore(getStorage);
                const current = store.load();
                const target = transform(current);
                if (target !== null
                    && (typeof target === 'object' || typeof target === 'function')
                    && typeof target.then === 'function') {
                    Promise.resolve(target).catch(() => {});
                    fail('asyncTransform');
                }
                return store.save(target, current.revision);
            });
        },
    };
}
