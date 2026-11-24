# EDITOR-001 — Session Editor UX evolution: mobile design checkpoint, 2026-11-24

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

Start with the common workflow: open editor → empty library → create template → prepare rundown and phases → save. Then evaluate populated library and realistic 10–12-phase workshops. No new editor, architecture, timer semantics, persistence, roles or integrations. Mobile important but not a separate editor; DE/EN, Light/Dark, accessible keyboard operation, visible focus and at least 44×44 CSS px interactive targets; no horizontal overflow. Preserve existing design identity and Welcome screen.

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

Verify real 320px width with DE/EN button labels, long titles, 44px targets, overflow menus, pagination and hidden/example/recovery edge states. Wider viewports may adapt arrangement, column count, spacing and optional icon labels, not action semantics, priority, information hierarchy or icon meaning. Consider library, agenda editor and input overlay separately on desktop/tablet/small notebook. Then check Light/System themes and visual consistency. No new editor, schema, timer engine, storage, dependency, implementation GO or rollout.

## 3. Editor — confirmed C (agenda focus)

Unchanged global easyTimer header. Compact back/title row (New template / Edit template); prominent unmistakable name input, no redundant technical status/boilerplate. Session settings collapsed initially with readable summary of current category and manual/automatic transition. Category optional, manual default accepted. Separate collapsible prepared rundown information immediately below settings, collapsed initially; preserve existing content-presence marker, previews and deliberate editing. Use concise DE/EN copy (Session notes is working wording for prepared information, not execution-only Workshop-Notizen). Agenda heading with computed duration; repeat total below final phase/Add phase; retain existing incomplete-duration semantics. Invite user to add phases with concise empty-state copy. No giant blank text areas. New and saved zero-phase rundowns are legitimate preparation states; no dummy phase, no unpersisted visual first-phase placeholder. Supersedes older visual placeholder rules (16 Nov §§4–5,10), including after deleting last phase. Facilitator may save metadata/notes first and add phases later. Preserve existing incomplete-plan save versus strict start eligibility (at least one genuine phase and valid timeboxes for all, no silent skipping); no new validation architecture or runtime relaxation.

## 4. Mobile compact phase — confirmed C2

Two rows on narrow viewports, one row where sufficient width (existing desktop direction). Drag handle above computed two-digit position selector in left column; both independent 44px targets. Position number is interactive: subtle framed button with small up/down selection indicator (confirmed 24 Nov C); preserve existing position popover, explicit select-then-apply, cancel, draft-only move, no extra confirmation, alternate move up/down. Drag via handle, preserve existing behavior and focus/scroll; not a replacement for position selection.

Right column: wide directly editable title with subtle input border/background, strong existing focus indication; no pencil icon, no hidden edit-on-accidental-tap affordance. Second row: directly editable duration with value and literal localized unit (e.g. 15 min) never wrapping apart, including multi-digit values; maintain numeric keyboard and existing duration validation/unspecified value behavior. Category selector always visible so facilitator can scan sequence of phase types. Subtle framed icon select with small up/down indicator; opens existing localized five-option menu directly without expanding details. Existing categories and icons unchanged except uncategorized: neutral tag icon instead of circle-slash, slightly muted but clearly interactive with same border/selection indicator; consistently update uncategorized representation in popover. Categories describe interaction/setting rather than topic or method: presentation, discussion, breakout, break, uncategorized. No new color palette now.

One combined disclosure control: document/agenda icon (outline when no prepared notes/resources, subtly solid when any exist) plus simple chevron (down collapsed, up expanded). Single touch target; content-presence and disclosure independent; no duplicate note indicator, counts or new button. This replaces later chevron-only visual rule while restoring original combined-control intent; framed category selector replaces earlier icon-only/no-chevron styling, not its semantics. No whole-row disclosure target or duplicated primary inputs. Thin separators between phases; no heavy individual card frames. Multiple phases independently expanded; existing phases collapsed on reopen; explicit Add phase at end retains existing focus, scroll, expansion and intentional keyboard behavior; preserve explicit position insertion PLAN-001. Do not collapse other open phases.

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

Same shared overlay for prepared notes/resources; reuse notes component for rundown-wide prepared information where appropriate. Desktop spacious dialog, mobile nearly full viewport with keyboard-aware visible viewport and reachable actions; no nested modal stack. Header identifies phase number/title or relevant rundown, explicit X/Close and Escape, no outside-click close. Read-first only for explicit viewing; direct Add/Edit intent opens the corresponding editor immediately with focus (later §13 of 16 Nov register supersedes older blanket read-first rule). Read state shows formatted notes on subtle tinted surface, explicit pencil; labeled links with edit/trash and add; links disclosure initially closed if empty, open if populated, preserve user toggle for dialog session. No duplicate phase title/duration/category editing. Resource editor uses labeled name and URL inputs, local row actions, independently editable rows subject to earlier feasibility gate; preserve other buffers, incomplete field validation, HTTP(S), local deletion and collective close confirmation. No implicit save on blur, keystroke or close. Apply only updates current caller-owned draft, returns to read state in same open overlay; local Cancel affects only current edit; close preserves applied changes and protects real unapplied content. No overlay-global authoritative Save.

MD editor: preserve accepted fixed 8–10-line frame with internal scrolling, minimal toolbar bold/italic/unordered/ordered lists, paragraphs and line breaks, ordinary Markdown source text and safe rendered preview, native shortcuts; underline withdrawn. OverType preferred locally vendored candidate, not asserted released/approved for integration. All earlier spike, licensing, accessibility, paste/spellcheck and acceptance boundaries remain. Do not re-grill technology selection. Visual reference: same subtle input frame and tinted content areas, restrained icons, no extra toolbar features.

Owner confirmed mobile local actions A: icon-only trash, cancel/undo, apply/check; optional adjacent text on wider viewports as space allows. Consistent order (delete left, cancel/apply right), at least 44px targets, localized accessible names and tooltips where available; mobile must not rely on hover. Local Apply may have restrained accent vs global Save; no new signal-color system. Header X closes entire overlay, not local edit.

## 7. Global sticky action bar — explicit labels confirmed

Restore full three-action contract from 16 Nov §10, not simplified two-button IST or earlier sketch. Compact sticky bottom action bar, safe areas and keyboard/visible viewport, never obscure content; test 320px DE/EN. Dirty: subdued status 'Ungespeicherte Änderungen', filled blue primary 'Speichern' (persist and remain), secondary outlined 'Speichern & zurück' (save then navigate only on confirmed success), third clearly labeled 'Änderungen verwerfen & zurück' as secondary text action below (discard since last successful save, focused confirmation if dirty). Clean: status 'Gespeichert', Save visible disabled, 'Zur Übersicht' prominent and navigates without redundant write; reserve space as feasible to avoid jumps, no misleading discard action. Preserve error/uncertain-write reconciliation; do not falsely claim saved. Interim save preserves scroll, expansion and focus where feasible. Final labels localized and verified at real widths. No semantics change; no timestamp/toast noise. Explicit text for global actions even mobile. Existing navigation guard behavior retained. Primary visual importance follows actual state, not equal visual weight for all actions.

## 8. Deferred item recovered from owner confirmation

Category-based color coding across Session Editor, Facilitator Panel and Audience View: owner confirms explicitly previously discussed and backlogged for later. Original conversation/source not recovered; targeted check of four existing documents did not find direct category-color wording. Preserve as deferred, not implementation scope. Icons remain distinguishable without color, Light/Dark/System contrast, no specific palette approved. Do not conflate with timer warning colors or start/stop signal-color work. No new category model.

## 9. Open items / next checkpoints

Library recovery-state coexistence and actual narrow-width fit of confirmed cards and menus; wider responsive desktop layout and viewport breakpoints, actual 320px fit/long titles and nonwrapping durations; Light/System and DE/EN visual validation; precise copy and accessibility; storage-state and keyboard/safe-area behavior of sticky actions; existing note editor integration/technical acceptance; native validation localization and possible contact autofill; check current repo implementation against accepted requirements before implementation. No blanket implementation GO. Design reference approved by owner; exact pixels, breakpoints and palette not final. Reconcile relevant historical decisions explicitly, especially removed zero-phase placeholder, collapsed settings, framed category and position selectors, combined disclosure and global save actions. Preserve unrelated backlog and historical records.

Next discussion: responsive desktop adaptation (library, editor, input overlay), then Light Mode and visual consistency. The library design is accepted in §2a; no implementation or real-device acceptance is implied. Before each, consult applicable docs and latest accepted checkpoint; only discuss genuine gaps or conflicts. Keep this record and canonical references current at each meaningful checkpoint.
