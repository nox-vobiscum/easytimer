# SYNC-003B — Explicit Rundown Conflict Resolution

**Status:** functionally accepted in local development through owner-operated real Google Drive testing. **Production NO-GO.** No additional OAuth scopes, account UI redesign, cleanup or production integration.

## Completed owner acceptance — local development only

The owner confirms PASS for Keep Version A, Keep Version B, Keep Both, conflict-free two-head reconciliation with explicit confirmation, recovery from the previously unsupported live conflict, and preservation of the second client's unpublished local changes. Final synchronization returned the same library to both Firefox contexts: original 13:00 plus independent 08:00 copy; both displayed **Synced (last checked)**.

Final owner-provided local diagnostics showed one valid head, matching base, no dirty changes and no pending tickets. These read-only reports describe cached local state, not independent verification of the current remote Google Drive state. Owner-operated real API evidence is separate from automated/mock results. Successful recovery does not prove the exact historical parent chain of the earlier anomaly.

Production prerequisites remain FTP packaging/deployment exclusions for development-only tools; Google OAuth/account UX, consent/verification and privacy readiness; production-safe migration, onboarding and rollback; physical second-device, iOS Safari/installed-PWA and screen-reader acceptance; and documented physical interruption, real quota and Opera GX checks. No production release is authorized.

**Owner acceptance follow-up:** two real-Drive content-conflict rounds passed, then a valid two-head state without content conflict exposed the conflict-only review gate. The [two-head analysis](../investigations/SYNC-003B_TWO_HEAD_ANALYSIS.md) confirms the gate and reproduces the state pattern, without proving the owner's full historical parent chain. The approved [conflict-free correction](SYNC-003B_CONFLICT_FREE_RECONCILIATION.md) now accepts a fully validated `proposed` case, shows the complete readonly result without A/B choices and still requires explicit publication confirmation. It passes 149 Node tests and 28 conflict scenarios plus application/UI regressions. Owner-operated live acceptance and recovery of this correction subsequently passed, as recorded above. The 17-scenario results below describe the original B verification.

## Preserved Git baseline

The owner authorized exactly two local checkpoints after review of the exact staged blobs:

1. `5faff7943a6e05fef6adc76e3c99a206b31e4d67` — `Preserve isolated synchronization experiments and findings` (18 files).
2. `d67658da46e55bb83117e9c553bb5dd5cafba042` — `Preserve owner-validated local Drive application integration` (19 files).

The clean baseline was verified before creating `feature/sync-003b-conflict-resolution`. HEAD remains `d67658da46e55bb83117e9c553bb5dd5cafba042`. No tag, push, merge or deployment. No B implementation commit is authorized. Existing checkpoints and PoCs remain intact. Candidate contents were reviewed as source/test/documentation; no actual access tokens, client secrets, runtime recovery tickets, generated artifacts or exported user libraries were included. The public test OAuth client ID stays development-only.

## Supported workflow

Sync continues to use append-only immutable snapshots. When two clients save independently from the same base, sequential Sync now requests can publish both immutable siblings. A dedicated `prepareBranch` path requires an unchanged local revision/content, account/base/observed-head binding, no pending ticket, a complete validated graph and a sole remote descendant of the known base. It never replaces a remote file or relaxes ordinary `prepare` ticket checks. Verified publication acknowledges the exact local revision even while a remote conflict remains; heads separately represent unresolved conflict. This permits the clean losing client to pull the eventual resolved descendant rather than re-publish its already acknowledged version.

**Review conflict** performs fresh complete discovery and supports exactly two current heads with a unique validated common ancestor and either supported concurrent live-versus-live Rundown conflicts or validated conflict-free proposals. The latter show the complete result without A/B choices and require explicit confirmation. Unsupported deletion/restoration, independent order changes, incomplete ancestry, unrelated roots, more heads and ambiguous bases fail closed. Local content must equal its published head; unpublished local edits are not silently folded into a decision. A pending ordinary or resolution ticket must be recovered before a new review.

A and B are the ascending immutable parent snapshot hashes, independent of caller argument order, Drive listing order, timestamps or client names. Ordinary UI shows names, transition mode, full phase titles/order and durations, with localized comparison text, not hashes or JSON. Each conflict has a native labelled radio group with **no default**: Use version A / Use version B / Keep both. The user previews the complete resulting library, including unrelated changes, then explicitly confirms publication. Cancel does not publish. Keyboard radio behavior, focus/error handling, wrapping and 44px labelled targets reuse the existing UI conventions.

Keep Both retains A under the original Rundown/phase identity and creates an independent copy of B with fresh Rundown and phase IDs. Naming replaces a trailing numeric suffix, chooses `(1)`, `(2)`, etc. against NFC/case-insensitive names from both branches/base and earlier copies, and truncates safely to the existing 120-unit limit without splitting Unicode surrogate pairs. The canonical decision may include the resulting copy `name`; `applyChoices` recomputes and verifies it, and the full graph validates the actual library content. Old unnumbered decisions remain valid. Arbitrary name/content changes with recalculated hashes are still rejected. See the [core format extension](../investigations/SYNC-002B_SNAPSHOT_CORE.md).

## Durable publication and installation

1. Review captures account binding, exact heads/base and local revision/content; preview allocates one operation, IDs, copy names and semantically validated snapshot. Preview alone changes neither saved library nor remote files.
2. Confirmation re-discovers complete remote history and rejects stale heads/revision/content. A pre-generated Drive ID and exact bytes/hash are committed atomically in the unchanged outbox ticket format, with a `bindings.reconciliation` sidecar containing the ticket and local anchor. Existing tickets cannot be replaced.
3. Before a new create, exact GET recovery is attempted, then heads/local state are checked again. A found file is accepted only after exact verified readback; missing/uncertain outcomes never cause a new logical operation or file ID. Normal immutable publication handles a racing duplicate create safely.
4. Verified ticket stage is durable. Complete discovery must include the exact file and validate its full ancestry/semantic reconciliation. Only a sole known head equal to that ticket and an unchanged local revision/content permit one IndexedDB transaction to install the library, increment revision, clear dirty and retire the ticket/sidecar. The old local library remains until then.
5. A late remote branch remains alongside the resolution and reports unresolved conflict. A newer local edit is never overwritten. Two tabs cannot install a stale result; transactions recheck the local anchor and ticket. No automatic deletion or winner selection.

Drive discovery cannot be globally atomic. Another client can publish immediately after the final list; last-checked means the complete history observed in that request, not a global lock. A future discovery detects newly visible heads. Missed or malformed files and disappeared cached history block rather than falsely establish convergence.

## Fail-closed limitations

- Exactly two heads and supported live-content conflicts or validated conflict-free proposals only. No field merging, version-history interface, general contradictory-resolution handling or multi-head resolution.
- Unsaved editor drafts remain isolated; a saved newer revision invalidates review. Existing ordinary uploads must recover before review. The adapter does not silently publish additional edits into an already two-head conflict.
- A prepared resolution whose heads change before create retains its fixed ticket and stops; it does not silently cancel/rewrite the ticket to manufacture a new review. Similarly, a newer local edit or late head after publication retains the sidecar/ticket and all data, with no automatic stale installation. Recovery of those combined unsupported states needs a separately reviewed explicit workflow; retain JSON backups and browser data.
- Validated identical-content or independent-change divergence uses a complete result preview without A/B choices and requires explicit confirmation. Unsupported order-policy changes remain blocked.
- Very old offline edits becoming independent copies after an earlier resolution remains **desired future behavior, not implemented or proven**. Previously resolved ancestors alone are not active choices once a sole resolved head is discovered.
- No actual B Google API experiment, second physical device, iOS Safari/PWA, screen-reader session, real disk quota exhaustion or physical packet/power loss was performed by the agent. Fault injection is identified as such.
- A's production blockers remain: technical activation dialog, production storage transition/rollback UX, packaging exclusions, public OAuth/privacy readiness and real-device acceptance. No production release approval.

## Historical initial automated verification

- **142/142 Node tests PASS:** new copy-name/semantic/canonical/A-B-order tests plus existing core, gate, transport, PoC, KISS, Quick Timer, Planner, Session Timer, visual/virtual-clock and DATA-001 tests.
- **17/17 new native IndexedDB + mocked transport scenarios PASS:** A/B/both, unrelated changes/name collisions, repeated publication, lost acknowledgement/reopen, local edits during review, existing ordinary ticket, incomplete/corrupt history, expiry/account mismatch, independent-tab revision change, third head before confirm, late branch/newer local edit during upload, offline before POST, quota abort before ticket commit and after installation requests, simultaneous confirmations and delete-versus-edit blocking.
- **14/14 existing application integration scenarios PASS**, including local-only independence, migration protection, quota, optimistic revisions, prior upload recovery and account safeguards.
- **Actual two-context application UI PASS:** no radio default, native ArrowDown selection, explicit preview/confirmation, DE/EN with Light/Dark/System, desktop and 320px with no horizontal overflow, focus and clean-peer pull. A simulated lost upload acknowledgement/readback failure followed by a real page reload reauthorizes and resumes the exact ticket using GET only, with no additional POST.
- Full existing `tests/browser-check.mjs` **PASS**, including actual DATA-001 downloads/imports, editor validation/drafts/IDs, Quick Timer, manual/automatic Session Timer, responsive views and PWA offline/cache regression.
- Prior A **16/16**, C **16/16** plus actual page reload, and isolated GIS browser smoke **PASS**. All Google calls in automation were intercepted/mocked; there was no real Google login or API use.
- Screenshots from the final run: `C:\Users\noxvo\AppData\Local\Temp\easytimer-application-sync-shots-eloBHe` (six `conflict-{de|en}-{light|dark|system}.png` files). The comparison explicitly lists changed name/transition/phase positions and shows both complete versions. Generated artifacts stay outside the repository. No performance benchmark.

Commands (Node built-ins, installed Chromium; no new dependency):

```powershell
node --test tools/sync-core/copy-names.test.mjs tools/sync-core/core.test.mjs tools/app-sync/gate.test.mjs tools/sync-kiss-model/model.test.mjs tools/sync-poc/poc.test.mjs tools/sync-poc/snapshots.test.mjs tools/sync-integration/transport.test.mjs tests/timer.test.mjs tests/templates.test.mjs tests/session.test.mjs tests/time-visuals.test.mjs tests/virtual-clock.test.mjs tests/portability.test.mjs
node tools/app-sync/browser-check.mjs
node tests/browser-check.mjs
node tools/local-store-poc/browser-check.mjs
node tools/sync-integration/browser-check.mjs
node tools/sync-poc/browser-check.mjs
```

## Owner acceptance — disposable Rundowns in normal/private Firefox

Keep independent DATA-001 backups of both browser libraries. Do not clear site storage, change accounts, or use real valuable definitions for conflict testing. Start the explicitly enabled local server with `node tools/app-sync/server.mjs --enable-drive`, open `http://localhost:8000/`, and reload both contexts to use the same new core. The server must be restarted to pick up its expanded development-module allowlist. No public/production origin is enabled.

1. In A, create/save a disposable Rundown, connect the existing test Google account and Sync now. In clean private B, activate/connect the same account, Sync now and explicitly adopt. Both start from the same synchronized definition.
2. Before either publishes, edit the same phase differently in A (e.g. 07:00) and B (e.g. 09:00), saving both locally.
3. Sync A, then B. B publishes its immutable sibling and reports conflict; Sync A to discover both. Keep both libraries and original snapshots intact.
4. Choose Review conflict. Check displayed phase values to identify A/B; A/B is stable snapshot ordering, not necessarily normal/private Firefox. Initially nothing is selected. Choose A, B or Keep Both for every conflicting Rundown, Review result, then Confirm and synchronize.
5. Expect last-checked only after verified installation. For Keep Both, confirm an independent numbered copy, both phase contents and stable identities via JSON export. Sync the other clean client to obtain the same complete resolved library. Sync again: no duplicate copy should appear.
6. Load the selected or copied Rundown into the actual Session Timer: first phase must be READY, with its correct duration. Repeat A/B choices with fresh disposable examples if desired.
7. Optional safe stale-review check: save another local edit from a same-profile tab while review is open, then confirm; expect rejection and retention of the newer edit. Preserve backups; combined pending-publication conflicts intentionally stop rather than auto-reset.

## Historical initial implementation files and next increment

Modified: `tools/app-sync/browser-check.mjs`, `controller.mjs`, `drive.mjs`, `panel.mjs`, `server.mjs`, `storage.mjs`; `tools/sync-core/canonical.mjs`, `graph.mjs`, `reconcile.mjs`; `docs/BRIEFING.md`, `docs/backlog.md`, `docs/SYNC-002B_SNAPSHOT_CORE.md`.

New: `tools/app-sync/conflict-panel.mjs`, `tools/app-sync/conflict-experiments.mjs`, `tools/sync-core/copy-names.test.mjs`, this report. All implementation changes remain unstaged/uncommitted on the feature branch; nothing else was modified. No `src/`, service-worker or deployed cache references change in B, so no cache bump is needed. Source shell v37 remains a local A baseline; production remains unchanged.

The known localhost application server was restarted to load the expanded module allowlist. HTTP checks of `/`, `/tools/app-sync/conflict-panel.mjs` and `/tools/sync-core/reconcile.mjs` returned 200. No owner browser data was read or modified. Reload both owner contexts before acceptance.

Final `git diff --check` passed. Exact worktree status (nothing staged):

```text
## feature/sync-003b-conflict-resolution
 M docs/BRIEFING.md
 M docs/SYNC-002B_SNAPSHOT_CORE.md
 M docs/backlog.md
 M tools/app-sync/browser-check.mjs
 M tools/app-sync/controller.mjs
 M tools/app-sync/drive.mjs
 M tools/app-sync/panel.mjs
 M tools/app-sync/server.mjs
 M tools/app-sync/storage.mjs
 M tools/sync-core/canonical.mjs
 M tools/sync-core/graph.mjs
 M tools/sync-core/reconcile.mjs
?? docs/SYNC-003B_CONFLICT_RESOLUTION.md
?? tools/app-sync/conflict-experiments.mjs
?? tools/app-sync/conflict-panel.mjs
?? tools/sync-core/copy-names.test.mjs
```

After completed functional owner acceptance, separately scope Google-account UX and visual polish: official Google account experience, name/email/avatar where permitted, clear connected versus synchronized state, minimal header/mobile treatment and production-friendly activation wording without dropping safeguards. Review any additional scopes/account-data processing separately. Do not start that work, cleanup, D1 replacement or production preparation as part of B. SYNC-099 remains Someday / Maybe / Very Low.
