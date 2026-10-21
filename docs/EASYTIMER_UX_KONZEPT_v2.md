# easyTimer — Product, UX and MVP Concept v2

**Date:** 2026-10-20
**Last reviewed:** 2026-10-21
**Status:** Canonical product and UX direction; MVP-01, MVP-02, PWA delivery, and mobile refinements are implemented in production
**Supersedes:** `EASYTIMER_UX_KONZEPT_v1.md`
**Repository:** https://github.com/nox-vobiscum/easytimer
**Production:** https://et.rbsnet.at/
**Language policy:** All repository text, code, identifiers, documentation, comments, UI copy, and agent prompts are in English. Product-owner conversation remains in German.

> **Read this distinction first:** Production currently implements one basic countdown timer plus its responsive presentation and installable PWA shell. The complete product vision and the 56 approved ET-001 behavior decisions remain future target behavior, not current functionality or automatic authorization for further implementation.

---

## 1. Product vision

easyTimer is a lightweight, reliable, browser-based timer for workshops, meetings, facilitation, training, and personal timeboxing. It is **room-display first**: the remaining time must be readable from across a meeting room or on a large external screen. A practical standard and mobile presentation also support direct interaction by a moderator or personal user.

**Product principle:** *One application. One timer engine. Consistent behavior. Responsive presentations.*

**UX principle:** *Less navigation, more timer.*

**Engineering principle:** *Keep it simple now; enable later extension through separation of concerns, semantic markup, and design tokens — not through speculative features.*

The long-term product may provide:

1. **Basic / Quick countdown timing:** A configurable duration, Start, Pause, Resume, Restart, Stop, temporary time adjustments, and eventual overtime handling.
2. **Session timing:** Named phases, manual/automatic phase transitions, total remaining workshop time, workshop completion, and statistics.
3. **Ad-hoc timing:** An independent temporary timebox that interrupts the main clock without changing its logical progress.
4. **Responsive presentations:** Fullscreen room display, standard controls, and mobile portrait/landscape layouts. These are *presentations of the same functionality*, not separate timer engines.
5. **Future customization:** Optional visibility, colors, layouts, and presentation profiles, implemented only after the foundational product is stable.

### Product identity

- Brand and primary app title: **easyTimer**, with **no “RBS” branding** in the product header, icon, favicon, or main wordmark.
- Use an original, simple, recognizable stopwatch mark rather than a generic emoji. Production uses dedicated standard and dark PNG exports, a multi-size ICO favicon, and installable app icons derived from the same identity.
- A small, restrained author credit may remain in the footer. It must not compete with the timer.

---

## 2. Implementation strategy and technical guardrails

### Preserve

- Existing GitHub repository and history.
- Static browser application: HTML, CSS, vanilla JavaScript.
- Existing hosting and `.github/workflows/deploy.yaml` GitHub Actions FTP pipeline.
- No mandatory backend, database, framework, bundler, or new recurring infrastructure cost.

### Modernize

- Replace the coupled timer/state logic with a small **single-source-of-truth countdown engine**.
- Keep timer calculations and transitions independent of the DOM, layout, language, and appearance.
- Keep browser adaptation, rendering, language resources, and persistence clearly separated when doing so is useful.
- Prefer native ES modules and a **minimal** number of files. Do not over-engineer a plugin system or a settings architecture.
- Use semantic CSS classes, state attributes as needed, and CSS custom properties for reusable values (colors, spacing, typography, progress indicator).

### Delivery protection

- Work on an isolated development branch; never work directly on `main`.
- A push to `main` triggers production deployment. Do not merge/push there without explicit approval.
- Do not change `.github/workflows/deploy.yaml`, FTP configuration, hosting, or secrets as part of the MVP.
- Read the actual checked-out code and relevant repository documentation before editing. Existing documents may describe superseded goals.
- Plan, verify, implement only the approved scope, test, report, and **STOP** after every authorized agent task.
- Do not silently introduce extra features from the long-term ET-001 backlog.

---

## 3. Implemented delivery: Basic Countdown MVP

### Objective

The delivered product is a single, visually polished, reliable countdown timer that can be shown to a room, with a compact responsive header, dominant time display, essential actions, discreet footer, fullscreen/fallback presentation, and installable offline app shell.

The UI does not label this timer as “Quick Timer”: there is only one timer and no mode selector.

### Explicit MVP inclusions

**Timer behavior**

- Configure a duration using a straightforward hours/minutes/seconds control; retain a few useful existing presets if they fit without adding clutter.
- Initial configured duration may default to five minutes; no behavior may start automatically on page load.
- `Start`: starts a prepared countdown.
- `Pause`: freezes the current remaining time.
- `Resume`: continues from the paused remaining time.
- `Restart`: restores the *original configured duration* and starts immediately.
- `Stop`: restores the *original configured duration* and remains stopped/ready.
- The main action changes contextually: `Start` / `Pause` / `Resume`. Secondary `Restart` and `Stop` are accessible without overwhelming the display.
- At `00:00`, stop cleanly, keep the main display at `00:00`, and show a discreet, translatable “Time's up”/“Zeit abgelaufen” status. **No overtime counter in this MVP.**
- Reject a zero/invalid duration for Start. Edits to duration must not silently override a running or paused countdown; the simple MVP may allow editing only in ready/stopped state.
- Compute remaining time from an absolute time reference, rather than decrementing an integer once per `setInterval` tick. Restore correct remaining time when a throttled/background tab becomes active again.
- The timer must not restart or reset because the theme, language, viewport, orientation, or display presentation changes.

**App shell / standard view**

- Minimal header: original custom stopwatch mark + `easyTimer` wordmark.
- Compact **Light / Dark / System** controls with understandable accessible names and selected state. Their minimal visual treatment should follow the general direction of the Planning Poker header without copying unnecessary navigation.
- Compact **DE / EN** language controls, fully translated visible UI labels, statuses, tooltips, and accessible labels. No flag icons.
- Theme and language preference stored locally; `System` follows operating-system appearance changes.
- A very large, high-contrast, responsive time display that dominates the standard view.
- Simple primary and secondary controls and unobtrusive duration configuration.
- Slim footer with restrained attribution; no oversized status bar.
- Responsive desktop and mobile portrait layouts; a single shared timer state across them.

**Fullscreen / presentation view**

- One prominent `Fullscreen` / `Exit fullscreen` action.
- Prefer the standard Fullscreen API where supported, with an acceptable full-viewport CSS fallback when necessary; never promise browser capabilities that are not available on a device.
- The digits occupy **as much of the available screen as practical**, remaining fully visible without clipping. Very strong contrast, minimal chrome.
- Only the smallest required controls remain accessible: the contextual primary action, Restart, Stop, Exit fullscreen. Keep them near an edge, subordinate to the clock. Reveal-on-interaction is acceptable, but keyboard and touch users must not be locked out.
- Header navigation and footer disappear or become visually irrelevant while presenting.
- On a mobile device, **landscape orientation should automatically favor a nearly time-only layout**, even without fullscreen permission; portrait restores the normal mobile view. Rotation never changes timer state.
- A slim (few-pixel) bottom-edge progress indicator visually differentiates elapsed and remaining fractions. Initial styling: soft pastel green for elapsed, pastel red/pink for remaining, with a small moving boundary marker. If the marker moves right-to-left, assign remaining to its left and elapsed to its right to keep the visual meaning consistent. No settings or custom colors now.

### Explicit MVP exclusions

- No `Quick Timer` mode selector, expanded Quick Timer features, or in-flight `+1/+5/-1 minute` time adjustment controls.
- No Session mode, phases, phase editor, transitions, workshop completion, or statistics.
- No Ad-hoc timebox.
- No overtime counting or overtime controls.
- No configurable signals/alarms or event-specific signal gates.
- No recovery dialog, multi-hour workshop recovery rules, or full cross-reload persistence of an active timer. **Background-tab accuracy within an open page remains required.**
- No extra themes, custom color picker, configurable progress-bar visibility, custom layout presets, or settings panel.
- No unnecessary animation, framework, component library, server, database, bundler, or deployment change.
- Do not keep half-functional legacy mode navigation visible. Out-of-scope functionality can be removed from the current active UI and safely isolated or retired in implementation; do not create inaccessible broken features.

### Proposed MVP state contract

| State | Main time | Primary action | Restart | Stop |
|---|---|---|---|---|
| Ready | Configured duration | Start | Start again from configured duration | Remain ready at configured duration |
| Running | Computed remaining time | Pause | Reset and immediately run | Reset and remain ready |
| Paused | Frozen remaining time | Resume | Reset and immediately run | Reset and remain ready |
| Expired | 00:00 | Start a new run from original duration, clearly indicated | Reset and immediately run | Reset and remain ready |

A single timer state object should represent this contract; avoid unrelated `running` and `paused` booleans. The precise object shape is an implementation detail.

### MVP acceptance status

- [x] Only the basic countdown timer is accessible; no Quick/Session/Ad-hoc features or inactive mode-switch UI.
- [x] Header displays the easyTimer stopwatch identity plus theme and DE/EN controls. Desktop shows them directly; mobile up to 440 px uses an accessible hamburger menu.
- [x] Every visible text/status/tooltip/accessible label belongs to the selected language; switching languages preserves timer state.
- [x] Light/Dark/System appearance works and is persisted; selecting a theme never alters the clock.
- [x] The time readout is the most prominent element on desktop, tablet, and mobile.
- [x] Start, Pause, Resume, Restart, Stop, expiry, and invalid-duration handling work as specified.
- [x] Timing corrects for browser callback throttling/background tabs; pause/resume does not lose or double-count time.
- [x] Fullscreen offers a room-scale timer and minimal, accessible controls; exit works by button and browser conventions.
- [x] Landscape mobile layout emphasizes the time; portrait restores normal controls without affecting countdown.
- [x] The thin progress strip reflects actual elapsed/remaining fractions and uses reusable CSS variables.
- [x] Footer is understated; no `RBS` app branding remains.
- [x] Existing static hosting and GitHub Actions FTP deployment file remain intact.
- [x] Automated timer and Chromium regression checks cover desktop, mobile, fullscreen/fallback, PWA registration, and offline reload.

---

## 4. Responsive UX and visual conventions

These are presentations of the *same* countdown and actions, not independent functional modes.

### 4.1 Standard (desktop and mobile portrait)

```text
+-----------------------------------------------------------------------+
| [original stopwatch] easyTimer                 [sun][moon][system] DE EN|
+-----------------------------------------------------------------------+
|                                                                       |
|                            12:34                                      |
|                                                                       |
|                          Remaining                                    |
|                                                                       |
|                   [   Pause   ]  [Restart] [Stop]                      |
|                                                                       |
|                 Duration: [00 h] [15 m] [00 s]                         |
|                         [ Fullscreen ]                                |
|                                                                       |
+-----------------------------------------------------------------------+
|                       understated attribution                         |
+-----------------------------------------------------------------------+
```

The actual layout need not follow this diagram pixel-for-pixel. Controls should adjust to the state; duration inputs should remain unobtrusive and accessible.

Production keeps both preference groups visible on desktop. At viewport widths up to 440 px, the standard view keeps the brand and a hamburger trigger in one compact header row. The trigger opens a localized, safe-area-aware preference dropdown containing the same DE/EN and Light/Dark/System controls. Escape and an outside click close it; Escape restores focus to the trigger. This responsive navigation change does not create a timer mode or a general settings system.

### 4.2 Fullscreen / room display

```text
+-----------------------------------------------------------------------+
|                                                                       |
|                                                                       |
|                                                                       |
|                         12:34                                         |
|                                                                       |
|                                                                       |
|                                  [tiny controls on interaction]        |
|=============================================================== 3-5 px |
+-----------------------------------------------------------------------+
```

The time should occupy most of the room display. No standard navigation or dense toolbar competes with it.

### 4.3 Mobile landscape

- Nearly time-only presentation with appropriately enlarged digits.
- Essential actions accessible on tap/keyboard, without permanently occupying valuable vertical space.
- Reverting to portrait restores the standard mobile control layout.
- Installed iPhone PWA presentation respects display safe areas. Countdown placement is visually and geometrically centered between the localized status and bottom action area.

### 4.4 Progress strip

- A *decorative/progress information display*, never a draggable slider.
- Consistent geometry and meaning across standard, fullscreen, and mobile views.
- Styling through CSS tokens, e.g. `--progress-elapsed-color`, `--progress-remaining-color`, `--progress-height`.
- No user-facing settings yet. Hide or fix the strip sensibly when there is no active timebox; avoid division by zero.
- Decide the exact amount of movement and placement through visual acceptance testing, not through added business logic.

### 4.5 Accessibility

- Semantic buttons and input labels, visible keyboard focus, adequate contrast.
- Theme controls and icon-only fullscreen controls must have localized accessible labels.
- Do not announce every second to screen readers; provide a meaningful status when the timer changes phase/state.
- Essential controls remain reachable for keyboard, mouse, and touch input.
- Respect reduced-motion preferences when using optional animations.
- The mobile preference trigger exposes expanded state and its controlled region; all preference targets retain at least 44 px touch geometry.

### 4.6 Progressive Web App shell

- A web app manifest provides standalone display metadata, app colors, and 192 px and 512 px icons; iOS uses a dedicated Apple touch icon.
- A versioned service worker precaches the static same-origin app shell after the first successful online visit.
- Navigation can reopen the ready timer while offline. A complete reload intentionally starts a fresh timer because active timer restoration remains future scope.
- Service-worker support requires HTTPS or localhost. Unsupported browsers continue to run the online static application.

---

## 5. MVP delivery record

MVP-01 and MVP-02 were delivered as bounded, separately reviewed changes. Later approved refinements added production branding assets, installable PWA support, iPhone safe-area/layout corrections, and a mobile-only preference menu.

### Step MVP-01 — Basic timer, architecture and standard view

**Status:** Implemented and deployed.

**Deliverable:** A functional, well-styled, single-mode basic countdown with an original stopwatch identity; a minimal responsive header including theme and DE/EN switching; a slim footer; a clean timer engine separate from the UI.

**Scope:** Basic timer states/actions, configuration and presets only if unobtrusive, expiration, corrected elapsed-time calculation, standalone standard view, semantic HTML/CSS, translation resource, theme/language persistence, targeted tests.

**Out of scope:** Session, Ad-hoc, advanced Quick features, overtime, fullscreen implementation, custom user settings, build/deployment changes.

**Result:** The baseline timer is verified in both languages and all three theme settings on desktop and mobile portrait. The existing deployment workflow file remained unchanged.

### Step MVP-02 — Room-display presentation and polish

**Status:** Implemented and deployed.

**Deliverable:** The same timer presented in true large-screen fullscreen / full-viewport mode, with unobtrusive essential controls; mobile landscape near-time-only layout; a thin progress strip; responsive, accessible finishing touches.

**Scope:** Browser Fullscreen API with graceful fallback, CSS presentation variant, responsive landscape behavior, progress rendering from the existing timer state, contrast and keyboard/touch checks, targeted tests and regression checks.

**Out of scope:** Independent timer implementation, additional timer modes, overtime, configurable styling, custom themes, workflow changes, unapproved extras.

**Result:** The timer keeps running without reset when entering/exiting fullscreen, rotating a phone, switching theme, or switching language; large screens show room-scale digits and all essential actions remain operable.

**Release rule:** Completed delivery does not weaken the approval gate. Every later merge, push, or deployment remains a separate owner-approved action.

---

## 6. Future product roadmap (NOT MVP scope)

This roadmap preserves the product decisions made during the requirements-engineering discussion. The order is indicative, not a commitment to deliver all features at once.

1. **Enhanced Quick Timer:** Overtime and temporary +/- adjustments, with original-duration restart behavior.
2. **Session Timer:** Named phases, manual/automatic transitions, upcoming phase preview, total remaining, completion and overtime.
3. **Ad-hoc Timer:** Independent temporary timebox, preserving and pausing any main countdown/overtime state.
4. **Workshop editing and statistics:** Live editor, stable phase identifiers, conflict resolution, time savings and overtime tracking.
5. **Long-running reliability:** Cross-reload state reconstruction, sleep/wake recovery, one-time workshop recovery prompt, missed-event signal policy.
6. **Event signals and preferences:** Configurable visual/audio gates and persisted global settings.
7. **Customization:** Optional visual elements, configurable progress styles, color accents, display information density, layout presets, more refined personal profiles.

Later epics must reuse the MVP's shared engine and presentation architecture rather than fork into separate timers.

---

## 7. ET-001 decision register — approved long-term target, NOT MVP requirements

The following summarizes the **56 approved product decisions**. Their numbered order reflects the conversation's decision history; each must be elaborated as acceptance tests when the related feature is scheduled for implementation. The MVP explicitly implements only the applicable basic-timer subset.

1. Quick Restart returns to originally configured duration and starts immediately.
2. Quick Stop returns to originally configured duration and remains stopped.
3. Switching Quick/Session while running or paused requires confirmation; no automatic start of the destination mode.
4. Early cancellation of Ad-hoc immediately returns to the main timer, paused, without confirmation.
5. Manual Next Phase discards unused time, prepares the next phase at its full duration and waits for Start.
6. Workshop total remaining is current-phase remaining plus future-phase planned durations; unused phase time is not carried forward.
7. Automatic phase transitions seamlessly start the next phase.
8. On workshop completion, the main display stays at 00:00 and separate final workshop overtime starts.
9. Final workshop overtime can be explicitly stopped, freezing its displayed value.
10. Restart Phase starts a fresh phase immediately; Restart Workshop starts again at phase 1 after confirmation.
11. Ad-hoc time is independent of session total; it pauses the main timer and requires explicit return/Resume.
12. An expired manual phase stays active at 00:00 and accumulates separate phase overtime.
13. Phase overtime is stored per phase and cumulatively, separately from workshop time remaining.
14. Phase time savings and overtime remain separate statistics; optional net variance belongs to summary only.
15. Restart Phase discards the previous attempt's statistics and updates aggregates.
16. Stop Workshop requires confirmation and resets phases/statistics/overruns to phase 1, not running.
17. Ad-hoc expiry displays an expired state until Return to Timer; Ad-hoc has no overtime.
18. Visual and sound signals are independently configurable; status text always remains available.
19. Default visual signal is on; default audio signal is off.
20. Signal preferences persist in localStorage.
21. Phase-transition and workshop-completion signal events are independently controllable.
22. Background tabs do not pause running time; reconstruct real elapsed time and phase transitions.
23. Sleep/Wake reconstructs elapsed time and overtime; paused clocks remain paused.
24. Refresh/browser restart restores running timers from persisted wall-clock state rather than automatically pausing them.
25. After four hours of *final workshop* overtime, offer recovery behavior; the threshold is not measured using inactivity or phase overtime.
26. Recovery to a selected phase restores its full original duration in ready state and preserves earlier statistics.
27. Recovery rewind clears statistics for the chosen phase and all later phases, preserving earlier phases.
28. Returning to a phase discards final workshop overtime; accepting completion keeps it.
29. The four-hour recovery prompt occurs at most once per workshop completion.
30. Quick expiry displays a separate, subtle overtime counter below the fixed 00:00.
31. Quick overtime continues until Quick Stop or Restart; there is no separate Quick-overtime stop control.
32. Manual overtime persists until explicit Next Phase; a subtle “Up next” preview remains visible during sessions.
33. Time reconstruction does not replay missed audible/visual signals.
34. Final workshop overtime keeps accumulating while a recovery dialog is open, unless deliberately paused/stopped.
35. Quick time may be deliberately extended/shortened while running or paused without changing its original configured duration.
36. Quick Restart/Stop always restore the original duration, even after temporary adjustments.
37. Adding time during Quick overtime starts a fresh timebox for the added duration; old overtime is discarded.
38. Reducing Quick remaining time to zero triggers expiry without retroactive overtime; running/paused status is preserved appropriately.
39. Session Editor stays open while the workshop continues; future phases can be edited; Cancel discards unsaved changes.
40. Current phase title/duration can be edited, applying a calculated delta to current remaining time; future phases remain editable.
41. Session Editor detects transitions/conflicts while open; use stable phase IDs, retain conflicting edits for deliberate review.
42. Current phase cannot be deleted or reordered; completed phases are protected; future phases may be reordered/removed.
43. Editing a current phase's planned duration recalculates based on actual elapsed time, including overdue time and automatic catch-up.
44. Signals have global visual/audio controls and event gates for Quick, Ad-hoc, phase end, and workshop completion; events default enabled.
45. “Save & Close Editor” applies valid changes and closes unless unresolved conflicts require review.
46. Editing planned duration during manual phase overtime recalculates remaining/overrun from actual elapsed time.
47. A completed workshop can be extended by new phases; new phase waits for Start, final overtime is reset, earlier statistics remain.
48. Pausing a phase during overtime freezes the overtime; Resume continues it; recovery respects pause.
49. Opening Ad-hoc while phase overtime is active freezes that overtime; return does not auto-resume.
50. Ad-hoc remains available after workshop completion; it pauses final workshop overtime and leaves it paused on return.
51. Final workshop overtime distinguishes temporary Pause/Resume from terminal Stop overtime.
52. In Manual mode the last phase ends only on explicit Complete Workshop; until then its phase overtime continues.
53. Session duration edits preserve paused state; calculated overtime remains paused, automatic catch-up must not reactivate the clock.
54. At four hours of final workshop overtime, show a discreet notification; show the complete recovery dialog on return after interruption, not immediately over an active presentation.
55. Editor saves conflict-free changes; conflicting changes remain in the open editor for review, never discarded silently.
56. Switching from Manual to Automatic during existing phase overtime does not retroactively advance; automatic behavior applies to subsequent transitions. Reverse switching and pauses preserve their normal semantics.

### Decision precedence and validation

- The 56 ET-001 decisions are accepted **future product behavior**, not a directive to implement every feature in MVP-01/MVP-02.
- The MVP-specific scope in Sections 3 and 5 takes precedence for the first delivery.
- If a detailed future rule conflicts with a proposed new UX behavior, raise it in planning; do not silently reinterpret requirements.
- State contracts and tests should be finalized per epic before expanding beyond the basic MVP.

---

## 8. Risks and deliberate simplifications

- Native ES modules require a local HTTP server rather than opening `index.html` through `file://`. Production remains static FTP hosting.
- The production identity uses approved raster exports and favicon/app-icon files. A broader brand package or vector redesign is outside the current product scope.
- The basic MVP does not restore an active run after reload. Define full persistence during a later reliability epic.
- The PWA app shell works offline only after a successful online visit. Cache names must be versioned when cached production assets change.
- Fullscreen and mobile orientation behavior depend on browser/device support; the application retains graceful full-viewport and responsive fallbacks.
- iPhone cutouts and home indicators require safe-area-aware CSS; acceptance should include installed-PWA portrait and landscape checks on representative hardware.
- Keep CSS tokens focused on real current elements. Do not create unused future customization scaffolding.

## 9. Collaboration and approval gates

1. Verify current branch and worktree; read the existing repository briefing, this proposed v2 concept, and relevant actual source files.
2. Produce a short approach including changed files, notable risks, model recommendation, and tests; wait for the owner's explicit approval to implement.
3. Implement only the authorized MVP step; test real behavior.
4. Report results, changed files, known limitations, and remaining work.
5. **STOP.** Do not begin the next step, commit, push, merge, deploy, or edit deployment settings without explicit authorization.

**End of concept v2.**
