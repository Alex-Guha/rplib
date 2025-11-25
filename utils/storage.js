// Only appends saved definitions, doesn't overwrite ones read from file at startup
export function loadAbstractDefinitions(self) {
    const savedDefinitions = JSON.parse(localStorage.getItem('abstractDefinitions')) || {};
    Object.keys(savedDefinitions).forEach(key => {
        if (!self.abstractDefinitions[key]) {
            self.abstractDefinitions[key] = savedDefinitions[key];
        }
    });
}

export function saveAbstractDefinitions(self) {
    localStorage.setItem('abstractDefinitions', JSON.stringify(self.abstractDefinitions));
}

export function clearAbstractDefinitions(self) {
    localStorage.removeItem('abstractDefinitions');
    localStorage.removeItem('rootView');
    self.viewStructures = {};
}


export function loadRootView(self, defaultView) {
    const rootView = localStorage.getItem('rootView') || defaultView;
    self.rootView = rootView;

    self.views[rootView] = self.parseAbstractDefinition(rootView);
    self.currentView = rootView;
}

export function saveRootView(self) {
    saveAbstractDefinitions(self);

    localStorage.setItem('rootView', self.rootView);
}