# EDITOR-001 — Session Editor UX evolution: mobile design checkpoint, 2026-11-24

> **Terminology and Home follow-up (2026-11-24):** Later [Event terminology and Home usability checkpoint](EDITOR-001_TERMINOLOGY_AND_HOME_2026-11-24.md) supersedes visible Session/Template/Execution and prepared/execution notes wording and narrowly amends the previous unchanged Welcome rule. Retain all other accepted layout, behavior and lifecycle decisions. No technical rebranding.

**Status:** Product Owner accepted design decisions from the 23–24 November 2026 screenshot-led discussion. Documentation only; not implementation, test acceptance or release authorization. UX-002 in this filename is a checkpoint label only, not a new backlog ID or an allocation of an existing UX ticket.
**Baseline:** develop `debfc66f7431039f9cf2ecbbc295481fe84f8927`; staging https://et.rbsnet.at/ PWA v84, successful run https://github.com/nox-vobiscum/easytimer/actions/runs/45254865571. No production approval for v84. Historical local-only/v67 status passages in older documents are not current operational evidence. The last reported local tracked tree was clean and synchronized; 55 untracked review/spike files must be preserved. Remote documentation work cannot verify the local tree.
**Authority:** This supplements [16 November decisions](EDITOR-001_UX-001_DECISIONS_2026-11-16.md), [Session Editor Evolution](SESSION_EDITOR_EVOLUTION.md), [canonical UX](EASYTIMER_UX_KONZEPT_v2.md) and [backlog](backlog.md). Later explicit decisions below replace only the identified conflicting presentation rules. Preserve all other accepted behavior, including lifecycle, validation, persistence, ownership, timer, recovery, archive and Facilitator Panel contracts.

## Collaboration contract (binding for future chats and developer assignments)

1. Already decided and still consistent: adopt without reopening.
2. Already decided but not implemented: treat as an existing requirement, not a new idea.
3. Deliberately deferred: retain in backlog; do not reopen or silently drop.
4. Conflict with a newly approved UX direction: identify the precise conflict and discuss only that conflict; never silently override functional decisions.
5. Genuinely undecided: discuss with the owner.
6. Unclear or missing documentation: research the exact relevant existing repository decisions and available prior conversations before asking; distinguish missing evidence from missing decisions.

Inspect actual current code/docs and deployment when relevant before proposing changes. Distinguish decision, implementation, verified acceptance, deferred item and unresolved question. Record decisions, rationale, rejected alternatives, supersessions, observations and open issues in versioned docs promptly, ideally at each meaningful decision checkpoint before implementation or handoff; link rather than duplicate long registers. Never claim that historical conversations were exhaustively searched when they were not. Document actual implementation separately. Product Owner approval remains scoped: documentation is not implementation, commit/push/merge/staging/production authorization for subsequent product work. No broad test cycles without reason.

## 1. Scope, evidence and baseline

Screenshot series: actual iPhone Safari staging v84, DE/EN, dark mode, existing template, collapsed/expanded phases, drag interaction, duration/title keyboard and required-field validation; fresh private Safari tab with Welcome screen, genuinely empty library, newly created template with and without keyboard; category popover. Screenshots are user-provided chat evidence, not checked into the public repository (avoid publishing incidental personal/browser data). The schematic references below encode the approved design independently of chat rendering.

Start with the common workflow: open editor → empty library → create template → prepare rundown and phases → save. Then evaluate populated library and realistic 10–12-phase workshops. No new editor, architecture, timer semantics, persistence, roles or integrations. Mobile important but not a separate editor; DE/EN, Light/Dark, accessible keyboard operation, visible focus and at least 44×44 CSS px interactive targets; no horizontal overflow. Preserve existing design identity and Welcome structure, subject to the later targeted Home enhancements in the terminology checkpoint.

Verified/accepted before this conversation (handover): template draft recovery on real iPhone Safari across reload, explicit restore, save and removal from recovery; automatic new-phase title focus/scroll with keyboard; numeric duration keyboard; 320×640 and 568×320 checks for visible 44px controls/no overflow; relevant v84 navigation/FAQ/offline tests passed. Historical aggregate browser gate has a downstream CDP timeout (test debt, not demonstrated product defect); do not reopen without concrete reason. No new testing performed in this documentation checkpoint.

Observed UX issues: technical UUID/revision and repeated empty lifecycle sections in library; verbose heading/context layers; large blank prepared-information textarea before agenda; phase title space lost to number/handle; duration unit unclear; uncategorized circle-slash suggests prohibition rather than optional selection (already recorded 19 Nov); expanded blank fields and equal-weight management buttons; English native required-field message within DE UI; possible iOS contact AutoFill on workshop name (inspect actual attributes later; Safari compact private address bar is not an input suggestion or product defect); Safari toolbar/safe-area overlap and keyboard behavior to verify, not assumed defects. Preserve existing readable inputs, focus outline, colors, transition control, independent disclosures, drag feedback and accessible alternate reordering.

## 2. Library — confirmed C (empty) + B (populated)

Use the same library, no separate screen/wizard/onboarding flag. Fully empty library gets a welcoming task-oriented state inspired by existing Welcome screen: concise heading and explanation of planning/reuse, primary Create template, secondary Import template, discreet local-storage explanation where accurate. This returns whenever library becomes empty, not just first visit. Populated library uses compact content-oriented sections; hide empty lifecycle sections rather than listing repeated No entries. Preserve existing template/execution distinctions, tabs, pagination, sort, actions, status semantics, recovery, import/export and built-in example decisions from earlier records; coexistence with the protected example and hidden entries is resolved in §2a below; coexistence with recovery remains to be checked, not silently inferred. No technical UUID/revision in ordinary card display; show meaningful name, category, duration and relevant status; phase count is a candidate, not a final requirement. Populated card detail design confirmed in §2a. Labels in sketches are illustrative.

## 2a. Populated library — subsequent confirmed decisions (2026-11-24)

**Status:** Owner accepted Template card C, integrated example/empty-state option B, active Execution card B, and unified context menu. This closes the mobile library design discussion, not implementation or acceptance testing. Preserve the earlier UX-001 §2 and Session Editor Evolution lifecycle rules (especially the existing action priorities, retention and ownership boundaries), and the backlog's protected example, hide/show, and Execution-to-Template requirements.

### Shared card structure and template card C

Use compact, subtly tinted cards; upper row identifies the entry (existing rundown category icon, single-line ellipsized title with accessible full-name affordance, planned total duration, relevant metadata) and holds direct edit pencil where applicable plus accessible overflow. Lower row holds the explicit primary and secondary task actions. No UUID/revision or redundant lifecycle labels. All targets remain at least 44 × 44 CSS px; compactness comes from arrangement, not smaller targets. Use existing theme tokens and icon language, DE/EN parity and accessible names/tooltips; no hover dependency. Keep primary action subtly accent-filled/outlined, secondary action neutral outlined, edit and overflow restrained icon actions. Avoid making all actions visually equal.

For regular startable Templates: pencil + overflow in header, and **Session starten** (primary) / **Durchführung planen** (secondary) explicitly labeled side by side below. Both remain directly accessible. The pencil edits the Template, not an Execution. Do not hide the planning action behind a calendar icon: the difference between direct launch and planning an independent Execution is important enough to label explicitly. Owner chose C over A (three labeled task buttons, extra vertical space) and B (planning represented by icon only). Preserve launch into READY without starting the clock and independent unsaved planning-copy semantics. Nonstartable records retain the already agreed concrete reason and Bearbeiten / Bearbeitung fortsetzen action, rather than inert Start. Do not infer additional restrictions on existing planning operations. The protected example has no edit pencil for its original and no permanent delete action.

```text
┌────────────────────────────────────────┐
  category   Sprint Planning      edit ⋮
             120 min
  [ Session starten ] [ Durchführung planen ]
└────────────────────────────────────────┘
```

Schematic only; actual labels, truncation and fit must be verified in both languages at narrow and wider viewports. Existing A–Z Template sort; Execution creation-descending sort; five cards per page (independently per Execution status group), show pagination only when needed. No layout change to pagination semantics. Category icon examples in chat were illustrative, not replacements for existing rundown category mapping. Phase count remains unapproved optional metadata.

### Integrated example and welcoming empty state — option B

The presence of the single protected built-in Retrospektive / Retrospective must not prevent the welcoming entry experience. Show the inviting task-oriented introduction, prominent New Template and secondary Import, with the normal example card beneath a short example introduction if visible. The example is not a separate gallery, tab or new card component. Preserve normal library tab access and the unobtrusive local-storage hint where accurate. In an otherwise populated library the example appears in ordinary alphabetical order with discreet Example metadata, not a name prefix. Its immutable original remains protected, while independent executions can be started/planned from it as previously specified.

Owner explicitly wants the user to be able to remove the example from their visible library, leaving it visually empty. Reconcile with prior protected-example contract: use existing agreed Hide/Show, not permanent deletion; hidden preference persists and the example can be restored. No extra onboarding flag or first-visit state. Derive entry state from actual records and visibility, returning to the welcoming state whenever there are no personal entries. The agreed introductory-state condition is no own Templates or Executions; preserve tab-specific empty states and access to the other tab. Exact cross-tab presentation when only the other tab has personal records remains a visual detail, not authorization to merge tabs.

| Library condition | Presentation |
| --- | --- |
| No personal entries, example visible | Welcoming entry plus example card |
| No personal entries, example hidden | Welcoming entry without example card; hidden-entry access remains |
| Personal visible entries exist | Normal compact library, relevant tab/status groups |
| Personal entries exist but all are hidden | Existing hidden-count/temporary show action, not a misleading first-use state |

Keep per-tab Show hidden toggle, default OFF on fresh library open, normal sort/group placement when shown, hidden counts and pagination rules, explicit restore and immediate persistence with existing safety checks. Do not silently unhide, duplicate or delete records. Recovery coexistence still needs review. This is the narrow supersession of the older minimal-empty-state wording for the genuinely empty/personal-empty introductory state; the all-hidden handling remains unchanged.

### Execution cards: common structure, state-specific actions

Keep the same visual structure as Template C; lifecycle determines available actions, not different card components or new runtime behavior. Group headings in existing order: Geplant, Im Timer aktiv, Unterbrochen, Abgeschlossen; discreet counts, independent disclosure with chevron; hide empty groups; first three initially open, Completed initially closed. The group heading communicates lifecycle, so avoid redundant status badges on each card. Preserve necessary distinct metadata (e.g. hidden) and existing sort/page rules. Use planned duration, not an invented actual-duration metric.

| Entry | Primary labeled action | Secondary labeled action | Header pencil |
| --- | --- | --- | --- |
| Regular Template | Session starten | Durchführung planen | Yes |
| Protected example | Session starten | Durchführung planen | No |
| Planned | Session starten | Bearbeiten | No (edit already labeled below) |
| Active in Timer | Zurück zum Timer | None | Yes (confirmed B) |
| Suspended | Im Timer fortsetzen | Durchführung abschließen | No (edit in context menu) |
| Completed | Ansehen | Neue Durchführung erstellen | No |

Active card B explicitly resolves the conditional visual choice in Session Editor Evolution § Active execution row action priority (line 633 at previous checkpoint): direct pencil in upper identification row, a single full-width dominant Return to Timer action below. A (edit only in overflow) was considered and not selected. This keeps editing accessible without making it compete with the timer action. No active-run finalization or timer control in the library. The existing active editing restrictions, runtime locks and ownership/concurrency safeguards remain authoritative; direct access does not authorize broader editing or any clock/progress change. Suspended resume returns frozen/paused until explicit Continue, finalization uses existing retention choices and started/never-started eligibility, editing remains possible without activation. Completed View opens history, not the Timer; Create new execution uses existing snapshot choices and fresh independent READY semantics. No automatic mutation of source Templates. Nonstartable Planned cards use the existing concrete-reason/edit treatment.

### Unified context menu — accepted

Use the existing category-popover visual language: restrained tinted surface, subtle border, one clearly labeled icon/text row per available action, at least 44px target, no nested submenus. Accessible overflow trigger, keyboard/focus/close handling and viewport-safe positioning. Only show relevant and permitted actions for the specific entry; no duplicate direct actions needed. Deletion, where permitted, goes last after a subtle divider. No new destructive-action semantics, extra lifecycle action or permission changes.

Illustrative regular Template menu: Export JSON (download icon), Hide (eye-off), divider, Delete (trash). Hidden entries instead offer Show; protected example has no Delete or edit-original action. Preserve all previously agreed state-specific overflow actions, including suspended Edit, Execution-to-Template copy at each lifecycle status subject to existing feasibility/safety boundaries, completed export/delete and separately guarded source-template update where applicable. Exact final action set must be verified against existing decisions and implementation, not derived solely from this illustrative menu.

### Remaining visual acceptance and next topic

Verify real 320px width with DE/EN button labels, long titles, 44px targets, overflow menus, pagination and hidden/example/recovery edge states. Wider viewports may adapt arrangement, column count, spacing and optional icon labels, not action semantics, priority, information hierarchy or icon meaning. The approved responsive design and theme rules are in §§10–13; verify actual desktop/tablet/small notebook layouts and Light/Dark/System during acceptance. No new editor, schema, timer engine, storage, dependency, implementation GO or rollout.

## 3. Editor — confirmed C (agenda focus)

Unchanged global easyTimer header. Compact back/title row (New template / Edit template); prominent unmistakable name input, no redundant technical status/boilerplate. Session settings initially collapsed on narrow/stacked layouts with readable summary of current category and manual/automatic transition; initially expanded on sufficiently wide two-column layouts (see §10). Category optional, manual default accepted. Separate collapsible prepared rundown information immediately below settings, collapsed initially; preserve existing content-presence marker, previews and deliberate editing. Use concise DE/EN copy (Session notes is working wording for prepared information, not execution-only Workshop-Notizen). Agenda heading with computed duration; repeat total below final phase/Add phase; retain existing incomplete-duration semantics. Invite user to add phases with concise empty-state copy. No giant blank text areas. New and saved zero-phase rundowns are legitimate preparation states; no dummy phase, no unpersisted visual first-phase placeholder. Supersedes older visual placeholder rules (16 Nov §§4–5,10), including after deleting last phase. Facilitator may save metadata/notes first and add phases later. Preserve existing incomplete-plan save versus strict start eligibility (at least one genuine phase and valid timeboxes for all, no silent skipping); no new validation architecture or runtime relaxation.

## 4. Mobile compact phase — confirmed C2

Two rows on narrow viewports, one row where sufficient width (existing desktop direction). Drag handle above computed two-digit position selector in left column; both independent 44px targets. Position number is interactive: subtle framed button with small up/down selection indicator (confirmed 24 Nov C); preserve existing position popover, explicit select-then-apply, cancel, draft-only move, no extra confirmation, alternate move up/down. Drag via handle, preserve existing behavior and focus/scroll; not a replacement for position selection.

Right column: wide directly editable title with subtle input border/background, strong existing focus indication; no pencil icon, no hidden edit-on-accidental-tap affordance. Second row: directly editable duration with value and literal localized unit (e.g. 15 min) never wrapping apart, including multi-digit values; maintain numeric keyboard and existing duration validation/unspecified value behavior. Category selector always visible so facilitator can scan sequence of phase types. Subtle framed icon select with small up/down indicator; opens existing localized five-option menu directly without expanding details. Existing categories and icons unchanged except uncategorized: neutral tag icon instead of circle-slash, slightly muted but clearly interactive with same border/selection indicator; consistently update uncategorized representation in popover. Categories describe interaction/setting rather than topic or method: presentation, discussion, breakout, break, uncategorized. No new color palette now.

One combined disclosure control: document/agenda icon (outline when no prepared notes/resources, subtly solid when any exist) plus simple chevron (down collapsed, up expanded). Single touch target; content-presence and disclosure independent; no duplicate note indicator, counts or new button. This replaces later chevron-only visual rule while restoring original combined-control intent; framed category selector replaces earlier icon-only/no-chevron styling, not its semantics. No whole-row disclosure target or duplicated primary inputs. Thin separators between phases; no heavy individual card frames. Multiple phases independently expanded, with two global expand/collapse actions (§11); existing phases collapsed on reopen at all widths; explicit Add phase at end retains existing focus, scroll, expansion and intentional keyboard behavior; preserve explicit position insertion PLAN-001. Do not collapse other open phases.

### Confirmed consolidated mobile reference (schematic, not pixel specification)

```text
[easyTimer global header — unchanged]
←  Vorlage bearbeiten
Name
[ Team-Workshop                         ]
⚙ Session-Einstellungen                 ⌄
  Workshop · Manueller Phasenwechsel
  Session-Notizen                       ⌄
────────────────────────────────────────
Phasen                            60 min
⠿   [ Begrüßung                        ]
[01↕] [5 min]           [category↕] [doc⌄]
────────────────────────────────────────
⠿   [ Erwartungen klären               ]
[02↕] [15 min]          [category↕] [DOC⌃]
  ┌ subtly tinted full-width detail area ┐
  Notizen                           edit
  Leitfrage: Was muss heute passieren …
  Links & Ressourcen               edit
  ↗ Workshop-Board
  ──────────────────────────────────────
  ↑  ↓                              delete
  └──────────────────────────────────────┘
────────────────────────────────────────
⠿   [ Gemeinsam Lösungen entwickeln    ]
[03↕] [30 min]          [category↕] [doc⌄]
────────────────────────────────────────
⠿   [ Kaffeepause                      ]
[04↕] [10 min]          [category↕] [doc⌄]
[          + Phase hinzufügen           ]
                          Gesamt: 60 min
════════ sticky global action bar ═══════
Ungespeicherte Änderungen
[ Speichern ]    [ Speichern & zurück ]
      Änderungen verwerfen & zurück
```

Symbols above are schematic, not emoji/icon assets. Accepted dark reference: background approximately #121822, input surface #1a2230, input border #526078, secondary text #b3bed0, primary accent #adc7f9, separators #354052, detail surface #1c2534. Reuse actual theme tokens; values are illustrative, not a new palette or a mandate for literal CSS. Light/System contrast and responsive details require real visual acceptance. No new dependency.

## 5. Expanded phase — confirmed A (tinted detail area)

Primary row stays unchanged when expanding. Full available detail width, subtly differentiated background, no extra nested cards/strong border. Separate Notes and Links & Resources headings, both visible, no nested accordions in inline details. Empty sections use understated explicit + Add note / + Add link affordances rather than blank textareas or redundant counts. Populated notes: safe rendered 3–4-line preview, explicit Show all / Show less when needed and deliberate edit action (pencil); no accidental edit on preview tap. Populated links: readable linked labels with link icon/new-tab cue, up to three initially and Show more / Show less as needed, deliberate edit action. Existing resource/link rules unchanged. Secondary management area below divider, restrained monochrome up/down and trash controls, retain existing disabled boundaries and confirmation rules; position selector remains accessible in primary row. Current-content-based empty-phase deletion and nonempty confirmation unchanged, except zero phases use empty agenda rather than placeholder. Use accessible names/tooltips. No new privacy model or conflation with execution-only workshop notes.

## 6. Input overlay and MD editor

Same shared overlay for prepared notes/resources; reuse notes component for rundown-wide prepared information where appropriate. Desktop spacious dialog, mobile nearly full viewport with keyboard-aware visible viewport and reachable actions; no nested modal stack. Header identifies phase number/title, planned duration and category (read-only), or relevant rundown; explicit X/Close and Escape, no outside-click close. See §12 for persistent context and responsive columns. Read-first only for explicit viewing; direct Add/Edit intent opens the corresponding editor immediately with focus (later §13 of 16 Nov register supersedes older blanket read-first rule). Read state shows formatted notes on subtle tinted surface, explicit pencil; labeled links with edit/trash and add; links disclosure initially closed if empty, open if populated, preserve user toggle for dialog session. No duplicate phase title/duration/category editing. Resource editor uses labeled name and URL inputs, local row actions, independently editable rows subject to earlier feasibility gate; preserve other buffers, incomplete field validation, HTTP(S), local deletion and collective close confirmation. No implicit save on blur, keystroke or close. Apply only updates current caller-owned draft, returns to read state in same open overlay; local Cancel affects only current edit; close preserves applied changes and protects real unapplied content. No overlay-global authoritative Save.

MD editor: preserve accepted fixed 8–10-line frame with internal scrolling, minimal toolbar bold/italic/unordered/ordered lists, paragraphs and line breaks, ordinary Markdown source text and safe rendered preview, native shortcuts; underline withdrawn. OverType preferred locally vendored candidate, not asserted released/approved for integration. All earlier spike, licensing, accessibility, paste/spellcheck and acceptance boundaries remain. Do not re-grill technology selection. Visual reference: same subtle input frame and tinted content areas, restrained icons, no extra toolbar features.

Owner confirmed mobile local actions A: icon-only trash, cancel/undo, apply/check; optional adjacent text on wider viewports as space allows. Consistent order (delete left, cancel/apply right), at least 44px targets, localized accessible names and tooltips where available; mobile must not rely on hover. Local Apply may have restrained accent vs global Save; no new signal-color system. Header X closes entire overlay, not local edit.

## 7. Global sticky action bar — explicit labels confirmed

Restore full three-action contract from 16 Nov §10, not simplified two-button IST or earlier sketch. Compact sticky bottom action bar, safe areas and keyboard/visible viewport, never obscure content; test 320px DE/EN. Dirty: subdued status 'Ungespeicherte Änderungen', filled blue primary 'Speichern' (persist and remain), secondary outlined 'Speichern & zurück' (save then navigate only on confirmed success), third clearly labeled 'Änderungen verwerfen & zurück' as secondary text action below (discard since last successful save, focused confirmation if dirty). Clean: status 'Gespeichert', Save visible disabled, 'Zur Übersicht' prominent and navigates without redundant write; reserve space as feasible to avoid jumps, no misleading discard action. Preserve error/uncertain-write reconciliation; do not falsely claim saved. Interim save preserves scroll, expansion and focus where feasible. Final labels localized and verified at real widths. No semantics change; no timestamp/toast noise. Explicit text for global actions even mobile. Existing navigation guard behavior retained. Primary visual importance follows actual state, not equal visual weight for all actions.

## 8. Deferred item recovered from owner confirmation

Category-based color coding across Session Editor, Facilitator Panel and Audience View: owner confirms explicitly previously discussed and backlogged for later. Original conversation/source not recovered; targeted check of four existing documents did not find direct category-color wording. Preserve as deferred, not implementation scope. Icons remain distinguishable without color, Light/Dark/System contrast, no specific palette approved. Do not conflate with timer warning colors or start/stop signal-color work. No new category model.

## 9. Open items / next checkpoints

Library recovery-state coexistence and actual narrow-width fit of confirmed cards and menus; implementation/acceptance of the approved responsive desktop layout and content-driven breakpoints, actual 320px fit/long titles and nonwrapping durations; Light/System and DE/EN visual validation; precise copy and accessibility; storage-state and keyboard/safe-area behavior of sticky actions; existing note editor integration/technical acceptance; native validation localization and possible contact autofill; check current repo implementation against accepted requirements before implementation. No blanket implementation GO. Design reference approved by owner; exact pixels, breakpoints and palette not final. Reconcile relevant historical decisions explicitly, especially removed zero-phase placeholder, collapsed settings, framed category and position selectors, combined disclosure and global save actions. Preserve unrelated backlog and historical records.

Next step: evidence-based IST/SOLL comparison and proposed small implementation slices; obtain explicit scope/implementation GO before any product changes. The design discussion is complete (§§2a,10–13), not implementation or real-device acceptance. Preserve the existing scheduling/approval boundaries; any proposed changes to sequencing require explicit approval. Before each, consult applicable docs and latest accepted checkpoint; only discuss genuine gaps or conflicts. Keep this record and canonical references current at each meaningful checkpoint.


## 10. Responsive library and Session Editor — confirmed design

**Accepted on 2026-11-24, after the library-card checkpoint.** The Product Owner's guiding principle is that easyTimer becomes more capable without becoming more complicated for its users. Do not create a second editor, library, timer or state model. Reuse the existing UI and central CSS; design choices below are binding, but exact dimensions and code are not. Backlog B2 supplies the earlier desktop-width motivation and review/scheduling boundary, not implementation authorization.

### 10.1 Library: three user-selectable visual layouts (A/B/C)

The owner proposed supporting all three instead of choosing one and accepted this design. One shared library component, one logical set of entries/actions and one view preference:

| Choice | Icon concept | Layout |
| --- | --- | --- |
| A — Single column | Single-column / stacked cards | Existing compact card C arranged vertically; comfortable bounded width rather than artificially stretched full-screen cards |
| B — Adaptive card grid (default) | Grid | Same cards in one, two or three columns according to usable width; preliminary cap of three columns, not a mandatory pixel breakpoint |
| C — Compact list | List | Same entry information and actions reflowed into compact horizontal rows when space allows; wrap/reflow on narrow screens, never require horizontal scrolling |

Place a compact three-choice icon switch in the library header, with selected-state styling, localized accessible names and tooltips. No separate settings dialog. Do not require hover to discover the controls. Final icon assets/labels must match the existing visual vocabulary and be verified for distinction; icons shown in chat were illustrative. Maintain minimum 44×44 CSS px targets. The selected view is a device/browser-local presentation preference, analogous to theme/language, shared by Templates and Executions; persist across reopen/reload where local preferences are available. Default B when no valid saved choice exists. Do not write this preference into rundown records, export JSON, runtime or lifecycle data; use the existing safe preference mechanism if suitable, not a new Store. Implementation detail for unavailable preference storage requires inspection; do not block library use.

Switching view changes layout only, preserving selected tab, filter/hidden toggle, current page, independently expanded lifecycle groups, entries and their actions. Preserve focus/scroll meaningfully as far as practical; no unnecessary navigation, write, dirty-state change or timer effect. Grid rows follow existing sort order, not masonry/reordered data; use the same grid separately within each Execution lifecycle group. A single card (notably Active) or an incomplete last grid row must not stretch across the entire large viewport. Existing five-card pagination per Templates page and per Execution group remains identical for A/B/C. Do not add sorting, new filters, page-size controls, extra tabs, bulk actions or separate list-specific workflows. Existing empty/example/all-hidden/recovery and permissions rules remain authoritative.

Use §2a's full action matrix in all three layouts. In particular, compact list C must not drop the edit pencil, protected-example distinction, start eligibility reason, or labeled functional actions merely to fit; shortened labels in the interactive chat sketch are not approval to replace the previously agreed unambiguous labels. Reflow rather than truncate or reduce touch targets. Mobile A and B naturally converge to a single column; C also reflows as necessary. No forced desktop-only layout or separate DOM/business logic. Layout-switch testing must include each lifecycle group, hidden records, incomplete records, protected example and pagination. No implementation complexity estimate is a verified code assessment.

### 10.2 Session Editor: automatic asymmetric two-column layout

Owner explicitly accepted all four recommendations in the responsive editor discussion, with the clarification that phase details remain collapsed by default (see §11). The two-column layout is automatic, not user selectable. On sufficient usable width, the left column contains the entire rundown-level context (name, category, manual/automatic phase transition settings, prepared Session notes/information and its existing controls). The right, larger column is the actual agenda working area: phase heading, computed planned duration, global phase disclosure actions, phase rows/details, Add phase, final total. The global navigation/header remains above both and the one global sticky Save/navigation action bar below both; no separate per-column Save actions.

- Layout A accepted: rundown context left, phases right. Natural reading/keyboard order follows the stacked mobile order, general to specific.
- Layout weighting: roughly one-third context, two-thirds agenda as an illustrative starting point, with sensible width bounds and more width available to agenda on very wide screens. Not rigid fractions, exact pixel sizes, or equal columns.
- On wide two-column layout, Session settings initially open because they no longer displace the agenda vertically; on narrow/stacked layout, initially closed as previously agreed. Session notes initially collapsed in either layout. Existing user-controlled disclosure remains possible; initial defaults are not a mandate to force open/closed on every resize. Preserve deliberate expansion state and focus during layout transitions rather than reinitialize content.
- **Phase details remain initially closed at every width.** Do not confuse opening the rundown settings with expanding every phase. Existing independently open phases, intentional new-phase expansion/focus, individual toggle and detail controls remain.
- Prefer one normal page scroll. Left context column stays sticky when its whole relevant content fits the available vertical space without hiding controls behind the header/action bar. If too tall or constrained (short notebook, landscape, expanded notes, keyboard), fall back to normal reachable page flow; do not trap content in a clipped sticky column. Reject two independent scrolling panels as default; preserve existing internal editor/overlay scroll exceptions.
- Responsive arrangement by actual available space, not device identification. Stack context above agenda when two usable columns cannot fit; do not insist all tablets are stacked or all desktop windows are two-column. In wide agenda area use the existing one-row phase arrangement (drag, position, title, duration incl. min, category selector, combined disclosure); use approved C2 two-row composition when agenda width is insufficient, even in a two-column editor if required. No horizontal scroll, duplicate fields, or unnecessary stretch of text lines.
- One authoritative draft, one DOM/control set as far as feasible, no mirrored field instances or duplicate IDs. Resize/orientation changes must not discard edits, reset timers, alter ordering, reset focus unnecessarily, change dirty state or recreate an editor. Preserve drag/drop, alternate position chooser, scroll, focus, validation, save/discard, recovery and lifecycle protections.
- No editor layout selector: unlike library presentation choice, this is a coherent working area that adapts automatically.

Schematic reference (not pixels):

```text
[ existing global easyTimer header ]
← Vorlage bearbeiten
┌─────────────────────┬────────────────────────────────────┐
│ Name [Team Workshop]│ Phasen   60 min  [expand] [collapse]│
│ Einstellungen      ⌃│ grip [01] [Begrüßung] [5 min] [cat] [doc⌄]
│ Kategorie Workshop  │ grip [02] [Erwartungen] [15 min] ...│
│ Manuell / Automatisch│ grip [03] [Lösungen] [30 min] ...   │
│ Session-Notizen    ⌄│ grip [04] [Pause] [10 min] ...       │
│                     │ [ + Phase hinzufügen ]            │
│                     │                      Gesamt 60 min │
└─────────────────────┴────────────────────────────────────┘
[ save status ] [ Speichern ] [ Speichern & zurück ] [ discard/back ]
```

The stacked layout uses the same components in the same semantic order. On desktop the global bar may arrange its status and three text-labeled actions horizontally as space allows, retaining §7's complete semantics and visual hierarchy. No action is lost on smaller screens.

## 11. Global expand/collapse controls for phase details — explicitly confirmed

Two separate always-positioned agenda-header actions, **Alle aufklappen / Expand all** and **Alle zuklappen / Collapse all**, available on Mobile and Desktop. Owner chose two buttons over a single ambiguous mixed-state toggle and explicitly required disabling/graying any action that would cause no change. Use distinguishable expand-all/collapse-all icons (chat reference chevrons-up-down and chevrons-down-up), accessible localized labels/tooltips, 44×44 CSS px targets and recognizable disabled styling. Do not rely on color alone for identification; disabled means genuinely non-activatable, not merely gray. Do not hide or move buttons when inactive. If heading/total/control row does not fit at 320px, wrap intelligently without changing their meaning or reducing touch targets.

| Number/state of actual phases | Expand all | Collapse all |
| --- | --- | --- |
| Zero | Disabled | Disabled |
| All closed, at least one | Enabled | Disabled |
| Mixed open/closed | Enabled | Enabled |
| All open, at least one | Disabled | Enabled |

Compute from the actual current phase disclosure states; update immediately after individual toggle, global action, add, delete, or other relevant state changes. Zero-phase case is explicit; avoid vacuous every() truth causing incorrect availability. Global action sets all current phase details open or closed; does not affect Session settings, prepared Session notes, overlay disclosure or contents. Do not change any saved/domain data, phase duration, category, position, dirty indicator, validation, save, timer, runtime or lifecycle state. No separate durable expansion preference or extra detail-view mode is introduced. Continue using independent phase disclosures; existing phases start closed when a rundown is reopened, with the intentional Add phase expanded/focused exception unchanged. Opening/closing details must not discard active input or bypass the overlay's local apply/cancel protection. Keep focused control and scroll usable; verify variable-height drag behavior. Whole-row toggling in the interactive chat demonstration was schematic only; the previously agreed combined document/chevron target remains the actual control.

## 12. Responsive shared information overlay and persistent phase context

The owner accepted a two-column desktop information overlay with smart responsiveness, then explicitly added that phase information (including duration and category) must remain visible while a phase is expanded and its editor is open. This supplements §6 and deliberately replaces the earlier sketch that omitted duration/category; it does NOT authorize duplicate editing controls.

- One shared prepared-information overlay, not nested modals or a second editor. On sufficient dialog-content width: left/larger Notes work area, right/smaller Links & Resources context area (roughly 3:2 in illustrative sketches, not fixed). On narrow/medium widths: Notes above Links & Resources, same logical order/components. Generous bounded desktop dialog rather than full-screen stretched text; nearly full mobile viewport as agreed. Content-driven responsive behavior, no additional view switch.
- Preserve read mode, direct Add/Edit mode and focus, resource expansion defaults (empty closed, populated open) and user toggles, isolated note/link editing buffers, validation, local Apply/Cancel/Delete, collective dismissal guard, explicit X/Escape and no outside-dismiss behavior. Same local/global persistence boundary. No loss or implicit persistence when changing width/orientation, read/edit state, keyboard or resource layout.
- Prefer one shared overlay scroll area, with the existing fixed approximately 8–10-line MD editor and its internal scroll as deliberate exception. Keep labels, fields, toolbar and local actions accessible with soft keyboard and short viewports. No independent panel scrolling as default. Text readability and link wrapping take precedence over arbitrary width targets.
- Phase overlay header always shows **position, full title (readable/wrappable), planned duration including localized unit, and category (existing icon + localized name where space permits)**. Maintain contextual visibility in both read and edit mode, for note and link edits, mobile and desktop. Prefer a sticky header during overlay scrolling, provided it does not obscure input or keyboard-accessible controls. Use compact/wrapping presentation when constrained; no loss of information. For missing/unspecified duration or uncategorized phase use existing domain meaning, not fabricated data. Rundown-wide prepared-information overlay retains the appropriate rundown context, without invented phase metadata.
- Context metadata is read-only in the overlay, sourced from the current caller-owned draft under existing safeguards. Title, duration and category editing remains in the compact phase row. In the main agenda expanded state, that row remains intact and directly editable under existing permissions; no duplicate header inputs. Do not make every phase row sticky or require the background agenda to remain visible behind a modal.
- Keep close X separate from local Cancel, same header context regardless of edit mode; no extra Save or timer control.

## 13. Light / Dark / System — existing identity retained

Owner explicitly chose to keep the existing color palette rather than use this UX work as a general visual rebrand. Source of truth is existing theme tokens in src/css/styles.css at the checked baseline f48dbf467f61edaad3c2017cc99eab64bf4e9b7b, not approximate mockup hex values. Verified source values:

| Token | Light | Dark / System-dark |
| --- | --- | --- |
| --bg | #f6f8fc | #101722 |
| --surface | #ffffff | #1a2433 |
| --text | #172337 | #f1f5fc |
| --muted | #526078 | #b4c1d5 |
| --border | #c8d1e0 | #52627b |
| --accent | #1d4ed8 | #a9c7ff |
| --on-accent | #ffffff | #101d35 |
| --selected | #e7efff | #2b4164 |

Reuse current tokens and theme mechanism (including System responding to OS preference). Do not hardcode separate palettes per component or use the earlier approximate dark sketches as replacement colors. Apply consistent semantic hierarchy:

| Element | Visual role |
| --- | --- |
| Global primary action | Filled accent with on-accent foreground |
| Card primary action | Restrained selected/accent surface with accent text/border |
| Secondary action | Neutral outlined control |
| Management action | Restrained recognizable icon |
| Input | Surface and identifiable border; distinct focus state |
| Expanded details | Neutral subtly tinted surface, not blue selected/active state |
| Disabled action | Reduced emphasis plus actual disabled behavior |
| Keyboard focus | Clearly visible existing accent outline |
| Validation | Existing error color plus explanatory localized text |

Light cards may need a subtle neutral border to distinguish white surface from light background; dark cards may rely on surface separation where sufficiently recognizable. Light detail mockup used #edf1f7 as illustrative neutral derived tint, not a new approved palette token; derive from existing theme surface/background where feasible. Dark detail can use existing surface. Check real text, icon, boundary, focus, selected and disabled contrast in both themes; do not claim accessibility conformance from sketches or color values alone. Do not weaken accessible control boundaries merely to match a low-contrast sketch. Retain existing validation, timer endgame/overtime and Start/Stop signal colors; category-based coloring stays deferred (§8). No global theme redesign or changes outside approved editor/library presentation scope.

## 14. Design closure and implementation handoff guardrails

The 23–24 November conceptual design round is complete. This is not a claim of implementation completeness, visual acceptance, passing new tests or release approval. All earlier recorded choices not explicitly superseded remain binding. Key targeted supersessions since the preceding checkpoint: library now offers all three selectable presentation layouts rather than fixed adaptive grid only; wide editor settings initially open while narrow settings initially closed; phase details globally controllable but initially closed at all widths; overlay includes read-only duration/category and adaptive two-column layout; current theme tokens override approximate sketch colors. Preserve the §2a library actions and empty/example/hidden distinctions. No additional feature scope is implied by a design sketch.

Before coding: inspect actual remote/local source, tests, branch state, deployed v84 and relevant canonical docs. Perform an explicit IST/SOLL matrix separating already delivered behavior, accepted but unimplemented requirements, exact supersessions, deferred scope and real unresolved issues. Propose small independently testable implementation slices with dependencies, risks, acceptance checks and any sequencing conflicts (including B2 / Facilitator Panel scheduling); do not silently change priorities or proceed without scoped owner approval. No speculative refactor or architecture replacement. Treat test/source evidence as authoritative for actual behavior, not screenshots or conceptual mockups. Preserve all user data, existing timer engine/semantics, native Schema-2 workspace, Store/ownership/recovery, lifecycle, archive, prepared-vs-execution notes, localization, offline operation and existing release gates. Use the decision-continuity contract at the top of this file. Future findings must be recorded promptly; genuinely unresolved details must not be invented as owner decisions.

Acceptance planning (not tests run in this documentation change): all three library views and persistence; view switch preserves tab/page/hidden/group state; zero/example/hidden/incomplete and each lifecycle card; wide/narrow editor arrangement, initial defaults versus deliberate disclosure, phase global-control truth table incl. zero phases, dynamic add/delete, keyboard/drag/scroll and no dirty-state impact; responsive overlay with metadata, fixed editor height, independent drafts and dismissal safeguards; Light/Dark/System contrast and focus; DE/EN and actual 320px, tablet, short notebook and desktop; real iPhone Safari and relevant Firefox/browser coverage; existing regression/storage/runtime/recovery safeguards. Exact breakpoints, CSS dimensions, final copy, icon assets and integration mechanics must be validated against actual code and devices. Preserve known test-debt distinctions. No tests or deployment are required merely to publish this docs-only checkpoint.
