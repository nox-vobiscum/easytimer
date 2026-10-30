# Changelog

This file records meaningful user-visible changes and verified production
releases. It follows a lightweight Keep a Changelog structure. Implementation,
commit, staging and production deployment are distinct events.

## Unreleased

PLAN-001 is the current locally accepted application change awaiting release.

- **PLAN-001 (locally accepted, unreleased):** the Session Editor can optionally insert a
  new phase immediately before a selected existing phase while retaining the
  established append behavior, stable phase identities and draft-only editing.

- **CI-001 (local, uncommitted):** documentation-only pushes no longer trigger
  staging. The conservative path allowlist still covers application sources,
  release tooling, tests, workflows/actions, package metadata and Git attribute
  changes.
- **DOC-001:** documentation consolidation was committed as `3069802` and
  published to `develop` and `main`. It did not change the application, the
  production artifact or PWA v62.

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
