import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflowURL = new URL('../.github/workflows/deploy.yaml', import.meta.url);
const workflow = await readFile(workflowURL, 'utf8');

function pushPaths(yaml) {
    const lines = yaml.split(/\r?\n/);
    const paths = [];
    let inPush = false;
    let inPaths = false;
    for (const line of lines) {
        if (line === '  push:') { inPush = true; continue; }
        if (inPush && /^  \S/.test(line)) break;
        if (inPush && line === '    paths:') { inPaths = true; continue; }
        if (inPaths) {
            const match = line.match(/^      - '([^']+)'$/);
            if (match) paths.push(match[1]);
            else if (line.trim()) break;
        }
    }
    return paths;
}

function matches(path, pattern) {
    if (pattern.endsWith('/**')) {
        const prefix = pattern.slice(0, -3);
        return path === prefix || path.startsWith(`${prefix}/`);
    }
    return path === pattern;
}

const paths = pushPaths(workflow);
const triggers = changed => changed.some(file => paths.some(pattern => matches(file, pattern)));

test('staging workflow remains develop-only with a conservative dependency allowlist', () => {
    assert.match(workflow, /push:\r?\n    branches: \[ develop \]\r?\n    paths:/);
    assert.deepEqual(paths, [
        'src/**',
        'tools/release/**',
        'tests/**',
        '.github/workflows/**',
        '.github/actions/**',
        'package.json',
        'package-lock.json',
        'npm-shrinkwrap.json',
        '.gitattributes',
    ]);
});

test('documentation-only changes do not trigger staging', () => {
    for (const files of [
        ['README.md'],
        ['CHANGELOG.md'],
        ['docs/backlog.md'],
        ['docs/archive/implementation/example.md'],
        ['README.md', 'CHANGELOG.md', 'docs/BRIEFING.md', 'docs/archive/investigations/example.md'],
    ]) assert.equal(triggers(files), false, files.join(', '));
});

test('application, packaging, validation and deployment changes trigger staging', () => {
    for (const files of [
        ['src/js/app.js'],
        ['src/css/styles.css'],
        ['src/service-worker.js'],
        ['src/assets/branding/new-icon.png'],
        ['tools/release/package.mjs'],
        ['tools/release/new-validator.mjs'],
        ['tests/packaging.test.mjs'],
        ['tests/new-release-check.test.mjs'],
        ['.github/workflows/deploy.yaml'],
        ['.github/workflows/deploy-production.yaml'],
        ['.github/actions/release-check/action.yml'],
        ['package.json'],
        ['package-lock.json'],
        ['npm-shrinkwrap.json'],
        ['.gitattributes'],
        ['docs/backlog.md', 'src/js/app.js'],
    ]) assert.equal(triggers(files), true, files.join(', '));
});
