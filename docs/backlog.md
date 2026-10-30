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

Delivered work is recorded in the [changelog](../CHANGELOG.md) and the linked active or archived implementation records. In particular, INFO-001 and the v60 baseline, UX-018 in v61, and UX-011 in v62 are verified production releases. Earlier delivered Session Editor, Session Timer, recovery, navigation and subtraction increments are ancestors of the verified v60 production release. They are not future backlog items.

| ID | Idea | Priority | Main dependency / note |
| --- | --- | --- | --- |
| PLAN-001 | Insert a new phase directly at a chosen position | Candidate | Compact Session Planner finalized |
| PLAN-002 | Friendlier planned-total formatting | Someday | Presentation-only refinement |
| SYNC-001 | Optional Google Drive template sync | Immutable snapshot PoC validated; production NO-GO | DATA-001; isolated SYNC-002C real Drive acceptance; iOS/PWA and production gates open |
| SYNC-002C | Isolated storage/snapshot/Drive integration | Isolated integration PoC validated with real Google Drive | [Owner acceptance and open gates](archive/investigations/SYNC-002C_ISOLATED_INTEGRATION.md); no production integration |
| SYNC-003A | Optional Drive integration in the application | Local application integration implemented and owner-validated with real Google Drive. Production NO-GO. | [Owner acceptance and release blockers](archive/implementation/SYNC-003A_LOCAL_APPLICATION.md); normal/private Firefox, no physical second-device or iOS acceptance |
| SYNC-003B | Minimal explicit conflict resolution | Functionally accepted in local development with real Google Drive. Production NO-GO. | [Implementation and manual acceptance](archive/implementation/SYNC-003B_CONFLICT_RESOLUTION.md); exactly two heads, explicit A / B / Keep Both |
| SYNC-099 | Optional Snapshot Cleanup | Deferred — Someday / Maybe / Very Low | No implementation planned; validated replacement/recovery/offline safety required |
| UX-015 | Timer View Typography & Information Hierarchy | Later — visual polishing | Reuse UX-013 utility labels; preserve timer semantics and minimal presentation views |
| UX-017 | Recovery Candidate Management | Future UX refinement | Explicit management of obsolete runtime candidates; protect meaningful Runs and active ownership |
| ST-003 | Live Session editing and workshop statistics | Later | ST-002 runtime, stable phase IDs |
| ADHOC-001 | Independent ad-hoc timebox | Later | Shared timer/session state design |
| QT-002 | Optional manual Quick Timer duration entry | Later | Subtraction and contextual controls are delivered; preserve current one-timer simplicity |
| REL-001 | Remaining runtime recovery hardening | Later | REL-001A/B are deployed; real-device and four-hour-policy UX remain open |
| SIGNAL-001 | Configurable visual/audio signals | Later | Meaningful runtime events |
| PRES-001 | Moderator View + Audience View on one device | Someday (low) | One authoritative timer; two synchronized windows |
| REMOTE-001 | Cross-device timer control/display | Someday / Spike | Separate architecture and security review |
| LIVE-001 | Shared Live Timer & Remote Control | Low / Someday-Maybe | After current UX, sync productization and production-release priorities; related to REMOTE-001, separate from Drive backup/sync |
| CUSTOM-001 | Optional presentation customization | Someday | Stable core UI and audience-display requirements |
| AI-001 | Image-to-Rundown conversion | Someday (low priority) | DATA-001 portability; separate design/feasibility review |

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

### ST-003 — Editing and statistics during a session

Later: edit the current and upcoming phases without stopping the running session, with protected current/completed phases, conflict-safe drafts, per-phase time saved/overrun, workshop totals, and recovery behavior. Follow ET-001 decisions 39–43, 45–48, and 53–56 instead of simplifying them silently.

**Status:** Later; depends on ST-002.

### ADHOC-001 — Independent ad-hoc timer

Temporary timebox that suspends the main session/Quick countdown or overtime according to the previously accepted ET-001 behavior, while keeping its own duration and explicit return/resume controls. Ad-hoc time must not contaminate the workshop total.

**Status:** Later; depends on a clear runtime-state design.

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

### UX-015 — Timer View Typography & Information Hierarchy

**Priority:** Later — visual polishing, not part of UX-013. **Status:** Future requirement only; no implementation authorized. No existing dedicated timer-view typography item was identified; CUSTOM-001 remains separate optional user customization.

**Goal:** Extend UX-013's restrained RBS-inspired utility-label language to Quick Timer and Session Timer, improving information hierarchy and consistency without unnecessary UI elements. The large countdown remains the undisputed visual focus.

**Session Timer — upper information area:** Review workshop name, current phase name and phase progress together. Treat the workshop name as secondary context, the current phase name as the principal contextual heading, and progress such as “Phase 1 von 3” as a subtle uppercase utility label. Avoid three equally weighted elements stacked above the countdown.

**Session Timer — lower information area (specific owner direction):** The two areas immediately above the existing workshop progress bar use the same intentional two-line pattern:

| Area | First line: subtle utility label, visually uppercase | Second line: more prominent actual value/title |
| --- | --- | --- |
| Left: workshop remaining time | DE: WORKSHOP-RESTZEIT; EN: WORKSHOP REMAINING | Remaining time, e.g. `20:00` |
| Right: upcoming phase | DE: ALS NÄCHSTES; EN: UP NEXT | Upcoming phase title, e.g. `Discussion` |

Use localized mixed-case semantic text with uppercase applied through CSS, reusing the same small, semibold, subtly letter-spaced utility style from UX-013. Clearly distinguish labels from values. Align both areas cleanly above the progress bar with balanced spacing rather than rigid column symmetry; keep them compact and unobtrusive. Preserve existing next-phase navigation and its arrow, including the existing state/mode-specific behavior. Handle long phase titles, unavailable next phases and narrow screens gracefully. No extra boxes, cards, borders or decoration. Do not change the meaning or calculation of remaining time, overtime or progress.

**Quick Timer:** Explore consistent treatment for Countdown, duration selection and duration extension controls wherever it improves clarity. Avoid additional headings without a useful informational purpose.

**Design and acceptance boundaries:** Reuse existing fonts, theme colors and design tokens; avoid excessive uppercase, new dependencies or a broad design-system refactor. Support DE/EN, Light/Dark, desktop, mobile, fullscreen and mobile landscape. Preserve the deliberately minimal fullscreen/landscape layouts. This is visual polish only: no timer calculations, workshop progress, overtime behavior, phase transitions, navigation or persistence changes. Implementation and visual acceptance require separate owner approval.

**Additional owner observation — small-landscape menu overlap (future visual refinement only):** During local Google Account Header acceptance at 667 x 375 CSS pixels, the hamburger menu overlapped the underlying recovery selection and partially obscured the timer. The owner accepted account access and the scrollable panel as functionally sufficient; this was not a reported functional failure. Review compact menu placement and recovery/timer visibility in a separately approved visual pass, preserving accessible actions, scrolling, focus, recovery decisions and timer behavior. No implementation is authorized here; this observation is outside the Google Account Header checkpoint.

### CUSTOM-001 — Lightweight, optional presentation customization

Consider user-configurable colors, progress-bar treatment/visibility, information density, and perhaps limited layout options **after** the essential timer and session behavior stabilizes. Avoid a sprawling settings screen or aesthetic customization for its own sake. Keep Light/Dark/System and DE/EN behavior consistent.

**Status:** Someday, low priority.

UX-008 endgame highlighting is implemented locally and always enabled in both timer modes; it is not a pending customization item. A simple global ON/OFF preference remains an optional later refinement. Threshold percentages/tables, custom warning durations, endgame color pickers, flashing and additional warning levels are not planned as part of UX-008. See the [canonical UX-008 record](EASYTIMER_UX_KONZEPT_v2.md#ux-008--shared-timebox-endgame-highlight-approved-implemented-locally).

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
- Keep delivered ST-001 functionality separate from future planner improvements; direct insertion at a chosen position (PLAN-001) remains unimplemented.
- Changes to code, branches, commits, pushes, merges, or deployment always require explicit owner approval.
