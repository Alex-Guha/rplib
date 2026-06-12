import { componentEditState } from '../../utils/state.js';

// Components available as a `details` target. The parser's handleDetails path
// only resolves names that exist in `canvas.components` (abstracts in
// abstractDefinitions aren't supported as detail targets), so the dropdown
// mirrors that. Excludes the currently-edited component to prevent
// self-referential cycles, and preserves an out-of-list current value so
// pre-existing data isn't silently dropped on render.
export function detailsOptions(manager, currentValue) {
    const opts = new Set(['']);
    for (const name of Object.keys(manager.canvas.components)) {
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

// Single source of truth for writing the target-related componentEditState
// fields. Pass `null` to clear (e.g. background click, exit). With a string
// target, derives `targetElementId` from the active component name. Always
// resets `importedGroupPrefix` unless explicitly carried over.
export function setComponentEditTarget(target, { isImported = false, importedGroupPrefix = null } = {}) {
    componentEditState.target = target;
    componentEditState.targetIsImported = isImported;
    componentEditState.importedGroupPrefix = importedGroupPrefix;
    componentEditState.targetElementId = target
        ? `${componentEditState.name}_${target}`
        : null;
}

// Builds a per-field setter for entries[idx]. Spreads the array and the entry,
// then either deletes the field (when value is "empty") or assigns the
// optionally-transformed value, and commits. `opts.isEmpty` overrides the
// default (`value === '' || value == null`); `opts.transform` runs on the
// non-empty value before assignment.
export function makeEntryUpdater(entries, idx, entry, commit) {
    return (field, value, opts = {}) => {
        const isEmpty = opts.isEmpty
            ? opts.isEmpty(value)
            : (value === '' || value == null);
        const next = [...entries];
        next[idx] = { ...entry };
        if (isEmpty) delete next[idx][field];
        else next[idx][field] = opts.transform ? opts.transform(value) : value;
        commit(next);
    };
}

// `previous` may only name an item declared *earlier* in the content block —
// the parser drops forward references with a warning (resolvePreviousRef in
// core/parser/parseIntermediateFormat.js), so the editor rejects them at pick
// time. Returns an error message, or null when the pick is legal.
export function validatePreviousPick(def, targetKey, pickedKey) {
    const keys = Object.keys(def?.content ?? {});
    if (keys.indexOf(pickedKey) > keys.indexOf(targetKey))
        return `"${pickedKey}" is declared after "${targetKey}", so it can't be its previous — items must be ordered by graph appearance.`;
    return null;
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

export function uniqueComponentName(manager, base) {
    // IMPORTANT: do not use a `_\d+$` suffix here — the parser strips that
    // pattern when resolving component refs (parseIntermediateFormat.js:86),
    // so `new_component_1` would resolve back to `new_component` and pick up
    // whatever stale definition lives under that name. Letter suffixes are
    // safe because the strip regex only matches digits.
    const taken = new Set(Object.keys(manager.canvas.components));
    if (!taken.has(base)) return base;
    for (let i = 0; i < 26; i++) {
        const candidate = `${base}_${String.fromCharCode(97 + i)}`;
        if (!taken.has(candidate)) return candidate;
    }
    // Fall back to a timestamp suffix — extremely unlikely path.
    return `${base}_t${Date.now()}`;
}

export function validateComponentName(manager, name) {
    if (!name) return 'Name cannot be empty.';
    if (/_\d+$/.test(name)) return 'Name cannot end with _<number> (reserved by parser).';
    if (name === componentEditState.name) return null;
    if (manager.canvas.components[name]) return `A component named "${name}" already exists.`;
    return null;
}

export function validateItemId(id, oldId, def) {
    if (!id) return 'id cannot be empty.';
    if (/_\d+$/.test(id)) return 'id cannot end with _<number> (reserved by parser).';
    if (/^(0|[1-9]\d*)$/.test(id)) return 'id cannot be integer-like (the JS runtime reorders integer keys, breaking declaration order). Include a letter, hyphen, dot, or leading zero.';
    if (id === oldId) return null;
    if (def?.content && Object.hasOwn(def.content, id)) return `An item named "${id}" already exists.`;
    return null;
}
