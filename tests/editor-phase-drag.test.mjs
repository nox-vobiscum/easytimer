import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { applyNativePhaseDrop, nativePhaseRows } from '../src/js/editor-phase-drag.mjs';

test('native phase row boundary excludes dnd-kit feedback clones', () => {
    const phases = Array.from({ length: 14 }, (_, index) => ({
        dataset: { nativePhaseId: `phase-${index + 1}` },
        _nativePhase: { dragHandle: {} },
    }));
    const clone = { className: 'native-phase-fields', dataset: { nativePhaseId: 'phase-1' } };
    assert.deepEqual(nativePhaseRows({ children: [phases[0], clone, ...phases.slice(1)] }), phases);
});

test('confirmed native drop schedules exactly one authoritative draft reorder', () => {
    const calls = []; const scheduled = [];
    const result = applyNativePhaseDrop({
        source: { id: 'phase-4', initialIndex: 3, index: 9 }, canceled: false,
        announcement: 'Phase moved.',
        onReposition: (...args) => calls.push(args), schedule: callback => scheduled.push(callback),
    });
    assert.equal(result, 'changed'); assert.equal(calls.length, 0); assert.equal(scheduled.length, 1);
    scheduled[0]();
    assert.deepEqual(calls, [['phase-4', 10, 'drag', 'Phase moved.']]);
});

test('canceled and unchanged native drops do not mutate the draft', () => {
    const calls = []; const onReposition = (...args) => calls.push(args);
    assert.equal(applyNativePhaseDrop({ source: { id: 'phase-2', initialIndex: 1, index: 1 }, canceled: false,
        onReposition, schedule: callback => callback() }), 'unchanged');
    assert.equal(applyNativePhaseDrop({ source: { id: 'phase-2', initialIndex: 1, index: 5 }, canceled: true,
        onReposition, schedule: callback => callback() }), 'canceled');
    assert.deepEqual(calls, []);
});

test('phase drag runtime is locally pinned, licensed and offline-packaged', async () => {
    const [manifest, lock, notices, worker, packaging] = await Promise.all([
        readFile(new URL('../tools/editor-phase-dndkit/package.json', import.meta.url), 'utf8').then(JSON.parse),
        readFile(new URL('../tools/editor-phase-dndkit/package-lock.json', import.meta.url), 'utf8').then(JSON.parse),
        readFile(new URL('../src/THIRD_PARTY_NOTICES.txt', import.meta.url), 'utf8'),
        readFile(new URL('../src/service-worker.js', import.meta.url), 'utf8'),
        readFile(new URL('../tools/release/package.mjs', import.meta.url), 'utf8'),
    ]);
    assert.equal(manifest.dependencies['@dnd-kit/dom'], '0.5.3');
    assert.equal(lock.packages['node_modules/@dnd-kit/dom'].version, '0.5.3');
    assert.match(notices, /@dnd-kit\/dom[\s\S]*0\.5\.3[\s\S]*MIT License/);
    assert.match(worker, /editor-phase-drag\.mjs/); assert.match(worker, /editor-phase-dndkit-vendor\.mjs/);
    assert.match(packaging, /dynamicImports/); assert.doesNotMatch(packaging, /https?:\/\/.*dnd/i);
});
