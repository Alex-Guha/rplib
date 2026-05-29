// Runtime loader for the `data/` directory convention used by rplib consumers.
// Reads `<dataDir>/manifest.json` (produced by the `rplib-build-data` CLI),
// then fetches and aggregates all listed abstracts and components.

import { parseAbstractDefinitionFiles } from './parseAbstractFile.js';

/**
 * @param {string} dataDir — URL/path to a directory containing `manifest.json`,
 *                           an `abstracts/` subdirectory, and a `components/`
 *                           subdirectory. Resolved relative to `document.baseURI`.
 * @param {{warn: Function}} [reporter] — Diagnostics sink; warned on duplicate
 *                           component keys across files. Defaults to `console`.
 * @returns {Promise<{ abstractDefinitions: Object, components: Object }>}
 */
export async function loadDataDir(dataDir, reporter = console) {
    const base = new URL(
        dataDir.endsWith('/') ? dataDir : dataDir + '/',
        typeof document !== 'undefined' ? document.baseURI : undefined,
    );

    const manifestResponse = await fetch(new URL('manifest.json', base));
    if (!manifestResponse.ok) {
        throw new Error(`rplib: failed to fetch ${new URL('manifest.json', base)} (${manifestResponse.status}). Run \`rplib-build-data <dataDir>\` to regenerate.`);
    }
    const manifest = await manifestResponse.json();

    const abstractUrls = (manifest.abstracts ?? []).map(rel => new URL(rel, base).href);
    const abstractDefinitions = abstractUrls.length
        ? await parseAbstractDefinitionFiles(abstractUrls)
        : {};

    const components = {};
    await Promise.all((manifest.components ?? []).map(async (rel) => {
        const url = new URL(rel, base).href;
        let mod;
        if (rel.endsWith('.json')) {
            const r = await fetch(url);
            if (!r.ok) throw new Error(`rplib: failed to fetch ${url} (${r.status})`);
            mod = await r.json();
        } else {
            // .js — dynamic ESM import. Default export wins if present, else
            // treat the whole module namespace as a components map.
            const imported = await import(url);
            mod = imported.default ?? imported;
        }
        for (const key of Object.keys(mod)) {
            if (key in components) {
                reporter.warn(`rplib: duplicate component "${key}" — overridden by ${rel}`);
            }
            components[key] = mod[key];
        }
    }));

    return { abstractDefinitions, components };
}
