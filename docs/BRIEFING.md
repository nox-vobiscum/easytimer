# easyTimer — Developer Briefing

This is the authoritative onboarding and handover reference for work on
easyTimer. Read it before inspecting or changing the project. The detailed
product decisions remain in
[`EASYTIMER_UX_KONZEPT_v2.md`](EASYTIMER_UX_KONZEPT_v2.md); future work and
unresolved decisions remain in [`backlog.md`](backlog.md).

## Collaboration contract and definition of done

The Product Owner decides product behavior, priorities, scope, acceptance and
release approval. The developer—human or automated—must inspect the actual
current repository and deployment state before proposing or implementing a
change. Previous conversation context is neither required nor authoritative.

Work is incremental:

1. Inspect the working tree, current source and relevant documentation.
2. Identify requirements, constraints and unresolved product decisions.
3. Obtain explicit owner approval for the intended scope.
4. Implement the smallest coherent change without unrelated refactoring.
5. Add focused tests and preserve existing regressions and user data.
6. Report actual changes, verification evidence and remaining risks.
7. Obtain owner acceptance where required.
8. Prepare a reviewed, documentation-complete commit.
9. Commit only with explicit authorization.
10. Deploy to staging only with explicit authorization and verify the real run.
11. Publish to production only with separate explicit authorization and verify
    the live application.

Inspection, implementation, commit, staging deployment and production release
are distinct stages. Permission for one never implies permission for the next.
Never silently overwrite, stage, reset, stash or discard existing uncommitted
work. Unexpected state, contradictions and missing decisions must be reported,
not resolved by guessing. The owner may request either a small individual step
or complete copy-ready files and instructions.

### Mandatory documentation definition of done

Documentation is part of implementation. **Every future development commit must
include all relevant backlog, changelog and supporting documentation updates in
the same reviewed commit.** Documentation must not routinely be deferred to a
later cleanup task.

The implementing developer, human or AI, is authorized and required to maintain
existing `docs/backlog.md` entries within the approved feature or bug-fix scope
without requesting separate documentation permission. Update actual status and
commit/release references, remove completed work from active future-work lists
or retain only a concise traceability reference, and preserve every genuinely
open requirement. This maintenance authority does not permit new product
requirements, unrelated reprioritization, silent removal of unresolved work or
implementation-scope expansion. It also does not authorize a commit, push or
deployment. Preserve unrelated concurrent and uncommitted owner edits.

Before every development commit:

- Review affected entries in `docs/backlog.md`. Record implemented, accepted,
  staged and released states accurately; preserve unresolved requirements.
- Update `CHANGELOG.md`. Committed but unreleased user-visible work belongs under
  `Unreleased`; production releases require verified deployment evidence.
- Update this briefing when architecture, product principles, testing, Git,
  deployment or operating rules change.
- Update the root `README.md` when public capabilities or basic setup change.
- Update affected specifications, help, decision and test documentation.
- Check for conflicting status claims, broken links, obsolete implementation
  descriptions and incorrect asset or release versions.

A development commit is incomplete until implementation and tests are verified,
the backlog is current, the changelog is updated, relevant documentation is in
the same reviewed commit, and unrelated owner work is excluded. If required
documentation shares a file with unrelated uncommitted work, stop and request an
explicit integration decision.

A local commit, staging deployment and production release are separate events.
Use `Unreleased` until production is verified. A later release-status update may
be a separately authorized documentation commit; it does not require an
application/PWA version bump by itself.

## Communication and language

- Communicate with the Product Owner in German.
- Coding-agent task prompts are written in English.
- Source code, technical comments and repository documentation are English.
- The application is German and English. UI changes must keep both languages
  semantically consistent.
- Reuse established product terminology, including Quick Timer, Session Timer,
  Rundown, Session Editor and Timebox.

## Current project state and reconstruction

The verified production and staging release is PWA v62 at commit
`62531d9012f9c72d5a7b905a18ffac47f8b1bd18` (2026-10-30). Production is
[easytimer.at](https://easytimer.at/); staging is
[et.rbsnet.at](https://et.rbsnet.at/). Both deployments were verified after the
UX-011 release. Treat this snapshot as orientation, then obtain live state:

```powershell
git status --short
git branch --show-current
git rev-parse HEAD
git fetch --no-tags origin
git rev-parse origin/main
git rev-parse origin/develop
git log --oneline --decorate -20
```

Then compare [`CHANGELOG.md`](../CHANGELOG.md), [`backlog.md`](backlog.md), the
current implementation, recent test evidence and GitHub Actions deployment runs.

- Source code determines implemented behavior.
- Git history determines committed changes.
- Verified deployment evidence determines released changes.
- The backlog records intentions and open decisions, not delivered facts.
- Archived reports are historical evidence, not necessarily current guidance.

Conflicts between these sources require investigation. Every increment's final
report must identify its approved scope, decisions, changed files, test results,
commit and branch, remote/deployment status, uncommitted work, risks and next
recommended action.

## Product and UX principles

- KISS: less navigation, more timer.
- The large clock is the primary visual focus.
- Controls are minimal, contextual and consistent across Quick and Session use.
- Responsive layouts support desktop, mobile, tablet, fullscreen and reduced
  presentation views without sacrificing readable touch targets.
- German/English and Light/Dark/System conventions remain consistent.
- Keyboard operation, visible focus and semantic controls are required.
- Local-first operation and offline PWA behavior are the default.
- No backend or user account is mandatory; hosting remains free-first.
- One authoritative timer state uses wall-clock deadlines for accurate elapsed
  time.
- Durable recovery and ownership prevent silent cross-tab takeover.
- UX changes must preserve timer, Session and recovery semantics.
- Avoid unnecessary frameworks, dependencies and infrastructure.

The detailed ET-001 decisions and product rationale remain canonical in
[`EASYTIMER_UX_KONZEPT_v2.md`](EASYTIMER_UX_KONZEPT_v2.md); do not duplicate or
silently reinterpret them here.

## Architecture and data model

easyTimer is a static HTML/CSS/JavaScript PWA. There is no production build
framework or application backend.

- `src/index.html` and `src/js/app.js` coordinate application views, localized
  presentation and protected navigation.
- `src/js/timer.mjs` owns Quick Timer transitions and authoritative deadlines.
- `src/js/session.mjs` creates immutable Session Runs from saved Rundowns and
  handles manual/automatic phase progression and overtime.
- `src/js/planner.js` and `src/js/templates.mjs` implement the Session Editor and
  validated browser-local Rundown library.
- `src/js/recovery.mjs` validates durable runtime records and coordinates
  tab/context ownership. `sessionStorage` associates a tab with its context;
  durable records remain in `localStorage`.
- `src/js/portability.mjs` implements DATA-001 JSON import/export with strict
  validation and fresh IDs for imported copies.
- `src/js/header.mjs` and shared CSS provide the application and information-page
  header, language, theme and navigation behavior.
- `src/service-worker.js` precaches the explicit application shell for offline
  cold starts. Asset query versions and the shell version must remain aligned.

Quick Timer, Session Timer, Session Editor, local persistence, recovery,
DATA-001, information pages and offline PWA behavior are production features.
The Google Drive work under `tools/app-sync/` and `tools/sync-*` is isolated,
development-only experimental evidence. Production packaging must not expose or
initialize it. Future live sharing, optional cloud synchronization and other
backlog items are not shipped features.

## Development workflow

Use local feature branches for bounded increments. Inspect `git status` before
any operation and preserve unrelated work. Do not add dependencies, change data
formats, widen OAuth scope or alter infrastructure unless the owner explicitly
approves that scope.

The usual lifecycle is analysis → approved implementation → verification → owner
acceptance → reviewed local commit → approved staging push → staging acceptance →
separately approved production release. Each arrow is a decision gate, never an
automatic permission.

## Testing and quality gates

Use the smallest relevant checks first, then proportionate regressions. Current
commands include:

```powershell
# Node unit/integration tests
node --test tests/*.test.mjs tools/app-sync/*.test.mjs tools/sync-poc/*.test.mjs

# Full application/PWA browser regression
node tests/browser-check.mjs

# Production artifact, offline cold start and negative control
node tests/artifact-offline-browser.mjs

# Development-only synchronization regression
node tools/app-sync/browser-check.mjs

# Packaging safeguards and deterministic 24-file artifact
node --test tests/packaging.test.mjs
node tools/release/package.mjs

# Whitespace errors before review/commit
git diff --check
git diff --cached --check
```

Run syntax checks for directly changed JavaScript modules. Session, recovery,
ownership and navigation changes require their focused browser scenarios.
Packaging changes require inventory/checksum and real offline tests. Automated
results do not replace owner visual/functional acceptance, real-device checks or
verification of the actual deployed application.

## Git and deployment pipeline

Development uses local feature branches and explicit commit authorization.
Never force-push a release branch or include unrelated working-tree changes.

### Staging

- Branch: `develop`
- URL: [et.rbsnet.at](https://et.rbsnet.at/)
- Workflow: `.github/workflows/deploy.yaml`
- Trigger: automatic only on pushes to `develop` that change an allowlisted
  application, packaging, validation or deployment path
- GitHub Environment: `staging`
- Dedicated `STAGING_FTP_*` secrets and account root

Documentation-only changes to the root README/changelog or `docs/**` do not
deploy staging. The allowlist covers `src/**`, `tools/release/**`, `tests/**`,
`.github/workflows/**`, `.github/actions/**`, root package metadata and
`.gitattributes`. A commit containing both documentation and an allowlisted path
does deploy. When a future change introduces another source, packaging,
validation or deployment dependency, update the workflow allowlist and its
focused test in the same reviewed commit.

### Production

- Branch: `main`
- URL: [easytimer.at](https://easytimer.at/)
- Workflow: `.github/workflows/deploy-production.yaml`
- Trigger: manual `workflow_dispatch` only
- GitHub Environment: `production`
- Dedicated `PRODUCTION_FTP_*` secrets and account root
- Full SHA entered twice, trusted `main` ancestry, repository-owner actor and
  triggering-actor guards

Both pipelines package the explicit production allowlist, verify checksums and
use strict FTPS on port 21. Do not weaken TLS/certificate checks, print secrets,
mix staging/production credentials, reset FTP state or enable destructive
clean-slate behavior. Preserve rollback backups before risky releases. A
successful push is not a successful deployment: inspect the Actions run and
smoke-test the real URL in an isolated profile.

Operational detail belongs in
[`RC-001_PRODUCTION_PACKAGING.md`](RC-001_PRODUCTION_PACKAGING.md) and
[`RC-002_PRODUCTION_DEPLOYMENT.md`](RC-002_PRODUCTION_DEPLOYMENT.md).

## Documentation maintenance and navigation

Keep the documentation root small and current:

- [`backlog.md`](backlog.md) — future work and unresolved decisions.
- [`EASYTIMER_UX_KONZEPT_v2.md`](EASYTIMER_UX_KONZEPT_v2.md) — detailed binding
  UX/product decisions.
- [`DATA-001_RUNDOWN_PORTABILITY.md`](DATA-001_RUNDOWN_PORTABILITY.md) — current
  JSON portability contract.
- [`DEV-001_TIME_TRAVEL.md`](DEV-001_TIME_TRAVEL.md) — virtual-time test command
  reference.
- [`REL-001A_QUICK_RECOVERY.md`](REL-001A_QUICK_RECOVERY.md) and
  [`REL-001B_SESSION_RECOVERY.md`](REL-001B_SESSION_RECOVERY.md) — recovery
  architecture and limitations.
- [`RC-001_PRODUCTION_PACKAGING.md`](RC-001_PRODUCTION_PACKAGING.md),
  [`RC-002_PRODUCTION_DEPLOYMENT.md`](RC-002_PRODUCTION_DEPLOYMENT.md) and
  [`RC-003_PUBLIC_INFORMATION_PAGES.md`](RC-003_PUBLIC_INFORMATION_PAGES.md) —
  active release and operating references.
- [`../CHANGELOG.md`](../CHANGELOG.md) — verified releases and meaningful changes.

Historical PoCs, investigations, incident analysis and implementation reports
are retained in `archive/investigations/` and `archive/implementation/`. Preserve
their original claims as historical evidence. When moving a document, update
links both to and from it. Do not create another README or a separate index;
this section is the documentation entry point.
