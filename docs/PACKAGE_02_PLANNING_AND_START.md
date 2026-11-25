# Package 02 — Planning and Start eligibility

## Decision and status

The Product Owner accepted the IST/SOLL analysis and the three-slice
decomposition. Independent static and functional-scope review accepted
**Slice 02.1** with the browser gate open due to pre-existing Picker/Editor
Store-read contention. Independent review accepted **Slice 02.1a** and closed
its regular aggregate browser regression gate. Package 01 is Owner-accepted on staging
PWA v86 at `ebb0039ddaa096ab968554d62fcedfc6a499d7d6`. Production release
requires separate authorization. The Slice 02.1 baseline was
`9a23eba4743bacfc235c2dc4168fb7d428749127`. Slice 02.1a starts from verified
local and remote `develop` at `c9706c6023b98cf1d4b7b45d443c5b6c01125221`.

The [UX-001 decisions](EDITOR-001_UX-001_DECISIONS_2026-11-16.md#5-emptyincomplete-planning-state-versus-valid-execution)
define incomplete planning and strict Start eligibility. The
[UX-002 decisions](EDITOR-001_UX-002_MOBILE_DESIGN_2026-11-24.md) replace the
historic zero-phase placeholder with an empty agenda. The
[Editor evolution](SESSION_EDITOR_EVOLUTION.md) and
[terminology mapping](TERMINOLOGY_MAPPING.md) retain independent Template and
Event identity, runtime and lifecycle requirements, and the distinction between
Start Event (enter READY) and Start (start the countdown).

## Accepted IST/SOLL

| Area | v86 baseline | Accepted Package 02 outcome |
| --- | --- | --- |
| Empty planning | The draft can contain zero phases. The strict Domain validator rejects persistence. The Workspace uses the same strict preflight for a new planned Event. | Save and reopen named Event Templates and Planned Events with zero phases, including after removing the final phase. Render an empty agenda with Add Phase. |
| Incomplete phase | A draft holds temporary invalid input. Phase fields require title and duration. An explicitly added phase currently starts with 600 seconds. | Retain real phases with stable IDs, order, categories, prepared information and valid resources. A missing timebox is representable in planning. An unnamed genuine phase receives the agreed localized display label. Invalid input stays editable and receives specific feedback. |
| Duration total | The Workspace totals all safe integers, including values outside the timebox limits. | Sum specified valid timeboxes and indicate missing durations separately. Preserve current duration limits. Missing means unspecified. Untimed phases and a target total remain deferred. |
| Library and Picker | Template and Planned actions expose Start without inspecting eligibility. | Show nonstartable records with a concrete reason and Edit or Continue Editing, using the agreed subdued timer-off treatment in the library. Keep Plan Event available for Templates. The Picker uses the same reasons and a route to editing. |
| Direct Start and activation | Template launch writes a Planned copy and then activates it. PLANNED activation, runtime and first Start already have strict checks. | Check eligibility before the first direct-launch write and within PLANNED activation. Start requires at least one real phase and a valid timebox for every phase. Preserve phase order and identity through READY. The countdown starts only on the separate Start action. |
| Lifecycle, history and persistence | The aggregate validates Template, PLANNED, READY, ACTIVE, SUSPENDED and COMPLETED records. Checkpoints, Attempts and results have separate bindings. | Limit incomplete persistence to Template and PLANNED. Preserve strict runtime, ownership, reconciliation, history and write contracts. Keep the single Store and writer. |

## Validation graph

- **Domain and aggregate.** `validateRundownPlan` calls the strict phase
  and duration validators. It serves Template plans, each lifecycle's current
  plan, Attempt start snapshots, the Workspace new-Event save preflight, and
  the draft recovery plan ticket. `editor-storage.mjs` validates the complete
  aggregate by lifecycle and verifies the active-runtime binding. Strict
  suspended and completed records and the current history protections remain
  part of this contract.
- **Editing and planning.** `editor-template-draft.mjs` retains editable
  input and stable IDs. `editor-planner-service.mjs` and
  `editor-template-integration.mjs` materialize and validate Template saves.
  PLANNED saves are checked by the Store transform, which is also replayed
  against the original record when verifying reconciliation tickets. The
  Workspace's new-Event save uses an ordinary planning write followed by an
  update of the copied plan. Its existing partial-write and recovery paths
  remain in place.
- **Start and runtime.** Workspace and Picker use a common App action
  handler. The Launch Service uses the Store writer for planning and the
  Runtime Bridge for activation. `execution-runtime.mjs` revalidates READY and
  projects every phase into `prepareSession`. The strict timer-side
  `templates.mjs` validator and legacy recovery remain intact.
- **Recovery and portability.** The editable recovery record preserves raw
  input; its pending operations reproduce expected source and target data.
  Public automatic draft recovery is wired for Templates. Portability uses
  the Template validator for individual exports and the Store validator for
  Event and backup snapshots. Template import uses a newly identified copy
  and the same writer. Parsing is passive.

## Slices and verification requirements

| Slice | Change and affected files | Dependencies, risks and acceptance |
| --- | --- | --- |
| **02.1 — Authoritative Start boundary** | Add the shared reason check in `editor-domain.mjs`. Apply it to the direct-launch Store transformation before planning, to the PLANNED activation transformation, and to the shared App precheck before asking to leave a progressed Quick Timer. Route a definitive rejection through the Launch Service and release the Runtime Bridge's newly acquired ownership. | Approved first slice. Preserve conflict precedence, ownership order, successful two-write direct launch, partial and uncertain operations, and read-only reconciliation. Focused Domain, Launch Service, Store and Runtime Bridge tests, complete Node regression and public browser checks. |
| **02.2 — Named plans with zero phases** | Open persisted validation only for `Template.plan` and `PLANNED.currentPlan`. Adapt Workspace save preflight, draft recovery tickets, and the library/Picker reason and editing affordances. Verify Store, planner, portability and import through existing entry points. | Depends on 02.1, independent approval and compatibility assessment. High risk at the aggregate read/write boundary. Keep valid active records readable in a mixed Store. Verify lock release, zero rejected writes and conflict precedence at both authoritative Start entry points through **real persisted** zero-phase fixtures. Cover Save, reopen, independent Plan Event, import/export, and uncertain-write reconciliation. |
| **02.3 — Missing timeboxes and unnamed real phases** | Extend the shared planning contract and draft/UI conversion once representation is approved. Adjust phase fields, draft recovery, duration total and start reasons. Project a strictly valid Rundown at activation. | Depends on 02.2, independent approval and the representation/fallback decisions below. Risks include normalization, recovery and archive semantics. Use **real persisted** mixed and missing-timebox fixtures. Verify all phase data and order survive Save/import/export, exact reason counts and a zero-write rejection, clean lock release, and complete READY after finishing the plan. Cover DE/EN, focus and retained invalid input. |

### Implemented boundary in 02.1

`startEligibilityReason` calls the existing strict rundown validator and
returns `null` for an eligible plan. Rejections use its existing reason codes,
including `phasesRequired`, `duration`, `phaseTitle` and `totalLimit`. Absent
and invalid durations both use `duration` in this slice. The Store enforces the
check after the existing revision, identity and lifecycle checks. Direct
Template launch passes an explicit Start intent to the existing planning
transform; ordinary planning uses the same transform without that intent.
The UI precheck is advisory. The Store remains the authority for a stale
selection or a change while waiting for a lock.

The Runtime Bridge releases the ownership it just acquired after a
`StartEligibilityError` from activation. Existing ownership behavior for
conflicts and operational failures remains in place, including retained
ownership on uncertainty. Definitive eligibility rejection creates no pending
operation. A valid direct launch still makes two confirmed writes and ends in
READY with no Attempt. The operational partial result after the first
confirmed write remains available for observation or later activation.

**Coverage boundary.** The current aggregate still rejects zero phases, null
durations and blank persisted phase titles before either authoritative Start
transform can see them. The tests exercise the reason check on candidate plans,
strict rejection at the real Store read/validation boundary, and the typed
eligibility rejection signal inside locked writer callbacks for service and
ownership behavior. End-to-end eligibility with validly persisted incomplete
records, including the negative browser cases, is mandatory in 02.2 and 02.3.
The existing expectations for strict malformed data, active ownership and
runtime history remain in the regression suite.

## Slice 02.1 verification

Commands ran from the repository root on Node 22.17.1 and headless Edge
158.0.4370.33. The review archive contains the diff against the approved
baseline, the changed files, full output logs and the temporary diagnostic
runners. The focused environment variables were set in separate PowerShell
processes. Browser counts refer to logged PASS checkpoints.

| Exact command and environment | Exit and observed result |
| --- | --- |
| `node --test --test-reporter spec tests/editor-domain.test.mjs tests/editor-launch-service.test.mjs tests/editor-storage.test.mjs tests/editor-runtime-bridge.test.mjs` | 0, 214 passed, 0 failed or skipped |
| `node --test --test-reporter spec @(git ls-files '*test.mjs')` | 0, 584 passed, 0 failed or skipped across 37 tracked files |
| `node tests/browser-check.mjs` with `EASYTIMER_PUBLIC_CUTOVER_ONLY=1` | 0, 1 checkpoint covering public Picker/direct launch, resume, lifecycle, archive and legacy recovery |
| `node tests/browser-check.mjs` with `EASYTIMER_EDITOR_RUNTIME_ONLY=1` | 0, 3 checkpoints covering native exits, ordering, reconciliation, cleanup, navigation and recovery |
| `node tests/browser-check.mjs` with focused flags unset, twice | 1 on both runs, 12 checkpoints each. Last PASS was Quick subtraction. Workspace Back timed out waiting for the library at `tests/browser-check.mjs:265` from line 513. |
| `node tests/.package-02-01-browser-diagnostic.mjs` with current source | 0, all 20 aggregate checkpoints. The copy adds a DOM snapshot only if that wait fails and rethrows the original failure. |
| `git archive --format=zip --output=.package-02-01-evidence/baseline-src.zip 9a23eba4743bacfc235c2dc4168fb7d428749127 src`, then `Expand-Archive -LiteralPath .package-02-01-evidence/baseline-src.zip -DestinationPath .package-02-01-evidence/baseline` | Extracted the unchanged application baseline locally for comparison. |
| `node tests/.package-02-01-browser-diagnostic.mjs` with `EASYTIMER_WEB_ROOT=.package-02-01-evidence/baseline/src` | 1, same last PASS and same Workspace Back failure. The snapshot shows the Editor's saved-data read error and Retry loading action. |
| `node tests/.package-02-01-browser-lock-diagnostic.mjs` with the same baseline web root and `EASYTIMER_WORKSPACE_BACK_ONLY=1` | 1, expected reproduction. The probe holds the Picker read lock until the Editor requests it, records the Editor's denied acquisition, then releases the Picker lock. The same error screen and readiness failure follow. |
| `node --check` on all nine changed JS/MJS files and `git diff --check` | 0. The scope check confirms the workflow, PWA version, timer engine, recovery/storage infrastructure and Workspace renderer are unchanged. |

The unchanged baseline reproduces the browser failure. The controlled trace
shows a causal path in the baseline: Picker and Editor use the same exclusive
Store lock for reading, and the Editor's `ifAvailable` request fails while
the Picker holds it. The normal failing runs have no lock trace. The
successful instrumented aggregate, focused public cutover and isolated
Runtime checks verified Slice 02.1 in the browser. The intermittent failure
kept its uninstrumented aggregate gate open at that checkpoint and was
outside the authorized start eligibility slice.

## Slice 02.1a — Picker and Editor read coordination

An initial Picker load could still hold the exclusive Store lock when the
user opened the Editor. Navigation invalidated the Picker result while the
underlying lock request continued. The Editor's `ifAvailable` acquisition
then failed, and the existing load-error view offered Retry loading. The
controlled v86 and 02.1 reproductions captured this failure and confirmed
that manual retry after release restored the library.

The App now sequences its own Picker and initial or explicit-retry Editor
reads. Each queued read waits for the prior service promise, which settles
after the underlying lock request, including on failure. A Picker refresh in
the same navigation shares its pending read. A queued operation that has
already been superseded performs no Store read. The Editor shows its
existing loading state when opened, finishes any existing fullscreen
handoff, and makes one fresh validated read for the opening that remains
current. An opening or retry that becomes stale while reading is discarded
before it can install records, call host callbacks or render and focus.
Returning to the Picker refreshes an invalidated load using the same
sequencing and navigation protections.

The navigation coordinator uses the existing Store reader. The Store lock
mode and availability policy, exclusive writes, active ownership, revision
checks, reconciliation and uncertainty handling remain unchanged. An
independent lock holder still triggers the existing load error and explicit
retry. Malformed Store data still fails closed and remains stored. Existing
close guards and mutation completion paths continue to apply.

A shared read lock would introduce an additional acquisition policy at the
Store boundary. A retry after `lockBusy` would still depend on when the
holder releases the lock. Sequencing the known same-document reads lets each
view keep its existing validated read and leaves other callers' lock policy
intact. While the current opening waits, focus moves into the visible loader
and then to the Editor heading. Closing the view invalidates both its
potential read and its completion callbacks.

### Slice 02.1a verification

The commands ran from the repository root on Node 22.17.1 and headless Edge
158.0.4370.33. The regular aggregate used the repository runner with the
new regression scenarios active and no focus flag, diagnostic loader or
alternate web root.

| Command | Observed result |
| --- | --- |
| `$env:EASYTIMER_EDITOR_NAVIGATION_ONLY='1'` followed by `node tests/browser-check.mjs` in a dedicated shell | Exit 0, 6 browser checkpoints. Both Editor entry points begin loading while the Picker holds the lock and make one fresh read after release. Repeated refreshes coalesce, Back reloads the Picker, and rejected or stale reads leave view, focus, host callbacks and READY Runtime intact. External lock and corrupt-data paths retain explicit manual retry. |
| `node tests/browser-check.mjs` | Exit 0, 26 checkpoints including ordinary Picker/Editor Back, all six new checks, public cutover, Runtime, fullscreen and offline first Start. |
| `node --test --test-reporter spec tests/editor-workspace-boundary.test.mjs` | Exit 0, 8 passed. The Picker guard assertion now checks navigation identity, coalescing and the stale-result guard. |
| `node --test --test-reporter spec @(git ls-files '*test.mjs')` | Exit 0, 584 passed across 37 files, 0 failed or skipped. |
| `node tools/release/package.mjs` and `node tools/release/package.mjs --verify $packagePath` using the emitted directory | Both exit 0, 41 files, PWA v86. |
| `node tests/artifact-offline-browser.mjs` | Exit 0, 7 checkpoints including stopped-server cold start and missing-cache negative control. |
| `node --check` on the five changed JavaScript files, `git diff --check` and the source-scope comparison to `c9706c6` | Exit 0. Product changes are confined to App and Workspace. Store, lock, runtime, planning validator, PWA version and packaging code match the baseline. |

Earlier focused runs exposed two fixture assumptions around locale and the
READY handoff and a real focus gap in the newly visible loading state. The
archive retains those failures and the final green runs. The review ZIP
contains the complete patch, full changed files, Git status and diff
statistics, and test and packaging logs.

## Questions for separate approval

- **Before 02.2** assess compatibility with older or offline app versions and
  rollback to v86 after incomplete plans have been saved. The current v86
  aggregate reader rejects such a Store as `storageValidation`, including
  when it also contains a valid runtime. No migration of currently valid
  records is anticipated. Prove behavior for mixed-version tabs and rollback
  before committing to rollout. Preserve fail-closed reads and writer
  revision protections.
- **Before 02.3** decide the canonical representation of unspecified duration
  and the localized unnamed-phase fallback. `durationSeconds: null` is a
  candidate for the existing field. Define how an unnamed phase is represented
  in planning, how it enters the strict ready plan, and what the saved
  language, retained plan, Attempt snapshot and archive should contain. Keep
  the source Template independent.

Package 03 owns Save and Save & Back, draft lifecycle and associated
navigation. The later library, responsive and Facilitator Panel work follows
the existing approval and scheduling boundaries.
