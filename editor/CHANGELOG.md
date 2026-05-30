# Changelog

All notable changes to `@alexguha/rplib-editor` are documented here. The format loosely
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
follows [SemVer](https://semver.org/) starting from `1.0.0`. The `0.x` series
makes no API-stability guarantees.

## [Unreleased]

### Changed (BREAKING)

- `createEditor({ components, dataSource })` → `createEditor({ dataDir })`. The
  editor now reads a `data/` directory laid out as `abstracts/*.txt` and
  `components/**/*.{json,js}`; file and folder names are arbitrary. Run
  `npx rplib-build-data <dataDir>` (shipped by `@alexguha/rplib`) before
  serving to (re)generate `<dataDir>/manifest.json`. Bundler users who
  aggregate their own way can pass pre-aggregated input via
  `createEditor({ data: { abstractDefinitions, components } })` instead.
- Mirrored dimension entry from rplib-core in the component editor

### Changed

- Updated the DSL following the rplib-core dimension entry improvement
- Following the above, allowed for component JSON definitions while maintaining parity for js definitions
- Component-editor item-id validator now rejects integer-like ids (e.g. `"0"`, `"1"`, `"42"`) to match the runtime constraint enforced in rplib-core. DSL docs updated with the new id constraints and explicit `previous` scope rules (earlier sibling or prior component's tail only; never into a referenced component's internals).

### Fixed

- Stylesheet hardcoded colors converted to using variables
- Docs page not appearing
- Clicking center-positioned text over a shape now pins the shape's `.force-hover` state, matching the behavior of clicking the shape directly. Text that owns its own `description` still pins only itself.

## [0.1.0] - Initial pre-release

- Everything