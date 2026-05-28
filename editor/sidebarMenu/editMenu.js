import { updateInfo } from '../core/sidebar.js';
import { componentEditState, abstractEditState } from '../utils/state.js'

import { serializeAbstractDefinition } from 'rplib/parser';
import { enterComponentMode, exitComponentMode } from './componentEditor/index.js';
import { createAbstractEditor, exitAbstractMode } from './abstractEditor/index.js';

// ==========================
// Edit Menu Functions
// ==========================

// Handles the click event for the nav edit button
export const showEditOptions = (event, manager) => {
    event.stopPropagation();

    // Clicking the edit nav button while in component-edit mode toggles out.
    if (componentEditState.active) {
        exitComponentMode(manager);
        return;
    }
    // Same for abstract-edit mode.
    if (abstractEditState.active) {
        exitAbstractMode(manager);
        return;
    }

    const infoElement = document.getElementById('info');
    infoElement.innerHTML = '';

    const optionsContainer = document.createElement('div');
    optionsContainer.className = 'edit-container';

    const lower = manager.labels.abstract.singular.toLowerCase();
    const options = [
        { id: 'edit-abstract', text: `Edit current ${lower}` },
        { id: 'new-abstract', text: `Create new ${lower}` },
        { id: 'new-component', text: 'Create new component' },
    ];

    options.forEach(option => {
        const button = document.createElement('button');
        button.id = option.id;
        button.textContent = option.text;
        button.className = 'edit-button';

        button.addEventListener('click', (e) => {
            e.stopPropagation();
            updateInfo(manager, '');

            switch (option.id) {
                case 'edit-abstract':
                    handleEditAbstract(manager);
                    break;
                case 'new-abstract':
                    handleNewAbstract(manager);
                    break;
                case 'new-component':
                    handleNewComponent(manager);
                    break;
            }
        });

        optionsContainer.appendChild(button);
    });

    infoElement.appendChild(optionsContainer);
};

function handleEditAbstract(manager) {
    let abstractText = '';

    // Display the abstract definitions file version of the abstract in a text editor
    if (manager.canvas.store.rootView !== '') {
        const currentAbstract = manager.canvas.store.rootView;
        const intermediateStructure = manager.canvas.store.abstractDefinitions[currentAbstract];
        abstractText = serializeAbstractDefinition(currentAbstract, intermediateStructure);
    }

    createAbstractEditor(manager, abstractText, { isNew: false });
}

function handleNewAbstract(manager) {
    manager.canvas.setCurrentView('');
    createAbstractEditor(manager, '', { isNew: true });
}

function handleNewComponent(manager) {
    enterComponentMode(manager);
}
