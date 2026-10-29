# RC-003 — Public information pages: local review draft

Based on `368ce319ee9ed31fe314e0d8b6f10b32dd5c8b3d`. Local implementation only;
no legal approval or publication authorization. Production remains NO-GO.

Owner-operated Firefox navigation acceptance is complete: information-page
chains, F5, retained origin and explicit return to the application passed. Visual
presentation and final editorial/legal content remain subject to owner review.

The shared-header follow-up uses the actual application header and hamburger
menu, rendered from `header.mjs` in the app and every information document.
The dedicated return action remains immediately below the header. Smaller page
titles, restrained section headings, readable
line spacing retain the application conventions. The editorial integration removes
temporary draft notices from public content without granting legal or release approval.
No timer engine, recovery protocol or synchronization behavior is reimplemented.

## Pages and navigation

`about.html`, `faq.html`, `imprint.html` and `privacy.html` are standalone static
documents. All include English and German content, normal links, a return to the
application, the existing credit links and a small shared `info.js` helper.
No timer, Session, recovery or development synchronization module initializes on
these pages. English content remains readable without JavaScript.

`header.mjs` owns the single header/menu markup, open/close state, Escape, outside
click, focus restoration and presentation of the shared language/theme controls.
The app retains its existing runtime and action handlers. The development entry
mounts the same header before attaching its existing optional account control;
normal information pages import neither that entry nor Google code. The former
separate information-header styles and controls have been removed.

`?lang=de` / `?lang=en` takes precedence, followed by the existing language
preference and browser language. Invalid values fall back safely. Explicit
language switching stores the same preference as the app and replaces only the
current URL; it adds no history entries. Cross-page links retain the language.
The existing theme preference and system/light/dark CSS tokens are reused.

The application's menu ends with four localized links. They use native
navigation, preserving the Editor's existing `beforeunload` draft warning.
No extra discard handler or runtime transition is introduced. Each page has a
restrained top-level contextual return action as well as the bottom return link.
The app records only the originating view in the tab's
`easyTimerInformationOrigin.v1` sessionStorage entry. Information pages read it
without replacing it, so cross-page navigation and F5 retain the original view.
The return action uses the normal app entry with `?from=information`, not browser
Back. The app consumes the validated navigation context, removes the query marker
and restores the view only after existing runtime recovery. Unresolved recovery
and ownership checks take precedence. Direct visits without a valid origin use
the normal app entry. Storage denial degrades to existing view/runtime recovery;
there is no second timer, runtime identifier or outbox in the navigation context.
Future modes can extend the recognized view values without adding another timer
engine. Unsaved drafts are not persisted: canceling native navigation retains
them; accepting departure does not promise draft restoration.
Data & Backup now describes local JSON import/export rather than
advertising unreleased Google Drive support. Development controls remain intact.

Information-menu Quick/Session/Editor controls return to the app using the
allowlisted `open` navigation intent alongside `from=information`. Both query
markers are removed before asynchronous view restoration or confirmations.
After recovery, Editor uses `openEditor()` and mode changes use the existing
`switchMode()` guards. A same-mode request only reveals the current timer/Session,
including from the Editor, without creating a new clock or Run. This exception
is limited to information-page handoff; existing in-app mode semantics remain.
Unresolved recovery discards the intent permanently; choosing a recovery option
or refreshing later does not replay it. Unknown intent values are ignored. Normal
return links contain no `open` intent. No navigation intent is stored durably.

The final navigation polish changes only return-link display copy, not URLs or
recovery. Both links identify the retained Quick Timer, Session or Session Editor
origin in DE/EN; direct visits say Go to Timer / Zum Timer. A separate label map
reserves future Stopwatch wording without accepting that view or implementing it.
Labels follow language changes, cross-page navigation and reloads in the same tab.

Shared menu information links use two fixed columns: About/FAQ, then Imprint/Privacy
(localized in German). Default and visited links have no underline; subtle hover
background and the existing focus outline provide feedback. Each grid cell retains
at least 44px height. Content and footer navigation links keep their prior styling.

About and FAQ cover actual Quick/Session behavior, manual/automatic phases,
READY loading, local records, JSON backup/import, reload recovery, tab ownership,
offline/PWA limitations and Shift-click/keyboard subtraction. They do not promise
future READY controls, cloud integration or guaranteed storage retention.

## Editorial integration and remaining legal release gate

The owner-supplied `easytimer_RC-003_infoseiten_polished.zip` contains four text
templates. Only localized article content and changed document titles were taken;
the actual local v59 header/menu, context return, footer, links and script structure
were preserved. The subsequent cache bump does not change navigation behavior.
The English tagline and subtitle remain identical in both languages. No ZIP
instructions were treated as execution authorization or infrastructure changes.

Confirmed owner facts used: Roland B. Seper; 2460 Bruckneudorf, Austria; a private,
free noncommercial hobby project; public contact `noxvobiscum@gmail.at`, copied
exactly without address correction. No forwarding from `office@easytimer.at` is
described or configured. The provider is ALL-INKL; regular access-log creation is
disabled according to the owner's checked setting, not a remote audit by this
increment. Necessary hosting connection/security processing is not ruled out.
No Google Analytics integration exists in the production application.

About is shorter, FAQ drops internal acceptance status, and Imprint/Privacy drop
public draft banners and planned-contact placeholders. All pages retain `noindex`
until a separately approved publication decision. No company, street address,
registration, VAT number, numeric log retention or absolute no-processing claim
is invented. A street address is not automatically declared mandatory solely
because the project has an imprint; applicability of disclosure rules remains
part of final legal review.

The unsupported conditional pre-contractual Art. 6(1)(b) contact purpose was not
copied because no such offering is established. The final audit found that the
German text still claimed no automatic fixed mailbox deletion period was configured,
despite the earlier report that this claim had been omitted. The audit correction
removes that unverified sentence without replacement, aligning German with English.
Purpose-based contact retention text remains, subject to confirmation of actual
practice; local browser storage and hosting processing remain separate disclosures.

Remaining release blockers: final approval of the privacy legal bases/legitimate
interests, actual contact retention and account-specific Gmail recipients and
international-transfer conditions, plus confirmation that the operator disclosure
and disclaimer are appropriate for this project. Gmail provision is stated by the
editorial template; no mailbox/provider account or transfer arrangement was audited.
Email administration stays outside this project. Public provider policies cannot
prove the operator's account-specific settings or replace that confirmation.

Primary references checked read-only: [ALL-INKL privacy information](https://all-inkl.com/datenschutzinformationen/),
[Google privacy policy](https://policies.google.com/privacy),
[Austrian Data Protection Authority](https://www.dsb.gv.at/),
[MedienG section 25](https://www.ris.bka.gv.at/NormDokument.wxe?Abfrage=Bundesnormen&Gesetzesnummer=10000719&Paragraf=25).
No production hosting or email account was accessed or changed.

## Packaging, caching and review

PWA shell/CSS/app use v60 for the editorial integration. Unchanged information
helper/shared header remain v59 and planner remains v55.
Unchanged timer, recovery,
Session and storage modules retain their existing versions. The production
allowlist grows from 18 to 24 files (four pages and two presentation helpers).
Dependencies and local navigation targets are validated in every HTML document
and in shared header markup relative to its root-level host documents. Both deployment
workflows and all credentials remain unchanged.

The pages and helper are precached. On offline information-page navigation the
worker selects that exact document, ignoring language query parameters for cache
lookup. It never substitutes the timer document for a known information page.
The development server permits the four pages without exposing additional tools.

Run the existing focused package/offline checks:

```sh
node --test tests/packaging.test.mjs
node tests/artifact-offline-browser.mjs
```

The offline harness also runs `information-browser.mjs`: direct DE/EN URLs,
invalid-language fallback, keyboard switching/focus, Back navigation, all themes,
desktop/320px, short-menu scrolling, absence of timer initialization, runtime
metadata preservation and the native unsaved-draft warning. It captures screenshots
outside the repository and repeats page checks with the actual server stopped and
HTTP cache disabled. A separate negative control still removes a required cache
entry and proves offline app initialization fails as expected.

For local owner review, use the existing local server and open `/about.html`,
`/faq.html`, `/imprint.html` and `/privacy.html`, including `?lang=de` or `?lang=en`.
Review the final menu links at 320px and cancel an attempted navigation with an
unsaved Editor draft. Actual iOS/PWA and screen-reader acceptance remain open.

Local verification: 144/144 Node tests passed, including DATA-001, recovery,
Session and packaging. Full App/PWA and Development-SYNC browser regressions
passed; Google traffic in the latter was mocked. The final focused artifact run
passed both online/offline information checks and the missing-cache negative
control. HTML dependency faults (an excluded tool script and a missing page link)
are rejected by packaging. Syntax and diff checks passed. Initial sandboxed
browser runs could not reach CDP; isolated local runs outside the sandbox passed.
A pre-existing reload wait could observe the old Paused document; the test now
requires a new document time origin and initialized Session mode before asserting
recovery. No timer/runtime fix was needed. Screenshots are generated only in OS
temporary directories. This evidence is not owner content/legal acceptance or
production authorization.

Additional return-navigation coverage uses the existing virtual-clock helper over
real document navigations: Quick RUNNING/PAUSED/OVERTIME, automatic Session phase
catch-up with the same Run ID, paused Session, Editor origin, information-page
reload, direct entry, consumed navigation context and durable unresolved recovery.
Information-page time advancement leaves runtime storage unchanged; restoration
uses the existing deadline-based engines. No expiry-signal playback is implemented
in the current app, and no signal mechanism or replay is added here.

Shared-header acceptance additionally covers desktop, 320px portrait and short
667x375 landscape, common language/theme buttons, Escape/focus, same-mode identity,
accepted/cancelled mode replacement, Editor handoff, one-time URL consumption,
reload non-replay and permanent intent discard during unresolved recovery. The
existing app menu/recovery and development account regressions run against the
shared component. Real Google and owner browser storage are not used by tests.
