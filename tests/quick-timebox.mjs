// Configure only the disposable test browser through the real READY controls.
// Existing scenarios need exact seconds as well as the eight public minute values.
export async function configureQuickTimebox(evaluate, durationMs, scope = 'window') {
    await evaluate(`(() => {
        const w = ${scope}, button = w.document.querySelector('[data-preset]');
        const original = button.dataset.preset;
        try {
            button.dataset.preset = '359999000';
            button.dispatchEvent(new w.MouseEvent('click', { bubbles:true, shiftKey:true }));
            if (${durationMs} > 0) { button.dataset.preset = '${durationMs}'; button.click(); }
        } finally {
            button.dataset.preset = original;
            w.document.dispatchEvent(new w.Event('visibilitychange'));
        }
    })()`);
}
