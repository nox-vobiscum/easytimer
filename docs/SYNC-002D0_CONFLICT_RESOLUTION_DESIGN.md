# SYNC-002D0 — KISS Synchronization Architecture Redesign

**Design recommendation only; no implementation, cleanup or migration approved. Production sync remains NO-GO.** This replaces the earlier D0 proposal. Permanent readable history and historical conflict reconstruction are no longer product requirements. SYNC-001/002A/B/C remain unchanged experimental evidence, including [C's owner-operated results](SYNC-002C_ISOLATED_INTEGRATION.md). They do not prove this replacement protocol or cleanup safe.

Branch: `feature/sync-002c-isolated-integration`; HEAD: `0f09162c9be994064ef53ee6d1bd0e2ee9f36ff5`. Only this document changes. Existing uncommitted work is preserved. No Google requests, code changes, Git mutations or deployment.

## 1. Recommendation: current library plus a recoverable inbox

Use **one logical current library**, stored as immutable **current checkpoints**, plus short-lived immutable change files containing only changed Rundowns. Fold accepted changes into replacement checkpoints and eventually remove safely covered old payloads. No version-history screen, revert feature or permanent collection of full historical libraries.

Do not use one overwritable `current.json`: the tested Drive `If-Match` protection failed. Timestamps, a highest generation number, a mutable current pointer or a browser lock file do not prevent silent concurrent overwrites. A pointer could only be a discovery hint, never authority.

Authority means the **validated current state represented by checkpoints plus changes not yet incorporated**. Normally one checkpoint exists. Concurrent compaction may produce several: retain their current alternatives and coverage evidence, then produce a checkpoint that covers them. Never elect the newest file. Incomparable or inconsistent states block cleanup rather than lose data.

Changes are whole-Rundown `upsert`, `delete` or explicit `resolve` operations. Different IDs remain independent; no field-level merging. Checkpoints contain today's values and still-unresolved current alternatives. Explicitly selected-away contents may disappear after safe replacement. DATA-001 remains the independent backup/export route.

**Smallest necessary compromise:** historical *content* need not be permanent, but causal/recovery metadata cannot all disappear. Arbitrarily old offline devices and uncertain uploads cannot be recognized after every trace of their operations has been erased. Retain compact receipts and retired-base information, not old Rundown bodies. A fixed-size metadata bound for unlimited edits/devices/offline time is not promised.

## 2. Necessary metadata versus unwanted history

| Record | Necessary meaning |
| --- | --- |
| Local state | Library, monotonic local revision, per-Rundown dirty intent and last acknowledged base-version token; saved atomically |
| Pending change | Operation ID, affected Rundown ID, base token(s), action and payload/hash, bound to library/account |
| Current checkpoint | Current values/alternatives, revision identities, explicit deletions, closed resolution bases and operation coverage |
| Recovery receipt | Exact covered operation ID/content hash; accepted or explicitly resolved does not mean still selected today |
| Outbox | Fixed operation ID, pre-generated Drive ID, exact bytes/hash, source local revision and stage |

Start verification with **explicit operation-ID/hash receipts and dependency/closed-base tokens**. No replica service, leader election, CRDT framework or version vectors at the outset. Metadata compression is optional later; a largest counter alone cannot acknowledge gaps. A small amount of causal ancestry is unavoidable, but readers must not require historical payloads to use current state.

Rules:

- An accepted operation seen again is a duplicate, not a new edit. Unchanged cached Rundowns are not uploaded.
- Two causally concurrent current edits to the same Rundown expose A/B choices; separate Rundowns combine without choosing a winner.
- Resolution closes exactly the reviewed bases/variants. Consumed old versions must not reappear as unresolved choices after rediscovery or retry.
- An intentional edit based on a closed, retired or unverifiable old base is preserved as an independent copy, never an overwrite. Conservatively copying uncertain old work is preferable to discarding it.
- The same stale source operation must map to the same rescued-copy identity on all clients/retries. Retain that mapping or derive it reproducibly from source identity, with collision validation.

Exact checkpoint dominance, receipt union and concurrent-resolution semantics need the small model below. This is a candidate protocol, not a claim that deleting B's ancestors already works.

## 3. Minimal choices and numbered copies

Future placement: a quiet **Review conflict / Konflikt prüfen** action under Session Editor's Data & Backup. Show two current read-only alternatives and three unselected choices:

- **Use version A / Version A verwenden**
- **Use version B / Version B verwenden**
- **Keep both / Beide behalten**

Bind A/B to exact variant identities throughout review, never timestamps or client names. Preview the full result, including independent changes, and require explicit confirmation. Changed known variants/local inputs invalidate approval. A publication race after the final check remains possible; discovery must preserve the late change instead of claiming global agreement.

Selecting one preserves that version's Rundown/phase IDs. Keeping both preserves A's identity and copies B with fresh Rundown **and all phase IDs**. Unlike the old D0 proposal, automatically number the independent name: `Sprint Planning (1)`, then `(2)` if occupied.

Check names against the complete resulting library using existing normalized-name comparison. Reserve suffix space within the existing 120-character limit, truncate only at safe Unicode boundaries, preserve the suffix and validate the result. Freeze identity/name in the durable intent for retries; do not append another suffix every time the same operation returns.

**Concurrent naming compromise:** two devices can independently assign `(1)`. Resolve collisions between *generated* names deterministically by stable copy-operation order, assigning available suffixes while preserving ordinary explicit names. A generated suffix may change when concurrent copies meet; IDs/content must not. This rule needs owner approval. No general automatic renaming of manually named Rundowns.

That correction belongs to the new current checkpoint's generated-name materialization. It must never mutate an existing immutable upload or its recovery ticket. Retain enough copy provenance to distinguish an automatically generated name from a subsequent deliberate user rename.

Delete-versus-current-edit is an explicit A/B/both choice; both may retain deletion of the original plus a numbered live copy. After settlement, a stale edit becomes a copy and a stale delete cannot remove today's value. Missing entries in stale libraries or partial listings are never deletion instructions.

## 4. Three concrete scenarios

### Normal sync

The browser acknowledged checkpoint K and Rundown revision r. Editing that Rundown atomically saves its value and dirty intent based on r. A fixed immutable change ticket is published and read back, followed by complete discovery. Incorporate it without touching unrelated IDs. A later checkpoint contains the result and receipt. Only the corresponding local revision becomes acknowledged; a newer edit remains dirty.

### Two-device conflict

A and B both edit `Sprint Planning` from r and publish distinct immutable operations. Neither overwrites the other. Discovery shows the two current alternatives. The user chooses A, B or both. The decision names those exact variants and closes their conflict base. With both, the current library contains the original and `Sprint Planning (1)` with independent IDs. A verified covering checkpoint makes old payloads cleanup candidates; consumed alternatives are no longer choices.

Two simultaneous incompatible **resolution decisions** must not be settled by timestamps either. Initially treat this as an unsupported, non-destructive blocked state: retain both decisions/results and stop cleanup. Do not disguise the original A/B conflict as a new review merely by giving it new IDs. If both users demand different winners, automatically selecting one or silently turning both decisions into keep-both would violate the product contract. A separate product rule is required if this case must complete automatically; the proposed verification must expose it rather than invent historical merge UI.

### An offline device returns weeks later

It last knew r, but another device resolved that conflict and compacted old payloads. On reconnect it reads the current checkpoint. Unchanged cached items update normally. An intentional edit based on retired r becomes a fresh-ID numbered copy; today's original stays intact. Explain **“Saved an older-device edit as a copy” / “Änderung eines älteren Geräts als Kopie gespeichert”**, without asking the user to resolve the old conflict again.

If its pending operation was already covered, the receipt prevents duplicate publication/copy creation. If never covered, retain/recover its original fixed ticket and classify the old-base content as stale once. The durable local payload supplies the content; old remote snapshots are unnecessary. Lost local storage cannot be recovered from metadata alone.

## 5. Safe replacement and cleanup

Cleanup is opportunistic during explicit sync; no paid scheduler/backend. It is **not** deleting everything except the newest file.

1. Fully discover and validate checkpoints and changes. Partial/invalid observations, account mismatch or unknown pending work block cleanup.
2. Create an immutable replacement checkpoint with the full current library, all unresolved alternatives, deletion/closed-base metadata and exact receipts for everything claimed covered. Verify complete readback **before any deletion**.
3. Discover again. Incomparable checkpoints need a safe combined replacement retaining their current results and receipt union. An incomplete view never authorizes deletion of an unseen/uncaptured change.
4. Remove only specifically identified immutable payloads whose exact identity/hash and effects are covered by a retained verified checkpoint. Preserve current results and unresolved alternatives. Explicitly rejected old content may disappear; retirement/receipt proof remains.
5. Never remove the last verified covering checkpoint or sole payload of unknown/unresolved work. Concurrent compactors delete only covered input files, never each other's unincorporated replacements. Keep sufficient coverage links to recognize surviving replacements without deleted bodies.
6. A grace period/count may reduce operational risk, but is not correctness proof. Cleanup must tolerate a device remaining offline beyond it.

**Unknown upload during cleanup:** preserve the outbox ticket unchanged. A verified checkpoint's exact operation/hash receipt may acknowledge incorporation or explicit settlement even if GET on the old payload is now 404. This is a deliberate **new recovery contract**, replacing C's unconditional exact-file GET requirement only in a future distinct protocol. Covered does not mean the content remains selected. Without proof, retain/retry the same ID/bytes; 404 never permits a fresh logical operation.

A late retry may recreate a covered payload. Its receipt makes it inert and eligible for later removal, without reopening conflict or duplicating copies. An unknown DELETE outcome is checked against that exact old file; 404 proves only its absence. Never compensate by deleting a replacement or issuing a broad deletion query. Failed cleanup postpones space reduction, not local editing.

Concurrent compaction, receipt retention and late-write safety are **not proven by existing PoCs**. Cleanup stays disabled until verified. Permanently failing operations/unresolved work can temporarily prevent bounded payload storage. If even compact receipts are retired later, an explicit old-client reset/copy policy is required; silently dropping them would invalidate recovery guarantees.

## 6. Complexity, reuse and open limits

| Existing architecture | Replacement candidate |
| --- | --- |
| Full-library payload on every publication | Changed Rundown payloads and occasional current checkpoint |
| Historical DAG bodies and unique common-base reconstruction | Current values plus compact dependency/coverage/retirement metadata |
| Late offline branch reopens historical conflict | Closed-base edit becomes numbered independent copy |
| Permanent snapshot retention | Verified replacement, then exact covered-payload removal |
| Fixed tickets and atomic local persistence | Preserve; add receipt-based recovery after payload cleanup |

Reuse A's transaction/revision/dirty patterns; C's account binding, memory-only tokens, fixed IDs/tickets, raw-byte validation and pagination; B's validation, canonical hashing and copy-ID validation ideas. Do not reuse B's mandatory historical-body DAG/merge contract unchanged. The replacement needs a separate experimental namespace/format, not pruning or migration of existing C data.

Product/content complexity is lower; concurrency is not free. Checkpoint/receipt cleanup replaces historical merging and must be proven rather than marketed as automatically simpler in every technical detail. Avoid a version browser, field merger, distributed lock, device census, CRDT dependency and administrative history tools.

Block malformed/partial data, unknown protocol, conflicting operation identities/hashes, ambiguous coverage and missing current alternatives. No automatic winner or cleanup there. Account switching never implicitly transfers data. Cloning a live browser database/outbox is unsupported until identity isolation is proven. Hashes do not prevent malicious authorized writes, external Drive deletion or clearing local storage. Metadata may grow with operations/devices, but does not preserve complete history contents; compression is a later optimization, not a launch assumption.

Actual iOS Safari/PWA, physical interruptions, real quota exhaustion, public OAuth/privacy readiness and Opera GX rendering remain open. Local editing, optional Google and DATA-001 stay independent. No new backend, database server, mandatory dependency or paid service; no guaranteed perpetual provider pricing claim.

## 7. Very small verification proposal and approval boundary

After separate approval, start only a pure in-memory model with two devices, one Rundown, a fake file map and **explicit receipts**, in a new test area. No UI, Google, storage migration or actual cleanup. Check delivery permutations/duplicates for:

1. Normal and independent-ID updates; two current conflicts; A/B/both confirmation.
2. Resolution, simulated compaction and weeks-late edit: exactly one numbered copy, no reopened old conflict.
3. Lost acknowledgement and removed payload: same-ticket receipt recovery; unknown operations remain pending.
4. Concurrent checkpoint creation/compaction plus late upload: current contents/receipts survive; no uncovered payload is deletable.
5. Concurrent different resolutions: preserve both decisions/results and explicitly block; never a timestamp winner or resurrection of consumed choices under new IDs.
6. Copy-name races, existing suffixes, name-length/Unicode boundaries and stable retry identities.

Require convergent current state or an explicit non-destructive blocked state across delivery orders. Every simulated deletion must leave current data or an explicit settled decision represented in retained state. If that requires a large historical engine again, stop and report the failed simplification before integration.

Owner review points: approve this direction, compact receipt retention, deterministic renumbering of colliding generated copy names and initially blocking simultaneous incompatible resolutions. A/B/both, stale-copy rescue and no permanent full-library history are already confirmed product decisions. The proposed model is the next bounded step, **not authorized implementation**. Production UI/storage, Google writes, cleanup execution and deployment require separate approval. No executable tests run in this documentation-only redesign.
