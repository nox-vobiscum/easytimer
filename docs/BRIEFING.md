# RBS' easyTimer — Project Briefing

**Last reviewed:** 2026-10-19  
**Repository:** https://github.com/nox-vobiscum/easytimer  
**Production URL (reported):** https://et.rbsnet.at/

## 1. Purpose and scope

easyTimer is a lightweight, browser-based timer for meetings, facilitation, and workshops. The timer display should be exceptionally easy to read on external meeting-room screens. Keep the tool simple, intuitive, dependency-free where practical, and inexpensive to host.

Three use cases define the product:

1. **Quick Timer:** Set a duration, start, pause/resume, restart, stop/reset, and switch to an enlarged presentation view.
2. **Ad-hoc Timer:** Temporarily pause the main countdown for a separately timeboxed discussion.
3. **Session Timer:** Prepare workshop phases with their own durations and show both the current phase and total remaining session time.

The Quick Timer is the primary use case. The countdown is the primary visual element. Advanced controls should appear in context instead of competing with the clock.

## 2. Current implementation (repository snapshot, not a production browser test)

- **Runtime:** Static client-side web application; no backend required.
- **Stack:** HTML, CSS, vanilla JavaScript; no external runtime dependencies documented.
- **Main files:** `src/index.html`, `src/css/styles.css`, `src/js/app.js`.
- **Styling:** CSS custom properties, including Light/Dark/System appearance.
- **Application state:** Implemented in `app.js`; some preferences/session configuration use browser `localStorage`.
- **Timing:** The current implementation decrements counters using `setInterval(..., 1000)`. Accuracy during tab throttling/backgrounding needs review.
- **Presentation view:** Implemented as a CSS fullscreen-style display; do not assume the browser Fullscreen API is in use.
- **Existing session features:** Session editor; automatic/manual phase transitions; option to show time inputs.
- **Existing navigation:** Hamburger menu currently contains mode, theme, and session-related settings.
- **Testing:** No automated test suite or coverage level has been verified for the repository. Do not assume JUnit, Playwright, or a build pipeline is configured.
- **Deployment:** The production URL is known; hosting, deployment mechanics, and any CDN/proxy need verification before changes.

Treat the actual checked-out files as the source of truth for implementation details. The UX concept describes desired behavior, not proof of existing behavior.

## 3. Language policy — mandatory

- **Chat and planning conversations with the user:** German.
- **Everything committed to the repository:** English, including README, briefings, concepts, backlog, user-facing UI copy, code, comments, identifiers, tests, commit messages, and future agent instructions stored in the repository.
- **Current product language:** English. Translation/localization is not part of the approved scope.
- Do not mix German text into repository documents or source files.

## 4. Product decisions and design direction

### Approved: Manual return from ad-hoc timer

- Opening an ad-hoc timer pauses a running main timer and preserves its remaining duration.
- Ad-hoc pause/resume does not modify the main timer.
- At ad-hoc completion, clearly indicate that its timebox has ended; the main timer **must not** resume automatically.
- A deliberate **Return to main timer** action returns to the saved main countdown; only a separate, deliberate **Resume** action restarts it.
- If the main timer was already paused when ad-hoc began, it remains paused afterward.
- Details for prematurely stopping/closing ad-hoc, and the exact completion signal, remain unresolved.

### Preferred but not yet approved for implementation: Menu-free navigation

- Consider removing the hamburger menu and placing labeled **Timer / Session** mode selection and compact **Light / Dark / System** theme controls in the header.
- Desktop concept: one header row; mobile concept: a compact two-row header is acceptable.
- Move session-specific actions to the session context, not a global menu: editing phases, transition mode, and visibility of time inputs.
- Mode switching while a countdown is active must not silently discard progress. Exact treatment is still an open decision.
- Preserve current behavior until a specific implementation task has been reviewed and approved.

**Canonical discussion record and ASCII wireframes:** `docs/EASYTIMER_UX_CONCEPT.md`.

## 5. Collaboration workflow (developer ↔ AI coding agent)

1. **Read first:** Inspect `README.md`, this briefing, the UX concept, and the current relevant source files before suggesting edits.
2. **Verify before changing:** Inspect current branch, worktree status, exact code paths, and available tests. Do not assume old chat context matches the repository.
3. **Plan before implementation:** State the specific goal, files, risks, and targeted validation. Ask about unresolved product decisions; do not invent answers.
4. **One small scope at a time:** Avoid bundling layout changes with changes to timer mechanics. Prefer minimal, reversible patches and one focused commit per approved task.
5. **Respect approval gates:** Discussion and documentation do not authorize implementation or deployment. Stop after the agreed task and report changes and tests. Do not push or deploy unless explicitly instructed.
6. **Keep dependencies lean:** No framework or backend migration is planned. Justify any new dependency beforehand.
7. **CSS centralization:** Put styles in `src/css/styles.css`, reuse existing tokens/classes, avoid inline styles where practical.
8. **Test honestly:** Run the checks that actually exist; for changed timing behavior, manually validate the relevant states and browser-background behavior. Do not claim a test suite or coverage metric that was not observed.
9. **Documentation hygiene:** Update documents only to reflect verified implementation or explicitly labeled design decisions. Do not silently convert proposals into completed features.

## 6. Immediate workstream (planning only)

- **ET-001:** Specify timer states and exact Start/Pause/Resume/Restart/Stop/Reset behavior; establish ad-hoc stop/close/finish semantics.
- **ET-002:** Simplify navigation/header without changing timer mechanics.
- **ET-003:** Improve Quick Timer controls and presentation display.
- **ET-004:** Improve ad-hoc/session interactions and session editor usability.
- **ET-005 (later):** User-configurable colors and additional visual polish.

This sequence is proposed, not an authorization to edit code.

## 7. Open questions

- What should a mode switch do while the main timer is active or paused?
- What exactly differentiates Restart from Stop & Reset in Quick Timer and Session Timer?
- What should Stop and Close mean for an active or paused ad-hoc timer?
- How should total session time behave when phases are skipped, restarted, extended, or exceeded?
- Should presentation mode remain CSS-only or use the browser Fullscreen API where supported?
- How should session rows be edited, reordered, validated, and summarized?
- Should countdowns use a monotonic clock/deadline to avoid `setInterval` drift?
- What are the actual deployment and testing procedures for this repository?

## 8. Accessibility and quality expectations

- Controls should be keyboard-operable, visibly focused, accurately labeled, and understandable without relying only on icons or color.
- Modal dialogs and overlays need deliberate focus/escape behavior; do not introduce regressions while refactoring navigation.
- Time readouts need strong contrast, clear state labels, and sensible behavior at zero.
- Test desktop, mobile, and presentation-size viewports; verify behavior in background tabs if timing logic changes.

## 9. Starting a future working session

Open the **easytimer** folder as the VS Code workspace, not the separate Planning Poker repository. Confirm branch/status and source files; read this briefing and `docs/EASYTIMER_UX_CONCEPT.md`; propose one bounded next action in German to the user, while keeping all repository text and coding-agent deliverables in English.
