// Owns the parsed-data and navigation-history state for a canvas.
// Rendering and DOM live on RPCanvas; this object holds only data.
export default class ViewStore {
    constructor() {
        // Intermediate architecture structures, keyed by abstract name.
        // Entries may have a `properties` field used for {{placeholder}} substitution during text rendering.
        this.abstractDefinitions = {};

        // Resolved (flat) views, keyed by view name. Populated lazily on first navigation.
        this.views = {};

        // Per-abstract view-hierarchy summary, consumed by app sidebars.
        // TODO Lift to app-side: only used by the view-nav menu.
        this.viewStructures = {};

        this.currentView = null;
        this.rootView = null;

        this.undoHistory = [];
        this.redoHistory = [];
    }
}
