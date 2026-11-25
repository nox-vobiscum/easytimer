import {
    AutoScroller,
    DragDropManager,
    Feedback,
    KeyboardSensor,
    PointerActivationConstraints,
    PointerSensor,
    Sortable,
} from './editor-phase-dndkit-vendor.mjs';
import { phaseDisplayTitle } from './editor-domain.mjs';

const messages = {
    en: {
        moving: title => `Moving ${title}.`,
        moved: (title, position) => `${title} moved to position ${position}.`,
        unchanged: title => `${title} remains in the same position.`,
        canceled: 'Move canceled. The phase order is unchanged.',
    },
    de: {
        moving: title => `${title} wird verschoben.`,
        moved: (title, position) => `${title} wurde an Position ${position} verschoben.`,
        unchanged: title => `${title} bleibt an derselben Position.`,
        canceled: 'Verschieben abgebrochen. Die Phasenreihenfolge bleibt unverändert.',
    },
};

export function nativePhaseRows(list) {
    return [...list.children].filter(row => row._nativePhase);
}

export function applyNativePhaseDrop({ source, canceled, announcement, onReposition, schedule = queueMicrotask }) {
    if (typeof onReposition !== 'function' || typeof schedule !== 'function') throw new Error('invalidNativePhaseDrop');
    if (!source || canceled) return 'canceled';
    if (source.initialIndex === source.index) return 'unchanged';
    const phaseId = String(source.id); const position = source.index + 1;
    schedule(() => onReposition(phaseId, position, 'drag', announcement));
    return 'changed';
}

export function createNativePhaseDragging({ list, getDraft, onReposition, announce, language = 'en' }) {
    if (!(list instanceof HTMLOListElement) || typeof getDraft !== 'function'
        || typeof onReposition !== 'function' || typeof announce !== 'function' || !messages[language]) {
        throw new Error('invalidNativePhaseDragging');
    }
    let destroyed = false;
    const manager = new DragDropManager({
        plugins: defaults => [
            ...defaults,
            AutoScroller.configure({ acceleration: 18, threshold: { x: 0, y: 0.18 } }),
        ],
        sensors: [
            PointerSensor.configure({
                activationConstraints: [new PointerActivationConstraints.Distance({ value: 7 })],
            }),
            KeyboardSensor,
        ],
    });
    const sortables = nativePhaseRows(list).map((row, index) => new Sortable({
        id: row.dataset.nativePhaseId,
        index,
        group: 'native-editor-phases',
        element: row,
        handle: row._nativePhase.dragHandle,
        data: { phaseId: row.dataset.nativePhaseId },
        transition: { duration: 180, easing: 'cubic-bezier(0.25, 1, 0.5, 1)' },
        plugins: defaults => [
            ...defaults,
            Feedback.configure({ feedback: 'clone', dropAnimation: { duration: 180, easing: 'ease-out' } }),
        ],
    }, manager));
    const cleanups = [
        manager.monitor.addEventListener('dragstart', ({ operation }) => {
            const phase = getDraft().template.phases.find(item => item.id === operation.source?.id);
            if (phase) announce(messages[language].moving(phaseDisplayTitle(phase.title)));
        }),
        manager.monitor.addEventListener('dragend', ({ operation, canceled }) => {
            if (destroyed) return;
            const source = operation.source;
            if (!source || canceled) { announce(messages[language].canceled); return; }
            const phaseId = String(source.id);
            const phase = getDraft().template.phases.find(item => item.id === phaseId);
            if (!phase) return;
            const success = messages[language].moved(phaseDisplayTitle(phase.title), source.index + 1);
            const result = applyNativePhaseDrop({
                source, canceled, announcement: success, onReposition,
                schedule: callback => queueMicrotask(() => { if (!destroyed) callback(); }),
            });
            if (result === 'unchanged') {
                announce(messages[language].unchanged(phaseDisplayTitle(phase.title)));
                requestAnimationFrame(() => list.querySelector(`[data-native-phase-id="${CSS.escape(phaseId)}"]`)
                    ?._nativePhase.dragHandle.focus({ preventScroll: true }));
                return;
            }
        }),
    ];
    return () => {
        if (destroyed) return;
        destroyed = true;
        for (const cleanup of cleanups) cleanup();
        for (const sortable of sortables) sortable.destroy();
        manager.destroy();
    };
}
