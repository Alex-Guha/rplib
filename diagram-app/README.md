# rplib diagram-app

A small standalone app that exercises [`rplib`](../core/) and [`rplib-editor`](../editor/) using a set of test components and architectures. Use it to develop and verify library changes without depending on a consumer project like Neural-Atlas.

## Run

```sh
npm install
npm start
```

Then open the printed URL (default `http://localhost:8080`).

## Layout

- `standard_items/components.js` — test components (`testText`, `testLatex`, `testEverything`, `testSwappable`, `testSegmentedArrows`).
- `standard_items/architectures.txt` — test architectures (`test`, `testswap`, `testarrows`) wired to the components above.
- `index.html`, `main.js` — boot the editor against the test data.
- `lib/` — small ESM shims for d3 / codemirror so the app can run from `file:`-installed deps without a bundler.

## GitHub Pages

The app is plain static HTML + ESM and intended to be deployable to GitHub Pages later. `npm install` materializes `node_modules/rplib` and `node_modules/rplib-editor` from the sibling folders (`file:../core`, `file:../editor`), so the deployed bundle is self-contained once `node_modules/` is included in what gets published.
