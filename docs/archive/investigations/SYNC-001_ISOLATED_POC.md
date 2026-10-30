# SYNC-001: isolated Google Drive experiment

**Follow-up:** The owner subsequently confirmed Firefox authorization and disposable create/list/read, and reported acceptance of an invalid If-Match. The tested conditional-update strategy has FAILED and its controls are retired. The preparation results below are historical; use the [immutable snapshot experiment](SYNC-001_IMMUTABLE_SNAPSHOT_POC.md) for the current candidate, manual steps and unresolved real-API gates.

**Last updated:** 2026-10-25 (Europe/Vienna).
**Status:** Local test harness prepared and locally verified. Real Google authorization, Drive operations and concurrent writes are **UNRESOLVED**, not passed. Native iPhone tests are **NOT TESTED**.
**Authorization:** Isolated PoC only; no production synchronization, publishing, commits, pushes, Cloud resource creation or hosting changes.

## Baseline and isolation

- Existing branch: `docs/close-data-001`, HEAD `945c236c846b219b86908beae50cbc893e35048d`.
- Local `main` and last-fetched `origin/main`: `409229ae428d9cdea41306a91a2a47984a857ec2`.
- DATA-001 is owner-accepted and production-verified at `9dcf75d`, tag `release/data-001-v35`; subsequent footer-only production hotfix `409229a`. Production shell/CSS v36; JS v35.
- Preserve the pending UX-011 backlog edit. This PoC does not change it.
- All new executable code lives in `tools/sync-poc/`; there are no imports from production modules or changes to `src/`, template storage, timers, service worker or deployment workflow.
- The standalone server binds to loopback and serves an exact allowlist of PoC assets. It does not proxy production or Google, serve repository files, accept writes or log requests.
- The browser entry point rejects non-loopback origins. It is not enabled on either production domain. An exact approved HTTPS staging origin must be added only in a separately approved real-device preparation step.
- Do not publish this directory with the current broad FTP workflow. No workflow changes are proposed here; review packaging separately before any future release.
- The synthetic envelope contains a purpose marker, random Run ID, revision ancestry and a canonical-shaped fixed synthetic library. It cannot import user JSON. Every read/write checks the expected name, Run ID, app properties, data space and synthetic contents.
- Google script loading requires the explicit test-project checkbox and a public client ID. Authorization requires a second user gesture. No Google traffic occurs at ordinary page startup.

## Commands

From the repository root, using Node.js 22+:

```powershell
node tools/sync-poc/server.mjs
```

Open **http://localhost:8000/** in a fresh test browser profile. Use the hostname `localhost`, not `127.0.0.1`, for real OAuth. The server stays in the foreground; Ctrl+C stops it. Existing easyTimer localhost servers can continue on other ports. If port 8000 is already occupied, do not silently switch ports or stop another server: the owner must approve replacing that local server. The Google origin remains unchanged.

Local automated checks, without a Google project or real credentials:

```powershell
node --test tools/sync-poc/poc.test.mjs
$env:EASYTIMER_BROWSER = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
node tools/sync-poc/browser-check.mjs
```

The browser check blocks actual HTTPS requests and substitutes only a simulated GIS load. It tests startup isolation and UI callbacks, NOT real authorization or CORS. Screenshots and browser profiles are temporary OS artifacts outside the repository. No mandatory external packages are added.

## Owner-confirmed Cloud configuration (2026-10-25)

The owner completed the setup separately. Do not create resources or change this configuration:

- Test project: `easytimer-sync-poc`; Drive API enabled.
- OAuth client: Web application, `easyTimer Sync PoC - Local`.
- Public client ID: `896158829302-h2rlgdbilmek2b1lmkr65kealt2t5rr8.apps.googleusercontent.com`; prefilled in the isolated page.
- Authorized JavaScript origin: **http://localhost:8000** only. The numeric loopback address is not registered for OAuth, even though the local smoke-test server accepts it.
- No redirect URIs. The existing GIS token popup flow requires no custom code exchange.
- Audience: External, publishing status Testing, two existing test Google accounts.
- Scope: `https://www.googleapis.com/auth/drive.appdata` only.
- No production origin is authorized. No client secret is requested, stored or used.

These settings are owner-confirmed, not independently inspected in Cloud Console. The remaining owner interaction is authorization in the browser and execution of the disposable-data protocol below. Real authentication, CORS and Drive responses remain UNRESOLVED until that interaction. Use the same Google account in two independent profiles for stale-write testing; use the second account separately for account-isolation checks.

### Short owner test sequence

1. Confirm the page title is **SYNC-001 - disposable experiment**, not the ordinary easyTimer UI. The public test client ID is already filled in. Use a fresh browser profile without a previous easyTimer service worker on localhost.
2. Check the test-project acknowledgement, click **Load Google GIS**, then **Authorize / reauthorize**. Select one of the configured test accounts and approve only the app-data permission. Do not paste a secret or token anywhere.
3. Click **Create synthetic file**, **List this run's files**, then **Read and retain baseline**. Retain only the displayed Run ID, File ID, revision/version, HTTP status and readable-validator results.
4. For the real stale-write experiment, open the same origin in an independent browser profile. Authorize with the **same Google account**, copy Run ID/File ID and read the same baseline before either profile writes. Follow Part C; the second configured Google account is for the separate account-isolation experiment.
5. If no strong validator is available, conditional writes remain UNRESOLVED. The explicitly labelled **Unconditional synthetic PATCH** tests disposable CRUD only; it must never count as proof of safe synchronization. Do not reread B's baseline until after its stale-write attempt.
6. Report sanitized outcomes and browser/version. Denial, popup closure, actual expiry, disconnect and network interruption are separate cases. No HAR, tokens, OAuth callback data or authorization headers should be shared.

For iPhone testing, an exact HTTPS test origin and related preparation require separate approval. The current localhost-only registration is not accessible on an actual iPhone. Do not modify DNS, hosting, the test project or the production OAuth configuration as part of this local step.

## Part A: authentication protocol

1. In a fresh profile open the local page; verify no Google requests before clicking **Load Google GIS**. Confirm the test-project checkbox, enter the public client ID, load GIS, then click **Authorize / reauthorize**.
2. Confirm exactly `drive.appdata` was granted. The harness uses `include_granted_scopes: false` and rejects extra scopes; use a clean test client/account grant if historical permissions exist.
3. Deny consent, close the popup, and block popup opening as separate runs. Record only the displayed sanitized outcome. The app must remain disconnected and read/write controls disabled.
4. On success, request `about.get?fields=user(permissionId)` with the same scope. Its returned ID is retained only in memory; the UI displays a short SHA-256 fingerprint for comparing test accounts, not an email address. This is an isolation aid, not a production identity/security assertion.
5. Request direct Drive REST access using `fetch`, bearer header, `credentials: omit`, `cache: no-store`, and no redirect following. Record real HTTP status and CORS readability, not request headers or token values.
6. For **actual expiration**, keep the page until the returned expiry time has passed, then attempt List. Expected: reauthorization required, no silent refresh. Click Authorize again and verify the account. Local unit tests with an injected clock are separate and do not prove Google's actual expiry behavior. A real server-side 401 is recorded if encountered; it must also clear authorization.
7. Disconnect locally: abort outstanding requests, forget token/account/baseline, ignore delayed OAuth callbacks and disable data operations. This does **not** log out the browser's Google account, revoke its grant or delete remote data. If revocation is desired, do it explicitly in the test account's Google permissions UI; reconnect and inspect consent again.
8. Reauthorize with account B. The old baseline must be gone. List the same Run ID: account A's data must not be exposed or reused. Switch back to A and explicitly read again. A matching short fingerprint alone is not proof of account identity; actual isolated file access is part of the test.
9. Reload or leave the page: authorization is forgotten. No token, account binding, baseline, evidence or run state is persisted by the harness.

The GIS library's own behavior and Google/browser cookies are external to this harness; the harness never writes OAuth credentials to browser storage or application logs. Do not save HARs, raw OAuth responses, console dumps, network request headers or browser profiles containing real credentials. Evidence consists only of selected status, CORS/validator observations and disposable revision IDs.

### Security tradeoff

This PoC uses Google's documented GIS Token Model exactly as requested; no custom OAuth workaround or token endpoint exchange is implemented. Access tokens are in a module closure, short-lived and never persisted. XSS or malicious extensions can still compromise a browser holding a token: memory-only is not immunity. Production code/PKCE security decisions remain unresolved.

Google's current token guide describes browser token issuance, but its protocol guide warns against Implicit Flow for SPAs and recommends Code/PKCE. The linked GIS code guide still describes backend code exchange and refresh-token storage. This inconsistency is an explicit production architecture gate, not evidence that a secret-free custom browser code exchange is supported. Even a working Token Model experiment does not by itself approve production authentication.

## Part B: disposable Drive operations

1. Client A authorizes; leave its generated Run ID unchanged. Click **Create synthetic file** once. Name: `easytimer-SYNC-001-POC-<Run ID>.json`, parent `appDataFolder`, private app properties identifying this exact experiment.
2. Click List. Only this experiment's marked files are queried, including pagination. Duplicate file names/IDs must be inspected; no arbitrary first-file selection or deduplication occurs.
3. Read the File ID. Metadata before/after must have the same Drive version. The retained baseline includes synthetic content, revision ID and separately observed metadata/media ETags if CORS exposes them. A hidden/missing ETag is reported as unavailable, never replaced with `*` or the numeric version.
4. Test the deliberately invalid validator first if desired. See Part C. Then, for basic CRUD only, **Unconditional synthetic PATCH** can update the disposable fixture. It is explicitly unsafe as a synchronization algorithm. Read again, then verify on a separately authorized client/device.
5. For an interrupted Create/PATCH, use **Abort current request**, browser network throttling or an actual network interruption during transmission. A fast request might finish before Abort and does not count as an interrupted-request test. Repeat under sufficient latency if necessary.
6. An abort or network failure after a write means **unknown remote outcome**, not rollback. Do not automatically retry. List by the same Run ID, read each matching file and inspect revision ancestry. A Create may have succeeded despite a missing reply; an update may already be visible. Recover by explicit inspection; do not silently collapse duplicates.
7. There is no delete button or cleanup request in this harness. `appDataFolder` does not support moving files to Trash. Test-project/account cleanup needs separate explicit owner action; do not remove unrelated app data. Disconnect preserves the fixtures for investigation.

## Part C: mandatory stale-write experiment

Use two independently authorized profiles or devices with the **same test Google account**, test application and Run ID. Different accounts test isolation, not concurrent access to the same file.

| Step | Client A | Client B | Required evidence |
| --- | --- | --- | --- |
| 1 | Create once; copy Run ID/File ID | Paste IDs and independently authorize | Both target the exact same disposable file |
| 2 | Read and retain baseline | Read and retain the same baseline | Same version/revision; record which ETag source is readable |
| 3 | PATCH using retained If-Match | Do not reread | A succeeds and its revision is observable |
| 4 | Do not write | PATCH using B's obsolete retained If-Match | Real server rejection, normally HTTP 412, not only a client-side comparison |
| 5 | Read | Read only after B's attempt | A's revision remains; B did not replace it |
| 6 | Reverse roles and repeat | Repeat | Both clients and metadata/media validators checked separately |

The harness deliberately retains B's baseline even if a preflight metadata read reveals a new version. It must submit the obsolete condition to Google to test the server, rather than claim success because a local check prevented sending it.

Also submit **PATCH with deliberately invalid If-Match** against disposable data. A 2xx acceptance is a FAIL for that tested validator/path; verify the resulting content. A 412 for an arbitrary invalid value alone is insufficient: a valid A update and rejection of a real stale B update are both required. HTTP 400, a CORS/network error, no readable validator, or client-side validation leave the server concurrency claim **UNRESOLVED**. Distinguish conditional metadata ETag and conditional media ETag; do not mix their results. Test CORS from the actual approved browser origins. No fallback to unconditional write is automatic.

Drive `version` and `modifiedTime` are observations, not assumed compare-and-swap conditions. Old Drive v2 or unrelated Google API examples do not establish v3 media-update behavior. Preserve genuine results before changing the recommendation.

### Append-only alternative if conditional writes fail

Recommend immutable full-library snapshots with explicit revision ancestry for further evaluation if server-side conditional writes cannot be proven:

- Create a new file for each immutable revision; never PATCH or overwrite an existing snapshot or a shared mutable head/index.
- Store a unique revision ID, library ID, parent revision ID(s), canonical definition payload and integrity hash. Never store timer state, credentials or Google profile data.
- List all marked snapshot files with pagination. Derive heads from ancestry, not wall-clock timestamps or highest numeric versions. Concurrent sibling heads are a visible conflict; keep both.
- Missing ancestors, duplicate revision IDs with different contents, corrupt data or incomplete listings block a synchronized claim. Retry only after an explicit reconciliation.
- Retrying an ambiguous Create reuses the same logical revision ID/content, detects duplicates and never chooses one arbitrarily. The current CRUD fixture generator does not implement this proposed publication protocol.
- A future explicit conflict resolution creates a new snapshot naming all resolved parent heads. `revisionHeads()` demonstrates single-parent branching/deduplication/missing-history checks only; multi-parent resolution and remote immutable snapshot publication are NOT implemented.
- Encode deletions as retained history/tombstones, not physical file removal; deletion versus concurrent edit remains a conflict. No automatic garbage collection. Old offline clients and missing history require a separate retention design.
- Costs: additional files, downloads, storage growth and more reconciliation work. This avoids overwrite races but does not promise atomic global agreement, bounded history or permanently zero costs. Google's real create/list/read behavior must still be tested.

Until Part C passes, a mutable single library file is not recommended for production. The append-only alternative is an evaluated next candidate, not a completed sync implementation.

## Part D: real iPhone acceptance plan

The prepared loopback harness cannot be opened on an iPhone using the desktop's localhost. Do not mislabel Chromium's 320px viewport as iOS validation.

After separate approval for an exact HTTPS staging origin, serve only the PoC assets and register that origin on the test OAuth client. Review host/header configuration and update the exact origin allowlist; this preparation step does not authorize those changes. The included standalone manifest enables an installed-view candidate; no service worker or offline app-shell recovery is implemented. This is not the production PWA.

Perform all of the following separately in **iOS Safari** and **Add to Home Screen / standalone**, recording iPhone model, iOS version, origin and application display mode:

1. Cold launch without unsolicited Google requests/prompts. Authorize via direct tap; select each of two test accounts.
2. Accept, deny, close and block popup. Confirm the callback reaches the original tab or standalone window. Returning in Safari while the installed page remains disconnected is a failure of that flow, not success.
3. Background/switch apps while authorization is pending; return and reject stale callbacks after Disconnect. Test the account chooser when Google is already signed in and when signed out.
4. Read/write/list the disposable file across desktop and iPhone. Run the stale-write protocol from the real HTTPS origin, including preflight/header visibility.
5. Wait for actual expiry; retry explicitly. Separately revoke test access to inspect the invalid-grant/reconsent path. Do not record secrets while observing errors.
6. With the page already open, enable airplane mode: operations fail safely, retain uncertainty, do not retry automatically. Reconnect, explicitly reauthorize if needed and inspect remote outcome before another write.
7. Offline cold launch is not supported by this harness's uncached shell; record that limitation rather than claiming production PWA offline behavior. Installed-view lifecycle behavior requires real-device observation.
8. Check safe areas, orientation, keyboard focus, scroll reachability and VoiceOver labels/status announcements. The English-only developer page is not a localized production interface.

No undocumented redirect flow, cross-window token transfer or custom OAuth fallback is authorized if iOS return behavior fails. Report the failure and stop for architecture review.

## Actual results and release decision

| Gate | Result | Evidence / blocker |
| --- | --- | --- |
| Authentication against Google | UNRESOLVED | Test client supplied by owner; interactive consent and real responses still pending. Mocked callbacks/injected-clock tests passed |
| Drive appDataFolder create/list/read/update | UNRESOLVED | No real authenticated API requests performed |
| Safe concurrent writes | UNRESOLVED | No real stale-write/CORS experiment; simulated 412/ignored-validator cases only |
| iOS Safari | NOT TESTED | Physical device and approved HTTPS origin required |
| iOS installed PWA | NOT TESTED | Physical device and approved HTTPS origin required |
| Local harness tests | PASS | 10/10 deterministic tests; local browser smoke test passed |
| Existing unit regression | PASS | Existing 73/73 tests passed together with 10 PoC tests: 83/83 |

No full production browser regression was repeated: production files are unchanged. The dedicated PoC browser test covers default-off Google loading, consent gating, scope selection, mocked denial/popup closure, late OAuth callback after Disconnect, empty browser storage and desktop/320px layout. It does not prove Google's OAuth, real CORS, token lifetime or iOS compatibility.

**Go:** Owner-guided disposable tests using the isolated harness using the owner-supplied test client; browser authorization remains interactive.
**No-Go:** Production authentication/synchronization, mutable library overwrites, deployment or claims of cross-device safety before the real gates above are resolved.

## Privacy, publication, maintenance and costs

Only synthetic data may leave the local harness. Access tokens are not persisted; account permission IDs remain in memory. Output intentionally omits raw API bodies, authorization headers and OAuth responses. The selected file ID/ETags/revision IDs are test metadata, not credentials. Do not copy the page's ephemeral evidence into shared docs without checking it.

Google's third-party library and its OAuth flow introduce external processing and maintenance obligations even if there is no app backend. Public release requires a separate review of OAuth branding/domain verification, public information/privacy pages, policy changes and Workspace administrative restrictions. INFO-001 pages and actual synchronization UX remain separate increments. No Cloud account setting or policy acceptance has been changed.

Google currently documents no additional cost for standard Drive API use, with planned charging above standard thresholds. Actual Cloud project quotas, billing status and future policy changes must be checked before any release. Browser tokens require renewed user interaction; a successful PoC must not be marketed as unattended continuous background sync. No backend, paid dependency or recurring-service subscription is introduced, but permanent zero cost and zero maintenance are not guaranteed.

## Official references checked on 2026-10-24

- [GIS Token Model](https://developers.google.com/identity/oauth2/web/guides/use-token-model): token-only browser flow, user action, REST/CORS and renewal.
- [OAuth client-side protocol guidance](https://developers.google.com/identity/protocols/oauth2/javascript-implicit-flow): current Implicit Flow warning and PKCE recommendation.
- [GIS Code Model](https://developers.google.com/identity/oauth2/web/guides/use-code-model): backend code exchange; not a secret-in-browser solution.
- [GIS JavaScript authorization reference](https://developers.google.com/identity/oauth2/web/reference/js-reference): scope configuration, expiry, callbacks and revocation.
- [GIS error handling](https://developers.google.com/identity/oauth2/web/guides/error): permission denial and popup errors.
- [appDataFolder guide](https://developers.google.com/workspace/drive/api/guides/appdata): hidden app-only space, create/list/read and no Trash/sharing.
- [Drive about.get](https://developers.google.com/workspace/drive/api/reference/rest/v3/about/get): `drive.appdata` is an accepted scope for minimal account identification.
- [Drive v3 files.update](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/update): media upload API; not proof that a particular conditional header is enforced.
- [Drive usage limits and pricing](https://developers.google.com/workspace/drive/api/guides/limits): standard-tier and planned excess-usage charging.
- [OAuth publication requirements](https://developers.google.com/identity/verification/authentication-policy-compliance): separate test/production projects and domain/branding requirements.
