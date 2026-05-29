# @alexguha/rplib-editor

A generic diagram-editor UI built on top of [`@alexguha/rplib`](../core/). You supply a `data/` directory containing components (visual building blocks) and rplib-DSL abstract definitions (see [DSL.md](./DSL.md)); the editor handles canvas wiring, sidebar, navigation, theme switching, and settings persistence to `localStorage`.

The editor knows nothing about your domain. Labels, theme palettes, and storage are all overridable.

## Install

```sh
npm install @alexguha/rplib @alexguha/rplib-editor d3 katex
```

`@alexguha/rplib`, `d3`, and `katex` are peer dependencies.

## Quickstart

Lay out your data as:

```
data/
  abstracts/   # any number of *.txt files (rplib-DSL), any names
  components/  # any number of *.json / *.js files, nested freely
```

Before serving the app, generate the manifest the runtime fetches:

```sh
npx rplib-build-data ./data
```

The recommended wiring is an npm script:

```json
{
  "scripts": {
    "build:data": "rplib-build-data ./data",
    "prestart": "npm run build:data",
    "predev": "npm run build:data"
  }
}
```

Then boot:

```js
import { createEditor } from '@alexguha/rplib-editor';

const manager = await createEditor({
  dataDir: './data',
  labels: {
    abstract: { singular: 'Architecture', plural: 'Architectures' },
  },
});

manager.restoreView('default_view');         // fallback if no saved view in localStorage
```

Bundler users (Vite's `import.meta.glob`, webpack `require.context`) can skip the CLI and pass pre-aggregated input instead — see [`data` escape hatch](#pre-aggregated-data-escape-hatch) below.

The consumer also needs to:

1. Load `@alexguha/rplib-editor/styles.css` somewhere in the page (`<link>` or bundler).
2. Provide an `#svg` element and a `#sidebar` container in the HTML — the editor mounts into these by id.
3. If running directly in the browser (no bundler), declare an importmap so bare specifiers resolve:

   ```html
   <script type="importmap">
   {
     "imports": {
       "d3": "./node_modules/d3/.../d3.js",
       "katex": "./node_modules/katex/dist/katex.mjs",
       "@alexguha/rplib": "./node_modules/@alexguha/rplib/index.js",
       "@alexguha/rplib/": "./node_modules/@alexguha/rplib/",
       "@alexguha/rplib-editor": "./node_modules/@alexguha/rplib-editor/index.js",
       "@alexguha/rplib-editor/": "./node_modules/@alexguha/rplib-editor/"
     }
   }
   </script>
   ```

See [Neural-Atlas](https://github.com/Alex-Guha/Neural-Atlas) for a complete consumer example.

## `createEditor(config)`

Exactly one of `dataDir` or `data` is required.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `dataDir` | string | one of | URL/path to a `data/` directory containing `abstracts/`, `components/`, and a `manifest.json` produced by `rplib-build-data`. Resolved relative to the page. |
| `data` | object | one of | Pre-aggregated `{ abstractDefinitions, components }`. Escape hatch for bundler users who aggregate their own way. |
| `labels` | object | no | Terminology overrides, e.g. `{ abstract: { singular: 'Architecture', plural: 'Architectures' } }`. Affects sidebar copy. |
| `themes` | object | no | Extra named theme palettes merged on top of the editor's built-ins. Host-supplied themes win on name collision. |
| `repoUrl` | string | no | URL the lower-left GitHub button links to. Omitted → button is rendered but inert. Reassign at runtime via `manager.setRepoUrl(url)`. |
| `storage` | object | no | `{ getItem, setItem, removeItem }` adapter. Defaults to `localStorage` when available. |
| `reporter` | object | no | `{ error, warn }` diagnostics sink. Defaults to `console`. |

Returns a promise resolving to the `AppManager` instance.

### Pre-aggregated `data` escape hatch

```js
import * as componentsA from './data/components/foo.js';
import componentsB from './data/components/bar.json' with { type: 'json' };
import { parseAbstractContent } from '@alexguha/rplib/parser';
import abstractsRaw from './data/abstracts/main.txt?raw';

const manager = await createEditor({
  data: {
    abstractDefinitions: parseAbstractContent(abstractsRaw),
    components: { ...componentsA, ...componentsB },
  },
});
```

### Data directory layout

`rplib-build-data <dataDir>` walks `<dataDir>/abstracts/**.txt` and
`<dataDir>/components/**.{json,js}` and writes `<dataDir>/manifest.json`. File
and folder names inside `abstracts/` and `components/` are arbitrary — the
runtime aggregates everything listed in the manifest. The manifest is meant to
be regenerated on every dev/build (gitignore it). On duplicate component keys
across files, later files override earlier ones and a warning is emitted via
`reporter.warn`.

`.js` component files must be ESM (`export const name = …` or a default
export of `{ [name]: … }`) and served with a `text/javascript`/`application/javascript`
content type — they're loaded via dynamic `import()`.

### `AppManager`

| Property / method | Description |
| --- | --- |
| `manager.canvas` | The underlying [`RPCanvas`](../core/README.md) instance. Use this for any direct rplib operation. |
| `manager.labels` | Resolved labels (defaults merged with overrides). |
| `manager.themes` | Resolved theme map (built-ins + extras). |
| `manager.restoreView(fallback)` | Load the last saved root view from `localStorage`, falling back to `fallback` if none. |
| `manager.setRepoUrl(url)` | Update (or clear, with `null`) the GitHub button's link target after boot. |

For lower-level needs (programmatic edits, custom navigation), reach through `manager.canvas` — that's the full rplib API surface.

## Persistence

The editor reads from and writes to `localStorage` for:

- The current root view name (so reloading restores the user's last position)
- User-saved abstract definitions on top of the bundled `dataDir`
- Settings (theme choice, rendering delay, etc.)

If you need a non-`localStorage` storage backend, use rplib's storage adapter API directly via `manager.canvas` — but at that point you may want to bypass `createEditor` and wire your own UI.

## What's in the editor vs. what's in rplib core

| In `@alexguha/rplib` core | In `@alexguha/rplib-editor` |
| --- | --- |
| Resolved-view rendering, layout, theme application | Sidebar, settings menu, edit menu, view-picker, navigation breadcrumbs |
| DSL parser, serializer, view structures | Theme palette catalog, settings persistence |
| Mutation API (`updateItem`, `addItem`, …) and edit history | UI bindings that call the mutation API in response to user actions |

If you want a headless rplib (no UI), depend on `@alexguha/rplib` alone and bring your own view layer.
