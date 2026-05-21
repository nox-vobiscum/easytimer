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
const shell = document.querySelector('.vscode-shell');

let timerInterval;
let remainingSeconds = 0;
let running = false;
let paused = false;
let isFullscreen = false;

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

function updateButtonStates() {
    const isStopped = !running && !paused;
    startBtn.disabled = running || paused || remainingSeconds === 0;
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
}

function updateStatus(text) {
    statusBadge.textContent = text;
}

function tick() {
    if (remainingSeconds <= 0) {
        stopTimer('Finished!');
        return;
    }
    remainingSeconds -= 1;
    timeDisplay.textContent = formatTime(remainingSeconds);
    if (remainingSeconds === 0) {
        stopTimer('Finished!');
    }
}

function startTimer() {
    if (running) return;
    if (remainingSeconds === 0) {
        setRemainingFromInput();
    }
    if (remainingSeconds === 0) {
        updateStatus('Please enter duration');
        return;
    }
    running = true;
    paused = false;
    updateStatus('Running');
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
    setRemainingFromInput();
    updateStatus('Ready');
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
    if (event.key === 'Escape' && !menuOverlay.classList.contains('hidden')) {
        closeMenu();
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
    if (!running) {
        paused = false;
        setRemainingFromInput();
        clearActivePreset();
    }
});

minutesInput.addEventListener('input', () => {
    if (!running) {
        paused = false;
        setRemainingFromInput();
        clearActivePreset();
    }
});

secondsInput.addEventListener('input', () => {
    if (!running) {
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

const savedTheme = localStorage.getItem('easyTimerTheme') || 'system';
applyTheme(savedTheme);

setRemainingFromInput();
updateButtonStates();
