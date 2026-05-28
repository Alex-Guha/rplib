import { applyTheme } from './themeUtils.js';

const CUSTOM_COMPONENTS_KEY = 'rplib_editor:custom_components';
const PENDING_RENAME_KEY = 'rplib_editor:pending_rename';

function readCustomComponents(storage) {
    try {
        return JSON.parse(storage.getItem(CUSTOM_COMPONENTS_KEY)) || {};
    } catch {
        return {};
    }
}

function writeCustomComponents(storage, map) {
    storage.setItem(CUSTOM_COMPONENTS_KEY, JSON.stringify(map));
}

// Merge persisted custom components into `canvas.components`. Honors a
// pending-rename marker left by an interrupted rename: the stale key is
// dropped before merging so a crashed rename can't resurrect a ghost.
export function loadCustomComponents(canvas, storage) {
    // Hosts often pass an ES-module namespace as `components` (frozen by spec),
    // so any write into it throws. Replace with a mutable shallow copy before
    // merging persisted custom components or letting the component editor
    // install new ones. RPCanvas reads the reference each time, so reassigning
    // canvas.components is safe.
    canvas.components = { ...canvas.components };

    const saved = readCustomComponents(storage);
    const pending = storage.getItem(PENDING_RENAME_KEY);
    if (pending && saved[pending]) {
        delete saved[pending];
        writeCustomComponents(storage, saved);
    }
    storage.removeItem(PENDING_RENAME_KEY);
    for (const [name, def] of Object.entries(saved)) {
        canvas.components[name] = def;
    }
}

export function saveCustomComponent(name, def, storage) {
    const saved = readCustomComponents(storage);
    saved[name] = def;
    writeCustomComponents(storage, saved);
}

export function removeCustomComponent(name, storage) {
    const saved = readCustomComponents(storage);
    if (!(name in saved)) return;
    delete saved[name];
    writeCustomComponents(storage, saved);
}

export function clearCustomComponents(storage) {
    storage.removeItem(CUSTOM_COMPONENTS_KEY);
    storage.removeItem(PENDING_RENAME_KEY);
}

export function getAllCustomComponents(storage) {
    return readCustomComponents(storage);
}

export function setPendingRename(oldName, storage) {
    storage.setItem(PENDING_RENAME_KEY, oldName);
}

export function clearPendingRename(storage) {
    storage.removeItem(PENDING_RENAME_KEY);
}

export function getPendingRename(storage) {
    return storage.getItem(PENDING_RENAME_KEY);
}

export function loadSettings(manager) {
    const savedSettings = JSON.parse(manager.storage.getItem('settings')) || {};
    Object.keys(savedSettings).forEach(key => {
        manager.settings[key] = savedSettings[key];
    });

    // Load the saved theme directly
    manager.currentTheme = JSON.parse(manager.storage.getItem('currentTheme')) || manager.defaultTheme;
    manager.canvas.setTheme(manager.currentTheme);
    applyTheme(manager.currentTheme, document.documentElement);
}

export function saveSettings(manager) {
    manager.storage.setItem('settings', JSON.stringify(manager.settings));
    manager.storage.setItem('currentTheme', JSON.stringify(manager.currentTheme));
}
