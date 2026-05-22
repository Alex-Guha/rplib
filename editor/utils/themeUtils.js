export function invertTheme(theme, root) {
    Object.keys(theme).forEach(key => {
        if (typeof theme[key] === 'string' && theme[key].startsWith('#')) {
            theme[key] = invertColor(theme[key]);
        } else if (Array.isArray(theme[key])) {
            theme[key] = theme[key].map(color => invertColor(color));
        }
    });
    applyTheme(theme, root);
}

function invertColor(hex) {
    // Normalize shorthand hex (e.g., #555) to full hex (e.g., #555555)
    const normalizedHex = hex.length === 4
        ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
        : hex;

    const color = parseInt(normalizedHex.slice(1), 16);
    const invertedColor = 0xFFFFFF ^ color;
    return `#${invertedColor.toString(16).padStart(6, '0')}`;
}

export function applyTheme(newTheme, root) {
    root.style.setProperty('--background-color', newTheme.BACKGROUND);
    root.style.setProperty('--text-default-color', newTheme.TEXT_DEFAULT);
    root.style.setProperty('--svg-background-color', newTheme.SVG_BACKGROUND);
    root.style.setProperty('--info-background-color', newTheme.INFO_BACKGROUND);
    root.style.setProperty('--reference-background-color', newTheme.REFERENCE_BACKGROUND);

    root.style.setProperty('--shape-fill-color', newTheme.SHAPE_FILL);
    root.style.setProperty('--shape-stroke-color', newTheme.SHAPE_STROKE);
    root.style.setProperty('--shape-hover-fill-color', newTheme.SHAPE_HOVER_FILL);
    root.style.setProperty('--opacity', newTheme.OPACITY);

    root.style.setProperty('--arrow-color', newTheme.ARROW_COLOR);

    root.style.setProperty('--link-color', newTheme.LINK);

    root.style.setProperty('--button-fill-color', newTheme.BUTTON_FILL);
    root.style.setProperty('--button-border-color', newTheme.BUTTON_BORDER);
    root.style.setProperty('--button-symbol-color', newTheme.BUTTON_SYMBOL_COLOR);
    root.style.setProperty('--button-hover-fill-color', newTheme.BUTTON_HOVER_FILL);
    root.style.setProperty('--button-hover-symbol-color', newTheme.BUTTON_HOVER_SYMBOL_COLOR);
    root.style.setProperty('--disabled-button-fill-color', newTheme.DISABLED_BUTTON_FILL);
    root.style.setProperty('--disabled-button-border-color', newTheme.DISABLED_BUTTON_BORDER);
    root.style.setProperty('--disabled-button-symbol-color', newTheme.DISABLED_BUTTON_SYMBOL_COLOR);

    root.style.setProperty('--slider-background-color', newTheme.SLIDER_BACKGROUND);
    root.style.setProperty('--slider-button-color', newTheme.SLIDER_BUTTON);
    root.style.setProperty('--slider-checked-color', newTheme.SLIDER_CHECKED);

    root.style.setProperty('--scrollbar-background-color', newTheme.SCROLLBAR_BACKGROUND);
    root.style.setProperty('--scrollbar-button-color', newTheme.SCROLLBAR_BUTTON);
    root.style.setProperty('--scrollbar-hover-color', newTheme.SCROLLBAR_HOVER);
}