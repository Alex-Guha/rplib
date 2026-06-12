import { componentEditState } from '../../utils/state.js';
import { setComponentEditTarget, validatePreviousPick } from './helpers.js';
import { renderInfoPanel } from './render.js';

export function handleElementClick(event, manager) {
    const rawId = event.currentTarget.getAttribute('id');
    if (!rawId) return;
    if (componentEditState.pickingPrevious) {
        applyPreviousPick(manager, rawId);
        return;
    }
    // Items inside the resolved view are keyed off rendered ids like
    // `<componentName>_<contentKey>` (native) or `<importedName>_<contentKey>`
    // (flattened from a `component:` reference).
    //
    // NOTE: this prefix scheme duplicates the parser's id-flattening logic in
    // core/parser/parseIntermediateFormat.js (see `newItemID =
    // `${componentID}_${itemID}`` near the buildComponent recursion). If that
    // scheme changes, this detection breaks. A canvas.resolveItemOrigin(id)
    // helper on the live-update API would remove the coupling.
    const componentName = componentEditState.name;
    const rootPrefix = `${componentName}_`;
    const topSegment = rawId.split('.')[0];
    if (topSegment.startsWith(rootPrefix)) {
        const contentKey = topSegment.slice(rootPrefix.length);
        const def = manager.canvas.components[componentName];
        if (def?.content && Object.hasOwn(def.content, contentKey) && !def.content[contentKey].component) {
            setComponentEditTarget(contentKey);
            renderInfoPanel(manager);
            highlightTarget();
            return;
        }
    }
    // Imported: walk root content for a `component:` ref matching the top id prefix.
    const def = manager.canvas.components[componentName];
    const importedComponentName = topSegment.split('_')[0];
    const importerKey = def?.content
        ? Object.entries(def.content).find(([, v]) => v?.component === importedComponentName)?.[0]
        : null;
    componentEditState.target = importerKey ?? null;
    componentEditState.targetIsImported = true;
    componentEditState.targetElementId = topSegment;
    componentEditState.importedGroupPrefix = importedComponentName;
    renderInfoPanel(manager);
    highlightTarget();
}

// --- click-to-set-previous -----------------------------------------------------
//
// Armed from a "previous" row (render.js) — the item form's layout-chain field
// or an arrow entry's source field. While armed, the next canvas click commits
// the picked content key through the arming row's callback instead of
// re-targeting. Any other action cancels: every full panel re-render does
// (form edits, mutations, undo/redo, background clicks, target changes — they
// all funnel through renderInfoPanel, which calls cancelPickPrevious), as does
// a drag gesture starting (drag.js). Canvas pan/zoom touches none of those
// paths, so it leaves the pick armed.

// The armed pick's request: { onPick(contentKey), currentPrevious }. Module-
// local (not on componentEditState) because it's a closure over the arming
// row's commit path, only meaningful while pickingPrevious is true.
let pickRequest = null;

export function startPickPrevious(request) {
    componentEditState.pickingPrevious = true;
    pickRequest = request;
    // Cursor affordance — see the #content.ce-picking rule in styles.css.
    d3.select('#content').classed('ce-picking', true);
}

export function cancelPickPrevious(manager, { rerender = true } = {}) {
    if (!componentEditState.pickingPrevious) return;
    componentEditState.pickingPrevious = false;
    pickRequest = null;
    d3.select('#content').classed('ce-picking', false);
    // Restore the pick button from its armed state. Skipped when the caller is
    // renderInfoPanel itself (or is about to trigger a re-render anyway).
    if (rerender) renderInfoPanel(manager);
}

// Resolve a clicked shape's rendered id to the def content key a `previous`
// reference can legally name: a native item's own key, or — for any shape
// inside an imported group — the importer `component:` ref key. The parser
// resolves a ref key to the unrolled group's tail; imported internals are out
// of scope for `previous` (see core/parser resolvePreviousRef), so the ref key
// is the only valid handle for the whole group. Returns null when the id maps
// to neither. Exported for tests.
export function resolvePreviousPickKey(def, componentName, rawId) {
    if (!def?.content) return null;
    const topSegment = rawId.split('.')[0];
    const rootPrefix = `${componentName}_`;
    if (topSegment.startsWith(rootPrefix)) {
        const contentKey = topSegment.slice(rootPrefix.length);
        if (Object.hasOwn(def.content, contentKey) && !def.content[contentKey].component)
            return contentKey;
    }
    const importedComponentName = topSegment.split('_')[0];
    return Object.entries(def.content)
        .find(([, v]) => v?.component === importedComponentName)?.[0] ?? null;
}

function applyPreviousPick(manager, rawId) {
    const def = manager.canvas.components[componentEditState.name];
    const picked = resolvePreviousPickKey(def, componentEditState.name, rawId);
    const request = pickRequest;
    // Clicking the target itself (self-reference — meaningless for layout and
    // for an arrow's source alike), an unresolvable shape, or the row's current
    // previous is a no-op pick — just disarm and restore the button.
    if (!request
        || !picked
        || picked === componentEditState.target
        || picked === request.currentPrevious) {
        cancelPickPrevious(manager);
        return;
    }
    // Arrow previous fields share the item's ordering rule: the parser resolves
    // them against the same idMap, so both may only name items declared before
    // the owning item (the current target).
    const err = validatePreviousPick(def, componentEditState.target, picked);
    if (err) {
        // Disarm (and restore the button) before the blocking alert.
        cancelPickPrevious(manager);
        window.alert(err);
        return;
    }
    cancelPickPrevious(manager, { rerender: false });
    // Commits through patchItem one way or another, whose afterMutate
    // re-renders the panel and re-applies the highlight.
    request.onPick(picked);
}

export function highlightTarget() {
    d3.selectAll('.component-edit-target').classed('component-edit-target', false);
    d3.selectAll('.component-edit-target-group').classed('component-edit-target-group', false);
    if (!componentEditState.targetElementId) return;

    // The canvas renders via staggered requestAnimationFrame (renderDelay
    // defaults to true), so the just-added element may not be in the DOM yet
    // when we land here from an afterMutate callback. Retry across a handful
    // of frames until it shows up, then apply the class. The expected element
    // id is captured at scheduling time — if the user re-targets in the
    // meantime, we bail rather than fight a stale lookup.
    const expectedId = componentEditState.targetElementId;
    const expectedImportedGroup = componentEditState.targetIsImported
        ? componentEditState.importedGroupPrefix
        : null;
    let attempts = 0;
    const apply = () => {
        if (!componentEditState.active) return;
        if (componentEditState.targetElementId !== expectedId) return;
        if (expectedImportedGroup) {
            const matches = document.querySelectorAll(`#content rect[id^="${expectedImportedGroup}_"], #content polygon[id^="${expectedImportedGroup}_"]`);
            if (matches.length > 0) {
                matches.forEach((el) => d3.select(el).classed('component-edit-target-group', true));
                return;
            }
        } else {
            const el = document.getElementById(expectedId);
            if (el && (el.tagName === 'rect' || el.tagName === 'polygon')) {
                d3.select(el).classed('component-edit-target', true);
                return;
            }
        }
        if (++attempts < 30) requestAnimationFrame(apply);
    };
    apply();
}
