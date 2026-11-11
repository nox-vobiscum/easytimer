import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

export async function checkNativePhaseFields({ evaluate, click, cdp }) {
    const row = id => `#native-phase-fixture [data-native-phase-id="${id}"]`;
    const field = async (id, name, value, event = 'input') => evaluate(`(() => {
        const input = document.querySelector(${JSON.stringify(`${row(id)} [data-field="${name}"]`)});
        input.value = ${JSON.stringify(value)};
        input.dispatchEvent(new Event(${JSON.stringify(event)}, { bubbles: true }));
    })()`);
    const key = async (key, code, virtualKey) => {
        await cdp('Input.dispatchKeyEvent', {
            type: 'keyDown', key, code, windowsVirtualKeyCode: virtualKey,
            ...(key === 'Enter' ? { text: '\r' } : {}),
        });
        await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: virtualKey });
    };
    try {
        await cdp('Emulation.setDeviceMetricsOverride', {
            width: 1280, height: 800, screenWidth: 1280, screenHeight: 800, mobile: false, deviceScaleFactor: 1,
        });
        await evaluate(`(async () => {
            const [{ createNativePhaseFields }, { createNativePlannerService },
                { createNativeEditorTemplateIntegration }, { createEditorStoreWriter }, operations] = await Promise.all([
                import('/js/editor-phase-fields.mjs'), import('/js/editor-planner-service.mjs'),
                import('/js/editor-template-integration.mjs'), import('/js/editor-storage-lock.mjs'),
                import('/js/editor-template-draft.mjs'),
            ]);
            const fixture = window.nativePhaseFixture = {
                raw: null, writes: 0, edits: 0, keys: [],
                wasPlannerOpen: document.body.classList.contains('planner-open'),
                theme: document.documentElement.dataset.theme,
                originalFocus: document.activeElement,
            };
            const storage = {
                getItem(key) {
                    if (key !== 'easyTimerEditor.v1') throw new Error('V1 storage access');
                    fixture.keys.push(key); return fixture.raw;
                },
                setItem(key, value) {
                    if (key !== 'easyTimerEditor.v1') throw new Error('V1 storage access');
                    fixture.writes++; fixture.raw = value;
                },
            };
            const writer = createEditorStoreWriter({ getStorage: () => storage, locks: navigator.locks });
            fixture.service = createNativePlannerService({
                integration: createNativeEditorTemplateIntegration({ writer }), createId: () => 'field-template',
            });
            const library = await fixture.service.loadLibrary();
            const seed = fixture.service.prepareNewDraft(library.library).draft;
            seed.template.name = 'Full native plan'; seed.template.category = 'training';
            seed.template.preparedInformation = '**Retain** prepared information';
            seed.template.phases = ['phase-a', 'phase-b'].map(id => ({
                id, title: id, durationSeconds: 600, category: 'presentation',
                notes: 'Notes for ' + id, resources: [{ label: id, url: 'https://example.com/' + id }],
            }));
            const saved = await fixture.service.saveDraft(seed);
            if (saved.status !== 'success') throw new Error('Fixture seed failed');
            fixture.draft = fixture.service.prepareEditDraft(saved.library, 'field-template').draft;
            fixture.original = structuredClone(fixture.draft);
            fixture.originalRaw = fixture.raw;
            fixture.root = document.createElement('section'); fixture.root.id = 'native-phase-fixture';
            fixture.root.className = 'planner';
            fixture.list = document.createElement('ol'); fixture.list.className = 'phase-list';
            fixture.root.append(fixture.list); document.querySelector('main').append(fixture.root);
            document.body.classList.add('planner-open');
            fixture.fields = ['phase-a', 'phase-b'].map(phaseId => createNativePhaseFields({
                getDraft: () => fixture.draft,
                onDraftChange: draft => { fixture.draft = draft; fixture.edits++; },
                phaseId, language: 'en',
            }));
            fixture.list.append(...fixture.fields.map(fields => fields.element));
            fixture.operations = operations;
        })()`);

        assert.deepEqual(await evaluate(`(() => {
            const sheet = [...document.styleSheets].find(sheet =>
                new URL(sheet.href || 'about:blank').pathname === '/css/styles.css');
            const rules = [...sheet.cssRules].filter(rule => rule.selectorText?.includes('native-phase'));
            const select = rules.find(rule => rule.selectorText === '.native-phase-details select');
            const hidden = rules.find(rule => rule.selectorText.endsWith('[hidden]'));
            const label = rules.find(rule => rule.selectorText.endsWith('label > span'));
            return [rules.length, select.style.minHeight, hidden.style.display, label.style.clipPath];
        })()`), [6, '44px', 'none', 'none'], 'all native phase rules parse in the central stylesheet');

        await field('phase-a', 'title', 'Edited <safe>');
        await field('phase-a', 'duration', '17');
        await click(`${row('phase-a')} [data-action="details"]`);
        await field('phase-a', 'category', 'breakout', 'change');
        assert.deepEqual(await evaluate(`(() => {
            const f = nativePhaseFixture, a = f.draft.template.phases[0];
            return [a.title, a.durationSeconds, a.category, a.notes, a.resources,
                f.draft.template.preparedInformation, f.draft.expectedAggregateRevision,
                f.draft.expectedTemplateRevision, f.writes, f.raw === f.originalRaw];
        })()`), ['Edited <safe>', 1020, 'breakout', 'Notes for phase-a',
            [{ label: 'phase-a', url: 'https://example.com/phase-a' }],
            '**Retain** prepared information', 1, 1, 1, true]);
        assert.equal(await evaluate(`document.querySelector('#native-phase-fixture safe') === null`), true);

        await field('phase-a', 'duration', '1.5');
        const invalid = await evaluate(`(async () => {
            const f = nativePhaseFixture, result = await f.service.saveDraft(f.draft);
            f.fields[0].showValidationError(result.error.code);
            return [result.error, result.draft.template.phases[0].durationSeconds, f.writes];
        })()`);
        assert.deepEqual(invalid, [{ type: 'validation', code: 'duration' }, '1.5', 1]);
        assert.deepEqual(await evaluate(`(() => {
            const row = document.querySelector(${JSON.stringify(row('phase-a'))});
            const input = row.querySelector('[data-field="duration"]');
            return [input.value, input.getAttribute('aria-invalid'),
                input.getAttribute('aria-describedby') === row.querySelector('[role="status"]').id,
                row.querySelector('[role="status"]').textContent];
        })()`), ['1.5', 'true', true, 'Enter a whole number from 1 to 6,000 minutes.']);

        await evaluate(`(() => {
            const f = nativePhaseFixture, input = f.fields[0].element.querySelector('[data-field="duration"]');
            input.focus(); input.setSelectionRange(1, 2); f.fields[0].setLanguage('de');
        })()`);
        assert.deepEqual(await evaluate(`(() => {
            const row = nativePhaseFixture.fields[0].element, input = row.querySelector('[data-field="duration"]');
            return [document.activeElement === input, input.value, input.selectionStart, input.selectionEnd,
                row.querySelector('[data-action="details"]').getAttribute('aria-label'),
                row.querySelector('[role="status"]').textContent];
        })()`), [true, '1.5', 1, 2, 'Phasendetails', 'Eine ganze Zahl von 1 bis 6.000 Minuten eingeben.']);
        await field('phase-a', 'duration', '999999999999999999999999999999999999');
        await evaluate(`nativePhaseFixture.fields[0].refresh()`);
        assert.deepEqual(await evaluate(`(() => {
            const f = nativePhaseFixture;
            return [f.draft.template.phases[0].durationSeconds,
                f.fields[0].element.querySelector('[data-field="duration"]').value];
        })()`), ['999999999999999999999999999999999999', '999999999999999999999999999999999999'],
        'unsafe numeric input remains exact through a refresh');
        await field('phase-a', 'duration', '18');
        await evaluate(`document.querySelector(${JSON.stringify(`${row('phase-a')} [data-field="category"]`)}).focus()`);
        await key('Escape', 'Escape', 27);
        assert.equal(await evaluate(`(() => {
            const button = nativePhaseFixture.fields[0].element.querySelector('[data-action="details"]');
            return document.activeElement === button && button.getAttribute('aria-expanded') === 'false';
        })()`), true, 'Escape collapses details and restores focus');
        await key('Enter', 'Enter', 13);
        assert.equal(await evaluate(`nativePhaseFixture.fields[0].element.querySelector('[data-action="details"]').getAttribute('aria-expanded')`), 'true');
        await key('Tab', 'Tab', 9);
        assert.equal(await evaluate(`document.activeElement === nativePhaseFixture.fields[0].element.querySelector('[data-field="category"]')`), true);
        assert.equal(await evaluate(`getComputedStyle(document.activeElement).outlineStyle !== 'none'
            && parseFloat(getComputedStyle(document.activeElement).outlineWidth) > 0`), true,
        'keyboard focus remains visible with the consolidated CSS');

        await evaluate(`(() => {
            const f = nativePhaseFixture;
            f.draft = f.operations.repositionNativeDraftPhase(f.draft, 'phase-a', 2);
            f.list.append(f.fields[1].element, f.fields[0].element);
            f.fields.forEach(fields => fields.refresh());
        })()`);
        await field('phase-a', 'title', 'After reorder');
        assert.deepEqual(await evaluate(`nativePhaseFixture.draft.template.phases.map(phase => [phase.id, phase.title, phase.notes])`), [
            ['phase-b', 'phase-b', 'Notes for phase-b'], ['phase-a', 'After reorder', 'Notes for phase-a'],
        ]);
        assert.deepEqual(await evaluate(`nativePhaseFixture.draft.template.phases.map(phase => phase.resources[0].url)`),
            ['https://example.com/phase-b', 'https://example.com/phase-a']);

        for (const language of ['de', 'en']) for (const theme of ['light', 'dark']) {
            await cdp('Emulation.setTouchEmulationEnabled', { enabled: true });
            await cdp('Emulation.setDeviceMetricsOverride', {
                width: 320, height: 640, screenWidth: 320, screenHeight: 640, mobile: true, deviceScaleFactor: 1,
            });
            for (let attempt = 0; attempt < 100; attempt++) {
                if (await evaluate(`document.body.dataset.device === 'smartphone' && matchMedia('(pointer:coarse)').matches`)) break;
                await delay(50);
            }
            await evaluate(`(() => {
                document.documentElement.dataset.theme = ${JSON.stringify(theme)};
                nativePhaseFixture.fields.forEach(fields => fields.setLanguage(${JSON.stringify(language)}));
            })()`);
            assert.equal(await evaluate(`document.body.dataset.device === 'smartphone' && matchMedia('(pointer:coarse)').matches`), true);
            assert.equal(await evaluate(`(() => {
                const row = nativePhaseFixture.fields[0].element;
                const targets = [...row.querySelectorAll('input, button, select')];
                return document.documentElement.scrollWidth <= innerWidth
                    && targets.every(target => {
                        const rect = target.getBoundingClientRect();
                        return rect.width >= 44 && rect.height >= 44 && rect.left >= 0 && rect.right <= innerWidth;
                    });
            })()`), true, `320px targets fit in ${language}/${theme}`);
        }

        const confirmed = await evaluate(`(async () => {
            const f = nativePhaseFixture, result = await f.service.saveDraft(f.draft);
            return [result.status, result.library.templates[0].plan.phases.map(phase => phase.id), f.writes];
        })()`);
        assert.deepEqual(confirmed, ['success', ['phase-b', 'phase-a'], 2], 'only explicit host Save persists edits');
        await evaluate(`(() => {
            const f = nativePhaseFixture, raw = f.raw;
            f.draft = f.operations.removeNativeDraftPhase(f.draft, 'phase-a');
            f.fields[0].refresh();
            f.beforeMissingEdit = JSON.stringify(f.draft);
            f.beforeMissingRaw = raw;
        })()`);
        await field('phase-a', 'title', 'Do not redirect to another phase');
        assert.deepEqual(await evaluate(`(() => {
            const f = nativePhaseFixture;
            return [JSON.stringify(f.draft) === f.beforeMissingEdit, f.raw === f.beforeMissingRaw,
                f.fields[0].element.querySelector('[data-field="title"]').value,
                f.fields[0].element.querySelector('[role="status"]').textContent, f.writes];
        })()`), [true, true, 'Do not redirect to another phase',
            'This phase is no longer in the draft. Your input has been retained.', 2]);
        console.log('PASS: internal native phase fields, real draft/service edits, full field fidelity, invalid inputs, stable identity after reorder, missing-phase guard, explicit-only persistence, DE/EN, keyboard/focus and 320px coarse-pointer Light/Dark.');
    } finally {
        await cdp('Emulation.setTouchEmulationEnabled', { enabled: false });
        await cdp('Emulation.clearDeviceMetricsOverride');
        await evaluate(`(() => {
            const f = window.nativePhaseFixture;
            if (!f) return;
            f.root?.remove();
            document.body.classList.toggle('planner-open', f.wasPlannerOpen);
            document.documentElement.dataset.theme = f.theme;
            if (f.originalFocus?.isConnected) f.originalFocus.focus({ preventScroll: true });
            delete window.nativePhaseFixture;
        })()`);
    }
}
