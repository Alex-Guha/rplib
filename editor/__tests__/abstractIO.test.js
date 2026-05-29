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

test('parseComponentsModule: JSON object with top-level component keys', () => {
    const text = JSON.stringify({
        foo: { content: { box: { shape: 'box', width: '2w' } } },
        bar: { content: { box: { shape: 'triangle' } } },
    });
    const out = parseComponentsModule(text);
    assert.deepEqual(Object.keys(out), ['foo', 'bar']);
    assert.equal(out.foo.content.box.width, '2w');
    assert.equal(out.bar.content.box.shape, 'triangle');
});

test('parseComponentsModule: JSON-shaped non-object falls through', () => {
    assert.deepEqual(parseComponentsModule('[1,2,3]'), {});
});

test('serializeComponentsExport: JSON-safe map exports as .json and round-trips', async () => {
    const { serializeComponentsExport, parseComponentsModule: parse } = await import('../utils/abstractIO.js');
    const map = {
        foo: { content: { box: { shape: 'box', width: '2w', n: 3 } } },
        bar: { content: { box: { shape: 'triangle' } } },
    };
    const { text, ext, mime } = serializeComponentsExport(map);
    assert.equal(ext, 'json');
    assert.equal(mime, 'application/json');
    assert.deepEqual(parse(text), map);
});

test('serializeComponentsExport: map with non-JSON-safe value falls back to .js', async () => {
    const { serializeComponentsExport, parseComponentsModule: parse } = await import('../utils/abstractIO.js');
    const map = { foo: { content: { box: { shape: 'box', cb: () => 1 } } } };
    const { text, ext } = serializeComponentsExport(map);
    assert.equal(ext, 'js');
    // .js parse path strips the function (JSON.stringify dropped it) but keeps the rest.
    assert.equal(parse(text).foo.content.box.shape, 'box');
});
