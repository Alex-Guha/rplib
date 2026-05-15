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

/**
 * Relational-positioning canvas. Owns the SVG, the resolved-view cache, the
 * cached layout, and the render loop. Apps compose an RPCanvas; do not extend.
 *
 * @typedef {Object} ResolvedView
 * @property {Object<string, Object>} content - Items keyed by id; render order = insertion order.
 * @property {Object<string, string>} [properties] - Root-only; used for `{{name}}` substitution in text.
 *
 * @typedef {Object} ResolveResult
 * @property {ResolvedView} view
 * @property {boolean} isRoot - true for top-level views; only roots own `properties`.
 *
 * @callback ResolveView
 * @param {RPCanvas} canvas
 * @param {string} name
 * @returns {ResolveResult|null} `null` if the name is unknown.
 *
 * @typedef {Object} Reporter
 * @property {(msg: string, ctx?: any) => void} error
 * @property {(msg: string, ctx?: any) => void} warn
 *
 * @typedef {Object} Storage
 * @property {(key: string) => string|null} getItem
 * @property {(key: string, value: string) => void} setItem
 * @property {(key: string) => void} removeItem
 */
export default class RPCanvas {
    /**
     * @param {Object} svgDOM - d3 selection of the target `<svg>`.
     * @param {Object} [defaults] - Optional shallow overrides for SHAPE/ARROW. Merged on top of `rplib/defaults.js`.
     * @param {Object<string, Object>} [components] - Bundled-DSL component map. Required only when using the default resolver.
     * @param {Object<string, Function>} [eventListenerTargets] - Map of attribute name → listener attacher. Used by `attachListeners`.
     * @param {(item: Object) => boolean} [elementToggleCallback] - Returning true skips drawing the item.
     * @param {ResolveView} [resolveView] - Optional adapter for app-owned DSLs. Defaults to the bundled DSL parser.
     */
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

        // Error reporter. Apps can swap via setReporter to route lib diagnostics
        // through their own logging/telemetry. Must implement { error, warn }.
        this.reporter = console;
        this.store.reporter = this.reporter;

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
    /**
     * Apply a theme by writing CSS variables on the svg root. Color changes don't
     * require re-rendering; OPACITY is read at render time so an OPACITY-only theme
     * change takes effect on next render.
     * @param {Object} theme - { SHAPE_FILL, SHAPE_STROKE, ARROW_COLOR, TEXT_COLOR: string[], OPACITY }
     */
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

    /**
     * Replace the diagnostics reporter. Default is `console`.
     * @param {Reporter} reporter
     */
    setReporter = (reporter) => {
        this.reporter = reporter;
        this.store.reporter = reporter;
    };

    resetZoom = () => resetZoom(this.svgDOM, this.canvasDOM);
    clearCanvas = () => { this.canvasDOM.selectAll('*').remove(); };
    toggleRenderDelay = () => { this.renderDelay = !this.renderDelay; };


    /**
     * Navigate to a view by name. Resolves it on cache miss via `resolveView`,
     * pushes the previous view onto the undo stack, and renders. Throws if the
     * view can't be resolved.
     * @param {string} view
     */
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

    /**
     * Register a lifecycle hook. Supported events: `'beforeViewChange'`,
     * `'afterViewChange'`. Payload: `{ view, prevView }`.
     * @param {'beforeViewChange'|'afterViewChange'} eventName
     * @param {(payload: { view: string, prevView: string }) => void} fn
     */
    on(eventName, fn) {
        if (!this.hooks[eventName]) this.hooks[eventName] = [];
        this.hooks[eventName].push(fn);
    }

    _fire(eventName, payload) {
        const listeners = this.hooks[eventName];
        if (!listeners) return;
        for (const fn of listeners) fn(payload);
    }

    // Switch the rendered view. Theme/color changes don't need this — colors flow
    // through CSS variables (see setTheme). Call this when the view itself changes
    // or when something the renderer reads at draw time (e.g. theme OPACITY,
    // renderDelay) was toggled and you need a fresh pass.
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
    /**
     * Drop a cached resolved view so the next navigation re-runs `resolveView`.
     * Pair with `invalidateLayout` since fresh content also needs fresh layout.
     * Omit `viewName` to clear all cached views and layouts.
     * @param {string} [viewName]
     */
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
    /**
     * Drop cached layouts so they recompute on next render. Descendants chained
     * via `previous` are auto-invalidated.
     * @param {string} [viewName] - Omit to clear all views.
     * @param {string|string[]} [ids] - Specific item ids; omit to clear the whole view.
     */
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

    /**
     * Walk an item id from most-specific to least-specific (split on `.`) and
     * return the first segment that owns `property`. Used for inheritance of text
     * styling, descriptions, etc. across nested arrow/text segments.
     * @param {string} id
     * @param {string} property
     */
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
