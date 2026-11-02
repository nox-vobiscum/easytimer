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
- An execution may be planned, active in the timer, deliberately suspended, and eventually completed. **Each completed execution remains independently available in the user's library**, rather than disappearing or being silently merged into its source template. The completion/archive UX still requires review; the top-level library navigation is decided below.
- Make the distinction **unmistakable in the UI** through a meaningful icon and/or a short text label; don't rely on subtle iconography alone when template edits might be mistaken for changes to an individual execution. Decide the exact placement against real desktop/mobile layouts.
- An ongoing execution may evolve without retroactively changing completed phases. Edits to **current and upcoming phases** must respect the already accepted ET-001 decisions 39–43, 45–48, 53–56: completed phases remain protected; the current phase cannot be deleted/reordered, but its allowed title/duration adjustments are governed by the existing explicitly approved timing/conflict rules; upcoming phases may be changed. **No timer or recovery behavior change is authorized by this concept document.** Runtime-edit implementation remains separately scoped under ST-003.
- Retain the execution's actual changes, phase outcomes, overtime and other relevant history with that execution when completed (precise historical data and retention contract to be designed). **Optionally** allow its *reusable planning content* to be applied to the originating template, but only via an unambiguous, deliberate confirmation. The template must never be silently overwritten; the owner wants **recoverable version history** if template replacement is offered. The replacement dialog, versioning, restore flow, selection of transferable fields, and treatment of actual runtime statistics require a separate UX/data-contract review.
- Account-free local use and JSON portability remain important. Google Drive, cross-device persistence and any potential server/database service are **separate future architectural evaluations**, not prerequisites or decisions of this library concept.

### Execution lifecycle, interruption and discard — agreed conceptual rules

- Use **four user-visible library lifecycle statuses**: **Planned** / **Geplant**; **Active in Timer** / **Im Timer aktiv**; **Suspended** / **Unterbrochen**; **Completed** / **Abgeschlossen**. Only one execution may be active in the authoritative Session Timer at a time; **multiple suspended executions may coexist** in the library and be resumed individually later. This is a future capability, not a claim about the currently implemented recovery store.
- Prefer **Im Timer aktiv** to ambiguous **Aktuell** or **Läuft**. When the actual authoritative clock state is reliably available, supplement it with a localized live substatus: for example **Im Timer aktiv (bereit/läuft/pausiert)**, plus accurate overtime variants where applicable. If the substatus cannot be determined confidently (for example due to cross-tab ownership/recovery), display **Im Timer aktiv** alone rather than a stale or misleading claim.
- **Pause** / **Pausieren** and **Suspend** / **Unterbrechen und speichern** are **different operations**. Pause freezes the clock but leaves the execution loaded in the timer. Suspend explicitly saves the execution's current position, phase progress, applicable runtime changes, and timer state, freezes time progression, and **releases the timer for a different session or Quick Timer**.
- A suspended execution can be **resumed at the saved point**, including across days, independently of other suspended executions. On reactivation, its timer must initially be **paused/frozen** and require an explicit **Continue** / **Fortsetzen** before any time passes. No missed automatic phase transitions, time accrual or overtime must be caused by the wall-clock interval spent suspended. Preserve the single authoritative clock/ownership model and the applicable ET-001 editing and recovery invariants.
- **Edit a suspended execution directly from the library without activating it in the timer**. The user may open the Session Editor to refine the suspended rundown (for example, shortening an upcoming phase while travelling), save the changes, and leave its lifecycle status **Suspended**. The user must not be forced through **Resume in Timer** to make planning edits, and editing must not interrupt a different currently active execution.
- Keep the **already completed phases immutable**; the suspended current phase and upcoming phases follow the applicable ET-001 in-session editing rules. In particular, the suspended current phase cannot be removed or reordered; allowed title/duration edits must preserve already elapsed time and the frozen pause/overtime semantics. Future phases may be edited/reordered/removed under the existing constraints. Changes during suspension must not run the clock or silently trigger phase transitions; the recalculation rules for shortened current phases, including automatic mode and existing overtime, require an explicit data-contract/test review.
- **Edit** / **Bearbeiten** and **Resume in Timer** / **Im Timer fortsetzen** are independent, easily discoverable actions for suspended executions. They may be available together in the row's hybrid action area; exact action hierarchy, positioning and mobile layout remain for visual UX review. Editing applies to the **execution**, never silently to its originating template.
- Use conflict-safe isolated drafts and explicit save/cancel behavior. Only commit a valid edit against the correct suspended execution state; preserve the frozen progress snapshot if saving fails or a conflicting update occurs. This introduces future offline editing of dormant run states; it is not implemented by existing single-context runtime recovery.

- **Discard current attempt** / **Durchlauf verwerfen** is distinct from **suspend** and **delete**. Following explicit confirmation, it clears the execution's run progress, recorded actual times/overtime, and run-specific history, releasing the timer and returning **the same individual execution** to the **Planned** status, ready for an entirely fresh start. Its original source template remains untouched. The intent is the same fresh, not-yet-started execution; precise rollback treatment of structural edits made while running must be specified in the later execution-data contract to avoid accidental loss.
- **Delete** remains an explicit, separately protected library management action. Discarding an attempt **does not delete** the prepared execution. Do not treat suspension as workshop completion or append a suspended run to immutable completed history.
- Switching to a different execution while one is active must not silently replace/discard progress: the user needs a clear, intentional choice to suspend/save, discard/reset, or cancel the switch, with separately guarded completion if appropriate. Only release the old runtime after the requested state has been saved successfully; failures preserve the existing active execution and report the problem.
- The library's **Completed** state represents an intentionally finalized and retained record, not merely the engine's internal `run.stage === 'COMPLETED'` while final overtime or other completion controls may still be active. Exact finalization UI and data contract remain for separate review.
- Storage, recovery/ownership, JSON compatibility and crash safety need explicit design and tests before implementation. The current single-context runtime recovery is **not** already a durable multi-suspended-execution library. This concept requires no account or cloud as a prerequisite.
- Exact actions/buttons for planned, active and suspended execution rows still require dedicated layout/UX review; lifecycle semantics here are agreed independently of their placement.


### Switching away from an active execution — explicit plain-language choices (agreed UX)

- When starting or activating another execution while one is **Im Timer aktiv**, present a clear, **plain-language decision dialog**. Identify the current execution by name and state that continuing with the new selection requires a decision about its current progress. Avoid opaque abbreviations, unexplained icon-only actions, and generic confirmation wording such as “Replace?”.
- Show each available action with its **full, descriptive button label** and a **short, smaller explanatory line directly beneath it**. Both belong together visually and semantically; the explanation must remain legible on narrow/mobile screens and available to assistive technology. Example German copy (refine DE/EN wording in the later copy review):
  - **Unterbrechen & speichern** — “Der Rundown wird im aktuellen Zustand gespeichert und kann zu einem späteren Zeitpunkt an derselben Stelle fortgesetzt werden.”
  - **Durchlauf verwerfen** — “Der aktuelle Durchlauf wird zum Startpunkt zurückgesetzt. Der bisherige Fortschritt wird verworfen; die geplante Durchführung bleibt erhalten.”
  - **Zurück zur aktuellen Session** — “Es wird nichts verändert. Die aktuelle Durchführung bleibt im Timer aktiv.”
- Suspend/save and discard/reset are **distinct decisions**; neither is the same as pausing, completing, or deleting a rundown. Discard is potentially destructive: the user must make an unambiguous conscious choice, consistent with the explicit confirmation guardrail above. Whether a second confirmation is necessary or the fully explained selection itself suffices is a later interaction-design review, not a default to add extra dialogs.
- Switching must happen **only after** the chosen suspend/save or discard/reset operation succeeds. A save failure must leave the current execution active, with its progress intact and a clear error message. Cancel, Escape, or closing the decision dialog must not silently change the run or timer.
- Keep option wording and descriptions more important than compactness or iconography. Exact controls/spacing, ordering, focus and keyboard interactions are to be tested against desktop/mobile; do not preselect the final widget or visual styling here.

### Completed executions — immutable record and one post-session note (agreed UX)

- A completed execution remains in the user's library as an **immutable record of its actual course**. Its phase sequence, recorded durations/overtime, prepared and run-time notes, links, and other execution history are **read-only after completion**; do not retroactively alter the documented workshop.
- Provide exactly **one separate, optional post-session reflection/annotation field per completed execution**, not one field per phase and not a collection of note cards or stickies. It is distinct from the frozen original run notes and may be edited after completion.
- The post-session field keeps **one current saved value only**. Replacing or clearing it deliberately discards the previous content: **no per-edit version history, append-only log or restoration requirement** for this field. Standard explicit edit/save/cancel safeguards can be reviewed with the UI; no extra note-management feature is implied.
- This decision does **not** remove the separately requested, recoverable **template versioning** for an explicit replacement of a reusable source template. Completed-run records and template replacement are different concerns.
- Exact positioning of the reflection field and the remaining actions for completed executions belong to the later library UX review. This concept authorizes no runtime or storage implementation.

### Library navigation — agreed two-tab layout

- Use **one Rundown library with two distinct tabs**: **My Templates** / **Meine Vorlagen** and **My Executions** / **Meine Durchführungen**. Do not place both lists in one long stacked view. This is a deliberate responsive choice, particularly valuable on mobile, but applies to desktop too.
- Keep reusable templates and individual planned/active-in-timer/suspended/completed executions visually and semantically distinct within their respective tabs. The exact per-item controls, lifecycle indicators and sorting remain for the next UX review.
- Keep a subtle entry point to the built-in example rundowns in the **Templates** area rather than requiring a permanently visible third main tab or a large gallery. Exact placement remains open.
- **Library search** is a desirable **later enhancement**, not a requirement of this initial library layout. Do not add filters, advanced navigation or other features by implication.

### Template library actions — agreed hybrid UX

- Provide **two separate, directly accessible entry points** on each user template: **Start Session** / **Session starten** (the primary action) and **Plan Execution** / **Durchführung planen** (a quieter secondary action). The latter must not be buried in an overflow menu.
- **Start Session** creates an **independent execution**, opens the existing Session Timer at phase 1 **READY**, and does not start the countdown. When another execution is active, require a deliberate, safe handoff rather than silently discarding it; the detailed suspend/discard/return UX belongs to the lifecycle review below. The existing released replacement confirmation remains unchanged until a separately approved implementation. This future library change must not alter countdown, transition or ownership behavior.
- **Plan Execution** starts an **independent workshop-specific draft** based on the template and opens it for editing before launch. It must not modify the source template; discarding an unsaved planning draft must not silently create an unwanted saved execution. Exact creation/persistence timing belongs to the later data-contract review.
- Use a **hybrid action layout** for template rows: primary Start Session plus a directly accessible but visually subordinate Plan Execution; place **Edit Template**, **Export**, and **Delete** in a clearly labeled, accessible contextual/overflow menu. Deliberate editing of the original must be unmistakably distinguished from planning a copy. Preserve explicit deletion confirmation and existing unsaved-change safeguards.
- Both entry points must remain readily discoverable on **mobile and desktop**, with readable labels, keyboard access, visible focus and adequate touch targets (at least the established 44px standard). Exact action placement, narrow-screen wrapping, icons and menu interaction require review against the actual UI; do not commit to a fixed row layout here.
- **Built-in examples** must likewise be usable for quick launch or planning without changing their originals; original-edit/delete actions are not appropriate for immutable built-ins. Actions for **planned, running and completed executions** are a separate UX-review item, not implicitly decided by these template-row rules.
- This is a **future UI specification only**, not authorization to change the existing released direct-action row or any runtime/storage implementation.

### Predefined categories for rundowns and phases — agreed direction

- **Category fields belong in the future data model for both rundowns and individual phases**, irrespective of whether the user explicitly chooses a category. A neutral predefined fallback (such as “uncategorized” / “standard”) must be present in the persisted JSON when none is chosen; the final identifiers and schema migration are not yet selected.
- Categories come from **fixed, application-defined lists**, not user-defined or customizable taxonomies. Possible rundown examples: workshop, congress/conference, meeting, training. Possible phase examples: talk/presentation, discussion, breakout, break. Exact initial lists and labels still require a separate review.
- **Choosing a category remains optional in the UI**. Do not impose a classification step on users who just want to create and run a timer.
- Distinguish a rundown's **library role** (template vs. individual execution), its **lifecycle status** (planned/active-in-timer/suspended/completed), and its **category** (workshop/training/etc.); these are independent concepts.
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
