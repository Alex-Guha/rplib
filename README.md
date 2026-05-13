# rplib

This library revolves around managing an area on a web page.

---

## Architectural assessment (as of 2026-05-10)

**Current focus:** improve the library in-place. Significant features still planned before any public release, and second-app reuse is a future goal — not a near-term one. The "standalone packaging" work below is deferred until reuse is imminent.

### Architectural improvements (active)

1. ~~**Inheritance is the wrong seam.**~~ **Done (2026-05-10).** App composes rather than extends — `appManager.canvas` holds the `RPCanvas` instance. The override was replaced with `beforeViewChange`/`afterViewChange` hooks (`canvas.on(name, fn)`). Two hooks preserve the original ordering (settings init runs while `currentView` is still the old view; nav/sidebar updates run after render). App-owned state (`currentTheme`, `sidebarState`, `settings`) lives on `appManager`; lib-owned state lives on `appManager.canvas`. Future: `elementToggleCallback` could be folded into the hook system too, but it's not blocking anything today.

2. ~~**The class is doing five jobs.**~~ **Partially done (2026-05-10).** Data state extracted into `ViewStore` (`canvas.store`): `abstractDefinitions`, `views`, `viewStructures`, `currentView`, `rootView`, `undoHistory`, `redoHistory`. Parser functions take `(store, components, name)` and no longer thread `self`. Persistence functions (`loadAbstractDefinitions`/`saveRootView`/etc.) and parser entry points (`parseAbstractContent`, `serializeAbstractDefinition`, `parseAbstractDefinitionFile`) are no longer wrapped on the canvas — callers import them directly. The canvas no longer auto-saves on view change; apps wire `saveRootView` via the `afterViewChange` hook. The canvas still coordinates render+store+hooks (`changeViews`/`undoViewChange`/`redoViewChange`/`setCurrentView`); fully separating rendering from the store is blocked on #3 because `renderView` mutates layout fields onto the cached view content. A formal Persistence-adapter interface is deferred until a non-localStorage consumer exists.

3. ~~**Stop mutating input data during render.**~~ **Done (2026-05-10).** Layout is now computed by a pure `computeItemLayout` in `rplib/layout.js` and cached in `canvas.layouts[viewName][id]`. Parsed view content stays immutable. Renderer reads authored fields from items and computed fields from the layout map; `drawSubcomponent/drawConnection/drawText` take explicit `(item, layout, id)` and never write back. Arrow segments use a local segment-layout array instead of mutating segment objects. `text.js` resolves `{{placeholder}}` substitution into a local string. `attachListeners` no longer copies parent props onto the child — `findHierarchicalElementProperty` is the read-time source of truth (fixes the arrow-segment text inheritance bug). Editing API: `canvas.invalidateLayout(viewName, ids?)` drops cached entries (descendants via `previous` are auto-invalidated). Re-themes still rebuild the DOM for now; switching to CSS variables so theme toggles become a single `style.setProperty` call is a separate, smaller follow-up.

4. ~~**Ship the parser separately, or not at all.**~~ **Reframed and done (2026-05-11).** The bundled DSL parser stays as the supported default; the boundary between it and the rest of the lib was already clean (only `canvasManager.changeViews` and `utils/storage.js` import from `parser/`). What changed: the canvas no longer hardcodes "parse abstract definitions and components on cache miss." It now takes an optional `resolveView(canvas, name) -> { view, isRoot } | null` adapter (6th constructor arg). A default resolver wires up the bundled parser and is used when none is passed, so existing callers keep working unchanged. Root-vs-detail tracking moved off `store.abstractDefinitions` and onto `store.rootViews` (Set), so the canvas no longer references DSL-specific state. One renderer leak fixed along the way: `utils/text.js` was reading `abstractDefinitions[rootView].properties` directly — now it reads `views[rootView].properties` from the resolved view (the parser already mirrors them there). The intermediate-format contract apps must produce is documented below.

5. ~~**The known leaks are all "app state living in the lib"**~~ **Partially done (2026-05-13).** The lib now ships inherent defaults in `rplib/defaults.js` (`SHAPE`, `ARROW`, and a minimal `THEME` fallback); the `defaults` constructor arg is now optional shallow overrides on top, merged via `mergeDefaults`. Theme is no longer captured from `defaults.THEME` — apps call `canvas.setTheme(theme)` instead. The view-resolution fallback to `defaults.VIEW` is gone; `changeViews` throws cleanly when a view can't be resolved and the app handles recovery. `loadRootView` takes an explicit `fallbackView` parameter rather than reaching into `canvas.defaults.VIEW`. `viewStructures` moved off `ViewStore` to parser-owned state in `rplib/parser/viewStructures.js` (module-level Map; the bundled parser writes, apps read via `getViewStructure(name)`) — apps with a custom resolver don't have to populate anything. Still open: `rootView`/`rootViews` remain on the store (legitimately shared lib/app concept — the lib reads it for `{{placeholder}}` substitution, the app reads it for sidebar/edit-menu state), and `utils/storage.js` still persists `rootView` to localStorage (already flagged in the standalone-packaging gaps below).

6. ~~**Render scheduling via `setTimeout` + `currentRenderId++`**~~ **Done (2026-05-13).** Per-item `setTimeout` is gone. The default path now renders synchronously in one pass; cancellation runs on an explicit `RenderToken` (`canvas.currentRenderToken`) that any new render replaces — in-flight item draws check `token.cancelled` instead of comparing increments. The "render delay" effect is now a `scheduleStaggered` strategy in `renderView.js` that drives the same per-item draw function via `requestAnimationFrame` with a frame-gap proportional to view size, so it stays cleanly separable from the core render loop.

7. ~~**Rename `findHeirarchicalElementProperty`**~~ **Done (2026-05-13).** Renamed to `findHierarchicalElementProperty` on `RPCanvas`; the four app-side call sites in `core/sidebar.js` and the doc comments in `rplib/utils/{attachListeners,text,arrows}.js` were updated.

---

## Intermediate format

The canvas renders a resolved "view" — a flat JSON structure produced by either the bundled DSL parser or an app-provided `resolveView` adapter. If you want to skip the bundled DSL, your resolver returns objects shaped as follows.

### Resolver

```js
resolveView(canvas, name) -> { view, isRoot } | null
```

- `view` — a resolved view object (shape below).
- `isRoot` — `true` for top-level views (only roots own `properties` for placeholder substitution; the canvas tracks them in `store.rootViews` and updates `store.rootView`). `false` for detail/sub views.
- Return `null` if the name is unknown; the canvas will fall back to `defaults.VIEW` and throw.

Side effect: if your views reference detail views (via `item.details`), your resolver is responsible for populating `store.views[detailName]` for any such names it surfaces, and `store.viewStructures[name]` if you want sidebars to enumerate them. The bundled parser does this recursively; see `parser/parseIntermediateFormat.js#handleDetails`.

### View

```ts
{
  properties?: { [name: string]: string },   // root-only; used for {{name}} substitution in text
  content: { [id: string]: Item },           // render order = insertion order
  settings?: any[],                          // optional; passed through, treated as set-like by parser
  references?: any[],                        // optional; same
  // ...other top-level fields are passed through untouched
}
```

### Item

Authored fields the renderer reads:

```ts
{
  shape?: 'rectangle' | 'parallelogram' | 'trapezoid' | 'triangle' | ...,
  width?, height?, opacity?, count?, flipped?, shortSide?,

  // Layout, relative to the `previous` item:
  position?: 'above' | 'below' | 'left' | 'right' | 'left-top' | 'right-bottom' | ...,
  previous?: string,                          // id of the anchor item
  x?, y?, xSpacing?, ySpacing?, separation?,  // overrides; defaults come from `defaults.SHAPE`

  // Text (zero or more):
  text?:  { text: string,    position?, xOffset?, yOffset?, ... } | array,
  latexText also supported via `latexText` on a text object,

  // Arrows from `previous` to this item:
  arrow?: ArrowObject | ArrowObject[],

  // Navigation:
  details?: string,                           // name of a detail view to drill into
  description?: string, references?: any[],   // sidebar payloads
}
```

The renderer never writes back to items. Derived layout lives separately in `canvas.layouts[viewName][id]` (`{ x, y, width, height, xSpacing, ySpacing }`), keyed off the item's id, and is invalidated via `canvas.invalidateLayout(viewName, ids?)`.

### Minimal example

```js
const myView = {
  properties: { modelName: 'GPT-4' },
  content: {
    A: { shape: 'rectangle', text: { text: '{{modelName}}' } },
    B: { shape: 'rectangle', previous: 'A', position: 'right', arrow: {} },
  },
};

const canvas = new RPCanvas(svg, defaults, /* components */ {}, listeners, toggleCb,
  (canvas, name) => name === 'demo' ? { view: myView, isRoot: true } : null
);
canvas.changeViews('demo');
```

The bundled DSL on top of this is `parser/parseAbstractFile.js` (text → intermediate definitions) and `parser/parseIntermediateFormat.js` (definitions + components → resolved views). Apps that want their own DSL bypass both and feed resolved views directly.

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
