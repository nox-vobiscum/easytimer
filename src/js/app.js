const timeDisplay = document.getElementById('time');
const statusBadge = document.getElementById('timerStatus');
const hoursInput = document.getElementById('hoursInput');
const minutesInput = document.getElementById('minutesInput');
const secondsInput = document.getElementById('secondsInput');
const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const resetBtn = document.getElementById('resetBtn');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const closeFullscreenBtn = document.getElementById('closeFullscreenBtn');
const toggleControlsBtn = document.getElementById('toggleControlsBtn');
const presetButtons = document.querySelectorAll('.preset-btn');
const menuToggleBtn = document.getElementById('menuToggleBtn');
const menuOverlay = document.getElementById('appMenuOverlay');
const themeButtons = document.querySelectorAll('.theme-btn');
const editSessionsBtn = document.getElementById('editSessionsBtn');
const sessionEditorOverlay = document.getElementById('sessionEditorOverlay');
const closeSessionEditorBtn = document.getElementById('closeSessionEditor');
const saveSessionsBtn = document.getElementById('saveSessionsBtn');
const cancelSessionsBtn = document.getElementById('cancelSessionsBtn');
const addSessionBtn = document.getElementById('addSessionBtn');
const sessionList = document.getElementById('sessionList');
const modeRadioButtons = document.querySelectorAll('input[name="timerMode"]');
const sessionTransitionModeRadios = document.querySelectorAll('input[name="sessionTransitionMode"]');
const sessionTransitionModeSection = document.getElementById('sessionTransitionModeSection');
const timerHeading = document.getElementById('timer-heading');
const sessionSummary = document.getElementById('sessionSummary');
const sessionTotalTime = document.getElementById('sessionTotalTime');
const nextSessionBtn = document.getElementById('nextSessionBtn');
const restartSessionBtn = document.getElementById('restartSessionBtn');
const shell = document.querySelector('.vscode-shell');

let timerInterval;
let remainingSeconds = 0;
let running = false;
let paused = false;
let isFullscreen = false;
let timerMode = 'countdown';
let sessionTransitionMode = 'auto';
let pendingNextSession = false;
let sessions = [];
let activeSessionIndex = 0;

function formatTime(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
        return (
            String(hours).padStart(2, '0') + ':' +
            String(minutes).padStart(2, '0') + ':' +
            String(seconds).padStart(2, '0')
        );
    }

    return String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
}

function setRemainingFromInput() {
    const hours = Math.max(0, Math.min(99, Number(hoursInput.value) || 0));
    const minutes = Math.max(0, Math.min(59, Number(minutesInput.value) || 0));
    const seconds = Math.max(0, Math.min(59, Number(secondsInput.value) || 0));
    remainingSeconds = hours * 3600 + minutes * 60 + seconds;
    timeDisplay.textContent = formatTime(remainingSeconds);
}

function setRemainingFromSession() {
    if (sessions.length === 0) {
        remainingSeconds = 0;
        timeDisplay.textContent = formatTime(remainingSeconds);
        return;
    }
    activeSessionIndex = Math.min(activeSessionIndex, sessions.length - 1);
    const currentSession = sessions[activeSessionIndex];
    remainingSeconds = currentSession.duration;
    timeDisplay.textContent = formatTime(remainingSeconds);
}

function updateTimerHeading() {
    if (timerMode === 'sessions') {
        const currentSession = sessions[activeSessionIndex];
        timerHeading.textContent = currentSession ? `Session: ${currentSession.title}` : 'Session mode';
        timerHeading.classList.remove('hidden');
    } else {
        timerHeading.textContent = 'Countdown';
        timerHeading.classList.add('hidden');
    }
}

function getCurrentSessionLabel() {
    return sessions.length ? `Session ${activeSessionIndex + 1}/${sessions.length}` : 'No sessions defined';
}

function loadSessions() {
    const saved = localStorage.getItem('easyTimerSessions');
    try {
        sessions = saved ? JSON.parse(saved) : [];
    } catch {
        sessions = [];
    }
    if (!Array.isArray(sessions)) {
        sessions = [];
    }
}

function saveSessions() {
    localStorage.setItem('easyTimerSessions', JSON.stringify(sessions));
}

function getTotalRemainingSessionTime() {
    if (sessions.length === 0 || activeSessionIndex >= sessions.length) {
        return 0;
    }
    const remainingOfCurrent = remainingSeconds;
    const futureSessions = sessions.slice(activeSessionIndex + 1).reduce((sum, session) => sum + session.duration, 0);
    return remainingOfCurrent + futureSessions;
}

function updateSessionSummary() {
    if (timerMode !== 'sessions' || sessions.length === 0) {
        sessionSummary.classList.add('hidden');
        return;
    }
    sessionSummary.classList.remove('hidden');
    sessionTotalTime.textContent = formatTime(getTotalRemainingSessionTime());
}

function renderSessionEditorRows() {
    sessionList.innerHTML = '';
    if (sessions.length === 0) {
        addSessionRow({ title: '', duration: 5 });
        return;
    }
    sessions.forEach(addSessionRow);
}

function addSessionRow(session = { title: '', duration: 5 }) {
    const row = document.createElement('div');
    row.className = 'session-row';

    const dragHandle = document.createElement('div');
    dragHandle.className = 'session-drag-handle';
    dragHandle.textContent = '☰';
    dragHandle.setAttribute('aria-hidden', 'true');

    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.className = 'session-row-title';
    titleInput.placeholder = 'Session title';
    titleInput.value = session.title || '';
    titleInput.setAttribute('aria-label', 'Session title');

    const durationWrapper = document.createElement('div');
    durationWrapper.className = 'session-duration-wrapper';
    durationWrapper.style.position = 'relative';

    const durationInput = document.createElement('input');
    durationInput.type = 'number';
    durationInput.className = 'session-row-duration';
    durationInput.min = '1';
    durationInput.step = '1';
    durationInput.value = Math.max(1, Number(session.duration || 5) / 60);
    durationInput.setAttribute('aria-label', 'Session duration in minutes');

    const unitLabel = document.createElement('span');
    unitLabel.className = 'session-unit';
    unitLabel.textContent = 'min';

    durationWrapper.appendChild(durationInput);
    durationWrapper.appendChild(unitLabel);

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'session-remove';
    removeButton.textContent = '✕';
    removeButton.setAttribute('aria-label', 'Remove session');
    removeButton.addEventListener('click', () => row.remove());

    row.draggable = true;
    row.addEventListener('dragstart', (event) => {
        row.classList.add('dragging');
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', 'dragging');
        sessionList.dataset.dragSourceIndex = Array.from(sessionList.children).indexOf(row);
    });

    row.addEventListener('dragend', () => {
        row.classList.remove('dragging');
        delete sessionList.dataset.dragSourceIndex;
    });

    row.addEventListener('dragover', (event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        row.classList.add('drag-over');
    });

    row.addEventListener('dragleave', () => {
        row.classList.remove('drag-over');
    });

    row.addEventListener('drop', (event) => {
        event.preventDefault();
        row.classList.remove('drag-over');
        const sourceIndex = Number(sessionList.dataset.dragSourceIndex);
        const targetIndex = Array.from(sessionList.children).indexOf(row);
        if (sourceIndex === targetIndex || Number.isNaN(sourceIndex)) {
            return;
        }
        const sourceRow = sessionList.children[sourceIndex];
        if (sourceIndex < targetIndex) {
            sessionList.insertBefore(sourceRow, row.nextSibling);
        } else {
            sessionList.insertBefore(sourceRow, row);
        }
    });

    row.appendChild(dragHandle);
    row.appendChild(titleInput);
    row.appendChild(durationWrapper);
    row.appendChild(removeButton);
    sessionList.appendChild(row);
}

function getEditorSessions() {
    return Array.from(sessionList.querySelectorAll('.session-row')).map((row) => {
        const title = row.querySelector('.session-row-title')?.value.trim() || 'Untitled';
        const durationMinutes = Math.max(1, Number(row.querySelector('.session-row-duration')?.value) || 1);
        return { title, duration: durationMinutes * 60 };
    });
}

function openSessionEditor() {
    renderSessionEditorRows();
    sessionEditorOverlay.classList.remove('hidden');
    sessionEditorOverlay.setAttribute('aria-hidden', 'false');
    closeMenu();
}

function closeSessionEditor() {
    sessionEditorOverlay.classList.add('hidden');
    sessionEditorOverlay.setAttribute('aria-hidden', 'true');
}

function setTimerMode(mode) {
    timerMode = mode;
    localStorage.setItem('easyTimerMode', mode);
    modeRadioButtons.forEach((radio) => {
        radio.checked = radio.value === mode;
    });
    updateTimerHeading();
    if (timerMode === 'sessions') {
        if (sessions.length > 0) {
            activeSessionIndex = Math.min(activeSessionIndex, sessions.length - 1);
            setRemainingFromSession();
            updateStatus(getCurrentSessionLabel());
        } else {
            remainingSeconds = 0;
            timeDisplay.textContent = formatTime(remainingSeconds);
            updateStatus('No sessions defined');
        }
    } else {
        activeSessionIndex = 0;
        pendingNextSession = false;
        setRemainingFromInput();
        updateStatus('Ready');
    }
    updateButtonStates();
    updateEditSessionsAvailability();
    updateSessionTransitionModeDisplay();
}

function setSessionTransitionMode(mode) {
    sessionTransitionMode = mode;
    localStorage.setItem('easyTimerTransitionMode', mode);
    sessionTransitionModeRadios.forEach((radio) => {
        radio.checked = radio.value === mode;
    });
}

function updateSessionTransitionModeDisplay() {
    if (sessionTransitionModeSection) {
        sessionTransitionModeSection.classList.toggle('hidden', timerMode !== 'sessions');
    }
}

function completeSession() {
    clearInterval(timerInterval);
    running = false;
    paused = false;
    if (activeSessionIndex < sessions.length - 1) {
        if (sessionTransitionMode === 'auto') {
            activeSessionIndex += 1;
            setRemainingFromSession();
            updateTimerHeading();
            updateStatus(`Starting ${sessions[activeSessionIndex].title}`);
            updateButtonStates();
            startTimer();
            return;
        }
        pendingNextSession = true;
        updateStatus('Session complete — click Resume for next session');
        updateButtonStates();
    } else {
        stopTimer('All sessions complete');
    }
}

function goToNextSession() {
    if (sessions.length === 0 || activeSessionIndex >= sessions.length - 1) {
        stopTimer('No next session');
        return;
    }
    clearInterval(timerInterval);
    running = false;
    paused = false;
    activeSessionIndex += 1;
    setRemainingFromSession();
    updateTimerHeading();
    updateStatus(`Starting ${sessions[activeSessionIndex].title}`);
    updateButtonStates();
    startTimer();
}

function setRemainingForCurrentMode() {
    if (timerMode === 'sessions') {
        setRemainingFromSession();
    } else {
        setRemainingFromInput();
    }
}

function updateModeFromStorage() {
    const savedMode = localStorage.getItem('easyTimerMode');
    if (savedMode === 'sessions' || savedMode === 'countdown') {
        timerMode = savedMode;
    }
    modeRadioButtons.forEach((radio) => {
        radio.checked = radio.value === timerMode;
    });
    updateTimerHeading();
}

function updateStatusForMode() {
    if (timerMode === 'sessions' && sessions.length > 0) {
        updateStatus(getCurrentSessionLabel());
    }
}

function getTimerModeLabel() {
    return timerMode === 'sessions' ? 'Session mode' : 'Countdown';
}

function updateModeDisplay() {
    updateTimerHeading();
    updateButtonStates();
}

function syncModeSelection() {
    modeRadioButtons.forEach((radio) => {
        radio.addEventListener('change', () => {
            if (radio.checked) {
                setTimerMode(radio.value);
            }
        });
    });
}

function updateButtonStates() {
    const hasDuration = remainingSeconds > 0 || (timerMode === 'sessions' && sessions.length > 0);
    const isStopped = !running && !paused;
    startBtn.disabled = running || paused || !hasDuration;
    pauseBtn.disabled = isStopped;
    pauseBtn.textContent = paused ? 'Resume' : 'Pause';

    if (running || paused) {
        startBtn.classList.remove('primary');
        startBtn.classList.add('secondary');
        pauseBtn.classList.remove('secondary');
        pauseBtn.classList.add('primary');
    } else {
        startBtn.classList.remove('secondary');
        startBtn.classList.add('primary');
        pauseBtn.classList.remove('primary');
        pauseBtn.classList.add('secondary');
    }

    resetBtn.disabled = !running && remainingSeconds === 0;

    if (timerMode === 'sessions') {
        nextSessionBtn.classList.remove('hidden');
        restartSessionBtn.classList.remove('hidden');
        restartSessionBtn.disabled = sessions.length === 0;
        nextSessionBtn.disabled = sessions.length <= 1 || activeSessionIndex >= sessions.length - 1;
        updateSessionSummary();
    } else {
        nextSessionBtn.classList.add('hidden');
        restartSessionBtn.classList.add('hidden');
        sessionSummary.classList.add('hidden');
    }
}

function updateEditSessionsAvailability() {
    if (!editSessionsBtn) return;
    editSessionsBtn.disabled = timerMode !== 'sessions';
}

function updateStatus(text) {
    statusBadge.textContent = text;
}

function tick() {
    if (remainingSeconds <= 0) {
        if (timerMode === 'sessions') {
            completeSession();
        } else {
            stopTimer('Finished!');
        }
        return;
    }
    remainingSeconds -= 1;
    timeDisplay.textContent = formatTime(remainingSeconds);
    if (timerMode === 'sessions') {
        updateSessionSummary();
    }
    if (remainingSeconds === 0) {
        if (timerMode === 'sessions') {
            completeSession();
        } else {
            stopTimer('Finished!');
        }
    }
}

function startTimer() {
    if (running) return;
    if (remainingSeconds === 0) {
        if (timerMode === 'sessions') {
            if (sessions.length === 0) {
                updateStatus('Add at least one session');
                return;
            }
            if (pendingNextSession) {
                pendingNextSession = false;
                activeSessionIndex = Math.min(activeSessionIndex + 1, sessions.length - 1);
                updateTimerHeading();
            }
            setRemainingFromSession();
        } else {
            setRemainingFromInput();
        }
    }
    if (remainingSeconds === 0) {
        updateStatus('Please enter duration');
        return;
    }
    running = true;
    paused = false;
    updateStatus(timerMode === 'sessions' ? getCurrentSessionLabel() : 'Running');
    updateButtonStates();
    timerInterval = setInterval(tick, 1000);
}

function pauseTimer() {
    if (!running) return;
    clearInterval(timerInterval);
    running = false;
    paused = true;
    updateStatus('Paused');
    updateButtonStates();
}

function resetTimer() {
    clearInterval(timerInterval);
    running = false;
    paused = false;
    pendingNextSession = false;
    if (timerMode === 'sessions') {
        activeSessionIndex = 0;
        setRemainingFromSession();
        updateTimerHeading();
        updateSessionSummary();
    } else {
        setRemainingFromInput();
    }
    updateStatus('Ready');
    updateButtonStates();
}

function restartCurrentSession() {
    if (timerMode !== 'sessions' || sessions.length === 0) {
        return;
    }
    const currentSession = sessions[activeSessionIndex];
    if (!currentSession) {
        return;
    }
    remainingSeconds = currentSession.duration;
    timeDisplay.textContent = formatTime(remainingSeconds);
    updateSessionSummary();
    if (running) {
        clearInterval(timerInterval);
        timerInterval = setInterval(tick, 1000);
        updateStatus(getCurrentSessionLabel());
    } else if (paused) {
        updateStatus('Paused');
    } else {
        updateStatus('Ready');
    }
    updateButtonStates();
}

function setPresetTime(seconds, button) {
    paused = false;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    hoursInput.value = hours;
    minutesInput.value = minutes;
    secondsInput.value = secs;
    remainingSeconds = seconds;
    timeDisplay.textContent = formatTime(remainingSeconds);
    updateButtonStates();
    setActivePreset(button);
}

function setActivePreset(button) {
    presetButtons.forEach((preset) => {
        preset.classList.toggle('active', preset === button);
    });
}

function clearActivePreset() {
    presetButtons.forEach((preset) => {
        preset.classList.remove('active');
    });
}

function applyTheme(theme) {
    if (theme === 'system') {
        document.documentElement.removeAttribute('data-theme');
    } else {
        document.documentElement.setAttribute('data-theme', theme);
    }
    localStorage.setItem('easyTimerTheme', theme);
    themeButtons.forEach((button) => {
        button.classList.toggle('active', button.dataset.theme === theme);
    });
}

function openMenu() {
    menuOverlay.classList.remove('hidden');
    menuOverlay.setAttribute('aria-hidden', 'false');
    menuToggleBtn.textContent = '✕';
    menuToggleBtn.setAttribute('aria-expanded', 'true');
}

function closeMenu() {
    menuOverlay.classList.add('hidden');
    menuOverlay.setAttribute('aria-hidden', 'true');
    menuToggleBtn.textContent = '☰';
    menuToggleBtn.setAttribute('aria-expanded', 'false');
}

function toggleMenu() {
    if (menuOverlay.classList.contains('hidden')) {
        openMenu();
    } else {
        closeMenu();
    }
}

function closeMenuOnOutsideClick(event) {
    if (!menuOverlay.classList.contains('hidden') && !menuOverlay.contains(event.target) && event.target !== menuToggleBtn) {
        closeMenu();
    }
}

function closeMenuOnEscape(event) {
    if (event.key !== 'Escape') {
        return;
    }
    if (!menuOverlay.classList.contains('hidden')) {
        closeMenu();
        return;
    }
    if (!sessionEditorOverlay.classList.contains('hidden')) {
        closeSessionEditor();
    }
}

function closeFullscreenControls() {
    shell.classList.remove('controls-open');
    toggleControlsBtn.setAttribute('aria-expanded', 'false');
    toggleControlsBtn.querySelector('.toggle-icon').textContent = '▾';
}

function openFullscreenControls() {
    shell.classList.add('controls-open');
    toggleControlsBtn.setAttribute('aria-expanded', 'true');
    toggleControlsBtn.querySelector('.toggle-icon').textContent = '▴';
}

function toggleFullscreenControls() {
    if (shell.classList.contains('controls-open')) {
        closeFullscreenControls();
    } else {
        openFullscreenControls();
    }
}

function stopTimer(message) {
    clearInterval(timerInterval);
    running = false;
    paused = false;
    updateStatus(message);
    updateButtonStates();
}

function enterFullscreen() {
    isFullscreen = true;
    shell.classList.add('fullscreen-mode');
    closeFullscreenBtn.classList.remove('hidden');
    fullscreenBtn.disabled = true;
    closeFullscreenControls();
}

function exitFullscreen() {
    isFullscreen = false;
    shell.classList.remove('fullscreen-mode');
    closeFullscreenBtn.classList.add('hidden');
    fullscreenBtn.disabled = false;
    closeFullscreenControls();
}

hoursInput.addEventListener('input', () => {
    if (!running && timerMode === 'countdown') {
        paused = false;
        setRemainingFromInput();
        clearActivePreset();
    }
});

minutesInput.addEventListener('input', () => {
    if (!running && timerMode === 'countdown') {
        paused = false;
        setRemainingFromInput();
        clearActivePreset();
    }
});

secondsInput.addEventListener('input', () => {
    if (!running && timerMode === 'countdown') {
        paused = false;
        setRemainingFromInput();
        clearActivePreset();
    }
});

presetButtons.forEach((button) => {
    button.addEventListener('click', () => {
        setPresetTime(Number(button.dataset.seconds), button);
    });
});

toggleControlsBtn.addEventListener('click', toggleFullscreenControls);

startBtn.addEventListener('click', () => {
    startTimer();
    if (isFullscreen) {
        closeFullscreenControls();
    }
});
pauseBtn.addEventListener('click', () => {
    if (paused) {
        startTimer();
        if (isFullscreen) {
            closeFullscreenControls();
        }
    } else {
        pauseTimer();
    }
});
restartSessionBtn.addEventListener('click', restartCurrentSession);
nextSessionBtn.addEventListener('click', goToNextSession);
resetBtn.addEventListener('click', resetTimer);
fullscreenBtn.addEventListener('click', enterFullscreen);
closeFullscreenBtn.addEventListener('click', exitFullscreen);
menuToggleBtn.addEventListener('click', toggleMenu);
menuOverlay.addEventListener('click', (event) => {
    if (event.target === menuOverlay) {
        closeMenu();
    }
});
window.addEventListener('click', closeMenuOnOutsideClick);
window.addEventListener('keydown', closeMenuOnEscape);

themeButtons.forEach((button) => {
    button.addEventListener('click', () => {
        applyTheme(button.dataset.theme);
    });
});

editSessionsBtn.addEventListener('click', openSessionEditor);
closeSessionEditorBtn.addEventListener('click', closeSessionEditor);
cancelSessionsBtn.addEventListener('click', closeSessionEditor);
addSessionBtn.addEventListener('click', () => addSessionRow());
sessionEditorOverlay.addEventListener('click', (event) => {
    if (event.target === sessionEditorOverlay) {
        closeSessionEditor();
    }
});
saveSessionsBtn.addEventListener('click', () => {
    sessions = getEditorSessions();
    saveSessions();
    activeSessionIndex = 0;
    closeSessionEditor();
    setTimerMode(timerMode);
    updateStatus('Sessions saved');
});

const savedTheme = localStorage.getItem('easyTimerTheme') || 'system';
applyTheme(savedTheme);
loadSessions();
const savedTransitionMode = localStorage.getItem('easyTimerTransitionMode');
if (savedTransitionMode === 'auto' || savedTransitionMode === 'manual') {
    sessionTransitionMode = savedTransitionMode;
}
updateModeFromStorage();
syncModeSelection();
setSessionTransitionMode(sessionTransitionMode);

if (timerMode === 'sessions') {
    setRemainingFromSession();
} else {
    setRemainingFromInput();
}
updateButtonStates();
updateEditSessionsAvailability();
