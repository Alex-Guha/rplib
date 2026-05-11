# rplib

This library revolves around managing an area on a web page.

---

## Architectural assessment (as of 2026-05-10)

**Current focus:** improve the library in-place. Significant features still planned before any public release, and second-app reuse is a future goal — not a near-term one. The "standalone packaging" work below is deferred until reuse is imminent.

### Architectural improvements (active)

1. ~~**Inheritance is the wrong seam.**~~ **Done (2026-05-10).** App composes rather than extends — `appManager.canvas` holds the `RPCanvasManager` instance. The override was replaced with `beforeViewChange`/`afterViewChange` hooks (`canvas.on(name, fn)`). Two hooks preserve the original ordering (settings init runs while `currentView` is still the old view; nav/sidebar updates run after render). App-owned state (`currentTheme`, `sidebarState`, `settings`) lives on `appManager`; lib-owned state lives on `appManager.canvas`. Future: `elementToggleCallback` could be folded into the hook system too, but it's not blocking anything today.

2. **The class is doing five jobs.** Parsing, persistence, undo/redo, view caching, and rendering all live in one ~160-line class with everything reached via `self`. Split into:
   - `RPCanvas` — pure renderer: give it a resolved view object, it draws.
   - `ViewStore` — abstract definitions, views cache, undo/redo.
   - `Parser` / `Serializer` — pure functions, no `self`.
   - `Persistence` — adapter interface; localStorage is one implementation that ships with the lib but isn't the default.

3. **Stop mutating input data during render.** `renderView.js` writes `item.calculated`, `item.x`, `item.width`, etc. onto the parsed items. That's why `setCurrentView` "has to redraw everything" — the cached view *is* the layout state. Compute layout into a separate structure keyed by id; keep the parsed view immutable. Re-themes become a DOM attribute update, not a rebuild. (This is the same root cause behind the arrow-segment text inheritance bug — `attachListeners` mutates `item[targetName] = parentItem[targetName]` at attach time, so ordering matters.)

4. **Ship the parser separately, or not at all.** The abstract-definition DSL is Neural-Atlas-specific. A generic relational-positioning lib should accept the intermediate JSON and let apps bring their own DSL. Either move `parser/` to a separate package or document it as an optional sub-entry (`rplib/parser`) the app can opt into.

5. **The known leaks are all "app state living in the lib"** — `viewStructures`, `rootView`, `defaults.THEME`, `defaults.SHAPE` sizes. The existing TODOs in `canvasManager.js` already call this out. The fix is to invert the relationship: the lib has inherent defaults, accepts overrides per render, and never persists app concerns.

6. **Render scheduling via `setTimeout` + `currentRenderId++`** (`renderView.js`) is fragile. A single `requestAnimationFrame`-based scheduler with an explicit cancellation token would be easier to reason about and test, and the "render delay" effect can live as a decorator on top.

7. **Rename `findHeirarchicalElementProperty`** (`canvasManager.js`) before there are external consumers. Once it ships, the typo is forever.

---

### Deferred: standalone-packaging gaps

To revisit when a second app is about to consume rplib, or before a public release:

- **No `package.json` in `rplib/`**. No name, version, `main`/`exports`, or peer deps. d3 and katex are hard imports (`utils/text.js`, `utils/shapes.js`) but only declared in the app's root `package.json`.
- **No real README.** No "what it does, what you pass in, what you get back."
- **Zero tests.** Parser/serializer round-trip is unverified — both files say `// TODO Write test cases`.
- **Hard browser assumptions baked in, not injected.** `utils/storage.js` talks to `localStorage` directly. A library should take a persistence adapter, or not own persistence at all.
- **No types or JSDoc on the public surface.** The constructor signature `(svgDOM, defaults, components, eventListenerTargets, elementToggleCallback)` is five positional args with no contract.
- **No error model.** `console.error` / `console.warn` inside the lib instead of throwing or calling an injected reporter. Apps can't intercept.

---

## Prior art / existing libraries (surveyed 2026-05-10)

No single free library packages **both** declarative relational positioning with explicit anchors **and** deeply nested swappable diagram components the way rplib does. Notes for later:

- **Penrose** (https://penrose.cs.cmu.edu, MIT) — closest *conceptual* match. Declarative constraint-based diagramming for technical/math diagrams; you describe relationships and a solver lays it out. Research project, pre-1.0, three-language DSL (Domain / Style / Substance), no built-in nested-swappable-component model. Worth studying its Style language for constraint-vocabulary inspiration.
- **ELK / elkjs** (https://github.com/kieler/elkjs, EPL) — closest *practical* match for nested/hierarchical layouts. But it's auto-layout: you describe the graph, it picks positions. Would lose the authored `position: 'below'` / `'left-top'` control that's the point of rplib's DSL.
- **Cytoscape.js**, **React Flow** — support compound (nested) nodes; positioning is absolute or via a layout algorithm. No relational DSL.
- **Mermaid**, **PlantUML** — declarative diagrams-as-code but rigid; shallow nesting; no anchored relative positioning.
- **TikZ `positioning` library** — exactly the relational mental model (`right=of foo`), but LaTeX, static, no interactivity.
- **D3 + d3-hierarchy / dagre** — already in use; primitives only, not a DSL layer.

**Conclusion:** the novel piece in rplib is the *combination* — authored anchor-based DSL + recursive composition + in-place swap. Adopting Penrose or ELK wouldn't save work; it would trade a small debuggable codebase for fighting someone else's solver. Only revisit if (a) auto-layout-with-hints becomes acceptable (→ ELK) or (b) the constraint-solver direction looks worth the cost (→ Penrose).
