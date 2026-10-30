# RC-002 — Automatic staging and manual production deployment

> **Current context (2026-10-30):** The two-environment pipeline is operational.
> `develop` automatically deploys staging and `main` is deployed only through
> the guarded manual production workflow. PWA v62 was verified in both
> environments. The preparation-only wording below describes the original
> workflow increment, not the current GitHub state.

Local workflow preparation only. Production remains NO-GO. No deployment or
GitHub configuration has been performed by this increment.

## Separation and paths

`deploy.yaml` now deploys staging at `https://et.rbsnet.at/` automatically on
pushes to `develop`, using the `staging` Environment and dedicated `STAGING_FTP_*`
secrets. Feature-branch and `main` pushes do not trigger this staging workflow.
The existing legacy website is retained as staging; production is independent.
Feature branches feed `develop`; accepted releases move to `main`. Creating or
publishing `develop` is a separate owner-approved step, not part of this change.

**Transition warning:** Disable the old remote `FTP Deploy` workflow before any
push to `main`, including a merge. The remote version still listens to `main`
until the replacement is published. Inspect and handle existing queued/running
deployments separately; disabling a workflow does not stop an active transfer.

`deploy-production.yaml` has only `workflow_dispatch`. Pushes, merges, tags and
release events do not deploy to easytimer.at. GitHub exposes manual dispatch only
after the workflow exists on the default branch. Select `main` when dispatching;
other workflow refs are skipped. Both the original actor (`github.actor`) and
the current initiator (`github.triggering_actor`) must be the repository owner.
This applies to initial execution and re-runs; a different user cannot re-run an
owner-triggered deployment. Owner re-runs retain all branch, release SHA,
packaging and Environment safeguards.

The dedicated FTP account on `w021a277.kasserver.com` is rooted at `/easytimer/`.
Uploading `<release>/ftp/` to account-relative `/` preserves `src/`, producing
`/easytimer/src/index.html`. Confirm that `https://easytimer.at/` has that document
root before publication. Do not substitute the legacy account or an absolute
hosting path for the account-relative target.

The owner previously identified the staging account base as
`/noxvobiscum/wordpress/projects/et/`, with domain DocumentRoot
`/noxvobiscum/wordpress/projects/et/src/`. Verify that the staging credentials
actually select this isolated account root. Uploading `<release>/ftp/` to `/`
then retains `src/` and reaches that webroot. `server-dir: /` alone does not
identify a domain. Staging credentials must not permit writes to `/easytimer/`
or unrelated WordPress files. Never share accounts, overlapping roots or FTP
deployment-state files between environments.

Both environments reuse the same allowlisted package (currently v60, 24 files),
inventory verification and existing exclusions. Staging uses explicit FTPS on
port 21 with `security: strict`, a separate `easytimer-staging` concurrency group
and `cancel-in-progress: false`; an active transfer is not canceled by a new push.
No clean-slate deletion is enabled. Existing synchronization behavior is retained,
including management of previously tracked application files; no remote cleanup
or deletion is performed by this local preparation. Preserve the existing staging
deployment-state file and back up deployed files before the first replacement.
Google development tools remain excluded from this package on both domains.

## Owner-side GitHub setup

Create the `production` Environment and restrict deployment branches to `main`.
Set these dedicated Environment secrets, not legacy or repository-level copies:

- `PRODUCTION_FTP_SERVER` — the confirmed production host
- `PRODUCTION_FTP_USERNAME` — the dedicated account
- `PRODUCTION_FTP_PASSWORD` — its password

Create a separate `staging` Environment restricted to branch `develop` and set:

- `STAGING_FTP_SERVER` — the verified staging host
- `STAGING_FTP_USERNAME` — the staging-only account
- `STAGING_FTP_PASSWORD` — its password

Do not point these secrets at production or silently reuse the old repository-level
`FTP_*` values. Confirm account scope first. No secrets or Environments are created
by this local change. Verify FTPS certificate trust and hostname matching for each
host; never disable certificate validation to make a transfer succeed.

Never include credentials in source, dispatch inputs, screenshots or logs.
Required Reviewers are intentionally disabled for production by owner decision.
The owner-only dispatch/re-run guards and double SHA confirmation remain the
explicit release authorization; no independent second-person approval is claimed.
Staging should have no manual approval gate if automatic deployment is desired.

The owner has confirmed that repository visibility is PUBLIC and the default
branch is `main`; keep that default. The owner must verify both Environments,
their exact branch restrictions, reviewer settings, dedicated secrets and Actions
permissions in GitHub. Their current live configuration has not been inspected.
If Environment secrets are unavailable, stop rather than silently moving credentials
to repository secrets or removing the Environment requirement. Limit who can
publish trusted changes to `develop` and `main`.

Reference: [GitHub deployment environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments).

## Safe migration sequence (requires separate remote authorization)

1. Before any `main` push, disable the old remote legacy workflow. Check existing
   queued/running jobs and prevent unintended transfers before proceeding.
2. Verify isolated hosting roots, create/configure both Environments and their
   dedicated secrets, and back up staging files plus deployment state. No hosting
   or GitHub changes have been made by this local preparation.
3. Review, test and separately approve the local workflow/documentation commit.
   Keep the old workflow disabled while publishing and merging the replacement.
   Do not enable its old `main`-triggered revision.
4. After explicit staging-deployment approval, create/publish `develop` from the
   reviewed replacement revision. Its first push can trigger deployment. Re-enable
   the existing workflow only once its replacement and target configuration are
   verified; deliberately push a reviewed `develop` update if a new run is needed.
5. Inspect the staging run, verified target and application smoke results. An
   approved merge to `main` must not start either deployment automatically.
6. Publish production only through the unchanged manual workflow after all release
   gates and exact-SHA approval. Do not dispatch it merely to test this migration.

## Explicit release procedure (requires separate release approval)

1. Complete the remaining release gates and approve one exact full commit SHA.
2. Ensure that commit belongs to trusted `main` history and contains the validated
   packaging tool and tests. Review source and workflow before authorization.
3. Open the manual production workflow, select `main`, and enter the same approved
   lowercase 40-character SHA into both inputs. Start only with owner approval.
4. Required Reviewers remain disabled as decided. The job verifies SHA syntax,
   confirmation equality, commit type and ancestry in fetched `origin/main`
   before checking out the exact commit. Tags, branch names and non-main commits
   are not accepted. Main ancestry is not evidence of product acceptance; the
   explicit owner decision supplies that approval. Releasing an older main commit
   is possible only by explicitly selecting and approving it.
5. The job runs existing packaging tests, creates the current 24-file RC-003 artifact and verifies
   exact inventory/checksums before transfer. Only the artifact's `ftp/` is uploaded.
6. Inspect the run result and perform the approved production smoke checks. On
   failure, stop and report; there is no automatic rollback or retry policy.

The job uses read-only repository permissions and serialized production runs,
without canceling an active transfer. FTPS is explicit on port 21 with
`security: strict`; invalid certificates must fail rather than be bypassed.
FileZilla FTPS succeeded according to the owner; confirm certificate trust and
hostname matching for the configured server. The workflow does not enable
clean-slate deletion. Normal FTP synchronization can replace/remove previously
managed application files; it is not an arbitrary-file cleanup facility. Preserve
the deployment state file and never mix legacy and production account roots.

## Remaining release gates

- Owner verification of both Environments, exact branch restrictions, intentionally
  disabled production Required Reviewers, isolated account roots, dedicated secrets,
  Actions permissions and certificate validation.
- Confirm the new domain document root and initial target state. The owner reports
  no deployment there yet; the legacy application remains untouched. Before later
  replacement deployments, download the existing application and deployment state
  outside the webroot, preserving relative paths for manual restoration.
- Existing iOS/Safari/PWA, screen-reader and publication/privacy release decisions.
- Explicit authorization to publish workflow changes, and later to dispatch the
  exact production release. No Google production integration is included.
