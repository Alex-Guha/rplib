import { navigateTo } from '../core/navigation.js';
import { setSidebarState } from '../utils/state.js';
import { getViewStructure } from 'rplib/parser';

// Handles the click event for the nav menu button
export const showViews = (event, manager) => {
    event.stopPropagation();

    const infoElement = document.getElementById('info');
    infoElement.innerHTML = '';

    const viewTitle = document.createElement('div');
    viewTitle.textContent = 'View Structure';
    viewTitle.className = 'view-title';
    infoElement.appendChild(viewTitle);

    const viewDropdown = document.createElement('div');
    viewDropdown.className = 'view-container';
    buildViewTree(manager, manager.canvas.store.rootView, viewDropdown, event);
    infoElement.appendChild(viewDropdown);

    const abstractTitle = document.createElement('div');
    abstractTitle.textContent = manager.labels.abstract.plural;
    abstractTitle.className = 'view-title';
    abstractTitle.style.marginTop = '30px';
    infoElement.appendChild(abstractTitle);

    const abstractMenu = document.createElement('div');
    abstractMenu.className = 'view-container';

    Object.keys(manager.canvas.store.abstractDefinitions).forEach(abstractName => {
        if (abstractName === manager.canvas.store.rootView) return;
        const abstractItem = document.createElement('div');
        abstractItem.textContent = adjustName(abstractName);
        abstractItem.className = 'view-item';

        abstractItem.addEventListener('click', () => {
            navigateTo(manager, abstractName);
            showViews(event, manager);
            setSidebarState(manager, 'views-button');
        });

        abstractMenu.appendChild(abstractItem);
    });

    infoElement.appendChild(abstractMenu);
};

function buildViewTree(manager, viewName, parentContainer, originalEvent) {
    const viewRow = document.createElement('div');
    viewRow.className = 'view-item';

    const detailViews = getViewStructure(viewName);
    if (detailViews && detailViews.length > 0) {
        const expandIcon = document.createElement('span');
        expandIcon.className = 'expand-icon';
        expandIcon.textContent = '▶';

        const childrenContainer = document.createElement('div');
        childrenContainer.className = 'view-children';

        detailViews.forEach(childView => {
            buildViewTree(manager, childView, childrenContainer, originalEvent);
        });

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

    const viewLabel = document.createElement('span');
    viewLabel.textContent = adjustName(viewName);
    viewLabel.style.cursor = 'pointer';

    viewLabel.addEventListener('click', () => {
        navigateTo(manager, viewName);
        showViews(originalEvent, manager);
        setSidebarState(manager, 'views-button');
    });

    viewRow.appendChild(viewLabel);
}

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
