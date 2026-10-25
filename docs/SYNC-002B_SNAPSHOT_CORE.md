# SYNC-002B: isolated immutable snapshot and reconciliation core

**Date:** 2026-10-25 (Europe/Vienna). **Status:** Deterministic logic prototype implemented; production synchronization, migration, Google integration and deployment remain unapproved.

## Isolation and references

Read the [owner PoC decision](SYNC-001_POC_DECISION.md), [incremental plan](SYNC-002_IMPLEMENTATION_PLAN.md), [local integrity contract](SYNC-002_LOCAL_INTEGRITY_CONTRACT.md), [SYNC-002A experiment](SYNC-002A_LOCAL_STORAGE_EXPERIMENT.md), [DATA-001 contract](DATA-001_RUNDOWN_PORTABILITY.md), [briefing](BRIEFING.md) and [backlog](backlog.md) before implementation.

All new executable code is isolated in `tools/sync-core/`. It imports only the existing pure `validateLibrary` from `src/js/templates.mjs`; it does not import the app, editor, timers, Google PoC, IndexedDB adapter or portability download code. No new dependencies. No HTTP, OAuth, token, database, migration, UI, pruning or runtime initialization is implemented. Browser-supported Web Crypto performs SHA-256; Node.js 22 runs the deterministic tests.

The worktree already contained uncommitted SYNC-002A/001 experiments, owner handoff documents and a backlog edit. Those files are preserved, not incorporated into this increment. Work stays on `docs/close-data-001`, HEAD `945c236c846b219b86908beae50cbc893e35048d`; creating another branch with all pending work would not isolate those changes. No commit, merge, push, deployment or branch switch was performed. Only four new files under `tools/sync-core/` and this report belong to SYNC-002B.

## Experimental version-1 envelope

All fields below are required. Unknown fields are rejected, including transport metadata:

```json
{
  "purpose": "easytimer-sync-snapshot-v1",
  "syncFormatVersion": 1,
  "libraryId": "00000000-0000-4000-8000-000000000001",
  "operationId": "00000000-0000-4000-8000-000000000002",
  "parents": [],
  "library": {"schemaVersion": 1, "templates": []},
  "deletedRundownIds": [],
  "restoredRundownIds": [],
  "resolution": null,
  "snapshotId": "sha256:<64 lowercase hex digits>"
}
```

- `libraryId` and `operationId` are lowercase UUID-shaped strings. The library identifies one history; the operation identifies one immutable publication. Retrying must reuse both and the same bytes. Fresh operations with identical libraries intentionally have different hashes.
- `library` retains the existing schemaVersion 1 structure and validator rules: stable Rundown/phase IDs, Manual/Automatic, integer-minute durations, existing duration/name limits. Validation must not silently trim visible text or remove unknown fields. Such input is rejected for explicit correction instead. Unicode is never normalized.
- `parents` is an unordered set of snapshot hashes, not file IDs, timestamps or revision numbers. This bounded version supports 0, 1 or 2 parents. More parents are rejected rather than guessed.
- `deletedRundownIds` is the explicit current tombstone set. A live definition and tombstone for the same ID cannot coexist. Tombstones must survive single-parent descendants unless an explicit restoration is recorded.
- `restoredRundownIds` is an explicit event for this revision, not a cumulative list. Each entry must be live and must correspond to a parent tombstone. Roots cannot claim restoration. Restorations after the common base remain relevant during reconciliation even when the current content equals the original base content.
- `resolution` is null for roots and single-parent changes. For two parents it must contain `{base, decisions}`. `base` is the unique nearest common ancestor. `decisions` contains exactly one choice for each actual conflict, sorted by stable Rundown ID. Each entry is `{id, choice, copy}`; choice is `left`, `right` or `both`. Non-copy choices require `copy:null`; `both` carries `{id, phaseIds}` for the independent copy.
- Left/right always mean ascending parent-hash order, not caller argument order or file listing order. No timestamps or account/profile metadata are used.

This is the first logic schema, not a migration for the earlier synthetic Google fixture or the Stage A local-intent fixture. Those experiments remain unchanged. Transport integration must explicitly reject or distinguish their different purposes/envelopes.

## Canonicalization specification

This is a restricted JSON protocol, not a claim of general RFC 8785/JCS compatibility.

1. Reject non-JSON values, object-reference cycles, accessors, symbols, sparse/extended arrays, non-plain objects, non-finite or fractional numbers, negative zero and integers outside JavaScript's safe integer range. Reject unsupported/missing envelope and nested schema fields.
2. Strings must contain valid Unicode scalar sequences. Lone UTF-16 surrogates are rejected. Preserve code points exactly: NFC and NFD spellings remain different. Names/titles are not trimmed or case-folded. Invalid data that the old validator would normalize is rejected, not repaired.
3. Object property keys are sorted lexicographically by unsigned UTF-16 code units, using ECMAScript default string comparison. No locale collation or integer-key enumeration ordering is used by the serializer.
4. Normalize semantically unordered sets: parent hashes, tombstone IDs and restoration IDs sort by the same string comparison. Reject duplicates before sorting. Sort resolution decisions by `id`, rejecting repeated IDs. Copy `phaseIds` preserve the source phase order.
5. Preserve `library.templates` and `phases` array order. Object insertion order is irrelevant; meaningful array order affects identity. Existing library ordering is not silently discarded.
6. JSON escaping: quote and backslash become `\"` and `\\`; U+0008/0009/000A/000C/000D use `\b`, `\t`, `\n`, `\f`, `\r`; remaining U+0000–001F controls use lowercase `\u00xx`. Slash, valid non-ASCII characters, U+2028 and U+2029 are not escaped. No whitespace is inserted outside strings.
7. Numbers are safe integers serialized as ordinary base-10 digits, with a leading minus only for negatives where structurally allowed. Protocol numeric fields and duration validation restrict the values further. No exponent, plus sign, leading zeros or decimal fraction is emitted.
8. Encode the resulting string as UTF-8, without BOM or terminating newline. Hash the **normalized payload without `snapshotId`**, using SHA-256. Prefix the lowercase hexadecimal result with `sha256:`. Adding the resulting `snapshotId` to the envelope is not a circular hash operation.
9. Complete wire bytes are canonical JSON for the normalized envelope including `snapshotId`. `parseCanonicalSnapshot()` verifies the hash and requires exact equality with the canonical text. This rejects repeated JSON object keys even if JSON.parse would retain only the last occurrence, noncanonical set order, trailing whitespace/BOM and alternative number spellings. Its input is already decoded text: Stage C must use fatal UTF-8 decoding and compare original received bytes with `snapshotBytes(verified)` rather than accepting a decoder's replacement characters.
10. Drive file ID, API status, upload stage, localRevision, account binding and other transport/storage fields are not part of this logical envelope. They are forbidden here, not silently omitted. Stage C stores them beside the exact bytes in its durable ticket.

### Golden identity vector

`core.test.mjs` defines a root with library/operation UUID `00000000-0000-4000-8000-000000000001`, Rundown `r1` named `Example`, manual mode, phases `r1-p1`/`Opening`/300 and `r1-p2`/`Closing`/600 seconds, all sets empty and resolution null. Its expected identity is:

```text
sha256:dde988c4232c90f38d6afec4a8bc49e494b8f278495a5ca80b3f3084a856e6ef
```

The tests also pin the canonical UTF-8 bytes of `{"a":"ä"}` to `7b2261223a22c3a4227d`. Different property insertion order produces the same hash; changed Unicode composition, phase order, duration or operation identity produces a different one.

## Pure interfaces

| Module / function | Contract |
| --- | --- |
| `canonical.mjs: strictLibrary(library)` | Reuse production validation; reject any dropped/normalized content |
| `canonicalJSON(value)` | Deterministic restricted JSON encoding; does not perform envelope validation by itself |
| `normalizePayload(payload)` | Exact envelope validation and set normalization |
| `createSnapshot(payload)` | Return normalized envelope plus content hash; no randomness or persistence |
| `verifySnapshot(snapshot)` | Recompute hash and return normalized defensive copy |
| `snapshotBytes(validatedSnapshot)` | Encode a previously created/verified envelope to canonical UTF-8 |
| `parseCanonicalSnapshot(text)` | Strict canonical wire parse/hash verification; 10 MiB wire limit |
| `graph.mjs: buildGraph(nodes,{complete:false})` | Validate identities, topology and semantic transitions; default blocks incomplete discovery |
| graph `get/list/ancestors/commonBases` | Defensive copies; ancestors include self; maximal common ancestors, not timestamp winners |
| `analyzeReconciliation(graph,a,b)` | Return blocked reason, structured proposals or conflicts with original versions |
| `createReconciliation(graph,a,b,options)` | Require reviewed heads, explicit choices and operation ID; build actual validated resulting content and decision record |
| `reconcile.mjs: compareLibraries(base,next)` | Classify unchanged/add/rename/phase edits or ordering/deletion/restoration/missing tombstone |
| `proposeReconciliation(base,left,right)` | Low-level three-state analysis; no implicit common-ancestor assertion |
| `applyChoices(proposal,decisions,reviewedRestorations)` | Recompute item comparisons; apply explicit choices and recorded fresh copy IDs; no source mutation |
| `allocateChoices(proposal,choices,createId)` | Allocate new independent copy IDs through an injected factory; collision checks and bounded retries |

Use graph-level analysis/building for accepted history, not the lower-level state-only helpers: historical restoration information requires ancestry. The optional restoration-review list is internal analysis context, not proof supplied by a UI or remote file. The graph always derives it itself. Creation/verification functions do not access `fetch`, browser storage, clocks or OAuth. The default copy-ID factory uses browser `crypto.randomUUID`; tests inject deterministic factories. Root and ordinary change operation IDs are supplied by the caller.

`buildGraph` accepts at most 1,000 input observations, clones input before asynchronous hashing and returns an internally retained, validated graph. Repeated identical logical snapshots are deduplicated. A duplicate snapshot ID with contradictory content, duplicate operation ID with another snapshot hash, mixed library IDs, cycle, invalid hash or unsupported structure throws. `complete:false` or a missing ancestor returns a blocked history with retained validated sources. Missing history is never a tombstone.

Two or more heads indicate divergence; multiple roots can be retained for inspection but cannot be automatically reconciled without common ancestry. Multiple incomparable nearest common ancestors produce `AMBIGUOUS_BASE`; recursive/virtual-base merging is not implemented. Callers cannot mark the actual remote service globally complete by invoking this pure function: `complete:true` is a transport observation claim that C must justify.

## Semantic reconciliation and deletion decisions

Against one validated, unique common base, each stable Rundown ID is `live`, `deleted` or previously unknown/absent. Names never establish identity. A known item's unexplained absence blocks application; it is not accepted as a delete.

| Base-relative observations | Result |
| --- | --- |
| Both unchanged | Preserve the definition |
| Only one side edited/renamed/reordered phases | Propose that complete definition |
| Independently added distinct IDs, even same names | Propose both |
| Both sides have identical resulting content | Propose the identical result; no competing field choice |
| Both edited same ID differently, even different fields | Explicit conflict; never automatically combine fields |
| Delete versus unchanged | Propose explicit tombstone |
| Same deletion observed twice | Preserve one logical tombstone |
| Different Rundowns deleted independently | Propose both tombstones |
| Delete versus rename/phase edit/offline edit | Explicit delete-versus-edit conflict |
| Explicit restore versus a different deleted/live branch | Explicit restoration review |
| Delete then restore to original base content versus parallel deletion | Still explicit restoration review; history is not erased by content equality |
| Tombstone disappears without explicit restoration | Invalid transition |
| No common base, partial history or ambiguous bases | Block; preserve sources |

Each two-parent graph node is re-analyzed from its actual parents and base. The engine reapplies its decisions and compares the **entire** resulting library, tombstone set and restoration events to the purported merged node. Listing parent hashes cannot validate a discarded or incorrectly combined library. A late third head remains outside that decision. Decision-record consistency is checked; the engine cannot prove that a human genuinely reviewed it. Stage D must bind actual user approval to the exact reviewed heads.

Choice behavior:

- `left`/`right` selects that full version or its explicit tombstone; no field-level merge.
- `both`, with two live versions, preserves the left version's identity and copies the right with fresh Rundown and phase IDs.
- `both`, for delete versus live, preserves the original ID's tombstone and creates an independent fresh-ID copy of the live content. This avoids pretending the deleted identity was silently restored. This experimental behavior is not approved production wording or policy.
- Fresh IDs must not collide with any live/tombstoned Rundown or phase IDs in the reviewed states, or with other generated IDs. The complete result is revalidated.
- Manual DATA-001 import continues to create independent new IDs; synchronization ordinary updates retain IDs. Production import/export is untouched.

Template array order is preserved by hashing. In the minimal merge candidate, surviving base definitions retain base order; newly introduced definitions append in stable-ID order, then explicit independent copies append in copy-ID order. Reordering the base library's existing entries currently blocks with `LIBRARY_ORDER_POLICY_PENDING`. Phase ordering is fully compared as content; concurrent phase/title/mode edits conflict at whole-Rundown granularity.

## Tests and observations

```powershell
node --test tools/sync-core/core.test.mjs
node --test tools/sync-core/core.test.mjs tests/timer.test.mjs tests/templates.test.mjs tests/session.test.mjs tests/time-visuals.test.mjs tests/virtual-clock.test.mjs tests/portability.test.mjs
```

Actual local results: **24/24 new core tests** and **73/73 existing unit tests**, **97/97 total**, passing. Syntax checks pass. No Google or IndexedDB test was executed by this increment. No full browser regression was rerun because production/runtime files are unchanged; native Web Crypto browser execution, Safari/iOS and cross-language canonicalization are not independently validated here.

Coverage includes insertion-order equality; pinned identity/UTF-8 vectors; meaningful phase order; distinct Unicode compositions; number rejection; malformed/sparse/accessor/cyclic data; duplicate wire keys; repeated snapshots and operations; invalid versions/durations; linear and multi-parent ancestry; incomplete discovery; missing ancestors; multiple roots; hash mismatches; contradictory IDs; live/tombstone exclusion; explicit restoration; independent additions/edits/deletions; same-name distinct identities; same-ID conflicts; keep-both identity isolation; forged merge contents; extra decisions; ambiguous criss-cross bases; and JavaScript-property-like IDs without prototype pollution.

The six-node owner experiment is reproduced as a **synthetic topology fixture**, not a new Google observation: root -> recovered/lost-ack successor -> A and B branches -> actual semantically computed M -> late C from the old parent. The fixture asserts 4/2, 5/1 and 6/2 node/head counts. Unlike the old synthetic M marker, this M's contents are recomputed from the explicit decision and validated. Both branch definitions remain available in their original immutable snapshots.

## Unresolved policy and integration requirements

1. This candidate schema adds explicit restoration events and decision manifests to the earlier proposed envelope. It is not a production format approval. Review limits, order policy, copy/delete wording and restoration confirmation before adoption.
2. Only binary reconciliation with a unique common base is supported. More than two parents, criss-cross virtual bases and initial reconciliation of unrelated roots need separate product/architecture decisions; they fail closed now.
3. No pruning, compacted histories, deletion expiry or restoration retention policy exists. Original snapshots and tombstones remain necessary for an old offline device; deleting history would invalidate the current completeness assumptions.
4. The engine guarantees consistent proposals over supplied validated history, not preservation against external Drive deletion, malicious authorized writers, lost browser storage, account loss or fabricated human-review claims. Hashes are integrity checks, not signatures or encryption.
5. Stage C must pass exact canonical bytes from the durable Stage A ticket, bind the library/account/operation/file identity, keep the original operation across retries and verify complete readback. Drive file IDs stay outside the hashed envelope.
6. C must validate purpose/version, fully paginate, handle duplicates and incomplete observations, retain previously known nodes and never convert a missing file into deletion. It must not report global synchronization after one non-atomic listing.
7. C must block conflicting operation IDs, unsupported prior PoC formats, malformed/missing history and changed accounts. Stage A's prototype is not production persistence and cannot be silently integrated by importing this module.
8. Bind later decisions to the exact parent IDs and base shown to the user; if another head arrives, keep it unresolved. Do not accept remote multi-parent content without graph semantic verification.
9. Keep OAuth security, browser/PWA testing, quota/cost, migration and INFO-001 publication gates separate. No new provider request or setting is part of B.

Recommended next increment, only after owner review: a narrowly scoped **SYNC-002C test adapter** using synthetic data and the approved account, durable identity/retry and validated discovery; no production Editor or migration. Recommended model/effort: **GPT-6.1 Sol / Medium**, with additional review attention to transport completeness, account binding and exact-byte round trips. No model switch was performed by this task.

## File and Git report

New files for this increment only:

- `tools/sync-core/canonical.mjs`
- `tools/sync-core/reconcile.mjs`
- `tools/sync-core/graph.mjs`
- `tools/sync-core/core.test.mjs`
- `docs/SYNC-002B_SNAPSHOT_CORE.md`

All previously existing files were hash-captured before implementation for a final preservation check. No files were staged. HEAD/branch are unchanged. The final status includes pre-existing pending work and is not a proposal to commit it together:

```text
## docs/close-data-001
 M docs/backlog.md
?? docs/INFO-001_PUBLIC_PAGES_BRIEF.md
?? docs/README_HANDOFF.md
?? docs/SYNC-001_IMMUTABLE_SNAPSHOT_POC.md
?? docs/SYNC-001_ISOLATED_POC.md
?? docs/SYNC-001_POC_DECISION.md
?? docs/SYNC-002A_AGENT_PROMPT.md
?? docs/SYNC-002A_LOCAL_STORAGE_EXPERIMENT.md
?? docs/SYNC-002B_SNAPSHOT_CORE.md
?? docs/SYNC-002_IMPLEMENTATION_PLAN.md
?? docs/SYNC-002_LOCAL_INTEGRITY_CONTRACT.md
?? tools/
```
