# rplib diagram-app

A small standalone app that exercises [`@alexguha/rplib`](../core/) and [`@alexguha/rplib-editor`](../editor/) using a set of test components and abstracts. Use it to develop and verify library changes without depending on a consumer project like Neural-Atlas.

## Run

```sh
npm install
npm start
```

Then open the printed URL (default `http://localhost:8080`).

## Layout

- `standard_items/components.json` — test components (`testText`, `testLatex`, `testEverything`, `testSwappable`, `testSegmentedArrows`).
- `standard_items/abstract_diagrams.txt` — test abstracts (`test`, `testswap`, `testarrows`) wired to the components above.
- `index.html`, `main.js` — boot the editor against the test data.
- `lib/` — small ESM shims for d3 / codemirror so the app can run from `file:`-installed deps without a bundler.

## GitHub Pages

Deployed to GitHub Pages via [.github/workflows/deploy-diagram-app.yml](../.github/workflows/deploy-diagram-app.yml) on every push to `main`. The workflow checks out the repo, runs `npm install --install-links` inside `diagram-app/` (which materializes the `file:../core` and `file:../editor` deps into `node_modules/` as real copies), and uploads the `diagram-app/` folder as the Pages artifact. The deployed site therefore mirrors `main` — including any unpublished `core` / `editor` changes.

Local dev is unaffected: the same `index.html` and importmap work both locally (against the sibling `core/` and `editor/` via `file:` deps) and on Pages (against the CI-materialized copies).
