import { loadDataDir, loadAbstractDefinitions } from '@alexguha/rplib/parser';

import AppManager from './appManager.js';
import { initSidebar } from './core/sidebar.js';
import { mountGithubButton } from './core/githubButton.js';
import { loadSettings, loadCustomComponents } from './utils/storage.js';

/**
 * Boot the rplib-editor UI.
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
 *                                      Use this when a bundler (Vite's
 *                                      `import.meta.glob`, webpack `require.context`)
 *                                      already aggregates for you. Exactly one of
 *                                      `dataDir` or `data` must be supplied.
 * @param {object} [config.labels]    — terminology overrides, e.g.
 *                                      { abstract: { singular: 'Architecture', plural: 'Architectures' } }
 * @param {object} [config.themes]    — extra named theme palettes merged on top of the
 *                                      editor's built-ins (host-supplied themes win on name collisions)
 * @param {string} [config.repoUrl]   — URL the GitHub button in the lower-left links to.
 *                                      Defaults to no href (button is shown but inert).
 *                                      Reassignable at runtime via `manager.setRepoUrl(url)`.
 * @param {Storage} [config.storage]  — `{ getItem, setItem, removeItem }` adapter for
 *                                      persistence. Defaults to the global `localStorage`
 *                                      when available; pass an explicit object for SSR /
 *                                      sandboxed iframes / Electron with custom storage /
 *                                      test harnesses.
 * @param {{error: Function, warn: Function}} [config.reporter] — diagnostics sink for both
 *                                      the editor and the underlying rplib canvas.
 *                                      Defaults to `console`.
 * @returns {Promise<AppManager>}
 */
export async function createEditor({ dataDir, data, labels, themes, repoUrl, storage, reporter }) {
    const effectiveReporter = reporter ?? console;

    let abstractDefinitions;
    let components;
    if (data) {
        ({ abstractDefinitions, components } = data);
    } else if (dataDir) {
        ({ abstractDefinitions, components } = await loadDataDir(dataDir, effectiveReporter));
    } else {
        throw new Error('rplib-editor: createEditor requires either `dataDir` or pre-aggregated `data`.');
    }

    const manager = new AppManager({ components, labels, themes, repoUrl, storage, reporter });

    initSidebar(manager);
    mountGithubButton(repoUrl);
    loadSettings(manager);
    loadCustomComponents(manager.canvas, manager.storage);

    manager.canvas.store.abstractDefinitions = abstractDefinitions;
    loadAbstractDefinitions(manager.canvas, manager.storage);
    cleanupTransientEditorState(manager.canvas, manager.storage);

    return manager;
}

// Editor-internal views (component editor, etc.) prefix their abstract
// definitions with `__`. They're transient — restoring them on boot lands the
// app on a view whose components no longer exist in memory. Strip any that
// leaked into storage from earlier builds, and clear the saved root view
// pointer if it referenced one.
//
// TODO(post-1.0): remove this migration. It only matters for users who ran
// pre-fix builds; once those installs have cycled this is dead weight.
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
