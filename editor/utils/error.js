import { updateReferences } from '../core/sidebar.js';
import { appendMultilineText } from './dom.js';

import { appManager } from '../instance.js';

// Render an error-themed message into the references box.
// `message`: first line becomes the header, remaining lines become the body.
// Returns the box element so callers can attach extra controls (e.g. buttons).
function renderInReferencesBox(message) {
    const box = document.getElementById('references');
    box.innerHTML = '';

    box.style.setProperty('background-color', appManager.currentTheme.ERROR_BACKGROUND);
    box.style.setProperty('color', appManager.currentTheme.ERROR_TEXT);

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

export function displayError(message) {
    renderInReferencesBox(message);
}

export function confirmAction(message) {
    return new Promise((resolve) => {
        // Prevent memory leaks if the references box is cleared before an option is selected
        const timeout = setTimeout(() => {
            resolve(false);
            updateReferences();
        }, 30000);

        const box = renderInReferencesBox(message);

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
            updateReferences();
        });
        box.appendChild(cancelButton);
    });
}
