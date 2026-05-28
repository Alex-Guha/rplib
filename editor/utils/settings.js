import { componentEditState } from './state.js';

export const checkSettingsToggle = (obj, manager) => {
    for (const setting of manager.canvas.store.views[manager.canvas.store.currentView].settings ?? []) {
        if (obj[setting.property] && manager.settings[setting.id] && manager.settings[setting.id].state) return true;
    }
    return false;
};


// `view` is the view being entered. Must be the incoming view, not `store.currentView`,
// since this runs on `beforeViewChange` while `currentView` is still the previous view.
export const initializeSettings = (view, manager) => {
    const incoming = manager.canvas.store.views[view];
    if (incoming && incoming.settings) {
        incoming.settings.forEach(setting => {
            if (manager.settings[setting.id]) return;

            manager.settings[setting.id] = setting;
        });
    }

    Object.entries(manager.settings).forEach(([id, setting]) => {
        if (setting.state === undefined) {
            setting.state = setting.defaultValue ?? false;
        }
        if (setting.id === undefined) {
            setting.id = id;
        }

        if (setting.id === 'rendering-delay') {
            // Component-editor mode force-disables render delay so the
            // autosave-driven re-render loop doesn't fight staggered rendering.
            // The user's saved preference is restored on exit.
            manager.canvas.renderDelay = componentEditState.active ? false : setting.state;
        }
    });
};
