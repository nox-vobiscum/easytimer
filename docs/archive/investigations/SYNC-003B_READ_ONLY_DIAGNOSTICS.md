# SYNC-003B — Owner-operated read-only local diagnostics

**Current status - historical report:** SYNC-003B is functionally accepted in local development. Owner-operated real Google Drive acceptance passed for A/B/Keep Both, explicit conflict-free reconciliation, live recovery and preservation of the second client's unpublished changes. Both Firefox contexts ended with the same 13:00 + 08:00 library and Synced (last checked). Final local diagnostics showed one valid head, matching base, no dirty changes and no pending tickets; they do not independently verify current remote Drive state. Production remains NO-GO. See [completed acceptance and production blockers](../implementation/SYNC-003B_CONFLICT_RESOLUTION.md#completed-owner-acceptance--local-development-only) and the [implemented correction](../implementation/SYNC-003B_CONFLICT_FREE_RECONCILIATION.md).

The original investigation below is preserved as historical evidence. Pending reports, unsupported review and unperformed recovery describe that earlier stage, not current development status. Successful recovery does not establish the missing historical parent chain.

**Status:** development-only diagnostics implemented and tested. No synchronization behavior fix. The [consecutive-conflict anomaly](SYNC-003B_CONSECUTIVE_CONFLICT_DIAGNOSIS.md) remains unresolved until the owner supplies live reports. No Google requests or owner-browser access were used for this implementation. Production remains NO-GO.

## Safety and implementation

The development-only Google Drive area has **Sync-Diagnose anzeigen / Show sync diagnostics**. It displays a readonly, manually copyable JSON textarea. It does not download, transmit or automatically copy anything to the clipboard. Closing returns focus to the diagnostic button; existing synchronization feedback and conflict controls are preserved.

`controller.diagnosticReport()` takes a snapshot of existing in-memory controller flags and calls `readDiagnosticRecords()` only if that controller already has an open application storage adapter. That narrow storage seam delegates directly to the existing `raw.read()` on the live connection: one native `readonly` transaction over the existing stores. It does not call `db()`, `openApplicationStorage`, recovery, validation-with-write, migration or a synchronization method. It never opens a database, so it cannot create a database, upgrade a schema or trigger an upgrade/migration handler. No database enumeration fallback is needed. If the connection is absent/closed/unreadable, the report explicitly says `no-existing-connection` or `read-unavailable`; no reopen is attempted. Blocked activation-marker access produces `activated: null`, not a false inactive state.

`diagnostics.mjs` is a pure, strict allowlist projection. It locally validates the cached snapshot graph and computes structural/consistency indicators without retaining changes in the application. The ordinary timer, editor storage, outbox, reconciliation, authentication and sync transitions are unchanged. No error/dirty/review field is reset or rewritten by diagnosis.

The report contains only:

- Local activation/account-bound booleans; local/dirty revision and dirty flag; known base and SHA-256 snapshot-head identifiers/counts.
- Current controller connection/busy flags, allowlisted error code and a status derived from local metadata. No account identifier is exported.
- Ordinary upload or reconciliation ticket presence, stage, snapshot/parent hashes and source revision; whether local content/revision matches the retained review anchor; fixed intent/outbox identity equality and whether the ticket is known in cached history/heads.
- Retained in-memory review head/base hashes and revision consistency, if available.
- Cached graph validation, computed heads, stored/computed head equality, base ancestry, common-base count and allowlisted analysis/block/conflict-kind reasons.
- Explicit limitations and unavailability markers.

There is no generic spread/serialization of records, tickets, libraries or authentication responses into output. Hash fields accept only the fixed SHA-256 form; stages, status/reason fields and conflict-kind keys use fixed allowed values. Unknown errors become `UNRECOGNIZED_CODE`. Account keys, profile names/email, Rundown/phase titles, IDs/content, raw snapshots/bytes and all credentials are omitted. Full cached contents are used only transiently for local equality/graph validation, never displayed or sent.

The action is loaded only by the existing explicitly enabled localhost development entry. The normal server denies the diagnostic module; production `src/`, PWA references and service worker are unchanged. The known local server was restarted to load the expanded development allowlist. No owner browser was reloaded by the agent.

## Owner instructions — obtain A and B separately

1. Keep the existing normal Firefox **A** and private Firefox **B** contexts and independent backups. Do not clear site data or open a replacement private window. Do not click Sync, Review conflict, Activate, Connect, Adopt or Disconnect to obtain diagnostics.
2. At `http://localhost:8000/`, perform one owner-controlled reload in each existing tab to load the new development code, then open **Session Editor → Data & Backup**. The agent has not performed this reload. Reload discards transient timer/session/controller state, including authentication, previous in-memory error codes and open review; persisted library/base/heads/outbox/intent remain. This cannot retroactively capture the old pre-reload error variable. Existing cached metadata remains useful.
3. Click **Sync-Diagnose anzeigen**. No Google authorization is needed. The text is selected for manual copy; use Ctrl+C and provide the complete report labelled **A — normal Firefox** or **B — private Firefox** outside the JSON. No automatic file or network transmission occurs.
4. If `storage.readState` is not `read`, retain that report rather than activating/migrating/resetting anything. Diagnostics deliberately do not open a missing connection. If the usual Editor has not yet completed its normal load, wait for it and invoke the action again; the action itself never starts initialization.

## Fields to compare

- `storage.base`, `knownHeads`, `knownHeadCount`, `history.computedHeads` and `storedHeadsMatchComputed`: compare cached observations between A/B, especially whether both reference the second verified reconciliation. Reports may reflect different last discoveries; neither refreshes Drive.
- `storage.localRevision`, `dirtyRevision`, `dirty`, `dirtyRevisionMatchesLocal`: both 12:00 and 13:00 saved local edits should be dirty. `history.localContentMatchesBase: false` is **expected for a pending local edit**, not evidence of corruption by itself.
- `ordinaryUpload` and `reconciliation`: inspect presence/stage, source revision, `newerLocalRevision`, `acknowledgement`, snapshot/parent hashes and known-head membership. `prepared` / `not-locally-verified` cannot distinguish never uploaded from a lost response. `actualRemoteExistence` remains `not-queried`.
- For a retained reconciliation, compare `reviewedHeads`, `baselineBase`, `baselineRevisionMatchesLocal`, `baselineContentMatchesLocal` and `intentMatchesOutbox`. No retained intent should be silently assumed finalized merely from the visible library contents.
- `history.validation`, `reason`, `reviewStatus`, `unsupportedReason`, `commonBaseCount` and `conflictKinds` distinguish wrong head count, ordering, ancestry, no actual content conflict, unsupported conflict kind, pending ticket and local/base mismatch. `controller.lastErrorCode` is available only if that memory error still exists in this loaded page; after reload it will normally be null.
- `controller.connected: false` after reload is expected for memory-only authorization; `storage.accountBound` may still be true. `controller.cachedStatus` is a local derived indicator, not a newly verified Google status or persisted last-operation result.

## Limitations

This is not a Drive observation, source-build attestation or global cross-tab transaction. IndexedDB records are captured in one readonly transaction; memory flags are sampled separately and another tab may edit concurrently. The report marks busy state but takes no lock. No last-successful-operation timestamp/result was persisted by the existing implementation. Missing/invalid/unavailable metadata is reported rather than repaired. Incomplete or malformed cached histories may yield a sanitized reason with detailed analysis unavailable. A new remote head cannot be discovered by this action. Do not interpret a missing local acknowledgement as permission to re-create an operation.

The action reads persisted metadata, not the phase contents in the owner's independent JSON backups. Recovery or a runtime sync fix still requires separate review. Nothing is automatically overwritten, cleared, imported or published.

## Actual verification

- **146/146 Node tests PASS**, including four new pure/negative diagnostic tests and existing gate/core/transport/Quick/Planner/Session/DATA-001 suites.
- **4/4 native IndexedDB diagnostic scenarios PASS:** clean activated library; supported conflict; unverified durable reconciliation; unsupported one-head review/error. Instrumentation requires exactly one readonly transaction, zero database opens, zero store mutation calls/write transactions, zero fetch attempts and no Drive/mock or localStorage write. Full persisted records and controller status compare unchanged before/after; secret/content sentinels are absent.
- **21/21 conflict and 14/14 existing application experiments PASS**. The actual UI tests show a copyable readonly report before activation and during an uncertain reconciliation, with no additional network events and unchanged sync feedback. Existing DE/EN, themes, 320px, editor, two-context resolution and actual page-reload recovery pass.
- Full existing `node tests/browser-check.mjs` **PASS**, including DATA-001, ordinary editor behavior, Quick/manual/automatic timers, responsive views and PWA offline. No actual Google login/API calls were used; transport was intercepted/mocked in fresh temporary browser profiles.
- `git diff --check` passes. Generated browser evidence remains in OS temporary directories. No production browser/iOS/VoiceOver acceptance is claimed.

Focused commands:

```powershell
node --test tools/app-sync/diagnostics.test.mjs tools/app-sync/gate.test.mjs
node tools/app-sync/browser-check.mjs
node tests/browser-check.mjs
```

## Exact scope and Git state

This diagnostics increment modifies only `tools/app-sync/controller.mjs` (readonly accessor), `storage.mjs` (existing-connection read seam), `panel.mjs` (diagnostic action/output), `server.mjs` (development allowlist), `browser-check.mjs`, `gate.test.mjs` and the diagnostic follow-up link in `docs/SYNC-003B_CONSECUTIVE_CONFLICT_DIAGNOSIS.md`.

New: `tools/app-sync/diagnostics.mjs`, `diagnostics.test.mjs`, `diagnostic-experiments.mjs` and this document. Earlier uncommitted B implementation/diagnosis remains intact. No synchronization predicate, state transition or conflict-resolution handler was altered by this increment.

Branch `feature/sync-003b-conflict-resolution`; HEAD `d67658da46e55bb83117e9c553bb5dd5cafba042`. Nothing staged; no commit, tag, push, merge or deployment. Full pending status, including pre-existing work:

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
?? docs/SYNC-003B_CONFLICT_RESOLUTION.md
?? docs/SYNC-003B_CONSECUTIVE_CONFLICT_DIAGNOSIS.md
?? docs/SYNC-003B_READ_ONLY_DIAGNOSTICS.md
?? tools/app-sync/conflict-experiments.mjs
?? tools/app-sync/conflict-panel.mjs
?? tools/app-sync/diagnostic-experiments.mjs
?? tools/app-sync/diagnostics.mjs
?? tools/app-sync/diagnostics.test.mjs
?? tools/sync-core/copy-names.test.mjs
```
