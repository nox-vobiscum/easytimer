# Package 01 handover and remaining roadmap

## Verified state

The verified staging application source is
`ebb0039ddaa096ab968554d62fcedfc6a499d7d6`, PWA v86. Later
documentation-only commits advance `develop` without changing that source.
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

## Original IST/SOLL findings

The independent review of `develop` at `22a28e7` recorded these findings.
They describe that review baseline and must be rechecked against actual source
before a later implementation:

- Native Template/Execution architecture, independent records, lifecycle,
  persistence, recovery, phase fields, drag-and-drop and category selection
  already existed.
- New drafts could contain zero phases, but the central plan validator rejected
  their persistence.
- Successful Save left the Editor. Save-and-remain required safe revision,
  baseline and recovery handling.
- Prepared information and resources updated the draft immediately. The
  approved shared overlay required separate local edit buffers.
- Library tabs, pagination, compact cards, protected example, visibility
  management and selectable layouts were outstanding.
- Responsive Editor, global phase disclosure controls, information previews,
  shared overlay and sticky action bar were outstanding.
- Preserve the existing theme identity, timer semantics, ownership and
  persistence guarantees. No architectural rewrite was justified.

## Original proposed implementation roadmap

The Product Owner supplied this original planning reference from the independent
IST/SOLL review of `develop` at `22a28e7`. Estimates and risk ratings are
the original assessments, not verified delivery forecasts or an irrevocably
approved sequence. Each implementation requires its own scoped approval.

| Package | Scope | Estimated effort | Risk |
| --- | --- | --- | --- |
| 01 | Terminology and Home usability | Small–medium | Low |
| 02 | Planning and start validation: persist incomplete plans while enforcing strict start eligibility | Medium | High |
| 03 | Save and draft lifecycle: Save, Save & Back, discard, revisions and recovery | Medium | High |
| 04 | Library foundation: tabs, empty states, lifecycle groups, sorting and pagination | Medium | Medium |
| 05 | Library cards and views: compact cards, context menus and three selectable layouts | Medium | Medium |
| 06 | Protected example and visibility: sample retrospective, hide/show and persistent visibility | Medium | Medium |
| 07 | Event Editor foundation: name, settings, information sections, agenda and global action bar | Medium | Medium |
| 08 | Phase UX: C2 layout, category and position controls, detail presentation and global disclosure actions | Medium | Medium |
| 09 | Information overlay: Markdown, resources, read/edit modes and local Apply/Cancel | Larger | Medium–high |
| 10 | Remaining lifecycle actions and Facilitator Panel under existing safety and approval boundaries | Separate assessment | High |
| 11 | Responsive finishing work: two-column Editor, responsive overlay, theme consistency and real-device acceptance | Medium | Medium |

Packages 02, 03, 06, 09 and 10 require smaller technical slices before
implementation. Package 01 was subsequently implemented and deployed to
staging as v85; the fixed Home claim followed in v86. Its browser regression
gate remains open.

Resume the paused browser stabilization described above before further
implementation unless the Product Owner explicitly authorizes another sequence.
Responsive finishing work remains scheduled after the Facilitator Panel, within
EDITOR-001 before closure. NANO-001 remains the next separate feature after
EDITOR-001 is completed, accepted and released to production. The
[mobile decision record](EDITOR-001_UX-002_MOBILE_DESIGN_2026-11-24.md)
contains the accepted responsive design details. The Stopwatch remains a
disabled Home tile and separate future work.
