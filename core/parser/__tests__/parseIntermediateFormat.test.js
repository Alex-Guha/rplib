import test from 'node:test';
import assert from 'node:assert/strict';

import { parseAbstractDefinition, parseComponentView } from '../parseIntermediateFormat.js';
import { clearViewStructures } from '../viewStructures.js';

function makeStore(abstractDefinitions = {}) {
    return {
        abstractDefinitions,
        views: {},
        rootViews: new Set(),
        currentView: null,
        rootView: null,
        undoHistory: [],
        redoHistory: [],
        reporter: { error: () => {}, warn: () => {} },
    };
}

test('parseAbstractDefinition: missing definition reports error and returns empty view', () => {
    const calls = [];
    const store = makeStore({});
    store.reporter = { error: (m) => calls.push(m), warn: () => {} };
    const view = parseAbstractDefinition(store, {}, 'missing');
    assert.deepEqual(view.content, {});
    assert.equal(calls.length, 1);
    assert.match(calls[0], /missing/);
});

test('parseAbstractDefinition: stitches a single component', () => {
    clearViewStructures();
    const components = {
        block: {
            content: {
                a: { shape: 'box' },
                b: { shape: 'box', previous: 'a' },
            },
        },
    };
    const abstractDefinitions = {
        demo: { content: { block: {} } },
    };
    const view = parseAbstractDefinition(makeStore(abstractDefinitions), components, 'demo');
    const ids = Object.keys(view.content);
    assert.equal(ids.length, 2);
    // Items are renamed with the component id prefix
    assert.match(ids[0], /^block_/);
    // The `previous` reference is rewritten to the new id
    assert.equal(view.content[ids[1]].previous, ids[0]);
});

test('parseAbstractDefinition: copies properties for placeholder substitution', () => {
    clearViewStructures();
    const abstractDefinitions = {
        demo: {
            properties: { modelName: 'GPT-4' },
            content: {},
        },
    };
    const view = parseAbstractDefinition(makeStore(abstractDefinitions), {}, 'demo');
    assert.equal(view.properties.modelName, 'GPT-4');
});

test('parseAbstractDefinition: forward `previous` within a component warns and leaves the ref undefined', () => {
    clearViewStructures();
    const warnings = [];
    const components = {
        block: {
            content: {
                a: { shape: 'box', previous: 'b' },
                b: { shape: 'box' },
            },
        },
    };
    const store = makeStore({ demo: { content: { block: {} } } });
    store.reporter = { error: () => {}, warn: (m) => warnings.push(m) };
    const view = parseAbstractDefinition(store, components, 'demo');
    const ids = Object.keys(view.content);
    assert.ok(warnings.some(m => /Forward previous/.test(m) && /"b"/.test(m)),
        `expected a forward-previous warning, got: ${JSON.stringify(warnings)}`);
    assert.equal(view.content[ids[0]].previous, undefined);
});

test('parseAbstractDefinition: out-of-scope `previous` warns and leaves the ref undefined', () => {
    clearViewStructures();
    const warnings = [];
    const components = {
        inner: {
            content: {
                deep: { shape: 'box' },
            },
        },
        outer: {
            content: {
                first: { shape: 'box' },
                sub: { component: 'inner' },
                after: { shape: 'box', previous: 'deep' },
            },
        },
    };
    const store = makeStore({ demo: { content: { outer: {} } } });
    store.reporter = { error: () => {}, warn: (m) => warnings.push(m) };
    const view = parseAbstractDefinition(store, components, 'demo');
    assert.ok(warnings.some(m => /Out-of-scope previous/.test(m) && /"deep"/.test(m)),
        `expected an out-of-scope-previous warning, got: ${JSON.stringify(warnings)}`);
    const afterKey = Object.keys(view.content).find(k => k.endsWith('_after'));
    assert.equal(view.content[afterKey].previous, undefined);
});

test('parseAbstractDefinition: arrow.previous rewrites and warns on miss (array form)', () => {
    clearViewStructures();
    const warnings = [];
    const components = {
        block: {
            content: {
                a: { shape: 'box' },
                b: { shape: 'box', previous: 'a', arrow: [{ previous: 'a' }, { previous: 'ghost' }] },
            },
        },
    };
    const store = makeStore({ demo: { content: { block: {} } } });
    store.reporter = { error: () => {}, warn: (m) => warnings.push(m) };
    const view = parseAbstractDefinition(store, components, 'demo');
    const ids = Object.keys(view.content);
    assert.equal(view.content[ids[1]].arrow[0].previous, ids[0]);
    assert.equal(view.content[ids[1]].arrow[1].previous, undefined);
    assert.ok(warnings.some(m => /arrow\.previous/.test(m) && /"ghost"/.test(m)),
        `expected arrow.previous warning, got: ${JSON.stringify(warnings)}`);
});

test('parseAbstractDefinition: arrow.previous rewrites (single-object form)', () => {
    clearViewStructures();
    const warnings = [];
    const components = {
        block: {
            content: {
                a: { shape: 'box' },
                b: { shape: 'box', previous: 'a', arrow: { previous: 'a' } },
            },
        },
    };
    const store = makeStore({ demo: { content: { block: {} } } });
    store.reporter = { error: () => {}, warn: (m) => warnings.push(m) };
    const view = parseAbstractDefinition(store, components, 'demo');
    const ids = Object.keys(view.content);
    assert.equal(view.content[ids[1]].arrow.previous, ids[0]);
    assert.equal(warnings.length, 0);
});

test('parseAbstractDefinition: head-stitch links subcomponent first-item to prior outer item without warns', () => {
    clearViewStructures();
    const warnings = [];
    const components = {
        inner: {
            content: { x: { shape: 'box' }, y: { shape: 'box', previous: 'x' } },
        },
        outer: {
            content: {
                first: { shape: 'box' },
                sub: { component: 'inner' },
            },
        },
    };
    const store = makeStore({ demo: { content: { outer: {} } } });
    store.reporter = { error: () => {}, warn: (m) => warnings.push(m) };
    const view = parseAbstractDefinition(store, components, 'demo');
    const ids = Object.keys(view.content);
    assert.equal(ids.length, 3);
    // first item of `inner` (index 0 in recursion, but viewDetails already has `outer_first`)
    // gets head-stitched to the prior item via L156.
    assert.equal(view.content[ids[1]].previous, ids[0]);
    // sibling within inner resolves through its local idMap.
    assert.equal(view.content[ids[2]].previous, ids[1]);
    assert.equal(warnings.length, 0);
});

test('parseComponentView: cyclical reference is reported, not infinitely recursed', () => {
    clearViewStructures();
    const calls = [];
    const components = {
        loop: { content: { x: { component: 'loop' } } },
    };
    const store = makeStore({});
    store.reporter = { error: (m) => calls.push(m), warn: () => {} };
    parseComponentView(store, components, 'loop');
    assert.ok(calls.some((m) => /Cyclical/.test(m)), 'expected cyclical-ref error');
});
