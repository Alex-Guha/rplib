import drawText from "./utils/text.js";
import drawSubcomponent from "./utils/shapes.js";
import drawConnection from "./utils/arrows.js";
import resetZoom from './utils/zoom.js';
import renderElements from "./renderView.js";
import ViewStore from "./viewStore.js";
import { mergeDefaults, LIB_DEFAULT_THEME } from "./defaults.js";

import { parseAbstractDefinition, parseComponentView } from "./parser/parseIntermediateFormat.js";

// Default view resolver: uses the bundled DSL parser. Treats anything in
// `store.abstractDefinitions` as a root view and anything in `canvas.components`
// as a non-root (detail/component) view. Apps with their own DSL can pass a
// custom resolver to the RPCanvas constructor that returns the intermediate
// format directly. See rplib/README.md for the intermediate-format contract.
function defaultResolveView(canvas, name) {
    const store = canvas.store;
    if (store.abstractDefinitions[name]) {
        return { view: parseAbstractDefinition(store, canvas.components, name), isRoot: true };
    }
    if (canvas.components[name]) {
        return { view: parseComponentView(store, canvas.components, name), isRoot: false };
    }
    return null;
}

export default class RPCanvas {
    constructor(svgDOM, defaults, components, eventListenerTargets, elementToggleCallback, resolveView) {
        this.svgDOM = svgDOM;
        this.canvasDOM = this.svgDOM.append("g").attr("id", "content");

        this.components = components;
        this.eventListenerTargets = eventListenerTargets;
        this.elementToggleCallback = elementToggleCallback;
        this.resolveView = resolveView ?? defaultResolveView;

        // Lifecycle hooks. Wrapping apps register via `on(name, fn)` instead of subclassing.
        // Supported events: 'beforeViewChange', 'afterViewChange'. Payload: { view, prevView }.
        this.hooks = { beforeViewChange: [], afterViewChange: [] };

        // Owns parsed data, view cache, navigation history.
        this.store = new ViewStore();

        // Cached layout per view. Keyed by `viewName -> { [id]: { x, y, width, height, xSpacing, ySpacing } }`.
        // Parsed view content stays immutable; this map holds the derived layout.
        // Theme switches re-render but skip recompute; editing an item should call invalidateLayout.
        this.layouts = {};

        // Merge any app-provided overrides on top of the library's inherent SHAPE/ARROW defaults.
        // The lib renders with these alone if nothing is passed in.
        this.defaults = mergeDefaults(defaults);

        this.renderDelay = false;
        this.currentRenderToken = null;

        // Theme is per-render app state. The lib ships a minimal fallback so it
        // renders something before setTheme is called; apps drive the real theme
        // via canvas.setTheme(theme). Routed through setTheme so the CSS variables
        // the renderer reads at draw time are populated even with no app override.
        this.setTheme(LIB_DEFAULT_THEME);
    };

    // Themes drive colors via CSS variables on the svg root so toggles are a single
    // style.setProperty pass per variable — no DOM rebuild. OPACITY is read at render
    // time because per-item overrides (count-stacked opacity, item.opacity) mix it
    // arithmetically; a theme change that alters OPACITY only takes effect on next render.
    setTheme = (theme) => {
        this.theme = theme;
        const svgNode = this.svgDOM.node();
        if (!svgNode) return;
        const style = svgNode.style;
        style.setProperty('--rplib-shape-fill', theme.SHAPE_FILL);
        style.setProperty('--rplib-shape-stroke', theme.SHAPE_STROKE);
        style.setProperty('--rplib-arrow-color', theme.ARROW_COLOR);

        // Reset prior text-color vars so a shorter palette doesn't leave stale ones around.
        const prevCount = this._textColorVarCount ?? 0;
        const nextCount = Array.isArray(theme.TEXT_COLOR) ? theme.TEXT_COLOR.length : 0;
        for (let i = 1; i <= Math.max(prevCount, nextCount); i++) {
            if (i <= nextCount) style.setProperty(`--rplib-text-color-${i}`, theme.TEXT_COLOR[i - 1]);
            else style.removeProperty(`--rplib-text-color-${i}`);
        }
        this._textColorVarCount = nextCount;
    };

    resetZoom = () => resetZoom(this.svgDOM, this.canvasDOM);
    clearCanvas = () => { this.canvasDOM.selectAll('*').remove(); };
    toggleRenderDelay = () => { this.renderDelay = !this.renderDelay; };


    changeViews = (view) => {
        const store = this.store;
        if (!store.views[view]) {
            const resolved = this.resolveView(this, view);
            if (!resolved) {
                throw new Error(`Failed to Change Views\nView ${view} not found.`);
            }
            store.views[view] = resolved.view;
            if (resolved.isRoot) {
                store.rootViews.add(view);
                store.rootView = view;
            }
        } else if (store.rootViews.has(view)) {
            store.rootView = view;
        }
        store.undoHistory.push(store.currentView);
        store.redoHistory = [];
        this.setCurrentView(view);
    };

    undoViewChange = () => {
        const store = this.store;
        if (store.undoHistory.length <= 0) return;
        store.redoHistory.push(store.currentView);
        const view = store.undoHistory.pop();
        if (store.rootViews.has(view))
            store.rootView = view;
        this.setCurrentView(view);
    };

    redoViewChange = () => {
        const store = this.store;
        if (store.redoHistory.length <= 0) return;
        store.undoHistory.push(store.currentView);
        const view = store.redoHistory.pop();
        if (store.rootViews.has(view))
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

    // Drop a cached resolved view so the next navigation re-runs `resolveView` and
    // re-resolves from authored definitions. Pair with `invalidateLayout` since a
    // fresh view content also needs fresh layout.
    // - invalidateView()        — clears all cached views and layouts
    // - invalidateView(name)    — clears one view and its layout
    invalidateView = (viewName) => {
        if (!viewName) {
            this.store.views = {};
            this.layouts = {};
            return;
        }
        delete this.store.views[viewName];
        delete this.layouts[viewName];
    };

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
        renderElements(this, this.elementToggleCallback);
    }

    findHierarchicalElementProperty = (id, property) => {
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
