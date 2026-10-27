import { downloadRundowns } from '../../src/js/portability.mjs';
import { SCOPE } from '../sync-poc/core.mjs';
import { renderConflictReview } from './conflict-panel.mjs';
const CLIENT_ID = '896158829302-h2rlgdbilmek2b1lmkr65kealt2t5rr8.apps.googleusercontent.com';
const copy = {
    en: {
        localOnly: 'Local only', pending: 'Changes pending', lastChecked: 'Synced (last checked)', reconnect: 'Google Drive not connected. Reconnect if needed.', cachedReview: 'A locally known conflict or pending reconciliation still needs review.', busy: 'Working…',
        reviewRequired: 'Conflict – review required. No version was overwritten.', accountMismatch: 'Reconnect the original Google account. Local data and pending work are retained.',
        syncError: 'Synchronization failed. Local data and pending uploads are retained. Try again explicitly.', legacyConflict: 'Another browser view changed the old library. Saving and sync are blocked; both libraries are retained. Download backups before resolving this.',
        adoptAvailable: 'Saved Rundowns are available. Confirm adoption into this empty library.',
        activate: 'Activate for this browser', connect: 'Connect Google Drive', sync: 'Sync now', disconnect: 'Disconnect', adopt: 'Use saved Rundowns',
        activateConfirm: 'Copy saved Rundowns into local transactional storage for this development test? The original browser library is retained. Close other easyTimer tabs first.',
        adoptConfirm: 'Use the saved Google library in this empty local library? IDs are preserved. Timers are unchanged.',
        explanation: 'Optional local development test. Google is not required. Disconnect keeps local storage and Google files; it does not revoke the grant.',
        connectAgain: 'Google authorization is ready. Click Connect Google Drive again to sign in.', backup: 'Download local backup', legacyBackup: 'Download other browser copy',
    },
    de: {
        localOnly: 'Nur lokal', pending: 'Nicht synchronisierte Änderungen', lastChecked: 'Synchronisiert (zuletzt geprüft)', reconnect: 'Google Drive nicht verbunden. Bei Bedarf erneut verbinden.', cachedReview: 'Ein lokal bekannter Konflikt oder eine ausstehende Zusammenführung muss noch geprüft werden.', busy: 'Wird bearbeitet…',
        reviewRequired: 'Konflikt – Überprüfung erforderlich. Keine Version wurde überschrieben.', accountMismatch: 'Bitte das ursprüngliche Google-Konto verbinden. Lokale Daten und ausstehende Arbeit bleiben erhalten.',
        syncError: 'Synchronisierung fehlgeschlagen. Lokale Daten und ausstehende Uploads bleiben erhalten. Bitte ausdrücklich erneut versuchen.', legacyConflict: 'Eine andere Browseransicht hat die alte Bibliothek geändert. Speichern und Sync sind gesperrt; beide Bibliotheken bleiben erhalten. Vor der Klärung Sicherungen herunterladen.',
        adoptAvailable: 'Gespeicherte Rundowns sind verfügbar. Übernahme in diese leere Bibliothek bestätigen.',
        activate: 'Für diesen Browser aktivieren', connect: 'Google Drive verbinden', sync: 'Jetzt synchronisieren', disconnect: 'Trennen', adopt: 'Gespeicherte Rundowns übernehmen',
        activateConfirm: 'Gespeicherte Rundowns für diesen Entwicklungstest in lokalen Transaktionsspeicher kopieren? Die ursprüngliche Browserbibliothek bleibt erhalten. Andere easyTimer-Tabs vorher schließen.',
        adoptConfirm: 'Die gespeicherte Google-Bibliothek in diese leere lokale Bibliothek übernehmen? IDs bleiben erhalten. Timer bleiben unverändert.',
        explanation: 'Optionaler lokaler Entwicklungstest. Google ist nicht erforderlich. Trennen behält lokale Daten und Google-Dateien; die Freigabe wird nicht widerrufen.',
        connectAgain: 'Google-Anmeldung vorbereitet. Zum Anmelden erneut Google Drive verbinden wählen.', backup: 'Lokale Sicherung herunterladen', legacyBackup: 'Andere Browserfassung herunterladen',
    },
};
// An empty editor code clears feedback; actual unknown failures remain visible.
export const syncFeedback = (code, language) => {
    const extra = language === 'de' ? {
        staleReview: 'Die Daten haben sich geändert. Bitte den Konflikt erneut prüfen.',
        unpublishedChanges: 'Neuere lokale Änderungen bleiben erhalten. Erst synchronisieren; diese Prüfung kann nicht angewendet werden.',
        unsupportedConflict: 'Dieser Konflikt kann hier noch nicht sicher aufgelöst werden. Alle Fassungen bleiben erhalten.',
        pendingUpload: 'Ein ausstehender Upload muss zuerst über Jetzt synchronisieren wiederaufgenommen werden.',
    } : {
        staleReview: 'The data changed. Review the conflict again.',
        unpublishedChanges: 'Newer local changes are retained. Sync first; this review cannot be applied.',
        unsupportedConflict: 'This conflict cannot yet be resolved safely here. All versions are retained.',
        pendingUpload: 'Resume the pending upload with Sync now before reviewing a conflict.',
    };
    return code ? extra[code] || copy[language][code] || copy[language].syncError : '';
};
let gisPromise, authEpoch = 0;
function loadGIS() {
    if (!gisPromise) gisPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script'); script.src = 'https://accounts.google.com/gsi/client';
        script.onload = resolve; script.onerror = () => { gisPromise = null; script.remove(); reject(Error('GIS_UNAVAILABLE')); }; document.head.append(script);
    });
    return gisPromise;
}
export function renderSyncPanel(parent, context, sync, panels) {
    const text = copy[context.language], section = document.createElement('section'); section.className = 'development-sync';
    const heading = document.createElement('h3'); heading.textContent = 'Google Drive';
    const status = document.createElement('p'); status.id = 'drive-status'; status.setAttribute('role', 'status');
    const showStatus = (code, message = text[code] || syncFeedback(code, context.language), summaryCode = code) => {
        status.textContent = message;
        context.backupStatus?.(summaryCode, message);
    };
    const note = document.createElement('p'); note.textContent = text.explanation;
    const actions = document.createElement('div'); actions.className = 'backup-actions';
    const button = (id, label, handler) => { const b = document.createElement('button'); b.type = 'button'; b.id = id; b.textContent = label; b.onclick = handler; actions.append(b); return b; };
    let updateId = 0;
    const update = async () => {
        if (!section.isConnected) { panels.delete(update); return; }
        const id = ++updateId; let code; try { code = await sync.status(); } catch { code = 'syncError'; }
        let knownReview = false;
        if (code === 'reconnect') {
            // Existing local metadata only: no auth, Drive discovery or storage mutation.
            try {
                const report = await sync.diagnosticReport();
                knownReview = report.storage.knownHeadCount > 1 || report.reconciliation.present;
            } catch { /* Unavailable metadata is not evidence of a conflict. */ }
        }
        if (id !== updateId) return;
        showStatus(code, knownReview ? `${text.reconnect} ${text.cachedReview}` : undefined, knownReview ? 'reviewRequired' : code);
        reviewButton.hidden = !['reviewRequired', 'staleReview', 'unpublishedChanges', 'unsupportedConflict', 'pendingUpload'].includes(code);
        reviewButton.disabled = !sync.client.connected || sync.busy;
        activate.hidden = sync.active(); adopt.hidden = !sync.adoptionAvailable;
        connect.disabled = !sync.active() || sync.busy;
        syncButton.disabled = !sync.client.connected || sync.busy; adopt.disabled = !sync.client.connected || sync.busy;
        activate.disabled = sync.busy; backup.hidden = !sync.active(); otherBackup.hidden = code !== 'legacyConflict';
        disconnect.hidden = !sync.client.connected; disconnect.disabled = sync.busy;
    };
    const execute = async fn => {
        if (!context.canChange()) return;
        try { await fn(); if (context.canChange()) await context.refresh(); }
        catch { await update(); }
    };
    const activate = button('drive-activate', text.activate, () => { if (window.confirm(text.activateConfirm)) execute(() => sync.activate()); });
    const connect = button('drive-connect', text.connect, () => {
        if (!context.canChange() || sync.busy) return;
        if (!globalThis.google?.accounts?.oauth2) { loadGIS().then(() => { if (section.isConnected) showStatus('connectAgain'); }).catch(() => { showStatus('syncError'); }); return; }
        const epoch = ++authEpoch;
        try {
            google.accounts.oauth2.initTokenClient({ client_id: CLIENT_ID, scope: SCOPE, include_granted_scopes: false, prompt: 'select_account',
                callback: response => { if (epoch === authEpoch) { if (response.error) showStatus('reconnect'); else execute(() => sync.authorize(response)); } },
                error_callback: () => { if (epoch === authEpoch) showStatus('reconnect'); },
            }).requestAccessToken();
        } catch { showStatus('syncError'); }
    });
    const syncButton = button('drive-sync', text.sync, () => execute(() => sync.sync()));
    const reviewButton = button('drive-review', context.language === 'de' ? 'Konflikt prüfen' : 'Review conflict', async () => {
        if (!context.canChange() || sync.busy) return;
        try {
            section.querySelector('#drive-conflict-review')?.remove();
            const review = await sync.reviewConflict();
            if (!section.isConnected || !context.canChange()) return;
            context.keepBackupOpen?.();
            renderConflictReview(section, review, sync, context, syncFeedback, () => reviewButton.focus());
        } catch (e) { showStatus(e.message, syncFeedback(e.message, context.language)); }
    });
    const adopt = button('drive-adopt', text.adopt, () => { if (window.confirm(text.adoptConfirm)) execute(() => sync.sync({ adopt: true })); });
    const disconnect = button('drive-disconnect', text.disconnect, () => { authEpoch++; sync.disconnect(); update(); });
    const backupError = context.language === 'de' ? 'Die Sicherung konnte nicht vorbereitet werden. Lokale Daten bleiben unverändert. Bitte erneut versuchen.' : 'The backup could not be prepared. Local data is unchanged. Please try again.';
    const backup = button('drive-backup', text.backup, async () => { try { downloadRundowns(await sync.backup()); } catch { showStatus('syncError', backupError); } });
    const otherBackup = button('drive-legacy-backup', text.legacyBackup, () => { try { downloadRundowns(sync.legacyBackup(), 'easytimer-other-browser-copy.json'); } catch { showStatus('syncError', backupError); } });
    const diagnostic = button('drive-diagnostics', context.language === 'de' ? 'Sync-Diagnose anzeigen' : 'Show sync diagnostics', async () => {
        // Deliberately not execute(): no refresh, sync, auth, adoption or state reset.
        try {
            const report = await sync.diagnosticReport();
            if (!section.isConnected) return;
            section.querySelector('#drive-diagnostic-output')?.remove();
            const output = document.createElement('section'); output.id = 'drive-diagnostic-output';
            const label = document.createElement('label'); label.htmlFor = 'drive-diagnostic-text';
            label.textContent = context.language === 'de' ? 'Lokale Sync-Diagnose (nur lesend, manuell kopieren)' : 'Local sync diagnostics (read-only, copy manually)';
            const area = document.createElement('textarea'); area.id = label.htmlFor; area.readOnly = true; area.rows = 16;
            area.style.cssText = 'display:block;box-sizing:border-box;width:100%;max-width:100%;font:12px monospace';
            area.value = JSON.stringify(report, null, 2);
            const close = document.createElement('button'); close.type = 'button'; close.textContent = context.language === 'de' ? 'Schließen' : 'Close';
            close.onclick = () => { output.remove(); diagnostic.focus(); };
            output.append(label,area,close);section.append(output);area.focus();area.select();
        } catch {
            // Use a separate diagnostic notice; do not overwrite synchronization feedback.
            section.querySelector('#drive-diagnostic-output')?.remove();
            const notice = document.createElement('p'); notice.id = 'drive-diagnostic-output'; notice.setAttribute('role','status');
            notice.textContent = context.language === 'de' ? 'Lokale Diagnose nicht verfügbar. Es wurden keine Sync-Aktionen ausgeführt.' : 'Local diagnostics unavailable. No sync actions were performed.';
            section.append(notice);
        }
    });
    section.append(heading, note, status, actions); parent.append(section); panels.add(update); update();
}
