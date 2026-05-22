// Module-local singleton for the editor's AppManager.
// Set once by createEditor() in index.js; imported by every editor submodule
// instead of reaching across to the host app.

let _appManager = null;

export function setAppManager(instance) {
    _appManager = instance;
}

// Proxy so submodules can `import { appManager }` and read fresh state
// even though the real instance is assigned after module load.
export const appManager = new Proxy({}, {
    get(_, prop) {
        if (_appManager === null) {
            throw new Error('rplib-editor: appManager accessed before createEditor() ran');
        }
        return _appManager[prop];
    },
    set(_, prop, value) {
        if (_appManager === null) {
            throw new Error('rplib-editor: appManager accessed before createEditor() ran');
        }
        _appManager[prop] = value;
        return true;
    },
});
