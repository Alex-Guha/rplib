import { appManager } from '../../instance.js';
import { componentEditState } from '../../utils/state.js';

// Components available as a `details` target. The parser's handleDetails path
// only resolves names that exist in `canvas.components` (architectures in
// abstractDefinitions aren't supported as detail targets), so the dropdown
// mirrors that. Excludes the currently-edited component to prevent
// self-referential cycles, and preserves an out-of-list current value so
// pre-existing data isn't silently dropped on render.
export function detailsOptions(currentValue) {
    const opts = new Set(['']);
    for (const name of Object.keys(appManager.canvas.components)) {
        if (name === componentEditState.name) continue;
        opts.add(name);
    }
    if (currentValue && !opts.has(currentValue)) opts.add(currentValue);
    return Array.from(opts);
}

export function normalizeArray(value) {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
}

export function removeKey(obj, key) {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
        if (k !== key) out[k] = v;
    }
    return out;
}

export function uniqueContentKey(content, base) {
    let candidate = base;
    let i = 1;
    while (content[candidate]) {
        candidate = `${base}_${i++}`;
    }
    return candidate;
}

export function uniqueComponentName(base) {
    // IMPORTANT: do not use a `_\d+$` suffix here — the parser strips that
    // pattern when resolving component refs (parseIntermediateFormat.js:86),
    // so `new_component_1` would resolve back to `new_component` and pick up
    // whatever stale definition lives under that name. Letter suffixes are
    // safe because the strip regex only matches digits.
    const taken = new Set(Object.keys(appManager.canvas.components));
    if (!taken.has(base)) return base;
    for (let i = 0; i < 26; i++) {
        const candidate = `${base}_${String.fromCharCode(97 + i)}`;
        if (!taken.has(candidate)) return candidate;
    }
    // Fall back to a timestamp suffix — extremely unlikely path.
    return `${base}_t${Date.now()}`;
}

export function validateComponentName(name) {
    if (!name) return 'Name cannot be empty.';
    if (/_\d+$/.test(name)) return 'Name cannot end with _<number> (reserved by parser).';
    if (name === componentEditState.name) return null;
    if (appManager.canvas.components[name]) return `A component named "${name}" already exists.`;
    return null;
}

export function validateItemId(id, oldId, def) {
    if (!id) return 'id cannot be empty.';
    if (/_\d+$/.test(id)) return 'id cannot end with _<number> (reserved by parser).';
    if (id === oldId) return null;
    if (def?.content && Object.hasOwn(def.content, id)) return `An item named "${id}" already exists.`;
    return null;
}
