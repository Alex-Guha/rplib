import { navigateTo } from '../core/navigation.js';
import { updateInfo } from '../core/sidebar.js';
import { displayError } from '../utils/error.js';
import { setSidebarState, componentEditState } from '../utils/state.js'

import { appManager } from '../instance.js';
import { parseAbstractContent } from 'rplib/parser/parseAbstractFile.js';
import serializeAbstractDefinition from 'rplib/parser/serializeAbstractFormat.js';
import { saveAbstractDefinitions } from 'rplib/parser/storage.js';
import { enterComponentMode, exitComponentMode } from './componentEditor.js';

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

    const infoElement = document.getElementById('info');
    infoElement.innerHTML = '';

    const optionsContainer = document.createElement('div');
    optionsContainer.className = 'edit-container';

    const lower = appManager.labels.abstract.singular.toLowerCase();
    const options = [
        { id: 'edit-architecture', text: `Edit current ${lower}` },
        { id: 'new-architecture', text: `Create new ${lower}` },
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
            // TODO track if in edit mode, and modify other event listeners accordingly
            // Make the edit button a toggle (only toggles on when one of the below options is clicked instead of when the button is clicked)
            // Prevent background click from closing the sidebar

            switch (option.id) {
                case 'edit-architecture':
                    handleEditArchitecture();
                    break;
                case 'new-architecture':
                    handleNewArchitecture();
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

function handleEditArchitecture() {
    let architecture = '';

    // Display the architectures.txt version of the architecture in a text editor
    if (appManager.canvas.store.rootView !== '') {
        const currentArchitecture = appManager.canvas.store.rootView;
        const intermediateStructure = appManager.canvas.store.abstractDefinitions[currentArchitecture];
        architecture = serializeAbstractDefinition(currentArchitecture, intermediateStructure);
    }

    createArchitectureEditor(architecture);
}

function handleNewArchitecture() {
    appManager.canvas.setCurrentView('');
    createArchitectureEditor();
}

// XXX Potentially add event listeners for when the user navigates away while unsaved to prompt for saving changes
function createArchitectureEditor(architectureText = '') {
    // TODO https://codemirror.net/5/doc/manual.html
    // var myCodeMirror = CodeMirror.fromTextArea(textarea);
    // - Ideally indentation should be clearer
    // - users should be able to add components from a defined list instead of typing them out - for now, think of a clever way to show what is available
    // TODO Another possible alternative is to use editable divs in a vertical flexbox, probably way more difficult though

    const infoElement = document.getElementById('info');
    infoElement.innerHTML = '';

    const textarea = document.createElement('textarea');
    textarea.id = 'abstract-editor';
    textarea.textContent = architectureText;
    textarea.spellcheck = false;
    textarea.wrap = 'off';

    const applyButton = document.createElement('button');
    applyButton.textContent = 'Apply Changes';

    const applyChanges = (e) => {
        e.stopPropagation();
        const newArchitectureText = textarea.value;
        if (!newArchitectureText.trim()) return;

        let newArchitecture;
        try {
            newArchitecture = parseAbstractContent(newArchitectureText);
        } catch (error) {
            displayError(`Error Parsing ${appManager.labels.abstract.singular}\n${error.message}\nPlease check the syntax and try again.`);
            return;
        }

        const newArchitectureName = Object.keys(newArchitecture)[0].replace(/_\d+$/, '');

        let architectureName = newArchitectureName;
        let i = 1;
        while (appManager.canvas.store.views[architectureName]) {
            architectureName = `${newArchitectureName}_${i}`;
            i++;
        }

        appManager.canvas.store.abstractDefinitions[architectureName] = Object.values(newArchitecture)[0];
        saveAbstractDefinitions(appManager.canvas, localStorage);
        navigateTo(architectureName);
        createArchitectureEditor(serializeAbstractDefinition(architectureName, appManager.canvas.store.abstractDefinitions[architectureName]));
        setSidebarState('edit-button');
    };

    // Add keyboard shortcut for Ctrl+S or Cmd+S
    textarea.addEventListener('keydown', (e) => {
        // Check for Ctrl+S (Windows/Linux) or Cmd+S (Mac)
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault(); // Prevent browser's save dialog
            applyChanges(e);
        }
    });

    // Add click handler for the apply button
    applyButton.addEventListener('click', applyChanges);

    infoElement.appendChild(textarea);
    infoElement.appendChild(applyButton);
}

function handleNewComponent() {
    enterComponentMode();
}