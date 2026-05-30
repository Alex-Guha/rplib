import test from 'node:test';
import assert from 'node:assert/strict';

import renderElements from '../renderView.js';

// Tests for the partial-redraw path. We exercise `renderElements` directly with
// a fully stubbed canvas — no d3, no DOM. The interesting properties are:
//  - which ids the draw callbacks are invoked for
//  - which selectors are issued to remove pre-existing DOM
//  - that clearCanvas is NOT called when onlyIds is supplied (caller's job)

function makeStubCanvas(viewName, content) {
    const removed = [];
    const drawn = [];
    const canvasDOM = {
        selectAll(selector) {
            return { remove() { removed.push(selector); return this; } };
        },
    };
    const self = {
        store: {
            currentView: viewName,
            views: { [viewName]: { content } },
            reporter: { warn: () => { }, error: () => { } },
        },
        layouts: {},
        defaults: { SHAPE: { width: 100, height: 50 }, ARROW: {} },
        renderDelay: false,
        currentRenderToken: null,
        canvasDOM,
        reporter: { warn: () => { }, error: () => { } },
        drawSubcomponent: (item, layout, id) => drawn.push({ kind: 'shape', id }),
        drawConnection: (arrow, prevItem, prevLayout, item, layout, cb, id) =>
            drawn.push({ kind: 'arrow', id }),
        drawText: (textObj, item, layout, cb, id, pinTargetId) => drawn.push({ kind: 'text', id }),
    };
    return { self, drawn, removed };
}

test('full redraw (no onlyIds): draws every item, issues no removal selectors', () => {
    const { self, drawn, removed } = makeStubCanvas('v', {
        A: { shape: 'box' },
        B: { shape: 'box', previous: 'A' },
    });
    renderElements(self);
    assert.deepEqual(drawn.map(d => d.id), ['A', 'B']);
    assert.deepEqual(removed, []);
});

test('partial redraw: only redraws ids in the set, removes their DOM first', () => {
    const { self, drawn, removed } = makeStubCanvas('v', {
        A: { shape: 'box' },
        B: { shape: 'box' },
        C: { shape: 'box' },
    });
    renderElements(self, null, { onlyIds: ['B'] });
    assert.deepEqual(drawn.map(d => d.id), ['B']);
    // Removal selector targets B and any of its derived children.
    assert.equal(removed.length, 1);
    assert.match(removed[0], /\[id="B"\]/);
    assert.match(removed[0], /\[id\^="B\."\]/);
});

test('partial redraw: expands set with descendants chained via previous', () => {
    const { self, drawn, removed } = makeStubCanvas('v', {
        A: { shape: 'box' },
        B: { shape: 'box', previous: 'A' },
        C: { shape: 'box', previous: 'B' },
        D: { shape: 'box' },  // independent
    });
    renderElements(self, null, { onlyIds: ['A'] });
    // A, B, C must all redraw because B and C anchor to A's chain.
    assert.deepEqual(drawn.map(d => d.id).sort(), ['A', 'B', 'C']);
    assert.equal(drawn.find(d => d.id === 'D'), undefined);
    assert.equal(removed.length, 3);
});

test('partial redraw: removed-but-missing id still triggers DOM cleanup, nothing to draw', () => {
    // Simulate post-removeItem state: changedIds = ['B'] but content no longer has B.
    const { self, drawn, removed } = makeStubCanvas('v', {
        A: { shape: 'box' },
        C: { shape: 'box' },
    });
    renderElements(self, null, { onlyIds: ['B'] });
    assert.deepEqual(drawn, []);
    assert.equal(removed.length, 1);
    assert.match(removed[0], /\[id="B"\]/);
});

test('partial redraw: removal selector escapes embedded quotes safely', () => {
    const { self, drawn, removed } = makeStubCanvas('v', {
        'A"B': { shape: 'box' },
    });
    renderElements(self, null, { onlyIds: ['A"B'] });
    assert.match(removed[0], /\[id="A\\"B"\]/);
});

test('partial redraw: arrow children of redrawn items also flushed via prefix selector', () => {
    // Items render their own arrows with ids like `${id}.arrow_N`. The selector
    // `[id^="A."]` covers those — we verify it's emitted, not the d3 chain itself.
    const { self, drawn, removed } = makeStubCanvas('v', {
        A: { shape: 'box', arrow: { previous: 'A' } },
    });
    renderElements(self, null, { onlyIds: ['A'] });
    assert.match(removed[0], /\[id\^="A\."\]/);
});
