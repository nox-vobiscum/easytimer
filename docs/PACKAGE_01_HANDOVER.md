# Package 01 handover and remaining roadmap

## Verified state

At the documentation checkpoint, `develop` and staging application source
are at `ebb0039ddaa096ab968554d62fcedfc6a499d7d6`, PWA v86.
The [staging workflow](https://github.com/nox-vobiscum/easytimer/actions/runs/45396888619)
completed successfully. The staging service worker was checked again at this
checkpoint. The owner authorized intermediate staging for manual UX and device
evaluation with the browser regression gate open. Production `main` remains
at `81d86305a6ad84230675290c7d0ad35042d48177`.

Package 01's Event terminology, Home, contributor mapping, documentation and
scope received positive independent static review. This is not final product
acceptance. The v86 Home claim is the fixed English “Timing is everything.”
and “Apparently.” in both locales. The redundant line below the four mode
tiles was removed. This retains a concise, recognizable welcome while the
individual mode descriptions provide task guidance. The owner reported a
positive real iPhone 15 Safari observation in German and Dark mode: all four
modes were initially accessible without scrolling. Preserve this quality while
maintaining readable text and touch targets. This is one device observation,
not full cross-device acceptance.

Deferred visual polish: reduce the size difference between the claim lines,
tighten their line spacing and balance the vertical spacing. A randomized
humorous suffix is an optional, unprioritized future Easter egg, without
controls, notifications or animation. Neither item is implementation approval.

## Verification and paused browser work

The previous verification passed 577 tracked Node tests, packaging with 41
files at v85, and the offline artifact suite. The v86 welcome change was
staged after the owner requested no test execution. The focused browser
cutover run passed before the later welcome change. Static review accepted the
Package 01 scope. Browser regression stabilization remains paused and the
complete browser gate remains open.

The approved test-only corrections isolate simulated Workspace reloads in a
disposable document with explicitly handled expected unload confirmations,
and test the exact Quick Timer departure confirmation after recovery. Verify
both cancellation, preserving the recovered running Quick Timer and
authoritative Event record, and acceptance, opening the Event Picker. Preserve
dirty-state, unresolved-mutation, recovery, timing, identity, persistence,
ownership and lifecycle assertions. Do not weaken the production unload guard,
increase timeouts, suppress assertions, skip scenarios or use blanket dialog
handlers. Keep cleanup failures subordinate to the initial failure.

After those corrections, the Runtime suite passed the Quick departure checks
but encountered an unanswered beforeunload confirmation during a later reload
after an unresolved lifecycle conflict. The aggregate passed the Workspace,
Quick Recovery, subtraction, menu and public-cutover checkpoints. One run saw
READY instead of RUNNING after an offline Start/reload; a repeat passed that
check and reached the later Runtime blocker. Whether the intermittent result
is a test synchronization issue or product defect remains unproven. Investigate
both without assuming cause. Obtain separate approval for any further
substantive test-contract or product changes.

On explicit resumption, run the isolated Runtime suite, complete aggregate
browser regression, all tracked Node test files, packaging, offline artifact
verification and `git diff --check`. Verify product files against the
reviewed package, account for the subsequent approved v86 Home change, and
report exact commands, exit codes, counts and remaining blockers. Update review
evidence. No browser run on v84 was performed; its comparison was static.
The local review ZIPs contain detailed logs and are untracked artifacts.

## IST/SOLL and sequencing

| Area | Current evidence | Accepted target or next gate |
| --- | --- | --- |
| Terminology and Home | Package 01 implemented; static review positive; v86 staging and one positive iPhone observation | Complete browser gate and owner acceptance; no new feature implied |
| Native library and editor | One Schema-2 Workspace and lifecycle library exist | Mobile library cards, example/empty state and action presentation in the [mobile decision record](EDITOR-001_UX-002_MOBILE_DESIGN_2026-11-24.md) remain subject to implementation audit and separate GO |
| Facilitator Panel | Not in the public slice | Separate approved implementation work remains |
| Responsive library/editor and information overlay (B2) | Design accepted, implementation not claimed | Scheduled after the current UX-001 block and Facilitator Panel, before EDITOR-001 closure; see the mobile decision record §§10–14 |
| NANO-001 | Concept only | Next separate feature after EDITOR-001 completion, acceptance and production release, ahead of Stopwatch |
| Stopwatch | Disabled Home tile | Separate future design and implementation |

This table records the sequence supported by repository evidence. The complete
prior conversation-derived IST/SOLL implementation roadmap, including any
numbered packages or slice ordering beyond these documented dependencies, was
not found in the repository or the available conversation. The owner must
supply that material before it can be consolidated without inventing it.
No Package 02 implementation is authorized by this handover.
