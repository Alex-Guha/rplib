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
2. Provide an `#svg` element and a `#sidebar` container holding an `#info` and a `#panels` child — the editor mounts into these by id. (`#info` is the description pane; `#panels` is the configurable panel region.)
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
| `panels` | array | no | Ordered [panel definitions](#panels) rendered into the sidebar content region. Defaults to `[]` (empty region). **References is no longer built in** — supply a references panel to render it. |

Returns a promise resolving to the `AppManager` instance.

## Panels

The sidebar content region (the box below `#info`) renders an ordered array of
**panel** definitions you supply via `panels`. References is no longer special —
it's just a panel keyed to the `references` property. Panels are built from
[`@alexguha/rplib/panel`](../core/README.md#panels-alexguharplibpanel); each owns
its display, its editor (in the component editor), and its data key.

Omit `panels` (or pass `[]`) and the region is empty; errors and confirmation
dialogs still work (they take over the region transiently).

### Getting references back (canonical recipe)

```js
import { definePanel } from '@alexguha/rplib/panel';
import { createEditor } from '@alexguha/rplib-editor';

const referencesPanel = definePanel({
  name: 'references',
  title: 'References',
  property: 'references',                 // → ctx.resolveProperty('references')
  showWhen: (data) => !!data && Object.keys(data).length > 0,

  // Editability: references is stored as an object keyed by title, so the
  // component editor renders a list whose `title` field doubles as that key.
  itemKey: 'title',
  itemFields: { title: 'text', link: 'text', info: 'textarea', authors: 'list', refType: 'text' },

  render(container, refs, ctx) {
    const list = document.createElement('ul');
    list.id = 'references-list';
    Object.entries(refs).forEach(([title, ref]) => {
      const a = document.createElement('a');
      a.href = ref.link || '#';
      a.target = '_blank';
      a.textContent = title + (ref.refType ? ` (${ref.refType})` : '');
      a.dataset.info =
        (ref.title   ? `**Reference Name:** ${ref.title}\n\n` : '') +
        (ref.info    ? `**Description:** ${ref.info}\n\n` : '') +
        (ref.authors?.length ? `**Authors:**\n${ref.authors.map(x => `• ${x}`).join('\n')}\n\n` : '') +
        (ref.refType ? `**Link type:** ${ref.refType}\n\n` : '');
      ctx.attachHoverPreview(a);
      const li = document.createElement('li'); li.appendChild(a);
      list.appendChild(li);
    });
    container.appendChild(list);
  },
});

const manager = await createEditor({ dataDir: './data', panels: [referencesPanel] });
```

The `references:` DSL data and your data files need no edits — the renderer just
calls `ctx.resolveProperty('references')`. A panel that declares neither
`itemFields` nor `renderEditor` is edited as raw JSON in the component editor.

### Theming

Panels without a `theme` use `PANEL_BACKGROUND` (`--panel-background-color`). A
panel may declare `theme: { background: '<THEME_KEY>' }` to use a different key —
the key must exist in every active theme palette (supply your own via the
`themes` option). The sidebar content region is the host-supplied `#panels`
element (a bare flex layout region); the card styling lives on `.rplib-panel`.

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
