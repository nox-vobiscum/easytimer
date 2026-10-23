// Test-browser clock only. Nothing in src imports this module.
export function durationMs(value) {
    const match=typeof value==='string' ? /^(\d+(?:\.\d+)?)(ms|s|m|h)$/.exec(value) : null;
    const result=typeof value==='number' ? value : match ? Number(match[1])*{ms:1,s:1000,m:60000,h:3600000}[match[2]] : NaN;
    if(!Number.isSafeInteger(result)||result<0) throw new RangeError('Use a non-negative whole millisecond count or duration such as 10s, 2m, 1.5h or 1250ms');
    return result;
}

export function createVirtualClock(evaluate) {
    return {
        async install(now=1700000000000) {
            if(!Number.isSafeInteger(now)||now<0) throw new RangeError('Invalid virtual timestamp');
            return evaluate(`(()=>{if(globalThis.__easyTimerTestClock)throw new Error('Virtual clock already installed');globalThis.__easyTimerTestClock={original:Date.now,now:${now}};Date.now=()=>globalThis.__easyTimerTestClock.now;return Date.now();})()`);
        },
        async advance(amount) {
            const delta=durationMs(amount);
            return evaluate(`(()=>{const clock=globalThis.__easyTimerTestClock;if(!clock)throw new Error('Virtual clock not installed');const next=clock.now+${delta};if(!Number.isSafeInteger(next))throw new RangeError('Virtual timestamp overflow');clock.now=next;document.dispatchEvent(new Event('visibilitychange'));return next;})()`);
        },
        async restore() {
            return evaluate(`(()=>{const clock=globalThis.__easyTimerTestClock;if(!clock)return false;Date.now=clock.original;delete globalThis.__easyTimerTestClock;return true;})()`);
        },
    };
}
