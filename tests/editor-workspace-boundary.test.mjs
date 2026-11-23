import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('native Workspace is the single public Editor and V1 Planner is unreachable', async () => {
    const [app, html, workspace, packaging] = await Promise.all([
        read('src/js/app.js'), read('src/index.html'), read('src/js/editor-workspace.mjs'),
        read('tools/release/package.mjs'),
    ]);
    assert.match(app, /createNativeEditorWorkspace/);
    assert.doesNotMatch(app, /createPlanner|planner-v1|\.\/portability\.mjs/);
    assert.doesNotMatch(html, /planner-v1|planner\.js|portability\.mjs/);
    assert.doesNotMatch(packaging, /'js\/planner\.js'|'js\/planner-v1\.mjs'|'js\/portability\.mjs'/);
    assert.match(packaging, /'js\/editor-workspace\.mjs'/);
    assert.match(packaging, /'js\/editor-draft-recovery\.mjs'/);
    assert.match(packaging, /'js\/editor-template-draft-recovery-service\.mjs'/);
    assert.doesNotMatch(workspace, /planner-v1|easyTimerTemplates|easyTimerRuntime|localStorage/);
    assert.match(workspace, /createNativeEditorWorkspace/);
});

test('internal Workspace uses reviewed native editing and portability boundaries', async () => {
    const workspace = await read('src/js/editor-workspace.mjs');
    assert.match(workspace, /createNativePhaseFields/);
    assert.match(workspace, /editNativeTemplateDraft/);
    assert.match(workspace, /repositionNativeDraftPhase/);
    assert.match(workspace, /function repositionPhase\(phaseId, position, focus = 'position', announcement = ''\)/);
    assert.match(workspace, /onReposition: repositionPhase/);
    assert.match(workspace, /bounds\.top < 0 \|\| bounds\.bottom > viewportHeight/);
    assert.match(workspace, /scrollIntoView\(\{ block: 'nearest', inline: 'nearest' \}\)/);
    assert.match(workspace, /function focusAddedPhaseTitle\(phaseId\)/);
    assert.match(workspace, /const top = viewport\?\.offsetTop \?\? 0/);
    assert.match(workspace, /viewport\?\.height \?\? window\.innerHeight/);
    assert.match(workspace, /viewport\.addEventListener\('resize', resized\)/);
    assert.match(workspace, /cancelPhaseTitleReveal\(\)/);
    const titleFocusBoundary = workspace.slice(workspace.indexOf('function focusAddedPhaseTitle'), workspace.indexOf('function repositionPhase'));
    assert.ok(titleFocusBoundary.indexOf("viewport.addEventListener('resize', resized)")
        < titleFocusBoundary.indexOf('field.focus({ preventScroll: true })'));
    const phaseFields = await read('src/js/editor-phase-fields.mjs');
    assert.doesNotMatch(phaseFields, /positionPanel\.style\.(?:left|top)/);
    assert.match(phaseFields, /categoryIconPaths/);
    assert.match(phaseFields, /categoryPanel\.className = 'phase-category-popover'/);
    assert.match(phaseFields, /option\.setAttribute\('aria-pressed'/);
    assert.doesNotMatch(phaseFields, /category\s*=\s*document\.createElement\('select'\)/);
    assert.match(workspace, /serializeEditorTemplate/);
    assert.match(workspace, /reconcileSave/);
    assert.match(workspace, /reconcileDelete/);
    assert.match(workspace, /reconcileImport/);
    assert.match(workspace, /observeExecution/);
    assert.doesNotMatch(workspace, /activatePlanned\(|launchTemplateToReady\(|reconcilePendingActivation\(/);
});

test('Workspace retains reconciliation state and serializes local mutations', async () => {
    const workspace = await read('src/js/editor-workspace.mjs');
    assert.match(workspace, /let pending = null; let mutationBusy = false/);
    assert.match(workspace, /if \(mutationBusy \|\| \(pending && !allowPending\) \|\| \(templateCompletion && !allowCompletion\)\) return false/);
    assert.match(workspace, /clearEditor\(\{ clearPending: true \}\)/);
    assert.match(workspace, /if \(mutationBlocked\(\)\) return;\s*if \(!discardCurrentTemplateRecovery\(\)\) return;\s*clearEditor\(\)/);
    assert.match(workspace, /data-native-recheck/);
    assert.match(workspace, /if \(mutationBlocked\(\)\)[\s\S]*return false/);
});

test('Workspace shares one guarded close path and validates resource snapshots before writing', async () => {
    const workspace = await read('src/js/editor-workspace.mjs');
    assert.match(workspace, /function close\(\)[\s\S]*if \(mutationBlocked\(\)\)[\s\S]*if \(dirty\(\)/);
    assert.match(workspace, /if \(!close\(\)\) return;\s*onClose\(\{ focus: 'menu' \}\)/);
    assert.match(workspace, /return Object\.freeze\(\{[\s\S]*\n\s*close,/);
    assert.match(workspace, /function resourceSaveSnapshot\(\)/);
    assert.match(workspace, /if \(!label && !url\) return false/);
    assert.match(workspace, /else if \(!safeLink\(url\)\)/);
    assert.match(workspace, /if \(prepared\.issues\.length\)[\s\S]*return Promise\.resolve\(false\)/);
    assert.match(workspace, /saveTemplate\(prepared\.snapshot\)/);
    assert.match(workspace, /saveExistingExecution\(prepared\.snapshot\)/);
    assert.match(workspace, /restorePhaseDisclosures\(expanded\)/);
    assert.match(workspace, /aria-invalid/);
    assert.match(workspace, /aria-describedby/);
});

test('Template draft recovery is injected, synchronous and central without a second storage boundary', async () => {
    const [app, workspace, service] = await Promise.all([
        read('src/js/app.js'), read('src/js/editor-workspace.mjs'),
        read('src/js/editor-template-draft-recovery-service.mjs'),
    ]);
    assert.match(app, /createEditorDraftRecoveryStore\(localStorage\)/);
    assert.match(app, /templateRecovery: editorTemplateDraftRecovery/);
    assert.doesNotMatch(service, /localStorage|sessionStorage|indexedDB|caches/);
    assert.match(service, /store\.create\(candidate\)/);
    assert.match(service, /store\.update\(candidate, session\.record\.savedAt\)/);
    assert.match(workspace, /function checkpointTemplateDraft\(next\)/);
    assert.match(workspace, /onDraftChange: checkpointTemplateDraft/);
    assert.match(workspace, /checkpointTemplateDraft\(repositionNativeDraftPhase/);
    assert.match(workspace, /checkpointTemplateDraft\(insertNativeDraftPhase/);
    assert.match(workspace, /checkpointTemplateDraft\(editNativePhaseDraft/);
    assert.match(workspace, /dataset\.templateRecoveryWarning/);
    assert.match(workspace, /templateRecovery\.list\(workspace\)/);
    assert.match(workspace, /templateRecovery\.adopt\(/);
    assert.match(workspace, /templateRecovery\?\.checkpointPending\(pending\)/);
    assert.match(workspace, /templateRecovery\.resolveAbsent\(\)/);
    assert.match(workspace, /templateRecovery\.discardCurrent\(\)/);
    assert.match(workspace, /templateRecovery\?\.cleanup\(\)/);
    assert.doesNotMatch(workspace, /localStorage|sessionStorage|indexedDB|caches/);
});

test('public native entry and Picker orchestration retain identity, ownership and unresolved-operation guards', async () => {
    const app = await read('src/js/app.js');
    assert.match(app, /function activeBinding\(record\)/);
    assert.match(app, /!editorActiveLock\.held/);
    assert.match(app, /next\.execution\.id !== current\.execution\.id/);
    assert.match(app, /isFirstStartTransitionInRecord/);
    assert.match(app, /attemptChanged && !isFirstStartTransitionInRecord\(current\.record, next\.record\)/);
    assert.match(app, /next\.runtime\.run\.runId !== current\.runtime\.run\.runId/);
    assert.match(app, /let pickerBusy = false/);
    assert.match(app, /let pickerLoadRevision = 0/);
    assert.match(app, /loadRevision !== pickerLoadRevision \|\| expectedNavigationRevision !== navigationRevision/);
    assert.match(app, /next\.record\.revision < current\.record\.revision/);
    assert.match(app, /next\.runtime\.runtimeRevision < current\.runtime\.runtimeRevision/);
    assert.match(app, /function installConfirmedSessionAction\(record, sourceRecord, options\)/);
    assert.match(app, /const expected = applyStartedSessionActionInRecord\(sourceRecord, options\)/);
    assert.match(app, /JSON\.stringify\(record\) !== JSON\.stringify\(expected\)/);
    assert.match(app, /installNativeRecordWithAuthority\(record, true\)/);
    assert.match(app, /export function installNativeRecord\(record\) \{\s*return installNativeRecordWithAuthority\(record\);/);
    assert.match(app, /const sourceRecord = structuredClone\(nativeRuntime\.record\);[\s\S]*applySessionAction\(sessionAction\)[\s\S]*installConfirmedSessionAction\(record, sourceRecord, sessionAction\)/);
    assert.match(app, /lockRequestUnconfirmed/);
    assert.match(app, /if \(!kind \|\| !id \|\| !pickerWorkspace \|\| pickerPending \|\| pickerBusy\) return/);
    assert.match(app, /if \(nativeExit \|\| pickerBusy \|\| pickerPending\)/);
    assert.match(app, /reconcilePendingActivation/);
    assert.match(app, /reconcilePendingOperation/);
    assert.doesNotMatch(app, /catch[\s\S]{0,120}launchTemplateToReady\(/,
        'uncertain launch handling must not retry the mutation');
});

test('central styles isolate hidden primary views and the app shell advances together', async () => {
    const [css, html, worker] = await Promise.all([
        read('src/css/styles.css'), read('src/index.html'), read('src/service-worker.js'),
    ]);
    assert.match(css, /\.native-editor-workspace/);
    assert.match(css, /\.timer\[hidden\]\s*{\s*display:\s*none;/);
    assert.match(html, /css\/styles\.css\?v=83/);
    assert.match(html, /js\/app\.js\?v=83/);
    assert.match(worker, /easytimer-shell-v83/);
    assert.match(worker, /css\/styles\.css\?v=83/);
    assert.match(worker, /js\/app\.js\?v=83/);
    assert.match(worker, /js\/editor-workspace\.mjs/);
    assert.match(worker, /js\/editor-draft-recovery\.mjs/);
    assert.match(worker, /js\/editor-template-draft-recovery-service\.mjs/);
    assert.doesNotMatch(worker, /planner-v1|planner\.js|portability\.mjs\?v=37/);
});

test('Home is a presentation-only entry with guarded native lifecycle returns', async () => {
    const [app, html, workspace, info] = await Promise.all([
        read('src/js/app.js'), read('src/index.html'), read('src/js/editor-workspace.mjs'), read('src/js/info.js'),
    ]);
    assert.match(app, /let homeOpen = false/);
    assert.match(app, /!nativeRuntime && !recovery\.restored && !savedView/);
    assert.match(app, /if \(!homeOpen && !nativeRuntime && !nativeExit/);
    assert.match(app, /homeOpen = true;[\s\S]{0,120}nativeExit = null|nativeExit = null;[\s\S]{0,120}homeOpen = true/);
    assert.match(app, /status: nativeRuntime \? 'success' : 'home'/);
    assert.match(app, /status: nativeRuntime \? 'confirmed' : 'home'/);
    const lifecycle = app.slice(app.indexOf("if (['retainPlan', 'discardExecution', 'completeExecution'].includes(kind))"));
    assert.ok(lifecycle.indexOf("window.confirm(copy[language].switchConfirm)") < lifecycle.indexOf('editorBridge[method](options)'),
        'Quick progress confirmation precedes every SUSPENDED lifecycle write');
    assert.match(lifecycle, /return \{ status: 'cancelled' \}/);
    assert.match(app, /if \(plannerOpen && !closePublicWorkspace\(\)\) return/);
    assert.match(app, /recovery\.pending \|\| recovery\.error/);
    assert.match(html, /id="home-view"/);
    assert.match(html, /id="home-stopwatch"[\s\S]*?disabled/);
    assert.equal((html.match(/class="home-action"/g) ?? []).length, 4);
    assert.match(workspace, /result\.status === 'home'/);
    assert.match(workspace, /onClose\(\{ focus \}\)/);
    assert.match(info, /\['home', 'quick', 'session', 'editor'\]/);
});
