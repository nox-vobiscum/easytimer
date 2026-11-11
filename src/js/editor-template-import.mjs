import { validateTemplate } from './editor-domain.mjs';
import { EDITOR_PORTABILITY_KINDS, parseEditorPortability } from './editor-portability.mjs';
import { insertTemplateInRecord, validateEditorStoreRecord } from './editor-storage.mjs';

const fail = code => { throw new Error(code); };
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const storageErrors = new Set([
    'storageRead', 'storageWrite', 'storageQuota', 'storageUnconfirmed',
    'storageReadback', 'storageValidation', 'storageBlocked',
]);
const lockErrors = new Set(['lockUnavailable', 'lockBusy', 'lockRequest']);
const validationErrors = new Set([
    'invalidData', 'invalidRevision', 'invalidStoreRevision', 'invalidImportCandidate',
    'invalidImportReconciliation', 'invalidCategory', 'invalidNotes', 'invalidResource',
    'name', 'phaseTitle', 'duration', 'phasesRequired', 'totalLimit',
    'portabilityEmpty', 'portabilityJSON', 'portabilitySize', 'portabilityInvalid',
    'portabilityVersion', 'portabilityKind', 'unsupportedImportKind',
]);

function exactFields(value, fields, code) {
    if (!isObject(value) || Object.keys(value).length !== fields.length
        || fields.some(field => !Object.hasOwn(value, field))) fail(code);
}

function errorDetails(error) {
    const code = error?.message;
    if (code === 'conflict' || code === 'duplicateId') return { type: 'conflict', code };
    if (storageErrors.has(code)) return { type: 'storage', code };
    if (lockErrors.has(code)) return { type: 'lock', code };
    if (validationErrors.has(code)) return { type: 'validation', code };
    return { type: 'unexpected', code: 'unexpectedError' };
}

function validateCandidate(candidate) {
    exactFields(candidate, ['expectedAggregateRevision', 'template'], 'invalidImportCandidate');
    if (!Number.isSafeInteger(candidate.expectedAggregateRevision)
        || candidate.expectedAggregateRevision < 0) fail('invalidStoreRevision');
    const template = validateTemplate(candidate.template);
    if (template.revision !== 1) fail('invalidRevision');
    return { expectedAggregateRevision: candidate.expectedAggregateRevision, template };
}

// No cached library or pending registry: the caller retains the isolated review
// candidate and, after an uncertain acknowledgement, the full reconciliation ticket.
export function createNativeTemplateImportService({ writer, createId = () => crypto.randomUUID() } = {}) {
    if (!writer || typeof writer.read !== 'function' || typeof writer.write !== 'function'
        || typeof createId !== 'function') fail('invalidImportService');

    return Object.freeze({
        prepareImport(text, expectedAggregateRevision) {
            try {
                const document = parseEditorPortability(text);
                if (document.kind !== EDITOR_PORTABILITY_KINDS.TEMPLATE) fail('unsupportedImportKind');
                const id = createId();
                if (id === document.template.id) fail('duplicateId');
                const candidate = validateCandidate({
                    expectedAggregateRevision,
                    template: { ...document.template, id, revision: 1 },
                });
                return { status: 'prepared', candidate };
            } catch (error) {
                return { status: 'error', error: errorDetails(error) };
            }
        },

        async persistImport(candidate) {
            let valid;
            let source = null;
            let target = null;
            try {
                valid = validateCandidate(candidate);
                const record = await writer.write(current => {
                    source = structuredClone(current);
                    target = insertTemplateInRecord(current, {
                        template: valid.template,
                        expectedAggregateRevision: valid.expectedAggregateRevision,
                    });
                    return target;
                });
                return { status: 'confirmed', templateId: valid.template.id, record };
            } catch (error) {
                const details = errorDetails(error);
                // A LockManager rejection after its callback ran may also hide a
                // completed write. Never turn that acknowledgement into success.
                if (target !== null && ['storageUnconfirmed', 'storageReadback', 'lockRequest'].includes(details.code)) {
                    return {
                        status: 'uncertain',
                        error: details,
                        reconciliation: structuredClone({ candidate: valid, source, target }),
                    };
                }
                return {
                    status: 'error', error: details,
                    ...(valid ? { candidate: structuredClone(valid) } : {}),
                };
            }
        },

        async reconcileImport(ticket) {
            let valid;
            try {
                exactFields(ticket, ['candidate', 'source', 'target'], 'invalidImportReconciliation');
                const candidate = validateCandidate(ticket.candidate);
                const source = validateEditorStoreRecord(ticket.source);
                const target = validateEditorStoreRecord(ticket.target);
                const expected = insertTemplateInRecord(source, {
                    template: candidate.template,
                    expectedAggregateRevision: candidate.expectedAggregateRevision,
                });
                if (JSON.stringify(target) !== JSON.stringify(expected)) fail('invalidImportReconciliation');
                valid = { candidate, source, target };
                const record = await writer.read();
                const raw = JSON.stringify(record);
                const status = raw === JSON.stringify(target) ? 'confirmed'
                    : raw === JSON.stringify(source) ? 'absent' : 'unresolved';
                return {
                    status, templateId: candidate.template.id, record,
                    ...(status === 'unresolved' ? { reconciliation: structuredClone(valid) } : {}),
                };
            } catch (error) {
                return {
                    status: valid ? 'unresolved' : 'error', error: errorDetails(error),
                    ...(valid ? { reconciliation: structuredClone(valid) } : {}),
                };
            }
        },
    });
}
