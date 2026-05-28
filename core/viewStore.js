// Owns the parsed-data and navigation-history state for a canvas.
// Rendering and DOM live on RPCanvas; this object holds only data.
export default class ViewStore {
    constructor() {
        // Intermediate abstract structures, keyed by abstract name.
        // Entries may have a `properties` field used for {{placeholder}} substitution during text rendering.
        this.abstractDefinitions = {};

        // Resolved (flat) views, keyed by view name. Populated lazily on first navigation.
        this.views = {};

        // Names of views that are top-level "roots" (as opposed to detail/sub views).
        // Populated by the view resolver. The canvas uses this to track `rootView`
        // without needing to know about any particular DSL's notion of "abstract".
        this.rootViews = new Set();

        this.currentView = null;
        this.rootView = null;

        this.undoHistory = [];
        this.redoHistory = [];
    }
}
