import { parseAbstractDefinition } from "./parseIntermediateFormat.js";
import { clearViewStructures } from "./viewStructures.js";

// Persistence helpers for the bundled DSL. The `storage` argument is any
// Web Storage-shaped object: { getItem(key), setItem(key, value), removeItem(key) }.
// Pass `localStorage` directly in a browser, or any adapter matching that shape.

// Only appends saved definitions, doesn't overwrite ones read from file at startup
export function loadAbstractDefinitions(canvas, storage) {
    const savedDefinitions = JSON.parse(storage.getItem('abstractDefinitions')) || {};
    Object.keys(savedDefinitions).forEach(key => {
        if (!canvas.store.abstractDefinitions[key]) {
            canvas.store.abstractDefinitions[key] = savedDefinitions[key];
        }
    });
}

export function saveAbstractDefinitions(canvas, storage) {
    storage.setItem('abstractDefinitions', JSON.stringify(canvas.store.abstractDefinitions));
}

export function clearAbstractDefinitions(canvas, storage) {
    storage.removeItem('abstractDefinitions');
    storage.removeItem('rootView');
    clearViewStructures();
}


export function loadRootView(canvas, storage, fallbackView) {
    const rootView = storage.getItem('rootView') || fallbackView;
    canvas.store.rootView = rootView;
    // Has to mirror what the default resolver does on a cache miss — without this,
    // navigating away and back leaves rootViews missing this view, so the cache-hit
    // path in `changeViews` doesn't update store.rootView (sidebar shows the wrong root).
    canvas.store.rootViews.add(rootView);

    canvas.store.views[rootView] = parseAbstractDefinition(canvas.store, canvas.components, rootView, canvas.defaults);
    canvas.setCurrentView(rootView);
}

export function saveRootView(canvas, storage) {
    saveAbstractDefinitions(canvas, storage);

    storage.setItem('rootView', canvas.store.rootView);
}
