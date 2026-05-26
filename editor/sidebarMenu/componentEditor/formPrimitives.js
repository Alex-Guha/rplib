import { SHAPE } from '../../defaults.js';
import { SHAPE_FIELD_BASIS } from './constants.js';

export function fieldRow(name, type, value, onCommit) {
    const row = document.createElement('div');
    row.className = 'ce-row';
    const label = document.createElement('label');
    label.className = 'ce-label';
    label.textContent = name;
    const input = type === 'textarea' ? document.createElement('textarea') : document.createElement('input');
    if (type !== 'textarea') input.type = type;
    input.value = value;
    input.className = 'ce-input';
    input.addEventListener('change', () => onCommit(input.value));
    row.appendChild(label);
    row.appendChild(input);
    return row;
}

// Plain numeric field — text input (no spinner arrows), accepts any number.
export function plainNumberRow(name, value, onCommit) {
    const row = document.createElement('div');
    row.className = 'ce-row';
    const label = document.createElement('label');
    label.className = 'ce-label';
    label.textContent = name;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = value ?? '';
    input.className = 'ce-input';
    input.addEventListener('change', () => {
        const raw = input.value.trim();
        if (raw === '') return onCommit(null);
        const n = parseFloat(raw);
        onCommit(isNaN(n) ? null : n);
    });
    row.appendChild(label);
    row.appendChild(input);
    return row;
}

// Numeric field that hangs off a SHAPE default — accepts plain numbers plus
// "_%", "0._", and "*_" shorthand which all resolve against SHAPE[basis].
export function shapeNumberRow(name, value, onCommit) {
    const row = document.createElement('div');
    row.className = 'ce-row';
    const label = document.createElement('label');
    label.className = 'ce-label';
    label.textContent = name;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = value ?? '';
    input.className = 'ce-input';
    const basis = SHAPE_FIELD_BASIS[name];
    input.addEventListener('change', () => {
        const parsed = parseShapeNumeric(input.value, basis);
        // Reflect the canonical numeric back into the input so the next render
        // doesn't show stale shorthand alongside a committed numeric value.
        if (parsed != null) input.value = String(parsed);
        onCommit(parsed);
    });
    row.appendChild(label);
    row.appendChild(input);
    return row;
}

// Opacity entered as a percentage ("100%", "50%"). Bare numbers are also
// accepted (interpreted as 0–1 fraction) so existing data round-trips.
export function opacityRow(value, onCommit) {
    const row = document.createElement('div');
    row.className = 'ce-row';
    const label = document.createElement('label');
    label.className = 'ce-label';
    label.textContent = 'opacity';
    const input = document.createElement('input');
    input.type = 'text';
    input.value = value == null ? '' : `${Math.round(value * 100)}%`;
    input.className = 'ce-input';
    input.addEventListener('change', () => {
        const raw = input.value.trim();
        if (raw === '') return onCommit(null);
        const m = raw.match(/^(-?\d*\.?\d+)\s*%$/);
        const n = m ? parseFloat(m[1]) / 100 : parseFloat(raw);
        if (isNaN(n)) return onCommit(null);
        onCommit(n === 1 ? null : n);
    });
    row.appendChild(label);
    row.appendChild(input);
    return row;
}

export function parseShapeNumeric(raw, basis) {
    raw = String(raw).trim();
    if (raw === '') return null;
    const base = basis ? SHAPE[basis] : null;
    let m;
    if (base != null && (m = raw.match(/^(-?\d*\.?\d+)\s*%$/))) return base * parseFloat(m[1]) / 100;
    if (base != null && (m = raw.match(/^\*\s*(-?\d*\.?\d+)$/))) return base * parseFloat(m[1]);
    if (base != null && (m = raw.match(/^(-?0\.\d+)$/))) return base * parseFloat(m[1]);
    const n = parseFloat(raw);
    return isNaN(n) ? null : n;
}

// Pair two field rows side-by-side. Each child's label width shrinks so both
// fit without wrapping; the input still flex-grows in the remaining space.
export function pairRow(left, right) {
    const row = document.createElement('div');
    row.className = 'ce-row ce-pair';
    left.classList.add('ce-pair-half');
    right.classList.add('ce-pair-half');
    row.appendChild(left);
    row.appendChild(right);
    return row;
}

export function sectionSeparator(text) {
    const sep = document.createElement('div');
    sep.className = 'ce-section-sep';
    const label = document.createElement('span');
    label.textContent = text;
    sep.appendChild(label);
    return sep;
}

export function selectRow(name, options, value, onCommit, emptyLabel = '(default)') {
    const row = document.createElement('div');
    row.className = 'ce-row';
    const label = document.createElement('label');
    label.className = 'ce-label';
    label.textContent = name;
    const sel = document.createElement('select');
    for (const opt of options) {
        const o = document.createElement('option');
        o.value = opt; o.textContent = opt === '' ? emptyLabel : opt;
        if (opt === value) o.selected = true;
        sel.appendChild(o);
    }
    sel.addEventListener('change', () => onCommit(sel.value));
    row.appendChild(label);
    row.appendChild(sel);
    return row;
}

export function checkboxRow(name, checked, onCommit) {
    const row = document.createElement('div');
    row.className = 'ce-row';
    const label = document.createElement('label');
    label.className = 'ce-label';
    label.textContent = name;
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = checked;
    input.addEventListener('change', () => onCommit(input.checked));
    row.appendChild(label);
    row.appendChild(input);
    return row;
}

export function radio(name, value, checked) {
    const label = document.createElement('label');
    label.className = 'ce-radio';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = name;
    input.value = value;
    input.checked = checked;
    label.appendChild(input);
    label.appendChild(document.createTextNode(' ' + value));
    return { label, input };
}
