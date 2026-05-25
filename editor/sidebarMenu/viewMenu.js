import { navigateTo } from '../core/navigation.js';
import { setSidebarState } from '../utils/state.js';
import { getViewStructure } from 'rplib/parser/viewStructures.js';

import { appManager } from '../instance.js';

// Handles the click event for the nav menu button
export const showViews = (event) => {
    event.stopPropagation();

    const infoElement = document.getElementById('info');
    infoElement.innerHTML = '';

    const viewTitle = document.createElement('div');
    viewTitle.textContent = 'View Structure';
    viewTitle.className = 'view-title';
    infoElement.appendChild(viewTitle);

    const viewDropdown = document.createElement('div');
    viewDropdown.className = 'view-container';
    buildViewTree(appManager.canvas.store.rootView, viewDropdown);
    infoElement.appendChild(viewDropdown);

    const archTitle = document.createElement('div');
    archTitle.textContent = appManager.labels.abstract.plural;
    archTitle.className = 'view-title';
    archTitle.style.marginTop = '30px';
    infoElement.appendChild(archTitle);

    const archMenu = document.createElement('div');
    archMenu.className = 'view-container';

    Object.keys(appManager.canvas.store.abstractDefinitions).forEach(architecture => {
        if (architecture === appManager.canvas.store.rootView) return;
        // The component editor mounts a transient abstract definition to host
        // the in-progress component; it isn't a real architecture and shouldn't
        // appear in the navigable list.
        if (architecture.startsWith('__')) return;
        const architectureName = document.createElement('div');
        architectureName.textContent = adjustName(architecture);
        architectureName.className = 'view-item';

        architectureName.addEventListener('click', () => {
            navigateTo(architecture);
            showViews(event);
            setSidebarState('views-button');
        });

        archMenu.appendChild(architectureName);
    });

    infoElement.appendChild(archMenu);
};

// Helper function to build the tree structure recursively
function buildViewTree(viewName, parentContainer) {
    const viewRow = document.createElement('div');
    viewRow.className = 'view-item';

    // Create expand/collapse icon if view has children
    const detailViews = getViewStructure(viewName);
    if (detailViews && detailViews.length > 0) {
        const expandIcon = document.createElement('span');
        expandIcon.className = 'expand-icon';
        expandIcon.textContent = '▶';

        // Create the children container
        const childrenContainer = document.createElement('div');
        childrenContainer.className = 'view-children';

        // Build child views
        detailViews.forEach(childView => {
            buildViewTree(childView, childrenContainer);
        });

        // Add click handler for expand/collapse
        expandIcon.addEventListener('click', (e) => {
            e.stopPropagation();
            const isExpanded = childrenContainer.style.display !== 'none';
            childrenContainer.style.display = isExpanded ? 'none' : 'flex';
            expandIcon.style.transform = isExpanded ? 'rotate(0deg)' : 'rotate(90deg)';
        });

        viewRow.appendChild(expandIcon);
        parentContainer.appendChild(viewRow);
        parentContainer.appendChild(childrenContainer);
    } else {
        parentContainer.appendChild(viewRow);
    }

    // Create the view name element
    const viewLabel = document.createElement('span');
    viewLabel.textContent = adjustName(viewName);
    viewLabel.style.cursor = 'pointer';

    // Add click handler to navigate to view
    viewLabel.addEventListener('click', () => {
        navigateTo(viewName);
        showViews(event);
        setSidebarState('views-button');
    });

    viewRow.appendChild(viewLabel);
}

// Adjust the name to be more readable (removes underscore and integer at the end, replaces dashes and underscores with spaces, capitalizes words, puts "abstract" in parentheses if it appears at the end)
function adjustName(name) {
    return name
        .replace(/_\d+$/, '')
        .replace(/[-_]/g, ' ')
        .replace(/\b\w+/g, (word, index, str) => {
            if (word.toLowerCase() === 'abstract' && str.slice(str.lastIndexOf(' ', str.lastIndexOf(word) - 1) + 1).trim() === word) {
                return `(${word})`;
            }
            return word.charAt(0).toUpperCase() + word.slice(1);
        });
}