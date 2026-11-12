import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

export async function checkNativeEditorWorkspace({ evaluate, click, cdp }) {
    const press = async (key, code, virtualKey) => {
        await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: virtualKey });
        await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: virtualKey });
    };
    const action = (label, within = '#native-editor-workspace-fixture') => evaluate(`(() => {
        const root = document.querySelector(${JSON.stringify(within)});
        const button = [...root.querySelectorAll('button')].find(node => node.textContent.trim() === ${JSON.stringify(label)});
        if (!button) throw new Error('Missing action: ' + ${JSON.stringify(label)});
        button.click();
    })()`);
    const rowAction = (heading, label) => evaluate(`(() => {
        const row = [...document.querySelectorAll('#native-editor-workspace-fixture .template-library li')]
            .find(node => node.querySelector('h3')?.textContent === ${JSON.stringify(heading)});
        const button = [...row.querySelectorAll('button')].find(node => node.textContent.trim() === ${JSON.stringify(label)});
        if (!button) throw new Error('Missing row action'); button.click();
    })()`);
    const field = (selector, value, event = 'input') => evaluate(`(() => {
        const input = document.querySelector(${JSON.stringify(`#native-editor-workspace-fixture ${selector}`)});
        input.value = ${JSON.stringify(value)}; input.dispatchEvent(new Event(${JSON.stringify(event)}, { bubbles: true }));
    })()`);
    try {
        await cdp('Emulation.setDeviceMetricsOverride', {
            width: 1280, height: 800, screenWidth: 1280, screenHeight: 800, mobile: false, deviceScaleFactor: 1,
        });
        assert.equal(await evaluate(`document.querySelector('[data-native-editor-workspace]')`), null,
            'native Workspace is not publicly activated');
        await evaluate(`(async () => {
            const [workspaceModule, plannerModule, integrationModule, writerModule, storeModule, importModule,
                launchModule, domain, runtimeModule] = await Promise.all([
                import('/js/editor-workspace.mjs'), import('/js/editor-planner-service.mjs'),
                import('/js/editor-template-integration.mjs'), import('/js/editor-storage-lock.mjs'),
                import('/js/editor-storage.mjs'), import('/js/editor-template-import.mjs'), import('/js/editor-launch-service.mjs'),
                import('/js/editor-domain.mjs'), import('/js/execution-runtime.mjs'),
            ]);
            const f = window.nativeWorkspaceFixture = {
                raw: null, writes: 0, keys: [], uncertainOnSet: false, throwReadback: false,
                downloads: [], phase: 0, execution: 0, imported: 0,
                publicState: {
                    mode: document.body.dataset.mode,
                    time: document.querySelector('#time').textContent,
                    plannerOpen: document.body.classList.contains('planner-open'),
                    v1: localStorage.getItem('easyTimerTemplates'),
                },
            };
            const basePlan = {
                name: 'Lifecycle source', category: 'workshop', transitionMode: 'manual',
                preparedInformation: 'Lifecycle information',
                phases: [
                    { id: 'seed-a', title: 'Opening', durationSeconds: 600, category: 'presentation', notes: 'Welcome', resources: [] },
                    { id: 'seed-b', title: 'Work', durationSeconds: 1200, category: 'breakout', notes: '', resources: [] },
                ],
            };
            const template = domain.validateTemplate({ schemaVersion: 2, kind: 'template', id: 'seed-template', revision: 1, plan: basePlan });
            const planned = domain.createPlannedExecution(template, 'planned-seed');
            const active = domain.activatePlannedExecution(domain.createPlannedExecution(template, 'active-seed'));
            const suspended = domain.suspendReadyExecution(domain.activatePlannedExecution(domain.createPlannedExecution(template, 'suspended-seed')));
            const started = domain.startActiveExecution(
                domain.activatePlannedExecution(domain.createPlannedExecution(template, 'completed-seed')),
                'completed-attempt', 1000, 'completed-run',
            );
            const completed = domain.completeStartedExecution(started, {
                completedAt: 1000, workshopOvertimeMs: 0, workshopNotes: { rundown: '', phases: [] },
            });
            f.raw = JSON.stringify(storeModule.validateEditorStoreRecord({
                schemaVersion: 1, revision: 1, templates: [template],
                executions: [
                    { execution: planned, suspendedCheckpoint: null },
                    { execution: active, suspendedCheckpoint: null },
                    { execution: suspended, suspendedCheckpoint: null },
                    { execution: completed, suspendedCheckpoint: null },
                ],
                activeRuntime: runtimeModule.prepareReadyExecutionRuntime(active, 'active-run', 1000),
            }));
            const storage = {
                getItem(key) {
                    if (key !== 'easyTimerEditor.v1') throw new Error('V1 storage access');
                    f.keys.push(key);
                    if (f.throwReadback) { f.throwReadback = false; throw new Error('uncertain'); }
                    return f.raw;
                },
                setItem(key, value) {
                    if (key !== 'easyTimerEditor.v1') throw new Error('V1 storage access');
                    f.keys.push(key); f.writes += 1; f.raw = value;
                    if (f.uncertainOnSet) { f.uncertainOnSet = false; f.throwReadback = true; }
                },
            };
            f.writer = writerModule.createEditorStoreWriter({ getStorage: () => storage, locks: navigator.locks });
            const basePlanner = plannerModule.createNativePlannerService({
                integration: integrationModule.createNativeEditorTemplateIntegration({ writer: f.writer }),
                createId: () => 'template-' + (++f.imported),
            });
            const basePlanned = plannerModule.createNativePlannedExecutionService({ writer: f.writer });
            const baseLaunch = launchModule.createNativeSessionLaunchService({
                writer: f.writer,
                runtimeBridge: { activatePlanned() { throw new Error('runtime side effect'); }, reconcilePendingActivation() { throw new Error('runtime side effect'); } },
                createExecutionId: () => 'execution-' + (++f.execution),
            });
            const baseImporter = importModule.createNativeTemplateImportService({ writer: f.writer, createId: () => 'import-' + (++f.imported) });
            f.calls = { templateSave: 0, templateRecheck: 0, executionSave: 0, plan: 0,
                delete: 0, deleteRecheck: 0, import: 0, importRecheck: 0 };
            f.tickets = {}; f.recheckTickets = {}; f.gates = {};
            f.hold = name => {
                let release; const promise = new Promise(resolve => { release = resolve; });
                f.gates[name] = { promise, release };
            };
            f.waitForGate = async name => { if (f.gates[name]) await f.gates[name].promise; };
            f.release = name => { f.gates[name]?.release(); delete f.gates[name]; };
            const tracked = (owner, method, name, ticketName = name) => async (...args) => {
                f.calls[name] += 1; await f.waitForGate(name);
                const result = await owner[method](...args);
                if (result.reconciliation) f.tickets[ticketName] = result.reconciliation;
                return result;
            };
            f.planner = {
                ...basePlanner,
                saveDraft: tracked(basePlanner, 'saveDraft', 'templateSave'),
                deleteTemplate: tracked(basePlanner, 'deleteTemplate', 'delete'),
                async reconcileSave(ticket) {
                    f.calls.templateRecheck += 1; f.recheckTickets.template = ticket;
                    return basePlanner.reconcileSave(ticket);
                },
                async reconcileDelete(ticket) {
                    f.calls.deleteRecheck += 1; f.recheckTickets.delete = ticket;
                    return basePlanner.reconcileDelete(ticket);
                },
            };
            f.planned = {
                ...basePlanned,
                saveDraft: tracked(basePlanned, 'saveDraft', 'executionSave'),
            };
            f.launch = {
                ...baseLaunch,
                planFromTemplate: tracked(baseLaunch, 'planFromTemplate', 'plan'),
            };
            f.importer = {
                ...baseImporter,
                persistImport: tracked(baseImporter, 'persistImport', 'import'),
                async reconcileImport(ticket) {
                    f.calls.importRecheck += 1; f.recheckTickets.import = ticket;
                    return baseImporter.reconcileImport(ticket);
                },
            };
            f.root = document.createElement('section'); f.root.id = 'native-editor-workspace-fixture';
            document.querySelector('main').append(f.root);
            f.workspace = workspaceModule.createNativeEditorWorkspace({
                root: f.root, plannerService: f.planner, plannedExecutionService: f.planned,
                launchService: f.launch, importService: f.importer,
                createPhaseId: () => 'phase-' + (++f.phase),
                downloadTemplate: file => f.downloads.push(file),
            });
            await f.workspace.open();
        })()`);

        assert.deepEqual(await evaluate(`(() => {
            const root = nativeWorkspaceFixture.root;
            return [root.dataset.nativeEditorWorkspace === '', root.querySelector('h1').textContent,
                [...root.querySelectorAll('h2')].map(node => node.textContent),
                root.textContent.includes('Lifecycle actions are intentionally unavailable'),
                document.querySelector('#open-planner').textContent.includes('Native')];
        })()`), [true, 'Native Editor Workspace', ['Templates', 'Planned executions', 'Active in Timer', 'Suspended', 'Completed'], true, false]);
        assert.deepEqual(await evaluate(`nativeWorkspaceFixture.keys.every(key => key === 'easyTimerEditor.v1')`), true,
            'Workspace reads only native storage');

        await action('Create template');
        await field('[data-field="name"]', 'Independent workshop');
        await field('.native-workspace-control', 'training', 'change');
        await field('[data-field="prepared"]', 'Goals and **plain text**');
        await action('Add phase'); await action('Add phase');
        await field('[data-native-phase-id="phase-1"] [data-field="title"]', 'First phase');
        await field('[data-native-phase-id="phase-1"] [data-field="duration"]', '15');
        await field('[data-native-phase-id="phase-2"] [data-field="title"]', 'Second phase');
        await field('[data-native-phase-id="phase-2"] [data-field="duration"]', '20');
        await click('[data-native-phase-id="phase-1"] [data-action="details"]');
        await field('[data-native-phase-id="phase-1"] [data-field="notes"]', 'Facilitator notes');
        await action('Add resource', '[data-native-phase-id="phase-1"]');
        await field('[data-native-phase-id="phase-1"] input[aria-label="Link label"]', 'Board');
        await field('[data-native-phase-id="phase-1"] input[aria-label="HTTPS or HTTP URL"]', 'https://example.com/board');
        await click('[data-native-phase-id="phase-2"] [data-action="details"]');
        await action('Move earlier', '[data-native-phase-id="phase-2"]');
        assert.deepEqual(await evaluate(`nativeWorkspaceFixture.root.querySelectorAll('[data-native-phase-id]')
            ? [...nativeWorkspaceFixture.root.querySelectorAll('[data-native-phase-id]')].map(row => row.dataset.nativePhaseId) : []`),
        ['phase-2', 'phase-1'], 'phase reorder retains stable IDs');

        await evaluate(`(() => {
            const f = nativeWorkspaceFixture; f.uncertainOnSet = true; f.hold('templateSave');
            const form = f.root.querySelector('form'); form.requestSubmit(); form.requestSubmit();
        })()`);
        await delay(20);
        assert.deepEqual(await evaluate(`(() => {
            const f = nativeWorkspaceFixture;
            return [f.calls.templateSave, f.writes,
                [...f.root.querySelectorAll('button,input,select,textarea')].every(control => control.disabled)];
        })()`), [1, 0, true], 'duplicate Save submit is blocked while the first write is in flight');
        await evaluate(`nativeWorkspaceFixture.release('templateSave')`);
        for (let i = 0; i < 50; i++) {
            if (await evaluate(`nativeWorkspaceFixture.root.textContent.includes('write acknowledgement is uncertain')`)) break;
            await delay(20);
        }
        assert.deepEqual(await evaluate(`(() => {
            const f = nativeWorkspaceFixture;
            return [f.writes, f.root.querySelector('[data-field="name"]').value,
                f.root.textContent.includes('write acknowledgement is uncertain'),
                Boolean([...f.root.querySelectorAll('button')].find(button => button.textContent === 'Recheck without writing'))];
        })()`), [1, 'Independent workshop', true, true], 'uncertain Create retains the full draft');
        await evaluate(`(() => {
            const f = nativeWorkspaceFixture, divergent = structuredClone(f.tickets.templateSave.target);
            divergent.revision += 1; f.raw = JSON.stringify(divergent);
        })()`);
        await action('Recheck without writing');
        for (let i = 0; i < 50; i++) {
            if (await evaluate(`nativeWorkspaceFixture.root.textContent.includes('Recheck is the only available operation')`)) break;
            await delay(20);
        }
        await action('Cancel');
        assert.deepEqual(await evaluate(`(() => {
            const f = nativeWorkspaceFixture, cancel = [...f.root.querySelectorAll('button')]
                .find(button => button.textContent === 'Cancel');
            return [f.writes, f.calls.templateRecheck, f.recheckTickets.template === f.tickets.templateSave,
                f.root.querySelector('[data-field="name"]').value, cancel.disabled,
                !f.root.textContent.includes('Unsaved changes discarded.'),
                !f.workspace.close(), f.root.dataset.nativeEditorWorkspace === ''];
        })()`), [1, 1, true, 'Independent workshop', true, true, true, true],
        'unresolved Template Save blocks Cancel/unmount and preserves the exact draft and ticket');
        await evaluate(`nativeWorkspaceFixture.raw = JSON.stringify(nativeWorkspaceFixture.tickets.templateSave.target)`);
        await action('Recheck without writing');
        for (let i = 0; i < 50; i++) {
            if (await evaluate(`nativeWorkspaceFixture.root.textContent.includes('Saved.')`)) break;
            await delay(20);
        }
        assert.deepEqual(await evaluate(`(() => {
            const f = nativeWorkspaceFixture, record = JSON.parse(f.raw), saved = record.templates.find(item => item.plan.name === 'Independent workshop');
            return [f.writes, Boolean(saved), saved.plan.phases.map(phase => phase.id), saved.plan.phases[1].notes,
                saved.plan.phases[1].resources[0], f.root.textContent.includes('Saved.')];
        })()`), [1, true, ['phase-2', 'phase-1'], 'Facilitator notes',
            { label: 'Board', url: 'https://example.com/board' }, true], 'read-only reconciliation performs no duplicate write');

        await rowAction('Independent workshop', 'Edit');
        const writesBeforeCancel = await evaluate('nativeWorkspaceFixture.writes');
        await field('[data-field="name"]', 'Discarded title');
        await action('Cancel');
        assert.deepEqual(await evaluate(`[
            nativeWorkspaceFixture.writes,
            JSON.parse(nativeWorkspaceFixture.raw).templates.find(item => item.plan.name === 'Independent workshop').plan.name,
        ]`), [writesBeforeCancel, 'Independent workshop'], 'Cancel never persists');

        await rowAction('Independent workshop', 'Create planned execution');
        assert.equal(await evaluate(`nativeWorkspaceFixture.writes`), writesBeforeCancel, 'new Execution remains local before Save');
        await field('[data-field="name"]', 'Independent execution');
        await field('[data-field="prepared"]', 'Execution-only information');
        await evaluate(`(() => {
            const f = nativeWorkspaceFixture; f.uncertainOnSet = true; f.hold('plan');
            const form = f.root.querySelector('form'); form.requestSubmit(); form.requestSubmit();
        })()`);
        await delay(20);
        assert.deepEqual(await evaluate(`[
            nativeWorkspaceFixture.calls.plan,
            nativeWorkspaceFixture.writes,
            nativeWorkspaceFixture.root.querySelector('button[type="submit"]').disabled,
        ]`), [1, writesBeforeCancel, true], 'duplicate submit creates at most one Execution while planning is in flight');
        await evaluate(`nativeWorkspaceFixture.release('plan')`);
        for (let i = 0; i < 50; i++) {
            if (await evaluate(`nativeWorkspaceFixture.root.textContent.includes('write acknowledgement is uncertain')`)) break;
            await delay(20);
        }
        assert.deepEqual(await evaluate(`[
            nativeWorkspaceFixture.writes,
            nativeWorkspaceFixture.root.querySelector('[data-field="name"]').value,
            nativeWorkspaceFixture.root.textContent.includes('write acknowledgement is uncertain'),
        ]`), [writesBeforeCancel + 1, 'Independent execution', true], 'uncertain planning retains local plan edits');
        await action('Recheck without writing');
        assert.deepEqual(await evaluate(`[
            nativeWorkspaceFixture.writes,
            nativeWorkspaceFixture.root.querySelector('[data-field="name"]').value,
            nativeWorkspaceFixture.root.textContent.includes('Execution creation is confirmed'),
        ]`), [writesBeforeCancel + 1, 'Independent execution', true], 'planning recheck observes exact created identity without a write');
        await action('Save');
        assert.deepEqual(await evaluate(`(() => {
            const f = nativeWorkspaceFixture, record = JSON.parse(f.raw);
            const source = record.templates.find(item => item.plan.name === 'Independent workshop');
            const execution = record.executions.find(item => item.execution.currentPlan.name === 'Independent execution').execution;
            return [f.writes, source.plan.preparedInformation, execution.source, execution.currentPlan.preparedInformation,
                execution.lifecycle, record.activeRuntime.executionId];
        })()`), [writesBeforeCancel + 2, 'Goals and **plain text**', { kind: 'template', id: 'template-1' },
            'Execution-only information', 'planned', 'active-seed'], 'Execution Save preserves source Template and active runtime');
        await rowAction('Independent execution', 'Edit');
        await field('[data-field="prepared"]', 'Edited planned information');
        await action('Save');
        assert.equal(await evaluate(`JSON.parse(nativeWorkspaceFixture.raw).executions
            .find(item => item.execution.currentPlan.name === 'Independent execution').execution.currentPlan.preparedInformation`),
        'Edited planned information');

        await rowAction('Independent workshop', 'Edit');
        const writesBeforeInvalid = await evaluate('nativeWorkspaceFixture.writes');
        await field('[data-field="name"]', ''); await action('Save');
        assert.deepEqual(await evaluate(`[
            nativeWorkspaceFixture.writes,
            nativeWorkspaceFixture.root.querySelector('[data-field="name"]').value,
            nativeWorkspaceFixture.root.textContent.includes('invalid fields'),
            [...nativeWorkspaceFixture.root.querySelectorAll('button')].find(button => button.textContent === 'Save').disabled,
            [...nativeWorkspaceFixture.root.querySelectorAll('button')].find(button => button.textContent === 'Cancel').disabled,
        ]`), [writesBeforeInvalid, '', true, false, false],
        'known validation failure retains the draft and releases the local mutation guard');
        await field('[data-field="name"]', 'Stale retained title');
        await evaluate(`nativeWorkspaceFixture.writer.write(record => ({ ...record, revision: record.revision + 1 }))`);
        await action('Save');
        assert.deepEqual(await evaluate(`[
            nativeWorkspaceFixture.root.querySelector('[data-field="name"]').value,
            nativeWorkspaceFixture.root.textContent.includes('changed elsewhere'),
        ]`), ['Stale retained title', true], 'stale aggregate cannot overwrite newer data');
        await action('Cancel');

        await rowAction('Independent workshop', 'Export JSON');
        assert.deepEqual(await evaluate(`(() => {
            const file = nativeWorkspaceFixture.downloads[0], parsed = JSON.parse(file.text);
            return [file.name, parsed.kind, parsed.template.id, parsed.template.plan.name];
        })()`), ['Independent-workshop.json', 'editor-template', 'template-1', 'Independent workshop']);
        await evaluate(`(() => {
            const input = nativeWorkspaceFixture.root.querySelector('input[type="file"]');
            const transfer = new DataTransfer(); transfer.items.add(new File(['not json'], 'invalid.json', { type: 'application/json' }));
            Object.defineProperty(input, 'files', { configurable: true, value: transfer.files });
            input.dispatchEvent(new Event('change', { bubbles: true }));
        })()`);
        for (let i = 0; i < 50; i++) {
            if (await evaluate(`nativeWorkspaceFixture.root.textContent.includes('Choose a JSON file')`)) break;
            await delay(20);
        }
        assert.equal(await evaluate(`nativeWorkspaceFixture.root.textContent.includes('Choose a JSON file')`), true, 'invalid JSON is rejected');
        await evaluate(`(() => {
            const input = nativeWorkspaceFixture.root.querySelector('input[type="file"]');
            const transfer = new DataTransfer(); transfer.items.add(new File([nativeWorkspaceFixture.downloads[0].text], 'valid.json', { type: 'application/json' }));
            Object.defineProperty(input, 'files', { configurable: true, value: transfer.files });
            input.dispatchEvent(new Event('change', { bubbles: true }));
        })()`);
        for (let i = 0; i < 50; i++) {
            if (await evaluate(`nativeWorkspaceFixture.root.textContent.includes('Review import')`)) break;
            await delay(20);
        }
        const writesBeforeImport = await evaluate('nativeWorkspaceFixture.writes');
        await evaluate(`nativeWorkspaceFixture.uncertainOnSet = true`);
        await action('Import copy');
        for (let i = 0; i < 50; i++) {
            if (await evaluate(`nativeWorkspaceFixture.root.textContent.includes('write acknowledgement is uncertain')`)) break;
            await delay(20);
        }
        await evaluate(`(() => {
            const f = nativeWorkspaceFixture, divergent = structuredClone(f.tickets.import.target);
            divergent.revision += 1; f.raw = JSON.stringify(divergent);
        })()`);
        await action('Recheck without writing');
        for (let i = 0; i < 50; i++) {
            if (await evaluate(`nativeWorkspaceFixture.root.textContent.includes('Recheck is the only available operation')`)) break;
            await delay(20);
        }
        await action('Cancel import');
        assert.deepEqual(await evaluate(`(() => {
            const f = nativeWorkspaceFixture, cancel = [...f.root.querySelectorAll('button')]
                .find(button => button.textContent === 'Cancel import');
            return [f.writes, f.calls.import, f.calls.importRecheck,
                f.recheckTickets.import === f.tickets.import, cancel.disabled,
                f.root.textContent.includes('Review import'), !f.root.textContent.includes('Template copy imported.')];
        })()`), [writesBeforeImport + 1, 1, 1, true, true, true, true],
        'unresolved Import retains its candidate/ticket and blocks cancellation without another write');
        await evaluate(`nativeWorkspaceFixture.raw = JSON.stringify(nativeWorkspaceFixture.tickets.import.target)`);
        await action('Recheck without writing');
        for (let i = 0; i < 50; i++) {
            if (await evaluate(`nativeWorkspaceFixture.root.textContent.includes('Template copy imported.')`)) break;
            await delay(20);
        }
        assert.equal(await evaluate(`JSON.parse(nativeWorkspaceFixture.raw).templates.filter(item => item.plan.name === 'Independent workshop').length`), 2,
            'single-template import creates an independent copy');

        await rowAction('Independent workshop', 'Delete');
        assert.equal(await evaluate(`document.activeElement.textContent.trim()`), 'Keep Template', 'dialog focuses safe action');
        await press('Escape', 'Escape', 27);
        assert.deepEqual(await evaluate(`(() => {
            const dialog = nativeWorkspaceFixture.root.querySelector('dialog');
            return [dialog.open, document.activeElement.textContent.trim()];
        })()`), [false, 'Delete'], 'Escape closes dialog and restores trigger focus');
        const writesBeforeDelete = await evaluate('nativeWorkspaceFixture.writes');
        await rowAction('Independent workshop', 'Delete');
        await evaluate(`nativeWorkspaceFixture.uncertainOnSet = true`);
        await action('Delete Template', '[data-native-dialog]');
        for (let i = 0; i < 50; i++) {
            if (await evaluate(`nativeWorkspaceFixture.root.textContent.includes('write acknowledgement is uncertain')`)) break;
            await delay(20);
        }
        await evaluate(`(() => {
            const f = nativeWorkspaceFixture, divergent = structuredClone(f.tickets.delete.target);
            divergent.revision += 1; f.raw = JSON.stringify(divergent);
        })()`);
        await action('Recheck without writing');
        for (let i = 0; i < 50; i++) {
            if (await evaluate(`nativeWorkspaceFixture.root.textContent.includes('Recheck is the only available operation')`)) break;
            await delay(20);
        }
        assert.deepEqual(await evaluate(`(() => {
            const f = nativeWorkspaceFixture;
            const enabled = [...f.root.querySelectorAll('button,input,select,textarea')].filter(control => !control.disabled);
            return [f.writes, f.calls.delete, f.calls.deleteRecheck,
                f.recheckTickets.delete === f.tickets.delete,
                enabled.length, enabled[0]?.textContent, !f.root.textContent.includes('Template deleted.')];
        })()`), [writesBeforeDelete + 1, 1, 1, true, 1, 'Recheck without writing', true],
        'unresolved Delete retains its ticket and exposes only read-only Recheck');
        await evaluate(`nativeWorkspaceFixture.raw = JSON.stringify(nativeWorkspaceFixture.tickets.delete.target)`);
        await action('Recheck without writing');
        for (let i = 0; i < 50; i++) {
            if (await evaluate(`nativeWorkspaceFixture.root.textContent.includes('Template deleted.')`)) break;
            await delay(20);
        }
        assert.equal(await evaluate(`JSON.parse(nativeWorkspaceFixture.raw).templates.some(item => item.id === 'template-1')`), false,
            'confirmed delete removes only selected Template');
        assert.equal(await evaluate(`JSON.parse(nativeWorkspaceFixture.raw).executions.some(item => item.execution.source?.id === 'template-1')`), true,
            'existing Execution remains independent after source deletion');

        await evaluate(`nativeWorkspaceFixture.workspace.setLanguage('de')`);
        assert.deepEqual(await evaluate(`[
            nativeWorkspaceFixture.root.querySelector('h1').textContent,
            [...nativeWorkspaceFixture.root.querySelectorAll('h2')].map(node => node.textContent).slice(0, 5),
        ]`), ['Nativer Editor-Arbeitsbereich', ['Vorlagen', 'Geplante Durchführungen', 'Im Timer aktiv', 'Unterbrochen', 'Abgeschlossen']]);
        await evaluate(`nativeWorkspaceFixture.workspace.setLanguage('en')`);

        for (const [width, height, mobile] of [[320, 640, true], [568, 320, true]]) {
            await cdp('Emulation.setDeviceMetricsOverride', {
                width, height, screenWidth: width, screenHeight: height, mobile, deviceScaleFactor: 1,
            });
            assert.equal(await evaluate(`(() => {
                const root = nativeWorkspaceFixture.root;
                return document.documentElement.scrollWidth <= innerWidth
                    && [...root.querySelectorAll('button,input,select,textarea')].filter(node => !node.hidden).every(node => {
                        const rect = node.getBoundingClientRect();
                        return rect.width >= 44 && rect.height >= 44 && rect.left >= 0 && rect.right <= innerWidth;
                    });
            })()`), true, `Workspace controls fit ${width}x${height}`);
        }
        await cdp('Emulation.clearDeviceMetricsOverride');
        assert.deepEqual(await evaluate(`(() => {
            const f = nativeWorkspaceFixture; f.workspace.close();
            return [f.root.childElementCount, f.root.hasAttribute('data-native-editor-workspace'),
                document.body.dataset.mode, document.querySelector('#time').textContent,
                document.body.classList.contains('planner-open'), localStorage.getItem('easyTimerTemplates') === f.publicState.v1];
        })()`), [0, false, 'quick', '00:00', false, true], 'unmount preserves public Quick/V1 state');
        console.log('PASS: internally mounted native Workspace; shared lifecycle library, Template CRUD, planned Execution creation/editing, phase content, single-template portability, explicit-only persistence, stale/uncertain reconciliation safety, DE/EN, dialog focus/Escape, mobile portrait/landscape, no V1 or Runtime effects.');
    } finally {
        await cdp('Emulation.clearDeviceMetricsOverride').catch(() => {});
        await evaluate(`(() => {
            const f = window.nativeWorkspaceFixture;
            f?.workspace?.close(); f?.root?.remove(); delete window.nativeWorkspaceFixture;
        })()`).catch(() => {});
    }
}
