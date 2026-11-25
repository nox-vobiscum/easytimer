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
The accepted compatibility contract was published separately at
`26ac178acbc9ebfb5870db95709acfd11a73ac54`. Independent review accepted
Slice 02.2 and its automated regression. Rollout approval remains pending.
The reviewed Slice 02.2 implementation was published at
`fabb81697ee6a8993755f49d4c25e85c235f9333`. The Product Owner accepted
the 02.3a/02.3b decomposition and authorized 02.3a. Independent review
accepted Slice 02.3a and all final automated verification gates. Slice 02.3b
and its final automated verification passed independent review. Regular
Package 02 implementation is complete. Rollout and Owner acceptance remain
pending.

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
| Incomplete phase | A draft holds temporary invalid input. Phase fields require title and duration. An explicitly added phase currently starts with 600 seconds. | Retain real phases with stable IDs, order, categories, prepared information and valid resources. A missing timebox is representable in planning. An unnamed genuine phase receives the fixed display label. Invalid input stays editable and receives specific feedback. |
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

## Before Slice 02.2 — mixed-version compatibility assessment

**Independently accepted compatibility contract:** Keep Schema-2 and the existing Store key.
Require backward reading by the new app and fail-closed behavior in old
clients. Accept that v86 loses access to the native Editor and Event Runtime
when its Store first contains an unsupported plan. Once a build can write such
records, keep a zero-phase-capable reader as the rollback floor. This assessment
does not authorize a release.

### Evidence and scope

The [Store](../src/js/editor-storage.mjs) saves one aggregate under
`easyTimerEditor.v1` at Store schema 1 with Schema-2 entities. A load validates
all Templates and Executions before returning the aggregate. In v86, a single
zero-phase Template or PLANNED Event fails that validation. Only a missing key
produces an empty aggregate. An unreadable aggregate produces `storageValidation`.
The [Store writer](../src/js/editor-storage-lock.mjs) loads under the existing
exclusive lock before calling the transform. A saved snapshot must still
match the exact raw bytes and expected aggregate revision. Successful writes
advance the revision by one and confirm identical readback. This explains
both the fresh-write rejection and the stale-snapshot conflict.

At boot, the [Runtime Bridge](../src/js/editor-runtime-bridge.mjs) reads the
entire Store before claiming active ownership and reads it again after
claiming. A Store validation error blocks adoption even when the persisted
active entry is valid on its own. An already-loaded owner continues to use its
loaded Runtime. On a persisted action, v86 hits the same Store validator and
blocks the Runtime controls. Ownership can remain held until that tab leaves.

The [service worker](../src/service-worker.js) precaches during install, uses
`skipWaiting`, deletes older app caches during activation and claims existing
clients. Navigations try the network and fall back to cached HTML. Assets are
cache-first, and several domain module URLs are unversioned. Claiming a client
does not restart its loaded JavaScript. An older tab and a new tab on the
same origin can therefore access the same Store with different validators.
An offline client can continue to boot the cached old shell until it receives
an update. A release must verify consistent assets on startup and update.

The isolated assessment used the exact staging application source at
`ebb0039ddaa096ab968554d62fcedfc6a499d7d6` and an extracted copy of the reviewed
`d0bdee56cf149acc1836d9d07c184546c036c237`. In the copy only, the probe allows
zero phases for Template and PLANNED validation and simulates a new cache
generation. The actual Store, writer, Runtime, import/export and service
worker behavior are exercised on a disposable loopback origin. READY and
started Runtime validation remain strict in the probe. The candidate is a
compatibility model. It is not an implementation or verification of the
future 02.2 Workspace, editing or rollout.

| Scenario | Observed behavior | Safety and availability |
| --- | --- | --- |
| Existing complete records and exports | The compatibility model accepts the existing v86 Template and independently planned Event as-is and round-trips an existing v86 backup. v86 itself also cold-starts offline with that Store. | Same Store shape. The read does not rewrite records. Existing records need no migration. |
| v86 meets a zero-phase record | Separate zero-phase Template and PLANNED Event probes both fail with `storageValidation`. An already-failed Store instance rejects Save with `storageBlocked`. The model still rejects activation of the incomplete Event. | Bytes stay intact. Native access through that Store is unavailable in v86. |
| Mixed-version tabs | After the compatible writer persists the two zero-phase records, a fresh read or write in the still-loaded v86 tab returns `storageValidation`. The write transform is never called. A previously loaded v86 snapshot returns `conflict` on Save. | No overwrite or revision advance from the old tab. |
| Mixed Store with a valid RUNNING Event | The compatible app recovers the same Run and Attempt from the mixed Store on an offline cold start. v86 rejects the entire Store. On offline rollback, its Event recovery and Editor show errors while Quick Timer still works. | The aggregate is byte-identical before and after rollback, but the native feature outage includes unrelated Events. |
| v86 already owns a live Event | A newer tab writes a zero-phase Template without changing the running Event. The existing v86 owner attempts Pause, then blocks the action and retains the active lock. After leaving the old owner, the compatible tab reloads and recovers the same running Event. | No writes from v86 and no altered Run. Timer controls and compatible recovery can be temporarily unavailable until the old owner leaves. |
| Offline update and roll-forward | The probe stopped the loopback server for cold starts and disabled the browser HTTP cache. The worker changed generations on the same origin and removed the old app cache. The open old document still ran v86. After v86 rollback with mixed data, updating forward to the compatible cache restored the same RUNNING Event. | Operational recovery uses a compatible app on the same origin and profile. If only v86 is cached, getting the compatible shell requires connectivity. |
| Portability and Draft Recovery | The compatible model parses its full backup and individual zero-phase Template export. Both are `portabilityInvalid` in v86. The public importer rejects a full backup even on the compatible model. v86 accepts editable zero-phase draft data in isolation but reports `recoveryValidation` for an incompatible pending save ticket without modifying or removing it. | Full backup is an export, not an existing restore route. An unreadable Workspace can also prevent user access to its export controls. Return to the compatible app to use supported export and reconciliation. |

The final probe ran as `node .package-02-compatibility-probe/probe.mjs`
on Node 22.17.1 with headless Edge 158.0.4370.33. It exited 0 with ten
checkpoints. An earlier eight-checkpoint run also exited 0. The reproducible
probe and logs are in the local untracked
`review-package-02-compatibility.zip`. The reviewed 02.1a suites were not
rerun. The probe uses one browser engine and synthetic data. It covers an
incompatible Template save ticket. Planned Event save and observation tickets
still require end-to-end verification in the actual 02.2 implementation.
The probe does not verify every cache activation interleaving or device.

### Options and rollout contract

| Option | Assessment |
| --- | --- |
| Keep the aggregate and fail closed in v86 | Smallest change. Existing locks, revision checks and validation protect raw data. The operational cost is temporary loss of the native Editor and Event Runtime on unsupported clients. |
| Deliver a compatible reader before enabling incomplete writes | Can reduce exposure and establish a tested compatible rollback build when rollout needs extra caution. It adds sequencing and still cannot make already-offline v86 clients understand the new records. |
| Preserve full v86 readability with a second Store, placeholders or a data rewrite | Changes storage or planning semantics and introduces data-safety and recovery risks disproportionate to the requirement. |

For a later rollout, verify the real 02.2 candidate with existing Store data,
the mixed cases above, consistent assets through offline update, and the
compatible recovery path before enabling incomplete writes. Reopen upgraded
tabs and installed PWAs on the same origin. Complete or intentionally suspend
active Events in the old app before rollout where practical. Ensure an older
tab is no longer holding runtime ownership before recovering from the
compatible app. A rollout cannot guarantee simultaneous upgrade of offline
tabs, so their temporary unavailability must be an explicit release decision.

Rollback to v86 is operationally safe only for a profile whose aggregate and
relevant pending recovery data are verified v86-readable. Once incomplete
writes are enabled, a blanket rollback to v86 is unsuitable. Roll forward or
revert other changes while keeping the compatible planning reader and strict
runtime boundary. Retain browser data, pending recovery entries and any
exports. Do not clear storage, remove incomplete plans or replace the live
aggregate with an older backup as a rollback step. A precautionary export
before rollout is useful for evidence, with current restore limits understood.

## Slice 02.2 — Named plans without phases

`validatePersistedPlan` accepts an empty `phases` array for Templates and
PLANNED Events. It shares the same plan and phase checks with
`validateRundownPlan`. Blank names, missing phase durations and blank phase
titles remain rejected. READY, ACTIVE, SUSPENDED, COMPLETED and immutable
Attempt snapshots still require an executable Rundown. The writer, Store
shape, storage key, lock ownership and revision checks remain in place.

The library retains Edit, Plan Event and the existing Template copy/import
paths. It offers an individual PLANNED Event export using the existing
passive Execution format. Event planning from a Template creates an
independent Event, including when the source has no phases. A general
Event-to-Event clone, Event import and full backup restore remain outside
this slice. The Picker offers direct editing on the selected, nonstartable
entry, with a localized reason. It refreshes after the Editor observes a
new Store revision. When opening an exact Planned draft from the Picker,
the Editor uses its fresh validated workspace snapshot for the draft's
revision binding; it uses the usual writer on Save. Empty agendas show
Add Phase and contain no placeholder. The existing Save-and-return behavior
remains in effect.

Workspace new-Event save and the Plan observation ticket use the planning
validator. Pending Template and PLANNED saves and import/export retain their
existing canonical records and read-only rechecks. Uncertain creation can
be observed and edited without creating a second Event. A definite
`phasesRequired` rejection creates no new record or revision and releases
any lock acquired for the rejected activation. Valid complete plans still
follow the existing READY preparation and separate first Start.

### Actual-build compatibility and proposed update strategy

The isolated probe used the exact v86 staging source
`ebb0039ddaa096ab968554d62fcedfc6a499d7d6` and a copy of the actual local 02.2
source with its real validators. The loopback server gave the copy a
distinct cache generation to exercise the worker update. The repository
PWA version and implementation source files were not changed by the probe.
It repeated all ten compatibility checkpoints, including a server-stopped
offline cold start, mixed-version writes, Draft Recovery, the rollback to
v86 and compatible roll-forward.

The remaining rollout risk was reproduced with the actual implementation.
After a newer tab wrote an incomplete plan, an older live owner could not
persist Pause and kept the active Runtime lock. The raw aggregate and
the persisted Run and Attempt were unchanged. After the old owner left,
the compatible tab recovered the same RUNNING Event. An offline rollback
to v86 preserved the bytes and left Quick Timer available, while native
Event recovery and the Editor were unavailable.

For a separately approved rollout, start with a coordinated pilot on the
affected origin outside live Events. Ask users to deliberately suspend or
finish active Events in the existing app when safe, close old browser
tabs and installed PWA windows, reconnect offline clients and reopen the
updated app. Confirm the active build and successful Event recovery before
expanding the audience. After incomplete writes are available, retain a
compatible planning reader for rollback. If an older owner is already
blocked, leave the old owner and recover from the compatible app on the
same origin and profile, preserving the stored data. Offline or dormant
old clients cannot be guaranteed to follow the update sequence. Wider
rollout needs a separate decision on that residual operational risk.
There are no forced reloads, planning locks or new ownership protocols in
this slice. The existing backup remains an export without a complete
restore path.

### Slice 02.2 verification

Commands ran on Node 22.17.1 and headless Edge 158.0.4370.33 from the
repository root. The regular browser run enabled all existing and new
scenarios without a focused flag or diagnostic loader.

| Command | Actual result |
| --- | --- |
| `node --test --test-reporter spec tests/editor-domain.test.mjs tests/editor-storage.test.mjs tests/editor-launch-service.test.mjs tests/editor-runtime-bridge.test.mjs tests/editor-template-draft.test.mjs tests/editor-draft-recovery.test.mjs tests/editor-portability.test.mjs tests/editor-template-import.test.mjs tests/editor-workspace-boundary.test.mjs` | Exit 0. All 281 focused Node tests passed. |
| `node --test --test-reporter spec @(git ls-files '*test.mjs')` | Exit 0. All 590 tests passed across 37 tracked files, with zero skipped. |
| `$env:EASYTIMER_ZERO_PHASE_PLANNING_ONLY='1'` and `node tests/browser-check.mjs` in a dedicated shell | Exit 0. Four browser checkpoints including guarded reload with a pending empty Template, uncertain planning observation, read-only rechecks, exact rejected writes and locks, independent import/export, localized direct editing, final-phase removal and successful READY after adding a valid phase. |
| `node tests/browser-check.mjs` | Exit 0. Thirty checkpoints in the regular aggregate including all four new ones. |
| `node tools/release/package.mjs` and `node tools/release/package.mjs --verify $artifact` using the emitted directory | Both exit 0. The inventory and artifact verify at 41 files and PWA v86. |
| `node tests/artifact-offline-browser.mjs` | Exit 0. Seven offline artifact checkpoints including the stopped-server cold start and missing-cache negative control. |
| `node .package-02-02-evidence/compat/actual-probe.mjs` | Exit 0. All ten actual-build compatibility checkpoints passed, including the old live owner and compatible recovery. All 45 source files in the copied candidate matched the worktree byte-for-byte. |
| `node --check` for every changed JS/MJS file, `git diff --check`, and the source-scope comparison | Exit 0. The Store writer and lock, Runtime and timer engines, service worker, version assets and release configuration retain their baseline files. |

The local `review-package-02-slice-02-2.zip` contains the complete
implementation diff against the published compatibility checkpoint, the
separate documentation commit diff, full changed files, exact commands and
logs, and the reproducible actual-build compatibility probe.

## Before Slice 02.3 — duration and unnamed-phase decision analysis

The accepted behavior remains the basis for this analysis. A real Phase can
be planned without a duration or title. Show missing time as `-- min`, show
the fixed unnamed-phase label separately from its position, sum specified
valid timeboxes, and explain why a saved plan cannot start. Every phase
requires a valid timebox to start. A blank title is not an additional Start
requirement. The empty agenda introduced in 02.2 remains legitimate. The
[UX-001 decisions](EDITOR-001_UX-001_DECISIONS_2026-11-16.md)
and [UX-002 supersession](EDITOR-001_UX-002_MOBILE_DESIGN_2026-11-24.md)
retain stable Phase identity and removal according to actual content. An
explicitly added Phase is a real row with its own ID. Retain it until
deliberate removal, including when fields are cleared.

### Planning, drafts and persistence

| Boundary | Current behavior | Proposed 02.3 contract |
| --- | --- | --- |
| Persisted plan | `validatePersistedPlan` permits zero phases but shares 02.2's nonblank title and strict duration checks with `validateRundownPlan`. | Limit the value expansion to Template plans and PLANNED current plans. Use exact JSON `durationSeconds: null` for unspecified and an empty string for unnamed. Normalize a whitespace-only title to the empty string on explicit Save. The fields remain required. Keep the nonblank Rundown name, ID, order, category, information and resource rules. A supplied duration remains subject to current whole-minute, per-phase and total limits. |
| Editable draft and form | `editor-phase-fields.mjs` requires title and duration. It keeps unparseable input as text and valid digits as seconds. The existing Add Phase action inserts a stable row with a 600-second default. `editor-workspace.mjs` currently totals any safe integer, including out-of-range values. | Clearing the duration is an explicit unspecified state. Preserve malformed input, whitespace-only numeric text, zero and out-of-range values for correction. Do not clamp, infer, coerce them to null or save them. On reopen render missing duration as empty with the agreed indication. Keep invalid- and missing-value feedback distinct and sum only valid supplied durations. Keep the current Add Phase default unless a separate decision changes it. Empty title remains a blank editable field with the fixed visual and accessible fallback. |
| Draft Recovery and tickets | Editable recovery accepts strings and safe integers for duration, including the earlier raw empty input. `validateTemplatePending` and `validateExecutionPending` compare ticket drafts with the recovery Save snapshot and replay the exact Store transform. `validatePlanPending` binds the canonical source plan to the saved baseline and retains the editable draft. Workspace and App compare `expectedPlan` when observing an uncertain planning write. | Permit null in the editable recovery shape and keep older raw draft input, identity, revision and baseline readable. Treat the prior empty duration string as blank when rendering and at the explicit Save boundary. Apply one deterministic conversion to the copied Save snapshot and when reconstructing pending tickets. Preserve other invalid text byte-for-byte in the recoverable draft. Planning observation must compare the canonical *planned* snapshot, with null and blank title where present. Rechecks stay read-only and never regenerate or relocalize a target. |
| Portability | Template import/export validates through `validateTemplate`. Passive Event and backup documents use the aggregate's lifecycle validation. Restore for full backups is outside the existing feature set. | Round-trip the exact null and empty title for eligible planning documents, including Template import as an independently identified copy. Keep missing properties, invalid strings and invalid executable documents rejected. Leave Event and backup documents passive. |
| Eligibility | The shared `startEligibilityReason` calls the strict Rundown validator. Both direct launch before its first write and locked PLANNED activation use the shared boundary. The Picker and library consume the same reasons. | Use the same plan validation and duration rules to separate `phasesRequired`, a dedicated missing-duration reason with a precise count for valid incomplete plans, and other validation errors. A timed, unnamed Phase is eligible. A missing duration blocks the entire Rundown, including direct launch before committing a Planned Event. The executable output still passes the existing strict validation. |

The proposed draft conversion should preserve recovery bindings and exact
source/target comparisons. Existing persisted or pending 02.2 records keep
their previous representation. Do not backfill, rewrite on read, or
reinterpret a raw invalid value as valid. The normalization for a recovered
legacy blank applies to an explicit Save snapshot. Do not use the proposed
fixed fallback as a persisted planning value or as evidence of a user
edit.

### Unnamed phase at the executable boundary

`activatePlannedExecution` currently copies the Planned `currentPlan` into
strict ACTIVE READY validation. `prepareReadyExecutionRuntime` projects
the validated title and duration for each Phase into `prepareSession`.
`templates.mjs` still requires a nonblank title and `recovery.mjs` validates
the normalized Run phases and the clock's current duration. The first actual
countdown Start captures READY's `currentPlan` in the Attempt. Started
SUSPENDED validates this snapshot, its frozen Run and outcomes. Completion
retains the latest plan and start snapshot, and the Store protects completed
content from replacement. A fallback in the renderer alone cannot pass
these current data checks.

| Option | Consequences |
| --- | --- |
| **Materialize a localized title in the Event copy on activation** | Smallest change that keeps all current executable validators strict. Planning stays empty and language-neutral until READY. The generated title becomes ordinary data on that Event. The Run, Attempt and archive carry it as validated and persisted. |
| Keep titles empty in all persisted copies and render the fallback everywhere | Would require changing the nonblank-title contract in READY and started plans, Attempt snapshots, Run preparation, recovery and checkpoint validation. Timing checks could still be preserved, but this changes the current executable data guarantees and extends the compatibility boundary to runtime and archived data. |
| Keep active `currentPlan` empty and give only the projected Run a nonblank title | READY still rejects the empty current plan, and the first Start snapshots that same plan. Supporting this would need a different active-plan and Attempt contract or another representation. |
| Persist a neutral marker as the nonblank title and localize it when rendering | Existing titles and JSON imports can contain the same marker. Without a distinct origin field, display and Retain Plan cannot distinguish it from authored text. The marker would also appear in passive exports or engines and old clients that do not interpret it. |

**Binding decision for 02.3b.** The Product Owner selected Option A with
the exact fixed title **Unnamed Phase** in DE and EN. This supersedes the
localized proposal. Before activation, a blank or whitespace-only title
is canonicalized to the empty string on Save; the display fallback never
writes planning data. The existing activation transformation replaces
only empty titles in the independent Event plan, then runs strict READY
and Run validation. There is no locale input, title-origin metadata or
extra Store write. Direct launch still confirms two writes and leaves
the source Template intact.

The materialized title is ordinary editable title text where lifecycle
permissions allow edits. It survives suspension, completion, Attempt
snapshots and retained plans. An explicitly authored `Unnamed Phase`
is preserved. Clearing it requires explicit editing. A later Start
Event can materialize the fixed title again. Missing timeboxes still
block execution of the complete Rundown. The existing 120-character
limit and executable nonempty-title requirement remain in effect.

### Compatibility and smallest coherent slices

A 02.2 reader accepts an empty phase array. It still rejects a phase with
null duration or an empty title. Either new planning value can therefore
make the entire mixed aggregate unavailable to 02.2 and v86, including
otherwise valid active Events. A 02.2 Draft Recovery reader can parse raw
blank titles in editable drafts, but rejects null duration and can reject
pending tickets whose Store snapshots contain newly legal plans. Both
planning exports and full aggregate backups can be unreadable to older
parsers. Nonblank materialized executable titles stay within the previous
strict Runtime data shape. This fact does not make a mixed aggregate
backward-readable.

The accepted 02.2 safety contract still applies, including fail-closed reads,
strict revisions, no automatic rewrite and retention of pending recovery
bytes. Once a new value is enabled, the rollback floor must be an app
that reads every value the released build can write, including relevant pending recovery
data. An old live owner can still be blocked on its next Runtime write while
holding ownership. Repeat the mixed-version and offline probes against the
actual 02.3 build and the finalized 02.2 baseline, alongside v86 where
relevant. Retain the pending rollout decision and existing backup limitations.

| Proposed slice | Coverage and focused checks |
| --- | --- |
| **02.3a — Unspecified timebox** | After approval, adapt persistence, phase fields, totals, eligibility, Workspace, Picker, recovery and portability together. Cover named phases with null, old raw blank drafts, malformed and out-of-range input, exact missing counts, DE/EN with no Save warning for blank time, order and identity, deletion to a zero-phase plan, pending Template/PLANNED saves and observation tickets, import/export and byte-identical no-write Start rejection in a mixed Store. Confirm invalid phase titles remain rejected until the next coherent slice. |
| **02.3b — Unnamed phase and READY materialization** | Depends on 02.3a and approval of title materialization. Open blank-title planning and its Start path together. Cover both lanes of Start, two-write Template launch, independent identity and preserved phase order/resources, nonblank authored lookalike titles, missing-time rejection even with blank titles, fixed title across pending acknowledgement/reload, READY then actual Start, immutable Attempt snapshot, suspend/resume, Retain Plan and later editing, completed history, and fixed planning display without a write. Strict malformed Runtime and compatibility/offline regressions must pass. |

The analysis above records the pre-implementation state at reviewed 02.2.
The implementation and rollout gates remain separate.

## Slice 02.3a — unspecified timeboxes

The Product Owner approved splitting 02.3 into unspecified timeboxes and
unnamed phases. In 02.3a, `durationSeconds: null` is the canonical persisted
representation of an unspecified timebox. It is valid planning content for
Event Templates and PLANNED Events and blocks Start Event for the entire
Rundown. Invalid raw duration input remains editable and blocks Save.
Persisting empty phase titles and materializing executable titles are
reserved for 02.3b.

- The native phase field records an empty string from the input as `null`.
  Explicit Save also canonicalizes the exact empty string in legacy drafts.
  Whitespace, fractional values, zero and out-of-range values remain
  invalid. Field feedback and browser focus identify invalid durations in
  DE and EN. The existing ten-minute Add Phase default is retained because
  the accepted decisions specify how missing timeboxes behave and do not
  replace that default.
- The draft total sums valid specified values and separately reports the
  number of unspecified timeboxes as the user edits. The domain reuses the
  original whole-minute, phase and total limits. The Library and Picker use
  `missingPhaseDuration` to explain the missing count and offer editing.
  Planning an independent Event still permits incomplete plans.
- Save, reopen, recovery and pending acknowledgements, ordinary Event
  planning and portability use the existing Store and Schema-2 records.
  Phase IDs, authored titles, order, category, information and resources
  survive these operations. The authoritative direct-launch and PLANNED
  activation checks run under their existing revision and lock boundaries.
  Rejection leaves Store bytes and ownership unchanged. Every executable,
  Runtime and Attempt path still requires a timebox for every phase.

### Actual compatibility evidence and rollout implications

The isolated probe ran against the working 02.3a source and each of two
older builds, the reviewed 02.2 commit `fabb81697ee6a8993755f49d4c25e85c235f9333`
and the staging v86 application commit `ebb0039ddaa096ab968554d62fcedfc6a499d7d6`.
Each run used a new Edge profile, synthetic records and a local server.
The harness served a virtual v87 cache identifier and asset queries for the
candidate to exercise service-worker activation and cache deletion. The
candidate files in the repository and packaged artifact retain v86.

Both runs passed ten checkpoints. The candidate opened existing complete
records and legacy editable drafts with the empty string. Both older builds
failed closed with a Template-only, PLANNED-only or mixed `null` record and
with canonical `null` draft recovery or pending tickets. An old tab kept
its old application code after the new worker claimed it. Old fresh reads
and writes returned `storageValidation`; a previously loaded stale save
returned `conflict`. The candidate cold-started offline and recovered the
same running Event, with byte-identical Attempt and Run. Rolling back to
either older build kept the bytes intact and Quick Timer usable, but blocked
Event recovery and the Editor. Restoring the compatible shell recovered the
same Event without a data rewrite. Template export round-tripped and the
candidate could read its backup. The public import path accepts individual
Templates. Backup export remains a data copy without a complete restore path.

Both runs reproduced the old-live-owner risk with a null-duration Template
write. The older Event Timer refused Pause and kept its active ownership lock.
After the old tab left, the compatible tab recovered the same Event without
changing its bytes. A rollback build must retain the 02.3a planning reader
once null-duration writes are enabled. This extends the rule that already
applies to zero-phase records. Rollout requires separate approval and an
update strategy for existing and offline owners. The isolated worker test
does not verify a deployed update.

### Verification at the independent review checkpoint

Local `develop`, the remote-tracking ref and direct remote `develop` all
point to `fabb81697ee6a8993755f49d4c25e85c235f9333`. Verification used Node
22.17.1 and Edge 158.0.4370.33. The review ZIP contains full commands and
logs, including both earlier focused browser attempts and their fixture
corrections.

| Check | Result |
| --- | --- |
| Focused `node --test --test-reporter spec` over eight test files | Exit 0, 205 tests passed |
| `node --test --test-reporter spec @(git ls-files '*test.mjs')` | Exit 0, 596 tests passed |
| `$env:EASYTIMER_UNSPECIFIED_DURATION_ONLY='1'; node tests/browser-check.mjs` | Exit 0, 3 checkpoints |
| `node tests/browser-check.mjs` with the default aggregate entry point | Exit 0, 33 checkpoints |
| `node tools/release/package.mjs` and `node tools/release/package.mjs --verify <artifact>` | Both exit 0, 41 files verified, PWA v86 |
| `node tests/artifact-offline-browser.mjs` | Exit 0, 7 checkpoints including the missing-cache-entry negative control |
| Isolated compatibility probe against 02.2 and staging v86 | Both exit 0, 10 checkpoints per build |
| `node --check` on changed JavaScript and the probe, and `git diff --check` | All exit 0 |

Only planning and Picker application modules changed. Store and ownership
locks, Runtime execution code, the timer engine, service worker, release
scripts and workflow files match the baseline. Independent review accepted
these results. Rollout approval remains pending, including how to address
the old-live-owner risk. Once null-duration writes are enabled, rollback
builds must retain the compatible planning reader.

## Slice 02.3b verification

Local and remote `develop` agreed at `4cbbae1967afd5c978b5baef511c154201c16760`
before implementation. The reviewed scope covers Domain planning and READY
materialization, native phase fields and drag announcements, with the Store,
Runtime and history validators retaining their existing contracts.

| Check | Result |
| --- | --- |
| Focused Node tests | Exit 0, 176 passed |
| Complete tracked Node suite | Exit 0, 598 passed |
| Focused Workspace and Picker browser scenario | Exit 0, 3 checkpoints |
| Regular aggregate browser regression | Exit 0, 33 checkpoints |
| Packaging and inventory verification | Exit 0 for both, 41 files, PWA v86 |
| Offline artifact browser regression | Exit 0, 7 checkpoints |
| Syntax and diff checks | Exit 0 |

The isolated compatibility probe ran against 02.3a (`4cbbae1`) and the
staging v86 application (`ebb0039`), with ten successful checkpoints per
build. Both older readers opened legacy editable blank-title drafts but
failed closed on blank-title persisted planning records and pending tickets.
Older writes left persisted bytes intact. A stale save conflicted. The
compatible build reopened mixed data offline and recovered the same Event,
Run and Attempt. Compatible builds round-trip the planning export; the
full backup remains a data copy with no complete public restore mechanism.
The probe used a virtual cache version transition in loopback HTTP only.

Both older builds reproduced the old-live-owner issue. A newer blank-title
write blocked Pause in the old tab while it retained its ownership lock.
The compatible build recovered the same Event once the old owner left. Any
rollback after blank-title writes must retain the 02.3b planning reader
for both blank titles and unspecified timeboxes. Rollout strategy and
approval remain open. Full logs and the probe are in the review ZIP.

## Package 02 rollout decision proposal

This analysis uses the complete, independently reviewed Package 02 at
`96bfeef42d77fcf144e7f1560660df1d156aae22` and the 02.3a/02.3b isolated
compatibility evidence. Rollout and Owner acceptance remain pending.

### Data integrity and workshop continuity

The Store validates the complete aggregate on load. One newly incompatible
planning record can block an older client's Event Timer even when the
active Event itself is unchanged. The probes found unchanged bytes on
blocked reads and writes, and a revision conflict on a stale save. They also
found that an older live owner refused Pause and retained the ownership lock.
A compatible tab could only recover that same Event after the old tab left.
This protects persisted data while interrupting the operating workshop.

The service worker precaches on install, calls `skipWaiting`, deletes older
shell caches on activation and claims clients. Navigation is network-first
with an offline shell fallback. Claiming a client does not reload its
executing document, and the application registers the worker without an
automatic document reload. An open tab can therefore keep old code after a
new tab starts using the new shell. An offline tab can remain old indefinitely.
The worker version cannot identify the code held by a Runtime owner.

Planning Save, ordinary planning/copy and Template import commit through the
exclusive Store writer. The writer reads, transforms and saves synchronously
under its write lock. Activation and recovery also use the separate exclusive
active Runtime lock. Activation claims ownership before its Store write.
Recovery reads again after claiming. The Store lock serializes writes and
checks revisions but conveys no Runtime ownership or owner version.
Draft recovery and uncertain-write tickets retain identity and exact source
and target data. A recheck observes persisted state, and a rejection before
mutation must not become an uncertain write or an automatic retry. Older
readers can also reject new pending tickets while leaving their bytes intact.

### Options and recommendation

| Option | Coverage and limitation |
| --- | --- |
| Controlled staging update | Recommended for staging. Account for all participating tabs and installed app windows sharing the staging origin and browser profile. Resolve pending operations using Recheck, finish or safely suspend any live workshop, then explicitly close the old documents. Reopen online, verify the document and worker versions, then verify offline startup. This is reliable for a coordinated cohort only. |
| Compatibility reader first | A first build could read all three incomplete forms and compatible recovery tickets while continuing to write only old-compatible new content. The resulting rollback target and updated cohort would be safe. A later writer release still cannot prove that long-lived or offline tabs installed or loaded that reader. A second release adds work without closing the race on its own. |
| Narrow write safeguard | Recommended for production as a separately approved design. At the authoritative Store transformation, reject planning writes that would introduce incompatible content while an active Runtime is persisted and this document cannot prove it holds ownership using the compatible code. Treat another or unknown owner conservatively. Keep compatible planning, removal of incompatible content, read-only reconciliation and Runtime actions available. This can temporarily defer incomplete planning in a second compatible tab or when an active record has no live owner. |
| Accept the residual risk | Reasonable only for the controlled cohort, with explicit Owner acceptance elsewhere. Recovery instructions shorten an interruption but cannot protect a running workshop. If affected, keep site data, close the old owning window, open the compatible build online, recover the same Event and recheck any pending operation before attempting it again. Avoid clearing storage, discarding the Event or using a backup import as a full restore. |

For production, prefer the Store predicate above to owner-version detection
or a separate reader deployment. Evaluate both current and proposed records
inside the existing write lock. Cover all three incompatible planning forms
and every path that introduces them, including Save, import and ordinary
Event planning. Check actual local ownership through the existing controller,
not through a role inferred from the view or a snapshot from `locks.query()`.
An activation that commits first leaves an active record for the planning
guard to see. If incompatible planning commits first, an older activation
or recovery must validate the new aggregate before it can operate. Preserve
conflict precedence, existing lock order, exact readback and the user's
editable draft. A rejected operation should report why it is deferred and
allow explicit retry after the workshop or in the compatible owning tab.
This safeguard would prevent the reproduced interruption on a previously
readable Store. Already-incompatible data still requires a compatible reader.
An old client that was offline or idle can still encounter feature
unavailability on its next use. No forced refresh or waiting period is needed.

### Release verification and rollback

- Stage only after separate approval. Test the real artifact and service
  worker update on desktop and installed mobile, including offline cold
  startup after the update and a known older tab that stays open.
- In isolated profiles, reproduce the current old-owner failure and test
  the proposed guard with old, unknown and same-document compatible owners.
  Exercise both write orderings against activation and adoption, all three
  incomplete forms, Save/copy/import, a compatible write and cleanup of
  incomplete records. On rejection compare exact Store bytes and revisions,
  verify the draft remains editable, and prove the old owner can still Pause
  and resume the same Event. Recheck ownership after failure and release.
- Test ambiguous acknowledgements and reload with pending draft or Runtime
  tickets. Rechecks must remain read-only, retain identity and preserve an
  unresolved outcome where the exact source or target is absent. Verify the
  same Attempt and Run on compatible recovery and verify Quick Timer remains
  independent.
- Prepare and test a rollback artifact before enabling incomplete writes.
  It must retain readers for zero phases, null durations, blank titles,
  and their supported recovery tickets, and keep strict executable and
  archive validation. Roll back with mixed plans and live/history data,
  check offline recovery and exact persisted bytes, then roll forward.
  v86 and 02.3a are unsuitable general rollback targets for the completed
  package. Backup export is evidence and a data copy without a complete
  public restore path.

## Accepted rollout decision and Staging v87 gate

The Product Owner approved the controlled, coordinated Staging update.
Production release remains unauthorized. Before pushing a candidate that
triggers Staging, obtain explicit confirmation that all old Staging tabs
and installed app windows in the participating profiles are closed and
active or pending operations are resolved. For this v87 deployment, the
Product Owner explicitly authorized proceeding despite incomplete shutdown
confirmation and accepted the residual risk of an old Staging tab on an
unavailable iPhone. This exception applies to this Staging deployment only.
After deployment, record the
commit, workflow, live version and observed cache transition. Staging v87
requires separate Owner acceptance. The previously accepted regression
evidence remains in the Package 02 checkpoints and review archives.

The narrowly scoped incompatible-planning-write safeguard is a mandatory
production release blocker. Its analysis, implementation and review each
require separate approval. It must protect an older or unknown-version
active Runtime owner, preserve drafts when a write is rejected and enforce
the authoritative decision under existing Store write and revision boundaries.
All rollback builds must retain the complete Package 02-compatible planning
and recovery reader. Forced reload, destructive cleanup and new persistence
architecture are excluded. The safeguard remains open for production.

### Staging v87 candidate evidence

Local and remote `develop` were verified at
`96bfeef42d77fcf144e7f1560660df1d156aae22`. The candidate changes the v87
shell cache name and shell asset references, with matching test expectations.
A comparison against the reviewed commit found only version substitutions
in application and test files. Store, Runtime and deployment workflow code
are unchanged. No staged deployment has been verified at this checkpoint.

Packaging and inventory verification passed for 41 files at PWA v87.
Thirteen focused Node tests and seven offline artifact browser checkpoints
passed. The regular aggregate browser regression passed 33 checkpoints
after synchronizing its hardcoded shell-version expectations. All final
checks exited 0, including syntax and diff checks. The earlier browser
attempt and its corrected version assertion are recorded in the candidate
evidence. Ten update checkpoints passed using the actual packaged v87 files
and the staging v86 source at `ebb0039`. The isolated loopback probe used
real shell cache names, with the network stopped for offline checks. It
verified removal of the old shell cache, a fresh v87 document and unchanged
persisted Event data on compatible recovery. Its deliberately unclosed v86
owner still reproduced the Pause failure, confirming the need for the
controlled staging gate. The result is local and uses synthetic data.

Package 03 owns Save and Save & Back, draft lifecycle and associated
navigation. The later library, responsive and Facilitator Panel work follows
the existing approval and scheduling boundaries.
