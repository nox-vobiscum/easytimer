# RBS' easyTimer — UX and Functional Concept v1

**Date:** 2026-10-19  
**Status:** Discussion baseline / planning document — **not implementation approval**  
**Repository:** https://github.com/nox-vobiscum/easytimer  
**Production:** https://et.rbsnet.at/

## 1. Product vision

A deliberately lightweight, intuitive workshop and meeting timer with three use cases:

1. **Quick Timer:** Configure a simple countdown; start, pause, resume, restart, and stop/reset it. Enlarge the time display with one action for external meeting-room screens.
2. **Ad-hoc Timer:** Insert a separately timeboxed short discussion while preserving and pausing the main timer.
3. **Session Timer:** Define workshop phases in advance, each with its own duration, while clearly presenting the active phase and total remaining workshop time.

**UX principle:** Less navigation, more timer. The Quick Timer is the default use case. Contextual tools must not overshadow the remaining time, which is the visual focal point.

## 2. Technical baseline (source inspection, not a production browser test)

- Static app: `src/index.html`, `src/css/styles.css`, `src/js/app.js`; no required backend or framework.
- Central timer state and event logic in `app.js`; complexity has grown with additional modes.
- CSS custom properties and existing Light/Dark/System themes.
- Countdown currently uses `setInterval(..., 1000)` and decrementing counters. Background throttling can affect accuracy. **Possible improvement, not approved:** Compute remaining time from a monotonic deadline (for example, using `performance.now()`).
- Opening the ad-hoc overlay pauses a running main timer. End-of-ad-hoc and return behavior needs review against the approved requirement below.
- Session editor, auto/manual session transitions, and optional time inputs exist; their controls are currently inside the hamburger menu.
- The legacy project briefing contained Java/Spring/JUnit/WebSocket template text; it is being updated to reflect the actual static app.
- Live visuals and end-to-end behavior have not been independently tested during this concept review.

## 3. Approved decision: Explicit main-timer resume after ad-hoc

**Binding product decision:** The main timer must **never restart automatically** when an ad-hoc timebox ends.

Target interaction:

1. The main timer is running or already paused.
2. Opening/starting ad-hoc pauses the running main timer and preserves its remaining duration.
3. Ad-hoc runs independently; ad-hoc Pause/Resume does not alter the main timer.
4. When ad-hoc reaches zero, show a clear completion indication. Keep the main timer paused.
5. **Return to main timer** shows the saved main-timer time again.
6. Only an explicit **Resume** action restarts the main timer.

If the main timer was already paused before ad-hoc began, it remains paused afterward.

**Unresolved:** What Stop vs. Close means in ad-hoc, behavior when ad-hoc ends early, and the exact completion signal (visual/audio/none).

## 4. Header and navigation — preferred direction, not yet implemented

**User proposal:** Remove the hamburger menu entirely and move theme selection plus Timer/Session switching to the header, analogous in principle to the Planning Poker header. A slightly taller header is acceptable on mobile.

**Design recommendation:** Make the labeled Timer/Session switch more prominent than the compact Light/Dark/System selection. Place session-related options with the session workflow instead of the global header.

| Existing control | Preferred future location |
|---|---|
| Timer / Session mode | Always-visible, labeled header segmented control |
| Light / Dark / System | Compact header controls |
| Open session editor | Session content area |
| Auto/manual session transitions | Session editor or session settings |
| Show/hide time inputs | Beside the time inputs or in contextual session controls |

### Desktop header wireframe — layout concept, not final design

```text
+-------------------------------------------------------------------------+
| [clock] easyTimer                   [ Timer | Session ]   [sun][moon][pc]|
+-------------------------------------------------------------------------+
```

### Mobile header wireframe — two-row layout concept

```text
+------------------------------------+
| [clock] easyTimer     [sun][moon][pc]|
|                                    |
|          [ Timer | Session ]       |
+------------------------------------+
```

**Visual intention:** One restrained header row on desktop and two readable rows on mobile instead of an overloaded mini-toolbar. Keep mode labels, rather than replacing them with ambiguous icons.

## 5. Main timer — saved conceptual UI wireframe

This sketch records the previous discussion. It is **not a screenshot, a specification of exact dimensions, or a finished design**.

```text
+------------------------------------------------+
| [clock] easyTimer                      [expand]  |
+------------------------------------------------+
|                                                |
|                  QUICK TIMER                   |
|                                                |
|                     12:34                      |
|              ==============-----               |
|                of 20:00 minutes                |
|                                                |
|               [ Start ]  [Restart] [Stop]      |
|                                                |
|   +----------------------------------------+   |
|   | [discussion]  Ad-hoc discussion / 5 min |   |
|   +----------------------------------------+   |
+------------------------------------------------+
```

**Important:** This earlier main-timer sketch predates the proposed menu-free header. Consolidate both sketches when creating a real layout. Labels, colors, symbols, control visibility, dimensions, and final interaction states remain undecided.

### Visual principles

- Very large, high-contrast time digits, especially on external meeting-room screens.
- A single clearly identifiable primary action appropriate to the current state: Start, Pause, or Resume.
- Restart and Stop/Reset remain accessible but visually secondary.
- Reduced visual noise; avoid unnecessary IDE-like complexity.
- A distraction-free presentation view with a clear way back.
- Session mode visibly distinct without making Quick Timer more complicated.
- Responsive layouts for desktop, mobile, and projected screens.
- Preserve Light/Dark/System; user-selected custom color palettes are a **later** feature.

## 6. Product questions to resolve before implementation

1. **Mode switch during active countdown:** Disable switching or allow it with explicit confirmation? Never silently discard progress.
2. **Restart vs. Stop & Reset:** Define precise behavior for Quick Timer and Session Timer, including when paused.
3. **Ad-hoc early exit:** Define the difference between Stop, Close, Return, and completion at zero.
4. **Overall session time:** Define behavior when a phase runs over, is skipped, restarted, or extended; account for automatic/manual transitions.
5. **Fullscreen:** CSS presentation mode only, or browser Fullscreen API where available? Test external displays and mobile compatibility.
6. **Session editor:** Editing workflow, field validation, reordering, total duration, and mistake prevention.
7. **Timing accuracy:** Audit state transitions and assess deadline-based clocks before refactoring timing.
8. **Visual system:** Final spacing, typography, colors, and header layout after reviewing the current running UI.

## 7. Proposed implementation roadmap — no authorization implied

- **ET-001 — Timer state model:** Document and agree on Start/Pause/Resume/Restart/Stop/Reset semantics. Ad-hoc return behavior is already settled; early-exit behavior is not.
- **ET-002 — Menu-free header/navigation:** Move navigation controls in small, independent steps **without changing timer mechanics**.
- **ET-003 — Quick Timer UX and presentation view:** Simplify the primary timer experience.
- **ET-004 — Ad-hoc, sessions, editor:** Improve contextual interactions and session editing.
- **ET-005 — Later:** Custom colors and further visual polish.

**Workflow:** Inspect the current implementation for each task; propose a small, testable change; obtain approval; make one focused commit; run targeted checks; report; **STOP**. No automatic push or production deployment.

## 8. Explicit non-decisions

- No decision to adopt a framework, add a backend, replace the stack, or introduce a new design system.
- No finalized palette, session-editor layout, or responsive specification.
- No authorization to remove the menu immediately or rewrite timer behavior as part of a visual change.
- No claim that manual ad-hoc return or revised header has already been implemented.

## 9. Language policy

**All repository content is English-only:** documentation, source code, inline comments, test assets, UI strings, and commit messages. Conversation with the project owner is in German. This file is the canonical English-language record of the current UX discussion.
