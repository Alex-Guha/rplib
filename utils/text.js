import katex from 'katex';
import attachListeners from './attachListeners.js';

/**
 * Draws text relative to the item's layout.
 * The first word in the text's position property is the arrangement relative to the center of the item. 'top' is default.
 * The second is relative to the side of the item. 'center' is default.
 * Example: 'top-left', 'bottom-right', 'center'.
 */
export default function drawText(self, textObject, item, itemLayout, callback, id) {

    // Don't render the text if it's been toggled off. It is up to the user how this toggle should be checked.
    if (callback && callback(textObject)) return;

    // Using architecture specific properties, replace any {{property}} placeholders with the corresponding property.
    // Resolved into a local string; the parsed textObject is not mutated.
    const templateRegex = /\{\{([^}|]+)(\|([^}]+))?\}\}/g;
    const applyPlaceholders = (text, properties) =>
        text.replace(templateRegex, (_, propName, _defaultPart, defaultValue) =>
            properties.hasOwnProperty(propName) ? properties[propName] : (defaultValue ?? '')
        );
    // Read from the resolved root view, not the upstream DSL definitions, so the renderer
    // stays agnostic to whatever produced the intermediate format.
    const properties = self.store.views[self.store.rootView]?.properties ?? {};
    const isLatex = !!textObject.latexText;
    const resolved = isLatex
        ? applyPlaceholders(textObject.latexText, properties)
        : (textObject.text ? applyPlaceholders(textObject.text, properties) : '');

    // Handle latex differently than normal text
    const label = isLatex ? createLatexLabel(resolved, textObject, self.theme) : createTextLabel(resolved, textObject, self.theme);
    label.setAttribute('id', id);

    // Set the base position of the text, before relative positioning
    const textObjectX = itemLayout.x + (itemLayout.xSpacing ? itemLayout.xSpacing * ((item.count ?? 1) - 1) / 2 : 0) + (textObject.xOffset ?? 0);
    const textObjectY = itemLayout.y + (textObject.yOffset ?? 0);
    label.setAttribute('x', textObjectX);
    label.setAttribute('y', textObjectY);

    // Property inheritance is handled at read time by findHeirarchicalElementProperty;
    // this call only attaches DOM listeners, no longer mutates objects.
    attachListeners(label, textObject, item, self.eventListenerTargets);

    // Render the text
    self.canvasDOM.append(() => (label));

    // After rendering, use the text's height and width to position it correctly relative to the item
    setTimeout(() => {
        const bbox = label.getBBox();
        let adjustedX = textObjectX;
        let adjustedY = textObjectY;
        const height = itemLayout.height;
        const width = itemLayout.width;

        // top-center is default
        // the first word is the arrangement relative to the center of the box
        const relativeToCenter = textObject.position ? textObject.position.split('-')[0] : 'top';
        // the second is relative to the side of the box that the text is on
        const relativeToSide = textObject.position ? textObject.position.split('-')[1] || 'center' : 'center';

        if (['right', 'left'].includes(relativeToCenter)) {
            adjustedX += xAlign(relativeToCenter, width, bbox, isLatex);
            adjustedY += ySide(relativeToSide, height, bbox, isLatex);
        } else {
            adjustedX += xSide(relativeToSide, width, bbox, isLatex);
            adjustedY += yAlign(relativeToCenter, height, bbox, isLatex);
        }

        label.setAttribute('x', adjustedX);
        label.setAttribute('y', adjustedY);
    }, 0);
}

// The +/-5 in any of these is just a little padding

function xAlign(pos, width, bbox, latex) {
    switch (pos) {
        case 'left': return -bbox.width - (latex ? 10 : 5);
        case 'right': return width + (latex ? 10 : 5);
        default: return width / 2 - bbox.width / 2;
    }
}

function yAlign(pos, height, bbox, latex) {
    switch (pos) {
        case 'top': return - bbox.height / (latex ? 1 : 2) - (latex ? 5 : 0);
        case 'bottom': return height + (latex ? 0 : bbox.height) + (latex ? 5 : 0);
        default: return height / 2 + bbox.height / (latex ? -2 : 4);
    }
}

function xSide(pos, width, bbox, latex) {
    switch (pos) {
        case 'left': return 0;
        case 'right': return width - bbox.width;
        default: return width / 2 - bbox.width / 2;
    }
}

function ySide(pos, height, bbox, latex) {
    switch (pos) {
        case 'top': return latex ? 0 : bbox.height / 2 + 1; // Extra +1 for normal text, they have weird bboxes
        case 'bottom': return height - (latex ? bbox.height : 0);
        default: return height / 2 + bbox.height / (latex ? -2 : 4);
    }
}

// Occasionally, the latex text is clipped on the left and right sides a little bit, not sure why.
// Handled with overflow: visible for now, but it causes a little bit of positioning issues.
function createLatexLabel(latexText, textObject, theme) {
    const foreignObject = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    foreignObject.setAttribute('overflow', 'visible');

    const div = document.createElement('div');
    div.style.fontSize = '18px';
    div.style.color = colorSwitch(textObject.color, theme);

    // The width and height of LaTeX needs to be set directly, so we need to measure it first
    div.style.display = 'inline-block';
    div.style.visibility = 'hidden';
    div.style.whiteSpace = 'nowrap';
    document.body.appendChild(div);
    katex.render(latexText, div, { throwOnError: true });
    const { width, height } = div.getBoundingClientRect();
    document.body.removeChild(div);

    foreignObject.setAttribute('width', Math.ceil(width));
    foreignObject.setAttribute('height', Math.ceil(height));

    div.style.visibility = 'visible';
    div.style.display = 'flex';
    div.style.justifyContent = 'center';
    div.style.alignItems = 'center';
    div.style.height = '100%';

    foreignObject.appendChild(div);

    return foreignObject;
}

function createTextLabel(text, textObject, theme) {
    const textElement = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    textElement.setAttribute('fill', colorSwitch(textObject.color, theme));
    textElement.textContent = text;

    return textElement;
}

// Helper that first looks for an integer between 1 and however many colors are specified, then falls back to assuming the color has been overidden and specified directly.
function colorSwitch(color, theme) {
    return color
        ? (typeof color === 'number' && color >= 1 && color <= theme.TEXT_COLOR.length
            ? theme.TEXT_COLOR[color - 1]
            : color
        ) : theme.TEXT_COLOR[0];
}
