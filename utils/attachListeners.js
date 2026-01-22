import d3 from 'd3';

export default function attachListeners(target, item, parentItem, eventListenerTargets) {
    const d3Target = (target && typeof target.each === 'function') ? target : d3.select(target);

    Object.entries(eventListenerTargets).forEach(([targetName, eventListener]) => {
        if (item[targetName] !== undefined) {
            d3Target.each(function () {
                eventListener(d3.select(this));
            });
        } else if (parentItem && parentItem[targetName] !== undefined) {
            item[targetName] = parentItem[targetName];
            d3Target.each(function () {
                eventListener(d3.select(this));
            });
        }
    });
}