// Abstract editor — CodeMirror 6 based replacement for the old textarea.
// See feedback/ABSTRACT_EDITOR_PLAN.md for the design. Persistence runs
// entirely through autosave (see ./autosave.js).

import { setSidebarState, abstractEditState } from '../../utils/state.js';
import { exportAbstractBundle, importAbstractFiles } from '../../utils/abstractIO.js';

import { buildEditor } from './codemirror.js';
import { makeDslHighlighter, makeDslHoverTooltip } from './dslHighlight.js';
import { makeCompletionSource } from './completions.js';
import { makeDslLinter } from './lint.js';
import { makeAutosave } from './autosave.js';

import { autocompletion } from '@codemirror/autocomplete';

/**
 * Mount the abstract editor into the #info pane.
 *
 * @param {AppManager} manager           live editor instance
 * @param {string} abstractText          initial doc
 * @param {Object} [opts]
 * @param {boolean} [opts.isNew=false]   true when opened from "create new" —
 *                                       starts the editor with no committed
 *                                       name so autosave commits on first
 *                                       successful parse.
 */
export function createAbstractEditor(manager, abstractText = '', { isNew = false } = {}) {
    // If we're re-entering while already active (e.g. caller forgot to exit
    // first), tear down the previous instance to avoid leaks.
    if (abstractEditState.active) exitAbstractMode(manager);

    const getComponents = () => manager.canvas.components;
    const getAbstractDefs = () => manager.canvas.store.abstractDefinitions;

    const infoElement = document.getElementById('info');
    infoElement.innerHTML = '';

    const host = document.createElement('div');
    host.id = 'abstract-editor';
    host.className = 'abstract-editor-host';

    const initialName = isNew ? null : extractFirstName(abstractText);

    const buttonRow = document.createElement('div');
    buttonRow.className = 'abstract-editor-buttons';

    const exportButton = document.createElement('button');
    exportButton.textContent = 'Export';
    const refreshExportEnabled = () => {
        exportButton.disabled = !autosave?.getCommittedName?.();
        exportButton.title = exportButton.disabled
            ? 'Export available once the abstract has a valid name'
            : 'Export this abstract (plus any custom components it uses)';
    };
    exportButton.addEventListener('click', (e) => {
        e.stopPropagation();
        const name = autosave.getCommittedName();
        if (!name) return;
        try { exportAbstractBundle(name, manager); } catch (err) { manager.reporter.error(err); }
    });

    const autosave = makeAutosave({
        canvas: manager.canvas,
        storage: manager.storage,
        initialName,
        onRenameCommitted: (newName) => {
            refreshExportEnabled();
            // Only navigate when the abstract is fully resolvable — otherwise
            // the renderer would log "Component X not found" / crash on an
            // in-progress doc. Lint inline surfaces the issue meanwhile; the
            // canvas catches up once typing stabilises.
            if (!abstractIsResolvable(manager, newName)) return;
            try { manager.canvas.changeViews(newName); } catch { /* lint shows it */ }
        },
        onBodyCommitted: (name) => {
            if (!abstractIsResolvable(manager, name)) return;
            const canvas = manager.canvas;
            try {
                if (canvas.store.currentView === name) {
                    // Re-render in place. writeBody invalidated the cached
                    // view, so we have to re-resolve before setCurrentView
                    // (which doesn't trigger resolveView on its own). Avoid
                    // changeViews — that pushes to undoHistory every keystroke.
                    if (!canvas.store.views[name]) {
                        const resolved = canvas.resolveView(canvas, name);
                        if (!resolved) return;
                        canvas.store.views[name] = resolved.view;
                        if (resolved.isRoot) {
                            canvas.store.rootViews.add(name);
                            canvas.store.rootView = name;
                        }
                    }
                    canvas.setCurrentView(name);
                } else {
                    // First time this abstract became resolvable since opening
                    // the editor (typical for a new abstract) — full navigate
                    // so the resolved view gets cached and rootView is updated.
                    canvas.invalidateView(name);
                    canvas.changeViews(name);
                }
            } catch { /* lint shows it */ }
        },
    });
    refreshExportEnabled();
    buttonRow.appendChild(exportButton);

    // Import is only offered in the "Create new abstract" flow so it doesn't
    // sit next to the Edit-current view (where overwriting the open abstract
    // would be surprising).
    if (isNew) {
        const importButton = document.createElement('button');
        importButton.textContent = 'Import';
        importButton.title = 'Import a .txt of abstracts, a .zip bundle, or a txt+js pair';
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.txt,.zip,.js';
        fileInput.multiple = true;
        fileInput.style.display = 'none';
        fileInput.addEventListener('change', async (e) => {
            e.stopPropagation();
            const files = fileInput.files;
            if (!files || files.length === 0) return;
            try {
                const { abstracts } = await importAbstractFiles(files, manager);
                if (abstracts.length > 0) {
                    // Exit the editor and navigate to the first imported abstract
                    // so the user sees the result of the import immediately.
                    exitAbstractMode(manager);
                    try { manager.canvas.changeViews(abstracts[0]); } catch { /* noop */ }
                }
            } catch (err) {
                manager.reporter.error(err);
                alert(`Import failed: ${err.message}`);
            } finally {
                fileInput.value = '';
            }
        });
        importButton.addEventListener('click', (e) => {
            e.stopPropagation();
            fileInput.click();
        });
        buttonRow.appendChild(importButton);
        buttonRow.appendChild(fileInput);
    }

    const completion = autocompletion({
        override: [makeCompletionSource({ getComponents })],
    });

    const linter = makeDslLinter({
        getCommittedName: autosave.getCommittedName,
        getComponents,
        getAbstractDefs,
    });

    const dslExtensions = [
        makeDslHighlighter(getComponents),
        makeDslHoverTooltip(getComponents),
        completion,
        linter,
        autosave.extension,
    ];

    const view = buildEditor({
        parent: host,
        doc: abstractText,
        // Ctrl/Cmd+S = silent force-flush so muscle memory still feels like
        // "save now." Autosave covers persistence; this just skips the
        // 300ms debounce. Parse errors are surfaced inline by the linter.
        onApply: () => { try { autosave.flush(view); } catch { /* lint shows it */ } },
        dslExtensions,
    });

    const mountIntoInfo = () => {
        const info = document.getElementById('info');
        if (!info) return;
        info.innerHTML = '';
        info.appendChild(host);
        info.appendChild(buttonRow);
        setSidebarState(manager, 'edit-button');
        view.focus();
    };
    mountIntoInfo();

    // Pin the edit nav button and mark abstract-edit mode active so resetSidebar
    // (background click / afterViewChange) doesn't blow away the editor.
    // Capture the previous root view so exit can restore it — handleNew sets
    // currentView to '' before entry, so we read rootView (which is sticky).
    abstractEditState.active = true;
    abstractEditState.previousRootView = manager.canvas.store.rootView || null;
    abstractEditState.teardown = () => {
        view.destroy();
        const info = document.getElementById('info');
        if (info) info.innerHTML = '';
    };
    // Background click rehydrates the editor host into #info — handy when the
    // user has been browsing element details and wants to return to editing.
    abstractEditState.restoreInfoPanel = mountIntoInfo;

    return view;
}

export function exitAbstractMode(manager) {
    if (!abstractEditState.active) return;
    const { teardown, previousRootView } = abstractEditState;
    abstractEditState.active = false;
    abstractEditState.teardown = null;
    abstractEditState.restoreInfoPanel = null;
    abstractEditState.previousRootView = null;
    try { teardown?.(); } catch { /* noop */ }
    setSidebarState(manager, null);

    // If the canvas is on an unresolved/empty view (e.g. user opened "Create
    // new" and never finished a parseable abstract), restore the previous root
    // view so the app doesn't sit on a broken state.
    const canvas = manager.canvas;
    const cur = canvas.store.currentView;
    const onBrokenView = !cur || !canvas.store.views[cur];
    if (onBrokenView && previousRootView && canvas.store.abstractDefinitions[previousRootView]) {
        try { canvas.changeViews(previousRootView); } catch { /* noop */ }
    }
}

function extractFirstName(text) {
    const firstLine = (text.split('\n').find((l) => l.trim().length > 0) || '').trim();
    const m = /^([\w.-]+):\s*$/.exec(firstLine);
    return m ? m[1] : null;
}

// Walk an abstract definition body and verify every referenced component is
// registered. Used to gate the live navigate during autosave so a partially-
// typed doc (e.g. `name:\n    tes` while the user is still typing `test`)
// doesn't trigger renderer errors.
function abstractIsResolvable(manager, abstractName) {
    const defs = manager.canvas.store.abstractDefinitions;
    const components = manager.canvas.components;
    const def = defs[abstractName];
    if (!def || !def.content) return false;

    const refs = new Set();
    // `content` is a map keyed by either a component name (bare ref) or a
    // class name (override). Bare-ref values are `null` or a nested-overrides
    // object; override values are `[componentName, null | { content: {...} }]`.
    const collectContent = (content) => {
        if (!content || typeof content !== 'object') return;
        for (const [key, entry] of Object.entries(content)) {
            if (Array.isArray(entry)) {
                if (typeof entry[0] === 'string') refs.add(entry[0]);
                if (entry[1] && typeof entry[1] === 'object' && entry[1].content) {
                    collectContent(entry[1].content);
                }
            } else {
                refs.add(key);
                if (entry && typeof entry === 'object' && entry.content) {
                    collectContent(entry.content);
                }
            }
        }
    };
    collectContent(def.content);
    for (const ref of refs) {
        const base = ref.replace(/_\d+$/, '');
        if (!(base in components)) return false;
    }
    return true;
}
