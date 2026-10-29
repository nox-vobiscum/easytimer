import { createDraft, createTemplateStore, repositionPhase, phaseDuration, STORAGE_KEY, totalDuration, validateTemplate } from './templates.mjs?v=37';
import { parseRundowns, independentCopies, rundownCollisions, downloadRundowns, exportFilename, MAX_IMPORT_BYTES } from './portability.mjs?v=37';

const copy = {
    en: {
        planner: 'Session Editor', back: 'Back to timer', create: 'Create Rundown', empty: 'No Rundowns saved yet.',
        edit: 'Edit', remove: 'Delete', templateName: 'Workshop name', transition: 'Phase transitions', manual: 'Manual', automatic: 'Automatic',
        planningOnly: 'Reusable phase sequences. Load a copy in Session Timer to run it.', phases: 'Phases', phaseTitleLabel: 'Phase title', phaseTitlePlaceholder: 'Enter phase title',
        durationLabel: 'Duration (min)', actions: 'Actions', up: 'Move up', down: 'Move down', removePhase: 'Remove phase', add: '+ Add phase',
        reposition: 'Reposition phase', position: 'Position', move: 'Move', close: 'Close',
        save: 'Save', cancel: 'Cancel', total: 'Total planned duration', phaseCount: count => `${count} ${count === 1 ? 'phase' : 'phases'}`,
        deleteConfirm: name => `Delete “${name}”?`, discard: 'Discard unsaved changes?', reload: 'Reload saved templates', saved: 'Template saved.', deleted: 'Template deleted.',
        name: 'Enter a workshop name containing 1–120 characters.', phaseTitle: 'Each phase needs a title containing 1–120 characters.',
        duration: 'Enter a whole number from 1 to 6,000 minutes.',
        totalLimit: 'The total workshop duration cannot exceed 60,000 minutes (1000:00:00).', phasesRequired: 'Add at least one phase.',
        invalidData: 'Saved template data is invalid or uses an unsupported version. It has not been changed. Saving is blocked.',
        storageRead: 'Templates could not be read. Stored data has not been changed. Try reloading saved templates.',
        storageWrite: 'Saving failed. Your draft is still open; existing saved templates have not been replaced.',
        storageBlocked: 'Load valid stored templates before saving. Your draft is still open.',
        conflict: 'Saved templates changed in another tab. Saving is blocked to protect them. Your draft is retained. Reload only when you are ready to discard it.',
    },
    de: {
        planner: 'Session-Editor', back: 'Zurück zum Timer', create: 'Rundown erstellen', empty: 'Noch keine Rundowns gespeichert.',
        edit: 'Bearbeiten', remove: 'Löschen', templateName: 'Workshopname', transition: 'Phasenübergänge', manual: 'Manuell', automatic: 'Automatisch',
        planningOnly: 'Wiederverwendbare Phasenabläufe. Lade eine Kopie im Session-Timer.', phases: 'Phasen', phaseTitleLabel: 'Phasentitel', phaseTitlePlaceholder: 'Phasentitel eingeben',
        durationLabel: 'Dauer (min)', actions: 'Aktionen', up: 'Nach oben', down: 'Nach unten', removePhase: 'Phase entfernen', add: '+ Phase hinzufügen',
        reposition: 'Phase verschieben', position: 'Position', move: 'Verschieben', close: 'Schließen',
        save: 'Speichern', cancel: 'Abbrechen', total: 'Geplante Gesamtdauer', phaseCount: count => `${count} ${count === 1 ? 'Phase' : 'Phasen'}`,
        deleteConfirm: name => `„${name}“ löschen?`, discard: 'Ungespeicherte Änderungen verwerfen?', reload: 'Gespeicherte Vorlagen neu laden', saved: 'Vorlage gespeichert.', deleted: 'Vorlage gelöscht.',
        name: 'Einen Workshopnamen mit 1–120 Zeichen eingeben.', phaseTitle: 'Jede Phase benötigt einen Titel mit 1–120 Zeichen.',
        duration: 'Eine ganze Zahl von 1 bis 6.000 Minuten eingeben.',
        totalLimit: 'Die Workshop-Gesamtdauer darf 60.000 Minuten (1000:00:00) nicht überschreiten.', phasesRequired: 'Mindestens eine Phase hinzufügen.',
        invalidData: 'Gespeicherte Vorlagen sind ungültig oder haben eine unbekannte Version. Sie bleiben unverändert. Speichern ist blockiert.',
        storageRead: 'Vorlagen konnten nicht gelesen werden. Gespeicherte Daten bleiben unverändert. Bitte erneut laden.',
        storageWrite: 'Speichern fehlgeschlagen. Der Entwurf bleibt geöffnet; bestehende Vorlagen wurden nicht ersetzt.',
        storageBlocked: 'Vor dem Speichern gültige Vorlagen laden. Der Entwurf bleibt geöffnet.',
        conflict: 'Vorlagen wurden in einem anderen Tab geändert. Speichern ist zu ihrem Schutz blockiert. Der Entwurf bleibt erhalten. Neu laden verwirft ihn erst nach Bestätigung.',
    },
};
Object.assign(copy.en, {
    launchShort: 'Launch',
    myRundowns: 'My Rundowns',
    backupSubtitle: 'Local JSON import and export', backupAttention: 'Attention needed', backupDisconnected: 'Google Drive not connected',
    launch: 'Launch session', launchFailed: 'This saved Rundown could not be loaded. Refresh the list and try again. Your current timer has not been replaced.',
    importConflict: 'Import blocked: Rundowns changed in another tab. Existing Rundowns remain unchanged; the import preview is retained.',
    importStorageWrite: 'Import failed: the data could not be saved. Existing Rundowns remain unchanged; the import preview is retained.',
    refreshLibrary: 'Refresh list',
    dataBackup: 'Data & Backup', importJSON: 'Import JSON', exportAll: 'Export all as JSON', exportOne: name => `Export Rundown: ${name}`,
    localWarning: 'Locally stored rundowns may be lost when browser data is cleared. Back them up regularly using JSON export.',
    importReview: 'Review import', file: 'File', importCount: count => `${count} valid Rundown${count === 1 ? '' : 's'}`,
    importCopies: 'Imports create additional independent copies with new IDs. Existing Rundowns stay unchanged.',
    idCollision: 'Matching ID already exists', nameCollision: 'Possible duplicate name', openImport: 'Open as unsaved draft',
    confirmImport: 'Import all as new copies', refreshImport: 'Refresh local list', imported: 'All Rundowns imported as new copies.',
    importEmpty: 'This file contains no Rundowns.', importSize: 'The file is too large. Choose a JSON file up to 10 MiB.',
    importJSONError: 'This file is not valid JSON.', importVersion: 'This file uses an unsupported version.',
    importInvalid: 'This file contains invalid Rundowns or unsupported fields. Nothing was imported.',
    importDuration: 'Phase durations must be whole minutes from 1 to 6,000 minutes.',
    importLimit: 'A Rundown cannot exceed 60,000 minutes.', importRead: 'The file could not be read. Try selecting it again.',
    exportFailed: 'The download could not be prepared. Check saved data and try again.', exportMissing: 'This Rundown is no longer saved. Refresh the list.',
    exportStarted: 'Download requested. Keep the JSON file as your backup.',
});
Object.assign(copy.de, {
    launchShort: 'Starten',
    myRundowns: 'Meine Rundowns',
    backupSubtitle: 'Lokaler JSON-Import und -Export', backupAttention: 'Prüfung erforderlich', backupDisconnected: 'Google Drive nicht verbunden',
    launch: 'Session starten', launchFailed: 'Dieser gespeicherte Rundown konnte nicht geladen werden. Bitte die Liste aktualisieren und erneut versuchen. Der bisherige Timer wurde nicht ersetzt.',
    importConflict: 'Import blockiert: Rundowns wurden in einem anderen Tab geändert. Bestehende Rundowns bleiben unverändert; die Importvorschau bleibt erhalten.',
    importStorageWrite: 'Import fehlgeschlagen: Die Daten konnten nicht gespeichert werden. Bestehende Rundowns bleiben unverändert; die Importvorschau bleibt erhalten.',
    refreshLibrary: 'Liste aktualisieren',
    dataBackup: 'Daten & Sicherung', importJSON: 'JSON importieren', exportAll: 'Alle als JSON exportieren', exportOne: name => `Rundown exportieren: ${name}`,
    localWarning: 'Lokal gespeicherte Rundowns können beim Löschen von Browserdaten verloren gehen. Sichere sie regelmäßig per JSON-Export.',
    importReview: 'Import prüfen', file: 'Datei', importCount: count => `${count} gültige${count === 1 ? 'r Rundown' : ' Rundowns'}`,
    importCopies: 'Importe erstellen zusätzliche, unabhängige Kopien mit neuen IDs. Bestehende Rundowns bleiben unverändert.',
    idCollision: 'ID bereits vorhanden', nameCollision: 'Möglicherweise gleicher Name', openImport: 'Als ungespeicherten Entwurf öffnen',
    confirmImport: 'Alle als neue Kopien importieren', refreshImport: 'Lokale Liste aktualisieren', imported: 'Alle Rundowns als neue Kopien importiert.',
    importEmpty: 'Diese Datei enthält keine Rundowns.', importSize: 'Die Datei ist zu groß. Bitte eine JSON-Datei bis 10 MiB wählen.',
    importJSONError: 'Diese Datei enthält kein gültiges JSON.', importVersion: 'Diese Dateiversion wird nicht unterstützt.',
    importInvalid: 'Die Datei enthält ungültige Rundowns oder unbekannte Felder. Es wurde nichts importiert.',
    importDuration: 'Phasendauern müssen ganze Minuten zwischen 1 und 6.000 sein.',
    importLimit: 'Ein Rundown darf 60.000 Minuten nicht überschreiten.', importRead: 'Die Datei konnte nicht gelesen werden. Bitte erneut auswählen.',
    exportFailed: 'Der Download konnte nicht vorbereitet werden. Bitte gespeicherte Daten prüfen und erneut versuchen.', exportMissing: 'Dieser Rundown ist nicht mehr gespeichert. Bitte die Liste aktualisieren.',
    exportStarted: 'Download angefordert. Bewahre die JSON-Datei als Sicherung auf.',
});
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

export function createPlanner(root, onClose, initialLanguage, services = null, onLaunch = null) {
    const storeFactory = services ? services.createStore : () => createTemplateStore(() => localStorage);
    const store = storeFactory();
    let writing = false;
    let launching = false;
    let backupOpen = false;
    function io(method, data) {
        const value = store[method](data);
        if (!value?.then) return value;
        writing = true; root.inert = true;
        return value.finally(() => { writing = false; root.inert = false; });
    }
    let library = { schemaVersion: 1, templates: [] };
    let draft = null;
    let original = '';
    let language = initialLanguage;
    let message = '';
    let error = false;
    let invalidFieldId = null;
    let active = false;
    let review = null;
    let fileReadId = 0;
    let repositionId = null;
    const popover = element('div', undefined, 'phase-reposition-popover');
    popover.id = 'phase-reposition-popover';
    popover.hidden = true;
    popover.setAttribute('role', 'group');
    document.body.append(popover);
    const repositionTrigger = id => document.getElementById(`reposition-${id}`);
    function closeReposition(restoreFocus = false) {
        const trigger = repositionTrigger(repositionId);
        const focusInside = popover.contains(document.activeElement);
        repositionId = null;
        popover.hidden = true;
        trigger?.setAttribute('aria-expanded', 'false');
        if (restoreFocus || focusInside) trigger?.focus({ preventScroll: true });
    }
    function reorder(position) {
        const id = repositionId;
        repositionPhase(draft, id, position);
        closeReposition();
        render();
        repositionTrigger(id)?.focus({ preventScroll: true });
    }
    function openReposition(id) {
        if (repositionId === id) { closeReposition(true); return; }
        closeReposition();
        const index = draft.phases.findIndex(phase => phase.id === id);
        if (index < 0) return;
        const text = t();
        repositionId = id;
        popover.replaceChildren();
        popover.setAttribute('aria-label', text.reposition);
        const steps = element('div', undefined, 'reposition-steps');
        for (const [key, direction] of [['up', -1], ['down', 1]]) {
            const step = phaseAction(text[key], direction === -1 ? 'M12 20V4m-6 6 6-6 6 6' : 'M12 4v16m-6-6 6 6 6-6', () => reorder(index + direction + 1));
            step.append(element('span', text[key]));
            step.dataset.direction = direction;
            step.disabled = index + direction < 0 || index + direction >= draft.phases.length;
            steps.append(step);
        }
        const label = element('label', text.position);
        const select = element('select'); select.id = 'phase-position';
        draft.phases.forEach((phase, i) => {
            const option = element('option', `${i + 1} · ${phase.title.slice(0, 30)}`);
            option.value = i + 1; select.append(option);
        });
        select.value = index + 1;
        const move = button(text.move, () => reorder(Number(select.value)));
        move.id = 'move-to-position'; move.disabled = true;
        select.addEventListener('change', () => { move.disabled = Number(select.value) === index + 1; });
        label.append(select);
        popover.append(steps, label, move, button(text.close, () => closeReposition(true)));
        popover.hidden = false;
        const trigger = repositionTrigger(id);
        trigger.setAttribute('aria-expanded', 'true');
        // Measure once, outside the size-contained planner; scroll/resize simply dismiss.
        const anchor = trigger.getBoundingClientRect();
        const viewport = window.visualViewport;
        popover.style.maxHeight = `${(viewport?.height || innerHeight) - 16}px`;
        popover.style.maxWidth = `${(viewport?.width || innerWidth) - 16}px`;
        const rect = popover.getBoundingClientRect();
        const left = (viewport?.offsetLeft || 0) + 8;
        const top = (viewport?.offsetTop || 0) + 8;
        const right = left + (viewport?.width || innerWidth) - 16;
        const bottom = top + (viewport?.height || innerHeight) - 16;
        popover.style.left = `${Math.max(left, Math.min(anchor.right - rect.width, right - rect.width))}px`;
        const below = anchor.bottom + 6;
        popover.style.top = `${Math.max(top, Math.min(below + rect.height <= bottom ? below : anchor.top - rect.height - 6, bottom - rect.height))}px`;
        popover.querySelector('button:not(:disabled), select')?.focus({ preventScroll: true });
    }
    document.addEventListener('keydown', event => {
        if (event.key !== 'Escape' || !repositionId) return;
        event.preventDefault(); event.stopImmediatePropagation(); closeReposition(true);
    }, true);
    document.addEventListener('click', event => {
        if (repositionId && !popover.contains(event.target) && !repositionTrigger(repositionId)?.contains(event.target)) closeReposition();
    });
    document.addEventListener('focusin', event => {
        if (repositionId && !popover.contains(event.target) && event.target !== repositionTrigger(repositionId)) closeReposition();
    });
    popover.addEventListener('focusout', event => {
        // Tab can leave the document without another focusin event.
        if (repositionId && !event.relatedTarget) closeReposition();
    });
    document.addEventListener('scroll', event => { if (repositionId && !popover.contains(event.target)) closeReposition(); }, true);
    window.addEventListener('resize', () => closeReposition());
    window.visualViewport?.addEventListener('resize', () => closeReposition());
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
    function phaseAction(label, path, handler) {
        const control = button('', handler);
        control.setAttribute('aria-label', label);
        control.title = label;
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('focusable', 'false');
        const mark = document.createElementNS(svg.namespaceURI, 'path');
        mark.setAttribute('d', path);
        svg.append(mark); control.append(svg);
        return control;
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
    function feedbackText(code) {
        const key = review ? ({ conflict: 'importConflict', storageWrite: 'importStorageWrite' }[code] || code) : code;
        return t()[key] || services?.feedback?.(code, language) || '';
    }
    function feedback(code, isError = true, fieldId = null) {
        message = code;
        error = isError;
        invalidFieldId = fieldId;
        root.querySelectorAll('input').forEach(applyFieldValidation);
        const node = root.querySelector('.planner-feedback');
        if (node) {
            node.textContent = feedbackText(code);
            node.dataset.error = String(error);
        }
        const refresh = root.querySelector('#refresh-import');
        if (refresh) refresh.hidden = !['conflict', 'storageRead', 'storageBlocked', 'invalidData'].includes(code);
    }
    function focusHeading() { root.querySelector('h1')?.focus(); }
    function canDiscard() { return !dirty() || window.confirm(t().discard); }
    function close() {
        if (writing) return false;
        if (!canDiscard()) return false;
        fileReadId += 1; review = null;
        draft = null; active = false; feedback(''); closeReposition(); onClose();
        return true;
    }
    async function load() {
        fileReadId += 1;
        try { let saved = io('load'); if (saved?.then) saved = await saved; library = saved; feedback('', false); }
        catch (e) { feedback(e.message); }
    }
    function begin(template, imported = false) {
        fileReadId += 1; review = null;
        draft = createDraft(template);
        if (!template) draft.phases.push({ id: crypto.randomUUID(), title: '', durationSeconds: 600 });
        draft.phases.forEach(phase => { phase.minutes = String(phase.durationSeconds / 60); });
        // Populated imported drafts are unsaved even before the first edit.
        original = imported ? '' : JSON.stringify(materialize());
        feedback('');
        render();
        root.querySelector('#template-name').focus();
    }
    function inputField(labelText, value, id, onInput, numeric = false) {
        const label = element('label');
        const input = element('input');
        input.id = id;
        input.value = value;
        input.type = 'text';
        if (numeric) { input.inputMode = 'numeric'; input.pattern = '[0-9]*'; input.required = true; }
        else { input.maxLength = 120; input.required = true; }
        applyFieldValidation(input);
        input.addEventListener('input', () => {
            onInput(input.value);
            if (!invalidFieldId || invalidFieldId === input.id) feedback('');
            updateTotal();
        });
        label.append(element('span', labelText), input);
        return label;
    }
    // Incomplete minute input remains in the isolated draft until Save validates it.
    function phaseSeconds(phase) {
        try { return phaseDuration(phase.minutes); }
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
    async function save() {
        try {
            const valid = validateTemplate(materialize());
            const templates = library.templates.some(item => item.id === valid.id)
                ? library.templates.map(item => item.id === valid.id ? valid : item) : [...library.templates, valid];
            let saved = io('save', { schemaVersion: 1, templates }); if (saved?.then) saved = await saved; library = saved;
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
                target = document.getElementById(`phase-${e.phaseId}-minutes`);
            }
            feedback(e.message, true, target?.tagName === 'INPUT' ? target.id : null);
            target?.focus();
        }
    }
    async function exportSaved(id) {
        try {
            // Export the current saved data without resetting this editor's optimistic snapshot.
            let data = storeFactory().load(); if (data?.then) data = await data;
            if (id) data.templates = data.templates.filter(item => item.id === id);
            if (id && !data.templates.length) throw new Error('exportMissing');
            downloadRundowns(data, id ? exportFilename(data.templates[0].name) : undefined);
            feedback('exportStarted', false);
        } catch (e) { feedback(e.message === 'exportMissing' ? e.message : 'exportFailed'); }
    }
    async function readImport(file) {
        if (!file || draft || review) return;
        const reading = ++fileReadId;
        feedback('', false);
        try {
            if (file.size > MAX_IMPORT_BYTES) throw new Error('importSize');
            let content;
            try { content = await file.text(); } catch { throw new Error('importRead'); }
            if (!active || reading !== fileReadId || draft) return;
            const data = parseRundowns(content);
            review = { name: file.name, data };
            feedback('', false); render(); root.querySelector('#import-heading').focus();
        } catch (e) {
            if (!active || reading !== fileReadId || draft) return;
            feedback(e.message === 'importJSON' ? 'importJSONError' : e.message);
            root.querySelector('#planner-feedback').focus();
        }
    }
    async function confirmImport() {
        if (!review) return;
        try {
            const copies = independentCopies(review.data, library);
            if (copies.templates.length === 1) { begin(copies.templates[0], true); return; }
            let saved = io('save', { schemaVersion: 1, templates: [...library.templates, ...copies.templates] }); if (saved?.then) saved = await saved; library = saved;
            review = null; feedback('imported', false); render(); focusHeading();
        } catch (e) { feedback(e.message); root.querySelector('#planner-feedback').focus(); }
    }
    function renderReview() {
        const text = t(), section = element('section', undefined, 'import-review');
        section.setAttribute('aria-labelledby', 'import-heading');
        const heading = element('h2', text.importReview); heading.id = 'import-heading'; heading.tabIndex = -1;
        section.append(heading, element('p', `${text.file}: ${review.name}`), element('p', text.importCount(review.data.templates.length)), element('p', text.importCopies));
        const list = element('ol', undefined, 'import-list'); list.tabIndex = 0; list.setAttribute('aria-label', text.importReview);
        const collisions = rundownCollisions(review.data, library);
        review.data.templates.forEach((item, i) => {
            const row = element('li');
            row.append(element('h3', item.name), element('p', `${text.phaseCount(item.phases.length)} · ${clock(totalDuration(item.phases))} · ${text[item.transitionMode]}`));
            const warnings = [collisions[i].id ? text.idCollision : '', collisions[i].name ? text.nameCollision : ''].filter(Boolean);
            if (warnings.length) row.append(element('p', warnings.join(' · '), 'import-collision'));
            list.append(row);
        });
        const actions = element('div', undefined, 'planner-actions');
        const confirm = button(review.data.templates.length === 1 ? text.openImport : text.confirmImport, confirmImport, 'primary'); confirm.id = 'confirm-import';
        const cancel = button(text.cancel, () => { fileReadId += 1; review = null; backupOpen = true; feedback('', false); render(); root.querySelector('#rundown-import-file').focus(); }); cancel.id = 'cancel-import';
        const refresh = button(text.refreshImport, async () => {
            try { let saved = io('load'); if (saved?.then) saved = await saved; library = saved; feedback('', false); render(); root.querySelector('#confirm-import').focus(); }
            catch (e) { feedback(e.message); root.querySelector('#planner-feedback').focus(); }
        });
        refresh.id = 'refresh-import'; refresh.hidden = !['conflict', 'storageRead', 'storageBlocked', 'invalidData'].includes(message);
        actions.append(confirm, cancel, refresh); section.append(list, actions); root.append(section);
    }
    function renderBackup() {
        const text = t(), section = element('details', undefined, 'data-backup');
        section.id = 'data-backup'; section.open = backupOpen;
        section.setAttribute('aria-labelledby', 'backup-heading');
        const summary = element('summary'); summary.id = 'backup-summary';
        const labels = element('span', undefined, 'backup-summary-text');
        const heading = element('span', text.dataBackup, 'section-label'); heading.id = 'backup-heading';
        const hint = element('span', '', 'backup-status-hint'); hint.hidden = true; hint.setAttribute('role', 'status');
        labels.append(heading, element('span', text.backupSubtitle, 'backup-subtitle'), hint);
        const chevron = element('span', '⌄', 'backup-chevron'); chevron.setAttribute('aria-hidden', 'true');
        summary.append(labels, chevron);
        const body = element('div', undefined, 'backup-body');
        section.append(summary, body);
        section.addEventListener('toggle', () => {
            if (!section.isConnected) return;
            // A retained conflict review must remain visible; toggling never resets it.
            if (!section.open && section.querySelector('#drive-conflict-review')) section.open = true;
            backupOpen = section.open;
        });
        const actions = element('div', undefined, 'backup-actions');
        const label = element('label', text.importJSON);
        const file = element('input'); file.type = 'file'; file.id = 'rundown-import-file'; file.accept = '.json,application/json';
        file.setAttribute('aria-label', text.importJSON);
        file.addEventListener('change', () => { const selected = file.files[0]; file.value = ''; readImport(selected); });
        label.append(file);
        const all = button(text.exportAll, () => exportSaved()); all.id = 'export-all'; all.disabled = library.templates.length === 0;
        actions.append(label, all); body.append(actions, element('p', text.localWarning)); root.append(section);
        services?.renderBackup(body, {
            language, canChange: () => active && !draft && !review && !writing,
            refresh: async () => { await load(); render(); focusHeading(); },
            keepBackupOpen: () => { section.open = true; backupOpen = true; },
            backupStatus: (code, statusText) => {
                hint.hidden = ['localOnly', 'pending', 'lastChecked', 'busy', 'connectAgain'].includes(code);
                hint.dataset.tone = code === 'reconnect' ? 'neutral' : 'attention';
                hint.textContent = hint.hidden ? '' : code === 'reconnect' ? text.backupDisconnected : text.backupAttention;
                hint.title = statusText;
            },
        });
    }
    function render() {
        closeReposition();
        const text = t();
        root.replaceChildren();
        const top = element('div', undefined, 'planner-top');
        const heading = element('h1', text.planner); heading.tabIndex = -1;
        const back = phaseAction(text.back, 'M19 12H5m6-6-6 6 6 6', close);
        back.className = 'planner-back';
        back.append(element('span', text.back));
        top.append(heading, back);
        root.append(top, element('p', text.planningOnly, 'planner-hint'));
        const notice = element('p', feedbackText(message), 'planner-feedback');
        notice.id = 'planner-feedback';
        notice.setAttribute('role', 'status'); notice.tabIndex = -1; notice.dataset.error = String(error);
        root.append(notice);
        if (review) { renderReview(); return; }
        if (!draft) {
            const actions = element('div', undefined, 'planner-actions');
            actions.append(button(text.create, () => begin(), 'primary'), button(text.refreshLibrary, async () => { const loading = load(); if (services) await loading; render(); focusHeading(); }));
            root.append(actions);
            const listHeading = element('h2', text.myRundowns, 'section-label rundown-list-heading');
            listHeading.id = 'rundown-list-heading'; root.append(listHeading);
            const list = element('ul', undefined, 'template-library');
            list.setAttribute('aria-labelledby', listHeading.id);
            if (!library.templates.length) root.append(element('p', text.empty));
            for (const item of library.templates) {
                const row = element('li');
                const info = element('div');
                info.append(element('h3', item.name), element('p', `${text.phaseCount(item.phases.length)} · ${clock(totalDuration(item.phases))}`));
                const actions = element('div', undefined, 'planner-actions rundown-actions');
                const edit = phaseAction(`${text.edit}: ${item.name}`, 'm16 3 5 5-12 12H4v-5L16 3Zm-2 2 5 5', () => begin(item));
                edit.className = 'rundown-icon rundown-edit';
                const remove = phaseAction(`${text.remove}: ${item.name}`, 'M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6m4-6v6', async () => {
                    if (!window.confirm(text.deleteConfirm(item.name))) return;
                    try {
                        let saved = io('save', { schemaVersion: 1, templates: library.templates.filter(p => p.id !== item.id) }); if (saved?.then) saved = await saved; library = saved;
                        message = 'deleted'; error = false; render(); focusHeading();
                    } catch (e) { feedback(e.message); }
                });
                remove.className = 'rundown-icon rundown-delete';
                const exportButton = phaseAction(text.exportOne(item.name), 'M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5', () => exportSaved(item.id));
                exportButton.className = 'rundown-icon rundown-export';
                if (onLaunch) {
                    const launch = phaseAction(`${text.launch}: ${item.name}`, 'm8 5 11 7-11 7Z', async () => {
                        if (writing || launching) return;
                        launching = true; root.inert = true;
                        try { await onLaunch(item.id); }
                        catch { feedback('launchFailed'); }
                        finally {
                            launching = false; root.inert = false;
                            if (active && launch.isConnected) launch.focus({ preventScroll: true });
                        }
                    });
                    launch.className = 'rundown-launch';
                    launch.dataset.rundownId = item.id;
                    launch.append(element('span', text.launch, 'launch-label-full'), element('span', text.launchShort, 'launch-label-short'));
                    actions.append(launch);
                }
                actions.append(edit, exportButton, remove); row.append(info, actions); list.append(row);
            }
            root.append(list); renderBackup();
            return;
        }
        const form = element('form'); form.noValidate = true;
        form.addEventListener('submit', event => { event.preventDefault(); save(); });
        const metadata = element('div', undefined, 'planner-metadata');
        metadata.append(inputField(text.templateName, draft.name, 'template-name', value => { draft.name = value; }));
        const transition = element('fieldset', undefined, 'transition-choice-group');
        transition.id = 'template-transition';
        transition.append(element('legend', text.transition));
        const options = element('div', undefined, 'transition-options');
        for (const mode of ['manual', 'automatic']) {
            const label = element('label', undefined, 'transition-choice');
            const input = element('input');
            input.type = 'radio'; input.name = 'template-transition'; input.value = mode; input.id = `transition-${mode}`;
            input.checked = draft.transitionMode === mode;
            input.addEventListener('change', () => { if (input.checked) draft.transitionMode = mode; });
            label.append(input, element('span', text[mode])); options.append(label);
        }
        transition.append(options); metadata.append(transition);
        form.append(metadata, element('h2', text.phases));
        const columns = element('div', undefined, 'phase-columns');
        columns.setAttribute('aria-hidden', 'true');
        for (const label of ['#', text.phaseTitleLabel, text.durationLabel, text.actions]) columns.append(element('span', label));
        form.append(columns);
        const list = element('ol', undefined, 'phase-list');
        list.setAttribute('role', 'list');
        draft.phases.forEach((phase, index) => {
            const row = element('li');
            row.dataset.phaseId = phase.id;
            const number = element('span', String(index + 1), 'phase-number'); number.setAttribute('aria-hidden', 'true');
            const title = inputField(text.phaseTitleLabel, phase.title, `phase-${phase.id}-title`, value => { phase.title = value; });
            title.querySelector('input').placeholder = text.phaseTitlePlaceholder;
            title.className = 'phase-title';
            const duration = inputField(text.durationLabel, phase.minutes, `phase-${phase.id}-minutes`, value => { phase.minutes = value; }, true);
            duration.className = 'phase-duration';
            row.append(number, title);
            const controls = element('div', undefined, 'phase-actions');
            const reposition = phaseAction(`${text.reposition}: ${phase.title || index + 1}`, 'M8 20V4m-4 4 4-4 4 4m4-4v16m-4-4 4 4 4-4', () => openReposition(phase.id));
            reposition.id = `reposition-${phase.id}`;
            reposition.setAttribute('aria-expanded', 'false');
            reposition.setAttribute('aria-controls', popover.id);
            controls.append(reposition);
            controls.append(phaseAction(`${text.removePhase}: ${phase.title || index + 1}`, 'M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6m4-6v6', () => {
                draft.phases = draft.phases.filter(p => p.id !== phase.id); render(); root.querySelector('.add-phase').focus();
            }));
            row.append(duration, controls); list.append(row);
        });
        form.append(list, button(text.add, () => {
            const phase = { id: crypto.randomUUID(), title: '', minutes: '10' };
            draft.phases.push(phase); render(); document.getElementById(`phase-${phase.id}-title`).focus();
        }, 'add-phase'));
        const total = element('p'); total.id = 'planner-total'; total.setAttribute('aria-live', 'polite'); form.append(total);
        const actions = element('div', undefined, 'planner-actions');
        const saveButton = element('button', text.save, 'primary'); saveButton.type = 'submit';
        actions.append(saveButton, button(text.cancel, () => { if (canDiscard()) { draft = null; feedback(''); render(); focusHeading(); } }), button(text.reload, async () => {
            if (!canDiscard()) return;
            // Keep the draft if reading storage fails; successful reload is explicit discard.
            try { let fresh = io('load'); if (fresh?.then) fresh = await fresh; library = fresh; draft = null; feedback('', false); render(); focusHeading(); }
            catch (e) { feedback(e.message); }
        }));
        form.append(actions); root.append(form); updateTotal();
    }
    window.addEventListener('storage', event => { if (active && (event.key === STORAGE_KEY || event.key === null)) feedback('conflict'); });
    window.addEventListener('beforeunload', event => { if (dirty()) { event.preventDefault(); event.returnValue = ''; } });
    return {
        close,
        canChangeAccount: () => !draft && !review && !writing,
        async open({ newDraft = false } = {}) {
            if (active) {
                if (newDraft) { if (!canDiscard()) return; begin(); }
                else focusHeading();
                return;
            }
            active = true; backupOpen = false; const loading = load(); if (services) await loading;
            if (newDraft) begin();
            else { render(); focusHeading(); }
        },
        setLanguage(next) {
            if (language === next) return;
            const previousRepositionId = repositionId;
            const focused = root.contains(document.activeElement) ? document.activeElement : null;
            const selection = focused?.tagName === 'INPUT' && focused.type === 'text' ? [focused.selectionStart, focused.selectionEnd, focused.selectionDirection] : null;
            language = next;
            if (active) {
                render();
                const restored = focused?.id ? document.getElementById(focused.id) : repositionTrigger(previousRepositionId);
                restored?.focus({ preventScroll: true });
                if (selection && restored) restored.setSelectionRange(...selection);
            }
        },
    };
}
