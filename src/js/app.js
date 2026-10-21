import { createTimer, formatOvertime, formatTime, timeBudget, transition } from './timer.mjs';

const copy = {
    en: {
        countdown: 'Countdown', light: 'Light', dark: 'Dark', system: 'System', theme: 'Appearance', language: 'Language',
        de: 'German', en: 'English', duration: 'Duration',
        start: 'Start', pause: 'Pause', resume: 'Resume', restart: 'Restart', stop: 'Stop', credit: 'Created by',
        READY: 'Ready', RUNNING: 'Running', PAUSED: 'Paused', FINISHED: "Time’s up", newRun: 'Start again', overtime: 'Overtime',
        openMenu: 'Open preferences', closeMenu: 'Close preferences',
        preset: minutes => `Set ${minutes} minutes`,
        adjustments: 'Add time', total: 'Total', planned: 'Planned', limit: 'The total budget cannot exceed 99:59:59.',
        addTime: seconds => `Add ${seconds} seconds`,
        fullscreen: 'Fullscreen', exitFullscreen: 'Exit fullscreen', expand: 'Expand view', exitExpanded: 'Exit expanded view',
    },
    de: {
        countdown: 'Countdown', light: 'Hell', dark: 'Dunkel', system: 'System', theme: 'Darstellung', language: 'Sprache',
        de: 'Deutsch', en: 'Englisch', duration: 'Dauer',
        start: 'Starten', pause: 'Pausieren', resume: 'Fortsetzen', restart: 'Neustart', stop: 'Stoppen', credit: 'Erstellt von',
        READY: 'Bereit', RUNNING: 'Läuft', PAUSED: 'Pausiert', FINISHED: 'Zeit abgelaufen', newRun: 'Erneut starten', overtime: 'Überzeit',
        openMenu: 'Einstellungen öffnen', closeMenu: 'Einstellungen schließen',
        preset: minutes => `${minutes} Minuten einstellen`,
        adjustments: 'Zeit hinzufügen', total: 'Gesamt', planned: 'Geplant', limit: 'Das Gesamtbudget darf 99:59:59 nicht überschreiten.',
        addTime: seconds => `${seconds} Sekunden hinzufügen`,
        fullscreen: 'Vollbild', exitFullscreen: 'Vollbild verlassen', expand: 'Ansicht vergrößern', exitExpanded: 'Vergrößerte Ansicht verlassen',
    },
};
const $ = id => document.getElementById(id);
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
let limitExceeded = false;
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
    const { totalMs, plannedMs, adjustmentMs } = timeBudget(timer);
    const remaining = Math.max(0, Math.min(1, timer.remainingMs / totalMs));
    $('progress').style.setProperty('--remaining', `${remaining * 100}%`);
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
        button.disabled = timer.status !== 'READY';
        button.setAttribute('aria-pressed', String(timer.durationMs === Number(button.dataset.preset)));
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
    $('primary-label').textContent = t[primary];
    $('primary-icon').setAttribute('d', primary === 'pause' ? 'M7 4v16M17 4v16' : 'm8 4 12 8-12 8Z');
    $('primary').title = t[primary];
    $('restart').title = t.restart;
    $('stop').title = t.stop;
    document.querySelectorAll('[data-adjustment]').forEach(button => button.setAttribute('aria-label', t.addTime(Number(button.dataset.adjustment) / 1000)));
    const budget = `${t.total} ${formatTime(totalMs)}${adjustmentMs ? ` · ${t.planned} ${formatTime(plannedMs)} + ${formatTime(adjustmentMs)}` : ''}`;
    if ($('time-budget').textContent !== budget) $('time-budget').textContent = budget;
    const help = limitExceeded ? t.limit : '';
    if ($('help').textContent !== help) $('help').textContent = help;
    $('help').dataset.error = String(limitExceeded);
}

$('primary').addEventListener('click', () => {
    limitExceeded = false;
    if (timer.status === 'RUNNING') dispatch({ type: 'PAUSE' });
    else if (timer.status === 'PAUSED') dispatch({ type: 'RESUME' });
    else dispatch({ type: 'START' });
});
$('restart').addEventListener('click', () => { limitExceeded = false; dispatch({ type: 'RESTART' }); });
$('stop').addEventListener('click', () => {
    limitExceeded = false;
    timer = transition(timer, { type: 'STOP' }, Date.now());
    render();
});
document.querySelectorAll('[data-preset]').forEach(button => button.addEventListener('click', () => {
    if (timer.status !== 'READY') return;
    limitExceeded = false;
    timer = transition(timer, { type: 'CONFIGURE', durationMs: Number(button.dataset.preset) }, Date.now());
    render();
}));
document.querySelectorAll('[data-adjustment]').forEach(button => button.addEventListener('click', () => {
    const amountMs = Number(button.dataset.adjustment);
    limitExceeded = timer.durationMs + timer.adjustmentMs + amountMs > 359999000;
    dispatch({ type: 'ADJUST', amountMs });
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
