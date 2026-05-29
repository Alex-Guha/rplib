// Pure builders for live-update mutation entries. Each factory returns
// `{ kind, viewName, changedIds, do, undo }` — RPCanvas takes care of wiring
// these into the render path, edit-history stack, and lifecycle hooks. Keeping
// these as plain functions (no `this`, no `import 'd3'`) makes them unit-testable
// in node:test without pulling in the renderer's DOM dependencies.

import { resolveItemDimensions } from "./parser/resolveDimensions.js";

// Sentinel for "this key did not exist on the target" — lets us distinguish
// "set to undefined" from "delete" when restoring prior state during undo.
export const MISSING = Symbol('rplib.missing');

// Shallow patch with delete semantics: `null` or MISSING removes the key.
export function applyPatch(target, source) {
    for (const [k, v] of Object.entries(source)) {
        if (v === MISSING || v === null) delete target[k];
        else target[k] = v;
    }
}

// Capture the prior state of the keys named in `patch`, in the inverse-patch
// form expected by `applyPatch`. Keys that didn't exist on `target` map to
// MISSING so undo deletes them rather than setting them to undefined.
export function inversePatch(target, patch) {
    const out = {};
    for (const k of Object.keys(patch)) {
        out[k] = Object.hasOwn(target, k) ? target[k] : MISSING;
    }
    return out;
}

// Insert `[id]: item` into a content object at the given index, preserving the
// insertion order of existing entries. Returns a new object — JS doesn't let us
// reorder keys in place.
export function insertAt(content, id, item, index) {
    const entries = Object.entries(content);
    const out = {};
    const clamped = Math.max(0, Math.min(index, entries.length));
    for (let i = 0; i < entries.length; i++) {
        if (i === clamped) out[id] = item;
        out[entries[i][0]] = entries[i][1];
    }
    if (clamped >= entries.length) out[id] = item;
    return out;
}

// Rename one id throughout a content object: the key itself, plus any
// `previous` or `arrow.previous` references that pointed at it. Other cross-item
// ref shapes (ids embedded in text/description bodies, etc.) are intentionally
// not rewritten; the consumer is responsible for those.
export function renameInContent(content, from, to) {
    const out = {};
    for (const [k, v] of Object.entries(content)) {
        const newKey = k === from ? to : k;
        const newValue = { ...v };
        if (newValue.previous === from) newValue.previous = to;
        if (Array.isArray(newValue.arrow)) {
            newValue.arrow = newValue.arrow.map(a =>
                a && a.previous === from ? { ...a, previous: to } : a
            );
        } else if (newValue.arrow && newValue.arrow.previous === from) {
            newValue.arrow = { ...newValue.arrow, previous: to };
        }
        out[newKey] = newValue;
    }
    return out;
}

// === Entry factories =========================================================
// Each returns `null` when the operation is invalid (caller should warn and
// skip), or an entry with `do` already-applicable and `undo` closing over the
// prior state.

export function makeUpdateItemEntry(view, viewName, id, patch, shape) {
    const item = view?.content?.[id];
    if (!item) return null;
    // Resolve token strings ("2h", "w/4", …) against shape so cached resolved
    // views keep numbers — matches the parse-time pass in buildComponent. The
    // resolved patch is what we store, so undo capture and replay both see numbers.
    let resolvedPatch = patch;
    if (shape) {
        resolvedPatch = JSON.parse(JSON.stringify(patch));
        resolveItemDimensions(resolvedPatch, shape);
    }
    const prev = inversePatch(item, resolvedPatch);
    return {
        kind: 'updateItem',
        viewName,
        changedIds: [id],
        do: () => applyPatch(item, resolvedPatch),
        undo: () => applyPatch(item, prev),
    };
}

export function makeAddItemEntry(view, viewName, id, item, { before, after } = {}) {
    if (!view) return null;
    if (!view.content) view.content = {};
    if (view.content[id]) return null;
    const ids = Object.keys(view.content);
    let insertIndex = ids.length;
    if (after && ids.includes(after)) insertIndex = ids.indexOf(after) + 1;
    else if (before && ids.includes(before)) insertIndex = ids.indexOf(before);
    return {
        kind: 'addItem',
        viewName,
        changedIds: [id],
        do: () => { view.content = insertAt(view.content, id, item, insertIndex); },
        undo: () => { delete view.content[id]; },
    };
}

export function makeRemoveItemEntry(view, viewName, id) {
    const item = view?.content?.[id];
    if (!item) return null;
    const index = Object.keys(view.content).indexOf(id);
    return {
        kind: 'removeItem',
        viewName,
        changedIds: [id],
        do: () => { delete view.content[id]; },
        undo: () => { view.content = insertAt(view.content, id, item, index); },
    };
}

export function makeRenameItemEntry(view, viewName, oldId, newId) {
    if (!view?.content?.[oldId]) return null;
    if (view.content[newId]) return null;
    const apply = (from, to) => { view.content = renameInContent(view.content, from, to); };
    return {
        kind: 'renameItem',
        viewName,
        changedIds: [oldId, newId],
        do: () => apply(oldId, newId),
        undo: () => apply(newId, oldId),
    };
}

// For updateAbstract / updateComponent, `target` is the raw definition object
// from `store.abstractDefinitions[name]` or `canvas.components[name]`. The
// caller (RPCanvas) layers view-cache invalidation on top — that's not pure
// data and stays out of this module.
export function makeUpdatePatchEntry(target, name, patch, kind, sideEffect) {
    if (!target) return null;
    const prev = inversePatch(target, patch);
    return {
        kind,
        viewName: name,
        changedIds: null,
        do: () => { applyPatch(target, patch); sideEffect?.(); },
        undo: () => { applyPatch(target, prev); sideEffect?.(); },
    };
}
