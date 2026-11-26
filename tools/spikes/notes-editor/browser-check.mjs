import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { createSpikeServer } from "./server.mjs";

const candidates = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
].filter(Boolean);

async function freePort() {
  const probe = createServer();
  await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

const chromePath = candidates.find((candidate) => {
  try { return requireExists(candidate); } catch { return false; }
});

function requireExists(candidate) {
  return Boolean(process.getBuiltinModule("node:fs").existsSync(candidate));
}

if (!chromePath) throw new Error("No supported Chromium executable found.");

const appServer = createSpikeServer();
await new Promise((resolve) => appServer.listen(0, "127.0.0.1", resolve));
const appPort = appServer.address().port;
const debugPort = await freePort();
const profile = process.getBuiltinModule("node:fs").mkdtempSync(`${process.env.TEMP}\\easytimer-notes-spike-`);
const chrome = spawn(chromePath, [
  "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
  `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, "about:blank"
], { stdio: "ignore" });

async function json(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}

try {
  let tabs;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { tabs = await json(`http://127.0.0.1:${debugPort}/json`); break; } catch { await delay(100); }
  }
  const tab = tabs?.find((entry) => entry.type === "page");
  if (!tab) throw new Error("Chromium CDP page target was not available.");
  const socket = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let id = 0;
  const pending = new Map();
  const externalRequests = [];
  const cspErrors = [];
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      message.error ? reject(new Error(message.error.message)) : resolve(message.result);
    }
    if (message.method === "Network.requestWillBeSent" && !message.params.request.url.startsWith(`http://127.0.0.1:${appPort}`)) externalRequests.push(message.params.request.url);
    if (message.method === "Log.entryAdded" && /content security policy/i.test(message.params.entry.text)) cspErrors.push(message.params.entry.text);
  };
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const callId = ++id;
    pending.set(callId, { resolve, reject });
    socket.send(JSON.stringify({ id: callId, method, params }));
    setTimeout(() => { if (pending.delete(callId)) reject(new Error(`${method} timed out`)); }, 10000);
  });
  await call("Runtime.enable");
  await call("Page.enable");
  await call("Network.enable");
  await call("Log.enable");
  await call("Page.navigate", { url: `http://127.0.0.1:${appPort}/` });
  await delay(1000);
  const evaluate = async (expression) => (await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result.value;
  assert.equal(await evaluate("Boolean(window.notesEditorSpike)"), true);
  assert.equal(await evaluate("document.querySelector('style.overtype-styles')?.sheet?.cssRules.length > 0"), true);
  assert.equal(await evaluate("notesEditorSpike.open(); notesEditorSpike.state().toolbarActions.length"), 4);
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.overtype-wrapper')).position"), "relative");
  const original = await evaluate("notesEditorSpike.state().callerDraft");
  assert.equal(await evaluate("notesEditorSpike.setEditorValue('**Bold** and *italic*\\n\\n- one\\n- two'); notesEditorSpike.state().callerDraft"), original);
  assert.equal(await evaluate("notesEditorSpike.apply(); notesEditorSpike.state().callerDraft"), "**Bold** and *italic*\n\n- one\n- two");
  assert.equal(await evaluate("notesEditorSpike.open(); notesEditorSpike.setEditorValue('discard me'); notesEditorSpike.cancel(); notesEditorSpike.state().callerDraft"), "**Bold** and *italic*\n\n- one\n- two");
  await evaluate("notesEditorSpike.open(); notesEditorSpike.setEditorValue('<img src=x onerror=window.__unsafe=1> [bad](javascript:alert(1)) [relative](//example.test/path)'); notesEditorSpike.apply()");
  assert.equal(await evaluate("Boolean(window.__unsafe)"), false);
  assert.equal(await evaluate("/javascript:/i.test(notesEditorSpike.state().previewHtml)"), false);
  assert.equal(await evaluate("[...document.querySelectorAll('#caller-preview a')].every((link) => !link.hasAttribute('href'))"), true);
  await evaluate("notesEditorSpike.open(); notesEditorSpike.setEditorValue('[safe](https://example.test/path)'); notesEditorSpike.apply()");
  assert.deepEqual(await evaluate("[...document.querySelector('#caller-preview a').attributes].map(({name}) => name)"), ["href"]);
  await evaluate("notesEditorSpike.open(); notesEditorSpike.cancel(); notesEditorSpike.open(); notesEditorSpike.cancel()");
  assert.equal(await evaluate("notesEditorSpike.state().createdInstances === notesEditorSpike.state().destroyedInstances"), true);
  assert.deepEqual(externalRequests, []);
  assert.deepEqual(cspErrors, []);
  console.log("OverType browser spike: 1 browser scenario passed; no external requests.");
  socket.close();
} finally {
  chrome.kill();
  await new Promise((resolve) => appServer.close(resolve));
  process.getBuiltinModule("node:fs").rmSync(profile, { recursive: true, force: true });
}
