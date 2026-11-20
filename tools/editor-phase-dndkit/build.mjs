import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const outfile = resolve(root, '../../src/js/editor-phase-dndkit-vendor.mjs');
await build({
    entryPoints: [resolve(root, 'entry.mjs')],
    outfile,
    bundle: true,
    format: 'esm',
    minify: true,
    legalComments: 'none',
    target: ['chrome110', 'firefox115', 'safari16'],
    charset: 'utf8',
    logLevel: 'warning',
});
const bytes = await readFile(outfile);
console.log(JSON.stringify({
    file: 'src/js/editor-phase-dndkit-vendor.mjs',
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
}, null, 2));
