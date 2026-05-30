import drawText from "./utils/text.js";
import drawSubcomponent from "./utils/shapes.js";
import drawConnection from "./utils/arrows.js";
import resetZoom from './utils/zoom.js';
import renderElements from "./renderView.js";
import ViewStore from "./viewStore.js";
import EditHistory from "./editHistory.js";
import {
    makeUpdateItemEntry,
    makeAddItemEntry,
    makeRemoveItemEntry,
    makeRenameItemEntry,
    makeUpdatePatchEntry,
} from "./mutate.js";
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
        return { view: parseAbstractDefinition(store, canvas.components, name, canvas.defaults), isRoot: true };
    }
    if (canvas.components[name]) {
        return { view: parseComponentView(store, canvas.components, name, canvas.defaults), isRoot: false };
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
     * @param {Object} options
     * @param {Object} options.svgDOM - d3 selection of the target `<svg>`. Required.
     * @param {Object} [options.defaults] - Optional shallow overrides for SHAPE/ARROW. Merged on top of `rplib/defaults.js`.
     * @param {Object<string, Object>} [options.components] - Bundled-DSL component map. Required only when using the default resolver.
     * @param {Object<string, Function>} [options.eventListenerTargets] - Map of attribute name → listener attacher. Used by `attachListeners`.
     * @param {(item: Object) => boolean} [options.elementToggleCallback] - Returning true skips drawing the item.
     * @param {ResolveView} [options.resolveView] - Optional adapter for app-owned DSLs. Defaults to the bundled DSL parser.
     */
    constructor({
        svgDOM,
        defaults,
        components,
        eventListenerTargets,
        elementToggleCallback,
        resolveView,
    } = {}) {
        if (!svgDOM) {
            throw new Error('RPCanvas: `svgDOM` is required');
        }
        this.svgDOM = svgDOM;
        this.canvasDOM = this.svgDOM.append("g").attr("id", "content");

        this.components = components;
        this.eventListenerTargets = eventListenerTargets;
        this.elementToggleCallback = elementToggleCallback;
        this.resolveView = resolveView ?? defaultResolveView;

        // Lifecycle hooks. Wrapping apps register via `on(name, fn)` instead of subclassing.
        // Supported events:
        //   'beforeViewChange' / 'afterViewChange' — navigation. Payload: { view, prevView }.
        //   'beforeMutate'     / 'afterMutate'     — live edits. Payload: { viewName, changedIds, kind }.
        this.hooks = { beforeViewChange: [], afterViewChange: [], beforeMutate: [], afterMutate: [] };

        // Owns parsed data, view cache, navigation history.
        this.store = new ViewStore();

        // Edit history is separate from navigation history; see editHistory.js.
        this.editHistory = new EditHistory();

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


    drawText = (textObject, item, itemLayout, callback, id, pinTargetId) => drawText(this, textObject, item, itemLayout, callback, id, pinTargetId);
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

    renderElements(options) {
        renderElements(this, this.elementToggleCallback, options);
    }

    // === Live-update API ===========================================================
    //
    // Mutations on cached resolved views (`updateItem`, `addItem`, `removeItem`,
    // `renameItem`) edit `store.views[viewName]` in place and re-render. Mutations
    // on authored sources (`updateAbstract`, `updateComponent`) invalidate the view
    // cache and re-resolve on next render. Every mutation pushes an inverse onto
    // `editHistory`; consumers wire UI to `undoEdit` / `redoEdit` (separate from
    // nav undo/redo). All mutations fire `'beforeMutate'` / `'afterMutate'` hooks
    // with `{ viewName, changedIds, kind }`. See LIVE_UPDATE_PLAN.md.

    /**
     * Read an item from a resolved view. Returns null if the view or id is missing.
     * Used by consumer GUIs to prepopulate edit fields. Selection state itself
     * lives in the consumer, not in rplib.
     * @param {string} viewName
     * @param {string} id
     */
    getItem = (viewName, id) => {
        return this.store.views[viewName]?.content?.[id] ?? null;
    };

    /**
     * Shallow-merge `patch` into the item at `viewName.content[id]`. A `null`
     * value in `patch` deletes that key. Triggers a re-render of the current view
     * and records the inverse on the edit-history stack.
     */
    updateItem = (viewName, id, patch) => {
        const entry = makeUpdateItemEntry(this.store.views[viewName], viewName, id, patch, this.defaults?.SHAPE);
        if (!entry) {
            this.reporter.warn(`updateItem: item "${id}" not found in view "${viewName}"`);
            return;
        }
        this._applyMutation(entry);
    };

    /**
     * Insert a new item into a resolved view. Use `{ after: id }` or
     * `{ before: id }` to control insertion order; defaults to appending.
     */
    addItem = (viewName, id, item, position = {}) => {
        const view = this.store.views[viewName];
        if (!view) {
            this.reporter.warn(`addItem: view "${viewName}" not found`);
            return;
        }
        if (view.content?.[id]) {
            this.reporter.warn(`addItem: id "${id}" already exists in "${viewName}"`);
            return;
        }
        this._applyMutation(makeAddItemEntry(view, viewName, id, item, position));
    };

    /**
     * Remove an item. The renderer's existing `previous`-chain logic re-flows
     * dependents on the next render; the consumer is responsible for fixing up
     * `previous` refs if it wants the descendants to anchor somewhere else.
     */
    removeItem = (viewName, id) => {
        const entry = makeRemoveItemEntry(this.store.views[viewName], viewName, id);
        if (!entry) {
            this.reporter.warn(`removeItem: "${id}" not found in "${viewName}"`);
            return;
        }
        this._applyMutation(entry);
    };

    /**
     * Rename an item id, rewriting any `previous` / `arrow.previous` references
     * inside the same view. Other views are not touched.
     */
    renameItem = (viewName, oldId, newId) => {
        const view = this.store.views[viewName];
        if (!view?.content?.[oldId]) {
            this.reporter.warn(`renameItem: "${oldId}" not found in "${viewName}"`);
            return;
        }
        if (view.content[newId]) {
            this.reporter.warn(`renameItem: target "${newId}" already exists in "${viewName}"`);
            return;
        }
        this._applyMutation(makeRenameItemEntry(view, viewName, oldId, newId));
    };

    /**
     * Patch an abstract definition (bundled DSL). Invalidates the cached resolved
     * view so the next render re-runs the resolver. `null` values delete keys.
     */
    updateAbstract = (name, patch) => {
        const def = this.store.abstractDefinitions[name];
        if (!def) {
            this.reporter.warn(`updateAbstract: "${name}" not found`);
            return;
        }
        const entry = makeUpdatePatchEntry(def, name, patch, 'updateAbstract', () => this.invalidateView(name));
        this._applyMutation(entry);
    };

    /**
     * Patch a component definition (bundled DSL). V1 invalidates ALL cached
     * views since determining which views reference the component is non-trivial
     * — refine later if profiling shows it matters. `null` values delete keys.
     */
    updateComponent = (name, patch) => {
        const comp = this.components?.[name];
        if (!comp) {
            this.reporter.warn(`updateComponent: "${name}" not found`);
            return;
        }
        const entry = makeUpdatePatchEntry(comp, this.store.currentView, patch, 'updateComponent', () => this.invalidateView());
        this._applyMutation(entry);
    };

    /**
     * Force a re-resolve + re-render of a view (or the current view if omitted).
     * Escape hatch for consumers whose source-of-truth mutations don't go through
     * the rplib mutation API (e.g. custom `resolveView` reading external state).
     * Does NOT record on the edit-history stack.
     */
    refresh = (viewName) => {
        const target = viewName ?? this.store.currentView;
        if (!target) return;
        this.invalidateView(target);
        if (target === this.store.currentView) this._renderCurrent();
    };

    /**
     * Undo the most recent edit. Returns true if anything was undone.
     */
    undoEdit = () => {
        const entry = this.editHistory.popUndo();
        if (!entry) return false;
        this._fire('beforeMutate', { viewName: entry.viewName, changedIds: entry.changedIds, kind: entry.kind });
        entry.undo();
        if (entry.changedIds) this.invalidateLayout(entry.viewName, entry.changedIds);
        if (entry.viewName === this.store.currentView || entry.changedIds === null) this._renderCurrent();
        this._fire('afterMutate', { viewName: entry.viewName, changedIds: entry.changedIds, kind: entry.kind });
        return true;
    };

    /**
     * Redo the most recently undone edit. Returns true if anything was redone.
     */
    redoEdit = () => {
        const entry = this.editHistory.popRedo();
        if (!entry) return false;
        this._fire('beforeMutate', { viewName: entry.viewName, changedIds: entry.changedIds, kind: entry.kind });
        entry.do();
        if (entry.changedIds) this.invalidateLayout(entry.viewName, entry.changedIds);
        if (entry.viewName === this.store.currentView || entry.changedIds === null) this._renderCurrent();
        this._fire('afterMutate', { viewName: entry.viewName, changedIds: entry.changedIds, kind: entry.kind });
        return true;
    };

    canEditUndo = () => this.editHistory.canUndo();
    canEditRedo = () => this.editHistory.canRedo();
    clearEditHistory = () => this.editHistory.clear();

    // Internal: applies an entry's `do`, invalidates layout for the changed ids,
    // records on edit-history, fires hooks, and re-renders if the current view is
    // affected. Edit-history records the entry as-is (no inversion); `undoEdit`
    // pops and calls `entry.undo` directly.
    _applyMutation(entry) {
        this._fire('beforeMutate', { viewName: entry.viewName, changedIds: entry.changedIds, kind: entry.kind });
        entry.do();
        if (entry.changedIds) this.invalidateLayout(entry.viewName, entry.changedIds);
        this.editHistory.record(entry);
        if (entry.changedIds === null) {
            // Abstract/component patches: view cache was nuked; force a full redraw.
            this._renderCurrent();
        } else if (entry.viewName === this.store.currentView) {
            this._renderCurrent(entry.changedIds);
        }
        this._fire('afterMutate', { viewName: entry.viewName, changedIds: entry.changedIds, kind: entry.kind });
    }

    // Internal: re-render the current view without touching nav history or zoom.
    // Re-resolves the view if it was invalidated (e.g. by updateAbstract). If
    // `onlyIds` is provided, runs the partial-redraw path (no clearCanvas, just
    // surgical DOM removal + selective redraw of those ids and their descendants).
    _renderCurrent(onlyIds) {
        const cur = this.store.currentView;
        if (!cur) return;
        if (!this.store.views[cur]) {
            const resolved = this.resolveView(this, cur);
            if (resolved) {
                this.store.views[cur] = resolved.view;
                if (resolved.isRoot) this.store.rootViews.add(cur);
            } else {
                this.reporter.warn(`_renderCurrent: could not re-resolve "${cur}"`);
                return;
            }
        }
        if (onlyIds) {
            this.renderElements({ onlyIds });
        } else {
            this.clearCanvas();
            this.renderElements();
        }
    }

    // === end live-update API =======================================================

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
