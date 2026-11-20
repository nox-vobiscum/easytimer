import { PHASE_CATEGORIES } from './editor-domain.mjs';
import { editNativePhaseDraft } from './editor-template-draft.mjs';

const copy = {
    en: {
        title: 'Phase title', duration: 'Duration (min)', category: 'Phase category',
        showDetails: 'Show phase details', hideDetails: 'Hide phase details',
        chooseCategory: 'Choose phase category', uncategorized: 'Uncategorized', presentation: 'Presentation',
        discussion: 'Discussion', breakout: 'Breakout', break: 'Break',
        phaseTitle: 'Each phase needs a title containing 1–120 characters.',
        durationError: 'Enter a whole number from 1 to 6,000 minutes.',
        invalidCategory: 'Choose a supported phase category.',
        drag: title => `Drag ${title}. Press Enter or Space to choose a position.`,
        changePosition: position => `Phase ${position} – Change position`,
        positionFor: (position, title) => `Change position for phase ${position}: ${title}`,
        position: 'Position', move: 'Move', cancel: 'Cancel', untitled: 'Untitled phase',
        phaseNotFound: 'This phase is no longer in the draft. Your input has been retained.',
        editFailed: 'The draft could not be updated. Your input has been retained.',
    },
    de: {
        title: 'Phasentitel', duration: 'Dauer (min)', category: 'Phasenkategorie',
        showDetails: 'Phasendetails anzeigen', hideDetails: 'Phasendetails ausblenden',
        chooseCategory: 'Phasenkategorie auswählen', uncategorized: 'Ohne Kategorie', presentation: 'Präsentation',
        discussion: 'Diskussion', breakout: 'Gruppenarbeit', break: 'Pause',
        phaseTitle: 'Jede Phase benötigt einen Titel mit 1–120 Zeichen.',
        durationError: 'Eine ganze Zahl von 1 bis 6.000 Minuten eingeben.',
        invalidCategory: 'Eine unterstützte Phasenkategorie auswählen.',
        drag: title => `${title} verschieben. Mit Eingabe oder Leertaste eine Position auswählen.`,
        changePosition: position => `Phase ${position} – Position ändern`,
        positionFor: (position, title) => `Position für Phase ${position} ändern: ${title}`,
        position: 'Position', move: 'Verschieben', cancel: 'Abbrechen', untitled: 'Unbenannte Phase',
        phaseNotFound: 'Diese Phase ist nicht mehr im Entwurf. Deine Eingabe bleibt erhalten.',
        editFailed: 'Der Entwurf konnte nicht geändert werden. Deine Eingabe bleibt erhalten.',
    },
};

const categoryIconPaths = Object.freeze({
    uncategorized: 'M3 12a9 9 0 1 0 18 0 9 9 0 1 0-18 0M5.6 5.6l12.8 12.8',
    presentation: 'M3 4h18v13H3zM8 21l4-4 4 4',
    discussion: 'M4 5h11v8H8l-4 4V5m12 3h4v10h-4l-3 3v-5',
    breakout: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8m9 0a3 3 0 1 0 0-6m4 16v-2a4 4 0 0 0-3-3.87',
    break: 'M3 8h13v5a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5V8m13 2h2a3 3 0 0 1 0 6h-3M3 21h15',
});

function categoryIcon(category) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d', categoryIconPaths[category]); svg.append(path); return svg;
}

// One phase's presentation only. The caller owns the current Planner Service
// draft and adopts edits synchronously; no draft, library or storage is cached.
export function createNativePhaseFields({ getDraft, onDraftChange, onReposition, phaseId, language = 'en' }) {
    if (typeof getDraft !== 'function' || typeof onDraftChange !== 'function'
        || typeof onReposition !== 'function' || typeof phaseId !== 'string' || !phaseId.trim() || !copy[language]) {
        throw new Error('invalidPhaseFields');
    }
    const row = document.createElement('li');
    row.className = 'native-phase-fields';
    row.dataset.nativePhaseId = phaseId;
    const prefix = `native-phase-${crypto.randomUUID()}`;
    const dragHandle = document.createElement('button');
    dragHandle.type = 'button'; dragHandle.className = 'phase-drag-handle';
    dragHandle.dataset.action = 'drag'; dragHandle.textContent = '⠿';
    const number = document.createElement('button');
    number.type = 'button'; number.className = 'phase-number phase-position-button';
    number.dataset.action = 'position';
    number.setAttribute('aria-expanded', 'false');
    number.setAttribute('aria-controls', `${prefix}-position`);
    const positionPanel = document.createElement('div');
    positionPanel.id = `${prefix}-position`; positionPanel.className = 'phase-reposition-popover';
    positionPanel.hidden = true; positionPanel.setAttribute('role', 'group');
    const positionLabel = document.createElement('label');
    const positionText = document.createElement('span');
    const positionSelect = document.createElement('select');
    positionSelect.dataset.field = 'position';
    positionLabel.append(positionText, positionSelect);
    const positionActions = document.createElement('div'); positionActions.className = 'planner-actions';
    const move = document.createElement('button'); move.type = 'button'; move.dataset.action = 'move-position';
    const cancelPosition = document.createElement('button'); cancelPosition.type = 'button'; cancelPosition.dataset.action = 'cancel-position';
    positionActions.append(move, cancelPosition); positionPanel.append(positionLabel, positionActions);
    const titleLabel = document.createElement('label');
    titleLabel.className = 'phase-title';
    const titleText = document.createElement('span');
    const title = document.createElement('input');
    title.id = `${prefix}-title`; title.type = 'text'; title.maxLength = 120; title.required = true;
    title.dataset.field = 'title';
    titleLabel.append(titleText, title);
    const durationLabel = document.createElement('label');
    durationLabel.className = 'phase-duration';
    const durationText = document.createElement('span');
    const duration = document.createElement('input');
    duration.id = `${prefix}-duration`; duration.type = 'text'; duration.inputMode = 'numeric';
    duration.pattern = '[0-9]*'; duration.required = true;
    duration.dataset.field = 'duration';
    durationLabel.append(durationText, duration);
    const categoryControl = document.createElement('div'); categoryControl.className = 'phase-category-control';
    const categoryButton = document.createElement('button'); categoryButton.type = 'button';
    categoryButton.className = 'phase-category-button'; categoryButton.dataset.action = 'category';
    categoryButton.setAttribute('aria-expanded', 'false'); categoryButton.setAttribute('aria-controls', `${prefix}-category`);
    const categoryPanel = document.createElement('div'); categoryPanel.id = `${prefix}-category`;
    categoryPanel.className = 'phase-category-popover'; categoryPanel.hidden = true; categoryPanel.setAttribute('role', 'group');
    const categoryOptions = new Map();
    for (const id of PHASE_CATEGORIES) {
        const option = document.createElement('button'); option.type = 'button'; option.dataset.category = id;
        const label = document.createElement('span'); option.append(categoryIcon(id), label);
        categoryOptions.set(id, { option, label }); categoryPanel.append(option);
    }
    const cancelCategory = document.createElement('button'); cancelCategory.type = 'button';
    cancelCategory.dataset.action = 'cancel-category'; categoryPanel.append(cancelCategory);
    categoryControl.append(categoryButton, categoryPanel);
    const actions = document.createElement('div'); actions.className = 'phase-actions';
    const disclosure = document.createElement('button'); disclosure.type = 'button';
    disclosure.dataset.action = 'details';
    disclosure.setAttribute('aria-expanded', 'false');
    disclosure.setAttribute('aria-controls', `${prefix}-details`);
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox', '0 0 24 24'); icon.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(icon.namespaceURI, 'path'); path.setAttribute('d', 'M6 9l6 6 6-6');
    icon.append(path); disclosure.append(icon); actions.append(disclosure);
    const details = document.createElement('div');
    details.id = `${prefix}-details`; details.className = 'native-phase-details'; details.hidden = true;
    const feedback = document.createElement('p');
    feedback.id = `${prefix}-feedback`; feedback.className = 'planner-feedback native-phase-feedback';
    feedback.dataset.error = 'true'; feedback.setAttribute('role', 'status');
    row.append(dragHandle, number, titleLabel, durationLabel, categoryControl, actions, details, feedback, positionPanel);
    row._nativePhase = { dragHandle };
    let errorCode = null;

    function showValidationError(code = null) {
        errorCode = code;
        feedback.textContent = code ? copy[language][code === 'duration' ? 'durationError' : code]
            || copy[language].editFailed : '';
        for (const [input, key] of [[title, 'phaseTitle'], [duration, 'duration'], [categoryButton, 'invalidCategory']]) {
            if (code === key) {
                input.setAttribute('aria-invalid', 'true');
                input.setAttribute('aria-describedby', feedback.id);
            } else {
                input.removeAttribute('aria-invalid'); input.removeAttribute('aria-describedby');
            }
        }
    }

    function update(changes) {
        try {
            onDraftChange(editNativePhaseDraft(getDraft(), phaseId, changes));
            showValidationError();
        } catch (error) {
            showValidationError(error.message);
        }
    }
    title.addEventListener('input', () => update({ title: title.value }));
    duration.addEventListener('input', () => {
        // Keep incomplete minute text in the native draft for explicit Save to
        // reject. No rounding, clamping or second duration validator is used.
        const parsed = /^\d+$/.test(duration.value) ? Number(duration.value) * 60 : NaN;
        const seconds = Number.isSafeInteger(parsed) ? parsed : duration.value;
        update({ durationSeconds: seconds });
    });
    function refreshCategory() {
        const phase = getDraft().template.phases.find(item => item.id === phaseId);
        if (!phase) return;
        categoryButton.replaceChildren(categoryIcon(phase.category));
        categoryButton.setAttribute('aria-label', `${copy[language].category}: ${copy[language][phase.category]}`);
        categoryButton.title = copy[language][phase.category];
        for (const [id, { option }] of categoryOptions) option.setAttribute('aria-pressed', String(id === phase.category));
    }
    function syncDisclosure() {
        const open = !details.hidden;
        disclosure.setAttribute('aria-expanded', String(open));
        disclosure.setAttribute('aria-label', copy[language][open ? 'hideDetails' : 'showDetails']);
        disclosure.title = copy[language][open ? 'hideDetails' : 'showDetails'];
    }
    function collapse() {
        details.hidden = true; syncDisclosure();
        disclosure.focus({ preventScroll: true });
    }
    disclosure.addEventListener('click', () => {
        if (!details.hidden) collapse();
        else { details.hidden = false; syncDisclosure(); }
    });
    function closePosition(restoreFocus = false) {
        positionPanel.hidden = true; number.setAttribute('aria-expanded', 'false');
        if (restoreFocus) number.focus({ preventScroll: true });
    }
    function openPosition() {
        closeCategory();
        const phases = getDraft().template.phases;
        const index = phases.findIndex(phase => phase.id === phaseId);
        if (index < 0) { showValidationError('phaseNotFound'); return; }
        positionSelect.replaceChildren(...phases.map((phase, optionIndex) => {
            const option = document.createElement('option'); option.value = String(optionIndex + 1);
            option.textContent = `${String(optionIndex + 1).padStart(2, '0')} · ${phase.title.trim() || copy[language].untitled}`;
            return option;
        }));
        positionSelect.value = String(index + 1); move.disabled = true;
        positionPanel.hidden = false; number.setAttribute('aria-expanded', 'true');
        positionSelect.focus({ preventScroll: true });
    }
    number.addEventListener('click', () => {
        if (positionPanel.hidden) openPosition(); else closePosition(true);
    });
    dragHandle.addEventListener('keydown', event => {
        if (!['Enter', ' '].includes(event.key)) return;
        event.preventDefault(); openPosition();
    });
    positionSelect.addEventListener('change', () => {
        const index = getDraft().template.phases.findIndex(phase => phase.id === phaseId);
        move.disabled = Number(positionSelect.value) === index + 1;
    });
    move.addEventListener('click', () => {
        if (move.disabled) return;
        const position = Number(positionSelect.value);
        closePosition(); onReposition(phaseId, position);
    });
    cancelPosition.addEventListener('click', () => closePosition(true));
    function closeCategory(restoreFocus = false) {
        categoryPanel.hidden = true; categoryButton.setAttribute('aria-expanded', 'false');
        if (restoreFocus) categoryButton.focus({ preventScroll: true });
    }
    function openCategory() {
        closePosition(); refreshCategory();
        categoryPanel.hidden = false; categoryButton.setAttribute('aria-expanded', 'true');
        categoryOptions.get(getDraft().template.phases.find(item => item.id === phaseId)?.category)
            ?.option.focus({ preventScroll: true });
    }
    categoryButton.addEventListener('click', () => {
        if (categoryPanel.hidden) openCategory(); else closeCategory(true);
    });
    for (const [id, { option }] of categoryOptions) option.addEventListener('click', () => {
        update({ category: id }); refreshCategory(); closeCategory(true);
    });
    cancelCategory.addEventListener('click', () => closeCategory(true));
    row.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !categoryPanel.hidden) {
            event.preventDefault(); event.stopPropagation(); closeCategory(true); return;
        }
        if (event.key === 'Escape' && !positionPanel.hidden) {
            event.preventDefault(); event.stopPropagation(); closePosition(true); return;
        }
        if (event.key === 'Escape' && !details.hidden) {
            event.preventDefault(); event.stopPropagation(); collapse();
        }
    });

    function localize() {
        const text = copy[language];
        titleText.textContent = text.title; title.placeholder = text.title;
        durationText.textContent = text.duration;
        categoryPanel.setAttribute('aria-label', text.chooseCategory);
        for (const [id, { option, label }] of categoryOptions) {
            label.textContent = text[id]; option.setAttribute('aria-label', text[id]);
        }
        cancelCategory.textContent = text.cancel;
        syncDisclosure(); refreshCategory();
        positionText.textContent = text.position; move.textContent = text.move; cancelPosition.textContent = text.cancel;
        showValidationError(errorCode);
    }
    function refresh() {
        const phases = getDraft().template.phases;
        const index = phases.findIndex(phase => phase.id === phaseId);
        if (index < 0) { showValidationError('phaseNotFound'); return; }
        const phase = phases[index];
        const position = String(index + 1).padStart(2, '0');
        dragHandle.setAttribute('aria-label', copy[language].drag(phase.title.trim() || copy[language].untitled));
        dragHandle.title = dragHandle.getAttribute('aria-label');
        number.textContent = position; number.setAttribute('aria-label', copy[language].changePosition(position));
        positionPanel.setAttribute('aria-label', copy[language].positionFor(position, phase.title.trim() || copy[language].untitled));
        title.value = phase.title;
        duration.value = typeof phase.durationSeconds === 'number'
            ? String(phase.durationSeconds / 60) : phase.durationSeconds;
        refreshCategory();
    }
    localize(); refresh();
    return Object.freeze({
        element: row,
        refresh,
        showValidationError,
        setLanguage(next) {
            if (!copy[next]) throw new Error('invalidLanguage');
            language = next; localize();
        },
    });
}
