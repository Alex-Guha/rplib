// Detail-view enumeration metadata produced by the bundled DSL parser.
// Apps with a custom resolver don't have to use this — it's purely a
// parser-side convenience used by app sidebars to render view-tree menus.
//
// State is module-level: the bundled parser is a singleton, and the app has
// at most one canvas. If multi-canvas support is ever needed, this needs to
// move onto a parser-instance object that the resolver closes over.

const viewStructures = {};

export function setViewStructure(viewName, detailNames) {
    viewStructures[viewName] = detailNames;
}

export function addDetailView(viewName, detailName) {
    if (!viewStructures[viewName]) viewStructures[viewName] = [];
    viewStructures[viewName].push(detailName);
}

export function getViewStructure(viewName) {
    return viewStructures[viewName];
}

export function clearViewStructures() {
    for (const key of Object.keys(viewStructures)) delete viewStructures[key];
}
