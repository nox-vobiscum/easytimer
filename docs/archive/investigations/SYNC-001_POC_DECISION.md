# SYNC-001 — Google Drive PoC Results and Architecture Decision

**Status:** PoC succeeded for the observed snapshot invariants; production synchronization is **NOT approved**.  
**Date:** 2026-10-25. **Project:** easyTimer (easytimer.at).

## Product contract

- Fully usable local-first, without Google, login, server, database or network.
- Optional Google Drive `appDataFolder` is only for the user's own Rundown library across their devices. Manual DATA-001 JSON import/export remains the independent backup and person-to-person sharing route.
- Do not synchronize active timer state, deadlines, overtime, editor drafts or unrelated preferences.
- Do not silently overwrite, delete or choose between divergent Rundowns. Keep recurring cost at zero wherever practical; re-check provider pricing before launch.

## Actual owner-operated Google Drive experiments

The isolated test project `easytimer-sync-poc` used the Drive API, a test-only GIS Web OAuth client at `http://localhost:8000`, and only `https://www.googleapis.com/auth/drive.appdata`. The tests used synthetic JSON, not real Rundowns.

| Experiment | Observed result | Verdict |
|---|---|---|
| Browser OAuth | Authorized manually in Firefox; another Chrome popup was rejected as potentially unsafe. | Works **in tested Firefox**; other browsers/iOS unresolved |
| `appDataFolder` create/list/read | Synthetic JSON file created, discovered and read back. | PASS |
| Conditional `If-Match` on PATCH | Deliberately invalid validator was accepted; readable metadata ETag absent. | **FAIL — do not depend on this protection** |
| Immutable create/retry | First pre-generated Drive file ID published and read back (`verified: true`). Same operation repeated (`duplicate: true`, `verified: true`); independent listing found one file. | PASS for tested fixture (exact raw HTTP 409 was not captured) |
| Lost acknowledgment | Re-read original Drive ID and verified content/hash after simulated lost response; no new operation. | PASS |
| Parallel branches | Separate browser clients A/B published descendants of the same parent. Discovery: 4 files, 2 heads, `conflict: true`. | PASS |
| Synthetic merge ancestry | A synthetic M snapshot explicitly listed both heads as parents. Discovery: 5 files, 1 head, `conflict: false`. | PASS for ancestry; **not semantic Rundown merging** |
| Late offline branch | A third snapshot descended from an older parent after M. Discovery: 6 files, 2 heads, `conflict: true`. | PASS |

These are browser observations, not an end-to-end proof of an actual synchronization product. API behavior under scale, incomplete listings, real-data conflicts, iOS installed-PWA OAuth, token expiry and local crash recovery remain open.

## ADR — preferred candidate

**Prefer append-only immutable FULL-LIBRARY snapshots in Google Drive `appDataFolder`.** Every revision is created as a *new file* with immutable contents and explicit parent snapshot hashes. No overwriting or deleting published files in the initial version. Divergent heads become visible conflicts, not automatic winners.

**Reject for production:** One overwritable Drive library JSON protected by the tested `If-Match` request. The real browser experiment showed that this condition was not enforced.

**Deferred alternative:** Immutable per-Rundown snapshots, potentially more efficient but with greater index/recovery complexity.

### Proposed envelope (subject to schema/canonicalization tests)

```json
{
  "purpose": "easytimer-sync-snapshot-v1",
  "syncFormatVersion": 1,
  "libraryId": "stable-library-uuid",
  "operationId": "stable-publication-uuid",
  "parents": ["sha256:parent-snapshot-hash"],
  "library": { "schemaVersion": 1, "templates": [] },
  "deletedRundownIds": [],
  "snapshotId": "sha256:canonical-envelope-hash"
}
```

Snapshot wrapping is separate from the existing downloadable DATA-001 format. Rundown/phase IDs remain stable for synchronization; DATA-001 *manual imports* intentionally allocate new IDs. Exact deterministic Unicode/key/array serialization must be specified before using hashes as identity. Never include OAuth tokens, account profiles or running timer data.

### Publication and reconciliation contract

1. Validate and durably commit local edits and their sync-dirty indication in one local transaction *before network activity*.
2. Fully paginate, read, validate and reconstruct known Drive history. Missing or malformed ancestors and partial listings block confident reconciliation; never infer deletions from absence.
3. Prepare immutable `operationId`, pre-generated Drive `fileId`, parent hashes, content hash and the exact bytes. Save this **unchanging recovery ticket** durably before upload.
4. Publish via Drive create. On timeout/unknown result or duplicate response, **reuse the same operation**; read back by original ID and verify exact content/hash.
5. Re-list remote history; if divergent heads exist, preserve all. An explicit user-reviewed content merge may publish a new snapshot listing the *heads actually reviewed*.
6. Distinguish `local pending`, `uploaded/verified`, `last-known reconciled`, `conflict`, `reauthorization needed`, `offline/error`. Never promise that all offline devices agree.

### Open risk gates

- IndexedDB/local transaction prototype, safe migration from existing `localStorage` key `easyTimerTemplates`, multi-tab races and crash recovery.
- Deletion/tombstone policy, actual content merging, account isolation, duplicate roots, Drive pagination race and storage limits.
- OAuth security/policy and real iOS Safari/installed PWA behavior. Login in Firefox does not establish iOS compatibility.
- Retention/cleanup: no automatic snapshot deletion until an explicit safe pruning plan is approved. Cloud app data is not a substitute for JSON backups.
- INFO-001 public About/FAQ/Imprint/Privacy pages and factual/legal approval before any public Google OAuth release.

## Official references

- Google `files.generateIds` and retry semantics: https://developers.google.com/workspace/drive/api/guides/create-file
- Google app data: https://developers.google.com/workspace/drive/api/guides/appdata
- GIS token model: https://developers.google.com/identity/oauth2/web/guides/use-token-model
- OAuth launch requirements: https://developers.google.com/identity/verification/authentication-policy-compliance
