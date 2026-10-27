# REL-001B — Durable Session Timer Recovery

Locally functionally accepted by the product owner in Firefox. Real iOS/PWA and
screen-reader acceptance remain outstanding. Production remains NO-GO.
Base: locally accepted REL-001A commit `55039877e7aad1a6d1b3d0355d43e9a9f6b86538`.
Branch: `feature/rel-001b-session-recovery`. No commit or publication is authorized.

## Shared record and ownership

REL-001B extends `recovery.mjs` and the existing `easyTimerRuntime.v1.*` records,
tab association and exclusive Web Locks. There is no second persistence system,
new database, account binding or synchronization protocol. Existing version-1
Quick records remain supported. Session records use the same envelope with
`mode: session`, the complete `run`, Session `clock` and retained Quick configuration
(`quickDurationMs`). The original run-start timestamp identifies the workshop;
later READY phases do not reset it. No frozen countdown is shown as a live candidate.
Session candidates identify the mode, snapshot workshop name and original total
duration as well as the shared start/save and advisory ownership information.

The Run contains stable `runId`, source-template identity, original validated
name/phases/transition mode, phase index, stage and settled per-phase overtime.
Restoration never loads the current saved Rundown or generates a new run ID.
Saved templates, import/export data and active runtime remain separate.

Validation checks the exact supported fields and phase/statistics associations,
original phase durations, Quick/Session limits, deadline consistency, allowed
terminal states and whether the saved Session was fully reconciled at save time.
Unsupported/corrupt records do not advance or become partial Runs.

One JSON write commits clock and Run metadata together. Semantic state changes
persist immediately: preparation, Start/Pause/Resume, manual Next/Complete,
automatic phase catch-up, final overtime pause/stop, Stop Workshop and replacement.
Ticks with an unchanged deadline/status/Run do not write. The coordinator's immutable
metadata reference avoids repeatedly serializing unchanged phase definitions.
Storage failure remains visible in Session mode; no in-memory success is claimed
as durable recovery. The existing best-effort invalidation limitations still apply.

## Reconstruction and navigation

The existing `transitionSession(..., TICK, now)` performs reconstruction. Manual
sessions stay in their current phase and accumulate phase overtime. Automatic
sessions reconcile every elapsed phase from scheduled boundaries and enter final
overtime at the scheduled workshop deadline. No missed signals are replayed.
Pause, paused phase/final overtime and terminally stopped final overtime stay frozen.
Workshop remaining time is derived from the restored Run and its single clock.

Restoring a Session installs its runtime mode before first rendering and before
any default Quick state can overwrite storage. It is immediately accessible in
the existing Session Timer. This is not general navigation persistence: the Editor,
picker, menu, native fullscreen/fallback and Clock-only view are not restored.
The existing unsaved-draft unload warning remains unchanged; drafts are not saved.

Missing context association uses the shared explicit chooser. Exclusive ownership,
fresh validation and unchanged-current-timer checks are repeated at takeover.
A live owner is never displaced. Recovering a Session preserves its run identity,
clock and original snapshot, then displays its existing controls. Terminal final
overtime focuses Stop Workshop because Start is deliberately hidden.

Confirmed mode changes invalidate the previous record before opening a picker or
new Quick timer. Cancelled switches retain the Run and its deadline. Loading a
replacement writes the new independent Run under the same owned context instead
of retaining a resurrectable old Run. Stop Workshop preserves the original Run
snapshot/identity but resets all phases/statistics to phase 1 READY, not running.
Opening/closing the Editor does not discard the active clock or recovery record.

## Lifecycle limits preserved

The current Session Coordinator exposes no Restart Phase, Restart Workshop or
Session duration-adjustment actions. Those remain unsupported; this increment
does not introduce them or alter Quick Restart/adjustment semantics. Stored
Rundown edits do not change the launched snapshot. Future live editing and restart
features must define their own accepted transitions before extending recovery.

REL-001C's four-hour final-overtime warning/dialog, UX-014 routing/view persistence,
draft recovery, signals, runtime cloud synchronization and production rollout are
excluded. Browser/PWA data eviction, unavailable Web Locks/storage and undetectable
forward wall-clock changes retain REL-001A's documented limitations. Inactive
records are not automatically deleted. If both writes and deletion fail, an older
checkpoint can remain; the application warns rather than promising durability.

## Verification and owner acceptance

Commands:

```sh
node --test tests/*.test.mjs tools/app-sync/gate.test.mjs
node tests/browser-check.mjs
node tools/app-sync/browser-check.mjs
git diff --check
```

Deterministic tests cover READY/RUNNING/PAUSED Manual/Automatic snapshots,
multi-boundary catch-up and exact final deadlines, manual phase settlement,
early manual completion, frozen phase/final overtime, terminal Stop, Run replacement,
storage corruption/quota failures, live-owner conflicts, original snapshot
independence, original start identity, no periodic writes and 100/1000-hour limits.
Quick Recovery and DATA-001 remain in the regression suite.

The disposable browser scenario covers actual user controls across reloads,
changed saved definitions, progressed READY, phase/final/paused/terminal overtime,
automatic catch-up, confirm/cancel mode switching, DE/EN, Light/Dark and 320px.
A second real window owns a Session; recovery is refused, then succeeds after
closing that window with the same Run ID and deadline. The full PWA test now
verifies offline Session reload rather than expecting a fresh Quick Timer.
No owner browser storage or real Google APIs are accessed by the tests.

Actual implementation results: 108/108 Node/gate tests passed (104 application
tests plus 4 development-gate checks). The complete application/browser suite,
including Quick recovery, the new Session recovery scenarios, DATA-001, responsive
views and offline PWA Session reload, passed. The existing development-SYNC
browser regression also passed using isolated IndexedDB and mocked transport.
JavaScript syntax, PWA v46 asset/import consistency and `git diff --check` passed.
The unrelated backlog remains byte-for-byte unchanged; nothing is staged.

Advanced regression/retest checklist (not every item below was manually owner-tested):

1. Load a manual Rundown. Reload while READY, then Start and reload while running.
   Pause and reload; confirm a frozen clock. Saved definitions must stay unchanged.
2. Let a manual phase expire, reload, pause its overtime and reload. Next must
   retain settled overtime and prepare the next phase at full duration READY.
3. Complete early on the final phase. Reload while final overtime runs, pauses
   and is terminally stopped. Stop Workshop must reload as phase 1 READY.
4. Start an automatic multi-phase Rundown; interrupt execution long enough to
   cross phases. Reload and verify the reached phase/final overtime. Repeat paused.
5. Cancel a switch to Quick, then reload: the original Run survives. Confirm the
   switch or load a replacement: the discarded Run must not return after reload.
6. Use a separate tab without an association. Inspect the Session candidate,
   attempt locked recovery, then close the owner tab and recover the same Run.
7. Check offline cached reload and actual iOS Safari/installed-PWA lifecycle,
   VoiceOver/screen-reader navigation and keyboard focus. These physical-device
   and assistive-technology acceptance checks remain open.

## Owner acceptance blocker: local development entry

The owner reported a valid manual 5/10/5-minute draft being blocked by the
load-before-save guard. Read-only HTTP inspection confirmed that the running
`--enable-drive` server served the normal v46 application entry instead of the
development entry. That process had retained a literal v45 replacement while
the HTML on disk advanced to v46. This is a development-server version coupling,
not a demonstrated Session recovery or IndexedDB initialization defect.

With the development storage activation marker present, the normal localStorage
adapter deliberately refuses both loading and saving. A synthetic reproduction
confirmed the reported guard message and zero writes, including preservation of
existing legacy content. The empty list rendered after a failed load is not
evidence that stored Rundowns are absent. The owner's actual activation marker,
IndexedDB contents and storage permissions were not inspected or modified.

The server now rewrites exactly one versioned application entry independently of
its version number, and returns HTTP 503 if the entry is missing or ambiguous.
Storage guards, production application files, DATA-001 and synchronization
semantics remain unchanged by this correction. PWA v46 remains unchanged.

The earlier fresh-server browser tests did not model HTML changing while the
server process remained alive. New coverage changes the served HTML version
without restarting the test server. The real-IndexedDB browser scenario then
reloads a running Session and saves a valid manual 5/10/5-minute Rundown while
preserving existing definitions, legacy storage and the recovered Run/deadline,
without Google requests. All 110 Node/gate tests and the development application
browser regression passed; Google transport was mocked. The full production
browser suite was not repeated for this server-only correction.

Firefox was unavailable for automated reproduction. The owner subsequently
confirmed in Firefox that existing Rundowns loaded and a new Rundown could be
saved after the server correction. No destructive storage repair was required.
Production remains NO-GO.

## Local owner acceptance and checkpoint review

The product owner passed local Firefox acceptance: READY reload without automatic
Start, RUNNING with elapsed time, frozen PAUSED, retained manual phase progression
and final-phase behavior, completion with continued final overtime, terminally
stopped overtime remaining stopped, automatic progression/reload in Phase 2 and
automatic completion after Phase 3. The owner also confirmed Session identification
among Quick recovery candidates, refusal while another tab owned the Run, successful
takeover after that tab closed, and continued final overtime after recovery.

These are owner-observed results, separate from automated coverage of advanced
recovery cases. The resolved development-server loading/saving blocker is included
in this increment. Final checkpoint verification repeated all 110 Node/gate tests
successfully; the previously passing complete application/PWA and development-SYNC
browser suites were not repeated because only acceptance documentation changed.
PWA v46 references, syntax and whitespace are checked again for the checkpoint.
Real-device iOS Safari/installed-PWA and screen-reader acceptance remain open.
This is local development acceptance only; production remains NO-GO.
