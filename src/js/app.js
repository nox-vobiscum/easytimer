import { createTimer, formatOvertime, formatTime, timeBudget, transition } from './timer.mjs?v=26';
import { createPlanner } from './planner.js?v=26';
import { prepareSession, transitionSession, sessionRemaining, hasSessionProgress } from './session.mjs?v=26';
import { createTemplateStore } from './templates.mjs?v=26';
import { timeVisualState, formatTimerReadout } from './time-visuals.mjs?v=26';

const copy = {
    en: {
        planner: 'Session Planner',
        clockOnly: 'Show clock-only view', clockControls: 'Show timer controls',
        quick: 'Quick Timer', session: 'Session Timer', chooseWorkshop: 'Choose a workshop', backQuick: 'Back to Quick Timer',
        manualOnly: 'Manual execution only. Automatic transitions follow in a later release.', workshopTemplate: 'Workshop template',
        runNote: 'A new run uses a copy. Saved templates stay unchanged. Reloading loses the active run.',
        prepare: 'Prepare workshop', reloadTemplates: 'Reload templates', chooseTemplate: 'Choose a template',
        emptyTemplates: 'No workshop templates saved. Create one in Session Planner.', loadTemplatesError: 'Templates could not be loaded. Saved data has not been changed. Try reloading templates.',
        automaticLater: 'Automatic execution is not available yet', next: 'Next phase', complete: 'Complete workshop',
        stopWorkshop: 'Stop workshop', stopOvertime: 'Stop overtime', workshopComplete: 'Workshop complete', overtimeStopped: 'Overtime stopped',
        OVERTIME_PAUSED: 'Overtime paused', phaseExpired: 'Phase time elapsed', phaseOvertime: 'Phase overtime', finalOvertime: 'Workshop overtime',
        workshopRemaining: 'Workshop remaining', phaseCount: (n, total) => `Phase ${n} of ${total}`, upNext: 'Up next',
        switchConfirm: 'Leave this timer and discard its run progress? The destination will not start automatically.',
        stopWorkshopConfirm: 'Stop this workshop and reset all phases and overtime to phase 1?',
        countdown: 'Countdown', light: 'Light', dark: 'Dark', system: 'System', theme: 'Appearance', language: 'Language',
        de: 'German', en: 'English', duration: 'Duration',
        start: 'Start', pause: 'Pause', resume: 'Resume', stop: 'Stop', credit: 'Created by',
        READY: 'Ready', RUNNING: 'Running', PAUSED: 'Paused', FINISHED: "Time’s up", newRun: 'Start again', overtime: 'Overtime',
        openMenu: 'Open preferences', closeMenu: 'Close preferences',
        preset: minutes => `Set ${minutes} minutes`,
        addDuration: 'Add to duration', extendRemaining: 'Extend remaining time', extendBudget: 'Extend time budget',
        total: 'Total', planned: 'Planned', limit: 'The total budget cannot exceed 99:59:59.',
        addTime: seconds => `Add ${seconds} seconds`,
        fullscreen: 'Fullscreen', exitFullscreen: 'Exit fullscreen', expand: 'Expand view', exitExpanded: 'Exit expanded view',
    },
    de: {
        planner: 'Session-Planer',
        clockOnly: 'Nur die Uhr anzeigen', clockControls: 'Timer-Bedienung anzeigen',
        quick: 'Quick-Timer', session: 'Session-Timer', chooseWorkshop: 'Workshop auswählen', backQuick: 'Zurück zum Quick-Timer',
        manualOnly: 'Nur manuelle Ausführung. Automatische Übergänge folgen in einer späteren Version.', workshopTemplate: 'Workshop-Vorlage',
        runNote: 'Ein neuer Durchlauf verwendet eine Kopie. Gespeicherte Vorlagen bleiben unverändert. Beim Neuladen geht der aktive Durchlauf verloren.',
        prepare: 'Workshop vorbereiten', reloadTemplates: 'Vorlagen neu laden', chooseTemplate: 'Vorlage auswählen',
        emptyTemplates: 'Keine Workshop-Vorlagen gespeichert. Bitte im Session-Planer eine erstellen.', loadTemplatesError: 'Vorlagen konnten nicht geladen werden. Gespeicherte Daten bleiben unverändert. Bitte erneut laden.',
        automaticLater: 'Automatische Ausführung ist noch nicht verfügbar', next: 'Nächste Phase', complete: 'Workshop abschließen',
        stopWorkshop: 'Workshop stoppen', stopOvertime: 'Überzeit stoppen', workshopComplete: 'Workshop abgeschlossen', overtimeStopped: 'Überzeit gestoppt',
        OVERTIME_PAUSED: 'Überzeit pausiert', phaseExpired: 'Phasenzeit abgelaufen', phaseOvertime: 'Phasenüberzeit', finalOvertime: 'Workshop-Überzeit',
        workshopRemaining: 'Workshop-Restzeit', phaseCount: (n, total) => `Phase ${n} von ${total}`, upNext: 'Als Nächstes',
        switchConfirm: 'Diesen Timer verlassen und seinen Fortschritt verwerfen? Der Zielmodus startet nicht automatisch.',
        stopWorkshopConfirm: 'Workshop stoppen und alle Phasen und Überzeiten auf Phase 1 zurücksetzen?',
        countdown: 'Countdown', light: 'Hell', dark: 'Dunkel', system: 'System', theme: 'Darstellung', language: 'Sprache',
        de: 'Deutsch', en: 'Englisch', duration: 'Dauer',
        start: 'Starten', pause: 'Pausieren', resume: 'Fortsetzen', stop: 'Stoppen', credit: 'Erstellt von',
        READY: 'Bereit', RUNNING: 'Läuft', PAUSED: 'Pausiert', FINISHED: 'Zeit abgelaufen', newRun: 'Erneut starten', overtime: 'Überzeit',
        openMenu: 'Einstellungen öffnen', closeMenu: 'Einstellungen schließen',
        preset: minutes => `${minutes} Minuten einstellen`,
        addDuration: 'Dauer ergänzen', extendRemaining: 'Restzeit verlängern', extendBudget: 'Zeitbudget verlängern',
        total: 'Gesamt', planned: 'Geplant', limit: 'Das Gesamtbudget darf 99:59:59 nicht überschreiten.',
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
let mode = 'quick';
let run = null;
let quickDurationMs = timer.durationMs;
let pickerOpen = false;
let pickerTemplates = [];
let pickerMessage = '';
const templateStore = createTemplateStore(() => localStorage);
let limitExceeded = false;
let expanded = false;
let fullscreenRequested = false;
let fullscreenRequestId = 0;
let menuOpen = false;
let plannerOpen = false;
let clockOnly = false;
const planner = createPlanner($('planner'), () => {
    plannerOpen = false;
    document.body.classList.remove('planner-open');
    $('planner').hidden = true;
    updatePresentation();
    $('menu-toggle').focus({ preventScroll: true });
}, language);
const landscape = matchMedia('(orientation: landscape)');
const coarsePointer = matchMedia('(any-pointer: coarse)');
function isSmartphone() {
    // Screen dimensions distinguish phones from tablet split views; viewport size alone cannot.
    const shortSide = Math.min(screen.width, screen.height);
    return coarsePointer.matches && shortSide > 0 && shortSide < 600;
}

function updateClockView() {
    const available = isSmartphone() && landscape.matches && !plannerOpen && !pickerOpen;
    if (!available) clockOnly = false;
    document.body.classList.toggle('clock-only', clockOnly);
    const button = $('clock-view-toggle');
    button.hidden = !available;
    button.setAttribute('aria-label', copy[language][clockOnly ? 'clockControls' : 'clockOnly']);
    button.setAttribute('aria-pressed', String(clockOnly));
    if (!available && document.activeElement === button) {
        (!plannerOpen && !pickerOpen && !$('primary').hidden ? $('primary') : $('menu-toggle')).focus({ preventScroll: true });
    }
}

function setClockOnly(active) {
    clockOnly = active;
    if (active) setMenuOpen(false);
    updateClockView();
    if (!$('clock-view-toggle').hidden) $('clock-view-toggle').focus({ preventScroll: true });
}

function setMenuOpen(open, restoreFocus = false) {
    const focusWasInside = $('preferences').contains(document.activeElement);
    menuOpen = Boolean(open);
    $('preferences').hidden = !menuOpen;
    $('menu-toggle').setAttribute('aria-expanded', String(menuOpen));
    const label = copy[language][menuOpen ? 'closeMenu' : 'openMenu'];
    $('menu-toggle').setAttribute('aria-label', label);
    $('menu-toggle').title = label;
    if (restoreFocus || (!menuOpen && focusWasInside)) $('menu-toggle').focus({ preventScroll: true });
}

function updatePresentation() {
    const phone = isSmartphone();
    if (phone && (expanded || document.fullscreenElement)) {
        fullscreenRequestId += 1;
        fullscreenRequested = false;
        expanded = false;
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    }
    const roomPresentation = !phone && (Boolean(document.fullscreenElement) || expanded);
    document.body.dataset.device = phone ? 'smartphone' : 'desktop-tablet';
    $('fullscreen').hidden = phone || plannerOpen || pickerOpen;
    if (phone && document.activeElement === $('fullscreen')) $('menu-toggle').focus({ preventScroll: true });
    document.body.classList.toggle('presentation', !plannerOpen && !pickerOpen && (roomPresentation || (phone && landscape.matches)));
    document.body.classList.toggle('room-presentation', roomPresentation);
    render();
}

async function toggleFullscreen() {
    if (isSmartphone() || plannerOpen || pickerOpen) return;
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
    if (mode === 'session' && run) {
        const next = transitionSession(run, timer, action, Date.now());
        run = next.run; timer = next.clock;
    } else if (timer) timer = transition(timer, action, Date.now());
    render();
}
function renderPicker() {
    const t = copy[language];
    const select = $('session-template');
    const selected = select.value;
    select.replaceChildren();
    const placeholder = document.createElement('option');
    placeholder.value = ''; placeholder.textContent = t.chooseTemplate; select.append(placeholder);
    for (const template of pickerTemplates) {
        const option = document.createElement('option');
        option.value = template.id;
        option.disabled = template.transitionMode !== 'manual';
        option.textContent = `${template.name}${option.disabled ? ` · ${t.automaticLater}` : ''}`;
        select.append(option);
    }
    select.value = selected;
    $('prepare-session').disabled = !pickerTemplates.some(item => item.id === select.value && item.transitionMode === 'manual');
    $('session-feedback').textContent = t[pickerMessage] || '';
}
function loadTemplates() {
    try {
        pickerTemplates = templateStore.load().templates;
        pickerMessage = pickerTemplates.length ? '' : 'emptyTemplates';
    } catch { pickerTemplates = []; pickerMessage = 'loadTemplatesError'; }
}
function exitPresentationForWorkspace() {
    fullscreenRequestId += 1;
    fullscreenRequested = false;
    expanded = false;
    return document.fullscreenElement ? document.exitFullscreen().catch(() => {}) : null;
}
async function switchMode(nextMode) {
    if (nextMode === 'quick' && mode === 'quick') return;
    dispatch({ type: 'TICK' });
    const hasProgress = timer && (mode === 'session' ? hasSessionProgress(run, timer) : timer.status !== 'READY');
    if (hasProgress && !window.confirm(copy[language].switchConfirm)) { dispatch({ type: 'TICK' }); return; }
    if (plannerOpen && !planner.close()) { dispatch({ type: 'TICK' }); return; }
    if (mode === 'quick') quickDurationMs = timer.durationMs;
    mode = nextMode; run = null; limitExceeded = false;
    pickerOpen = nextMode === 'session';
    timer = pickerOpen ? null : createTimer(quickDurationMs);
    if (pickerOpen) loadTemplates();
    setMenuOpen(false);
    const exiting = exitPresentationForWorkspace();
    if (exiting) await exiting;
    updatePresentation();
    (pickerOpen ? $('session-picker-heading') : $('primary')).focus({ preventScroll: true });
}
function render() {
    const t = copy[language];
    const session = mode === 'session' && run;
    document.body.dataset.mode = mode;
    document.body.classList.toggle('picker-open', pickerOpen);
    $('session-picker').hidden = !pickerOpen || plannerOpen;
    $('open-quick').hidden = mode === 'quick';
    $('session-context').hidden = !session;
    planner.setLanguage(language);
    $('planner').setAttribute('aria-label', t.planner);
    const fullscreen = Boolean(document.fullscreenElement);
    const fullscreenLabel = fullscreen ? t.exitFullscreen : expanded ? t.exitExpanded : document.fullscreenEnabled ? t.fullscreen : t.expand;
    $('fullscreen').title = fullscreenLabel;
    $('fullscreen').setAttribute('aria-label', fullscreenLabel);
    $('fullscreen').setAttribute('aria-pressed', String(fullscreen || expanded));
    const menuLabel = t[menuOpen ? 'closeMenu' : 'openMenu'];
    $('menu-toggle').setAttribute('aria-label', menuLabel);
    $('menu-toggle').title = menuLabel;
    const { totalMs, plannedMs, adjustmentMs } = timer ? timeBudget(timer) : { totalMs: 1, plannedMs: 0, adjustmentMs: 0 };
    $('time').dataset.visualState = timer ? timeVisualState(timer, totalMs) : 'NORMAL';
    const remaining = timer ? Math.max(0, Math.min(1, timer.remainingMs / totalMs)) : 1;
    $('progress').style.setProperty('--remaining', `${remaining * 100}%`);
    document.documentElement.lang = language;
    document.documentElement.dataset.theme = theme;
    document.querySelectorAll('[data-copy]').forEach(el => { el.textContent = t[el.dataset.copy]; });
    document.querySelector('.duration-config').hidden = mode !== 'quick' || timer?.status !== 'READY';
    document.querySelector('.duration-adjustments').hidden = mode !== 'quick';
    $('adjustment-heading').textContent = t[timer?.status === 'READY' ? 'addDuration' : timer?.status === 'FINISHED' ? 'extendBudget' : 'extendRemaining'];
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
        button.disabled = mode !== 'quick' || timer?.status !== 'READY';
        button.setAttribute('aria-pressed', String(timer?.durationMs === Number(button.dataset.preset)));
    });
    if (pickerOpen) renderPicker();
    if (!timer) {
        updateClockView();
        if (document.title !== 'easyTimer') document.title = 'easyTimer';
        return;
    }
    $('heading').textContent = session ? t.session : t.countdown;
    if (session) {
        $('workshop-name').textContent = run.name;
        const phase = run.phases[run.currentIndex];
        const phaseTitle = run.stage === 'COMPLETED' ? t.workshopComplete : phase.title;
        if ($('current-phase').textContent !== phaseTitle) $('current-phase').textContent = phaseTitle;
        $('phase-number').textContent = run.stage === 'COMPLETED' ? t.workshopComplete : t.phaseCount(run.currentIndex + 1, run.phases.length);
        $('phase-number').hidden = run.stage === 'COMPLETED';
    }
    const time = formatTimerReadout(timer);
    if ($('time').textContent !== time) $('time').textContent = time;
    $('time').style.setProperty('--clock-width', `${Math.min(28, 140 / time.length)}cqw`);
    const overtime = formatOvertime(timer.overtimeMs);
    const isOvertime = ['FINISHED', 'OVERTIME_PAUSED', 'OVERTIME_STOPPED'].includes(timer.status);
    const paused = ['PAUSED', 'OVERTIME_PAUSED'].includes(timer.status);
    const title = timer.status === 'READY' ? 'easyTimer' : `${isOvertime ? overtime : time}${paused ? ' ⏸' : ''} · easyTimer`;
    if (document.title !== title) document.title = title;
    const overtimeLabel = session ? t[run.stage === 'COMPLETED' ? 'finalOvertime' : 'phaseOvertime'] : t.overtime;
    $('time').setAttribute('aria-label', `${isOvertime ? overtimeLabel : session ? t.session : t.countdown}: ${time}`);
    const status = session && run.stage === 'COMPLETED'
        ? `${t.workshopComplete}${paused ? ` · ${t.PAUSED}` : timer.status === 'OVERTIME_STOPPED' ? ` · ${t.overtimeStopped}` : ''}`
        : session && timer.status === 'FINISHED' ? t.phaseExpired : t[timer.status];
    if ($('status').textContent !== status) $('status').textContent = status;
    const primary = session ? (['RUNNING', 'FINISHED'].includes(timer.status) ? 'pause' : paused ? 'resume' : 'start')
        : timer.status === 'RUNNING' ? 'pause' : timer.status === 'PAUSED' ? 'resume' : timer.status === 'FINISHED' ? 'newRun' : 'start';
    $('primary').hidden = timer.status === 'OVERTIME_STOPPED';
    $('primary-label').textContent = t[primary];
    $('primary-icon').setAttribute('d', primary === 'pause' ? 'M7 4v16M17 4v16' : 'm8 4 12 8-12 8Z');
    $('primary').title = t[primary];
    $('primary').setAttribute('aria-label', t[primary]);
    $('stop').hidden = session ? !hasSessionProgress(run, timer) : timer.status === 'READY';
    const stopLabel = session ? t.stopWorkshop : t.stop;
    $('stop').querySelector('.action-label').textContent = stopLabel;
    $('stop').setAttribute('aria-label', stopLabel);
    $('stop').title = stopLabel;
    $('next').hidden = !session || run.stage === 'COMPLETED';
    $('next').disabled = !session || run.stage === 'COMPLETED';
    const upcoming = session && run.stage === 'PHASE' ? run.phases[run.currentIndex + 1] : null;
    const nextLabel = upcoming ? `${t.upNext}: ${upcoming.title}` : t.complete;
    $('next-label').textContent = upcoming ? t.upNext : t.complete;
    $('next-phase').textContent = upcoming ? upcoming.title : '';
    $('next-phase').hidden = !upcoming;
    $('next').setAttribute('aria-label', nextLabel); $('next').title = nextLabel;
    $('next-icon').setAttribute('d', upcoming ? 'M4 12h16m-6-6 6 6-6 6' : 'm4 12 5 5L20 6');
    $('stop-overtime').hidden = !session || run.stage !== 'COMPLETED' || timer.status === 'OVERTIME_STOPPED';
    $('stop-overtime').setAttribute('aria-label', t.stopOvertime); $('stop-overtime').title = t.stopOvertime;
    document.querySelectorAll('[data-adjustment]').forEach(button => button.setAttribute('aria-label', t.addTime(Number(button.dataset.adjustment) / 1000)));
    const budget = session ? `${t.workshopRemaining} ${formatTime(sessionRemaining(run, timer))}`
        : `${t.total} ${formatTime(totalMs)}${adjustmentMs ? ` · ${t.planned} ${formatTime(plannedMs)} + ${formatTime(adjustmentMs)}` : ''}`;
    if ($('time-budget').textContent !== budget) $('time-budget').textContent = budget;
    const help = limitExceeded ? t.limit : '';
    if ($('help').textContent !== help) $('help').textContent = help;
    $('help').dataset.error = String(limitExceeded);
    updateClockView();
}

$('primary').addEventListener('click', () => {
    if (mode === 'session') { if (run) dispatch({ type: 'PRIMARY' }); return; }
    limitExceeded = false;
    if (timer.status === 'RUNNING') dispatch({ type: 'PAUSE' });
    else if (timer.status === 'PAUSED') dispatch({ type: 'RESUME' });
    else dispatch({ type: 'START' });
});
$('stop').addEventListener('click', () => {
    if (mode === 'session') {
        if (!run || !window.confirm(copy[language].stopWorkshopConfirm)) { dispatch({ type: 'TICK' }); return; }
        dispatch({ type: 'STOP_WORKSHOP' }); $('primary').focus({ preventScroll: true }); return;
    }
    const restoreFocus = document.activeElement === $('stop');
    limitExceeded = false;
    timer = transition(timer, { type: 'STOP' }, Date.now());
    render();
    if (restoreFocus) $('primary').focus({ preventScroll: true });
});
document.querySelectorAll('[data-preset]').forEach(button => button.addEventListener('click', () => {
    if (mode !== 'quick' || timer.status !== 'READY') return;
    limitExceeded = false;
    timer = transition(timer, { type: 'CONFIGURE', durationMs: Number(button.dataset.preset) }, Date.now());
    render();
}));
document.querySelectorAll('[data-adjustment]').forEach(button => button.addEventListener('click', () => {
    if (mode !== 'quick') return;
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
$('open-session').addEventListener('click', () => switchMode('session'));
$('open-quick').addEventListener('click', () => switchMode('quick'));
$('picker-back').addEventListener('click', () => switchMode('quick'));
$('reload-templates').addEventListener('click', () => { loadTemplates(); render(); });
$('session-template').addEventListener('change', () => {
    $('prepare-session').disabled = !pickerTemplates.some(item => item.id === $('session-template').value && item.transitionMode === 'manual');
});
$('prepare-session').addEventListener('click', () => {
    if (mode !== 'session' || !pickerOpen || plannerOpen) return;
    const template = pickerTemplates.find(item => item.id === $('session-template').value);
    if (!template || template.transitionMode !== 'manual') return;
    try {
        const prepared = prepareSession(template);
        run = prepared.run; timer = prepared.clock; pickerOpen = false;
        updatePresentation(); $('primary').focus({ preventScroll: true });
    } catch { pickerMessage = 'loadTemplatesError'; render(); }
});
$('next').addEventListener('click', () => {
    if (mode !== 'session' || !run || run.stage !== 'PHASE') return;
    dispatch({ type: run.currentIndex === run.phases.length - 1 ? 'COMPLETE' : 'NEXT' });
    $('primary').focus({ preventScroll: true });
});
$('stop-overtime').addEventListener('click', () => {
    if (mode !== 'session' || !run) return;
    dispatch({ type: 'STOP_OVERTIME' }); $('stop').focus({ preventScroll: true });
});
$('open-planner').addEventListener('click', async () => {
    setMenuOpen(false);
    // Navigation invalidates fullscreen requests; returning never restores them implicitly.
    plannerOpen = true;
    document.body.classList.add('planner-open');
    $('planner').hidden = false;
    const exiting = exitPresentationForWorkspace();
    if (exiting) await exiting;
    if (!plannerOpen) return;
    updatePresentation();
    planner.open();
});
document.addEventListener('click', event => {
    // Consume the restoring click before hidden controls can become interactive again.
    if (clockOnly) {
        event.preventDefault(); event.stopImmediatePropagation();
        setClockOnly(false);
    } else if (event.target.closest('#clock-view-toggle')) {
        event.preventDefault(); event.stopImmediatePropagation();
        setClockOnly(true);
    }
}, true);
document.addEventListener('click', event => {
    if (menuOpen && !$('preferences-menu').contains(event.target)) setMenuOpen(false);
});
// Callbacks only refresh the display; the deadline remains authoritative.
setInterval(() => { if (timer && ['RUNNING', 'FINISHED'].includes(timer.status)) dispatch({ type: 'TICK' }); }, 100);
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
coarsePointer.addEventListener('change', updatePresentation);
window.addEventListener('resize', updatePresentation);
document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && clockOnly) {
        event.preventDefault(); event.stopImmediatePropagation();
        setClockOnly(false);
        return;
    }
    if (event.key === 'Escape' && menuOpen) {
        event.preventDefault();
        event.stopPropagation();
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
