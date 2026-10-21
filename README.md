# easyTimer

A small, dependency-free countdown timer for meetings and personal timeboxing.

## MVP-01 and MVP-02

- One timer with Start, Pause, Resume, Restart and Stop.
- Restart restores the original configured duration and starts immediately. Stop restores it and stays ready.
- Hours, minutes and seconds (up to 99:59:59); three compact presets.
- Duration inputs are locked while running or paused. Zero, blank, fractional and out-of-range values are rejected.
- Expiry stays at 00:00 with a localized finished status; Start again runs the original duration.
- German and English UI, Light/Dark/System appearance, and browser-local language/theme preferences.
- System appearance follows OS changes through CSS media queries.
- Responsive standard view for desktop and mobile portrait; dedicated stopwatch PNG identity and ICO favicon.

MVP-02 adds native fullscreen with a full-viewport fallback, an automatic reduced landscape presentation on touch devices up to 600 px high, and a five-pixel progress strip. Essential controls remain visible and keyboard/touch accessible. Escape or the view button exits the expanded view; rotating back to portrait restores the standard layout unless fullscreen is still active.

The strip shows remaining time in pink on the left and elapsed time in green on the right. Its marker moves right to left; pause freezes it, Restart/Stop restore it, and expiry leaves it fully green. It is decorative and never announces timer ticks to screen readers.

Session, ad-hoc, overtime and user-configurable presentation settings remain outside scope.

## Run locally

Native ES modules require a static HTTP server; opening `src/index.html` using `file://` is not supported.
For example, with an existing Python installation, run from the repository root:

```sh
python -m http.server 8000 --directory src
```

Then open `http://localhost:8000`. No build, package installation or backend is needed.

## Architecture

- `src/index.html`: semantic single-timer interface.
- `src/css/styles.css`: responsive standard view and appearance tokens.
- `src/js/timer.mjs`: DOM-independent state transitions and duration validation.
- `src/js/app.js`: browser events, rendering, DE/EN resources and preference persistence.
- `src/assets/branding/stopwatch-header-standard-96.png`: light header identity at 3x display resolution.
- `src/assets/branding/stopwatch-header-dark-96.png`: dark header identity at 3x display resolution.
- `src/assets/branding/favicon.ico`: multi-size browser favicon.

The authoritative timer object holds status, original duration, remaining milliseconds and a deadline.
An injected timestamp makes the timer engine deterministic in tests. The browser uses `Date.now()`;
refresh callbacks never decrement the timer. Returning to a backgrounded page recalculates from its deadline.
Manual system-clock changes can affect a running countdown. Active countdowns are not restored after reload.
Unavailable local storage falls back to in-memory preferences.

## Validation

Node.js 22 or newer is suitable for the dependency-free checks:

```sh
node --test tests/timer.test.mjs
node --check src/js/app.js
node --check src/js/timer.mjs
```

The optional browser check uses an installed Chromium-based browser and Node's built-in WebSocket:

```sh
node tests/browser-check.mjs
```

On Windows it defaults to Microsoft Edge. Set `EASYTIMER_BROWSER` to another Chromium executable if needed.
It starts a temporary local server and isolated headless browser profile, then closes both.

Owner acceptance checks:

1. Set 00:00:05 and Start. Pause, wait, and Resume: paused time must not count down.
2. Restart during a run and while paused: immediately run the original five seconds. Stop: return to five seconds, ready.
3. Let the timer expire: 00:00 and the finished status remain, without overtime. Start again repeats the original duration.
4. Try zero, blank, negative, fractional and out-of-range fields. Start must be unavailable with a clear error.
5. Run 30 seconds, switch tabs for at least 10 seconds, and return. Remaining time must reflect elapsed wall time; repeat past expiry.
6. Switch DE/EN and Light/Dark/System while running and paused. The timer must preserve its progress. Reload to verify preferences; change OS theme with System selected.
7. Check desktop and 320–390 px portrait widths, including 99:59:59. Check keyboard focus, Enter activation, touch targets and screen-reader labels.
8. Enter fullscreen while running and paused. Check that digits fit, controls remain usable and time does not reset. Exit using the button and Escape. Where fullscreen is unavailable or denied, verify the expanded-view fallback; it cannot remove browser chrome.
9. Rotate a touch device into landscape and back. Check both 00:05 and 99:59:59, including short screens and browser toolbars. Native fullscreen remains active until explicitly exited.
10. Check the progress strip at start, halfway, pause, Restart, Stop and expiry. Run the browser regression check for emulated orientation changes, native fullscreen, rejection/unavailability fallback and Escape.

## Scope and delivery

The MVP sections of `docs/EASYTIMER_UX_KONZEPT_v2.md` describe the current direction; older briefing material includes superseded multi-mode scope.
German translation strings are an explicitly approved exception to the repository's English content convention.
Code, comments and documentation remain English.

The existing `.github/workflows/deploy.yaml` FTP pipeline deploys pushes to `main`.
MVP work belongs on a development branch. Commit, push, merge and deployment require separate owner authorization.
