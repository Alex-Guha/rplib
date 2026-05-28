import { appManager } from '../../instance.js';
import { componentEditState } from '../../utils/state.js';
import {
    saveCustomComponent,
    removeCustomComponent,
    setPendingRename,
    clearPendingRename,
} from '../../utils/storage.js';
import { renameInContent } from 'rplib/mutate.js';
import { EDITING_VIEW, SEED_CONTENT } from './constants.js';
import { uniqueContentKey, setComponentEditTarget } from './helpers.js';
import { renderInfoPanel } from './render.js';
import { highlightTarget } from './target.js';

export function patchItem(patch) {
    const name = componentEditState.name;
    const target = componentEditState.target;
    if (!target) return;
    const canvas = appManager.canvas;
    const def = canvas.components[name];
    if (!def?.content?.[target]) return;
    const nextItem = { ...def.content[target] };
    for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === undefined || v === '') delete nextItem[k];
        else nextItem[k] = v;
    }
    const nextContent = { ...def.content, [target]: nextItem };
    canvas.updateComponent(name, { content: nextContent });
}

export function patchComponentLevel(patch) {
    appManager.canvas.updateComponent(componentEditState.name, patch);
}

export function addItemAfterTarget() {
    const name = componentEditState.name;
    const target = componentEditState.target;
    const canvas = appManager.canvas;
    const def = canvas.components[name];
    if (!def?.content) return;
    const newId = uniqueContentKey(def.content, 'item');
    // With no target (component-level mode) append at the end and anchor on
    // the last existing key; with a target, splice in immediately after it.
    const keys = Object.keys(def.content);
    const anchor = target && keys.includes(target) ? target : keys[keys.length - 1];
    const next = {};
    if (!anchor) {
        next[newId] = { shape: 'box' };
    } else {
        for (const [k, v] of Object.entries(def.content)) {
            next[k] = v;
            if (k === anchor) next[newId] = { shape: 'box', previous: anchor, position: 'right' };
        }
    }
    canvas.updateComponent(name, { content: next });
    setComponentEditTarget(newId);
    renderInfoPanel();
    highlightTarget();
}

export function removeTarget() {
    const name = componentEditState.name;
    const target = componentEditState.target;
    const canvas = appManager.canvas;
    const def = canvas.components[name];
    if (!def?.content) return;
    const keys = Object.keys(def.content);
    if (keys.length <= 1) return;

    // Re-anchor any items whose `previous` pointed at the removed item to its
    // own `previous` (or drop the field entirely if it had none). Without this
    // the dangling reference breaks layout and the renderer warns about it.
    const removedPrev = def.content[target]?.previous;
    const nextContent = {};
    for (const [k, v] of Object.entries(def.content)) {
        if (k === target) continue;
        if (v?.previous === target) {
            const rewritten = { ...v };
            if (removedPrev) rewritten.previous = removedPrev;
            else delete rewritten.previous;
            nextContent[k] = rewritten;
        } else {
            nextContent[k] = v;
        }
    }

    canvas.updateComponent(name, { content: nextContent });
    const remaining = Object.keys(nextContent);
    setComponentEditTarget(remaining[0], { isImported: !!nextContent[remaining[0]]?.component });
    renderInfoPanel();
    highlightTarget();
}

export function resetToSeed() {
    const name = componentEditState.name;
    const canvas = appManager.canvas;
    const def = canvas.components[name] || {};
    const patch = { content: SEED_CONTENT() };
    // Clear extra top-level keys
    for (const k of Object.keys(def)) {
        if (k !== 'content') patch[k] = null;
    }
    canvas.updateComponent(name, patch);
    setComponentEditTarget('box');
    componentEditState.isSeed = true;
    renderInfoPanel();
    highlightTarget();
}

export function importComponent(choice) {
    const canvas = appManager.canvas;
    if (!canvas.components[choice]) return;

    if (componentEditState.isSeed) {
        // Wholesale replace
        const cloned = JSON.parse(JSON.stringify(canvas.components[choice]));
        const patch = { ...cloned };
        // Make sure to overwrite all current top-level keys; first compute deletes
        const cur = canvas.components[componentEditState.name] || {};
        for (const k of Object.keys(cur)) if (!(k in patch)) patch[k] = null;
        canvas.updateComponent(componentEditState.name, patch);
        const firstKey = Object.keys(cloned.content || {})[0];
        setComponentEditTarget(firstKey ?? null);
        componentEditState.isSeed = true;
        renderInfoPanel();
        highlightTarget();
    } else {
        // Insert a reference after the current target
        const def = canvas.components[componentEditState.name];
        if (!def?.content) return;
        const newId = uniqueContentKey(def.content, choice);
        const next = {};
        for (const [k, v] of Object.entries(def.content)) {
            next[k] = v;
            if (k === componentEditState.target) next[newId] = { component: choice };
        }
        if (!(componentEditState.target in def.content)) {
            next[newId] = { component: choice };
        }
        canvas.updateComponent(componentEditState.name, { content: next });
    }
}

export function renameComponent(oldName, newName) {
    const canvas = appManager.canvas;
    const def = canvas.components[oldName];
    if (!def) return;

    // 1. Persist under the new name and set the recovery marker.
    componentEditState.pendingRenameFrom = oldName;
    setPendingRename(oldName, localStorage);
    saveCustomComponent(newName, def, localStorage);

    // 2. Update in-memory components map.
    canvas.components[newName] = def;
    delete canvas.components[oldName];

    // 3. Update transient abstract definition.
    const abs = canvas.store.abstractDefinitions[EDITING_VIEW];
    abs.content = { [newName]: {} };
    canvas.invalidateView(EDITING_VIEW);

    componentEditState.name = newName;
    componentEditState.targetElementId = componentEditState.target
        ? `${newName}_${componentEditState.target}`
        : null;

    // 4. Delete old localStorage entry, clear marker.
    removeCustomComponent(oldName, localStorage);
    clearPendingRename(localStorage);
    componentEditState.pendingRenameFrom = null;

    canvas.refresh(EDITING_VIEW);
    renderInfoPanel();
    highlightTarget();
}

export function renameItemKey(oldId, newId) {
    const name = componentEditState.name;
    const canvas = appManager.canvas;
    const def = canvas.components[name];
    if (!def?.content) return;
    const nextContent = renameInContent(def.content, oldId, newId);
    canvas.updateComponent(name, { content: nextContent });
    componentEditState.target = newId;
    componentEditState.targetElementId = `${name}_${newId}`;
    renderInfoPanel();
    highlightTarget();
}

export function exportComponent() {
    const name = componentEditState.name;
    const def = appManager.canvas.components[name];
    if (!def) return;
    const body = `export const ${name} = ${JSON.stringify(def, null, 2)};\n`;
    const blob = new Blob([body], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}.js`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
