# Changelog

All notable changes to `@alexguha/rplib` (core) are documented here. The format loosely
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
follows [SemVer](https://semver.org/) starting from `1.0.0`. The `0.x` series
makes no API-stability guarantees.

## [0.1.0] - Initial pre-release

### Changed (BREAKING for pre-1.0 consumers)

- Package renamed from `rplib` to `@alexguha/rplib` (npm `rplib` name was
  blocked as too similar to an existing package). Update imports to
  `import ... from '@alexguha/rplib'` / `'@alexguha/rplib/parser'` /
  `'@alexguha/rplib/mutate'`.
- `RPCanvas` constructor now takes an options object:
  `new RPCanvas({ svgDOM, defaults?, components?, eventListenerTargets?, elementToggleCallback?, resolveView? })`.
  The previous 6-arg positional form has been removed.
- Wildcard subpath exports (`@alexguha/rplib/parser/*`, `@alexguha/rplib/utils/*`) have been
  removed. The public parser surface is now a single subpath:
  `import { parseAbstractContent, loadAbstractDefinitions, ... } from '@alexguha/rplib/parser'`.
  Everything else under `parser/` and all of `utils/` is internal.
- `@alexguha/rplib/mutate.js` is now exposed as `@alexguha/rplib/mutate` (without the `.js` suffix).
- The package entry was renamed from `canvasManager.js` to `index.js`.

### Added

- Core canvas with hook system, adapter injection (`resolveView`, `Reporter`,
  `Storage`), partial-redraw API, and the bundled DSL parser.
- Type declarations: `npm run build:types` emits `.d.ts` files under `types/`
  via `tsc --emitDeclarationOnly`. The `types` field and per-subpath `types`
  conditions are wired through `package.json`.
- `repository`, `homepage`, `bugs`, `keywords`, `engines` metadata.
- `LICENSE` file on disk.
- `prepublishOnly` script runs tests and emits types before publish.
