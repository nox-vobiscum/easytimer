# UX-016 — Shift + Click Time Subtraction

Implemented locally on `feature/ux-016-shift-subtraction`, based on
`be3a6787ded31091e2b64b99aa504e0e2b0cce6a`. Locally accepted by the product owner
in Firefox on PWA v53: READY zero disables Start; RUNNING subtraction beyond the
remaining time starts overtime at +00:00 without historical overtime; PAUSED zero
stays paused across F5 and starts overtime only on Resume; subtraction during
overtime has no effect, message or flicker while overtime continues naturally.
Production remains NO-GO. The unrelated mixed backlog is unchanged.

## Behavior

The existing Quick Timer adjustment buttons retain their visible positive labels.
Click, Enter, Space and touch taps add time as before. Shift + Click, Shift + Enter
and Shift + Space subtract the displayed amount. Shifted keyboard activation
prevents the native follow-up click; held-key repeats do not multiply subtraction.
A localized accessible description documents the shortcut without visible clutter.

| State | Subtraction |
| --- | --- |
| READY | Reduces configured duration, clamped at zero. Stays READY; Start is disabled at zero until time is added. Stop/Restart use the resulting configuration; the engine also refuses zero-duration Start/Restart. |
| RUNNING | Subtracts at most the internal remaining milliseconds. Reaching zero sets FINISHED with +00:00 and a deadline equal to the adjustment timestamp. Overtime starts there, never retroactively. |
| PAUSED | Subtracts at most frozen remaining time. Zero stays PAUSED without a deadline or overtime. Explicit Resume from zero enters FINISHED with +00:00 and a new deadline at the resume timestamp. |
| OVERTIME | No subtraction is possible. The effective deadline, budget and adjustment remain unchanged; real elapsed overtime continues naturally. Positive additions retain their existing behavior. |

Zero is a valid endpoint; no negative budget or remaining time is permitted.
The existing maximum 99:59:59 and positive-adjustment behavior are retained.
Noninteger, nonfinite and zero adjustment requests remain invalid. Excess negative
requests clamp to the available remaining time; only the effective subtraction is
persisted. Net active adjustments may be negative; configured duration is retained. The budget line
shows a real minus sign, e.g. `Planned 05:00 − 01:00`, rather than `+ -01:00`.
Stop, Restart and a new Start from FINISHED discard active adjustments as before.
For example, five minutes configured with two minutes elapsed and three minutes
remaining, minus a requested five minutes, applies only minus three minutes:
effective total two minutes, remaining zero, overtime origin now. Immediately the
existing unified finished display reads +00:00; ten seconds later it reads +00:10.

## Implementation and recovery

The existing ADJUST transition handles both signs; its shared `adjustmentError`
validation also supplies UI feedback. Deadline reconciliation precedes transition
handling, including delayed callbacks. No second timer, new state, interval or
Session adjustment capability is introduced. Existing title, visual-state and
progress calculations consume the resulting authoritative clock and budget.

REL-001 validation accepts signed integer Quick adjustments with a valid nonnegative
total, retaining state consistency, identity and Web Lock guards. Session clocks
still require zero adjustment. Existing valid records need no format migration;
the runtime schema stays v1. Intentional READY zero and PAUSED zero survive reload
and lock-protected takeover. Zero configured duration is valid only in READY;
negative totals, running zero remaining time and inconsistent deadlines are rejected.
Session duration/paused-state validation remains strict. The earlier one-second
minimum/rejection rules are superseded by these owner-approved zero endpoints.
No new expiration signals, audio or visual alarm events are introduced; existing
deadline-derived visual state updates remain in use and recovery replays no signal.

PWA v53 versions CSS/app, timer, recovery and the importers Session/time-visuals
consistently; Session/time-visuals only change their timer import reference.
The development entry imports app v53; account and synchronization logic are
unchanged. DATA-001 formats, Rundowns and storage keys are unchanged.

## Verification and owner acceptance

```sh
node --test tests/*.test.mjs tools/app-sync/*.test.mjs tools/sync-poc/poc.test.mjs
node tests/browser-check.mjs
node tools/app-sync/browser-check.mjs
git diff --check
```

Focused deterministic tests cover signed deadlines/elapsed time, exact expiry,
clamping at zero, paused-zero Resume, overtime no-op, bounds, configured-duration restoration, signed recovery in
every Quick state, reload, denied takeover, successful takeover and invalid records.
Browser coverage exercises modifier clicks, shifted and ordinary Enter/Space,
single activation, DE/EN feedback, signed budget, title/expiry state, actual reload
with clamped effective adjustments, zero READY/PAUSED reload and touch addition. Existing full regressions
cover Session restrictions/behavior, DATA-001, layout, account controls and PWA.
All browser data and injected clocks belong to disposable test contexts.

Actual final correction validation: 142/142 Node tests passed, including 56
timer/recovery tests. Full App/PWA and Development-SYNC browser regressions passed,
including DATA-001, manual/automatic Session, recovery/ownership, account controls
and the corrected subtraction scenarios. Syntax, PWA-reference checks and
`git diff --check` passed. No real Google authorization or owner data was used.

Owner check: start a five-minute Quick Timer, subtract one minute with Shift while
clicking +1 min, then try the same button with Shift + Enter/Space. Pause and
verify an excessive subtraction leaves zero paused. Reload, wait, then Resume:
overtime must begin at +00:00 only on Resume. Subtract beyond zero while running,
verify immediate +00:00, reload and confirm only real elapsed overtime. Subtraction
in overtime must not change its origin or budget. Check Stop restores the configured duration and
READY subtraction changes that configuration. Local Firefox owner acceptance is
complete. Real-device iOS/PWA and screen-reader acceptance remain OPEN; production
remains NO-GO.

## FAQ copy prepared for INFO-001

**EN:** How can I subtract time? Hold Shift while clicking a Quick Timer adjustment
button. With keyboard focus on the button, use Shift + Enter or Shift + Space.
Ordinary activation adds time. Subtraction stops at zero. A paused timer stays
paused there; Resume starts overtime from that moment. Subtraction during overtime
does nothing. At zero in READY, add time before starting. Touch taps keep adding time.

**DE:** Wie ziehe ich Zeit ab? Halte beim Klicken auf eine Zeitanpassung im
Quick-Timer die Umschalttaste gedrückt. Bei Tastaturfokus auf dem Button geht auch
Umschalt + Enter oder Umschalt + Leertaste. Ohne Umschalttaste wird Zeit ergänzt.
Ein Abzug endet spätestens bei null. Ein pausierter Timer bleibt dort pausiert;
erst Fortsetzen startet die Überzeit. In der Überzeit verändert ein Abzug nichts.
Bei null im Zustand Bereit ergänze vor dem Start wieder Zeit. Tippen auf
Touchgeräten ergänzt weiterhin Zeit.

This prepares wording only; no FAQ page or navigation is added by UX-016.
