// Edit history is separate from navigation history (undoViewChange/redoViewChange).
// Mutations push entries here; the consumer wires UI buttons to undoEdit/redoEdit
// or to the nav variants as it prefers.
//
// Each entry is self-contained `{ do, undo }` — undo/redo do NOT go back through
// the public mutation methods, so there's no replay-flag to manage. The mutation
// method computes both `do` (already applied at record time) and `undo` (closes
// over the prior state), then RPCanvas takes care of layout invalidation, render,
// and hooks for both the original mutation and any later replay.
export default class EditHistory {
    constructor() {
        this.undoStack = [];
        this.redoStack = [];
    }

    record(entry) {
        this.undoStack.push(entry);
        this.redoStack = [];
    }

    popUndo() {
        const entry = this.undoStack.pop();
        if (entry) this.redoStack.push(entry);
        return entry ?? null;
    }

    popRedo() {
        const entry = this.redoStack.pop();
        if (entry) this.undoStack.push(entry);
        return entry ?? null;
    }

    clear() {
        this.undoStack = [];
        this.redoStack = [];
    }

    canUndo() { return this.undoStack.length > 0; }
    canRedo() { return this.redoStack.length > 0; }
}
