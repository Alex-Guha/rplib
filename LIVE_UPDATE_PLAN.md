# Live-update API — working plan

Internal working doc for `feature/live-update-api`. Tracks scope, decisions, and progress. Delete when the branch merges.

## Goal

Public API on `RPCanvas` so consumer GUIs (Neural-Atlas first) can let users edit abstracts and components in place — without throwing away cached layouts or doing a full SVG rebuild for every keystroke.

## Design decisions (locked)

- **Imperative mutation API**, not declarative-diff. Granular ids in, targeted invalidation out.
- **Partial re-render** — `clearCanvas()` + full redraw is unacceptable for live editing.
- **Edit history is separate from nav history.** rplib maintains both stacks; the consumer wires whichever UI buttons it wants to either one.
- **Lifecycle hooks** mirror the existing `on('beforeViewChange'/'afterViewChange', fn)` pattern: `'beforeMutate'` / `'afterMutate'` with `{ viewName, changedIds, kind }`.
- **Component edits** broadly invalidate the resolved-view cache (v1). Per-view ripple optimization is later work.
- **Selection state lives in the consumer.** rplib exposes `getItem` for read-back; it does not own which item is "selected."

## API surface

```js
// Reads
canvas.getItem(viewName, id)                 // returns the resolved-view item or null
canvas.canEditUndo() / canEditRedo()

// Mutations on a resolved view
canvas.updateItem(viewName, id, patch)       // shallow-merge; null fields delete
canvas.addItem(viewName, id, item, { before?, after? })
canvas.removeItem(viewName, id)              // descendants chained via `previous` also drop
canvas.renameItem(viewName, oldId, newId)    // rewrites `previous` refs in the view

// Mutations on authored sources (bundled DSL)
canvas.updateAbstract(name, patch)           // invalidates that view, re-resolves
canvas.updateComponent(name, patch)          // invalidates all view caches (v1)

// Escape hatch
canvas.refresh(viewName?)                    // re-resolve + re-render

// Edit history
canvas.undoEdit() / redoEdit() / clearEditHistory()

// Hooks
canvas.on('beforeMutate' | 'afterMutate', fn)  // payload: { viewName, changedIds, kind }
```

Each mutation:
1. Computes an inverse patch.
2. Applies the change (to `store.views[viewName]` or to `store.abstractDefinitions` / `canvas.components`).
3. Calls `invalidateLayout(viewName, changedIds)` — existing descendant-chain logic handles ripple.
4. Pushes the inverse onto the edit-undo stack (unless replaying).
5. Triggers a partial re-render.
6. Fires hooks.

## PR breakdown (each independently mergeable to `main`)

### PR1 — Mutation API + hooks + edit history (full-redraw under the hood)
Usable end-to-end, just unoptimized. Lets Neural-Atlas start building UI.

- [x] `getItem`, `updateItem`, `addItem`, `removeItem`, `renameItem` on `RPCanvas`
- [x] `updateAbstract`, `updateComponent`, `refresh`
- [x] `EditHistory` (new module `editHistory.js`); `undoEdit` / `redoEdit` / `clearEditHistory` / `canEditUndo` / `canEditRedo`
- [x] `'beforeMutate'` / `'afterMutate'` hooks
- [x] Re-render path: `_renderCurrent` — full redraw without nav undo/redo bookkeeping; re-resolves invalidated views
- [x] Pure mutation logic extracted to `mutate.js` so it's testable without instantiating `RPCanvas` (which transitively imports `d3` / `katex` and breaks raw node ESM)
- [x] Tests: 18 new tests in `__tests__/liveUpdate.test.js`; all 26 pass
- [x] README: "Live editing" section + new API table rows
- [x] `d3` + `katex` added as `devDependencies` for any future canvas-level tests
- [x] `npm test` script switched to default `node --test` discovery (picks up both `parser/__tests__/` and `__tests__/`)

### PR2 — Partial re-render
- [x] Audit confirmed: `utils/shapes.js`, `utils/arrows.js`, `utils/text.js` already tag nodes with the renderer-supplied `id` (and the `${id}.arrow_*` / `${id}.text_*` / `${id}.segment_*` derived ids). No retagging needed.
- [x] `renderElements(self, toggleCb, { onlyIds })` partial path added; descendant chain via `previous` expanded inside the renderer (mirrors `invalidateLayout`'s logic); removal selector `[id="X"], [id^="X."]` covers an item plus all its derived children.
- [x] `_renderCurrent(onlyIds)` and `_applyMutation` wire mutations to the partial path; `updateAbstract` / `updateComponent` and `undoEdit`/`redoEdit` for those fall back to full redraw since the view cache itself was invalidated.
- [x] Tests in `__tests__/partialRender.test.js` use a stub canvas (no jsdom needed) to assert: full-redraw path unchanged, only-ids set drawn, descendant expansion, removal selectors emitted, missing-id cleanup, embedded-quote escaping. **6 new tests; 32/32 total green.**
- [x] Skipped jsdom — the renderer is the only DOM-touching part and the d3 chain is well-mocked by a tiny stub. If we later need geometry assertions (e.g. text positioning), revisit.

### PR3 — Custom-resolveView affordances + docs
- [x] README "Live editing" / "With a custom `resolveView`" section: documents which methods apply to custom-resolver consumers (item mutations + `refresh`; abstract/component are bundled-DSL only).
- [x] Edit-history vs nav-history distinction called out explicitly in the Live editing intro.
- [x] Auto-save example via `'afterMutate'`.

## Out of scope (documented, not solved)

- Mutating during a staggered render (`renderDelay`): cancellation token handles correctness; visual behavior may surprise.
- Coalescing rapid-fire edits to the same id: last write wins. Consumer's problem.
- Persisting edit history: consumer subscribes to `'afterMutate'` and serializes patches itself.
- Per-component view-cache ripple: v1 nukes all caches on `updateComponent`. Optimize only if it shows up as a perf issue.

## Status

**Current:** PR1, PR2, and PR3 done on the branch. Ready for review / merge to `main`.

**Completed:**
- Branch `feature/live-update-api` created; plan doc written.
- New modules: `editHistory.js`, `mutate.js`.
- `canvasManager.js` extended with the full mutation surface, hooks, edit-history wiring, and partial-redraw routing.
- `renderView.js` gained an `onlyIds` partial-redraw path.
- 24 new tests across `__tests__/liveUpdate.test.js` and `__tests__/partialRender.test.js`; full suite **32/32 green** under Node 25.
- README "Live editing" section + API table updated; partial-redraw behavior + arrow-reference limitation documented.

**Next (PR3):**
- Document how the mutation API behaves with a **custom `resolveView`** consumer (item mutations + `refresh` apply; `updateAbstract` / `updateComponent` don't).
- README polish + an end-to-end example showing edit flow + auto-save via `'afterMutate'`.

**Open notes / known limitations:**
- `updateComponent` nukes the full view cache (per plan). Profiling can refine later.
- `addItem`'s default position is "append"; consumer can pass `{ before, after }`. Consumer supplies `previous` on the new item explicitly.
- `renameItem` only rewrites `previous` / `arrow.previous` in the same view. Other cross-references (text bodies, custom fields) are the consumer's responsibility.
- **Partial-redraw arrow gap:** if item A's `arrow.previous` explicitly points to B (not via A's `previous`), changing B alone won't auto-invalidate A's arrow during partial redraw. Documented in README. Fix would require the renderer to also walk arrow.previous when expanding the redraw set — small change, deferred unless this bites.
