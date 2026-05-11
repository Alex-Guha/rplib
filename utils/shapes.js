import d3 from 'd3';
import attachListeners from './attachListeners.js';

// Fairly self explanatory
export default function drawSubcomponent(self, item, layout, id) {
    for (let i = (item.count || 1) - 1; i >= 0; i--) {
        const x = layout.x + layout.xSpacing * i;
        const y = layout.y + layout.ySpacing * i;
        let shape = null;

        switch (item.shape) {
            case 'box':
                shape = drawBox(x, y, layout);
                break;
            case 'triangle':
                shape = drawTriangle(x, y, layout, item);
                break;
            case 'trapezoid':
                shape = drawTrapezoid(x, y, layout, item);
                break;
            default:
                console.warn(`Unknown shape: ${item.shape}`);
                return;
        }

        shape.attr('opacity', (1 - i * 0.1) * (item.opacity ?? self.theme.OPACITY))
            .attr('fill', self.theme.SHAPE_FILL)
            .attr('stroke', self.theme.SHAPE_STROKE)
            .attr(`id`, id);

        // Unlike text and arrows, shapes are the roots of local property hierarchies
        attachListeners(shape, item, null, self.eventListenerTargets);

        self.canvasDOM.append(() => shape.node());
    }
}

function drawBox(x, y, layout) {
    return d3.create('svg:rect')
        .attr('x', x)
        .attr('y', y)
        .attr('width', layout.width)
        .attr('height', layout.height);
}

function drawTriangle(x, y, layout, item) {
    const w = layout.width;
    const h = layout.height;
    const points = item.flipped
        ? [
            [x + w, y],
            [x + w, y + h],
            [x, y + h],
        ]
        : [
            [x, y],
            [x, y + h],
            [x + w, y + h],
        ];

    return d3.create('svg:polygon')
        .attr('points', points.map(p => p.join(',')).join(' '));
}

// layout.height has to always be the longer side, otherwise item.flipped could be removed
function drawTrapezoid(x, y, layout, item) {
    const w = layout.width;
    const h = layout.height;
    const shortSide = item.shortSide ?? h / 2;
    const longSide = h;
    const offset = longSide / 2 - shortSide / 2;

    const points = item.flipped
        ? [
            [x, y],
            [x, y + h],
            [x + w, y + offset + shortSide],
            [x + w, y + offset],
        ]
        : [
            [x, y + offset],
            [x, y + offset + shortSide],
            [x + w, y + h],
            [x + w, y],
        ];

    return d3.create('svg:polygon')
        .attr('points', points.map(p => p.join(',')).join(' '));
}
