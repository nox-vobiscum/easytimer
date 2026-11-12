import { RUNDOWN_CATEGORIES, validateRundownPlan } from './editor-domain.mjs';
import { createNativePhaseFields } from './editor-phase-fields.mjs';
import {
    editNativePhaseDraft,
    editNativeTemplateDraft,
    insertNativeDraftPhase,
    removeNativeDraftPhase,
    repositionNativeDraftPhase,
} from './editor-template-draft.mjs';
import { serializeEditorTemplate } from './editor-portability.mjs';

const fail = code => { throw new Error(code); };
const copy = {
    en: {
        heading: 'Native Editor Workspace', internal: 'Internal preview. The public Editor is unchanged.',
        templates: 'Templates', planned: 'Planned executions', active: 'Active in Timer',
        suspended: 'Suspended', completed: 'Completed', empty: 'No entries.',
        identity: 'ID', revision: 'Revision', edit: 'Edit', create: 'Create template',
        createExecution: 'Create planned execution', exportTemplate: 'Export JSON',
        importTemplate: 'Import one template', importHint: 'Imports one independent Template copy, not an application backup.',
        importReview: 'Review import', importConfirm: 'Import copy', importCancel: 'Cancel import',
        templateEditor: 'Edit Template', newTemplate: 'New Template', executionEditor: 'Edit planned execution',
        newExecution: 'New planned execution', templateEntity: 'Template draft', executionEntity: 'Independent Execution draft',
        name: 'Rundown name', category: 'Rundown category', transition: 'Phase transition',
        manual: 'Manual', automatic: 'Automatic', prepared: 'Prepared rundown information',
        phases: 'Phases', addPhase: 'Add phase', notes: 'Prepared phase notes', resources: 'Resource links',
        resourceLabel: 'Link label', resourceUrl: 'HTTPS or HTTP URL', addResource: 'Add resource',
        removeResource: 'Remove link', openResource: 'Open link in a new tab', earlier: 'Move earlier',
        later: 'Move later', removePhase: 'Remove phase', save: 'Save', cancel: 'Cancel',
        delete: 'Delete', deleteHeading: 'Delete Template?', deleteBody: 'This removes only the selected Template. Existing Executions remain independent.',
        keep: 'Keep Template', confirmDelete: 'Delete Template', recheck: 'Recheck without writing',
        loading: 'Loading native Workspace…', saved: 'Saved.', deleted: 'Template deleted.', imported: 'Template copy imported.',
        cancelled: 'Unsaved changes discarded.', invalidFile: 'Choose a JSON file containing one native Template.',
        creationObserved: 'Execution creation is confirmed. Select Save again to persist the retained plan edits.',
        uncertain: 'The write acknowledgement is uncertain. Your complete draft is retained. Recheck reads storage without retrying the write. Cancel and competing changes remain unavailable.',
        unresolved: 'Storage differs from both known states. Your draft and operation remain retained; no merge or retry was performed. Recheck is the only available operation.',
        absent: 'The write is confirmed absent. Your draft is retained; saving again is an explicit new attempt.',
        conflict: 'The data changed elsewhere. Your complete draft is retained; reload or cancel instead of overwriting it.',
        validation: 'Correct the highlighted or invalid fields. Nothing was saved.',
        storage: 'Storage could not confirm the operation. Your draft is retained.',
        unexpected: 'The operation failed. Your draft is retained.',
        readFailed: 'The native Workspace could not be read.',
        lifecycleInfo: 'Lifecycle actions are intentionally unavailable until the coordinated public cutover.',
        source: 'Source Template', noSource: 'No Template source', total: 'Total', minutes: 'min',
        uncategorized: 'Uncategorized', workshop: 'Workshop', meeting: 'Meeting', training: 'Training', conference: 'Conference',
        indicators: (notes, resources) => `${notes ? 'Notes' : 'No notes'} · ${resources} link${resources === 1 ? '' : 's'}`,
    },
    de: {
        heading: 'Nativer Editor-Arbeitsbereich', internal: 'Interne Vorschau. Der öffentliche Editor bleibt unverändert.',
        templates: 'Vorlagen', planned: 'Geplante Durchführungen', active: 'Im Timer aktiv',
        suspended: 'Unterbrochen', completed: 'Abgeschlossen', empty: 'Keine Einträge.',
        identity: 'ID', revision: 'Revision', edit: 'Bearbeiten', create: 'Vorlage erstellen',
        createExecution: 'Geplante Durchführung erstellen', exportTemplate: 'JSON exportieren',
        importTemplate: 'Eine Vorlage importieren', importHint: 'Importiert eine unabhängige Vorlagenkopie, kein Anwendungs-Backup.',
        importReview: 'Import prüfen', importConfirm: 'Kopie importieren', importCancel: 'Import abbrechen',
        templateEditor: 'Vorlage bearbeiten', newTemplate: 'Neue Vorlage', executionEditor: 'Geplante Durchführung bearbeiten',
        newExecution: 'Neue geplante Durchführung', templateEntity: 'Vorlagenentwurf', executionEntity: 'Unabhängiger Durchführungsentwurf',
        name: 'Ablaufname', category: 'Ablaufkategorie', transition: 'Phasenwechsel',
        manual: 'Manuell', automatic: 'Automatisch', prepared: 'Vorbereitete Ablaufinformationen',
        phases: 'Phasen', addPhase: 'Phase hinzufügen', notes: 'Vorbereitete Phasennotizen', resources: 'Ressourcenlinks',
        resourceLabel: 'Linkbezeichnung', resourceUrl: 'HTTPS- oder HTTP-URL', addResource: 'Ressource hinzufügen',
        removeResource: 'Link entfernen', openResource: 'Link in neuem Tab öffnen', earlier: 'Nach vorne',
        later: 'Nach hinten', removePhase: 'Phase entfernen', save: 'Speichern', cancel: 'Abbrechen',
        delete: 'Löschen', deleteHeading: 'Vorlage löschen?', deleteBody: 'Nur die gewählte Vorlage wird gelöscht. Bestehende Durchführungen bleiben unabhängig.',
        keep: 'Vorlage behalten', confirmDelete: 'Vorlage löschen', recheck: 'Ohne Schreiben erneut prüfen',
        loading: 'Nativer Arbeitsbereich wird geladen…', saved: 'Gespeichert.', deleted: 'Vorlage gelöscht.', imported: 'Vorlagenkopie importiert.',
        cancelled: 'Ungespeicherte Änderungen verworfen.', invalidFile: 'Eine JSON-Datei mit genau einer nativen Vorlage auswählen.',
        creationObserved: 'Die Durchführung wurde bestätigt. Speichern erneut wählen, um die erhaltenen Planänderungen zu sichern.',
        uncertain: 'Die Schreibbestätigung ist unklar. Der vollständige Entwurf bleibt erhalten. Die erneute Prüfung liest nur und wiederholt den Schreibvorgang nicht. Abbruch und konkurrierende Änderungen bleiben gesperrt.',
        unresolved: 'Der Speicher entspricht keinem bekannten Zustand. Entwurf und Vorgang bleiben erhalten; es wurde weder zusammengeführt noch erneut geschrieben. Nur die erneute Prüfung bleibt verfügbar.',
        absent: 'Der Schreibvorgang ist nachweislich nicht erfolgt. Der Entwurf bleibt erhalten; erneutes Speichern ist ein neuer ausdrücklicher Versuch.',
        conflict: 'Die Daten wurden anderweitig geändert. Der vollständige Entwurf bleibt erhalten; neu laden oder abbrechen statt überschreiben.',
        validation: 'Ungültige Felder korrigieren. Es wurde nichts gespeichert.',
        storage: 'Der Speicher konnte den Vorgang nicht bestätigen. Der Entwurf bleibt erhalten.',
        unexpected: 'Der Vorgang ist fehlgeschlagen. Der Entwurf bleibt erhalten.',
        readFailed: 'Der native Arbeitsbereich konnte nicht gelesen werden.',
        lifecycleInfo: 'Lebenszyklusaktionen bleiben bis zur koordinierten öffentlichen Umstellung absichtlich nicht verfügbar.',
        source: 'Quellvorlage', noSource: 'Keine Vorlagenquelle', total: 'Gesamt', minutes: 'Min.',
        uncategorized: 'Ohne Kategorie', workshop: 'Workshop', meeting: 'Besprechung', training: 'Training', conference: 'Konferenz',
        indicators: (notes, resources) => `${notes ? 'Notizen' : 'Keine Notizen'} · ${resources} Link${resources === 1 ? '' : 's'}`,
    },
};

const uncertainCodes = new Set(['storageUnconfirmed', 'storageReadback', 'lockRequest']);
const el = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
};
const button = (text, action, className) => {
    const node = el('button', text, className); node.type = 'button'; node.addEventListener('click', action); return node;
};
const safeLink = value => {
    try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : null; }
    catch { return null; }
};

export function createNativeEditorWorkspace({
    root, plannerService, plannedExecutionService, launchService, importService,
    language = 'en', createPhaseId = () => crypto.randomUUID(),
    downloadTemplate = ({ name, text }) => {
        const link = document.createElement('a');
        link.download = name; link.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
        link.click(); URL.revokeObjectURL(link.href);
    },
} = {}) {
    if (!(root instanceof HTMLElement) || !copy[language]
        || !plannerService || !plannedExecutionService || !launchService || !importService
        || typeof createPhaseId !== 'function' || typeof downloadTemplate !== 'function') fail('invalidWorkspace');
    let active = false; let workspace = null; let draft = null; let editorKind = null;
    let baseline = null; let feedbackCode = null; let feedbackError = false;
    let pending = null; let mutationBusy = false;
    let importCandidate = null; let deleteTarget = null; let deleteTrigger = null;
    let fileReadId = 0;
    const t = () => copy[language];
    const library = () => ({ revision: workspace.revision, templates: workspace.templates });
    const currentPlan = () => { const { id, ...plan } = draft.template; return plan; };
    const dirty = () => draft !== null && JSON.stringify(draft) !== baseline;
    const setFeedback = (code, error = true) => { feedbackCode = code; feedbackError = error; };
    const feedbackText = () => feedbackCode ? (t()[feedbackCode] || t().unexpected) : '';
    const resultCode = result => result.error?.type === 'conflict' ? 'conflict'
        : result.error?.type === 'validation' ? 'validation'
            : result.error?.type === 'storage' || uncertainCodes.has(result.error?.code) ? 'storage' : 'unexpected';

    async function loadWorkspace() {
        const result = await plannerService.loadWorkspace();
        if (result.status !== 'success') { setFeedback('readFailed'); return false; }
        workspace = result.workspace; return true;
    }
    const mutationBlocked = () => mutationBusy || pending !== null;
    function clearEditor({ clearPending = false } = {}) {
        draft = null; editorKind = null; baseline = null;
        if (clearPending) pending = null;
    }
    function lockRenderedControls() {
        if (!mutationBlocked()) return;
        root.querySelectorAll('button, input, select, textarea').forEach(control => { control.disabled = true; });
        if (!mutationBusy) {
            const recheck = root.querySelector('[data-native-recheck]');
            if (recheck) recheck.disabled = false;
        }
    }
    async function runMutation(operation, { allowPending = false } = {}) {
        if (mutationBusy || (pending && !allowPending)) return false;
        mutationBusy = true; lockRenderedControls();
        try { await operation(); }
        catch { setFeedback('unexpected'); }
        finally { mutationBusy = false; render(); }
        return true;
    }
    async function finishWrite(message) {
        if (!await loadWorkspace()) { render(); return; }
        clearEditor({ clearPending: true }); importCandidate = null; setFeedback(message, false); render(); focusHeading();
    }
    function beginDraft(next, kind) {
        draft = structuredClone(next); editorKind = kind; baseline = JSON.stringify(draft);
        pending = null; setFeedback(null, false); render();
        root.querySelector('[data-field="name"]')?.focus({ preventScroll: true });
    }
    function beginTemplate(templateId = null) {
        if (mutationBlocked()) return;
        const result = templateId === null
            ? plannerService.prepareNewDraft(library()) : plannerService.prepareEditDraft(library(), templateId);
        if (result.status === 'success') beginDraft(result.draft, 'template');
        else { setFeedback(resultCode(result)); render(); }
    }
    async function beginExecution(executionId) {
        if (mutationBlocked()) return;
        const result = await plannedExecutionService.loadDraft(executionId);
        if (result.status === 'success') beginDraft(result.draft, 'execution');
        else { setFeedback(resultCode(result)); render(); }
    }
    function beginNewExecution(template) {
        if (mutationBlocked()) return;
        beginDraft({
            executionId: null,
            expectedAggregateRevision: workspace.revision,
            expectedExecutionRevision: null,
            template: { id: 'unpersisted-execution', ...structuredClone(template.plan) },
            sourceTemplateId: template.id,
        }, 'newExecution');
    }
    function actualExecutionDraft(record, executionId, retainedPlan) {
        const entry = record.executions.find(item => item.execution.id === executionId);
        if (!entry || entry.execution.lifecycle !== 'planned') fail('invalidPlanningResult');
        const { id: ignored, ...plan } = retainedPlan;
        return {
            executionId,
            expectedAggregateRevision: record.revision,
            expectedExecutionRevision: entry.execution.revision,
            template: { id: executionId, ...plan },
        };
    }
    function persistedExecutionDraft(record, executionId) {
        const entry = record.executions.find(item => item.execution.id === executionId);
        if (!entry) fail('invalidPlanningResult');
        return actualExecutionDraft(record, executionId, { id: executionId, ...entry.execution.currentPlan });
    }
    async function saveNewExecution() {
        try { validateRundownPlan(currentPlan()); }
        catch { setFeedback('validation'); render(); return; }
        const retained = structuredClone(draft.template);
        const source = workspace.templates.find(template => template.id === draft.sourceTemplateId);
        if (!source) { setFeedback('conflict'); render(); return; }
        const result = await launchService.planFromTemplate({
            templateId: draft.sourceTemplateId,
            expectedAggregateRevision: draft.expectedAggregateRevision,
        });
        if (result.status === 'uncertain') {
            pending = {
                kind: 'plan', executionId: result.executionId, retained,
                sourceTemplateId: source.id, expectedPlan: structuredClone(source.plan),
            };
            setFeedback('uncertain'); render(); return;
        }
        if (result.status !== 'planned') { setFeedback(resultCode(result)); render(); return; }
        draft = actualExecutionDraft(result.record, result.executionId, retained);
        editorKind = 'execution'; baseline = JSON.stringify(persistedExecutionDraft(result.record, result.executionId));
        await saveExistingExecution();
    }
    async function saveExistingExecution() {
        const result = await plannedExecutionService.saveDraft(draft);
        if (result.status === 'success') { await finishWrite('saved'); return; }
        if (result.status === 'uncertain') { pending = { kind: 'executionSave', ticket: result.reconciliation }; setFeedback('uncertain'); }
        else setFeedback(resultCode(result));
        render();
    }
    async function saveTemplate() {
        const result = await plannerService.saveDraft(draft);
        if (result.status === 'success') { await finishWrite('saved'); return; }
        if (result.status === 'uncertain') { pending = { kind: 'templateSave', ticket: result.reconciliation }; setFeedback('uncertain'); }
        else setFeedback(resultCode(result));
        render();
    }
    function save() {
        return runMutation(async () => {
            if (editorKind === 'template') await saveTemplate();
            else if (editorKind === 'newExecution') await saveNewExecution();
            else await saveExistingExecution();
        });
    }
    function recheck() {
        if (!pending) return Promise.resolve(false);
        return runMutation(async () => {
            let result;
            if (pending.kind === 'plan') {
                result = await launchService.observeExecution(pending.executionId);
                const observed = result.execution;
                const exactCreatedExecution = result.status === 'observed' && result.lifecycle === 'planned'
                    && observed.revision === 1 && observed.runtimeRevision === 0
                    && observed.source?.kind === 'template' && observed.source.id === pending.sourceTemplateId
                    && observed.attempt === null
                    && JSON.stringify(observed.currentPlan) === JSON.stringify(pending.expectedPlan)
                    && JSON.stringify(observed.workshopNotes) === JSON.stringify({ rundown: '', phases: [] });
                if (exactCreatedExecution) {
                    draft = actualExecutionDraft(result.record, result.executionId, pending.retained);
                    editorKind = 'execution'; baseline = JSON.stringify(persistedExecutionDraft(result.record, result.executionId)); pending = null;
                    setFeedback('creationObserved', false); render(); return;
                }
                setFeedback('unresolved'); render(); return;
            }
            if (pending.kind === 'templateSave') result = await plannerService.reconcileSave(pending.ticket);
            else if (pending.kind === 'executionSave') result = await plannedExecutionService.reconcileSave(pending.ticket);
            else if (pending.kind === 'delete') result = await plannerService.reconcileDelete(pending.ticket);
            else result = await importService.reconcileImport(pending.ticket);
            if (result.status === 'confirmed') { await finishWrite(pending.kind === 'delete' ? 'deleted' : pending.kind === 'import' ? 'imported' : 'saved'); return; }
            if (result.status === 'absent') { pending = null; setFeedback('absent'); render(); return; }
            setFeedback('unresolved'); render();
        }, { allowPending: true });
    }
    function confirmDelete() {
        if (!deleteTarget) return Promise.resolve(false);
        return runMutation(async () => {
            const target = deleteTarget; closeDeleteDialog(false);
            const result = await plannerService.deleteTemplate({
                templateId: target.id,
                expectedAggregateRevision: workspace.revision,
                expectedTemplateRevision: target.revision,
            });
            if (result.status === 'success') { await finishWrite('deleted'); return; }
            if (result.status === 'uncertain') { pending = { kind: 'delete', ticket: result.reconciliation }; setFeedback('uncertain'); }
            else setFeedback(resultCode(result));
            render();
        });
    }
    function openDeleteDialog(template, trigger) {
        if (mutationBlocked()) return;
        deleteTarget = template; deleteTrigger = trigger; renderDeleteDialog();
        const dialog = root.querySelector('[data-native-dialog]'); dialog.showModal();
        dialog.querySelector('[data-action="keep"]')?.focus();
    }
    function closeDeleteDialog(restore = true) {
        root.querySelector('[data-native-dialog]')?.close(); deleteTarget = null;
        if (restore && deleteTrigger?.isConnected) deleteTrigger.focus({ preventScroll: true });
        deleteTrigger = null;
    }
    async function prepareImport(file) {
        if (mutationBlocked()) return;
        const id = ++fileReadId; importCandidate = null;
        try {
            const text = await file.text(); if (id !== fileReadId) return;
            const result = importService.prepareImport(text, workspace.revision);
            if (result.status !== 'prepared') { setFeedback('invalidFile'); render(); return; }
            importCandidate = result.candidate; setFeedback(null, false); render();
            root.querySelector('[data-action="confirm-import"]')?.focus();
        } catch { if (id === fileReadId) { setFeedback('invalidFile'); render(); } }
    }
    function persistImport() {
        return runMutation(async () => {
            const result = await importService.persistImport(importCandidate);
            if (result.status === 'confirmed') { await finishWrite('imported'); return; }
            if (result.status === 'uncertain') { pending = { kind: 'import', ticket: result.reconciliation }; setFeedback('uncertain'); }
            else setFeedback(resultCode(result));
            render();
        });
    }
    function exportOne(template) {
        const safe = template.plan.name.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-|-$/g, '') || 'template';
        downloadTemplate({ name: `${safe}.json`, text: serializeEditorTemplate(template), templateId: template.id });
    }

    function renderFeedback(container) {
        const line = el('p', feedbackText(), 'planner-feedback'); line.dataset.error = String(feedbackError);
        line.setAttribute('role', 'status'); line.setAttribute('aria-live', 'polite'); container.append(line);
        if (pending) {
            const control = button(t().recheck, recheck, 'primary'); control.dataset.nativeRecheck = '';
            container.append(control);
        }
    }
    function heading(container) {
        const top = el('div', undefined, 'planner-top');
        const block = el('div'); const title = el('h1', t().heading); title.tabIndex = -1;
        block.append(title, el('p', t().internal, 'planner-hint')); top.append(block); container.append(top);
    }
    function entityMeta(entity) {
        return `${t().identity}: ${entity.id} · ${t().revision}: ${entity.revision}`;
    }
    function templateRow(template) {
        const row = el('li'); const info = el('div');
        info.append(el('h3', template.plan.name), el('p', entityMeta(template)));
        const actions = el('div', undefined, 'planner-actions rundown-actions');
        actions.append(
            button(t().createExecution, () => beginNewExecution(template), 'rundown-launch'),
            button(t().edit, () => beginTemplate(template.id)),
            button(t().exportTemplate, () => exportOne(template)),
        );
        const remove = button(t().delete, event => openDeleteDialog(template, event.currentTarget)); actions.append(remove);
        row.append(info, actions); return row;
    }
    function executionRow(entry) {
        const execution = entry.execution; const row = el('li'); const info = el('div');
        info.append(el('h3', execution.currentPlan.name), el('p', entityMeta(execution)));
        info.append(el('p', execution.source?.kind === 'template'
            ? `${t().source}: ${execution.source.id}` : t().noSource));
        if (execution.lifecycle === 'planned') row.append(info, button(t().edit, () => beginExecution(execution.id)));
        else { info.append(el('p', t().lifecycleInfo)); row.append(info); }
        return row;
    }
    function group(container, title, entries, row) {
        container.append(el('h2', title, 'rundown-list-heading'));
        if (!entries.length) { container.append(el('p', t().empty, 'planner-hint')); return; }
        const list = el('ul', undefined, 'template-library'); entries.forEach(item => list.append(row(item))); container.append(list);
    }
    function renderImport(container) {
        const details = el('details', undefined, 'data-backup');
        details.append(el('summary', t().importTemplate)); const body = el('div', undefined, 'backup-body');
        body.append(el('p', t().importHint));
        const input = el('input'); input.type = 'file'; input.accept = 'application/json,.json';
        input.setAttribute('aria-label', t().importTemplate); input.addEventListener('change', () => input.files[0] && prepareImport(input.files[0]));
        body.append(input);
        if (importCandidate) {
            const review = el('section', undefined, 'import-review'); review.append(el('h3', t().importReview));
            review.append(el('p', `${importCandidate.template.plan.name} · ${importCandidate.template.plan.phases.length} ${t().phases}`));
            const actions = el('div', undefined, 'planner-actions');
            const confirm = button(t().importConfirm, persistImport, 'primary'); confirm.dataset.action = 'confirm-import';
            actions.append(confirm, button(t().importCancel, () => {
                if (mutationBlocked()) return;
                importCandidate = null; render();
            })); review.append(actions); body.append(review);
        }
        details.append(body); container.append(details);
    }
    function renderLibrary() {
        const section = el('section'); heading(section);
        const actions = el('div', undefined, 'planner-actions'); actions.append(button(t().create, () => beginTemplate(), 'primary')); section.append(actions);
        renderFeedback(section);
        group(section, t().templates, workspace.templates, templateRow);
        for (const lifecycle of ['planned', 'active', 'suspended', 'completed']) {
            group(section, t()[lifecycle], workspace.executions.filter(entry => entry.execution.lifecycle === lifecycle), executionRow);
        }
        renderImport(section); root.replaceChildren(section); renderDeleteDialog();
    }
    function controlLabel(text, control) { const label = el('label'); label.append(el('span', text), control); return label; }
    function editTemplate(changes) { draft = editNativeTemplateDraft(draft, changes); }
    function renderResources(details, phase) {
        details.append(el('h3', t().resources));
        phase.resources.forEach((resource, index) => {
            const row = el('div', undefined, 'native-workspace-resource');
            const label = el('input'); label.type = 'text'; label.value = resource.label;
            label.setAttribute('aria-label', t().resourceLabel); label.addEventListener('input', () => {
                const current = draft.template.phases.find(item => item.id === phase.id);
                const resources = structuredClone(current.resources); resources[index].label = label.value;
                draft = editNativePhaseDraft(draft, phase.id, { resources });
            });
            const url = el('input'); url.type = 'url'; url.value = resource.url; url.inputMode = 'url';
            url.setAttribute('aria-label', t().resourceUrl); url.addEventListener('input', () => {
                const current = draft.template.phases.find(item => item.id === phase.id);
                const resources = structuredClone(current.resources); resources[index].url = url.value;
                draft = editNativePhaseDraft(draft, phase.id, { resources });
                const href = safeLink(url.value); preview.hidden = !href; if (href) preview.href = href;
            });
            const preview = el('a', t().openResource); preview.target = '_blank'; preview.rel = 'noopener noreferrer';
            const href = safeLink(resource.url); preview.hidden = !href; if (href) preview.href = href;
            const remove = button(t().removeResource, () => {
                const resources = structuredClone(draft.template.phases.find(item => item.id === phase.id).resources);
                resources.splice(index, 1); draft = editNativePhaseDraft(draft, phase.id, { resources }); render();
            });
            row.append(controlLabel(t().resourceLabel, label), controlLabel(t().resourceUrl, url), preview, remove); details.append(row);
        });
        details.append(button(t().addResource, () => {
            const current = draft.template.phases.find(item => item.id === phase.id);
            draft = editNativePhaseDraft(draft, phase.id, { resources: [...current.resources, { label: '', url: '' }] }); render();
        }));
    }
    function renderPhase(phase, index, list) {
        const fields = createNativePhaseFields({
            getDraft: () => draft, onDraftChange: next => { draft = next; }, phaseId: phase.id, language,
        });
        const details = fields.element.querySelector('.native-phase-details');
        details.prepend(el('p', t().indicators(Boolean(phase.notes.trim()), phase.resources.length), 'planner-hint'));
        const notes = el('textarea'); notes.rows = 4; notes.value = phase.notes; notes.dataset.field = 'notes';
        notes.addEventListener('input', () => { draft = editNativePhaseDraft(draft, phase.id, { notes: notes.value }); });
        details.append(controlLabel(t().notes, notes)); renderResources(details, phase);
        const actions = el('div', undefined, 'planner-actions native-workspace-phase-actions');
        const structural = (label, operation, focusId = phase.id) => button(label, () => {
            draft = operation(); render();
            root.querySelector(`[data-native-phase-id="${CSS.escape(focusId)}"] [data-action="details"]`)?.focus({ preventScroll: true });
        });
        const earlier = structural(t().earlier, () => repositionNativeDraftPhase(draft, phase.id, index)); earlier.disabled = index === 0;
        const later = structural(t().later, () => repositionNativeDraftPhase(draft, phase.id, index + 2)); later.disabled = index === draft.template.phases.length - 1;
        const fallback = draft.template.phases[index + 1]?.id || draft.template.phases[index - 1]?.id;
        actions.append(earlier, later, structural(t().removePhase, () => removeNativeDraftPhase(draft, phase.id), fallback));
        details.append(actions); list.append(fields.element);
    }
    function renderEditor() {
        const section = el('section'); heading(section);
        const form = el('form'); form.addEventListener('submit', event => { event.preventDefault(); save(); });
        const title = editorKind === 'template' ? (draft.mode === 'create' ? t().newTemplate : t().templateEditor)
            : editorKind === 'newExecution' ? t().newExecution : t().executionEditor;
        form.append(el('h2', title), el('p', editorKind === 'template' ? t().templateEntity : t().executionEntity, 'planner-hint'));
        renderFeedback(form);
        const metadata = el('div', undefined, 'planner-metadata');
        const name = el('input'); name.type = 'text'; name.required = true; name.maxLength = 120; name.value = draft.template.name; name.dataset.field = 'name';
        name.addEventListener('input', () => editTemplate({ name: name.value })); metadata.append(controlLabel(t().name, name));
        const category = el('select'); category.className = 'native-workspace-control';
        RUNDOWN_CATEGORIES.forEach(value => { const option = el('option', t()[value]); option.value = value; category.append(option); });
        category.value = draft.template.category; category.addEventListener('change', () => editTemplate({ category: category.value }));
        metadata.append(controlLabel(t().category, category)); form.append(metadata);
        const transition = el('fieldset', undefined, 'transition-choice-group'); transition.append(el('legend', t().transition));
        const choices = el('div', undefined, 'transition-options');
        for (const value of ['manual', 'automatic']) {
            const label = el('label', undefined, 'transition-choice'); const input = el('input'); input.type = 'radio'; input.name = 'native-transition'; input.value = value;
            input.checked = draft.template.transitionMode === value; input.addEventListener('change', () => editTemplate({ transitionMode: value }));
            label.append(input, el('span', t()[value])); choices.append(label);
        }
        transition.append(choices); form.append(transition);
        const prepared = el('textarea'); prepared.rows = 5; prepared.value = draft.template.preparedInformation;
        prepared.dataset.field = 'prepared'; prepared.addEventListener('input', () => editTemplate({ preparedInformation: prepared.value }));
        form.append(controlLabel(t().prepared, prepared), el('h2', t().phases));
        const list = el('ol', undefined, 'phase-list'); draft.template.phases.forEach((phase, index) => renderPhase(phase, index, list)); form.append(list);
        form.append(button(t().addPhase, () => {
            const phaseId = createPhaseId(); draft = insertNativeDraftPhase(draft, { phaseId }); render();
            root.querySelector(`[data-native-phase-id="${CSS.escape(phaseId)}"] [data-field="title"]`)?.focus({ preventScroll: true });
        }, 'add-phase'));
        const total = draft.template.phases.reduce((sum, phase) => sum + (Number.isSafeInteger(phase.durationSeconds) ? phase.durationSeconds : 0), 0) / 60;
        form.append(el('p', `${t().total}: ${total} ${t().minutes}`, 'planner-hint'));
        const actions = el('div', undefined, 'planner-actions native-workspace-save-actions');
        const saveButton = el('button', t().save, 'primary'); saveButton.type = 'submit'; saveButton.disabled = mutationBlocked();
        actions.append(saveButton, button(t().cancel, () => {
            if (mutationBlocked()) return;
            clearEditor(); setFeedback('cancelled', false); render(); focusHeading();
        }));
        form.append(actions); section.append(form); root.replaceChildren(section); renderDeleteDialog();
    }
    function renderDeleteDialog() {
        root.querySelector('[data-native-dialog]')?.remove();
        const dialog = el('dialog', undefined, 'confirmation-dialog'); dialog.dataset.nativeDialog = '';
        const form = el('form'); form.method = 'dialog'; form.addEventListener('submit', event => event.preventDefault());
        form.append(el('h2', t().deleteHeading), el('p', t().deleteBody));
        const actions = el('div', undefined, 'confirmation-dialog-actions');
        const keep = button(t().keep, () => closeDeleteDialog()); keep.dataset.action = 'keep';
        const remove = button(t().confirmDelete, confirmDelete, 'confirm-stop'); actions.append(keep, remove); form.append(actions); dialog.append(form);
        dialog.addEventListener('cancel', event => { event.preventDefault(); closeDeleteDialog(); }); root.append(dialog);
    }
    function render() {
        if (!active) return;
        root.className = 'planner native-editor-workspace'; root.dataset.nativeEditorWorkspace = '';
        if (!workspace) { root.replaceChildren(el('p', t().loading)); return; }
        if (draft) renderEditor(); else renderLibrary();
        lockRenderedControls();
    }
    function focusHeading() { root.querySelector('h1')?.focus({ preventScroll: true }); }
    const beforeUnload = event => {
        if (dirty() || mutationBlocked()) { event.preventDefault(); event.returnValue = ''; }
    };

    return Object.freeze({
        async open() {
            if (active) { focusHeading(); return; }
            active = true; window.addEventListener('beforeunload', beforeUnload); render();
            await loadWorkspace(); render(); focusHeading();
        },
        close() {
            if (mutationBlocked()) { render(); root.querySelector('[data-native-recheck]')?.focus({ preventScroll: true }); return false; }
            active = false; fileReadId += 1; window.removeEventListener('beforeunload', beforeUnload);
            clearEditor(); workspace = null; importCandidate = null; deleteTarget = null;
            root.replaceChildren(); root.classList.remove('planner', 'native-editor-workspace'); delete root.dataset.nativeEditorWorkspace;
            return true;
        },
        setLanguage(next) {
            if (!copy[next]) fail('invalidLanguage'); language = next; render(); focusHeading();
        },
    });
}
