import { createDraft, createTemplateStore, movePhase, phaseDuration, STORAGE_KEY, totalDuration, validateTemplate } from './templates.mjs';

const copy = {
    en: {
        planner: 'Session Planner', back: 'Back to timer', create: 'Create template', empty: 'No workshop templates saved yet.',
        edit: 'Edit', remove: 'Delete', templateName: 'Workshop name', transition: 'Phase transitions', manual: 'Manual', automatic: 'Automatic',
        planningOnly: 'Planning only. Session execution is not available yet.', phases: 'Phases', phaseTitleLabel: 'Phase title',
        hours: 'Hours', minutes: 'Minutes', seconds: 'Seconds', up: 'Move up', down: 'Move down', removePhase: 'Remove phase', add: 'Add phase',
        save: 'Save', cancel: 'Cancel', total: 'Total planned duration', phaseCount: count => `${count} phases`,
        deleteConfirm: name => `Delete “${name}”?`, discard: 'Discard unsaved changes?', reload: 'Reload saved templates', saved: 'Template saved.', deleted: 'Template deleted.',
        name: 'Enter a workshop name containing 1–120 characters.', phaseTitle: 'Each phase needs a title containing 1–120 characters.',
        duration: 'Enter a positive phase duration: hours 0–99, minutes and seconds 0–59 (maximum 99:59:59).',
        totalLimit: 'The total workshop duration cannot exceed 999:59:59.', phasesRequired: 'Add at least one phase.',
        invalidData: 'Saved template data is invalid or uses an unsupported version. It has not been changed. Saving is blocked.',
        storageRead: 'Templates could not be read. Stored data has not been changed. Try reloading saved templates.',
        storageWrite: 'Saving failed. Your draft is still open; existing saved templates have not been replaced.',
        storageBlocked: 'Load valid stored templates before saving. Your draft is still open.',
        conflict: 'Saved templates changed in another tab. Saving is blocked to protect them. Your draft is retained. Reload only when you are ready to discard it.',
    },
    de: {
        planner: 'Session-Planer', back: 'Zurück zum Timer', create: 'Vorlage erstellen', empty: 'Noch keine Workshop-Vorlagen gespeichert.',
        edit: 'Bearbeiten', remove: 'Löschen', templateName: 'Workshopname', transition: 'Phasenübergänge', manual: 'Manuell', automatic: 'Automatisch',
        planningOnly: 'Nur Planung. Sessions können noch nicht ausgeführt werden.', phases: 'Phasen', phaseTitleLabel: 'Phasentitel',
        hours: 'Stunden', minutes: 'Minuten', seconds: 'Sekunden', up: 'Nach oben', down: 'Nach unten', removePhase: 'Phase entfernen', add: 'Phase hinzufügen',
        save: 'Speichern', cancel: 'Abbrechen', total: 'Geplante Gesamtdauer', phaseCount: count => `${count} Phasen`,
        deleteConfirm: name => `„${name}“ löschen?`, discard: 'Ungespeicherte Änderungen verwerfen?', reload: 'Gespeicherte Vorlagen neu laden', saved: 'Vorlage gespeichert.', deleted: 'Vorlage gelöscht.',
        name: 'Einen Workshopnamen mit 1–120 Zeichen eingeben.', phaseTitle: 'Jede Phase benötigt einen Titel mit 1–120 Zeichen.',
        duration: 'Eine positive Phasendauer eingeben: Stunden 0–99, Minuten und Sekunden 0–59 (maximal 99:59:59).',
        totalLimit: 'Die Workshop-Gesamtdauer darf 999:59:59 nicht überschreiten.', phasesRequired: 'Mindestens eine Phase hinzufügen.',
        invalidData: 'Gespeicherte Vorlagen sind ungültig oder haben eine unbekannte Version. Sie bleiben unverändert. Speichern ist blockiert.',
        storageRead: 'Vorlagen konnten nicht gelesen werden. Gespeicherte Daten bleiben unverändert. Bitte erneut laden.',
        storageWrite: 'Speichern fehlgeschlagen. Der Entwurf bleibt geöffnet; bestehende Vorlagen wurden nicht ersetzt.',
        storageBlocked: 'Vor dem Speichern gültige Vorlagen laden. Der Entwurf bleibt geöffnet.',
        conflict: 'Vorlagen wurden in einem anderen Tab geändert. Speichern ist zu ihrem Schutz blockiert. Der Entwurf bleibt erhalten. Neu laden verwirft ihn erst nach Bestätigung.',
    },
};
const clock = seconds => {
    const parts = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60];
    return (parts[0] ? parts : parts.slice(1)).map(v => String(v).padStart(2, '0')).join(':');
};
function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
}

export function createPlanner(root, onClose, initialLanguage) {
    const store = createTemplateStore(() => localStorage);
    let library = { schemaVersion: 1, templates: [] };
    let draft = null;
    let original = '';
    let language = initialLanguage;
    let message = '';
    let error = false;
    let invalidFieldId = null;
    let active = false;
    function dirty() {
        if (!draft) return false;
        // Compare planning values, not temporary editor fields; invalid edits remain protected.
        try { return JSON.stringify(materialize()) !== original; }
        catch { return true; }
    }
    const t = () => copy[language];
    function button(text, handler, className) {
        const node = element('button', text, className);
        node.type = 'button';
        node.addEventListener('click', handler);
        return node;
    }
    function applyFieldValidation(input) {
        if (input.id === invalidFieldId) {
            input.setAttribute('aria-invalid', 'true');
            input.setAttribute('aria-describedby', 'planner-feedback');
        } else {
            input.removeAttribute('aria-invalid');
            input.removeAttribute('aria-describedby');
        }
    }
    function feedback(code, isError = true, fieldId = null) {
        message = code;
        error = isError;
        invalidFieldId = fieldId;
        root.querySelectorAll('input').forEach(applyFieldValidation);
        const node = root.querySelector('.planner-feedback');
        if (node) {
            node.textContent = t()[code] || '';
            node.dataset.error = String(error);
        }
    }
    function focusHeading() { root.querySelector('h1')?.focus(); }
    function canDiscard() { return !dirty() || window.confirm(t().discard); }
    function load() {
        try { library = store.load(); feedback('', false); }
        catch (e) { feedback(e.message); }
    }
    function begin(template) {
        draft = createDraft(template);
        original = JSON.stringify(materialize());
        feedback('');
        render();
        root.querySelector('#template-name').focus();
    }
    function inputField(labelText, value, id, onInput, numeric = false) {
        const label = element('label', labelText);
        const input = element('input');
        input.id = id;
        input.value = value;
        input.type = numeric ? 'number' : 'text';
        if (numeric) { input.min = '0'; input.max = id.endsWith('-hours') ? '99' : '59'; input.step = '1'; input.inputMode = 'numeric'; }
        else { input.maxLength = 120; input.required = true; }
        applyFieldValidation(input);
        input.addEventListener('input', () => {
            onInput(input.value);
            if (!invalidFieldId || invalidFieldId === input.id) feedback('');
            updateTotal();
        });
        label.append(input);
        return label;
    }
    // Incomplete duration fields remain in the draft until Save validates them.
    function phaseSeconds(phase) {
        try { return phase.fields ? phaseDuration(...phase.fields) : phase.durationSeconds; }
        catch (e) { e.phaseId = phase.id; throw e; }
    }
    function materialize() {
        return { id: draft.id, name: draft.name.trim(), transitionMode: draft.transitionMode,
            phases: draft.phases.map(p => ({ id: p.id, title: p.title.trim(), durationSeconds: phaseSeconds(p) })) };
    }
    function updateTotal() {
        const output = root.querySelector('#planner-total');
        if (!output || !draft) return;
        try { output.textContent = `${t().total}: ${clock(totalDuration(materialize().phases))}`; }
        catch { output.textContent = `${t().total}: —`; }
    }
    function save() {
        try {
            const valid = validateTemplate(materialize());
            const templates = library.templates.some(item => item.id === valid.id)
                ? library.templates.map(item => item.id === valid.id ? valid : item) : [...library.templates, valid];
            library = store.save({ schemaVersion: 1, templates });
            draft = null;
            feedback('saved', false);
            render(); focusHeading();
        } catch (e) {
            let target = root.querySelector('.planner-feedback');
            if (e.message === 'name') target = root.querySelector('#template-name');
            if (e.message === 'phaseTitle') {
                const phase = draft.phases.find(p => !p.title.trim() || p.title.trim().length > 120);
                target = document.getElementById(`phase-${phase.id}-title`);
            }
            if (e.message === 'duration' && e.phaseId) {
                const phase = draft.phases.find(p => p.id === e.phaseId);
                const units = ['hours', 'minutes', 'seconds'];
                const invalid = phase.fields.findIndex((v, i) => !/^\d+$/.test(v) || Number(v) > (i === 0 ? 99 : 59));
                target = document.getElementById(`phase-${e.phaseId}-${units[Math.max(0, invalid)]}`);
            }
            feedback(e.message, true, target?.tagName === 'INPUT' ? target.id : null);
            target?.focus();
        }
    }
    function render() {
        const text = t();
        root.replaceChildren();
        const top = element('div', undefined, 'planner-top');
        const heading = element('h1', text.planner); heading.tabIndex = -1;
        top.append(heading, button(text.back, () => { if (canDiscard()) { draft = null; active = false; feedback(''); onClose(); } }, 'planner-back'));
        root.append(top, element('p', text.planningOnly, 'planner-hint'));
        const notice = element('p', text[message] || '', 'planner-feedback');
        notice.id = 'planner-feedback';
        notice.setAttribute('role', 'status'); notice.tabIndex = -1; notice.dataset.error = String(error);
        root.append(notice);
        if (!draft) {
            const actions = element('div', undefined, 'planner-actions');
            actions.append(button(text.create, () => begin(), 'primary'), button(text.reload, () => { load(); render(); focusHeading(); }));
            root.append(actions);
            const list = element('ul', undefined, 'template-library');
            if (!library.templates.length) root.append(element('p', text.empty));
            for (const item of library.templates) {
                const row = element('li');
                const info = element('div');
                info.append(element('h2', item.name), element('p', `${text.phaseCount(item.phases.length)} · ${clock(totalDuration(item.phases))}`));
                const actions = element('div', undefined, 'planner-actions');
                const edit = button(text.edit, () => begin(item)); edit.setAttribute('aria-label', `${text.edit}: ${item.name}`);
                const remove = button(text.remove, () => {
                    if (!window.confirm(text.deleteConfirm(item.name))) return;
                    try {
                        library = store.save({ schemaVersion: 1, templates: library.templates.filter(p => p.id !== item.id) });
                        message = 'deleted'; error = false; render(); focusHeading();
                    } catch (e) { feedback(e.message); }
                });
                remove.setAttribute('aria-label', `${text.remove}: ${item.name}`);
                actions.append(edit, remove); row.append(info, actions); list.append(row);
            }
            root.append(list);
            return;
        }
        const form = element('form'); form.noValidate = true;
        form.addEventListener('submit', event => { event.preventDefault(); save(); });
        form.append(inputField(text.templateName, draft.name, 'template-name', value => { draft.name = value; }));
        const transition = element('label', text.transition);
        const select = element('select'); select.id = 'template-transition';
        for (const mode of ['manual', 'automatic']) { const option = element('option', text[mode]); option.value = mode; select.append(option); }
        select.value = draft.transitionMode;
        select.addEventListener('change', () => { draft.transitionMode = select.value; });
        transition.append(select); form.append(transition, element('h2', text.phases));
        const list = element('ol', undefined, 'phase-list');
        draft.phases.forEach((phase, index) => {
            const row = element('li');
            row.dataset.phaseId = phase.id;
            row.append(inputField(text.phaseTitleLabel, phase.title, `phase-${phase.id}-title`, value => { phase.title = value; }));
            const fields = phase.fields || [Math.floor(phase.durationSeconds / 3600), Math.floor(phase.durationSeconds / 60) % 60, phase.durationSeconds % 60].map(String);
            const duration = element('div', undefined, 'phase-duration');
            ['hours', 'minutes', 'seconds'].forEach((unit, i) => duration.append(inputField(text[unit], fields[i], `phase-${phase.id}-${unit}`, value => {
                phase.fields = [...(phase.fields || fields)]; phase.fields[i] = value;
            }, true)));
            const controls = element('div', undefined, 'phase-actions');
            for (const [key, direction] of [['up', -1], ['down', 1]]) {
                const control = button(text[key], () => { movePhase(draft, phase.id, direction); render(); document.getElementById(`phase-${phase.id}-title`).focus(); });
                control.dataset.direction = direction;
                control.disabled = direction === -1 ? index === 0 : index === draft.phases.length - 1;
                control.setAttribute('aria-label', `${text[key]}: ${phase.title || index + 1}`);
                controls.append(control);
            }
            controls.append(button(text.removePhase, () => {
                draft.phases = draft.phases.filter(p => p.id !== phase.id); render(); root.querySelector('.add-phase').focus();
            }));
            row.append(duration, controls); list.append(row);
        });
        form.append(list, button(text.add, () => {
            const phase = { id: crypto.randomUUID(), title: '', durationSeconds: 600 };
            draft.phases.push(phase); render(); document.getElementById(`phase-${phase.id}-title`).focus();
        }, 'add-phase'));
        const total = element('p'); total.id = 'planner-total'; total.setAttribute('aria-live', 'polite'); form.append(total);
        const actions = element('div', undefined, 'planner-actions');
        const saveButton = element('button', text.save, 'primary'); saveButton.type = 'submit';
        actions.append(saveButton, button(text.cancel, () => { if (canDiscard()) { draft = null; feedback(''); render(); focusHeading(); } }), button(text.reload, () => {
            if (!canDiscard()) return;
            // Keep the draft if reading storage fails; successful reload is explicit discard.
            try { const fresh = store.load(); library = fresh; draft = null; feedback('', false); render(); focusHeading(); }
            catch (e) { feedback(e.message); }
        }));
        form.append(actions); root.append(form); updateTotal();
    }
    window.addEventListener('storage', event => { if (active && (event.key === STORAGE_KEY || event.key === null)) feedback('conflict'); });
    window.addEventListener('beforeunload', event => { if (dirty()) { event.preventDefault(); event.returnValue = ''; } });
    return {
        open() { if (active) { focusHeading(); return; } active = true; load(); render(); focusHeading(); },
        setLanguage(next) {
            if (language === next) return;
            const focusedId = root.contains(document.activeElement) ? document.activeElement.id : '';
            language = next;
            if (active) { render(); if (focusedId) document.getElementById(focusedId)?.focus(); }
        },
    };
}
