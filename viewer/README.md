# @alexguha/rplib-viewer

A read-only diagram-viewer UI built on top of [`@alexguha/rplib`](../core/). Same canvas, sidebar, navigation, theming, and info overlay as [`@alexguha/rplib-editor`](../editor/) — without the authoring features.

Use when you want to publish or embed static diagrams without exposing the abstract / component editors, advanced import-export settings, or any of the editor's dependencies (e.g. CodeMirror).

## Install

```sh
npm install @alexguha/rplib @alexguha/rplib-viewer d3 katex
```

`@alexguha/rplib`, `d3`, and `katex` are peer dependencies.

## Quickstart

Lay out your data as:

```
data/
  abstracts/   # any number of *.txt files (rplib-DSL), any names
  components/  # any number of *.json / *.js files, nested freely
```

Generate the runtime manifest before serving:

```sh
npx rplib-build-data ./data
```

Then boot:

```js
import { createViewer } from '@alexguha/rplib-viewer';

const manager = await createViewer({
  dataDir: './data',
  labels: {
    abstract: { singular: 'Architecture', plural: 'Architectures' },
  },
});

manager.restoreView('default_view');         // fallback if no saved view in localStorage
```

See [`@alexguha/rplib-editor` README](../editor/README.md#data-directory-layout) for the full data-directory contract (it's identical between the two packages). Bundler users can pass pre-aggregated `data: { abstractDefinitions, components }` instead of `dataDir`.

The consumer also needs to:

1. Load `@alexguha/rplib-viewer/styles.css` somewhere in the page.
2. Provide an `#svg` element and a `#sidebar` container holding an `#info` and a `#panels` child — the viewer mounts into these by id. (`#info` is the description pane; `#panels` is the configurable panel region.)
3. If running directly in the browser (no bundler), declare an importmap so bare specifiers resolve:

   ```html
   <script type="importmap">
   {
     "imports": {
       "d3": "./node_modules/d3/.../d3.js",
       "katex": "./node_modules/katex/dist/katex.mjs",
       "@alexguha/rplib": "./node_modules/@alexguha/rplib/index.js",
       "@alexguha/rplib/parser": "./node_modules/@alexguha/rplib/parser/index.js",
       "@alexguha/rplib/panel": "./node_modules/@alexguha/rplib/panel.js",
       "@alexguha/rplib/": "./node_modules/@alexguha/rplib/",
       "@alexguha/rplib-viewer": "./node_modules/@alexguha/rplib-viewer/index.js",
       "@alexguha/rplib-viewer/": "./node_modules/@alexguha/rplib-viewer/"
     }
   }
   </script>
   ```

## `createViewer(config)`

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `dataDir` | string | one of | URL/path to a `data/` directory containing `abstracts/`, `components/`, and a `manifest.json` produced by `rplib-build-data`. |
| `data` | object | one of | Pre-aggregated `{ abstractDefinitions, components }`. Escape hatch for bundler users. |
| `labels` | object | no | Terminology overrides, e.g. `{ abstract: { singular: 'Architecture', plural: 'Architectures' } }`. Used in the views menu. |
| `themes` | object | no | Extra named theme palettes merged on top of the built-ins (`default`, `dark`, `light`). Host-supplied themes win on name collisions. |
| `repoUrl` | string | no | URL the GitHub button in the lower-left links to. Omit to leave the button inert. Reassignable at runtime via `manager.setRepoUrl(url)`. |
| `storage` | Storage | no | `{ getItem, setItem, removeItem }` adapter for persisting the user's theme + toggle preferences. Defaults to global `localStorage` in browser hosts. |
| `reporter` | `{error, warn}` | no | Diagnostics sink. Defaults to `console`. |
| `panels` | array | no | Ordered [panel definitions](#panels) rendered into the sidebar content region. Defaults to `[]` (empty region). **References is no longer built in** — supply a references panel to render it. |

Returns an `AppManager` exposing:

- `restoreView(fallbackView)` — restore the previously-viewed abstract, falling back to `fallbackView` if none saved.
- `setRepoUrl(url)` — reassign the lower-left GitHub button.
- `canvas` — the underlying `RPCanvas` instance.

## Panels

The sidebar content region renders an ordered array of **panel** definitions you
supply via `panels`. References is no longer special — it's just a panel keyed to
the `references` property, built from
[`@alexguha/rplib/panel`](../core/README.md#panels-alexguharplibpanel). Omit
`panels` and the region is empty (errors still take it over transiently).

The viewer is read-only, so only the display half of a panel def matters (`name`,
`title`, `property`/`resolve`, `render`, `showWhen`, `theme`); editability fields
(`itemFields` / `renderEditor`) are ignored. The editor README has the canonical
[references recipe](../editor/README.md#getting-references-back-canonical-recipe)
— the same `definePanel({...})` works here. Panels use `PANEL_BACKGROUND`
(`--panel-background-color`) by default; a panel may declare
`theme: { background: '<THEME_KEY>' }` to use a different palette key. The
sidebar content region is the host-supplied `#panels` element.

## Differences vs `@alexguha/rplib-editor`

- No edit button, no abstract / component editors, no edit-history undo/redo.
- No advanced settings (no custom-abstract import/export, no custom-component management, no mass import).
- No CodeMirror or related dependencies — viewer bundle is materially smaller.
- Persistence is limited to display preferences (theme, view-level toggles, last-viewed root) — user-authored content is not stored.

## License

ISC
