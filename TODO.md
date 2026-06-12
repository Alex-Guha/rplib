### Comparison
Add the ability to compare two abstracts visually (highlighting the differences between generations)

### Translation support

### QoL
- Make component settings view specific so that setting ids can be reused in different views

---

## Future

### Arrows
- allow for multiple previous elements and thus multiple arrows
- Enforce a min arrow size based on text bbox, and propogate to item arrangement
  - Draw text, get bbox, delete text, adjust arrow end position, redraw text
  - Return out the difference in x (arrow.width - item.x) and y to adjust the item position (drawArrow would need to be called before drawing the shape)
- Add euclidean arrow option?
- Maybe: For the residual arrows, potentially record the max y in main and go from previousItem.y to that plus a little bit

### Item Rendering
- Make a toggle to show the graph structure by drawing lines between components instead of rendering them, and tacking on the component name
- Maybe: The current method of storing positions can't handle referencing an item that hasn't been drawn yet, which prevents arrow cycles. This might be fine though, since it also prevents circular dependencies

### Text
- Auto split text into multiple lines based on textObject width, if it exists

### Efficiency and Optimization
#### Panel re-renders
`PanelHost.update` re-resolves and re-renders every panel on each hover/reset. Skip re-rendering panels whose resolved data is unchanged from the previous update, without stashing it in a global.

#### renderElements
Look into D3's enter-update-exit pattern to optimize rendering.