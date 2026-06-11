// Drag-and-drop editing for component-edit mode. Dragging a shape moves it —
// and, because layout offsets are relative to `previous`, every element
// chained to it follows automatically. Holding shift moves only the dragged
// element: its direct children are counter-offset by the inverse delta so
// they stay visually fixed (grandchildren follow the compensated children for
// free).
//
// During the gesture, position updates go through the non-recording
// `canvas.previewItems` path (cheap partial renders on the resolved view, no
// history spam); the drop commits exactly once through `patchItems` /
// `insertItemBefore` → `updateComponent`, so persistence, autosave, and undo
// all see a single atomic edit. The re-resolve on commit overwrites whatever
// transient state the preview left behind.
//
// Imported component references have no def-level offset of their own (the
// parser's flattening ignores the importer item's x/y), so dragging one is
// expressed through an **anchor point**: a zero-size box inserted immediately
// before the ref. The imported group's head stitches to the point, so moving
// the point moves the whole group. The point is created lazily — the drop
// that first drags a group inserts it (positioned so nothing jumps); later
// drags recognize the 0×0 item in front of the ref and just move it.
//
// While a drag is live, a subtle grid fades in behind the canvas (and back out
// on drop) and the dragged item snaps to it: the *offset from its predecessor*
// is rounded to GRID_SIZE multiples, so committed x/y values come out as clean
// grid increments. Holding alt suspends snapping (draw.io-style free drag).
// The grid is phase-shifted to the predecessor's position so its lines mark
// exactly where the item can land — see grid.js.

import { componentEditState } from '../../utils/state.js';
import { EDITING_VIEW, GRID_SIZE } from './constants.js';
import { setComponentEditTarget, uniqueContentKey } from './helpers.js';
import { renderInfoPanel } from './render.js';
import { highlightTarget } from './target.js';
import { patchItems, insertItemBefore } from './mutations.js';
import { showDragGrid, updateDragGrid, hideDragGrid, removeDragGrid } from './grid.js';
import { computeItemLayout } from '@alexguha/rplib/layout';

// Pointer must travel this many *screen* pixels before a mousedown becomes a
// drag; below it the gesture stays a click so click-to-select keeps working.
const DRAG_THRESHOLD_PX = 4;

// Stand-in predecessor layout for measuring an item's offset *from* a
// zero-size anchor point (offsets are translation-invariant, so measuring
// from the origin gives the pure offset).
const POINT_LAYOUT = { x: 0, y: 0, width: 0, height: 0 };

// --- pure helpers (exported for tests) ---------------------------------------

// A screen-pixel delta divided by the current zoom scale is a canvas-space
// offset (#content carries the zoom transform).
export function screenDeltaToCanvas(dxScreen, dyScreen, k) {
    const scale = k || 1;
    return { dx: dxScreen / scale, dy: dyScreen / scale };
}

// Adjust a drag delta so the dragged item's offset from its predecessor
// (base + delta) lands on the nearest grid multiple. Snapping the *offset*
// rather than the absolute position is what makes the committed x/y values
// clean grid increments; the drawn grid is phase-shifted by the predecessor's
// position (session.origin) so the two agree visually.
export function snapDelta(session, dx, dy, gridSize = GRID_SIZE) {
    const snap = (base, d) => Math.round((base + d) / gridSize) * gridSize - base;
    return { dx: snap(session.base.x, dx), dy: snap(session.base.y, dy) };
}

// Direct def-level children of any of `parentKeys` — the set a shift-drag
// counter-offsets. Offsets are taken against each child's *resolved* previous
// layout (for a native parent that's the parent itself; for a ref key the
// parser resolved it to the unrolled group's tail). Children belonging to
// imported groups have no def-level offset to compensate, so they aren't
// collected and will follow the dragged element even in shift mode.
function collectDefChildren(def, viewContent, layouts, prefix, parentKeys) {
    const children = [];
    for (const [childKey, child] of Object.entries(def.content)) {
        if (child.component || !parentKeys.includes(child.previous)) continue;
        const childRenderedId = `${prefix}${childKey}`;
        const childItem = viewContent[childRenderedId];
        const childLayout = layouts[childRenderedId];
        const prevLayout = childItem?.previous ? layouts[childItem.previous] : null;
        if (!childItem || !childLayout || !prevLayout) continue;
        children.push({
            key: childKey,
            renderedId: childRenderedId,
            x: childLayout.x - prevLayout.x,
            y: childLayout.y - prevLayout.y,
            // Authored offsets (resolved-view values are already numeric), so a
            // mid-drag shift release can restore them; null deletes the key.
            origX: childItem.x ?? null,
            origY: childItem.y ?? null,
        });
    }
    return children;
}

// Materialize an item's current effective offset from cached layouts: its
// absolute position minus its predecessor's (the exact inverse of
// computeItemLayout's `x = px + offset`), so items positioned purely by
// `position` keywords drag without a first-move jump. Also reports the
// predecessor's absolute position (`origin`) — the snap grid's anchor.
function materializeBase(item, layout, layouts) {
    const prevLayout = item.previous ? layouts[item.previous] : null;
    if (item.previous && !prevLayout) return null;
    const origin = { x: prevLayout?.x ?? 0, y: prevLayout?.y ?? 0 };
    return {
        base: { x: layout.x - origin.x, y: layout.y - origin.y },
        origin,
    };
}

// Snapshot everything the move/up handlers need at mousedown time, for a
// native item of the edited component. Returns null when the shape isn't one
// (imported group, stale id, layout not cached yet). `renderedId` is the
// resolved-view key (`<componentName>_<contentKey>` — same flattening
// contract target.js leans on); `key` is the component-definition content key
// the commit writes to.
export function buildDragSession(canvas, componentName, renderedId) {
    const layouts = canvas.layouts[EDITING_VIEW] ?? {};
    const viewContent = canvas.store.views[EDITING_VIEW]?.content ?? {};
    const def = canvas.components[componentName];
    const prefix = `${componentName}_`;
    if (!renderedId.startsWith(prefix)) return null;
    const key = renderedId.slice(prefix.length);
    if (!def?.content || !Object.hasOwn(def.content, key) || def.content[key].component) return null;
    const item = viewContent[renderedId];
    const layout = layouts[renderedId];
    if (!item || !layout) return null;
    const measured = materializeBase(item, layout, layouts);
    if (!measured) return null;

    return {
        mode: 'native',
        key,
        renderedId,
        ...measured,
        children: collectDefChildren(def, viewContent, layouts, prefix, [key]),
    };
}

// Session for a shape belonging to an imported component reference. Two modes:
// - 'point': a zero-size anchor point already sits immediately before the ref
//   in the def — the drag simply moves it (same commit path as native).
// - 'create-point': no anchor yet — the drag previews on the group's head item
//   and the drop inserts the point, positioned so the group lands exactly
//   where the preview showed it.
// Known v1 limits (shared with target.js's importer lookup): the first def ref
// matching the clicked group's component name wins, and a group whose own
// first item is another ref previews from the inner head only.
export function buildImportedDragSession(canvas, componentName, renderedId) {
    const def = canvas.components[componentName];
    if (!def?.content) return null;
    const prefix = `${componentName}_`;
    if (renderedId.startsWith(prefix)) return null; // native — not ours
    const importedName = renderedId.split('_')[0];
    const refKey = Object.entries(def.content)
        .find(([, v]) => v?.component === importedName)?.[0];
    if (!refKey) return null;

    const layouts = canvas.layouts[EDITING_VIEW] ?? {};
    const viewContent = canvas.store.views[EDITING_VIEW]?.content ?? {};

    // Group head: walk back through contiguous same-prefix keys from the
    // clicked one (insertion order is render/chain order).
    const groupPrefix = `${importedName}_`;
    const keys = Object.keys(viewContent);
    let start = keys.indexOf(renderedId);
    if (start < 0) return null;
    while (start > 0 && keys[start - 1].startsWith(groupPrefix)) start--;
    const headId = keys[start];
    const headItem = viewContent[headId];
    const headLayout = layouts[headId];
    if (!headItem || !headLayout) return null;
    const headMeasured = materializeBase(headItem, headLayout, layouts);
    if (!headMeasured) return null;

    const defKeys = Object.keys(def.content);
    const prevDefKey = defKeys[defKeys.indexOf(refKey) - 1] ?? null;
    const maybePoint = prevDefKey ? def.content[prevDefKey] : null;
    const hasPoint = !!maybePoint && !maybePoint.component
        && maybePoint.width === 0 && maybePoint.height === 0;

    const shared = {
        refKey,
        importedName,
        clickedId: renderedId,
        children: collectDefChildren(def, viewContent, layouts, prefix,
            hasPoint ? [refKey, prevDefKey] : [refKey]),
    };

    if (hasPoint) {
        const pointRenderedId = `${prefix}${prevDefKey}`;
        const pointItem = viewContent[pointRenderedId];
        const pointLayout = layouts[pointRenderedId];
        if (!pointItem || !pointLayout) return null;
        const pointMeasured = materializeBase(pointItem, pointLayout, layouts);
        if (!pointMeasured) return null;
        return { ...shared, mode: 'point', key: prevDefKey, renderedId: pointRenderedId, ...pointMeasured };
    }

    // The head's offset from the future point. Measured with `previous` forced
    // truthy because inserting the point gives a previously-rootless head a
    // predecessor (and with it the default-separation term).
    const headOffset = computeItemLayout({ ...headItem, previous: 'anchor' }, POINT_LAYOUT, canvas.defaults);
    return {
        ...shared,
        mode: 'create-point',
        renderedId: headId,
        ...headMeasured,
        prevDefKey,
        pointKey: uniqueContentKey(def.content, `${refKey}_point`),
        headOffset: { x: headOffset.x, y: headOffset.y },
    };
}

// Build the id → {x, y} patch map for one drag state.
// - solo (shift): children get the inverse delta so their absolute positions
//   hold still while the dragged element moves.
// - preview without solo: children are reset to their authored offsets, so
//   toggling shift mid-gesture doesn't strand them on compensated values.
// - forCommit: keys are def content keys, values rounded, and untouched
//   children are omitted entirely (the def never changed for them).
export function computeDragPatches(session, dx, dy, { solo = false, forCommit = false } = {}) {
    const fmt = forCommit ? Math.round : (v) => v;
    const keyOf = forCommit ? (entry) => entry.key : (entry) => entry.renderedId;
    const patches = {
        [keyOf(session)]: { x: fmt(session.base.x + dx), y: fmt(session.base.y + dy) },
    };
    for (const child of session.children) {
        if (solo) {
            patches[keyOf(child)] = { x: fmt(child.x - dx), y: fmt(child.y - dy) };
        } else if (!forCommit) {
            patches[keyOf(child)] = { x: child.origX, y: child.origY };
        }
    }
    return patches;
}

// The anchor point a 'create-point' drop inserts before the ref: a zero-size
// box positioned so the group's head lands exactly where the preview showed
// it (head = point + headOffset, so point = dragged head position − offset).
export function buildPointItem(session, dx, dy) {
    const point = {
        shape: 'box',
        width: 0,
        height: 0,
        x: Math.round(session.base.x + dx - session.headOffset.x),
        y: Math.round(session.base.y + dy - session.headOffset.y),
    };
    if (session.prevDefKey) point.previous = session.prevDefKey;
    return point;
}

// --- interaction wiring -------------------------------------------------------

function sessionFor(canvas, renderedId) {
    return buildDragSession(canvas, componentEditState.name, renderedId)
        ?? buildImportedDragSession(canvas, componentEditState.name, renderedId);
}

// Delegated at the `#content` level (like the click targeting in lifecycle.js)
// so every shape is draggable regardless of whether it authored the
// description/references that attachElementEventListeners keys on, and so the
// handlers survive the per-frame partial re-renders that replace shape DOM.
export function enableDragEditing(manager) {
    const canvas = manager.canvas;
    const content = d3.select('#content');

    // Cursor affordance: grab on draggable shapes. Delegated mouseover so it
    // applies to re-rendered DOM without re-attaching anything.
    content.on('mouseover.componentEditorDrag', (event) => {
        if (!componentEditState.active) return;
        const el = event.target;
        const tag = el?.tagName;
        if (tag !== 'rect' && tag !== 'polygon') return;
        const renderedId = (el.getAttribute('id') ?? '').split('.')[0];
        if (sessionFor(canvas, renderedId)) {
            el.style.cursor = 'grab';
        }
    });

    content.on('mousedown.componentEditorDrag', (event) => {
        if (!componentEditState.active || event.button !== 0) return;
        const tag = event.target?.tagName;
        if (tag !== 'rect' && tag !== 'polygon') return;
        const renderedId = (event.target.getAttribute('id') ?? '').split('.')[0];
        const session = sessionFor(canvas, renderedId);
        if (!session) return; // unresolvable — leave pan + click intact
        // Own the gesture: keep d3-zoom from panning and the browser from
        // starting a text selection.
        event.stopPropagation();
        event.preventDefault();
        startGesture(manager, session, event);
    });
}

export function disableDragEditing() {
    d3.select('#content')
        .on('mousedown.componentEditorDrag', null)
        .on('mouseover.componentEditorDrag', null);
    removeDragGrid();
}

// Select the dragged element the way a click would, so the sidebar form and
// highlight track the gesture.
function selectDragTarget(manager, session) {
    if (session.mode === 'native') {
        if (componentEditState.target === session.key && !componentEditState.targetIsImported) return;
        setComponentEditTarget(session.key);
    } else {
        // Imported group — mirror handleElementClick's imported-target fields.
        componentEditState.target = session.refKey;
        componentEditState.targetIsImported = true;
        componentEditState.targetElementId = session.clickedId;
        componentEditState.importedGroupPrefix = session.importedName;
    }
    renderInfoPanel(manager);
}

function startGesture(manager, session, downEvent) {
    const canvas = manager.canvas;
    const startX = downEvent.clientX;
    const startY = downEvent.clientY;
    let dragging = false;
    let lastMove = null;
    let frame = null;

    const currentDelta = (event) => {
        const k = d3.zoomTransform(canvas.svgDOM.node()).k;
        const d = screenDeltaToCanvas(event.clientX - startX, event.clientY - startY, k);
        // Snap to the grid unless alt suspends it (read per-event, so toggling
        // alt mid-gesture takes effect on the next move — same as shift).
        return event.altKey ? d : snapDelta(session, d.dx, d.dy);
    };

    // Coalesce mousemove bursts to one preview per animation frame. In
    // 'create-point' mode the preview drags the group's head directly — the
    // point doesn't exist until the drop.
    const applyPreview = () => {
        frame = null;
        if (!lastMove || !componentEditState.active) return;
        // Re-assert the grid's transform each frame so a mid-drag wheel zoom
        // can't leave it out of sync with #content.
        updateDragGrid(canvas, session.origin);
        const { dx, dy } = currentDelta(lastMove);
        canvas.previewItems(EDITING_VIEW, computeDragPatches(session, dx, dy, { solo: lastMove.shiftKey }));
        // The partial render rebuilt the dragged shapes' DOM; re-assert the
        // selection highlight class on the fresh elements.
        highlightTarget();
    };

    const onMove = (event) => {
        if (!dragging) {
            if (Math.hypot(event.clientX - startX, event.clientY - startY) < DRAG_THRESHOLD_PX) return;
            dragging = true;
            document.body.style.cursor = 'grabbing';
            showDragGrid(canvas, session.origin);
            selectDragTarget(manager, session);
        }
        event.preventDefault();
        lastMove = event;
        if (frame == null) frame = requestAnimationFrame(applyPreview);
    };

    const onUp = (event) => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        if (!dragging) return; // plain click — the click delegate handles selection
        if (frame != null) {
            cancelAnimationFrame(frame);
            frame = null;
        }
        document.body.style.cursor = '';
        hideDragGrid(canvas);
        suppressNextClick();
        if (!componentEditState.active) return;
        // Commit once through the recording component-source path: one undo
        // entry, and the re-resolve reflows descendants to exactly where the
        // preview showed them (their relative offsets never changed).
        const { dx, dy } = currentDelta(event);
        if (session.mode === 'create-point') {
            const childPatches = {};
            if (event.shiftKey) {
                for (const child of session.children) {
                    childPatches[child.key] = { x: Math.round(child.x - dx), y: Math.round(child.y - dy) };
                }
            }
            insertItemBefore(manager, session.refKey, session.pointKey, buildPointItem(session, dx, dy), childPatches);
        } else {
            patchItems(manager, computeDragPatches(session, dx, dy, { solo: event.shiftKey, forCommit: true }));
        }
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
}

// After a drag the browser still dispatches a click; left alone it would reach
// the svg background handler (or worse, a stale element) and deselect the
// just-dragged item. Swallow exactly that one click — the timeout covers the
// no-click case (e.g. mouseup outside the window) so the suppressor can't
// leak into a later, genuine click.
function suppressNextClick() {
    const stop = (event) => {
        event.stopPropagation();
        event.preventDefault();
    };
    window.addEventListener('click', stop, true);
    setTimeout(() => window.removeEventListener('click', stop, true), 0);
}
