import { updateButtonState } from '../core/navigation.js';
import { appManager } from '../instance.js';

// Component-editor session state. `active` flips while the user is in
// component-creation mode; the rest of the fields are only meaningful while
// active. Owned by sidebarMenu/componentEditor.js; exposed here so other
// editor modules (e.g. core/sidebar.js click handler) can read without
// importing the editor itself.
export const componentEditState = {
    active: false,
    name: null,                 // current component id (renames mutate this)
    target: null,               // content-key inside componentDef.content, or null for component-level
    targetIsImported: false,    // true when clicked element belongs to an imported component reference
    targetElementId: null,      // raw rendered id (for highlight management)
    previousRootView: null,     // view to restore on exit
    isSeed: true,               // tracks "pristine seed vs user-modified"
    pendingRenameFrom: null,    // see componentEditor.js rename flow
    onElementClick: null,       // intercept hook used by core/sidebar.js
    autosaveUnsubscribe: null,  // no-op cleanup token (canvas has no `off`); see componentEditor.js
};

export function setSidebarState(newState) {
    const previousState = appManager.sidebarState;
    appManager.sidebarState = newState;

    // Clear element hover effects
    if (previousState === 'element')
        d3.selectAll('.force-hover').classed('force-hover', false);

    // No need to update a button when it was just clicked again
    if (previousState === newState) return;

    // If a button was highlighted, unhighlight it
    if (previousState !== null && previousState !== 'element')
        updateButtonState(previousState);

    // If the new state is from a button, highlight said button
    if (newState !== null && newState !== 'element')
        updateButtonState(newState);
}