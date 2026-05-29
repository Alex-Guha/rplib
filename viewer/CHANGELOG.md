# Changelog

All notable changes to `@alexguha/rplib-viewer` are documented here. The format loosely
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
follows [SemVer](https://semver.org/) starting from `1.0.0`. The `0.x` series
makes no API-stability guarantees.

## [Unreleased]

### Changed (BREAKING)

- `createViewer({ components, dataSource })` → `createViewer({ dataDir })`.
  Mirrors the editor's change — the viewer now reads a `data/` directory laid
  out as `abstracts/*.txt` and `components/**/*.{json,js}`. Run
  `npx rplib-build-data <dataDir>` before serving. Bundler users can pass
  `createViewer({ data: { abstractDefinitions, components } })` instead.

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
