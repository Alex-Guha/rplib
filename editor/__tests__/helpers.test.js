import test from 'node:test';
import assert from 'node:assert/strict';

import {
    normalizeArray,
    removeKey,
    uniqueContentKey,
    uniqueComponentName,
    validateItemId,
    validateComponentName,
    makeEntryUpdater,
} from '../sidebarMenu/componentEditor/helpers.js';
import { componentEditState } from '../utils/state.js';

// helpers.js's componentEditState-aware functions (validateComponentName,
// uniqueComponentName, detailsOptions) read the active component name from
// the module-level state singleton. Tests reset it where it matters.

test('normalizeArray: array → array; scalar → wrapped; falsy → empty', () => {
    assert.deepEqual(normalizeArray([1, 2]), [1, 2]);
    assert.deepEqual(normalizeArray('x'), ['x']);
    assert.deepEqual(normalizeArray(null), []);
    assert.deepEqual(normalizeArray(undefined), []);
    assert.deepEqual(normalizeArray(''), []);
});

test('removeKey: returns a new object without the key, preserving order', () => {
    const obj = { a: 1, b: 2, c: 3 };
    const next = removeKey(obj, 'b');
    assert.deepEqual(next, { a: 1, c: 3 });
    assert.deepEqual(obj, { a: 1, b: 2, c: 3 }, 'original is not mutated');
});

test('uniqueContentKey: returns base when free; suffixes with _<n> otherwise', () => {
    assert.equal(uniqueContentKey({}, 'item'), 'item');
    assert.equal(uniqueContentKey({ item: {} }, 'item'), 'item_1');
    assert.equal(uniqueContentKey({ item: {}, item_1: {} }, 'item'), 'item_2');
});

test('uniqueComponentName: never appends a _<digit> suffix (parser strips those)', () => {
    const manager = { canvas: { components: { foo: {} } } };
    assert.equal(uniqueComponentName(manager, 'bar'), 'bar');
    assert.equal(uniqueComponentName(manager, 'foo'), 'foo_a');
    const manager2 = { canvas: { components: { foo: {}, foo_a: {} } } };
    assert.equal(uniqueComponentName(manager2, 'foo'), 'foo_b');
});

test('validateItemId: rejects empty, _<digit> suffixes, and collisions', () => {
    const def = { content: { existing: {} } };
    assert.match(validateItemId('', 'old', def), /empty/i);
    assert.match(validateItemId('foo_1', 'old', def), /reserved/i);
    assert.match(validateItemId('existing', 'other', def), /already exists/i);
    assert.equal(validateItemId('existing', 'existing', def), null, 'noop rename');
    assert.equal(validateItemId('fresh', 'old', def), null);
});

test('validateComponentName: rejects empty, _<digit> suffixes, and collisions', () => {
    componentEditState.name = 'current';
    const manager = { canvas: { components: { taken: {} } } };
    assert.match(validateComponentName(manager, ''), /empty/i);
    assert.match(validateComponentName(manager, 'foo_1'), /reserved/i);
    assert.match(validateComponentName(manager, 'taken'), /already exists/i);
    assert.equal(validateComponentName(manager, 'current'), null);
    assert.equal(validateComponentName(manager, 'fresh'), null);
    componentEditState.name = null;
});

test('makeEntryUpdater: delete on empty value, transform on non-empty', () => {
    const entries = [{ a: 1 }, { a: 2 }];
    let captured = null;
    const update = makeEntryUpdater(entries, 1, entries[1], (next) => { captured = next; });

    update('a', '');
    assert.deepEqual(captured, [{ a: 1 }, {}]);

    update('a', 5);
    assert.deepEqual(captured, [{ a: 1 }, { a: 5 }]);

    update('b', 'x', { transform: (v) => v.toUpperCase() });
    assert.deepEqual(captured, [{ a: 1 }, { a: 2, b: 'X' }]);
});
