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
    assert.doesNotMatch(workspace, /planner-v1|easyTimerTemplates|easyTimerRuntime|localStorage/);
    assert.match(workspace, /createNativeEditorWorkspace/);
});

test('internal Workspace uses reviewed native editing and portability boundaries', async () => {
    const workspace = await read('src/js/editor-workspace.mjs');
    assert.match(workspace, /createNativePhaseFields/);
    assert.match(workspace, /editNativeTemplateDraft/);
    assert.match(workspace, /repositionNativeDraftPhase/);
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
    assert.match(workspace, /if \(mutationBusy \|\| \(pending && !allowPending\)\) return false/);
    assert.match(workspace, /clearEditor\(\{ clearPending: true \}\)/);
    assert.match(workspace, /if \(mutationBlocked\(\)\) return;\s*clearEditor\(\)/);
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
    assert.match(app, /lockRequestUnconfirmed/);
    assert.match(app, /if \(!kind \|\| !id \|\| !pickerWorkspace \|\| pickerPending \|\| pickerBusy\) return/);
    assert.match(app, /if \(nativeExit \|\| pickerBusy \|\| pickerPending\)/);
    assert.match(app, /reconcilePendingActivation/);
    assert.match(app, /reconcilePendingOperation/);
    assert.doesNotMatch(app, /catch[\s\S]{0,120}launchTemplateToReady\(/,
        'uncertain launch handling must not retry the mutation');
});

test('central styles and app shell advance together for the public native Workspace', async () => {
    const [css, html, worker] = await Promise.all([
        read('src/css/styles.css'), read('src/index.html'), read('src/service-worker.js'),
    ]);
    assert.match(css, /\.native-editor-workspace/);
    assert.match(html, /css\/styles\.css\?v=75/);
    assert.match(html, /js\/app\.js\?v=75/);
    assert.match(worker, /easytimer-shell-v75/);
    assert.match(worker, /css\/styles\.css\?v=75/);
    assert.match(worker, /js\/app\.js\?v=75/);
    assert.match(worker, /js\/editor-workspace\.mjs/);
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
