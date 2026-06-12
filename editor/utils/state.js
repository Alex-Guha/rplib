import { updateButtonState } from '../core/navigation.js';

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
    importedGroupPrefix: null,  // when target is imported, the component name to highlight as a group
    pickingPrevious: false,     // armed click-to-set-previous pick (see componentEditor/target.js)
    previousRootView: null,     // view to restore on exit
    isSeed: true,               // tracks "pristine seed vs user-modified"
    pendingRenameFrom: null,    // see componentEditor.js rename flow
    onElementClick: null,       // intercept hook used by core/sidebar.js
    onBackgroundClick: null,    // intercept hook used by core/sidebar.js
    autosaveUnsubscribe: null,  // no-op cleanup token (canvas has no `off`); see componentEditor.js
};

// Abstract-editor session state. `active` flips while the CodeMirror
// editor is mounted in #info. The same shape as componentEditState — read
// from core/sidebar.js to avoid wiping the editor on background clicks /
// afterViewChange, and from sidebarMenu/editMenu.js to make the edit nav
// button toggle.
export const abstractEditState = {
    active: false,
    teardown: null,             // () => void; called by editMenu toggle / exit
    restoreInfoPanel: null,     // () => void; called by resetSidebar on background click
    previousRootView: null,     // view to restore on exit
};

export function setSidebarState(manager, newState) {
    const previousState = manager.sidebarState;
    manager.sidebarState = newState;

    // Clear element hover effects
    if (previousState === 'element')
        d3.selectAll('.force-hover').classed('force-hover', false);

    // No need to update a button when it was just clicked again
    if (previousState === newState) return;

    // If a button was highlighted, unhighlight it
    if (previousState !== null && previousState !== 'element')
        updateButtonState(manager, previousState);

    // If the new state is from a button, highlight said button
    if (newState !== null && newState !== 'element')
        updateButtonState(manager, newState);
}
