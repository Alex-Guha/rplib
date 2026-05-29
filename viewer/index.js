import { loadDataDir, loadAbstractDefinitions } from '@alexguha/rplib/parser';

import AppManager from './appManager.js';
import { initSidebar } from './core/sidebar.js';
import { mountGithubButton } from './core/githubButton.js';
import { loadSettings } from './utils/storage.js';

/**
 * Boot the rplib-viewer UI.
 *
 * Read-only counterpart to rplib-editor: same canvas, sidebar, navigation,
 * settings, and info overlay — without the abstract/component editors,
 * advanced settings, or any persistence of user-authored content.
 *
 * @param {object} config
 * @param {string} [config.dataDir]   — URL/path to a directory laid out as
 *                                      `abstracts/` (any number of `.txt` files)
 *                                      and `components/` (any number of `.json` /
 *                                      `.js` files, nested freely). The library
 *                                      reads `<dataDir>/manifest.json` (produced
 *                                      by `npx rplib-build-data <dataDir>`) and
 *                                      aggregates everything underneath.
 * @param {object} [config.data]      — Escape hatch for pre-aggregated input,
 *                                      shaped `{ abstractDefinitions, components }`.
 *                                      Use this when a bundler already aggregates
 *                                      for you. Exactly one of `dataDir` or `data`
 *                                      must be supplied.
 * @param {object} [config.labels]    — terminology overrides, e.g.
 *                                      { abstract: { singular: 'Architecture', plural: 'Architectures' } }
 * @param {object} [config.themes]    — extra named theme palettes merged on top of the
 *                                      viewer's built-ins (host-supplied themes win on name collisions)
 * @param {string} [config.repoUrl]   — URL the GitHub button in the lower-left links to.
 *                                      Defaults to no href (button is shown but inert).
 *                                      Reassignable at runtime via `manager.setRepoUrl(url)`.
 * @param {Storage} [config.storage]  — `{ getItem, setItem, removeItem }` adapter for
 *                                      persisting the view-level settings (theme, toggles).
 *                                      Defaults to the global `localStorage` when available.
 * @param {{error: Function, warn: Function}} [config.reporter] — diagnostics sink for both
 *                                      the viewer and the underlying rplib canvas.
 *                                      Defaults to `console`.
 * @returns {Promise<AppManager>}
 */
export async function createViewer({ dataDir, data, labels, themes, repoUrl, storage, reporter }) {
    const effectiveReporter = reporter ?? console;

    let abstractDefinitions;
    let components;
    if (data) {
        ({ abstractDefinitions, components } = data);
    } else if (dataDir) {
        ({ abstractDefinitions, components } = await loadDataDir(dataDir, effectiveReporter));
    } else {
        throw new Error('rplib-viewer: createViewer requires either `dataDir` or pre-aggregated `data`.');
    }

    const manager = new AppManager({ components, labels, themes, repoUrl, storage, reporter });

    initSidebar(manager);
    mountGithubButton(repoUrl);
    loadSettings(manager);

    manager.canvas.store.abstractDefinitions = abstractDefinitions;
    loadAbstractDefinitions(manager.canvas, manager.storage);

    return manager;
}
