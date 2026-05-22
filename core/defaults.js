// Inherent library defaults. Apps may shallow-override any of these by passing
// a matching key in the `defaults` arg to RPCanvas; unspecified fields fall back here.
//
// Theme keys consumed by the lib: OPACITY, SHAPE_FILL, SHAPE_STROKE, ARROW_COLOR, TEXT_COLOR.
// Apps typically swap themes at runtime via canvas.setTheme(), so this default exists
// only so the lib renders something readable before any setTheme call.

export const LIB_DEFAULTS = {
    SHAPE: { width: 100, height: 200, separation: 150 },
    ARROW: { headSize: 10, width: 2 },
};

export const LIB_DEFAULT_THEME = {
    OPACITY: 0.5,
    SHAPE_FILL: '#ffffff',
    SHAPE_STROKE: '#000000',
    ARROW_COLOR: '#888888',
    TEXT_COLOR: ['#000000', '#444444', '#777777', '#aaaaaa'],
};

// Merges an app-provided override bag on top of LIB_DEFAULTS. Per-section shallow
// merge: SHAPE/ARROW fields combine with the defaults, unknown top-level keys
// pass through untouched.
export function mergeDefaults(overrides) {
    const merged = {};
    for (const key of Object.keys(LIB_DEFAULTS)) {
        merged[key] = { ...LIB_DEFAULTS[key], ...(overrides?.[key] ?? {}) };
    }
    if (overrides) {
        for (const key of Object.keys(overrides)) {
            if (!(key in merged)) merged[key] = overrides[key];
        }
    }
    return merged;
}
