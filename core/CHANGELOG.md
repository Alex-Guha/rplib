# Changelog

All notable changes to `@alexguha/rplib` (core) are documented here. The format loosely
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
follows [SemVer](https://semver.org/) starting from `1.0.0`. The `0.x` series
makes no API-stability guarantees.

## [Unreleased]

### Added

- `parseAbstractDefinitionFiles(paths)` — parallel-fetch + parse multiple `.txt`
  abstract files and merge them into a single definitions map. Last-write-wins
  on key collision.
- `loadDataDir(dataDir, reporter?)` — runtime loader for the `data/` directory
  convention. Reads `<dataDir>/manifest.json`, then fetches and aggregates
  every listed abstract (`.txt`) and component (`.json` / `.js`).
- `rplib-build-data` CLI: walks a `data/` directory at build/dev time and
  writes `<dataDir>/manifest.json`. File and folder names inside `abstracts/`
  and `components/` are arbitrary; the manifest is regenerated on every
  dev/build, never hand-edited.
- Improved component dimension entry, allowing for "2h + 2w" style specification

### Changed

- Parser now surfaces broken `previous` / `arrow.previous` references with distinct warnings (forward reference vs out-of-scope), instead of silently assigning `undefined`. Scope is unchanged: components remain self-contained, with the implicit head-stitch as the only cross-component link.
- `loadDataDir` rejects components whose `content` uses integer-like keys (e.g. `"0"`, `"1"`, `"42"`), regardless of source format. The JS runtime reorders integer-string keys ascending before any code sees them, which silently breaks declaration order and any `previous` reference that depends on it.

## [0.1.0] - Initial pre-release

- Everything