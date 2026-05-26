import { appManager } from '../instance.js'
import { componentEditState } from './state.js';

export const checkSettingsToggle = (obj) => {
    for (const setting of appManager.canvas.store.views[appManager.canvas.store.currentView].settings ?? []) {
        if (obj[setting.property] && appManager.settings[setting.id] && appManager.settings[setting.id].state) return true;
    }
    return false;
};


// `view` is the view being entered. Must be the incoming view, not `store.currentView`,
// since this runs on `beforeViewChange` while `currentView` is still the previous view.
export const initializeSettings = (view) => {
    const incoming = appManager.canvas.store.views[view];
    if (incoming && incoming.settings) {
        incoming.settings.forEach(setting => {
            if (appManager.settings[setting.id]) return;

            appManager.settings[setting.id] = setting;
        });
    }

    Object.entries(appManager.settings).forEach(([id, setting]) => {
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
            appManager.canvas.renderDelay = componentEditState.active ? false : setting.state;
        }
    });
};