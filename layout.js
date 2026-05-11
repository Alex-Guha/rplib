// Pure layout computation. Returns a fresh layout entry for an item without
// mutating the parsed item or the previous layout. The renderer caches the
// returned entries in `canvas.layouts[viewName][id]` so that re-renders (e.g.
// theme switches) can skip recomputation.
export function computeItemLayout(item, prevLayout, defaults) {
    const width = item.width ?? defaults.SHAPE.width;
    const height = item.height ?? defaults.SHAPE.height;
    const xSpacing = item.xSpacing ?? (item.count ? defaults.SHAPE.width / 4 : 0);
    const ySpacing = item.ySpacing ?? (item.count ? -defaults.SHAPE.height / 16 : 0);

    const px = prevLayout ? prevLayout.x : 0;
    const py = prevLayout ? prevLayout.y : 0;
    const pw = prevLayout ? prevLayout.width : undefined;
    const ph = prevLayout ? prevLayout.height : undefined;
    const sep = item.separation ?? defaults.SHAPE.separation;

    let x = px;
    let y = py;
    switch (item.position) {
        case 'above':
            x += (item.x ?? 0);
            y += (item.y ?? (-sep + (ph ? -height : 0)));
            break;
        case 'below':
            x += (item.x ?? 0);
            y += (item.y ?? (sep + (ph ?? 0)));
            break;
        case 'left':
            x += (item.x ?? (-sep + (pw ? -width : 0)));
            y += (item.y ?? (ph ? ph / 2 - height / 2 : 0));
            break;
        default: // right
            x += (item.x ?? ((item.previous ? sep : 0) + (pw ?? 0)));
            y += (item.y ?? (ph ? ph / 2 - height / 2 : 0));
            break;
    }
    return { x, y, width, height, xSpacing, ySpacing };
}
