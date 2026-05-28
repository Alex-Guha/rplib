// Append `text` to `parent`, converting newlines to <br> elements.
// `paragraphBreak: true` doubles the spacing (two <br>s per newline).
export function appendMultilineText(parent, text, { paragraphBreak = false } = {}) {
    const lines = text.split('\n');
    lines.forEach((line, index) => {
        parent.appendChild(document.createTextNode(line));
        if (index < lines.length - 1) {
            parent.appendChild(document.createElement('br'));
            if (paragraphBreak) parent.appendChild(document.createElement('br'));
        }
    });
}
