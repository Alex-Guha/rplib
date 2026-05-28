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
| `canvas.getItem(viewName, id)` | Read an item from a resolved view. Returns `null` if missing. |
| `canvas.updateItem(viewName, id, patch)` | Shallow-merge patch into an item. `null` deletes a key. |
| `canvas.addItem(viewName, id, item, {before?, after?})` | Insert an item; defaults to appending. |
| `canvas.removeItem(viewName, id)` / `renameItem(viewName, oldId, newId)` | Remove / rename, rewriting `previous` refs on rename. |
| `canvas.updateAbstract(name, patch)` / `updateComponent(name, patch)` | Patch authored sources; auto-invalidates cached views. |
| `canvas.refresh(viewName?)` | Re-resolve + re-render. Not recorded on edit history. |
| `canvas.undoEdit() / redoEdit() / canEditUndo() / canEditRedo() / clearEditHistory()` | Edit history (separate from nav). |
| `canvas.on('beforeMutate'\|'afterMutate', fn)` | Lifecycle hooks. Payload `{ viewName, changedIds, kind }`. |

**Adapters** (no global state inside the lib):

- `resolveView(canvas, name) -> { view, isRoot } | null` — bring your own DSL.
- `Reporter` `{ error, warn }` — `setReporter`.
- `Storage` Web Storage-shaped `{ getItem, setItem, removeItem }` — every export in `parser/storage.js` takes one.

## Tests

```sh
npm test
```

Runs the `node:test`-based parser/serializer round-trip suite under `parser/__tests__/` plus the live-update mutation and partial-redraw suites under `__tests__/` (the latter exercises `renderView` against a stubbed canvas — no DOM). Full d3/DOM renderer tests are still TODO.

## Live editing

`canvas.updateItem`, `addItem`, `removeItem`, `renameItem` mutate the cached
resolved view in place and re-render. `updateAbstract` / `updateComponent`
patch the authored DSL sources and invalidate the relevant view cache.
Every mutation pushes an inverse onto the **edit history** (separate from the
navigation history) — call `canvas.undoEdit() / redoEdit()` to roll edits
back, independent of `undoViewChange() / redoViewChange()`.

```js
canvas.changeViews('demo');

// Patch an item.
canvas.updateItem('demo', 'A', { width: 200, opacity: 0.5 });

// Insert one after an existing anchor.
canvas.addItem('demo', 'X', { shape: 'box', previous: 'A', position: 'right' }, { after: 'A' });

// Subscribe (e.g. to drive auto-save).
canvas.on('afterMutate', ({ viewName, changedIds, kind }) => {
  saveToLocalStorage();
});

canvas.undoEdit();
```

Mutations on resolved-view items (`updateItem`, `addItem`, `removeItem`,
`renameItem`) trigger a **partial redraw**: only the changed ids and their
`previous`-chain descendants are removed from the SVG and redrawn. Mutations
on authored sources (`updateAbstract`, `updateComponent`) invalidate the view
cache and do a full redraw on the next render. Edit history is per-canvas
and not persisted — subscribe to `'afterMutate'` if you want to serialize
patches yourself.

**Known limitation:** if item A's `arrow.previous` explicitly references B (not
A's own `previous`), changing B does not auto-invalidate A's arrow during
partial redraw. Workaround: include A in your own changed-ids set, or call
`canvas.refresh()` for a full redraw.

### With a custom `resolveView`

Consumers that bring their own DSL (skip the bundled parser) should use the
**item-level** mutations only — `getItem`, `updateItem`, `addItem`, `removeItem`,
`renameItem`. These operate directly on the resolved view in `store.views[name]`
and don't care where it came from. `updateAbstract` / `updateComponent` are
bundled-DSL-only and will warn if the name isn't found.

If your custom resolver reads from an external source-of-truth that changes
outside rplib (e.g. an app store the user edits via their own UI), call
`canvas.refresh(viewName)` to force a re-resolve + redraw. `refresh` is the
escape hatch and does **not** record on the edit-history stack.

See [../feedback/NOTES.md](../feedback/NOTES.md) for the architectural assessment and prior-art survey.

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
  shape?: 'box' | 'triangle' | 'trapezoid',
  width?, height?, opacity?, count?, flipped?, shortSide?,
  // `count` stacks `count` copies of the shape, offset by xSpacing/ySpacing.
  // `flipped` mirrors triangle/trapezoid; `shortSide` is the trapezoid's short edge length.

  // Layout, relative to the `previous` item. Unknown values fall through to 'right'.
  position?: 'above' | 'below' | 'left' | 'right',
  previous?: string,                          // id of the anchor item
  x?, y?, xSpacing?, ySpacing?, separation?,  // overrides; defaults come from `defaults.SHAPE`

  // Text (zero or more). A text object may use `text` (plain) or `latexText` (KaTeX).
  // `position` is `'<vertical>'` or `'<vertical>-<side>'`, where vertical is one of
  // 'top' | 'bottom' | 'left' | 'right' | 'center' (default 'top') and side is one of
  // 'left' | 'right' | 'top' | 'bottom' | 'center' (default 'center'). `color` is either
  // a numeric palette index (1-based into theme.TEXT_COLOR) or a CSS color string.
  text?:  { text?: string, latexText?: string, position?, xOffset?, yOffset?, color? }
        | Array<{ ... }>,

  // Arrows from `previous` to this item. See `core/utils/arrows.js` for segmented-arrow shape.
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
    A: { shape: 'box', text: { text: '{{modelName}}' } },
    B: { shape: 'box', previous: 'A', position: 'right', arrow: {} },
  },
};

const canvas = new RPCanvas(svg, defaults, /* components */ {}, listeners, toggleCb,
  (canvas, name) => name === 'demo' ? { view: myView, isRoot: true } : null
);
canvas.changeViews('demo');
```

The bundled DSL on top of this is `parser/parseAbstractFile.js` (text → intermediate definitions) and `parser/parseIntermediateFormat.js` (definitions + components → resolved views). Apps that want their own DSL bypass both and feed resolved views directly.
