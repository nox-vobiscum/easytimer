# OverType 2.9.0 Notes Editor spike

This development-only page evaluates OverType as a possible Markdown notes editor. It is not linked from, bundled with, or cached by the production application.

## Run locally

From the repository root:

```powershell
node tools/spikes/notes-editor/server.mjs
```

Open `http://127.0.0.1:4178/`. To use another isolated origin, set `EASYTIMER_NOTES_SPIKE_PORT` before starting the server. The server binds only to `127.0.0.1` and exposes only the four page assets.

No browser data is persisted. Reloading resets the test draft. The page makes no runtime network requests and installs no Service Worker, so it works with network access disabled while the local server remains available. This is not a persistent offline-reload or PWA claim.

## Manual Firefox checks

1. Open the page in a new Firefox profile or private window.
2. Open the editor and confirm that only Bold, Italic, Bullet List, and Numbered List are present.
3. Select text and exercise each button, direct Markdown entry, paragraphs, line breaks, copy/paste, keyboard shortcuts, and spellcheck.
4. Confirm that the caller-owned draft does not change while typing. Apply, then confirm that it changes to the exact Markdown source.
5. Edit again and cancel; confirm that the applied draft remains unchanged.
6. Make an edit and use Close or Escape; reject the warning and confirm that editing continues, then accept it and confirm that the draft remains unchanged.
7. Repeat open/close cycles, switch between light and dark themes, and test a narrow Responsive Design Mode viewport.
8. Paste raw HTML and Markdown links using dangerous schemes. Confirm that no script executes and no executable link appears in the read-only preview.
9. In Firefox Network Monitor, confirm that every request is to the current `127.0.0.1` origin.

## Scope

The spike keeps a caller-owned string and a separate editor buffer. Apply copies Markdown into the caller draft; Cancel discards only the buffer. It deliberately does not use localStorage, IndexedDB, cookies, the easyTimer Store, production navigation, or production CSS.

OverType injects its own stylesheet and uses element-level styles for layout and themes. The isolated server therefore permits inline CSS while continuing to prohibit inline scripts, network connections, images, fonts, forms, frames, and all resources outside its explicit local route allowlist. This exception applies only to this development spike; it does not change or propose a change to the production CSP.

See `PROVENANCE.md` and `THIRD_PARTY_NOTICES.txt` for the pinned artifact and licenses.
