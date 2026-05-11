import { computeItemLayout } from './layout.js';

// Iterates through the view and renders each element. Computed layout is cached
// in `self.layouts[viewName]` keyed by id; the parsed item is never mutated.
export default function renderElements(self, renderId, elementToggleCallback) {
    if (!self.store.views[self.store.currentView]) return;
    const elements = self.store.views[self.store.currentView].content;
    if (!elements) return;

    const viewName = self.store.currentView;
    if (!self.layouts[viewName]) self.layouts[viewName] = {};
    const viewLayout = self.layouts[viewName];

    let delay = 0;
    let delayAmount = 0;

    // Fun setting for showing the graph generation
    if (self.renderDelay) {
        // ensures that it takes the same amount of time to render a few elements as it does to render many
        delayAmount = Math.max(-0.25 * Object.keys(elements).length + 32.5, 0);
    }

    Object.entries(elements).forEach(([id, item]) => {
        setTimeout(() => {
            // Handles the case where the view is updated while still rendering
            if (renderId !== self.currentRenderId) return;

            // Prevents one instance of user error
            if (item.previous && !elements[item.previous]) {
                console.warn(`Item "${id}" has a previous item "${item.previous}" that does not exist. Skipping rendering for this item.`);
                return;
            }

            // If the item is toggled off, skip rendering it
            if (elementToggleCallback && elementToggleCallback(item)) return;

            // Compute layout once per view; re-renders reuse the cached entry.
            if (!viewLayout[id]) {
                const prevLayout = item.previous ? viewLayout[item.previous] : null;
                viewLayout[id] = computeItemLayout(item, prevLayout, self.defaults);
            }
            const layout = viewLayout[id];

            // Draw the shape. All items normally have a shape, but it's not enforced.
            if (item.shape) self.drawSubcomponent(item, layout, id);

            // Draw the arrow(s).
            if (Array.isArray(item.arrow) && item.arrow.length > 0) {
                item.arrow.forEach((arrow, i) => {
                    const arrowId = `${id}.arrow_${i}`;
                    const prevId = arrow.previous ?? item.previous;
                    self.drawConnection(arrow, elements[prevId], viewLayout[prevId], item, layout, elementToggleCallback, arrowId);
                });
            } else if (item.arrow) {
                const prevId = item.arrow.previous ?? item.previous;
                self.drawConnection(item.arrow, elements[prevId], viewLayout[prevId], item, layout, elementToggleCallback, `${id}.arrow`);
            }

            // Draw the text
            if (Array.isArray(item.text) && item.text.length > 0) {
                item.text.forEach((text, i) => {
                    self.drawText(text, item, layout, elementToggleCallback, `${id}.text_${i}`);
                });
            } else if (item.text) {
                self.drawText(item.text, item, layout, elementToggleCallback, `${id}.text`);
            }
        }, delay);

        delay += delayAmount;
    });
}
