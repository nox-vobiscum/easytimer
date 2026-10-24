# DEV-001: Virtual-time timer inspection

Run commands from the repository root with Node.js 22+ and an installed Chromium browser. No package installation or new dependencies are required. Windows defaults to Edge; optionally select Chrome in PowerShell:

```powershell
$env:EASYTIMER_BROWSER = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
```

## Screenshot commands

```sh
node tests/browser-check.mjs --scenario quick-endgame --theme dark
node tests/browser-check.mjs --scenario session-phase-overtime --theme both
node tests/browser-check.mjs --scenario quick-expiration --theme both
node tests/browser-check.mjs --scenario quick-expiration --theme dark --advance 2m
node tests/browser-check.mjs --scenario all --theme both
node tests/browser-check.mjs --list-scenarios
```

Each run prints the output directory and gallery URL. Open its `index.html` to compare screenshots and click a thumbnail for the full PNG. `summary.json` records actual unified displayed values, colors, virtual timestamps and timings. Output defaults to a unique temporary directory, outside tracked production assets. `--output DIRECTORY` selects another base directory outside the repository and creates a unique child directory; repository destinations are rejected.

Options:

- `--scenario NAME`: repeat or comma-separate names; `all` selects all 31 scenarios (including 11 automatic ST-002B cases).
- `--theme light|dark|both`: defaults to both.
- `--advance 10s|2m|1.5h|1250ms`: additional virtual time after reaching the selected state. Paused/stopped clocks remain frozen. Default: zero.
- `--viewport 320x568`: screenshot viewport; default `1280x800`. This is viewport sizing, not native iOS or smartphone hardware emulation.
- `--language de|en`: defaults to English.
- `--help`: print options and scenario names without starting a browser.

For example, verify paused clocks across two virtual hours at narrow German viewport width:

```sh
node tests/browser-check.mjs --scenario quick-paused-endgame,session-paused-endgame,session-workshop-overtime-paused,session-workshop-overtime-stopped --theme both --advance 2h --viewport 320x568 --language de
```

## Available scenarios

| Scenario | Starting inspection point |
| --- | --- |
| `quick-normal`, `session-normal` | 04:00 remaining; normal color |
| `quick-before-endgame`, `session-before-endgame` | 30.001 seconds remaining; still normal |
| `quick-endgame`, `session-endgame` | Exactly 00:30; amber |
| `quick-expiration`, `session-expiration` | Exactly +00:00 in the single red readout (UX-009) |
| `quick-overtime`, `session-phase-overtime` | +00:10 |
| `quick-overtime-2m`, `session-phase-overtime-2m` | +02:00 |
| `quick-paused-endgame`, `session-paused-endgame` | Paused at 00:30; amber |
| `quick-extension` | Add five minutes at endgame; 05:30 and normal color |
| `session-completion` | Explicitly complete the final phase; workshop +00:00 |
| `session-workshop-overtime` | Workshop +00:10 |
| `session-workshop-overtime-2m` | Workshop +02:00 |
| `session-workshop-overtime-paused` | Workshop overtime paused at +00:10 |
| `session-workshop-overtime-stopped` | Workshop overtime stopped at +00:10 |

Automatic scenarios: `auto-ready`, `auto-before-transition`, `auto-transition`, `auto-delayed-phase`, `auto-paused`, `auto-multiple-transitions`, `auto-last-endgame`, `auto-completion`, `auto-workshop-overtime`, `auto-workshop-overtime-paused`, `auto-workshop-overtime-stopped`. They use the same 5/15/2-minute fixture in Automatic mode: boundaries at 5, 20 and 22 minutes. An optional `--advance` may cross further scheduled phases or completion; paused/stopped/READY cases remain frozen.

Countdown cases use a five-minute current timebox. Session cases use an isolated three-phase fixture (5, 15 and 2 minutes). Completion scenarios invoke the existing manual Next action through all phases; those manual cases never transition automatically. Automatic ST-002B cases follow their scheduled boundaries instead. Additional time is advanced only after the selected starting state is established.

## Implementation and safety

`tests/virtual-clock.mjs` overrides `Date.now` only in the disposable browser execution context and dispatches the existing visibility reconciliation event after each advance. The actual shared engine, Session coordinator and rendering calculate the resulting state. It never substitutes displayed text, changes the OS clock, creates a second timer or adds a production seam/debug endpoint. Reload and cleanup restore the browser clock; the Node host clock remains unchanged.

The harness serves `src` through a temporary localhost server and uses its existing isolated browser profile. Test templates and preferences exist only in that disposable profile/origin, never in an ordinary user's storage. No production files, service-worker cache references or deployment configuration change. Screenshots are static inspection artifacts; this is not an interactive time-travel application UI.

Each scenario asserts actual time/overtime, mode and UX-008 visual state and palette in the selected theme. It also verifies the starting state before applying an optional additional advance. Every invocation first runs a separate approximately 1.1-second unmodified real-time countdown control to prove normal countdown updates still work.

## Validation record

```sh
node --test tests/timer.test.mjs tests/templates.test.mjs tests/session.test.mjs tests/time-visuals.test.mjs tests/virtual-clock.test.mjs
node tests/browser-check.mjs
```

DEV-001 validation: all 51 unit tests passed, as did the complete Quick Timer/Planner/Session Timer/UX-008 browser regression. All 20 scenarios in both Light and Dark passed (40 screenshots in 5,634 ms, plus a separate 1,122 ms real-time control). Additional checks passed for two-hour advances of paused/stopped clocks at 320x568 in German, and a two-minute advance from exact expiry into overtime. Timings are measurements, not performance guarantees.

Automated Chromium screenshots do not replace the outstanding real-device iOS Safari/PWA and screen-reader acceptance checks. Background timing is advanced deterministically here; the full existing browser regression retains its separate frozen-tab timing coverage. System theme remains covered by that regression rather than a new screenshot option.
