// Development-only functional review. All supplied content is rendered as text.
export function renderConflictReview(parent, review, sync, context, feedback, onClose) {
    const de = context.language === 'de';
    const conflictFree = review.analysis.status === 'proposed';
    const text = de ? {
        title: 'Konflikt prüfen', a: 'Version A verwenden', b: 'Version B verwenden', both: 'Beide behalten',
        help: 'Vergleiche beide Fassungen und wähle ausdrücklich. „Beide behalten“ behält A und erstellt eine unabhängige, nummerierte Kopie von B.',
        preview: 'Ergebnis prüfen', confirm: 'Bestätigen und synchronisieren', cancel: 'Abbrechen', back: 'Auswahl ändern', result: 'Geprüftes Ergebnis',
        missing: 'Bitte für jeden Konflikt eine Auswahl treffen.', changes: 'Unterschiede', name: 'Name', mode: 'Übergang', phases: 'Phasenanzahl', phase: 'Phase', manual: 'Manuell', automatic: 'Automatisch',
        freeTitle: 'Zusammenführung prüfen', freeHelp: 'Die beiden Fassungen enthalten keine widersprüchlichen Änderungen. Prüfe die vollständige Rundown-Liste und bestätige die Zusammenführung.', empty: 'Keine gespeicherten Rundowns.',
    } : {
        title: 'Review conflict', a: 'Use version A', b: 'Use version B', both: 'Keep both',
        help: 'Compare both versions and choose explicitly. Keep both retains A and creates an independent, numbered copy of B.',
        preview: 'Review result', confirm: 'Confirm and synchronize', cancel: 'Cancel', back: 'Change choices', result: 'Reviewed result',
        missing: 'Choose an option for every conflict.', changes: 'Differences', name: 'Name', mode: 'Transition', phases: 'Phase count', phase: 'Phase', manual: 'Manual', automatic: 'Automatic',
        freeTitle: 'Review reconciliation', freeHelp: 'The two versions contain no contradictory changes. Review the complete rundown library and confirm reconciliation.', empty: 'No saved rundowns.',
    };
    const section = document.createElement('section'); section.id = 'drive-conflict-review'; section.setAttribute('aria-labelledby', 'drive-conflict-title');
    section.style.cssText = 'margin-block:16px;max-width:100%;overflow-wrap:anywhere';
    const element = (tag, value, target = section) => { const node = document.createElement(tag); if (value !== undefined) node.textContent = value; target.append(node); return node; };
    const heading = element('h3', conflictFree ? text.freeTitle : text.title); heading.id = 'drive-conflict-title'; heading.tabIndex = -1;
    element('p', conflictFree ? text.freeHelp : text.help);
    const error = element('p', ''); error.setAttribute('role', 'alert');
    const content = element('div'), actions = element('div'); actions.className = 'backup-actions';
    const choices = Object.create(null); let working = false;
    const button = (label, fn, id) => { const node = element('button', label, actions); node.type = 'button'; node.style.minHeight = '44px'; if (id) node.id = id; node.onclick = fn; return node; };
    const details = (template, target) => {
        element('h4', template.name, target);
        element('p', template.transitionMode === 'manual' ? text.manual : text.automatic, target);
        const list = element('ol', undefined, target);
        for (const phase of template.phases) element('li', `${phase.title} · ${phase.durationSeconds / 60} min`, list);
    };
    const cancel = () => { section.remove(); onClose(); };
    const task = async fn => {
        if (working || !context.canChange()) return;
        working = true; actions.querySelectorAll('button').forEach(b => b.disabled = true);
        try { await fn(); } catch (e) { error.textContent = feedback(e.message, context.language); error.tabIndex = -1; error.focus(); }
        finally { working = false; actions.querySelectorAll('button').forEach(b => b.disabled = false); }
    };
    const showResult = preview => {
        content.replaceChildren(); actions.replaceChildren(); error.textContent = '';
        const resultHeading = element('h4', text.result, content); resultHeading.tabIndex = -1;
        if (!preview.snapshot.library.templates.length) element('p', text.empty, content);
        for (const template of preview.snapshot.library.templates) details(template, content);
        button(text.confirm, () => task(async () => { await sync.confirmResolution(preview.id); section.remove(); await context.refresh(); }), 'drive-confirm-resolution');
        if (!conflictFree) button(text.back, selection);
        button(text.cancel, cancel); resultHeading.focus();
    };
    const selection = () => {
        content.replaceChildren(); actions.replaceChildren(); error.textContent = '';
        for (const row of review.analysis.proposal.conflicts) {
            const fieldset = element('fieldset', undefined, content); fieldset.style.cssText = 'min-width:0;margin-block:12px;padding:12px';
            element('legend', row.left.template.name, fieldset);
            const a = row.left.template, b = row.right.template, differences = [];
            if (a.name !== b.name) differences.push(text.name);
            if (a.transitionMode !== b.transitionMode) differences.push(text.mode);
            if (a.phases.length !== b.phases.length) differences.push(text.phases);
            for (let i = 0; i < Math.max(a.phases.length, b.phases.length); i++) {
                const x = a.phases[i], y = b.phases[i];
                if (!x || !y || x.id !== y.id || x.title !== y.title || x.durationSeconds !== y.durationSeconds) differences.push(`${text.phase} ${i + 1}`);
            }
            element('p', `${text.changes}: ${differences.join(' · ')}`, fieldset);
            for (const [version, template] of [['A', row.left.template], ['B', row.right.template]]) {
                const block = element('div', undefined, fieldset); element('strong', version, block); details(template, block);
            }
            for (const [value, label] of [['left', text.a], ['right', text.b], ['both', text.both]]) {
                const line = element('label', undefined, fieldset); line.style.cssText = 'display:flex;flex-direction:row;align-items:center;gap:8px;min-height:44px;text-align:left';
                const input = element('input', undefined, line); input.type = 'radio'; input.name = 'resolution-' + row.id; input.value = value;
                input.style.cssText = 'width:20px;height:20px;min-height:20px;flex:0 0 20px;margin:0;padding:0;accent-color:var(--accent)';
                input.checked = choices[row.id] === value; input.onchange = () => { choices[row.id] = value; };
                element('span', label, line);
            }
        }
        button(text.preview, () => task(async () => {
            if (review.analysis.proposal.conflicts.some(row => !choices[row.id])) { error.textContent = text.missing; return; }
            showResult(await sync.previewResolution(review.id, choices));
        }), 'drive-preview-resolution');
        button(text.cancel, cancel);
    };
    selection(); parent.append(section); heading.focus();
    // Preview preparation writes neither storage nor remote files; publication requires confirmation.
    if (conflictFree) task(async () => showResult(await sync.previewResolution(review.id, {})));
}
