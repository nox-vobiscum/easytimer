# SYNC-003B — Unexpected conflict after two reconciliations

**Current status - historical report:** SYNC-003B is functionally accepted in local development. Owner-operated real Google Drive acceptance passed for A/B/Keep Both, explicit conflict-free reconciliation, live recovery and preservation of the second client's unpublished changes. Both Firefox contexts ended with the same 13:00 + 08:00 library and Synced (last checked). Final local diagnostics showed one valid head, matching base, no dirty changes and no pending tickets; they do not independently verify current remote Drive state. Production remains NO-GO. See [completed acceptance and production blockers](../implementation/SYNC-003B_CONFLICT_RESOLUTION.md#completed-owner-acceptance--local-development-only) and the [implemented correction](../implementation/SYNC-003B_CONFLICT_FREE_RECONCILIATION.md).

The original investigation below is preserved as historical evidence. Pending reports, unsupported review and unperformed recovery describe that earlier stage, not current development status. Successful recovery does not establish the missing historical parent chain.

**Historical initial verdict:** the original fully-synchronized three-round replay did not reproduce the anomaly. The subsequent [concrete two-head analysis](SYNC-003B_TWO_HEAD_ANALYSIS.md) now confirms the unsupported `proposed` / `NO_CONTENT_CONFLICT` gate and reproduces a matching state pattern when content already matches but a client has not adopted the resolution head. The exact live parent chain still needs parent/receipt metadata. No runtime fix or live recovery has been performed; do not clear either store/ticket. The remainder below records the earlier investigation and its evidence limits.

**Subsequent separately approved diagnostics:** the [read-only owner report action](SYNC-003B_READ_ONLY_DIAGNOSTICS.md) is now available in the development application. It uses an already open connection, never opens/upgrades a database and never syncs or writes. This supplies a safe owner-operated evidence path; no live reports have yet been collected and no conflict behavior fix is claimed. The results and proposed authorization boundary below describe the preceding investigation.

## Owner evidence versus experimental evidence

The owner reported two successful real-Drive rounds: from 07:00, Keep Both produced original 09:00 plus independent 08:00 copy; a second 10:00/11:00 conflict was resolved to 10:00, preserving the 08:00 copy. Both Firefox contexts displayed that result and last-checked. After local 12:00/13:00 edits, A reconnected and Sync now reported conflict before B published; Review conflict then reported unsupported. These observations are accepted as the reported sequence, not independently verified storage/HTTP evidence. They do not establish actual current remote heads, local base/ticket state or the loaded module versions.

The newly added regression uses native IndexedDB, the existing fake Drive and deterministic request ordering. Four scoped fixed UUID sequences make snapshot identities reproducible without changing application code. The existing mock deliberately paginates listings one file at a time. Every context uses a fresh isolated test database, never the owner's origin storage. Initial duration is 07:00. The first three variants explicitly assert original 09:00/copy 08:00 after Keep Both; the fourth also preserves whichever independent copy the fixed hash order assigns.

Each variant then publishes 10:00/11:00, explicitly selects the 10:00 version by its displayed content, and pulls it to the other client. Assertions on **both** persisted states require:

- one current known head, `base` equal to it;
- local library exactly equal to that base snapshot;
- no ordinary outbox or reconciliation sidecar;
- `syncDirty: false`, 10:00 original and unchanged independent copy;
- last-checked status.

Both clients then save 12:00/13:00 locally. Before B publishes, A's 12:00 sync must succeed, create exactly one additional immutable file/POST and leave one remote head; B's local 13:00 stays intact. Only B's subsequent publication creates a real two-head conflict, which is reviewable and involves the original identity alone.

| Third-round variable | Actual result |
| --- | --- |
| No authorization change | PASS; A publishes 12:00 without conflict |
| Explicit same-account authorization again | PASS; A publishes 12:00 without conflict |
| Injected HTTP 401, followed by same-account authorization | PASS; failed attempt retains state, successful retry publishes 12:00 |
| Close/reopen application manager and native IDB connection, authorize again | PASS; saved pending edit and base survive; A publishes 12:00 |

The 401 is a deterministic mock response, not actual elapsed token expiry or Google acceptance. Reopen is a manager/connection test; the existing browser harness separately covers actual page reload for pending reconciliation. No live Google calls occurred.

## What the code proves, and what it does not

References refer to the current uncommitted B implementation, preserved during diagnosis:

- `tools/app-sync/controller.mjs:19` (`reconcilePublication`) reports last-checked only after verified readback plus `observe` returning no conflict. `tools/app-sync/storage.mjs:104` (`observe`) atomically installs a resolution only when its exact file is present, it is the sole known head and the local anchor still matches; it sets `base`, clears dirty and retires ticket/sidecar together. `storage.mjs:140` (`adopt`) similarly updates a clean peer's local library and base in one guarded transaction. Those paths succeeded across repeated resolutions in the tests.
- `controller.mjs:121` (`sync`) distinguishes clean fast-forward, ordinary upload and guarded sibling publication. Conflict can be raised before ticket creation (`145`/`148`), after discovery following publication (`162`), or during reconciliation recovery (`34`). `storage.mjs:126` also treats a retained reconciliation intent as an unresolved condition even if remote head count is one. Thus the generic conflict message does **not** prove two current conflicting remote versions exist, nor does it prove that A's 12:00 upload did not occur.
- `controller.mjs:59`/`:61` intentionally combine several unsupported checks: current head count other than two; no unique common ancestor; blocked library ordering; no actual conflicting content; deletion/restoration or other unsupported row types. `tools/sync-core/graph.mjs:86` and `tools/sync-core/reconcile.mjs:43`–`:64` supply those analyses. The translated unsupported message does not identify which predicate failed. A one-head state may therefore legitimately fail the A/B review gate; UI wording alone cannot identify the actual state.
- `tools/sync-poc/core.mjs:117` authorization clears the old in-memory capability and identifies the account; the application binds that account in IndexedDB. It does not rewrite the local base, library, pending edit or snapshot parents. Explicit reconnect and injected 401 did not produce the anomaly. This is not proof that every real expiry/race variant is harmless.
- `controller.mjs:108` renders status from in-memory errors or the persisted observation; it does not perform a fresh Drive list. Last-checked describes that successful observation, not an atomic guarantee about all subsequent remote publication. Drive discovery is not globally atomic, and the mock cannot prove actual Google listing visibility. No conclusion about hidden/late files is warranted without evidence.

**Answer to why A saw conflict before B published:** unresolved. If the verified single-head state persisted as in the synthetic replay, A's first publication succeeds. A different actual remote observation, stale local binding, retained publication intent, a newer local revision during prior installation, another writer or different loaded code remain hypotheses, not findings. B's current unpublished 13:00 edit alone cannot appear in A's Drive discovery.

**Answer to why review was unsupported:** at least one of the supported-case predicates above failed in the fresh review, assuming the reported message came from the current B code. The message discards the detailed reason, so it cannot establish head count, ancestry or conflict type. The exact failing predicate is not recoverable from the supplied UI narrative.

**Classification:** no confirmed protocol/state-handling defect yet. A confirmed diagnostic limitation is that distinct sync stops and unsupported review states share generic feedback. Do not conflate that limitation with a demonstrated broken reconciliation algorithm.

## Smallest safe next step and correction boundary

There is no evidence-backed library/base/ticket correction to implement now. Do not force the base to a newer hash, clear dirty, replace a ticket, ignore a remote head or loosen semantic validation. Any such speculative fix could discard the owner's 12:00/13:00 edits or misacknowledge an uncertain upload.

Recommend a separately approved, **owner-operated read-only diagnostic** using already cached IndexedDB metadata, without authorization, Drive calls or writes. A minimal report should include:

1. Loaded application/module build identifiers and capture point (after the already observed stop, not another sync).
2. Local revision/dirty revision and dirty flag, base reference, stored heads versus heads recomputed from cached validated history; whether local content equals its base and the base is an ancestor of each head.
3. Presence/stage of outbox and reconciliation intent; equality of their fixed ticket identities; source revision versus local revision; whether the ticket snapshot is in cached history/current heads.
4. Cached graph validation result, number of heads, common-base count, analysis status/block reason and conflict-kind counts. Use consistent opaque aliases to relate snapshots across the two reports; omit access tokens, account identity, raw JSON libraries, names and phase contents.

The agent has not collected this report or changed runtime code to add it. The independent JSON backups protect content but omit sync ancestry/outbox state and cannot identify this failure by themselves. If cached metadata cannot explain the anomaly, fresh remote evidence would need new explicit authorization, with non-writing discovery and preserved local state; it is outside this diagnosis.

Once the failed predicate is known, patch that specific state transition and add the captured synthetic topology to the regression. A small diagnostic reason-code distinction may be appropriate, but it must not suppress a real safety stop. Existing immutable hashes, account binding, ticket identity, revision checks and complete-history validation remain mandatory.

## Recovery assessment

No evidence requires clearing storage. No evidence currently proves a particular automatic recovery path is safe for the live state. Preserve both profiles, original immutable files, fixed outbox/intent and independently exported backups. Do not import a backup over the current libraries, delete snapshots or repeatedly publish merely to try to make the error disappear. Diagnosis can proceed read-only; a recovery plan should be chosen only after identifying the actual heads, base and pending ticket. No live recovery was attempted or guaranteed.

## Changes, tests and exact Git status

This diagnosis changes only:

- `tools/app-sync/conflict-experiments.mjs`: four additional deterministic consecutive-round regressions and an optional initial fixture argument.
- `tools/app-sync/browser-check.mjs`: expected conflict-scenario count changes from 17 to 21.
- This diagnosis document and the investigation link in `docs/SYNC-003B_CONFLICT_RESOLUTION.md`.

Inspected: application `controller.mjs`, `storage.mjs`, `drive.mjs`, prior conflict experiments/browser harness; shared `sync-poc/core.mjs`, `sync-core/graph.mjs` and `reconcile.mjs` predicates; prior B implementation report and current Git state. Runtime sources were not modified by this diagnosis. No production files, OAuth, server configuration or browser data changed.

Executed: `node tools/app-sync/browser-check.mjs` — **21/21 conflict scenarios and 14/14 existing application experiments PASS**, plus the actual two-context UI/preview/reload/recovery regression. `git diff --check` passes. No newly failing test. The owner's anomaly remains **NOT REPRODUCED**, not resolved. No new Node/full production-browser-suite run was needed or claimed for these test/documentation-only changes; previous B results remain historical.

Branch: `feature/sync-003b-conflict-resolution`; HEAD: `d67658da46e55bb83117e9c553bb5dd5cafba042`. Nothing staged. Earlier B work remains intact; no commit, tag, push, merge or deployment.

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
?? docs/SYNC-003B_CONSECUTIVE_CONFLICT_DIAGNOSIS.md
?? tools/app-sync/conflict-experiments.mjs
?? tools/app-sync/conflict-panel.mjs
?? tools/sync-core/copy-names.test.mjs
```
