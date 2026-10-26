# SYNC-002D1 — KISS Protocol Feasibility Result

**Verdict: useful partial feasibility, not a validated replacement protocol. Production sync/automatic cleanup remain NO-GO.** The current-library subset works in memory. Lower overall implementation complexity and safe progress through independent concurrent compaction are **not established**. A deliberately blocked test is a passing safety test, not a completed synchronization workflow.

## Scope and size

New files only:

- `tools/sync-kiss-model/model.mjs`: **146 lines / 10,544 bytes**.
- `tools/sync-kiss-model/model.test.mjs`: **185 lines / 13,315 bytes**.
- This report.

The Node-only model uses a synthetic `Map` as its file store, immutable command tickets, current-state checkpoints, exact operation/hash receipts and closed resolution-base tokens. It reuses B's pure canonical JSON/library validation and Node's built-in SHA-256. No packages, Google API, IndexedDB, UI, timers, actual Rundowns or remote deletion. Map removals simulate cleanup only. Existing A/B/C implementations and D0 are unchanged.

## Actual tests

```powershell
node --test tools/sync-kiss-model/model.test.mjs
node --test tools/sync-kiss-model/model.test.mjs tools/sync-core/core.test.mjs
```

**10/10 new tests pass; 24/24 existing B core tests pass; combined 34/34.** The new scenarios include deterministic permutations: six ordinary dependency delivery orders, 24 orders for each A/B/both choice, 24 contradictory-decision orders and both copy-delivery orders. These are enumerated small examples, not exhaustive distributed-protocol verification.

| D0 section 7 scenario | Observed result |
| --- | --- |
| 1. Ordinary / independent changes; explicit A/B/both | PASS for tested orders. Independent Rundowns survive; no default winner. Both creates fresh Rundown/phase IDs and a numbered copy. Resolution tickets carry reviewed values, so an unpublished candidate is not just references to potentially removed source files. |
| 2. Closed conflict, compaction, weeks-late edit | PASS. Today's original stays intact, one numbered independent copy appears, and repeated original/late operations do not reopen conflict or create more copies. “Weeks” is causal staleness, not an actual delay or wall-clock rule. |
| 3. Lost acknowledgement and removed payload | PASS for the synthetic loss. After compaction removes the change body, exact receipt recovery recognizes the same operation/hash. Unknown work remains pending; different bytes under the same operation ID are rejected. No actual durability or network failure is tested. |
| 4. Concurrent checkpoints / late upload | Equivalent checkpoints can be compacted; an uncovered late operation survives. **Incomparable checkpoints block** with all current values retained; automatic current-state convergence is not implemented. |
| 5. Contradictory resolutions | Explicitly BLOCKED in every tested order, including a late decision after source compaction. Both self-contained decisions/results remain available. No timestamp winner or old-choice reopening. |
| 6. Copy-name collisions | PASS. Generated `(2)`/`(3)` suffixes avoid an existing explicit `(1)` name, converge across delivery orders and do not mutate upload bytes. Case normalization, 120-code-unit bounds, surrogate-safe truncation and stable retries are checked. |

Additional fail-closed checks cover missing/corrupt checkpoints, unknown bases and cleanup refusal. A 40-update experiment leaves **one checkpoint payload and 40 exact receipts**, with only the current Rundown body. This demonstrates payload compaction, not bounded metadata: receipts still grow with accepted operations.

## Concrete stopping point

Two devices independently checkpoint changes A and B from the same original state. Each can have compacted its own covered inputs before discovering the other checkpoint. The model reproduces that resulting fake file map: checkpoint A retains value A and checkpoint B retains value B, but neither receipt set covers the other.

Choosing one loses data; unioning receipts alone does not construct correct combined current contents or retirement semantics. The model returns `INCOMPARABLE_CHECKPOINTS`, refuses cleanup and retains both payloads. The experiment intentionally stops here instead of adding checkpoint-join logic, historical reconstruction, replica clocks or a generalized merge framework. This is **not an impossibility proof**: a further bounded join might work, but it has not been designed/proven by this increment.

Unknown bases outside an explicitly closed resolution also block rather than attempting historical reconstruction or automatic rescue. The tested stale-copy rule therefore covers the approved closed-conflict example, not every possible old-device state. Unrelated current-library ordering policies and equal-content conflict optimization are not modeled.

## Complexity versus existing experiments

B's canonical/graph/reconciliation implementation is 347 lines; C's store/transport/coordinator adds 247 lines. The new 146-line model is smaller, but reuses B validation and intentionally omits storage durability, authentication, browser lifecycle, network/listing uncertainty and the unresolved checkpoint join. Line counts include compact formatting and are **not** evidence that a complete replacement is simpler.

The model supports the product simplification: no readable historical library collection is needed for the demonstrated linear/settled cases. It does **not** eliminate synchronization metadata or prove safe global cleanup. Receipts, retirement rules, independent checkpoint combination and recovery after payload removal are new responsibilities compared with C's simpler “retain all files and verify the exact upload” rule.

## Remaining limits and recommendation

- The file map is fully inspectable and synchronous. Selected visible IDs simulate different checkpoint inputs; real pagination, stale listings, interrupted deletion and concurrently arriving network responses are not proven safe.
- Checkpoints are generated by trusted model code. Hash/root checks do not prove arbitrary remote receipts truthful or replace a production format validator.
- In-memory immutable tickets demonstrate identity reuse, not durable IndexedDB guarantees. Existing C durability evidence is preserved but is not automatically inherited by this new format.
- No account isolation, storage migration, real quota tests, iOS/PWA or production integration is exercised. Contradictory resolutions and incomparable checkpoints remain retained blocked work, potentially preventing storage reduction indefinitely.

**Recommendation:** do not expand this experiment into a general synchronization framework or begin cleanup/integration. If lightweight/free operation is the overriding constraint, the simpler product alternative is local storage plus existing reviewed DATA-001 portability; optional explicit Drive backup/retrieval could be evaluated separately without claiming one automatically reconciled cross-device library or automatic cleanup. That is a narrower product, not equivalent synchronization, and needs owner approval.

If automatic shared-library synchronization remains essential, a separately approved, narrowly scoped checkpoint-join proof is the next architectural gate. It must preserve independent current values and closed-resolution receipts across the counterexample before any browser/Drive work. This report does not authorize that additional work or claim it will be small.

## Git and preservation

Branch remains `feature/sync-002c-isolated-integration`; HEAD remains `0f09162c9be994064ef53ee6d1bd0e2ee9f36ff5`. The pre-existing modified/untracked files were hash-captured before this increment for a final preservation check. Only the three new files above belong to D1. No commit, push, merge, tag or deployment. Browser/application regression suites are not rerun: this task forbids IndexedDB/Google integration and changes no runtime files; the relevant pure B regression suite was run instead.
