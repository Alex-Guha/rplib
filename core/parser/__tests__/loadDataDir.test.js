import test from 'node:test';
import assert from 'node:assert/strict';

import { assertNoIntegerLikeContentKeys, INTEGER_LIKE_KEY } from '../loadDataDir.js';

test('INTEGER_LIKE_KEY matches non-negative integer strings only', () => {
    for (const ok of ['0', '1', '42', '12345']) {
        assert.ok(INTEGER_LIKE_KEY.test(ok), `expected match: ${ok}`);
    }
    for (const bad of ['01', '1.0', '1a', 'a', 'a1', '-1', '', 'item_1']) {
        assert.ok(!INTEGER_LIKE_KEY.test(bad), `expected non-match: ${bad}`);
    }
});

test('assertNoIntegerLikeContentKeys: throws on integer-like keys, names offenders + source', () => {
    const bad = { content: { '1': {}, 'a': {}, '5': {} } };
    assert.throws(
        () => assertNoIntegerLikeContentKeys(bad, 'broken', 'components/bad.json'),
        /broken.*components\/bad\.json.*\[1, 5\]/s,
    );
});

test('assertNoIntegerLikeContentKeys: passes safe keys, missing content, and non-objects', () => {
    assert.doesNotThrow(() => assertNoIntegerLikeContentKeys({ content: { a: {}, b_1: {}, '01': {} } }, 'ok', 'x.json'));
    assert.doesNotThrow(() => assertNoIntegerLikeContentKeys({}, 'no-content', 'x.json'));
    assert.doesNotThrow(() => assertNoIntegerLikeContentKeys(null, 'null', 'x.json'));
});
