# @alexguha/rplib-viewer

A read-only diagram-viewer UI built on top of [`@alexguha/rplib`](../core/). Same canvas, sidebar, navigation, theming, and info overlay as [`@alexguha/rplib-editor`](../editor/) — without the authoring features.

Use when you want to publish or embed static diagrams without exposing the abstract / component editors, advanced import-export settings, or any of the editor's dependencies (e.g. CodeMirror).

## Install

```sh
npm install @alexguha/rplib @alexguha/rplib-viewer d3 katex
```

`@alexguha/rplib`, `d3`, and `katex` are peer dependencies.

## Quickstart

```js
import { createViewer } from '@alexguha/rplib-viewer';
import * as components from './my-components.js';

const manager = await createViewer({
  components,
  dataSource: './my-abstracts.txt',         // path or pre-parsed definitions object
  labels: {
    abstract: { singular: 'Architecture', plural: 'Architectures' },
  },
});

manager.restoreView('default_view');         // fallback if no saved view in localStorage
```

The consumer also needs to:

1. Load `@alexguha/rplib-viewer/styles.css` somewhere in the page.
2. Provide an `#svg` element and a `#sidebar` container in the HTML — the viewer mounts into these by id.
3. If running directly in the browser (no bundler), declare an importmap so bare specifiers resolve:

   ```html
   <script type="importmap">
   {
     "imports": {
       "d3": "./node_modules/d3/.../d3.js",
       "katex": "./node_modules/katex/dist/katex.mjs",
       "@alexguha/rplib": "./node_modules/@alexguha/rplib/index.js",
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
| `components` | object | yes | Component definitions consumed by rplib (the visual building blocks your DSL references). |
| `dataSource` | string \| object | yes | Path to an abstract-definitions text file, **or** a pre-parsed definitions object. |
| `labels` | object | no | Terminology overrides, e.g. `{ abstract: { singular: 'Architecture', plural: 'Architectures' } }`. Used in the views menu. |
| `themes` | object | no | Extra named theme palettes merged on top of the built-ins (`default`, `dark`, `light`). Host-supplied themes win on name collisions. |
| `repoUrl` | string | no | URL the GitHub button in the lower-left links to. Omit to leave the button inert. Reassignable at runtime via `manager.setRepoUrl(url)`. |
| `storage` | Storage | no | `{ getItem, setItem, removeItem }` adapter for persisting the user's theme + toggle preferences. Defaults to global `localStorage` in browser hosts. |
| `reporter` | `{error, warn}` | no | Diagnostics sink. Defaults to `console`. |

Returns an `AppManager` exposing:

- `restoreView(fallbackView)` — restore the previously-viewed abstract, falling back to `fallbackView` if none saved.
- `setRepoUrl(url)` — reassign the lower-left GitHub button.
- `canvas` — the underlying `RPCanvas` instance.

## Differences vs `@alexguha/rplib-editor`

- No edit button, no abstract / component editors, no edit-history undo/redo.
- No advanced settings (no custom-abstract import/export, no custom-component management, no mass import).
- No CodeMirror or related dependencies — viewer bundle is materially smaller.
- Persistence is limited to display preferences (theme, view-level toggles, last-viewed root) — user-authored content is not stored.

## License

ISC
