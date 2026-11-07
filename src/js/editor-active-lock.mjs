export const EDITOR_ACTIVE_TIMER_LOCK = 'easyTimerEditor.v1.active-runtime';

const failure = code => new Error(code);

export function createEditorActiveTimerLock({ locks }) {
    let owning = false;
    let claiming = false;
    let releasing = null;
    let releaseCallback = null;
    let requestCompletion = null;

    return {
        get held() { return owning; },
        async claim() {
            if (!locks || typeof locks.request !== 'function') throw failure('lockUnavailable');
            if (owning || releasing) throw failure('lockAlreadyHeld');
            if (claiming) throw failure('lockClaimPending');
            claiming = true;

            let settled = false;
            let completion = null;
            let resolveAcquired;
            let rejectAcquired;
            const acquired = new Promise((resolve, reject) => {
                resolveAcquired = () => { if (!settled) { settled = true; resolve(true); } };
                rejectAcquired = error => { if (!settled) { settled = true; reject(error); } };
            });

            try {
                let request;
                try {
                    request = locks.request(
                        EDITOR_ACTIVE_TIMER_LOCK,
                        { mode: 'exclusive', ifAvailable: true },
                        lock => {
                            if (!lock) {
                                rejectAcquired(failure('lockBusy'));
                                return undefined;
                            }
                            owning = true;
                            const heldOpen = new Promise(resolve => { releaseCallback = resolve; });
                            resolveAcquired();
                            return heldOpen;
                        },
                    );
                } catch {
                    rejectAcquired(failure('lockRequest'));
                }

                completion = Promise.resolve(request);
                requestCompletion = completion;
                completion.then(
                    () => {
                        if (!settled) rejectAcquired(failure('lockRequest'));
                        if (requestCompletion !== completion) return;
                        if (owning) owning = false;
                        releaseCallback = null;
                    },
                    () => {
                        rejectAcquired(failure('lockRequest'));
                        if (requestCompletion !== completion) return;
                        owning = false;
                        releaseCallback = null;
                    },
                );
                return await acquired;
            } finally {
                claiming = false;
                if (!owning && requestCompletion === completion) requestCompletion = null;
            }
        },
        async release() {
            if (releasing) return releasing;
            if (!owning || !releaseCallback || !requestCompletion) return false;
            const complete = requestCompletion;
            releaseCallback();
            releasing = (async () => {
                try {
                    await complete;
                    return true;
                } catch {
                    throw failure('lockRequest');
                } finally {
                    owning = false;
                    releaseCallback = null;
                    requestCompletion = null;
                    releasing = null;
                }
            })();
            return releasing;
        },
    };
}
