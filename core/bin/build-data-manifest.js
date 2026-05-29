#!/usr/bin/env node
// Walk an rplib `data/` directory and emit `<dataDir>/manifest.json` listing every
// `.txt` under `abstracts/` and every `.json`/`.js` under `components/`. The
// runtime loader in @alexguha/rplib-editor and @alexguha/rplib-viewer fetches
// this manifest, then fetches each listed file. File and folder names inside
// `abstracts/` and `components/` are arbitrary — the manifest is regenerated on
// every dev/build, never hand-edited.

import fs from 'node:fs';
import path from 'node:path';

const dataDir = process.argv[2];
if (!dataDir) {
    console.error('Usage: rplib-build-data <dataDir>');
    process.exit(1);
}

if (!fs.existsSync(dataDir) || !fs.statSync(dataDir).isDirectory()) {
    console.error(`rplib-build-data: not a directory: ${dataDir}`);
    process.exit(1);
}

function walk(dir, exts) {
    if (!fs.existsSync(dir)) return [];
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            out.push(...walk(full, exts));
        } else if (exts.includes(path.extname(entry.name))) {
            out.push(full);
        }
    }
    return out;
}

function toRel(p) {
    return path.relative(dataDir, p).split(path.sep).join('/');
}

const abstracts = walk(path.join(dataDir, 'abstracts'), ['.txt']).map(toRel).sort();
const components = walk(path.join(dataDir, 'components'), ['.json', '.js']).map(toRel).sort();

const manifestPath = path.join(dataDir, 'manifest.json');
fs.writeFileSync(manifestPath, JSON.stringify({ abstracts, components }, null, 2) + '\n');
console.log(`rplib-build-data: wrote ${manifestPath} (${abstracts.length} abstract file(s), ${components.length} component file(s))`);
