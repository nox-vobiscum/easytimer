import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, readFile, writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { packageProduction, verifyArtifact, validateProduction, sourceRoot } from '../tools/release/package.mjs';

test('production packaging is repeatable, allowlisted and checksum-verifiable across checkout line endings', async () => {
    const a = await packageProduction(), b = await packageProduction();
    assert.equal(a.inventory.files.length, 18);
    assert.deepEqual(a.inventory, b.inventory);
    assert.deepEqual(await verifyArtifact(a.directory), a.inventory);
    const source = await mkdtemp(join(tmpdir(), 'easytimer-package-lines-'));
    await cp(sourceRoot, source, { recursive: true });
    const app = join(source, 'js/app.js');
    await writeFile(app, (await readFile(app, 'utf8')).replace(/\r?\n/g, '\r\n'));
    assert.deepEqual((await packageProduction({ source })).inventory, a.inventory);
    await assert.rejects(packageProduction({ output: a.directory }), /EEXIST/);
    await writeFile(join(a.directory, 'ftp', 'unexpected.txt'), 'not production');
    await assert.rejects(verifyArtifact(a.directory), /ARTIFACT_SCOPE_MISMATCH/);
    await unlink(join(a.directory, 'ftp', 'unexpected.txt'));
    await writeFile(join(a.webRoot, 'index.html'), 'changed');
    await assert.rejects(verifyArtifact(a.directory), /ARTIFACT_HASH_MISMATCH/);
});

test('packaging rejects the original version mismatch, missing files and unexpected runtime loading', async () => {
    const source = await mkdtemp(join(tmpdir(), 'easytimer-package-faults-'));
    await cp(sourceRoot, source, { recursive: true });
    const session = join(source, 'js/session.mjs'), original = await readFile(session, 'utf8');
    await writeFile(session, original.replace('templates.mjs?v=37', 'templates.mjs?v=35'));
    await assert.rejects(validateProduction(source), /DEPENDENCY_NOT_PRECACHED.*templates\.mjs\?v=35/);
    await writeFile(session, original + '\nimport { probe } from "../../tools/app-sync/account.mjs";\n');
    await assert.rejects(validateProduction(source), /DEPENDENCY_NOT_ALLOWED/);
    await writeFile(session, original + '\nimport("./unexpected.mjs");\n');
    await assert.rejects(validateProduction(source), /UNREVIEWED_IMPORT_SYNTAX|UNREVIEWED_RUNTIME_LOADING/);
    await writeFile(session, original);
    await unlink(join(source, 'assets/branding/favicon.ico'));
    await assert.rejects(validateProduction(source), /ENOENT.*favicon/);
});
