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
//
// Partial redraw: pass `{ onlyIds }` to surgically redraw a subset. The
// renderer removes the existing DOM for those ids (plus any items chained
// to them via `previous`) and redraws only that set. The caller must NOT
// clearCanvas() first — the unchanged DOM must survive. See PR2 in
// LIVE_UPDATE_PLAN.md.
export default function renderElements(self, elementToggleCallback, { onlyIds } = {}) {
    if (!self.store.views[self.store.currentView]) return;
    const elements = self.store.views[self.store.currentView].content;
    if (!elements) return;

    if (self.currentRenderToken) self.currentRenderToken.cancel();
    const token = new RenderToken();
    self.currentRenderToken = token;

    const viewName = self.store.currentView;
    if (!self.layouts[viewName]) self.layouts[viewName] = {};
    const viewLayout = self.layouts[viewName];

    // For a partial pass: expand onlyIds with descendants chained via `previous`
    // (same rule the layout cache uses), then remove the existing DOM for that
    // set so the redraw lands on a clean slate. Items in the set that no longer
    // exist in content (e.g. a removeItem target) get only the DOM removal.
    let drawSet = null;
    if (onlyIds) {
        drawSet = new Set(onlyIds);
        let added = true;
        while (added) {
            added = false;
            for (const [id, item] of Object.entries(elements)) {
                if (!drawSet.has(id) && item.previous && drawSet.has(item.previous)) {
                    drawSet.add(id);
                    added = true;
                }
            }
        }
        for (const id of drawSet) {
            const escaped = String(id).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
            self.canvasDOM.selectAll(`[id="${escaped}"], [id^="${escaped}."]`).remove();
        }
    }

    const drawItem = (id, item) => {
        if (token.cancelled) return;

        if (item.previous && !elements[item.previous]) {
            self.reporter.warn(`Item "${id}" has a previous item "${item.previous}" that does not exist. Skipping rendering for this item.`);
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
                self.drawText(text, item, layout, elementToggleCallback, `${id}.text_${i}`, item.shape ? id : null);
            });
        } else if (item.text) {
            self.drawText(item.text, item, layout, elementToggleCallback, `${id}.text`, item.shape ? id : null);
        }
    };

    const entries = drawSet
        ? Object.entries(elements).filter(([id]) => drawSet.has(id))
        : Object.entries(elements);
    if (self.renderDelay) {
        scheduleStaggered(entries, drawItem, token);
    } else {
        for (const [id, item] of entries) drawItem(id, item);
    }
}

// Draws items spaced out in wall-clock time so the graph appears to build up.
// The per-item interval scales inversely with view size so a small view doesn't
// feel sluggish and a huge one doesn't take forever. rAF drives the loop (rather
// than setTimeout) so cancellation stays uniform with the rest of the render
// path, but pacing is time-based — `delayMs` units, not frames.
function scheduleStaggered(entries, drawItem, token) {
    const delayMs = Math.max(-0.25 * entries.length + 32.5, 0);
    let i = 0;
    let nextDrawAt = performance.now(); // first item draws on the first tick

    const tick = (now) => {
        if (token.cancelled || i >= entries.length) return;
        // Drain any intervals that have already elapsed — for very small delayMs
        // this lets us draw multiple items per frame, matching the old behavior
        // where setTimeout(0)s coalesced.
        while (i < entries.length && now >= nextDrawAt) {
            const [id, item] = entries[i];
            drawItem(id, item);
            i++;
            nextDrawAt += delayMs;
        }
        if (i < entries.length) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
}
