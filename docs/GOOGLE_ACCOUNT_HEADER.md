# Google Account Header — Local Development Increment

Implemented on `feature/google-account-header`, based on UX-014 checkpoint
`0f48f063dd9fb62547ee8a849fb9167d9fba8d92`. Locally functionally and visually
accepted by the product owner in Firefox, including PWA v51.
Production remains NO-GO. This is a Google Drive connection interface, not a new
easyTimer authentication system.

## Interface and activation

Only the existing localhost `--enable-drive` entry mounts the account control.
Normal application entry has no avatar, Google script or account requests.
The circular 44px control sits beside the hamburger. A compact localized dialog
shows connection state and available identity, with Connect or Disconnect.
There are no sync badges: authorization is explicitly separate from synchronized
Rundowns, pending changes and conflicts in Data & Backup.

Explicitly opening the disconnected account popover prepares GIS in advance,
without authorizing, migrating, synchronizing or writing storage. This makes a
Google library request after that explicit user action, not on application startup.
Connect explicitly reuses the existing GIS action. Before local storage
activation it opens the existing Editor/Data & Backup setup rather than bypassing
the approved activation confirmation. Dirty Editor/import states block account
changes. Existing connection and panel controls share the same authorization
epoch and cancellation behavior. While the library loads, Connect shows a disabled
preparation state; afterward one explicit click calls the token request directly
within the user gesture. Loading failure offers an explicit retry; no delayed
token request, automatic popup or speculative empty window is used. The existing
Data & Backup control can still require its original second click when used cold.

Successful connection/disconnection closes the account popover and restores focus
to the avatar after updating its state. Pending, cancelled, denied or incomplete
authorization does not close it automatically; localized feedback remains visible.
Escape and outside-click dismissal retain their existing behavior.

Escape restores focus, outside clicks/Tab departure dismiss, and opening the
account interface closes the hamburger panel. Native fullscreen and expanded
fullscreen hide every account entry point and close the dialog. Smartphone
landscape hides the avatar but offers Google Drive in the hamburger menu, opening
the same dialog and handlers. Orientation changes dismiss the previous placement.
DE/EN, Light/Dark/System
and 320px layouts reuse existing theme tokens and focus styles.

## Identity and privacy

The existing `about.get` request now asks for
`user(permissionId,displayName,emailAddress,photoLink)` under the unchanged sole
`drive.appdata` scope. `permissionId` remains mandatory and account binding is
unchanged. Only successful binding makes the header connection visible. Optional
field rejection (HTTP 400/403) retries mandatory identity alone; network/401 or
missing mandatory identity cannot manufacture an authorized state.

Profile fields remain in the existing client's memory closure only. They are
cleared on disconnect, expiry, failed authorization or account change and never
enter storage, Rundown exports, snapshots or diagnostics. No extra scopes, backend,
ID tokens or image proxy are added. Image URLs must be credential-free HTTPS
Google image hosts, without token-like parameters. Images use anonymous CORS and
no-referrer loading. Missing, blocked or failed images retain the neutral SVG.
Account data is inserted as text, never interpreted as markup. Expiry updates the
header locally without reauthorization or synchronization.

Disconnect ends local authorization and clears transient identity. It retains
local data, durable account binding and outbox tickets, and does not claim to
revoke the Google grant or delete remote files. Image presentation is not proof
of synchronization health.

Google documents `drive.appdata` for [about.get](https://developers.google.com/workspace/drive/api/reference/rest/v3/about/get)
and optional identity/image fields in [User](https://developers.google.com/workspace/drive/api/reference/rest/v3/User).
All automated Google traffic uses synthetic responses; the agent operated no real
authorization. The owner subsequently confirmed a real Google profile photo and
account identity in Firefox, as well as the neutral signed-out avatar. No actual
account identifiers, names, emails or photo URLs are recorded in this document.

## Verification and owner review

```sh
node --test tests/*.test.mjs tools/app-sync/*.test.mjs tools/sync-poc/poc.test.mjs
node tests/browser-check.mjs
node tools/app-sync/browser-check.mjs
git diff --check
```

Focused coverage includes exact scope/one account request, missing fields, optional
field rejection, failed identity, expiry/disconnect/account switching, invalid
image URLs, actual blocked-image fallback, absence of persistent profile fields,
no OAuth/Drive requests on opening, focus/Escape/hamburger interaction, DE/EN/all themes/320px,
fullscreen exclusion, phone-landscape menu access and normal-entry exclusion. Existing storage,
conflict resolution, timer, recovery, DATA-001 and offline PWA suites remain in use.
Screenshots live only in temporary test output, not production assets.

PWA shell/CSS/app references use v51; unchanged planner remains v49 and recovery v48.
Development account modules remain outside the PWA cache and production source.
Existing mixed backlog additions are preserved and excluded from this checkpoint;
the newly recorded small-landscape overlap observation is also backlog-only.

Owner check: open the enabled local application, inspect the neutral account icon,
open it without authorizing (GIS may prepare), then explicitly set up/connect through the existing
test project. Inspect any returned name/email/photo, verify the fallback if absent,
then Disconnect and confirm identity clears while saved Rundowns remain. Test
keyboard, 320px and all themes, fullscreen/landscape, and verify Data & Backup keeps
its separate sync/conflict state. Do not assume a successful connection uploaded
anything. Local Firefox owner acceptance is complete; real-device iOS Safari/PWA
and assistive-technology acceptance remain open. Public OAuth, packaging,
onboarding and production release are separate gates.

Actual local validation: 133/133 Node tests passed using the command above.
The full normal App/PWA browser suite passed, including normal-entry account
exclusion, offline use and existing recovery/navigation/DATA-001. The full
Development-SYNC browser suite passed: 14 integration, 28 conflict and 4 diagnostic
scenarios, existing application checks and the focused account-header checks.
Screenshot review of Light/Dark 320px output found no header overlap or horizontal
overflow. Syntax, cache references, production gating, unchanged backlog hash and
`git diff --check` passed. The local server was restarted with the same
`--enable-drive` options so the new module is available; owner tabs were not
reloaded or operated. Actual test-account details were not inspected by the agent.

## Owner UX follow-up

The owner accepted the appearance, actual photo/account identity and neutral
avatar in principle, and requested closing after successful actions and removing
the normal initial two-click connection. These focused corrections are implemented
above and locally accepted by the owner in Firefox. Google documents separate library/
client initialization and user-gesture token requests in its
[Token Model guide](https://developers.google.com/identity/oauth2/web/guides/use-token-model).
The explicit avatar click now allows passive preparation, superseding the earlier
no-library-request-on-open behavior; application startup remains Google-request-free.

Focused browser coverage verifies successful close/focus, pending authorization,
cancelled popup, denied consent, incomplete token response, meaningful DE/EN errors,
one explicit token request after preparation, and unchanged local Rundowns.
The 134 Node tests, full App/PWA browser suite and Development-SYNC browser suite passed again. PWA stays v49:
this follow-up changes only uncached development UI modules, tests and this record.
The owner subsequently confirmed real Firefox popup/user-gesture behavior.

## Mobile landscape menu access

The development-only account control remains beside the hamburger on desktop
and smartphone portrait. In smartphone landscape, Google Drive appears only in
the hamburger menu. It opens the existing account dialog after closing the menu;
no account state or connection handler is duplicated. The fixed dialog has a
safe-area-aware viewport height limit and internal scrolling at 667 x 375.
Escape and successful connection/disconnection restore focus to the hamburger.
Authorization errors keep the dialog open. Changing placement closes the old
dialog; native/expanded fullscreen and Clock-only View expose no account UI.

Validation: 134/134 Node tests and the full normal App/PWA and Development-SYNC
browser suites passed. Focused coverage includes portrait/landscape placement,
native Enter activation, Escape/focus, cancelled/denied authorization, successful
actions, fullscreen exclusion and DE/EN with Light/Dark/System at 667 x 375.
Landscape screenshots are temporary test output, outside tracked assets.
The normal production entry contains neither avatar nor menu entry. No real
Google requests were made by automated tests. PWA is v50 because cached app/CSS
changed; synchronization, storage and timer semantics are unchanged.

Owner retest: open localhost with `--enable-drive`, rotate to landscape, open
the hamburger and choose Google Drive. Check connection/disconnection, errors,
scrolling and Escape; rotate back and check the avatar. Real Firefox, iOS/PWA
testing is owner-operated; local Firefox acceptance is now complete, while
real-device iOS/PWA and screen-reader acceptance remain open. Production remains NO-GO.

## Landscape avatar consistency

The Landscape Google Drive entry now includes the same 28px circular avatar
element as the Desktop/Portrait header. The existing SVG and image nodes move
between the two entry points; profile state, photo failure handling and connection
handlers are shared, with no additional API request or persisted profile data.
Disconnected, missing-photo and failed-photo states use the neutral silhouette.
The Google Drive label remains visible, without badges or extra status lines.

Focused mocked browser checks cover the authorized photo, missing/failed photo,
disconnect fallback, one shared avatar, 44px entry, keyboard activation, reachable
bottom explanation text, disconnect focus and fullscreen exclusion at 667 x 375.
Menu screenshots remain temporary test output. PWA references advance to v51 for
the shared CSS change. The owner confirmed real Firefox authorization and the
actual Landscape profile photo; iOS/PWA/screen-reader checks remain open.
Production remains NO-GO.

## Local owner acceptance and checkpoint review

The owner accepted the neutral desktop avatar, actual Google profile photo/name/
email, one-click Connect, successful connection/disconnection dismissal,
cancellation/error feedback and Escape. Local Rundowns remained available after
disconnect. Fullscreen account hiding and Landscape hamburger access with the
actual profile photo and a scrollable functional panel were confirmed. The owner
accepts the small-screen layout as functionally sufficient for this increment.

At 667 x 375, the hamburger menu can overlap recovery selection and partially
obscure the timer. This non-blocking visual observation is recorded under future
UX-015 in the backlog, outside this feature checkpoint; no layout fix is included.

These are owner-operated Firefox observations, not independent agent verification
of live Google state or proof that authorization completed synchronization.
Real-device iOS/PWA, screen-reader testing, production OAuth/account verification,
privacy requirements, safe onboarding/migration and FTP packaging exclusions for
development tools remain release gates. The existing FTP workflow has no explicit
development-tool exclusion; normal-entry gating alone is not production packaging.
No production readiness is claimed. Production remains NO-GO.
