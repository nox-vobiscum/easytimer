# UX-018 — Contextual Quick Timer Timebox Controls

Local implementation on `feature/ux-018-contextual-timebox-controls`, based on
`e9fd4b8506008cb5dcac883d3a805902dd2c03ee`. Owner acceptance is pending.
Production v60 and staging remain untouched; this increment is not deployed.
The canonical local UX-018 backlog entry is preserved byte-for-byte.

## Behavior

- A genuinely new independent Quick Timer starts READY at 00:00. The application
  passes this duration explicitly; the shared `createTimer()` API is unchanged.
- The existing 1/2/3/5/10/15/30/60-minute controls add their duration on every
  activation. Repeated and mixed clicks are cumulative. They are action buttons,
  without a selected preset or `aria-pressed` state.
- Shift + click, Shift + Enter and Shift + Space subtract through the same
  existing `ADJUST` transition. READY clamps at 00:00 and Start stays disabled.
- A final monochrome reset SVG button restores 00:00 only in READY, without a
  deadline or automatic start. Its accessible names are:
  - DE: `Timebox auf 00:00 zurücksetzen`
  - EN: `Reset timebox to 00:00`
- READY shows only the time-building group. RUNNING, PAUSED and overtime show
  only the existing runtime adjustments. Session Timer shows neither group.
- Stop restores the configured duration and READY; starting again from overtime
  immediately runs that duration. Both discard temporary runtime adjustments.
  Neither action implicitly resets to 00:00.
- The maximum remains 99:59:59. Excess additions retain the existing rejection
  behavior and localized Timebox feedback.
- Normal touch activation adds time. Keyboard focus, the existing accessible
  shortcut description, 44px targets and responsive wrapping are retained.

Desktop keeps reset at the right of the minute buttons. Narrow portrait wraps
the group; short phone landscape may place the wrapped group beside Start to
avoid covering controls with the bottom information dock. Clock-only still hides
the entire control region.

## Recovery and scope

UX-016 remains authoritative for runtime subtraction: running zero begins overtime
at the adjustment instant, paused zero stays paused until Resume, and subtraction
in overtime is a no-op. No timer calculations or Session transitions are changed.

READY changes and reset use existing transitions and recovery persistence.
Existing configured values, including 05:00 and 00:00, restore unchanged. Editor
navigation, Session return and recovery ownership/selection retain their existing
behavior. There is no storage migration, schema change, new global preference or
second timer engine. Technical budget/storage identifiers keep their names.

Relevant UI and recovery labels use Timebox in DE/EN; FAQ explains the new controls.
The build remains a 24-file allowlisted package. Shell/app/CSS use v61; unchanged
timer/recovery/Session modules remain v54, shared header/info helpers remain v59,
and planner remains v55. Information pages reference CSS v61. Development entry
references app v61 without changing Google or synchronization behavior.

## Verification

```sh
node --test tests/*.test.mjs tools/app-sync/*.test.mjs tools/sync-poc/poc.test.mjs
node tests/browser-check.mjs
node tests/artifact-offline-browser.mjs
node tools/app-sync/browser-check.mjs
git diff --check
```

`timebox-browser.mjs` exercises real UI addition, keyboard subtraction, zero/reset,
bounds, Stop/restart, persisted existing values, refresh, Editor/Session return,
exclusive groups, localized reset names, themes and desktop/320px/landscape layout.
Existing subtraction, Session, DATA-001, recovery/ownership, offline cold-start and
development-SYNC regressions remain part of verification. All browser data and
screenshots belong to isolated temporary test profiles.

Local verification passed: 144/144 Node tests, the complete App/PWA browser suite,
packaged offline cold-start with its negative control, and development-SYNC browser
regressions (mocked Google HTTP). Packaging verified 24 files at PWA v61; syntax
and whitespace checks passed. These results do not replace owner visual acceptance
or actual iOS/PWA and screen-reader testing.

Older browser configuration helpers used absolute preset selection. The shared
test-only `configureQuickTimebox()` now uses the real additive READY handler,
temporarily substituting exact test durations and restoring button metadata.
No production test hook is introduced.

For owner review, check 00:00 -> +5 -> +5 -> 10:00, Shift subtraction to zero,
disabled Start, explicit reset, and Stop returning to a configured Timebox rather
than the default. Review short mobile layouts and fullscreen. Actual iOS/PWA and
screen-reader acceptance remain separate manual checks.
