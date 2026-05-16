# rplib

A small SVG diagramming library built around **relational positioning** — items declare a `position` and `previous` anchor, the renderer figures out where they go. Components are JSON, recursively composable, and swappable in place. The bundled DSL is one consumer; you can bring your own by passing a `resolveView` adapter.

## Install

```sh
npm install rplib d3 katex
```

`d3` and `katex` are peer dependencies.

## Quickstart (custom views)

Skip the bundled DSL and feed resolved views directly:

```js
import RPCanvas from 'rplib';
import d3 from 'd3';

const myView = {
  properties: { modelName: 'GPT-4' },
  content: {
    A: { shape: 'box', text: { text: '{{modelName}}' } },
    B: { shape: 'box', previous: 'A', position: 'right', arrow: {} },
  },
};

const canvas = new RPCanvas(
  d3.select('#svg'),
  /* defaults */ undefined,
  /* components */ {},
  /* eventListenerTargets */ {},
  /* elementToggleCallback */ null,
  (canvas, name) => name === 'demo' ? { view: myView, isRoot: true } : null,
);
canvas.setTheme({
  SHAPE_FILL: '#fff', SHAPE_STROKE: '#222',
  ARROW_COLOR: '#222', TEXT_COLOR: ['#222'], OPACITY: 1,
});
canvas.changeViews('demo');
```

## Quickstart (bundled DSL)

```js
import RPCanvas from 'rplib';
import { parseAbstractContent } from 'rplib/parser/parseAbstractFile.js';
import { loadAbstractDefinitions, loadRootView } from 'rplib/parser/storage.js';
import * as components from './my-components.js';
import d3 from 'd3';

const canvas = new RPCanvas(d3.select('#svg'), undefined, components, {}, null);
canvas.store.abstractDefinitions = parseAbstractContent(definitionText);
loadAbstractDefinitions(canvas, localStorage);
loadRootView(canvas, localStorage, /* fallback view name */ 'my_view');
```

## API surface

| Constructor / method | What it does |
| --- | --- |
| `new RPCanvas(svgDOM, defaults?, components?, listenerTargets?, toggleCb?, resolveView?)` | Construct. Only `svgDOM` is required. |
| `canvas.setTheme(theme)` | Apply theme via CSS variables. No re-render needed for color-only changes. |
| `canvas.setReporter({ error, warn })` | Inject a diagnostics sink. Default is `console`. |
| `canvas.changeViews(name)` | Resolve, render, push undo. Throws if `name` can't be resolved. |
| `canvas.undoViewChange() / redoViewChange()` | Navigation history. |
| `canvas.on('beforeViewChange'\|'afterViewChange', fn)` | Lifecycle hooks. Payload `{ view, prevView }`. |
| `canvas.invalidateView(name?)` | Drop the cached resolved view (force re-resolve next nav). |
| `canvas.invalidateLayout(name?, ids?)` | Drop cached layouts (descendants chained via `previous` are auto-invalidated). |
| `canvas.findHierarchicalElementProperty(id, prop)` | Walk a dotted id from most-specific to least to find an inherited property. |

**Adapters** (no global state inside the lib):

- `resolveView(canvas, name) -> { view, isRoot } | null` — bring your own DSL.
- `Reporter` `{ error, warn }` — `setReporter`.
- `Storage` Web Storage-shaped `{ getItem, setItem, removeItem }` — every export in `parser/storage.js` takes one.

## Tests

```sh
npm test
```

Runs the `node:test`-based parser/serializer round-trip suite under `parser/__tests__/`. Renderer/canvas tests are still TODO.

See [NOTES.md](./NOTES.md) for the architectural assessment and prior-art survey.

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

Side effect: if your views reference detail views (via `item.details`), your resolver is responsible for populating `store.views[detailName]` for any such names it surfaces. If you want sidebars to enumerate detail views, also register them via the parser-owned API in `parser/viewStructures.js` (`setViewStructure` / `addDetailView`; apps read via `getViewStructure(name)`). The bundled parser does both recursively; see `parser/parseIntermediateFormat.js#handleDetails`.

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
