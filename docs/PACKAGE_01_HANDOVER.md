# Package 01 handover and remaining roadmap

## Verified state

The verified staging application source is
`ebb0039ddaa096ab968554d62fcedfc6a499d7d6`, PWA v86. Subsequent test and
documentation commits advance `develop` without changing that source.
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

## Browser stabilization and review checkpoint

**Complete.** Independent review passed, and the automated browser regression
gate for Package 01 / PWA v86 is accepted. Final Product Owner acceptance and
production release remain pending.

The reviewed test corrections were verified on `develop` at
`d7b6c32dc29061d45d94d41ed3d752f632e87479`. Verification
passed the isolated Runtime suite, the complete aggregate browser suite
(20 logged checkpoints), and three separate offline first-Start runs in fresh
headless Edge profiles. All 577 Node tests in 37 tracked files passed. The
41-file v86 package and its offline artifact checks passed. Syntax and diff
checks passed. The product files match the staged v86 Git baseline. The
checkpoint closeout preserves the reviewed tests and relies on those results.

- The Runtime test now expects the scoped `beforeunload` confirmation when
  leaving the intentionally unresolved lifecycle conflict. Its conflict,
  reconciliation, ownership, identity and write-count assertions remain.
  During the separate cleanup-failure case, a confirmed exit followed by a
  protected reload displayed only the Event Picker, with Session navigation
  metadata and the same browser history entry. The Event was completed at
  revision 5, its active runtime was cleared, and no recovery prompt was
  visible. The former wait for a timer button title could never succeed in
  this view. The test now waits for the rendered Picker and checks the
  completed record, navigation and absence of a recovered legacy Run.
- The aggregate Back check used a visible Workspace shell as a readiness
  signal. The focused reproduction observed only the Editor, Session still
  marked active, Editor view metadata, and the loading message with no Back
  button. The test waits for the loaded library, checks that Back restores
  only the Picker in the same document and history entry, and checks the
  original five-minute Quick Timer state. The Home navigation check uses
  the same readiness condition.
- Starting an Event prepares a READY Run with an ID before starting any
  countdown. The offline test waits for the selected Template and READY
  runtime, then for the authoritative RUNNING record and its Attempt. It
  verifies exactly one revision advance for first Start, stable Run identity,
  and the same complete store and Running UI after offline reload. The three
  focused runs and the aggregate run passed these assertions.
- The Home browser check verifies both fixed claim lines in DE and EN, the
  smaller regular-weight suffix on a separate line, and the disclosure
  directly after the tiles. Existing target, overflow, keyboard and touch
  checks remain.

The earlier v85 CDP traces identified two distinct harness problems: a
detached Workspace fixture left an active unload listener, and the recovered
Quick Timer departure test left an expected confirmation unanswered. The
approved correction runs the Workspace fixture in a disposable document and
verifies its scoped guarded unload. The Quick departure test checks the exact
confirmation and both answers: cancellation preserves the running Quick
Timer and Event record, and acceptance opens the Event Picker. Cleanup
failures remain subordinate to the original test failure. The v84 comparison
was static. The v86 welcome change originally went to staging under a
separate instruction to skip test execution.

The stabilized tests preserve dirty-state, unresolved-mutation, recovery,
timing, identity, persistence, ownership and lifecycle guarantees. Keep
production guards and existing timeouts. Use scoped expected dialogs and
retain assertions and scenarios. Substantive test contract or product changes
require separate approval. The untracked
`review-package-01-v86-browser-checkpoint.zip` records the exact commands,
exit codes, logs, packaging results and source comparison for this checkpoint.

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
staging as v85; the fixed Home claim followed in v86. The automated browser
gate is accepted. Final Product Owner acceptance and production release are
pending. Further implementation requires separate Product Owner approval.

Responsive finishing work remains scheduled after the Facilitator Panel, within
EDITOR-001 before closure. NANO-001 remains the next separate feature after
EDITOR-001 is completed, accepted and released to production. The
[mobile decision record](EDITOR-001_UX-002_MOBILE_DESIGN_2026-11-24.md)
contains the accepted responsive design details. The Stopwatch remains a
disabled Home tile and separate future work.
