import { updateButtonState } from '../core/navigation.js';

export function setSidebarState(manager, newState) {
    const previousState = manager.sidebarState;
    manager.sidebarState = newState;

    // Clear element hover effects
    if (previousState === 'element')
        d3.selectAll('.force-hover').classed('force-hover', false);

    // No need to update a button when it was just clicked again
    if (previousState === newState) return;

    // If a button was highlighted, unhighlight it
    if (previousState !== null && previousState !== 'element')
        updateButtonState(manager, previousState);

    // If the new state is from a button, highlight said button
    if (newState !== null && newState !== 'element')
        updateButtonState(manager, newState);
}
