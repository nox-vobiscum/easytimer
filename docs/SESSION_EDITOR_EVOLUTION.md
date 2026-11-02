# Session Editor Evolution & Facilitator Panel

**Status:** Strategic direction agreed; concept and implementation details pending. **Priority:** High / Near-term. **Implementation authorized:** No.

## Purpose

Make easyTimer more useful for preparing and facilitating real workshops while keeping the timer itself simple, reliable, and visually quiet.

**Product principle:** Prepare in the Session Editor. Run the workshop in the Session Timer. Open a facilitator's cheat sheet only when needed.

This is a focused evolution of easyTimer, **not** an attempt to recreate SessionLab or build a general workshop-management platform.

## 1. Session Editor — preparation workspace

Give the Session Editor more space and a clearer identity as a first-class feature rather than a compact settings panel. Keep the default workflow approachable; richer details should be available on demand.

**Editor layout decision — expandable phases:** Use a compact phase list with on-demand expandable details (accordion pattern), not a permanently split list/detail layout. Responsive behavior is a high priority, including practical editing on mobile devices. Optimize for typical team days and workshops with roughly 10–12 units rather than complex training schedules with 30+ sessions. Keep the collapsed list easy to scan; the details do not need to be visible all the time.

**Editable rundown metainfo — concept addition:** Allow freely editable information associated with the whole Rundown, independently of individual phases (for example workshop goals, a day agenda, general orientation or welcome text). The precise fields and presentation are still open design questions. As a separate *future idea*, this content might later appear as a welcome screen while the Session Timer is READY (for example on a projector as participants arrive), potentially with optional branding such as a company logo. Neither a welcome screen nor branding is part of the current implementation scope; existing timer behavior must remain unchanged.

### Phase detail disclosure — agreed UX direction

- Keep the phase list compact and use **expandable/collapsible phase details** (accordion pattern), with responsive/mobile use as a strong consideration. This is intended for typical workshops or team days of roughly 10–12 phases, not large-scale session-planning software.
- Provide **one subtle disclosure button** combining a list/agenda icon with a chevron. The same button both indicates whether optional phase information is present and opens/closes the details.
- **Outline list icon:** no optional prepared information exists for the phase. **Subtly filled/solid list icon:** at least one optional item exists, whether a note, labeled resource link, or another future optional detail. Do not distinguish content categories or counts through additional markers.
- The chevron communicates only expansion state (down = collapsed, up = expanded); the outline/solid treatment communicates only content presence. These two states are independent.
- Avoid alarming colors, notification dots, badges, or extra buttons. Provide a sufficiently large touch target, keyboard operation, and accessible labels/expanded state.
- **Exact placement within the existing phase action area and responsive layout remain open** until evaluated against the real editor UI; do not prescribe button order or positioning at the concept stage.

### Expanded phase content and editing — agreed UX direction

- The expanded phase displays **two clearly labeled sections, both visible at a glance**: **Notes** and **Links & Resources**. Do not nest accordions or add file uploads.
- **Notes:** When empty, show a subtle clickable placeholder (“Notiz hinzufügen…” / appropriate English equivalent). Both clicking the preview/placeholder and a separate minimal edit button open the same lightweight text editor.
- Display long notes as a **two- or three-line clamped preview with ellipsis**, not a fully expanded wall of text. Opening the editor reveals the complete content. Support only basic formatting such as emphasis and lists; exact editing and serialization technology remain undecided.
- **Links & Resources:** A single initial section for labeled URLs to websites, boards, presentations, images, documents, videos and other externally hosted material. Each item has display text and a URL; the read view shows only its linked label with a link icon. Clicking the label opens the URL in a **new tab**; a separate minimal edit button edits the entry. When empty, show “Link/URL hinzufügen…” / appropriate English equivalent.
- **Edit actions:** Minimal icon buttons for **Save (checkmark), Cancel and Delete**. Save accepts the current edit into the editor's rundown draft (not an automatic library/template save). Cancel exits editing and restores the last saved state for the item; deleting a note removes its content and returns its section to the empty placeholder. Clicking outside the editor causes **no action**: no implicit save, cancel or delete.
- All these action buttons use a **minimal monochrome icon style**: no signal colors or emoji, with accessible names, keyboard operation, and minimum usable touch-target sizes. Exact placement and responsive spacing remain subject to real-layout review.
- A future richer Google Drive/file integration may justify separating Links from Resources; **not part of the initial version**. Similarly, separately intended **public/presentable vs. moderator-reference notes** are a future concept only. The initial version has no privacy, role or owner-only enforcement; a truly confidential view would need its own later security and access-control design.
- The data contract for basic formatting, storage/validation, JSON import/export, recovery and optional sync requires a separate explicit review; no library or persistence format is selected by this UI decision.

### Responsive overlay editors — agreed MVP UX

- Edit both **Notes** and **Links & Resources** in an overlay instead of expanding editable controls inline within the phase. On desktop, use a spacious dialog; on mobile, use a near-full-screen overlay to maximize usable editing space.
- The Notes overlay exposes the complete note and only basic formatting controls. The Links & Resources overlay can edit **multiple/all labeled URL entries in one session** rather than requiring a separate dialog per link; scroll its contents when needed.
- The mobile layout must adapt to the **actually visible viewport when the on-screen keyboard is open**, keeping the active field usable and actions reachable with scrolling where necessary. Verify actual behavior on mobile devices/browsers; no universal keyboard/viewport behavior is assumed.
- Saving applies the overlay edits to the rundown **draft**, closes the overlay, and refreshes the expanded phase preview. Final persistence remains governed by the existing explicit Rundown Save flow.
- **Cancel/close must guard against accidental loss of edits with a confirmation dialog when there are unsaved changes.** Confirmed discard restores the pre-edit contents; declining the confirmation returns to editing. The earlier rule remains: tapping/clicking outside the overlay does nothing.
- Keep Save, Cancel and Delete as restrained monochrome icon actions with accessible names and adequate touch targets. Exact visual layout and the behavior of Delete within the multi-link overlay remain for later layout/interaction review; this concept does not select an editor library or a serialization format.

### Rundown library: templates and independent executions — agreed product direction

- Distinguish **reusable templates** from **individual workshop rundowns / executions** in the user's library. A user may create and deliberately edit templates, then prepare a separate workshop-specific rundown from one (with or without customization). Starting an unchanged template still creates an **independent execution entity**, not a modification of the original.
- An execution progresses from planned to active to completed. **Each completed execution remains independently available in the user's library**, rather than disappearing or being silently merged into its source template. The completion/archive UX still requires review; the top-level library navigation is decided below.
- Make the distinction **unmistakable in the UI** through a meaningful icon and/or a short text label; don't rely on subtle iconography alone when template edits might be mistaken for changes to an individual execution. Decide the exact placement against real desktop/mobile layouts.
- An ongoing execution may evolve without retroactively changing completed phases. Edits to **current and upcoming phases** must respect the already accepted ET-001 decisions 39–43, 45–48, 53–56: completed phases remain protected; the current phase cannot be deleted/reordered, but its allowed title/duration adjustments are governed by the existing explicitly approved timing/conflict rules; upcoming phases may be changed. **No timer or recovery behavior change is authorized by this concept document.** Runtime-edit implementation remains separately scoped under ST-003.
- Retain the execution's actual changes, phase outcomes, overtime and other relevant history with that execution when completed (precise historical data and retention contract to be designed). **Optionally** allow its *reusable planning content* to be applied to the originating template, but only via an unambiguous, deliberate confirmation. The template must never be silently overwritten; the owner wants **recoverable version history** if template replacement is offered. The replacement dialog, versioning, restore flow, selection of transferable fields, and treatment of actual runtime statistics require a separate UX/data-contract review.
- Account-free local use and JSON portability remain important. Google Drive, cross-device persistence and any potential server/database service are **separate future architectural evaluations**, not prerequisites or decisions of this library concept.

### Library navigation — agreed two-tab layout

- Use **one Rundown library with two distinct tabs**: **My Templates** / **Meine Vorlagen** and **My Executions** / **Meine Durchführungen**. Do not place both lists in one long stacked view. This is a deliberate responsive choice, particularly valuable on mobile, but applies to desktop too.
- Keep reusable templates and individual planned/active/completed executions visually and semantically distinct within their respective tabs. The exact per-item controls, lifecycle indicators and sorting remain for the next UX review.
- Keep a subtle entry point to the built-in example rundowns in the **Templates** area rather than requiring a permanently visible third main tab or a large gallery. Exact placement remains open.
- **Library search** is a desirable **later enhancement**, not a requirement of this initial library layout. Do not add filters, advanced navigation or other features by implication.

### Predefined categories for rundowns and phases — agreed direction

- **Category fields belong in the future data model for both rundowns and individual phases**, irrespective of whether the user explicitly chooses a category. A neutral predefined fallback (such as “uncategorized” / “standard”) must be present in the persisted JSON when none is chosen; the final identifiers and schema migration are not yet selected.
- Categories come from **fixed, application-defined lists**, not user-defined or customizable taxonomies. Possible rundown examples: workshop, congress/conference, meeting, training. Possible phase examples: talk/presentation, discussion, breakout, break. Exact initial lists and labels still require a separate review.
- **Choosing a category remains optional in the UI**. Do not impose a classification step on users who just want to create and run a timer.
- Distinguish a rundown's **library role** (template vs. individual execution), its **lifecycle status** (planned/active/completed), and its **category** (workshop/training/etc.); these are independent concepts.
- Categories may later inform restrained iconography, colors, filtering or semantic cues; no category-specific timer behavior or visual treatment is approved yet. Import/export and backward compatibility with existing category-free JSON must be addressed in the separately approved data contract.

### Built-in example rundowns — agreed product direction

- Supply a **small, curated set of predefined example rundowns/templates**, such as a retrospective and selected project-management meetings. They demonstrate how a rundown is structured and offer a quick start for spontaneous meetings without requiring users to enter phases manually.
- A user may use an example unchanged or adapt it for a specific execution. In either case, **starting it produces a distinct execution**, preserving the source example just as for any other template.
- Make built-in examples recognizable and distinguishable from the user's own saved templates and executions. Whether examples are shown inline, behind an entry point, or can be copied into personal templates is a subsequent library-UX decision; the precise catalog, phase contents, and maintenance/versioning model are not yet agreed.
- Keep this possible without an account, and avoid mandatory onboarding or a large preset gallery.

Potential information to prepare:

- **Rundown:** title, ordered phases, and rundown-level facilitation notes.
- **Each phase:** existing title and duration, phase-specific facilitation notes, and a small set of **labeled external links** (e.g. Miro board, presentation, document, image, video, or other resource).
- **Predefined phase category:** stored with a neutral fallback even when not explicitly selected (for example presentation, discussion, group work, breakout, break); optional visual cues may follow later without changing timer behavior.

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

- For the decided expandable-phase layout, which fields remain visible when collapsed, and how should expanded details behave on mobile?
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
