import { applyTheme } from './themeUtils.js';

import { appManager } from '../instance.js';

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