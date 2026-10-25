# SYNC-001: immutable snapshot experiment

**Date:** 2026-10-25 (Europe/Vienna).
**Scope:** Extension of the isolated localhost PoC only. No production integration, schema/timer changes, new scopes, cleanup, commits, pushes or deployment.

## Observed baseline versus open experiments

The owner reports actual Firefox GIS authorization and disposable appDataFolder create/list/read working. No readable metadata ETag was available. The tested PATCH accepted a deliberately invalid If-Match. Treat that conditional-update strategy as **FAIL**, not as an open production option. No further real If-Match experiments are performed here; its buttons are disabled. Original core tests remain to preserve the historical harness safeguards, not as evidence supporting the failed strategy.

The owner report did not provide exact HTTP response dumps or stored file contents. Do not invent status codes or claim independent inspection. Actual immutable-snapshot generateIds/create/retry/branching results remain **UNRESOLVED** until manually authorized clients execute the protocol below. Automated responses are explicitly simulated.

## Local environment

Continue using the owner-configured test project `easytimer-sync-poc`, the prefilled public test client ID and **http://localhost:8000/**. No client secret is used. Only `drive.appdata` is requested. Use a fresh profile if a previous localhost easyTimer service worker interferes. Authorization is manual and tokens remain in memory only.

```powershell
node tools/sync-poc/server.mjs
node --test tools/sync-poc/poc.test.mjs tools/sync-poc/snapshots.test.mjs
node tools/sync-poc/browser-check.mjs
```

The existing page now contains developer-only snapshot experiment controls. This is not synchronization UI in the production Session Editor. The new files are `snapshots.mjs`, `snapshot-ui.mjs` and `snapshots.test.mjs`; existing PoC HTML/CSS, core, browser smoke test and server allowlist are extended. No production imports, storage or service worker changes.

## Snapshot contract and validation

Each file contains `purpose`, `syncFormatVersion`, shared `runId`, unique `operationId`, `parents[]`, fixture `role`, canonical-shaped `library`, and SHA-256 `snapshotId`. The hash covers all fields except itself; object keys are sorted, parent hashes are sorted and library/phase array order is preserved. Parent entries are content hashes, not Drive timestamps or versions.

Roles A/B/C/M select fixed synthetic full-library payloads; Rundown/phase IDs remain stable within the run. M is an explicitly chosen synthetic reconciliation result, not automatic merging or a preservation guarantee for arbitrary real content. Every payload must match the strictly generated synthetic shape and complete hash. Arbitrary imported Rundowns and unknown fields are rejected.

Create metadata contains the pre-generated Drive ID, `parents: [appDataFolder]`, JSON content, distinct snapshot purpose, Run ID, operation ID and content hash. Names include the operation ID. The new snapshot API only uses GET and POST; never PATCH, PUT or DELETE. Old mutable fixtures use a different purpose and cannot be mistaken for snapshots.

Metadata and full file content are checked on every read. Discovery reads every distinct file ID, validates complete payloads and computes multi-parent ancestry. Identical logical nodes are deduplicated; contradictory content, missing ancestors, cycles, incomplete searches, pagination loops and the 200-file PoC limit block confirmation. No snapshot is automatically deleted. Invalid/missing data never becomes a deletion request.

## Recovery ticket

**Prepare NEW operation + Drive ID** creates a synthetic payload, operation ID and hash, then requests `files.generateIds` with `space=appDataFolder`. It does not upload the snapshot. The returned recovery ticket contains the exact file ID and complete snapshot, no tokens or account data.

Copy the ticket outside the repository before uploading if testing recovery across reload. Tickets may be pasted back unchanged after reauthorization with the same test account and shared Run ID. They are validated before use. Disconnect/reload clears the page's ticket and discovered state. No durable outbox or browser storage is implemented; this remains a bounded experiment.

**Publish / repeat SAME operation** always submits the ticket's original Drive ID and bytes as a create. A real 409 is retained in observations and triggers a read/compare, not an overwrite. A 2xx is also followed by full readback. Any mismatch blocks verified publication. A lost response never invokes Prepare automatically.

**Recover** only reads and verifies the original file; it does not upload anything. If the file is absent or inaccessible, the result remains unresolved. Retry publication only with the same retained ticket after inspecting the outcome.

## Test 1: idempotent creation

1. Authorize client A manually. Use a fresh shared Run ID. Click **Discover snapshots and heads** and verify the experiment is empty.
2. Leave Parent hashes empty, choose role A, and Prepare. Retain the exact recovery ticket.
3. Publish. Record actual generateIds status, create status, File ID, operation ID, hash, and complete verified readback displayed in the snapshot panel.
4. Without preparing again or changing the ticket, Publish again. Expected from Google's documentation: rejection with HTTP 409; verify this experimentally.
5. Confirm the original file's complete canonical content equals the ticket and discovery contains one logical root. A different status is an observed deviation requiring review, not an assumed pass.

## Test 2: lost acknowledgement / interrupted outcome

1. Prepare a new successor referencing the root hash. Retain its ticket.
2. Use **Publish then simulate lost acknowledgement**. This intentionally creates the file but withholds application verification/acknowledgement and reports `SIMULATED_LOST_ACK_VERIFY_SAME_OPERATION`. The transport's actual HTTP response can still appear in the observations. This is a controlled lost-ack simulation, NOT proof of a real network interruption.
3. Recover using the same ticket. Full readback must match exactly before the UI confirms recovery.
4. Repeat Publish with that same ticket to test duplicate behavior; do not generate another ID.
5. Separately test a real inconclusive response using browser throttling/disconnection or Abort while a create is pending. Record whether the request actually remained pending; a completed fast request is not an interrupted-upload result. Recovery may find the original file or a still-unresolved absence. Never retry with a different operation.

## Test 3: independent parallel branches

1. Use two independent browser profiles/contexts with the **same manually selected test Google account**, project and shared Run ID. The second Google account tests account isolation, not access to the same file.
2. Both Discover and read the same root content/hash. In A choose role A, in B role B, and explicitly paste that root hash into Parent hashes. Prepare one operation in each context before publication. Keep both tickets.
3. Publish both as new files. Re-discover in both contexts. Both complete branch contents and the original root must remain readable. Heads must be A and B by ancestry, regardless of timestamp or listing order.
4. Save sanitized discovery output with the file IDs, full synthetic contents and branch hash list. If a branch is initially absent, re-list; do not infer a deletion or synchronized state.

## Test 4: explicit reconciliation and late branch

1. Before reconciliation, prepare and retain role C with the original root as its only parent. Do not publish C yet. Do not prepare it again later with newer parents.
2. Discover A and B, review both full fixtures, select role M, and enter **both A and B hashes** as Parent hashes. This explicitly chooses the synthetic M result.
3. Prepare/publish M as another new file. Discovery should show M as the only known head. Both A and B are still fetched and fully validated in the discovery output, not deleted or overwritten.
4. Restore C's retained ticket and publish it unchanged. Re-discover. Expected heads: M and C. C must not be considered resolved merely because M was published later.
5. Any further reconciliation requires a new explicit decision; the harness never silently chooses a winning branch.

## Actual local verification

Six snapshot unit tests use an in-memory simulated Drive to exercise full-content validation, stable IDs, duplicate 409/readback, lost response/recovery, two branches, multi-parent reconciliation, late branches, corruption and incomplete discovery. Ten existing PoC tests cover authentication/request guards. These tests prove harness behavior under supplied responses, NOT real Google guarantees.

Actual local execution passed **89/89 unit tests**: the existing 73 plus 16 PoC tests. The dedicated isolated browser check passed after the final changes. Production sources and the production browser suite were not changed; the full production browser suite was not rerun for this tooling-only step.

The isolated Chromium smoke test uses intercepted HTTPS and mocked OAuth. It checks default-off Google loading, authorization gates, disabled retired PATCH controls, denied/closed popups, late callbacks, browser storage and narrow layout. It is not a Firefox/iPhone or live API result.

| Experiment | Real Google result | Local simulated result |
| --- | --- | --- |
| generateIds and same-ID duplicate create | UNRESOLVED | PASS |
| Complete original content retained on retry | UNRESOLVED | PASS |
| Lost response recovery with same operation | UNRESOLVED | PASS |
| Independent parallel clients | UNRESOLVED | PASS for model/transport simulation only |
| Reconciliation and unresolved late branch | UNRESOLVED | PASS |

Report only sanitized observations: operation, actual HTTP status, file/operation IDs, verified complete synthetic JSON, hash and ancestry. Never share tokens, OAuth callbacks, authorization headers or HAR files. An upload response alone is not successful content verification; verified upload is not a global synchronization claim.

## Remaining limits and decision

- Real Google requests need interactive consent in the owner's browser. No access to an existing manually authorized Firefox token is assumed or requested.
- Immutable means this PoC never overwrites snapshots; Drive does not enforce write-once storage against another authorized client or external removal.
- Listings are observations, not atomic global snapshots. Missing history, corrupt files, unsupported schemas and listing limits remain blocking conditions.
- The experiment contains no real deletion/tombstone protocol, durable local transactions, production conflict UI or cleanup. None is authorized by this step.
- iOS Safari/PWA still need a separately approved HTTPS test origin; localhost-only OAuth cannot establish those results.
- Scope, Google Cloud settings, pricing/billing configuration and hosting remain unchanged.

**GO:** Run these four isolated manual experiments with disposable fixtures.
**NO-GO:** Production synchronization until actual file-ID/retry and concurrent-branch evidence is reviewed. Passing simulated tests does not release this gate.

Official references: [appDataFolder IDs and scope](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/generateIds), [documented duplicate-create retry behavior](https://developers.google.com/workspace/drive/api/guides/manage-uploads#use_a_pre-generated_id_to_upload_files). These are expectations to test, not observed PoC results.
