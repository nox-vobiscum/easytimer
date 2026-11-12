import {
    EDITOR_KINDS,
    EDITOR_SCHEMA_VERSION,
    validateTemplate,
} from './editor-domain.mjs';
import {
    deleteTemplateInRecord,
    insertTemplateInRecord,
    updateTemplateInRecord,
} from './editor-storage.mjs';

const fail = code => { throw new Error(code); };
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const uncertainWrites = new Set(['storageUnconfirmed', 'storageReadback', 'lockRequest']);

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
    if (!writer || typeof writer.read !== 'function' || typeof writer.write !== 'function') fail('invalidWriter');

    const readWorkspace = async () => structuredClone(await writer.read());

    async function writeOperation(operation, transform) {
        let source = null;
        let target = null;
        try {
            return await writer.write(record => {
                source = structuredClone(record);
                target = transform(record);
                return target;
            });
        } catch (error) {
            if (target !== null && uncertainWrites.has(error?.message)) {
                const uncertain = new Error(error.message);
                uncertain.reconciliation = structuredClone({ operation, source, target });
                throw uncertain;
            }
            throw error;
        }
    }

    return Object.freeze({
        readWorkspace,

        async readLibrary() {
            const record = await readWorkspace();
            return structuredClone({
                revision: record.revision,
                templates: record.templates,
            });
        },

        async createTemplate(prepared, options) {
            exactOptions(options, ['expectedAggregateRevision']);
            const template = nativeTemplate(prepared, 1);
            const operation = {
                kind: 'create', template,
                expectedAggregateRevision: options.expectedAggregateRevision,
            };
            return writeOperation(operation, record => insertTemplateInRecord(record, {
                template,
                expectedAggregateRevision: options.expectedAggregateRevision,
            }));
        },

        async updateTemplate(prepared, options) {
            exactOptions(options, ['expectedAggregateRevision', 'expectedTemplateRevision']);
            const template = nativeTemplate(prepared, options.expectedTemplateRevision);
            const operation = {
                kind: 'update', template,
                expectedAggregateRevision: options.expectedAggregateRevision,
                expectedTemplateRevision: options.expectedTemplateRevision,
            };
            return writeOperation(operation, record => updateTemplateInRecord(record, {
                template,
                expectedAggregateRevision: options.expectedAggregateRevision,
                expectedTemplateRevision: options.expectedTemplateRevision,
            }));
        },

        async deleteTemplate(templateId, options) {
            exactOptions(options, ['expectedAggregateRevision', 'expectedTemplateRevision']);
            const operation = {
                kind: 'delete', templateId,
                expectedAggregateRevision: options.expectedAggregateRevision,
                expectedTemplateRevision: options.expectedTemplateRevision,
            };
            return writeOperation(operation, record => deleteTemplateInRecord(record, {
                templateId,
                expectedAggregateRevision: options.expectedAggregateRevision,
                expectedTemplateRevision: options.expectedTemplateRevision,
            }));
        },
    });
}
