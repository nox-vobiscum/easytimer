# easyTimer

A small, dependency-free countdown timer for meetings and personal timeboxing.

The release includes QT-001 overtime, UX-001 continuous time-budget extensions, contextual controls, the universal menu, and the UX-007 responsive timer stage.

ST-001 adds a local Session Planner workspace for reusable workshop templates. It does not execute sessions or introduce a Session Timer mode.

## Current release

UX-004: the browser tab title shows remaining time while running, adds a pause marker while paused, and shows signed overtime after expiry. READY uses `easyTimer`. Existing deadline-based updates correct the title when browser execution resumes; background updates can be throttled by the browser.

- One timer with Start, Pause, Resume, New Run and Stop. UX-003 removes the dedicated Restart UI; Stop is hidden in READY.
- Stop restores the original planned duration and stays ready. Stop followed by Start starts it again; New Run immediately starts it from overtime.
- Eight configuration presets: 1, 2, 3, 5, 10, 15, 30 and 60 minutes. Presets are visible only while ready and never start the timer, including in native fullscreen and expanded view. READY presets also appear in automatic mobile landscape.
- UX-002 adjustments use contextual headings for ready, running/paused, and overtime. The readout stays anchored when presets appear or disappear.
- Universal additions (+1 h, +5 min, +1 min, +30 s) remain available in every state and view, up to an effective budget of 99:59:59.
- Action buttons combine inline SVG icons and localized text. A subtle bottom line always shows the allocated total and, after extensions, the planned duration plus added time.
- Expiry keeps the main display at 00:00 and shows a subtle, localized overtime counter derived from the original deadline. Start again clears overtime and runs the original duration.
- German and English UI, Light/Dark/System appearance, and browser-local language/theme preferences.
- System appearance follows OS changes through CSS media queries.
- Responsive standard view for desktop and mobile portrait; dedicated stopwatch PNG identity and ICO favicon.
- UX-006: one upper-right menu contains DE/EN and Light/Dark/System on every screen size, including fullscreen and automatic mobile landscape. Preference keys, defaults, and System appearance behavior are preserved.
- Safe-area-aware smartphone portrait and a centered, state-responsive timer stage in smartphone landscape.
- Installable Progressive Web App with an offline app shell after the first successful online visit.

UX-007 consolidates two layout families. Standard serves desktop, tablet (including landscape and split view), and smartphone portrait, retaining the header, sticky progress dock and scroll-reachable footer. Presentation serves explicit desktop/tablet fullscreen or expanded view and automatic smartphone landscape, with small branding at top left, the universal menu at top right, and no footer. Desktop/tablet retain a separate 44 px presentation exit to the left of the menu; smartphones hide the toggle in both orientations and never request native fullscreen on rotation.

Smartphone classification combines a coarse-pointer capability with a short `screen.width`/`screen.height` side below 600 CSS px, rather than viewport dimensions alone. Landscape is then determined from the viewport. Tablet split views retain the tablet's screen dimensions and therefore stay Standard. Very small tablets, foldables, external displays and browser-reported/zoomed screen dimensions are unavoidable heuristic edge cases; no user-agent sniffing is used.

The common CSS-sized timer stage allocates space after accounting for actual preset/control rows. READY keeps all configuration accessible; Running, Paused and Finished reclaim that space for larger digits, including hours and separate overtime. Extremely short screens may scroll instead of clipping controls. The budget/progress dock retains its colors, five-pixel height, rounded ends and responsive insets.

The strip shows remaining time in pink on the left and elapsed time in green on the right. Its marker moves right to left; pause freezes it, Stop restores it, and expiry leaves it fully green. It is decorative and never announces timer ticks to screen readers.

Session execution, ad-hoc, subtraction, Quick Timer manual duration entry, and user-configurable presentation settings remain outside scope.

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
- `src/manifest.webmanifest`: install metadata and app icon declarations.
- `src/service-worker.js`: versioned same-origin app-shell cache and offline navigation fallback.
- `src/assets/branding/stopwatch-header-standard-96.png`: light header identity at 3x display resolution.
- `src/assets/branding/stopwatch-header-dark-96.png`: dark header identity at 3x display resolution.
- `src/assets/branding/favicon.ico`: multi-size browser favicon.
- `src/assets/branding/android-chrome-192x192.png` and `android-chrome-512x512.png`: installable app icons.
- `src/assets/branding/apple-touch-icon.png`: iOS home-screen icon.

The authoritative timer object holds status, planned duration, cumulative post-start additions, remaining milliseconds, the deadline, and deadline-derived overtime. `timeBudget` derives the effective total and consumed active time without a second clock.
Before Start, additions change the planned duration. After Start, they extend the effective total and shift the existing deadline; paused additions preserve the paused state. Overtime additions retain elapsed history: they reduce overrun or return to countdown when the added budget exceeds it. At the exact boundary, the display remains 00:00 with +00:00. Stop and New Run discard post-start additions and restore the planned duration.
An injected timestamp makes the timer engine deterministic in tests. The browser uses `Date.now()`;
refresh callbacks never decrement the timer. Returning to a backgrounded page recalculates from its deadline.
Manual system-clock changes can affect a running countdown. Active countdowns are not restored after reload.
Unavailable local storage falls back to in-memory preferences.

The service worker is available only in secure contexts such as HTTPS or localhost. It precaches the static app shell after the first successful visit. Updating `CACHE_NAME` in `src/service-worker.js` activates a fresh cache and removes older easyTimer caches. Keep the CSS/app JavaScript version queries in `index.html` and the worker's `APP_SHELL` in sync with each release; this prevents new HTML from loading incompatible resources from an older worker. A page reload still resets the timer because active countdown persistence is outside the current scope.

## Validation

Node.js 22 or newer is suitable for the dependency-free checks:

```sh
node --test tests/timer.test.mjs
node --test tests/templates.test.mjs
node --check src/js/app.js
node --check src/js/timer.mjs
node --check src/service-worker.js
node --check tests/browser-check.mjs
```

The optional browser check uses an installed Chromium-based browser and Node's built-in WebSocket:

```sh
node tests/browser-check.mjs
```

On Windows it defaults to Microsoft Edge. Set `EASYTIMER_BROWSER` to another Chromium executable if needed.
It starts a temporary local server and isolated headless browser profile, then closes both.

Owner acceptance checks:

1. Select 1 min and Start. Pause, wait, add 30 s, and Resume: paused time must not count down, and the added budget must be retained.
2. Select 15 min, add 5 min before Start, then add 5 min after Start: expect Total 25:00 · Planned 20:00 + 05:00. Stop restores 20 minutes, ready; Start begins them again.
3. Let the timer expire: the main display stays at 00:00 while the smaller overtime counter advances from +00:00. New Run immediately runs the planned duration; Stop restores it and clears overtime.
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

Open Session Planner from the universal menu. The library supports multiple templates, creation, editing, renaming and confirmed deletion. Each template contains a workshop name, manual/automatic transition preference and ordered phases with titles and planned durations. These are planning preferences only; no phase execution is implemented. Accessible up/down buttons reorder stable phase IDs.

The editor works on an isolated draft. Save validates and persists; Cancel or Back to timer asks before discarding changed drafts. Reopening the planner menu entry retains the current draft. A browser unload warning protects changed drafts where supported; mobile operating systems may terminate a page without delivering that event.

Names and titles contain 1–120 characters after trimming. At least one phase is required. Duration fields accept integer hours 0–99 and minutes/seconds 0–59, with positive phase totals up to 99:59:59. Derived workshop totals cannot exceed 999:59:59. Durations are stored as integer seconds; totals are not independently editable.

`src/js/templates.mjs` owns validation, draft cloning, stable-ID reordering and a small load/save store. `src/js/planner.js` owns the workspace and DE/EN copy. `easyTimerTemplates` stores `{ schemaVersion: 1, templates: [{ id, name, transitionMode, phases: [{ id, title, durationSeconds }] }] }`. IDs are generated with `crypto.randomUUID()` in secure contexts (HTTPS or localhost). A future Session Run must reference or copy this planning data into separate runtime state; templates never store deadlines, statistics, overtime or active phase state.

Loading rejects the complete library on malformed data, invalid templates or unsupported schema versions, blocking writes rather than silently dropping records. Storage access/quota errors retain drafts and existing stored data. Each save/delete compares the current raw storage value with the last successfully loaded/written snapshot. A detected cross-tab conflict blocks the write and retains the draft. Explicit Reload saved templates asks before discarding changes, and keeps the draft if loading fails. This is optimistic detection, not an atomic cross-tab transaction: simultaneous writes between comparison and storage cannot be fully prevented with localStorage. No synchronization framework is introduced.

Opening the planner keeps the existing Quick Timer object, deadline, additions, overtime, refresh loop and dynamic tab title. Timer controls and the sticky dock are hidden only while editing. The workspace uses the standard header and scrollable layout in all orientations. Opening clears explicit expanded presentation and exits native fullscreen; returning never requests fullscreen or enables an expanded fallback automatically. Smartphone landscape returns to its normal automatic timer presentation. The timer engine and active-view dock geometry are unchanged.

PWA shell v16 caches the planner modules and uses matching versioned HTML/CSS/app/planner URLs. Templates persist across reloads, but an active timer and unsaved draft do not.

Field validation retains the failing input's identity and localized feedback association across language changes. Unsaved-change detection compares trimmed names/titles and parsed duration values, including stable IDs and phase order; temporary input fields do not make a reverted edit dirty. Invalid or incomplete duration edits still require discard confirmation. Browser regression coverage includes both cases, duplicate names, full-reload identities and genuine cross-tab storage conflicts.

Run both unit suites and `node tests/browser-check.mjs`; the latter includes `tests/planner-browser.mjs`. Manual acceptance: create two templates, edit/reorder/remove phases, cancel a changed draft, reload, delete with confirmation, test two-tab conflicting saves, and verify feedback for blocked storage. Check DE/EN and Light/Dark/System at desktop, tablet split view, phone portrait and landscape. Let Quick Timer run into overtime while editing and return; verify time, additions and title. Check native iOS keyboard/safe areas and fullscreen exit on actual hardware.

Next small portability increment: export the validated schema as JSON and import through the same validation, with explicit collision handling and confirmation before replacing any saved template. Import/export UI, Drive, authentication and Session Run remain future work.

## Scope and delivery

`docs/EASYTIMER_UX_KONZEPT_v2.md` is the canonical product and UX direction. It distinguishes the delivered QT-001/UX-001 behavior from remaining future ET-001 decisions.
UX-001 supersedes ET-001 decision 37: overtime additions extend the continuous run budget rather than starting a new timebox. German translation strings are an explicitly approved exception to the repository's English content convention.
Code, comments and documentation remain English.

The existing `.github/workflows/deploy.yaml` FTP pipeline deploys pushes to `main`.
Changes belong on a development branch. Commit, push, merge and deployment require separate owner authorization.

UX-006 uses one shared trigger and preferences structure outside the hidden presentation header. The anchored dropdown scrolls internally on short screens. Escape closes the open menu before the application exits presentation; closing never leaves focus inside hidden preferences. ST-001 adds the Session Planner navigation action to that same menu. About and extra footer links remain outside scope. Native browser/platform behavior outside the application's keyboard handlers remains browser-controlled.


## UX-003 responsive control bar

UX-003 unifies timer actions and additions in one responsive control bar. Wide containers show icons with localized action text and full amounts; constrained containers show action icons with complete accessible names and compact +1h/+5m/+1m/+30s amounts. Contextual adjustment headings remain semantic group labels and are visually hidden in compact layouts. Touch targets stay at least 44 px; groups wrap only when necessary. Presets remain a separate READY-only group in every view. Timer calculations, overtime, budgets, progress, and dynamic tab titles are unchanged. No extra settings or dependencies are introduced.
