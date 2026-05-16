import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { parseAbstractContent } from '../parseAbstractFile.js';
import serializeAbstractDefinition from '../serializeAbstractFormat.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, 'fixtures');

test('parses a minimal definition', () => {
    const text = [
        'demo:',
        '    properties:',
        '        modelName: GPT-4',
        '    foo',
        '    bar',
    ].join('\n');
    const parsed = parseAbstractContent(text);
    assert.deepEqual(Object.keys(parsed), ['demo']);
    assert.equal(parsed.demo.properties.modelName, 'GPT-4');
    assert.deepEqual(Object.keys(parsed.demo.content), ['foo', 'bar']);
});

test('throws on empty input', () => {
    assert.throws(() => parseAbstractContent(''), /Empty/);
});

test('first-item type inference: object section detected when colon appears later', () => {
    // The bug we fixed: previously the first colon-less child made the whole
    // section an array, even if later siblings were `key: value` pairs.
    const text = [
        'demo:',
        '    generics:',
        '        references:',
        '            plain_item',
        '            keyed: value',
    ].join('\n');
    const parsed = parseAbstractContent(text);
    // `generics:` sections merge into the definition root; the title `references` lands directly on `demo`.
    const refs = parsed.demo.references;
    // Should be an object because "keyed: value" exists at the same indent
    assert.equal(typeof refs, 'object');
    assert.equal(Array.isArray(refs), false);
});

test('round-trips: parse → serialize → parse is stable', async () => {
    const text = await readFile(join(FIXTURES, 'architectures.txt'), 'utf8');
    const first = parseAbstractContent(text);

    for (const [name, structure] of Object.entries(first)) {
        const serialized = serializeAbstractDefinition(name, structure);
        const reparsed = parseAbstractContent(serialized);
        assert.deepEqual(
            reparsed[name],
            structure,
            `Round-trip mismatch for definition "${name}"`,
        );
    }
});
