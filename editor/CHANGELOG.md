# Changelog

All notable changes to `@alexguha/rplib-editor` are documented here. The format loosely
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
follows [SemVer](https://semver.org/) starting from `1.0.0`. The `0.x` series
makes no API-stability guarantees.

## [0.1.0] - Initial pre-release

### Changed (BREAKING for pre-1.0 consumers)

- Package renamed from `rplib-editor` to `@alexguha/rplib-editor`. Peer
  dependency renamed from `rplib` to `@alexguha/rplib`. Update imports to
  `import { createEditor } from '@alexguha/rplib-editor'`.

### Added

- Generic diagram-editor UI built on top of `@alexguha/rplib`: canvas + sidebar +
  navigation + info overlay.
- CodeMirror-based abstract editor with autocomplete, lint, and search.
- Component edit mode with undo/redo integration.
- DSL documentation page (`docs.html`) and `DSL.md`.
- `repository`, `homepage`, `bugs`, `keywords`, `engines` metadata; `LICENSE`
  on disk.
