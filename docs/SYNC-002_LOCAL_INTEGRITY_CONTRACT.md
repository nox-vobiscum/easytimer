# SYNC-002 — Local Data Integrity and Conflict Rules

**Status:** Design proposal, not implemented. Focus on Rundown definitions and sync metadata only.

## Current starting point

`src/js/templates.mjs` uses `localStorage['easyTimerTemplates']` with `{schemaVersion:1, templates:[...]}` and a raw read/compare/write check. It detects *intervening* edits but two simultaneous tabs can race between comparison and write. `src/js/portability.mjs` validates schema and intentionally gives **fresh IDs** to manual imports. The session engine and open editor drafts are separate.

## Local transaction candidate (IndexedDB)

IndexedDB is **local browser storage**, not a cloud database. Candidate object stores:

- `library`: one validated library, monotonic `localRevision` and `syncDirty` flag.
- `bindings`: explicit library/account association and last confirmed ancestors; no raw OAuth tokens.
- `outbox`: unchanged upload ticket: `operationId`, Drive `fileId`, parent hashes, exact snapshot bytes/hash, revision and stage.
- `history`: validated local cache of remote ancestry, not a substitute for Drive verification.

### Durability invariant

**Save the Rundown and its durable `syncDirty` indication in one IndexedDB read-write transaction, or neither.** Never report a local save succeeded if its data failed to persist. A crash after saving but before preparing an outbox ticket is recoverable from that dirty revision. Before any network upload, persist a complete immutable ticket bound to the exact local revision.

Do expensive hashing and network operations **outside** IndexedDB transactions. If a hash/ticket is precomputed outside a transaction, check that the referenced local revision still matches *inside* the transaction; otherwise retry calculation. Every browser tab must write via the new transactional adapter; parallel old localStorage writers would break the guarantee.

### Non-destructive migration

Do not silently replace or clear `easyTimerTemplates`. Validate and copy legacy data, test new-store round-trip, and keep old data available for recovery until explicit rollout approval. `localStorage` and IndexedDB cannot be updated in a single atomic transaction. Handle old service-worker tabs and multiple windows; test interruption at every phase. No production migration in the first local spike. Verify iOS PWA, private browsing, blocked storage, quota and eviction behavior. DATA-001 export remains a necessary independent backup.

## Upload/recovery invariant

1. No upload until validated local save and immutable ticket are durable.
2. Upload uses a fixed `operationId` and pre-generated Drive `fileId`; timeout or restart **never** generates a replacement ticket for the same operation.
3. Read back and verify full content/hash after success, 409 or uncertain result; mismatches block sync.
4. Re-read remote graph before reporting last-known reconciliation. Listing is not atomic and cannot rule out offline unpublished changes.
5. Missing or partial listing is **not a deletion instruction**; no auto-prune in initial release.

## Conflict rules

- Stable Rundown IDs and a **known common parent** determine identity/history; identical name does not.
- Only one side changed an item relative to base: candidate for safe merge after ancestry/validation check.
- Different items changed independently: candidate for union, but conservative owner review is acceptable for first release.
- Same ID changed on both sides: explicit conflict; default preserve both until reviewed.
- Deleted on one side, edited on other: explicit **delete-vs-edit conflict**; use recorded tombstones, not missing entries.
- User chooses `keep both`: create a new independent copy with new Rundown and phase IDs for one version.
- A **real merge** builds a correctly combined and validated library. Merely recording two parent hashes (as synthetic PoC M did) does not merge user contents.
- Merge snapshot parents reference the exact heads the user reviewed. A late third head remains unresolved.
- Multiple roots, duplicate conflicting hashes, invalid JSON, unknown schema versions, cycles and missing parents must not be silently adopted.

## Status semantics

| UI status | True meaning |
|---|---|
| Local only | No Google sync required or running. |
| Changes pending | Local changes safely saved, not confirmed on Drive. |
| Upload verified | The exact snapshot was read back successfully; reconciliation may still be pending. |
| Last checked and reconciled | All *known* snapshot heads checked and no known pending edits/conflicts. |
| Conflict | Two or more divergent validated heads and/or divergent Rundown content require review. |
| Reconnect | Authorization expired or revoked; local editing continues. |
| Sync error | Local data and recovery ticket retained, no automatic destructive retry. |

## Mandatory tests

- Simultaneous multi-tab edit/save.
- Crash before/after library transaction, ticket creation, upload, read-back, remote discovery, and account switch.
- 401/403/404/409/429/5xx, timeout, CORS, missing response, duplicate create, quota/eviction, malformed JSON.
- Late third branch, missing parent, duplicated listing, first sync with no common ancestor, delete-vs-edit, rename/reordering, keep-both IDs.
- Cross-origin local storage migration, PWA upgrade and unsaved editor draft unaffected.
- No timer state changed by cloud activity.

**Do not authorize production sync unless these invariants have passing unit, browser and real-device evidence.**
