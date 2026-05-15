import d3 from 'd3';
import attachListeners from './attachListeners.js';

/**
 * Draws an arrow between previousItem and item.
 * If the arrow has segments, it draws each segment in the order they are defined,
 * inferring positions and lengths based on the directions provided for each segment.
 * The parsed arrow/segment objects are never mutated; computed values flow through
 * a local segment-layout array.
*/
export default function drawConnection(self, arrow, previousItem, prevLayout, item, itemLayout, callback, id) {
    if (!previousItem || !prevLayout) return;

    // Allows arrows to be togglable
    if (callback && callback(arrow)) return;

    // Create a group for the arrow. Color flows from a CSS variable so theme
    // toggles don't require a redraw; children inherit via SVG presentation.
    const arrowGroup = self.canvasDOM.append('g')
        .style('stroke', 'var(--rplib-arrow-color)')
        .style('fill', 'var(--rplib-arrow-color)')
        .attr(`id`, id);

    // Handle segmented arrows
    if (arrow.segments) {
        const directions = arrow.segments.map(s => s.direction ?? inferArrowDirection(item.position));

        const startEdge = arrow.segments[0];
        const endEdge = arrow.segments.at(-1);
        const absoluteStartPosition = calculateAbsoluteStartPosition(
            { direction: directions[0], xOffset: startEdge.xOffset, yOffset: startEdge.yOffset },
            previousItem, prevLayout
        );
        const absoluteEndPosition = calculateAbsoluteEndPosition(
            { direction: directions.at(-1), xOffset: endEdge.xOffset, yOffset: endEdge.yOffset },
            item, itemLayout
        );
        const avgLengths = calculateAverageSegmentLength(arrow.segments, directions, absoluteStartPosition, absoluteEndPosition);

        const segLayouts = new Array(arrow.segments.length);

        arrow.segments.forEach((segment, index) => {
            const segId = `${id}.segment_${index}`;
            const direction = directions[index];
            const isFirst = index === 0;
            const isLast = index === arrow.segments.length - 1;
            const noHead = isLast ? (segment.noHead ?? false) : (segment.noHead ?? true);
            const extraLength = isLast ? 0 : (segment.extraLength ?? avgLengths[direction]);

            let startPos;
            let endPosForCalc;
            if (isFirst) {
                startPos = absoluteStartPosition;
                // Start segment uses extraLength for its length; pass startPos as end to cancel diff math.
                endPosForCalc = absoluteStartPosition;
            } else {
                const prevSeg = segLayouts[index - 1];
                startPos = { x: prevSeg.x + prevSeg.width, y: prevSeg.y + prevSeg.height };
                endPosForCalc = isLast ? absoluteEndPosition : startPos;
            }

            const segLayout = computeSegmentLayout(direction, startPos, endPosForCalc, extraLength, isLast);
            segLayouts[index] = segLayout;
            drawSegment(self, segment, segLayout, noHead, arrowGroup, segId, callback);
        });

    } else {
        // Handle single arrows
        const direction = arrow.direction ?? inferArrowDirection(item.position);
        const startSpec = { direction, xOffset: arrow.xOffset, yOffset: arrow.yOffset };
        const absoluteStartPosition = calculateAbsoluteStartPosition(startSpec, previousItem, prevLayout);
        const absoluteEndPosition = calculateAbsoluteEndPosition(startSpec, item, itemLayout);
        const layout = computeSegmentLayout(direction, absoluteStartPosition, absoluteEndPosition, 0, true);

        drawSegment(self, arrow, layout, arrow.noHead ?? false, arrowGroup, id, callback);
    }

    // Property inheritance is handled at read time by findHierarchicalElementProperty;
    // this call only attaches DOM listeners, no longer mutates the arrow object.
    attachListeners(arrowGroup, arrow, item, self.eventListenerTargets);
}

// Computes a fresh segment-layout entry. Pure — doesn't mutate the segment.
function computeSegmentLayout(direction, startPos, endPos, extraLength, isEnd) {
    let width = 0;
    let height = 0;
    const extra = isEnd ? 0 : (extraLength ?? 0);
    switch (direction) {
        case 'up':
            height = Math.min(endPos.y - startPos.y, 0) - extra;
            break;
        case 'down':
            height = Math.max(endPos.y - startPos.y, 0) + extra;
            break;
        case 'left':
            width = Math.min(endPos.x - startPos.x, 0) - extra;
            break;
        default: // right
            width = Math.max(endPos.x - startPos.x, 0) + extra;
            break;
    }
    return { x: startPos.x, y: startPos.y, width, height };
}

// Draws the arrow segment using its precomputed layout.
function drawSegment(self, segment, layout, noHead, arrowGroup, segId, callback) {
    arrowGroup.append('line')
        .attr('x1', layout.x)
        .attr('y1', layout.y)
        .attr('x2', layout.x + layout.width)
        .attr('y2', layout.y + layout.height)
        .attr('stroke-width', self.defaults.ARROW.width);

    // Draw the arrowhead
    if (!noHead) {
        const endxy = segment.reversed
            ? { x: layout.x, y: layout.y }
            : { x: layout.x + layout.width, y: layout.y + layout.height };
        const angle = segment.reversed
            ? Math.atan2(-layout.height, -layout.width)
            : Math.atan2(layout.height, layout.width);
        arrowGroup.append(() => createArrowhead(endxy, angle, self.defaults.ARROW.headSize));
    }

    // Draw text if it exists. The segment's layout doubles as the "itemLayout" for its text.
    if (Array.isArray(segment.text) && segment.text.length > 0) {
        segment.text.forEach((text, i) => {
            self.drawText(text, segment, layout, callback, `${segId}.text_${i}`);
        });
    } else if (segment.text) {
        self.drawText(segment.text, segment, layout, callback, `${segId}.text`);
    }
}

// Infers the average vertical and horizontal length for segments that do not have a length specified, based on the arrow start and end positions
function calculateAverageSegmentLength(segments, directions, absoluteStartPosition, absoluteEndPosition) {
    // Manhattan distance
    const distance = {
        x: absoluteEndPosition.x - absoluteStartPosition.x,
        y: absoluteEndPosition.y - absoluteStartPosition.y
    };

    // Keep a tally of how many segments do not have an extraLength for each dimension, for averaging
    const countDoesNotHaveExtraLength = { x: 0, y: 0 };

    // Iterate through the segments and add or subtract (based on the segment direction) the extraLength to the distance, if it exists
    // Otherwise, increment the count for that dimension
    segments.forEach((segment, i) => {
        switch (directions[i]) {
            case 'up':
                segment.extraLength ? distance.y += segment.extraLength : countDoesNotHaveExtraLength.y++;
                break;

            case 'down':
                segment.extraLength ? distance.y -= segment.extraLength : countDoesNotHaveExtraLength.y++;
                break;

            case 'left':
                segment.extraLength ? distance.x += segment.extraLength : countDoesNotHaveExtraLength.x++;
                break;

            default: // right
                segment.extraLength ? distance.x -= segment.extraLength : countDoesNotHaveExtraLength.x++;
                break;
        }
    });

    // Return the averages
    return {
        right: Math.abs(distance.x / countDoesNotHaveExtraLength.x),
        left: Math.abs(distance.x / countDoesNotHaveExtraLength.x),
        up: Math.abs(distance.y / countDoesNotHaveExtraLength.y),
        down: Math.abs(distance.y / countDoesNotHaveExtraLength.y),
    };
}

// Calculates the absolute position of the segment based on the previous item and the direction.
// Reads positional/dimension fields from prevLayout; reads `count` (authored) from previousItem.
function calculateAbsoluteStartPosition(segment, previousItem, prevLayout) {
    const startOffset = {
        x: (prevLayout.xSpacing ?? 0) * ((previousItem.count ?? 1) - 1),
        y: (prevLayout.ySpacing ?? 0) * ((previousItem.count ?? 1) - 1),
    };
    const absoluteStartPosition = { x: 0, y: 0 };

    switch (segment.direction) {
        case 'up':
            absoluteStartPosition.x = prevLayout.x
                + prevLayout.width / 2 // Horizontally center arrow start
                + (segment.xOffset ?? 0);

            absoluteStartPosition.y = prevLayout.y
                // Implicitly cancelled centering:
                // + prevLayout.height / 2
                // - prevLayout.height / 2
                + Math.min(startOffset.y, 0) // Adjust for multiple items (if they stack up)
                + (segment.yOffset ?? 0);

            return absoluteStartPosition;

        case 'down':
            absoluteStartPosition.x = prevLayout.x
                + prevLayout.width / 2 // Horizontally center arrow start
                + (segment.xOffset ?? 0);

            absoluteStartPosition.y = prevLayout.y
                + prevLayout.height // Implicit addition to center prevLayout.height / 2 + prevLayout.height / 2
                + Math.max(startOffset.y, 0) // Adjust for multiple items (if they stack down)
                + (segment.yOffset ?? 0);

            return absoluteStartPosition;

        case 'left':
            absoluteStartPosition.x = prevLayout.x
                // Implicitly cancelled centering:
                // + prevLayout.width / 2
                // - prevLayout.width / 2
                + Math.min(startOffset.x, 0) // Adjust for multiple items (if they stack left)
                + (segment.xOffset ?? 0);

            absoluteStartPosition.y = prevLayout.y
                + prevLayout.height / 2 // Vertically center arrow start
                + (segment.yOffset ?? 0);

            return absoluteStartPosition;

        default: // right
            absoluteStartPosition.x = prevLayout.x
                + prevLayout.width // Implicit addition to center prevLayout.width / 2 + prevLayout.width / 2
                + Math.max(startOffset.x, 0) // Adjust for multiple items (if they stack right)
                + (segment.xOffset ?? 0);

            absoluteStartPosition.y = prevLayout.y
                + prevLayout.height / 2 // Vertically center arrow start
                + (segment.yOffset ?? 0);

            return absoluteStartPosition;

    }
}

// Calculates the absolute end position of the segment based on the target item and the direction
function calculateAbsoluteEndPosition(segment, targetItem, targetLayout) {
    const targetOffset = {
        x: (targetLayout.xSpacing ?? 0) * ((targetItem.count ?? 1) - 1),
        y: (targetLayout.ySpacing ?? 0) * ((targetItem.count ?? 1) - 1),
    };
    const absoluteEndPosition = { x: 0, y: 0 };

    switch (segment.direction) {
        case 'up':
            absoluteEndPosition.x = targetLayout.x
                + targetLayout.width / 2
                + (segment.xOffset ?? 0);

            absoluteEndPosition.y = targetLayout.y
                + targetLayout.height // Move arrow end to target's bottom side
                + Math.max(targetOffset.y, 0) // Adjust for multiple items (if they stack down)
                + (segment.yOffset ?? 0);
            return absoluteEndPosition;

        case 'down':
            absoluteEndPosition.x = targetLayout.x
                + targetLayout.width / 2
                + (segment.xOffset ?? 0);

            absoluteEndPosition.y = targetLayout.y
                + Math.min(targetOffset.y, 0) // Adjust for multiple items (if they stack up)
                + (segment.yOffset ?? 0);
            return absoluteEndPosition;

        case 'left':
            absoluteEndPosition.x = targetLayout.x
                + targetLayout.width // Move arrow end to target's right side
                + Math.max(targetOffset.x, 0) // Adjust for multiple items (if they stack right)
                + (segment.xOffset ?? 0);

            absoluteEndPosition.y = targetLayout.y
                + targetLayout.height / 2
                + (segment.yOffset ?? 0);
            return absoluteEndPosition;

        default: // right
            absoluteEndPosition.x = targetLayout.x
                + Math.min(targetOffset.x, 0) // Adjust for multiple items (if they stack left)
                + (segment.xOffset ?? 0);

            absoluteEndPosition.y = targetLayout.y
                + targetLayout.height / 2
                + (segment.yOffset ?? 0);
            return absoluteEndPosition;
    }
}

// Creates an arrowhead at the end of the arrow. Fill is inherited from the parent
// arrow group, which sources its color from a CSS variable.
function createArrowhead(end, angle, headSize) {
    const arrowPath = d3.path();
    arrowPath.moveTo(end.x, end.y);
    arrowPath.lineTo(end.x - headSize * Math.cos(angle - Math.PI / 6), end.y - headSize * Math.sin(angle - Math.PI / 6));
    arrowPath.lineTo(end.x - headSize * Math.cos(angle + Math.PI / 6), end.y - headSize * Math.sin(angle + Math.PI / 6));
    arrowPath.closePath();

    return d3.create('svg:path')
        .attr('d', arrowPath.toString())
        .node();
}

// Allows arrow direction to be optional, and infers it based on how the end item is positioned relative to its previous.
function inferArrowDirection(position) {
    switch (position) {
        case 'above':
            return 'up';

        case 'below':
            return 'down';

        case 'left':
            return 'left';

        default: // Default to right positioning
            return 'right';
    }
}
