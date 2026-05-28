import { applyTheme, invertTheme } from '../utils/themeUtils.js';
import { saveSettings } from '../utils/storage.js';
import { setSidebarState } from '../utils/state.js';

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
            default:
                container = createToggleSetting(manager, setting);
                break;
        }
        infoElement.appendChild(container);
    });
};

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

        if (manager.settings['invert-theme'].state) {
            invertTheme(manager.currentTheme, document.documentElement);
            manager.canvas.setTheme(manager.currentTheme);
        }

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

function createToggleSetting(manager, setting) {
    const container = document.createElement('div');
    container.className = 'switch-container';

    const toggle_switch = document.createElement('label');
    toggle_switch.className = 'switch';
    const slider = document.createElement('span');
    slider.className = 'slider';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = setting.id;
    checkbox.checked = setting.state;

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
