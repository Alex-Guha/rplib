import test from 'node:test';
import assert from 'node:assert/strict';

import { resolvePreviousPickKey } from '../sidebarMenu/componentEditor/target.js';
import { validatePreviousPick } from '../sidebarMenu/componentEditor/helpers.js';

// The interaction layer (arming the pick, cancellation on other actions) is
// exercised in the browser; these tests cover the pure click→content-key
// resolution the pick commits through.

const def = {
    content: {
        a: { shape: 'box' },
        b: { shape: 'box', previous: 'a' },
        imp: { component: 'other' },
    },
};

test('resolvePreviousPickKey: native shape resolves to its content key', () => {
    assert.equal(resolvePreviousPickKey(def, 'comp', 'comp_a'), 'a');
    assert.equal(resolvePreviousPickKey(def, 'comp', 'comp_b'), 'b');
});

test('resolvePreviousPickKey: sub-element ids resolve via their top segment', () => {
    assert.equal(resolvePreviousPickKey(def, 'comp', 'comp_b.text'), 'b');
});

test('resolvePreviousPickKey: shape inside an imported group resolves to the importer ref key', () => {
    assert.equal(resolvePreviousPickKey(def, 'comp', 'other_head'), 'imp');
    assert.equal(resolvePreviousPickKey(def, 'comp', 'other_head.text'), 'imp');
});

test('resolvePreviousPickKey: unresolvable ids return null', () => {
    assert.equal(resolvePreviousPickKey(def, 'comp', 'mystery_shape'), null);
    // A ref key is never rendered as a shape itself; if such an id shows up it
    // must not resolve as a native pick.
    assert.equal(resolvePreviousPickKey(def, 'comp', 'comp_imp'), null);
});

test('resolvePreviousPickKey: missing def/content returns null', () => {
    assert.equal(resolvePreviousPickKey(null, 'comp', 'comp_a'), null);
    assert.equal(resolvePreviousPickKey({}, 'comp', 'comp_a'), null);
});

test('validatePreviousPick: earlier siblings are legal', () => {
    assert.equal(validatePreviousPick(def, 'b', 'a'), null);
    assert.equal(validatePreviousPick(def, 'imp', 'a'), null);
    assert.equal(validatePreviousPick(def, 'imp', 'b'), null);
});

test('validatePreviousPick: forward references are rejected with a message', () => {
    assert.match(validatePreviousPick(def, 'a', 'b'), /declared after/);
    assert.match(validatePreviousPick(def, 'b', 'imp'), /declared after/);
});
