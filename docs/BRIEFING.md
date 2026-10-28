# easyTimer — Project Briefing

**Last reviewed:** 2026-10-26
**Repository:** https://github.com/nox-vobiscum/easytimer  
**Production:** https://et.rbsnet.at/

**Verified production closeout:** DATA-001 is complete, owner-accepted and deployed as `9dcf75d8adec963209d58a9d00af4ad05e2567e7`, annotated tag `release/data-001-v35`. [FTP deployment 40132478801](https://github.com/nox-vobiscum/easytimer/actions/runs/40132478801) succeeded; all 18 served source files matched the release Git blobs, and isolated production Picker and portability checks passed. The subsequent footer-only hotfix `409229ae428d9cdea41306a91a2a47984a857ec2` is the current production baseline; [deployment 40132780761](https://github.com/nox-vobiscum/easytimer/actions/runs/40132780761) and focused production footer checks passed. Shell/CSS use v36; unchanged JavaScript modules retain v35. Footer links have no underline and retain visible keyboard focus.

**Deployed menu release:** `release/menu-editor-v31`, rollback `checkpoint/before-menu-editor`; feature branch preserved. Rundown entry/footer subsequently shipped as `release/rundown-footer-v34`; DATA-001 below is complete and deployed.

## 1. Current product

**Isolated synchronization research (not a production feature):** [SYNC-002C](SYNC-002C_ISOLATED_INTEGRATION.md) is an **isolated integration PoC validated with real Google Drive**, based on owner-operated synthetic tests. First sync included real HTTP 409 on duplicate create and subsequent GET 200; normal Firefox plus private Firefox independently detected the same concurrent-content conflict (3 snapshots, 2 heads). Reload recovery after a **simulated** missing acknowledgement used GET only, without a new POST. Later local edits remained dirty until their own publication; an observed authorization-expiry/reconnect condition preserved local state and the logical operation. These owner observations are distinct from automated/mock tests and do not establish physical cross-device, actual packet-loss or iOS acceptance. Interactions felt very fast to the owner; no benchmark was measured. Opera GX had an uninvestigated setup rendering issue.

**Local application increment:** [SYNC-003A](SYNC-003A_LOCAL_APPLICATION.md) adds optional application storage hooks and a separately enabled localhost development entry for Google Drive in Data & Backup. Normal application mode has no Google panel, credentials or external login requests. Explicit activation copies/validates/read-backs the local library into IndexedDB, retains the original localStorage value, guards old writers and keeps JSON operations on the authoritative store. Immutable snapshots/readback, explicit empty-client adoption and guarded clean fast-forward are implemented; conflicts stop for later SYNC-003B review. No cleanup; SYNC-099 is deferred and D1's checkpoint replacement is not adopted. The local shell references v37 for changed modules; deployed production remains v36 shell/CSS with v35 JavaScript.

**SYNC-003A — Local application integration implemented and owner-validated with real Google Drive. Production NO-GO.** In the actual localhost application, the owner created and inspected an independent schema-version-1 JSON backup of `SYNC-003A Test`, published from normal Firefox, explicitly adopted it in initially empty private Firefox, edited phase `synctestphase01` from 05:00 to 07:00, synchronized back without conflict and loaded the Session Timer READY with countdown and workshop remaining both 07:00. This validates the tested same-device Firefox-context round trip, not a physical second device, iOS or production. The approximately three-second publication observation was informal, not a benchmark. Earlier automated tests are retained as historical evidence, not rerun during this documentation closure.

**Synchronization release gate:** Production synchronization remains **NO-GO**. The owner rejected the technical local-storage activation confirmation for production: use understandable DE/EN wording and seamless safe preparation where possible, confirm only real user decisions, and preserve all migration/readback/rollback safeguards. Actual iOS Safari/installed-PWA tests, a physical second device, physical interruptions, real quota exhaustion, Opera GX rendering and production migration/packaging/public OAuth/privacy remain open. A future separately reviewed Google identity UX should provide official authorization, a circular actual-profile-image indicator when available and compact name/email menu near the desktop header menu, with minimalist mobile placement; distinguish connection from synchronization. Evaluate `openid`, `profile`, `email` alongside `drive.appdata` only under separate implementation review, with no new permissions or account-data processing now. Review empty-library pending status and the Connect action remaining visible when connected. The false initial sync error is fixed; the zero-byte download remains unreproduced. No hosting, OAuth or deployment-workflow changes. DATA-001 and local-only use remain independent; this implementation is not deployed.

**SYNC-003B — functionally accepted in local development:** [minimal explicit conflict resolution](SYNC-003B_CONFLICT_RESOLUTION.md) supports exactly two current heads with a unique validated common ancestor and live-versus-live conflicts. The accessible DE/EN comparison has no default, offers A / B / Keep Both and requires result review plus explicit confirmation. Copies receive fresh durable IDs and numbered names; canonical and semantic validation cover names/content. A durable sidecar and fixed upload ticket recover uncertain publication without duplication; only verified sole-known-head discovery and an unchanged local revision permit atomic installation. Original snapshots, unrelated changes and newer local edits remain preserved. Existing ordinary ticket validation remains intact; a separately guarded immutable sibling publication allows sequentially syncing independently edited clients to reach two reviewable heads. Owner-operated real Google Drive acceptance passed for A/B/Keep Both, explicit conflict-free reconciliation, live recovery and preservation of the second client's unpublished changes. Both Firefox contexts ended with the same 13:00 + 08:00 library and Synced (last checked). Final local diagnostics showed one valid head, matching base, no dirty changes and no pending tickets; they do not independently verify current remote Drive state. Production remains NO-GO. Unsupported cases stop safely; no version-history UI or production release. The desired late-offline-edit-as-copy behavior remains deferred and unproven. Append-only snapshots remain accepted; D1 replacement is not adopted and SYNC-099 remains Someday / Maybe / Very Low.

**DATA-001 (complete and deployed):** [Rundown portability](DATA-001_RUNDOWN_PORTABILITY.md), branch `feature/data-001-json-portability`, annotated `checkpoint/before-data-001` on verified production `fb719f7` (v34). Editor row downloads and secondary Data & Backup reuse schemaVersion 1. Strict 10 MiB JSON imports show a review before opening one dirty unsaved fresh-ID draft or saving a complete additive fresh-ID batch through existing conflict checks. Source definitions, timers and local storage keys remain independent. Session menu export uses the original isolated snapshot only. Shell v36 caches `portability.mjs?v=35`. Owner acceptance and successful deployment complete; release tag `release/data-001-v35`. INFO-001 information pages, cloud/login/Drive and AI conversion remain separate backlog work; no menu-footer link work is included.

**Current Rundown entry:** The Rundown picker keeps `Load Rundown` / `Rundown laden`, the visually hidden native label and short selection placeholder. A muted context line explains selecting a saved rundown for Session Timer. Load and Refresh list remain the main controls. The separate secondary `Open Session Editor` / `Session-Editor öffnen` action, with list/edit SVG and `Create & edit rundowns` / `Rundowns erstellen & bearbeiten` subtitle, opens the existing library overview. Creating a new draft happens there; it preserves initial phase/defaults, stable IDs, validation and discard guards. Loading leaves phase 1 READY without starting, with an isolated Manual/Automatic snapshot. Saved-data and page-reload explanations and Back to Quick Timer remain available. Workshop field/validation and active Session terminology remain deferred; models and persistence keys are unchanged.

The same release includes the owner-approved fixed English footer credit, with a monochrome Unicode heart and new-tab links to `https://rolandseper.at` and `https://rbsnet.at`. Existing responsive wrapping/safe areas and sticky progress docking remain in place. INFO-001 in the backlog describes future standalone information pages linked from the menu; no pages, routes or menu links are implemented in this release. The v34 footer is deployed; the subsequent v36 hotfix removes link underlines without changing focus or navigation. No infrastructure changes are included.

**Accepted menu refinement:** `feature/menu-mode-hierarchy` adds compact equal Quick/Session mode tiles with `aria-pressed`, a separate **Session Editor** action (DE: **Session-Editor**) with localized subtitle, then one language/theme row. The visible workspace heading and accessible region name use Session Editor; internal Planner names and data remain unchanged. The owner-selected Session Timer icon is Variant B, Stopwatch + Echo, with theme-specific rear-echo opacity. Matching local PWA references use v31. The owner has authorized commit, integration and production publication of this UI increment. Short panels scroll; two mode columns, visible focus and 44px targets remain available. `tests/menu-browser.mjs` adds a temporary review gallery and navigation/layout/terminology checks to the full browser suite. No clock, coordinator or persistence behavior changes are included.

easyTimer is a lightweight, dependency-free countdown timer for meetings, workshops, facilitation, and personal timeboxing. The release includes subtle overtime, unified presets, continuous time-budget extensions, and a persistent budget line. Manual Session timing is delivered; automatic transitions are deployed in ST-002B. Ad-hoc timing, alarms and presentation settings remain future scope.

The countdown is the dominant element. UX-007 uses two layout families sharing one timer state: Standard (desktop/tablet and smartphone portrait) and Presentation (explicit desktop/tablet fullscreen/fallback and automatic smartphone landscape).

**Approved targeted SYNC-003B correction:** in addition to actual content conflicts, the application now accepts fully validated conflict-free two-head proposals. It shows the complete readonly result without A/B choices and still requires explicit confirmation, using unchanged durable publication/readback/discovery and revision guards. See [implementation and A-first owner procedure](SYNC-003B_CONFLICT_FREE_RECONCILIATION.md). The correction passes 149 Node tests, 28 conflict scenarios and application/browser regression. Owner-operated real Google Drive recovery and final synchronization to both Firefox contexts passed. The agent did not operate the owner contexts. No production release.

## 2. Implemented behavior

- Select one of eight presets (1, 2, 3, 5, 10, 15, 30, 60 minutes) while ready. Selection does not start the timer.
- Add +1 h, +5 min, +1 min, or +30 s in every state and presentation. The effective budget cannot exceed `99:59:59`; exceeding it gives localized feedback.
- `Start` begins the configured duration.
- `Pause` freezes the exact remaining duration; `Resume` continues from it.
- UX-003 removes the dedicated Restart UI and hides Stop in READY; the shared engine retains RESTART for future use. Stop followed by Start starts the planned duration again.
- `Stop` restores the original configured duration and remains ready.
- UX-009 replaces expiry with one large red `+00:00` readout, increasing from the authoritative deadline; localized finished status remains.
- Overtime continues until Stop or New Run. Stop restores the planned duration and remains ready; New Run immediately starts it and clears extensions.
- Zero, blank, fractional, negative, and out-of-range durations are rejected.
- UX-002 configuration presets are hidden while running, paused, or expired, remain hidden after New Run, and return after Stop in standard, native fullscreen, and expanded views. READY presets also appear in automatic mobile landscape. Manual duration entry remains outside scope.
- Adjustment headings follow state: READY uses “Add to duration” / “Dauer ergänzen”; RUNNING and PAUSED use “Extend remaining time” / “Restzeit verlängern”; FINISHED uses “Extend time budget” / “Zeitbudget verlängern”. All four additions remain available. The standard readout is anchored independently of the changing control height.
- Before Start, additions become part of planned duration. After Start, additions extend the effective budget while preserving active elapsed time and pause state. Stop and New Run discard extensions and restore planned duration.
- Adding time in overtime shifts the existing deadline: smaller additions reduce overtime, an exact compensation stays at zero, and larger additions return to countdown. This explicitly supersedes ET-001 decision 37.
- Remaining time and overtime are derived from the deadline. Delayed callbacks and background-tab throttling do not accumulate timer drift.
- A theme, language, orientation, viewport, or presentation change never resets the timer.
- Local REL-001A restores validated Quick Timer runtime after same-tab reload; deadline-based elapsed time, frozen pause, configuration and extensions are preserved. Restart without a reliable context association requires explicit recovery selection. Session recovery was outside that slice. See [scope and limitations](REL-001A_QUICK_RECOVERY.md). Locally functionally and visually accepted by the product owner in desktop browsers; real iOS/PWA and screen-reader acceptance remain outstanding. This is local development, not a production release; production remains NO-GO.
- Local [REL-001B](REL-001B_SESSION_RECOVERY.md) now extends the same store/ownership mechanism to Session Runs and supersedes REL-001A's Session-reload limitation. Original run identity/snapshot, progression mode, current phase, settled overtimes and paused/terminal states are preserved. Automatic reconstruction uses scheduled deadlines in the existing coordinator. Restoration selects the runtime's Quick/Session mode without restoring Editor/navigation/presentation state. Shell v46; local Firefox owner acceptance passed, including ownership refusal/takeover and continued final overtime. Real iOS/PWA and screen-reader acceptance remain outstanding. No production release, four-hour recovery UI or draft persistence.

Local [UX-014](UX-014_REFRESH_SAFE_NAVIGATION.md) adds tab-scoped main-view restoration after REL-001A/B initialization. Editor refresh preserves the underlying runtime; missing Session Runs use the existing picker, while unresolved recovery choices remain explicit. No internal history navigation or draft persistence is added. Shell/app/recovery v48; local Firefox owner acceptance passed, including persistent unresolved recovery choices and explicit dismissal across normal/hard reload. Real iOS/PWA and screen-reader acceptance remain outstanding; production remains NO-GO.

## 3. Interface and responsive behavior

UX-004 adds a dynamic browser tab title: READY uses `easyTimer`; RUNNING uses `04:37 · easyTimer`; PAUSED uses `04:37 ⏸ · easyTimer`; FINISHED uses `+01:23 · easyTimer`. Existing formatters include hours as needed. The render loop writes the title only when its formatted value changes. No extra interval or timer state is introduced; existing visibility/page-show events reconcile deadline-based time after throttling. Installed PWAs require no special behavior.

- Product identity is `easyTimer`, using dedicated standard and dark stopwatch artwork with a matching multi-size favicon.
- Every user-facing string, tooltip, status, and accessible label is available in German and English.
- Light, Dark, and System appearance options are supported. System follows the operating-system preference.
- Language and appearance preferences are stored in browser-local storage.
- UX-006 replaces permanently visible desktop preferences with one shared upper-right hamburger trigger across all widths and presentations. The existing DE/EN and Light/Dark/System controls live in an anchored, safe-area-aware dropdown with separate visible group headings.
- Escape, an outside click, or the trigger closes the menu. Escape restores focus and is handled before application fullscreen/expanded-view exit; other close paths also prevent focus remaining in hidden content. Closed preferences are hidden from display and keyboard navigation.
- The menu and trigger sit outside the standard header, so presentation can hide that header without hiding preferences. Fullscreen exit has a separate 44 px area beside the menu. On short displays the dropdown scrolls internally; open menus remain anchored through resize and rotation.
- Mobile portrait, including installed iPhone PWA presentation, respects display cutouts and safe areas.
- A coarse-pointer device with a short screen side below 600 CSS px is treated as a smartphone; only its landscape viewport automatically activates Presentation. Screen dimensions, not viewport dimensions alone, keep tablet split views Standard. Small tablets, foldables, external displays and unusual browser/zoom reports are documented heuristic edge cases.
- Native Fullscreen API is used where available. A reversible full-viewport fallback is used when fullscreen is unavailable or rejected.
- Every Presentation, including automatic smartphone landscape, shows small branding at the safe top-left edge and the universal menu at top right, without the regular header or footer.
- Desktop/tablet expose a direct Presentation toggle; its exit is a separate bordered 44 px button left of the hamburger. Smartphones hide the toggle in both orientations; rotation never requests native fullscreen.
- The shared stage centers the clock and status above actual preset/control rows. READY accommodates configuration; active and expired runs use the freed space for larger digits. The shared actions, additions, budget and progress remain unchanged. Extreme height constraints allow scrolling instead of inaccessible controls.
- Actions combine SVG icons and localized text when spacious; constrained control bars show icons with full localized accessible names. All four time additions remain directly visible in every view, with values and units always shown. Presets appear only in READY in all views.
- A small safe-area-aware budget line above the progress strip shows Total, or Total · Planned + additions. It is not a live region and updates only when budget values or language change.
- A five-pixel bottom strip shows remaining time in pink and elapsed time in green. It is decorative and is not announced on every timer tick.

## 4. Progressive Web App

easyTimer is installable from supported browsers through `src/manifest.webmanifest`. The manifest declares standalone display, app colors, and 192 px and 512 px icons. An Apple touch icon is included for iOS.

`src/service-worker.js` precaches the same-origin app shell after the first successful online visit. Navigation falls back to the cached index while offline. The cache name is versioned; activating a new version removes older `easytimer-` caches. Service workers require HTTPS or localhost.

Offline reload can restore Quick or Session runtime when the shell is cached and local persistence/context isolation are available. Storage failures disable reliable recovery visibly without blocking ordinary timer use. REL-001B does not modify saved Rundowns, DATA-001 or Google Drive synchronization.

## 5. Architecture

ST-001 adds the Session Planner as a separate application workspace, reachable from the universal menu without reloading. It manages reusable planning data independently of the delivered manual Session Timer. The Quick Timer instance and deadline-based updates continue while the workspace is open. Explicit fullscreen/expanded presentation is cleared on entry and never restored automatically; smartphone landscape presentation resumes normally when returning to the timer.

`src/js/templates.mjs` provides schema validation, isolated draft cloning, stable-ID reordering and local load/save persistence. `src/js/planner.js` renders the library/editor with German and English labels. Schema version 1 under `easyTimerTemplates` contains templates with `id`, `name`, `transitionMode` and ordered `phases` (`id`, `title`, `durationSeconds`). The Session Run owns separate execution state and phase-overrun records; one shared clock owns deadlines/overtime. No runtime data is persisted inside templates.

Names/titles allow 1–120 trimmed characters; at least one phase is required. The compact editor has one minute input per phase, accepting positive integers 1–6,000, and a derived workshop maximum of 60,000 minutes. Storage keeps whole-minute `durationSeconds` values with no legacy migration, fallback or rounding. Totals display full hour counts, including `100:00:00` and `1000:00:00`. Quick Timer limits and timing are unchanged. Save validates before persistence; Cancel/close confirms changed drafts. Deletion is confirmed.

Creating a template seeds only its isolated editor draft with one empty-title phase (UUID, 10 minutes, localized placeholder) before capturing the clean baseline. Focus remains on the workshop name. No automatic persistence occurs. Deleting the row does not recreate it; existing templates are not seeded. Save validation still requires a workshop name, phase title and at least one phase. Focused browser regressions cover initial defaults/identity/localization, validation/save, untouched/reverted/changed cancellation and deletion.

CSS Grid aligns phase number, flexible title, minutes and two 44 px SVG actions (reposition/delete) in one row where space permits. At content widths of 320 px or less, duration/actions wrap below the title with a visible duration label. Full title values remain editable despite unfocused visual truncation. A single shared, nonmodal repositioning popover uses native buttons/select: one-step up/down or explicit Move to a final 1-based position. Boundary steps and unchanged positions are disabled. Reordering only mutates the isolated draft, preserving IDs and values. Focus returns to the phase trigger after a move or Escape; outside focus is respected. The popover is positioned once on open and closes on page scroll/resize rather than tracking geometry continuously. Metadata is side by side where practical; totals remain below the phase list. Existing tokens, responsive timer layouts, sticky dock and footer behavior are preserved. Ordinary typing does not rebuild inputs; language changes restore focus and cursor selection. Phase insertion behavior is unchanged.

Invalid or unsupported stored data blocks writes without deleting records. Read/write errors retain drafts and existing storage. A raw-snapshot optimistic check blocks detected cross-tab conflicts on save/delete; simultaneous writes in the comparison/write window remain a documented localStorage limitation. Reload is explicit and confirms draft loss. Optional JSON export/import can later reuse schema validation with explicit ID-collision decisions; cloud storage and authentication are not included.

The verified production shell v28 and accepted menu shell v31 include both planner modules with versioned URLs. Run `node --test tests/timer.test.mjs tests/templates.test.mjs` and the existing browser regression, including `tests/planner-browser.mjs`. The latter covers localized field-error associations, normalized unsaved-change detection, duplicate template names, stable IDs after full reload, genuine cross-tab storage conflicts, compact responsive layouts and minute/large-total boundaries. Repositioning tests include exact long-list destinations, save/cancel/undo, retained invalid fields, native keyboard selection, emulated touch, focus/dismissal and popover fit across languages/themes. Native iOS Safari/PWA keyboard, position picker, safe-area, fullscreen and screen-reader checks remain explicitly open for final release acceptance on real hardware.

- `src/index.html`: semantic single-timer interface, PWA metadata, header, controls, and progress strip.
- `src/css/styles.css`: design tokens, themes, safe areas, responsive standard and presentation layouts, and universal menu.
- `src/js/timer.mjs`: DOM-independent timer state and transitions.
- `src/js/session.mjs`: validated manual run snapshots, phase selection, settled phase overrun records and derived workshop remaining; one clock remains owned by `app.js`.
- `src/js/time-visuals.mjs`: pure UX-008 threshold/visual-state selector, called once in shared rendering with current-clock budget. No engine, Run or interval changes.
- `src/js/app.js`: rendering, localization, browser events, fullscreen behavior, responsive presentation, preferences, and service-worker registration.
- `src/manifest.webmanifest`: install metadata and app icon declarations.
- `src/service-worker.js`: versioned offline app-shell cache.
- `tests/timer.test.mjs`: deterministic timer transition and formatting tests.
- `tests/templates.test.mjs`: template validation, isolated drafts, exact-position reordering and storage safeguards.
- `tests/session.test.mjs`: Session snapshot/progression/overtime/reset/limit invariants and shared-engine policy isolation.
- `tests/session-browser.mjs`: Session picker, confirmations, active Planner navigation, responsive views, final overtime and template isolation; invoked by the browser check.
- `tests/time-visuals.test.mjs` and `tests/time-visuals-browser.mjs`: fixed-bucket boundaries, effective budgets/current phases, overtime states, actual palette/contrast and cross-view integration.
- `tests/planner-browser.mjs`: Planner creation/edit/save/cancel, initial phase, localization, validation, storage conflicts, responsive layouts and repositioning interactions; invoked by the browser check.
- `tests/browser-check.mjs`: Chromium regression test for UI, timing, accessibility-related geometry, fullscreen/fallback behavior, mobile layouts, PWA registration, and offline reload.

The timer object is the single authoritative state source. It contains status, planned duration (`durationMs`), cumulative post-start additions (`adjustmentMs`), remaining milliseconds, a deadline, and deadline-derived overtime. `timeBudget` derives effective total and elapsed active time (excluding pauses); rendering and browser presentation do not own independent timer state.

## 6. Local development and validation

The application uses native ES modules and must be served over HTTP rather than opened with `file://`:

```sh
python -m http.server 8000 --directory src
```

Run the dependency-free checks with Node.js 22 or newer:

```sh
node --test tests/timer.test.mjs tests/templates.test.mjs tests/session.test.mjs tests/time-visuals.test.mjs
node --test tests/virtual-clock.test.mjs
node --check src/js/app.js
node --check src/js/timer.mjs
node --check src/js/planner.js
node --check src/js/templates.mjs
node --check src/js/session.mjs
node --check src/js/time-visuals.mjs
node --check src/service-worker.js
node --check tests/browser-check.mjs
node --check tests/planner-browser.mjs
node --check tests/session-browser.mjs
node --check tests/time-visuals-browser.mjs
node tests/browser-check.mjs
```

The browser check uses an installed Chromium-based browser and an isolated temporary profile. On Windows it defaults to Microsoft Edge; `EASYTIMER_BROWSER` can select another Chromium executable.

For fast deterministic visual inspection, DEV-001 extends this harness with [virtual-time scenarios and screenshot galleries](DEV-001_TIME_TRAVEL.md). The clock override exists only inside the isolated test browser; production code, stored user templates and PWA behavior are unchanged. The default browser command continues to run the complete regression suite.

## 7. Deployment

The verified production baseline is PWA v28; the accepted menu release uses v31 across HTML, imported modules and service-worker entries. Automatic reconciliation stays in the Session Coordinator; the shared timer engine and template storage are unchanged. The existing FTP workflow, hosting and DNS remain unchanged.

UX-008 adds one derived render attribute and semantic theme tokens shared by Quick/current Session phases; timing and progress remain unchanged. See the [canonical UX-008 record](EASYTIMER_UX_KONZEPT_v2.md#ux-008--shared-timebox-endgame-highlight-approved-implemented-locally) for its single threshold table, amber/red semantics and intentionally deferred ON/OFF preference. No timer-engine change, independent warning clock, sound or new live announcements is involved.

`.github/workflows/deploy.yaml` deploys pushes to `main` through the existing FTP action. Deployment credentials remain in GitHub secrets. Do not modify the workflow, push, merge, or deploy without separate owner authorization.

The production workflow currently uploads the static repository contents. There is no build step, backend, database, or runtime package installation.

## 8. Language policy

- Product-owner and agent conversation is in German.
- Repository code, comments, documentation, test names, and commit messages are in English.
- German product translation resources are an approved repository exception because the interface supports German and English.

## 9. Product direction

`docs/EASYTIMER_UX_KONZEPT_v2.md` is the canonical product and UX direction. Its 56 ET-001 decisions describe accepted long-term behavior, not current production functionality and not automatic authorization to implement future features.

Future work may include subtraction controls, manual duration entry, session timing, ad-hoc timing, signals, restoration, and customization. Each next feature requires a bounded plan and explicit approval.

[`backlog.md`](backlog.md) tracks discussed future candidates and their status; it does not select or authorize the next increment. The published ST-001 density/reordering and initial-phase improvements are complete, while insertion at a chosen position remains future scope. The deployed ST-002A implementation executes manual snapshots; see the [implementation overview](../README.md#st-002a-local-implementation--manual-session-timer) for its exact behavior. ST-002B delivers automatic transitions; runtime editing, detailed statistics and recovery remain later increments.

## 10. Collaboration workflow

1. Inspect the current branch, worktree, relevant documentation, source files, and available tests.
2. Propose one bounded task with affected files, state implications, risks, model recommendation, and validation.
3. Wait for explicit implementation approval.
4. Keep the patch focused and preserve existing dependencies and deployment infrastructure.
5. Run applicable checks and report changed files, results, unrun tests, and remaining limitations.
6. Stop after the approved task. Commit, merge, push, external-service changes, and production deployment require explicit authorization.


## UX-003 responsive control bar

UX-003 unifies timer actions and additions in one responsive control bar. Wide containers show icons with localized action text and full amounts; constrained containers show action icons with complete accessible names and compact +1h/+5m/+1m/+30s amounts. Contextual adjustment headings remain semantic group labels and are visually hidden in compact layouts. Touch targets stay at least 44 px; groups wrap only when necessary. Presets remain a separate READY-only group in every view. Timer calculations, overtime, budgets, progress, and dynamic tab titles are unchanged. No extra settings or dependencies are introduced.
