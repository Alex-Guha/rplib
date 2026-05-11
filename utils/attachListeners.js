import d3 from 'd3';

// Attaches DOM listeners for any registered eventListenerTargets present on
// `item` or inherited from `parentItem`. No longer mutates item — callers that
// need inherited values at read time should use findHeirarchicalElementProperty,
// which walks the id chain in the parsed view.
export default function attachListeners(target, item, parentItem, eventListenerTargets) {
    const d3Target = (target && typeof target.each === 'function') ? target : d3.select(target);

    Object.entries(eventListenerTargets).forEach(([targetName, eventListener]) => {
        const present = item[targetName] !== undefined
            || (parentItem && parentItem[targetName] !== undefined);
        if (!present) return;
        d3Target.each(function () {
            eventListener(d3.select(this));
        });
    });
}
