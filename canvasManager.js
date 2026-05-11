import drawText from "./utils/text.js";
import drawSubcomponent from "./utils/shapes.js";
import drawConnection from "./utils/arrows.js";
import resetZoom from './utils/zoom.js';
import renderElements from "./renderView.js";
import ViewStore from "./viewStore.js";

import { parseAbstractDefinition, parseComponentView } from "./parser/parseIntermediateFormat.js";

export default class RPCanvas {
    constructor(svgDOM, defaults, components, eventListenerTargets, elementToggleCallback) {
        this.svgDOM = svgDOM;
        this.canvasDOM = this.svgDOM.append("g").attr("id", "content");

        this.components = components;
        this.eventListenerTargets = eventListenerTargets;
        this.elementToggleCallback = elementToggleCallback;

        // Lifecycle hooks. Wrapping apps register via `on(name, fn)` instead of subclassing.
        // Supported events: 'beforeViewChange', 'afterViewChange'. Payload: { view, prevView }.
        this.hooks = { beforeViewChange: [], afterViewChange: [] };

        // Owns parsed data, view cache, navigation history.
        this.store = new ViewStore();

        // Cached layout per view. Keyed by `viewName -> { [id]: { x, y, width, height, xSpacing, ySpacing } }`.
        // Parsed view content stays immutable; this map holds the derived layout.
        // Theme switches re-render but skip recompute; editing an item should call invalidateLayout.
        this.layouts = {};

        // TODO? Refactor shape size and arrow size out, pass default view in as a parameter, and assume an inherent default theme
        this.defaults = defaults;

        // Theme should be unified with the parent app, so it should always be passed in as a parameter
        // Mandatory ARROW_COLOR, OPACITY, SHAPE_FILL, SHAPE_STROKE, TEXT_COLOR
        this.theme = defaults.THEME;

        this.renderDelay = false;
        this.currentRenderId = 0;
    };

    resetZoom = () => resetZoom(this.svgDOM, this.canvasDOM);
    clearCanvas = () => { this.canvasDOM.selectAll('*').remove(); };
    toggleRenderDelay = () => { this.renderDelay = !this.renderDelay; };


    changeViews = (view) => {
        const store = this.store;
        let error = null;
        if (!store.views[view]) {
            if (store.abstractDefinitions[view]) {
                store.views[view] = parseAbstractDefinition(store, this.components, view);
                store.rootView = view;
            } else if (this.components[view])
                store.views[view] = parseComponentView(store, this.components, view);
            else {
                error = new Error(`Failed to Change Views\nView ${view} not found.\nFalling back to default.`);
                view = this.defaults.VIEW;
            }
        } else if (store.abstractDefinitions[view]) {
            store.rootView = view;
        }
        store.undoHistory.push(store.currentView);
        store.redoHistory = [];
        this.setCurrentView(view);
        if (error) throw error;
    };

    undoViewChange = () => {
        const store = this.store;
        if (store.undoHistory.length <= 0) return;
        store.redoHistory.push(store.currentView);
        const view = store.undoHistory.pop();
        if (store.abstractDefinitions[view])
            store.rootView = view;
        this.setCurrentView(view);
    };

    redoViewChange = () => {
        const store = this.store;
        if (store.redoHistory.length <= 0) return;
        store.undoHistory.push(store.currentView);
        const view = store.redoHistory.pop();
        if (store.abstractDefinitions[view])
            store.rootView = view;
        this.setCurrentView(view);
    };

    on(eventName, fn) {
        if (!this.hooks[eventName]) this.hooks[eventName] = [];
        this.hooks[eventName].push(fn);
    }

    _fire(eventName, payload) {
        const listeners = this.hooks[eventName];
        if (!listeners) return;
        for (const fn of listeners) fn(payload);
    }

    // Any time the view changes, these other functions also occur
    // XXX When the view stays the same but this is called, it would be better to iterate the existing DOM and update colors rather than redrawing everything
    setCurrentView(view) {
        const prevView = this.store.currentView;
        this._fire('beforeViewChange', { view, prevView });
        this.store.currentView = view;
        this.currentRenderId++;
        this.clearCanvas();
        this.resetZoom();
        this.renderElements();
        // Persistence is now an app/library-consumer concern; the canvas no longer
        // auto-saves on view change. Apps that want this behavior register a hook.
        this._fire('afterViewChange', { view, prevView });
    }


    drawText = (textObject, item, itemLayout, callback, id) => drawText(this, textObject, item, itemLayout, callback, id);
    drawSubcomponent = (item, layout, id) => drawSubcomponent(this, item, layout, id);
    drawConnection = (arrow, previousItem, prevLayout, item, itemLayout, callback, id) =>
        drawConnection(this, arrow, previousItem, prevLayout, item, itemLayout, callback, id);

    // Drop cached layouts so they recompute on next render.
    // - invalidateLayout()                 — clears all views
    // - invalidateLayout(view)             — clears one view
    // - invalidateLayout(view, ids)        — clears specific ids plus any descendants chained via `previous`
    invalidateLayout = (viewName, ids) => {
        if (!viewName) { this.layouts = {}; return; }
        if (!this.layouts[viewName]) return;
        if (ids == null) { delete this.layouts[viewName]; return; }

        const view = this.store.views[viewName];
        const idSet = new Set(Array.isArray(ids) ? ids : [ids]);
        if (view && view.content) {
            let added = true;
            while (added) {
                added = false;
                for (const [id, item] of Object.entries(view.content)) {
                    if (!idSet.has(id) && item.previous && idSet.has(item.previous)) {
                        idSet.add(id);
                        added = true;
                    }
                }
            }
        }
        for (const id of idSet) delete this.layouts[viewName][id];
    };

    renderElements() {
        const renderId = this.currentRenderId;
        renderElements(this, renderId, this.elementToggleCallback);
    }

    findHeirarchicalElementProperty = (id, property) => {
        const idSegments = id.split('.') ?? [];
        const currentContent = () => this.store.views[this.store.currentView].content;
        while (idSegments.length > 0) {
            let result = currentContent();
            idSegments.forEach((segment, index) => {
                const match = segment.match(/^(.*)_(\d+)$/);
                if (index > 0 && match) {
                    result = result[match[1]][match[2]];
                } else {
                    result = result?.[segment];
                }
            });
            if (result && Object.hasOwn(result, property)) {
                return result[property];
            }
            idSegments.pop();
        }
        return currentContent()?.[id]?.[property];
    }
}
