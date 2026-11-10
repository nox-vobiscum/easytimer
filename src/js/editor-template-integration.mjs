import {
    EDITOR_KINDS,
    EDITOR_SCHEMA_VERSION,
    validateTemplate,
} from './editor-domain.mjs';
import {
    insertTemplateInRecord,
    updateTemplateInRecord,
} from './editor-storage.mjs';

const fail = code => { throw new Error(code); };
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function exactOptions(value, fields) {
    if (!isObject(value)
        || Object.keys(value).length !== fields.length
        || fields.some(field => !Object.hasOwn(value, field))) fail('invalidData');
}

function nativeTemplate(prepared, revision) {
    if (!isObject(prepared)) fail('invalidData');
    const { id, ...plan } = prepared;
    return validateTemplate({
        schemaVersion: EDITOR_SCHEMA_VERSION,
        kind: EDITOR_KINDS.TEMPLATE,
        id,
        revision,
        plan,
    });
}

export function createNativeEditorTemplateIntegration({ writer } = {}) {
    if (!writer || typeof writer.write !== 'function') fail('invalidWriter');

    return Object.freeze({
        async createTemplate(prepared, options) {
            exactOptions(options, ['expectedAggregateRevision']);
            const template = nativeTemplate(prepared, 1);
            return writer.write(record => insertTemplateInRecord(record, {
                template,
                expectedAggregateRevision: options.expectedAggregateRevision,
            }));
        },

        async updateTemplate(prepared, options) {
            exactOptions(options, ['expectedAggregateRevision', 'expectedTemplateRevision']);
            const template = nativeTemplate(prepared, options.expectedTemplateRevision);
            return writer.write(record => updateTemplateInRecord(record, {
                template,
                expectedAggregateRevision: options.expectedAggregateRevision,
                expectedTemplateRevision: options.expectedTemplateRevision,
            }));
        },
    });
}
