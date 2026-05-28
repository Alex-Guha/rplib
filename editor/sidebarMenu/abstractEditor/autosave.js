// Autosave + rename handling. See feedback/ABSTRACT_EDITOR_PLAN.md §4.4.
//
// `saveBody` runs on every debounced update and only writes when the parsed
// name matches the last-committed name. Renames are committed on a separate
// trigger (name-line blur, or a longer idle timer) so we don't churn
// abstractDefinitions on every keystroke while the user is typing a new name.

import { EditorView } from '@codemirror/view';
import { parseAbstractContent } from 'rplib/parser/parseAbstractFile.js';
import { saveAbstractDefinitions } from 'rplib/parser/storage.js';

const BODY_DEBOUNCE_MS = 300;
const RENAME_IDLE_MS = 1500;

const tryParse = (text) => {
    try { return parseAbstractContent(text); } catch { return null; }
};

/**
 * @param {Object} deps
 * @param {Object} deps.canvas                        appManager.canvas
 * @param {Storage} deps.storage                      localStorage
 * @param {string} deps.initialName                   '' for new
 * @param {(newName: string) => void} deps.onRenameCommitted   typically `navigateTo`
 * @param {() => boolean} [deps.canRename]            gate (e.g. !isNew until first save)
 * @returns extension array + handle
 */
export function makeAutosave({ canvas, storage, initialName, onRenameCommitted, onBodyCommitted, canRename }) {
    let lastCommittedName = initialName || null;
    let bodyTimer = null;
    let renameTimer = null;
    let lastNameLineText = null;  // tracks line 1 text to detect name-line blur

    const getCommittedName = () => lastCommittedName;

    const writeBody = (parsed, parsedName) => {
        canvas.store.abstractDefinitions[lastCommittedName] = Object.values(parsed)[0];
        saveAbstractDefinitions(canvas, storage);
        canvas.invalidateView(lastCommittedName);
        onBodyCommitted?.(lastCommittedName);
    };

    const commitRename = (parsed, parsedName) => {
        if (!parsedName || parsedName === lastCommittedName) return;
        if (canRename && !canRename()) return;
        // Block collisions: lint surfaces the warning; we just refuse.
        if (
            parsedName in canvas.store.abstractDefinitions ||
            parsedName in canvas.components
        ) {
            return;
        }
        const oldName = lastCommittedName;
        const body = Object.values(parsed)[0];
        canvas.store.abstractDefinitions[parsedName] = body;
        if (oldName && oldName !== parsedName) {
            delete canvas.store.abstractDefinitions[oldName];
            canvas.invalidateView(oldName);
        }
        saveAbstractDefinitions(canvas, storage);
        lastCommittedName = parsedName;
        onRenameCommitted?.(parsedName);
    };

    const saveBodyNow = (view) => {
        const text = view.state.doc.toString();
        if (!text.trim()) return;
        const parsed = tryParse(text);
        if (!parsed) return;
        const parsedName = Object.keys(parsed)[0];
        if (!parsedName) return;
        if (lastCommittedName == null) {
            // First successful parse on a brand-new arch — commit it under
            // the parsed name (collision-checked).
            commitRename(parsed, parsedName);
            return;
        }
        if (parsedName === lastCommittedName) {
            writeBody(parsed, parsedName);
        }
        // else: rename path; handled separately.
    };

    const scheduleBodySave = (view) => {
        clearTimeout(bodyTimer);
        bodyTimer = setTimeout(() => saveBodyNow(view), BODY_DEBOUNCE_MS);
    };

    const scheduleRenameCommit = (view) => {
        clearTimeout(renameTimer);
        renameTimer = setTimeout(() => {
            const parsed = tryParse(view.state.doc.toString());
            if (!parsed) return;
            const parsedName = Object.keys(parsed)[0];
            commitRename(parsed, parsedName);
        }, RENAME_IDLE_MS);
    };

    const updateListener = EditorView.updateListener.of((u) => {
        if (u.docChanged) {
            scheduleBodySave(u.view);
            const line1 = u.state.doc.line(1).text;
            if (lastNameLineText !== null && line1 !== lastNameLineText) {
                scheduleRenameCommit(u.view);
            }
            lastNameLineText = line1;
        }
        if (u.selectionSet) {
            // Compare line numbers using each state's own doc to avoid
            // out-of-range positions after a deletion shortens the doc.
            const prevHead = u.startState.selection.main.head;
            const newHead = u.state.selection.main.head;
            const prevLine = u.startState.doc.lineAt(prevHead).number;
            const newLine = u.state.doc.lineAt(newHead).number;
            if (prevLine === 1 && newLine !== 1) {
                clearTimeout(renameTimer);
                const parsed = tryParse(u.state.doc.toString());
                if (parsed) {
                    const parsedName = Object.keys(parsed)[0];
                    if (parsedName !== lastCommittedName) commitRename(parsed, parsedName);
                }
            }
        }
    });

    /**
     * Manual Apply (Ctrl/Cmd+S or button): force-flush body save AND rename
     * commit. Returns the parse result so the caller can decide whether to
     * navigate / display modal.
     */
    const flush = (view) => {
        clearTimeout(bodyTimer);
        clearTimeout(renameTimer);
        const text = view.state.doc.toString();
        const parsed = parseAbstractContent(text); // throw to caller on error
        const parsedName = Object.keys(parsed)[0];
        if (lastCommittedName == null || parsedName !== lastCommittedName) {
            commitRename(parsed, parsedName);
        } else {
            writeBody(parsed, parsedName);
        }
        return { parsed, parsedName, committedName: lastCommittedName };
    };

    return {
        extension: [updateListener],
        flush,
        getCommittedName,
    };
}
