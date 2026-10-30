# ST-002A — Session Timer Preparation and Scope Proposal

**Follow-up:** The owner-accepted [ST-002B implementation](ST-002B_AUTOMATIC_SESSION_TIMER.md) now enables Automatic templates while preserving the historical Manual contract below. Implementation `f6a55e8` is locally integrated and tagged `release/st-002b` (v28). The owner has separately authorized publication through the existing FTP workflow; successful deployment still requires verification.

**Date:** 2026-10-23
**Status:** Provisionally accepted after final review. Local release commit, integration into local `main` and annotated `release/st-002a-ux008` checkpoint authorized on 2026-10-24. No push/deployment authorization.
**Baseline:** `bb814c645fc855c191328776d6941a494cd55fdd` (accepted ST-001 plus documentation).
**Local checkpoint:** annotated `checkpoint/st-002-before-session-timer`.
**Local branch:** `feature/st-002-session-timer`, created exactly at the checkpoint.

The [canonical UX concept](../../EASYTIMER_UX_KONZEPT_v2.md#7-et-001-decision-register--approved-long-term-target-not-mvp-requirements) remains authoritative. The owner approved this first-increment scope, including the four decisions in section 6. It neither replaces the 56 decisions nor authorizes later work. [The backlog](../../backlog.md) tracks optional initiatives without duplicating that register. The text below retains the analysis rationale; implementation status is recorded at the end.

## 1. Verified baseline and ST-001 closure

Local `main`, `origin/main`, the old density/reordering branch and its remote ref all matched the baseline above. There were no outstanding commits or file differences and the working tree was clean. No merge was needed. The obsolete local `feature/st-001-density-reordering` branch was safely deleted after verification and passing tests; its remote branch and all pre-existing checkpoint tags were retained.

The functional release is `516d939`; `bb814c6` adds documentation only. The owner confirms acceptance and production verification. Automated closure checks passed 27/27 Node unit tests and the complete Chromium browser regression, including Planner, Quick Timer, PWA/offline, responsive views, focus, themes and localization. Native iOS Safari/PWA and screen-reader checks were not rerun or claimed complete; their prior manual-check record remains open.

No push, deployment, history rewrite or ST-002 runtime change is part of this preparation.

## 2. Findings at the ST-001 baseline

- `app.js` owns one `timer`, one 100 ms refresh interval, and visibility/page-show reconciliation. There is no Quick/Session mode selection or active-mode-switch confirmation implementation yet. ET-001 decision 3 must be implemented, not presumed already present.
- `timer.mjs` is DOM-independent and derives countdown/overtime from deadlines. Its current `PAUSE` only handles RUNNING; expired phases cannot currently freeze overtime. Quick expiry always keeps accumulating, intentionally.
- A phase may contain 6,000 minutes (`360000000` ms), but `createTimer` rejects values above `359999000` ms. This one-second boundary difference is real. Session execution must accept every valid template phase while preserving Quick Timer limits. A workshop may total 1,000 hours and must not be passed to the Quick Timer factory as one countdown.
- The template store validates and clones schema-version-1 data and detects optimistic storage conflicts. The Planner's draft, persistence and view navigation are separate from the current timing engine. Opening the Planner currently leaves Quick Timer running and predictably exits explicit fullscreen.
- Existing render/status/primary-action, additions, progress, budget and browser-title logic assumes Quick Timer semantics. In particular, FINISHED currently offers a new Quick run; a manual Session phase in overtime must instead remain on its phase until explicit advance/completion.
- The current service worker caches the app shell at v22. Documentation-only preparation does not require a cache bump.

## 3. Recommended first vertical slice

Recommend **manual Session execution first**, with deadline-based phase and final overtime included. Automatic transitions, detailed statistics, runtime editing and reload recovery follow separately.

Automatic execution adds multi-phase catch-up across throttling, pause boundaries, completion and later mode changes. It is independently testable and can follow in ST-002B. Manual phase overtime cannot safely be deferred while allowing a phase to expire: decisions 12, 32, 48 and 52 already define what users should see and how Pause/Resume must behave. Final completion likewise needs decisions 8, 9 and 51, rather than silently stopping at zero or starting a new phase automatically.

### Proposed user stories and acceptance criteria

| Story | Acceptance criteria for ST-002A |
| --- | --- |
| Choose a saved workshop | A localized Session Timer entry opens a small template picker. Empty, unreadable or invalid storage has actionable feedback and cannot start an invalid run. No storage write occurs. Under the recommended manual-only scope, automatic templates are clearly identified as unsupported for execution in A; they are never silently converted. |
| Prepare an isolated run | Selecting a supported template makes an in-memory snapshot with a fresh run ID, source template ID, stable phase IDs, copied titles/durations and manual transition policy. Phase 1 is READY at its full duration. Initial selection never starts a clock. |
| Run and pause a phase | Start, Pause and Resume use the shared engine and retain fractional timing. Expiry shows primary `00:00` plus smaller `+00:00` and growing phase overtime. Pause freezes countdown or phase overtime; Resume continues without including paused time. |
| Understand the workshop | Show current phase title, `Phase n of N`, subtle next-phase preview, and workshop remaining. Remaining equals current remaining plus all future planned durations, without subtracting phase overtime or carrying unused time forward. |
| Advance deliberately | Next Phase settles the current phase, records its overtime if any, discards unused countdown and prepares the next phase at full duration in READY. It never starts automatically, even after delayed callbacks or a paused source phase. Stable IDs and saved templates remain unchanged. |
| Finish the workshop | On the last manual phase, expiry alone does not complete the workshop. An explicit Complete Workshop action switches to a distinct COMPLETED stage with primary `00:00` and final overtime starting at zero. The final phase's overtime is settled separately. Final overtime supports Pause/Resume and terminal Stop overtime; stopping freezes the final value and subsequent ticks do not restart it. |
| Stop safely | Stop Workshop asks for confirmation, then restores the run snapshot to phase 1 READY and clears runtime overrun data. Cancel preserves the active run, with naturally elapsed time reconciled. It never mutates or reloads the source template. |
| Switch safely | Quick/Session switching while running or paused confirms first (decision 3). Recommended additional protection covers advancing overtime, stopped final overtime and a progressed run between phases before discarding it. Confirmed departure ends/resets the source run; the destination is READY or the empty picker, never auto-started. Cancelling keeps the source. The exact discard policy needs owner approval below. |
| Keep current presentation conventions | DE/EN, Light/Dark/System, dynamic title, Standard/Presentation, phone orientation, safe areas, universal menu and 44 px targets work without resetting state. No dual-display view, session duration-adjustment controls or dashboard is introduced. |

Useful numeric examples: with phase A at `02:00` remaining and a future 5-minute phase, workshop remaining is `07:00`. Next immediately gives phase B READY at `05:00`. If phase A is `+00:45` overdue, workshop remaining is still `05:00`; its 45 seconds of overtime remain separate.

## 4. State ownership and timing

Use a small DOM-independent `session.mjs` coordinator above the existing timing engine. It selects phases and derives workshop context; it does not implement another elapsed-time algorithm or interval.

The application state owns the active mode, view, **one live clock**, the Quick planned-duration configuration, and optionally a Session Run. A run contains a fresh `runId`, source template ID, copied workshop name and ordered phases, current phase index, stage (`PHASE` or `COMPLETED`) and minimal settled phase-overrun records keyed by phase ID. The source-template ID is provenance, not a live binding; later template edits/deletion do not change an active run. Phase clock identity and current phase index are updated atomically.

Keep the live clock in one place. Session metadata must not hold a competing clock copy. Future-phase durations are configuration; workshop remaining is a derived sum, not another countdown. Quick configuration can be retained while a Session runs, but no hidden Quick deadline may keep ticking. Only the active clock receives the existing interval/visibility/page-show updates.

State transitions proposed for a manual run:

| Current stage | Action/event | Result |
| --- | --- | --- |
| Picker | Choose supported template | Phase 1 READY; no automatic start |
| Phase READY | Start | Phase RUNNING with deadline |
| Phase RUNNING | Pause | Frozen countdown |
| Paused countdown | Resume | Deadline rebuilt from frozen remaining |
| Phase RUNNING | Deadline reached | Phase overtime; same phase, zero main display |
| Phase overtime | Pause / Resume | Freeze / continue overtime from its frozen value |
| Any phase state except last | Next | Settle prior phase; next phase READY at full duration |
| Last phase | Complete Workshop | Settle phase; COMPLETED with final overtime starting at the explicit completion instant |
| COMPLETED overtime | Pause / Resume | Temporary freeze / continue |
| COMPLETED overtime | Stop overtime | Terminal frozen value; no automatic resume |
| Any prepared run | Confirm Stop Workshop | Phase 1 READY; runtime overrun records cleared |

Each action first reconciles the clock at its supplied `now`. A manual session never skips phases because a callback was late. Final overtime begins at explicit completion, not at the earlier last-phase expiry; that prior interval belongs to phase overtime. Basic per-phase/cumulative overrun values required by decision 13 are retained in memory; a statistics screen, saved results and savings/net-variance reporting are deferred.

The engine needs narrowly scoped, explicit support for freezing/resuming overtime and starting/stopping a final-overtime segment. Session-only actions must not change the existing Quick `PAUSE`, expiry, additions or Stop semantics. Its phase-duration validation needs an explicit Session policy accepting up to 6,000 minutes and preserving that policy through Start/Stop/restart operations; the default Quick policy stays 99:59:59. Final implementation shape should remain small and deterministic, with no generic state-machine framework.

Use `Date.now()` as the injected wall-clock source, matching current engine behavior and tests. Open-page throttling and sleep/wake are reconciled from deadlines; paused states remain frozen. Cross-reload restoration remains absent and must be disclosed. System wall-clock changes remain the existing wall-clock limitation, not a new drift-correction project.

Mode switching is distinct from opening the Planner. Planner navigation is a view change and must leave whichever clock is active running, while preserving the accepted fullscreen-exit behavior. A run reads templates through the existing validation/store and never saves runtime fields to `easyTimerTemplates`. A template selection failure cannot partially replace an existing run.

## 5. Approved target versus increment boundaries

| ET-001 target | Proposed delivery boundary |
| --- | --- |
| Confirmation/no automatic destination start (3), manual advance/remaining (5–6), next preview (32) | ST-002A |
| Manual phase overtime, separation and pause (12–13, 32, 48, 52) | ST-002A; minimal overrun bookkeeping only |
| Explicit manual completion, final overtime and pause/terminal stop (8–9, 51–52) | ST-002A |
| Background/sleep correction, paused clocks (22–23) | ST-002A for an open page; automated deadline-gap coverage |
| Automatic seamless transitions and catch-up (7, 22, 33, 56) | ST-002B; preserve scheduled deadlines across phase boundaries, no signal replay |
| Explicit Restart Phase/Restart Workshop (10, 15) | ST-002B candidate; A has confirmed Stop Workshop then Start |
| Savings, net variance, detailed statistics (14–15) | Later; preserve separation from overtime |
| Runtime editor/conflicts and extension after completion (39–43, 45–47, 53, 55–56) | Later; no runtime editing interface in A |
| Reload restoration, four-hour recovery and rewind (24–29, 34, 54) | Later reliability increment; not approximated by inactivity |
| Ad-hoc, signals and related event gates | Separate later increments |
| Moderator/Audience or cross-device control | Separate backlog items; no implementation in A/B |

These are proposed staging boundaries, not changes to the accepted long-term semantics. Automatic templates remain valid and editable in the Planner even if first-slice execution is manual-only.

## 6. Owner-approved scope decisions

1. **Manual-only A approved:** Clearly disable automatic-template execution with a localized reason. Automatic templates remain valid/editable; A never silently runs them manually and introduces no per-run override.
2. **Mode departure approved:** Confirm discarding/resetting active run progress, retain Quick configured duration, no resumable hidden Session and no parallel active clock. Overtime and progressed READY phases also require confirmation. The destination never auto-starts; cancel retains the source, reconciled for actual elapsed time.
3. **Early completion approved:** Complete Workshop may finish the last phase before zero, discarding its unused time consistently with manual Next. Completion remains explicit even for a last phase that already expired.
4. **Context and controls approved:** Phase-local progress strip with unchanged geometry/colors/docking, bottom workshop remaining and phase count. Hide Quick presets/additions in Session. No workshop-wide percentage, statistics panel or runtime duration adjustment in A.

Phase/final overtime and their pause/stop semantics are already approved targets; the question is whether to include the coherent manual behavior in A, not whether to redefine it. Completing a stopped final overtime segment does not reset it or resume it; a new run requires explicit preparation/reset.

## 7. Files and validation after implementation approval

Expected application files: new `src/js/session.mjs`; `src/js/timer.mjs` for explicit timing capabilities/policy; `src/js/app.js` for one active mode/state and event routing; `src/index.html` and `src/css/styles.css` for the picker, minimal Session context and controls. Keep `planner.js`/`templates.mjs` behavior and stored schema intact; change them only if a concrete, approved integration need appears. The active-session template snapshot isolates existing Planner writes automatically.

Expected tests: new `tests/session.test.mjs`, focused additions to `tests/timer.test.mjs`, a small `tests/session-browser.mjs` integrated with `tests/browser-check.mjs`; retain the complete template/Planner regression. Update `src/service-worker.js`, cached module imports and HTML resource versions together when implementation assets change. Update README/briefing with delivered scope only after approval/implementation; no workflow/infrastructure changes.

The engine import and worker cache entry currently use unversioned `timer.mjs`. Because A would change its API, version that import/cache URL together with the new Session module and other release resources; do not let new application code receive the old cached engine during worker activation. Extend the existing stale-resource/offline regression to cover this concrete boundary.

Deterministic unit coverage must include snapshot isolation, stable IDs, missing/invalid templates, exact expiry, long callback gaps, pause before/after expiry, frozen overtime resume, early Next without carry, last-phase non-completion at zero, explicit completion and its separate deadline, terminal Stop overtime, confirmed/cancelled Stop/switch, and limits (6,000-minute phase, 60,000-minute workshop, unchanged Quick rejection above 99:59:59). One live clock and invalid-action safety need invariants. If automatic behavior moves into A, add multi-phase catch-up before approval rather than relying on interval frequency.

Browser checks must exercise the full picker → prepare → start → pause/resume → phase overtime → Next → final completion → final overtime stop → Quick return flow; no duplicate IDs or hidden focusable controls; confirmations and cancel; DE/EN, all themes, long phase names, desktop/tablet split view, 320 px portrait and short phone landscape; dynamic titles, workshop sums, phase strip and native fullscreen/fallback; background reconciliation and PWA offline app-shell behavior. Existing Quick/Planner tests must stay green. Real iOS Safari/PWA, native controls, safe areas and screen-reader acceptance remain separately documented manual checks.

## 8. Risks, simplifications and model

Primary risks are accidental Quick-engine behavior changes, conflating phase expiry with workshop completion, duration-boundary rejection, duplicate active clocks, and presenting manual-only execution as support for automatic templates. Mitigate through explicit policies/actions, one clock, a run snapshot and boundary tests. Native confirmation dialogs block JavaScript; after returning, reconcile wall-clock time rather than pretending the dialog paused it. Preserve predictable focus and existing fullscreen transitions for picker/Planner navigation.

Avoid live template bindings, persistence migrations, complex routing, a second interval, statistics dashboards and future editor abstractions. Manual-only execution is the main simplification, with the restrictions disclosed. No new mandatory dependencies, backend, database, cloud service or paid infrastructure.

Recommended coding model: **GPT-6.1 Sol, medium reasoning**, as an engineering judgement for a bounded but cross-cutting state/engine integration. This follows [official model-selection guidance](https://developers.openai.com/api/docs/guides/model-selection) for complex technical work where time/cost matter. A smaller model is suitable for later isolated copy/CSS work, not the initial state-contract integration.

## 9. Local implementation and stop point

The implementation follows the approved manual slice: `app.js` owns one nullable clock, Quick configuration and separate Run metadata; `session.mjs` coordinates the shared engine, with no second interval. The engine retains Quick defaults and adds an explicit Session duration policy and dedicated overtime actions. Planner exposes its existing guarded close operation for mode navigation; ordinary opening without native fullscreen remains synchronous. Templates/schema/storage rules are unchanged. The picker handles absent/invalid/inaccessible data and visibly excludes automatic execution. New tests cover the approved domain and browser flows, including offline Session preparation and loss of active runtime after reload. Initial local ST-002A validation used shell v23; the separately approved shared UX-008 visual enhancement now uses v24, without modifying this Run/clock behavior.

Actual local verification on 2026-10-23: 38/38 Node tests passed; focused Session browser checks and the full existing/extended browser regression passed; modified/new JavaScript syntax checks and diff whitespace checks passed. Temporary screenshots were reviewed for 320 px portrait and short smartphone landscape with long phase titles. The complete suite retains Planner cross-tab conflict tests, Quick deadline/addition semantics, native-fullscreen simulation/fallback, PWA offline and frozen-tab checks. These results do not claim native iOS or screen-reader verification.

The initial implementation authorization excluded commits, pushes, remote-branch deletion, deployment and ST-002 merges to `main`. Following final review, the owner separately authorized local release preparation (commit, local `main` integration and annotated release tag) on 2026-10-24. The original rollback checkpoint remains unchanged; push/deployment are still excluded. Real iOS Safari/PWA/native-picker and screen-reader checks remain manual acceptance limitations; automatic transitions, runtime editing/statistics, recovery and other later stories are not implemented.

## 10. Approved Session hierarchy refinement (2026-10-24)

Workshop identity, current phase title and phase index form the top context. The countdown remains dominant; workshop remaining and the restrained contextual upcoming-phase button occupy the bottom dock, left/right on desktop and stacked on narrow phones. This is the same `#next` control and advance handler, moved out of the central actions; its full localized accessible name retains truncated titles. The last phase explicitly offers Complete workshop, while completed runs hide and disable advance. Final overtime controls remain unchanged. Short landscape uses a compact context row without changing Standard/Presentation classification. PWA shell v25 updates all matching references. No timing, template, persistence or virtual-time infrastructure changes are included; the focused browser checks reuse DEV-001's test clock for deterministic screenshots. Owner visual review and separate release authorization remain required.

Verification on 2026-10-24: 51/51 unit tests, the focused Session browser checks and the full Quick/Planner/Session/UX-008/PWA browser regression passed. Focused coverage verifies the full upcoming title/accessible name, a single contextual action, Enter/Space and emulated touch activation, next-phase READY/full duration/focus, explicit last-phase completion, disabled/hidden completed advance, long titles, DE/EN, all themes and responsive dock geometry. An initial 844x390 overlap was corrected with the compact Session landscape context and reduced local spacing; final geometry checks passed. Existing DEV-001 commands generated ten Light/Dark screenshots for running, paused endgame, phase overtime, final overtime and stopped final overtime; deterministic Session browser captures additionally cover READY, last-phase READY, narrow portrait, smartphone landscape and explicit Presentation. Screenshots remain in temporary output directories, outside production assets. JavaScript syntax and whitespace checks passed. Real iOS Safari/PWA safe-area/touch and screen-reader acceptance remain manual; no release actions were taken.

## 11. Local release preparation (2026-10-24)

The owner provisionally accepted ST-002A, UX-008, DEV-001 and the Session hierarchy after final review, then separately authorized a local release commit, integration into local `main` without rewriting history, and annotated tag `release/st-002a-ux008`. Preserve the feature branch and original `checkpoint/st-002-before-session-timer`. A fresh `git fetch origin` confirmed the expected remote baseline `bb814c645fc855c191328776d6941a494cd55fdd` with no upstream divergence. Final preparation again passed 51/51 unit tests and the complete browser regression. The final review also corrected an old-document race in the offline reload test, then passed five focused consecutive offline Session reloads. Production application behavior was unchanged by that test correction.

The release inventory includes all approved new source/test/documentation files and the case-only `docs/BACKLOG.md` to `docs/backlog.md` rename. Generated screenshots and browser profiles remain outside the repository; no credentials or production debug clock controls are included. PWA shell/import/cache references consistently use v25. The unchanged FTP workflow deploys a push to remote `main`; local commits, branch integration and tags do not trigger it. Publishing `main` or the release tag requires separate owner authorization. Do not change hosting, DNS or `easytimer.at`. Real iOS Safari/PWA and screen-reader checks remain open for final release acceptance; ST-002B is not authorized.
