import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";
import { createSpikeServer } from "./server.mjs";
import { resolveOverTypeBrowserExports } from "./overtype-adapter.mjs";
import { normalizeSafePreviewHref, SAFE_PREVIEW_ELEMENTS } from "./preview-policy.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const read = (name, encoding = "utf8") => readFile(path.join(ROOT, name), encoding);
let server;
let baseUrl;

before(async () => {
  server = createSpikeServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test("pins the independently verified OverType 2.9.0 browser artifact", async () => {
  const artifact = await read("vendor/overtype.min.js", null);
  assert.equal(artifact.byteLength, 157887);
  assert.equal(createHash("sha256").update(artifact).digest("hex").toUpperCase(), "4FB8CD12AEA96708CB0078018E84861FB5976E16038BA5682180EDF7D992498A");
});

test("resolves the actual browser globals emitted by the pinned distribution", async () => {
  const context = { document: {} };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(await read("vendor/overtype.min.js"), context);

  assert.equal(typeof context.OverType, "function");
  assert.equal(context.OverType.OverType, undefined);
  assert.equal(typeof context.toolbarButtons, "object");
  const { OverTypeEditor, toolbarButtons } = resolveOverTypeBrowserExports(context);
  assert.equal(OverTypeEditor, context.OverType);
  assert.equal(toolbarButtons, context.toolbarButtons);
  assert.deepEqual(
    [toolbarButtons.bold.name, toolbarButtons.italic.name, toolbarButtons.bulletList.name, toolbarButtons.orderedList.name],
    ["bold", "italic", "bulletList", "orderedList"]
  );
});

test("uses local page assets and exactly four native toolbar actions", async () => {
  const [html, source] = await Promise.all([read("index.html"), read("spike.mjs")]);
  assert.match(html, /src="\.\/vendor\/overtype\.min\.js"/);
  assert.match(html, /src="\.\/spike\.mjs"/);
  assert.doesNotMatch(html, /https?:\/\//i);
  assert.match(source, /toolbarButtons: \[toolbarButtons\.bold, toolbarButtons\.italic, toolbarButtons\.bulletList, toolbarButtons\.orderedList\]/);
  assert.match(source, /linkPaste: false/);
  assert.match(source, /spellcheck: true/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|document\.cookie|fetch\(|XMLHttpRequest|WebSocket/);
});

test("uses a minimal preview element, attribute and absolute HTTP(S) URL policy", async () => {
  assert.deepEqual([...SAFE_PREVIEW_ELEMENTS], ["P", "BR", "STRONG", "EM", "UL", "OL", "LI", "A"]);
  assert.equal(normalizeSafePreviewHref("https://example.test/notes?q=one"), "https://example.test/notes?q=one");
  assert.equal(normalizeSafePreviewHref("HTTP://example.test/path"), "http://example.test/path");
  for (const unsafe of [
    "//example.test/path",
    "/relative/path",
    "#fragment",
    "mailto:notes@example.test",
    "javascript:alert(1)",
    "data:text/html,unsafe",
    "https://user:secret@example.test/",
    " https://example.test/"
  ]) assert.equal(normalizeSafePreviewHref(unsafe), null, unsafe);

  const source = await read("spike.mjs");
  assert.match(source, /node\.tagName !== "A" \|\| attribute\.name\.toLowerCase\(\) !== "href"/);
  assert.doesNotMatch(source, /innerHTML\s*=\s*(?:markdown|callerDraft|editBuffer)/);
});

test("documents exact provenance and complete bundled dependency notices", async () => {
  const [provenance, notices] = await Promise.all([read("PROVENANCE.md"), read("THIRD_PARTY_NOTICES.txt")]);
  for (const expected of ["OverType", "2.9.0", "103e5eb025b229e01048a40e59a4ac67ad97fd06", "4FB8CD12AEA96708CB0078018E84861FB5976E16038BA5682180EDF7D992498A", "@floating-ui/dom", "@floating-ui/core", "@floating-ui/utils", "markdown-actions"]) {
    assert.ok(provenance.includes(expected), `missing provenance: ${expected}`);
  }
  for (const expected of ["Copyright (c) 2025 David Miranda", "Copyright (c) 2021-present Floating UI contributors", "Original Work Copyright (c) 2017-2018 GitHub, Inc.", "Derivative Work Copyright (c) 2024"]) {
    assert.ok(notices.includes(expected), `missing notice: ${expected}`);
  }
});

test("serves only allowlisted assets with restrictive offline headers", async () => {
  for (const route of ["/", "/index.html", "/spike.css", "/spike.mjs", "/overtype-adapter.mjs", "/preview-policy.mjs", "/vendor/overtype.min.js"]) {
    const response = await fetch(`${baseUrl}${route}`);
    assert.equal(response.status, 200, route);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const policy = response.headers.get("content-security-policy");
    assert.match(policy, /script-src 'self'/);
    assert.match(policy, /style-src 'self' 'unsafe-inline'/);
    assert.match(policy, /connect-src 'none'/);
    assert.doesNotMatch(policy, /script-src[^;]*'unsafe-inline'/);
  }
  assert.equal((await fetch(`${baseUrl}/src/index.html`)).status, 404);
  assert.equal((await fetch(`${baseUrl}/`, { method: "POST" })).status, 405);
});

test("does not contain runtime loaders or CDN references", async () => {
  const artifact = await read("vendor/overtype.min.js");
  assert.doesNotMatch(artifact, /\b(?:fetch|XMLHttpRequest|WebSocket|importScripts)\s*\(/);
  assert.doesNotMatch(artifact, /(?:cdn\.jsdelivr\.net|unpkg\.com|fonts\.(?:googleapis|gstatic)\.com)/i);
});
