# easyTimer

A small, dependency-free countdown timer for meetings and personal timeboxing.

The release includes QT-001 overtime, UX-001 continuous time-budget extensions, contextual controls, the universal menu, and the UX-007 responsive timer stage.

ST-001 adds a local Session Planner workspace for reusable workshop templates. It does not execute sessions or introduce a Session Timer mode.

## Release baseline and approved update

DATA-001 is complete, owner-accepted and deployed as `9dcf75d8adec963209d58a9d00af4ad05e2567e7`, annotated tag `release/data-001-v35`. [FTP deployment 40132478801](https://github.com/nox-vobiscum/easytimer/actions/runs/40132478801) succeeded; all 18 served source files matched the release Git blobs, and isolated production Picker and portability checks passed. The subsequent footer-only hotfix `409229ae428d9cdea41306a91a2a47984a857ec2` is the current production baseline; [deployment 40132780761](https://github.com/nox-vobiscum/easytimer/actions/runs/40132780761) and focused production footer checks passed. Shell/CSS use v36; unchanged JavaScript modules retain v35. Footer links have no underline and retain visible keyboard focus.

The [ST-002B automatic Session increment](docs/ST-002B_AUTOMATIC_SESSION_TIMER.md), implementation `f6a55e8`, is deployed with annotated `release/st-002b`; rollback `checkpoint/before-st-002b` is preserved. The menu/Session Editor release is deployed with annotated `release/menu-editor-v31`; rollback `checkpoint/before-menu-editor` is preserved. The Rundown entry and DATA-001 releases below are deployed.

UX-004: the browser tab title shows remaining time while running, adds a pause marker while paused, and shows signed overtime after expiry. READY uses `easyTimer`. Existing deadline-based updates correct the title when browser execution resumes; background updates can be throttled by the browser.

- One timer with Start, Pause, Resume, New Run and Stop. UX-003 removes the dedicated Restart UI; Stop is hidden in READY.
- Stop restores the original planned duration and stays ready. Stop followed by Start starts it again; New Run immediately starts it from overtime.
- Eight configuration presets: 1, 2, 3, 5, 10, 15, 30 and 60 minutes. Presets are visible only while ready and never start the timer, including in native fullscreen and expanded view. READY presets also appear in automatic mobile landscape.
- UX-002 adjustments use contextual headings for ready, running/paused, and overtime. The readout stays anchored when presets appear or disappear.
- Universal additions (+1 h, +5 min, +1 min, +30 s) remain available in every state and view, up to an effective budget of 99:59:59.
- Action buttons combine inline SVG icons and localized text. A subtle bottom line always shows the allocated total and, after extensions, the planned duration plus added time.
- On this branch UX-009 replaces expiry with one red, positive overtime readout from +00:00, derived from the original deadline, with localized status and accessible context. Start again clears overtime and runs the original duration.
- German and English UI, Light/Dark/System appearance, and browser-local language/theme preferences.
- System appearance follows OS changes through CSS media queries.
- Responsive standard view for desktop and mobile portrait; dedicated stopwatch PNG identity and ICO favicon.
- UX-006: one upper-right menu contains DE/EN and Light/Dark/System on every screen size, including fullscreen and automatic mobile landscape. Preference keys, defaults, and System appearance behavior are preserved.
- Safe-area-aware smartphone portrait and a centered, state-responsive timer stage in smartphone landscape.
- Installable Progressive Web App with an offline app shell after the first successful online visit.

UX-007 consolidates two layout families. Standard serves desktop, tablet (including landscape and split view), and smartphone portrait, retaining the header, sticky progress dock and scroll-reachable footer. Presentation serves explicit desktop/tablet fullscreen or expanded view and automatic smartphone landscape, with small branding at top left, the universal menu at top right, and no footer. Desktop/tablet retain a separate 44 px presentation exit to the left of the menu; smartphones hide the toggle in both orientations and never request native fullscreen on rotation.

Smartphone classification combines a coarse-pointer capability with a short `screen.width`/`screen.height` side below 600 CSS px, rather than viewport dimensions alone. Landscape is then determined from the viewport. Tablet split views retain the tablet's screen dimensions and therefore stay Standard. Very small tablets, foldables, external displays and browser-reported/zoomed screen dimensions are unavoidable heuristic edge cases; no user-agent sniffing is used.

The common CSS-sized timer stage allocates space after accounting for actual preset/control rows. READY keeps all configuration accessible; Running, Paused and Finished reclaim that space for larger digits, including hours and signed overtime. Extremely short screens may scroll instead of clipping controls. The budget/progress dock retains its colors, five-pixel height, rounded ends and responsive insets.

The strip shows remaining time in pink on the left and elapsed time in green on the right. Its marker moves right to left; pause freezes it, Stop restores it, and expiry leaves it fully green. It is decorative and never announces timer ticks to screen readers.

Manual Session execution is deployed; automatic execution is deployed in ST-002B. Ad-hoc, subtraction, Quick Timer manual duration entry and presentation settings remain outside scope.

## UX-009 / UX-010 local implementation

The [canonical display and Clock-only contract](docs/EASYTIMER_UX_KONZEPT_v2.md#ux-009--unified-readout-and-ux-010--mobile-clock-only-approved-local-implementation) describes the single positive overtime readout and transient phone-landscape view. Tap the large clock to hide controls; tap anywhere or press Escape to restore them without a timer action. A separate localized button supports Enter/Space and focus while the numeric readout retains timer semantics. Portrait rotation and reload reset the view. Desktop/tablet and Planner do not expose it. Keyboard focus outlines remain visible.

The existing container sizing now accounts for every character, including a plus sign and long hours. Shared timing, Session snapshots, templates and progress meaning are unchanged. The deployed UX-009/UX-010 centering baseline uses shell v27; local ST-002B uses v28 with matching imports/cache references. Run `node tests/browser-check.mjs` for the complete regression, including `tests/clock-view-browser.mjs`, which prints a temporary normal/Clock-only screenshot gallery. Native iPhone Safari/PWA safe areas, browser chrome, touch restoration, rotation and VoiceOver remain manual acceptance checks. The owner authorized commit, integration and deployment of this bounded release; later work requires separate approval.

## Menu hierarchy and Session Editor release

The universal menu groups Quick Timer and Session Timer as equal, always-visible mode tiles with decorative inline SVGs and `aria-pressed` selection. Session Editor (DE: Session-Editor) is a separate tool below them, with subtitle “Create & manage rundowns” / “Rundowns erstellen & verwalten”. Language and appearance share one row, with stacking only below 301px to retain 44px targets. Opening Editor does not select a third mode. Internal Planner names, navigation confirmations, timing, storage and presentation behavior are unchanged. The menu is up to 288px wide with 96px tiles (previously 320px / 112px); it scrolls on short screens. This owner-accepted UI release uses matching PWA v31 references; commit, integration and production publication are approved through the unchanged FTP workflow. Deployment success must be verified independently. The owner-selected Session Timer icon is Variant B, Stopwatch + Echo: one dominant stopwatch with two subdued rear echoes. `tests/menu-browser.mjs` generates a temporary browsable screenshot gallery with 32 open-menu combinations, keyboard focus and the selected icon at 24/28/32px. Set `EASYTIMER_MENU_BEFORE` to a previous menu screenshot directory to include before images. Native iOS/PWA and VoiceOver checks remain manual.

Verification passed all 63 unit tests and the complete Quick/Planner/manual/automatic Session/visual/Clock-only/PWA browser regression. Menu captures include desktop, 320 px portrait and short landscape in DE/EN and Light/Dark; generated files remain outside the repository.

## Rundown picker and shared footer

The Rundown picker keeps `Load Rundown` / `Rundown laden`, the visually hidden native label and short selection placeholder. A muted context line explains selecting a saved rundown for Session Timer. Load and Refresh list remain the main controls. The separate secondary `Open Session Editor` / `Session-Editor öffnen` action, with list/edit SVG and `Create & edit rundowns` / `Rundowns erstellen & bearbeiten` subtitle, opens the existing library overview. Creating a new draft happens there; it preserves initial phase/defaults, stable IDs, validation and discard guards. Loading leaves phase 1 READY without starting, with an isolated Manual/Automatic snapshot. Saved-data and page-reload explanations and Back to Quick Timer remain available. Workshop field/validation and active Session terminology remain deferred; models and persistence keys are unchanged.

The footer uses the fixed English brand credit with a monochrome Unicode heart. Both author/company links open in a new tab with `noopener noreferrer`; they have no underline and keep keyboard focus. [INFO-001](docs/backlog.md#info-001--standalone-information-pages-from-the-menu) remains deferred.

## DATA-001 portability (complete and deployed)

The [DATA-001 contract](docs/DATA-001_RUNDOWN_PORTABILITY.md) adds individual JSON exports, Export all as JSON and reviewed local imports to the Session Editor. Data & Backup is secondary to Create; a discreet warning explains browser-local storage loss. Single imports open unsaved drafts, while bulk imports append a complete batch of fresh-ID copies only after explicit confirmation. Unknown fields/invalid data are rejected; conflicts and failed writes keep the review. Existing template storage schema and timing remain unchanged. A contextual Session menu action exports the isolated original definition without affecting a running clock.

Use JSON export/import to transfer Rundowns between browsers/devices or between `et.rbsnet.at` and `easytimer.at`; those origins do not share localStorage. Import limit: 10 MiB. Backups are manual and contain no active runtime state. Google Drive/login/cloud sync and AI image conversion remain deferred. Shell v36 caches the versioned portability module (v35). Branch `feature/data-001-json-portability`, annotated `checkpoint/before-data-001` at `fb719f74bd4c9ce01b195803d3b94a792fc60d17`; owner acceptance and successful production publication complete. Release tag: `release/data-001-v35`.

Verification passed all **73 unit tests** and the complete browser regression including real JSON downloads/offline use, single/bulk import and actual cross-tab conflict/quota safeguards. The DATA-001 browser module prints a temporary before/after gallery; generated files remain outside the repository. Native iOS/PWA downloads/file picking and VoiceOver remain manual acceptance checks.

## Run locally

Native ES modules require a static HTTP server; opening `src/index.html` using `file://` is not supported.
For example, with an existing Python installation, run from the repository root:

```sh
python -m http.server 8000 --directory src
```

Then open `http://localhost:8000`. No build, package installation or backend is needed.

## Architecture

- `src/index.html`: semantic single-timer interface.
- `src/css/styles.css`: appearance tokens, safe areas, responsive views and universal preferences menu.
- `src/js/timer.mjs`: DOM-independent state transitions and duration validation.
- `src/js/app.js`: browser events, rendering, DE/EN resources and preference persistence.
- `src/js/planner.js`: localized template library/editor, isolated draft UI and shared repositioning popover.
- `src/js/templates.mjs`: template validation, cloning, stable-ID reordering and protected local storage.
- `src/js/session.mjs`: manual Session Run preparation, phase progression and derived workshop remaining; uses the existing engine and does not own a second clock.
- `src/js/time-visuals.mjs`: pure shared endgame threshold/state derivation for the existing current-timebox clock.
- `src/manifest.webmanifest`: install metadata and app icon declarations.
- `src/service-worker.js`: versioned same-origin app-shell cache and offline navigation fallback.
- `src/assets/branding/stopwatch-header-standard-96.png`: light header identity at 3x display resolution.
- `src/assets/branding/stopwatch-header-dark-96.png`: dark header identity at 3x display resolution.
- `src/assets/branding/favicon.ico`: multi-size browser favicon.
- `src/assets/branding/android-chrome-192x192.png` and `android-chrome-512x512.png`: installable app icons.
- `src/assets/branding/apple-touch-icon.png`: iOS home-screen icon.

The authoritative timer object holds status, planned duration, cumulative post-start additions, remaining milliseconds, the deadline, and deadline-derived overtime. `timeBudget` derives the effective total and consumed active time without a second clock.
Before Start, additions change the planned duration. After Start, they extend the effective total and shift the existing deadline; paused additions preserve the paused state. Overtime additions retain elapsed history: they reduce overrun or return to countdown when the added budget exceeds it. At the exact boundary, the unified readout shows +00:00. Stop and New Run discard post-start additions and restore the planned duration.
An injected timestamp makes the timer engine deterministic in tests. The browser uses `Date.now()`;
refresh callbacks never decrement the timer. Returning to a backgrounded page recalculates from its deadline.
Manual system-clock changes can affect a running countdown. The locally accepted REL-001A implementation restores Quick runtime after same-tab reload. Local [REL-001B](docs/REL-001B_SESSION_RECOVERY.md) extends the same recovery store and exclusive ownership to independent Session Runs, including automatic phase catch-up and final overtime; local Firefox owner acceptance has passed; real iOS/PWA and screen-reader checks remain outstanding. Paused clocks remain paused and READY never auto-starts. Saved Rundowns and editor drafts remain separate. See [shared recovery limitations](docs/REL-001A_QUICK_RECOVERY.md).
Unavailable local storage falls back to in-memory preferences.

The service worker is available only in secure contexts such as HTTPS or localhost. It precaches the static app shell after the first successful visit. Updating `CACHE_NAME` in `src/service-worker.js` activates a fresh cache and removes older easyTimer caches. Keep the CSS/app JavaScript version queries in `index.html` and the worker's `APP_SHELL` in sync with each release; this prevents new HTML from loading incompatible resources from an older worker. The local REL-001B shell is v46 and includes the shared recovery module. Runtime persistence is separate from the static cache; offline reload requires both a cached shell and usable browser storage/Web Locks. Production remains NO-GO.

## Validation

Node.js 22 or newer is suitable for the dependency-free checks:

```sh
node --test tests/timer.test.mjs
node --test tests/templates.test.mjs
node --test tests/session.test.mjs
node --test tests/time-visuals.test.mjs
node --test tests/virtual-clock.test.mjs
node --check src/js/app.js
node --check src/js/timer.mjs
node --check src/js/planner.js
node --check src/js/templates.mjs
node --check src/js/session.mjs
node --check src/js/time-visuals.mjs
node --check src/service-worker.js
node --check tests/browser-check.mjs
node --check tests/planner-browser.mjs
node --check tests/session-browser.mjs
node --check tests/time-visuals-browser.mjs
```

The optional browser check uses an installed Chromium-based browser and Node's built-in WebSocket:

```sh
node tests/browser-check.mjs
```

On Windows it defaults to Microsoft Edge. Set `EASYTIMER_BROWSER` to another Chromium executable if needed.
It starts a temporary local server and isolated headless browser profile, then closes both.

DEV-001 adds optional [virtual-time screenshot scenarios](docs/DEV-001_TIME_TRAVEL.md) to the same harness. For example, `node tests/browser-check.mjs --scenario quick-endgame --theme both` captures the actual timer UI without waiting for its countdown. Running without options still runs the full browser regression. No production timer files or PWA cache versions change for this test-only utility.

Owner acceptance checks:

1. Select 1 min and Start. Pause, wait, add 30 s, and Resume: paused time must not count down, and the added budget must be retained.
2. Select 15 min, add 5 min before Start, then add 5 min after Start: expect Total 25:00 · Planned 20:00 + 05:00. Stop restores 20 minutes, ready; Start begins them again.
3. Let the timer expire: the unified main display becomes red and advances from +00:00. New Run immediately runs the planned duration; Stop restores it and clears overtime.
4. Presets must be hidden while running, paused, and expired, including after New Run; Stop restores them in standard, native fullscreen, and expanded views. READY presets also appear in automatic mobile landscape. Check contextual adjustment headings in both languages and a stable readout position. Repeatedly add time up to the supported limit; an addition beyond 99:59:59 must be rejected with localized feedback.
5. Run 30 seconds, switch tabs for at least 10 seconds, and return. Remaining time must reflect elapsed wall time; repeat past expiry.
6. Switch DE/EN and Light/Dark/System while running, paused, and in overtime. The timer must preserve its progress. Reload to verify preferences; change OS theme with System selected.
7. Check desktop and 320–393 px portrait widths, including 99:59:59. All eight presets fit one desktop row and wrap on mobile. Verify distinct preset/adjustment styling and 44 px targets. Open preferences in standard, landscape, fullscreen and expanded views; check Tab access, Escape focus return, outside close, open-menu resize/rotation and no collision with the fullscreen control.
8. On desktop/tablet, enter Presentation while running and paused. Check that digits fit, controls remain usable and time does not reset. Exit using the button left of the hamburger and Escape. Where fullscreen is unavailable or denied, verify the expanded-view fallback; it cannot remove browser chrome.
9. Rotate a smartphone into landscape and back: branding remains visible, the toggle stays absent, and timer state is preserved. Check tablet landscape and a 667×320 split viewport on a tablet-sized screen: Standard must remain active until explicit Presentation entry. Verify the separate exit left of the menu, all four additions, READY presets, budget and progress; exceptionally short 240 px views may scroll.
10. Check the progress strip at start, halfway, pause, Stop, New Run and expiry. Run the browser regression check for emulated orientation changes, native fullscreen, rejection/unavailability fallback and Escape.
11. Install the PWA where supported. After one successful online visit, reload offline and verify that the ready timer opens. Confirm that a full reload intentionally starts a fresh timer.

Native iOS acceptance remains manual: verify Safari and installed-PWA portrait/landscape with browser chrome and safe areas, menu taps, READY presets versus the larger active clock, and returning to portrait without timer changes. On iPad, check full-size landscape and narrow split view both stay Standard until explicit Presentation entry, with the direct exit remaining available. Browser emulation is not a substitute for those platform checks.

## ST-001 Session Planner

Open Session Planner from the universal menu. The library supports multiple templates, creation, editing, renaming and confirmed deletion. Each template contains a workshop name, manual/automatic transition preference and ordered phases with titles and planned durations. These are planning preferences only; no phase execution is implemented. A shared repositioning popover reorders stable phase IDs within the editor draft.

The editor works on an isolated draft. Save validates and persists; Cancel or Back to timer asks before discarding changed drafts. Reopening the planner menu entry retains the current draft. A browser unload warning protects changed drafts where supported; mobile operating systems may terminate a page without delivering that event.

New templates start with one empty phase, a localized title placeholder and 10 minutes, while initial focus stays on the workshop name. The initial row belongs to the clean draft baseline and is not automatically saved. It can be deleted without being recreated. Existing templates open with their saved phases only. Required workshop/phase titles and the minimum of one phase still apply on Save.

Names and titles contain 1–120 characters after trimming. At least one phase is required. Each phase uses one `Duration (min)` / `Dauer (min)` input accepting positive integers from 1 to 6,000 minutes. Derived workshop totals cannot exceed 60,000 minutes. Empty, fractional, negative, exponent-form and out-of-range input is rejected without rounding. Storage retains `durationSeconds = minutes × 60`, always a whole-minute value. The pre-release format has no legacy migration or compatibility layer. These limits apply only to workshop templates; Quick Timer retains its existing 99:59:59 limit.

Planner views show a numbered phase, flexible title, minute input and two inline SVG actions (reposition and delete) in one Grid row where space permits. A shared visual heading complements each input's own accessible label. At planner content widths of 320 px or less, duration/actions wrap below the full-width title with a visible duration label; actions retain 44 × 44 px targets. Unfocused long titles may show an ellipsis; editing retains the full value, selection and cursor. Workshop name and transition mode share a row where space permits. Long names, feedback and totals wrap without horizontal overflow. Totals use hours/minutes/seconds without truncating large hours: 6,000 minutes displays `100:00:00`, and 60,000 minutes displays `1000:00:00`. Adding phases still appends at the end; insertion improvements remain a separate increment.

The single shared repositioning popover offers one-step up/down actions and a native 1-based position selector with an explicit Move action. A selected position means the phase's final position. Boundary steps and moving to the current position are disabled. It is measured once when opened and dismissed on outside click, Escape, focus leaving, page scroll or resize. Opening focuses the first available action; closing or reordering returns focus to the same phase trigger without stealing focus from another clicked field. No drag-and-drop, continuous positioning or extra dependencies are used. Only Save persists the reordered draft; Cancel and restoring the original order retain their existing semantics.

Transition mode uses an always-visible Manual/Automatic segmented radio group with native keyboard behavior and a localized fieldset legend. Phase actions use a lighter ghost treatment while retaining hover, active, disabled and visible focus states. The localized add action is `+ Add phase` / `+ Phase hinzufügen`. These presentation refinements do not change template data or timing behavior.

`src/js/templates.mjs` owns validation, draft cloning, stable-ID reordering and a small load/save store. `src/js/planner.js` owns the workspace and DE/EN copy. `easyTimerTemplates` stores `{ schemaVersion: 1, templates: [{ id, name, transitionMode, phases: [{ id, title, durationSeconds }] }] }`. IDs are generated with `crypto.randomUUID()` in secure contexts (HTTPS or localhost). The Session Run copies this planning data into separate runtime state; templates never store deadlines, statistics, overtime or active phase state.

Loading rejects the complete library on malformed data, invalid templates or unsupported schema versions, blocking writes rather than silently dropping records. Storage access/quota errors retain drafts and existing stored data. Each save/delete compares the current raw storage value with the last successfully loaded/written snapshot. A detected cross-tab conflict blocks the write and retains the draft. Explicit Reload saved templates asks before discarding changes, and keeps the draft if loading fails. This is optimistic detection, not an atomic cross-tab transaction: simultaneous writes between comparison and storage cannot be fully prevented with localStorage. No synchronization framework is introduced.

Opening the planner keeps the existing Quick Timer object, deadline, additions, overtime, refresh loop and dynamic tab title. Timer controls and the sticky dock are hidden only while editing. The workspace uses the standard header and scrollable layout in all orientations. Opening clears explicit expanded presentation and exits native fullscreen; returning never requests fullscreen or enables an expanded fallback automatically. Smartphone landscape returns to its normal automatic timer presentation. The timer engine and active-view dock geometry are unchanged.

Production PWA shell v25 caches the planner and Session modules with matching versioned URLs. Templates persist across reloads, but an active timer and unsaved draft do not. The approved UX-009/UX-010 update uses v26.

Field validation retains the failing input's identity and localized feedback association across language changes. Unsaved-change detection compares trimmed names/titles and parsed duration values, including stable IDs and phase order; temporary input fields do not make a reverted edit dirty. Invalid or incomplete duration edits still require discard confirmation. Normal typing and resizing retain input nodes; language changes restore the focused field and text selection. Browser regression coverage includes these cases, duplicate names, full-reload identities, genuine cross-tab storage conflicts, compact rows with twelve long titles, and 100/1000-hour totals. Repositioning coverage exercises a 20-phase draft, step/direct moves, restored order without a discard prompt, save/cancel, invalid-field associations, native keyboard selection, real emulated touch, dismissal and viewport fit in DE/EN and all themes. Unit coverage verifies exact final positions and object/data preservation in 30-phase drafts.

Run both unit suites and `node tests/browser-check.mjs`; the latter includes `tests/planner-browser.mjs`. Manual acceptance: create two templates, edit/reorder/remove phases, cancel a changed draft, reload, delete with confirmation, test two-tab conflicting saves, and verify feedback for blocked storage. Check DE/EN and Light/Dark/System at desktop, tablet split view, phone portrait and landscape. Let Quick Timer run into overtime while editing and return; verify time, additions and title. Native iOS Safari/PWA keyboard, position picker, safe areas, fullscreen exit and screen-reader checks remain open for final release acceptance on actual hardware; Chromium emulation does not replace them.

Potential portability increment: export the validated schema as JSON and import through the same validation, with explicit collision handling and confirmation before replacing any saved template. This is a candidate, not a scheduled or approved next task. Import/export UI, Drive, authentication and automatic Session execution remain future work. See [the backlog](docs/backlog.md) for discussed candidates and their status.

## ST-002A local implementation — manual Session Timer

This branch adds Session Timer and Quick Timer navigation to the existing universal menu. Session Timer opens a template picker with explicit Prepare; this branch now executes both Manual and Automatic templates through ST-002B. The picker labels the saved transition mode, and Prepare never starts it. Empty, invalid or inaccessible storage cannot start a run and is never overwritten.

Preparing makes an in-memory validated snapshot with a fresh run ID and stable phase IDs. Phase 1 is READY, with no automatic start or template write. Workshop name, prominent current phase and secondary phase index sit above the dominant clock. The bottom dock places workshop remaining on the left and a restrained, single semantic Up next button on the right (stacked on narrow phones). The button includes the upcoming title, an arrow and its full localized accessible name; long visible titles truncate. It uses the existing manual advance handler and prepares the next phase READY without starting it. On the last phase it explicitly says Complete workshop; after completion it is hidden and disabled. Workshop remaining is current remaining plus future planned durations; the existing strip shows current-phase progress with unchanged colors, height and docking. Quick presets/additions are hidden in Session.

Start/Pause/Resume use one shared deadline-based clock. On this branch an expired manual phase displays its red positive overtime in the single readout; Pause/Resume also freezes/continues that overtime. Next discards unused time, settles phase overtime by ID and prepares the next full duration in READY. The last phase never completes automatically: Complete workshop may explicitly finish it early, then starts separate final overtime at zero. Final overtime supports Pause/Resume and terminal Stop overtime. Stop workshop confirms and resets the run snapshot to phase 1 READY with cleared overrun records.

Switching away from active/paused/overtime or progressed Session state confirms discard. Cancel keeps the run and reconciles real elapsed time; acceptance discards progress and opens a READY destination/picker without automatic start. Quick's planned duration is retained, while its temporary extensions are not transferred. No hidden Quick or Session clock keeps running. Opening Session Planner is only a view change: the active clock continues, existing draft protection remains, and returning never unexpectedly re-enters native fullscreen/fallback.

Session phases accept the existing 1–6,000-minute template limit, workshops up to 60,000 minutes; Quick remains capped at 99:59:59. The shared engine uses an explicit Session policy and dedicated overtime actions. DE/EN, all themes, dynamic titles, Standard/Presentation, phone orientation and existing safe areas remain shared. The original v28 increment returned to a fresh Quick Timer after reload. Local REL-001B supersedes that limitation using validated independent Run snapshots; its v46 shell and recovery passed local Firefox owner acceptance, not production release acceptance.

Validation uses `node --test tests/timer.test.mjs tests/templates.test.mjs tests/session.test.mjs` and `node tests/browser-check.mjs`, including the focused Session browser modules. Manual owner checks: run two phases; pause countdown and phase overtime; advance early in Manual mode; explicitly complete the last manual phase; pause and stop final overtime; cancel/confirm Stop and mode changes; edit a source template without changing the active snapshot; exercise phone portrait/landscape and fullscreen/fallback. Automatic transitions are covered by ST-002B. Native iOS Safari/PWA picker, safe-area and screen-reader checks remain required. Runtime editing, detailed statistics, cross-reload recovery, ad-hoc and dual-display control remain deferred.

ST-002A validation before UX-008 on 2026-10-23 passed 38/38 Node tests, focused Session browser checks, the complete Quick/Planner/Session browser regression and JavaScript syntax checks. The browser suite covers stale unversioned-engine rejection, offline manual Session preparation, and reload returning to a fresh Quick Timer. Temporary screenshots were visually reviewed for 320 px portrait and short smartphone landscape with long titles. This is an implementation report, not owner acceptance or authorization to publish.

## UX-008 local implementation — timebox endgame highlight

Both modes share always-on endgame coloring. UX-009 on this branch supersedes the original amber-zero/separate-red-counter presentation: one readout is neutral normally, amber in endgame and red positive overtime from `+00:00`, including paused/stopped overtime. Quick additions rederive the current effective-budget state; Session uses only the current phase. Timing, controls and the pink/green strip are unchanged. The [canonical UX-008 record](docs/EASYTIMER_UX_KONZEPT_v2.md#ux-008--shared-timebox-endgame-highlight-approved-implemented-locally) contains the five fixed duration buckets and Light/Dark/System palette/contrast details. A future simple ON/OFF preference is intentionally deferred; no configuration UI or motion is included.

Run the Node test commands above plus `node tests/browser-check.mjs`; the complete suite includes focused visual checks across languages, themes/OS preferences, desktop/tablet native/expanded Presentation and phone portrait/landscape. UX-008 initially added the versioned visual helper in shell v24; the subsequent Session hierarchy refinement uses matching shell v25 references. That baseline is deployed; the subsequent UX-009/UX-010 v26 release has now been reviewed and authorized for production.

UX-008 verification on 2026-10-23 passed 46/46 Node tests (including eight new visual-state tests), focused visual browser checks, the complete Quick/Planner/Session/visual/PWA browser regression, JavaScript syntax and diff checks. Actual rendered colors, OS theme changes, reduced-motion settings, exact first overtime zero, paused/stopped final overtime and unchanged progress colors were checked. Temporary screenshots were reviewed for narrow portrait and smartphone landscape. No palette adjustments were needed. Native iOS Safari/PWA and screen-reader acceptance remains manual and unverified; these automated checks do not replace it.

## Scope and delivery

`docs/EASYTIMER_UX_KONZEPT_v2.md` is the canonical product and UX direction. It distinguishes the delivered QT-001/UX-001 behavior from remaining future ET-001 decisions.
UX-001 supersedes ET-001 decision 37: overtime additions extend the continuous run budget rather than starting a new timebox. German translation strings are an explicitly approved exception to the repository's English content convention.
Code, comments and documentation remain English.

The existing `.github/workflows/deploy.yaml` FTP pipeline deploys pushes to `main`.
Changes belong on a development branch. Commit, push, merge and deployment require separate owner authorization.

UX-006 uses one shared trigger and preferences structure outside the hidden presentation header. The anchored dropdown scrolls internally on short screens. Escape closes the open menu before the application exits presentation; closing never leaves focus inside hidden preferences. ST-001 adds the Session Planner navigation action to that same menu. About and extra footer links remain outside scope. Native browser/platform behavior outside the application's keyboard handlers remains browser-controlled.


## UX-003 responsive control bar

UX-003 unifies timer actions and additions in one responsive control bar. Wide containers show icons with localized action text and full amounts; constrained containers show action icons with complete accessible names and compact +1h/+5m/+1m/+30s amounts. Contextual adjustment headings remain semantic group labels and are visually hidden in compact layouts. Touch targets stay at least 44 px; groups wrap only when necessary. Presets remain a separate READY-only group in every view. Timer calculations, overtime, budgets, progress, and dynamic tab titles are unchanged. No extra settings or dependencies are introduced.
