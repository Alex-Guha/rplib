import { applyTheme } from './themeUtils.js';

import { appManager } from '../instance.js';

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

export function setPendingRename(oldName, storage) {
    storage.setItem(PENDING_RENAME_KEY, oldName);
}

export function clearPendingRename(storage) {
    storage.removeItem(PENDING_RENAME_KEY);
}

export function getPendingRename(storage) {
    return storage.getItem(PENDING_RENAME_KEY);
}

export function loadSettings() {
    const savedSettings = JSON.parse(localStorage.getItem('settings')) || {};
    Object.keys(savedSettings).forEach(key => {
        appManager.settings[key] = savedSettings[key];
    });
    //console.debug('Loaded settings:', savedSettings);

    // Load the saved theme directly
    appManager.currentTheme = JSON.parse(localStorage.getItem('currentTheme')) || appManager.defaultTheme;
    appManager.canvas.setTheme(appManager.currentTheme);
    applyTheme(appManager.currentTheme, document.documentElement);
}

export function saveSettings() {
    localStorage.setItem('settings', JSON.stringify(appManager.settings));
    //console.debug('Saved settings:', appManager.settings);
    localStorage.setItem('currentTheme', JSON.stringify(appManager.currentTheme));
}