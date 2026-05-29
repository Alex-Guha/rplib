import { SHAPE } from '../../defaults.js';
import { parseDimensionToken } from '@alexguha/rplib/parser';

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

// Numeric field that accepts either a raw number or a dimension token string
// (see rplib's "Dimension values" grammar: "2h", "0.25w", "h + s + w/4", etc.).
// Bare numeric input commits as a number; symbolic input commits as the raw
// string so re-renders preserve the symbolic form. The parser-side resolver
// converts tokens to numbers at parse time.
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
    input.addEventListener('change', () => {
        const raw = input.value.trim();
        if (raw === '') return onCommit(null);
        const n = Number(raw);
        if (!isNaN(n)) {
            onCommit(n);
            return;
        }
        const resolved = parseDimensionToken(raw, SHAPE);
        if (typeof resolved !== 'number') return; // unparsable — keep the field for the user to fix
        onCommit(raw);
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
