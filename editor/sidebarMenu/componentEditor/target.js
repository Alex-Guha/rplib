import { appManager } from '../../instance.js';
import { componentEditState } from '../../utils/state.js';
import { setComponentEditTarget } from './helpers.js';
import { renderInfoPanel } from './render.js';

export function handleElementClick(event) {
    const rawId = event.currentTarget.getAttribute('id');
    if (!rawId) return;
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
        const def = appManager.canvas.components[componentName];
        if (def?.content && Object.hasOwn(def.content, contentKey) && !def.content[contentKey].component) {
            setComponentEditTarget(contentKey);
            renderInfoPanel();
            highlightTarget();
            return;
        }
    }
    // Imported: walk root content for a `component:` ref matching the top id prefix.
    const def = appManager.canvas.components[componentName];
    const importedComponentName = topSegment.split('_')[0];
    const importerKey = def?.content
        ? Object.entries(def.content).find(([, v]) => v?.component === importedComponentName)?.[0]
        : null;
    componentEditState.target = importerKey ?? null;
    componentEditState.targetIsImported = true;
    componentEditState.targetElementId = topSegment;
    componentEditState.importedGroupPrefix = importedComponentName;
    renderInfoPanel();
    highlightTarget();
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
