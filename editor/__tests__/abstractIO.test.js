import test from 'node:test';
import assert from 'node:assert/strict';

import { parseComponentsModule } from '../utils/abstractIO.js';

test('parseComponentsModule: parses a single JSON-shaped component export', () => {
    const text = `export const widget = {
  "content": {
    "a": { "shape": "box" }
  }
};
`;
    const out = parseComponentsModule(text);
    assert.deepEqual(out, { widget: { content: { a: { shape: 'box' } } } });
});

test('parseComponentsModule: parses multiple exports', () => {
    const text = `
export const one = { "content": {} };

export const two = { "content": { "x": { "shape": "box" } } };
`;
    const out = parseComponentsModule(text);
    assert.deepEqual(Object.keys(out), ['one', 'two']);
    assert.deepEqual(out.two, { content: { x: { shape: 'box' } } });
});

test('parseComponentsModule: skips malformed entries without throwing', () => {
    const text = `
export const good = { "content": {} };
export const bad = { not json at all };
`;
    const out = parseComponentsModule(text);
    assert.ok('good' in out);
    assert.equal(out.bad, undefined);
});

test('parseComponentsModule: empty text → empty object', () => {
    assert.deepEqual(parseComponentsModule(''), {});
});
