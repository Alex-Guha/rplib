import { updateReferences } from '../core/sidebar.js';
import { appendMultilineText } from './dom.js';

// Render an error-themed message into the references box.
// `message`: first line becomes the header, remaining lines become the body.
// Returns the box element so callers can attach extra controls (e.g. buttons).
function renderInReferencesBox(message, manager) {
    const box = document.getElementById('references');
    box.innerHTML = '';

    box.style.setProperty('background-color', manager.currentTheme.ERROR_BACKGROUND);
    box.style.setProperty('color', manager.currentTheme.ERROR_TEXT);

    const lines = message.split('\n');

    const header = document.createElement('h3');
    header.textContent = lines[0];
    box.appendChild(header);

    const body = document.createElement('div');
    body.style.marginTop = '10px';
    appendMultilineText(body, lines.slice(1).join('\n'), { paragraphBreak: true });
    box.appendChild(body);

    return box;
}

export function displayError(message, manager) {
    renderInReferencesBox(message, manager);
}

export function confirmAction(message, manager) {
    return new Promise((resolve) => {
        // Prevent memory leaks if the references box is cleared before an option is selected
        const timeout = setTimeout(() => {
            resolve(false);
            updateReferences(manager);
        }, 30000);

        const box = renderInReferencesBox(message, manager);

        const confirmButton = document.createElement('button');
        confirmButton.textContent = 'Confirm';
        confirmButton.style.marginTop = 'auto';
        confirmButton.addEventListener('click', () => {
            clearTimeout(timeout);
            resolve(true);
        });
        box.appendChild(confirmButton);

        const cancelButton = document.createElement('button');
        cancelButton.textContent = 'Cancel';
        cancelButton.addEventListener('click', () => {
            clearTimeout(timeout);
            resolve(false);
            updateReferences(manager);
        });
        box.appendChild(cancelButton);
    });
}
