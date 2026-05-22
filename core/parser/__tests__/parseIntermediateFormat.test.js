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
