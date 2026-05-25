### Improve architecture edit mode (editMenu.js)
- better state tracking
- Code Mirror 5
- Export

### Core Features
#### Importing
- Allow for importing the following, so that users may define and share custom versions of each, especially for developing diagrams before adding them to the central repo
  - The architecture yaml-like
  - Individual components
- Exporting should be handled in the editing section below
- No point in exporting/importing the full rendered svg, info/references/details don't translate without the accompanying renderer
- Save imported stuff to local storage and recombine with predefined stuff on load

#### Editing and Exporting
- Architecture editing mode (making architectures out of components)
  - Have some way for the user to select from the component list instead of having them type out the component they want to add
  - There should be an export button, which downloads the custom/modified architecture(s)
- Potentially add a way to export both the architecture and the list of components together, in case a user made a custom architecture containing custom components
- Consider what the references box could be used for. Maybe that becomes the text entry field for the component editing mode, where a user can select "Edit info" and type in this.
- For all of these, there should be auto saving to local storage
- When users want to move components inside components, auto create an empty point before the componet with no separation and move that, implicitly repositioning the component without requiring edits to it

### Genericize the reference box

### QoL
#### Make double-clickable items more noticeable, and add a notice at the top or bottom of the info box to tell the user the item is clickable
- Potentially use the hover color to make it clearer
#### Make component settings view specific so that setting ids can be reused in different views
#### Consider reworking state
- State could include everything relevant to a users experience, like undo/redo history
- We could just save the entire state directly whenever a user does anything
  - we might want to keep a visit record on views and prune ones that aren't visited, depends how large views can conceivably be
#### Unify text and latexText
- Detect latex text by normal conventions like looking for a $ symbol at the start
#### Element hover issue
- Force the element hover styling when the element's text is clicked as well
- Will probably be more tricky to implement than it has any right to be

---

## Low Priority

### Comparison
Add the ability to compare two architectures visually (highlighting the differences between generations)

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