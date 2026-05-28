import test from 'node:test';
import assert from 'node:assert/strict';

import { analyzeLine, scanDocument, overrideSlotsFor } from '../sidebarMenu/abstractEditor/dslScan.js';

test('analyzeLine: blank line → null', () => {
    assert.equal(analyzeLine(''), null);
    assert.equal(analyzeLine('   '), null);
});

test('analyzeLine: arch header at zero indent', () => {
    const rec = analyzeLine('MyArch:');
    assert.equal(rec.kind, 'archHeader');
    assert.equal(rec.name, 'MyArch');
    assert.deepEqual(rec.nameRange, [0, 6]);
});

test('analyzeLine: component header (indented)', () => {
    const rec = analyzeLine('    block:');
    assert.equal(rec.kind, 'componentHeader');
    assert.equal(rec.name, 'block');
    assert.equal(rec.indent, 4);
});

test('analyzeLine: section keyword', () => {
    const rec = analyzeLine('  properties:');
    assert.equal(rec.kind, 'section');
    assert.equal(rec.keyword, 'properties');
});

test('analyzeLine: override (className: componentName)', () => {
    const rec = analyzeLine('    inner: block');
    assert.equal(rec.kind, 'override');
    assert.equal(rec.className, 'inner');
    assert.equal(rec.componentName, 'block');
});

test('analyzeLine: keyValue (property assignment)', () => {
    const rec = analyzeLine('    title: hello world');
    assert.equal(rec.kind, 'keyValue');
    assert.equal(rec.key, 'title');
    assert.equal(rec.value, 'hello world');
});

test('analyzeLine: bareRef (single token)', () => {
    const rec = analyzeLine('  block');
    assert.equal(rec.kind, 'bareRef');
    assert.equal(rec.name, 'block');
});

test('scanDocument: assigns parent based on indent stack', () => {
    const lines = [
        'Arch:',
        '    outer:',
        '        inner: block',
    ];
    const records = scanDocument(lines);
    assert.equal(records[0].kind, 'archHeader');
    assert.equal(records[1].kind, 'componentHeader');
    assert.equal(records[2].kind, 'override');
    assert.equal(records[2].parent, 'outer', 'override sees containing componentHeader as parent');
});

test('scanDocument: section name flows down via inSection', () => {
    // Use a multi-word value so analyzeLine classifies as `keyValue` rather
    // than `override` — the override regex bites single-word values.
    const lines = [
        'Arch:',
        '    properties:',
        '        title: hello world',
    ];
    const records = scanDocument(lines);
    assert.equal(records[2].kind, 'keyValue');
    assert.equal(records[2].inSection, 'properties');
});

test('overrideSlotsFor: collects {class → defaultComponent} entries', () => {
    const components = {
        wrapper: {
            content: {
                a: { shape: 'box' },
                b: { class: 'slotA', component: 'defaultA' },
                c: { class: 'slotB', component: 'defaultB' },
            },
        },
    };
    const slots = overrideSlotsFor(components, 'wrapper');
    assert.equal(slots.size, 2);
    assert.equal(slots.get('slotA'), 'defaultA');
    assert.equal(slots.get('slotB'), 'defaultB');
});

test('overrideSlotsFor: unknown component → empty map', () => {
    assert.equal(overrideSlotsFor({}, 'missing').size, 0);
});
