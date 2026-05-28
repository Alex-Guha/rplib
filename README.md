# rplib (workspace)

Monorepo for three related packages:

- [**`core/`**](./core/) — `rplib`: the relational-positioning diagram library. Anchor-based DSL, recursive composition, in-place component swap. See [core/README.md](./core/README.md) for the API.
- [**`editor/`**](./editor/) — `rplib-editor`: a generic diagram-editor UI built on top of `rplib`. Consumers provide components + data; the editor handles canvas, sidebar, themes, settings, and authoring. See [editor/README.md](./editor/README.md).
- [**`viewer/`**](./viewer/) — `rplib-viewer`: a read-only counterpart to `rplib-editor`. Same canvas / sidebar / navigation, none of the editing features. Intended for lightweight static-diagram deployments. See [viewer/README.md](./viewer/README.md).

All three packages publish independently. Consumers can depend on `rplib` alone (headless), pair it with `rplib-viewer` for a read-only embed, or pair it with `rplib-editor` for full authoring.

## Install

```sh
# headless rplib
npm install rplib d3 katex

# read-only viewer
npm install rplib rplib-viewer d3 katex

# with the editor
npm install rplib rplib-editor d3 katex
```

`d3` and `katex` are peer dependencies of all three packages.

## Local development

This repo uses npm workspaces. From the root:

```sh
npm install         # links core ↔ editor ↔ viewer and installs shared deps
npm test            # runs core's test suite
```