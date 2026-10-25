# easyTimer — SYNC-001 → SYNC-002 Handoff

Prepared 2026-10-25. Based on owner-operated browser experiments, the agent's analyses, read-only repository inspection and official Google/Austrian web sources.

Contents:

1. `SYNC-001_POC_DECISION.md` — what real tests proved; selected/rejected architecture.
2. `SYNC-002_IMPLEMENTATION_PLAN.md` — bounded implementation stages and acceptance gates.
3. `SYNC-002_LOCAL_INTEGRITY_CONTRACT.md` — local transaction, crash recovery, sync-status and conflict rules.
4. `INFO-001_PUBLIC_PAGES_BRIEF.md` — About/FAQ proposed copy and requirements for legal/privacy review.

**Owner summary:** Google Drive can store and discover immutable snapshots; parallel and late versions survived the real test. The tried overwrite guard failed. We have a promising architectural foundation, **not** functioning Rundown sync on iPhone yet.

**Next technical increment:** `SYNC-002A`: local transactional-storage architecture and fault-injection spike, before any real Google integration.

**Safe use:** These review documents were created outside the repository; **nothing was committed, pushed, merged or deployed**. Compare with current local repo files before copying into `docs/`, especially uncommitted branches and newly updated documentation. If approved, integrate via a docs-only change and update `docs/backlog.md` + `docs/BRIEFING.md` links/statuses. Do not include actual test account emails, secrets, access tokens or recovery tickets in Git. Seek separate authorization before committing or deploying.

Proposed backlog statuses:

- SYNC-001: **PoC tested** for immutable-snapshot invariants; full production sync No-Go.
- SYNC-002A: **Next / proposed** — local durable library and outbox, migration safeguards.
- SYNC-002B: Proposed — snapshot validation, DAG and semantic conflict engine.
- SYNC-002C: Proposed — test-only Drive transport and first sync.
- SYNC-002D: Proposed — minimal Google/reconciliation UI.
- INFO-001: Proposed — public About/FAQ/Imprint/Privacy pages; prerequisite for public OAuth.
- SYNC-002E: Proposed — real-device and staged release validation.
- AI-001: Someday, low priority — image-to-Rundown extraction.
