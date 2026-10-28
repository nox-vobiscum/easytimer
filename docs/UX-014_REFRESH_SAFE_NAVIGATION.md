# UX-014 — Refresh-Safe Navigation

Implemented locally on `feature/ux-014-refresh-safe-navigation`, based on accepted
REL-001B checkpoint `f3ad90c2911c88beee268604f41989b0e711058b`.
Locally functionally accepted by the product owner in Firefox on PWA v48.
Real iOS/PWA and screen-reader acceptance remain outstanding. Production remains NO-GO.

## Behavior and boundaries

`sessionStorage.easyTimerView.v1` records only `quick`, `session` or `editor`.
It is updated on view changes, not countdown ticks. No routing framework, URL
changes or browser history entries are introduced. Back/Forward retains normal
document navigation; it does not traverse internal easyTimer views. Existing
discard/replacement guards still apply to menu and Editor navigation.

The existing REL-001A/B recovery initialization runs first and remains the
authority for runtime mode, identity, snapshot, phase and deadlines. Restoring
the Editor only opens the existing library interface above that runtime; closing
it returns to the recovered timer. It neither creates a Session Run nor loads a
saved definition into one. The timer stays hidden until the appropriate view is
rendered, avoiding a visible default Quick Timer before Editor restoration.

A remembered Session view without a valid accessible Run opens the existing
localized Rundown picker with its usual explanatory text and disabled Load action
until a saved definition is selected. A valid recovered runtime takes precedence
over inconsistent or obsolete view metadata. An unresolved recovery choice/error
takes precedence over view restoration: the Quick recovery surface remains
available with no selected candidate. No automatic takeover or candidate selection
is added, and Web Locks continue to enforce ownership.

New contexts without view metadata default to the existing recovered-runtime or
Quick view. View state is not shared through localStorage. Browsers may clone
sessionStorage when duplicating/opening a tab; copied runtime ownership still
cannot displace a live owner, and later view navigation remains independent.
Unavailable sessionStorage disables view persistence without blocking navigation.

Only the main view is restored. Native fullscreen, presentation fallback,
Clock-only view, menu, backup disclosure, editor selection and unsaved drafts are
not restored. Existing dirty-draft beforeunload/discard warnings remain intact
where browsers support them. If the user accepts reload, unsaved draft edits are
lost; the Editor reopens its saved library, not a recovered draft. Draft recovery
requires a separate increment. No Google login, sync publication, ticket mutation
or production data migration is introduced.

## Verification

Focused browser coverage extends the existing disposable-profile harness:
Quick/Session/Editor reload, initial hidden timer, preserved READY/paused/running
and completed runtime identity/deadlines, dirty-draft unload/cancel guards,
invalid view fallback, safe empty-Session picker, cloned/fresh tabs with explicit
recovery, independent navigation, unchanged history length, DE/EN, Light/Dark and
320px. Existing REL-001A/B cases cover overtime, automatic catch-up and ownership
takeover. Offline PWA checks now include Editor refresh; the development-SYNC
regression verifies restoration with asynchronous IndexedDB storage and mocked
Google transport. No owner browser storage is used.

Commands:

```sh
node --test tests/*.test.mjs tools/app-sync/gate.test.mjs
node tests/browser-check.mjs
node tools/app-sync/browser-check.mjs
git diff --check
```

PWA shell/CSS/app/recovery references advance to v48; planner v43 and other unchanged dependencies retain their established
versions. The Development entry imports app v48. The backlog is preserved
byte-for-byte and excluded from this increment's changes.

Manual owner checks: reload each main view; open Editor while a Session runs,
reload and return without changing its Run; test paused/final overtime; cancel
an unsaved-draft departure; duplicate a Session tab and verify ownership refusal;
check fresh tabs, offline reload and language/theme/mobile layouts. The owner
Firefox acceptance is recorded below; actual iOS Safari/installed-PWA lifecycle,
beforeunload dialog presentation and screen-reader acceptance remain manual checks.

Actual local results: all 113 Node/gate tests passed. The complete application
browser suite passed, including the new navigation checks, real document
Back/Forward, existing recovery, DATA-001, responsive/localized controls and
offline PWA Editor/Session reload. The development-SYNC browser suite passed
with real isolated IndexedDB and mocked transport (14 integration, 28 conflict
and 4 diagnostic scenarios plus application UI checks). JavaScript syntax,
version references, unchanged backlog hash and `git diff --check` passed.
The localhost server serves the development entry and app/CSS/recovery v48. No Google
requests or owner browser/storage operations were performed for validation.

## Acceptance blocker correction: unresolved choice after reload

The owner twice observed in Firefox/v47 that a duplicated running Session tab
offered recovery, then lost that choice after ordinary F5 without a decision.
The existing recovery initializer allocated a separate context when the copied
owner context was locked. Its first render saved an independent default READY
Quick clock. Reload restored that clock and skipped candidate discovery because
`restored` was truthy. Neither hiding/rendering the chooser nor sessionStorage
view selection was an explicit dismissal. This underlying lifecycle branch was
already present in the committed REL-001B baseline, and also affected ordinary
new contexts with candidates and Quick candidates. The previous duplicate-tab
test checked only the initial chooser, not its undecided reload.

The existing context record now accepts an optional strictly boolean
`recoveryPending` field. It is written atomically with that context's clock,
without another storage key, system or migration. Pending initialization reloads
and validates all available candidates and queries advisory ownership, even when
its own independent clock was restored. Explicit dismissal or successful recovery
clears the flag through the existing semantic save. Web Lock acquisition remains
mandatory before takeover; original clocks, Runs and saved Rundowns are untouched.
If no candidates remain, localized feedback and the independent-timer action
remain visible rather than silently resolving the decision. A pending Quick
chooser takes precedence over remembered Editor/Session view metadata on reload.

Two focused unit reproducers failed before the fix and passed afterward. The
113-test suite now additionally covers changed/deleted candidates, changed
ownership, successful recovery, dismissal and strict marker validation. Browser
tests duplicate both a running Session and a running Quick Timer, reload undecided
with ordinary reload and CDP `ignoreCache: true`, verify visible/unselected
choices and unchanged originals, reject active-owner takeover, then explicitly
dismiss and verify a further reload stays resolved. The complete application/PWA
and development-SYNC browser suites passed after the correction. The owner has
subsequently accepted the correction in Firefox; iOS/PWA/screen-reader checks
remain outstanding.

Already lost pre-v48 decisions cannot be inferred safely from an ordinary legacy
READY record: doing so would resurrect genuinely dismissed choices. No speculative
repair or owner storage modification is performed. For owner retesting, load v48
in the original tab, duplicate its running Session anew, leave recovery undecided,
then test F5 and hard reload, ownership refusal and explicit independent dismissal.
No browser storage clearing is required. This retest has now passed in Firefox;
production remains NO-GO.

## Completed local owner acceptance

The product owner passed local Firefox acceptance on PWA v48. The Editor remained
visible after F5; a running Quick Timer retained its view and continued correctly.
Running and paused Session Runs survived Editor navigation, F5 and return; paused
time remained frozen, and a completed workshop retained continuing final overtime.
A duplicated tab showed explicit recovery without taking ownership. The selection
remained open and unselected after F5 and Ctrl+Shift+R. Explicitly choosing Use
current timer closed it and showed the independent 05:00 READY Quick Timer; both
reload variants preserved that decision without reopening the chooser.

These are owner-observed Firefox results, distinct from automated test coverage.
The recoveryPending acceptance blocker is accepted as corrected. Unsaved Editor
drafts are not restored and no new history routing exists. Real iOS/PWA and
screen-reader acceptance remain outstanding. This is local development acceptance,
not production release readiness. Production remains NO-GO.
