import { appendMultilineText } from './dom.js';

// Render an error-themed message into the references box.
export function displayError(message, manager) {
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
}
