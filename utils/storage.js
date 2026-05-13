import { parseAbstractDefinition } from "../parser/parseIntermediateFormat.js";
import { clearViewStructures } from "../parser/viewStructures.js";

// Only appends saved definitions, doesn't overwrite ones read from file at startup
export function loadAbstractDefinitions(canvas) {
    const savedDefinitions = JSON.parse(localStorage.getItem('abstractDefinitions')) || {};
    Object.keys(savedDefinitions).forEach(key => {
        if (!canvas.store.abstractDefinitions[key]) {
            canvas.store.abstractDefinitions[key] = savedDefinitions[key];
        }
    });
}

export function saveAbstractDefinitions(canvas) {
    localStorage.setItem('abstractDefinitions', JSON.stringify(canvas.store.abstractDefinitions));
}

export function clearAbstractDefinitions(canvas) {
    localStorage.removeItem('abstractDefinitions');
    localStorage.removeItem('rootView');
    clearViewStructures();
}


export function loadRootView(canvas, fallbackView) {
    const rootView = localStorage.getItem('rootView') || fallbackView;
    canvas.store.rootView = rootView;

    canvas.store.views[rootView] = parseAbstractDefinition(canvas.store, canvas.components, rootView);
    canvas.setCurrentView(rootView);
}

export function saveRootView(canvas) {
    saveAbstractDefinitions(canvas);

    localStorage.setItem('rootView', canvas.store.rootView);
}
