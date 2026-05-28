import { applyTheme, invertTheme } from '../utils/themeUtils.js';
import { saveSettings, clearCustomComponents, getAllCustomComponents } from '../utils/storage.js';
import { confirmAction } from '../utils/error.js';
import { setSidebarState, componentEditState } from '../utils/state.js';

import { clearAbstractDefinitions } from 'rplib/parser';
import { exportCustomAbstracts, importAbstractFiles } from '../utils/abstractIO.js';

// Handles the click event for the settings button
export const createSettings = (event, manager) => {
    event.stopPropagation();

    const infoElement = document.getElementById('info');
    infoElement.innerHTML = '';

    const globalSettings = [
        { id: 'theme-selector' },
        { id: 'rendering-delay' },
        { id: 'invert-theme' },
    ];
    const viewSettings = manager.canvas.store.views[manager.canvas.store.currentView].settings ?? [];
    const allSettings = [...globalSettings, ...viewSettings];

    allSettings.forEach(currentSetting => {
        const setting = manager.settings[currentSetting.id];
        let container;
        switch (setting.type) {
            case 'dropdown':
                container = createDropdownSetting(manager, setting);
                break;
            case 'toggle':
                container = createToggleSetting(manager, setting);
                break;
            default:
                container = createToggleSetting(manager, setting);
                break;
        }
        infoElement.appendChild(container);
    });

    const advancedSettingsButton = document.createElement('button');
    advancedSettingsButton.textContent = 'Advanced';
    advancedSettingsButton.style.marginTop = 'auto';
    advancedSettingsButton.addEventListener('click', (e) => createAdvancedSettings(e, manager));
    infoElement.appendChild(advancedSettingsButton);
};

export const createAdvancedSettings = (event, manager) => {
    event.stopPropagation();

    const infoElement = document.getElementById('info');
    infoElement.innerHTML = '';

    const { singular, plural } = manager.labels.abstract;
    const advancedRow = document.createElement('div');
    advancedRow.className = 'advanced-row';

    const exportAbstractsButton = document.createElement('button');
    exportAbstractsButton.textContent = `Export Custom ${plural}`;
    exportAbstractsButton.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!exportCustomAbstracts(manager)) {
            window.alert(`No ${plural.toLowerCase()} to export.`);
        }
    });
    advancedRow.appendChild(exportAbstractsButton);

    const clearButton = document.createElement('button');
    clearButton.textContent = `Clear Custom ${plural}`;
    clearButton.addEventListener('click', async () => {
        if (await confirmAction(`Clear Custom ${plural}\nAre you sure you want to clear all custom ${plural.toLowerCase()}?\nThis action cannot be undone.`, manager)) {
            clearAbstractDefinitions(manager.canvas, manager.storage);
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
        exportAllCustomComponents(manager);
    });
    componentRow.appendChild(exportAllButton);

    const clearComponentsButton = document.createElement('button');
    clearComponentsButton.textContent = 'Clear Custom Components';
    clearComponentsButton.addEventListener('click', async () => {
        if (await confirmAction('Clear Custom Components\nAre you sure you want to clear all custom components?\nThis action cannot be undone.', manager)) {
            clearCustomComponents(manager.storage);
            window.location.reload();
        }
    });
    componentRow.appendChild(clearComponentsButton);

    infoElement.appendChild(componentRow);

    const importRow = document.createElement('div');
    importRow.className = 'advanced-row';

    const massImportButton = document.createElement('button');
    massImportButton.textContent = 'Mass Import';
    massImportButton.title = `Import a .zip or any combination of .txt (${plural.toLowerCase()}) and .js (components) files`;
    const massImportInput = document.createElement('input');
    massImportInput.type = 'file';
    massImportInput.accept = '.txt,.zip,.js';
    massImportInput.multiple = true;
    massImportInput.style.display = 'none';
    massImportInput.addEventListener('change', async (e) => {
        e.stopPropagation();
        const files = massImportInput.files;
        if (!files || files.length === 0) return;
        try {
            const { abstracts, components } = await importAbstractFiles(files, manager);
            window.alert(`Imported ${abstracts.length} ${plural.toLowerCase()}, ${components.length} component(s).`);
            if (abstracts.length > 0) {
                try { manager.canvas.changeViews(abstracts[0]); } catch { /* noop */ }
            } else if (components.length > 0) {
                // Refresh the current view so newly-imported components resolve.
                try { manager.canvas.setCurrentView(manager.canvas.store.currentView); } catch { /* noop */ }
            }
        } catch (err) {
            manager.reporter.error(err);
            window.alert(`Import failed: ${err.message}`);
        } finally {
            massImportInput.value = '';
        }
    });
    massImportButton.addEventListener('click', (e) => {
        e.stopPropagation();
        massImportInput.click();
    });
    importRow.appendChild(massImportButton);
    importRow.appendChild(massImportInput);
    infoElement.appendChild(importRow);

    const returnButton = document.createElement('button');
    returnButton.textContent = 'Return';
    returnButton.style.marginTop = 'auto';
    returnButton.addEventListener('click', (e) => {
        e.stopPropagation();
        createSettings(e, manager);
    });
    infoElement.appendChild(returnButton);
};

function exportAllCustomComponents(manager) {
    const map = getAllCustomComponents(manager.storage);
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
function createDropdownSetting(manager, setting) {
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
        if (manager.settings['invert-theme'].state) {
            invertTheme(manager.currentTheme, document.documentElement);
            manager.canvas.setTheme(manager.currentTheme);
        }

        // Reset invert-theme setting and slider
        manager.settings['invert-theme'].state = false;
        const invertThemeCheckbox = document.getElementById('invert-theme');
        if (invertThemeCheckbox) {
            invertThemeCheckbox.checked = false;
        }

        setting.state = selectedTheme;

        manager.currentTheme = manager.themes[selectedTheme] || manager.defaultTheme;
        manager.canvas.setTheme(manager.currentTheme);
        applyTheme(manager.currentTheme, document.documentElement);
        saveSettings(manager);
        manager.canvas.setCurrentView(manager.canvas.store.currentView);
        createSettings(e, manager);
        setSidebarState(manager, 'settings-button');
    });

    container.appendChild(label);
    container.appendChild(select);

    return container;
}

// Draws the default toggle switch for settings
function createToggleSetting(manager, setting) {
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
            invertTheme(manager.currentTheme, document.documentElement);
            manager.canvas.setTheme(manager.currentTheme);
        } else if (setting.id === 'rendering-delay') {
            manager.canvas.toggleRenderDelay();
        }

        if (setting.noRedraw ?? true) {
            manager.canvas.setCurrentView(manager.canvas.store.currentView);
            createSettings(e, manager);
            setSidebarState(manager, 'settings-button');
        }
        saveSettings(manager);
    });

    return container;
}
