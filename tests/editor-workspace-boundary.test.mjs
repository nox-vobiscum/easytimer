import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('native Workspace remains outside public startup and V1 Planner imports', async () => {
    const [app, planner, html, workspace] = await Promise.all([
        read('src/js/app.js'), read('src/js/planner.js'), read('src/index.html'),
        read('src/js/editor-workspace.mjs'),
    ]);
    for (const source of [app, planner, html]) assert.doesNotMatch(source, /editor-workspace/);
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
    assert.match(workspace, /if \(mutationBlocked\(\)\).*return false/);
});

test('central styles and app shell advance together for the internal Workspace rules', async () => {
    const [css, html, worker] = await Promise.all([
        read('src/css/styles.css'), read('src/index.html'), read('src/service-worker.js'),
    ]);
    assert.match(css, /\.native-editor-workspace/);
    assert.match(html, /css\/styles\.css\?v=72/);
    assert.match(html, /js\/app\.js\?v=72/);
    assert.match(worker, /easytimer-shell-v72/);
    assert.match(worker, /css\/styles\.css\?v=72/);
    assert.match(worker, /js\/app\.js\?v=72/);
});
