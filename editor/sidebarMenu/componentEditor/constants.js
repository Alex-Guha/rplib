// Shared constants for the component-editor UI.

export const EDITING_VIEW = '__component_editor__';
export const SEED_CONTENT = () => ({ box: { shape: 'box' } });

export const KNOWN_SHAPES = ['box', 'triangle', 'trapezoid'];

export const POSITION_OPTIONS = [
    '', 'above', 'below', 'left', 'right',
    'left-top', 'left-bottom', 'right-top', 'right-bottom',
    'above-left', 'above-right', 'below-left', 'below-right',
];

export const TEXT_POSITIONS = [
    '', 'top', 'bottom', 'left', 'right', 'center',
    'top-left', 'top-right', 'bottom-left', 'bottom-right',
    'left-top', 'left-bottom', 'right-top', 'right-bottom',
];

export const ARROW_DIRECTIONS = ['', 'up', 'down', 'left', 'right'];

// Which SHAPE default each shape-referencing numeric field hangs off of. Drives
// the percentage / fractional / multiplier shorthand parsing in parseShapeNumeric.
export const SHAPE_FIELD_BASIS = {
    width: 'width', x: 'width', xSpacing: 'width', xOffset: 'width',
    height: 'height', y: 'height', ySpacing: 'height', yOffset: 'height',
    separation: 'separation',
};
