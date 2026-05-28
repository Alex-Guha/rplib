# rplib-editor

A generic diagram-editor UI built on top of [`rplib`](../core/). You supply components (visual building blocks) and a data source (rplib-DSL abstract definitions — see [DSL.md](./DSL.md)); the editor handles canvas wiring, sidebar, navigation, theme switching, and settings persistence to `localStorage`.

The editor knows nothing about your domain. Labels, theme palettes, and storage are all overridable.

## Install

```sh
npm install rplib rplib-editor d3 katex
```

`rplib`, `d3`, and `katex` are peer dependencies.

## Quickstart

```js
import { createEditor } from 'rplib-editor';
import * as components from './my-components.js';

const manager = await createEditor({
  components,
  dataSource: './my-abstracts.txt',         // path or pre-parsed definitions object
  labels: {
    abstract: { singular: 'Architecture', plural: 'Architectures' },
  },
});

manager.restoreView('default_view');         // fallback if no saved view in localStorage
```

The consumer also needs to:

1. Load `rplib-editor/styles.css` somewhere in the page (`<link>` or bundler).
2. Provide an `#svg` element and a `#sidebar` container in the HTML — the editor mounts into these by id.
3. If running directly in the browser (no bundler), declare an importmap so bare specifiers resolve:

   ```html
   <script type="importmap">
   {
     "imports": {
       "d3": "./node_modules/d3/.../d3.js",
       "katex": "./node_modules/katex/dist/katex.mjs",
       "rplib": "./node_modules/rplib/canvasManager.js",
       "rplib/": "./node_modules/rplib/",
       "rplib-editor": "./node_modules/rplib-editor/index.js",
       "rplib-editor/": "./node_modules/rplib-editor/"
     }
   }
   </script>
   ```

See [Neural-Atlas](https://github.com/Alex-Guha/Neural-Atlas) for a complete consumer example.

## `createEditor(config)`

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `components` | object | yes | Component definitions consumed by rplib (the visual building blocks your DSL references). |
| `dataSource` | string \| object | yes | Path to an abstract-definitions text file, **or** a pre-parsed definitions object. |
| `labels` | object | no | Terminology overrides, e.g. `{ abstract: { singular: 'Architecture', plural: 'Architectures' } }`. Affects sidebar copy. |
| `themes` | object | no | Extra named theme palettes merged on top of the editor's built-ins. Host-supplied themes win on name collision. |

Returns a promise resolving to the `AppManager` instance.

### `AppManager`

| Property / method | Description |
| --- | --- |
| `manager.canvas` | The underlying [`RPCanvas`](../core/README.md) instance. Use this for any direct rplib operation. |
| `manager.labels` | Resolved labels (defaults merged with overrides). |
| `manager.themes` | Resolved theme map (built-ins + extras). |
| `manager.restoreView(fallback)` | Load the last saved root view from `localStorage`, falling back to `fallback` if none. |

For lower-level needs (programmatic edits, custom navigation), reach through `manager.canvas` — that's the full rplib API surface.

## Persistence

The editor reads from and writes to `localStorage` for:

- The current root view name (so reloading restores the user's last position)
- User-saved abstract definitions on top of the bundled `dataSource`
- Settings (theme choice, rendering delay, etc.)

If you need a non-`localStorage` storage backend, use rplib's storage adapter API directly via `manager.canvas` — but at that point you may want to bypass `createEditor` and wire your own UI.

## What's in the editor vs. what's in rplib core

| In `rplib` core | In `rplib-editor` |
| --- | --- |
| Resolved-view rendering, layout, theme application | Sidebar, settings menu, edit menu, view-picker, navigation breadcrumbs |
| DSL parser, serializer, view structures | Theme palette catalog, settings persistence |
| Mutation API (`updateItem`, `addItem`, …) and edit history | UI bindings that call the mutation API in response to user actions |

If you want a headless rplib (no UI), depend on `rplib` alone and bring your own view layer.
