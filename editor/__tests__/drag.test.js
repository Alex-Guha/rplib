import test from 'node:test';
import assert from 'node:assert/strict';

import {
    screenDeltaToCanvas,
    buildDragSession,
    computeDragPatches,
} from '../sidebarMenu/componentEditor/drag.js';
import { EDITING_VIEW } from '../sidebarMenu/componentEditor/constants.js';
import { computeItemLayout } from '@alexguha/rplib/layout';

// The interaction layer (mousedown/move/up, rAF throttle, DOM) is exercised in
// the browser; these tests cover the pure drag math the gesture is built on.

// ---- screenDeltaToCanvas ----

test('screenDeltaToCanvas: divides the screen delta by the zoom scale', () => {
    assert.deepEqual(screenDeltaToCanvas(10, -20, 0.5), { dx: 20, dy: -40 });
    assert.deepEqual(screenDeltaToCanvas(10, -20, 2), { dx: 5, dy: -10 });
});

test('screenDeltaToCanvas: missing/zero scale falls back to identity', () => {
    assert.deepEqual(screenDeltaToCanvas(10, 20, undefined), { dx: 10, dy: 20 });
    assert.deepEqual(screenDeltaToCanvas(10, 20, 0), { dx: 10, dy: 20 });
});

// ---- buildDragSession ----

// Stub canvas shaped like RPCanvas for the fields buildDragSession reads.
// Component 'comp': a (root) ← b ← {c (explicit x/y), d}; plus an imported ref.
function stubCanvas() {
    return {
        components: {
            comp: {
                content: {
                    a: { shape: 'box' },
                    b: { shape: 'box', previous: 'a', position: 'below' },
                    c: { shape: 'box', previous: 'b', x: 5, y: 7 },
                    d: { shape: 'box', previous: 'b' },
                    imp: { component: 'other' },
                },
            },
        },
        store: {
            views: {
                [EDITING_VIEW]: {
                    content: {
                        comp_a: { shape: 'box' },
                        comp_b: { shape: 'box', previous: 'comp_a', position: 'below' },
                        comp_c: { shape: 'box', previous: 'comp_b', x: 5, y: 7 },
                        comp_d: { shape: 'box', previous: 'comp_b' },
                    },
                },
            },
        },
        layouts: {
            [EDITING_VIEW]: {
                comp_a: { x: 0, y: 0, width: 100, height: 50 },
                comp_b: { x: 0, y: 75, width: 100, height: 50 },
                comp_c: { x: 5, y: 82, width: 100, height: 50 },
                comp_d: { x: 125, y: 75, width: 100, height: 50 },
            },
        },
    };
}

test('buildDragSession: materializes the effective offset from cached layouts', () => {
    const session = buildDragSession(stubCanvas(), 'comp', 'comp_b');
    assert.equal(session.key, 'b');
    assert.equal(session.renderedId, 'comp_b');
    // b has no explicit x/y (position keyword only) — base comes from layout
    // minus predecessor layout, so the drag starts without a jump.
    assert.deepEqual(session.base, { x: 0, y: 75 });
});

test('buildDragSession: root item with no previous gets absolute offsets', () => {
    const session = buildDragSession(stubCanvas(), 'comp', 'comp_a');
    assert.deepEqual(session.base, { x: 0, y: 0 });
    // a's only direct child is b.
    assert.deepEqual(session.children.map(c => c.key), ['b']);
});

test('buildDragSession: collects direct children with relative offsets and authored origins', () => {
    const session = buildDragSession(stubCanvas(), 'comp', 'comp_b');
    assert.deepEqual(session.children, [
        { key: 'c', renderedId: 'comp_c', x: 5, y: 7, origX: 5, origY: 7 },
        { key: 'd', renderedId: 'comp_d', x: 125, y: 0, origX: null, origY: null },
    ]);
});

test('buildDragSession: rejects imported refs, unknown ids, and uncached layouts', () => {
    const canvas = stubCanvas();
    assert.equal(buildDragSession(canvas, 'comp', 'comp_imp'), null);
    assert.equal(buildDragSession(canvas, 'comp', 'comp_ghost'), null);
    assert.equal(buildDragSession(canvas, 'comp', 'other_a'), null);
    delete canvas.layouts[EDITING_VIEW].comp_b;
    assert.equal(buildDragSession(canvas, 'comp', 'comp_b'), null);
});

// ---- computeDragPatches ----

const session = () => buildDragSession(stubCanvas(), 'comp', 'comp_b');

test('preview, plain drag: dragged item moves; children reset to authored offsets', () => {
    const patches = computeDragPatches(session(), 10.5, -20, {});
    assert.deepEqual(patches, {
        comp_b: { x: 10.5, y: 55 },
        comp_c: { x: 5, y: 7 },
        comp_d: { x: null, y: null }, // never authored — null deletes the preview keys
    });
});

test('preview, shift drag: children counter-offset by the inverse delta', () => {
    const patches = computeDragPatches(session(), 10, -20, { solo: true });
    assert.deepEqual(patches, {
        comp_b: { x: 10, y: 55 },
        comp_c: { x: -5, y: 27 },
        comp_d: { x: 115, y: 20 },
    });
});

test('commit, plain drag: def keys, rounded, children untouched', () => {
    const patches = computeDragPatches(session(), 10.4, -20.6, { forCommit: true });
    assert.deepEqual(patches, { b: { x: 10, y: 54 } });
});

test('commit, shift drag: children compensated under def keys, all rounded', () => {
    const patches = computeDragPatches(session(), 10, -20, { solo: true, forCommit: true });
    assert.deepEqual(patches, {
        b: { x: 10, y: 55 },
        c: { x: -5, y: 27 },
        d: { x: 115, y: 20 },
    });
});

// ---- end-to-end through real layout math ----

const DEFAULTS = { SHAPE: { width: 100, height: 50, separation: 25 } };

function layoutChain(content) {
    const layouts = {};
    for (const [id, item] of Object.entries(content)) {
        layouts[id] = computeItemLayout(item, item.previous ? layouts[item.previous] : null, DEFAULTS);
    }
    return layouts;
}

function applyCommit(content, patches) {
    const next = JSON.parse(JSON.stringify(content));
    for (const [key, patch] of Object.entries(patches)) {
        for (const [k, v] of Object.entries(patch)) {
            if (v === null) delete next[key][k];
            else next[key][k] = v;
        }
    }
    return next;
}

test('plain drop: dragged element and its whole descendant chain move by the delta', () => {
    const content = {
        a: { shape: 'box' },
        b: { shape: 'box', previous: 'a', position: 'below' },
        c: { shape: 'box', previous: 'b' },
    };
    const before = layoutChain(content);
    const canvas = {
        components: { comp: { content } },
        store: { views: { [EDITING_VIEW]: { content: { comp_a: content.a, comp_b: content.b, comp_c: content.c } } } },
        layouts: { [EDITING_VIEW]: { comp_a: before.a, comp_b: before.b, comp_c: before.c } },
    };
    // Fix up resolved-view previous refs to the flattened ids.
    canvas.store.views[EDITING_VIEW].content.comp_b = { ...content.b, previous: 'comp_a' };
    canvas.store.views[EDITING_VIEW].content.comp_c = { ...content.c, previous: 'comp_b' };

    const s = buildDragSession(canvas, 'comp', 'comp_b');
    const after = layoutChain(applyCommit(content, computeDragPatches(s, 40, -10, { forCommit: true })));

    assert.deepEqual([after.b.x - before.b.x, after.b.y - before.b.y], [40, -10]);
    assert.deepEqual([after.c.x - before.c.x, after.c.y - before.c.y], [40, -10]);
    assert.deepEqual([after.a.x, after.a.y], [before.a.x, before.a.y]);
});

test('shift drop: dragged element moves, descendants hold their absolute positions', () => {
    const content = {
        a: { shape: 'box' },
        b: { shape: 'box', previous: 'a', position: 'below' },
        c: { shape: 'box', previous: 'b' },
        d: { shape: 'box', previous: 'c' },
    };
    const before = layoutChain(content);
    const canvas = {
        components: { comp: { content } },
        store: {
            views: {
                [EDITING_VIEW]: {
                    content: {
                        comp_a: content.a,
                        comp_b: { ...content.b, previous: 'comp_a' },
                        comp_c: { ...content.c, previous: 'comp_b' },
                        comp_d: { ...content.d, previous: 'comp_c' },
                    },
                },
            },
        },
        layouts: { [EDITING_VIEW]: { comp_a: before.a, comp_b: before.b, comp_c: before.c, comp_d: before.d } },
    };

    const s = buildDragSession(canvas, 'comp', 'comp_b');
    const after = layoutChain(applyCommit(content, computeDragPatches(s, 40, -10, { solo: true, forCommit: true })));

    assert.deepEqual([after.b.x - before.b.x, after.b.y - before.b.y], [40, -10]);
    // Only the direct child c is compensated; d follows c and therefore also stays put.
    assert.deepEqual([after.c.x, after.c.y], [before.c.x, before.c.y]);
    assert.deepEqual([after.d.x, after.d.y], [before.d.x, before.d.y]);
});

// ===== imported component references (anchor-point drag) =====

import { buildImportedDragSession, buildPointItem } from '../sidebarMenu/componentEditor/drag.js';
import { patchItems, insertItemBefore } from '../sidebarMenu/componentEditor/mutations.js';
import { componentEditState } from '../utils/state.js';
import { parseComponentView } from '@alexguha/rplib/parser';

// Resolve a component into the same flattened view the editing view uses,
// via the real parser (so the ref-tail anchoring and head-stitch behavior
// under test are the production ones, not a hand-written approximation).
function resolveView(components, name) {
    const store = {
        abstractDefinitions: {},
        views: {},
        rootViews: new Set(),
        reporter: { error: () => { }, warn: () => { } },
    };
    return parseComponentView(store, components, name, DEFAULTS);
}

function makeImportedCanvas(components, name) {
    const view = resolveView(components, name);
    return {
        components,
        defaults: DEFAULTS,
        store: { views: { [EDITING_VIEW]: view } },
        layouts: { [EDITING_VIEW]: layoutChain(view.content) },
    };
}

// comp imports `other` between two native items; b chains to the ref's tail.
function importedFixture() {
    return {
        other: {
            content: {
                x: { shape: 'box' },
                y: { shape: 'box', previous: 'x' },
            },
        },
        comp: {
            content: {
                a: { shape: 'box' },
                imp: { component: 'other' },
                b: { shape: 'box', previous: 'imp' },
            },
        },
    };
}

// Drive the same commit path the drop uses, against a stub manager whose
// updateComponent applies the content patch directly.
function makeManager(components, name) {
    componentEditState.name = name;
    return {
        canvas: {
            components,
            updateComponent: (n, patch) => { components[n].content = patch.content; },
        },
    };
}

test('buildImportedDragSession: no anchor yet → create-point session from the group head', () => {
    const canvas = makeImportedCanvas(importedFixture(), 'comp');
    // Click anywhere in the group — here the tail shape.
    const s = buildImportedDragSession(canvas, 'comp', 'other_y');
    assert.equal(s.mode, 'create-point');
    assert.equal(s.refKey, 'imp');
    assert.equal(s.prevDefKey, 'a');
    assert.equal(s.pointKey, 'imp_point');
    assert.equal(s.renderedId, 'other_x'); // previews drag the group head
    // head = a.right → offset (sep + width, 0) = (125, 0)
    assert.deepEqual(s.base, { x: 125, y: 0 });
    // offset from a zero-size point: (sep, 0)
    assert.deepEqual(s.headOffset, { x: 25, y: 0 });
    // b chains to the ref's unrolled tail → collected for shift compensation
    assert.deepEqual(s.children.map(c => c.key), ['b']);
    assert.deepEqual([s.children[0].x, s.children[0].y], [125, 0]);
});

test('buildImportedDragSession: returns null for native ids and unknown groups', () => {
    const canvas = makeImportedCanvas(importedFixture(), 'comp');
    assert.equal(buildImportedDragSession(canvas, 'comp', 'comp_a'), null);
    assert.equal(buildImportedDragSession(canvas, 'comp', 'zzz_thing'), null);
});

test('create-point drop: inserts a zero-size anchor; group moves by the delta, follower comes along', () => {
    const components = importedFixture();
    const canvas = makeImportedCanvas(components, 'comp');
    const before = canvas.layouts[EDITING_VIEW];
    const s = buildImportedDragSession(canvas, 'comp', 'other_x');

    const manager = makeManager(components, 'comp');
    insertItemBefore(manager, s.refKey, s.pointKey, buildPointItem(s, 40, -10), {});
    componentEditState.name = null;

    assert.deepEqual(Object.keys(components.comp.content), ['a', 'imp_point', 'imp', 'b']);
    assert.deepEqual(components.comp.content.imp_point,
        { shape: 'box', width: 0, height: 0, x: 140, y: -10, previous: 'a' });

    const after = layoutChain(resolveView(components, 'comp').content);
    // Whole group translated by exactly the drag delta…
    for (const id of ['other_x', 'other_y']) {
        assert.deepEqual([after[id].x - before[id].x, after[id].y - before[id].y], [40, -10]);
    }
    // …and the chained follower comes along (plain drag).
    assert.deepEqual([after.comp_b.x - before.comp_b.x, after.comp_b.y - before.comp_b.y], [40, -10]);
    // The anchor is itself invisible (zero-size) and a stays put.
    assert.deepEqual([after.comp_a.x, after.comp_a.y], [before.comp_a.x, before.comp_a.y]);
});

test('create-point shift drop: group moves, follower holds its absolute position', () => {
    const components = importedFixture();
    const canvas = makeImportedCanvas(components, 'comp');
    const before = canvas.layouts[EDITING_VIEW];
    const s = buildImportedDragSession(canvas, 'comp', 'other_x');

    const childPatches = {};
    for (const child of s.children) {
        childPatches[child.key] = { x: Math.round(child.x - 40), y: Math.round(child.y - -10) };
    }
    const manager = makeManager(components, 'comp');
    insertItemBefore(manager, s.refKey, s.pointKey, buildPointItem(s, 40, -10), childPatches);
    componentEditState.name = null;

    const after = layoutChain(resolveView(components, 'comp').content);
    assert.deepEqual([after.other_x.x - before.other_x.x, after.other_x.y - before.other_x.y], [40, -10]);
    assert.deepEqual([after.comp_b.x, after.comp_b.y], [before.comp_b.x, before.comp_b.y]);
});

test('existing anchor: second drag finds the point and moves it like a native item', () => {
    const components = importedFixture();
    // First drop creates the anchor.
    {
        const canvas = makeImportedCanvas(components, 'comp');
        const s = buildImportedDragSession(canvas, 'comp', 'other_x');
        const manager = makeManager(components, 'comp');
        insertItemBefore(manager, s.refKey, s.pointKey, buildPointItem(s, 40, -10), {});
    }

    const canvas = makeImportedCanvas(components, 'comp');
    const before = canvas.layouts[EDITING_VIEW];
    const s = buildImportedDragSession(canvas, 'comp', 'other_y');
    assert.equal(s.mode, 'point');
    assert.equal(s.key, 'imp_point');
    assert.equal(s.renderedId, 'comp_imp_point');
    assert.deepEqual(s.base, { x: 140, y: -10 });
    assert.deepEqual(s.children.map(c => c.key), ['b']);

    const manager = makeManager(components, 'comp');
    patchItems(manager, computeDragPatches(s, 10, 5, { forCommit: true }));
    componentEditState.name = null;

    assert.equal(components.comp.content.imp_point.x, 150);
    assert.equal(components.comp.content.imp_point.y, -5);
    const after = layoutChain(resolveView(components, 'comp').content);
    assert.deepEqual([after.other_x.x - before.other_x.x, after.other_x.y - before.other_x.y], [10, 5]);
    assert.deepEqual([after.comp_b.x - before.comp_b.x, after.comp_b.y - before.comp_b.y], [10, 5]);
});

test('create-point drop when the ref is the first item: absolute anchor, no previous', () => {
    const components = {
        other: { content: { x: { shape: 'box' } } },
        comp: {
            content: {
                imp: { component: 'other' },
                b: { shape: 'box', previous: 'imp' },
            },
        },
    };
    const canvas = makeImportedCanvas(components, 'comp');
    const before = canvas.layouts[EDITING_VIEW];
    // Head had no previous (first item of the view) → offsets are absolute.
    const s = buildImportedDragSession(canvas, 'comp', 'other_x');
    assert.equal(s.prevDefKey, null);
    assert.deepEqual(s.base, { x: 0, y: 0 });

    const manager = makeManager(components, 'comp');
    insertItemBefore(manager, s.refKey, s.pointKey, buildPointItem(s, 30, 20), {});
    componentEditState.name = null;

    assert.equal(components.comp.content.imp_point.previous, undefined);
    const after = layoutChain(resolveView(components, 'comp').content);
    assert.deepEqual([after.other_x.x - before.other_x.x, after.other_x.y - before.other_x.y], [30, 20]);
});
