# Changelog

This file records meaningful user-visible changes and verified production
releases. It follows a lightweight Keep a Changelog structure. Implementation,
commit, staging and production deployment are distinct events.

## Unreleased

### Added

- **EDITOR-001 internal foundation:** the native Schema-2 Editor Store can
  validate and persist new templates and create independent PLANNED executions
  from stored templates. This is an unreleased data-layer capability only; no
  Editor UI integration or production availability is included.

## PWA v67 — 2026-11-01

- Production release and implementation commit:
  `72b2d28435ebb6b6e77739c454add57a49eee0f7`
- Verified staging workflow run:
  [`41322924175`](https://github.com/nox-vobiscum/easytimer/actions/runs/41322924175)
- Verified production workflow run:
  [`41323065346`](https://github.com/nox-vobiscum/easytimer/actions/runs/41323065346)
- **Fullscreen Workshop Stop confirmation:** the regular Session Stop action now
  uses a document-modal confirmation that remains visible in Firefox and Chrome
  fullscreen. Cancel and Escape preserve the active Session and fullscreen;
  confirmation retains the existing workshop reset semantics.
- **Consistent Session launch wording:** the Rundown picker now uses
  `Session starten` / `Start Session`; it still prepares the selected Rundown in
  READY and never starts the countdown automatically.

## PWA v66 — 2026-11-01

- Production release commit: `33635ea44939187cc4e7be834fad0eb70fb4f6a1`
- Implementation commit: `00323c5bb6e56c4f4dad6fbb559150aced46fc12`
- Verified production workflow run: [`41317875158`](https://github.com/nox-vobiscum/easytimer/actions/runs/41317875158)

### Changed

- **UX-015A/B:** the Session Timer footer presents workshop remaining time and
  the upcoming phase as matching two-line label/value groups, with a borderless
  Next Phase control. The upper context distinguishes the subdued workshop
  name, prominent current phase and utility-label phase progress. Timing,
  progress and next-phase behavior remain unchanged.
- PWA v66 was verified on staging and production with the deterministic 24-file
  package and direct checks of the deployed service worker, styles and app
  module.

## PWA v65 — 2026-11-01

- Production release commit: `56e02b5bc989359b3e1e15f817ec1b3886a7667b`
- Implementation commit: `56e02b5bc989359b3e1e15f817ec1b3886a7667b`
- Verified production workflow run: [`41302013099`](https://github.com/nox-vobiscum/easytimer/actions/runs/41302013099)

### Changed

- **PLAN-002:** planned workshop totals in the Session Editor, Rundown library
  and import review use concise `h` and `min` labels instead of clock-style
  values. Calculations, stored durations and live countdown formatting remain
  unchanged.
- PWA v65 was verified on staging and production with the deterministic 24-file
  package and direct checks of the deployed service worker and Planner module.

## Repository maintenance — 2026-10-30

- **CI-001:** documentation-only pushes no longer trigger staging. The
  conservative path allowlist still covers application sources, release
  tooling, tests, workflows/actions, package metadata and Git attribute
  changes. The change was committed as `30cc98723eb7e041d7e3663f1673ecb9b25c8322`
  and published to `develop` and `main`.
- **DOC-001:** documentation consolidation was committed as
  `3069802633d44e8216f83fd8e546b9a7d1b6ff3a` and published to `develop` and
  `main`. It did not change the application, production artifact or PWA v62.

## PWA v64 — 2026-10-31

- Production release commit: `81882746101db90a426397d92a761c9f8b13512f`
- Implementation commit: `81882746101db90a426397d92a761c9f8b13512f`
- Verified production workflow run: [`41236581208`](https://github.com/nox-vobiscum/easytimer/actions/runs/41236581208)

### Changed

- **UX-019:** Start and Resume actions use a restrained sage-green accent,
  while the regular Stop action uses a muted coral-red accent. Pause, Restart,
  Stop overtime and unrelated actions retain their established styling.
- PWA v64 was verified on staging and production with the deterministic 24-file
  package and isolated browser smoke tests.

## PWA v63 — 2026-10-31

- Production release commit: `00eb4a462b02961b7caac8c73fdffaea0ca9db04`
- Implementation commit: `00eb4a462b02961b7caac8c73fdffaea0ca9db04`
- Verified production workflow run: `41069275190`

### Changed

- **PLAN-001:** The Session Editor can insert a new phase immediately before a
  selected existing phase while retaining append behavior, stable phase
  identities and draft-only editing.

## PWA v62 — 2026-10-30

- Production release commit: `62531d9012f9c72d5a7b905a18ffac47f8b1bd18`
- Implementation commit: `62531d9012f9c72d5a7b905a18ffac47f8b1bd18`
- Verified production workflow run: `41030036312`

### Changed

- **UX-011:** Selecting an already active Quick Timer or Session Timer is
  view-only navigation and preserves the existing timer or Session identity.
- Existing unsaved Session Editor changes remain protected by the established
  discard guard.
- Genuine destructive Session departure or Rundown replacement retains explicit
  confirmation; an untouched phase-1 READY Session keeps the approved
  confirmation-free replacement behavior.
- PWA v62 was verified on staging and production with the 24-file package,
  isolated browser smoke tests and no unexpected external requests.

Detailed record:
[`docs/archive/implementation/UX-011_SAFE_SESSION_NAVIGATION.md`](docs/archive/implementation/UX-011_SAFE_SESSION_NAVIGATION.md).

## PWA v61 — 2026-10-30

- Production release commit: `4cf2c374a574c04ad0ba8938060820575f06553c`
- Implementation commit: `4cf2c374a574c04ad0ba8938060820575f06553c`
- Verified production workflow run: `40972161369`

### Changed

- **UX-018:** A genuinely new Quick Timer starts at `00:00`.
- READY duration buttons are additive; repeated and mixed selections accumulate.
- Shift + click or Shift + keyboard activation subtracts and clamps at zero.
- The READY reset control restores `00:00`; Start remains disabled at zero.
- Existing saved and recovered Quick Timer durations remain unchanged.
- Running, paused and overtime adjustment semantics from UX-016 remain intact.

Detailed record:
[`docs/archive/implementation/UX-018_CONTEXTUAL_TIMEBOX_CONTROLS.md`](docs/archive/implementation/UX-018_CONTEXTUAL_TIMEBOX_CONTROLS.md).

## PWA v60 — 2026-10-29

- Production release commit: `e9fd4b8506008cb5dcac883d3a805902dd2c03ee`
- Public information implementation: `4d1397570de06797175521656a39c1d1969d4a22`
- Production packaging implementation: `5aed4e2cb42d46f33970f53afdc044c08e4f088d`
- Manual production workflow implementation: `368ce319ee9ed31fe314e0d8b6f10b32dd5c8b3d`
- Verified production workflow run: `40950551257`

### Added

- First verified public easyTimer production baseline at
  [easytimer.at](https://easytimer.at/).
- Static About, FAQ, Imprint and Privacy pages with shared application header,
  DE/EN content, theme support and protected return-to-origin navigation.
- Deterministic 24-file production package, checksum inventory and genuine
  offline cold-start regression.
- Separate automatic staging deployment from `develop` and guarded manual
  production deployment from `main`, with dedicated environments and strict
  FTPS credentials.
- The production baseline includes Direct Session Launch (UX-012), Session
  Editor hierarchy (UX-013), durable Quick and Session recovery (REL-001A/B),
  refresh-safe navigation (UX-014), and clamped Shift-subtraction (UX-016).

### Release boundary

The production application is local-first. Google Account and Google Drive
experiments remain development-only and were not shipped as production
features.

Detailed records:
[`docs/RC-001_PRODUCTION_PACKAGING.md`](docs/RC-001_PRODUCTION_PACKAGING.md),
[`docs/RC-002_PRODUCTION_DEPLOYMENT.md`](docs/RC-002_PRODUCTION_DEPLOYMENT.md) and
[`docs/RC-003_PUBLIC_INFORMATION_PAGES.md`](docs/RC-003_PUBLIC_INFORMATION_PAGES.md).
