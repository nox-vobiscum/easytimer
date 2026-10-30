# UX-011 — Safe Session Navigation and Confirmation

Local implementation on `feature/ux-011-safe-session-navigation`, based on the
released PWA v61 commit `4cf2c374a574c04ad0ba8938060820575f06553c`.
Owner acceptance is pending. Production and staging remain unchanged.

## Behavior

- Selecting the already active Quick Timer or Session Timer is view-only. If the
  Session Editor is open, its existing draft guard runs first. A successful
  return reveals the existing timer, picker or Session Run and focuses its main
  visible control. No timer is created, replaced, reset, stopped or restarted.
- Cancelling the draft warning retains the Editor, draft and underlying runtime.
- A genuine Quick/Session mode change still reconciles elapsed time and uses the
  existing native `window.confirm()` guard for progressed timers and Sessions.
- Confirmation text now names the destination and consequence. Session-to-Quick,
  Quick-to-Session, Quick-to-Rundown and Rundown-to-Rundown replacements have
  distinct localized DE/EN messages.
- The previously accepted UX-012 exception remains: an untouched phase-1 READY
  Session may be replaced without an additional warning. Progressed READY,
  RUNNING, PAUSED, phase overtime and workshop overtime remain protected.
- Rundown selection from Quick Timer and replacement of a progressed Session use
  the same validated loading path and retain the existing immutable snapshots.

The implementation reuses `switchMode()`, `planner.close()`,
`hasSessionProgress()` and `loadSavedSession()`. It does not change the timer
engine, Session state machine, recovery data, storage schema or Rundown format.
Native confirmation retains browser Cancel/Escape behavior; a false result leaves
the original mode, run identity, phase, deadline and draft intact.

## Versioning and verification

PWA shell, CSS and application references use v62; the CSS content is unchanged.
Engine, Session, recovery, planner, storage and information-page modules retain
their existing versions. The production package remains the explicit 24-file allowlist.

Focused browser coverage exercises same-mode Quick and Session returns, clean and
dirty Editor states, untouched and progressed READY, Manual running/paused/phase
overtime, Automatic workshop overtime, cancelled and confirmed cross-mode changes,
Rundown replacement, DE/EN confirmation copy, focus and 320px layout. Existing
Session, UX-016, UX-018, recovery, DATA-001, offline and development-SYNC suites
remain the broader regression gates.

Actual iOS/PWA and screen-reader owner acceptance remain separate manual checks.
