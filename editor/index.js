import { parseAbstractDefinitionFile, loadAbstractDefinitions } from 'rplib/parser';

import AppManager from './appManager.js';
import { setAppManager, appManager } from './instance.js';
import { initSidebar } from './core/sidebar.js';
import { mountGithubButton } from './core/githubButton.js';
import { loadSettings, loadCustomComponents } from './utils/storage.js';

/**
 * Boot the rplib-editor UI.
 *
 * @param {object} config
 * @param {object} config.components  — abstract/component definitions consumed by rplib
 * @param {string|object} config.dataSource — path to an abstract-definitions text file,
 *                                            or a pre-parsed definitions object
 * @param {object} [config.labels]    — terminology overrides, e.g.
 *                                      { abstract: { singular: 'Architecture', plural: 'Architectures' } }
 * @param {object} [config.themes]    — extra named theme palettes merged on top of the
 *                                      editor's built-ins (host-supplied themes win on name collisions)
 * @param {string} [config.repoUrl]   — URL the GitHub button in the lower-left links to.
 *                                      Defaults to no href (button is shown but inert).
 *                                      Reassignable at runtime via `manager.setRepoUrl(url)`.
 * @returns {Promise<AppManager>}
 */
export async function createEditor({ components, dataSource, labels, themes, repoUrl }) {
    const manager = new AppManager({ components, labels, themes, repoUrl });
    setAppManager(manager);

    initSidebar();
    mountGithubButton(repoUrl);
    loadSettings();
    loadCustomComponents(manager.canvas, localStorage);

    try {
        manager.canvas.store.abstractDefinitions = typeof dataSource === 'string'
            ? await parseAbstractDefinitionFile(dataSource)
            : dataSource;
    } catch (error) {
        const noun = manager.labels.abstract.singular.toLowerCase();
        console.error(`Error parsing ${noun}:`, error);
    }

    loadAbstractDefinitions(manager.canvas, localStorage);
    cleanupTransientEditorState(manager.canvas, localStorage);

    return manager;
}

// Editor-internal views (component editor, etc.) prefix their abstract
// definitions with `__`. They're transient — restoring them on boot lands the
// app on a view whose components no longer exist in memory. Strip any that
// leaked into storage from earlier builds, and clear the saved root view
// pointer if it referenced one.
function cleanupTransientEditorState(canvas, storage) {
    const defs = canvas.store.abstractDefinitions;
    let removed = false;
    for (const key of Object.keys(defs)) {
        if (key.startsWith('__')) { delete defs[key]; removed = true; }
    }
    const savedRoot = storage.getItem('rootView');
    if (savedRoot && savedRoot.startsWith('__')) storage.removeItem('rootView');
    if (removed) storage.setItem('abstractDefinitions', JSON.stringify(defs));
}

export { appManager };
