# EDITOR-001 / UX-001 — Consolidated UX decisions (2026-11-16)

**Status:** Product Owner decisions accepted for design; **not** blanket approval for implementation, public rollout or timer/runtime changes.
**Scope:** Library, rundown workspace, phase editing, prepared information, notes/resources, explicit save boundaries and the isolated OverType evaluation.
**Authority:** This file consolidates the focused UX discussion through 2026-11-16. Where an older, exploratory passage in `SESSION_EDITOR_EVOLUTION.md` contradicts a specific decision recorded here **for UX-001 only**, follow this later explicit decision; preserve all unrelated existing EDITOR-001 data, runtime, history, lifecycle and Facilitator Panel contracts. Reconcile conflicting wording in the canonical concept before production integration.
**Source of truth:** Product Owner conversation decisions; verify feasibility against actual repository before implementing. This is not a claim that the UI currently behaves this way.

## 1. Non-negotiable boundaries

- One existing native Schema-2 workspace/editor, one authoritative Store, one existing timer engine. No second editor architecture, timer semantics, recovery or ownership changes.
- Templates and individual executions are separate. Editing or running an execution does not silently mutate its source template.
- Existing locked writes, uncertainty reconciliation, ACTIVE ownership, runtime bridge and previously accepted lifecycle/archive constraints remain authoritative.
- DE/EN parity, accessible keyboard/focus handling, at least 44px touch targets, responsive mobile view, Light/Dark/System themes and central CSS.
- Typical scope: workshops with approximately 10–12 phases; avoid a full project-management system.
- Facilitator Panel remains part of EDITOR-001, but this UX-001 editor discussion does not authorize Panel implementation or redesign.
- Future `PLAN-003` target total duration and `ST-004` consciously untimed phases remain deferred. No implicit scope addition.

## 2. Library and rundown entry

- Two responsive library tabs: **Meine Vorlagen** and **Meine Durchführungen**; never mingle entities in one long list.
- Execution lifecycle sections: **Geplant**, **Im Timer aktiv**, **Unterbrochen**, **Abgeschlossen**. All four can collapse independently; hide empty groups; show counts. The first three start open, Completed starts closed.
- Pagination: **five cards per page** in templates and independently within **each** execution status group. Keep page state while remaining in the library; avoid needless scroll/focus jumps.
- Templates sorted alphabetical A–Z. Executions sorted by **creation** (newest first), not last edit; deterministic tie-break.
- Compact cards show a one-line ellipsized title with accessible/full-name affordance, category icon, planned total duration and relevant status. Show primary action and **Bearbeiten** directly; reserve uncommon actions such as export/delete for accessible overflow.
- Template entries: **Session starten** prepares an independent execution in Session Timer **READY**, never starts the clock; **Durchführung planen** creates a caller-owned unsaved planned copy and immediately opens the editor; save explicitly to persist it. The copy starts with the template title, phases and prepared information intact; no automatic date/team suffix. Duplicate titles allowed without warning.
- The Plan Execution explanation: “Erstellt eine unabhängige Durchführung auf Basis dieser Vorlage, die du vor dem Start individuell anpassen kannst.” Translate consistently to EN.
- For a planned copy from template, desktop initially focuses/selects its title; on mobile highlight/selection may be shown **without automatically invoking the soft keyboard**.
- Creating a new template opens the editor with a visually prepared, initially empty first phase.
- Unstartable records should offer **Bearbeiten** / **Bearbeitung fortsetzen**, not an inert Start button. Provide a subdued `timer-off` affordance and a concrete reason.

## 3. Rundown heading and workshop-wide prepared information

- Header prominently shows the full title (multiline when necessary), selected category and **calculated planned total duration**; do not truncate the main editor heading.
- Title is visibly readable by default and inline-editable by deliberate click/keyboard action; no automatic blinking cursor except the agreed desktop planned-copy case.
- Rundown category is directly selectable without an extra edit dialog. On wider layouts display five icon choices; on narrow layouts use a compact icon/label select.
- Fixed rundown category values: `uncategorized`, `workshop`, `meeting`, `training`, `conference`. Category selection is optional.
- The total is computed, never typed. Display again after the final phase and Add Phase action. Sum *specified valid* timeboxes even when others are missing, **without an ambiguous question-mark suffix**; indicate missing durations separately. Do not introduce the deferred target-duration feature.
- Workshop-wide `preparedInformation` is separate from every phase and is **always represented by a compact collapsible row immediately below the header**, including when empty. Subtle outline marker = no content, solid = content. Default collapsed on reopening.
- Empty expanded row shows only **Workshopinformationen hinzufügen**. Populated row gives a read-only 3–4-line preview, with **Alles anzeigen / Weniger anzeigen** when needed and a deliberate edit action. No giant blank text areas.

## 4. Phase list, categories and actions

- Collapsed phase row contains **only** computed phase number (`01`, `02`…), title, category icon and duration; no note/link previews or action buttons. Entire row is keyboard/press accessible; chevron points right/down.
- Multiple phases can remain independently expanded. Preserve expansion, focus and scroll where feasible across local edits and interim Save. Existing phases start collapsed on reopening; a brand-new or saved zero-phase rundown shows a **visual unpersisted expanded first-phase placeholder**.
- Expanded phase allows direct editing of name and duration, and direct category selection; **expanding alone does not focus an input**. Show category icons inline on wide layouts and a compact select on narrow layouts. Labels/tooltips and keyboard access required.
- Fixed phase category values: `uncategorized`, `presentation`, `discussion`, `breakout`, `break`.
- Agreed icon mapping: rundown none `circle-slash`; workshop custom *lightbulb with small lower-right gear* (legible at 20–24px); meeting `users-round`; training `graduation-cap`; conference `presentation`. Phase none `circle-slash`; presentation `presentation`; discussion `messages-square`; breakout `users`; break `coffee`.
- Expanded phase has visible **move up/down, direct position selection and delete** actions; these do not clutter collapsed rows. Responsive wrapping/placement to be tested rather than imposed prematurely.
- **+ Phase hinzufügen** below last phase: append by default, immediately expand and scroll new phase into view, **focus its name** (including mobile intentional keyboard). Do not collapse other phases. Optional split-button “An Position einfügen” only if trivially reusable; direct position chooser remains sufficient.
- Delete a **currently entirely empty phase** directly with no dialog, regardless of previous editing history. A phase with actual content requires a brief confirmation; deletions remain draft-only until global Save. When no real phases remain, restore the visual blank placeholder.
- Expanded prepared notes show a read-only preview of approximately **3–4 lines** at tentatively 14px, expandable via **Alles anzeigen / Weniger anzeigen**. Links are clickable labeled HTTP(S) resources; show up to three initially with **Weitere anzeigen / Weniger anzeigen**; opening the link uses a new tab. No edit-on-preview click by accident.
- No file uploads, media storage, nested notes accordions or direct Miro integration.

## 5. Empty/incomplete planning state versus valid execution

- A new template or planned rundown can be **saved with no real phases**, with named but incomplete phases, or with incomplete timeboxes. Workshop preparation must not be blocked simply because the agenda is unfinished.
- The first blank visually prepared phase is **not a stored record** if completely untouched. `-- min` means unspecified duration, **not** stopwatch/unlimited time.
- A genuine phase with no name uses **Unbenannte Phase**; its computed order number remains separate from the title.
- **Session starten** requires at least one genuine phase and a valid timebox on **every** genuine phase. No silent skipped phases and no “start anyway”. Show precise inline/card explanations (e.g. no phases yet; two missing timeboxes), not alarming save warnings.
- Preserve the stricter runtime validation/ownership contract. If Schema-2 draft validators currently reject incomplete plans, investigate a safe draft/runtime validation boundary as a separately reviewed implementation concern; **do not weaken the authoritative run validator**.
- Deletion/absence semantics depend on the **current content**, not whether a user typed something earlier.

## 6. Shared information overlay: read first, edit deliberately

- Use **one information overlay** for phase notes and labeled resources, and reuse the same notes component for rundown-wide prepared information where appropriate. No nested modal stack.
- Opening begins in **read mode**, never by automatically focusing an editor. Explicit **Notiz bearbeiten / hinzufügen** and **Links bearbeiten / Link hinzufügen** enter editing mode.
- Links area can collapse; default collapsed when empty and open when populated. Retain the user's toggle while that dialog session remains open.
- Editing is **overlay-local** until the relevant field/row **Übernehmen**. Only this action updates the *caller-owned Rundown draft*. The **global Rundown-Speichern** is the only authoritative persistence operation.
- **Abbrechen** inside a note edit exits **only that edit** and returns to the read view of the same overlay. Other notes/links, applied draft changes and the overlay itself remain intact. Analogously, link-row Cancel discards only that row's unsaved buffer.
- Closing the overall information dialog with nonempty unapplied changes uses **one collective confirmation** to discard or continue editing; do not interrogate each row separately. Applied draft changes survive overlay close.
- Do not silently persist on blur/outside click, overlay close or keystrokes.

## 7. Links: independent one-row edits and deletion

- Each link comprises **Bezeichnung + URL** and local **Übernehmen / Abbrechen** actions. Read mode shows a human-readable linked label; clicking opens a new browser tab.
- Multiple link rows may be open/edited **in parallel**, analogous to independently open phases, **if** isolated local per-row draft buffers are implementable at modest complexity; otherwise report the Pareto fallback explicitly before restricting behavior. Never overwrite another row's buffer.
- **+ Link hinzufügen** must not silently cancel a different link edit. A newly started row is not persisted simply because it was opened.
- A **fully empty link row** represents no content regardless of whether it previously contained text. A completely empty new row can disappear without confirmation or persistence. A previously present link cleared in both fields and **applied** is removed from the current draft; not immediately from saved storage.
- Name-only or URL-only is **incomplete**, with a clear inline field-specific missing-value indication; it cannot be applied as a valid resource. Valid link requires name plus valid HTTP(S) URL.
- Show a restrained edit and **trash** action for each existing link. Trash removes the item from the **current Rundown draft immediately, without a per-link confirmation**. Global discard can recover previously persisted content. Keep counts and previews in sync.
- One collective confirmation protects overall overlay dismissal when genuine unapplied content remains; empty rows do not create pointless warnings.

## 8. Notes: minimal Markdown, no homemade rich text engine

- Final approved formatting is **bold**, *italic*, unordered lists, ordered lists, **paragraphs and line breaks**. Four toolbar actions; paragraphs require no button.
- **Underline was explicitly withdrawn on 2026-11-16**. Do not restore underline, custom `++underline++` syntax, tables, embedded media, file upload or feature-rich toolbars from older briefs.
- Provide a visible mini toolbar **and** allow experienced users to type Markdown markers directly. Do not build the editor engine ourselves if an appropriate stable open-source component satisfies the constraints.
- Store Markdown **source as ordinary text strings** in existing `preparedInformation` / `phase.notes`; never store rendered HTML. Existing plain text remains valid, though Markdown-looking legacy lines may render differently in read mode; evaluate and document that presentation caveat.
- **OverType 2.9.0** is approved as a **preferred GO candidate**, **not approved for public integration**. It supplies native bold, italic, bulletList, orderedList and ordinary textarea paragraph behavior. A standalone locally vendored browser spike is separately approved. The spike must not alter the production workspace, Store, timer, service worker or deployment.
- For the **spike only**: native OverType monospace and visible Markdown markers, normal browser spellcheck where supported, disable automatic URL-over-selection paste transformation, and include safe read-mode preview plus local Apply/Cancel/Dispose tests. These are provisional experiment defaults, **not settled production UX**.
- Important pending acceptance: actual editing experience (including monospace/visible markers), paste choice, browser spellcheck, safe renderer, real Firefox/mobile/keyboard and offline results. Spike outcome requires independent review and explicit further GO.
- Pin exact library version and checksum; ship all required JS/CSS locally without CDN, network runtime services or required upstream updates. Vendoring still requires security/compatibility stewardship.

## 9. License / third-party attribution (approved)

- **No** license, copyright, attribution link or badge in the notes editor or information overlay.
- Ship complete applicable MIT texts for OverType and bundled runtime dependencies in locally accessible `THIRD_PARTY_NOTICES.txt` (or equivalent). Include notices in production allowlist, packaging and offline precache once full integration is separately authorized.
- Document upstream origin, exact pinned version, tag/commit and verified artifact checksums in the repo.
- Link discreetly to local open-source notices from **About** or **FAQ**, not the editor.
- No Privacy Policy expansion; no Impressum/Imprint expansion absent a concrete legal requirement.
- Verify completeness and redistribution obligations before production integration. No external license fetch at runtime.

## 10. Global editor Save / navigation

- Use a compact accessible sticky bottom action bar, respecting mobile safe areas and not obscuring content:
  1. **Speichern**: if dirty, persist authoritatively **and remain in editor**. Visible but disabled when clean.
  2. **Speichern & zur Übersicht**: if dirty, save first; navigate to appropriate library tab/record **only after confirmed success**. If clean, navigate without redundant write.
  3. **Änderungen verwerfen & zurück**: discard changes **since last successful save** and return; ask focused confirmation if dirty.
- Show a restrained **Gespeichert** vs **Ungespeicherte Änderungen** indicator, no timestamps/toast noise. Failed/uncertain writes follow existing protective reconciliation and must not falsely say saved.
- Interim Save preserves expansion, scroll and focus where reasonably feasible; reopening later defaults sections closed except the visual zero-phase placeholder.
- These actions operate at the Rundown level. Link-/note-row Übernehmen, overlay close and read-only previews **never** save to the authoritative Store.

## 11. Decisions still open / not to silently infer

- Browser-spike acceptance, final editor styling/monospace and visible Markdown-marker preference.
- Final URL-over-selection paste behavior, browser spellcheck behavior and any read-mode sanitizer integration detail.
- Exact mobile wrapping, toolbar presentation, field validation messaging and responsive previews after testing at actual widths.
- Technical feasibility of multiple independent link-row buffers, without scope creep.
- Correct safe planning-draft versus strict runtime validation boundary for incomplete rundowns.
- Any public integration, rollout, Git write, merge or deployment requires the corresponding separately scoped Product Owner authorization.

## 12. Change-control and handoff checklist

- Re-read current `BRIEFING.md`, `SESSION_EDITOR_EVOLUTION.md`, `backlog.md`, source files, tests and branch status before implementing.
- Mark the above **decision** rules separately from implementation state. Do not label spike-only defaults as accepted final UX.
- Correct superseded exploratory references, notably underline, a 2–3-line-only note preview, and prior suggestions of one-open-link-only.
- Ensure the data contracts for Rundown-wide prepared information, prepared phase notes and **execution-only Workshop-Notizen** remain distinct; do not apply this notes-overlay specification automatically to the Facilitator Panel's live note-capture behavior.
- Preserve `PLAN-003`, `ST-004`, Nano-View and all other deferred backlog items unchanged.
- Maintain this document and the canonical session concept together when actual integration is independently approved. No invented implementation-complete claims.
