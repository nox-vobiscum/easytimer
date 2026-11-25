# easyTimer terminology mapping

The fixed Home claim “Timing is everything.” / “Apparently.” is intentionally
English in both DE and EN. See the [handover](PACKAGE_01_HANDOVER.md) for its
staging and acceptance status.

Mandatory reading for contributors and coding agents. Use the DE and EN columns
for public labels and the technical columns to trace those labels into the code.
When starting from a domain field or module, read the same tables in reverse.
Update this mapping in the same change whenever product terminology or a
corresponding technical concept changes. The
[terminology checkpoint](EDITOR-001_TERMINOLOGY_AND_HOME_2026-11-24.md)
records the product decisions and their rationale.

## Product concepts and implementation

| DE | EN | Technical concept and location |
| --- | --- | --- |
| Event-Template | Event Template | `Template`, `kind: 'template'`, with its own `id`, `revision` and reusable `plan`. See `validateTemplate` in `src/js/editor-domain.mjs`. |
| Event | Event | `Execution`, `kind: 'execution'`, with its own identity, `currentPlan`, optional provenance in `source`, `lifecycle`, `runtimeRevision`, `attempt` and `workshopNotes`. Template-derived events have `source.kind: 'template'` and an independent copy of the plan. |
| Rundown | Rundown | The planned sequence of activities within an event. `validateRundownPlan` validates the embedded `Template.plan` or `Execution.currentPlan`: `name`, `category`, `transitionMode`, `preparedInformation` and ordered `phases`. The original executed plan is captured in `attempt.startSnapshot` at first countdown start. |
| Phase | Phase | An ordered element of `plan.phases` or `currentPlan.phases` with a stable `id`, `title`, `durationSeconds`, `category`, `notes` and `resources`. Recorded outcomes use `phaseId` in `Execution.phaseOutcomes`. |
| Event-Informationen | Event Information | Prepared text in `plan.preparedInformation` or `currentPlan.preparedInformation`. Available on a reusable template and the event's own planning copy. |
| Phasen-Informationen | Phase Information | Prepared guidance in `phase.notes` and labeled links in `phase.resources`. The historical field name `notes` refers to prepared text here. |
| Event-Notizen | Event Notes | Occurrence-specific text in `Execution.workshopNotes.rundown`. The current public archive displays it read-only. |
| Phasen-Notizen | Phase Notes | Occurrence-specific entries in `Execution.workshopNotes.phases` with `{ phaseId, text }`. The data contract supports them. The current public UI has no Phase Notes editor or archive display for these entries. |
| Quick-Timer | Quick Timer | `mode: 'quick'` in `app.js`. `timer.mjs` owns countdown state and deadlines. |
| Event-Timer | Event Timer | `mode: 'session'` and the native Picker in `app.js`. `session.mjs` advances the Run and delegates clock transitions to `timer.mjs`. `execution-runtime.mjs` projects READY, validates checkpoints and records outcomes. |
| Event-Editor | Event Editor | `editor-workspace.mjs` renders the public library and editor in `#planner`. `editor-planner-service.mjs` coordinates draft loading, validated saves and reconciliation. |
| Stoppuhr | Stopwatch | `#home-stopwatch` is a disabled Home tile. There is no stopwatch timer engine in this package. |

An **Attempt** is the persisted timing attempt of an Execution. It starts as
`null`. The first actual timer Start records `id`, `startedAt`,
`runtimeRunId` and `startSnapshot` via `startActiveExecution`.
A **Run** is the timer's working state, identified by `run.runId`, with the
current phase index, stage and overtime. A Run and READY clock already exist at
activation. Once started, the Attempt binds to that Run via `runtimeRunId`.
Neither object is a second Event. An Event persists across a reset that clears
its Attempt. Archived `reflection` is distinct from both Information and Notes.

`editor-storage.mjs` validates the aggregate saved under `easyTimerEditor.v1`
with store schema version 1 and domain schema version 2. Its fields include
`templates`, `executions` and `activeRuntime`.
`editor-storage-lock.mjs`, `editor-runtime-bridge.mjs` and
`editor-active-lock.mjs` coordinate authoritative writes, runtime handoff and
ownership. `recovery.mjs` retains the legacy/Quick runtime recovery contract.
`editor-portability.mjs` uses the technical JSON discriminators
`editor-template`, `editor-execution` and `editor-backup`. Names such as
`session`, `template`, `execution` and `workshopNotes` are intentional in
code, storage and interchange. Localized labels apply to product copy only.

## Actions and lifecycle

| DE | EN | Technical meaning |
| --- | --- | --- |
| Neues Event-Template | New Event Template | Opens a reusable Template draft. Explicit Save persists it. |
| Event planen | Plan Event | `beginNewExecution` opens an independent draft based on a template. Save calls `planFromTemplate` and persists the planned event. |
| Event starten | Start Event | `launchTemplateToReady` creates an independent Execution and activates it, or `activatePlanned` activates the selected existing Execution. The timer opens at phase 1 with its full duration in READY. |
| Starten | Start | Starts the countdown in the timer. The first `START` uses `startReadyExecutionInRecord` and establishes the Attempt and its immutable start baseline. |
| Zurück zum Timer | Back to Timer | `showActive` opens the already active timer subject to existing ownership checks. |
| Im Timer fortsetzen | Resume in Timer | Resumes a suspended Execution in the timer. A started Event returns with its clock frozen until the explicit timer Continue action. |
| Rundown beenden | Finish Rundown | Timer action `COMPLETE` finishes the phase sequence and enters final overtime. The Run's `COMPLETED` stage and the Execution's `'completed'` lifecycle are separate. |
| Unterbrechen & speichern | Suspend & save | Preserves the Event and its progress for later resume, releasing the active timer. |
| Rundown behalten und Fortschritt zurücksetzen | Keep Rundown and reset progress | `retainExecutionPlanInRecord` keeps the same Event and latest plan as Planned and clears the Attempt, runtime progress, results and occurrence-specific notes. |
| Event verwerfen | Discard Event | `discardExecutionInRecord` removes the selected Event, its plan and all occurrence data. Its source Event Template is unaffected. |
| Event abschließen / Event abschließen und archivieren | Complete Event / Complete Event and archive | `completeExecutionInRecord` archives a previously started Event with its final plan, start baseline, results and notes. The READY-only exit omits archival. |

Lifecycle labels are **Geplant / Planned**, **Im Timer aktiv / Active in
Timer**, **Unterbrochen / Suspended** and **Abgeschlossen / Completed**. An
active Event may be ready, running, paused or in overtime. Pausing the clock,
stopping overtime and suspending the Event are distinct actions. Historical
`STOP_WORKSHOP` resets the timer to the first phase. The native Event exit
dialog offers the explicit lifecycle choices above.

Start Event uses `startEligibilityReason` in `editor-domain.mjs` before the
App asks to leave a progressed Quick Timer. The Store checks eligibility
under the existing revision checks, before creating a Planned Event for
direct launch and before activating a Planned Event. Ordinary Plan Event has
its own intent and only saves planning data. Slice 02.1 retains the existing
strict persisted plan shape. See the
[Package 02 checkpoint](PACKAGE_02_PLANNING_AND_START.md).
