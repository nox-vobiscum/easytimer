import { PHASE_CATEGORIES } from './editor-domain.mjs';
import { editNativePhaseDraft } from './editor-template-draft.mjs';

const copy = {
    en: {
        title: 'Phase title', duration: 'Duration (min)', category: 'Phase category',
        details: 'Phase details', uncategorized: 'Uncategorized', presentation: 'Presentation',
        discussion: 'Discussion', breakout: 'Breakout', break: 'Break',
        phaseTitle: 'Each phase needs a title containing 1–120 characters.',
        durationError: 'Enter a whole number from 1 to 6,000 minutes.',
        invalidCategory: 'Choose a supported phase category.',
        phaseNotFound: 'This phase is no longer in the draft. Your input has been retained.',
        editFailed: 'The draft could not be updated. Your input has been retained.',
    },
    de: {
        title: 'Phasentitel', duration: 'Dauer (min)', category: 'Phasenkategorie',
        details: 'Phasendetails', uncategorized: 'Ohne Kategorie', presentation: 'Präsentation',
        discussion: 'Diskussion', breakout: 'Gruppenarbeit', break: 'Pause',
        phaseTitle: 'Jede Phase benötigt einen Titel mit 1–120 Zeichen.',
        durationError: 'Eine ganze Zahl von 1 bis 6.000 Minuten eingeben.',
        invalidCategory: 'Eine unterstützte Phasenkategorie auswählen.',
        phaseNotFound: 'Diese Phase ist nicht mehr im Entwurf. Deine Eingabe bleibt erhalten.',
        editFailed: 'Der Entwurf konnte nicht geändert werden. Deine Eingabe bleibt erhalten.',
    },
};

// One phase's presentation only. The caller owns the current Planner Service
// draft and adopts edits synchronously; no draft, library or storage is cached.
export function createNativePhaseFields({ getDraft, onDraftChange, phaseId, language = 'en' }) {
    if (typeof getDraft !== 'function' || typeof onDraftChange !== 'function'
        || typeof phaseId !== 'string' || !phaseId.trim() || !copy[language]) {
        throw new Error('invalidPhaseFields');
    }
    const row = document.createElement('li');
    row.className = 'native-phase-fields';
    row.dataset.nativePhaseId = phaseId;
    const prefix = `native-phase-${crypto.randomUUID()}`;
    const number = document.createElement('span');
    number.className = 'phase-number';
    number.setAttribute('aria-hidden', 'true');
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
    const actions = document.createElement('div'); actions.className = 'phase-actions';
    const disclosure = document.createElement('button'); disclosure.type = 'button';
    disclosure.dataset.action = 'details';
    disclosure.setAttribute('aria-expanded', 'false');
    disclosure.setAttribute('aria-controls', `${prefix}-details`);
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox', '0 0 24 24'); icon.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(icon.namespaceURI, 'path');
    path.setAttribute('d', 'M4 5h10M4 10h10M4 15h6m6-3 4 4 4-4');
    icon.append(path); disclosure.append(icon); actions.append(disclosure);
    const details = document.createElement('div');
    details.id = `${prefix}-details`; details.className = 'native-phase-details'; details.hidden = true;
    const categoryLabel = document.createElement('label');
    const categoryText = document.createElement('span');
    const category = document.createElement('select');
    category.id = `${prefix}-category`; category.dataset.field = 'category';
    for (const id of PHASE_CATEGORIES) {
        const option = document.createElement('option'); option.value = id; category.append(option);
    }
    categoryLabel.append(categoryText, category); details.append(categoryLabel);
    const feedback = document.createElement('p');
    feedback.id = `${prefix}-feedback`; feedback.className = 'planner-feedback native-phase-feedback';
    feedback.dataset.error = 'true'; feedback.setAttribute('role', 'status');
    row.append(number, titleLabel, durationLabel, actions, details, feedback);
    let errorCode = null;

    function showValidationError(code = null) {
        errorCode = code;
        feedback.textContent = code ? copy[language][code === 'duration' ? 'durationError' : code]
            || copy[language].editFailed : '';
        for (const [input, key] of [[title, 'phaseTitle'], [duration, 'duration'], [category, 'invalidCategory']]) {
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
    category.addEventListener('change', () => update({ category: category.value }));
    function collapse() {
        details.hidden = true; disclosure.setAttribute('aria-expanded', 'false');
        disclosure.focus({ preventScroll: true });
    }
    disclosure.addEventListener('click', () => {
        if (!details.hidden) collapse();
        else { details.hidden = false; disclosure.setAttribute('aria-expanded', 'true'); }
    });
    row.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !details.hidden) {
            event.preventDefault(); event.stopPropagation(); collapse();
        }
    });

    function localize() {
        const text = copy[language];
        titleText.textContent = text.title; title.placeholder = text.title;
        durationText.textContent = text.duration;
        categoryText.textContent = text.category;
        disclosure.setAttribute('aria-label', text.details);
        disclosure.title = text.details;
        for (const option of category.options) option.textContent = text[option.value];
        showValidationError(errorCode);
    }
    function refresh() {
        const phases = getDraft().template.phases;
        const index = phases.findIndex(phase => phase.id === phaseId);
        if (index < 0) { showValidationError('phaseNotFound'); return; }
        const phase = phases[index];
        number.textContent = String(index + 1);
        title.value = phase.title;
        duration.value = typeof phase.durationSeconds === 'number'
            ? String(phase.durationSeconds / 60) : phase.durationSeconds;
        category.value = phase.category;
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
