# rplib — development notes

Internal notes — not consumer-facing. Architectural assessment of where the library stands, and a survey of adjacent prior art for orientation.

## Architectural assessment

**Current focus:** split rplib out as a standalone library that Neural-Atlas and other apps can consume. The 2026-05 cleanup closed the core refactors (composition over inheritance, immutable view data + cached layouts, optional `resolveView` adapter, render-token cancellation, app-owned theme/defaults, `viewStructures` parser-owned, render scheduling via cancellation tokens + rAF). What's left is packaging + a small set of in-lib smells.

### Open before standalone release

**Packaging (standalone-release gaps):**

- ~~**No `package.json` in `rplib/`.**~~ **Done.** `rplib/package.json` declares name, version, `main`/`exports`, and `d3` / `katex` as `peerDependencies`.
- ~~**No real README.**~~ **Done.** Consumer-facing intro, install, quickstart, and API table live in `README.md`.
- ~~**Zero tests.**~~ **Done (initial pass).** `node --test parser/__tests__/` runs 8 tests covering `parseAbstractContent` round-trip against the real `standard_items/architectures.txt`, the first-item type-inference fix, missing-definition reporter behavior, component stitching, properties propagation, and cyclical-ref detection. Renderer/canvas tests still TODO; wire up the `idMap`-recursion fix once a test that exercises it lands.
- ~~**Hard browser assumptions baked in, not injected.**~~ **Done.** `parser/storage.js` exports take a `storage` adapter (Web Storage-shaped: `getItem`/`setItem`/`removeItem`). Pass `localStorage` directly in browsers, or any matching adapter. The bundled DSL still owns the storage *keys* (`abstractDefinitions`, `rootView`); apps with a custom `resolveView` don't import this file.
- ~~**No types or JSDoc on the public surface.**~~ **Done.** `RPCanvas` constructor + lifecycle methods (`setTheme`, `setReporter`, `on`, `changeViews`, `invalidateView`, `invalidateLayout`, `findHierarchicalElementProperty`) and parser entry points (`parseAbstractContent`, `parseAbstractDefinitionFile`, `parseAbstractDefinition`, `parseComponentView`, `serializeAbstractDefinition`) carry JSDoc with typedefs for `ResolvedView`, `ResolveView`, `Reporter`, `Storage`. No `.d.ts` yet — JSDoc gives editors/`tsc --checkJs` enough to work with.
- ~~**No error model.**~~ **Done.** Diagnostics route through `canvas.reporter` (default `console`); apps swap via `canvas.setReporter({ error, warn })` to intercept. Hard failures still `throw` (e.g. unresolved view in `changeViews`).

**In-lib smells (not blockers, but worth fixing before others read this code):**

- **`idMap` scope in `parser/parseIntermediateFormat.js`.** Local to a single `buildComponent` call. If an outer item references a sub-component's id via `previous`, the lookup misses. The fix (map the component's id to its last-emitted child id after recursion) is straightforward, but doing it without parser tests is risky — pair with the test gap below.
- ~~**First-item type inference in `parser/parseAbstractFile.js`.**~~ **Done.** `parseGenericSectionContent` now scans all direct children at the same indent and picks object vs array based on whether any of them is `key: value`.

**Intentionally kept on the store:**

- **`rootView` / `rootViews`.** Shared lib/app concept — the lib reads it for `{{placeholder}}` substitution, the app reads it for sidebar/edit-menu state. Not a leak.

## Prior art / existing libraries (surveyed 2026-05-10)

No single free library packages **both** declarative relational positioning with explicit anchors **and** deeply nested swappable diagram components the way rplib does. Notes for later:

- **Penrose** (https://penrose.cs.cmu.edu, MIT) — closest *conceptual* match. Declarative constraint-based diagramming for technical/math diagrams; you describe relationships and a solver lays it out. Research project, pre-1.0, three-language DSL (Domain / Style / Substance), no built-in nested-swappable-component model. Worth studying its Style language for constraint-vocabulary inspiration.
- **ELK / elkjs** (https://github.com/kieler/elkjs, EPL) — closest *practical* match for nested/hierarchical layouts. But it's auto-layout: you describe the graph, it picks positions. Would lose the authored `position: 'below'` / `'left-top'` control that's the point of rplib's DSL.
- **Cytoscape.js**, **React Flow** — support compound (nested) nodes; positioning is absolute or via a layout algorithm. No relational DSL.
- **Mermaid**, **PlantUML** — declarative diagrams-as-code but rigid; shallow nesting; no anchored relative positioning.
- **TikZ `positioning` library** — exactly the relational mental model (`right=of foo`), but LaTeX, static, no interactivity.
- **D3 + d3-hierarchy / dagre** — already in use; primitives only, not a DSL layer.

**Conclusion:** the novel piece in rplib is the *combination* — authored anchor-based DSL + recursive composition + in-place swap. Adopting Penrose or ELK wouldn't save work; it would trade a small debuggable codebase for fighting someone else's solver. Only revisit if (a) auto-layout-with-hints becomes acceptable (→ ELK) or (b) the constraint-solver direction looks worth the cost (→ Penrose).
