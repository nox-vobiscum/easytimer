# RC-002 — Dedicated manual production deployment

Local workflow preparation only. Production remains NO-GO. No deployment or
GitHub configuration has been performed by this increment.

## Separation and paths

The unchanged `deploy.yaml` deploys the legacy application on pushes to `main`,
using the existing `FTP_*` secrets. Publishing this new workflow through `main`
therefore still triggers that legacy deployment; obtain approval before pushing.
The legacy installation at `et.rbsnet.at` is not the new production target.

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

## Owner-side GitHub setup

Create the `production` Environment and restrict deployment branches to `main`.
Set these dedicated Environment secrets, not legacy or repository-level copies:

- `PRODUCTION_FTP_SERVER` — the confirmed production host
- `PRODUCTION_FTP_USERNAME` — the dedicated account
- `PRODUCTION_FTP_PASSWORD` — its password

Never include credentials in source, dispatch inputs, screenshots or logs.
Configure an owner required reviewer if available. For a sole owner, leave
prevention of self-review disabled so the owner can approve their own dispatch.

The owner has confirmed that repository visibility is PUBLIC and the default
branch is `main`. The `production` Environment must still be configured by the
owner; actual reviewer protection remains unverified and is not claimed active.
GitHub Free/Pro/Team support required Environment reviewers for public
repositories. The owner must check Settings → Environments → production.
If reviewers are unavailable but Environment secrets are supported, the smallest
fallback is the owner-only manual dispatch with the approved SHA entered twice.
This is explicit authorization, not an independent second-person approval. If
Environment secrets themselves are unsupported, stop; do not silently move the
credentials to repository secrets or remove the Environment requirement.

Reference: [GitHub deployment environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments).

## Explicit release procedure (requires separate release approval)

1. Complete the remaining release gates and approve one exact full commit SHA.
2. Ensure that commit belongs to trusted `main` history and contains the validated
   packaging tool and tests. Review source and workflow before authorization.
3. Open the manual production workflow, select `main`, and enter the same approved
   lowercase 40-character SHA into both inputs. Start only with owner approval.
4. Approve the Environment review if configured. The job verifies SHA syntax,
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

- Owner confirmation of Environment/reviewer availability, branch restrictions,
  dedicated account root, secrets and certificate validation.
- Confirm the new domain document root and initial target state. The owner reports
  no deployment there yet; the legacy application remains untouched. Before later
  replacement deployments, download the existing application and deployment state
  outside the webroot, preserving relative paths for manual restoration.
- Existing iOS/Safari/PWA, screen-reader and publication/privacy release decisions.
- Explicit authorization to publish workflow changes, and later to dispatch the
  exact production release. No Google production integration is included.
