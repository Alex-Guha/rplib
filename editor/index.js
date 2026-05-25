import { parseAbstractDefinitionFile } from 'rplib/parser/parseAbstractFile.js';
import { loadAbstractDefinitions } from 'rplib/parser/storage.js';

import AppManager from './appManager.js';
import { setAppManager, appManager } from './instance.js';
import { initSidebar } from './core/sidebar.js';
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
 * @returns {Promise<AppManager>}
 */
export async function createEditor({ components, dataSource, labels, themes }) {
    const manager = new AppManager({ components, labels, themes });
    setAppManager(manager);

    initSidebar();
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

    return manager;
}

export { appManager };
