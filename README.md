# rplib (workspace)

Monorepo for two related packages:

- [**`core/`**](./core/) — `rplib`: the relational-positioning diagram library. Anchor-based DSL, recursive composition, in-place component swap. See [core/README.md](./core/README.md) for the API.
- [**`editor/`**](./editor/) — `rplib-editor`: a generic diagram-editor UI built on top of `rplib`. Consumers provide components + data; the editor handles canvas, sidebar, themes, settings. See [editor/README.md](./editor/README.md).

Both packages publish independently. Consumers can depend on `rplib` alone (headless) or pair it with `rplib-editor` for an out-of-the-box authoring UI.

## Install

```sh
# headless rplib
npm install rplib d3 katex

# with the editor
npm install rplib rplib-editor d3 katex
```

`d3` and `katex` are peer dependencies of both packages.

## Local development

This repo uses npm workspaces. From the root:

```sh
npm install         # links core ↔ editor and installs shared deps
npm test            # runs core's test suite
```

See [LOCAL_DEV.md](./LOCAL_DEV.md) for how to consume both packages from a sibling app via `file:` deps.

## Repo layout

```
rplib/
├── core/                # `rplib` package (library)
├── editor/              # `rplib-editor` package (UI on top of rplib)
├── feedback/            # design notes, code-review artifacts, architecture assessments
├── LOCAL_DEV.md         # how to consume from a sibling app
└── LIVE_UPDATE_PLAN.md  # roadmap for the live-update API
```
