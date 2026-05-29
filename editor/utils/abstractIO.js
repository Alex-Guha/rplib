// Import/export of abstract bundles: an abstract definition file (.txt) plus
// any custom components it references, packaged in a store-only ZIP. Plain
// .txt files and bare components.js files are also accepted on import.

import {
    parseAbstractContent,
    saveAbstractDefinitions,
    serializeAbstractDefinition,
} from '@alexguha/rplib/parser';
import {
    getAllCustomComponents,
    saveCustomComponent,
} from './storage.js';
import { buildZip, readZip } from './zip.js';

const ABSTRACTS_FILE = 'abstracts.txt';

/**
 * Walk an intermediate-format abstract structure and collect every component
 * name referenced (bare refs and class-style overrides, recursively).
 * @param {Object} structure
 * @returns {Set<string>}
 */
function collectComponentRefs(structure) {
    const refs = new Set();
    const visit = (content) => {
        if (!content || typeof content !== 'object') return;
        for (const [key, entry] of Object.entries(content)) {
            if (Array.isArray(entry)) {
                if (typeof entry[0] === 'string') refs.add(entry[0]);
                if (entry[1] && typeof entry[1] === 'object' && entry[1].content) visit(entry[1].content);
            } else {
                refs.add(key);
                if (entry && typeof entry === 'object' && entry.content) visit(entry.content);
            }
        }
    };
    visit(structure?.content);
    return refs;
}

function serializeAbstractsAll(defs) {
    return Object.entries(defs)
        .map(([name, structure]) => serializeAbstractDefinition(name, structure))
        .join('\n');
}

/**
 * Export every saved abstract (from `canvas.store.abstractDefinitions`) as a
 * single `.txt` download. Mirrors `Export Custom Components` in shape.
 * @returns {boolean} false when there are no abstracts to export.
 */
export function exportCustomAbstracts(manager) {
    const defs = manager.canvas.store.abstractDefinitions;
    const names = Object.keys(defs);
    if (names.length === 0) return false;
    const text = serializeAbstractsAll(defs);
    downloadBlob(new Blob([text], { type: 'text/plain' }), 'custom_abstracts.txt');
    return true;
}

function deepEqual(a, b) {
    if (a === b) return true;
    if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    const ak = Object.keys(a), bk = Object.keys(b);
    if (ak.length !== bk.length) return false;
    for (const k of ak) {
        if (!Object.hasOwn(b, k) || !deepEqual(a[k], b[k])) return false;
    }
    return true;
}

// Serialize a component map for export. Prefers JSON: if every value
// round-trips through `JSON.parse(JSON.stringify(...))` unchanged, the export
// is lossless and a `.json` file pairs cleanly with the parse-side
// `with { type: 'json' }` import. Falls back to the `export const ... = ...`
// `.js` form when JSON would silently drop something (functions, undefined).
export function serializeComponentsExport(componentMap) {
    try {
        const jsonText = JSON.stringify(componentMap, null, 2);
        if (jsonText !== undefined && deepEqual(componentMap, JSON.parse(jsonText))) {
            return { text: jsonText + '\n', ext: 'json', mime: 'application/json' };
        }
    } catch { /* fall through to .js */ }
    const text = Object.entries(componentMap)
        .map(([name, def]) => `export const ${name} = ${JSON.stringify(def, null, 2)};\n`)
        .join('\n');
    return { text, ext: 'js', mime: 'text/javascript' };
}

// Parse a components.js or components.json file into a plain map. For the .js
// format produced by serializeComponentsModule (or the single-component export
// from the component editor), it scans `export const` declarations. For a
// .json file (single object whose top-level keys are component ids), it
// returns those entries directly.
export function parseComponentsModule(text) {
    const trimmed = text.trim();
    if (trimmed.startsWith('{')) {
        try {
            const parsed = JSON.parse(trimmed);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
        } catch { /* fall through to .js scan */ }
    }
    const out = {};
    const re = /export\s+const\s+([A-Za-z_$][\w$]*)\s*=\s*/g;
    let m;
    while ((m = re.exec(text))) {
        const name = m[1];
        let i = re.lastIndex;
        while (i < text.length && /\s/.test(text[i])) i++;
        if (text[i] !== '{') continue;
        let depth = 0;
        let inString = false;
        let stringChar = null;
        let escape = false;
        let end = -1;
        for (let j = i; j < text.length; j++) {
            const c = text[j];
            if (escape) { escape = false; continue; }
            if (inString) {
                if (c === '\\') escape = true;
                else if (c === stringChar) inString = false;
                continue;
            }
            if (c === '"' || c === "'") { inString = true; stringChar = c; continue; }
            if (c === '{') depth++;
            else if (c === '}') { depth--; if (depth === 0) { end = j + 1; break; } }
        }
        if (end < 0) continue;
        try { out[name] = JSON.parse(text.slice(i, end)); } catch { /* skip malformed entry */ }
        re.lastIndex = end;
    }
    return out;
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Export the current abstract (by committed name) plus any custom components
 * it references as a ZIP. Falls back to a plain .txt download when the
 * abstract uses no custom components.
 * @param {string} abstractName
 * @returns {boolean} false when the abstract isn't resolvable / not exportable.
 */
export function exportAbstractBundle(abstractName, manager) {
    if (!abstractName) return false;
    const canvas = manager.canvas;
    const def = canvas.store.abstractDefinitions[abstractName];
    if (!def) return false;

    const abstractText = serializeAbstractDefinition(abstractName, def);
    const refs = collectComponentRefs(def);
    const customAll = getAllCustomComponents(manager.storage);
    const customUsed = {};
    for (const ref of refs) {
        const base = ref.replace(/_\d+$/, '');
        if (base in customAll) customUsed[base] = customAll[base];
    }

    if (Object.keys(customUsed).length === 0) {
        downloadBlob(new Blob([abstractText], { type: 'text/plain' }), `${abstractName}.txt`);
        return true;
    }

    const componentsExport = serializeComponentsExport(customUsed);
    const blob = buildZip([
        { name: ABSTRACTS_FILE, text: abstractText },
        { name: `components.${componentsExport.ext}`, text: componentsExport.text },
    ]);
    downloadBlob(blob, `${abstractName}.zip`);
    return true;
}

async function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error);
        reader.onload = () => resolve(reader.result);
        reader.readAsText(file);
    });
}

async function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error);
        reader.onload = () => resolve(reader.result);
        reader.readAsArrayBuffer(file);
    });
}

function applyAbstractsText(text, manager) {
    const parsed = parseAbstractContent(text);
    const canvas = manager.canvas;
    const imported = [];
    for (const [name, structure] of Object.entries(parsed)) {
        canvas.store.abstractDefinitions[name] = structure;
        canvas.invalidateView(name);
        imported.push(name);
    }
    saveAbstractDefinitions(canvas, manager.storage);
    return imported;
}

function applyComponentsText(text, manager) {
    const components = parseComponentsModule(text);
    const canvas = manager.canvas;
    const imported = [];
    for (const [name, def] of Object.entries(components)) {
        saveCustomComponent(name, def, manager.storage);
        canvas.components[name] = def;
        imported.push(name);
    }
    return imported;
}

/**
 * Import abstracts and/or components from a list of user-selected files.
 * Supports:
 *  - a single `.txt` containing one or more abstracts
 *  - a single `.zip` produced by `exportAbstractBundle`
 *  - a `.txt` + `.js`/`.json` pair (the unzipped contents of a bundle)
 *  - a single `.js` or `.json` components file
 * @param {FileList | File[]} files
 * @returns {Promise<{abstracts: string[], components: string[]}>}
 */
export async function importAbstractFiles(files, manager) {
    const list = Array.from(files || []);
    if (list.length === 0) return { abstracts: [], components: [] };

    let abstractsText = null;
    let componentsText = null;

    for (const file of list) {
        const lower = file.name.toLowerCase();
        if (lower.endsWith('.zip')) {
            const buf = await readFileAsArrayBuffer(file);
            const entries = readZip(buf);
            for (const entry of entries) {
                const entryLower = entry.name.toLowerCase();
                if (entryLower.endsWith('.txt')) abstractsText = entry.text;
                else if (entryLower.endsWith('.js') || entryLower.endsWith('.json')) componentsText = entry.text;
            }
        } else if (lower.endsWith('.txt')) {
            abstractsText = await readFileAsText(file);
        } else if (lower.endsWith('.js') || lower.endsWith('.json')) {
            componentsText = await readFileAsText(file);
        }
    }

    // Components first so any abstracts referencing them can resolve.
    const components = componentsText ? applyComponentsText(componentsText, manager) : [];
    const abstracts = abstractsText ? applyAbstractsText(abstractsText, manager) : [];
    return { abstracts, components };
}
