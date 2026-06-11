// Drag-feedback grid. A full-viewport rect filled with a line pattern, faded
// in while a drag gesture is live and back out on drop (CSS transition on the
// `visible` class — see styles.css).
//
// The layer lives OUTSIDE `#content`, as a sibling inserted before it: the
// drop commits through updateComponent, whose full re-render clears #content,
// which would yank the grid mid-fade-out. Since it doesn't inherit #content's
// zoom transform, the pattern carries the transform itself (re-applied every
// preview frame, so mid-drag wheel zooms stay in sync) with stroke width
// divided back out so the lines stay one screen pixel.
//
// Snapping rounds the dragged item's *offset from its predecessor* to grid
// multiples (see snapDelta in drag.js), so the lines an item can land on pass
// through the predecessor's absolute position — the pattern is phase-shifted
// by `origin` (the predecessor's position, modulo one cell) to draw exactly
// those lines.

import { GRID_SIZE } from './constants.js';

const LAYER_CLASS = 'component-editor-grid';
const PATTERN_ID = 'component-editor-grid-pattern';

const layer = (canvas) => canvas.svgDOM.select(`g.${LAYER_CLASS}`);

export function showDragGrid(canvas, origin) {
    let g = layer(canvas);
    if (g.empty()) {
        g = canvas.svgDOM.insert('g', '#content').attr('class', LAYER_CLASS);
        g.append('defs')
            .append('pattern')
            .attr('id', PATTERN_ID)
            .attr('patternUnits', 'userSpaceOnUse')
            .attr('width', GRID_SIZE)
            .attr('height', GRID_SIZE)
            .append('path')
            .attr('d', `M ${GRID_SIZE} 0 H 0 V ${GRID_SIZE}`)
            .attr('fill', 'none');
        g.append('rect')
            .attr('width', '100%')
            .attr('height', '100%')
            .attr('fill', `url(#${PATTERN_ID})`);
    }
    updateDragGrid(canvas, origin);
    // Flush styles so the opacity transition runs even when the layer was
    // inserted in this same frame.
    g.node().getBoundingClientRect();
    g.classed('visible', true);
}

export function updateDragGrid(canvas, origin) {
    const g = layer(canvas);
    if (g.empty()) return;
    const t = d3.zoomTransform(canvas.svgDOM.node());
    g.select('pattern').attr(
        'patternTransform',
        `translate(${t.x + t.k * (origin.x % GRID_SIZE)}, ${t.y + t.k * (origin.y % GRID_SIZE)}) scale(${t.k})`,
    );
    g.select('path').attr('stroke-width', 1 / t.k);
}

export function hideDragGrid(canvas) {
    layer(canvas).classed('visible', false);
}

// Exit-mode teardown — drop the layer entirely (fade state and all).
export function removeDragGrid() {
    d3.selectAll(`g.${LAYER_CLASS}`).remove();
}
