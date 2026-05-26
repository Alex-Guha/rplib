import { applyTheme, invertTheme } from '../utils/themeUtils.js';
import { saveSettings, clearCustomComponents, getAllCustomComponents } from '../utils/storage.js';
import { confirmAction } from '../utils/error.js';
import { setSidebarState, componentEditState } from '../utils/state.js';

import { appManager } from '../instance.js';
import { clearAbstractDefinitions } from 'rplib/parser/storage.js';

// Handles the click event for the settings button
export const createSettings = (event) => {
    event.stopPropagation();

    const infoElement = document.getElementById('info');
    infoElement.innerHTML = '';

    const globalSettings = [
        { id: 'theme-selector' },
        { id: 'rendering-delay' },
        { id: 'invert-theme' },
    ];
    const viewSettings = appManager.canvas.store.views[appManager.canvas.store.currentView].settings ?? [];
    const allSettings = [...globalSettings, ...viewSettings];

    allSettings.forEach(currentSetting => {
        const setting = appManager.settings[currentSetting.id];
        let container;
        switch (setting.type) {
            case 'dropdown':
                container = createDropdownSetting(setting);
                break;
            case 'toggle':
                container = createToggleSetting(setting);
                break;
            default:
                container = createToggleSetting(setting);
                break;
        }
        infoElement.appendChild(container);
    });

    const advancedSettingsButton = document.createElement('button');
    advancedSettingsButton.textContent = 'Advanced';
    advancedSettingsButton.style.marginTop = 'auto';
    advancedSettingsButton.addEventListener('click', createAdvancedSettings);
    infoElement.appendChild(advancedSettingsButton);
};

export const createAdvancedSettings = (event) => {
    event.stopPropagation();

    const infoElement = document.getElementById('info');
    infoElement.innerHTML = '';

    const { singular, plural } = appManager.labels.abstract;
    const advancedRow = document.createElement('div');
    advancedRow.className = 'advanced-row';

    const clearButton = document.createElement('button');
    clearButton.textContent = `Clear Saved ${plural}`;
    clearButton.addEventListener('click', async () => {
        if (await confirmAction(`Clear Saved ${plural}\nAre you sure you want to clear all saved ${plural.toLowerCase()}?\nThis action cannot be undone.`)) {
            clearAbstractDefinitions(appManager.canvas, localStorage);
            window.location.reload();
        }
    });
    advancedRow.appendChild(clearButton);
    infoElement.appendChild(advancedRow);

    const componentRow = document.createElement('div');
    componentRow.className = 'advanced-row';

    const exportAllButton = document.createElement('button');
    exportAllButton.textContent = 'Export Custom Components';
    exportAllButton.addEventListener('click', (e) => {
        e.stopPropagation();
        exportAllCustomComponents();
    });
    componentRow.appendChild(exportAllButton);

    const clearComponentsButton = document.createElement('button');
    clearComponentsButton.textContent = 'Clear Custom Components';
    clearComponentsButton.addEventListener('click', async () => {
        if (await confirmAction('Clear Custom Components\nAre you sure you want to clear all custom components?\nThis action cannot be undone.')) {
            clearCustomComponents(localStorage);
            window.location.reload();
        }
    });
    componentRow.appendChild(clearComponentsButton);

    infoElement.appendChild(componentRow);

    const returnButton = document.createElement('button');
    returnButton.textContent = 'Return';
    returnButton.style.marginTop = 'auto';
    returnButton.addEventListener('click', (e) => {
        e.stopPropagation();
        createSettings(e);
    });
    infoElement.appendChild(returnButton);
};

function exportAllCustomComponents() {
    const map = getAllCustomComponents(localStorage);
    const names = Object.keys(map);
    if (names.length === 0) {
        window.alert('No custom components to export.');
        return;
    }
    const body = names
        .map(name => `export const ${name} = ${JSON.stringify(map[name], null, 2)};`)
        .join('\n\n') + '\n';
    const blob = new Blob([body], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'custom_components.js';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Draws the dropdown menu in the settings
// Currently only written for theme dropdown, would need to be modified for other dropdowns
function createDropdownSetting(setting) {
    const container = document.createElement('div');
    container.className = 'switch-container';

    const label = document.createElement('label');
    label.htmlFor = setting.id;
    label.textContent = setting.label;
    label.style.fontSize = '1.05em';

    const select = document.createElement('select');
    select.id = setting.id;

    setting.options.forEach(option => {
        const optionElement = document.createElement('option');
        optionElement.value = option.toLowerCase();
        optionElement.textContent = option.replace(/\b\w/g, char => char.toUpperCase());
        select.appendChild(optionElement);
    });

    select.value = setting.state;

    select.addEventListener('change', (e) => {
        const selectedTheme = e.target.value;

        // Reinvert the theme if it was inverted
        if (appManager.settings['invert-theme'].state) {
            invertTheme(appManager.currentTheme, document.documentElement);
            appManager.canvas.setTheme(appManager.currentTheme);
        }

        // Reset invert-theme setting and slider
        appManager.settings['invert-theme'].state = false;
        const invertThemeCheckbox = document.getElementById('invert-theme');
        if (invertThemeCheckbox) {
            invertThemeCheckbox.checked = false;
        }

        setting.state = selectedTheme;

        appManager.currentTheme = appManager.themes[selectedTheme] || appManager.defaultTheme;
        appManager.canvas.setTheme(appManager.currentTheme);
        applyTheme(appManager.currentTheme, document.documentElement);
        saveSettings();
        appManager.canvas.setCurrentView(appManager.canvas.store.currentView);
        createSettings(e);
        setSidebarState('settings-button');
    });

    container.appendChild(label);
    container.appendChild(select);

    return container;
}

// Draws the default toggle switch for settings
function createToggleSetting(setting) {
    const container = document.createElement('div');
    container.className = 'switch-container';

    // Render delay is force-overridden while component-editor mode is active
    // (see utils/settings.js initializeSettings) — reflect that in the UI by
    // showing the toggle off and disabled, without mutating the saved state.
    const forcedOff = setting.id === 'rendering-delay' && componentEditState.active;

    const toggle_switch = document.createElement('label');
    toggle_switch.className = 'switch';
    if (forcedOff) toggle_switch.classList.add('switch-disabled');
    const slider = document.createElement('span');
    slider.className = 'slider';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = setting.id;

    checkbox.checked = forcedOff ? false : setting.state;
    if (forcedOff) checkbox.disabled = true;

    toggle_switch.appendChild(checkbox);
    toggle_switch.appendChild(slider);

    container.appendChild(toggle_switch);

    const label = document.createElement('label');
    label.htmlFor = setting.id;
    label.textContent = setting.label;

    container.appendChild(label);

    checkbox.addEventListener('change', (e) => {
        setting.state = e.target.checked;

        if (setting.id === 'invert-theme') {
            invertTheme(appManager.currentTheme, document.documentElement);
            appManager.canvas.setTheme(appManager.currentTheme);
        } else if (setting.id === 'rendering-delay') {
            appManager.canvas.toggleRenderDelay();
        }

        if (setting.noRedraw ?? true) {
            appManager.canvas.setCurrentView(appManager.canvas.store.currentView);
            createSettings(e);
            setSidebarState('settings-button');
        }
        saveSettings();
    });

    return container;
}