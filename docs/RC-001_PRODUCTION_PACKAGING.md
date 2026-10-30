# RC-001 — Local Production Packaging and Offline Hardening

> **Current context (2026-10-30):** The deterministic 24-file package and
> offline safeguards are active in the verified PWA v62 staging and production
> pipelines. The local NO-GO wording below records the original RC-001 review
> stage and is preserved as historical evidence.

Based on `4b2de246712f855d21b3e986280be5efbe06457f`, on
`feature/rc-001-production-hardening`. Local RC-001 owner acceptance is COMPLETE
for PWA v54. This is not production authorization. Production remains NO-GO.

## Build and inspect

No package manager, framework or third-party build dependency is required. Use
Node.js 20 or newer from a clean checkout of the intended release commit:

```sh
node tools/release/package.mjs
node tools/release/package.mjs --output /absolute/path/to/a/new-release-directory
node tools/release/package.mjs --verify /absolute/path/to/a/new-release-directory
```

Without `--output`, the package is created in an OS temporary directory; the
command prints its location. Explicit output directories must not exist. No
existing directory is deleted or overwritten. Keep generated releases outside
the repository. Text line endings normalize to LF; binary bytes are preserved.
Sorted inventories contain no timestamps or machine paths, so identical source
content produces identical bytes and checksums across LF/CRLF checkouts.

`inventory.json` records PWA version, relative paths, byte counts and SHA-256 for
every file. `--verify` checks exact upload-tree membership, hashes and dependencies.
Archive the inventory with the release artifact and source commit identity.

The explicit allowlist contains exactly 18 files:

```text
src/assets/branding/android-chrome-192x192.png
src/assets/branding/android-chrome-512x512.png
src/assets/branding/apple-touch-icon.png
src/assets/branding/favicon.ico
src/assets/branding/stopwatch-header-dark-96.png
src/assets/branding/stopwatch-header-standard-96.png
src/css/styles.css
src/index.html
src/js/app.js
src/js/planner.js
src/js/portability.mjs
src/js/recovery.mjs
src/js/session.mjs
src/js/templates.mjs
src/js/time-visuals.mjs
src/js/timer.mjs
src/manifest.webmanifest
src/service-worker.js
```

Files are placed at `<release>/ftp/src/...`; serve `<release>/ftp/src/` as the
application webroot for local acceptance. The FTP upload root is `<release>/ftp/`.
The inventory stays outside that upload root. Tests, tools, documentation, local
configuration and the unused legacy SVG are absent from the artifact.

## Dependency and PWA checks

Packaging validates required regular files, static module imports, HTML assets,
CSS URL references, manifest icons and exact versioned precache membership. It
rejects dependencies outside the allowlist and unreviewed dynamic runtime-loading
forms. This is a focused check of the current static application, not a general
JavaScript parser or a security sandbox for arbitrary future code.

`session.mjs` now imports `templates.mjs?v=37`, matching every other consumer and
the precache. The previous v35 URL was absent from Cache Storage and could break
a true offline reload. Changed importer references and the PWA shell use v54;
unchanged planner/templates/portability versions remain v49/v37/v37. Timer,
Session and recovery logic do not change in RC-001.

## Local verification

```sh
node --test tests/*.test.mjs tools/app-sync/*.test.mjs tools/sync-poc/poc.test.mjs
node tests/artifact-offline-browser.mjs
node tests/browser-check.mjs
node tools/app-sync/browser-check.mjs
git diff --check
```

The full App/PWA suite can also test the artifact instead of source:

```powershell
$env:EASYTIMER_WEB_ROOT = 'C:\path\to\release\ftp\src'
node tests/browser-check.mjs
Remove-Item Env:EASYTIMER_WEB_ROOT
```

Browser commands use the existing headless Edge default on Windows; set
`EASYTIMER_BROWSER` to an installed compatible Chromium binary elsewhere. All
browser profiles, fault fixtures and generated releases use OS temporary storage.
No owner storage or Google authorization is used.

The focused offline test creates and serves the actual allowlisted artifact,
waits for PWA control/cache population, clears/disables the ordinary HTTP cache
and stops its own server. It confirms the server is genuinely unreachable before
reloading. The initialized app then exercises Quick controls, Editor save, Session
READY/start/pause and another offline reload preserving run identity and Rundowns.
A fresh negative-control profile removes the required templates cache entry and
must fail initialization. The packaging fault test also rejects the original
v35/v37 mismatch before an artifact can be created. CDP offline emulation alone
is insufficient because a worker can retain network access.

Normal production entry has no account control/development sync panel and makes
no external SDK/API/image requests in the focused test. Tool/test/doc URLs return
404 from the artifact. Inert development hooks and CSS in the shared application
are retained; they cannot import the excluded account/controller modules. The
separately enabled localhost development environment remains maintained and tested.

Local results: 144/144 Node tests passed. Both genuine-offline artifact scenarios
passed, including the expected negative-control failure. The complete App/PWA
browser suite passed against the generated artifact, and the complete
Development-SYNC browser suite passed with mocked Google traffic. Artifact
inventory/hash verification, syntax, version references and `git diff --check`
passed. The first full artifact run exposed a test synchronization gap when a
reload kept the same 00:00 text; the subtraction test now waits for a new document
time origin, and the complete final run passed with that guard. No runtime timer
or recovery correction was needed. Local owner acceptance is COMPLETE. The actual
18-file production artifact also passed its isolated browser smoke test: Quick
countdown, Session Editor, synthetic Rundown persistence across reload, Session
READY/start/pause and accessible JSON backup/import controls. No Google controls,
unexpected external requests, console/runtime errors or missing assets appeared.
Packaging, Google isolation and genuine offline cold-start regressions passed.
Actual iOS/PWA and screen-reader acceptance remain OPEN. Hosting DocumentRoot,
remote file inventory, server backup/rollback, transport security and owner-approved
publication/privacy information remain separate release gates. Production remains NO-GO.

## Workflow preparation and unresolved remote gates

The existing main-push workflow now builds, tests and verifies the package before
FTP, using `<runner.temp>/easytimer-release/ftp/` as `local-dir`. Existing
`server-dir: /`, port, protocol, trigger and action versions are unchanged. Keeping
the `src/` prefix preserves existing repository-relative destination paths; no
assumption is made that FTP root is the public DocumentRoot.

Default exclusions are explicitly retained. Additional exclusions protect already
uploaded docs/tests/tools/local configuration/README and the legacy SVG from
implicit deletion when the new upload source omits them. These exclusions do not
prove old development files are absent remotely and are not a cleanup plan.
There is no clean-slate deletion or remote deployment/dry-run in this increment.

Before any deployment, the owner must confirm the actual FTP-root/DocumentRoot
mapping, inspect existing remote files and `.ftp-deploy-sync-state.json`, back up
the deployed server files/state, and approve any narrowly scoped cleanup of old
development paths. If hosting paths differ from this preserved mapping, stop and
review the destination rather than silently relocating the app. Do not release
while old development files remain publicly reachable. FTPS and remote rollback
execution remain separate decisions; plain FTP is still an acknowledged risk.

The main-push workflow still deploys automatically when triggered; preparing this
patch is not approval to push or merge. A local test pass does not satisfy remote
path, cleanup or rollback acceptance. Preserve an exact rollback artifact and
validate service-worker update/rollback behavior before approving publication.

## Remaining acceptance

No historical production Rundown/runtime migration, compatibility layer or
cross-origin migration is needed or implemented: the owner confirmed no existing
production users. Future local persistence, DATA-001 and durable recovery remain
required and unchanged.

Real-device iOS/Safari/PWA, screen-reader acceptance, operator/privacy information,
release documentation, approved hosting mapping, server backup/rollback and any
legacy remote cleanup remain open. REL-001C and UX-018 remain separate. Google
production OAuth and onboarding are not prerequisites for this Google-free release.
