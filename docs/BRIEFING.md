# easyTimer — Project Briefing

**Last reviewed:** 2026-10-21
**Repository:** https://github.com/nox-vobiscum/easytimer  
**Production:** https://et.rbsnet.at/

## 1. Current product

easyTimer is a lightweight, dependency-free countdown timer for meetings, workshops, facilitation, and personal timeboxing. The current production release provides one basic timer with subtle overtime after expiry. Session timing, ad-hoc timing, in-flight duration adjustments, alarms, and user-configurable presentation settings remain future scope.

The countdown is the dominant element. Desktop, mobile portrait, mobile landscape, fullscreen, and the expanded-view fallback are presentations of the same timer state rather than separate modes.

## 2. Implemented behavior

- Configure hours, minutes, and seconds up to `99:59:59`, or use one of three presets.
- `Start` begins the configured duration.
- `Pause` freezes the exact remaining duration; `Resume` continues from it.
- `Restart` restores the original configured duration and starts immediately.
- `Stop` restores the original configured duration and remains ready.
- Expiry keeps the main display at `00:00`, retains the localized finished status, and shows a smaller overtime counter derived from the original deadline.
- Overtime continues until Stop, Restart, or a new run. Stop restores the original duration and remains ready; Restart immediately runs it.
- Zero, blank, fractional, negative, and out-of-range durations are rejected.
- Duration inputs are locked while the timer is running or paused.
- Remaining time and overtime are derived from the deadline. Delayed callbacks and background-tab throttling do not accumulate timer drift.
- A theme, language, orientation, viewport, or presentation change never resets the timer.
- An active countdown is not restored after a complete page reload.

## 3. Interface and responsive behavior

- Product identity is `easyTimer`, using dedicated standard and dark stopwatch artwork with a matching multi-size favicon.
- Every user-facing string, tooltip, status, and accessible label is available in German and English.
- Light, Dark, and System appearance options are supported. System follows the operating-system preference.
- Language and appearance preferences are stored in browser-local storage.
- Desktop keeps language and appearance controls visible in the header.
- At widths up to 440 px, an accessible hamburger button opens those controls in a safe-area-aware dropdown. Escape and an outside click close it; Escape restores focus to the trigger.
- Mobile portrait, including installed iPhone PWA presentation, respects display cutouts and safe areas.
- Touch landscape up to 600 px high automatically uses the reduced presentation layout and returns to the standard layout in portrait.
- Native Fullscreen API is used where available. A reversible full-viewport fallback is used when fullscreen is unavailable or rejected.
- Native fullscreen and its expanded-view fallback show a small, nearly opaque stopwatch-and-wordmark identity at the safe top-left edge without displaying the standard header.
- The presentation view retains Start/Pause/Resume, Restart, Stop, and exit controls.
- A five-pixel bottom strip shows remaining time in pink and elapsed time in green. It is decorative and is not announced on every timer tick.

## 4. Progressive Web App

easyTimer is installable from supported browsers through `src/manifest.webmanifest`. The manifest declares standalone display, app colors, and 192 px and 512 px icons. An Apple touch icon is included for iOS.

`src/service-worker.js` precaches the same-origin app shell after the first successful online visit. Navigation falls back to the cached index while offline. The cache name is versioned; activating a new version removes older `easytimer-` caches. Service workers require HTTPS or localhost.

Offline reload starts a fresh ready timer because cross-reload timer persistence is outside the current scope.

## 5. Architecture

- `src/index.html`: semantic single-timer interface, PWA metadata, header, controls, and progress strip.
- `src/css/styles.css`: design tokens, themes, safe areas, responsive standard and presentation layouts, and mobile menu.
- `src/js/timer.mjs`: DOM-independent timer state and transitions.
- `src/js/app.js`: rendering, localization, browser events, fullscreen behavior, responsive presentation, preferences, and service-worker registration.
- `src/manifest.webmanifest`: install metadata and app icon declarations.
- `src/service-worker.js`: versioned offline app-shell cache.
- `tests/timer.test.mjs`: deterministic timer transition and formatting tests.
- `tests/browser-check.mjs`: Chromium regression test for UI, timing, accessibility-related geometry, fullscreen/fallback behavior, mobile layouts, PWA registration, and offline reload.

The timer object is the single authoritative state source. It contains status, original duration, remaining milliseconds, a deadline, and deadline-derived overtime. Rendering and browser presentation do not own independent timer state.

## 6. Local development and validation

The application uses native ES modules and must be served over HTTP rather than opened with `file://`:

```sh
python -m http.server 8000 --directory src
```

Run the dependency-free checks with Node.js 22 or newer:

```sh
node --test tests/timer.test.mjs
node --check src/js/app.js
node --check src/js/timer.mjs
node --check src/service-worker.js
node --check tests/browser-check.mjs
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

Future work may include time-adjustment controls, session timing, ad-hoc timing, signals, restoration, and customization. Each next feature requires a bounded plan and explicit approval.

## 10. Collaboration workflow

1. Inspect the current branch, worktree, relevant documentation, source files, and available tests.
2. Propose one bounded task with affected files, state implications, risks, model recommendation, and validation.
3. Wait for explicit implementation approval.
4. Keep the patch focused and preserve existing dependencies and deployment infrastructure.
5. Run applicable checks and report changed files, results, unrun tests, and remaining limitations.
6. Stop after the approved task. Commit, merge, push, external-service changes, and production deployment require explicit authorization.
