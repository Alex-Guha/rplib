### Core Features
#### Editing and Exporting
- Consider what the references box could be used for. Maybe that becomes the text entry field for the component editing mode, where a user can select "Edit info" and type in this.
- When users want to move components inside components, auto create an empty point before the componet with no separation and move that, implicitly repositioning the component without requiring edits to it
- click-to-set-previous
- `swapModules`-style content overrides on imported component references (and the per-item `class` field that enables them)
- full UI for multi-segment arrows (`arrow.segments[]` shown read-only).

### Genericize the reference box

### QoL
#### Make double-clickable items more noticeable, and add a notice at the top or bottom of the info box to tell the user the item is clickable
- Potentially use the hover color to make it clearer
#### Make component settings view specific so that setting ids can be reused in different views
#### Element hover issue
- Force the element hover styling when the element's text is clicked as well
- Will probably be more tricky to implement than it has any right to be

### `idMap` lookups can silently produce `undefined`
- File: [core/parser/parseIntermediateFormat.js:156-165](core/parser/parseIntermediateFormat.js#L156-L165)
- `arrow.previous = idMap[arrow.previous]` (and similar) assumes the referenced id has already been processed and renamed. If `previous` points forward, or sits in a nested component scope, the lookup yields `undefined` and the reference chain breaks silently. The `XXX` comment near line 107 suggests the author already suspects the scope is off.
- Why it matters: hard-to-debug layout/render bugs as components nest more. Will get worse as live-update edits arbitrary slices of the tree.
- Suggested refactor: do a pre-pass to collect all ids, validate `previous`/`next` references after rename, and either warn or pass `idMap` down through recursion so nested scopes update correctly.

---

## Low Priority

### Translation support

### Comparison
Add the ability to compare two abstracts visually (highlighting the differences between generations)

### Drag and drop editing
- make it possible to click and drag an element, and have all subsequent elements in the graph move with it
- if also holding shift, only move the selected element


### Additional QoL
#### Instructions
- Add an overlay on webpage first load with indicators for every clickable element telling users how to interact with the app
  - This should vanish when the user clicks anything
  - There can be an info button in a corner to reopen the overlay
- https://chatgpt.com/share/685b28f4-c98c-8001-942b-a7ccb2da2a32

#### Arrows
- rewrite to allow for multiple previous elements and thus multiple arrows
- Enforce a min arrow size based on text bbox, and propogate to item arrangement
  - Draw text, get bbox, delete text, adjust arrow end position, redraw text
  - Return out the difference in x (arrow.width - item.x) and y to adjust the item position (drawArrow would need to be called before drawing the shape)
- Add euclidean arrow option?
- Maybe: For the residual arrows, potentially record the max y in main and go from previousItem.y to that plus a little bit

#### Item Rendering
- Make a toggle to show the graph structure by drawing lines between components instead of rendering them, and tacking on the component name
- Maybe: The current method of storing positions can't handle referencing an item that hasn't been drawn yet, which prevents arrow cycles. This might be fine though, since it also prevents circular dependencies

#### Text
- Auto split text into multiple lines based on textObject width, if it exists

### Efficiency and Optimization
#### updateReferences
Stop redrawing references when they are the same as the previous ones, without storing the previous references in a global variable

#### renderElements
Look into D3's enter-update-exit pattern to optimize rendering.