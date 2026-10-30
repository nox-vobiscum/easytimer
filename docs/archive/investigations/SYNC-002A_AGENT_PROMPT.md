# Agent handoff — SYNC-002A: local transactional storage experiment

The product owner has completed a real Google Drive immutable-snapshot PoC. Read the accompanying documents in this handoff package before proposing any code changes:

- `SYNC-001_POC_DECISION.md`
- `SYNC-002_IMPLEMENTATION_PLAN.md`
- `SYNC-002_LOCAL_INTEGRITY_CONTRACT.md`
- Existing repo `docs/backlog.md`, `docs/BRIEFING.md`, `docs/DATA-001_RUNDOWN_PORTABILITY.md`, `src/js/templates.mjs`, `src/js/portability.mjs`

## Objective

Build a strictly isolated, test-only prototype proving that browser-local Rundown changes and their pending-sync state can be persisted transactionally. The existing `localStorage` check is not atomic across truly simultaneous tabs. Evaluate IndexedDB, but do not assume it is suitable without testing.

## Authorized scope

- Inspect Git state first. Never reset, overwrite or silently absorb unrelated work; stop on conflicts.
- Write deterministic tests for multi-tab revision conflicts, interrupted operations, blocked storage, quota errors and recovery of a dirty library not yet assigned an upload ticket.
- Build a small local-only storage adapter/prototype for validated `schemaVersion:1` libraries, monotonic local revision, a durable dirty marker and a fixed outbox operation ticket.
- Verify that a save and dirty marker commit together, or neither does.
- Explore a **dry-run, non-destructive** legacy migration from `easyTimerTemplates` with full content validation and read-back. Retain original localStorage. No automatic production migration or new app initialization path.
- All actual timer, Session Editor, JSON import/export, deployed app and PWA behavior must remain unchanged.
- No Google API calls, tokens, OAuth UI, production Rundowns, remote file writes, service worker changes, or additional dependencies without separate approval.

## Deliverables

1. Proposed IndexedDB schema and transaction diagram.
2. Isolated prototype and focused tests including fault injection; a real two-tab browser test if feasible.
3. Migration risk analysis, exact safe transition plan and rollback path.
4. Comparison of observed results against every invariant in `SYNC-002_LOCAL_INTEGRITY_CONTRACT.md`.
5. Proposed next small implementation step, changed files, exact Git status and recommended model/effort.

**Do not commit, push, merge or deploy.** Stop for product-owner review before altering any production storage path.
