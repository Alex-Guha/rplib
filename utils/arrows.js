import d3 from 'd3';

/**
 * Draws an arrow between previousItem and item.
 * If the arrow has segments, it draws each segment in the order they are defined, inferring positions and lengths based on the directions provided for each segment.
*/
export default function drawConnection(self, arrow, previousItem, item, callback) {
    if (!previousItem) return;

    // Allows arrows to be togglable
    if (callback && callback(arrow)) return;

    // Makes these properties hierarchical. arrow > item > nonexistent
    ['info', 'details', 'references'].forEach(key => { // XXX
        if (arrow[key] || item[key]) {
            arrow[key] = key === 'references'
                ? JSON.stringify(arrow[key] ?? item[key])
                : arrow[key] ?? item[key];
        }
    });

    // Create a group for the arrow
    const arrowGroup = self.canvasDOM.append('g')
        .attr('stroke', self.theme.ARROW_COLOR)
        .attr('fill', self.theme.ARROW_COLOR)
        .attr('data-info', arrow.info)
        .attr('data-details', arrow.details)
        .attr('data-references', arrow.references); // XXX

    // Handle segmented arrows
    if (arrow.segments) {
        arrow.segments.forEach(segment => {
            segment.direction = segment.direction ?? inferArrowDirection(item.position);
        });

        const absoluteStartPosition = calculateAbsoluteStartPosition(arrow.segments.at(0), previousItem);
        const absoluteEndPosition = calculateAbsoluteEndPosition(arrow.segments.at(-1), item);
        const avgLengths = calculateAverageSegmentLength(arrow.segments, absoluteStartPosition, absoluteEndPosition);

        arrow.segments.forEach((segment, index) => {

            if (index === 0) { // Start segment
                // Multi segment arrows only have an arrowhead on the end segment, though this can be overridden
                segment.noHead = (segment.noHead ?? true);

                // If the segment doesn't have a manual extraLength, give it the average length
                segment.extraLength = segment.extraLength ?? avgLengths[segment.direction ?? 'right'];

                // Since extraLength is used for the length of the segment, we pass the start position of the segment as the end to cancel out length calculations
                drawSegment(self, segment, arrowGroup, absoluteStartPosition, absoluteStartPosition, callback);

            } else if (index < (arrow.segments.length - 1)) { // Middle segments
                segment.noHead = (segment.noHead ?? true);

                // Calculate the absolute start position of the segment based on the start position and length of the previous segment (since we aren't directly storing the end positions)
                const segmentAbsoluteStartPosition = {
                    x: arrow.segments[index - 1].x + arrow.segments[index - 1].width,
                    y: arrow.segments[index - 1].y + arrow.segments[index - 1].height
                };

                segment.extraLength = segment.extraLength ?? avgLengths[segment.direction ?? 'right'];
                drawSegment(self, segment, arrowGroup, segmentAbsoluteStartPosition, segmentAbsoluteStartPosition, callback);

            } else { // End segment
                const segmentAbsoluteStartPosition = {
                    x: arrow.segments[index - 1].x + arrow.segments[index - 1].width,
                    y: arrow.segments[index - 1].y + arrow.segments[index - 1].height
                };

                // An override for end position calculation in drawSegment.
                // We don't need to use extraLength for the last segment, since it locks onto the target by using absoluteEndPosition.
                segment.end = true;
                drawSegment(self, segment, arrowGroup, segmentAbsoluteStartPosition, absoluteEndPosition, callback);
            }
        });

    } else {
        // Handle single arrows
        arrow.direction = arrow.direction ?? inferArrowDirection(item.position);
        const absoluteStartPosition = calculateAbsoluteStartPosition(arrow, previousItem);
        const absoluteEndPosition = calculateAbsoluteEndPosition(arrow, item);

        drawSegment(self, arrow, arrowGroup, absoluteStartPosition, absoluteEndPosition, callback);
    }
}

// This may look like it has a lot of repeated switch statements, but without them it becomes impossible to manage

// Draws the arrow segment
function drawSegment(self, segment, arrowGroup, absoluteStartPosition, absoluteEndPosition, callback) {
    segment.x = absoluteStartPosition.x;
    segment.y = absoluteStartPosition.y;

    // Calculates the length of the arrow (which is stored in height and width because drawText uses these variables).
    switch (segment.direction) {
        case 'up':
            segment.width = 0;
            segment.height = Math.min(absoluteEndPosition.y - absoluteStartPosition.y, 0) - (segment.end ? 0 : (segment.extraLength ?? 0));
            break;

        case 'down':
            segment.width = 0;
            segment.height = Math.max(absoluteEndPosition.y - absoluteStartPosition.y, 0) + (segment.end ? 0 : (segment.extraLength ?? 0));
            break;

        case 'left':
            segment.width = Math.min(absoluteEndPosition.x - absoluteStartPosition.x, 0) - (segment.end ? 0 : (segment.extraLength ?? 0));
            segment.height = 0;
            break;

        default: // right
            segment.width = Math.max(absoluteEndPosition.x - absoluteStartPosition.x, 0) + (segment.end ? 0 : (segment.extraLength ?? 0));
            segment.height = 0;
            break;
    }

    // Draw the line
    arrowGroup.append('line')
        .attr('x1', segment.x)
        .attr('y1', segment.y)
        .attr('x2', segment.x + segment.width)
        .attr('y2', segment.y + segment.height)
        .attr('stroke-width', self.defaults.ARROW.width);

    // Draw the arrowhead
    if (!(segment.noHead ?? false)) {
        const endxy = segment.reversed ? { x: segment.x, y: segment.y } : { x: segment.width + segment.x, y: segment.height + segment.y };
        const angle = segment.reversed ? Math.atan2(-segment.height, -segment.width) : Math.atan2(segment.height, segment.width);
        arrowGroup.append(() => createArrowhead(endxy, angle, self.defaults.ARROW.headSize, self.theme.ARROW_COLOR));
    }

    // Draw text if it exists
    if (segment.text) self.drawText(segment, callback);
}

// Infers the average vertical and horizontal length for segments that do not have a length specified, based on the arrow start and end positions
function calculateAverageSegmentLength(segments, absoluteStartPosition, absoluteEndPosition) {
    // Manhattan distance
    const distance = {
        x: absoluteEndPosition.x - absoluteStartPosition.x,
        y: absoluteEndPosition.y - absoluteStartPosition.y
    };

    // Keep a tally of how many segments do not have an extraLength for each dimension, for averaging
    const countDoesNotHaveExtraLength = { x: 0, y: 0 };

    // Iterate through the segments and add or subtract (based on the segment direction) the extraLength to the distance, if it exists
    // Otherwise, increment the count for that dimension
    segments.forEach(segment => {
        switch (segment.direction) {
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

// Calculates the absolute position of the segment based on the previous item and the direction
function calculateAbsoluteStartPosition(segment, previousItem) {
    // Calculate offsets for when there are multiple items
    const startOffset = {
        x: (previousItem.xSpacing ?? 0) * ((previousItem.count ?? 1) - 1),
        y: (previousItem.ySpacing ?? 0) * ((previousItem.count ?? 1) - 1),
    };
    const absoluteStartPosition = { x: 0, y: 0 };

    switch (segment.direction) {
        case 'up':
            absoluteStartPosition.x = previousItem.x
                + previousItem.width / 2 // Horizontally center arrow start
                + (segment.xOffset ?? 0);

            absoluteStartPosition.y = previousItem.y
                // Implicitly cancelled centering:
                // + previousItem.height / 2
                // - previousItem.height / 2
                + Math.min(startOffset.y, 0) // Adjust for multiple items (if they stack up)
                + (segment.yOffset ?? 0);

            return absoluteStartPosition;

        case 'down':
            absoluteStartPosition.x = previousItem.x
                + previousItem.width / 2 // Horizontally center arrow start
                + (segment.xOffset ?? 0);

            absoluteStartPosition.y = previousItem.y
                + previousItem.height // Implicit addition to center previousItem.height / 2 + previousItem.height / 2
                + Math.max(startOffset.y, 0) // Adjust for multiple items (if they stack down)
                + (segment.yOffset ?? 0);

            return absoluteStartPosition;

        case 'left':
            absoluteStartPosition.x = previousItem.x
                // Implicitly cancelled centering:
                // + previousItem.width / 2
                // - previousItem.width / 2
                + Math.min(startOffset.x, 0) // Adjust for multiple items (if they stack left)
                + (segment.xOffset ?? 0);

            absoluteStartPosition.y = previousItem.y
                + previousItem.height / 2 // Vertically center arrow start
                + (segment.yOffset ?? 0);

            return absoluteStartPosition;

        default: // right
            absoluteStartPosition.x = previousItem.x
                + previousItem.width // Implicit addition to center previousItem.width / 2 + previousItem.width / 2
                + Math.max(startOffset.x, 0) // Adjust for multiple items (if they stack right)
                + (segment.xOffset ?? 0);

            absoluteStartPosition.y = previousItem.y
                + previousItem.height / 2 // Vertically center arrow start
                + (segment.yOffset ?? 0);

            return absoluteStartPosition;

    }
}

// Calculates the absolute end position of the segment based on the target item and the direction
function calculateAbsoluteEndPosition(segment, targetItem) {
    const targetOffset = {
        x: (targetItem.xSpacing ?? 0) * ((targetItem.count ?? 1) - 1),
        y: (targetItem.ySpacing ?? 0) * ((targetItem.count ?? 1) - 1),
    };
    const absoluteEndPosition = { x: 0, y: 0 };

    switch (segment.direction) {
        case 'up':
            absoluteEndPosition.x = targetItem.x
                + targetItem.width / 2
                + (segment.xOffset ?? 0);

            absoluteEndPosition.y = targetItem.y
                + targetItem.height // Move arrow end to target's bottom side
                + Math.max(targetOffset.y, 0) // Adjust for multiple items (if they stack down)
                + (segment.yOffset ?? 0);
            return absoluteEndPosition;

        case 'down':
            absoluteEndPosition.x = targetItem.x
                + targetItem.width / 2
                + (segment.xOffset ?? 0);

            absoluteEndPosition.y = targetItem.y
                + Math.min(targetOffset.y, 0) // Adjust for multiple items (if they stack up)
                + (segment.yOffset ?? 0);
            return absoluteEndPosition;

        case 'left':
            absoluteEndPosition.x = targetItem.x
                + targetItem.width // Move arrow end to target's right side
                + Math.max(targetOffset.x, 0) // Adjust for multiple items (if they stack right)
                + (segment.xOffset ?? 0);

            absoluteEndPosition.y = targetItem.y
                + targetItem.height / 2
                + (segment.yOffset ?? 0);
            return absoluteEndPosition;

        default: // right
            absoluteEndPosition.x = targetItem.x
                + Math.min(targetOffset.x, 0) // Adjust for multiple items (if they stack left)
                + (segment.xOffset ?? 0);

            absoluteEndPosition.y = targetItem.y
                + targetItem.height / 2
                + (segment.yOffset ?? 0);
            return absoluteEndPosition;
    }
}

// Creates an arrowhead at the end of the arrow
function createArrowhead(end, angle, headSize, arrowColor) {
    const arrowPath = d3.path();
    arrowPath.moveTo(end.x, end.y);
    arrowPath.lineTo(end.x - headSize * Math.cos(angle - Math.PI / 6), end.y - headSize * Math.sin(angle - Math.PI / 6));
    arrowPath.lineTo(end.x - headSize * Math.cos(angle + Math.PI / 6), end.y - headSize * Math.sin(angle + Math.PI / 6));
    arrowPath.closePath();

    return d3.create('svg:path')
        .attr('d', arrowPath.toString())
        .attr('fill', arrowColor)
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