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

The ST-001 density/reordering, initial-phase default and final repositioning-popover polish shipped in [commit 516d939](https://github.com/nox-vobiscum/easytimer/commit/516d939bdd5510d8c2f5bb68b205485c980ee9b4) on 2026-10-23 (PWA shell v22). They are delivered functionality, not pending backlog items. Native iOS Safari/PWA and screen-reader acceptance checks remain open as documented in the [README](../README.md#st-001-session-planner).

| ID | Idea | Priority | Main dependency / note |
| --- | --- | --- | --- |
| UX-009 | Unified positive overtime readout | Implemented; release approved | Replaces UX-008 dual readout; thresholds unchanged; v26 |
| UX-010 | Smartphone landscape Clock-only | Implemented; release approved | Temporary tap/keyboard view; no preference or timer-state change; v26 |
| PLAN-001 | Insert a new phase directly at a chosen position | Candidate | Compact Session Planner finalized |
| PLAN-002 | Friendlier planned-total formatting | Someday | Presentation-only refinement |
| DATA-001 | Export/import workshop templates as JSON | Candidate | Existing template schema and validation |
| SYNC-001 | Optional Google Drive template sync | Later / Spike | DATA-001; Google identity, OAuth, mobile PWA feasibility |
| ST-002 | Executable Session Timer | A deployed; B implemented locally | Automatic scheduled-boundary catch-up approved; unreleased v28; see ST-002B record |
| ST-003 | Live Session editing and workshop statistics | Later | ST-002 runtime, stable phase IDs |
| ADHOC-001 | Independent ad-hoc timebox | Later | Shared timer/session state design |
| QT-002 | More flexible Quick Timer duration controls | Later | Preserve current one-timer simplicity |
| REL-001 | Restore active runs after reload/interruption | Later | Persisted runtime state, recovery rules |
| SIGNAL-001 | Configurable visual/audio signals | Later | Meaningful runtime events |
| PRES-001 | Moderator View + Audience View on one device | Someday (low) | One authoritative timer; two synchronized windows |
| REMOTE-001 | Cross-device timer control/display | Someday / Spike | Separate architecture and security review |
| CUSTOM-001 | Optional presentation customization | Someday | Stable core UI and audience-display requirements |

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

### DATA-001 — Template JSON export/import

**Idea:** Export the template library, or selected workshop templates, as portable JSON and import them on another browser/device. This is also an independent backup route.

**Acceptance questions:** Validate imported data using the canonical schema; reject malformed/unsupported content without destroying existing templates; decide stable-ID collisions, duplicates, append/replace behavior, and confirmations explicitly. No hidden synchronization or account requirement. Keep first release small.

**Status:** Candidate; potential independent increment before or after initial Session Timer runtime.

### SYNC-001 — Optional Google Drive synchronization

**Idea:** Eventually let a user access their own workshop templates across devices with Google sign-in and Google Drive storage, without creating an easyTimer-specific server or database. The earlier candidate was a small JSON document via Drive API and Google Identity Services, potentially in `appDataFolder`; the `drive.file` approach is an alternative if user-visible files become important.

**Spike first:** Verify OAuth consent/scopes, app registration/verification requirements, iOS Safari and installed-PWA sign-in flows, token expiry, offline behavior, cross-device conflicts, data recovery, realistic free-tier limitations, and long-term maintenance costs. Do **not** assume that a fully browser-only solution or permanent zero cost is guaranteed. JSON export/import must remain useful without Google sign-in.

**Status:** Later / architecture spike. Not a prerequisite for ST-002.

## Timer and workshop execution roadmap

The following packages are **already covered in more detail** by the ET-001 decision register in [`EASYTIMER_UX_KONZEPT_v2.md`](EASYTIMER_UX_KONZEPT_v2.md). These entries are navigational reminders, **not a second specification**; check the canonical decisions before planning each epic.

### ST-002 — Run a workshop session

Implement a **Session Run** separate from reusable **Workshop Templates**. Use ordered named phases; manual/automatic phase transitions; large current countdown; subtle next-phase preview; calculated workshop time remaining; final completion and overtime. Define the relationship to the existing Quick Timer and mode switching deliberately. Preserve the single-clock/single-authoritative-state principle.

**Status:** ST-002A is deployed; the current production baseline is `7f6f9c0` with UX-009/UX-010 and centering (v27). [ST-002B](ST-002B_AUTOMATIC_SESSION_TIMER.md) is accepted for local release preparation: automatic templates, deadline-based multi-phase catch-up and automatic final overtime (v28). Local commit, integration and annotated `release/st-002b` are authorized; push/deployment require separate approval. Live editing, statistics, reload recovery and active-run transition-mode switching remain future scope.

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
