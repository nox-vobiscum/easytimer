import { openLocalStore, makeTestTicket, DB_PREFIX, canonical } from './adapter.mjs';
import { runExperiments } from './experiments.mjs';
if (!['localhost', '127.0.0.1'].includes(location.hostname)) throw Error('LOCAL_ONLY');
export const fixture = (name = 'Synthetic A') => ({ schemaVersion: 1, templates: [{ id: 'synthetic-rundown', name, transitionMode: 'manual',
    phases: [{ id: 'synthetic-phase', title: 'Synthetic opening', durationSeconds: 600 }] }] });
window.storePoc = { openLocalStore, makeTestTicket, DB_PREFIX, canonical, fixture };
document.getElementById('run').addEventListener('click', async event => {
    event.target.disabled = true;
    try { document.getElementById('results').textContent = JSON.stringify(await runExperiments(), null, 2); }
    catch (error) { document.getElementById('results').textContent = 'FAIL: ' + error.message; }
    finally { event.target.disabled = false; }
});
