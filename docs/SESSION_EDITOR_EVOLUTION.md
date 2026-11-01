# Session Editor Evolution & Facilitator Panel

**Status:** Strategic direction agreed; concept and implementation details pending. **Priority:** High / Near-term. **Implementation authorized:** No.

## Purpose

Make easyTimer more useful for preparing and facilitating real workshops while keeping the timer itself simple, reliable, and visually quiet.

**Product principle:** Prepare in the Session Editor. Run the workshop in the Session Timer. Open a facilitator's cheat sheet only when needed.

This is a focused evolution of easyTimer, **not** an attempt to recreate SessionLab or build a general workshop-management platform.

## 1. Session Editor — preparation workspace

Give the Session Editor more space and a clearer identity as a first-class feature rather than a compact settings panel. Keep the default workflow approachable; richer details should be available on demand.

Potential information to prepare:

- **Rundown:** title, ordered phases, and rundown-level facilitation notes.
- **Each phase:** existing title and duration, phase-specific facilitation notes, and a small set of **labeled external links** (e.g. Miro board, presentation, document, image, video, or other resource).
- **Optional phase type:** e.g. presentation, discussion, exercise, break, group work, breakout. A subtle color and/or icon may aid recognition in both Editor and Timer, without changing timer behavior.

No file uploads or embedded multimedia storage are planned. Links/shortcuts to resources are sufficient for the initial scope. A direct integration with Miro is explicitly out of scope for now; links to Miro boards are in scope.

## 2. Facilitator Panel — on-demand reference, not a workspace

Keep the existing Session Timer and its controls substantially unchanged. In the moderator's view, an unobtrusive collapsed affordance (e.g. a slim edge tab) may open a panel or overlay **only after an intentional action**.

When opened, the panel presents the prepared notes and resource links for the **current phase**, plus relevant rundown-level information. It is analogous to PowerPoint presenter notes: a facilitator's cheat sheet, not another timer controller or a full editor.

Requirements and boundaries:

- Collapsed by default; no automatic disclosure of notes.
- Must not disrupt, pause, reset, or otherwise influence the running timer.
- No duplicated timer controls, phase-editing UI, or management dashboard.
- Appropriate desktop/mobile behavior to be designed later; avoid disturbing fullscreen or minimal display modes.
- The content is **not confidential by design**. If a shared screen or accessible view exposes the panel, notes may be visible. Do not rely on hiding the panel for security.

Separate moderator/audience views are a possible future enhancement, **not** a dependency for the first panel.

## 3. Small notes captured during a workshop

An optional, lightweight input may record spontaneous reminders or observations during a run, such as a topic to revisit, a useful URL, or a suggestion for the next training.

- Notes may be associated with the **current phase** or the **whole rundown**; the exact UX and storage model require a later decision.
- **Prepared notes** and **notes captured during a run** remain conceptually distinct.
- Captured notes should remain available when the panel is closed; persistence and recovery rules require explicit design.
- Moving a captured note into the saved Rundown is **optional and explicit**. Never silently overwrite a template or mutate an active run's original definition.
- Keep capture intentionally simple: no task tracking, chat, collaboration, or elaborate note editor.

## 4. Architecture and scope guardrails

- Preserve one authoritative timer state and existing Session Timer behavior.
- Maintain the distinction between the saved Rundown definition, the active run's snapshot, and notes captured during that run.
- Any extension to persisted Rundown data must be designed and tested with existing library storage, validation, JSON import/export, compatibility with saved data, and recovery. The optional Google synchronization work must not be accidentally broken.
- No own backend, database, account system, file hosting, or mandatory Google login for the initial increments.
- No new confidentiality, roles, or access-control system in this initiative.
- Cross-device **live timer synchronization** is a separate, strategically important feature and takes priority over private notes or role-gated views. Google identity alone must not be mistaken for live state synchronization.
- Future Miro embedding/integration is out of scope.

## 5. Candidate incremental delivery path (not yet approved)

1. **Concept and data contract:** settle preparation fields, backward-compatible storage/JSON behavior, and the active-run snapshot boundary. Treat data-model changes as higher-risk than cosmetic UI work.
2. **Editor workspace and prepared content:** progressively add more usable phase details, rundown/phase notes, and labeled resource links without losing the simple phase-list workflow.
3. **Read-only Facilitator Panel:** reveal prepared information on demand in the current Session Timer, without changing timer controls or transitions.
4. **Lightweight live note capture:** capture phase/rundown observations and optionally transfer selected notes into a saved Rundown after explicit confirmation.
5. **Optional phase types and visual cues:** design restrained phase color/icon conventions for planning and runtime. Do not add type-specific timer logic by default.

These increments may be split or reordered after the detailed UX review. Nothing here authorizes implementation.

## 6. Questions for the later design review

- How should the expanded Editor be arranged (phase list plus optional detail pane, full-width workspace, or another compact approach)?
- Plain text or limited formatting for prepared notes? How many labeled links per phase, and how should URLs be validated/opened?
- Which notes belong to a phase versus the full rundown? What happens on phase changes, reload, recovery, and Session completion?
- Should a running Session's notes be exportable separately before any template transfer?
- Which phase types are actually useful in the owner's workshop practice, and how should they appear in Light/Dark/mobile?
- Where does the collapsed panel affordance live on desktop and mobile, and what happens in fullscreen, landscape, and eventual audience views?

## Suggested entry for `docs/backlog.md`

**EDITOR-001 — Session Editor Evolution & Facilitator Panel**  
**Priority:** High / Near-term — strategic product direction  
**Status:** Concept direction accepted; detailed design and implementation pending.  
**Summary:** Develop the Session Editor into an approachable workshop-preparation workspace with rundown/phase notes, labeled resource links, and optional visually marked phase types. During a run, expose prepared information through an unobtrusive, intentionally opened, primarily read-only Facilitator Panel; optionally capture small run-specific notes and explicitly transfer selected notes to the saved Rundown. Preserve the existing timer, active-run snapshots, JSON portability, and simplicity. No initial file uploads, own backend/accounts, confidentiality model, or Miro integration. Cross-device live timer synchronization remains a separate higher-priority concern than private/role-specific notes.  
**Detail:** [`SESSION_EDITOR_EVOLUTION.md`](SESSION_EDITOR_EVOLUTION.md)
