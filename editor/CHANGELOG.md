# Changelog

All notable changes to `@alexguha/rplib-editor` are documented here. The format loosely
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
follows [SemVer](https://semver.org/) starting from `1.0.0`. The `0.x` series
makes no API-stability guarantees.

## [Unreleased]

### Added

- **Component editor: drag-and-drop editing.** In component-edit mode, shapes
  can be dragged to reposition them: because layout offsets are relative to
  `previous`, every element chained to the dragged one follows automatically.
  Holding **shift** moves only the dragged element — its direct children are
  counter-offset so they (and their descendants) hold their absolute positions.
  The gesture previews live through the non-recording `canvas.previewItems`
  path and commits exactly once on drop (one undo entry, atomic for shift-drag's
  multi-item patch; requires `@alexguha/rplib` with `previewItems`). Clicks
  below a 4px movement threshold still select as before. Draggable shapes show
  a `grab` cursor.
- **Component editor: dragging imported component references.** A reference's
  flattening ignores the importer item's x/y, so dragging an imported group is
  expressed through an **anchor point**: a zero-size box inserted immediately
  before the reference, which the group's head implicitly chains to. The point
  is created lazily on the first drop (positioned so nothing jumps, still one
  undo entry) and simply moved by later drags; shift-drag keeps items anchored
  on the reference's tail in place. Relies on the core parser's new ref-key
  tail anchoring. Items chained to a reference (e.g. added via the **+** button
  while an imported group is targeted) now also render and follow correctly —
  previously their `previous` silently failed to resolve and they sat
  unanchored at the origin.

  **Importmap consumers:** the editor now imports `@alexguha/rplib/layout`;
  browser-no-bundler pages must add
  `"@alexguha/rplib/layout": "./node_modules/@alexguha/rplib/layout.js"` to
  their importmap (the trailing-slash fallback doesn't append `.js`). See the
  README snippet.
- **Component editor: editable `class` on component references.** Targeting an
  imported component reference now exposes an editable `class` field (the rest
  of the block stays read-only). Naming a reference's class marks it as a
  swappable slot so an abstract that uses the component can override it via
  swapModules (e.g. `selfAttention: gqa`). No DSL or parser change — `class` was
  already honored on `{ component, class }` items.

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