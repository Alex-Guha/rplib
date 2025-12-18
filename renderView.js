import d3 from 'd3';

// Iterates through the view and renders each element
export default function renderElements(self, renderId, eventListenerTargets, elementToggleCallback) {
    if (!self.views[self.currentView]) return;
    const elements = self.views[self.currentView].content;
    if (!elements) return;

    let delay = 0;
    let delayAmount = 0;

    // Fun setting for showing the graph generation
    if (self.renderDelay) {
        // ensures that it takes the same amount of time to render a few elements as it does to render many
        delayAmount = Math.max(-0.25 * Object.keys(elements).length + 32.5, 0);
    }

    Object.entries(elements).forEach(([id, item]) => {
        setTimeout(() => {
            // Handles the case where the view is updated while still rendering
            if (renderId !== self.currentRenderId) return;

            // Prevents one instance of user error
            if (item.previous && !elements[item.previous]) {
                console.warn(`Item "${id}" has a previous item "${item.previous}" that does not exist. Skipping rendering for this item.`);
                return;
            }

            // If the item is toggled off, skip rendering it
            if (elementToggleCallback && elementToggleCallback(item)) return;

            // Calculate the position of the item only on the first render
            if (!item.calculated) {
                if (item.references && typeof item.references !== 'string') item.references = JSON.stringify(item.references); // XXX

                // Set defaults if not specified
                item.width = (item.width ?? self.defaults.SHAPE.width);
                item.height = (item.height ?? self.defaults.SHAPE.height);
                item.xSpacing = (item.xSpacing ?? (item.count ? self.defaults.SHAPE.width / 4 : 0));
                item.ySpacing = (item.ySpacing ?? (item.count ? -self.defaults.SHAPE.height / 16 : 0));
                /*
                item.width = (item.width ?? 1) * self.defaults.SHAPE.width;
                item.height = (item.height ?? 1) * self.defaults.SHAPE.height;
                item.xSpacing = (item.xSpacing ?? (item.count ? 1 / 4 : 0)) * self.defaults.SHAPE.width;
                item.ySpacing = (item.ySpacing ?? (item.count ? -1 / 16 : 0)) * self.defaults.SHAPE.height;
                */

                const previousAbsolutePosition = item.previous ? elements[item.previous] : { x: 0, y: 0 };
                const currentAbsolutePosition = { x: previousAbsolutePosition.x, y: previousAbsolutePosition.y };

                // Calculate the the absolute position of the item based on the previous item
                // The ternaries handle when it's the first item (i.e. previousAbsolutePosition.width/height is undefined)
                // "item._ ??" allows the user to override the default value if they want, but it generally shouldn't be done
                switch (item.position) {
                    case 'above':
                        currentAbsolutePosition.x += (item.x ?? 0);
                        currentAbsolutePosition.y += (item.y ?? (-(item.separation ?? self.defaults.SHAPE.separation) + (previousAbsolutePosition.height ? - item.height : 0)));
                        break;
                    case 'below':
                        currentAbsolutePosition.x += (item.x ?? 0);
                        currentAbsolutePosition.y += (item.y ?? ((item.separation ?? self.defaults.SHAPE.separation) + (previousAbsolutePosition.height ?? 0)));
                        break;
                    case 'left':
                        currentAbsolutePosition.x += (item.x ?? (-(item.separation ?? self.defaults.SHAPE.separation) + (previousAbsolutePosition.width ? - item.width : 0)));
                        currentAbsolutePosition.y += (item.y ?? (previousAbsolutePosition.height ? previousAbsolutePosition.height / 2 - item.height / 2 : 0));
                        break;
                    default: // Default to right positioning
                        // Since this is the default, there is an additional check for item.previous, which ensures the first item doesn't get erroneously offset
                        // This is specifically important for components that can be used either in other components or as a view
                        currentAbsolutePosition.x += (item.x ?? ((item.previous ? (item.separation ?? self.defaults.SHAPE.separation) : 0) + (previousAbsolutePosition.width ?? 0)));
                        // For right positioning, calculate y using centers of previous and item.
                        currentAbsolutePosition.y += (item.y ?? (previousAbsolutePosition.height ? previousAbsolutePosition.height / 2 - item.height / 2 : 0));
                        break;
                }

                // Update the item position now that it's been calculated
                item.x = currentAbsolutePosition.x;
                item.y = currentAbsolutePosition.y;
                item.calculated = true;
            }

            // Draw the shape. All items normally have a shape, but it's not enforced, in case a user wants to be creative
            if (item.shape) self.drawSubcomponent(item);

            // Draw the arrow(s). Unlike text, this is iterated over here because the arrows may have a different previous item specified than item does.
            if (Array.isArray(item.arrow) && item.arrow.length > 0) {
                for (const arrow of item.arrow)
                    self.drawConnection(arrow, (arrow.previous ? elements[arrow.previous] : elements[item.previous]), item, elementToggleCallback);
            } else if (item.arrow) self.drawConnection(item.arrow, (item.arrow.previous ? elements[item.arrow.previous] : elements[item.previous]), item, elementToggleCallback);

            // Draw the text
            if (item.text) self.drawText(item, elementToggleCallback);

            // Attach event listeners after rendering
            Object.entries(eventListenerTargets).forEach(([target, eventListener]) => {
                self.canvasDOM.selectAll(`[data-${target}]`).each(function () {
                    eventListener(d3.select(this));
                });
            });
        }, delay);

        delay += delayAmount;
    });
}
