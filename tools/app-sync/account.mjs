import { connectDrive, disconnectDrive, prepareDrive } from './panel.mjs';

const copy = {
    en: { account: 'Google account', title: 'Google Drive', disconnected: 'Not connected', connected: 'Google Drive authorized',
        optional: 'Optional. You can use easyTimer without Google.', connect: 'Connect Google Drive', disconnect: 'Disconnect',
        note: 'Authorization does not mean all Rundowns are synchronized. Sync details are in Data & Backup.',
        disconnectNote: 'Disconnect ends access here. Local Rundowns and pending uploads remain; Google consent is not revoked.',
        setup: 'Set up Google Drive in Data & Backup first.', blocked: 'Finish or cancel the current edit or review first.',
        connectAgain: 'Ready. Click Connect Google Drive again to authorize.', reconnect: 'Authorization was cancelled or is unavailable. You can try again.',
        preparing: 'Preparing Google connection…', libraryError: 'Google could not be loaded. Your data is unchanged.', retry: 'Retry loading Google',
        syncError: 'Connection could not be completed. Local data is unchanged. Check Data & Backup before retrying.' },
    de: { account: 'Google-Konto', title: 'Google Drive', disconnected: 'Nicht verbunden', connected: 'Google Drive autorisiert',
        optional: 'Optional. Du kannst easyTimer ohne Google verwenden.', connect: 'Google Drive verbinden', disconnect: 'Trennen',
        note: 'Autorisiert bedeutet nicht, dass alle Rundowns synchronisiert sind. Sync-Details stehen unter Daten & Sicherung.',
        disconnectNote: 'Trennen beendet den Zugriff hier. Lokale Rundowns und ausstehende Uploads bleiben erhalten; die Google-Freigabe wird nicht widerrufen.',
        setup: 'Google Drive zuerst unter Daten & Sicherung einrichten.', blocked: 'Aktuelle Bearbeitung oder Prüfung zuerst abschließen oder abbrechen.',
        connectAgain: 'Bereit. Zum Autorisieren erneut Google Drive verbinden wählen.', reconnect: 'Autorisierung abgebrochen oder nicht verfügbar. Du kannst es erneut versuchen.',
        preparing: 'Google-Verbindung wird vorbereitet…', libraryError: 'Google konnte nicht geladen werden. Deine Daten bleiben unverändert.', retry: 'Google erneut laden',
        syncError: 'Verbindung nicht hergestellt. Lokale Daten bleiben unverändert. Vor einem erneuten Versuch Daten & Sicherung prüfen.' },
};

export function createAccountControl(sync) {
    const root = document.createElement('div'); root.className = 'account-control'; root.hidden = true;
    const toggle = document.createElement('button'); toggle.id = 'account-toggle'; toggle.className = 'account-toggle'; toggle.type = 'button';
    toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-controls', 'account-popover'); toggle.setAttribute('aria-haspopup', 'dialog');
    toggle.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></svg>';
    const icon = toggle.firstElementChild, image = document.createElement('img');
    image.alt = ''; image.width = 28; image.height = 28; image.referrerPolicy = 'no-referrer'; image.crossOrigin = 'anonymous'; image.hidden = true; toggle.append(image);
    const avatar = document.createElement('span'); avatar.className = 'account-avatar'; avatar.setAttribute('aria-hidden', 'true');
    avatar.append(icon, image); toggle.append(avatar);
    const popup = document.createElement('section'); popup.id = 'account-popover'; popup.className = 'account-popover'; popup.hidden = true;
    popup.setAttribute('role', 'dialog'); popup.setAttribute('aria-labelledby', 'account-heading');
    const menuEntry = document.createElement('button'); menuEntry.id = 'account-menu-entry'; menuEntry.className = 'menu-account-entry'; menuEntry.type = 'button'; menuEntry.hidden = true;
    menuEntry.setAttribute('aria-controls', popup.id); menuEntry.setAttribute('aria-haspopup', 'dialog'); menuEntry.setAttribute('aria-expanded', 'false');
    const menuLabel = document.createElement('span'); menuEntry.append(menuLabel);
    document.querySelector('.menu-settings').before(menuEntry);
    const heading = document.createElement('h2'); heading.id = 'account-heading'; heading.tabIndex = -1;
    const state = document.createElement('p'), name = document.createElement('p'), email = document.createElement('p');
    const note = document.createElement('p'), disconnectNote = document.createElement('p'), feedback = document.createElement('p');
    name.id = 'account-name'; email.id = 'account-email'; feedback.setAttribute('role', 'status');
    const connect = document.createElement('button'), disconnect = document.createElement('button');
    connect.id = 'account-connect'; disconnect.id = 'account-disconnect'; connect.type = disconnect.type = 'button';
    popup.append(heading, state, name, email, note, connect, disconnect, disconnectNote, feedback); root.append(toggle, popup);
    document.getElementById('preferences-menu').append(root);
    let context, signature, expiryTimer, placement, preparing = false, message = '', failedPhoto = '', photo = '';
    const restoreFocus = () => (toggle.hidden || root.hidden ? document.getElementById('menu-toggle') : toggle).focus();
    const close = (restore = false) => { popup.hidden = true; toggle.setAttribute('aria-expanded', 'false'); menuEntry.setAttribute('aria-expanded', 'false'); if (restore) restoreFocus(); };
    const showStatus = code => { message = code; signature = null; update(); };
    const allowed = () => { if (context.canChange()) return true; showStatus('blocked'); return false; };
    const prepare = async () => {
        if (preparing || globalThis.google?.accounts?.oauth2 || !sync.active()) return;
        preparing = true; showStatus('preparing');
        try { await prepareDrive(); message = ''; } catch { message = 'libraryError'; }
        preparing = false; signature = null; update();
        if (!popup.hidden && document.activeElement === heading) connect.focus();
    };
    const execute = async action => {
        if (!allowed() || sync.busy) return;
        try { await action(); message = ''; signature = null; update(); close(true); return; }
        catch { message = 'syncError'; }
        signature = null; update();
    };
    connect.onclick = () => {
        if (!allowed()) return;
        if (!sync.active()) { showStatus('setup'); close(); context.openSetup(); return; }
        if (!globalThis.google?.accounts?.oauth2) { prepare(); return; }
        showStatus('');
        connectDrive(sync, { canChange: allowed, present: () => !popup.hidden, showStatus, execute });
    };
    disconnect.onclick = () => execute(() => disconnectDrive(sync));
    const open = () => {
        context.closeMenu(); update(); if (root.hidden) return;
        popup.hidden = false; toggle.setAttribute('aria-expanded', 'true'); menuEntry.setAttribute('aria-expanded', 'true');
        prepare(); (connect.hidden ? disconnect : connect.disabled ? heading : connect).focus();
    };
    toggle.onclick = () => popup.hidden ? open() : close(true);
    menuEntry.onclick = open;
    image.onerror = () => { failedPhoto = photo; image.hidden = true; image.removeAttribute('src'); icon.removeAttribute('hidden'); };
    document.addEventListener('click', event => { if (!root.contains(event.target) && !menuEntry.contains(event.target)) close(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && !popup.hidden) { event.preventDefault(); event.stopImmediatePropagation(); close(true); } });
    root.addEventListener('focusout', event => { if (event.relatedTarget && !root.contains(event.relatedTarget)) close(); });
    function update(next = context) {
        if (!next) return;
        context = next;
        const connected = sync.accountConnected, profile = connected ? sync.client.profile : null;
        const blocked = Boolean(context.fullscreen || context.clockOnly), landscape = !blocked && context.mobileLandscape;
        const focused = root.contains(document.activeElement) || document.activeElement === menuEntry;
        const nextPlacement = blocked ? 'hidden' : landscape ? 'menu' : 'avatar';
        root.hidden = blocked; toggle.hidden = blocked || Boolean(landscape); menuEntry.hidden = blocked || !landscape;
        const avatarParent = landscape ? menuEntry : toggle;
        if (avatar.parentElement !== avatarParent) avatarParent.prepend(avatar);
        root.classList.toggle('account-landscape', Boolean(landscape));
        if (blocked || (placement && placement !== nextPlacement)) { close(); if (focused) restoreFocus(); }
        placement = nextPlacement;
        const value = JSON.stringify([context.language, connected, profile, sync.busy, preparing, message]);
        if (signature === value) return; signature = value;
        clearTimeout(expiryTimer);
        if (connected) expiryTimer = setTimeout(() => { signature = null; update(); }, Math.max(1, sync.client.expiresAt - Date.now() + 1));
        const t = copy[context.language];
        if (!connected) failedPhoto = '';
        heading.textContent = t.title; menuLabel.textContent = t.title; state.textContent = connected ? t.connected : t.disconnected;
        toggle.setAttribute('aria-label', `${t.account}: ${connected ? t.connected : t.disconnected}`); toggle.title = t.account;
        name.textContent = profile?.displayName || ''; name.hidden = !name.textContent;
        email.textContent = profile?.emailAddress || ''; email.hidden = !email.textContent;
        note.textContent = connected ? t.note : t.optional; disconnectNote.textContent = t.disconnectNote; disconnectNote.hidden = !connected;
        connect.textContent = preparing ? t.preparing : message === 'libraryError' ? t.retry : t.connect; disconnect.textContent = t.disconnect;
        connect.hidden = connected; disconnect.hidden = !connected; connect.disabled = sync.busy || preparing; disconnect.disabled = sync.busy;
        feedback.textContent = t[message] || ''; feedback.hidden = !feedback.textContent;
        const nextPhoto = profile?.photoLink || '';
        if (photo !== nextPhoto) { photo = nextPhoto; image.removeAttribute('src'); if (photo && photo !== failedPhoto) image.src = photo; }
        image.hidden = !photo || photo === failedPhoto; icon.toggleAttribute('hidden', !image.hidden);
    }
    return { update };
}
