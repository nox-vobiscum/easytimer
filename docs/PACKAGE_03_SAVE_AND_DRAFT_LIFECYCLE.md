# Package 03 — Save and draft lifecycle

## Status and binding decisions

The Product Owner accepted the analysis and three-slice
decomposition in principle. The atomic initial PLANNED Event Save decision
below is approved. Independent review of this document and explicit Slice
03.1 implementation approval were granted. Independent review accepted the
Slice 03.1 implementation and all final automated verification gates.
The application baseline is
desktop Owner-accepted Staging
v87 at `742584093a518d29abff146ad9ec5a23428d3393`. The documentation closure
is on `develop` at `baa32891aa089f65b485c86e034356d06e36d809`. The
[Package 02 checkpoint](PACKAGE_02_PLANNING_AND_START.md) records the pending
iPhone verification, which does not block this work, and the mandatory
production safeguard and compatible-reader rollback requirement.

Follow the six-point continuity contract in [BRIEFING](BRIEFING.md) and the
[mobile decisions](EDITOR-001_UX-002_MOBILE_DESIGN_2026-11-24.md#collaboration-contract-binding-for-future-chats-and-developer-assignments).
The approved semantics come from [UX-001 §10](EDITOR-001_UX-001_DECISIONS_2026-11-16.md)
and [UX-002 §7](EDITOR-001_UX-002_MOBILE_DESIGN_2026-11-24.md#7-global-sticky-action-bar--explicit-labels-confirmed).
The [terminology mapping](TERMINOLOGY_MAPPING.md) governs current DE/EN
labels. Discard changes in the Editor operates on draft edits since the
last confirmed Save. Discard Event and Keep Rundown and reset progress are
separate lifecycle commands. This package uses the existing Library.
Later tabs, layouts, overlays, responsive columns and the Facilitator
Panel retain their own gates.

## Baseline implementation against the target

| Area | Current behavior and code | Approved target |
| --- | --- | --- |
| Save | `editor-workspace.mjs` submits through `save()` and serializes mutations in `runMutation`. Template `completeTemplateWrite` reloads Workspace, cleans recovery and clears the editor. PLANNED `finishWrite` also reloads and clears. | Save stays in the same Editor after exact confirmed persistence. Rebase the draft and recovery to the committed snapshot and preserve focus, phase disclosure and scroll where feasible. |
| Save & Back | The current Save normally lands in the Library, with a read or completion failure capable of leaving the draft visible. There is no explicit destination intent. | Save & Back returns to the correct record in the Library only after confirmed success. Clean Back returns without a write. The later tab design can consume the same record identity. |
| Discard and navigation | Form Cancel clears the editor. For Templates it prompts via `discardCurrentTemplateRecovery` when recovery is persisted or blocked. For Event drafts form Cancel has no dirty confirmation. Workspace header Back calls `close()` and returns to the host origin. `close()` guards dirty non-Template drafts and pending mutations. `beforeUnload` guards dirty or blocked work. | One shared draft-leave decision for Library actions and existing host navigation. For dirty drafts, a focused confirmation protects edits. Canceling it keeps the draft. Accepting it discards only unconfirmed edits and uses the requested existing destination. Pending operations still block leave. |
| Saved status | `dirty()` compares serialized full draft to a baseline from `beginDraft` or recovery. The Save button is disabled for mutation locks only. Success feedback can appear in the Library. | Clean persisted state shows Saved, disables Save, and offers Back with no write. Unsaved persisted edits show Unsaved changes. A failed or uncertain write never shows Saved for the unconfirmed draft. Local disclosures and viewport changes do not affect dirty state. |
| Sticky actions | `renderEditor` appends two form actions. `.native-workspace-save-actions` only adds a margin. Full renders replace the mounted Editor tree. | One global sticky action bar with the three approved dirty actions, a clean Back presentation, localized labels, keyboard and mobile safe-area support, and reachable final fields. |

## Identity, revisions and write outcomes

### Templates

`createNativePlannerService` in `editor-planner-service.mjs` prepares a new
draft in `create` mode with a generated Template ID and expected aggregate
revision. An edit draft has the same entity ID, `update` mode and an expected
Template revision. `editor-template-integration.mjs` writes through the shared
writer; the Store validates both expected revisions on update. Confirmation
returns a library snapshot with the committed aggregate and Template
revisions. The first successful Save must use that snapshot to build the
existing edit draft for the same ID, with the canonical committed plan as
both draft and baseline. A future Save is an update. Never allocate another
ID or reuse the original create command after confirmation.

An uncertain Template write carries exact source, target, draft and operation.
Live Template recovery checkpoints that ticket. Recheck confirms the exact
target, reports absence for the exact source and preserves an unresolved
outcome otherwise. A confirmed commit can be followed by a failed Workspace
read or recovery cleanup. Keep confirmation and its revisions distinct from
presentation and cleanup so Retry never repeats a confirmed Store mutation.
A concurrent update after confirmation must not silently replace the user's
baseline or lend its newer revisions to stale edits. Returning to the Library
can refresh independently; later editing follows the normal conflict path.

### PLANNED Events

`createNativePlannedExecutionService` reads an existing PLANNED Event and
binds its execution ID and aggregate/entity revisions. Save calls
`updatePlannedExecutionPlanInRecord` under the Store writer and returns the
committed record and Event. Recheck validates and reconstructs the complete
source/target transformation before comparing the observed Store. A
confirmed Save must rebase the same Event to those exact new revisions.
If another operation activates or removes it, the existing revision or
lifecycle rejection still applies. ACTIVE, SUSPENDED and COMPLETED use their
existing policies. Package 03 does not open them to PLANNED editing.

A new ordinary Plan Event draft starts with `executionId: null`, a local
placeholder and a source Template ID. `saveNewExecution` currently writes a
PLANNED copy of the saved Template through `planFromTemplate`, binds the
returned ID, then saves the edited plan in a second write. After a confirmed
first write and a failed second write, the source-plan Event already exists.
The Workspace retains the edited content and must never allocate a second
Event on retry. If the first write is uncertain, its observation checks exact
identity, source, initial revisions, notes and original plan. On an exact
match it binds that existing Event while preserving the edited content and
requires an explicit Save for that content. No automatic second write occurs
on Recheck. This is distinct from Start Event's approved two-write direct
launch into READY, which must remain intact.

### Approved initial PLANNED Event Save transaction

The current two-write problem was independently confirmed against the
repository source. Slice 03.2 shall create the independent PLANNED Event
with the edited and validated plan in **one authoritative Store write** on
the first explicit Save. The committed Event must retain source Template
identity and the draft's phase identities and order. Its editable plan is
the submitted plan, and the source Template is unchanged. Use the existing
Store writer, lock boundaries, revision checks, planning validation and
exact reconciliation guarantees. Keep one candidate Event identity bound
to an uncertain operation until it is reconciled. Recheck reads the Store
without creating or updating a record. The existing direct Event launch
continues to confirm its two writes and prepare READY without starting the
countdown. Existing `plan` observation tickets must remain decodable and
reconcilable under their original contract.

### Recovery and failure boundaries

- Workspace checkpoints edits through `editor-template-draft-recovery-service.mjs`
  for Templates. A create draft starts with an immediate checkpoint; edit
  recovery begins in memory and is persisted when checkpointed. Existing
  records are adopted with `recoveryId` and an exact `savedAt` match, then
  checked against the current revisions and baseline. Recovered conflicts
  remain available for explicit inspection or export.
- `editor-draft-recovery.mjs` already validates bindings and ticket shapes
  for `template`, `newExecution` and `execution`, including `plan` and
  `executionSave`. The live recovery service lists and adopts Template
  records only. Workspace currently keeps PLANNED draft changes and
  Event Save/observation tickets in memory. Durable Event recovery requires
  wiring, exact lifecycle and binding checks, and tests. Schema support
  alone provides no live recovery guarantee.
- After a confirmed Save, replace the baseline with the canonical committed
  content and retire the exact old checkpoint. The next edit must start
  recovery with the new update binding. Use the existing version-checked
  checkpoint operations. Never delete another context's newer checkpoint.
  A cleanup failure needs a distinct recoverable warning; an older
  checkpoint must not revive as a new create or make a confirmed write
  retryable. An exact absent result keeps the original baseline and raw
  draft available for explicit retry. An unresolved result retains the
  ticket and blocks discard and navigation.
- Recovery updates require matching `savedAt` and `sameRecoveryBinding`.
  `assertSameBinding` also requires the embedded baseline and draft to
  agree on binding fields. A transition from Template create to update,
  temporary Event draft to persisted Event, or one committed revision to
  the next requires a new recovery binding. The existing update operation
  cannot repurpose the old record. Retire the exact old checkpoint and
  establish a clean recovery session for the confirmed binding. Verify
  that newer, foreign, or still unresolved records survive that process.
- Keep Package 02 planning values, field-level invalid feedback and raw
  invalid input. The save snapshot may trim titles, normalize legacy blank
  timeboxes and filter empty resource rows. Use the canonical committed plan
  after confirmation, while dirty detection must protect visible invalid
  edits before Save. Resource normalization, phase identity and order, and
  timer ownership, revision checks and strict lifecycle invariants remain
  authoritative. Store conflicts must keep the user's draft intact and
  must not silently retry or merge.

| Outcome | Required Editor and recovery behavior |
| --- | --- |
| Save failed and no write was confirmed | Keep the editable draft and prior baseline with their original binding. Report the failure or conflict. Any later write is an explicit user action. |
| Save uncertain | Keep the exact ticket and editable content protected. Recheck reads the Store. Exact target confirmation establishes the new binding; exact source observation permits explicit retry; any other observation stays unresolved. |
| Save confirmed, then recovery cleanup or refresh failed | Treat the committed identity, content and revisions as authoritative. Report cleanup or refresh failure separately. Retrying that step cannot write the Event or Template again. Preserve any recovery records whose safe removal cannot be proved. |

## Accepted technical decisions

1. **First Save of an unchanged new draft.** A copied plan may be ready to
   save before the user edits any field. Track whether an entity has a
   confirmed persisted baseline separately from whether the draft differs
   from its initial values. The new copy must be savable without a cosmetic
   edit and must never show Saved before persistence. The Product Owner
   confirmed that an untouched new draft may be left without dirty-change
   confirmation when no operation is pending. Edited drafts require
   confirmation. The full dirty-state presentation remains in 03.3.
2. **Recovered Save & Back intent.** The approved behavior covers explicit
   actions in the current document. Persisting a navigation instruction
   across reload was explicitly excluded. Keep the intent in memory and
   honor it only after confirmation in the originating Editor. A restored
   pending ticket should offer reconciliation without replaying navigation
   or writing. The read-only recheck and ticket binding stay the same.

## Proposed implementation slices and gates

| Slice | Scope and likely files | Focused regression and acceptance |
| --- | --- | --- |
| 03.1 Confirmed Save and Editor rebase | Workspace and existing planner results; template recovery-service rollover. Make the existing Save stay for Templates and existing PLANNED Events. Establish confirmed baseline, exact revision binding, clean no-write behavior and failure/confirmation boundaries. Cover the existing new-Event result without redesigning its first write until 03.2. | Template create, immediate second Save, update and reopen; same ID, one create and one update. Existing Event update and rebase. Clean repeated Save writes zero. Recheck target/source/third state, confirmed write followed by UI read or cleanup failure, two tabs and stale edits, raw input and focus. Independent review of revision binding and recovery rollover before proceeding. |
| 03.2 Atomic first PLANNED Event Save and durable Event draft recovery | Workspace, planning service/Store transformations, existing recovery codec and service. Depends on reviewed 03.1. Implement the approved one-write creation and wire recovery for new and existing PLANNED drafts and pending operations through existing storage. | First Save commits the final edited plan in one write with no intermediate Event. Verify independent identity/provenance, stable phase identities, untouched source, subsequent update with confirmed revisions, unmodified copied draft, failure before/after acknowledgement, legacy partial observation, reload of editable and pending drafts, conflicting contexts and stale recovery cleanup. Confirm zero writes on Recheck and no change to two-write direct launch or RUNNING/archived records. Independent Store and recovery review. |
| 03.3 Global actions, navigation and sticky presentation | Workspace/app navigation and `styles.css`. Deliver Save & Back, clean Back, discard confirmation, state/status hierarchy and one sticky bar. Reuse confirmation, navigation generation and focus mechanisms. Depends on the earlier state and recovery contracts. | Test dirty and clean transitions, confirmation acceptance/cancellation, closed/reopened views, Library record targeting, host exits and native unload guards, conflicting/pending Save & Back, scroll/disclosures/focus after Save. Cover DE/EN, theme, 320px, landscape, mobile keyboard/safe areas and installed iPhone Safari. Run complete Node and regular browser regressions, package and offline artifact checks before final independent review and Owner acceptance. |

Existing test anchors include `editor-workspace-browser.mjs`,
`public-editor-cutover-browser.mjs`, `editor-navigation-browser.mjs`,
`editor-planning-browser.mjs`, `editor-duration-browser.mjs`, and tracked
planner, Store and draft-recovery Node tests. Update assertions that encode
the old Save destination only where approved behavior changes. Preserve
their write counts, identities, guarded transitions, error and reconciliation
assertions. The results below apply to the authorized 03.1 implementation.

## Slice 03.1 implementation checkpoint

The native Workspace distinguishes a confirmed persisted baseline from
local differences. Create drafts are eligible for a first explicit Save
without cosmetic changes, subject to validation. Confirmed Template and
PLANNED Event Saves stay in the Editor. The next update binding comes from
the exact result of the write or exact-target Recheck, before the separate
Library refresh. Recheck, retrying refresh, and cleanup cannot replay a
confirmed write. Editing after success clears the old Saved feedback.

Template recovery retires the previous session through its exact-version
cleanup, then starts a fresh update-bound session. The first new edit is
checkpointed under that session. A stale create checkpoint that survives
the commit cannot restore a writable create draft. Cleanup errors have
separate feedback and leave any unconfirmed recovery removal available for
review. The Editor restores phase disclosures, focus and scroll where the
same controls survive the render. Existing Cancel and close actions confirm
edited drafts and allow leaving an untouched create draft without a dirty
confirmation. The approved navigation intent is reserved for 03.3.

The existing ordinary two-write first PLANNED Event Save remains in place.
An observed partial creation retains the independent Event ID and the edits.
A rejected update retains that state for explicit retry. Atomic Event Save
and durable Event recovery remain in 03.2. The production safeguard and
compatible-reader rollback requirement remain open.

Local and remote `develop` matched
`baa32891aa089f65b485c86e034356d06e36d809` before implementation. The regular
Node suite passed 598 tests and the focused Node suite passed 67. The
focused Workspace and unspecified-timebox browser checks passed 8 and 3
checkpoints respectively. The regular aggregate browser suite passed all 33
checkpoints. Packaging and inventory verification passed with
41 files and PWA v87. Offline artifact verification passed all 7 checkpoints.
Syntax and diff checks passed. The review archive contains commands, exit
codes, the Scope check and earlier failed fixture attempts.
