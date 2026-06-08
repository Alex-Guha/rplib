import RPCanvas from '@alexguha/rplib';
import { saveRootView, loadRootView } from '@alexguha/rplib/parser';
import d3 from 'd3';

import { PanelHost } from '@alexguha/rplib/panel';

import { attachElementEventListeners, attachDetailEventListeners, resetSidebar } from './core/sidebar.js';
import { drawNavigation } from './core/navigation.js';
import { checkSettingsToggle, initializeSettings } from './utils/settings.js';
import * as defaults from './defaults.js';
import * as builtinThemes from './themes.js';

const DEFAULT_LABELS = {
    abstract: { singular: 'Abstract', plural: 'Abstracts' },
};

export default class AppManager {
    constructor({ components, labels = {}, themes: extraThemes = {}, repoUrl = null, storage, reporter, panels = [] } = {}) {
        this.themes = { ...builtinThemes, ...extraThemes };
        this.defaultTheme = defaults.THEME;
        this.labels = { ...DEFAULT_LABELS, ...labels };
        this.repoUrl = repoUrl;
        // Consumer-configured sidebar panels (references, metadata, …). Empty by
        // default — a fresh consumer sees no panel content until they wire one.
        this.panels = panels;
        // Persistence adapter. Defaults to the global localStorage when present
        // (browser hosts); SSR / Electron with custom storage / test harnesses
        // pass their own `{ getItem, setItem, removeItem }` shaped object.
        this.storage = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
        if (!this.storage) {
            throw new Error('rplib-editor: no storage adapter — pass `storage` to createEditor() when localStorage is unavailable.');
        }
        // Diagnostics reporter — same shape as rplib's: `{ error, warn }`.
        // Routed to the underlying canvas so the lib's diagnostics flow through
        // the same channel as the editor's.
        this.reporter = reporter ?? console;

        // Elements carrying a panel-backed property (or `description`) become
        // hoverable so the sidebar updates; `details` wires the drill-down
        // dblclick. The panel properties are derived from the configured panels
        // — the editor has no built-in knowledge of "references".
        const eventListenerTargets = {
            "description": (el) => attachElementEventListeners(el, this),
            "details": (el) => attachDetailEventListeners(el, this),
        };
        for (const panel of this.panels) {
            if (panel.property) eventListenerTargets[panel.property] = (el) => attachElementEventListeners(el, this);
        }

        this.canvas = new RPCanvas({
            svgDOM: d3.select("#svg"),
            defaults,
            components,
            eventListenerTargets,
            elementToggleCallback: (obj) => checkSettingsToggle(obj, this),
        });
        this.canvas.setTheme(this.defaultTheme);
        this.canvas.setReporter(this.reporter);

        // Fires before the lib updates `currentView` and renders, so settings that affect
        // rendering (e.g. `renderDelay`) apply to this view's render. Pass the incoming
        // view explicitly — `store.currentView` here is still the previous view.
        this.canvas.on('beforeViewChange', ({ view, prevView }) => {
            if (view !== prevView) initializeSettings(view, this);
        });
        this.canvas.on('afterViewChange', ({ view }) => {
            // Skip persistence for editor-internal transient views (e.g. the
            // component-editor's `__component_editor__` wrapper). They reference
            // runtime-only components that wouldn't exist on the next boot, so
            // restoring them as a root view would land on a broken page.
            if (!view || !view.startsWith('__')) {
                saveRootView(this.canvas, this.storage);
            }
            drawNavigation(this);
            resetSidebar(this);
        });

        this.currentTheme = this.defaultTheme;

        // Owns the sidebar content region (`#panels`): renders the configured
        // panels into stacked slots and handles transient takeover for
        // errors/confirmations (so they work even with `panels: []`).
        this.panelHost = new PanelHost(document.getElementById('panels'), this.panels);

        /**
         * Sidebar interaction state. One of:
         *   - null          → idle; hover events on diagram elements update the sidebar
         *   - 'element'     → a diagram element is "pinned" via click; hover events are suppressed
         *   - <buttonId>    → a nav button's menu is open (e.g. 'settings-button', 'views-button', 'edit-button')
         * Only modified through setSidebarState. Checked by diagram element hover handlers and nav button rendering.
         */
        this.sidebarState = null;
        this.settings = {
            'theme-selector': {
                label: 'Theme:',
                type: 'dropdown',
                defaultValue: 'default',
                options: ['Default', ...Object.keys(this.themes)],
            },
            'rendering-delay': { label: 'Rendering Delay', defaultValue: true, type: 'toggle' },
            'invert-theme': { label: 'Invert Theme', defaultValue: false, type: 'toggle' },
        }
    }

    restoreView(fallbackView) {
        loadRootView(this.canvas, this.storage, fallbackView);
    }

    setRepoUrl(url) {
        this.repoUrl = url || null;
        const anchor = document.getElementById('github-button');
        if (!anchor) return;
        if (this.repoUrl) {
            anchor.setAttribute('href', this.repoUrl);
        } else {
            anchor.removeAttribute('href');
        }
    }
}
