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

<a id="st-001-session-planner"></a>

- Quick Timer with additive READY timeboxes, runtime adjustments, pause,
  overtime and durable recovery.
- Session Timer for saved manual or automatic multi-phase Rundowns.
- Session Editor with direct session launch, local JSON import/export and
  guarded navigation.
- Responsive DE/EN interface with Light, Dark and System themes.
- Installable, offline-capable PWA with no mandatory account or backend.

The large clock remains the primary focus. Controls are contextual, existing
timer and Session identity is protected during navigation, and elapsed time is
derived from real deadlines rather than animation ticks.

## Local-first and privacy

Rundowns, preferences and recoverable runtime state stay in the browser. The
production release does not include Google Drive synchronization, analytics or
mandatory sign-in. Users can move Rundowns manually through the validated JSON
export/import workflow. See the public
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
