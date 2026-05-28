import { parseAbstractDefinitionFile, loadAbstractDefinitions } from 'rplib/parser';

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
 * @param {object} config.components  — abstract/component definitions consumed by rplib
 * @param {string|object} config.dataSource — path to an abstract-definitions text file,
 *                                            or a pre-parsed definitions object
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
export async function createViewer({ components, dataSource, labels, themes, repoUrl, storage, reporter }) {
    const manager = new AppManager({ components, labels, themes, repoUrl, storage, reporter });

    initSidebar(manager);
    mountGithubButton(repoUrl);
    loadSettings(manager);

    try {
        manager.canvas.store.abstractDefinitions = typeof dataSource === 'string'
            ? await parseAbstractDefinitionFile(dataSource)
            : dataSource;
    } catch (error) {
        const noun = manager.labels.abstract.singular.toLowerCase();
        manager.reporter.error(`Error parsing ${noun}:`, error);
    }

    loadAbstractDefinitions(manager.canvas, manager.storage);

    return manager;
}
