# Changelog

All notable changes to `@alexguha/rplib-viewer` are documented here. The format loosely
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
follows [SemVer](https://semver.org/) starting from `1.0.0`. The `0.x` series
makes no API-stability guarantees.

## [0.3.0]

### Changed (BREAKING)

- **References is no longer built in.** The single references sidebar box is
  now a generic, consumer-configured **Panel** system. `createViewer` gains a
  `panels` option (default `[]`); supply a references panel to render references
  — until you do, references data is parsed but not displayed. See the README
  "Panels" section for the canonical `referencesPanel` recipe and wiring.
  Requires `@alexguha/rplib@^0.3.0`.
- **Sidebar DOM rename.** The host page must now provide a `#panels` element
  (was `#references`) as the sidebar content region; the references-specific
  `REFERENCE_BACKGROUND` theme key / `--reference-background-color` variable and
  the `#references-list` CSS are gone (replaced by `PANEL_BACKGROUND` /
  `--panel-background-color` and generic `.rplib-panel` styling).

### Changed

- The sidebar content region is driven by `@alexguha/rplib/panel`'s `PanelHost`,
  which renders the configured panels into stacked slots and handles transient
  takeover for errors. The viewer no longer duplicates `updateReferences` /
  `renderInfoContent`; it imports the shared core implementation.
- Panels may declare their own `theme` background key; unthemed panels use
  `PANEL_BACKGROUND` / `--panel-background-color`. The box styling moved from the
  region element to `.rplib-panel`; the region (`#panels`) is now a bare flex
  layout column.

## [0.2.0]

### Changed (BREAKING)

- `createViewer({ components, dataSource })` → `createViewer({ dataDir })`.
  Mirrors the editor's change — the viewer now reads a `data/` directory laid
  out as `abstracts/*.txt` and `components/**/*.{json,js}`. Run
  `npx rplib-build-data <dataDir>` before serving. Bundler users can pass
  `createViewer({ data: { abstractDefinitions, components } })` instead.

### Fixed

- Stylesheet hardcoded colors converted to using variables
- Clicking center-positioned text over a shape now pins the shape's `.force-hover` state, matching the behavior of clicking the shape directly. Text that owns its own `description` still pins only itself.

## [0.1.0] - Initial pre-release

### Changed (BREAKING for pre-1.0 consumers)

- Package renamed from `rplib-viewer` to `@alexguha/rplib-viewer`. Peer
  dependency renamed from `rplib` to `@alexguha/rplib`. Update imports to
  `import { createViewer } from '@alexguha/rplib-viewer'`.

### Added

- Lightweight read-only viewer UI for rplib diagrams: same canvas + sidebar +
  navigation as `@alexguha/rplib-editor`, with all authoring features stripped out.
- `repository`, `homepage`, `bugs`, `keywords`, `engines` metadata; `LICENSE`
  on disk.
