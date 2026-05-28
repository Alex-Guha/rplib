import { applyTheme } from './themeUtils.js';

export function loadSettings(manager) {
    const savedSettings = JSON.parse(manager.storage.getItem('settings')) || {};
    Object.keys(savedSettings).forEach(key => {
        manager.settings[key] = savedSettings[key];
    });

    manager.currentTheme = JSON.parse(manager.storage.getItem('currentTheme')) || manager.defaultTheme;
    manager.canvas.setTheme(manager.currentTheme);
    applyTheme(manager.currentTheme, document.documentElement);
}

export function saveSettings(manager) {
    manager.storage.setItem('settings', JSON.stringify(manager.settings));
    manager.storage.setItem('currentTheme', JSON.stringify(manager.currentTheme));
}
