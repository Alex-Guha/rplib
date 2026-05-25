// Component-creation mode. The user picks "Create new component" from the edit
// menu, lands on a blank seed component, and authors it directly in the canvas
// via the rplib live-update API. The single source of truth is
// `canvas.components[name]` — every form field reads from there on render,
// every change writes through `canvas.updateComponent`.

import { appManager } from '../instance.js';
import { navigateTo } from '../core/navigation.js';
import { setSidebarState, componentEditState } from '../utils/state.js';
import {
    saveCustomComponent,
    removeCustomComponent,
    setPendingRename,
    clearPendingRename,
} from '../utils/storage.js';

const EDITING_VIEW = '__component_editor__';
const SEED_CONTENT = () => ({ box: { shape: 'box' } });
const KNOWN_SHAPES = ['box', 'triangle', 'trapezoid'];
const POSITION_OPTIONS = [
    '', 'above', 'below', 'left', 'right',
    'left-top', 'left-bottom', 'right-top', 'right-bottom',
    'above-left', 'above-right', 'below-left', 'below-right',
];
const TEXT_POSITIONS = [
    '', 'top', 'bottom', 'left', 'right', 'center',
    'top-left', 'top-right', 'bottom-left', 'bottom-right',
    'left-top', 'left-bottom', 'right-top', 'right-bottom',
];
const ARROW_DIRECTIONS = ['', 'up', 'down', 'left', 'right'];
const NUMERIC_FIELDS = ['width', 'height', 'count', 'x', 'y', 'xSpacing', 'ySpacing', 'separation'];

// === Lifecycle =================================================================

export function enterComponentMode() {
    if (componentEditState.active) return;
    const canvas = appManager.canvas;
    const name = uniqueComponentName('new_component');

    componentEditState.active = true;
    componentEditState.name = name;
    componentEditState.target = 'box';
    componentEditState.targetIsImported = false;
    componentEditState.targetElementId = `${name}_box`;
    componentEditState.previousRootView = canvas.store.rootView || '';
    componentEditState.isSeed = true;
    componentEditState.pendingRenameFrom = null;

    // Synthesize a transient abstract definition that wraps the component.
    canvas.store.abstractDefinitions[EDITING_VIEW] = {
        properties: {},
        content: { [name]: {} },
    };
    canvas.components[name] = { content: SEED_CONTENT() };

    canvas.invalidateView(EDITING_VIEW);

    // Autosave + seed-flag tracking. canvasManager has no `off` API; we guard
    // by checking componentEditState.active inside the listener, and clear
    // the closure reference on exit.
    const autosave = ({ kind }) => {
        if (!componentEditState.active) return;
        // updateComponent on the editing component flips us out of "seed" state.
        if (kind === 'updateComponent') componentEditState.isSeed = false;
        const currentName = componentEditState.name;
        // Pending-rename sweep: if an old name is lingering from a prior rename,
        // drop it now (see rename flow below).
        const pending = componentEditState.pendingRenameFrom;
        if (pending && pending !== currentName) {
            removeCustomComponent(pending, localStorage);
            componentEditState.pendingRenameFrom = null;
            clearPendingRename(localStorage);
        }
        const def = canvas.components[currentName];
        if (def) saveCustomComponent(currentName, def, localStorage);
        renderInfoPanel();
    };
    canvas.on('afterMutate', autosave);
    componentEditState.autosaveUnsubscribe = () => {
        // Listener stays registered but gates on `active` — see autosave guard above.
        componentEditState.autosaveUnsubscribe = null;
    };

    componentEditState.onElementClick = handleElementClick;

    navigateTo(EDITING_VIEW);
    // navigateTo's afterViewChange hook resets the sidebar, so apply our
    // sidebar state + render after navigation.
    setSidebarState('edit-button');
    renderInfoPanel();
    highlightTarget();
}

export function exitComponentMode() {
    if (!componentEditState.active) return;
    const canvas = appManager.canvas;

    const restoreTo = componentEditState.previousRootView;
    componentEditState.active = false;
    componentEditState.name = null;
    componentEditState.target = null;
    componentEditState.targetIsImported = false;
    componentEditState.targetElementId = null;
    componentEditState.onElementClick = null;
    if (componentEditState.autosaveUnsubscribe) componentEditState.autosaveUnsubscribe();

    delete canvas.store.abstractDefinitions[EDITING_VIEW];
    canvas.invalidateView(EDITING_VIEW);

    setSidebarState(null);
    if (restoreTo && canvas.store.abstractDefinitions[restoreTo]) {
        navigateTo(restoreTo);
    }
}

// === Element click → target selection =========================================

function handleElementClick(event) {
    const rawId = event.currentTarget.getAttribute('id');
    if (!rawId) return;
    // Items inside the resolved view are keyed off rendered ids like
    // `<componentName>_<contentKey>` (native) or `<importedName>_<contentKey>`
    // (flattened from a `component:` reference).
    //
    // NOTE: this prefix scheme duplicates the parser's id-flattening logic in
    // core/parser/parseIntermediateFormat.js (see `newItemID =
    // `${componentID}_${itemID}`` near the buildComponent recursion). If that
    // scheme changes, this detection breaks. A canvas.resolveItemOrigin(id)
    // helper on the live-update API would remove the coupling.
    const componentName = componentEditState.name;
    const rootPrefix = `${componentName}_`;
    const topSegment = rawId.split('.')[0];
    if (topSegment.startsWith(rootPrefix)) {
        const contentKey = topSegment.slice(rootPrefix.length);
        const def = appManager.canvas.components[componentName];
        if (def?.content && Object.hasOwn(def.content, contentKey) && !def.content[contentKey].component) {
            componentEditState.target = contentKey;
            componentEditState.targetIsImported = false;
            componentEditState.targetElementId = topSegment;
            renderInfoPanel();
            highlightTarget();
            return;
        }
    }
    // Imported: walk root content for a `component:` ref matching the top id prefix.
    const def = appManager.canvas.components[componentName];
    const importedComponentName = topSegment.split('_')[0];
    const importerKey = def?.content
        ? Object.entries(def.content).find(([, v]) => v?.component === importedComponentName)?.[0]
        : null;
    componentEditState.target = importerKey ?? null;
    componentEditState.targetIsImported = true;
    componentEditState.targetElementId = topSegment;
    renderInfoPanel();
    highlightTarget(importedComponentName);
}

function highlightTarget(importedGroupPrefix = null) {
    d3.selectAll('.force-hover').classed('force-hover', false);
    if (!componentEditState.targetElementId) return;
    if (importedGroupPrefix) {
        // Group highlight: all items belonging to the imported component
        d3.selectAll(`#content rect, #content polygon`).each(function () {
            const id = this.getAttribute('id');
            if (id && id.startsWith(`${importedGroupPrefix}_`)) {
                d3.select(this).classed('force-hover', true);
            }
        });
    } else {
        const el = document.getElementById(componentEditState.targetElementId);
        if (el && (el.tagName === 'rect' || el.tagName === 'polygon')) {
            d3.select(el).classed('force-hover', true);
        }
    }
}

// === UI render =================================================================

function renderInfoPanel() {
    const info = document.getElementById('info');
    info.innerHTML = '';

    const container = document.createElement('div');
    container.className = 'edit-container component-editor';

    container.appendChild(renderNameRow());
    container.appendChild(renderMetaRow());
    container.appendChild(renderForm());
    container.appendChild(renderExportRow());

    info.appendChild(container);
}

function renderNameRow() {
    const row = document.createElement('div');
    row.className = 'ce-row';

    const label = document.createElement('label');
    label.textContent = 'Name';
    label.className = 'ce-label';

    const input = document.createElement('input');
    input.type = 'text';
    input.value = componentEditState.name;
    input.className = 'ce-input';

    const commit = () => {
        const newName = input.value.trim();
        if (newName === componentEditState.name) return;
        const err = validateComponentName(newName);
        if (err) {
            window.alert(err);
            input.value = componentEditState.name;
            return;
        }
        renameComponent(componentEditState.name, newName);
    };
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    });

    row.appendChild(label);
    row.appendChild(input);
    return row;
}

function renderMetaRow() {
    const row = document.createElement('div');
    row.className = 'ce-row ce-meta';

    const importBtn = document.createElement('button');
    importBtn.textContent = componentEditState.isSeed ? 'Import component' : 'Insert component reference';
    importBtn.addEventListener('click', (e) => { e.stopPropagation(); openImportChooser(); });

    const resetBtn = document.createElement('button');
    resetBtn.textContent = 'Reset';
    resetBtn.disabled = componentEditState.isSeed;
    resetBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!window.confirm('Reset will discard the current component. Continue?')) return;
        resetToSeed();
    });

    const addItemBtn = document.createElement('button');
    addItemBtn.textContent = 'Add item after target';
    addItemBtn.disabled = !componentEditState.target || componentEditState.targetIsImported;
    addItemBtn.addEventListener('click', (e) => { e.stopPropagation(); addItemAfterTarget(); });

    const removeBtn = document.createElement('button');
    removeBtn.textContent = 'Remove target';
    const def = appManager.canvas.components[componentEditState.name];
    const contentKeys = def?.content ? Object.keys(def.content) : [];
    removeBtn.disabled = !componentEditState.target || componentEditState.targetIsImported || contentKeys.length <= 1;
    removeBtn.addEventListener('click', (e) => { e.stopPropagation(); removeTarget(); });

    const editCompBtn = document.createElement('button');
    editCompBtn.textContent = componentEditState.target === null ? 'Edit item' : 'Edit component';
    editCompBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (componentEditState.target === null) {
            const firstKey = contentKeys[0];
            componentEditState.target = firstKey;
            componentEditState.targetIsImported = !!def?.content?.[firstKey]?.component;
            componentEditState.targetElementId = `${componentEditState.name}_${firstKey}`;
        } else {
            componentEditState.target = null;
            componentEditState.targetIsImported = false;
            componentEditState.targetElementId = null;
        }
        renderInfoPanel();
        highlightTarget();
    });

    row.appendChild(importBtn);
    row.appendChild(resetBtn);
    row.appendChild(addItemBtn);
    row.appendChild(removeBtn);
    row.appendChild(editCompBtn);

    const exitBtn = document.createElement('button');
    exitBtn.textContent = 'Exit component editor';
    exitBtn.addEventListener('click', (e) => { e.stopPropagation(); exitComponentMode(); });
    row.appendChild(exitBtn);

    return row;
}

function renderForm() {
    if (componentEditState.target === null) return renderComponentLevelForm();
    if (componentEditState.targetIsImported) return renderImportedSummary();
    return renderItemLevelForm();
}

function renderComponentLevelForm() {
    const wrap = document.createElement('div');
    wrap.className = 'ce-form';
    const def = appManager.canvas.components[componentEditState.name] || {};

    wrap.appendChild(fieldRow('description', 'textarea', def.description ?? '', (val) => {
        patchComponentLevel({ description: val === '' ? null : val });
    }));
    wrap.appendChild(fieldRow('details', 'text', def.details ?? '', (val) => {
        patchComponentLevel({ details: val === '' ? null : val });
    }));
    wrap.appendChild(renderReferencesEditor(def.references || []));

    // Passthrough JSON editor for unknown top-level keys
    const knownKeys = new Set(['content', 'description', 'details', 'references']);
    for (const [key, value] of Object.entries(def)) {
        if (knownKeys.has(key)) continue;
        wrap.appendChild(fieldRow(`${key} (JSON)`, 'textarea', JSON.stringify(value, null, 2), (val) => {
            let parsed;
            try { parsed = JSON.parse(val); } catch { return; }
            patchComponentLevel({ [key]: parsed });
        }));
    }

    return wrap;
}

function renderImportedSummary() {
    const wrap = document.createElement('div');
    wrap.className = 'ce-form ce-imported';
    const def = appManager.canvas.components[componentEditState.name] || {};
    const importerKey = componentEditState.target;
    const importerItem = importerKey ? def.content?.[importerKey] : null;

    const note = document.createElement('div');
    note.className = 'ce-badge';
    note.textContent = importerItem
        ? `Imported from "${importerItem.component}"`
        : 'Imported subcomponent (origin unknown)';
    wrap.appendChild(note);

    if (importerItem) {
        const remove = document.createElement('button');
        remove.textContent = 'Remove imported reference';
        remove.addEventListener('click', (e) => {
            e.stopPropagation();
            appManager.canvas.updateComponent(componentEditState.name, {
                content: removeKey(def.content, importerKey),
            });
            componentEditState.target = null;
            componentEditState.targetIsImported = false;
            componentEditState.targetElementId = null;
            renderInfoPanel();
        });
        wrap.appendChild(remove);
    }

    return wrap;
}

function renderItemLevelForm() {
    const wrap = document.createElement('div');
    wrap.className = 'ce-form';
    const def = appManager.canvas.components[componentEditState.name] || {};
    const item = def.content?.[componentEditState.target] || {};

    // shape
    wrap.appendChild(selectRow('shape', KNOWN_SHAPES, item.shape ?? 'box', (val) => {
        patchItem({ shape: val });
    }));

    for (const key of NUMERIC_FIELDS) {
        wrap.appendChild(numberRow(key, item[key], (val) => patchItem({ [key]: val })));
    }

    // opacity (slider 0–1)
    const opacityRow = document.createElement('div');
    opacityRow.className = 'ce-row';
    const opLabel = document.createElement('label');
    opLabel.className = 'ce-label';
    opLabel.textContent = 'opacity';
    const op = document.createElement('input');
    op.type = 'range';
    op.min = '0'; op.max = '1'; op.step = '0.05';
    op.value = item.opacity ?? 1;
    op.addEventListener('input', () => {
        const v = parseFloat(op.value);
        patchItem({ opacity: v === 1 ? null : v });
    });
    opacityRow.appendChild(opLabel);
    opacityRow.appendChild(op);
    wrap.appendChild(opacityRow);

    // flipped (only for trapezoid/triangle)
    if (item.shape === 'trapezoid' || item.shape === 'triangle') {
        wrap.appendChild(checkboxRow('flipped', !!item.flipped, (val) => {
            patchItem({ flipped: val ? true : null });
        }));
    }
    if (item.shape === 'trapezoid') {
        wrap.appendChild(numberRow('shortSide', item.shortSide, (val) => patchItem({ shortSide: val })));
    }

    wrap.appendChild(selectRow('position', POSITION_OPTIONS, item.position ?? '', (val) => {
        patchItem({ position: val === '' ? null : val });
    }));

    const siblingIds = Object.keys(def.content || {}).filter(k => k !== componentEditState.target);
    wrap.appendChild(selectRow('previous', ['', ...siblingIds], item.previous ?? '', (val) => {
        patchItem({ previous: val === '' ? null : val });
    }));

    wrap.appendChild(fieldRow('description', 'textarea', item.description ?? '', (val) => {
        patchItem({ description: val === '' ? null : val });
    }));
    wrap.appendChild(fieldRow('details', 'text', item.details ?? '', (val) => {
        patchItem({ details: val === '' ? null : val });
    }));

    // text entries
    wrap.appendChild(renderTextEntries(item));
    // arrow entries
    wrap.appendChild(renderArrowEntries(item));

    return wrap;
}

function renderTextEntries(item) {
    const wrap = document.createElement('div');
    wrap.className = 'ce-subgroup';
    const heading = document.createElement('div');
    heading.className = 'ce-subheading';
    heading.textContent = 'Text';
    wrap.appendChild(heading);

    const entries = normalizeArray(item.text);
    entries.forEach((entry, idx) => wrap.appendChild(renderTextEntry(entry, idx, entries)));

    const add = document.createElement('button');
    add.textContent = '+ add text';
    add.addEventListener('click', (e) => {
        e.stopPropagation();
        const next = [...entries, { text: '' }];
        patchItem({ text: next });
    });
    wrap.appendChild(add);
    return wrap;
}

function renderTextEntry(entry, idx, entries) {
    const wrap = document.createElement('div');
    wrap.className = 'ce-entry';

    const isLatex = !!entry.latexText;
    const modeRow = document.createElement('div');
    modeRow.className = 'ce-row';
    const plainRadio = radio(`text-mode-${idx}`, 'text', !isLatex);
    const latexRadio = radio(`text-mode-${idx}`, 'latex', isLatex);
    plainRadio.input.addEventListener('change', () => {
        const next = [...entries];
        next[idx] = { ...entry, text: entry.text ?? entry.latexText ?? '' };
        delete next[idx].latexText;
        patchItem({ text: next });
    });
    latexRadio.input.addEventListener('change', () => {
        const next = [...entries];
        next[idx] = { ...entry, latexText: entry.latexText ?? entry.text ?? '' };
        delete next[idx].text;
        patchItem({ text: next });
    });
    modeRow.appendChild(plainRadio.label);
    modeRow.appendChild(latexRadio.label);
    wrap.appendChild(modeRow);

    const fieldName = isLatex ? 'latexText' : 'text';
    wrap.appendChild(fieldRow(fieldName, 'text', entry[fieldName] ?? '', (val) => {
        const next = [...entries];
        next[idx] = { ...entry, [fieldName]: val };
        patchItem({ text: next });
    }));
    wrap.appendChild(selectRow('position', TEXT_POSITIONS, entry.position ?? '', (val) => {
        const next = [...entries];
        next[idx] = { ...entry };
        if (val === '') delete next[idx].position; else next[idx].position = val;
        patchItem({ text: next });
    }));
    wrap.appendChild(numberRow('xOffset', entry.xOffset, (val) => {
        const next = [...entries]; next[idx] = { ...entry };
        if (val == null) delete next[idx].xOffset; else next[idx].xOffset = val;
        patchItem({ text: next });
    }));
    wrap.appendChild(numberRow('yOffset', entry.yOffset, (val) => {
        const next = [...entries]; next[idx] = { ...entry };
        if (val == null) delete next[idx].yOffset; else next[idx].yOffset = val;
        patchItem({ text: next });
    }));
    wrap.appendChild(fieldRow('color', 'text', entry.color ?? '', (val) => {
        const next = [...entries]; next[idx] = { ...entry };
        if (val === '') delete next[idx].color;
        else next[idx].color = isNaN(Number(val)) ? val : Number(val);
        patchItem({ text: next });
    }));

    const remove = document.createElement('button');
    remove.textContent = 'remove';
    remove.addEventListener('click', (e) => {
        e.stopPropagation();
        const next = entries.filter((_, i) => i !== idx);
        patchItem({ text: next.length ? next : null });
    });
    wrap.appendChild(remove);
    return wrap;
}

function renderArrowEntries(item) {
    const wrap = document.createElement('div');
    wrap.className = 'ce-subgroup';
    const heading = document.createElement('div');
    heading.className = 'ce-subheading';
    heading.textContent = 'Arrows';
    wrap.appendChild(heading);

    const entries = normalizeArray(item.arrow);
    entries.forEach((entry, idx) => wrap.appendChild(renderArrowEntry(entry, idx, entries)));

    const add = document.createElement('button');
    add.textContent = '+ add arrow';
    add.addEventListener('click', (e) => {
        e.stopPropagation();
        const next = [...entries, {}];
        patchItem({ arrow: next });
    });
    wrap.appendChild(add);
    return wrap;
}

function renderArrowEntry(entry, idx, entries) {
    const wrap = document.createElement('div');
    wrap.className = 'ce-entry';

    if (entry.segments) {
        const note = document.createElement('div');
        note.className = 'ce-badge';
        note.textContent = `(multi-segment, ${entry.segments.length} segments — edit via JSON)`;
        wrap.appendChild(note);
        const remove = document.createElement('button');
        remove.textContent = 'remove';
        remove.addEventListener('click', (e) => {
            e.stopPropagation();
            const next = entries.filter((_, i) => i !== idx);
            patchItem({ arrow: next.length ? next : null });
        });
        wrap.appendChild(remove);
        return wrap;
    }

    wrap.appendChild(fieldRow('previous', 'text', entry.previous ?? '', (val) => {
        const next = [...entries]; next[idx] = { ...entry };
        if (val === '') delete next[idx].previous; else next[idx].previous = val;
        patchItem({ arrow: next });
    }));
    wrap.appendChild(selectRow('direction', ARROW_DIRECTIONS, entry.direction ?? '', (val) => {
        const next = [...entries]; next[idx] = { ...entry };
        if (val === '') delete next[idx].direction; else next[idx].direction = val;
        patchItem({ arrow: next });
    }));
    wrap.appendChild(numberRow('xOffset', entry.xOffset, (val) => {
        const next = [...entries]; next[idx] = { ...entry };
        if (val == null) delete next[idx].xOffset; else next[idx].xOffset = val;
        patchItem({ arrow: next });
    }));
    wrap.appendChild(numberRow('yOffset', entry.yOffset, (val) => {
        const next = [...entries]; next[idx] = { ...entry };
        if (val == null) delete next[idx].yOffset; else next[idx].yOffset = val;
        patchItem({ arrow: next });
    }));
    wrap.appendChild(numberRow('extraLength', entry.extraLength, (val) => {
        const next = [...entries]; next[idx] = { ...entry };
        if (val == null) delete next[idx].extraLength; else next[idx].extraLength = val;
        patchItem({ arrow: next });
    }));
    wrap.appendChild(checkboxRow('noHead', !!entry.noHead, (val) => {
        const next = [...entries]; next[idx] = { ...entry };
        if (val) next[idx].noHead = true; else delete next[idx].noHead;
        patchItem({ arrow: next });
    }));

    const remove = document.createElement('button');
    remove.textContent = 'remove';
    remove.addEventListener('click', (e) => {
        e.stopPropagation();
        const next = entries.filter((_, i) => i !== idx);
        patchItem({ arrow: next.length ? next : null });
    });
    wrap.appendChild(remove);
    return wrap;
}

function renderReferencesEditor(references) {
    const wrap = document.createElement('div');
    wrap.className = 'ce-subgroup';
    const heading = document.createElement('div');
    heading.className = 'ce-subheading';
    heading.textContent = 'References';
    wrap.appendChild(heading);

    references.forEach((ref, idx) => {
        const entry = document.createElement('div');
        entry.className = 'ce-entry';
        const keys = Object.keys(ref);
        keys.forEach((k) => {
            entry.appendChild(fieldRow(k, 'text', String(ref[k] ?? ''), (val) => {
                const next = references.map((r, i) => i === idx ? { ...r, [k]: val } : r);
                patchComponentLevel({ references: next });
            }));
        });
        const addKey = document.createElement('button');
        addKey.textContent = '+ add field';
        addKey.addEventListener('click', (e) => {
            e.stopPropagation();
            const key = window.prompt('Field name?');
            if (!key) return;
            const next = references.map((r, i) => i === idx ? { ...r, [key]: '' } : r);
            patchComponentLevel({ references: next });
        });
        entry.appendChild(addKey);

        const remove = document.createElement('button');
        remove.textContent = 'remove reference';
        remove.addEventListener('click', (e) => {
            e.stopPropagation();
            const next = references.filter((_, i) => i !== idx);
            patchComponentLevel({ references: next.length ? next : null });
        });
        entry.appendChild(remove);
        wrap.appendChild(entry);
    });

    const addRef = document.createElement('button');
    addRef.textContent = '+ add reference';
    addRef.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = window.prompt('Reference id?');
        if (!id) return;
        patchComponentLevel({ references: [...references, { id }] });
    });
    wrap.appendChild(addRef);
    return wrap;
}

function renderExportRow() {
    const row = document.createElement('div');
    row.className = 'ce-row ce-export';
    const btn = document.createElement('button');
    btn.textContent = 'Export';
    btn.addEventListener('click', (e) => { e.stopPropagation(); exportComponent(); });
    row.appendChild(btn);
    return row;
}

// === Form primitives ===========================================================

function fieldRow(name, type, value, onCommit) {
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

function numberRow(name, value, onCommit) {
    const row = document.createElement('div');
    row.className = 'ce-row';
    const label = document.createElement('label');
    label.className = 'ce-label';
    label.textContent = name;
    const input = document.createElement('input');
    input.type = 'number';
    input.value = value ?? '';
    input.className = 'ce-input';
    input.addEventListener('change', () => {
        if (input.value === '') onCommit(null);
        else onCommit(Number(input.value));
    });
    row.appendChild(label);
    row.appendChild(input);
    return row;
}

function selectRow(name, options, value, onCommit) {
    const row = document.createElement('div');
    row.className = 'ce-row';
    const label = document.createElement('label');
    label.className = 'ce-label';
    label.textContent = name;
    const sel = document.createElement('select');
    for (const opt of options) {
        const o = document.createElement('option');
        o.value = opt; o.textContent = opt === '' ? '(default)' : opt;
        if (opt === value) o.selected = true;
        sel.appendChild(o);
    }
    sel.addEventListener('change', () => onCommit(sel.value));
    row.appendChild(label);
    row.appendChild(sel);
    return row;
}

function checkboxRow(name, checked, onCommit) {
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

function radio(name, value, checked) {
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

// === Mutations =================================================================

function patchItem(patch) {
    const name = componentEditState.name;
    const target = componentEditState.target;
    if (!target) return;
    const canvas = appManager.canvas;
    const def = canvas.components[name];
    if (!def?.content?.[target]) return;
    const nextItem = { ...def.content[target] };
    for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === undefined || v === '') delete nextItem[k];
        else nextItem[k] = v;
    }
    const nextContent = { ...def.content, [target]: nextItem };
    canvas.updateComponent(name, { content: nextContent });
}

function patchComponentLevel(patch) {
    appManager.canvas.updateComponent(componentEditState.name, patch);
}

function addItemAfterTarget() {
    const name = componentEditState.name;
    const target = componentEditState.target;
    const canvas = appManager.canvas;
    const def = canvas.components[name];
    if (!def?.content) return;
    const newId = uniqueContentKey(def.content, 'item');
    // Preserve insertion order: walk content, insert after target
    const next = {};
    for (const [k, v] of Object.entries(def.content)) {
        next[k] = v;
        if (k === target) next[newId] = { shape: 'box', previous: target, position: 'right' };
    }
    canvas.updateComponent(name, { content: next });
    componentEditState.target = newId;
    componentEditState.targetIsImported = false;
    componentEditState.targetElementId = `${name}_${newId}`;
    renderInfoPanel();
    highlightTarget();
}

function removeTarget() {
    const name = componentEditState.name;
    const target = componentEditState.target;
    const canvas = appManager.canvas;
    const def = canvas.components[name];
    if (!def?.content) return;
    const keys = Object.keys(def.content);
    if (keys.length <= 1) return;
    const nextContent = removeKey(def.content, target);
    canvas.updateComponent(name, { content: nextContent });
    const remaining = Object.keys(nextContent);
    componentEditState.target = remaining[0];
    componentEditState.targetIsImported = !!def.content[remaining[0]]?.component;
    componentEditState.targetElementId = `${name}_${remaining[0]}`;
    renderInfoPanel();
    highlightTarget();
}

function resetToSeed() {
    const name = componentEditState.name;
    const canvas = appManager.canvas;
    const def = canvas.components[name] || {};
    const patch = { content: SEED_CONTENT() };
    // Clear extra top-level keys
    for (const k of Object.keys(def)) {
        if (k !== 'content') patch[k] = null;
    }
    canvas.updateComponent(name, patch);
    componentEditState.target = 'box';
    componentEditState.targetIsImported = false;
    componentEditState.targetElementId = `${name}_box`;
    componentEditState.isSeed = true;
    renderInfoPanel();
    highlightTarget();
}

function openImportChooser() {
    const canvas = appManager.canvas;
    const choices = Object.keys(canvas.components).filter(n => n !== componentEditState.name);
    if (choices.length === 0) { window.alert('No other components to import.'); return; }
    const choice = window.prompt(`Available components:\n${choices.join('\n')}\n\nName:`);
    if (!choice || !canvas.components[choice]) return;

    if (componentEditState.isSeed) {
        // Wholesale replace
        const cloned = JSON.parse(JSON.stringify(canvas.components[choice]));
        const patch = { ...cloned };
        // Make sure to overwrite all current top-level keys; first compute deletes
        const cur = canvas.components[componentEditState.name] || {};
        for (const k of Object.keys(cur)) if (!(k in patch)) patch[k] = null;
        canvas.updateComponent(componentEditState.name, patch);
        const firstKey = Object.keys(cloned.content || {})[0];
        componentEditState.target = firstKey ?? null;
        componentEditState.targetIsImported = false;
        componentEditState.targetElementId = firstKey ? `${componentEditState.name}_${firstKey}` : null;
        componentEditState.isSeed = true;
        renderInfoPanel();
        highlightTarget();
    } else {
        // Insert a reference after the current target
        const def = canvas.components[componentEditState.name];
        if (!def?.content) return;
        const newId = uniqueContentKey(def.content, choice);
        const next = {};
        for (const [k, v] of Object.entries(def.content)) {
            next[k] = v;
            if (k === componentEditState.target) next[newId] = { component: choice };
        }
        if (!(componentEditState.target in def.content)) {
            next[newId] = { component: choice };
        }
        canvas.updateComponent(componentEditState.name, { content: next });
    }
}

function renameComponent(oldName, newName) {
    const canvas = appManager.canvas;
    const def = canvas.components[oldName];
    if (!def) return;

    // 1. Persist under the new name and set the recovery marker.
    componentEditState.pendingRenameFrom = oldName;
    setPendingRename(oldName, localStorage);
    saveCustomComponent(newName, def, localStorage);

    // 2. Update in-memory components map.
    canvas.components[newName] = def;
    delete canvas.components[oldName];

    // 3. Update transient abstract definition.
    const abs = canvas.store.abstractDefinitions[EDITING_VIEW];
    abs.content = { [newName]: {} };
    canvas.invalidateView(EDITING_VIEW);

    componentEditState.name = newName;
    componentEditState.targetElementId = componentEditState.target
        ? `${newName}_${componentEditState.target}`
        : null;

    // 4. Delete old localStorage entry, clear marker.
    removeCustomComponent(oldName, localStorage);
    clearPendingRename(localStorage);
    componentEditState.pendingRenameFrom = null;

    canvas.refresh(EDITING_VIEW);
    renderInfoPanel();
    highlightTarget();
}

function exportComponent() {
    const name = componentEditState.name;
    const def = appManager.canvas.components[name];
    if (!def) return;
    const body = `export const ${name} = ${JSON.stringify(def, null, 2)};\n`;
    const blob = new Blob([body], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}.js`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// === Helpers ===================================================================

function normalizeArray(value) {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
}

function removeKey(obj, key) {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
        if (k !== key) out[k] = v;
    }
    return out;
}

function uniqueContentKey(content, base) {
    let candidate = base;
    let i = 1;
    while (content[candidate]) {
        candidate = `${base}_${i++}`;
    }
    return candidate;
}

function uniqueComponentName(base) {
    const taken = new Set(Object.keys(appManager.canvas.components));
    let candidate = base;
    let i = 1;
    while (taken.has(candidate)) {
        candidate = `${base}_${i++}`;
    }
    return candidate;
}

function validateComponentName(name) {
    if (!name) return 'Name cannot be empty.';
    if (/_\d+$/.test(name)) return 'Name cannot end with _<number> (reserved by parser).';
    if (name === componentEditState.name) return null;
    if (appManager.canvas.components[name]) return `A component named "${name}" already exists.`;
    return null;
}
