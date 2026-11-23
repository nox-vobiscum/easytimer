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
    const recoveryWriteCount = () => evaluate(`nativeWorkspaceFixture.recoveryCalls
        .filter(([operation]) => operation === 'set').length`);
    const recoveryState = () => evaluate(`(() => {
        const f = nativeWorkspaceFixture;
        return {
            writes: f.recoveryCalls.filter(([operation]) => operation === 'set').length,
            record: JSON.parse([...f.recoveryValues.values()].at(-1)),
        };
    })()`);
    const expectRecoveryCheckpoint = async (before, project, expected, message) => {
        const state = await recoveryState();
        assert.equal(state.writes, before + 1, `${message}: one synchronous Recovery write`);
        assert.deepEqual(project(state.record.draft.template), expected, message);
    };
    let recoveryWritesBefore;
    try {
        await cdp('Emulation.setDeviceMetricsOverride', {
            width: 1280, height: 800, screenWidth: 1280, screenHeight: 800, mobile: false, deviceScaleFactor: 1,
        });
        assert.equal(await evaluate(`document.querySelector('[data-native-editor-workspace]')`), null,
            'public native Workspace remains unmounted until requested');
        await evaluate(`(async () => {
            const [workspaceModule, plannerModule, integrationModule, writerModule, storeModule, importModule,
                launchModule, domain, runtimeModule, recoveryStoreModule, recoveryServiceModule] = await Promise.all([
                import('/js/editor-workspace.mjs'), import('/js/editor-planner-service.mjs'),
                import('/js/editor-template-integration.mjs'), import('/js/editor-storage-lock.mjs'),
                import('/js/editor-storage.mjs'), import('/js/editor-template-import.mjs'), import('/js/editor-launch-service.mjs'),
                import('/js/editor-domain.mjs'), import('/js/execution-runtime.mjs'),
                import('/js/editor-draft-recovery.mjs'), import('/js/editor-template-draft-recovery-service.mjs'),
            ]);
            const f = window.nativeWorkspaceFixture = {
                raw: null, writes: 0, keys: [], uncertainOnSet: false, throwReadback: false,
                downloads: [], closeCalls: [], phase: 0, execution: 0, imported: 0,
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
            f.recoveryValues = new Map(); f.recoveryCalls = []; f.recoveryIdentity = 0;
            const recoveryStorage = {
                get length() { return f.recoveryValues.size; },
                key(index) { return [...f.recoveryValues.keys()][index] ?? null; },
                getItem(key) {
                    f.recoveryCalls.push(['get', key]);
                    if (f.recoveryReadFailures > 0) {
                        f.recoveryReadFailures -= 1; throw new Error('recovery read failure');
                    }
                    if (f.recoveryThrowReadback) { f.recoveryThrowReadback = false; throw new Error('recovery readback failure'); }
                    return f.recoveryValues.get(key) ?? null;
                },
                setItem(key, value) {
                    f.recoveryCalls.push(['set', key]);
                    f.recoveryValues.set(key, value);
                    if (f.recoveryUnconfirmedOnSet) {
                        f.recoveryUnconfirmedOnSet = false; f.recoveryThrowReadback = true;
                    }
                },
                removeItem(key) {
                    f.recoveryCalls.push(['remove', key]);
                    if (f.recoveryFailRemove) { f.recoveryFailRemove = false; throw new Error('recovery remove failure'); }
                    f.recoveryValues.delete(key);
                    if (f.recoveryUnconfirmedRemove) {
                        f.recoveryUnconfirmedRemove = false; f.recoveryReadFailures = 2;
                    }
                },
            };
            f.recoveryErrors = [];
            const baseRecoveryStore = recoveryStoreModule.createEditorDraftRecoveryStore(recoveryStorage);
            f.recoveryStore = baseRecoveryStore;
            f.recoveryServiceFactory = recoveryServiceModule.createNativeTemplateDraftRecoveryService;
            const recoveryStore = {
                create(record) {
                    try { return baseRecoveryStore.create(record); }
                    catch (error) { f.recoveryErrors.push(error.message); throw error; }
                },
                update(record, expectedSavedAt) {
                    try { return baseRecoveryStore.update(record, expectedSavedAt); }
                    catch (error) { f.recoveryErrors.push(error.message); throw error; }
                },
                read(recoveryId) {
                    if (f.recoveryFailServiceReadOnce) {
                        f.recoveryFailServiceReadOnce = false;
                        throw new DOMException('Recovery storage access denied.', 'SecurityError');
                    }
                    return baseRecoveryStore.read(recoveryId);
                },
                list() { return baseRecoveryStore.list(); },
                remove(recoveryId, expectedSavedAt) {
                    try { return baseRecoveryStore.remove(recoveryId, expectedSavedAt); }
                    catch (error) { f.recoveryErrors.push(error.message); throw error; }
                },
            };
            f.templateRecovery = recoveryServiceModule.createNativeTemplateDraftRecoveryService({
                store: recoveryStore,
                createId: kind => kind + '-' + (++f.recoveryIdentity),
                now: () => 1000,
            });
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
                async loadWorkspace() {
                    if (f.failWorkspaceLoadOnce) {
                        f.failWorkspaceLoadOnce = false;
                        return { status: 'error', error: { type: 'storage', code: 'storageRead' } };
                    }
                    return basePlanner.loadWorkspace();
                },
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
            f.mountWorkspace = async () => {
                f.root = document.createElement('section'); f.root.id = 'native-editor-workspace-fixture';
                document.querySelector('main').append(f.root);
                f.workspace = workspaceModule.createNativeEditorWorkspace({
                    root: f.root, plannerService: f.planner, plannedExecutionService: f.planned,
                    launchService: f.launch, importService: f.importer,
                    templateRecovery: f.templateRecovery,
                    createPhaseId: () => 'phase-' + (++f.phase),
                    downloadTemplate: file => f.downloads.push(file),
                    onClose: options => f.closeCalls.push(options),
                });
                await f.workspace.open();
            };
            f.reloadWorkspace = async () => { f.root.remove(); f.templateRecovery.deactivate(); await f.mountWorkspace(); };
            await f.mountWorkspace();
        })()`);

        assert.deepEqual(await evaluate(`(() => {
            const root = nativeWorkspaceFixture.root;
            return [root.dataset.nativeEditorWorkspace === '', root.querySelector('h1').textContent,
                [...root.querySelectorAll('h2')].map(node => node.textContent),
                root.textContent.includes('Lifecycle actions are intentionally unavailable'),
                document.querySelector('#open-planner').textContent.includes('Native')];
        })()`), [true, 'Session Editor', ['Templates', 'Planned executions', 'Active in Timer', 'Suspended', 'Completed'], false, false]);
        assert.deepEqual(await evaluate(`nativeWorkspaceFixture.keys.every(key => key === 'easyTimerEditor.v1')`), true,
            'Workspace reads only native storage');
        assert.equal(await evaluate(`nativeWorkspaceFixture.recoveryValues.size`), 0,
            'opening the library alone creates no draft recovery entry');

        await rowAction('Lifecycle source', 'Edit');
        assert.equal(await evaluate(`nativeWorkspaceFixture.recoveryValues.size`), 0,
            'opening an existing Template without changing it creates no recovery entry');
        await action('Cancel');

        await action('Back');
        assert.deepEqual(await evaluate(`[
            nativeWorkspaceFixture.root.dataset.nativeEditorWorkspace,
            nativeWorkspaceFixture.closeCalls.length,
            nativeWorkspaceFixture.closeCalls[0]?.focus,
        ]`), [undefined, 1, 'menu'], 'Back from the Library closes through the host callback');
        await evaluate(`nativeWorkspaceFixture.workspace.open(); window.nativeWorkspaceConfirm = window.confirm; window.confirm = () => true`);
        await action('Create template'); await action('Cancel'); await action('Back');
        assert.deepEqual(await evaluate(`[
            nativeWorkspaceFixture.root.dataset.nativeEditorWorkspace,
            nativeWorkspaceFixture.closeCalls.length,
        ]`), [undefined, 2], 'Back closes after a cancelled new Template draft');
        await evaluate(`nativeWorkspaceFixture.workspace.open(); window.confirm = window.nativeWorkspaceConfirm`);
        await action('Create template'); await field('[data-field="name"]', 'Keep this draft');
        await evaluate(`window.nativeWorkspaceConfirm = window.confirm; window.confirm = () => false`);
        await action('Back');
        assert.deepEqual(await evaluate(`[
            nativeWorkspaceFixture.root.querySelector('[data-field="name"]').value,
            nativeWorkspaceFixture.closeCalls.length,
            nativeWorkspaceFixture.root.dataset.nativeEditorWorkspace,
        ]`), ['Keep this draft', 2, ''], 'rejected Back confirmation preserves the complete draft and view');
        await evaluate(`window.confirm = () => true`); await action('Back');
        assert.deepEqual(await evaluate(`[
            nativeWorkspaceFixture.root.dataset.nativeEditorWorkspace,
            nativeWorkspaceFixture.closeCalls.length,
        ]`), [undefined, 3], 'accepted Back confirmation closes the dirty Workspace');
        await evaluate(`window.confirm = window.nativeWorkspaceConfirm; delete window.nativeWorkspaceConfirm; nativeWorkspaceFixture.workspace.open()`);

        await action('Create template');
        assert.deepEqual(await evaluate(`(() => {
            const f = nativeWorkspaceFixture;
            const record = JSON.parse([...f.recoveryValues.values()].at(-1));
            return [f.recoveryValues.size, record.draft.mode, record.draft.template.name,
                record.baseline.template.name, record.state, f.writes];
        })()`), [1, 'create', '', '', 'draft', 0],
        'new Template begin synchronously checkpoints the complete draft without an authoritative write');
        recoveryWritesBefore = await recoveryWriteCount();
        await field('[data-field="name"]', 'Independent workshop');
        await expectRecoveryCheckpoint(recoveryWritesBefore, plan => plan.name, 'Independent workshop',
            'name input checkpoints immediately');
        assert.deepEqual(await evaluate(`(() => {
            const f = nativeWorkspaceFixture;
            const record = JSON.parse([...f.recoveryValues.values()].at(-1));
            return [record.draft.template.name, record.baseline.template.name, f.writes];
        })()`), ['Independent workshop', '', 0],
        'each input checkpoint is synchronous, monotone and isolated from the authoritative Store');
        assert.deepEqual(await evaluate(`(() => {
            const f = nativeWorkspaceFixture, input = f.root.querySelector('[data-field="name"]');
            input.focus(); input.renderIdentity = 'unchanged-language';
            f.workspace.setLanguage('en');
            const current = f.root.querySelector('[data-field="name"]');
            return [current === input, current.renderIdentity, current.value, document.activeElement === current];
        })()`), [true, 'unchanged-language', 'Independent workshop', true],
        'unchanged language does not rerender, steal focus or replace the draft input');
        assert.deepEqual(await evaluate(`(() => {
            const f = nativeWorkspaceFixture; f.workspace.setLanguage('de');
            const input = f.root.querySelector('[data-field="name"]');
            const result = [input.value, f.root.querySelector('h1').textContent, document.activeElement === f.root.querySelector('h1')];
            f.workspace.setLanguage('en'); return result;
        })()`), ['Independent workshop', 'Session-Editor', true],
        'a real language change rerenders localized UI while preserving the complete draft');
        recoveryWritesBefore = await recoveryWriteCount();
        await field('.native-workspace-control', 'training', 'change');
        await expectRecoveryCheckpoint(recoveryWritesBefore, plan => plan.category, 'training',
            'Rundown category checkpoints immediately');
        recoveryWritesBefore = await recoveryWriteCount();
        await click('[name="native-transition"][value="automatic"]');
        await expectRecoveryCheckpoint(recoveryWritesBefore, plan => plan.transitionMode, 'automatic',
            'transition mode checkpoints immediately');
        recoveryWritesBefore = await recoveryWriteCount();
        await field('[data-field="prepared"]', 'Goals and **plain text**');
        await expectRecoveryCheckpoint(recoveryWritesBefore, plan => plan.preparedInformation, 'Goals and **plain text**',
            'prepared information checkpoints immediately');
        await evaluate(`(() => {
            const f = nativeWorkspaceFixture;
            f.phaseFocusProbe = {
                viewportDescriptor: Object.getOwnPropertyDescriptor(window, 'visualViewport'),
                scrollBy: window.scrollBy,
                bounds: HTMLElement.prototype.getBoundingClientRect,
                scrolls: [], top: 100,
            };
            Object.defineProperty(window, 'visualViewport', { configurable: true, value: undefined });
            window.scrollBy = options => {
                f.phaseFocusProbe.scrolls.push(options);
                f.phaseFocusProbe.top -= options.top;
            };
            HTMLElement.prototype.getBoundingClientRect = function () {
                if (this.matches?.('[data-field="title"]')) {
                    const top = f.phaseFocusProbe.top;
                    return { top, bottom: top + 44, left: 0, right: 200, width: 200, height: 44, x: 0, y: top };
                }
                return f.phaseFocusProbe.bounds.call(this);
            };
        })()`);
        recoveryWritesBefore = await recoveryWriteCount();
        await action('Add phase');
        await expectRecoveryCheckpoint(recoveryWritesBefore, plan => plan.phases.map(phase => phase.id), ['phase-1'],
            'adding a phase checkpoints immediately');
        assert.deepEqual(await evaluate(`(() => {
            const f = nativeWorkspaceFixture;
            return [document.activeElement === f.root.querySelector('[data-native-phase-id="phase-1"] [data-field="title"]'),
                f.phaseFocusProbe.scrolls.length, f.writes];
        })()`), [true, 0, 0], 'visible new title focuses synchronously without scrolling and without persistence');
        await evaluate(`nativeWorkspaceFixture.phaseFocusProbe.top = 900`);
        await action('Add phase');
        assert.deepEqual(await evaluate(`(() => {
            const f = nativeWorkspaceFixture, bounds = f.root
                .querySelector('[data-native-phase-id="phase-2"] [data-field="title"]').getBoundingClientRect();
            return [document.activeElement === f.root.querySelector('[data-native-phase-id="phase-2"] [data-field="title"]'),
                f.phaseFocusProbe.scrolls.length, f.phaseFocusProbe.scrolls[0].top,
                bounds.top >= 0 && bounds.bottom <= innerHeight, f.writes];
        })()`), [true, 1, 522, true, 0], 'offscreen new title uses innerHeight fallback and becomes visible without persistence');
        await evaluate(`(() => {
            const f = nativeWorkspaceFixture, viewport = new EventTarget();
            viewport.height = 300; viewport.offsetTop = 100; f.phaseFocusProbe.viewport = viewport;
            f.phaseFocusProbe.top = 500;
            Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
            f.phaseFocusProbe.resizeDuringFocus = event => {
                if (!event.target.matches?.('[data-native-phase-id="phase-3"] [data-field="title"]')) return;
                document.removeEventListener('focusin', f.phaseFocusProbe.resizeDuringFocus);
                viewport.height = 100; viewport.offsetTop = 300; viewport.dispatchEvent(new Event('resize'));
            };
            document.addEventListener('focusin', f.phaseFocusProbe.resizeDuringFocus);
        })()`);
        await action('Add phase');
        assert.deepEqual(await evaluate(`(() => {
            const f = nativeWorkspaceFixture, viewport = f.phaseFocusProbe.viewport, bounds = f.root
                .querySelector('[data-native-phase-id="phase-3"] [data-field="title"]').getBoundingClientRect();
            return [document.activeElement === f.root.querySelector('[data-native-phase-id="phase-3"] [data-field="title"]'),
                f.phaseFocusProbe.scrolls.length, f.phaseFocusProbe.scrolls[1].top,
                bounds.top >= viewport.offsetTop && bounds.bottom <= viewport.offsetTop + viewport.height, f.writes];
        })()`), [true, 2, 172, true, 0], 'resize during synchronous focus uses the current visual viewport and does not persist');
        await delay(40);
        await evaluate(`nativeWorkspaceFixture.phaseFocusProbe.viewport.dispatchEvent(new Event('resize'))`);
        await delay(40);
        assert.deepEqual(await evaluate(`(() => {
            const f = nativeWorkspaceFixture, viewport = f.phaseFocusProbe.viewport, bounds = f.root
                .querySelector('[data-native-phase-id="phase-3"] [data-field="title"]').getBoundingClientRect();
            return [f.phaseFocusProbe.scrolls.length,
                bounds.top >= viewport.offsetTop && bounds.bottom <= viewport.offsetTop + viewport.height];
        })()`), [2, true], 'focus-time keyboard resize performs one correction, ignores later resize and restores visibility');
        await click('[data-native-phase-id="phase-3"] [data-action="details"]');
        recoveryWritesBefore = await recoveryWriteCount();
        await action('Remove phase', '[data-native-phase-id="phase-3"]');
        await expectRecoveryCheckpoint(recoveryWritesBefore, plan => plan.phases.map(phase => phase.id), ['phase-1', 'phase-2'],
            'removing a phase checkpoints immediately');
        await evaluate(`nativeWorkspaceFixture.phaseFocusProbe.top = 500`);
        await action('Add phase');
        await evaluate(`(() => {
            const f = nativeWorkspaceFixture;
            f.workspace.setLanguage('de'); f.workspace.setLanguage('en');
            f.phaseFocusProbe.viewport.dispatchEvent(new Event('resize'));
        })()`);
        await delay(40);
        assert.equal(await evaluate(`nativeWorkspaceFixture.phaseFocusProbe.scrolls.length`), 3,
            'rerender cancels the pending correction for the disconnected title');
        await click('[data-native-phase-id="phase-4"] [data-action="details"]');
        await action('Remove phase', '[data-native-phase-id="phase-4"]');
        await evaluate(`(() => {
            const f = nativeWorkspaceFixture, probe = f.phaseFocusProbe;
            document.removeEventListener('focusin', probe.resizeDuringFocus);
            window.scrollBy = probe.scrollBy; HTMLElement.prototype.getBoundingClientRect = probe.bounds;
            if (probe.viewportDescriptor) Object.defineProperty(window, 'visualViewport', probe.viewportDescriptor);
            else delete window.visualViewport;
            delete f.phaseFocusProbe;
        })()`);
        recoveryWritesBefore = await recoveryWriteCount();
        await field('[data-native-phase-id="phase-1"] [data-field="title"]', 'First phase');
        await expectRecoveryCheckpoint(recoveryWritesBefore, plan => plan.phases[0].title, 'First phase',
            'phase title checkpoints immediately');
        recoveryWritesBefore = await recoveryWriteCount();
        await field('[data-native-phase-id="phase-1"] [data-field="duration"]', '1x');
        await expectRecoveryCheckpoint(recoveryWritesBefore, plan => plan.phases[0].durationSeconds, '1x',
            'incomplete phase duration checkpoints immediately');
        recoveryWritesBefore = await recoveryWriteCount();
        await field('[data-native-phase-id="phase-1"] [data-field="duration"]', '15');
        await expectRecoveryCheckpoint(recoveryWritesBefore, plan => plan.phases[0].durationSeconds, 900,
            'valid phase duration checkpoints immediately');
        recoveryWritesBefore = await recoveryWriteCount();
        await field('[data-native-phase-id="phase-2"] [data-field="title"]', 'Second phase');
        await expectRecoveryCheckpoint(recoveryWritesBefore, plan => plan.phases[1].title, 'Second phase',
            'second phase title checkpoints immediately');
        recoveryWritesBefore = await recoveryWriteCount();
        await field('[data-native-phase-id="phase-2"] [data-field="duration"]', '20');
        await expectRecoveryCheckpoint(recoveryWritesBefore, plan => plan.phases[1].durationSeconds, 1200,
            'second phase duration checkpoints immediately');
        await click('[data-native-phase-id="phase-1"] [data-action="category"]');
        assert.deepEqual(await evaluate(`(() => {
            const f = nativeWorkspaceFixture, row = f.root.querySelector('[data-native-phase-id="phase-1"]');
            return [row.querySelector('[data-action="details"]').getAttribute('aria-expanded'),
                row.querySelector('[data-action="category"]').getAttribute('aria-expanded'),
                [...row.querySelectorAll('[data-category]')].map(button => button.textContent),
                row.querySelector('[data-category="uncategorized"]').getAttribute('aria-pressed'), f.writes];
        })()`), ['false', 'true', ['Uncategorized', 'Presentation', 'Discussion', 'Breakout', 'Break'], 'true', 0],
        'collapsed inline category popover is complete, selected and write-free');
        recoveryWritesBefore = await recoveryWriteCount();
        await click('[data-native-phase-id="phase-1"] [data-category="discussion"]');
        await expectRecoveryCheckpoint(recoveryWritesBefore, plan => plan.phases[0].category, 'discussion',
            'phase category checkpoints immediately');
        assert.deepEqual(await evaluate(`(() => {
            const f = nativeWorkspaceFixture, row = f.root.querySelector('[data-native-phase-id="phase-1"]');
            const trigger = row.querySelector('[data-action="category"]');
            return [trigger.getAttribute('aria-label'), trigger.getAttribute('aria-expanded'),
                document.activeElement === trigger,
                row.querySelector('[data-action="details"]').getAttribute('aria-expanded'), f.writes];
        })()`), ['Phase category: Discussion', 'false', true, 'false', 0],
        'category selection updates only the local draft, closes independently and restores focus');
        await click('[data-native-phase-id="phase-1"] [data-action="details"]');
        await click('[data-native-phase-id="phase-2"] [data-action="details"]');
        recoveryWritesBefore = await recoveryWriteCount();
        await field('[data-native-phase-id="phase-1"] [data-field="notes"]', 'Facilitator notes');
        await expectRecoveryCheckpoint(recoveryWritesBefore, plan => plan.phases[0].notes, 'Facilitator notes',
            'phase notes checkpoint immediately');
        recoveryWritesBefore = await recoveryWriteCount();
        await action('Add resource', '[data-native-phase-id="phase-1"]');
        await expectRecoveryCheckpoint(recoveryWritesBefore, plan => plan.phases[0].resources, [{ label: '', url: '' }],
            'adding a resource checkpoints immediately');
        assert.deepEqual(await evaluate(`(() => {
            const root = nativeWorkspaceFixture.root, phase = root.querySelector('[data-native-phase-id="phase-1"]');
            return [
                phase.querySelector('[data-action="details"]').getAttribute('aria-expanded'),
                root.querySelector('[data-native-phase-id="phase-2"] [data-action="details"]').getAttribute('aria-expanded'),
                document.activeElement === phase.querySelector('[data-resource-index="0"] [data-resource-field="label"]'),
                phase.querySelector('.planner-hint').textContent.includes('0 links'), nativeWorkspaceFixture.writes,
            ];
        })()`), ['true', 'true', true, true, 0], 'adding a resource preserves all disclosures, focuses its label and does not persist');
        recoveryWritesBefore = await recoveryWriteCount();
        await field('[data-native-phase-id="phase-1"] input[aria-label="Link label"]', 'Board');
        await expectRecoveryCheckpoint(recoveryWritesBefore, plan => plan.phases[0].resources[0].label, 'Board',
            'resource label checkpoints immediately');
        recoveryWritesBefore = await recoveryWriteCount();
        await field('[data-native-phase-id="phase-1"] input[aria-label="HTTPS or HTTP URL"]', 'https://example.com/board');
        await expectRecoveryCheckpoint(recoveryWritesBefore, plan => plan.phases[0].resources[0].url, 'https://example.com/board',
            'resource URL checkpoints immediately');
        await action('Add resource', '[data-native-phase-id="phase-1"]');
        await field('[data-native-phase-id="phase-1"] [data-resource-index="1"] [data-resource-field="label"]', 'Only label');
        await evaluate(`nativeWorkspaceFixture.root.querySelector('form').requestSubmit()`);
        assert.deepEqual(await evaluate(`(() => {
            const root = nativeWorkspaceFixture.root, phase = root.querySelector('[data-native-phase-id="phase-1"]');
            const input = phase.querySelector('[data-resource-index="1"] [data-resource-field="url"]');
            return [nativeWorkspaceFixture.writes, input.getAttribute('aria-invalid'),
                input.getAttribute('aria-describedby') === input.parentElement.querySelector('.native-resource-error').id,
                input.parentElement.textContent.includes('Enter an HTTP or HTTPS URL.'),
                document.activeElement === input, phase.querySelector('[data-action="details"]').getAttribute('aria-expanded')];
        })()`), [0, 'true', true, true, true, 'true'], 'partial resource identifies and focuses its missing URL without writing');
        await field('[data-native-phase-id="phase-1"] [data-resource-index="1"] [data-resource-field="label"]', '');
        await field('[data-native-phase-id="phase-1"] [data-resource-index="1"] [data-resource-field="url"]', 'https://example.com/second');
        await evaluate(`nativeWorkspaceFixture.root.querySelector('form').requestSubmit()`);
        assert.deepEqual(await evaluate(`(() => {
            const input = nativeWorkspaceFixture.root.querySelector('[data-native-phase-id="phase-1"] [data-resource-index="1"] [data-resource-field="label"]');
            return [nativeWorkspaceFixture.writes, input.getAttribute('aria-invalid'), input.parentElement.textContent.includes('Enter a link label.'), document.activeElement === input];
        })()`), [0, 'true', true, true], 'URL-only resource identifies and focuses its missing label');
        await field('[data-native-phase-id="phase-1"] [data-resource-index="1"] [data-resource-field="label"]', 'Unsupported');
        await field('[data-native-phase-id="phase-1"] [data-resource-index="1"] [data-resource-field="url"]', 'ftp://example.com/file');
        await evaluate(`nativeWorkspaceFixture.root.querySelector('form').requestSubmit()`);
        assert.deepEqual(await evaluate(`(() => {
            const input = nativeWorkspaceFixture.root.querySelector('[data-native-phase-id="phase-1"] [data-resource-index="1"] [data-resource-field="url"]');
            return [nativeWorkspaceFixture.writes, input.getAttribute('aria-invalid'), input.parentElement.textContent.includes('Enter a valid HTTP or HTTPS URL.'), document.activeElement === input];
        })()`), [0, 'true', true, true], 'unsupported resource URL receives the precise English error');
        await evaluate(`nativeWorkspaceFixture.workspace.setLanguage('de')`);
        await evaluate(`nativeWorkspaceFixture.root.querySelector('form').requestSubmit()`);
        assert.equal(await evaluate(`nativeWorkspaceFixture.root.querySelector('[data-resource-index="1"] [data-resource-field="url"]').parentElement.textContent.includes('Eine gültige HTTP- oder HTTPS-URL eingeben.')`), true,
            'resource URL validation is localized in German');
        await evaluate(`nativeWorkspaceFixture.workspace.setLanguage('en')`);
        await field('[data-native-phase-id="phase-1"] [data-resource-index="1"] [data-resource-field="label"]', '   ');
        await field('[data-native-phase-id="phase-1"] [data-resource-index="1"] [data-resource-field="url"]', '  ');
        await action('Add resource', '[data-native-phase-id="phase-1"]');
        recoveryWritesBefore = await recoveryWriteCount();
        await evaluate(`nativeWorkspaceFixture.root.querySelector('[data-native-phase-id="phase-1"] [data-resource-index="2"] button').click()`);
        await expectRecoveryCheckpoint(recoveryWritesBefore, plan => plan.phases[0].resources.length, 2,
            'removing a resource checkpoints immediately');
        assert.deepEqual(await evaluate(`(() => {
            const root = nativeWorkspaceFixture.root, phase = root.querySelector('[data-native-phase-id="phase-1"]');
            return [phase.querySelector('[data-action="details"]').getAttribute('aria-expanded'),
                root.querySelector('[data-native-phase-id="phase-2"] [data-action="details"]').getAttribute('aria-expanded'),
                document.activeElement === phase.querySelector('[data-resource-index="1"] [data-resource-field="label"]'),
                phase.querySelectorAll('[data-resource-index]').length, nativeWorkspaceFixture.writes];
        })()`), ['true', 'true', true, 2, 0], 'removing a resource preserves disclosure, focuses the surviving row and does not persist');
        await click('[data-native-phase-id="phase-2"] [data-action="position"]');
        assert.deepEqual(await evaluate(`(() => {
            const f = nativeWorkspaceFixture, root = f.root;
            const row = root.querySelector('[data-native-phase-id="phase-2"]');
            const select = row.querySelector('[data-field="position"]');
            return [row.querySelector('[data-action="position"]').getAttribute('aria-label'),
                [...select.options].map(option => option.textContent), select.value,
                row.querySelector('[data-action="move-position"]').disabled,
                [...root.querySelectorAll('[data-native-phase-id]')].map(node => node.dataset.nativePhaseId),
                [...root.querySelectorAll('[data-action="details"]')].map(button => button.getAttribute('aria-expanded')),
                f.writes];
        })()`), ['Phase 02 – Change position', ['01 · Opening', '02 · Work'], '2', true,
            ['phase-1', 'phase-2'], ['true', 'true'], 0], 'position menu is complete, preselected and disclosure-neutral');
        await field('[data-native-phase-id="phase-2"] [data-field="position"]', '1', 'change');
        assert.deepEqual(await evaluate(`(() => {
            const f = nativeWorkspaceFixture, row = f.root.querySelector('[data-native-phase-id="phase-2"]');
            return [[...f.root.querySelectorAll('[data-native-phase-id]')].map(node => node.dataset.nativePhaseId),
                row.querySelector('[data-action="move-position"]').disabled, f.writes];
        })()`), [['phase-1', 'phase-2'], false, 0], 'target selection alone does not mutate the draft or Store');
        await press('Escape', 'Escape', 27);
        assert.equal(await evaluate(`(() => {
            const button = nativeWorkspaceFixture.root.querySelector('[data-native-phase-id="phase-2"] [data-action="position"]');
            return document.activeElement === button && button.getAttribute('aria-expanded') === 'false';
        })()`), true, 'Escape cancels position selection without mutation');
        await click('[data-native-phase-id="phase-2"] [data-action="position"]');
        await field('[data-native-phase-id="phase-2"] [data-field="position"]', '1', 'change');
        recoveryWritesBefore = await recoveryWriteCount();
        await click('[data-native-phase-id="phase-2"] [data-action="move-position"]');
        await expectRecoveryCheckpoint(recoveryWritesBefore, plan => plan.phases.map(phase => phase.id), ['phase-2', 'phase-1'],
            'position popover move checkpoints immediately');
        assert.deepEqual(await evaluate(`(() => {
            const f = nativeWorkspaceFixture, root = f.root;
            const moved = root.querySelector('[data-native-phase-id="phase-2"]');
            const phase1 = root.querySelector('[data-native-phase-id="phase-1"]');
            return [[...root.querySelectorAll('[data-native-phase-id]')].map(row => row.dataset.nativePhaseId),
                [...root.querySelectorAll('[data-action="details"]')].map(button => button.getAttribute('aria-expanded')),
                document.activeElement === moved.querySelector('[data-action="position"]'),
                phase1.querySelector('[data-field="notes"]').value,
                phase1.querySelector('[data-resource-index="1"] [data-resource-field="label"]').value,
                f.writes];
        })()`), [['phase-2', 'phase-1'], ['true', 'true'], true, 'Facilitator notes', '   ', 0],
        'Move reorders once while preserving disclosure, unsaved fields, stable IDs, focus and write-free editing');
        recoveryWritesBefore = await recoveryWriteCount();
        await action('Move later', '[data-native-phase-id="phase-2"]');
        await expectRecoveryCheckpoint(recoveryWritesBefore, plan => plan.phases.map(phase => phase.id), ['phase-1', 'phase-2'],
            'Move later checkpoints immediately');
        recoveryWritesBefore = await recoveryWriteCount();
        await action('Move earlier', '[data-native-phase-id="phase-2"]');
        await expectRecoveryCheckpoint(recoveryWritesBefore, plan => plan.phases.map(phase => phase.id), ['phase-2', 'phase-1'],
            'Move earlier checkpoints immediately');
        assert.deepEqual(await evaluate(`(() => {
            const root = nativeWorkspaceFixture.root;
            return [[...root.querySelectorAll('[data-native-phase-id]')].map(row => row.dataset.nativePhaseId),
                [...root.querySelectorAll('[data-action="details"]')].map(button => button.getAttribute('aria-expanded')),
                document.activeElement === root.querySelector('[data-native-phase-id="phase-2"] [data-action="position"]')];
        })()`), [['phase-2', 'phase-1'], ['true', 'true'], true],
        'existing earlier/later controls share the disclosure- and focus-preserving reorder path');
        await delay(40);
        recoveryWritesBefore = await recoveryWriteCount();
        const drag = await evaluate(`(() => {
            const root = nativeWorkspaceFixture.root;
            const handle = root.querySelector('[data-native-phase-id="phase-2"] [data-action="drag"]');
            const target = root.querySelector('[data-native-phase-id="phase-1"]');
            const sourceBounds = handle.getBoundingClientRect(), targetBounds = target.getBoundingClientRect();
            return {
                start: { x: sourceBounds.left + sourceBounds.width / 2, y: sourceBounds.top + sourceBounds.height / 2 },
                end: { x: targetBounds.left + targetBounds.width / 2, y: targetBounds.bottom - 4 },
            };
        })()`);
        await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', ...drag.start });
        await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', ...drag.start, button: 'left', buttons: 1, clickCount: 1 });
        for (let step = 1; step <= 8; step++) {
            await cdp('Input.dispatchMouseEvent', {
                type: 'mouseMoved',
                x: drag.start.x + (drag.end.x - drag.start.x) * step / 8,
                y: drag.start.y + (drag.end.y - drag.start.y) * step / 8,
                button: 'left', buttons: 1,
            });
        }
        await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', ...drag.end, button: 'left', buttons: 0, clickCount: 1 });
        for (let attempt = 0; attempt < 50 && await recoveryWriteCount() === recoveryWritesBefore; attempt++) await delay(20);
        await expectRecoveryCheckpoint(recoveryWritesBefore, plan => plan.phases.map(phase => phase.id), ['phase-1', 'phase-2'],
            'actual Workspace drag-and-drop callback checkpoints immediately');
        assert.deepEqual(await evaluate(`[
            ...nativeWorkspaceFixture.root.querySelectorAll('[data-native-phase-id]')
        ].map(row => row.dataset.nativePhaseId)`), ['phase-1', 'phase-2'],
        'actual Workspace drag-and-drop updates the rendered draft order');
        assert.deepEqual(await evaluate(`(() => {
            const f = nativeWorkspaceFixture;
            const record = JSON.parse([...f.recoveryValues.values()].at(-1));
            const plan = record.draft.template;
            return [plan.name, plan.category, plan.transitionMode, plan.preparedInformation,
                plan.phases.map(phase => phase.id), plan.phases[0].title, plan.phases[0].durationSeconds,
                plan.phases[0].category, plan.phases[0].notes,
                plan.phases[0].resources.map(resource => [resource.label, resource.url]),
                record.baseline.template.phases.length, f.writes];
        })()`), ['Independent workshop', 'training', 'automatic', 'Goals and **plain text**', ['phase-1', 'phase-2'],
            'First phase', 900, 'discussion', 'Facilitator notes',
            [['Board', 'https://example.com/board'], ['   ', '  ']], 0, 0],
        'all text and structural mutation paths retain recoverable intermediate values and the original baseline');

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
            const phase = f.root.querySelector('[data-native-phase-id="phase-1"]');
            const target = f.tickets.templateSave.target.templates.find(item => item.plan.name === 'Independent workshop');
            const targetPhase = target.plan.phases.find(item => item.id === 'phase-1');
            const recovery = JSON.parse([...f.recoveryValues.values()].at(-1));
            return [f.writes, f.root.querySelector('[data-field="name"]').value,
                f.root.textContent.includes('write acknowledgement is uncertain'),
                Boolean([...f.root.querySelectorAll('button')].find(button => button.textContent === 'Recheck without writing')),
                phase.querySelectorAll('[data-resource-index]').length,
                phase.querySelector('[data-resource-index="1"] [data-resource-field="label"]').value,
                phase.querySelector('[data-resource-index="1"] [data-resource-field="url"]').value,
                targetPhase.resources.length, recovery.state, recovery.pending.kind];
        })()`), [1, 'Independent workshop', true, true, 2, '   ', '  ', 1, 'pending', 'templateSave'],
        'uncertain Create retains the original editable draft while its complete ticket contains the normalized target');
        await evaluate(`nativeWorkspaceFixture.reloadWorkspace()`);
        for (let i = 0; i < 50; i++) {
            if (await evaluate(`nativeWorkspaceFixture.root.querySelector('[data-template-recoveries]') !== null`)) break;
            await delay(20);
        }
        assert.deepEqual(await evaluate(`[
            nativeWorkspaceFixture.root.querySelector('[data-field="name"]'),
            nativeWorkspaceFixture.root.querySelectorAll('[data-recovery-id]').length,
            nativeWorkspaceFixture.root.textContent.includes('Save confirmation is pending'),
        ]`), [null, 1, true], 'reload lists the Pending candidate without restoring it automatically');
        await action('Restore', '[data-template-recoveries]');
        for (let i = 0; i < 50; i++) {
            if (await evaluate(`nativeWorkspaceFixture.root.querySelector('[data-native-recheck]') !== null`)) break;
            await delay(20);
        }
        assert.deepEqual(await evaluate(`[
            nativeWorkspaceFixture.root.querySelector('[data-field="name"]').value,
            nativeWorkspaceFixture.root.querySelector('[data-native-recheck]').disabled,
            [...nativeWorkspaceFixture.root.querySelectorAll('input,select,textarea')].every(control => control.disabled),
        ]`), ['Independent workshop', false, true],
        'explicit Pending restore preserves the draft and exposes only read-only Recheck');
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
            return [f.writes, Boolean(saved), saved.plan.phases.map(phase => phase.id), saved.plan.phases[0].notes,
                saved.plan.phases[0].resources.length, saved.plan.phases[0].resources[0], f.root.textContent.includes('Saved.'),
                f.recoveryValues.size];
        })()`), [1, true, ['phase-1', 'phase-2'], 'Facilitator notes',
            1, { label: 'Board', url: 'https://example.com/board' }, true, 0],
        'confirmed read-only reconciliation performs no duplicate write and cleans the exact Recovery copy');

        await rowAction('Independent workshop', 'Edit');
        const writesBeforeCancel = await evaluate('nativeWorkspaceFixture.writes');
        await field('[data-field="name"]', 'Discarded title');
        await evaluate(`window.nativeWorkspaceConfirm = window.confirm; window.confirm = () => true`);
        await action('Cancel');
        await evaluate(`window.confirm = window.nativeWorkspaceConfirm; delete window.nativeWorkspaceConfirm`);
        assert.deepEqual(await evaluate(`[
            nativeWorkspaceFixture.writes,
            JSON.parse(nativeWorkspaceFixture.raw).templates.find(item => item.plan.name === 'Independent workshop').plan.name,
        ]`), [writesBeforeCancel, 'Independent workshop'], 'Cancel never persists');

        await evaluate(`(() => {
            const f = nativeWorkspaceFixture;
            f.recoveryUnconfirmedBefore = {
                sets: f.recoveryCalls.filter(([operation]) => operation === 'set').length,
                candidates: f.recoveryValues.size,
            };
            f.recoveryUnconfirmedOnSet = true;
        })()`);
        await action('Create template');
        assert.deepEqual(await evaluate(`(() => {
            const f = nativeWorkspaceFixture, warning = f.root.querySelector('[data-template-recovery-warning]');
            const record = JSON.parse([...f.recoveryValues.values()].at(-1));
            return [warning.hidden, warning.textContent.includes('could not confirm this checkpoint'),
                f.recoveryCalls.filter(([operation]) => operation === 'set').length - f.recoveryUnconfirmedBefore.sets,
                f.recoveryValues.size - f.recoveryUnconfirmedBefore.candidates,
                f.recoveryErrors.at(-1), record.draft.template.name, f.writes];
        })()`), [false, true, 1, 1, 'recoveryStorageWriteUnconfirmed', '', writesBeforeCancel],
        'a successful Recovery write followed by a failed readback exposes a persistent warning and preserves the candidate');
        await evaluate(`nativeWorkspaceFixture.workspace.setLanguage('de')`);
        assert.deepEqual(await evaluate(`(() => {
            const f = nativeWorkspaceFixture, warning = f.root.querySelector('[data-template-recovery-warning]');
            return [warning.hidden, warning.textContent.includes('nicht automatisch erneut gesichert'),
                f.recoveryCalls.filter(([operation]) => operation === 'set').length - f.recoveryUnconfirmedBefore.sets];
        })()`), [false, true, 1], 'the persistent Recovery warning remains visible and localized in German without retrying');
        await evaluate(`nativeWorkspaceFixture.workspace.setLanguage('en')`);
        await field('[data-field="name"]', 'Still editable after recovery failure');
        assert.deepEqual(await evaluate(`(() => {
            const f = nativeWorkspaceFixture;
            const record = JSON.parse([...f.recoveryValues.values()].at(-1));
            return [f.root.querySelector('[data-template-recovery-warning]').hidden,
                f.recoveryCalls.filter(([operation]) => operation === 'set').length - f.recoveryUnconfirmedBefore.sets,
                f.recoveryValues.size - f.recoveryUnconfirmedBefore.candidates,
                record.draft.template.name, f.root.querySelector('[data-field="name"]').value, f.writes];
        })()`), [false, 1, 1, '', 'Still editable after recovery failure', writesBeforeCancel],
        'a blocked Recovery session does not retry the unconfirmed write and retains its original candidate');
        await evaluate(`window.nativeWorkspaceConfirm = window.confirm; window.confirm = () => true`);
        await action('Cancel');
        await evaluate(`window.confirm = window.nativeWorkspaceConfirm; delete window.nativeWorkspaceConfirm`);

        await evaluate(`(() => {
            const f = nativeWorkspaceFixture, record = JSON.parse(f.raw);
            const restorable = f.recoveryServiceFactory({
                store: f.recoveryStore,
                createId: kind => kind + '-restorable',
                now: () => 1900,
            });
            restorable.begin({
                mode: 'create', expectedAggregateRevision: record.revision, expectedTemplateRevision: null,
                template: {
                    id: 'restorable-template', name: 'Restorable draft', category: 'workshop', transitionMode: 'manual',
                    preparedInformation: 'Recovered content', phases: [],
                },
            });
            const service = f.recoveryServiceFactory({
                store: f.recoveryStore,
                createId: kind => kind + '-conflict',
                now: () => 2000,
            });
            service.begin({
                mode: 'create', expectedAggregateRevision: record.revision - 1, expectedTemplateRevision: null,
                template: {
                    id: 'conflict-template', name: 'Conflict draft', category: 'workshop', transitionMode: 'manual',
                    preparedInformation: 'Read-only content', phases: [],
                },
            });
            f.recoveryValues.set('easyTimerEditorDraftRecovery.v1.corrupt', '{broken-json');
        })()`);
        await evaluate(`nativeWorkspaceFixture.failWorkspaceLoadOnce = true; nativeWorkspaceFixture.reloadWorkspace()`);
        assert.deepEqual(await evaluate(`[
            nativeWorkspaceFixture.root.textContent.includes('could not be read'),
            [...nativeWorkspaceFixture.root.querySelectorAll('button')].some(button => button.textContent === 'Retry loading'),
        ]`), [true, true], 'authoritative Store load failure replaces indefinite Loading with an explicit Retry');
        await action('Retry loading');
        for (let i = 0; i < 50; i++) {
            if (await evaluate(`nativeWorkspaceFixture.root.querySelector('[data-template-recoveries]') !== null`)) break;
            await delay(20);
        }
        assert.deepEqual(await evaluate(`(() => {
            const f = nativeWorkspaceFixture;
            const conflict = f.root.querySelector('[data-recovery-id="recovery-conflict"]');
            return [f.root.querySelectorAll('[data-recovery-id]').length,
                f.root.textContent.includes('A local recovery entry could not be read'),
                conflict.textContent.includes('saved library changed'),
                [...conflict.querySelectorAll('button')].some(button => button.textContent === 'Restore')];
        })()`), [2, true, true, false],
        'reload lists separate valid and corrupt candidates while keeping a revision conflict read-only');
        await evaluate(`(() => {
            const f = nativeWorkspaceFixture;
            f.recoveryFailServiceReadOnce = true;
            const row = [...f.root.querySelectorAll('[data-recovery-id]')]
                .find(item => item.dataset.recoveryId !== 'recovery-conflict');
            [...row.querySelectorAll('button')].find(button => button.textContent === 'Restore').click();
        })()`);
        for (let i = 0; i < 50; i++) {
            if (await evaluate(`nativeWorkspaceFixture.root.querySelector('[role="alert"]')?.textContent.includes('could not be read for restoration')`)) break;
            await delay(20);
        }
        assert.deepEqual(await evaluate(`(() => {
            const f = nativeWorkspaceFixture, alert = f.root.querySelector('[role="alert"]');
            return [f.root.querySelector('[data-field="name"]'), f.root.querySelectorAll('[data-recovery-id]').length,
                alert.textContent.includes('could not be read for restoration'),
                !alert.textContent.includes('saved library changed')];
        })()`), [null, 2, true, true],
        'a Restore storage read failure keeps the candidate and is not misreported as an authoritative conflict');
        await evaluate(`(() => {
            const row = nativeWorkspaceFixture.root.querySelector('[data-recovery-id="recovery-conflict"]');
            [...row.querySelectorAll('button')].find(button => button.textContent === 'View draft').click();
        })()`);
        assert.deepEqual(await evaluate(`(() => {
            const f = nativeWorkspaceFixture, row = f.root.querySelector('[data-recovery-id="recovery-conflict"]');
            const json = row.querySelector('textarea');
            [...row.querySelectorAll('button')].find(button => button.textContent === 'Export recovery JSON').click();
            const toggle = row.querySelector('[data-recovery-review]');
            return [json.readOnly, JSON.parse(json.value).recoveryId, f.downloads.at(-1).recoveryId,
                toggle.getAttribute('aria-expanded'), toggle.getAttribute('aria-controls') === json.parentElement.id,
                !json.parentElement.hidden];
        })()`), [true, 'recovery-conflict', 'recovery-conflict', 'true', true, true],
        'conflicting drafts expose compact read-only details and complete Recovery JSON export');
        assert.deepEqual(await evaluate(`(() => {
            let row = nativeWorkspaceFixture.root.querySelector('[data-recovery-id="recovery-conflict"]');
            row.querySelector('[data-recovery-review]').click();
            row = nativeWorkspaceFixture.root.querySelector('[data-recovery-id="recovery-conflict"]');
            const toggle = row.querySelector('[data-recovery-review]');
            const detail = row.querySelector('#' + CSS.escape(toggle.getAttribute('aria-controls')));
            return [toggle.getAttribute('aria-expanded'), detail.hidden, document.activeElement === toggle];
        })()`), ['false', true, true],
        'closing Recovery details preserves the stable ARIA relationship and restores keyboard focus to the toggle');
        await evaluate(`(() => {
            const row = [...nativeWorkspaceFixture.root.querySelectorAll('[data-recovery-id]')]
                .find(item => item.dataset.recoveryId !== 'recovery-conflict');
            [...row.querySelectorAll('button')].find(button => button.textContent === 'Restore').click();
        })()`);
        for (let i = 0; i < 50; i++) {
            if (await evaluate(`nativeWorkspaceFixture.root.querySelector('[data-field="name"]') !== null`)) break;
            await delay(20);
        }
        await evaluate(`window.nativeWorkspaceConfirm = window.confirm; window.confirm = () => false`);
        await action('Cancel');
        assert.equal(await evaluate(`nativeWorkspaceFixture.root.querySelector('[data-field="name"]') !== null`), true,
            'rejected Cancel confirmation retains the restored editor and Recovery copy');
        await evaluate(`window.confirm = () => true`); await action('Cancel');
        await evaluate(`window.confirm = window.nativeWorkspaceConfirm; delete window.nativeWorkspaceConfirm`);
        assert.equal(await evaluate(`nativeWorkspaceFixture.root.querySelectorAll('[data-recovery-id]').length`), 1,
            'accepted Cancel removes only the exact restored Recovery copy');

        const writesBeforeSavedReload = await evaluate(`nativeWorkspaceFixture.writes`);
        const savesBeforeSavedReload = await evaluate(`nativeWorkspaceFixture.calls.templateSave`);
        await action('Create template');
        await field('[data-field="name"]', 'Reload result test'); await action('Add phase');
        const reloadPhaseId = await evaluate(`nativeWorkspaceFixture.root.querySelector('[data-native-phase-id]').dataset.nativePhaseId`);
        await field(`[data-native-phase-id="${reloadPhaseId}"] [data-field="title"]`, 'Reload phase');
        await field(`[data-native-phase-id="${reloadPhaseId}"] [data-field="duration"]`, '10');
        await evaluate(`nativeWorkspaceFixture.failWorkspaceLoadOnce = true; nativeWorkspaceFixture.root.querySelector('form').requestSubmit()`);
        for (let i = 0; i < 50; i++) {
            if (await evaluate(`nativeWorkspaceFixture.root.querySelector('[data-template-save-retry]') !== null`)) break;
            await delay(20);
        }
        assert.deepEqual(await evaluate(`[
            nativeWorkspaceFixture.writes,
            nativeWorkspaceFixture.calls.templateSave,
            nativeWorkspaceFixture.root.textContent.includes('Saved successfully'),
            nativeWorkspaceFixture.root.querySelector('[data-template-save-retry]').disabled,
        ]`), [writesBeforeSavedReload + 1, savesBeforeSavedReload + 1, true, false],
        'post-Save Store load failure reports confirmed success and offers only a read/cleanup retry');
        await action('Retry saved result');
        for (let i = 0; i < 50; i++) {
            if (await evaluate(`nativeWorkspaceFixture.root.querySelector('[data-field="name"]') === null`)) break;
            await delay(20);
        }
        assert.deepEqual(await evaluate(`[
            nativeWorkspaceFixture.writes,
            nativeWorkspaceFixture.calls.templateSave,
            JSON.parse(nativeWorkspaceFixture.raw).templates.some(template => template.plan.name === 'Reload result test'),
        ]`), [writesBeforeSavedReload + 1, savesBeforeSavedReload + 1, true],
        'saved-result Retry performs no second authoritative Save');

        const writesBeforeCleanupFailure = await evaluate(`nativeWorkspaceFixture.writes`);
        await action('Create template');
        await field('[data-field="name"]', 'Cleanup test'); await action('Add phase');
        const cleanupPhaseId = await evaluate(`nativeWorkspaceFixture.root.querySelector('[data-native-phase-id]').dataset.nativePhaseId`);
        await field(`[data-native-phase-id="${cleanupPhaseId}"] [data-field="title"]`, 'Cleanup phase');
        await field(`[data-native-phase-id="${cleanupPhaseId}"] [data-field="duration"]`, '10');
        await evaluate(`nativeWorkspaceFixture.recoveryFailRemove = true; nativeWorkspaceFixture.root.querySelector('form').requestSubmit()`);
        for (let i = 0; i < 50; i++) {
            if (await evaluate(`nativeWorkspaceFixture.root.textContent.includes('separate local recovery copy could not be cleaned up')`)) break;
            await delay(20);
        }
        assert.deepEqual(await evaluate(`(() => {
            const f = nativeWorkspaceFixture, record = JSON.parse(f.raw);
            return [f.writes, record.templates.some(template => template.plan.name === 'Cleanup test'),
                f.root.textContent.includes('Saved.'),
                f.root.textContent.includes('separate local recovery copy could not be cleaned up'),
                f.root.querySelector('[data-field="name"]'),
                [...f.recoveryValues.values()].some(raw => JSON.parse(raw).draft.template.name === 'Cleanup test')];
        })()`), [writesBeforeCleanupFailure + 1, true, true, true, null, true],
        'confirmed Save remains successful when exact Recovery cleanup fails, with no second Save attempt');

        const writesBeforeUnconfirmedCleanup = await evaluate(`nativeWorkspaceFixture.writes`);
        const savesBeforeUnconfirmedCleanup = await evaluate(`nativeWorkspaceFixture.calls.templateSave`);
        const removesBeforeUnconfirmedCleanup = await evaluate(`nativeWorkspaceFixture.recoveryCalls.filter(([operation]) => operation === 'remove').length`);
        await action('Create template');
        await field('[data-field="name"]', 'Unconfirmed cleanup test'); await action('Add phase');
        const unconfirmedCleanupPhaseId = await evaluate(`nativeWorkspaceFixture.root.querySelector('[data-native-phase-id]').dataset.nativePhaseId`);
        await field(`[data-native-phase-id="${unconfirmedCleanupPhaseId}"] [data-field="title"]`, 'Cleanup uncertainty phase');
        await field(`[data-native-phase-id="${unconfirmedCleanupPhaseId}"] [data-field="duration"]`, '10');
        await evaluate(`nativeWorkspaceFixture.recoveryUnconfirmedRemove = true; nativeWorkspaceFixture.root.querySelector('form').requestSubmit()`);
        for (let i = 0; i < 50; i++) {
            if (await evaluate(`nativeWorkspaceFixture.root.textContent.includes('could not be confirmed whether the local recovery copy was removed')`)) break;
            await delay(20);
        }
        assert.deepEqual(await evaluate(`(() => {
            const f = nativeWorkspaceFixture, record = JSON.parse(f.raw);
            return [f.writes, f.calls.templateSave,
                f.recoveryCalls.filter(([operation]) => operation === 'remove').length,
                record.templates.some(template => template.plan.name === 'Unconfirmed cleanup test'),
                f.root.textContent.includes('Saved.'),
                f.root.textContent.includes('could not be confirmed whether the local recovery copy was removed'),
                !f.root.textContent.includes('copy could not be cleaned up and remains available'),
                f.root.querySelector('[data-field="name"]'),
                ![...f.recoveryValues.values()].some(raw => {
                    try { return JSON.parse(raw).draft.template.name === 'Unconfirmed cleanup test'; }
                    catch { return false; }
                })];
        })()`), [writesBeforeUnconfirmedCleanup + 1, savesBeforeUnconfirmedCleanup + 1,
            removesBeforeUnconfirmedCleanup + 1, true, true, true, true, null, true],
        'unconfirmed Recovery removal reports neutral cleanup uncertainty without retrying the confirmed Save or Remove');

        const writesBeforeExecution = await evaluate('nativeWorkspaceFixture.writes');
        await rowAction('Independent workshop', 'Create planned execution');
        assert.equal(await evaluate(`nativeWorkspaceFixture.writes`), writesBeforeExecution, 'new Execution remains local before Save');
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
        ]`), [1, writesBeforeExecution, true], 'duplicate submit creates at most one Execution while planning is in flight');
        await evaluate(`nativeWorkspaceFixture.release('plan')`);
        for (let i = 0; i < 50; i++) {
            if (await evaluate(`nativeWorkspaceFixture.root.textContent.includes('write acknowledgement is uncertain')`)) break;
            await delay(20);
        }
        assert.deepEqual(await evaluate(`[
            nativeWorkspaceFixture.writes,
            nativeWorkspaceFixture.root.querySelector('[data-field="name"]').value,
            nativeWorkspaceFixture.root.textContent.includes('write acknowledgement is uncertain'),
        ]`), [writesBeforeExecution + 1, 'Independent execution', true], 'uncertain planning retains local plan edits');
        await action('Recheck without writing');
        assert.deepEqual(await evaluate(`[
            nativeWorkspaceFixture.writes,
            nativeWorkspaceFixture.root.querySelector('[data-field="name"]').value,
            nativeWorkspaceFixture.root.textContent.includes('Execution creation is confirmed'),
        ]`), [writesBeforeExecution + 1, 'Independent execution', true], 'planning recheck observes exact created identity without a write');
        await action('Save');
        assert.deepEqual(await evaluate(`(() => {
            const f = nativeWorkspaceFixture, record = JSON.parse(f.raw);
            const source = record.templates.find(item => item.plan.name === 'Independent workshop');
            const execution = record.executions.find(item => item.execution.currentPlan.name === 'Independent execution').execution;
            return [f.writes, source.plan.preparedInformation, execution.source, execution.currentPlan.preparedInformation,
                execution.lifecycle, record.activeRuntime.executionId];
        })()`), [writesBeforeExecution + 2, 'Goals and **plain text**', { kind: 'template', id: 'template-1' },
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
        await action('Export all local data');
        assert.deepEqual(await evaluate(`(() => {
            const file = nativeWorkspaceFixture.downloads[1], parsed = JSON.parse(file.text);
            return [file.name, parsed.kind, parsed.record.schemaVersion,
                nativeWorkspaceFixture.root.textContent.includes('Full backup restore is not yet supported.')];
        })()`), ['easytimer-local-data.json', 'editor-backup', 1, true],
        'complete native local-data export is accurately labelled and does not expose restore');
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
        ]`), ['Session-Editor', ['Vorlagen', 'Geplante Durchführungen', 'Im Timer aktiv', 'Unterbrochen', 'Abgeschlossen']]);
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
        })()`), [0, false, 'quick', '00:00', false, true], 'fixture unmount preserves the public Quick state and unrelated legacy data');
        console.log('PASS: native Workspace; shared lifecycle library, Template CRUD, planned Execution creation/editing, phase content, single-template and full-data export, explicit-only persistence, stale/uncertain reconciliation safety, DE/EN, dialog focus/Escape and mobile portrait/landscape.');
    } finally {
        await cdp('Emulation.clearDeviceMetricsOverride').catch(() => {});
        await evaluate(`(() => {
            const f = window.nativeWorkspaceFixture;
            const probe = f?.phaseFocusProbe;
            if (probe) {
                document.removeEventListener('focusin', probe.resizeDuringFocus);
                window.scrollBy = probe.scrollBy; HTMLElement.prototype.getBoundingClientRect = probe.bounds;
                if (probe.viewportDescriptor) Object.defineProperty(window, 'visualViewport', probe.viewportDescriptor);
                else delete window.visualViewport;
                delete f.phaseFocusProbe;
            }
            if (window.nativeWorkspaceConfirm) window.confirm = window.nativeWorkspaceConfirm;
            delete window.nativeWorkspaceConfirm;
            f?.workspace?.close(); f?.root?.remove(); delete window.nativeWorkspaceFixture;
        })()`).catch(() => {});
    }
}
