import { readFile, mkdir, writeFile, readdir, lstat, mkdtemp } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { resolve, dirname, relative, join, posix } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const sourceRoot = fileURLToPath(new URL('../../src/', import.meta.url));
export const productionFiles = Object.freeze([
    'about.html', 'faq.html', 'imprint.html', 'privacy.html', 'js/info.js', 'js/header.mjs',
    'index.html', 'css/styles.css', 'js/app.js', 'js/planner.js', 'js/portability.mjs',
    'js/recovery.mjs', 'js/session.mjs', 'js/templates.mjs', 'js/time-visuals.mjs', 'js/timer.mjs',
    'service-worker.js', 'manifest.webmanifest', 'assets/branding/favicon.ico',
    'assets/branding/apple-touch-icon.png', 'assets/branding/android-chrome-192x192.png',
    'assets/branding/android-chrome-512x512.png', 'assets/branding/stopwatch-header-standard-96.png',
    'assets/branding/stopwatch-header-dark-96.png',
].sort());
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const check = (condition, reason) => { if (!condition) throw Error(reason); };

// Only syntax currently used by this static application is supported. New runtime
// loading mechanisms require explicit review rather than silently bypassing checks.
export async function validateProduction(root = sourceRoot) {
    const contents = new Map();
    for (const file of productionFiles) {
        const path = join(root, file);
        check((await lstat(path)).isFile(), `REQUIRED_REGULAR_FILE: ${file}`);
        const bytes = await readFile(path);
        contents.set(file, /\.(?:html|css|js|mjs|webmanifest)$/.test(file)
            ? Buffer.from(bytes.toString('utf8').replaceAll('\r\n', '\n')) : bytes);
    }
    const references = [];
    const add = (from, url) => {
        check(url.startsWith('./') || !/^(?:[a-z]+:|\/|#)/i.test(url), `UNSUPPORTED_DEPENDENCY: ${from}: ${url}`);
        const target = posix.normalize(posix.join(posix.dirname(from), url));
        const file = target.split(/[?#]/)[0];
        check(productionFiles.includes(file), `DEPENDENCY_NOT_ALLOWED: ${from}: ${url}`);
        references.push({ from, url: target, file });
    };
    for (const file of productionFiles) {
        const text = contents.get(file).toString();
        if (/\.(?:mjs|js)$/.test(file) && file !== 'service-worker.js') {
            const imports = [...text.matchAll(/^import\s+.*?from\s+['"]([^'"]+)['"]/gm)];
            check(imports.length === [...text.matchAll(/^\s*import\b/gm)].length, `UNREVIEWED_IMPORT_SYNTAX: ${file}`);
            for (const match of imports) add(file, match[1]);
            check(!/\bimport\s*\(|\bexport\s+.*?\bfrom\s|^import\s*['"]|\b(?:fetch|importScripts|Worker|WebSocket|XMLHttpRequest)\s*\(/m.test(text), `UNREVIEWED_RUNTIME_LOADING: ${file}`);
            check(!/accounts\.google\.com|www\.googleapis\.com|googleusercontent\.com/.test(text), `GOOGLE_RUNTIME_DEPENDENCY: ${file}`);
        }
        if (file.endsWith('.html') || file === 'js/header.mjs') {
            // Shared header markup is mounted in root-level documents, not under js/.
            const document = file === 'js/header.mjs' ? 'index.html' : file;
            for (const match of text.matchAll(/<(?:script|link|img)\b[^>]*?\b(?:src|href)="([^"]+)"/g)) add(document, match[1]);
            for (const match of text.matchAll(/<a\b[^>]*?\bhref="([^"]+)"/g)) {
                if (!/^(?:https?:|mailto:|#|\?)/.test(match[1]) && match[1] !== './') add(document, match[1]);
            }
            check(!/\bon\w+\s*=|<script\b(?![^>]*\bsrc=)/i.test(text), 'UNREVIEWED_INLINE_SCRIPT');
        }
        if (file.endsWith('.css')) {
            check(!/@import\b/i.test(text), `UNREVIEWED_CSS_IMPORT: ${file}`);
            for (const match of text.matchAll(/url\(\s*['"]?([^'"\s)]+)['"]?\s*\)/g)) add(file, match[1]);
        }
    }
    const manifest = JSON.parse(contents.get('manifest.webmanifest'));
    check(manifest.start_url === './' && manifest.scope === './', 'UNREVIEWED_MANIFEST_SCOPE');
    for (const icon of manifest.icons) add('manifest.webmanifest', icon.src);
    const worker = contents.get('service-worker.js').toString();
    const shell = worker.match(/const APP_SHELL = (\[[\s\S]*?\]);/);
    check(shell, 'PRECACHE_NOT_FOUND');
    const cacheURLs = [...shell[1].matchAll(/'([^']+)'/g)].map(match => match[1].replace(/^\.\//, ''));
    for (const url of cacheURLs.filter(Boolean)) add('service-worker.js', url);
    for (const reference of references.filter(ref => ref.from !== 'service-worker.js')) {
        check(cacheURLs.includes(reference.url), `DEPENDENCY_NOT_PRECACHED: ${reference.from}: ${reference.url}`);
    }
    for (const file of productionFiles) check(references.some(ref => ref.file === file) || file === 'service-worker.js', `UNUSED_ALLOWLIST_FILE: ${file}`);
    const version = worker.match(/const CACHE_NAME = 'easytimer-shell-v(\d+)'/)?.[1];
    check(version && cacheURLs.includes(`js/app.js?v=${version}`) && cacheURLs.includes(`css/styles.css?v=${version}`), 'PWA_VERSION_MISMATCH');
    return { contents, version };
}

export async function packageProduction({ source = sourceRoot, output } = {}) {
    const { contents, version } = await validateProduction(source);
    const directory = output ? resolve(output) : await mkdtemp(join(tmpdir(), 'easytimer-release-'));
    if (output) await mkdir(directory); // Refuse existing targets; never delete or overwrite a release.
    const inventory = { formatVersion: 1, pwaVersion: Number(version), files: [] };
    for (const [file, bytes] of contents) {
        const target = join(directory, 'ftp', 'src', file);
        await mkdir(dirname(target), { recursive: true }); await writeFile(target, bytes, { flag: 'wx' });
        inventory.files.push({ path: `src/${file}`, bytes: bytes.length, sha256: hash(bytes) });
    }
    await writeFile(join(directory, 'inventory.json'), JSON.stringify(inventory, null, 2) + '\n', { flag: 'wx' });
    await verifyArtifact(directory);
    return { directory, webRoot: join(directory, 'ftp', 'src'), inventory };
}

export async function verifyArtifact(directory) {
    const inventory = JSON.parse(await readFile(join(directory, 'inventory.json'), 'utf8'));
    check(inventory.formatVersion === 1 && Array.isArray(inventory.files), 'INVALID_INVENTORY');
    const expected = productionFiles.map(file => `src/${file}`);
    check(JSON.stringify(inventory.files.map(file => file.path)) === JSON.stringify(expected), 'INVENTORY_SCOPE_MISMATCH');
    const actual = [];
    async function walk(root) {
        for (const entry of await readdir(root, { withFileTypes: true })) {
            const path = join(root, entry.name);
            check(!entry.isSymbolicLink(), 'ARTIFACT_SYMLINK');
            if (entry.isDirectory()) await walk(path);
            else actual.push(relative(join(directory, 'ftp'), path).replaceAll('\\', '/'));
        }
    }
    await walk(join(directory, 'ftp'));
    check(JSON.stringify(actual.sort()) === JSON.stringify(expected), 'ARTIFACT_SCOPE_MISMATCH');
    for (const file of inventory.files) {
        const bytes = await readFile(join(directory, 'ftp', file.path));
        check(bytes.length === file.bytes && hash(bytes) === file.sha256, `ARTIFACT_HASH_MISMATCH: ${file.path}`);
    }
    const validated = await validateProduction(join(directory, 'ftp', 'src'));
    check(Number(validated.version) === inventory.pwaVersion, 'INVENTORY_VERSION_MISMATCH');
    return inventory;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    const [option, value, ...extra] = process.argv.slice(2);
    check(!extra.length && (!option || ['--output', '--verify'].includes(option)) && (!option || value), 'USAGE: package.mjs [--output NEW_DIRECTORY | --verify DIRECTORY]');
    if (option === '--verify') console.log(JSON.stringify(await verifyArtifact(resolve(value)), null, 2));
    else {
        const result = await packageProduction({ output: value });
        console.log(JSON.stringify({ directory: result.directory, webRoot: result.webRoot, files: result.inventory.files.length, pwaVersion: result.inventory.pwaVersion }, null, 2));
    }
}
