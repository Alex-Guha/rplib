// Import/export of abstract bundles: an abstract definition file (.txt) plus
// any custom components it references, packaged in a store-only ZIP. Plain
// .txt files and bare components.js files are also accepted on import.

import { appManager } from '../instance.js';
import { parseAbstractContent } from 'rplib/parser/parseAbstractFile.js';
import { saveAbstractDefinitions } from 'rplib/parser/storage.js';
import serializeAbstractDefinition from 'rplib/parser/serializeAbstractFormat.js';
import {
    getAllCustomComponents,
    saveCustomComponent,
} from './storage.js';
import { buildZip, readZip } from './zip.js';

const ABSTRACTS_FILE = 'abstracts.txt';
const COMPONENTS_FILE = 'components.js';

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
export function exportCustomAbstracts() {
    const defs = appManager.canvas.store.abstractDefinitions;
    const names = Object.keys(defs);
    if (names.length === 0) return false;
    const text = serializeAbstractsAll(defs);
    downloadBlob(new Blob([text], { type: 'text/plain' }), 'custom_abstracts.txt');
    return true;
}

function serializeComponentsModule(componentMap) {
    return Object.entries(componentMap)
        .map(([name, def]) => `export const ${name} = ${JSON.stringify(def, null, 2)};\n`)
        .join('\n');
}

// Parse a components.js file (the format produced by serializeComponentsModule
// or the single-component export from the component editor) into a plain map.
// Tolerant of trailing semicolons and whitespace; JSON.stringify output is the
// authoritative source so plain JSON-shaped object literals work.
export function parseComponentsModule(text) {
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
export function exportAbstractBundle(abstractName) {
    if (!abstractName) return false;
    const canvas = appManager.canvas;
    const def = canvas.store.abstractDefinitions[abstractName];
    if (!def) return false;

    const abstractText = serializeAbstractDefinition(abstractName, def);
    const refs = collectComponentRefs(def);
    const customAll = getAllCustomComponents(localStorage);
    const customUsed = {};
    for (const ref of refs) {
        const base = ref.replace(/_\d+$/, '');
        if (base in customAll) customUsed[base] = customAll[base];
    }

    if (Object.keys(customUsed).length === 0) {
        downloadBlob(new Blob([abstractText], { type: 'text/plain' }), `${abstractName}.txt`);
        return true;
    }

    const blob = buildZip([
        { name: ABSTRACTS_FILE, text: abstractText },
        { name: COMPONENTS_FILE, text: serializeComponentsModule(customUsed) },
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

function applyAbstractsText(text) {
    const parsed = parseAbstractContent(text);
    const canvas = appManager.canvas;
    const imported = [];
    for (const [name, structure] of Object.entries(parsed)) {
        canvas.store.abstractDefinitions[name] = structure;
        canvas.invalidateView(name);
        imported.push(name);
    }
    saveAbstractDefinitions(canvas, localStorage);
    return imported;
}

function applyComponentsText(text) {
    const components = parseComponentsModule(text);
    const canvas = appManager.canvas;
    const imported = [];
    for (const [name, def] of Object.entries(components)) {
        saveCustomComponent(name, def, localStorage);
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
 *  - a `.txt` + `.js` pair (the unzipped contents of a bundle)
 *  - a single `.js` components file
 * @param {FileList | File[]} files
 * @returns {Promise<{abstracts: string[], components: string[]}>}
 */
export async function importAbstractFiles(files) {
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
                else if (entryLower.endsWith('.js')) componentsText = entry.text;
            }
        } else if (lower.endsWith('.txt')) {
            abstractsText = await readFileAsText(file);
        } else if (lower.endsWith('.js')) {
            componentsText = await readFileAsText(file);
        }
    }

    // Components first so any abstracts referencing them can resolve.
    const components = componentsText ? applyComponentsText(componentsText) : [];
    const abstracts = abstractsText ? applyAbstractsText(abstractsText) : [];
    return { abstracts, components };
}
