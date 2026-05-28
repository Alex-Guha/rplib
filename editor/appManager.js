import RPCanvas from 'rplib';
import { saveRootView, loadRootView } from 'rplib/parser';
import d3 from 'd3';

import { attachElementEventListeners, attachDetailEventListeners, resetSidebar } from './core/sidebar.js';
import { drawNavigation } from './core/navigation.js';
import { checkSettingsToggle, initializeSettings } from './utils/settings.js';
import * as defaults from './defaults.js';
import * as builtinThemes from './themes.js';

const DEFAULT_LABELS = {
    abstract: { singular: 'Abstract', plural: 'Abstracts' },
};

export default class AppManager {
    constructor({ components, labels = {}, themes: extraThemes = {}, repoUrl = null } = {}) {
        this.themes = { ...builtinThemes, ...extraThemes };
        this.defaultTheme = defaults.THEME;
        this.labels = { ...DEFAULT_LABELS, ...labels };
        this.repoUrl = repoUrl;

        this.canvas = new RPCanvas({
            svgDOM: d3.select("#svg"),
            defaults,
            components,
            eventListenerTargets: {
                "description": attachElementEventListeners,
                "references": attachElementEventListeners,
                "details": attachDetailEventListeners,
            },
            elementToggleCallback: checkSettingsToggle,
        });
        this.canvas.setTheme(this.defaultTheme);

        // Fires before the lib updates `currentView` and renders, so settings that affect
        // rendering (e.g. `renderDelay`) apply to this view's render. Pass the incoming
        // view explicitly — `store.currentView` here is still the previous view.
        this.canvas.on('beforeViewChange', ({ view, prevView }) => {
            if (view !== prevView) initializeSettings(view);
        });
        this.canvas.on('afterViewChange', ({ view }) => {
            // Skip persistence for editor-internal transient views (e.g. the
            // component-editor's `__component_editor__` wrapper). They reference
            // runtime-only components that wouldn't exist on the next boot, so
            // restoring them as a root view would land on a broken page.
            if (!view || !view.startsWith('__')) {
                saveRootView(this.canvas, localStorage);
            }
            drawNavigation();
            resetSidebar();
        });

        this.currentTheme = this.defaultTheme;

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
        loadRootView(this.canvas, localStorage, fallbackView);
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
