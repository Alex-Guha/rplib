import test from 'node:test';
import assert from 'node:assert/strict';

import EditHistory from '../editHistory.js';
import {
    applyPatch,
    inversePatch,
    insertAt,
    renameInContent,
    makeUpdateItemEntry,
    makeAddItemEntry,
    makeRemoveItemEntry,
    makeRenameItemEntry,
    makeUpdatePatchEntry,
    MISSING,
} from '../mutate.js';

// These tests cover the pure mutation surface (mutate.js + editHistory.js).
// RPCanvas wires those into rendering + hooks; that integration is a thin
// adapter and is covered alongside DOM-level partial-redraw tests in PR2.

// ---- EditHistory ----

test('EditHistory: record, popUndo moves to redo, popRedo moves back', () => {
    const h = new EditHistory();
    assert.equal(h.canUndo(), false);
    h.record({ kind: 'a' });
    h.record({ kind: 'b' });
    assert.equal(h.popUndo().kind, 'b');
    assert.equal(h.canRedo(), true);
    assert.equal(h.popRedo().kind, 'b');
    assert.equal(h.canUndo(), true);
});

test('EditHistory: new record clears redo stack', () => {
    const h = new EditHistory();
    h.record({ kind: 'a' });
    h.popUndo();
    assert.equal(h.canRedo(), true);
    h.record({ kind: 'b' });
    assert.equal(h.canRedo(), false);
});

test('EditHistory: clear empties both stacks', () => {
    const h = new EditHistory();
    h.record({ kind: 'a' });
    h.popUndo();
    h.clear();
    assert.equal(h.canUndo(), false);
    assert.equal(h.canRedo(), false);
});

// ---- patch helpers ----

test('applyPatch: shallow set; null deletes; MISSING deletes', () => {
    const t = { a: 1, b: 2 };
    applyPatch(t, { a: 9, c: 3, b: null });
    assert.deepEqual(t, { a: 9, c: 3 });
    applyPatch(t, { a: MISSING });
    assert.deepEqual(t, { c: 3 });
});

test('inversePatch: existing keys → prior value; missing keys → MISSING', () => {
    const t = { a: 1 };
    const inv = inversePatch(t, { a: 99, b: 2 });
    assert.equal(inv.a, 1);
    assert.equal(inv.b, MISSING);
});

test('applyPatch + inversePatch round-trip restores state', () => {
    const t = { a: 1, b: 2 };
    const patch = { a: 99, c: 3, b: null };
    const inv = inversePatch(t, patch);
    applyPatch(t, patch);
    applyPatch(t, inv);
    assert.deepEqual(t, { a: 1, b: 2 });
});

// ---- insertAt ----

test('insertAt: preserves order and inserts at index', () => {
    const c = { A: 1, B: 2, C: 3 };
    assert.deepEqual(Object.keys(insertAt(c, 'X', 9, 0)), ['X', 'A', 'B', 'C']);
    assert.deepEqual(Object.keys(insertAt(c, 'X', 9, 1)), ['A', 'X', 'B', 'C']);
    assert.deepEqual(Object.keys(insertAt(c, 'X', 9, 3)), ['A', 'B', 'C', 'X']);
    // Out-of-range clamps to end / start.
    assert.deepEqual(Object.keys(insertAt(c, 'X', 9, 99)), ['A', 'B', 'C', 'X']);
    assert.deepEqual(Object.keys(insertAt(c, 'X', 9, -1)), ['X', 'A', 'B', 'C']);
});

// ---- renameInContent ----

test('renameInContent: rewrites key, previous, arrow.previous (object and array)', () => {
    const c = {
        A: { shape: 'box' },
        B: { previous: 'A', arrow: { previous: 'A' } },
        C: { previous: 'B', arrow: [{ previous: 'A' }, { previous: 'B' }] },
    };
    const out = renameInContent(c, 'A', 'ALPHA');
    assert.deepEqual(Object.keys(out), ['ALPHA', 'B', 'C']);
    assert.equal(out.B.previous, 'ALPHA');
    assert.equal(out.B.arrow.previous, 'ALPHA');
    assert.equal(out.C.arrow[0].previous, 'ALPHA');
    assert.equal(out.C.arrow[1].previous, 'B');
});

// ---- entry factories: do then undo round-trips ----

function roundTrip(entry) {
    entry.do();
    const after = JSON.stringify(entry); // not used directly — just exercising
    return after;
}

test('makeUpdateItemEntry: do applies, undo restores; null deletes', () => {
    const view = { content: { A: { shape: 'box', width: 100 } } };
    const e = makeUpdateItemEntry(view, 'v', 'A', { width: 200, opacity: 0.5 });
    e.do();
    assert.deepEqual(view.content.A, { shape: 'box', width: 200, opacity: 0.5 });
    e.undo();
    assert.deepEqual(view.content.A, { shape: 'box', width: 100 });

    const e2 = makeUpdateItemEntry(view, 'v', 'A', { width: null });
    e2.do();
    assert.equal(view.content.A.width, undefined);
    assert.equal(Object.hasOwn(view.content.A, 'width'), false);
    e2.undo();
    assert.equal(view.content.A.width, 100);
});

test('makeUpdateItemEntry: returns null when item missing', () => {
    assert.equal(makeUpdateItemEntry({ content: {} }, 'v', 'X', {}), null);
    assert.equal(makeUpdateItemEntry(null, 'v', 'X', {}), null);
});

test('makeAddItemEntry: positions via after / before / default-append; undo removes', () => {
    const view = {
        content: {
            A: { shape: 'box' },
            B: { shape: 'box' },
            C: { shape: 'box' },
        },
    };
    const e = makeAddItemEntry(view, 'v', 'X', { shape: 'box' }, { after: 'A' });
    e.do();
    assert.deepEqual(Object.keys(view.content), ['A', 'X', 'B', 'C']);
    e.undo();
    assert.deepEqual(Object.keys(view.content), ['A', 'B', 'C']);

    const e2 = makeAddItemEntry(view, 'v', 'Y', {}, { before: 'B' });
    e2.do();
    assert.deepEqual(Object.keys(view.content), ['A', 'Y', 'B', 'C']);

    const e3 = makeAddItemEntry(view, 'v', 'Z', {});
    e3.do();
    assert.deepEqual(Object.keys(view.content), ['A', 'Y', 'B', 'C', 'Z']);
});

test('makeAddItemEntry: returns null on duplicate id; tolerates missing content', () => {
    assert.equal(makeAddItemEntry({ content: { A: {} } }, 'v', 'A', {}), null);
    // Missing content gets created.
    const view = {};
    const e = makeAddItemEntry(view, 'v', 'A', { shape: 'box' });
    e.do();
    assert.deepEqual(view.content, { A: { shape: 'box' } });
});

test('makeRemoveItemEntry: undo restores at original position', () => {
    const view = {
        content: {
            A: { shape: 'box' },
            B: { shape: 'box', previous: 'A' },
            C: { shape: 'box', previous: 'B' },
        },
    };
    const e = makeRemoveItemEntry(view, 'v', 'B');
    e.do();
    assert.deepEqual(Object.keys(view.content), ['A', 'C']);
    e.undo();
    assert.deepEqual(Object.keys(view.content), ['A', 'B', 'C']);
    assert.equal(view.content.B.previous, 'A');
});

test('makeRenameItemEntry: returns null on missing source or colliding target', () => {
    const view = { content: { A: {}, B: {} } };
    assert.equal(makeRenameItemEntry(view, 'v', 'X', 'Y'), null);
    assert.equal(makeRenameItemEntry(view, 'v', 'A', 'B'), null);
});

test('makeRenameItemEntry: do renames; undo reverses; arrow refs rewritten', () => {
    const view = {
        content: {
            A: { shape: 'box' },
            B: { previous: 'A', arrow: { previous: 'A' } },
        },
    };
    const e = makeRenameItemEntry(view, 'v', 'A', 'ALPHA');
    e.do();
    assert.deepEqual(Object.keys(view.content), ['ALPHA', 'B']);
    assert.equal(view.content.B.previous, 'ALPHA');
    e.undo();
    assert.deepEqual(Object.keys(view.content), ['A', 'B']);
    assert.equal(view.content.B.previous, 'A');
});

test('makeUpdatePatchEntry: fires sideEffect on both do and undo', () => {
    const target = { foo: 1 };
    let calls = 0;
    const e = makeUpdatePatchEntry(target, 'v', { foo: 2, bar: 3 }, 'updateAbstract', () => calls++);
    e.do();
    assert.deepEqual(target, { foo: 2, bar: 3 });
    assert.equal(calls, 1);
    e.undo();
    assert.deepEqual(target, { foo: 1 });
    assert.equal(calls, 2);
});

test('makeUpdatePatchEntry: returns null when target missing', () => {
    assert.equal(makeUpdatePatchEntry(null, 'v', {}, 'updateAbstract'), null);
});

// ---- full do/undo/redo cycle via EditHistory ----

test('EditHistory + entry: do, undo, redo cycles state cleanly', () => {
    const view = { content: { A: { width: 100 } } };
    const h = new EditHistory();
    const e = makeUpdateItemEntry(view, 'v', 'A', { width: 200 });
    e.do();
    h.record(e);
    assert.equal(view.content.A.width, 200);

    h.popUndo().undo();
    assert.equal(view.content.A.width, 100);

    h.popRedo().do();
    assert.equal(view.content.A.width, 200);
});
