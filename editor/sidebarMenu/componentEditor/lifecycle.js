// Component-creation mode. The user picks "Create new component" from the edit
// menu, lands on a blank seed component, and authors it directly in the canvas
// via the rplib live-update API. The single source of truth is
// `canvas.components[name]` — every form field reads from there on render,
// every change writes through `canvas.updateComponent`.

import { navigateTo, drawNavigation } from '../../core/navigation.js';
import { setSidebarState, componentEditState } from '../../utils/state.js';
import {
    saveCustomComponent,
    removeCustomComponent,
    clearPendingRename,
} from '../../utils/storage.js';
import { EDITING_VIEW, SEED_CONTENT } from './constants.js';
import { uniqueComponentName, setComponentEditTarget } from './helpers.js';
import { handleElementClick, highlightTarget } from './target.js';
import { renderInfoPanel, resetAdvancedMode } from './render.js';

export function enterComponentMode(manager) {
    if (componentEditState.active) return;
    const canvas = manager.canvas;
    const name = uniqueComponentName(manager, 'new_component');

    componentEditState.active = true;
    componentEditState.name = name;
    setComponentEditTarget('box');
    componentEditState.previousRootView = canvas.store.rootView || '';
    componentEditState.isSeed = true;
    componentEditState.pendingRenameFrom = null;
    resetAdvancedMode();

    // Synthesize a transient abstract definition that wraps the component.
    canvas.store.abstractDefinitions[EDITING_VIEW] = {
        properties: {},
        content: { [name]: {} },
    };
    canvas.components[name] = { content: SEED_CONTENT() };

    // Edit-history is repurposed as the in-session undo stack for the arrow
    // buttons — start fresh so the user can't undo into prior unrelated state.
    canvas.clearEditHistory();
    canvas.invalidateView(EDITING_VIEW);

    // Autosave + seed-flag tracking. canvasManager has no `off` API; we guard
    // by checking componentEditState.active inside the listener, and clear
    // the closure reference on exit.
    const autosave = ({ kind }) => {
        if (!componentEditState.active) return;
        // updateComponent on the editing component flips us out of "seed" state.
        if (kind === 'updateComponent') componentEditState.isSeed = false;
        const currentName = componentEditState.name;
        // Pending-rename sweep: if an old name is lingering from a prior rename,
        // drop it now (see rename flow below).
        const pending = componentEditState.pendingRenameFrom;
        if (pending && pending !== currentName) {
            removeCustomComponent(pending, manager.storage);
            componentEditState.pendingRenameFrom = null;
            clearPendingRename(manager.storage);
        }
        // Don't persist while we're still on an unedited seed — otherwise the
        // next session sees a saved `new_component` and the name postfix
        // increments even though the user never authored anything.
        if (!componentEditState.isSeed) {
            const def = canvas.components[currentName];
            if (def) saveCustomComponent(currentName, def, manager.storage);
        }
        renderInfoPanel(manager);
        highlightTarget();
        // Refresh the back/forward arrows' enabled state for the new history depth.
        drawNavigation(manager);
    };
    canvas.on('afterMutate', autosave);
    componentEditState.autosaveUnsubscribe = () => {
        // Listener stays registered but gates on `active` — see autosave guard above.
        componentEditState.autosaveUnsubscribe = null;
    };

    componentEditState.onElementClick = (event) => handleElementClick(event, manager);
    componentEditState.onBackgroundClick = () => {
        renderInfoPanel(manager);
        highlightTarget();
    };
    // Delegate clicks at the canvas level so every shape is targetable —
    // attachElementEventListeners only fires for items that author
    // description/references, which a bare seed item does not.
    d3.select('#content').on('click.componentEditor', function (event) {
        const tag = event.target?.tagName;
        if (tag !== 'rect' && tag !== 'polygon') return;
        event.stopPropagation();
        handleElementClick({ currentTarget: event.target }, manager);
    });

    navigateTo(manager, EDITING_VIEW);
    // navigateTo's afterViewChange hook resets the sidebar, so apply our
    // sidebar state + render after navigation.
    setSidebarState(manager, 'edit-button');
    // Redraw nav so the arrows pick up the edit-mode handlers (afterViewChange
    // already drew them, but pre-active — at that point they wired to view nav).
    drawNavigation(manager);
    renderInfoPanel(manager);
    highlightTarget();
}

export function exitComponentMode(manager) {
    if (!componentEditState.active) return;
    const canvas = manager.canvas;

    const restoreTo = componentEditState.previousRootView;
    // Unedited seed: drop the orphan entry from canvas.components so the next
    // session doesn't see `new_component` as taken and bump the name to `_a`.
    if (componentEditState.isSeed && componentEditState.name) {
        delete canvas.components[componentEditState.name];
        removeCustomComponent(componentEditState.name, manager.storage);
    }
    componentEditState.active = false;
    setComponentEditTarget(null);
    componentEditState.name = null;
    componentEditState.onElementClick = null;
    componentEditState.onBackgroundClick = null;
    if (componentEditState.autosaveUnsubscribe) componentEditState.autosaveUnsubscribe();

    // Restore the user's saved render-delay preference. initializeSettings will
    // also do this on the navigateTo below, but only if there's a view to
    // restore to — handle it explicitly so the property is correct either way.
    const renderDelaySetting = manager.settings['rendering-delay'];
    if (renderDelaySetting) canvas.renderDelay = renderDelaySetting.state;

    delete canvas.store.abstractDefinitions[EDITING_VIEW];
    canvas.invalidateView(EDITING_VIEW);
    d3.select('#content').on('click.componentEditor', null);
    d3.selectAll('.component-edit-target, .component-edit-target-group').classed('component-edit-target component-edit-target-group', false);

    setSidebarState(manager, null);
    // Edit-history is per-session; drop entries so they can't leak into the
    // next session (and so consumers like view-nav arrows don't keep stale
    // canEditUndo/Redo state).
    canvas.clearEditHistory();
    if (restoreTo && canvas.store.abstractDefinitions[restoreTo]) {
        navigateTo(manager, restoreTo);
    } else {
        // No restore view → afterViewChange won't fire, so redraw nav manually
        // to revert the arrows back to view-navigation handlers.
        drawNavigation(manager);
    }
}
