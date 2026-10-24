# ST-002B: Automatic Session Timer

**Status:** Release candidate accepted by the owner. Local release commit, fast-forward integration into `main` and annotated `release/st-002b` are authorized. Push and deployment require separate approval.
**Baseline:** Production `7f6f9c057dc1350a53bf6845a91069dbee60794a` (ST-002A, UX-009/UX-010 and centering hotfix), PWA v27.
**Rollback:** Annotated `checkpoint/before-st-002b`, unchanged at the baseline.
**Branch:** `feature/st-002b-automatic-session-timer`.
**Local app shell:** v28 with matching HTML, imports and service-worker cache entries.

## State ownership and reconciliation

`app.js` continues to own exactly one clock. `session.mjs` snapshots the validated template's `transitionMode`, phase IDs, titles and durations into in-memory Run metadata. The stored schema and template persistence are unchanged. Preparing either mode leaves phase 1 READY until explicit Start.

Before interpreting any Session action, the coordinator ticks the shared engine at the supplied timestamp. An automatic expired phase then advances through all elapsed phase boundaries. Each following phase starts at the preceding scheduled deadline, never at the delayed callback time. Final completion starts workshop overtime at the scheduled last-phase deadline. Only the reconciled result is rendered. No extra interval, competing clock, persisted deadline, event queue or signal replay is introduced; `timer.mjs` is unchanged.

For phases lasting 1, 2 and 1 minute, started at zero:

| Reconciliation timestamp | Actual state |
| --- | --- |
| 59,999 ms | Phase 1 RUNNING, 1 ms remaining |
| 60,000 ms | Phase 2 RUNNING, full 02:00 |
| 150,000 ms | Phase 2 RUNNING, 00:30; workshop 01:30 |
| 200,000 ms | Phase 3 RUNNING, 00:40 |
| 240,000 ms | COMPLETED, final overtime +00:00 |
| 250,000 ms | COMPLETED, final overtime +00:10 |

One delayed jump produces the same state as timely ticks; repeated ticks at the same timestamp are idempotent. Automatic phase-overrun records are zero: callback latency is not phase overtime. Records are copied once per catch-up and populated safely by stable ID, avoiding quadratic copying across large valid workshops. The maximum valid 60,000 one-minute phases is covered by a deterministic test.

## Actions and existing behavior

- PRIMARY is interpreted after catch-up. PAUSE freezes the actual reached phase, or final overtime if completion has already occurred. At an exact phase boundary it pauses the new phase; at the workshop boundary it pauses final overtime at zero.
- READY, paused and terminally stopped clocks do not advance. Resume excludes paused time and shifts subsequent deadlines through the same scheduled-boundary chain.
- Stop Workshop reconciles before showing its existing confirmation and again when processing the result. Confirmation dialogs do not pause time. Accepted Stop resets the automatic snapshot to phase 1 READY with cleared overrun records; cancelled Stop/mode departure reconciles elapsed dialog time.
- Final overtime retains Pause/Resume and terminal Stop overtime. It begins at the scheduled completion instant, including after multi-phase sleep/background gaps.
- Automatic NEXT/COMPLETE actions do not skip or complete phases early. Manual Next/Complete retain ST-002A semantics unchanged.
- Stored template edits cannot change an active Run's transition mode or phase definitions. Planner remains an independent workspace; automatic catch-up neither rewrites its draft nor steals focus.
- Quick Timer is unchanged. Confirmed mode departure leaves no hidden running Session and never starts the destination automatically.
- UX-008 thresholds, UX-009 positive red overtime, dynamic titles, current-phase progress and workshop remaining derive from the reconciled current phase. Clock-only remains active and focused through automatic transitions and completion. No intermediate overtime frames or skipped-phase UI announcements are rendered.

## Informational upcoming phase

The owner explicitly approved a non-interactive automatic preview: plain text, no arrow, button border, action role or keyboard focus target. Long upcoming titles truncate visually while retaining complete text. On the last phase, localized copy says `Workshop ends automatically` / `Workshop endet automatisch`. After completion the preview is hidden. The existing Manual Next/Complete button remains unchanged. The picker enables both validated template modes and labels each as Manual/Automatic in DE/EN.

## Tests and visual inspection

```sh
node --test tests/timer.test.mjs tests/templates.test.mjs tests/session.test.mjs tests/time-visuals.test.mjs tests/virtual-clock.test.mjs
node tests/browser-check.mjs
node tests/browser-check.mjs --scenario auto-transition,auto-multiple-transitions,auto-completion --theme both
node tests/browser-check.mjs --scenario auto-workshop-overtime --theme dark --advance 2h
```

DEV-001 now offers 31 scenarios, including 11 automatic cases; see [the command reference](DEV-001_TIME_TRAVEL.md). Test output and screenshots remain in unique temporary directories outside the repository. No runtime dependencies are added.

Verification on 2026-10-24 passed **63/63 unit tests**, the **complete Quick/Planner/manual/automatic/visual/Clock-only/PWA browser regression**, and all **62 Light/Dark virtual-time captures**. Targeted automatic browser checks also passed after adding coverage for an open Planner draft. The focused review captures desktop 1280x800, narrow mobile 320x568 and smartphone landscape 844x390 in Light/Dark, including READY, endgame, transition, completion and Clock-only across phases/final overtime. The test prints a temporary HTML gallery. Actual DOM observations verify no intermediate phase/overtime frames; atomic timestamp-and-click cases verify catch-up before PRIMARY and confirmation handlers.

## Local release preparation

The owner accepted the release candidate and authorized one local release commit on the preserved feature branch, fast-forward integration into local `main` and annotated `release/st-002b`. A fresh remote fetch confirmed that local `main` and `origin/main` still matched the approved baseline. Final preparation passed all 63 unit tests, the complete browser regression (including the open Planner draft case) and all 62 Light/Dark virtual-time captures. Full tracked/untracked inventory, syntax, whitespace and matching v28 references were checked. Screenshots/profiles remain outside the repository; the timer engine, template storage and FTP workflow are unchanged. Publishing branches or tags, deployment and infrastructure changes remain explicitly excluded. The release commit SHA and final ref state are reported outside this document to avoid a self-referencing commit hash.

## Remaining acceptance limits

Sleep/wake catch-up requires the original page context to survive. A full reload, browser restart or OS eviction still starts a fresh Quick Timer. Cross-reload recovery, four-hour recovery notifications/dialogs, rewind, active-session Manual/Automatic switching, live editing, statistics UI, signals and additional restart controls remain deferred. Existing `Date.now()` sensitivity to manual system-clock changes is unchanged. No missed signals are replayed.

Native iOS Safari/PWA sleep/wake, process eviction, browser chrome/safe areas, orientation and VoiceOver acceptance remain manual checks; Chromium emulation does not establish them. Production stays v27 until separate release approval. Keep all previous checkpoints and the feature branch; do not publish, modify hosting/DNS or begin another increment without authorization.
