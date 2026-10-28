import { createApplicationSync } from './controller.mjs';
import { renderSyncPanel, syncFeedback } from './panel.mjs';
import { createAccountControl } from './account.mjs';
if (location.origin !== 'http://localhost:8000') throw Error('DEVELOPMENT_ORIGIN_REQUIRED');
if (navigator.serviceWorker?.controller) {
    document.body.textContent = 'Use a fresh test browser profile without a localhost service worker. / Bitte ein frisches Testprofil ohne localhost-Service-Worker verwenden.';
    throw Error('FRESH_PROFILE_REQUIRED');
}
const panels = new Set();
let account;
const sync = createApplicationSync({ storage: localStorage, changed: () => { panels.forEach(update => update()); account?.update(); } });
account = createAccountControl(sync);
globalThis.easyTimerDevelopment = {
    enabled: true,
    createStore: () => sync.createStore(),
    feedback: syncFeedback,
    updateAccount: context => account.update(context),
    renderBackup(section, context) { renderSyncPanel(section, context, sync, panels); },
};
window.addEventListener('storage', () => panels.forEach(update => update()));
window.addEventListener('focus', () => panels.forEach(update => update()));
window.addEventListener('pagehide', () => sync.disconnect());
await import('/js/app.js?v=51');
