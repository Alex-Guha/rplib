import { appendMultilineText } from './dom.js';

// Render an error-themed message into a transient panel slot. Routed through
// the PanelHost's transient takeover, so it works regardless of which panels
// (if any) the consumer configured.
export function displayError(message, manager) {
    manager.panelHost.pushTransient((slot) => {
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
