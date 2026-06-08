import { appendMultilineText } from './dom.js';

// Render an error-themed message into a transient panel slot.
// `message`: first line becomes the header, remaining lines become the body.
// Returns the slot element so callers can attach extra controls (e.g. buttons).
// Routed through the PanelHost's transient takeover, so it works regardless of
// which panels (if any) the consumer configured.
function renderErrorPanel(message, manager) {
    return manager.panelHost.pushTransient((slot) => {
        slot.style.setProperty('background-color', manager.currentTheme.ERROR_BACKGROUND);
        slot.style.setProperty('color', manager.currentTheme.ERROR_TEXT);

        const lines = message.split('\n');

        const header = document.createElement('h3');
        header.textContent = lines[0];
        slot.appendChild(header);

        const body = document.createElement('div');
        body.style.marginTop = '10px';
        appendMultilineText(body, lines.slice(1).join('\n'), { paragraphBreak: true });
        slot.appendChild(body);
    });
}

export function displayError(message, manager) {
    renderErrorPanel(message, manager);
}

export function confirmAction(message, manager) {
    return new Promise((resolve) => {
        // Prevent memory leaks if the panel is cleared before an option is selected
        const timeout = setTimeout(() => {
            resolve(false);
            manager.panelHost.restore();
        }, 30000);

        const slot = renderErrorPanel(message, manager);

        const confirmButton = document.createElement('button');
        confirmButton.textContent = 'Confirm';
        confirmButton.style.marginTop = 'auto';
        confirmButton.addEventListener('click', () => {
            clearTimeout(timeout);
            resolve(true);
        });
        slot.appendChild(confirmButton);

        const cancelButton = document.createElement('button');
        cancelButton.textContent = 'Cancel';
        cancelButton.addEventListener('click', () => {
            clearTimeout(timeout);
            resolve(false);
            manager.panelHost.restore();
        });
        slot.appendChild(cancelButton);
    });
}
