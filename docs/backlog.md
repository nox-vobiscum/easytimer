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

**Guardrails:** Keep easyTimer lightweight, fast, and usable with its existing static hosting and free-first approach. Prefer no backend, database, framework, or paid service unless a separately approved architecture review demonstrates a clear need. Reuse **one authoritative timer state**. Do not turn the planner into a full workshop-management suite. German and English UI; repository documentation and code in English. Every feature requires a separate scope review and explicit approval, including Git commits, pushes, merges, and deployments.

**Priority terms:** `Candidate` = reasonable upcoming increment, not scheduled; `Later` = valuable but dependent on more important work; `Someday` = deliberately low priority; `Spike` = investigate feasibility before committing to an implementation. These are relative labels, not delivery promises.

## Ideas at a glance

**Delivered Rundown entry:** The Rundown picker keeps `Load Rundown` / `Rundown laden`, the visually hidden native label and short selection placeholder. A muted context line explains selecting a saved rundown for Session Timer. Load and Refresh list remain the main controls. The separate secondary `Open Session Editor` / `Session-Editor öffnen` action, with list/edit SVG and `Create & edit rundowns` / `Rundowns erstellen & bearbeiten` subtitle, opens the existing library overview. Creating a new draft happens there; it preserves initial phase/defaults, stable IDs, validation and discard guards. Loading leaves phase 1 READY without starting, with an isolated Manual/Automatic snapshot. Saved-data and page-reload explanations and Back to Quick Timer remain available. Workshop field/validation and active Session terminology remain deferred; models and persistence keys are unchanged.

**Accepted menu release (publication approved):** The preparation tool is now called **Session Editor** (DE: **Session-Editor**), with subtitle “Create & manage rundowns” / “Rundowns erstellen & verwalten”. Internal Planner modules, IDs, storage and workshop-template terminology remain unchanged. Mode tiles remain above the separate Editor action; language/theme share a compact row. The owner selected **Variant B - Stopwatch + Echo** from the supplied reference: a dominant stopwatch with two subdued rear stopwatch echoes. This supersedes the earlier review-only A/B/C proposals. The selected inline SVG uses theme-aware color/opacity; there is no icon selection UI. The owner has authorized documentation follow-up and production publication of this bounded menu release (PWA v31). Verify deployment outcome separately.

The ST-001 density/reordering, initial-phase default and final repositioning-popover polish shipped in [commit 516d939](https://github.com/nox-vobiscum/easytimer/commit/516d939bdd5510d8c2f5bb68b205485c980ee9b4) on 2026-10-23 (PWA shell v22). They are delivered functionality, not pending backlog items. Native iOS Safari/PWA and screen-reader acceptance checks remain open as documented in the [README](../README.md#st-001-session-planner).

| ID | Idea | Priority | Main dependency / note |
| --- | --- | --- | --- |
| UX-009 | Unified positive overtime readout | Implemented; release approved | Replaces UX-008 dual readout; thresholds unchanged; v26 |
| UX-010 | Smartphone landscape Clock-only | Implemented; release approved | Temporary tap/keyboard view; no preference or timer-state change; v26 |
| PLAN-001 | Insert a new phase directly at a chosen position | Candidate | Compact Session Planner finalized |
| PLAN-002 | Friendlier planned-total formatting | Someday | Presentation-only refinement |
| DATA-001 | Rundown JSON export/import | Done / deployed | `9dcf75d`, `release/data-001-v35`; footer hotfix `409229a` |
| SYNC-001 | Optional Google Drive template sync | Immutable snapshot PoC validated; production NO-GO | DATA-001; isolated SYNC-002C real Drive acceptance; iOS/PWA and production gates open |
| SYNC-002C | Isolated storage/snapshot/Drive integration | Isolated integration PoC validated with real Google Drive | [Owner acceptance and open gates](SYNC-002C_ISOLATED_INTEGRATION.md); no production integration |
| SYNC-003A | Optional Drive integration in the application | Local application integration implemented and owner-validated with real Google Drive. Production NO-GO. | [Owner acceptance and release blockers](SYNC-003A_LOCAL_APPLICATION.md); normal/private Firefox, no physical second-device or iOS acceptance |
| SYNC-003B | Minimal explicit conflict resolution | Functionally accepted in local development with real Google Drive. Production NO-GO. | [Implementation and manual acceptance](SYNC-003B_CONFLICT_RESOLUTION.md); exactly two heads, explicit A / B / Keep Both |
| SYNC-099 | Optional Snapshot Cleanup | Deferred — Someday / Maybe / Very Low | No implementation planned; validated replacement/recovery/offline safety required |
| ST-002 | Executable Session Timer | A and B deployed | B v28 production verified at ead2ad1; see ST-002B record |
| UX-011 | Confirm actions that end an active Rundown | Candidate / owner-reported change request | Audit Quick Timer navigation and all run-ending actions; preserve run on Cancel |
| ST-003 | Live Session editing and workshop statistics | Later | ST-002 runtime, stable phase IDs |
| ADHOC-001 | Independent ad-hoc timebox | Later | Shared timer/session state design |
| QT-002 | More flexible Quick Timer duration controls | Later | Preserve current one-timer simplicity |
| REL-001 | Restore active runs after reload/interruption | Later | Persisted runtime state, recovery rules |
| SIGNAL-001 | Configurable visual/audio signals | Later | Meaningful runtime events |
| PRES-001 | Moderator View + Audience View on one device | Someday (low) | One authoritative timer; two synchronized windows |
| REMOTE-001 | Cross-device timer control/display | Someday / Spike | Separate architecture and security review |
| CUSTOM-001 | Optional presentation customization | Someday | Stable core UI and audience-display requirements |
| INFO-001 | Menu links to standalone information pages | Candidate | Owner-approved copy/content; separate page URLs |
| AI-001 | Image-to-Rundown conversion | Someday (low priority) | DATA-001 portability; separate design/feasibility review |

## INFO-001 — Standalone information pages from the menu

Add a compact row of text links at the very bottom of the universal menu: **About · FAQ · Imprint · Privacy policy**. Prefer four distinct links; consolidation to three needs a later content decision. Each destination must be a normal page with its own stable, directly addressable URL. Use standard page navigation, with browser history, direct links and bookmarking; no overlays, dialogs or popups. Preserve the existing mode/tool/settings hierarchy, keyboard focus and readable responsive wrapping. Support DE/EN consistently with the application. Page contents, final localized labels and exact routes require separate approval; this entry does not implement or authorize the pages. Keep the static, dependency-free architecture and existing timer/storage behavior.

## Session Planner improvements

### PLAN-001 — Insert a phase at a specific position

**Idea:** Add a new phase immediately before/after an existing phase, rather than always appending it at the end and then moving it.

**Desired outcome:** A facilitator can build or adjust a long workshop rundown with minimal unnecessary reordering. Keep stable phase IDs, draft-only changes until Save, accessible controls, and the existing validation/storage rules. The exact UI is undecided; reuse the compact phase interface rather than adding permanent visual clutter.

**Status:** Candidate, not approved for implementation.

### PLAN-002 — Human-readable workshop total

**Idea:** Consider `1 h 50 min` / an appropriate localized form instead of `01:50:00` for *planned total* in the editor or template library.

**Guardrails:** Cosmetic only; never alter minute inputs, duration semantics, calculations, or stored integer seconds. Handle very long workshops (including 100+ hours) and DE/EN cleanly. The clock-like representation is acceptable for now.

**Status:** Someday, low priority.

## Template portability and optional synchronization

### DATA-001 — Rundown JSON export/import

**Delivered scope:** Individual/complete-library JSON downloads, local file validation and explicit review. Single imports open unsaved Editor drafts; bulk imports append independent copies with fresh Rundown/phase IDs using the existing conflict-checked store. Original IDs/names remain visible for collision review; existing records are never replaced or deduplicated. Current Session definitions can be exported from the existing menu without timing changes. See [DATA-001](DATA-001_RUNDOWN_PORTABILITY.md) for file format, limits, safeguards, tests and domain migration.

**Portability sequence:** Manual JSON now; optional Drive synchronization later; AI-assisted image conversion someday, low priority. Browser/profile/origin-local storage remains independent: `easytimer.at` does not inherit `et.rbsnet.at` records. Move JSON files manually and review imports on the destination. No Google login is required.

**Status:** Complete and deployed as `9dcf75d`, tag `release/data-001-v35`; current production `409229a`, shell/CSS v36 and JS v35. Feature branch and rollback `checkpoint/before-data-001` at `fb719f7` are preserved. Native iOS/PWA file handling and VoiceOver remain explicitly documented manual checks. The existing non-atomic simultaneous-tab compare/write limitation remains accepted.

### SYNC-001 — Optional Google Drive synchronization

**Idea:** Eventually let a user access their own workshop templates across devices with Google sign-in and Google Drive storage, without creating an easyTimer-specific server or database. The earlier candidate was a small JSON document via Drive API and Google Identity Services, potentially in `appDataFolder`; the `drive.file` approach is an alternative if user-visible files become important.

**Spike first:** Verify OAuth consent/scopes, app registration/verification requirements, iOS Safari and installed-PWA sign-in flows, token expiry, offline behavior, cross-device conflicts, data recovery, realistic free-tier limitations, and long-term maintenance costs. Do **not** assume that a fully browser-only solution or permanent zero cost is guaranteed. JSON export/import must remain useful without Google sign-in.

**Status:** Immutable snapshots are the tested candidate; the rejected conditional-overwrite strategy is not a safe production basis. [SYNC-002C](SYNC-002C_ISOLATED_INTEGRATION.md) is an **isolated integration PoC validated with real Google Drive**. Owner-operated Firefox tests confirmed first sync with real HTTP 409 and subsequent GET 200, divergent branches in normal/private contexts (3 snapshots, 2 heads, concurrent-content conflict), reload recovery after a simulated lost acknowledgement using GET only, preservation of newer dirty edits and a real authorization-expiry/reconnect condition. The second context was private Firefox on the same device, not another physical device. Automated/mock evidence remains separate in the report.

**SYNC-003A — Local application integration implemented and owner-validated with real Google Drive. Production NO-GO.** See [acceptance, migration boundaries and release blockers](SYNC-003A_LOCAL_APPLICATION.md). The owner created and backed up a real test Rundown, published from normal Firefox, explicitly adopted it in initially empty private Firefox, edited 05:00 to 07:00, synchronized back without conflict and loaded the actual Session Timer READY at 07:00. This is same-device independent-context evidence, not physical second-device, iOS or deployment acceptance. The informal approximately three-second publication observation is not a benchmark.

**Production blockers:** replace the rejected technical migration confirmation with understandable DE/EN UX while retaining validation/readback/rollback safeguards; review safe production migration, packaging and public OAuth/privacy readiness. Actual iOS Safari/installed PWA, physical interruptions, real quota exhaustion and Opera GX rendering remain open. Future bounded identity UX should use official Google authorization, an actual account image when available and name/email in a compact account menu, with restrained header/mobile placement and a clear distinction between connected and synchronized. Evaluate `openid`, `profile`, `email` only under separate review; no additional scopes or account-data processing are approved here. Also review initial empty-library pending status and the connected-state Connect action. The initial false error is fixed; the zero-byte download remains unreproduced.

**SYNC-003B — functionally accepted in local development:** minimal accessible DE/EN A / B / Keep Both decisions for exactly two current snapshot heads with a unique validated common ancestor and live-versus-live Rundown conflicts. No default or automatic winner. Copies receive fresh stable IDs and collision-safe numbered names. A durable reconciliation intent retains the exact immutable ticket; local installation requires verified readback, complete discovery as the sole known head and an unchanged local revision/content. Independent changes and original snapshots remain recoverable. Stale reviews, local unpublished edits, existing tickets and unsupported ancestry/delete-versus-edit/restoration cases stop safely. Automated regressions passed. Owner-operated real Google Drive acceptance passed for A/B/Keep Both, explicit conflict-free reconciliation, live recovery and preservation of the second client's unpublished changes. Both Firefox contexts ended with the same 13:00 + 08:00 library and Synced (last checked). Final local diagnostics showed one valid head, matching base, no dirty changes and no pending tickets; they do not independently verify current remote Drive state. Production remains NO-GO. See [report and owner test](SYNC-003B_CONFLICT_RESOLUTION.md). No version-history UI. Late-offline-edit-as-independent-copy remains deferred and unproven. No production approval.

The accepted transport remains append-only immutable snapshots without automatic cleanup. SYNC-002D1's replacement protocol is not adopted. DATA-001 and local-only operation remain independent.

**Approved targeted SYNC-003B correction:** fully validated conflict-free two-head proposals are now also supported through a complete readonly preview and explicit confirmation, without A/B radio choices or automatic publication. See [implementation and A-first owner acceptance](SYNC-003B_CONFLICT_FREE_RECONCILIATION.md). The recovery path passed automated/synthetic verification and owner-operated real Google Drive acceptance, including recovery of the previously unsupported live state. Content-conflict decisions and pending-ticket/local-revision safeguards remain unchanged.

### SYNC-099 — Optional Snapshot Cleanup

**Priority:** Someday / Maybe / Very Low. **Status:** Deferred — no implementation planned.

Consider safe, criteria-based cleanup of obsolete Google Drive snapshots only if actual snapshot count, age, accumulated storage, API overhead or usability makes it necessary. Do not select fixed retention periods or thresholds now. Never delete snapshots merely because they are old or another file has a newer timestamp. Cleanup requires separately validated replacement, recovery and offline-device safety.

The append-only immutable snapshot architecture remains the accepted approach. SYNC-002D1's checkpoint/receipt replacement protocol was evaluated but is **not adopted**. SYNC-003A contains no cleanup code or scheduling.

## Timer and workshop execution roadmap

The following packages are **already covered in more detail** by the ET-001 decision register in [`EASYTIMER_UX_KONZEPT_v2.md`](EASYTIMER_UX_KONZEPT_v2.md). These entries are navigational reminders, **not a second specification**; check the canonical decisions before planning each epic.

### ST-002 — Run a workshop session

Implement a **Session Run** separate from reusable **Workshop Templates**. Use ordered named phases; manual/automatic phase transitions; large current countdown; subtle next-phase preview; calculated workshop time remaining; final completion and overtime. Define the relationship to the existing Quick Timer and mode switching deliberately. Preserve the single-clock/single-authoritative-state principle.

**Status:** ST-002A and [ST-002B](ST-002B_AUTOMATIC_SESSION_TIMER.md) are deployed and verified at `ead2ad1` (v28), with UX-009/UX-010 and centering. ST-002B provides automatic templates, deadline-based multi-phase catch-up and automatic final overtime. Annotated `release/st-002b` remains at implementation `f6a55e8`; rollback is preserved. Live editing, statistics, reload recovery and active-run transition-mode switching remain future scope.

### UX-011 ? Confirm before ending an active Rundown

**Owner-reported issue / change request:** Selecting Quick Timer from the menu while a Rundown is running can discard the active run and switch modes without a sufficiently clear warning. Treat this as a reported behavior to reproduce during implementation analysis, not a confirmed root cause.

**Required outcome:** Before any action that would end or discard an active Rundown, require an explicit confirmation explaining that consequence. Audit all such entry points, including the Quick Timer menu action, rather than protecting only one button. Cover Manual and Automatic sessions, paused runs and active phase/final overtime where the run would otherwise be lost. Opening the Editor or changing theme/language must not trigger a warning unless the action actually ends the run.

**Draft copy, not final wording:** "This ends the current Rundown." Provide natural DE/EN copy and clear confirm/cancel actions; final wording and button labels require review. Cancel, Escape or dismiss must leave the current Rundown and view intact without resets, hidden running sessions or persistence changes. Elapsed wall-clock time continues according to existing pause/running semantics; the confirmation must not introduce a second timer or silently pause the run. Only explicit confirmation permits the requested destructive transition.

**Acceptance planning:** Reproduce the reported menu case; inspect existing confirmation guards and cover any gaps. Add focused checks for confirm/cancel and every discovered run-ending path, keyboard/focus, DE/EN, Manual/Automatic, paused and overtime states. Preserve stored Rundown definitions and existing draft safeguards. Browser reload/tab-close recovery remains the separate REL-001 concern; this item does not promise custom browser-exit dialogs or cross-reload restoration.

**Status:** Recorded as a change request only; no implementation or release authorized.
### ST-003 — Editing and statistics during a session

Later: edit the current and upcoming phases without stopping the running session, with protected current/completed phases, conflict-safe drafts, per-phase time saved/overrun, workshop totals, and recovery behavior. Follow ET-001 decisions 39–43, 45–48, and 53–56 instead of simplifying them silently.

**Status:** Later; depends on ST-002.

### ADHOC-001 — Independent ad-hoc timer

Temporary timebox that suspends the main session/Quick countdown or overtime according to the previously accepted ET-001 behavior, while keeping its own duration and explicit return/resume controls. Ad-hoc time must not contaminate the workshop total.

**Status:** Later; depends on a clear runtime-state design.

### QT-002 — Optional Quick Timer refinements

Possible **subtraction controls** and/or **manual duration entry** alongside the existing presets/additions. Keep any extra controls contextual and subordinate to the large clock. Do not regress the current deadline/budget/overtime semantics, or reintroduce a cluttered default editor.

**Status:** Later; exact UI and scope still open.

### REL-001 — Durable runtime restoration

Restore running/paused states accurately after reload or browser restart and handle sleep/wake, background throttling, deadlines, workshop overtime, and the four-hour recovery policy as specified by ET-001. Do not replay missed visual/audio events.

**Status:** Later; distinct from already-shipped background-tab accuracy while a page remains open.

### SIGNAL-001 — Visual and audible event signals

Independent visual/audio preferences, with audio off by default, event-specific controls (Quick expiry, ad-hoc, phase transitions, workshop completion), and browser-local persistence. Always keep a textual status. Respect platform audio restrictions.

**Status:** Later; useful once relevant runtime events exist.

## Presentation and remote control

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

## Appearance and customization

### CUSTOM-001 — Lightweight, optional presentation customization

Consider user-configurable colors, progress-bar treatment/visibility, information density, and perhaps limited layout options **after** the essential timer and session behavior stabilizes. Avoid a sprawling settings screen or aesthetic customization for its own sake. Keep Light/Dark/System and DE/EN behavior consistent.

**Status:** Someday, low priority.

UX-008 endgame highlighting is implemented locally and always enabled in both timer modes; it is not a pending customization item. A simple global ON/OFF preference remains an optional later refinement. Threshold percentages/tables, custom warning durations, endgame color pickers, flashing and additional warning levels are not planned as part of UX-008. See the [canonical UX-008 record](EASYTIMER_UX_KONZEPT_v2.md#ux-008--shared-timebox-endgame-highlight-approved-implemented-locally).

## Maintenance of this backlog

- Add only specific ideas that have actually been discussed; avoid speculative feature inflation.
- When an idea is approved, move detailed requirements and acceptance criteria into that increment's plan; leave a short link/status here.
- If implemented, mark the item delivered and point to the commit/release/docs, or archive it rather than continuing to describe it as future work.
- Keep accepted product rules in `EASYTIMER_UX_KONZEPT_v2.md`; avoid copying its full ET-001 decision register here.
- Keep delivered ST-001 functionality separate from future planner improvements; direct insertion at a chosen position (PLAN-001) remains unimplemented.
- Changes to code, branches, commits, pushes, merges, or deployment always require explicit owner approval.
