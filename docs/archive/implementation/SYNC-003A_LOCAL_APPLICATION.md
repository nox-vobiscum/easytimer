# SYNC-003A — Local Application Integration

**Status: SYNC-003A — Local application integration implemented and owner-validated with real Google Drive. Production NO-GO.** No public OAuth release or deployment. Accepted architecture: append-only immutable full-library snapshots. D1's checkpoint/receipt replacement is **not adopted**; [SYNC-099](../../backlog.md#sync-099--optional-snapshot-cleanup) remains Someday / Maybe / Very Low, with no thresholds, scheduler or deletion code.

## Implementation

The actual Session Editor's Data & Backup area receives optional development services. Its normal store remains localStorage. Only the separate server's explicit `--enable-drive` entry, at exactly `http://localhost:8000`, enables the Google panel and asynchronous application store. Production source contains no Google client ID, GIS script or imported Google integration; development modules are outside `src/` and outside the PWA cache.

The panel supports explicit activation, Connect, Sync now, Disconnect, empty-library adoption and a local backup. DE/EN statuses distinguish pending, last checked, reconnect, conflict and error. There is no startup login or Google traffic. Disconnect clears in-memory authorization, retains the account binding/outbox/local database and does not revoke consent or delete remote data. Offline editing continues through IndexedDB.

Reused mechanisms: A's strict IndexedDB transaction/abort handling, B's canonical envelope/hash/validated graph, C's ticket validation and GIS in-memory/generation-bound request capability. Application transport has its own purpose `easytimer-development-application-sync-v1`; it does not read C's synthetic files. Create uses a fixed pre-generated Drive ID, never PATCH. Complete exact readback and paginated validated history precede last-checked. Cached files may not disappear. Newer local edits remain dirty. Multiple libraries, divergent heads, incomplete histories, mismatched accounts or unsupported restoration stop safely.

A clean empty context explicitly adopts the remote library, preserving Rundown/phase IDs. A clean previously synchronized client may fast-forward only to a sole validated descendant of its exact base, with matching current content and a transactionally unchanged local revision. Dirty local changes against a newer remote version stop for review; no implicit merge. Timers, live sessions, preferences and unsaved drafts are never part of snapshots.

## Migration and recovery boundary

1. User explicitly confirms activation and closes other easyTimer tabs.
2. Strictly validate the complete existing `easyTimerTemplates` value. Unknown/normalization-changing contents block migration.
3. Copy the library, revision and dirty state transactionally; retain the exact original string in bindings and leave localStorage untouched.
4. Read back and compare content/source. Commit activation and then the separate local activation marker. Failure never reports a successful switch; the copied database remains recoverable.
5. Editor saves, deletes, JSON imports/exports and Picker loads use the same authoritative store factory. Saves resolve only after the IDB transaction completes. Revision conflicts retain drafts/reviews. Exports use a fresh read without resetting an editor's optimistic revision.

Development database: `easyTimer-SYNC-002A-test-SYNC-003A-application`, deliberately distinct from earlier fixture databases while reusing the tested adapter. Activation marker: `easyTimerDevelopmentSyncStorage=active`. No tokens are persisted. Newly loaded normal application code at this localhost origin refuses stale legacy-store access when that marker is active. Old compiled clients cannot be forcibly locked: source bytes are checked around migration, local writes and sync-state transitions; storage events refresh the warning. Changed old-store contents quarantine saving/sync without overwriting either store. There is no permanent dual-write scheme.

**Limit:** localStorage and IndexedDB cannot be switched atomically together. Non-cooperating old JavaScript can still write localStorage; the implementation detects source divergence rather than claiming to prevent such writes. A change arriving during a local commit can leave the intended IDB edit committed and dirty while the draft is retained and an error is shown. Both persisted libraries remain available. This is an explicit stop/recovery condition, not automatic reconciliation.

**Rollback path:** Disconnect does not revert storage. Download the current IndexedDB backup; on a legacy conflict also download the other browser copy. Retain the original profile/database. A fresh ordinary local-only profile can recover through DATA-001's reviewed import (which intentionally creates new IDs). Do not clear the activation marker to revive a stale legacy library, delete either store or automatically overwrite localStorage with an IDB copy. A same-profile, ID-preserving storage rollback needs a separately reviewed, all-writers-closed transition. No such rollback writer is introduced here.

## Owner-operated local test

```powershell
node tools/app-sync/server.mjs --enable-drive
```

Open **http://localhost:8000/**. With explicit owner authorization, the old isolated PoC server was replaced by this application development server on port 8000 before acceptance. Without `--enable-drive`, the server serves normal application behavior and denies the development modules.

Use a fresh test profile and back up real definitions first. Existing localhost service workers cause the development entry to stop rather than silently serve mixed versions. Do not clear site data to fix that: use a fresh profile/import, or deliberately unregister only the localhost worker and close/reopen its tabs after backing up. No production service worker or hosting change is needed.

1. Create/import and save a Rundown normally. In Session Editor > Data & Backup, choose **Activate for this browser**, confirm the copy, then **Connect Google Drive**. First click loads GIS; click Connect again to open the user-gesture popup. Only the existing test accounts/project and `drive.appdata` scope are used.
2. Choose **Sync now**. Expect **Synced (last checked)** only after verified upload/discovery. This does not promise other offline devices have synced.
3. In a separate clean browser profile/private context, open the same server, activate, manually authorize the **same account**, Sync now, then explicitly **Use saved Rundowns**. No automatic overwrite of a nonempty library. Edit/save/sync; the clean first client should pull the descendant on Sync now.
4. Disconnect, edit and reload: saved IDB data remains accessible; reconnect is explicit. Try a different account: it must be blocked before library operations.
5. To test uncertain upload manually, interrupt a request using browser network tooling, retain the profile and reconnect/retry. Never clear the pending ticket or copy tokens/HAR files into Git. Automated tests use a clearly simulated lost acknowledgement, not real packet loss.
6. Concurrent edits are a safe stop for SYNC-003B. Keep both clients' stored libraries and use JSON backups; no temporary winner selection is provided.

Real Google authorization is owner-operated. No login automation or Cloud Console changes were performed. The application adapter's owner-observed acceptance is recorded below, separately from earlier C evidence and automated mocks. Actual iOS/PWA, physical interruptions and real quota exhaustion remain open.

## Owner-operated application acceptance — PASS under tested conditions

Evidence source: the owner's final acceptance report for the actual application at `http://localhost:8000/` with `--enable-drive`. These are manually observed real Google Drive workflows, not new agent-operated tests. No raw HTTP logs, response codes, snapshot counts or performance measurements are inferred.

1. **Application and independent backup:** after reload the false initial synchronization error was absent. The owner created and saved `SYNC-003A Test`, with one manual phase `synctestphase01`, initially 300 seconds / `05:00`. The library displayed it. The owner downloaded and inspected `easytimer-rundowns.json`: valid JSON, `schemaVersion: 1`, correct Rundown/phase content and IDs. The independent backup was retained.
2. **First publication:** normal Firefox used the official Google account-selection flow with the existing test OAuth project. Publication completed with `Synchronisiert (zuletzt geprüft)`. Approximately three seconds was the owner's informal elapsed-time observation, not a benchmark or guaranteed latency.
3. **Independent clean client:** private Firefox began with an empty library. The owner explicitly activated local storage, connected the same Google test account, synchronized, and confirmed `Gespeicherte Rundowns übernehmen`. The correct Rundown and its `05:00` phase appeared, with last-checked status. This was another browser context on the same device, not a second physical device.
4. **Round-trip edit and actual timer load:** private Firefox changed the phase from `05:00` to `07:00`, saved locally with pending status, then synchronized. Normal Firefox synchronized and displayed the updated `07:00` definition without a conflict. Loading it into the actual Session Timer showed workshop `SYNC-003A Test`, phase `synctestphase01`, countdown `07:00`, workshop remaining `07:00`, and READY rather than running.

**Conclusion:** the complete real-Rundown application round trip passed in the tested normal/private Firefox contexts. This does not establish physical cross-device, iOS, installed-PWA or production acceptance. Local-only use and DATA-001 remain independent.

## Release blockers and future UX review

- **Production blocker — technical activation dialog:** the owner rejected the current copying/transactional-storage confirmation for production. Ordinary UI must avoid storage-engine terminology, prefer seamless safe preparation, and request confirmation only for a real user decision, with understandable DE/EN wording. Preserve complete validation, readback, old-writer detection and rollback safeguards. This requirement does not authorize removing safeguards or implementing a migration now.
- **Future bounded Google identity UX:** use official authentication/authorization, a familiar circular account indicator with the actual profile image when available, and a compact menu with account name/email. Desktop placement should be near the header menu; mobile must remain minimalist. Clearly separate Google-connected status from Rundowns-synchronized status. Evaluate the minimal justification for `openid`, `profile`, `email` alongside `drive.appdata` in a separate implementation review. No additional scopes, account-data processing or OAuth configuration changes are authorized by this handoff.
- **Minor UX follow-ups:** review the initial empty-library pending-changes status and the Connect Google Drive action remaining visible when connected. The future account indicator may clarify or replace that action. The false initial error is fixed; 44 bytes is a confirmed valid empty-library backup, while the previously observed zero-byte download remains unreproduced.
- **Open release acceptance:** actual iOS Safari/installed PWA, a physical second device, physical interruptions, real quota exhaustion/storage eviction, Opera GX rendering, public OAuth/privacy readiness and safe production migration/packaging remain unvalidated. Existing broad FTP packaging must not publish development tooling or test OAuth configuration. No production release is approved.

The desired rule that a stale offline edit returning after an earlier resolution becomes an independent copy remains a product requirement, not implemented or proven behavior.

## Previously executed validation — not rerun for this documentation closure

- **136/136 Node tests pass**, including two new development-gate tests, existing application tests and prior PoC/core tests.
- **14/14 new native-IndexedDB/mocked-HTTP scenarios pass**: local-only, migration/invalid/marker failure/interruption/old writers, quota, concurrent saves, upload/adoption/stable IDs, recovery, newer edits during upload, mismatch/offline/401/reconnect and conflicting branches.
- Actual application browser checks pass: activation, mocked GIS/Drive upload, authoritative JSON download, unsaved-draft guard, reload, DE/EN, Light/Dark/System, 320px and focus. A genuinely separate clean browser context adopts, edits and publishes; the clean first context fast-forwards.
- Full existing Quick/Planner/Manual/Automatic Session/DATA-001/PWA/browser regression passes. A **16/16**, C **16/16** and original isolated GIS browser regression pass unchanged.
- No actual Google requests in automated runs. The runner intercepts the virtual localhost origin and serves its own ephemeral loopback server, leaving the existing port-8000 listener alone. OAuth/Drive responses are mocked; browser storage is real. Test data is synthetic, not the owner's actual saved definitions.
- No measured application performance benchmark was taken. Screenshots/results stay in OS temporary directories, not tracked assets.

Commands:

```powershell
node tools/app-sync/browser-check.mjs
node --test tools/app-sync/gate.test.mjs
node tests/browser-check.mjs
```

The shell cache is locally **v37**. Changed `app.js`, `planner.js`, `templates.mjs`, `portability.mjs` use v37 references; CSS retains v36 and unchanged timing/visual modules retain v35. The development entry disables service-worker registration only in that explicit mode. Normal PWA offline regression remains green. Deployed production is unchanged at `409229a` / v36 shell.

The existing FTP workflow has broad repository packaging. A future release must explicitly exclude development/test tooling and the test OAuth configuration before deployment; no pipeline changes are authorized or made here. This working tree is not a public-release candidate.

## Exact files and Git

This increment changes `docs/backlog.md`, `docs/BRIEFING.md`, `src/index.html`, `src/service-worker.js`, `src/js/app.js`, `src/js/planner.js`, `src/js/templates.mjs`, `src/js/portability.mjs`, and the two version assertions in `tests/browser-check.mjs`.

New: this report and nine files under `tools/app-sync/`: `storage.mjs`, `drive.mjs`, `controller.mjs`, `entry.mjs`, `panel.mjs`, `server.mjs`, `experiments.mjs`, `browser-check.mjs`, `gate.test.mjs`. Prior A/B/C/D experiments are preserved; no checkpoint or branch was created. Branch remains `feature/sync-002c-isolated-integration`, HEAD `0f09162c9be994064ef53ee6d1bd0e2ee9f36ff5`. No commit, push, merge, tag, deployment, hosting, OAuth or workflow change.

Of 20 pre-existing pending files, 18 remain hash-identical; only the existing backlog/briefing gained the authorized status updates. Final Git status, with nothing staged:

```text
## feature/sync-002c-isolated-integration
 M docs/BRIEFING.md
 M docs/backlog.md
 M src/index.html
 M src/js/app.js
 M src/js/planner.js
 M src/js/portability.mjs
 M src/js/templates.mjs
 M src/service-worker.js
 M tests/browser-check.mjs
 M tools/local-store-poc/adapter.mjs
 M tools/sync-poc/core.mjs
?? docs/SYNC-002C_ISOLATED_INTEGRATION.md
?? docs/SYNC-002D0_CONFLICT_RESOLUTION_DESIGN.md
?? docs/SYNC-002D1_KISS_FEASIBILITY.md
?? docs/SYNC-003A_LOCAL_APPLICATION.md
?? tools/app-sync/
?? tools/sync-integration/
?? tools/sync-kiss-model/
```

The A/core modifications and previous untracked PoCs shown above predate SYNC-003A; they were not restaged or rewritten.

## Initial owner smoke-test correction

The empty editor feedback code was incorrectly translated by the development feedback adapter into the generic synchronization error. Opening, reloading or refreshing the editor could therefore display a false failure beside a correct Local only status. This was UI initialization, not a persisted synchronization failure: the controller error variable is memory-only and starts empty. Empty feedback now remains empty; actual nonempty unknown failures retain the generic error fallback.

Disconnect is hidden until an authenticated connection exists and disabled while an operation is busy. Its documented effect remains clearing in-memory authorization, not revoking the Google grant or deleting local/remote data. Backup preparation failures now receive a dedicated localized backup message rather than a synchronization error.

Both full-library export and local backup use `easytimer-rundowns.json`; the other-browser-copy action uses a distinct name. The owner's historical two downloads cannot be attributed to individual actions without browser download records. The empty library serializes to exactly 44 UTF-8 bytes of valid schema-version-1 JSON. DATA-001 intentionally rejects importing empty libraries (`importEmpty`); this does not make their backup JSON invalid. A completed zero-byte file is not a valid backup. It was not reproduced and is not evidence of missing Rundowns. Browser-side code can report preparation exceptions but cannot confirm final disk writes or download cancellation.

Focused validation: 27/27 Node tests (development gates, templates and portability), 14/14 native IndexedDB/synthetic transport experiments, and the application browser harness passed. A fresh independent context verifies no false feedback before activation, after reload and after empty-library activation; original localStorage remains absent, IDB readback matches the empty library, the actual downloaded backup contains 44 valid JSON bytes, and an injected object-URL preparation failure produces a specific message without an additional download. Existing DE/EN, theme, narrow-layout, editor, recovery and clean-second-context checks also pass. No real Google requests, owner browser storage access, production code or PWA changes were needed for this correction. The full production browser suite was not rerun for this development-panel-only patch.

## Proposed SYNC-003B — Minimal explicit conflict resolution

Only after separate approval: two conflicting current Rundown versions with explicit A / B / Keep Both decisions and no automatic winner. Bind review to the exact validated heads/account/local revision; provide a complete result preview in a minimal accessible DE/EN Session Editor interface. Keep Both creates fresh Rundown/phase IDs and a collision-safe numbered copy name within existing name limits. Validate the full library and actual content-correct multi-parent immutable reconciliation, verify readback/discovery, and retain original conflicting snapshots for recovery. Preserve independent data, pending tickets and local drafts; invalidate stale review. Unsupported unrelated histories, ambiguous bases and simultaneous contradictory decisions stay blocked. No version-history UI, cleanup, checkpoint replacement, signals, timer sync, public release or production migration. Stale-offline-edit-as-copy remains desired future behavior, not a delivered capability.

Recommended implementation model/effort: GPT-6.1 Sol / Medium, with tightly bounded deterministic conflict/identity tests and existing browser coverage. This is a recommendation, not implementation authorization.

Documentation closure changes only this report, `backlog.md` and `BRIEFING.md`. Documentation consistency and `git diff --check` are the checks for this closure; the earlier automated suites above were not executed again. Branch, HEAD and pending-file status remain as recorded above; nothing is staged or committed.
