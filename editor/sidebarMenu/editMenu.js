import { updateInfo } from '../core/sidebar.js';
import { componentEditState, abstractEditState } from '../utils/state.js'

import { appManager } from '../instance.js';
import serializeAbstractDefinition from 'rplib/parser/serializeAbstractFormat.js';
import { enterComponentMode, exitComponentMode } from './componentEditor/index.js';
import { createAbstractEditor, exitAbstractMode } from './abstractEditor/index.js';

// ==========================
// Edit Menu Functions
// ==========================

// Handles the click event for the nav edit button
export const showEditOptions = (event) => {
    event.stopPropagation();

    // Clicking the edit nav button while in component-edit mode toggles out.
    if (componentEditState.active) {
        exitComponentMode();
        return;
    }
    // Same for abstract-edit mode.
    if (abstractEditState.active) {
        exitAbstractMode();
        return;
    }

    const infoElement = document.getElementById('info');
    infoElement.innerHTML = '';

    const optionsContainer = document.createElement('div');
    optionsContainer.className = 'edit-container';

    const lower = appManager.labels.abstract.singular.toLowerCase();
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
            updateInfo('');

            switch (option.id) {
                case 'edit-abstract':
                    handleEditAbstract();
                    break;
                case 'new-abstract':
                    handleNewAbstract();
                    break;
                case 'new-component':
                    handleNewComponent();
                    break;
            }
        });

        optionsContainer.appendChild(button);
    });

    infoElement.appendChild(optionsContainer);
};

function handleEditAbstract() {
    let abstractText = '';

    // Display the abstract definitions file version of the abstract in a text editor
    if (appManager.canvas.store.rootView !== '') {
        const currentAbstract = appManager.canvas.store.rootView;
        const intermediateStructure = appManager.canvas.store.abstractDefinitions[currentAbstract];
        abstractText = serializeAbstractDefinition(currentAbstract, intermediateStructure);
    }

    createAbstractEditor(abstractText, { isNew: false });
}

function handleNewAbstract() {
    appManager.canvas.setCurrentView('');
    createAbstractEditor('', { isNew: true });
}

function handleNewComponent() {
    enterComponentMode();
}
