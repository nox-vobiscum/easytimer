# easyTimer — Project Briefing

**Last reviewed:** 2026-10-23
**Repository:** https://github.com/nox-vobiscum/easytimer  
**Production:** https://et.rbsnet.at/

**Latest deployed ST-001 increment:** [516d939](https://github.com/nox-vobiscum/easytimer/commit/516d939bdd5510d8c2f5bb68b205485c980ee9b4), 2026-10-23, PWA shell v22. Compact phase rows, shared repositioning, new-template first-phase defaults and final popover polish are delivered. Release validation passed 27 unit tests, focused Planner checks and the complete browser regression; the FTP deployment succeeded and served app files matched the tested release. Native iOS Safari/PWA and screen-reader acceptance remains open.

## 1. Current product

easyTimer is a lightweight, dependency-free countdown timer for meetings, workshops, facilitation, and personal timeboxing. The release includes subtle overtime, unified presets, continuous time-budget extensions, and a persistent budget line. Session timing, ad-hoc timing, alarms, and user-configurable presentation settings remain future scope.

The countdown is the dominant element. UX-007 uses two layout families sharing one timer state: Standard (desktop/tablet and smartphone portrait) and Presentation (explicit desktop/tablet fullscreen/fallback and automatic smartphone landscape).

## 2. Implemented behavior

- Select one of eight presets (1, 2, 3, 5, 10, 15, 30, 60 minutes) while ready. Selection does not start the timer.
- Add +1 h, +5 min, +1 min, or +30 s in every state and presentation. The effective budget cannot exceed `99:59:59`; exceeding it gives localized feedback.
- `Start` begins the configured duration.
- `Pause` freezes the exact remaining duration; `Resume` continues from it.
- UX-003 removes the dedicated Restart UI and hides Stop in READY; the shared engine retains RESTART for future use. Stop followed by Start starts the planned duration again.
- `Stop` restores the original configured duration and remains ready.
- Expiry keeps the main display at `00:00`, retains the localized finished status, and shows a smaller overtime counter derived from the original deadline.
- Overtime continues until Stop or New Run. Stop restores the planned duration and remains ready; New Run immediately starts it and clears extensions.
- Zero, blank, fractional, negative, and out-of-range durations are rejected.
- UX-002 configuration presets are hidden while running, paused, or expired, remain hidden after New Run, and return after Stop in standard, native fullscreen, and expanded views. READY presets also appear in automatic mobile landscape. Manual duration entry remains outside scope.
- Adjustment headings follow state: READY uses “Add to duration” / “Dauer ergänzen”; RUNNING and PAUSED use “Extend remaining time” / “Restzeit verlängern”; FINISHED uses “Extend time budget” / “Zeitbudget verlängern”. All four additions remain available. The standard readout is anchored independently of the changing control height.
- Before Start, additions become part of planned duration. After Start, additions extend the effective budget while preserving active elapsed time and pause state. Stop and New Run discard extensions and restore planned duration.
- Adding time in overtime shifts the existing deadline: smaller additions reduce overtime, an exact compensation stays at zero, and larger additions return to countdown. This explicitly supersedes ET-001 decision 37.
- Remaining time and overtime are derived from the deadline. Delayed callbacks and background-tab throttling do not accumulate timer drift.
- A theme, language, orientation, viewport, or presentation change never resets the timer.
- An active countdown is not restored after a complete page reload.

## 3. Interface and responsive behavior

UX-004 adds a dynamic browser tab title: READY uses `easyTimer`; RUNNING uses `04:37 · easyTimer`; PAUSED uses `04:37 ⏸ · easyTimer`; FINISHED uses `+01:23 · easyTimer`. Existing formatters include hours as needed. The render loop writes the title only when its formatted value changes. No extra interval or timer state is introduced; existing visibility/page-show events reconcile deadline-based time after throttling. Installed PWAs require no special behavior.

- Product identity is `easyTimer`, using dedicated standard and dark stopwatch artwork with a matching multi-size favicon.
- Every user-facing string, tooltip, status, and accessible label is available in German and English.
- Light, Dark, and System appearance options are supported. System follows the operating-system preference.
- Language and appearance preferences are stored in browser-local storage.
- UX-006 replaces permanently visible desktop preferences with one shared upper-right hamburger trigger across all widths and presentations. The existing DE/EN and Light/Dark/System controls live in an anchored, safe-area-aware dropdown with separate visible group headings.
- Escape, an outside click, or the trigger closes the menu. Escape restores focus and is handled before application fullscreen/expanded-view exit; other close paths also prevent focus remaining in hidden content. Closed preferences are hidden from display and keyboard navigation.
- The menu and trigger sit outside the standard header, so presentation can hide that header without hiding preferences. Fullscreen exit has a separate 44 px area beside the menu. On short displays the dropdown scrolls internally; open menus remain anchored through resize and rotation.
- Mobile portrait, including installed iPhone PWA presentation, respects display cutouts and safe areas.
- A coarse-pointer device with a short screen side below 600 CSS px is treated as a smartphone; only its landscape viewport automatically activates Presentation. Screen dimensions, not viewport dimensions alone, keep tablet split views Standard. Small tablets, foldables, external displays and unusual browser/zoom reports are documented heuristic edge cases.
- Native Fullscreen API is used where available. A reversible full-viewport fallback is used when fullscreen is unavailable or rejected.
- Every Presentation, including automatic smartphone landscape, shows small branding at the safe top-left edge and the universal menu at top right, without the regular header or footer.
- Desktop/tablet expose a direct Presentation toggle; its exit is a separate bordered 44 px button left of the hamburger. Smartphones hide the toggle in both orientations; rotation never requests native fullscreen.
- The shared stage centers the clock and status above actual preset/control rows. READY accommodates configuration; active and expired runs use the freed space for larger digits. The shared actions, additions, budget and progress remain unchanged. Extreme height constraints allow scrolling instead of inaccessible controls.
- Actions combine SVG icons and localized text when spacious; constrained control bars show icons with full localized accessible names. All four time additions remain directly visible in every view, with values and units always shown. Presets appear only in READY in all views.
- A small safe-area-aware budget line above the progress strip shows Total, or Total · Planned + additions. It is not a live region and updates only when budget values or language change.
- A five-pixel bottom strip shows remaining time in pink and elapsed time in green. It is decorative and is not announced on every timer tick.

## 4. Progressive Web App

easyTimer is installable from supported browsers through `src/manifest.webmanifest`. The manifest declares standalone display, app colors, and 192 px and 512 px icons. An Apple touch icon is included for iOS.

`src/service-worker.js` precaches the same-origin app shell after the first successful online visit. Navigation falls back to the cached index while offline. The cache name is versioned; activating a new version removes older `easytimer-` caches. Service workers require HTTPS or localhost.

Offline reload starts a fresh ready timer because cross-reload timer persistence is outside the current scope.

## 5. Architecture

ST-001 adds the Session Planner as a separate application workspace, reachable from the universal menu without reloading. It manages reusable planning data only; Session Timer execution is not implemented. The Quick Timer instance and deadline-based updates continue while the workspace is open. Explicit fullscreen/expanded presentation is cleared on entry and never restored automatically; smartphone landscape presentation resumes normally when returning to the timer.

`src/js/templates.mjs` provides schema validation, isolated draft cloning, stable-ID reordering and local load/save persistence. `src/js/planner.js` renders the library/editor with German and English labels. Schema version 1 under `easyTimerTemplates` contains templates with `id`, `name`, `transitionMode` and ordered `phases` (`id`, `title`, `durationSeconds`). A future Session Run owns separate execution state, statistics, deadlines and overtime. No runtime data is persisted inside templates.

Names/titles allow 1–120 trimmed characters; at least one phase is required. The compact editor has one minute input per phase, accepting positive integers 1–6,000, and a derived workshop maximum of 60,000 minutes. Storage keeps whole-minute `durationSeconds` values with no legacy migration, fallback or rounding. Totals display full hour counts, including `100:00:00` and `1000:00:00`. Quick Timer limits and timing are unchanged. Save validates before persistence; Cancel/close confirms changed drafts. Deletion is confirmed.

Creating a template seeds only its isolated editor draft with one empty-title phase (UUID, 10 minutes, localized placeholder) before capturing the clean baseline. Focus remains on the workshop name. No automatic persistence occurs. Deleting the row does not recreate it; existing templates are not seeded. Save validation still requires a workshop name, phase title and at least one phase. Focused browser regressions cover initial defaults/identity/localization, validation/save, untouched/reverted/changed cancellation and deletion.

CSS Grid aligns phase number, flexible title, minutes and two 44 px SVG actions (reposition/delete) in one row where space permits. At content widths of 320 px or less, duration/actions wrap below the title with a visible duration label. Full title values remain editable despite unfocused visual truncation. A single shared, nonmodal repositioning popover uses native buttons/select: one-step up/down or explicit Move to a final 1-based position. Boundary steps and unchanged positions are disabled. Reordering only mutates the isolated draft, preserving IDs and values. Focus returns to the phase trigger after a move or Escape; outside focus is respected. The popover is positioned once on open and closes on page scroll/resize rather than tracking geometry continuously. Metadata is side by side where practical; totals remain below the phase list. Existing tokens, responsive timer layouts, sticky dock and footer behavior are preserved. Ordinary typing does not rebuild inputs; language changes restore focus and cursor selection. Phase insertion behavior is unchanged.

Invalid or unsupported stored data blocks writes without deleting records. Read/write errors retain drafts and existing storage. A raw-snapshot optimistic check blocks detected cross-tab conflicts on save/delete; simultaneous writes in the comparison/write window remain a documented localStorage limitation. Reload is explicit and confirms draft loss. Optional JSON export/import can later reuse schema validation with explicit ID-collision decisions; cloud storage and authentication are not included.

Service-worker shell v22 includes both planner modules with versioned URLs. Run `node --test tests/timer.test.mjs tests/templates.test.mjs` and the existing browser regression, including `tests/planner-browser.mjs`. The latter covers localized field-error associations, normalized unsaved-change detection, duplicate template names, stable IDs after full reload, genuine cross-tab storage conflicts, compact responsive layouts and minute/large-total boundaries. Repositioning tests include exact long-list destinations, save/cancel/undo, retained invalid fields, native keyboard selection, emulated touch, focus/dismissal and popover fit across languages/themes. Native iOS Safari/PWA keyboard, position picker, safe-area, fullscreen and screen-reader checks remain explicitly open for final release acceptance on real hardware.

- `src/index.html`: semantic single-timer interface, PWA metadata, header, controls, and progress strip.
- `src/css/styles.css`: design tokens, themes, safe areas, responsive standard and presentation layouts, and universal menu.
- `src/js/timer.mjs`: DOM-independent timer state and transitions.
- `src/js/app.js`: rendering, localization, browser events, fullscreen behavior, responsive presentation, preferences, and service-worker registration.
- `src/manifest.webmanifest`: install metadata and app icon declarations.
- `src/service-worker.js`: versioned offline app-shell cache.
- `tests/timer.test.mjs`: deterministic timer transition and formatting tests.
- `tests/templates.test.mjs`: template validation, isolated drafts, exact-position reordering and storage safeguards.
- `tests/planner-browser.mjs`: Planner creation/edit/save/cancel, initial phase, localization, validation, storage conflicts, responsive layouts and repositioning interactions; invoked by the browser check.
- `tests/browser-check.mjs`: Chromium regression test for UI, timing, accessibility-related geometry, fullscreen/fallback behavior, mobile layouts, PWA registration, and offline reload.

The timer object is the single authoritative state source. It contains status, planned duration (`durationMs`), cumulative post-start additions (`adjustmentMs`), remaining milliseconds, a deadline, and deadline-derived overtime. `timeBudget` derives effective total and elapsed active time (excluding pauses); rendering and browser presentation do not own independent timer state.

## 6. Local development and validation

The application uses native ES modules and must be served over HTTP rather than opened with `file://`:

```sh
python -m http.server 8000 --directory src
```

Run the dependency-free checks with Node.js 22 or newer:

```sh
node --test tests/timer.test.mjs tests/templates.test.mjs
node --check src/js/app.js
node --check src/js/timer.mjs
node --check src/js/planner.js
node --check src/js/templates.mjs
node --check src/service-worker.js
node --check tests/browser-check.mjs
node --check tests/planner-browser.mjs
node tests/browser-check.mjs
```

The browser check uses an installed Chromium-based browser and an isolated temporary profile. On Windows it defaults to Microsoft Edge; `EASYTIMER_BROWSER` can select another Chromium executable.

## 7. Deployment

`.github/workflows/deploy.yaml` deploys pushes to `main` through the existing FTP action. Deployment credentials remain in GitHub secrets. Do not modify the workflow, push, merge, or deploy without separate owner authorization.

The production workflow currently uploads the static repository contents. There is no build step, backend, database, or runtime package installation.

## 8. Language policy

- Product-owner and agent conversation is in German.
- Repository code, comments, documentation, test names, and commit messages are in English.
- German product translation resources are an approved repository exception because the interface supports German and English.

## 9. Product direction

`docs/EASYTIMER_UX_KONZEPT_v2.md` is the canonical product and UX direction. Its 56 ET-001 decisions describe accepted long-term behavior, not current production functionality and not automatic authorization to implement future features.

Future work may include subtraction controls, manual duration entry, session timing, ad-hoc timing, signals, restoration, and customization. Each next feature requires a bounded plan and explicit approval.

[`BACKLOG.md`](BACKLOG.md) tracks discussed future candidates and their status; it does not select or authorize the next increment. The published ST-001 density/reordering and initial-phase improvements are complete, while insertion at a chosen position remains future scope.

## 10. Collaboration workflow

1. Inspect the current branch, worktree, relevant documentation, source files, and available tests.
2. Propose one bounded task with affected files, state implications, risks, model recommendation, and validation.
3. Wait for explicit implementation approval.
4. Keep the patch focused and preserve existing dependencies and deployment infrastructure.
5. Run applicable checks and report changed files, results, unrun tests, and remaining limitations.
6. Stop after the approved task. Commit, merge, push, external-service changes, and production deployment require explicit authorization.


## UX-003 responsive control bar

UX-003 unifies timer actions and additions in one responsive control bar. Wide containers show icons with localized action text and full amounts; constrained containers show action icons with complete accessible names and compact +1h/+5m/+1m/+30s amounts. Contextual adjustment headings remain semantic group labels and are visually hidden in compact layouts. Touch targets stay at least 44 px; groups wrap only when necessary. Presets remain a separate READY-only group in every view. Timer calculations, overtime, budgets, progress, and dynamic tab titles are unchanged. No extra settings or dependencies are introduced.
