# SYNC-002 — Optional Google Drive Rundown Sync: Incremental Plan

**Status:** PROPOSED; these stages are **not yet approved for implementation or deployment**.

## Objective

Preserve easyTimer's no-account, local-first behavior. Add an optional, explicitly activated Google Drive backup/synchronization for reusable Rundown definitions using the proven immutable-snapshot candidate. Keep DATA-001 portable JSON forever. No owned backend, account database or extra paid service. Initial synchronization should be **manual**, not always-on.

## Delivery gates

| Stage | Small scope | Gate to proceed |
|---|---|---|
| **SYNC-002A** | Durable local storage adapter and migration prototype. Explore IndexedDB transactions for validated library, dirty revision and pending upload intent. **No Google API/UI.** | Multi-tab and fault-injection tests pass; interrupted migration recovers; previous Rundowns and DATA-001 remain intact. |
| **SYNC-002B** | Pure immutable snapshot envelope, canonical hash, DAG ancestry, multiple heads, tombstones and conflict/merge decision model. **No network/UI.** | Deterministic tests: late branches, duplicate IDs, malicious/invalid payloads, missing parents, delete-vs-edit, merge correctness. |
| **SYNC-002C** | Test-only Drive adapter: opt-in GIS login, `drive.appdata` create/list/read, fixed recovery tickets, strict account binding, explicit first-sync preview. | Real API loss/retry, token expiry, browser failure and test-account isolation pass. No real Rundown migration without owner approval. |
| **SYNC-002D** | Minimal conflict/reconciliation UX in Session Editor. Explain local/cloud status, connect/reconnect, sync now, review choices, keep both and disconnect. | DE/EN, Light/Dark, 320px, keyboard, screenreader and unsaved-draft guards; no unintended edits. |
| **INFO-001** | Public About, FAQ, Imprint/Disclosure and Privacy pages with owner-reviewed content and stable paths. | Required for public Google OAuth, after factual network/hosting and legal review. Can be prepared in parallel. |
| **SYNC-002E** | Integrated cross-device release validation and staging. | Actual iOS Safari and **installed PWA**, desktop browsers, offline/rejoin, conflict/deletion, reload/migration, quota, account switch, revocation; separate deployment approval. |

Preferred sequencing: **002A → 002B → 002C → 002D + INFO-001 → 002E**. No single all-in-one feature branch; each stage must be scoped, tested and approved before commit/push/deploy.

## First-sync matrix

| Condition | Required behavior |
|---|---|
| Local library only | Show preview; upload only after explicit confirmation. |
| Cloud library only | Show preview; preserve Rundown IDs when user chooses to adopt. |
| Both, no common history | Show non-destructive first reconciliation. No missing entry implies deletion. |
| Two edited versions of same ID | Show conflict; user can select version or keep both (fresh IDs for copied Rundown). |
| Distinct IDs independently created | Candidate for union after validation; never infer sameness from names. |
| Delete vs edit | Conflict and visible decision. Tombstones are explicit. |
| Offline or token expired | Local app continues; dirty work retained; reauthorization by user action. |
| Account changed | Freeze old binding and pending uploads, request explicit new connection; do not auto-upload old data. |
| Unknown upload result | Recover same stored ticket; no new operation. |

## UI scope and principles

In Session Editor **below** `Data & Backup / Daten & Sicherung`, provide a modest optional `Google Drive` section (not a new timer mode): `Local only`, `Connect Google Drive`, `Sync now`, `Pending`, `Conflict`, `Reconnect`, `Disconnect`. No forced login or startup prompts. Only say `synchronized` after validated reconciliation of the last-known remote heads; clarify it cannot account for offline devices with unpublished edits. Manual JSON import/export and Run stage remain unchanged.

## Mandatory non-goals

- No sync of countdown/run/deadlines/overtime or cross-device remote timer control.
- No full-Drive OAuth scope, no client secrets, no server-side account system, no Google sharing of `appDataFolder`.
- No automatic history cleanup, automatic destructive merge, last-write-wins or 24/7 background sync promise.
- No image-to-Rundown AI yet (`AI-001` remains someday/low priority).

## Acceptance scenarios

1. Two tabs save concurrently; transaction prevents silently lost local changes.
2. Browser crash at each save/outbox/upload/verification phase leaves a reconstructable state.
3. A and B diverge from same head; both published snapshots persist, and the user can safely reconcile.
4. A deletes while B edits; neither loses data automatically.
5. Interrupted upload followed by restart finds exactly the originally intended version.
6. iOS installed PWA can authorize, return to the app, read snapshots and safely reauthorize.
7. Disconnect/reconnect does not delete local data or silently upload to the wrong account.
8. JSON backup/export/import still works on a browser without Google.
9. Browser storage eviction / blocked IndexedDB / quota produce honest messages and preserve recoverable backups where available.
10. Google quota, review/policy or cost barriers trigger No-Go, not hidden paid infrastructure.

## Immediate next action

Authorize only **SYNC-002A — local transactional persistence architecture and isolated fault-injection spike**. No Google UI and no production migration until data-safety tests and owner review.
