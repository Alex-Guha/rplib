import { computeItemLayout } from './layout.js';

// Cancellation handle for an in-flight render. Each call to renderElements
// creates a fresh token and replaces the canvas's current one — any earlier
// render still walking the item list sees `cancelled === true` and bails.
class RenderToken {
    constructor() { this.cancelled = false; }
    cancel() { this.cancelled = true; }
}

// Iterates through the view and renders each element. Computed layout is cached
// in `self.layouts[viewName]` keyed by id; the parsed item is never mutated.
//
// Two scheduling strategies share the per-item draw function:
//   - default: synchronous; one full pass before returning.
//   - renderDelay: staggered via requestAnimationFrame so the user sees the
//     graph build up. The stagger is purely presentational and could move to
//     a separate module if a third strategy ever shows up.
export default function renderElements(self, elementToggleCallback) {
    if (!self.store.views[self.store.currentView]) return;
    const elements = self.store.views[self.store.currentView].content;
    if (!elements) return;

    if (self.currentRenderToken) self.currentRenderToken.cancel();
    const token = new RenderToken();
    self.currentRenderToken = token;

    const viewName = self.store.currentView;
    if (!self.layouts[viewName]) self.layouts[viewName] = {};
    const viewLayout = self.layouts[viewName];

    const drawItem = (id, item) => {
        if (token.cancelled) return;

        if (item.previous && !elements[item.previous]) {
            console.warn(`Item "${id}" has a previous item "${item.previous}" that does not exist. Skipping rendering for this item.`);
            return;
        }

        if (elementToggleCallback && elementToggleCallback(item)) return;

        if (!viewLayout[id]) {
            const prevLayout = item.previous ? viewLayout[item.previous] : null;
            viewLayout[id] = computeItemLayout(item, prevLayout, self.defaults);
        }
        const layout = viewLayout[id];

        if (item.shape) self.drawSubcomponent(item, layout, id);

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

        if (Array.isArray(item.text) && item.text.length > 0) {
            item.text.forEach((text, i) => {
                self.drawText(text, item, layout, elementToggleCallback, `${id}.text_${i}`);
            });
        } else if (item.text) {
            self.drawText(item.text, item, layout, elementToggleCallback, `${id}.text`);
        }
    };

    const entries = Object.entries(elements);
    if (self.renderDelay) {
        scheduleStaggered(entries, drawItem, token);
    } else {
        for (const [id, item] of entries) drawItem(id, item);
    }
}

// Draws items one-per-N-frames so the graph appears to build up. The frame gap
// scales inversely with view size so a small view doesn't feel sluggish and a
// huge one doesn't take forever.
function scheduleStaggered(entries, drawItem, token) {
    const framesPerItem = Math.max(Math.round(-0.25 * entries.length + 32.5), 0);
    let i = 0;
    let frameCount = framesPerItem; // draw the first item immediately

    const tick = () => {
        if (token.cancelled || i >= entries.length) return;
        if (frameCount >= framesPerItem) {
            const [id, item] = entries[i];
            drawItem(id, item);
            i++;
            frameCount = 0;
        } else {
            frameCount++;
        }
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
}
