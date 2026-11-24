# easyTimer

easyTimer is a free, local-first facilitation timer for focused timeboxes and
multi-phase workshop Rundowns. The production application is available at
[easytimer.at](https://easytimer.at/).

> **Contributors and coding agents:** Before making any changes, read
> [`docs/BRIEFING.md`](docs/BRIEFING.md) and follow its collaboration,
> architecture, UX, testing and release rules. Consult the canonical product
> decisions, backlog and changelog as relevant. Verify the actual repository and
> deployment state before acting. Do not expand scope, commit, push or deploy
> without explicit owner approval.

## What it does

This overview describes the development version. See the
[changelog](CHANGELOG.md) for verified production releases.

<a id="st-001-session-planner"></a>

- Quick Timer with additive READY timeboxes, runtime adjustments, pause,
  overtime and durable recovery.
- Event Timer for independent events with manual or automatic multi-phase
  Rundowns.
- Event Editor and unified Event Template and Event library with direct
  launch, explicit lifecycle actions, single Event Template JSON portability and a
  clearly labelled complete local-data export.
- Home describes each mode, links to Quick Timer, Event Timer and Event Editor,
  and offers an optional introduction. Stopwatch is shown as unavailable.
- Responsive DE/EN interface with Light, Dark and System themes.
- Installable, offline-capable PWA with no mandatory account or backend.

The large clock remains the primary focus. Controls are contextual, existing
timer and Event identity is protected during navigation, and elapsed time is
derived from real deadlines rather than animation ticks.

## Local-first and privacy

Event Templates, independent events, preferences and recoverable runtime state
stay in the browser. The
production release does not include Google Drive synchronization, analytics or
mandatory sign-in. Users can move one Event Template at a time through the validated
JSON export/import workflow and can download the complete native local-data
aggregate. Full backup restore is not yet supported. See the public
[privacy information](https://easytimer.at/privacy.html) for the released
application disclosure.

## Run locally

Serve `src/` through an HTTP server; ES modules and the service worker do not
work reliably from `file://` URLs. The repository's normal local entry is:

```powershell
node tools/app-sync/server.mjs
```

Open the URL printed by the server. Development-only Google experiments require
their explicit development gate and are not part of the production package.

Common verification commands are documented in
[`docs/BRIEFING.md`](docs/BRIEFING.md#testing-and-quality-gates). The production
package is created with:

```powershell
node tools/release/package.mjs
```

## Documentation

- [`docs/BRIEFING.md`](docs/BRIEFING.md) — authoritative developer handover,
  workflow, architecture and release rules.
- [`docs/TERMINOLOGY_MAPPING.md`](docs/TERMINOLOGY_MAPPING.md) — required
  contributor reference for DE/EN labels and their technical counterparts.
- [`docs/EASYTIMER_UX_KONZEPT_v2.md`](docs/EASYTIMER_UX_KONZEPT_v2.md) — detailed
  binding product and UX decisions.
- [`docs/backlog.md`](docs/backlog.md) — future work and unresolved decisions.
- [`CHANGELOG.md`](CHANGELOG.md) — verified releases and meaningful changes.

Historical investigations and implementation records are retained under
`docs/archive/`; they are evidence, not automatically current instructions.

## License and project status

easyTimer is a private, free and noncommercial hobby project by Roland B.
Seper. No license for reuse or redistribution is granted merely by the public
repository; contact the operator if clarification is needed.
