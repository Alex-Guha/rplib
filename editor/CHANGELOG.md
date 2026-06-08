# Changelog

All notable changes to `@alexguha/rplib-editor` are documented here. The format loosely
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
follows [SemVer](https://semver.org/) starting from `1.0.0`. The `0.x` series
makes no API-stability guarantees.

## [0.3.0]

### Changed (BREAKING)

- **References is no longer built in.** The single references sidebar box is
  now a generic, consumer-configured **Panel** system. `createEditor` gains a
  `panels` option (default `[]`); supply a references panel to render references
  — until you do, references data is parsed but not displayed, and the component
  editor edits it as raw JSON. See the README "Panels" section for the canonical
  `referencesPanel` recipe (display + edit schema) and wiring. Requires
  `@alexguha/rplib@^0.3.0`.
- **Sidebar DOM rename.** The host page must now provide a `#panels` element
  (was `#references`) as the sidebar content region; the references-specific
  `REFERENCE_BACKGROUND` theme key / `--reference-background-color` variable and
  the `#references-list` CSS are gone (replaced by `PANEL_BACKGROUND` /
  `--panel-background-color` and generic `.rplib-panel` styling).

### Changed

- The sidebar content region is driven by `@alexguha/rplib/panel`'s `PanelHost`,
  which renders an ordered array of panel defs into stacked slots and handles
  transient takeover for errors/confirmations (so they work even with
  `panels: []`). The editor no longer duplicates `updateReferences` /
  `renderInfoContent`; it imports the shared core implementation.
- The component editor renders an editor per configured panel for the current
  entity (description/details stay editor-native), replacing the hardcoded
  references form. Panels declare editability via `itemFields` (declarative
  schema) or `renderEditor` (imperative), falling back to raw-JSON editing.
- Panels may declare their own `theme` background key; unthemed panels use
  `PANEL_BACKGROUND` / `--panel-background-color`. The box styling moved from the
  region element to `.rplib-panel`; the region (`#panels`) is now a bare flex
  layout column.

## [0.2.0]

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
- Added multi-sgement arrows to editor

### Fixed

- Stylesheet hardcoded colors converted to using variables
- Docs page not appearing
- Clicking center-positioned text over a shape now pins the shape's `.force-hover` state, matching the behavior of clicking the shape directly. Text that owns its own `description` still pins only itself.

## [0.1.0] - Initial pre-release

- Everything