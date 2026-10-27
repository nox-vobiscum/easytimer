# REL-001A — Durable Quick Timer Recovery

Locally functionally and visually accepted by the product owner in desktop browsers.
Real iOS/installed-PWA and screen-reader acceptance remain outstanding. Production
remains NO-GO; this acceptance does not authorize staging, commit or release.
Session recovery (REL-001B), the final-workshop four-hour flow (REL-001C),
navigation persistence (UX-014) and editor-draft persistence are not implemented.

## Runtime and ownership

One versioned JSON record per context lives under `easyTimerRuntime.v1.*` in
localStorage. sessionStorage holds only the current context association.
Records contain the Quick clock, context ID, save timestamp and optional actual
run-start timestamp, not Rundowns,
account data or UI/navigation state. Validation rejects unknown shapes/versions,
invalid budgets, inconsistent deadlines and unsupported states before execution.
Restoration uses the existing timer reducer, not another timer engine.

An exclusive Web Lock owns each record for the document lifetime. An inherited
association in a duplicated live tab cannot claim the original lock and receives
a new context instead. An explicit recovery choice also requires an exclusive
lock, fresh validation and unchanged application baseline. Concurrent recovery
requests are rejected. Taking over a still-owned record fails visibly.

Valid same-tab reload automatically restores READY, RUNNING, PAUSED or overtime.
Running time includes real elapsed time; paused time remains frozen. Duration,
extensions and original Stop/Restart semantics are preserved. No missed signals
are replayed. Native fullscreen and Clock-only are not restored.

Without an association, valid candidates are offered with stable identification,
actual start date/time where recorded, total configured budget including extensions,
and advisory ownership information; no candidate is preselected, even if only one
exists. No frozen remaining/overtime value is presented as a live reading. A wrapping
description below the native select repeats the complete selected information so
long labels remain readable on narrow screens. READY identifies a not-started timer;
older active records explicitly say that start time was not recorded. Their last
save date is labeled as such, never presented as creation/start time. No timestamp
is inferred from a shifted deadline. START/New Run and RESTART capture the actual
start; pause/resume, extensions and reload preserve it; Stop clears it.

Read-only Web Locks queries identify active contexts at discovery and selection,
without periodic storage writes. These observations are advisory; exclusive
ownership is rechecked at the actual action. Other active contexts may appear
in the list, but cannot be taken over. A refusal focuses and scrolls the explicit
localized explanation into view, preserving the original and current timer.
The secondary "Use current timer" action only dismisses the chooser; it does not
start, reset or replace anything. Singular/plural introductory wording matches
the number of candidates.
Selecting recovery over an active current Quick run requires the existing
replacement confirmation. Cancellation keeps that run. The replaced context's
record is removed while still owned, so it cannot later resurrect as a candidate.

Semantic transitions write immediately, including configuration, adjustments,
pause/resume, expiry, Stop and New Run. Deadline ticks and language/theme renders
do not periodically write. Entering Session mode invalidates the current Quick
record immediately; no Session runtime is persisted. Opening the Editor keeps
the current Quick clock and recovery active. No unload write is required.

## Failure boundaries

- Missing Web Locks, denied storage or quota failures leave the local timer usable
  but show that reliable recovery is unavailable. There is no unsafe lease fallback.
- Failed writes invalidate the tab association and remove the obsolete record
  where possible. If both writing and deletion are blocked, durable invalidation
  cannot be guaranteed; an older checkpoint may remain. Do not claim otherwise.
- Backward wall-clock movement relative to a running saved checkpoint is rejected.
  A detected backward change during active use also disables persistence visibly.
  READY/PAUSED do not calculate elapsed time and can retain their frozen values.
- A forward system-clock change while the application is absent cannot reliably
  be distinguished from real elapsed time without an independent trusted clock.
  No invented offset or external time service is used.
- Browser data deletion/eviction, separate storage partitions, unavailable secure
  APIs and OS lifecycle behavior can prevent recovery. Browser/PWA restarts may
  retain the association or require explicit selection. Physical iOS/PWA behavior
  remains an owner-operated acceptance check.
- Inactive context records are not automatically cleaned up in this slice. There
  is no history UI or destructive cleanup policy.

## Validation and owner acceptance

Run `node --test tests/*.test.mjs`, `node tests/browser-check.mjs` and
`node tools/app-sync/browser-check.mjs`. The latter uses isolated/mock transport;
it does not contact Google. Recovery browser checks use a disposable profile,
controlled wall time across reload, real Web Locks and a second window inheriting
the opener's sessionStorage. Fixtures never clear owner browser storage.

For manual review, restart the local static server if it still holds the old
development-entry rewrite. The optional existing Drive development server command
is `node tools/app-sync/server.mjs --enable-drive`; no Google authorization is
needed for recovery testing. Otherwise use the same command without the flag.

1. Set a Quick duration, Start, add time and reload: remaining time must match elapsed
   time and budget, not restart. Pause and reload: it must remain frozen.
2. Let a short timer expire while away; reload and check positive overtime. Stop,
   reload, and verify READY at the original duration. New Run clears extensions.
3. Duplicate a running tab. Configure/stop/start in the duplicate; the original
   must remain unchanged. Attempting explicit recovery of the original must fail.
4. Close and reopen a browser/PWA. If no association survives, select a candidate
   explicitly; multiple candidates must never be silently chosen. With a retained
   association, normal automatic recovery is expected.
5. Check DE/EN, Light/Dark, keyboard focus and 320px layout. Check offline reload
   after shell installation and actual iPhone Safari/PWA termination/restart.

The initial HTML contains no default countdown/status, and its timer section is
hidden until the first authoritative render completes. This uses no timeout;
valid same-tab recovery does not wait for an unnecessary ownership-list query.

PWA shell v45 caches `recovery.mjs?v=45`, app/CSS v45 and unchanged engine v35.
The asynchronous app bootstrap registers the worker even if `load` already fired.
Saved templates, DATA-001 and synchronization protocols are unchanged.

Initial implementation verification: 86 Node application tests and 4 development-gate
tests passed. The complete application/browser suite, including the new recovery
scenario, DATA-001 and offline PWA reload, passed. The development-SYNC browser
suite passed its existing integration/conflict/diagnostic and application checks
using isolated data and mocked transport, without Google requests. Actual iPhone,
installed-PWA restart and screen-reader acceptance remain untested.

## Owner findings and targeted corrections

Owner-operated acceptance confirmed RUNNING (F5/hard reload), PAUSED, OVERTIME,
READY without autostart, Stop without resurrection, independent duplicated tabs,
independent refreshes and a third tab offering both candidates without a default.
The following targeted corrections have also passed local desktop-browser owner
acceptance:

- The initial flash came from literal default timer/status content in the HTML
  while asynchronous recovery was pending. Empty initial text plus a render gate
  removes the incorrect value without delaying the clock by a fixed timeout.
- Previous candidate labels used the save-time readout and save timestamp, not
  actual start identity. The new optional metadata and stable descriptions fix
  this without changing timer calculations or writing on every tick.
- The existing exclusive-lock rejection returned `CONTEXT_ACTIVE`, but the old
  test checked only message text; focus went back to the timer without ensuring
  the explanation was visible. The owner's exact viewport/cache state was not
  inspected. New three-context tests verify actual lock refusal, visible focused
  DE/EN feedback, unchanged original deadlines and successful unlocked recovery.

The final owner-operated check confirmed readable stable candidate identification,
visible refusal while the original tab owns a timer, successful recovery after
that tab was closed, continued overtime after takeover and no effects on other
timers. The observed overtime continued from approximately +08:04 to +09:14;
these are owner observations, not an independently measured benchmark. Together
with the READY/RUNNING/PAUSED/OVERTIME, Stop and independent reload checks above,
this completes local desktop-browser acceptance, including removal of the initial
05:00 flash. No real iOS/PWA or screen-reader acceptance is inferred.

Targeted correction verification: 88 application Node tests plus 4 development-gate
tests passed (92 total). The complete application/browser/PWA suite and development
SYNC browser regressions passed. New coverage includes a deliberately held bootstrap
with no visible default data, actual start metadata across pause/extension/reload,
read-only ownership inspection, a stale-availability race, two running owners plus
a third chooser, focused visible DE/EN refusal, unlocked recovery and fully readable
selected descriptions at 320px in Light/Dark. No owner browser data was accessed.
