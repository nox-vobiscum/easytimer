import { createTimer, durationFromFields, formatOvertime, formatTime, transition } from './timer.mjs';

const copy = {
    en: {
        countdown: 'Countdown', light: 'Light', dark: 'Dark', system: 'System', theme: 'Appearance', language: 'Language',
        de: 'German', en: 'English', duration: 'Duration', hours: 'Hours', minutes: 'Minutes', seconds: 'Seconds',
        start: 'Start', pause: 'Pause', resume: 'Resume', restart: 'Restart', stop: 'Stop', credit: 'Created by',
        READY: 'Ready', RUNNING: 'Running', PAUSED: 'Paused', FINISHED: "Time’s up", newRun: 'Start again', overtime: 'Overtime',
        invalid: 'Enter a duration greater than zero: 0–99 hours, 0–59 minutes and 0–59 seconds. Use whole numbers.',
        locked: 'Stop the timer to change its duration.', hint: 'Set a duration, then start.',
        openMenu: 'Open preferences', closeMenu: 'Close preferences',
        preset: minutes => `Set ${minutes} minutes`,
        fullscreen: 'Fullscreen', exitFullscreen: 'Exit fullscreen', expand: 'Expand view', exitExpanded: 'Exit expanded view',
    },
    de: {
        countdown: 'Countdown', light: 'Hell', dark: 'Dunkel', system: 'System', theme: 'Darstellung', language: 'Sprache',
        de: 'Deutsch', en: 'Englisch', duration: 'Dauer', hours: 'Stunden', minutes: 'Minuten', seconds: 'Sekunden',
        start: 'Starten', pause: 'Pausieren', resume: 'Fortsetzen', restart: 'Neustart', stop: 'Stoppen', credit: 'Erstellt von',
        READY: 'Bereit', RUNNING: 'Läuft', PAUSED: 'Pausiert', FINISHED: 'Zeit abgelaufen', newRun: 'Erneut starten', overtime: 'Überzeit',
        invalid: 'Eine Dauer größer als null eingeben: 0–99 Stunden, 0–59 Minuten und 0–59 Sekunden. Ganze Zahlen verwenden.',
        locked: 'Timer stoppen, um die Dauer zu ändern.', hint: 'Dauer einstellen und starten.',
        openMenu: 'Einstellungen öffnen', closeMenu: 'Einstellungen schließen',
        preset: minutes => `${minutes} Minuten einstellen`,
        fullscreen: 'Vollbild', exitFullscreen: 'Vollbild verlassen', expand: 'Ansicht vergrößern', exitExpanded: 'Vergrößerte Ansicht verlassen',
    },
};
const $ = id => document.getElementById(id);
const inputs = ['hours', 'minutes', 'seconds'].map($);
function readPreference(key, fallback, allowed) {
    try { const value = localStorage.getItem(key); return allowed.includes(value) ? value : fallback; }
    catch { return fallback; }
}
function savePreference(key, value) {
    try { localStorage.setItem(key, value); } catch { /* Preferences remain usable when storage is unavailable. */ }
}
let language = readPreference('easyTimerLanguage', navigator.language?.startsWith('de') ? 'de' : 'en', ['de', 'en']);
let theme = readPreference('easyTimerTheme', 'system', ['light', 'dark', 'system']);
let timer = createTimer();
let invalid = false;
let expanded = false;
let fullscreenRequested = false;
let fullscreenRequestId = 0;
let menuOpen = false;
const landscape = matchMedia('(orientation: landscape) and (max-height: 600px) and (pointer: coarse)');
const mobileMenu = matchMedia('(max-width: 440px)');

function setMenuOpen(open, restoreFocus = false) {
    menuOpen = Boolean(open && mobileMenu.matches);
    document.querySelector('header').dataset.menuOpen = String(menuOpen);
    $('menu-toggle').setAttribute('aria-expanded', String(menuOpen));
    const label = copy[language][menuOpen ? 'closeMenu' : 'openMenu'];
    $('menu-toggle').setAttribute('aria-label', label);
    $('menu-toggle').title = label;
    if (restoreFocus) $('menu-toggle').focus({ preventScroll: true });
}

function updatePresentation() {
    const roomPresentation = Boolean(document.fullscreenElement) || expanded;
    document.body.classList.toggle('presentation', roomPresentation || landscape.matches);
    document.body.classList.toggle('room-presentation', roomPresentation);
    render();
}

async function toggleFullscreen() {
    const requestId = ++fullscreenRequestId;
    if (document.fullscreenElement) {
        fullscreenRequested = false;
        await document.exitFullscreen().catch(() => {});
    } else if (expanded) {
        fullscreenRequested = false;
        expanded = false;
    } else {
        fullscreenRequested = true;
        let timeout;
        try {
            if (!document.fullscreenEnabled || !document.documentElement.requestFullscreen) throw new Error('Fullscreen unavailable');
            const request = document.documentElement.requestFullscreen();
            // Some browsers expose the API but never settle its request.
            request.then(() => {
                if (requestId === fullscreenRequestId && document.fullscreenElement && fullscreenRequested) { expanded = false; updatePresentation(); }
            }, () => {});
            const entered = await Promise.race([
                request.then(() => true),
                new Promise(resolve => { timeout = setTimeout(() => resolve(false), 1200); }),
            ]);
            if (requestId !== fullscreenRequestId) return;
            expanded = !entered && !document.fullscreenElement;
        } catch {
            if (requestId === fullscreenRequestId) expanded = true;
        } finally {
            clearTimeout(timeout);
        }
    }
    if (requestId !== fullscreenRequestId) return;
    updatePresentation();
    $('fullscreen').focus({ preventScroll: true });
}

function dispatch(action) {
    timer = transition(timer, action, Date.now());
    render();
}
function configuredDuration() {
    return durationFromFields(...inputs.map(input => input.value));
}
function syncInputs() {
    const seconds = timer.durationMs / 1000;
    [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].forEach((value, i) => { inputs[i].value = value; });
}
function configure() {
    if (['RUNNING', 'PAUSED'].includes(timer.status)) return;
    const durationMs = configuredDuration();
    invalid = durationMs === null;
    if (!invalid) timer = transition(timer, { type: 'CONFIGURE', durationMs }, Date.now());
    render();
}
function render() {
    const t = copy[language];
    const fullscreen = Boolean(document.fullscreenElement);
    const fullscreenLabel = fullscreen ? t.exitFullscreen : expanded ? t.exitExpanded : document.fullscreenEnabled ? t.fullscreen : t.expand;
    $('fullscreen').title = fullscreenLabel;
    $('fullscreen').setAttribute('aria-label', fullscreenLabel);
    $('fullscreen').setAttribute('aria-pressed', String(fullscreen || expanded));
    const menuLabel = t[menuOpen ? 'closeMenu' : 'openMenu'];
    $('menu-toggle').setAttribute('aria-label', menuLabel);
    $('menu-toggle').title = menuLabel;
    const remaining = Math.max(0, Math.min(1, timer.remainingMs / timer.durationMs));
    $('progress').style.setProperty('--remaining', `${remaining * 100}%`);
    const active = ['RUNNING', 'PAUSED'].includes(timer.status);
    document.documentElement.lang = language;
    document.documentElement.dataset.theme = theme;
    document.querySelectorAll('[data-copy]').forEach(el => { el.textContent = t[el.dataset.copy]; });
    document.querySelectorAll('[data-label]').forEach(el => { el.setAttribute('aria-label', t[el.dataset.label]); });
    document.querySelectorAll('button[data-theme]').forEach(button => {
        button.setAttribute('aria-pressed', String(button.dataset.theme === theme));
        button.setAttribute('aria-label', t[button.dataset.theme]);
        button.title = t[button.dataset.theme];
    });
    document.querySelectorAll('[data-language]').forEach(button => {
        button.setAttribute('aria-pressed', String(button.dataset.language === language));
        button.setAttribute('aria-label', t[button.dataset.language]);
        button.title = t[button.dataset.language];
    });
    document.querySelectorAll('[data-preset]').forEach(button => {
        const minutes = Number(button.dataset.preset) / 60000;
        button.textContent = `${minutes} min`;
        button.setAttribute('aria-label', t.preset(minutes));
        button.title = t.preset(minutes);
    });
    const time = formatTime(timer.remainingMs);
    if ($('time').textContent !== time) $('time').textContent = time;
    $('time').dataset.hours = String(time.length > 5);
    $('time').setAttribute('aria-label', `${t.countdown}: ${time}`);
    const overtime = formatOvertime(timer.overtimeMs);
    $('overtime').hidden = timer.status !== 'FINISHED';
    $('overtime-time').textContent = overtime;
    $('overtime').setAttribute('aria-label', `${t.overtime}: ${overtime}`);
    if ($('status').textContent !== t[timer.status]) $('status').textContent = t[timer.status];
    const primary = timer.status === 'RUNNING' ? 'pause' : timer.status === 'PAUSED' ? 'resume' : timer.status === 'FINISHED' ? 'newRun' : 'start';
    $('primary').textContent = t[primary];
    $('primary').title = t[primary];
    $('primary').disabled = invalid && !active;
    $('restart').disabled = invalid && !active;
    $('restart').title = t.restart;
    $('stop').title = t.stop;
    $('duration-fields').disabled = active;
    inputs.forEach(input => input.setAttribute('aria-invalid', String(invalid)));
    const help = invalid ? t.invalid : active ? t.locked : t.hint;
    if ($('help').textContent !== help) $('help').textContent = help;
    $('help').dataset.error = String(invalid);
}

$('primary').addEventListener('click', () => {
    if (timer.status === 'RUNNING') dispatch({ type: 'PAUSE' });
    else if (timer.status === 'PAUSED') dispatch({ type: 'RESUME' });
    else if (!invalid) dispatch({ type: 'START' });
});
$('restart').addEventListener('click', () => { if (!invalid) dispatch({ type: 'RESTART' }); });
$('stop').addEventListener('click', () => {
    invalid = false;
    timer = transition(timer, { type: 'STOP' }, Date.now());
    syncInputs();
    render();
});
inputs.forEach(input => input.addEventListener('input', configure));
$('duration-form').addEventListener('submit', event => {
    event.preventDefault();
    configure();
    if (!invalid && timer.status === 'READY') dispatch({ type: 'START' });
});
document.querySelectorAll('[data-preset]').forEach(button => button.addEventListener('click', () => {
    if (['RUNNING', 'PAUSED'].includes(timer.status)) return;
    invalid = false;
    timer = transition(timer, { type: 'CONFIGURE', durationMs: Number(button.dataset.preset) }, Date.now());
    syncInputs();
    render();
}));
document.querySelectorAll('button[data-theme]').forEach(button => button.addEventListener('click', () => {
    theme = button.dataset.theme;
    savePreference('easyTimerTheme', theme);
    render();
}));
document.querySelectorAll('[data-language]').forEach(button => button.addEventListener('click', () => {
    language = button.dataset.language;
    savePreference('easyTimerLanguage', language);
    render();
}));
$('menu-toggle').addEventListener('click', () => setMenuOpen(!menuOpen));
document.addEventListener('click', event => {
    if (menuOpen && !document.querySelector('header').contains(event.target)) setMenuOpen(false);
});
mobileMenu.addEventListener('change', event => { if (!event.matches) setMenuOpen(false); });
// Callbacks only refresh the display; the deadline remains authoritative.
setInterval(() => { if (['RUNNING', 'FINISHED'].includes(timer.status)) dispatch({ type: 'TICK' }); }, 100);
document.addEventListener('visibilitychange', () => dispatch({ type: 'TICK' }));
window.addEventListener('pageshow', () => dispatch({ type: 'TICK' }));
$('fullscreen').addEventListener('click', toggleFullscreen);
document.addEventListener('fullscreenchange', () => {
    // A delayed native request must not reopen a view the user already exited.
    if (document.fullscreenElement && !fullscreenRequested) {
        document.exitFullscreen().catch(() => {});
    }
    if (!document.fullscreenElement) fullscreenRequested = false;
    updatePresentation();
});
landscape.addEventListener('change', updatePresentation);
window.addEventListener('resize', updatePresentation);
document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menuOpen) {
        setMenuOpen(false, true);
        return;
    }
    if (event.key === 'Escape' && document.fullscreenElement) {
        fullscreenRequestId += 1;
        fullscreenRequested = false;
        document.exitFullscreen().catch(() => {});
    }
    if (event.key === 'Escape' && expanded) {
        fullscreenRequestId += 1;
        fullscreenRequested = false;
        expanded = false;
        updatePresentation();
        $('fullscreen').focus({ preventScroll: true });
    }
    if (event.key === 'Escape') setTimeout(updatePresentation, 0);
});
updatePresentation();

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('service-worker.js').catch(() => {});
    });
}
