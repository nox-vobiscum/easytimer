# SYNC-003B — Verified conflict-free two-head reconciliation

**Status:** functionally accepted in local development through owner-operated real Google Drive testing. Owner-operated real Google Drive acceptance passed for A/B/Keep Both, explicit conflict-free reconciliation, live recovery and preservation of the second client's unpublished changes. Both Firefox contexts ended with the same 13:00 + 08:00 library and Synced (last checked). Final local diagnostics showed one valid head, matching base, no dirty changes and no pending tickets; they do not independently verify current remote Drive state. Production remains NO-GO. See [completed acceptance and release prerequisites](SYNC-003B_CONFLICT_RESOLUTION.md#completed-owner-acceptance--local-development-only). The exact historical parent chain remains unproven. The agent did not operate owner contexts. No commit, tag, push, merge or deployment.

## Minimal runtime change

The existing review controller now accepts either supported live-content conflicts or the existing core's `proposed` case with zero unresolved rows. The surrounding requirements remain: complete validated history, exactly two current heads, one unique validated common ancestor, no order-policy blocker, no existing outbox ticket, a local base that is one of those heads and local content matching that published base. A newer unpublished local edit is not incorporated or discarded.

For a conflict-free proposal the development UI displays **Zusammenführung prüfen / Review reconciliation**, explains that there are no contradictory changes, and prepares the complete readonly result preview. It shows no A/B/Keep Both options and does not generate copies. Preview preparation writes neither saved storage nor remote files. **Bestätigen und synchronisieren / Confirm and synchronize** is still an explicit user action. Cancel does not publish. Real content conflicts retain the prior no-default A/B/Keep Both workflow unchanged.

The snapshot core, canonical format, ordinary parent selection, transport, storage guards, ticket schema and publication/install routines are unchanged. `createReconciliation(..., choices: {})` produces a semantically validated two-parent immutable snapshot with zero decisions. Existing IDs remain intact, including independent copies.

The readonly diagnostic projection now reports supported `proposed` without the obsolete `NO_CONTENT_CONFLICT` unsupported reason. Local-base/content or pending-ticket blockers still appear. Diagnostic storage/network behavior remains readonly and covered by existing instrumentation.

## Unchanged safety invariants

- Fresh complete discovery before confirmation; a changed head set/local revision/content invalidates review.
- Exact snapshot content and identity are validated, not merely the presence of two parent hashes. Invalid/missing history, unsupported ancestry, order changes, unresolved deletion/identity/content conflicts and more than two heads remain blocked.
- The same fixed operation ID, Drive ID, bytes and hash are durably recorded with the local review anchor. No existing ticket is replaced. Copies/phase identities cannot change across retry.
- Exact readback, verified ticket stage and complete remote-head discovery precede success. An HTTP success alone is insufficient.
- One atomic IndexedDB installation requires the exact resolution as sole known head and the unchanged local review baseline. Concurrent/newer local edits are not overwritten.
- Late remote branches remain retained and unresolved. Unknown outcomes retain the original ticket; reload/reconnect recovery reuses it. Account mismatch blocks publication/application.
- No automatic reconciliation, winner selection, field merge, snapshot deletion, Google profile redesign or scope expansion. No timer/editor/PWA production behavior change.

## Actual verification

**149/149 Node tests PASS.** Includes the pure two-head topology/control cases, updated diagnostics for a supported proposal, previous canonical/copy-name/semantic integrity tests, transport, diagnostics, Quick/Planner/Session/DATA-001 suites.

Application integration harness: **28/28 conflict scenarios, 14/14 existing integration scenarios, 4/4 readonly diagnostics scenarios PASS.** New coverage verifies:

- Independent changes and identical contents with divergent ancestry, complete local preview without publication, zero-decision two-parent snapshot, stable identities and sole-head readback/discovery.
- The selected-content/stale-parent pattern from the diagnosis now joins explicitly; the other client retains its pending 13-minute edit. Its later publication creates a genuine 12/13 conflict requiring A/B/Keep Both rather than silently replacing either value.
- Lost acknowledgement, retry of the same confirmation, pending-ticket blocking and reopen recovery without another POST.
- New local edits during review, a third remote head before publication, incomplete/malformed history, authorization expiry (mock 401) and account mismatch. Existing ordinary-ticket, concurrent-tab, late-head and quota protection regressions remain green.

Actual application UI: **PASS** for DE/EN, Light/Dark/System, desktop and 320px, complete preview with no radio choices, no automatic publication, and explicit native Enter confirmation. A simulated lost upload acknowledgement/readback failure followed by a real page reload recovers the same ticket with **GET only**, with no duplicate POST. The unchanged real-content-conflict radio/keyboard/copy workflow also passes. Generated screenshots: `C:\Users\noxvo\AppData\Local\Temp\easytimer-application-sync-shots-7IBlbe\proposed-{de|en}-{light|dark|system}.png`; no tracked artifacts.

The full existing `node tests/browser-check.mjs` **PASS**, including actual DATA-001 imports/downloads, ordinary editor/storage safeguards, Quick Timer, manual/automatic Session Timer, responsive controls and PWA offline/cache regression. Google requests were intercepted/mocked in fresh isolated contexts, never real login/API calls. Real Google acceptance was subsequently completed by the owner. Native iOS/PWA and VoiceOver remain open. `git diff --check` passes.

Commands:

```powershell
node --test tools/app-sync/proposed-heads.test.mjs tools/app-sync/diagnostics.test.mjs tools/app-sync/gate.test.mjs tools/sync-core/copy-names.test.mjs tools/sync-core/core.test.mjs tools/sync-kiss-model/model.test.mjs tools/sync-poc/poc.test.mjs tools/sync-poc/snapshots.test.mjs tools/sync-integration/transport.test.mjs tests/timer.test.mjs tests/templates.test.mjs tests/session.test.mjs tests/time-visuals.test.mjs tests/virtual-clock.test.mjs tests/portability.test.mjs
node tools/app-sync/browser-check.mjs
node tests/browser-check.mjs
```

## Historical prepared owner recovery procedure - A first

This historical procedure was prepared before the now-completed owner acceptance. It is not an outstanding task or a description of the accepted final Firefox state. Do not replay it merely to repeat recovery.

1. Retain independent JSON backups and both existing browser contexts. Keep private Firefox B open. Leave B's saved 13:00 edit and 08:00 copy untouched: no import, adoption, reset or Sync now in B during A's acceptance.
2. In existing A only, reload the localhost development application to load this correction, then open Session Editor → Data & Backup. This is owner-controlled; the agent did not reload either live context. Confirm A still has 12:00 and the independent 08:00 copy. Reconnect the same existing test Google account explicitly if necessary. Do not activate/migrate again.
3. Choose **Konflikt prüfen / Review conflict**. This user action performs fresh complete discovery. If it reports a pending ticket, changed/unsupported history or presents a genuinely different content conflict, stop and retain all state; do not bypass it or pick a temporary winner. Capture the read-only diagnostic for review.
4. For a supported conflict-free state, expect **Zusammenführung prüfen** and a complete readonly result. Verify the original remains 12:00, the independent copy remains 08:00 and all unrelated Rundowns/phases are preserved. There should be no A/B radios. Unexpected content means Cancel, not confirmation.
5. Only after checking the complete result, press **Bestätigen und synchronisieren** once. Success must show last-checked only after immutable publication/readback/discovery and safe local installation. The readonly diagnostic should then show dirty false, one validated known/computed head equal to A's base and no pending ordinary/reconciliation ticket. A retained error, new head or newer local revision must stop; do not clear tickets or retry with a new identity.
6. B still contains 13:00 locally; this procedure has not overwritten or incorporated it. After reviewing A's result, decide separately when to continue with B. A subsequent explicit B Sync may publish that saved edit from its older base and produce the real 12/13 content conflict; it is not permission to adopt over B's dirty library. Use the existing explicit A/B/Keep Both workflow only after fresh validation and owner review.

A full Drive listing is not globally atomic. A head that arrives after the final listing is discovered on a later sync and must remain unresolved; last-checked is not a global lock. A real runtime fix for every late/publication-plus-new-local-edit combination is not claimed. Existing fail-closed pending-ticket limitations remain.

## Exact scope and Git status

This correction changes runtime code only in:

- `tools/app-sync/controller.mjs`: accept the validated zero-conflict proposed case within the existing review gate.
- `tools/app-sync/conflict-panel.mjs`: localized conflict-free preview/confirmation without radio choices, reusing result rendering.
- `tools/app-sync/diagnostics.mjs`: stop labelling a now-supported proposal as unsupported; preserve actual local/pending blockers.

Updated tests: `tools/app-sync/conflict-experiments.mjs`, `browser-check.mjs`, `proposed-heads.test.mjs`.

Documentation: this report, `docs/BRIEFING.md`, `docs/backlog.md`, `docs/SYNC-003B_CONFLICT_RESOLUTION.md` and the follow-up link in `docs/SYNC-003B_TWO_HEAD_ANALYSIS.md`.

No changes to storage/publication/transport/core schema logic or `src/`, service worker, OAuth, hosting or workflow in this correction. Cached production assets did not change, so no PWA bump. No local server restart was needed: the existing development server reads these already allowed modules from disk. No owner data or backup was accessed by the agent. Owner-operated live acceptance and recovery subsequently passed.

Branch: `feature/sync-003b-conflict-resolution`; HEAD: `d67658da46e55bb83117e9c553bb5dd5cafba042`. All prior uncommitted work preserved; nothing staged. Exact pending status, including earlier increments:

```text
## feature/sync-003b-conflict-resolution
 M docs/BRIEFING.md
 M docs/SYNC-002B_SNAPSHOT_CORE.md
 M docs/backlog.md
 M tools/app-sync/browser-check.mjs
 M tools/app-sync/controller.mjs
 M tools/app-sync/drive.mjs
 M tools/app-sync/gate.test.mjs
 M tools/app-sync/panel.mjs
 M tools/app-sync/server.mjs
 M tools/app-sync/storage.mjs
 M tools/sync-core/canonical.mjs
 M tools/sync-core/graph.mjs
 M tools/sync-core/reconcile.mjs
?? docs/SYNC-003B_CONFLICT_FREE_RECONCILIATION.md
?? docs/SYNC-003B_CONFLICT_RESOLUTION.md
?? docs/SYNC-003B_CONSECUTIVE_CONFLICT_DIAGNOSIS.md
?? docs/SYNC-003B_READ_ONLY_DIAGNOSTICS.md
?? docs/SYNC-003B_TWO_HEAD_ANALYSIS.md
?? tools/app-sync/conflict-experiments.mjs
?? tools/app-sync/conflict-panel.mjs
?? tools/app-sync/diagnostic-experiments.mjs
?? tools/app-sync/diagnostics.mjs
?? tools/app-sync/diagnostics.test.mjs
?? tools/app-sync/proposed-heads.test.mjs
?? tools/sync-core/copy-names.test.mjs
```

No commit, tag, push, merge, deployment or continuation to another story. Functional owner acceptance is complete; staging and committing still require separate approval.
