# RBS' easyTimer

A lightweight browser-based countdown for workshops, meetings, facilitation, and presentations.

**Live application:** https://et.rbsnet.at/  
**Source:** https://github.com/nox-vobiscum/easytimer

## Current features

- Normal countdown with duration inputs and quick presets
- Start, pause/resume, and reset controls
- Large presentation-style timer view with responsive layouts
- Ad-hoc countdown for temporary discussions, with separate timer controls
- Session mode with editable workshop phases and phase durations
- Automatic or manual transitions between session phases
- Light, Dark, and System themes
- Browser-local persistence for selected preferences and session settings
- No required backend or external runtime dependencies

> **Current implementation vs. planned UX:** The application still uses a hamburger menu for theme and mode selection, and the current ad-hoc return behavior has not yet been verified against the approved manual-resume requirement. The proposed header, visual simplification, and other future changes are documented separately; they are not implemented features.

## Run locally

Open `src/index.html` in a browser. A static local web server is also suitable for development.

There is no framework build step required by the currently documented application.

## Project layout

```text
src/
  index.html         Main UI
  css/styles.css     Styles, layout, and theme tokens
  js/app.js          Timer logic, state, and interactions
docs/
  BRIEFING.md        Project rules, technical baseline, and workflow
  EASYTIMER_UX_CONCEPT.md  Proposed UX direction and decisions
```

## Product direction

The goal is a clear, timer-first interface with three use cases:

1. **Quick Timer:** A straightforward countdown with a highly legible presentation view.
2. **Ad-hoc Timer:** A separate short timebox that interrupts the main timer without discarding its state.
3. **Session Timer:** A sequence of workshop phases with individual timeboxes and an overall remaining-time display.

### Confirmed requirement

**An ad-hoc timer must never automatically resume the main timer.** After ad-hoc completion, the user returns to the saved main timer and resumes it deliberately. This describes the target behavior; the current implementation requires review before it can be considered compliant.

### Planned, not yet implemented

- Remove the hamburger menu; place labeled Timer/Session mode selection and Light/Dark/System controls in the header.
- Keep session-specific controls near the session workflow.
- Streamline timer control states, presentation visuals, and the session editor.
- Consider more accurate deadline-based countdown timing.
- Add user-configurable colors later.

For decisions, open questions, and saved desktop/mobile wireframes, see [`docs/EASYTIMER_UX_CONCEPT.md`](docs/EASYTIMER_UX_CONCEPT.md).

## Contribution and language conventions

- Repository files, source code, comments, UI text, documentation, tests, and commit messages are **English-only**.
- Project conversations with the owner take place in **German**.
- Prefer small, focused changes; keep CSS in `src/css/styles.css`.
- Do not combine timer-logic changes with visual redesign work without approval.
- Consult [`docs/BRIEFING.md`](docs/BRIEFING.md) before implementation.

## Status

The application is live. The UX refresh is in the **planning** stage; no redesign or deployment is authorized by this README.
