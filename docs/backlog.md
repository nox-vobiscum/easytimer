# easyTimer — Future Backlog

**Status:** Living idea backlog · **Prepared:** 2026-10-23  
**Repository path:** `docs/backlog.md`

**Repository:** https://github.com/nox-vobiscum/easytimer

## Purpose and scope

Capture deferred product ideas and small quality-of-life improvements without losing them between implementation increments. This file is a **parking lot and prioritization aid**, not an implementation plan or authorization to begin work.

**Read alongside, not instead of:**
- [`EASYTIMER_UX_KONZEPT_v2.md`](EASYTIMER_UX_KONZEPT_v2.md) — canonical product direction and the **56 accepted ET-001 decisions**, including detailed future Session/Ad-hoc behavior.
- [`BRIEFING.md`](BRIEFING.md) — technical constraints, current architecture, and approval workflow.
- [`../README.md`](../README.md) — actually delivered features and release/acceptance status.
- [`../CHANGELOG.md`](../CHANGELOG.md) — verified production releases and their implementation commits.

**Guardrails:** Keep easyTimer lightweight, fast, and usable with its existing static hosting and free-first approach. Prefer no backend, database, framework, or paid service unless a separately approved architecture review demonstrates a clear need. Reuse **one authoritative timer state**. Do not turn the planner into a full workshop-management suite. German and English UI; repository documentation and code in English. Every feature requires a separate scope review and explicit approval, including Git commits, pushes, merges, and deployments.

**Priority terms:** `Candidate` = reasonable upcoming increment, not scheduled; `Later` = valuable but dependent on more important work; `Someday` = deliberately low priority; `Spike` = investigate feasibility before committing to an implementation. These are relative labels, not delivery promises.

## Ideas at a glance

Delivered work is recorded in the [changelog](../CHANGELOG.md) and the linked active or archived implementation records. In particular, INFO-001 and the v60 baseline, UX-018 in v61, UX-011 in v62, and PLAN-001 in v63 are verified production releases. Earlier delivered Session Editor, Session Timer, recovery, navigation and subtraction increments are ancestors of the verified v60 production release. They are not future backlog items.

| ID | Idea | Priority | Main dependency / note |
| --- | --- | --- | --- |
| PLAN-001 | Insert a new phase directly at a chosen position | Released in PWA v63 | Compact Session Planner finalized |
| PLAN-002 | Friendlier planned-total formatting | Released in PWA v65 | Presentation-only refinement |
| PLAN-003 | Optional target total duration for Rundowns | Later / Future idea | Planning aid only; no automatic duration allocation |
| EDITOR-001 | Session Editor Evolution & Facilitator Panel | High / Near-term — public Schema-2 cutover implemented locally; independent review and real-browser acceptance open | One native public Editor/library, lifecycle and archive implemented; Facilitator Panel remains open |
| NANO-001 | Nano-View – Always-on-Top Timer View | Next feature after EDITOR-001 is complete, accepted and production-released; before SW-001 | Secondary Document Picture-in-Picture view of the authoritative active timer; separate approval required |
| EDITOR-002 | Restore unsaved Workshop-Notizen after reload/crash | Someday / Spike — „für lange Winternächte“ | Explicitly deferred; at most a tiny feasibility spike if a safe, simple approach appears |
| SYNC-001 | Optional Google Drive template sync | Immutable snapshot PoC validated; production NO-GO | DATA-001; isolated SYNC-002C real Drive acceptance; iOS/PWA and production gates open |
| SYNC-002C | Isolated storage/snapshot/Drive integration | Isolated integration PoC validated with real Google Drive | [Owner acceptance and open gates](archive/investigations/SYNC-002C_ISOLATED_INTEGRATION.md); no production integration |
| SYNC-003A | Optional Drive integration in the application | Local application integration implemented and owner-validated with real Google Drive. Production NO-GO. | [Owner acceptance and release blockers](archive/implementation/SYNC-003A_LOCAL_APPLICATION.md); normal/private Firefox, no physical second-device or iOS acceptance |
| SYNC-003B | Minimal explicit conflict resolution | Functionally accepted in local development with real Google Drive. Production NO-GO. | [Implementation and manual acceptance](archive/implementation/SYNC-003B_CONFLICT_RESOLUTION.md); exactly two heads, explicit A / B / Keep Both |
| SYNC-099 | Optional Snapshot Cleanup | Deferred — Someday / Maybe / Very Low | No implementation planned; validated replacement/recovery/offline safety required |
| UX-019 | Subtle Start/Resume and Stop Button Accents | Released in PWA v64 | Owner-accepted semantic Start/Resume and Stop accents |
| UX-015 | Timer View Typography & Information Hierarchy | Session hierarchy released in PWA v66; remaining work open | Quick Timer typography and compact-landscape menu remain open |
| BUG-001 | Fullscreen-safe Workshop Stop confirmation | Released in PWA v67 | Document-modal confirmation replaces the browser-native prompt |
| BUG-002 | Session next-phase transition unexpectedly enters recovery lockout | High / Investigate before next runtime release | Owner Firefox observation on local PWA v77 after first Next Phase; root cause unknown; preserve runtime/Store safety |
| UX-017 | Recovery Candidate Management | Future UX refinement | Explicit management of obsolete runtime candidates; protect meaningful Runs and active ownership |
| SW-001 | Stopwatch with Time Marks | Candidate / Design Review | Optional third mode; elapsed-time semantics and mark presentation require approval |
| ST-004 | Hybrid countdown and unlimited Session phases | Later / Future idea | Evaluate alongside or after SW-001; one authoritative Session timer |
| ST-003 | Live Session editing and workshop statistics | Later | ST-002 runtime, stable phase IDs |
| ADHOC-002 | Minimal Ad-hoc Timer Overlay | After EDITOR-001 including the Facilitator Panel | Ephemeral independent overlay; separate scope and explicit approval required |
| QT-002 | Optional manual Quick Timer duration entry | Later | Subtraction and contextual controls are delivered; preserve current one-timer simplicity |
| REL-001 | Remaining runtime recovery hardening | Later | REL-001A/B are deployed; real-device and four-hour-policy UX remain open |
| SIGNAL-001 | Configurable visual/audio signals | Later | Meaningful runtime events |
| PRES-001 | Moderator View + Audience View on one device | Someday (low) | One authoritative timer; two synchronized windows |
| REMOTE-001 | Cross-device timer control/display | Someday / Spike | Separate architecture and security review |
| LIVE-001 | Shared Live Timer & Remote Control | Low / Someday-Maybe | After current UX, sync productization and production-release priorities; related to REMOTE-001, separate from Drive backup/sync |
| VIS-001 | Alternative Timer Visualizations | Candidate / Design Review | Alternate views of the existing timer; visual and overtime behavior remain open |
| CUSTOM-001 | Optional presentation customization | Someday | Stable core UI and audience-display requirements |
| I18N-001 | On-demand translation of saved Rundowns | Later / Future idea | Explicit user action to translate a copy of title, phases, prepared notes and other authored content; no automatic mutation on UI language changes |
| AI-001 | Image-to-Rundown conversion | Someday (low priority) | DATA-001 portability; separate design/feasibility review |

## Session Planner improvements

### PLAN-001 — Insert a phase at a specific position

**Idea:** Insert a **new** phase immediately before or after a selected existing phase, rather than always appending the new phase at the end. This does not concern moving an existing phase: existing phases can already be repositioned through the implemented move controls and position selector.

**Desired outcome:** A facilitator can build or adjust a long workshop rundown with minimal unnecessary reordering. Keep stable phase IDs, draft-only changes until Save, accessible controls, and the existing validation/storage rules. The exact UI is undecided; reuse the compact phase interface rather than adding permanent visual clutter.

**Status:** Released to staging and production in PWA v63 at commit `00eb4a462b02961b7caac8c73fdffaea0ca9db04`; verified production workflow run `41069275190`.

### PLAN-002 — Human-readable workshop total

**Idea:** Consider `1 h 50 min` / an appropriate localized form instead of `01:50:00` for *planned total* in the editor or template library.

**Guardrails:** Cosmetic only; never alter minute inputs, duration semantics, calculations, or stored integer seconds. Handle very long workshops (including 100+ hours) and DE/EN cleanly. Only planned totals use `h` and `min`; live countdowns retain their clock-style representation.

**Status:** Released to staging and production in PWA v65 at commit `56e02b5bc989359b3e1e15f817ec1b3886a7667b`; verified production workflow run [`41302013099`](https://github.com/nox-vobiscum/easytimer/actions/runs/41302013099).

### PLAN-003 — Optional target total duration for Rundowns

**Priority:** Later. **Status:** Future idea only; not part of the current
EDITOR-001 scope and no implementation is authorized.

Allow a facilitator to define an optional **available time** or **target total
duration** for a Rundown and compare it with the sum of all already specified
phase durations. Show the remaining or exceeded amount and recalculate it
immediately when phase durations change or phases are added or removed. A
restrained progress indicator may be explored, but Rundowns without a target
total must remain fully usable.

Missing phase durations must remain visibly distinct from the time already
planned. Never automatically adjust, distribute or infer phase durations. For
example, an eight-hour target with six hours and thirty minutes planned and
three phases still lacking timeboxes would show one hour and thirty minutes
remaining to allocate while still identifying those incomplete phases.

Before any implementation, review the data model, presentation of an exceeded
target and interaction with deliberately unlimited phases.

### EDITOR-001 — Session Editor Evolution & Facilitator Panel

**Priority:** High / Near-term — strategic product direction. **Status:** The
coordinated public Schema-2 cutover is implemented locally and remains unreleased
pending independent review and mandatory real-browser acceptance. One native
Workspace is the public Editor; one native aggregate supplies Templates and
PLANNED, ACTIVE, SUSPENDED and COMPLETED Executions to the Workspace and Picker.
Direct launch, activation, ownership-safe entry, checkpoint-preserving resume,
Suspend, Retain Plan/reset, discard, completion and a minimal read-only archive
reuse the existing Store Writer, Runtime Bridge, Active Lock and Timer/Session
engine. The Facilitator Panel remains open and requires separate approval.
Targeted integration review corrections now scope delayed Picker reads to their
originating navigation, make unchanged-language Workspace updates non-rendering,
retain late Activation/Resume lock failures for read-only reconciliation, and
enforce monotonic active Runtime installation without clock rewind. Mandatory
real-browser acceptance remains open.

The focused native Editor interaction correction is implemented for review:
Library Back and post-Cancel Back share the guarded close path, dirty and pending
states retain their existing protection, resource-row edits preserve disclosure
and focus, and explicit Save treats only completely empty resource rows as
unused placeholders. Partial or invalid HTTP(S) links remain visible with DE/EN
field errors and cannot write. Failed or uncertain operations retain the
original editable draft and reconciliation ticket. This advances the unreleased
shell to PWA v75 without changing Runtime, Recovery, ownership or lifecycle
semantics. Real-browser acceptance remains open.

UX-002 view isolation is implemented for renewed review. The existing Home,
Picker, Workspace and Timer orchestration is unchanged; a scoped Timer hidden
style now guarantees that only the selected primary view participates in layout
or keyboard navigation. Computed-visibility regressions cover Home, Quick Timer,
Session Picker, Session Editor and ACTIVE Session across repeated and responsive
navigation. The unreleased shell advances to PWA v76. This is a corrective
presentation boundary, not the pending Editor redesign.

The minimal public Home scaffold is implemented locally on top of this cutover.
It provides DE/EN entry points for Quick Timer, Session Timer and Session Editor,
with an explicitly unavailable Stopwatch placeholder. Recovery and ACTIVE
Runtime adoption remain prior states; only confirmed lifecycle completion
returns Home. Visual/text refinement and Stopwatch implementation remain
separate future work. Terminal SUSPENDED actions confirm departure before their
write when a progressed independent Quick Timer is behind the Workspace, so a
rejected Home transition preserves both states. The Landing Page checkpoint was
PWA v74; the focused Editor interaction fixes advance the unreleased public shell
to PWA v75.

V1 Planner, Template Store and JSON sources remain only as repository history and
focused legacy evidence; they are no longer reachable from public startup,
precache or the deterministic production package. There is no V1 migration,
compatibility import, dual library or second public Editor. Production
dependency/precache references were aligned at the v73 cutover checkpoint, then
for the v74 Landing Page shell and the v75 Editor interaction-fix shell, and are
now aligned for the v76 view-isolation shell.

The native Editor Workspace is implemented and covered
by a direct browser harness. One native snapshot presents Templates and all
Execution lifecycle groups. Template CRUD, complete rundown/phase editing,
independent PLANNED creation/editing and single-Template JSON portability reuse
the authoritative native services. Explicit Save is the only persistence path;
Cancel is write-free, conflicts retain drafts, and uncertain acknowledgements
offer read-only reconciliation without retry or merge. ACTIVE entries open the
owned Timer, SUSPENDED entries expose explicit resume and lifecycle choices, and
COMPLETED entries open a minimal read-only archive. The public App supplies only
host orchestration and installs confirmed complete Store records; the Workspace
does not create another Timer or lifecycle architecture. The Facilitator Panel
remains open work.

**Historical increment record:** The paragraphs below preserve the narrower
boundaries of the reviewed native foundation slices in the order they were
implemented. Statements there that a public cutover or lifecycle control was
still pending describe that earlier checkpoint and are superseded by the current
0AV-T status above. Their data, revision and uncertainty guarantees remain
binding.

Internal native Template Create, Update and Delete now preserve the exact
validated operation and complete Store source/target snapshots after an
uncertain readback or late lock acknowledgement. Planner reconciliation validates
caller-held tickets and reads only: target is confirmed, source is absent and a
different or unreadable aggregate remains unresolved. It never retries, merges,
rebases or allocates another Create identity; create/update drafts remain
available. A minimal `loadWorkspace()` read returns one validated, copy-isolated
native aggregate containing both Templates and Executions with lifecycle and
revision metadata. This adds no cache, lifecycle controller, V1 access, public
Library/Picker/Editor integration or PWA change.

Internal App-side native exits now guard identity, actions and navigation through
confirmed persistence or read-only Bridge reconciliation, local detachment,
awaited ownership release and ordinary Quick Recovery initialization. Cleanup
failure after persistence is distinct and never retries the lifecycle write.
Unrelated recovery records remain intact. Direct App browser tests cover the
handoff; public lifecycle controls, unified Library/Picker, Editor and Facilitator
Panel integration remain pending. Native Session re-entry does not fall back to
the V1 Library. Existing public V1 workflows remain unchanged.

Native Template draft editing is prepared internally through pure copy-isolated
operations on existing Planner Service drafts. Name, transition mode, categories,
prepared information, phase titles/durations/notes/resources and stable-ID phase
insertion/removal/reordering are covered. Revision bases are retained and only
explicit Planner Service Save validates/persists data. The internal Workspace
now consumes these operations; public Editor integration and cutover remain open.

Internal PLANNED Execution plan editing now reuses the same native draft
operations with an explicit Execution mapping. A locked save updates only the
existing selected Execution's current plan; aggregate/Execution revisions advance
once while runtime revision, source, workshop notes and unrelated ACTIVE state
remain unchanged. Full drafts survive rejected saves; uncertain acknowledgements
use caller-held source/target tickets and read-only reconciliation without retry.
This is unreleased internal functionality. Existing Template editing remains
separate; public Editor, Library and Panel integration are not implemented by
this slice.

Internal ACTIVE/SUSPENDED prepared-information correction now updates only the
selected Execution's rundown information and phase notes/resources through the
existing locked Store writer. Stable phase IDs and exact aggregate, Execution,
runtime, lifecycle, Attempt and Run preconditions protect ACTIVE Runtime/Clock,
SUSPENDED checkpoints and newer Timer transitions. Aggregate and Execution
revisions advance once; runtime revision, source Template, plan structure/timing,
first-START snapshot, phase outcomes, Workshop-Notizen and unrelated records stay
unchanged. Failed saves retain the full information draft. Uncertain writes use
validated source/target tickets and read-only reconciliation without retry,
merge or rebase. Strict aggregate conflicts during concurrent Timer persistence
are an intentional correctness-first limitation for later UI integration. This
is internal only: general ACTIVE/SUSPENDED plan editing and the public
Editor/Facilitator Panel remain pending; Workshop-Notizen use the separate
explicit persistence contract below.

Internal ACTIVE/SUSPENDED Workshop-Notizen persistence now loads and explicitly
saves the complete existing `{ rundown, phases }` snapshot through the locked
Store writer. Sparse phase entries retain stable IDs; removing an entry clears
that phase note, while an empty rundown note remains valid. Exact aggregate,
Execution/runtime, lifecycle, Attempt and Run preconditions reject concurrent
Timer, plan/information, lifecycle and note changes. Aggregate and Execution
revisions advance once; runtime state, checkpoints, current plan/prepared
information, first-START baseline, outcomes, Templates and unrelated Executions
remain unchanged. Failed drafts survive, and uncertain writes reconcile full
source/target snapshots read-only without retry. Existing Suspend and Completion
still accept complete caller snapshots; their revision checks prevent an older
staged snapshot from overwriting a newer independent note save. This internal
contract is separate from COMPLETED reflection and does not implement the public
Facilitator Panel, autosave or crash-draft recovery.

An internal native phase field group now consumes those operations for phase
title, minute duration and category, with expandable category details, DE/EN,
keyboard/focus handling and host-supplied validation feedback. Browser tests use
real native drafts and services. The public V1 Planner does not load this group.
The internal Workspace now supplies name/transition and Rundown metadata fields,
prepared Notes/Resources and phase structural controls. Public integration
remains open.

Develop the Session Editor into an approachable workshop-preparation workspace with rundown/phase notes, labeled resource links and optional visually marked phase types. During a run, expose prepared information through an unobtrusive, intentionally opened, primarily read-only Facilitator Panel; optionally capture small run-specific notes and explicitly transfer selected notes to the saved Rundown. Preserve the existing timer, active-run snapshots, JSON portability and simplicity. No initial file uploads, own backend/accounts, confidentiality model or Miro integration. Cross-device live timer synchronization remains a separate higher-priority concern than private or role-specific notes. See the [concept and open design questions](SESSION_EDITOR_EVOLUTION.md).

**Binding data decision:** No historical user Rundowns require migration.
EDITOR-001 creates templates and independent executions directly in the native
Schema-2 Editor Store aggregate. V1-to-V2 conversion, historical compatibility
import, automatic or dual-library migration and a migration wizard are neither
required nor open backlog work, and they are not dependencies for the new
Session Editor. Existing V1 implementation code may remain temporarily for
regression safety; preserve released timer, editor and recovery behavior until
separately approved replacement. The internal Schema-2 portability contract can
strictly serialize and parse complete Template/Execution backups and individual
Template or Execution snapshots without persistence or activation. Public
import/export UI and restore policy remain separate new-model requirements, not
historical migration tasks. COMPLETED archival persistence is now internal only.

Deleting a reusable native Template does not cascade into its independent
Executions: PLANNED, ACTIVE, SUSPENDED and COMPLETED records retain their
plans, progress and historical source Template ID, and an ACTIVE runtime remains
untouched. A future operation may create a new independent Execution from an
existing Execution with a fresh identity and independent progress; that cloning
capability is not implemented and requires a separate approved slice.

Internal COMPLETED persistence now archives a deliberately ended, previously
started ACTIVE or SUSPENDED execution with its original baseline, final plan,
phase outcomes, full caller-supplied Workshop-Notizen and separate workshop
overtime. The Store atomically removes only its matching runtime/checkpoint and
protects already archived history at write time. Only the single reflection and
its permitted revisions may change; whole-archive deletion is not implemented.
COMPLETED records round-trip passively in backups and individual exports.
Removed and conducted remain independent historical facts. Public completion
dialogs, archive/reflection views, local detachment, ownership release and
navigation remain pending; no public cutover or automatic completion is included.

Internal actual phase outcomes are now recorded for started native executions,
using stable phase IDs, conducted status, active milliseconds and phase overtime.
Existing engine values preserve early manual transitions, skipped READY phases,
automatic catch-up, pauses and suspended checkpoints; final workshop overtime is
separate. Store validation, passive portability and read-only adoption preserve
the contract, with full-record uncertain-write reconciliation. Retain/discard
removes the selected outcome history. Incomplete started native development
records are deliberately rejected without migration, inferred history, repair or
overwrite; unstarted native records and released V1 data are unaffected. This is
unreleased internal functionality supporting archival, not public UI integration.

Internal persistent non-archiving exits now support ACTIVE and SUSPENDED READY
and STARTED executions. Retain-plan returns the same execution to PLANNED with
its latest complete planning content and clears Attempt, checkpoint and all
Workshop-Notizen. Discard removes only the selected execution. Both use existing
Store/Bridge revision and binding checks; matching ACTIVE runtime is removed in
the same record write, while unrelated active runtime remains unchanged.
Uncertain outcomes retain read-only source/target reconciliation without retries.
Neither exit releases ownership or detaches the local timer. Public confirmation,
detachment, ownership release and navigation remain unimplemented; actual phase
results and COMPLETED archival use the separate internal contracts above. These exits
do not implement PLANNED library deletion or change the NO-MIGRATION decision.

An unreleased internal native Template import service now separates strict JSON
preview from explicit persistence. A single Template document becomes an
independent Template with a fresh ID and revision 1, retaining phase IDs and all
planning fields. Confirmation checks the reviewed aggregate revision under the
existing Store writer lock and preserves all existing Templates, Executions and
ACTIVE runtime. Conflicts never rebase or overwrite. Uncertain acknowledgement
retains full source/target snapshots and the stable candidate for read-only
reconciliation, without retry or a second ID. This does not integrate public
import UI. Execution import and full-backup restore remain unsupported pending
explicit identity, replacement and ownership policies; passive portability is
unchanged. No historical migration is introduced.

Native backups include all currently supported Templates and independent
Executions, including suspended checkpoints and a matching saved runtime for an
ACTIVE Execution. Individual exports use the same passive snapshot rule. Export
documents do not grant timer ownership, and parsing never restores, activates or
writes anything. COMPLETED records now preserve their immutable history and
single reflection through the same passive format; persistent Execution import
and backup restore remain unsupported.

The internal Planner service prepares copy-isolated create/edit drafts containing
all native planning fields, captures aggregate and Template revisions for
conflict-safe writes, delegates persistence to the existing locked Template
integration, and returns refreshed confirmed library snapshots. Validation,
conflict, missing-record, storage and lock failures remain structured and retain
the caller's unsaved draft. This is an unreleased UI-neutral contract only; the
public Editor, visible library and Session Picker still use their existing paths.

The internal launch service separates three operations: creating an independent
PLANNED Execution from a selected Template, activating an explicitly selected
PLANNED Execution into READY through the existing ownership-protected Runtime
Bridge, and the later explicit timer START that alone creates an Attempt and
begins counting. If activation fails after confirmed planning, the PLANNED
Execution is retained without rollback or duplication. Ambiguous planning writes
must be observed explicitly by their stable Execution ID; ambiguous activation
writes remain pending in the existing Runtime Bridge until explicitly reconciled.
No public Session Picker or Direct Launch path uses this service yet.


### EDITOR-001 / UX-001 — Product Owner decision consolidation (2026-11-17)

**Status: accepted UX/product decisions only; not implemented by this documentation commit, not production acceptance, and not permission to implement or deploy.** This section consolidates the reproducible decisions from the focused November 16–17 Product Owner review **against** existing native Schema-2 work, released V1 Planner behavior, [the earlier UX-001 decision register](EDITOR-001_UX-001_DECISIONS_2026-11-16.md), [the original EDITOR-001 concept](SESSION_EDITOR_EVOLUTION.md), and deferred items above. For the specific interactions explicitly changed here, **this later accepted wording supersedes contradictory UX wording** in those older records. All unmentioned prior decisions remain binding. Do **not** re-interview the Product Owner about settled questions. Capture implementation verification and any real incompatibility separately, without making up a new architecture.

#### A. Actual existing foundation versus requested UX

- **Existing, verified on this feature branch:** `src/js/editor-template-draft.mjs` exports `repositionNativeDraftPhase(draft, phaseId, position)`, moving a stable-ID phase to an arbitrary valid numeric position in a copy-isolated draft. The first UX-001 implementation slice gives every native phase an accessible two-digit position button and explicit select-then-Move popover, and routes it plus **Nach vorne / Nach hinten** through the same disclosure-, focus- and scroll-preserving draft path. The second slice keeps title and duration directly editable in collapsed and expanded rows, moves the five existing categories into a localized icon popover, and makes the final chevron the sole details disclosure. All remain draft-only until global Save. Functional drag-and-drop and the remaining Editor redesign are still pending.
- **Existing in released production V1 (owner screenshot, not the current native Workspace):** an accessible-intent repositioning popover with **Nach oben / Nach unten**, a **Position** select showing **number plus phase title**, an explicit **Verschieben** action and a close action; and an optional insertion-position selector when adding a phase. `PLAN-001` (insert a **new** phase at a chosen position) and `PLAN-002` (readable planned total) are **already released**. Do not redesign or accidentally remove these capabilities. Adapt the established behavior in the **one** native Editor where feasible, instead of recreating a competing V1 Planner or separate position algorithm. The native draft operation can be reused but the existing V1 popover is **not** proof that the final native UI is already implemented.
- **Already defined in Schema-2:** template/execution separation, lifecycle and ownership, stable phase IDs, category values, prepared rundown/phase information, independent Workshop-Notizen and `source.kind = builtin` support for execution provenance. That last provenance value is **not evidence** of a fully implemented built-in Template catalog, system-template update mechanism, visibility flag, direct execution-to-template creation flow or on-demand translation. Inspect exact existing services before choosing minimal additive boundaries.
- **Retain:** strict runtime ownership/lock, conflict and uncertain-write reconciliation, one Store, one Runtime Bridge, one timer engine, independent completed history, no V1 compatibility migration. Avoid structural saves or active-clock mutation simply to change presentation. All new persistent metadata/storage changes need contract and test review; never evade schema validators by writing ad-hoc fields.
- **Already decided, unchanged from earlier UX-001 register:** library tabs and lifecycle groups, 5-card pagination and sort, template-start versus plan-execution semantics, global Save/discard, validation of incomplete drafts versus run eligibility, overlay/read-only previews, named HTTP(S) resource links, locally vendored OverType candidate, 8–10-line fixed notes editing frame and associated focus/confirmation rules. The separate Facilitator Panel remains mandatory EDITOR-001 work, **not** part of this compact-row redesign.

#### B. Compact phase-list row — newer decision replaces collapsed-row-only-read and whole-row-click UX

- All existing and newly created phase rows are compact **and directly editable without opening their detail section**. Reading order/primary layout: **six-dot drag handle → computed two-digit phase position button → inline phase-title input → inline minutes input → directly clickable phase-category icon → detail expand/collapse chevron**.
- **Title and planned minutes are the primary frequent edits**, directly editable even when details are collapsed; never show a second duplicate title or duration field inside the expanded panel. Inline editing must not implicitly expand/collapse the row, reorder it, commit the global Store or change the active timer.
- **Position number is a separate, explicitly interactive button**, labeled accessibly e.g. “Phase 03 – Position ändern”; opens the familiar position popover from the collapsed **or** expanded row. The target select displays **position number + current phase title**. Preselect the current position; keep **Verschieben** disabled until a different valid target is chosen; **Abbrechen** dismisses without changes. **Verschieben** updates only the current draft and does **not** trigger another “are you sure?” confirmation, global Save or execution-side timer transition. This is the accepted explicit select-then-apply pattern; *never* immediately move the row merely by changing the select. Replace V1's ambiguous popover “Schließen” cancel copy with **Abbrechen**; use localized DE/EN copy. Position chooser is not an inline freely typed number.
- **Category icon** sits between minutes and the final detail chevron in normal wide layout. Tapping/clicking the icon **itself**, with no extra category chevron, opens a small accessible category selection popover/menu with the five existing categories/icons: `uncategorized`, `presentation`, `discussion`, `breakout`, `break`. Selecting updates that field in the same draft; no need to expand the details. Its icon visually reflects the current category.
- **Final chevron only** controls the phase's additional details (prepared notes/links, supplemental actions); it is independent of other controls. **The whole collapsed row is no longer a disclosure target.** Keep independently expandable multiple phases and the already agreed 3–4-line prepared-note and max-three-link read previews. Do not make the phase category a duplicate edit field in details unless required by a genuine accessibility fallback.
- **Six-dot drag handle:** additional familiar reorder method, not replacement for the position popover. Drag by handle only, not by selecting inputs or by normal vertical page scrolling. Goal **mouse, touch and keyboard-accessible alternative**: touch reordering is desired, not guaranteed without feasibility. On drop, update the **draft immediately** without separate confirmation; only global Rundown Save persists. Preserve unsaved values and expanded/collapsed state of moved **and other** phases, plus focus/scroll as feasible. The existing position button remains the always-available, accessible fallback. **Pareto gate:** small feasibility/real-device test first; avoid a heavyweight dependency, second drag engine, fragile mobile touch gestures or a new reorder architecture; if disproportionate, report the fallback and obtain scope decision instead of silently building complexity.
- **Responsive:** On desktop keep the compact one-row arrangement; on mobile allow responsive wrapping/repositioning of controls (including category icon), smaller but legible typography and screen-reader-only labels where necessary. Do **not** reduce interactive targets below the existing 44×44px goal. **No horizontal scrolling** in easyTimer layouts except for an independently justified exceptional case. Do not force every control into a single unreadable narrow row. On expanded phase, keep only information and secondary controls, not redundant primary editors.
- **Future Editor fine-tuning after Slice 2 (accepted, not part of the completed slice):** place the desktop disclosure chevron directly to the right of the category icon instead of below the position number; visually align the category and position popovers; and refine the 320px phase-row composition more deliberately and compactly. Preserve all existing behavior, accessibility, keyboard support and 44×44px touch targets while doing so.
  - **Additional owner observation (2026-11-19, Firefox private mode):** The current `uncategorized` phase-category icon resembles a prohibition/locked symbol and can misleadingly imply that the phase row is disabled or blocked. In future UX polish, replace it with a neutral, unmistakably non-restrictive `no category assigned` representation, consistently in the compact phase row and category popover. Keep its category semantics, accessibility label, existing selection behavior and DE/EN unchanged; evaluate a suitable existing icon rather than changing category storage or introducing new dependencies. This is a visual-only follow-up, **not** part of BUG-002 or its ongoing Firefox verification.
- **Phase categories describe facilitation interaction/setting, not the specific method or semantic topic**: presentation = one/few presenters, discussion = participants exchanging insights, breakout/group work = participants working together or in smaller groups, break = break, uncategorized = no assignment. This interpretation guides icons and the built-in retrospective, but does not add method-dependent timer logic or change allowed data values.
- Retain the original **add-phase at end** default with expanded new phase and title focus, and the released `PLAN-001` explicit chosen insertion position; do not conflate *inserting* a new phase with *repositioning* an existing one.

#### C. One protected, maintainable Retromat-inspired example Template

- Ship **exactly one** initial built-in example, not a template gallery, standalone example tab, separate tutorial workspace or forced onboarding. In normal **Meine Vorlagen** cards, mark it discreetly **Beispiel / Example** as metadata/badge, **not** a name prefix, extra category or sorting hack. System example is **read-only as an original**: no direct modification, overwrite or actual permanent user deletion. User can start or plan a **new independent execution** from it using the already agreed template actions, then explicitly create a new personal Template from that execution. No redundant “copy built-in template” shortcut required solely for this.
- The original protected built-in example **may be hidden**, like any user entry, and restored; it remains accessible as a local/offline fallback. A future app maintenance release may replace/update the **built-in example content** without touching independently created personal Templates, planned/current/suspended/completed Executions or archived history. Maintain the built-in's hidden preference across updates. No mandatory user-facing example version history, migration wizard or upgrade prompt.
- **Built-in example title**: German UI **Retrospektive**, English UI **Retrospective**; no “60 min”, revision number or “Example” in the stored/displayed title (separate badge). **Rundown category:** `workshop`. **Default total:** **60 minutes**, pragmatically adjustable. Five phase titles stay in **English in both locales**:
  
  | Order / phase title | Minutes | Phase category | Prepared note: purpose only |
  | --- | ---: | --- | --- |
  | 01 Set the Stage | 5 | `breakout` / Gruppenarbeit | Arrive, focus, and open participation |
  | 02 Gather Data | 15 | `breakout` / Gruppenarbeit | Collect experiences, observations and events |
  | 03 Generate Insights | 15 | `discussion` / Diskussion | Spot patterns and understand underlying causes |
  | 04 Decide What to Do | 20 | `discussion` / Diskussion | Select and agree on concrete improvements |
  | 05 Close | 5 | `breakout` / Gruppenarbeit | Summarize, reflect and close the retrospective |

- Notes above describe **intent, not prescribed exercises**: no specific facilitation activities, script, methodological instructions or copied Retromat method descriptions. Make the notes **ultra-short**, localized DE/EN, adjusted to sound natural (the English mini-descriptions above are semantic guidance, not text requiring verbatim reproduction). Include **one illustrative named HTTP(S) resource link** to `https://retromat.org/` in the **Rundown-wide prepared information/resources area**, not a link for every phase, and make the attribution/inspiration clear without implying Retromat endorsement. Respect content and branding rights.
- **Localized protected example display, Pareto-only:** prepare bundled German and English title/short-note variants; phase names remain English initially. When UI language changes frequently, the **protected example itself** should show the currently selected locale *if* this can be implemented as a small local display-and-copy mapping without a new generalized multilingual Schema-2 data model. Creating a new execution chooses the current language's prepared text **once**; all subsequently user-owned Templates/Executions and their edited contents **never auto-translate** when UI language changes. If localization of the protected example demands disproportional schema/storage change, report a simpler fixed-language fallback before coding.
- Translation **by explicit user action** for arbitrary personal Templates or planned Executions is **deferred to `I18N-001`**; do not implement it as a side effect of the protected example.

#### D. Universal library visibility (workspace organization, not lifecycle/archive)

- **Every Template and every Execution** may be deliberately **hidden or shown at any time**, regardless of execution state (PLANNED, ACTIVE incl. READY/running/paused, SUSPENDED, COMPLETED). Built-in example uses the same view-level hide/show behavior, while its protected content remains immutable. **Hide is not Delete, Archive, Completion, Stop, Suspend or Restore**. Never change live timer state, execution ownership, persisted plan, completion history or lifecycle when hiding.
- **All newly created entries always start visible**, regardless of their origin (new from scratch, copied from a visible/hidden Template, execution-derived Template, built-in example). **Never inherit** the source entry's hidden flag.
- Per-card accessible action **Ausblenden / Einblenden**, preferably in the existing overflow menu. The user's individual choice **persists immediately**, separate from the global Rundown draft Save. Use safe existing storage/conflict protections; a failed or uncertain persistence must not falsely claim success, silently change unrelated data or drop current active status. Do not introduce a new timer write or second library.
- A separate, accessible **Ausgeblendete anzeigen** view toggle exists **per tab** (Templates and Executions). **Default OFF whenever the editor/library is freshly opened.** Switching it on temporarily mixes hidden entries into their normal sort/status-group order, with a subtle **Ausgeblendet** distinction and individual restore actions; it does **not** permanently unhide them. When OFF, hidden entries do not count toward the displayed **5-card pagination**. Do not invent an archive/tab/folder/gallery for hidden items. Counts and page validity must update after hide/show; per-execution lifecycle groups and their existing collapsible behavior remain intact.
- **Empty-state behavior is deliberately very minimal:** with **zero total records** in a tab, a subdued line such as “Noch keine Vorlagen vorhanden” and the existing **Neue Vorlage** action (analogous execution-specific action if appropriate). With records present but **zero visible**, a subdued count e.g. **“10 von 10 Vorlagen ausgeblendet”** and **“Alle 10 Vorlagen anzeigen”** button that **turns on the same existing temporary visibility toggle**. No placeholder cards, illustrations, new onboarding, tutorials or extra navigation. When only some entries are hidden, the normal toggle may show the hidden count unobtrusively.
- Visibility persistence implementation location is **not predetermined** by UX: inspect current Schema-2 exact-field validators, template/execution Store operations, browser-local settings and future sync before choosing an additive, safe metadata boundary. Avoid casually modifying strict records or active-run persistence just to satisfy a workspace filter. This is **new scope**, not an implemented preexisting `hidden` property.

#### E. Create personal Template from any Execution — explicit copy, not mutation

- At **every lifecycle status** (PLANNED, ACTIVE READY/running/paused, SUSPENDED, COMPLETED), offer **Als Vorlage speichern** for an independent Execution. This is *not* a conversion that consumes, resets or changes the Execution. Make a **new independent Template** from a **consistent snapshot of its current planned Rundown content**: title, phase titles and positions, categories, planned durations, prepared rundown/phase notes and labeled resources. Do **not** copy live clock/progress, Attempt/Run/checkpoints, actual results, overtime, lifecycle, execution-specific **Workshop-Notizen**, or completed-reflection text. Purposefully transferring selected run notes into prepared content is a **different, already planned manual workflow**, not automatic template export.
- Open a **small explicit confirmation/name dialog** with the Execution's title prefilled as an editable **suggestion**, *without automatically selecting all text*; provide **Vorlage erstellen** to perform the authoritative create. The origin Execution stays as is. **Duplicate names are permitted** for Templates **and** Executions: no duplicate warning, forced suffix or name-based identity; IDs disambiguate. A new Template starts **visible**, even when originating Execution is hidden.
- **Active execution is not automatically forbidden.** Feasibility/safety gate: inspect existing `ACTIVE` ownership locks, bridge and Store snapshots; creation must be a safe copy with no timer interruption and no mutation to runtime or active content. If the existing guards cannot support a consistent snapshot at reasonable cost, report the real blocker and seek a scoped fallback; **never bypass locks or invent a second persistence path**.
- The current native Workspace/Planner service **does not implement a public “Execution → Template” create action** merely because it supports copying Template drafts or records. Do not declare it delivered. Make it a separately reviewed implementation slice with associated services/tests.

#### F. Agreed behavior that should not be grilled again; remaining evidence work

- Phase relocation (button, existing up/down or future drag) keeps the moved phase's **current expanded state and all local edit buffers**, all other phases' expanded/edit state, and best-effort focus and scroll. Only position and computed number change. On direct-position selection the **Verschieben** action is the only commit to the draft.
- Keep prepared information versus **execution-only Workshop-Notizen** separate, and obey the preexisting Facilitator Panel rule set. Workshop-Notizen are **never automatically copied into reusable Templates**.
- Do not reopen settled styling, note-editor height, overlay/apply/cancel/dismissal, prepared-information preview, empty phase, library sorting, or template-vs-run rules. Open practical checks instead: real desktop/mobile width and iOS/Firefox tests, 44px touch/keyboard focus, drag feasibility, real CSP/security/offline vendoring, reliable Store metadata/snapshots, conflicts and safe runtime validation. Existing test/source evidence outranks wishful implementation-complete claims.
- **Known authorized direct-GitHub documentation updates on this feature branch are not unexpected drift:** `5ab01e78`, `1b80f634`, `ed941516`, `1ecbeefa` (earlier UX decisions), `7c32830a` (`I18N-001` backlog) and the commit that adds this consolidation. On a local clone, preflight with `fetch`, compare the real remote HEAD, preserve untracked OverType spike and any review ZIP, and **safe fast-forward only where possible**. Do not halt merely because these known authorized docs are ahead locally; do stop for actual unexpected commits/conflicts/dirty tracked files. No `reset --hard`, destructive cleanup, forced push, overwrite or unapproved merge. Sol's next task must explicitly be told about the authorized documentation delta.
- **Before any implementation:** inspect current `docs/BRIEFING.md`, `SESSION_EDITOR_EVOLUTION.md`, the 2026-11-16 decision register, this backlog, existing native Workspace/Planner/Store/Runtime files and test gates. Deliver a small **IST → gap → Pareto implementation-slice proposal** with exact file/test scope; **no source edits before explicit GO**. This documentation commit grants no rollout approval.

### EDITOR-002 — Unsaved Workshop-Notizen draft recovery („Für lange Winternächte“)

**Priority:** Someday / low — intentionally deferred. **Status:** Open idea, not approved for implementation; optional small feasibility spike only after separate approval.

**User need:** When the browser unexpectedly reloads, crashes or gets terminated on mobile while the Facilitator Panel contains **started but not yet saved** Workshop-Notizen in one or several phases or the Rundown area, it would be useful to restore those drafts without silently losing the text or disrupting the timer.

**Scope boundary:** This is **not** a mandate for autosave on typing, periodic background storage, a second recovery engine, cross-device sync, draft versioning or an additional notes library. The explicitly accepted save behavior on phase/Panel close, navigation into the Session Editor, suspend and archive remains **part of EDITOR-001**, along with safe storage and recovery of already committed note content and timer progress. Unexpected-reload recovery of **uncommitted drafts only** is deferred; do not promise it currently works.

**Optional mini-spike:** If a genuinely small and safe local approach appears plausible, a separately approved, narrowly scoped feasibility check may examine multi-phase draft ownership, conflict/staleness protection, explicit discard/reset/exit rules, browser reload/mobile PWA behavior and the interaction with authoritative timer recovery. Require a concrete low-complexity design and credible tests before proposing implementation. **If it is not clearly manageable, stop; leave this item parked for a long winter evening.** No delivery date or hidden dependency for EDITOR-001.

## Template portability and optional synchronization

### SYNC-001 — Optional Google Drive synchronization

**Idea:** Eventually let a user access their own workshop templates across devices with Google sign-in and Google Drive storage, without creating an easyTimer-specific server or database. The earlier candidate was a small JSON document via Drive API and Google Identity Services, potentially in `appDataFolder`; the `drive.file` approach is an alternative if user-visible files become important.

**Spike first:** Verify OAuth consent/scopes, app registration/verification requirements, iOS Safari and installed-PWA sign-in flows, token expiry, offline behavior, cross-device conflicts, data recovery, realistic free-tier limitations, and long-term maintenance costs. Do **not** assume that a fully browser-only solution or permanent zero cost is guaranteed. JSON export/import must remain useful without Google sign-in.

**Status:** Immutable snapshots are the tested candidate; the rejected conditional-overwrite strategy is not a safe production basis. [SYNC-002C](archive/investigations/SYNC-002C_ISOLATED_INTEGRATION.md) is an **isolated integration PoC validated with real Google Drive**. Owner-operated Firefox tests confirmed first sync with real HTTP 409 and subsequent GET 200, divergent branches in normal/private contexts (3 snapshots, 2 heads, concurrent-content conflict), reload recovery after a simulated lost acknowledgement using GET only, preservation of newer dirty edits and a real authorization-expiry/reconnect condition. The second context was private Firefox on the same device, not another physical device. Automated/mock evidence remains separate in the report.

**SYNC-003A — Local application integration implemented and owner-validated with real Google Drive. Production NO-GO.** See [acceptance, migration boundaries and release blockers](archive/implementation/SYNC-003A_LOCAL_APPLICATION.md). The owner created and backed up a real test Rundown, published from normal Firefox, explicitly adopted it in initially empty private Firefox, edited 05:00 to 07:00, synchronized back without conflict and loaded the actual Session Timer READY at 07:00. This is same-device independent-context evidence, not physical second-device, iOS or deployment acceptance. The informal approximately three-second publication observation is not a benchmark.

**Production blockers:** replace the rejected technical migration confirmation with understandable DE/EN UX while retaining validation/readback/rollback safeguards; review safe production migration, packaging and public OAuth/privacy readiness. Actual iOS Safari/installed PWA, physical interruptions, real quota exhaustion and Opera GX rendering remain open. Future bounded identity UX should use official Google authorization, an actual account image when available and name/email in a compact account menu, with restrained header/mobile placement and a clear distinction between connected and synchronized. Evaluate `openid`, `profile`, `email` only under separate review; no additional scopes or account-data processing are approved here. Also review initial empty-library pending status and the connected-state Connect action. The initial false error is fixed; the zero-byte download remains unreproduced.

**Google account UX decision — future SYNC-001 productization, not implemented:** **Account identity at a glance. Sync details on demand.**

- Place a small, browser-inspired account icon beside the existing hamburger menu. When not signed in to easyTimer, show a neutral user silhouette; sign-in is optional, not onboarding.
- When signed in, show the familiar circular Google profile image only if available and authorized, with an unobtrusive fallback. Do not permanently display the account name or email in the header.
- Do not add status dots, badges, checkmarks, warning overlays or other sync indicators to the avatar. Account identity and synchronization status remain separate.
- Clicking opens compact account details and appropriate actions. Preserve accessible names, keyboard interaction, suitable touch targets, DE/EN, Light/Dark and responsive conventions.
- Hide the indicator entirely in timer fullscreen and mobile landscape.
- Reuse existing account information where possible. Do not request extra Google permissions solely for decoration without reviewing necessity, consent and privacy implications. Google authentication and synchronization remain optional.

This extends the existing identity-UX/productization requirement above; it does not create another ticket or authorize implementation, new scopes or account-data processing.

**SYNC-003B — functionally accepted in local development:** minimal accessible DE/EN A / B / Keep Both decisions for exactly two current snapshot heads with a unique validated common ancestor and live-versus-live Rundown conflicts. No default or automatic winner. Copies receive fresh stable IDs and collision-safe numbered names. A durable reconciliation intent retains the exact immutable ticket; local installation requires verified readback, complete discovery as the sole known head and an unchanged local revision/content. Independent changes and original snapshots remain recoverable. Stale reviews, local unpublished edits, existing tickets and unsupported ancestry/delete-versus-edit/restoration cases stop safely. Automated regressions passed. Owner-operated real Google Drive acceptance passed for A/B/Keep Both, explicit conflict-free reconciliation, live recovery and preservation of the second client's unpublished changes. Both Firefox contexts ended with the same 13:00 + 08:00 library and Synced (last checked). Final local diagnostics showed one valid head, matching base, no dirty changes and no pending tickets; they do not independently verify current remote Drive state. Production remains NO-GO. See [report and owner test](archive/implementation/SYNC-003B_CONFLICT_RESOLUTION.md). No version-history UI. Late-offline-edit-as-independent-copy remains deferred and unproven. No production approval.

The accepted transport remains append-only immutable snapshots without automatic cleanup. SYNC-002D1's replacement protocol is not adopted. DATA-001 and local-only operation remain independent.

**Approved targeted SYNC-003B correction:** fully validated conflict-free two-head proposals are now also supported through a complete readonly preview and explicit confirmation, without A/B radio choices or automatic publication. See [implementation and A-first owner acceptance](archive/implementation/SYNC-003B_CONFLICT_FREE_RECONCILIATION.md). The recovery path passed automated/synthetic verification and owner-operated real Google Drive acceptance, including recovery of the previously unsupported live state. Content-conflict decisions and pending-ticket/local-revision safeguards remain unchanged.

### SYNC-099 — Optional Snapshot Cleanup

**Priority:** Someday / Maybe / Very Low. **Status:** Deferred — no implementation planned.

Consider safe, criteria-based cleanup of obsolete Google Drive snapshots only if actual snapshot count, age, accumulated storage, API overhead or usability makes it necessary. Do not select fixed retention periods or thresholds now. Never delete snapshots merely because they are old or another file has a newer timestamp. Cleanup requires separately validated replacement, recovery and offline-device safety.

The append-only immutable snapshot architecture remains the accepted approach. SYNC-002D1's checkpoint/receipt replacement protocol was evaluated but is **not adopted**. SYNC-003A contains no cleanup code or scheduling.

## Timer and workshop execution roadmap

The following packages are **already covered in more detail** by the ET-001 decision register in [`EASYTIMER_UX_KONZEPT_v2.md`](EASYTIMER_UX_KONZEPT_v2.md). These entries are navigational reminders, **not a second specification**; check the canonical decisions before planning each epic.

Delivered Session Timer, Session Editor, recovery and navigation increments are summarized in the [changelog](../CHANGELOG.md). Historical implementation records remain under [`archive/implementation/`](archive/implementation/), including [ST-002B](archive/implementation/ST-002B_AUTOMATIC_SESSION_TIMER.md), [UX-011](archive/implementation/UX-011_SAFE_SESSION_NAVIGATION.md), [UX-014](archive/implementation/UX-014_REFRESH_SAFE_NAVIGATION.md), [UX-016](archive/implementation/UX-016_SHIFT_SUBTRACTION.md) and [UX-018](archive/implementation/UX-018_CONTEXTUAL_TIMEBOX_CONTROLS.md). UX-012 (`cfdf609`), UX-013 (`68c79cd`), REL-001A (`5503987`), REL-001B (`f3ad90c`), UX-014 (`0f48f06`) and UX-016 (`4b2de24`) are ancestors of the verified v60 production release. UX-018 shipped in v61 and UX-011 in v62. Unresolved follow-ups remain below under their own IDs.

### SW-001 — Stopwatch with Time Marks

**Priority:** Candidate / Design Review. **Status:** Future optional mode; no implementation authorized.

Add an optional third timer mode that counts elapsed time upward until explicitly stopped. While it is running, users can record time marks. Marks may optionally receive names, but entering or editing a name must never pause or otherwise interrupt the stopwatch.

Whether marks display absolute elapsed timestamps, intervals between marks, or both remains an open product decision. Interaction design, persistence and recovery behavior also require a separately approved design review. Preserve all existing Quick Timer and Session Timer functionality, and do not introduce this mode by changing their timing semantics.

### ST-004 — Hybrid countdown and unlimited Session phases

**Priority:** Later. **Status:** Future idea only; explicitly outside
EDITOR-001 and not authorized for implementation. Evaluate alongside or after
the standalone Stopwatch capability in SW-001.

A Session phase may eventually use either a fixed countdown timebox or an
explicitly selected unlimited duration. An unlimited phase measures elapsed
time in stopwatch style and is displayed with an unambiguous infinity symbol
(`∞`) plus accessible text. An unspecified duration (`-- min`) remains
incomplete and prevents Session start; it must never implicitly mean unlimited.

When the facilitator deliberately advances from an unlimited phase, retain its
elapsed time and let the following phase use its own selected timing mode. A
representative Rundown is: Welcome (15 min) → Keynote (30 min) → Open Discussion
(unlimited) → Outro (15 min).

Explore reuse of the future standalone Stopwatch capability without creating a
competing Timer engine. Preserve authoritative Session ownership, Pause/Resume,
Recovery, lifecycle semantics and compatibility with future synchronization.
Reporting and statistics implications require evaluation before any design or
implementation approval.

### ST-003 — Editing and statistics during a session

Later: edit the current and upcoming phases without stopping the running session, with protected current/completed phases, conflict-safe drafts, per-phase time saved/overrun, workshop totals, and recovery behavior. Follow ET-001 decisions 39–43, 45–48, and 53–56 instead of simplifying them silently.

**Status:** Later; depends on ST-002.

### ADHOC-002 — Minimal Ad-hoc Timer Overlay

**Priority:** Strictly after EDITOR-001, including the Facilitator Panel. **Status:** Deferred separate feature; implementation requires explicit Product Owner approval and is not part of EDITOR-001 or 0AM.

Provide a small accessible DE/EN countdown overlay above a still-visible, independently continuing Session Rundown. It is not another application mode and must never modify the Session Timer, rundown, phase transitions or Execution lifecycle. Reuse existing timer calculations with one separate ephemeral timer starting at `00:00`, `+1 min` and `+5 min` adjustments, and appropriate Start/Pause/Resume controls. At completion it remains at `00:00` until an explicit **Stop & Close** action. Stop & Close—and Escape if supported—requires confirmation before discarding and closing; there is no separate close button. Do not persist or recover this temporary timer after reload or crash, and add a brief FAQ explanation only when the feature is implemented.

### QT-002 — Optional Quick Timer refinements

Possible **manual duration entry** beyond the delivered additive/subtractive controls. Keep any extra control contextual and subordinate to the large clock. Do not regress the current deadline/timebox/overtime semantics or reintroduce a cluttered default editor.

**Status:** Later; exact UI and scope still open.

### REL-001 — Durable runtime restoration

REL-001A and REL-001B provide durable Quick Timer and Session Timer recovery and are deployed as part of the verified v60 production baseline. Running, paused, READY, overtime, phase progression, ownership refusal and explicit recovery selection are covered by the implementation records and regressions.

**Status:** Core Quick and Session recovery is complete and deployed. Remaining work is limited to separately approved hardening: real-device iOS/installed-PWA and screen-reader acceptance, the deferred four-hour recovery notification/dialog policy, and UX-017 candidate cleanup. Do not replay missed visual/audio events or silently discard meaningful Runs.

### UX-017 — Recovery Candidate Management

**Status:** Future UX refinement; backlog only, no implementation authorized.

**Owner observation:** Repeated local testing accumulates old Quick Timer and Session Timer recovery candidates. Provide a safe, understandable future way to manage or explicitly discard obsolete recoverable timers.

**Requirements for later design:** Never silently delete meaningful recoverable Runs. Respect active ownership and Web Locks; never discard a timer owned by another live tab. Distinguish active, recoverable, completed and deliberately discarded Runs. Define retention, cleanup criteria, confirmation and recovery consequences with the product owner before implementation. Do not choose automatic deletion, age thresholds or a storage migration now. Keep local runtime management separate from Google Drive snapshot cleanup (SYNC-099), Rundown definitions and account UX. Preserve normal recovery and its durable unresolved-choice safeguards.

### SIGNAL-001 — Visual and audible event signals

Independent visual/audio preferences, with audio off by default, event-specific controls (Quick expiry, ad-hoc, phase transitions, workshop completion), and browser-local persistence. Always keep a textual status. Respect platform audio restrictions.

**Status:** Later; useful once relevant runtime events exist.

## Presentation and remote control

### NANO-001 — Nano-View – Always-on-Top Timer View

**Priority:** Next feature immediately after EDITOR-001, including the Facilitator Panel, is fully completed, accepted and released to production; before SW-001. **Status:** Accepted product direction only; implementation requires separate explicit Product Owner approval and must not interrupt EDITOR-001.

Provide a compact, primarily desktop-oriented secondary view of the currently active Quick Timer or Session Timer. Where supported, open it in a small floating, always-on-top browser window using the native Document Picture-in-Picture API so facilitators can keep essential timing information visible while working in presentations, Miro, browsers or other desktop applications. Show the time, minimal relevant context and only essential timer controls. Keep the UI lightweight, accessible and consistent with the existing DE/EN and theme conventions.

The Nano-View is strictly a view and controller of the existing authoritative timer: do not add another timer instance, timer engine, lifecycle, persistence or recovery architecture. Closing or hiding it must not stop, pause, reset or otherwise alter the timer. Unsupported browsers retain normal EasyTimer functionality. Do not require external utilities, administrator rights, PowerToys or installed desktop applications. Reliable visibility over another application's exclusive fullscreen presentation is desirable but not a release requirement, and precise programmatic window placement is not required. Verify actual browser support and behavior during the later technical design and acceptance phase; do not promise universal compatibility.

This item is distinct from PRES-001's same-device Moderator/Audience dual-window concept, VIS-001's alternative timer renderings and SW-001's separate elapsed-time mode. Detailed interaction design and implementation remain separately reviewable.

### PRES-001 — Moderator View & Audience View (same device)

**Use case:** An extended-desktop laptop controls a workshop while a projector, second display, or speaker-facing monitor shows an optimized, control-free clock.

- **Moderator View:** Full timer controls, adjustments, phase navigation, menus, and relevant planning/session context.
- **Audience View:** Large timer and overtime with just the relevant current/next phase and workshop progress information when useful. **No controls or hamburger.**
- A speaker-facing screen uses the **same Audience View**; no extra “Speaker View” mode.
- Two **simultaneous views of one running timer**, not two timers or separate timing engines.
- Open a second browser window on the **same device**. Explore lightweight same-origin synchronization (for example, `BroadcastChannel`) while keeping exactly one authoritative running state. Define how the display behaves on controller refresh/close, reconnect, tab suspension, and window movement to a projector.
- Optional show/hide display fields may be considered later; do not create unnecessary new presentation modes.

**Status:** Someday / deliberately **low priority**. No backend or remote-device support is part of this item. This is conceptually distinct from today's responsive Standard/Presentation layouts.

### REMOTE-001 — Cross-device control (separate architecture spike)

**Use case:** Control a timer from a smartphone or another computer while a separate device drives the visible display.

**Unresolved:** Discovery/pairing, ownership, authentication or access protection, networking and connectivity, synchronization and conflict handling, wake/refresh/reconnection, offline behavior, privacy, operational costs, and whether a genuinely serverless/no-cost solution would meet the requirements.

**Status:** Someday / Spike. Do **not** fold into PRES-001 or select infrastructure prematurely.

### LIVE-001 — Shared Live Timer & Remote Control

**Priority:** Low / Someday-Maybe; behind current UX, synchronization productization and production-release priorities. **Status:** Future backlog only; no provider choice, implementation design or PoC authorized.

**Goal:** Allow a live easyTimer session to be viewed and controlled across devices and independent user accounts, for example a desktop presentation with smartphone remote control. Coordinate future scoping with REMOTE-001; PRES-001 remains the separate same-device audience-view concept.

**Future requirements and evaluation criteria:**

- Shared live mode is optional; local-first behavior remains the default.
- Session transitions and timestamps are server-authoritative; clients render countdowns locally.
- Support cross-device and cross-account participation, preferably without mandatory Google sign-in.
- Join through QR codes or links, with separate viewing and control permissions.
- Handle concurrent commands, reconnection and offline behavior safely.
- Preserve existing Quick/Session Timer semantics, including overtime and phases.
- Keep shared live-session state separate from Google Drive Rundown backup/synchronization.
- Zero additional operating cost is a hard design constraint.
- Before choosing infrastructure, compare Cloudflare Durable Objects, Firebase Realtime Database and existing All-inkl PHP/MariaDB hosting. Evaluate free-tier ceilings, security, operational reliability and maintenance burden; do not assume any candidate meets the constraints without verification.
- Normal offline/local timer usage must have no mandatory backend dependency.

No infrastructure is selected and no implementation or experiment starts with this entry.

## Appearance and customization

### UX-019 — Subtle Start/Resume and Stop Button Accents

**Priority:** High — small, high-impact UX improvement. **Status:** Released to staging and production in PWA v64 at commit `81882746101db90a426397d92a761c9f8b13512f`; verified production workflow run [`41236581208`](https://github.com/nox-vobiscum/easytimer/actions/runs/41236581208).

Improve action recognition and visual hierarchy, particularly on mobile where the primary Start action can have approximately the same prominence as Timebox and runtime-adjustment controls. Apply a subtle sage-green accent only to actions whose actual current function is to start or resume/continue a countdown in Quick Timer or Session Timer. Apply a restrained muted coral-red accent only to Stop, preferring a tinted surface and/or border over a strong alarm-red fill. Preserve all existing labels, icons, confirmation behavior, keyboard focus and touch targets.

Keep Pause, Reset, duration presets, runtime adjustments, Save, navigation and unrelated primary buttons unchanged; the established blue primary-action treatment remains everywhere else. Scope future styling by actual button action/state rather than one fixed text label. Define appropriate separate Light and Dark values, let System follow the established theme behavior, and preserve the existing blue focus indicators. Verify text and UI contrast and never rely on color alone to convey purpose.

This is a color-treatment-only increment: no button dimension or layout changes, new controls or settings, timer/Session behavior changes, overtime-color changes, global palette redesign, global primary-button recoloring or new dependencies. Before implementation, inspect actual Start, Resume/Continue and Stop rendering in both timer modes, identify the smallest scoped CSS change, evaluate Light/Dark/System on mobile and desktop, and present a focused visual comparison for owner acceptance. Implementation requires separate authorization.

### VIS-001 — Alternative Timer Visualizations

**Priority:** Candidate / Design Review. **Status:** Future optional views; no implementation authorized.

Keep the existing digital countdown as the default. Explore two optional presentations of the same authoritative timer: a moderation-clock view with a red circular remaining-time segment that shrinks as time elapses, and a simplified hourglass view.

These are visualizations, not independent timers. They must reuse the current timer state, transitions, persistence and recovery rather than introducing another timing engine or duplicate state. Detailed visual design and the representation of zero and overtime remain open product decisions. Evaluate a lightweight CSS/SVG implementation without new dependencies before approving implementation.

### UX-015 — Timer View Typography & Information Hierarchy

**Priority:** Later — visual polishing, not part of UX-013. **Status:** UX-015A lower Session Timer information area and UX-015B upper Session hierarchy were released in PWA v66 at commit `33635ea44939187cc4e7be834fad0eb70fb4f6a1`; verified production workflow run [`41317875158`](https://github.com/nox-vobiscum/easytimer/actions/runs/41317875158). The borderless Next Phase control is included. Quick Timer typography and the compact-landscape menu observation remain open. CUSTOM-001 remains separate optional user customization.

**Goal:** Extend UX-013's restrained RBS-inspired utility-label language to Quick Timer and Session Timer, improving information hierarchy and consistency without unnecessary UI elements. The large countdown remains the undisputed visual focus.

**Session Timer — upper information area:** Review workshop name, current phase name and phase progress together. Treat the workshop name as secondary context, the current phase name as the principal contextual heading, and progress such as “Phase 1 von 3” as a subtle uppercase utility label. Avoid three equally weighted elements stacked above the countdown.

**Session Timer — lower information area (specific owner direction):** The two areas immediately above the existing workshop progress bar use the same intentional two-line pattern:

| Area | First line: subtle utility label, visually uppercase | Second line: more prominent actual value/title |
| --- | --- | --- |
| Left: workshop remaining time | DE: WORKSHOP-RESTZEIT; EN: WORKSHOP REMAINING | Remaining time, e.g. `20:00` |
| Right: upcoming phase | DE: NÄCHSTE PHASE; EN: NEXT PHASE | Upcoming phase title, e.g. `Discussion` |

Use localized mixed-case semantic text with uppercase applied through CSS, reusing the same small, semibold, subtly letter-spaced utility style from UX-013. Clearly distinguish labels from values. Align both areas cleanly above the progress bar with balanced spacing rather than rigid column symmetry; keep them compact and unobtrusive. Preserve existing next-phase navigation and its arrow, including the existing state/mode-specific behavior. Handle long phase titles, unavailable next phases and narrow screens gracefully. No extra boxes, cards, borders or decoration. Do not change the meaning or calculation of remaining time, overtime or progress.

**Quick Timer:** Explore consistent treatment for Countdown, duration selection and duration extension controls wherever it improves clarity. Avoid additional headings without a useful informational purpose.

**Design and acceptance boundaries:** Reuse existing fonts, theme colors and design tokens; avoid excessive uppercase, new dependencies or a broad design-system refactor. Support DE/EN, Light/Dark, desktop, mobile, fullscreen and mobile landscape. Preserve the deliberately minimal fullscreen/landscape layouts. This is visual polish only: no timer calculations, workshop progress, overtime behavior, phase transitions, navigation or persistence changes. Implementation and visual acceptance require separate owner approval.

**Additional owner observation — small-landscape menu overlap (future visual refinement only):** During local Google Account Header acceptance at 667 x 375 CSS pixels, the hamburger menu overlapped the underlying recovery selection and partially obscured the timer. The owner accepted account access and the scrollable panel as functionally sufficient; this was not a reported functional failure. Review compact menu placement and recovery/timer visibility in a separately approved visual pass, preserving accessible actions, scrolling, focus, recovery decisions and timer behavior. No implementation is authorized here; this observation is outside the Google Account Header checkpoint.

### CUSTOM-001 — Lightweight, optional presentation customization

Consider user-configurable colors, progress-bar treatment/visibility, information density, and perhaps limited layout options **after** the essential timer and session behavior stabilizes. Avoid a sprawling settings screen or aesthetic customization for its own sake. Keep Light/Dark/System and DE/EN behavior consistent.

**Status:** Someday, low priority.

UX-008 endgame highlighting is implemented locally and always enabled in both timer modes; it is not a pending customization item. A simple global ON/OFF preference remains an optional later refinement. Threshold percentages/tables, custom warning durations, endgame color pickers, flashing and additional warning levels are not planned as part of UX-008. See the [canonical UX-008 record](EASYTIMER_UX_KONZEPT_v2.md#ux-008--shared-timebox-endgame-highlight-approved-implemented-locally).


### I18N-001 — On-demand translation of a Rundown

**Priority:** Later / Future idea. **Status:** Parked at Product Owner request, not approved for implementation.

**User need:** A facilitator regularly switches the easyTimer UI between German and English for different teams, and wants a deliberate **Translate / Übersetzen** action to prepare an existing user-authored template or planned execution in the other language, rather than manually translating every title and note.

**Potential scope:** Rundown title, phase titles, prepared rundown-wide and phase notes, and other authored descriptive text as appropriate; resource URLs remain unchanged, and display labels need deliberate treatment. Target languages initially DE/EN. Avoid translating runtime state, IDs, timestamps, durations, categories or captured workshop notes implicitly. Preserve phase identity and the original text unless the user explicitly approves replacing it; favor preview/copy, safe confirmation and offline/free-first feasibility.

**Boundary:** Changing the interface language must **never automatically translate or mutate an existing personal template/execution**. The protected built-in retrospective may display bundled DE/EN content dynamically under the separate EDITOR-001 Pareto constraint. Any translation engine, privacy implications, offline operation, cost and preview UX require a separate future review; do not assume a third-party translation API or subscription.

## Reliability and browser compatibility


### BUG-002 — Session next-phase transition enters recovery lockout (owner report 2026-11-18)

**Priority:** High — investigate promptly before treating the currently unreleased native Session flow as release-ready. **Status:** Reproduction reported by Product Owner; root cause, exact reproducibility, storage/runtime state and regression scope not yet diagnosed. **Not** authorized to change Runtime, Recovery, Store, ownership or clock semantics without a separately scoped investigation and GO.

**Observed steps (Firefox screenshot; exact origin/build beyond current testing context to verify):**

1. Start a Session using the currently tested native Editor/Session flow; example rundown: “Retrospektive Testdingens”, seven phases, first phase “Erste Phase”.
2. Let the timer run in phase 1, then activate the existing **Next Phase** arrow/button in the bottom-right of the Session Timer.
3. The UI displays a prominent **“Timer recovery”** banner: **“This session can no longer be changed safely. Reload to retry; stored data was not overwritten.”** At the same time, the timer remains visually rendered with phase **“Erste Phase”**, **“PHASE 1 OF 7”**, countdown **09:48** and status **“Running”** in the captured screenshot; Pause/Stop Workshop appear unavailable/disabled. Exact internal timer advancement and authoritative stored state are **unknown** from the screenshot alone.

**Additional Product Owner observations (same test sequence, 2026-11-18):**

- **On the initial lockout:** **Pause**, **Stop Workshop** and **Next Phase** cannot be clicked/activated. The main **menu** and **fullsize/fullscreen view control** still respond. Thus the UI is not globally frozen; session-changing commands specifically become unavailable. Distinguish genuine disabled state from an overlay intercepting pointer events during investigation.
- **After browser reload:** The session is displayed again in the first phase in **READY**. The session controls appear enabled/available again.
- **After clicking Start from that reloaded READY state:** The **same “Timer recovery / This session can no longer be changed safely...” error reappears**, and **the timer does not start/count down this time**. The resulting blocker is therefore **not limited to the Next Phase handler**; it also manifests on a subsequent Start attempt after reload. Exact restored/persisted run identity, timer state, revision, ownership and lock status are still unknown.
- These are **observations**, not proof of a particular defective lock, storage revision, runtime-state transition or recovery implementation. Preserve any meaningful recoverable state; do not bypass safety checks.

**Diagnostic addition:** Reproduce and compare both paths separately: **running phase 1 → Next Phase → lockout** and **reload → READY → Start → lockout/no countdown**. Inspect whether session controls are truly disabled due to protective read-only state; why menu and fullscreen remain functional; what persisted state was restored as READY; and whether any common guarded write/ownership/revision path fails on both Next Phase and Start. Record state transitions and concrete error codes without guessing.

**Expected:** The Next Phase command should either safely advance exactly one phase and continue ordinary timekeeping/persistence, or present a precise recoverable state without an unjustified lockout; never silently overwrite newer or conflicting state. Do not weaken recovery/lock protections to hide this symptom.

**Investigation plan (first, separate narrow diagnostic slice, no speculative fix):** Capture exact reproduction and environment (local v77 production build versus deployment; normal/private tab; single vs multiple tab; previous recovery candidates; local/remote revisions, ownership); browser console/error and relevant safe diagnostic logs; native phase-transition orchestration, active Runtime Bridge, Store writer, lock/revision checks and read-only reconciliation. Compare expected transition and persisted runtime snapshot; test first phase-to-second, later transitions, manual/automatic mode, reload/recovery and cross-tab conflicts without corrupting meaningful runs. Determine whether lockout is a legitimate detected conflict or an actual false conflict/regression. Report concrete causal codepath and smallest safe fix with focused regression tests **before** code changes; seek explicit GO. Avoid requesting user to clear localStorage, reset recovery, delete sessions or bypass safeguards before preserving the state.

**Scope:** This is distinct from resolved `BUG-001` (fullscreen Stop), future `UX-017` recovery-candidate management, `REL-001` recovery hardening and the UX-001 compact-phase-row work. **Do not silently bundle the runtime diagnostic/fix into frontend Slice 2.** Preserve the error screenshot/evidence in review notes; screenshot is not committed here. Real manual Firefox acceptance required after any eventual fix.

### BUG-001 — Fullscreen-safe Workshop Stop confirmation

**Status:** Released to staging and production in PWA v67 at commit
`72b2d28435ebb6b6e77739c454add57a49eee0f7`; verified production workflow run
[`41323065346`](https://github.com/nox-vobiscum/easytimer/actions/runs/41323065346).
An unreleased follow-up guard is implemented locally so that dialog Escape does
not also invoke the global fullscreen or expanded-view exit.

Firefox can hide a browser-native `window.confirm()` prompt behind its fullscreen
surface, leaving Workshop Stop visibly blocked until fullscreen is exited. The
regular Session Workshop Stop action now uses one localized document-modal
confirmation in normal and fullscreen presentation. Cancel and Escape preserve
the active Session, deadline and fullscreen; confirmation retains the existing
`STOP_WORKSHOP` reset semantics and restores sensible keyboard focus.
`Stop overtime` remains unchanged because it is not part of the reported defect.

## Documentation maintenance

### CI-001 — Skip staging deployment for documentation-only pushes

**Status:** Implemented and validated locally; commit and publication require
separate owner approval. The staging workflow remains `develop`-only and uses a
conservative dependency allowlist. Documentation-only changes do not deploy;
application, release-tooling, test, workflow/action, package-metadata and Git
attribute changes do. Production remains manual-only.

### DOC-001 — Documentation Consolidation & Archiving

**Priority:** Low. **Status:** Complete and published to `develop` and `main` as
`3069802`. The documentation-only commit did not change the application,
production artifact or PWA v62.

**Goal:** Keep the `docs/` root intentionally small, navigable and focused on current, actionable project knowledge.

**Scope and acceptance criteria:**

- Audit existing documentation before designing the final structure.
- Keep only a small number of essential entry-point documents in the `docs/` root.
- Consolidate fragmented documentation into authoritative, up-to-date references where appropriate.
- Group historical PoCs, experiments, investigations, superseded plans and decision records into a structured archive.
- Preserve important technical reasoning and traceability.
- Provide clear navigation from current documentation to archived material when relevant.
- Update internal Markdown links, README references, agent instructions and tooling paths affected by relocation.
- Avoid redundant or contradictory sources of truth.
- Ensure future development documentation follows the new structure.

**Current result:** The root README, changelog and briefing are the primary entry points. Historical implementation and investigation records are grouped under `docs/archive/`; active references and relative links are maintained. Historical evidence remains intact. This status does not claim a commit or release.

## Maintenance of this backlog

- Add only specific ideas that have actually been discussed; avoid speculative feature inflation.
- Every approved development increment must update its corresponding backlog item, changelog entry and other affected documentation in the same reviewed implementation commit.
- The implementing developer, human or AI, may make those in-scope maintenance updates without separate documentation authorization. This does not authorize new requirements, unrelated reprioritization, a Git commit, push or deployment.
- When an idea is approved, move detailed requirements and acceptance criteria into that increment's plan; leave a short link/status here.
- If implemented, record the actual status and commit/release reference, then remove it from active future-work lists or retain only a concise historical reference when justified. Never remove unresolved requirements silently.
- Preserve unrelated concurrent or uncommitted owner edits and do not use maintenance work to expand implementation scope.
- Keep accepted product rules in `EASYTIMER_UX_KONZEPT_v2.md`; avoid copying its full ET-001 decision register here.
- Keep delivered ST-001 functionality separate from future planner improvements; direct insertion at a chosen position (PLAN-001) was released in PWA v63.
- Changes to code, branches, commits, pushes, merges, or deployment always require explicit owner approval.
