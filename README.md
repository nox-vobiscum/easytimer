# easyTimer

A small, dependency-free countdown timer for meetings and personal timeboxing.

The release includes QT-001 overtime, UX-001 continuous time-budget extensions, and UX-002 contextual duration controls.

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
- Safe-area-aware iPhone portrait and optically centered touch-landscape presentation.
- Installable Progressive Web App with an offline app shell after the first successful online visit.

MVP-02 adds native fullscreen with a full-viewport fallback, an automatic reduced landscape presentation on touch devices up to 600 px high, and a five-pixel progress strip. Fullscreen and its fallback retain a small easyTimer identity at the top left without restoring the standard header. Essential controls remain visible and keyboard/touch accessible. Escape or the view button exits the expanded view; rotating back to portrait restores the standard layout unless fullscreen is still active.

The strip shows remaining time in pink on the left and elapsed time in green on the right. Its marker moves right to left; pause freezes it, Stop restores it, and expiry leaves it fully green. It is decorative and never announces timer ticks to screen readers.

Session, ad-hoc, subtraction, manual duration entry, and user-configurable presentation settings remain outside scope.

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
8. Enter fullscreen while running and paused. Check that digits fit, controls remain usable and time does not reset. Exit using the button and Escape. Where fullscreen is unavailable or denied, verify the expanded-view fallback; it cannot remove browser chrome.
9. Rotate a touch device into landscape and back. All four additions and the budget line remain visible without overlapping actions, digits, overtime, or the progress strip, including 568×320 screens. Native fullscreen remains active until explicitly exited.
10. Check the progress strip at start, halfway, pause, Stop, New Run and expiry. Run the browser regression check for emulated orientation changes, native fullscreen, rejection/unavailability fallback and Escape.
11. Install the PWA where supported. After one successful online visit, reload offline and verify that the ready timer opens. Confirm that a full reload intentionally starts a fresh timer.

## Scope and delivery

`docs/EASYTIMER_UX_KONZEPT_v2.md` is the canonical product and UX direction. It distinguishes the delivered QT-001/UX-001 behavior from remaining future ET-001 decisions.
UX-001 supersedes ET-001 decision 37: overtime additions extend the continuous run budget rather than starting a new timebox. German translation strings are an explicitly approved exception to the repository's English content convention.
Code, comments and documentation remain English.

The existing `.github/workflows/deploy.yaml` FTP pipeline deploys pushes to `main`.
Changes belong on a development branch. Commit, push, merge and deployment require separate owner authorization.

UX-006 uses one shared trigger and preferences structure outside the hidden presentation header. The anchored dropdown scrolls internally on short screens. Escape closes the open menu before the application exits presentation; closing never leaves focus inside hidden preferences. There are no new settings, navigation routes, About view, or footer links. Native browser/platform behavior outside the application's keyboard handlers remains browser-controlled.


## UX-003 responsive control bar

UX-003 unifies timer actions and additions in one responsive control bar. Wide containers show icons with localized action text and full amounts; constrained containers show action icons with complete accessible names and compact +1h/+5m/+1m/+30s amounts. Contextual adjustment headings remain semantic group labels and are visually hidden in compact layouts. Touch targets stay at least 44 px; groups wrap only when necessary. Presets remain a separate READY-only group in every view. Timer calculations, overtime, budgets, progress, and dynamic tab titles are unchanged. No extra settings or dependencies are introduced.
