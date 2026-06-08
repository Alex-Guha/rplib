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

// Tracks which collapsible notes editors are open, by caller-supplied key.
// Persists across re-renders so editing inside the panel doesn't snap it shut.
const expandedNotes = new Set();

export function renderInfoPanel(manager) {
    const info = document.getElementById('info');
    // Preserve scroll position across full re-renders. Both #info and
    // .component-editor are independently scrollable (styles.css:266, :641),
    // so capture and restore both — otherwise every edit snaps back to top.
    const prevEditor = info.querySelector('.component-editor');
    const prevEditorScroll = prevEditor ? prevEditor.scrollTop : 0;
    const prevInfoScroll = info.scrollTop;
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

    container.scrollTop = prevEditorScroll;
    info.scrollTop = prevInfoScroll;
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
    wrap.appendChild(renderNotesEditor(manager, '__component__', def,
        (val) => patchComponentLevel(manager, { description: val === '' ? null : val }),
        (val) => patchComponentLevel(manager, { details: val === '' ? null : val }),
        (prop, val) => patchComponentLevel(manager, { [prop]: val }),
    ));

    // Passthrough JSON editor for unknown top-level keys. Properties backed by a
    // configured panel are edited by that panel (in the notes editor above), so
    // they're excluded here alongside the editor-native description/details.
    const panelProps = (manager.panels || []).map((p) => p.property).filter(Boolean);
    const knownKeys = new Set(['content', 'description', 'details', ...panelProps]);
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
    wrap.appendChild(renderNotesEditor(manager, `item:${componentEditState.target}`, item,
        (val) => patchItem(manager, { description: val === '' ? null : val }),
        (val) => patchItem(manager, { details: val === '' ? null : val }),
        (prop, val) => patchItem(manager, { [prop]: val }),
    ));
    const itemKey = `item:${componentEditState.target}`;
    wrap.appendChild(renderTextEntries(manager, itemKey, item.text, (next) => patchItem(manager, { text: next })));
    wrap.appendChild(renderArrowEntries(manager, itemKey, item));

    return wrap;
}

// Renders a "Text" subgroup that reads from a text array and writes back via
// onChange. Same primitive is used for both item.text and arrow[i].text — the
// rplib data model treats them identically (arrows.js:129 iterates segment.text
// the same way text on shapes is handled).
function renderTextEntries(manager, parentKey, textValue, onChange) {
    const wrap = document.createElement('div');
    wrap.className = 'ce-subgroup';
    const heading = document.createElement('div');
    heading.className = 'ce-subheading';
    heading.textContent = 'Text';
    wrap.appendChild(heading);

    const entries = normalizeArray(textValue);
    // Empty payload commits as null so consumers don't end up with `text: []`.
    const commit = (next) => onChange(next && next.length ? next : null);
    entries.forEach((entry, idx) => wrap.appendChild(renderTextEntry(manager, `${parentKey}/text[${idx}]`, entry, idx, entries, commit)));

    const add = document.createElement('button');
    add.textContent = '+ add text';
    add.addEventListener('click', (e) => {
        e.stopPropagation();
        commit([...entries, { text: '' }]);
    });
    wrap.appendChild(add);
    return wrap;
}

function renderTextEntry(manager, key, entry, idx, entries, commit) {
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
        wrap.appendChild(renderNotesEditor(manager, key, entry,
            (val) => update('description', val),
            (val) => update('details', val),
            (prop, val) => update(prop, val, { isEmpty: (v) => v == null }),
        ));
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

function renderArrowEntries(manager, parentKey, item) {
    const wrap = document.createElement('div');
    wrap.className = 'ce-subgroup';
    const heading = document.createElement('div');
    heading.className = 'ce-subheading';
    heading.textContent = 'Arrows';
    wrap.appendChild(heading);

    const entries = normalizeArray(item.arrow);
    const commit = (next) => patchItem(manager, { arrow: next && next.length ? next : null });
    entries.forEach((entry, idx) => wrap.appendChild(renderArrowEntry(manager, `${parentKey}/arrow[${idx}]`, entry, idx, entries, commit)));

    const add = document.createElement('button');
    add.textContent = '+ add arrow';
    add.addEventListener('click', (e) => {
        e.stopPropagation();
        commit([...entries, {}]);
    });
    wrap.appendChild(add);
    return wrap;
}

function renderArrowEntry(manager, key, entry, idx, entries, commit) {
    const wrap = document.createElement('div');
    wrap.className = 'ce-entry';

    if (entry.segments) {
        if (!advancedMode) {
            const note = document.createElement('div');
            note.className = 'ce-badge';
            note.textContent = `(multi-segment, ${entry.segments.length} segments — enable advanced mode to edit)`;
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
        wrap.appendChild(renderSegmentEntries(manager, key, entry.segments,
            (next) => update('segments', next, { isEmpty: (v) => !(v && v.length) })));
        wrap.appendChild(renderNotesEditor(manager, key, entry,
            (val) => update('description', val),
            (val) => update('details', val),
            (prop, val) => update(prop, val, { isEmpty: (v) => v == null }),
        ));

        const convertBack = document.createElement('button');
        convertBack.textContent = 'convert to single-segment';
        convertBack.disabled = entry.segments.length !== 1;
        convertBack.title = entry.segments.length !== 1
            ? 'Reduce to one segment first'
            : 'Flatten the single segment back onto the arrow';
        convertBack.addEventListener('click', (e) => {
            e.stopPropagation();
            const { segments, ...rest } = entry;
            const next = [...entries];
            next[idx] = { ...segments[0], ...rest };
            commit(next);
        });
        wrap.appendChild(convertBack);

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
    wrap.appendChild(renderTextEntries(manager, key, entry.text, (textVal) => update('text', textVal)));
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
        wrap.appendChild(renderNotesEditor(manager, key, entry,
            (val) => update('description', val),
            (val) => update('details', val),
            (prop, val) => update(prop, val, { isEmpty: (v) => v == null }),
        ));

        const convertToMulti = document.createElement('button');
        convertToMulti.textContent = 'convert to multi-segment';
        convertToMulti.title = 'Move direction/offsets/length/noHead/text into a single segment';
        convertToMulti.addEventListener('click', (e) => {
            e.stopPropagation();
            const SEG_KEYS = new Set(['direction', 'xOffset', 'yOffset', 'extraLength', 'noHead', 'reversed', 'text']);
            const seed = {};
            const parent = {};
            for (const [k, v] of Object.entries(entry)) {
                if (SEG_KEYS.has(k)) seed[k] = v;
                else parent[k] = v;
            }
            const next = [...entries];
            next[idx] = { ...parent, segments: [seed] };
            commit(next);
        });
        wrap.appendChild(convertToMulti);
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

// Renders a "Segments" subgroup for multi-segment arrows. The data model treats
// each segment as a mini-arrow (arrows.js:42-65), so per-segment fields mirror
// the single-arrow editor above.
function renderSegmentEntries(manager, parentKey, segments, onChange) {
    const wrap = document.createElement('div');
    wrap.className = 'ce-subgroup';
    const heading = document.createElement('div');
    heading.className = 'ce-subheading';
    heading.textContent = 'Segments';
    wrap.appendChild(heading);

    const entries = normalizeArray(segments);
    const commit = (next) => onChange(next && next.length ? next : null);
    entries.forEach((entry, idx) => wrap.appendChild(renderSegmentEntry(manager, `${parentKey}/segments[${idx}]`, entry, idx, entries, commit)));

    const add = document.createElement('button');
    add.textContent = '+ add segment';
    add.addEventListener('click', (e) => {
        e.stopPropagation();
        commit([...entries, {}]);
    });
    wrap.appendChild(add);
    return wrap;
}

function renderSegmentEntry(manager, key, entry, idx, entries, commit) {
    const wrap = document.createElement('div');
    wrap.className = 'ce-entry';
    const update = makeEntryUpdater(entries, idx, entry, commit);

    wrap.appendChild(selectRow('direction', ARROW_DIRECTIONS, entry.direction ?? '',
        (val) => update('direction', val), '(inferred)'));
    wrap.appendChild(pairRow(
        shapeNumberRow('xOffset', entry.xOffset, (val) => update('xOffset', val)),
        shapeNumberRow('yOffset', entry.yOffset, (val) => update('yOffset', val)),
    ));
    wrap.appendChild(shapeNumberRow('extraLength', entry.extraLength,
        (val) => update('extraLength', val)));
    wrap.appendChild(checkboxRow('noHead', !!entry.noHead, (val) => update('noHead', val, {
        isEmpty: (v) => !v,
        transform: () => true,
    })));
    wrap.appendChild(checkboxRow('reversed', !!entry.reversed, (val) => update('reversed', val, {
        isEmpty: (v) => !v,
        transform: () => true,
    })));
    wrap.appendChild(renderTextEntries(manager, key, entry.text, (textVal) => update('text', textVal)));
    wrap.appendChild(renderNotesEditor(manager, key, entry,
        (val) => update('description', val),
        (val) => update('details', val),
        (prop, val) => update(prop, val, { isEmpty: (v) => v == null }),
    ));

    const controls = document.createElement('div');
    controls.className = 'ce-row';

    const up = document.createElement('button');
    up.textContent = '↑';
    up.disabled = idx === 0;
    up.addEventListener('click', (e) => {
        e.stopPropagation();
        const next = [...entries];
        [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
        commit(next);
    });
    controls.appendChild(up);

    const down = document.createElement('button');
    down.textContent = '↓';
    down.disabled = idx === entries.length - 1;
    down.addEventListener('click', (e) => {
        e.stopPropagation();
        const next = [...entries];
        [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
        commit(next);
    });
    controls.appendChild(down);

    const remove = document.createElement('button');
    remove.textContent = 'remove';
    remove.addEventListener('click', (e) => {
        e.stopPropagation();
        commit(entries.filter((_, i) => i !== idx));
    });
    controls.appendChild(remove);

    wrap.appendChild(controls);
    return wrap;
}

// Collapsible notes editor. `description` and `details` are editor-native (they
// back the info box and drill-down navigation). Everything else is driven by the
// configured `panels` (manager.panels): each panel that owns a `property` gets an
// editor rendered for the current entity, so domain concepts like "references"
// live entirely in the consumer's panel def. Key must be stable across
// re-renders so the open/closed state survives the full-panel rebuild after each
// edit. `patchProp(property, value)` writes a panel-backed property on the entity.
function renderNotesEditor(manager, key, entity, onDescription, onDetails, patchProp) {
    const wrap = document.createElement('div');
    wrap.className = 'ce-subgroup ce-notes';

    const panels = (manager.panels || []).filter((p) => p.property);

    const hasDesc = !!entity.description;
    const hasDetails = !!entity.details;
    const labelParts = ['description', 'details', ...panels.map((p) => p.name)];
    const filled = [
        hasDesc && 'desc',
        hasDetails && 'details',
        ...panels.map((p) => isNonEmptyValue(entity[p.property]) && p.name),
    ].filter(Boolean);
    const summary = filled.length ? ` (${filled.join(', ')})` : '';
    const labelText = labelParts.join(' / ');
    const isOpen = expandedNotes.has(key);

    const toggle = document.createElement('button');
    toggle.className = 'ce-notes-toggle';
    toggle.textContent = `${isOpen ? '▾' : '▸'} ${labelText}${summary}`;
    wrap.appendChild(toggle);

    const body = document.createElement('div');
    body.className = 'ce-notes-body';
    body.style.display = isOpen ? '' : 'none';
    body.appendChild(fieldRow('description', 'textarea', entity.description ?? '', onDescription));
    body.appendChild(selectRow('details', detailsOptions(manager, entity.details), entity.details ?? '', onDetails, 'none'));
    for (const panel of panels) {
        body.appendChild(renderPanelEditor(manager, panel, entity[panel.property],
            (next) => patchProp(panel.property, next)));
    }
    wrap.appendChild(body);

    toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const open = !expandedNotes.has(key);
        if (open) expandedNotes.add(key); else expandedNotes.delete(key);
        body.style.display = open ? '' : 'none';
        toggle.textContent = `${open ? '▾' : '▸'} ${labelText}${summary}`;
    });

    return wrap;
}

function isNonEmptyValue(v) {
    if (v == null) return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'object') return Object.keys(v).length > 0;
    return v !== '';
}

// Render the editor for one panel-backed property on the current entity.
// Three tiers (see panel def §8): imperative `renderEditor` (full control) →
// declarative `itemFields` schema → raw-JSON passthrough fallback.
function renderPanelEditor(manager, panel, value, onChange) {
    const title = (typeof panel.title === 'string' && panel.title) || panel.name;

    if (typeof panel.renderEditor === 'function') {
        const wrap = document.createElement('div');
        wrap.className = 'ce-subgroup';
        const heading = document.createElement('div');
        heading.className = 'ce-subheading';
        heading.textContent = title;
        wrap.appendChild(heading);
        panel.renderEditor(wrap, value, onChange, { manager, advancedMode });
        return wrap;
    }

    if (panel.itemFields) {
        return renderSchemaCollection(panel, title, value, onChange);
    }

    // Fallback: edit the raw value as JSON.
    return fieldRow(`${title} (JSON)`, 'textarea', JSON.stringify(value ?? null, null, 2), (val) => {
        let parsed;
        try { parsed = JSON.parse(val); } catch { return; }
        onChange(parsed);
    });
}

// Declarative list editor driven by a panel's `itemFields` schema. The value is
// a collection of items; each item renders an input per field. When the panel
// declares `itemKey`, the collection is stored as an object keyed by that field
// (e.g. references keyed by title) and round-trips in that shape; otherwise it
// is a plain array. Empty collections commit as null so the key is dropped.
function renderSchemaCollection(panel, title, rawValue, onChange) {
    const wrap = document.createElement('div');
    wrap.className = 'ce-subgroup';
    const heading = document.createElement('div');
    heading.className = 'ce-subheading';
    heading.textContent = title;
    wrap.appendChild(heading);

    const fieldNames = Object.keys(panel.itemFields);
    const itemKey = panel.itemKey ?? null;            // field that doubles as the object key
    const objectForm = itemKey != null;

    // Normalize stored value → array of item objects for editing.
    let items;
    if (Array.isArray(rawValue)) {
        items = rawValue.map((it) => ({ ...(it || {}) }));
    } else if (rawValue && typeof rawValue === 'object') {
        items = objectForm
            ? Object.entries(rawValue).map(([k, v]) => ({ [itemKey]: k, ...(v || {}) }))
            : Object.values(rawValue).map((v) => ({ ...(v || {}) }));
    } else {
        items = [];
    }

    const emit = (next) => {
        if (!next || next.length === 0) return onChange(null);
        if (!objectForm) return onChange(next);
        const obj = {};
        for (const item of next) {
            const { [itemKey]: k, ...rest } = item || {};
            obj[k ?? ''] = rest;
        }
        onChange(obj);
    };

    const setField = (idx, field, value, empty) => {
        const next = items.map((it, i) => (i === idx ? { ...it } : it));
        if (empty) delete next[idx][field];
        else next[idx][field] = value;
        emit(next);
    };

    items.forEach((item, idx) => {
        const entry = document.createElement('div');
        entry.className = 'ce-entry';
        for (const field of fieldNames) {
            const type = panel.itemFields[field];
            if (type === 'list') {
                entry.appendChild(fieldRow(field, 'textarea', listToText(item[field]), (val) => {
                    const arr = textToList(val);
                    setField(idx, field, arr, arr.length === 0);
                }));
            } else {
                entry.appendChild(fieldRow(field, type === 'textarea' ? 'textarea' : 'text', String(item[field] ?? ''), (val) => {
                    setField(idx, field, val, val === '');
                }));
            }
        }
        const remove = document.createElement('button');
        remove.textContent = 'remove';
        remove.addEventListener('click', (e) => {
            e.stopPropagation();
            emit(items.filter((_, i) => i !== idx));
        });
        entry.appendChild(remove);
        wrap.appendChild(entry);
    });

    const add = document.createElement('button');
    add.textContent = `+ add ${title.toLowerCase()}`;
    add.addEventListener('click', (e) => {
        e.stopPropagation();
        emit([...items, {}]);
    });
    wrap.appendChild(add);

    return wrap;
}

// 'list'-typed fields edit as newline-separated text (one value per line).
function listToText(value) {
    return Array.isArray(value) ? value.join('\n') : (value == null ? '' : String(value));
}
function textToList(text) {
    return text.split('\n').map((s) => s.trim()).filter(Boolean);
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
