import { navigateTo } from '../core/navigation.js';
import { setSidebarState, componentEditState, abstractEditState } from '../utils/state.js'
import { appendMultilineText } from '../utils/dom.js';
import { setComponentEditTarget } from '../sidebarMenu/componentEditor/helpers.js';

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
    updateReferences(manager);

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

    // If the element has references, change the references box
    updateReferences(manager, manager.canvas.findHierarchicalElementProperty(id, 'references') || null);

    // For any updateSidebar call aside from the reference list items (i.e. on hovering over elements in the svg)
    // Populate the info box with data from the element
    const hasDetails = !!manager.canvas.findHierarchicalElementProperty(id, 'details');
    updateInfo(manager, manager.canvas.findHierarchicalElementProperty(id, 'description') || "No additional information.", hasDetails);
}

// Handles hovering over items in the reference box
export function attachReferenceEventListeners(element) {
    let originalNodes = null;

    element.on('mouseover', (event) => {
        // Save the current state of the info box
        const infoBox = document.getElementById('info');
        originalNodes = document.createDocumentFragment();
        while (infoBox.firstChild) {
            originalNodes.appendChild(infoBox.firstChild);
        }

        // Render reference data in the info box regardless of persistent state
        renderInfoContent(event.currentTarget.dataset.info, infoBox);
    })
        .on('mouseout', () => {
            // Restore the original content of the info box
            if (originalNodes !== null) {
                const infoBox = document.getElementById('info');
                infoBox.innerHTML = '';
                infoBox.appendChild(originalNodes);
                originalNodes = null;
            }
        })
        .style('cursor', 'pointer');
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

// Creates the references box
export function updateReferences(manager, elementReferences = null) {
    const referencesBox = document.getElementById('references');
    referencesBox.innerHTML = '';
    referencesBox.appendChild(document.createElement('h3')).textContent = 'References';
    referencesBox.style = '';

    const referencesList = document.createElement('ul');
    referencesList.id = 'references-list';

    let refsToRender = elementReferences;
    if (!refsToRender) refsToRender = manager.canvas.store.views[manager.canvas.store.currentView]
        ? manager.canvas.store.views[manager.canvas.store.currentView].references
        : null;

    if (refsToRender) {
        Object.entries(refsToRender).forEach(([title, ref]) => {
            const li = document.createElement('li');
            const a = document.createElement('a');

            a.href = ref.link || '#';
            a.target = "_blank";
            a.textContent = (title || 'Untitled') + (ref.refType ? ` (${ref.refType})` : '');
            a.dataset.info =
                (ref.title ? `**Reference Name:** ${ref.title}\n\n` : '') +
                (ref.info ? `**Description:** ${ref.info}\n\n` : '') +
                (ref.authors && ref.authors.length ? `**Authors:**\n${ref.authors.map(a => `• ${a}`).join('\n')}\n\n` : '') +
                (ref.refType ? `**Link type:** ${ref.refType}\n\n` : '');

            attachReferenceEventListeners(d3.select(a));

            li.appendChild(a);
            referencesList.appendChild(li);
        });
    }
    referencesBox.appendChild(referencesList);
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

    renderInfoContent(content, element);

    if (hasDetails) {
        const footer = document.createElement('div');
        footer.className = 'info-details-hint';
        footer.textContent = 'Double-click to open';
        element.appendChild(footer);
    }
}

// Render formatted content into a target element. Used by both updateInfo
// (after placeholder substitution) and the reference-hover preview (which
// doesn't need substitution).
function renderInfoContent(content, element) {
    let currentIndex = 0;
    while (currentIndex < content.length) {
        if (content.startsWith('$$', currentIndex)) {
            currentIndex = handleLaTeXContent(content, currentIndex, element);
        } else if (content.startsWith('**', currentIndex)) {
            currentIndex = handleBoldContent(content, currentIndex, element);
        } else {
            currentIndex = handlePlainText(content, currentIndex, element);
        }
    }
}

// Helper function to replace {{property}} placeholders with values from abstract properties
function replacePlaceholders(text, properties) {
    const templateRegex = /\{\{([^}|]+)(\|([^}]+))?\}\}/g;
    return text.replace(templateRegex, (_, propName, _defaultPart, defaultValue) => {
        return properties.hasOwnProperty(propName) ? properties[propName] : (defaultValue ?? '');
    });
}

function handleLaTeXContent(content, currentIndex, element) {
    const endIndex = content.indexOf('$$', currentIndex + 2);
    if (endIndex === -1) {
        console.error('Unclosed LaTeX at position', currentIndex);
        return content.length;
    }
    const latexContent = content.slice(currentIndex + 2, endIndex);
    const span = document.createElement('span');
    katex.render(latexContent, span, {
        throwOnError: false,
        displayMode: false
    });
    element.appendChild(span);
    return endIndex + 2;
}

function handleBoldContent(content, currentIndex, element) {
    const endIndex = content.indexOf('**', currentIndex + 2);
    if (endIndex === -1) {
        console.error('Unclosed bold at position', currentIndex);
        return content.length;
    }
    const boldContent = content.slice(currentIndex + 2, endIndex);
    const strong = document.createElement('strong');
    strong.textContent = boldContent;
    element.appendChild(strong);
    return endIndex + 2;
}

function handlePlainText(content, currentIndex, element) {
    const nextSpecialChar = Math.min(
        content.indexOf('$$', currentIndex) === -1 ? Infinity : content.indexOf('$$', currentIndex),
        content.indexOf('**', currentIndex) === -1 ? Infinity : content.indexOf('**', currentIndex)
    );
    const textContent = content.slice(currentIndex, nextSpecialChar === Infinity ? undefined : nextSpecialChar);
    appendMultilineText(element, textContent);
    return nextSpecialChar === Infinity ? content.length : nextSpecialChar;
}
