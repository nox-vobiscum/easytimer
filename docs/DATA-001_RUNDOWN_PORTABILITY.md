# DATA-001 — Rundown JSON portability

> **Current context (2026-10-30):** DATA-001 remains a production capability in
> PWA v62. The original v35/v36 release metadata below is retained for
> traceability; the data contract and schemaVersion 1 validation remain current.

**Status:** Complete, locally accepted by the owner and successfully deployed. Release tag: `release/data-001-v35`.
**Baseline:** `fb719f74bd4c9ce01b195803d3b94a792fc60d17`, deployed Rundown entry/footer, PWA v34.
**Checkpoint:** Annotated `checkpoint/before-data-001` at the unchanged baseline.
**Branch:** `feature/data-001-json-portability`.
**Current PWA:** shell/CSS v36 after the footer hotfix; JavaScript modules, including `portability.mjs`, remain v35. DATA-001 originally shipped in shell v35.

## File contract

Single exports and full backups share the existing persistence envelope. No new stored schema or migration is introduced:

```json
{
  "schemaVersion": 1,
  "templates": [
    {
      "id": "example",
      "name": "Example Rundown",
      "transitionMode": "automatic",
      "phases": [
        { "id": "opening", "title": "Opening", "durationSeconds": 600 }
      ]
    }
  ]
}
```

Only Rundown definitions are exported: ID, name, transition mode and ordered phase IDs/titles/integer durations. Deadlines, run IDs, current phase, pause/overtime, statistics, language/theme and other UI state are excluded. Library exports preserve saved IDs and every saved supported definition; current-Session export uses the isolated original Run definition and source template ID even if storage has subsequently changed. Export reads fresh saved data without resetting the Editor's conflict snapshot. Files use readable sanitized `easytimer-*.json` names and native Blob downloads, without network/login. The app requests a download; users must check that their browser saved it.

## Import and review

Import is available only in the Editor library's secondary **Data & Backup / Daten & Sicherung** section. A visible labelled native file input accepts JSON. Ordinary Create remains primary; each saved library row has a quiet 44px download action beside Edit/Delete. Export all as JSON is disabled for an empty library. A discreet browser-local backup warning stays near these actions, not in startup or timer screens.

Files are read locally and limited to **10 MiB of UTF-8 input**, checked before file reading and again in the pure parser. UTF-8 BOM is accepted. Empty/malformed JSON, unsupported versions, wrong shapes, missing/invalid fields, unknown additional properties, duplicate Rundown IDs, duplicate phase IDs within a Rundown, unsupported modes and invalid/excessive durations are rejected before any write. Phase IDs remain scoped to each Rundown on input, as in the canonical schema. Canonical limits remain 1–6,000 whole minutes per phase and 60,000 minutes per Rundown, stored as integer seconds; canonical name trimming/validation is reused. Empty backups are valid JSON exports but contain nothing to import.

The inline review replaces the library overview temporarily; it is not a modal or a wizard. It shows file name, valid count, every name, phase count, planned duration, Manual/Automatic and ID/name collision hints. The bounded list scrolls; imported names/file names use text-only DOM APIs. Similar names include case-insensitive normalized matches and duplicates within the file. No values are executed, merged, replaced, silently repaired or deduplicated. Cancellation changes no stored data. Read errors and oversized files leave the library available; asynchronous reads cannot replace a subsequently opened draft or reopen a closed workspace.

- **Single Rundown:** Explicit confirmation opens a fresh, populated, unsaved Editor draft. Rundown and all phase IDs are regenerated. Existing minute fields, stable-ID editing and validation are reused; the name field receives focus. An imported populated draft is dirty until Save, so Back/mode departure/Cancel retain the existing discard guard even before an edit. Nothing is saved merely by opening it.
- **Multiple Rundowns:** Explicit confirmation regenerates every Rundown/phase ID and appends the complete validated batch with one existing `store.save()` call. Names, modes, durations and phase order remain unchanged. Reimport creates additional copies.
- **Conflict/write failure:** No partial batch is assigned or written. The original preview stays available, including after quota failure. A detected conflict offers explicit Refresh local list, which reads the new snapshot and updates collision hints while retaining the incoming preview. Only a subsequent confirmation imports against that snapshot. Nothing automatically rebases or overwrites another tab's data.

The existing localStorage comparison/write window remains **non-atomic across truly simultaneous tabs**; DATA-001 does not add locking/synchronization. Normal intervening writes are blocked by the existing optimistic check. Quota/read/validation failures preserve valid stored data and the preview/draft. Saved-data errors never authorize replacement.

## Moving devices or origins

1. Open Session Editor on the source browser/origin and use Export all as JSON, or the row's download icon for one saved Rundown. For the currently loaded original definition, use Export Rundown in the Session Timer menu; it never pauses or stops the clock.
2. Keep the JSON file somewhere safe and transfer it using a method of your choice.
3. On the destination browser/origin, open Session Editor, choose the file under Import JSON and inspect the review.
4. Confirm a batch as new copies, or open a single draft and explicitly Save it. Load the result in Session Timer when ready; imports do not start runs.

localStorage is isolated by browser/profile and origin. **`https://easytimer.at` does not automatically share Rundowns with `https://et.rbsnet.at`.** Export on the old origin and import on the new one before clearing old browser data. This increment makes no DNS/hosting/domain change. JSON portability remains useful without Google; Drive/authentication/cloud sync and AI image conversion are not included.

Backups are manual snapshots, not automatic recovery or synchronization. Exports are complete and never truncated; imports above 10 MiB are deliberately rejected, so unusually large backups need smaller files/individual exports. No cross-reload active-timer recovery is added. Files contain user-provided names/phase text; choose their storage/sharing destination accordingly.

## Validation and visual acceptance

```sh
node --test tests/timer.test.mjs tests/templates.test.mjs tests/session.test.mjs tests/time-visuals.test.mjs tests/virtual-clock.test.mjs tests/portability.test.mjs
node tests/browser-check.mjs
```

The pure portability suite covers round trips, strict file validation, collisions/fresh IDs, large totals, input isolation, safe filenames, original Session snapshot export and one-write conflict/quota behavior. Browser checks use real native JSON downloads in temporary folders (including offline), native File objects, single/bulk review, dirty guards, Save/edit/execute, reimport, actual cross-tab conflicts, quota failures, unsafe text, read failures and late reads. Screenshot galleries cover library before/after, individual export, backup section, single/multi reviews, duplicate hints, validation errors, successful import, desktop/320px, DE/EN and Light/Dark. Existing System-theme, Quick/Planner/Session/PWA regressions remain part of the full suite.

Each run prints a temporary HTML gallery outside the repository. Optional `EASYTIMER_DATA_BEFORE` points to an existing before-screenshot folder. No generated files, fixtures or profiles are production assets.

Local verification passed **73/73 unit tests**, the complete existing/extended browser regression and a focused DATA-001 browser run. Actual downloads round-tripped the saved JSON and remained available offline. Actual cross-tab writes blocked import until explicit refresh; simulated quota/read failures retained existing data and the preview. The gallery contains 40 localized library/review/error/success views, 8 before views, 2 conflict/write-failure views and a keyboard-scrollable 50-Rundown review. No timer engine, Session Coordinator calculation, storage schema/key, workflow, hosting or domain configuration changes are included.

Native iOS Safari/installed-PWA file-picker, download/save/share destinations, safe areas and VoiceOver announcements/focus require manual acceptance on real devices. Native file-picker captions follow the browser/OS language rather than the application language; application labels and review messages support DE/EN. Chromium checks do not establish native-device behavior. These remaining native-device checks are not claimed as automated passes; they do not reopen the owner-accepted functional scope.


### Final DATA-001 release polish

The Rundown picker retains its heading and adds a muted localized context line. A separate secondary list/edit action opens the existing Session Editor library overview (`Open Session Editor` / `Session-Editor öffnen`, `Create & edit rundowns` / `Rundowns erstellen & bearbeiten`). Load/Refresh, unchanged-saved-data and page-reload explanations, Back navigation, READY loading and draft safeguards remain intact. The library backup action is `Export all as JSON` / `Alle als JSON exportieren`. Import-review conflict/write failures explicitly preserve existing Rundowns and the preview; ordinary draft messages remain unchanged. PWA v35 includes these final changes before its first release. Focused picker screenshots cover before/after DE/EN, Light/Dark, desktop and 320px with keyboard/layout checks.

## Release closeout

DATA-001 is complete, owner-accepted and deployed as `9dcf75d8adec963209d58a9d00af4ad05e2567e7`, annotated tag `release/data-001-v35`. [FTP deployment 40132478801](https://github.com/nox-vobiscum/easytimer/actions/runs/40132478801) succeeded; all 18 served source files matched the release Git blobs, and isolated production Picker and portability checks passed. The subsequent footer-only hotfix `409229ae428d9cdea41306a91a2a47984a857ec2` is the current production baseline; [deployment 40132780761](https://github.com/nox-vobiscum/easytimer/actions/runs/40132780761) and focused production footer checks passed. Shell/CSS use v36; unchanged JavaScript modules retain v35. Footer links have no underline and retain visible keyboard focus.

No DATA-001 screenshots, downloads, browser profiles, temporary fixtures or duplicate draft documents are tracked in the repository. Generated review artifacts remain in OS temporary directories and are not release assets. Retain `portability.mjs`, its unit/browser regression tests and the Picker regression suite: these are maintained implementation and verification tools, not disposable files. Preserve the feature branch, annotated release tag and rollback checkpoint; no branch/tag deletion or unrelated legacy-asset removal is part of this closeout.

No production code or asset-cache changes are required for this documentation-only closeout. The original checkpoint remains at `fb719f74bd4c9ce01b195803d3b94a792fc60d17`. No further feature work is included.
