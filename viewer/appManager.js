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
    constructor({ components, labels = {}, themes: extraThemes = {}, repoUrl = null, storage, reporter } = {}) {
        this.themes = { ...builtinThemes, ...extraThemes };
        this.defaultTheme = defaults.THEME;
        this.labels = { ...DEFAULT_LABELS, ...labels };
        this.repoUrl = repoUrl;
        this.storage = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
        if (!this.storage) {
            throw new Error('rplib-viewer: no storage adapter — pass `storage` to createViewer() when localStorage is unavailable.');
        }
        this.reporter = reporter ?? console;

        this.canvas = new RPCanvas({
            svgDOM: d3.select("#svg"),
            defaults,
            components,
            eventListenerTargets: {
                "description": (el) => attachElementEventListeners(el, this),
                "references": (el) => attachElementEventListeners(el, this),
                "details": (el) => attachDetailEventListeners(el, this),
            },
            elementToggleCallback: (obj) => checkSettingsToggle(obj, this),
        });
        this.canvas.setTheme(this.defaultTheme);
        this.canvas.setReporter(this.reporter);

        this.canvas.on('beforeViewChange', ({ view, prevView }) => {
            if (view !== prevView) initializeSettings(view, this);
        });
        this.canvas.on('afterViewChange', () => {
            saveRootView(this.canvas, this.storage);
            drawNavigation(this);
            resetSidebar(this);
        });

        this.currentTheme = this.defaultTheme;

        /**
         * Sidebar interaction state. One of:
         *   - null          → idle; hover events on diagram elements update the sidebar
         *   - 'element'     → a diagram element is "pinned" via click; hover events are suppressed
         *   - <buttonId>    → a nav button's menu is open ('settings-button', 'views-button')
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
