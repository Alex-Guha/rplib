import test from 'node:test';
import assert from 'node:assert/strict';

import { parseDimensionToken, resolveItemDimensions } from '../parser/resolveDimensions.js';

const SHAPE = { width: 100, height: 200, separation: 150 };

test('parseDimensionToken: passes numbers through', () => {
    assert.equal(parseDimensionToken(42, SHAPE), 42);
    assert.equal(parseDimensionToken(-3.5, SHAPE), -3.5);
});

test('parseDimensionToken: bare numeric strings resolve to numbers', () => {
    assert.equal(parseDimensionToken('100', SHAPE), 100);
    assert.equal(parseDimensionToken('0.5', SHAPE), 0.5);
});

test('parseDimensionToken: implicit multiplication', () => {
    assert.equal(parseDimensionToken('2h', SHAPE), 400);
    assert.equal(parseDimensionToken('0.25w', SHAPE), 25);
    assert.equal(parseDimensionToken('2 h', SHAPE), 400);
});

test('parseDimensionToken: ident aliases', () => {
    assert.equal(parseDimensionToken('y', SHAPE), 200);
    assert.equal(parseDimensionToken('x', SHAPE), 100);
    assert.equal(parseDimensionToken('s', SHAPE), 150);
});

test('parseDimensionToken: unary minus', () => {
    assert.equal(parseDimensionToken('-w/8', SHAPE), -12.5);
    assert.equal(parseDimensionToken('-2h', SHAPE), -400);
});

test('parseDimensionToken: parentheses and precedence', () => {
    assert.equal(parseDimensionToken('(h + s) / 2', SHAPE), 175);
    assert.equal(parseDimensionToken('h + s / 2', SHAPE), 275);
});

test('parseDimensionToken: compound expression', () => {
    assert.equal(parseDimensionToken('h + s + w/4', SHAPE), 375);
    assert.equal(parseDimensionToken('w * 2 + s', SHAPE), 350);
});

test('parseDimensionToken: malformed and non-token strings pass through', () => {
    assert.equal(parseDimensionToken('center', SHAPE), 'center');
    assert.equal(parseDimensionToken('top-left', SHAPE), 'top-left');
    assert.equal(parseDimensionToken('$Latex$', SHAPE), '$Latex$');
    assert.equal(parseDimensionToken('#00ffff', SHAPE), '#00ffff');
    assert.equal(parseDimensionToken('h +', SHAPE), 'h +');
    assert.equal(parseDimensionToken('(h', SHAPE), '(h');
    assert.equal(parseDimensionToken('', SHAPE), '');
});

test('parseDimensionToken: missing shape value yields pass-through', () => {
    assert.equal(parseDimensionToken('w', {}), 'w');
});

test('resolveItemDimensions: rewrites string dimensions in place', () => {
    const item = {
        width: '2h',
        height: 'h',
        x: 50,
        text: { text: 'Box', xOffset: '-w/8', position: 'center' },
        arrow: [
            { extraLength: 'h + s + w/4' },
            { segments: [{ direction: 'up', extraLength: 'w/4' }] },
        ],
        color: '#00ffff',
    };
    resolveItemDimensions(item, SHAPE);
    assert.equal(item.width, 400);
    assert.equal(item.height, 200);
    assert.equal(item.x, 50);
    assert.equal(item.text.xOffset, -12.5);
    assert.equal(item.text.text, 'Box');
    assert.equal(item.text.position, 'center');
    assert.equal(item.arrow[0].extraLength, 375);
    assert.equal(item.arrow[1].segments[0].extraLength, 25);
    assert.equal(item.color, '#00ffff');
});
