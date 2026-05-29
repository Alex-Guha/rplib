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
            assertNoIntegerLikeContentKeys(mod[key], key, rel);
            components[key] = mod[key];
        }
    }));

    return { abstractDefinitions, components };
}

// JS object iteration places integer-string keys ascending before non-integer
// keys in insertion order. That reorder happens before any code sees the
// content, silently breaking declaration order and any `previous` reference
// that depends on it. Apply uniformly to .json and .js — the hazard is the
// runtime, not the source format.
export const INTEGER_LIKE_KEY = /^(0|[1-9]\d*)$/;
export function assertNoIntegerLikeContentKeys(component, componentKey, sourceRel) {
    if (!component || typeof component !== 'object' || !component.content) return;
    const offenders = Object.keys(component.content).filter(k => INTEGER_LIKE_KEY.test(k));
    if (offenders.length === 0) return;
    throw new Error(
        `rplib: component "${componentKey}" in ${sourceRel} has integer-like content keys [${offenders.join(', ')}]. ` +
        `The JS runtime reorders integer-string object keys ascending, which breaks declaration order and \`previous\` references. ` +
        `Rename these keys to include a non-digit character (letter, hyphen, dot, leading zero).`,
    );
}
