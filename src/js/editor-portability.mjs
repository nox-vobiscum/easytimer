import { validateTemplate } from './editor-domain.mjs';
import {
    EDITOR_STORE_SCHEMA_VERSION,
    validateEditorStoreRecord,
} from './editor-storage.mjs';

export const EDITOR_PORTABILITY_FORMAT_VERSION = 1;
export const EDITOR_PORTABILITY_KINDS = Object.freeze({
    BACKUP: 'editor-backup',
    TEMPLATE: 'editor-template',
    EXECUTION: 'editor-execution',
});
export const MAX_EDITOR_PORTABILITY_BYTES = 10 * 1024 * 1024;

const fail = code => { throw new Error(code); };
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function exactFields(value, fields) {
    if (!isObject(value)
        || Object.keys(value).length !== fields.length
        || fields.some(field => !Object.hasOwn(value, field))) fail('portabilityInvalid');
}

function validateBackupDocument(document) {
    exactFields(document, ['formatVersion', 'kind', 'record']);
    return {
        formatVersion: EDITOR_PORTABILITY_FORMAT_VERSION,
        kind: EDITOR_PORTABILITY_KINDS.BACKUP,
        record: validateEditorStoreRecord(document.record),
    };
}

function validateTemplateDocument(document) {
    exactFields(document, ['formatVersion', 'kind', 'template']);
    return {
        formatVersion: EDITOR_PORTABILITY_FORMAT_VERSION,
        kind: EDITOR_PORTABILITY_KINDS.TEMPLATE,
        template: validateTemplate(document.template),
    };
}

function validateExecutionSnapshot(entry, activeRuntime) {
    const record = validateEditorStoreRecord({
        schemaVersion: EDITOR_STORE_SCHEMA_VERSION,
        revision: 0,
        templates: [],
        executions: [entry],
        activeRuntime,
    });
    return {
        entry: record.executions[0],
        activeRuntime: record.activeRuntime,
    };
}

function validateExecutionDocument(document) {
    exactFields(document, ['formatVersion', 'kind', 'entry', 'activeRuntime']);
    return {
        formatVersion: EDITOR_PORTABILITY_FORMAT_VERSION,
        kind: EDITOR_PORTABILITY_KINDS.EXECUTION,
        ...validateExecutionSnapshot(document.entry, document.activeRuntime),
    };
}

function validateDocument(document) {
    if (!isObject(document)) fail('portabilityInvalid');
    if (document.formatVersion !== EDITOR_PORTABILITY_FORMAT_VERSION) fail('portabilityVersion');
    if (!Object.values(EDITOR_PORTABILITY_KINDS).includes(document.kind)) fail('portabilityKind');
    try {
        if (document.kind === EDITOR_PORTABILITY_KINDS.BACKUP) return validateBackupDocument(document);
        if (document.kind === EDITOR_PORTABILITY_KINDS.TEMPLATE) return validateTemplateDocument(document);
        return validateExecutionDocument(document);
    } catch (error) {
        if (typeof error?.message === 'string' && error.message.startsWith('portability')) throw error;
        fail('portabilityInvalid');
    }
}

function serialize(document) {
    const text = JSON.stringify(validateDocument(document), null, 2) + '\n';
    if (new TextEncoder().encode(text).byteLength > MAX_EDITOR_PORTABILITY_BYTES) fail('portabilitySize');
    return text;
}

export function serializeEditorBackup(record) {
    return serialize({
        formatVersion: EDITOR_PORTABILITY_FORMAT_VERSION,
        kind: EDITOR_PORTABILITY_KINDS.BACKUP,
        record,
    });
}

export function serializeEditorTemplate(template) {
    return serialize({
        formatVersion: EDITOR_PORTABILITY_FORMAT_VERSION,
        kind: EDITOR_PORTABILITY_KINDS.TEMPLATE,
        template,
    });
}

export function serializeEditorExecution(entry, activeRuntime = null) {
    return serialize({
        formatVersion: EDITOR_PORTABILITY_FORMAT_VERSION,
        kind: EDITOR_PORTABILITY_KINDS.EXECUTION,
        entry,
        activeRuntime,
    });
}

export function parseEditorPortability(text) {
    if (typeof text !== 'string' || !text.trim()) fail('portabilityEmpty');
    if (new TextEncoder().encode(text).byteLength > MAX_EDITOR_PORTABILITY_BYTES) fail('portabilitySize');
    let document;
    try { document = JSON.parse(text.replace(/^\uFEFF/, '')); }
    catch { fail('portabilityJSON'); }
    return structuredClone(validateDocument(document));
}
