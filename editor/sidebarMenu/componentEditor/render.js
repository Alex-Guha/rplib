import { componentEditState } from '../../utils/state.js';
import {
    KNOWN_SHAPES,
    POSITION_OPTIONS,
    TEXT_POSITIONS,
    ARROW_DIRECTIONS,
} from './constants.js';
import {
    detailsOptions,
    makeEntryUpdater,
    normalizeArray,
    removeKey,
    validateItemId,
    validateComponentName,
} from './helpers.js';
import {
    fieldRow,
    plainNumberRow,
    shapeNumberRow,
    opacityRow,
    pairRow,
    sectionSeparator,
    selectRow,
    checkboxRow,
} from './formPrimitives.js';
import {
    patchItem,
    patchComponentLevel,
    addItemAfterTarget,
    removeTarget,
    resetToSeed,
    importComponent,
    renameComponent,
    renameItemKey,
    exportComponent,
} from './mutations.js';
import { highlightTarget } from './target.js';

// Per-session "advanced mode" flag — gates rarely-used numeric/styling fields.
// Kept module-local because it's pure view state with no persistence need.
let advancedMode = false;

export function resetAdvancedMode() {
    advancedMode = false;
}

export function renderInfoPanel(manager) {
    const info = document.getElementById('info');
    info.innerHTML = '';

    const container = document.createElement('div');
    container.className = 'component-editor';

    const meta = renderMetaRows(manager);
    container.appendChild(meta.importResetRow);
    container.appendChild(meta.addRemoveRow);

    const separator = document.createElement('hr');
    separator.className = 'ce-separator';
    container.appendChild(separator);

    container.appendChild(renderForm(manager));

    info.appendChild(container);
    // Export + Advanced toggle sit outside the scrollable form container so
    // they stay pinned to the bottom of #info.
    info.appendChild(renderBottomButtons(manager));
}

function renderItemIdRow(manager, def) {
    const row = document.createElement('div');
    row.className = 'ce-row';
    const label = document.createElement('label');
    label.className = 'ce-label';
    label.textContent = 'id';
    const input = document.createElement('input');
    input.type = 'text';
    input.value = componentEditState.target;
    input.className = 'ce-input';

    const commit = () => {
        const newId = input.value.trim();
        const oldId = componentEditState.target;
        if (newId === oldId) return;
        const err = validateItemId(newId, oldId, def);
        if (err) {
            window.alert(err);
            input.value = oldId;
            return;
        }
        renameItemKey(manager, oldId, newId);
    };
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    });

    row.appendChild(label);
    row.appendChild(input);
    return row;
}

function renderNameRow(manager) {
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
        const err = validateComponentName(manager, newName);
        if (err) {
            window.alert(err);
            input.value = componentEditState.name;
            return;
        }
        renameComponent(manager, componentEditState.name, newName);
    };
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    });

    row.appendChild(label);
    row.appendChild(input);
    return row;
}

function renderMetaRows(manager) {
    const importResetRow = document.createElement('div');
    importResetRow.className = 'ce-row ce-meta';

    const hasNativeTarget = componentEditState.target && !componentEditState.targetIsImported;
    const importLabel = componentEditState.isSeed
        ? 'Import component'
        : (hasNativeTarget ? 'Insert component' : 'Add component at end');
    const importSelect = renderImportSelect(manager, importLabel);

    const resetBtn = document.createElement('button');
    resetBtn.textContent = 'Reset';
    resetBtn.disabled = componentEditState.isSeed;
    resetBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!window.confirm('Reset will discard the current component. Continue?')) return;
        resetToSeed(manager);
    });

    importResetRow.appendChild(importSelect);
    importResetRow.appendChild(resetBtn);

    const addRemoveRow = document.createElement('div');
    addRemoveRow.className = 'ce-row ce-meta';

    const addItemBtn = document.createElement('button');
    addItemBtn.textContent = hasNativeTarget ? 'Add item after target' : 'Add item at end';
    addItemBtn.disabled = componentEditState.targetIsImported;
    addItemBtn.addEventListener('click', (e) => { e.stopPropagation(); addItemAfterTarget(manager); });
    addRemoveRow.appendChild(addItemBtn);

    const def = manager.canvas.components[componentEditState.name];
    const contentKeys = def?.content ? Object.keys(def.content) : [];
    // Only render Remove when it would actually do something — disabled is the
    // wrong affordance in the no-target / single-item cases.
    if (componentEditState.target && !componentEditState.targetIsImported && contentKeys.length > 1) {
        const removeBtn = document.createElement('button');
        removeBtn.textContent = 'Remove target';
        removeBtn.addEventListener('click', (e) => { e.stopPropagation(); removeTarget(manager); });
        addRemoveRow.appendChild(removeBtn);
    }

    return { importResetRow, addRemoveRow };
}

function renderForm(manager) {
    if (componentEditState.target === null) return renderComponentLevelForm(manager);
    if (componentEditState.targetIsImported) return renderImportedSummary(manager);
    return renderItemLevelForm(manager);
}

function renderComponentLevelForm(manager) {
    const wrap = document.createElement('div');
    wrap.className = 'ce-form';
    const def = manager.canvas.components[componentEditState.name] || {};

    wrap.appendChild(renderNameRow(manager));
    wrap.appendChild(fieldRow('description', 'textarea', def.description ?? '', (val) => {
        patchComponentLevel(manager, { description: val === '' ? null : val });
    }));
    wrap.appendChild(selectRow('details', detailsOptions(manager, def.details), def.details ?? '', (val) => {
        patchComponentLevel(manager, { details: val === '' ? null : val });
    }, 'none'));
    wrap.appendChild(renderReferencesEditor(
        def.references || [],
        (next) => patchComponentLevel(manager, { references: next })
    ));

    // Passthrough JSON editor for unknown top-level keys
    const knownKeys = new Set(['content', 'description', 'details', 'references']);
    for (const [key, value] of Object.entries(def)) {
        if (knownKeys.has(key)) continue;
        wrap.appendChild(fieldRow(`${key} (JSON)`, 'textarea', JSON.stringify(value, null, 2), (val) => {
            let parsed;
            try { parsed = JSON.parse(val); } catch { return; }
            patchComponentLevel(manager, { [key]: parsed });
        }));
    }

    return wrap;
}

function renderImportedSummary(manager) {
    const wrap = document.createElement('div');
    wrap.className = 'ce-form ce-imported';
    const def = manager.canvas.components[componentEditState.name] || {};
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
            manager.canvas.updateComponent(componentEditState.name, {
                content: removeKey(def.content, importerKey),
            });
            componentEditState.target = null;
            componentEditState.targetIsImported = false;
            componentEditState.importedGroupPrefix = null;
            componentEditState.targetElementId = null;
            renderInfoPanel(manager);
        });
        wrap.appendChild(remove);
    }

    return wrap;
}

function renderItemLevelForm(manager) {
    const wrap = document.createElement('div');
    wrap.className = 'ce-form';
    const def = manager.canvas.components[componentEditState.name] || {};
    const item = def.content?.[componentEditState.target] || {};

    // id rename (must come first; everything else patches under the current id)
    wrap.appendChild(renderItemIdRow(manager, def));

    // shape
    wrap.appendChild(selectRow('shape', KNOWN_SHAPES, item.shape ?? 'box', (val) => {
        patchItem(manager, { shape: val });
    }));
    if (item.shape === 'trapezoid' || item.shape === 'triangle') {
        wrap.appendChild(checkboxRow('flipped', !!item.flipped, (val) => {
            patchItem(manager, { flipped: val ? true : null });
        }));
    }

    // -- positioning --
    wrap.appendChild(sectionSeparator('positioning'));
    wrap.appendChild(selectRow('position', POSITION_OPTIONS, item.position ?? '', (val) => {
        patchItem(manager, { position: val === '' ? null : val });
    }, 'right'));
    const siblingIds = Object.keys(def.content || {}).filter(k => k !== componentEditState.target);
    wrap.appendChild(selectRow('previous', ['', ...siblingIds], item.previous ?? '', (val) => {
        patchItem(manager, { previous: val === '' ? null : val });
    }, 'none'));
    if (advancedMode) {
        wrap.appendChild(pairRow(
            shapeNumberRow('x', item.x, (val) => patchItem(manager, { x: val })),
            shapeNumberRow('y', item.y, (val) => patchItem(manager, { y: val })),
        ));
    }

    // -- styling --
    wrap.appendChild(sectionSeparator('styling'));
    wrap.appendChild(pairRow(
        shapeNumberRow('width', item.width, (val) => patchItem(manager, { width: val })),
        shapeNumberRow('height', item.height, (val) => patchItem(manager, { height: val })),
    ));
    if (advancedMode) {
        wrap.appendChild(pairRow(
            plainNumberRow('count', item.count, (val) => patchItem(manager, { count: val })),
            opacityRow(item.opacity, (val) => patchItem(manager, { opacity: val })),
        ));
        wrap.appendChild(pairRow(
            shapeNumberRow('xSpacing', item.xSpacing, (val) => patchItem(manager, { xSpacing: val })),
            shapeNumberRow('ySpacing', item.ySpacing, (val) => patchItem(manager, { ySpacing: val })),
        ));
    }
    wrap.appendChild(shapeNumberRow('separation', item.separation, (val) => patchItem(manager, { separation: val })));
    if (item.shape === 'trapezoid') {
        wrap.appendChild(plainNumberRow('shortSide', item.shortSide, (val) => patchItem(manager, { shortSide: val })));
    }

    // -- content --
    wrap.appendChild(sectionSeparator('content'));
    wrap.appendChild(fieldRow('description', 'textarea', item.description ?? '', (val) => {
        patchItem(manager, { description: val === '' ? null : val });
    }));
    if (advancedMode) {
        wrap.appendChild(selectRow('details', detailsOptions(manager, item.details), item.details ?? '', (val) => {
            patchItem(manager, { details: val === '' ? null : val });
        }, 'none'));
    }
    wrap.appendChild(renderReferencesEditor(
        item.references || [],
        (next) => patchItem(manager, { references: next })
    ));
    wrap.appendChild(renderTextEntries(manager, item.text, (next) => patchItem(manager, { text: next })));
    wrap.appendChild(renderArrowEntries(manager, item));

    return wrap;
}

// Renders a "Text" subgroup that reads from a text array and writes back via
// onChange. Same primitive is used for both item.text and arrow[i].text — the
// rplib data model treats them identically (arrows.js:129 iterates segment.text
// the same way text on shapes is handled).
function renderTextEntries(manager, textValue, onChange) {
    const wrap = document.createElement('div');
    wrap.className = 'ce-subgroup';
    const heading = document.createElement('div');
    heading.className = 'ce-subheading';
    heading.textContent = 'Text';
    wrap.appendChild(heading);

    const entries = normalizeArray(textValue);
    // Empty payload commits as null so consumers don't end up with `text: []`.
    const commit = (next) => onChange(next && next.length ? next : null);
    entries.forEach((entry, idx) => wrap.appendChild(renderTextEntry(manager, entry, idx, entries, commit)));

    const add = document.createElement('button');
    add.textContent = '+ add text';
    add.addEventListener('click', (e) => {
        e.stopPropagation();
        commit([...entries, { text: '' }]);
    });
    wrap.appendChild(add);
    return wrap;
}

function renderTextEntry(manager, entry, idx, entries, commit) {
    const wrap = document.createElement('div');
    wrap.className = 'ce-entry';
    const update = makeEntryUpdater(entries, idx, entry, commit);

    wrap.appendChild(fieldRow('text', 'text', entry.text ?? '', (val) => update('text', val)));
    wrap.appendChild(selectRow('position', TEXT_POSITIONS, entry.position ?? '',
        (val) => update('position', val), 'top'));
    if (advancedMode) {
        wrap.appendChild(pairRow(
            shapeNumberRow('xOffset', entry.xOffset, (val) => update('xOffset', val)),
            shapeNumberRow('yOffset', entry.yOffset, (val) => update('yOffset', val)),
        ));
        wrap.appendChild(fieldRow('color', 'text', entry.color ?? '', (val) => update('color', val, {
            transform: (v) => isNaN(Number(v)) ? v : Number(v),
        })));
        wrap.appendChild(fieldRow('description', 'textarea', entry.description ?? '',
            (val) => update('description', val)));
        wrap.appendChild(selectRow('details', detailsOptions(manager, entry.details), entry.details ?? '',
            (val) => update('details', val), 'none'));
        wrap.appendChild(renderReferencesEditor(entry.references || [], (refs) => update('references', refs, {
            isEmpty: (v) => !(v && v.length),
        })));
    }

    const remove = document.createElement('button');
    remove.textContent = 'remove';
    remove.addEventListener('click', (e) => {
        e.stopPropagation();
        commit(entries.filter((_, i) => i !== idx));
    });
    wrap.appendChild(remove);
    return wrap;
}

function renderArrowEntries(manager, item) {
    const wrap = document.createElement('div');
    wrap.className = 'ce-subgroup';
    const heading = document.createElement('div');
    heading.className = 'ce-subheading';
    heading.textContent = 'Arrows';
    wrap.appendChild(heading);

    const entries = normalizeArray(item.arrow);
    const commit = (next) => patchItem(manager, { arrow: next && next.length ? next : null });
    entries.forEach((entry, idx) => wrap.appendChild(renderArrowEntry(manager, entry, idx, entries, commit)));

    const add = document.createElement('button');
    add.textContent = '+ add arrow';
    add.addEventListener('click', (e) => {
        e.stopPropagation();
        commit([...entries, {}]);
    });
    wrap.appendChild(add);
    return wrap;
}

function renderArrowEntry(manager, entry, idx, entries, commit) {
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
            commit(entries.filter((_, i) => i !== idx));
        });
        wrap.appendChild(remove);
        return wrap;
    }

    const update = makeEntryUpdater(entries, idx, entry, commit);

    wrap.appendChild(fieldRow('previous', 'text', entry.previous ?? '',
        (val) => update('previous', val)));
    wrap.appendChild(selectRow('direction', ARROW_DIRECTIONS, entry.direction ?? '',
        (val) => update('direction', val), 'right'));
    wrap.appendChild(renderTextEntries(manager, entry.text, (textVal) => update('text', textVal)));
    if (advancedMode) {
        wrap.appendChild(pairRow(
            shapeNumberRow('xOffset', entry.xOffset, (val) => update('xOffset', val)),
            shapeNumberRow('yOffset', entry.yOffset, (val) => update('yOffset', val)),
        ));
        wrap.appendChild(plainNumberRow('extraLength', entry.extraLength,
            (val) => update('extraLength', val)));
        wrap.appendChild(checkboxRow('noHead', !!entry.noHead, (val) => update('noHead', val, {
            isEmpty: (v) => !v,
            transform: () => true,
        })));
        wrap.appendChild(fieldRow('description', 'textarea', entry.description ?? '',
            (val) => update('description', val)));
        wrap.appendChild(selectRow('details', detailsOptions(manager, entry.details), entry.details ?? '',
            (val) => update('details', val), 'none'));
        wrap.appendChild(renderReferencesEditor(entry.references || [], (refs) => update('references', refs, {
            isEmpty: (v) => !(v && v.length),
        })));
    }

    const remove = document.createElement('button');
    remove.textContent = 'remove';
    remove.addEventListener('click', (e) => {
        e.stopPropagation();
        commit(entries.filter((_, i) => i !== idx));
    });
    wrap.appendChild(remove);
    return wrap;
}

function renderReferencesEditor(references, onChange) {
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
                onChange(next);
            }));
        });
        if (advancedMode) {
            const addKey = document.createElement('button');
            addKey.textContent = '+ add field';
            addKey.addEventListener('click', (e) => {
                e.stopPropagation();
                const key = window.prompt('Field name?');
                if (!key) return;
                const next = references.map((r, i) => i === idx ? { ...r, [key]: '' } : r);
                onChange(next);
            });
            entry.appendChild(addKey);
        }

        const remove = document.createElement('button');
        remove.textContent = 'remove reference';
        remove.addEventListener('click', (e) => {
            e.stopPropagation();
            const next = references.filter((_, i) => i !== idx);
            onChange(next.length ? next : null);
        });
        entry.appendChild(remove);
        wrap.appendChild(entry);
    });

    if (advancedMode) {
        const addRef = document.createElement('button');
        addRef.textContent = '+ add reference';
        addRef.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = window.prompt('Reference id?');
            if (!id) return;
            onChange([...references, { id }]);
        });
        wrap.appendChild(addRef);
    } else if (references.length === 0) {
        // Don't render an empty subgroup with no affordance to populate it.
        return document.createDocumentFragment();
    }
    return wrap;
}

function renderBottomButtons(manager) {
    const row = document.createElement('div');
    row.className = 'ce-bottom-row';

    const exportBtn = document.createElement('button');
    exportBtn.textContent = 'Export';
    exportBtn.addEventListener('click', (e) => { e.stopPropagation(); exportComponent(manager); });

    const advBtn = document.createElement('button');
    advBtn.textContent = 'Advanced';
    if (advancedMode) advBtn.classList.add('ce-advanced-active');
    advBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        advancedMode = !advancedMode;
        renderInfoPanel(manager);
    });

    row.appendChild(exportBtn);
    row.appendChild(advBtn);
    return row;
}

function renderImportSelect(manager, label) {
    const select = document.createElement('select');
    select.className = 'ce-import-select';

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = label;
    placeholder.disabled = true;
    placeholder.selected = true;
    select.appendChild(placeholder);

    const choices = Object.keys(manager.canvas.components)
        .filter(n => n !== componentEditState.name);
    if (choices.length === 0) {
        const none = document.createElement('option');
        none.disabled = true;
        none.textContent = '(no components available)';
        select.appendChild(none);
    } else {
        for (const name of choices) {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            select.appendChild(opt);
        }
    }

    select.addEventListener('change', (e) => {
        e.stopPropagation();
        const choice = select.value;
        if (!choice) return;
        importComponent(manager, choice);
    });
    return select;
}
