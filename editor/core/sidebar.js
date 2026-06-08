import { navigateTo } from '../core/navigation.js';
import { setSidebarState, componentEditState, abstractEditState } from '../utils/state.js'
import { setComponentEditTarget } from '../sidebarMenu/componentEditor/helpers.js';
import { buildPanelContext, renderRichText } from '@alexguha/rplib/panel';

// Re-render the configured sidebar panels for the given hovered element id
// (null on reset). Callers are responsible for the edit-mode guards — see
// resetSidebar / attachElementEventListeners — so panels never repopulate while
// the component or abstract editor owns the sidebar.
function updatePanels(manager, id = null) {
    manager.panelHost?.update(buildPanelContext({ manager, id }));
}

// Wire up the background-click reset. Call once from createEditor after the DOM is ready.
export function initSidebar(manager) {
    d3.select('#svg').on('click', () => resetSidebar(manager));
}

// Resets the sidebar to its default state
export function resetSidebar(manager) {
    // Abstract-edit mode pins the CodeMirror editor in the #info pane.
    // Background clicks remount the editor (overriding whatever element info
    // was shown); afterViewChange just re-runs the same remount. Element
    // clicks themselves still wipe #info to show element details — they go
    // through updateInfo, not resetSidebar.
    if (abstractEditState.active) {
        abstractEditState.restoreInfoPanel?.();
        return;
    }

    // In component-edit mode, background clicks deselect the current target
    // and surface the component-level form instead of wiping the panel.
    // Clear sidebarState so any open menu nav button (settings/views) drops
    // its highlight — the edit button is pinned separately while active.
    if (componentEditState.active) {
        setComponentEditTarget(null);
        setSidebarState(manager, null);
        componentEditState.onBackgroundClick?.();
        return;
    }
    setSidebarState(manager, null);
    updateInfo(manager, '');
    updatePanels(manager, null);

    // QoL: Clear any accidental highlights
    if (window.getSelection) {
        const selection = window.getSelection();
        if (selection) selection.removeAllRanges();
    } else if (document.selection) {
        document.selection.empty();
    }
}

// Updates the sidebar with information from the hovered element
export function updateSidebar(event, manager) {
    const target = event.currentTarget;
    const id = target.getAttribute('id');

    // Re-render the sidebar panels (references, etc.) for this element.
    updatePanels(manager, id);

    // For any updateSidebar call aside from the reference list items (i.e. on hovering over elements in the svg)
    // Populate the info box with data from the element
    const hasDetails = !!manager.canvas.findHierarchicalElementProperty(id, 'details');
    updateInfo(manager, manager.canvas.findHierarchicalElementProperty(id, 'description') || "No additional information.", hasDetails);
}

// Handles items with details (double-clickable items)
export function attachDetailEventListeners(element, manager) {
    element.on('dblclick touchend', (event) => {
        event.stopPropagation();
        setSidebarState(manager, null);

        // Handle touch events for mobile devices
        if (event.type === 'touchend') {
            const now = Date.now();
            const timeSinceLastTouch = now - (element._lastTouch || 0);
            element._lastTouch = now;

            // If the time between two touch events is less than 300ms, treat it as a double-tap
            if (timeSinceLastTouch < 300) {
                navigateTo(manager, manager.canvas.findHierarchicalElementProperty(event.currentTarget.getAttribute('id'), 'details'));
            }
        } else {
            navigateTo(manager, manager.canvas.findHierarchicalElementProperty(event.currentTarget.getAttribute('id'), 'details'));
        }
    })
        .style('cursor', 'pointer');
}

// Generic event listener for updating the sidebar
export function attachElementEventListeners(element, manager) {
    element.on('mouseover', (event) => {
        if (componentEditState.active) return;
        if (manager.sidebarState === null) updateSidebar(event, manager);
    })
        .on('click', (event) => {
            event.stopPropagation(); // Prevent the background click
            if (componentEditState.active && componentEditState.onElementClick) {
                componentEditState.onElementClick(event);
                return;
            }
            setSidebarState(manager, 'element');
            updateSidebar(event, manager);
            const node = element.node();
            if (node.tagName === 'rect' || node.tagName === 'polygon') {
                element.classed('force-hover', true);
            } else {
                const pinId = node.getAttribute('data-pin-shape-id');
                if (pinId) {
                    const shape = document.getElementById(pinId);
                    if (shape) shape.classList.add('force-hover');
                }
            }
        })
        .on('mouseout', () => {
            if (componentEditState.active) return;
            if (manager.sidebarState === null) resetSidebar(manager);
        })
        .style('cursor', 'pointer');
}

// Creates the info box. `manager` is required to resolve {{property}}
// placeholders against the current root abstract's properties.
export function updateInfo(manager, content, hasDetails = false) {
    const element = document.getElementById('info');
    element.innerHTML = "";

    // Replace placeholders with abstract property values
    const rootView = manager.canvas.store.rootView;
    const rootProps = rootView ? (manager.canvas.store.abstractDefinitions[rootView]?.properties || {}) : {};
    content = replacePlaceholders(content, rootProps);

    renderRichText(content, element);

    if (hasDetails) {
        const footer = document.createElement('div');
        footer.className = 'info-details-hint';
        footer.textContent = 'Double-click to open';
        element.appendChild(footer);
    }
}

// Helper function to replace {{property}} placeholders with values from abstract properties
function replacePlaceholders(text, properties) {
    const templateRegex = /\{\{([^}|]+)(\|([^}]+))?\}\}/g;
    return text.replace(templateRegex, (_, propName, _defaultPart, defaultValue) => {
        return properties.hasOwnProperty(propName) ? properties[propName] : (defaultValue ?? '');
    });
}
