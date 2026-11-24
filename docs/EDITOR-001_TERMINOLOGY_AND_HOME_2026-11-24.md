# easyTimer — Event terminology and Home usability checkpoint (2026-11-24)

**Status:** Product Owner accepted terminology and Home improvement direction following the 24 November responsive design closure. Documentation only. No implementation GO, release approval, new feature architecture or priority change. This filename is a descriptive checkpoint, not a new ticket ID.
**Authority:** Supplements [mobile and responsive UX decisions](EDITOR-001_UX-002_MOBILE_DESIGN_2026-11-24.md), [16 November decisions](EDITOR-001_UX-001_DECISIONS_2026-11-16.md), [Session Editor Evolution](SESSION_EDITOR_EVOLUTION.md), [canonical UX](EASYTIMER_UX_KONZEPT_v2.md) and [backlog](backlog.md). For user-visible terminology and the targeted Home enhancements explicitly accepted here, this later checkpoint prevails over older wording, screenshots and sketches. All other previously accepted functional, visual and safety contracts remain intact. Historical technical terminology in docs and code is not a conflicting user-facing requirement.

## 1. Motivation and evidence boundary

The owner requested a one-off novice perspective: a colleague recommended easyTimer to someone who has no prior understanding of Rundown, Phase or the product's modes and just wants to facilitate a retrospective with a timer. The goal was orientation and discoverability, not evaluation by an expert who already understands the application.

The assistant could not perform a real interactive live-site visit in that environment. The walkthrough was a source-based simulated first-user journey, not a real browser usability test or evidence of a public outage. Production reference: main at 81d86305a6ad84230675290c7d0ad35042d48177, changelog records PWA v67, 2026-11-01, verified release workflow 41323065346. Source inspected: src/index.html, src/js/app.js, src/faq.html and CHANGELOG.md. Production UI used Quick Timer, Session Timer, Session Editor, Rundown picker and FAQ definition. A genuinely new Quick Timer begins at zero; minute controls add time and Start initiates the countdown. An unfamiliar visitor could plausibly operate this single timer but may not infer the multi-activity workflow or understand “Load Rundown” / “Rundown laden”; the FAQ explains it only after a visitor seeks help. Simulated friction is a hypothesis, not measured abandonment or elapsed time. Do not assume that the old picker is empty on every real installation or that a particular button path was actually executed.

The later Home review inspected src/index.html and src/js/app.js at develop 01838b253ea308a26706b49c0f9581f5af9326e0, with Home shell already present on staging v84 (deployed code baseline debfc66f7431039f9cf2ecbbc295481fe84f8927 from previous verified checkpoint). Four existing controls home-quick, home-session, home-editor, home-stopwatch (last disabled with “Noch nicht verfügbar” / “Not yet available”), welcome heading, introductory instruction and secondary sentence. No new live staging/production verification is claimed. The previous UX design checkpoint deliberately retained the existing Welcome screen; this subsequent narrow enhancement supersedes that preservation only for the descriptions, terminology and optional informational disclosure below.

Product principle: easyTimer should become more capable without becoming more complicated to use. The four modes and existing workflow already supply the needed functionality; clarify the task behind each mode rather than adding a tutorial, wizard, separate marketing entry or unnecessary navigation. The owner agreed that the novice findings are the intended perspective and explicitly identified Home as a potentially high-value, low-effort improvement. Actual implementation effort remains to be assessed.

## 2. Canonical domain vocabulary — owner confirmed

These are four distinct user-facing concepts, not four new data types. DE and EN deliberately share the central vocabulary; ordinary grammatical conventions (German hyphens, English spaces and plurals) apply. Do not invent separate translated synonyms for the same object.

| DE singular | EN singular | Meaning |
| --- | --- | --- |
| Event | Event | A concrete, independent occurrence of a meeting, retrospective, workshop, training, congress or other timed event; organizational umbrella, regardless of duration, size or type |
| Event-Template | Event Template | Reusable plan/schema from which independent concrete Events may be prepared or started; not an occurrence itself |
| Rundown | Rundown | Planned temporal and methodological sequence of activities within an Event or Event Template |
| Phase | Phase | One time-bounded section of a Rundown, such as an introduction, presentation, discussion, group activity or break |

Plural labels: DE Event-Templates / Events / Rundowns / Phasen; EN Event Templates / Events / Rundowns / Phases. Use full Event-Template / Event Template consistently in user-visible copy, including headings, tabs, creation actions and relevant dialogs; owner expressly rejected shortening to standalone “Template” merely to save space. Reflow and wrap where necessary, respecting mobile sizing and existing 44px targets. Technical identifiers and historical documentation may continue to use Template.

### 2.1 Event as the umbrella

The owner expressly confirmed that a 15-minute meeting and a three-day congress may both be an Event. No separate model for event types, duration classes, daily containers, size, or special multi-day entities. “Event” is familiar in both languages (calendar and Scrum usage); no potentially confusing DE translation to Veranstaltung as an alternative formal label. Plain explanatory prose can still use meeting, workshop, Veranstaltung, etc. as natural examples.

Structural model: Event → Rundown → Phase (flat sequence). A single Event may encompass a longer occurrence as its shared umbrella; a user who wants independent daily organization may deliberately create separate Events such as “Radiologenkongress - Day 1”, “Radiologenkongress - Day 2”, “Radiologenkongress - Day 3”. No nested Events, sub-Rundowns, subphases, day hierarchy, additional grouping entities or classification-driven workflows. The owner controls granularity. Existing duration limits, operational capacity, storage and timer constraints still apply; the broad conceptual definition is not a new promise of uninterrupted multi-day operation, parallel tracks, multi-room scheduling or a new timing engine. Optional existing categories are unaffected.

### 2.2 Rundown retained deliberately, not replaced with Agenda

The owner identified a distinction: an Event's agenda might state “Themen finden, Lösungen erarbeiten, next steps”, while the Rundown organizes “Intro, kurzer Input des Projektleiters, Diskussion, Gruppenarbeit in Breakout-Sessions, Pause, ...”. Agenda may describe what is to be addressed; Rundown describes how the Event is structured in time and activities. The distinction motivates retaining the most precise established term despite a little Denglisch. Do not introduce a separate Agenda entity, menu or editor; thematic agenda/goals can be recorded within the already accepted prepared information. Do not rename Rundown to Agenda, Schedule, Flow, Sequence or Ablaufplan as the canonical label. “Ablaufplan” / “planned sequence” is useful explanatory prose, not a competing formal label.

Owner explicitly expects a short tooltip/context explanation and FAQ entry. Working definition DE: “Der geplante zeitliche Ablauf eines Events.” EN: “The planned sequence of activities within an event.” Expand as necessary to clarify phases and the distinction from topic agenda. Explain in the relevant UI context; do not rely on hover alone for mobile or keyboard accessibility. Exact UI placement and final microcopy subject to real fit and accessibility review.

### 2.3 Reuse and lifecycle — Event Template versus Event

The key pre-existing distinction is preserved: the same reusable plan may be used many times, and each occurrence is independent. The owner selected Event Template / Event specifically to make the plan/schema versus concrete occurrence distinction obvious. An Event exists even before its timer starts and may be planned, active, suspended or completed. A template holds reusable Rundown planning content; an Event has its own copy of the Rundown and phases, plus its own permitted occurrence-specific state, notes and history. The Event has its own identity; it is not an alias for an active timer attempt. An Event Template is not an additional parent container of Events or a requirement that every Event has a source template; existing provenance semantics remain.

Example: one Event Template “Sprint-Retrospektive” (five phases, 60 min), then independently planned/started Events “Retro 12.11.”, “Retro 24.11.” and “Retro 08.12.”. Later template edits never automatically update the existing Events; Event edits never silently update the template or other Events. Deleting an Event Template does not cascade. Starting a template creates a concrete independent Event, including if unchanged. Existing creation, copy, provenance, explicit save, archive, completed read-only, discard-attempt versus delete, lifecycle, ownership, baseline and recovery behavior is unchanged. Do not reinterpret optional archive rules, editing permissions or runtime constraints from a label change. See Session Editor Evolution “Rundown library: templates and independent executions”.

The existing internal Template maps to user-visible Event Template; existing Execution maps to user-visible Event. Internal Run/attempt and existing native runtime retain their separate meanings. Do not replace technical “execution” with “event” in schemas, fields or state machines. This is not a new Event entity, migration, one-to-many database relation implementation, or requirement to add a separately stored Rundown object.

## 3. Modes and action wording — owner confirmed

“Session” no longer has a separate canonical product concept in user-visible UI. Replace former Session Timer / Session Editor terminology with Event Timer / Event Editor, including navigation and public explanatory documentation where these product concepts are meant. Natural-language references to e.g. breakout sessions or a user's own event title are not prohibited or modified. Historical records, code symbols, versioned file names and data are not to be mechanically renamed. Event Editor is intentionally the umbrella tool for both reusable plans and concrete Events, not a separate Rundown Editor and not two separate editors.

| Existing concept | Target DE | Target EN |
| --- | --- | --- |
| Quick Timer | Quick-Timer | Quick Timer |
| Session Timer | Event-Timer | Event Timer |
| Session Editor | Event-Editor | Event Editor |
| Stopwatch | Stoppuhr | Stopwatch |
| Template library tab | Event-Templates | Event Templates |
| Execution library tab | Events | Events |
| Create template | Neues Event-Template | New Event Template |
| Template launch / prepare | Event starten | Start Event |
| Plan independent execution | Event planen | Plan Event |
| Active return | Zurück zum Timer | Back to Timer |
| Resume suspended event | Im Timer fortsetzen | Resume in Timer |
| Deliberate completion | Event abschließen | Complete Event |

The table provides the agreed naming/action direction; exact inflections and articles in complete sentences may be localized naturally. The owner explicitly reaffirmed the previously lengthy discussion on “Starten”: adopt the existing decision rather than reopen it. “Event starten” prepares the concrete Event in the Event Timer in READY; the actual countdown begins only on the separate Start action. Do not change to “Laden” / Load, auto-start the timer, invent a confirmation step or alter start eligibility. Where a distinct suspended/active/actual countdown action already exists, retain its meaning and guard. Existing lifecycle status labels Geplant / Im Timer aktiv / Unterbrochen / Abgeschlossen and existing EN equivalents remain semantically unchanged. Preserve the previously approved state-specific library card action matrix (including edit/overflow and read-only completed actions); apply new labels consistently, e.g. “Neue Durchführung erstellen” becomes an Event-specific equivalent, not a newly authorized clone operation.

Review any remaining “Workshop” or “Session” wording that denotes a canonical domain concept (e.g. workshop completion, Session settings, Workshop-Notizen) for contextual replacement. Do not forbid ordinary descriptive usage (“Workshop vorbereiten”) or perform blind search-and-replace. User-created titles, notes, content and stored values must remain byte-for-byte unaffected by localization work. Any ambiguous label needs semantic inspection before changing it.

## 4. Prepared information versus occurrence-specific notes

Owner accepted “Event-Informationen” and “Event-Notizen” and explicitly confirmed synchronized terminology down to the Phase level. The distinction is purpose and ownership, not a rigid timestamp-of-entry restriction.

| Scope | DE | EN | Meaning |
| --- | --- | --- | --- |
| Whole Event/Rundown | Event-Informationen | Event Information | Prepared reusable guidance and resources for conducting an Event: objectives, context, prompts, instructions, links |
| Whole concrete Event | Event-Notizen | Event Notes | Occurrence-specific observations, outcomes, insights, open questions or other captured notes |
| Phase | Phasen-Informationen | Phase Information | Prepared guidance and resources for conducting this Phase |
| Phase of concrete Event | Phasen-Notizen | Phase Notes | Occurrence-specific observations or results associated with this Phase |

Information is available in the reusable Event Template and the Event's independent planning copy. Notes in the latter technical sense are specific to a concrete Event, never implicitly propagated to its source template or other Events. No requirement for Event Notes/Phase Notes fields on templates. Information encompasses existing prepared text and Links & Resources, not just text. Inside an Information section, use an unambiguous text-subsection label if needed; do not use standalone “Notizen” for reusable prepared text in a way that collides with Event/Phase Notes. Exact subordinate field labels are not yet finalized; review them against the actual UI. Maintain previously accepted local editor apply/cancel, read-only display, draft and validation semantics.

Working microcopy (not final exact localized strings):
- DE Information: “Alles, was du für die Durchführung vorbereitest.” EN: “Everything you prepare to guide the event.”
- DE Notes: “Alles, was du während des Events festhalten möchtest.” EN: “Anything you want to capture during the event.”

These are purpose explanations, not permissions: prepared Information may be corrected/added during an Event under existing phase/lifecycle constraints. Existing execution-only notes capture, reflection, history, archive and discard semantics are unaffected. No new scope for editing archived/completed records, new shared notes, automatic template updates or notes capture earlier than previously allowed. The conceptual sketch showing both categories side by side was illustrative terminology only, not approval to implement new layout, additional controls or broader availability. Preserve the existing Facilitator Panel scope, editing restrictions, and prepared-versus-execution information contracts. Apply symmetric labels wherever existing functionality exposes the corresponding content.

## 5. Home / Landingpage — accepted direction

The owner explicitly likes the existing four-mode arrangement and requested short explanatory texts plus an optional expandable information area near the bottom before the footer. Preserve existing four controls, 2×2 arrangement wherever it fits, existing icons, theme, navigation, view restoration, recovery/lifecycle guards and disabled-state behavior. Do not switch to the alternative three-row, task-only or marketing-style layouts shown in discussion. Keep the Stoppuhr / Stopwatch tile and its “Noch nicht verfügbar” / “Not yet available” state until the separately approved feature is actually available; earlier assistant suggestion to hide it was not selected. No implementation or reprioritization of Stopwatch. Use current Event terminology on Home and menu.

### 5.1 Short task-oriented explanations

One concise, immediately visible description per mode, explaining intended use without requiring understanding of Rundown, Phase or internal terminology. Entire existing mode tile remains the navigation target, not a nested secondary button. The owner approved the principle and existing arrangement, not every literal line of proposed copy.

| Mode | DE working copy | EN working copy |
| --- | --- | --- |
| Quick-Timer / Quick Timer | Zeit einstellen und direkt loslegen. | Set a duration and start a countdown. |
| Event-Timer / Event Timer | Meetings, Workshops und andere Events zeitlich steuern. | Keep meetings, workshops and other events on time. |
| Event-Editor / Event Editor | Events vorbereiten und wiederverwendbare Vorlagen erstellen. | Prepare events and create reusable Event Templates. |
| Stoppuhr / Stopwatch | Verstrichene Zeit messen. | Measure elapsed time. |

Final copy should make the multi-activity distinction visible (e.g. several time sections or activities for Event Timer) and use Event-Template in context when denoting that exact domain object; ordinary explanatory wording can describe reuse. Avoid making the inactive Stopwatch sound currently usable; maintain disabled semantic state and availability note. Existing welcome heading and task-oriented introductory line are adequate starting points; no new hero or headline decision. A concise “Kostenlos · Ohne Anmeldung” / “Free · No account required” was proposed in sketches, not separately explicitly selected: sensible optional microcopy if verified accurate and consistent with actual release capabilities, not a new mandatory feature or claim of no optional account integration. Do not promote unfinished features. DE/EN copy, narrow viewport, visual alignment, accessible names and focus need acceptance.

### 5.2 Optional information disclosure before footer

A small collapsed-by-default, user-expandable section at the bottom of Home, before the existing footer, with two to three short helpful paragraphs for interested visitors and search engines. Working heading: “Was ist easyTimer?” / “What is easyTimer?”. Not a compulsory onboarding step, pop-up, modal, wizard, documentation wall, or separate landing/marketing page. The earlier proposal for native HTML details/summary is a preferred simple implementation candidate, not a separate library dependency. Keep text as meaningful regular HTML content in the page rather than requiring a network request or click-triggered insertion; fit existing DE/EN mechanism and actual rendering so inactive translations are handled correctly, and verify crawler-visible content rather than promising indexing/ranking. Use existing semantic markup, keyboard-accessible disclosure and theme tokens. No unrelated SEO overhaul, analytics, tracking or new external requests.

Working DE copy (illustrative, adjust to verified shipped functionality and final glossary):
“easyTimer ist ein kostenloser Online-Timer für Meetings, Workshops, Retrospektiven und konzentriertes Arbeiten. Starte einen einzelnen Countdown oder verbinde mehrere Aktivitäten zu einem zeitlich strukturierten Event.

Bereite Events mit individuellen Phasen, Zeiten, Informationen und Ressourcen vor. Speichere wiederverwendbare Event-Templates, aus denen du eigenständige Events erstellen kannst.

easyTimer funktioniert direkt im Browser, ohne Installation und ohne verpflichtende Registrierung.”

Working EN counterpart:
“easyTimer is a free online timer for meetings, workshops, retrospectives and focused work. Start a single countdown or organize several activities into a timed event.

Prepare events with individual phases, durations, information and resources. Save reusable Event Templates to create independent events.

easyTimer works directly in your browser, without installation or a mandatory account.”

The informational text should complement, not repeat excessively, the individual mode descriptions. Mention only shipped features at the point of publication. No guaranteed SEO benefit; usefulness, semantic discoverability and truthful descriptions first. An inactive Stopwatch need not be promoted in the longer description.

## 6. Scope, consistency and acceptance

This is user-facing terminology consolidation, not technical rebranding. Retain identifiers such as session, template, execution, run, existing mode enums, CSS/DOM IDs, event channels, module/file names, storage keys, database/data formats, schema version, import/export compatibility, JSON field names, timer engine, local storage and recovery. Do not change internal persisted strings, user content, runtime ownership, permissions, URL behavior, lifecycle state machine, backup contracts, service worker architecture or data model simply to match labels. Ordinary release versioning/cache updates, if needed for an approved future implementation, remain governed by existing release process.

Inventory actual DE/EN visible strings in Home, menu, Event Timer, picker, editor/library, empty states, example, headings/settings, phase and information overlays, Facilitator Panel where already relevant, validation, confirmations, lifecycle/recovery and archive text, accessible names/tooltips, informational pages/About/FAQ, and documentation/help snippets exposed to users. Reconcile actual source and tests; do not silently apply proposed future content to older production versions. Existing tests that assert old visible copy may need targeted updates when implementation is explicitly approved; technical invariants and compatibility tests must remain. Do not mechanically mass-rename historical developer docs, technical terminology or test identifiers. This checkpoint is the glossary authority for reading older UI descriptions.

Targeted supersessions only: old Welcome-preservation rule now allows §5; previously agreed Session-* visible labels, Templates/Executions tabs, “Session starten”, “Durchführung planen”, and prepared “Session notes” / execution “Workshop-Notizen” visible names now follow §§2–4. All previously confirmed layout, actions, state, default expansion, library views, persistence and interaction details remain authoritative. In particular, do not turn the information-area wording discussion into a new structural UI design round.

Additional novice acceptance objective (proposed in simulation and owner requested to record outcomes): a fresh visitor, without tutorial or prior knowledge of product jargon, can identify the suitable mode, understand how a reusable Event Template relates to an Event, and make the protected example retrospective READY in the Event Timer. Suggested exploratory benchmark: within about two minutes, without help; not a measured baseline or a guarantee, and only meaningful once the relevant example/entry flow is available. Use a fresh isolated browser profile and real interaction, ideally with a genuinely unfamiliar tester. Also test an ordinary single countdown and a new independent Event from a template; verify Start action semantics and no unintended edits. Record observed blockers, time and actual navigation separately from assumptions. Test both DE/EN, narrow mobile and desktop, Light/Dark/System, disabled Stopwatch, disclosure keyboard and touch, text wrapping and 44px targets, existing recovery/return behavior, and glossary consistency across relevant views. Existing actual browser and release gates remain.

## 7. Handoff and scheduling

Concept accepted; no implementation performed here. Home descriptions/disclosure are a candidate small, separately testable Quick Win; terminology affects more surfaces and should be inventoried before estimating or slicing. Avoid partial inconsistent naming in a public release; coordinate visible copy with the approved Editor design and actual feature availability. The owner did not authorize a new release, decide new backlog ordering or authorize an immediate patch. Existing B2 / Facilitator Panel scheduling and NANO-001 priority remain intact unless explicitly revised. Proceed with the planned IST/SOLL audit using the latest glossary and this targeted Home addendum, propose implementation slices and dependencies, and obtain scoped GO. Preserve all genuine open decisions; final text/placement/accessibility and code feasibility are verification points, not excuses to reopen approved terminology.
