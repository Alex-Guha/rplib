// Component-creation mode. The user picks "Create new component" from the edit
// menu, lands on a blank seed component, and authors it directly in the canvas
// via the rplib live-update API. The single source of truth is
// `canvas.components[name]` — every form field reads from there on render,
// every change writes through `canvas.updateComponent`.

import { appManager } from '../instance.js';
import { navigateTo, drawNavigation } from '../core/navigation.js';
import { setSidebarState, componentEditState } from '../utils/state.js';
import { SHAPE } from '../defaults.js';
import {
    saveCustomComponent,
    removeCustomComponent,
    setPendingRename,
    clearPendingRename,
} from '../utils/storage.js';

// Per-session "advanced mode" flag — gates rarely-used numeric/styling fields.
// Kept module-local because it's pure view state with no persistence need.
let advancedMode = false;

// Which SHAPE default each shape-referencing numeric field hangs off of. Drives
// the percentage / fractional / multiplier shorthand parsing in parseShapeNumeric.
const SHAPE_FIELD_BASIS = {
    width: 'width', x: 'width', xSpacing: 'width', xOffset: 'width',
    height: 'height', y: 'height', ySpacing: 'height', yOffset: 'height',
    separation: 'separation',
};

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
    advancedMode = false;

    // Synthesize a transient abstract definition that wraps the component.
    canvas.store.abstractDefinitions[EDITING_VIEW] = {
        properties: {},
        content: { [name]: {} },
    };
    canvas.components[name] = { content: SEED_CONTENT() };

    // Edit-history is repurposed as the in-session undo stack for the arrow
    // buttons — start fresh so the user can't undo into prior unrelated state.
    canvas.clearEditHistory();
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
        highlightTarget();
        // Refresh the back/forward arrows' enabled state for the new history depth.
        drawNavigation();
    };
    canvas.on('afterMutate', autosave);
    componentEditState.autosaveUnsubscribe = () => {
        // Listener stays registered but gates on `active` — see autosave guard above.
        componentEditState.autosaveUnsubscribe = null;
    };

    componentEditState.onElementClick = handleElementClick;
    componentEditState.onBackgroundClick = () => {
        renderInfoPanel();
        highlightTarget();
    };
    // Delegate clicks at the canvas level so every shape is targetable —
    // attachElementEventListeners only fires for items that author
    // description/references, which a bare seed item does not.
    d3.select('#content').on('click.componentEditor', function (event) {
        const tag = event.target?.tagName;
        if (tag !== 'rect' && tag !== 'polygon') return;
        event.stopPropagation();
        handleElementClick({ currentTarget: event.target });
    });

    navigateTo(EDITING_VIEW);
    // navigateTo's afterViewChange hook resets the sidebar, so apply our
    // sidebar state + render after navigation.
    setSidebarState('edit-button');
    // Redraw nav so the arrows pick up the edit-mode handlers (afterViewChange
    // already drew them, but pre-active — at that point they wired to view nav).
    drawNavigation();
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
    componentEditState.onBackgroundClick = null;
    if (componentEditState.autosaveUnsubscribe) componentEditState.autosaveUnsubscribe();

    // Restore the user's saved render-delay preference. initializeSettings will
    // also do this on the navigateTo below, but only if there's a view to
    // restore to — handle it explicitly so the property is correct either way.
    const renderDelaySetting = appManager.settings['rendering-delay'];
    if (renderDelaySetting) canvas.renderDelay = renderDelaySetting.state;

    delete canvas.store.abstractDefinitions[EDITING_VIEW];
    canvas.invalidateView(EDITING_VIEW);
    d3.select('#content').on('click.componentEditor', null);
    d3.selectAll('.component-edit-target, .component-edit-target-group').classed('component-edit-target component-edit-target-group', false);

    setSidebarState(null);
    // Edit-history is per-session; drop entries so they can't leak into the
    // next session (and so consumers like view-nav arrows don't keep stale
    // canEditUndo/Redo state).
    canvas.clearEditHistory();
    if (restoreTo && canvas.store.abstractDefinitions[restoreTo]) {
        navigateTo(restoreTo);
    } else {
        // No restore view → afterViewChange won't fire, so redraw nav manually
        // to revert the arrows back to view-navigation handlers.
        drawNavigation();
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
            componentEditState.importedGroupPrefix = null;
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
    componentEditState.importedGroupPrefix = importedComponentName;
    renderInfoPanel();
    highlightTarget();
}

function highlightTarget() {
    d3.selectAll('.component-edit-target').classed('component-edit-target', false);
    d3.selectAll('.component-edit-target-group').classed('component-edit-target-group', false);
    if (!componentEditState.targetElementId) return;

    // The canvas renders via staggered requestAnimationFrame (renderDelay
    // defaults to true), so the just-added element may not be in the DOM yet
    // when we land here from an afterMutate callback. Retry across a handful
    // of frames until it shows up, then apply the class. The expected element
    // id is captured at scheduling time — if the user re-targets in the
    // meantime, we bail rather than fight a stale lookup.
    const expectedId = componentEditState.targetElementId;
    const expectedImportedGroup = componentEditState.targetIsImported
        ? componentEditState.importedGroupPrefix
        : null;
    let attempts = 0;
    const apply = () => {
        if (!componentEditState.active) return;
        if (componentEditState.targetElementId !== expectedId) return;
        if (expectedImportedGroup) {
            const matches = document.querySelectorAll(`#content rect[id^="${expectedImportedGroup}_"], #content polygon[id^="${expectedImportedGroup}_"]`);
            if (matches.length > 0) {
                matches.forEach((el) => d3.select(el).classed('component-edit-target-group', true));
                return;
            }
        } else {
            const el = document.getElementById(expectedId);
            if (el && (el.tagName === 'rect' || el.tagName === 'polygon')) {
                d3.select(el).classed('component-edit-target', true);
                return;
            }
        }
        if (++attempts < 30) requestAnimationFrame(apply);
    };
    apply();
}

// === UI render =================================================================

function renderInfoPanel() {
    const info = document.getElementById('info');
    info.innerHTML = '';

    const container = document.createElement('div');
    container.className = 'component-editor';

    const meta = renderMetaRows();
    container.appendChild(meta.importResetRow);
    container.appendChild(meta.addRemoveRow);

    const separator = document.createElement('hr');
    separator.className = 'ce-separator';
    container.appendChild(separator);

    container.appendChild(renderForm());

    info.appendChild(container);
    // Export + Advanced toggle sit outside the scrollable form container so
    // they stay pinned to the bottom of #info.
    info.appendChild(renderBottomButtons());
}

function renderItemIdRow(def) {
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
        renameItemKey(oldId, newId);
    };
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    });

    row.appendChild(label);
    row.appendChild(input);
    return row;
}

function validateItemId(id, oldId, def) {
    if (!id) return 'id cannot be empty.';
    if (/_\d+$/.test(id)) return 'id cannot end with _<number> (reserved by parser).';
    if (id === oldId) return null;
    if (def?.content && Object.hasOwn(def.content, id)) return `An item named "${id}" already exists.`;
    return null;
}

function renameItemKey(oldId, newId) {
    const name = componentEditState.name;
    const canvas = appManager.canvas;
    const def = canvas.components[name];
    if (!def?.content) return;
    // Rebuild content preserving insertion order, swapping the key and
    // rewriting any sibling `previous` / arrow.previous refs that pointed at it.
    const nextContent = {};
    for (const [k, v] of Object.entries(def.content)) {
        const key = k === oldId ? newId : k;
        const rewritten = { ...v };
        if (rewritten.previous === oldId) rewritten.previous = newId;
        if (Array.isArray(rewritten.arrow)) {
            rewritten.arrow = rewritten.arrow.map(a =>
                a && a.previous === oldId ? { ...a, previous: newId } : a
            );
        } else if (rewritten.arrow && rewritten.arrow.previous === oldId) {
            rewritten.arrow = { ...rewritten.arrow, previous: newId };
        }
        nextContent[key] = rewritten;
    }
    canvas.updateComponent(name, { content: nextContent });
    componentEditState.target = newId;
    componentEditState.targetElementId = `${name}_${newId}`;
    renderInfoPanel();
    highlightTarget();
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

function renderMetaRows() {
    const importResetRow = document.createElement('div');
    importResetRow.className = 'ce-row ce-meta';

    const hasNativeTarget = componentEditState.target && !componentEditState.targetIsImported;
    const importLabel = componentEditState.isSeed
        ? 'Import component'
        : (hasNativeTarget ? 'Insert component' : 'Add component at end');
    const importSelect = renderImportSelect(importLabel);

    const resetBtn = document.createElement('button');
    resetBtn.textContent = 'Reset';
    resetBtn.disabled = componentEditState.isSeed;
    resetBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!window.confirm('Reset will discard the current component. Continue?')) return;
        resetToSeed();
    });

    importResetRow.appendChild(importSelect);
    importResetRow.appendChild(resetBtn);

    const addRemoveRow = document.createElement('div');
    addRemoveRow.className = 'ce-row ce-meta';

    const addItemBtn = document.createElement('button');
    addItemBtn.textContent = hasNativeTarget ? 'Add item after target' : 'Add item at end';
    addItemBtn.disabled = componentEditState.targetIsImported;
    addItemBtn.addEventListener('click', (e) => { e.stopPropagation(); addItemAfterTarget(); });
    addRemoveRow.appendChild(addItemBtn);

    const def = appManager.canvas.components[componentEditState.name];
    const contentKeys = def?.content ? Object.keys(def.content) : [];
    // Only render Remove when it would actually do something — disabled is the
    // wrong affordance in the no-target / single-item cases.
    if (componentEditState.target && !componentEditState.targetIsImported && contentKeys.length > 1) {
        const removeBtn = document.createElement('button');
        removeBtn.textContent = 'Remove target';
        removeBtn.addEventListener('click', (e) => { e.stopPropagation(); removeTarget(); });
        addRemoveRow.appendChild(removeBtn);
    }

    return { importResetRow, addRemoveRow };
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

    wrap.appendChild(renderNameRow());
    wrap.appendChild(fieldRow('description', 'textarea', def.description ?? '', (val) => {
        patchComponentLevel({ description: val === '' ? null : val });
    }));
    wrap.appendChild(selectRow('details', detailsOptions(def.details), def.details ?? '', (val) => {
        patchComponentLevel({ details: val === '' ? null : val });
    }, 'none'));
    wrap.appendChild(renderReferencesEditor(
        def.references || [],
        (next) => patchComponentLevel({ references: next })
    ));

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
            componentEditState.importedGroupPrefix = null;
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

    // id rename (must come first; everything else patches under the current id)
    wrap.appendChild(renderItemIdRow(def));

    // shape
    wrap.appendChild(selectRow('shape', KNOWN_SHAPES, item.shape ?? 'box', (val) => {
        patchItem({ shape: val });
    }));
    if (item.shape === 'trapezoid' || item.shape === 'triangle') {
        wrap.appendChild(checkboxRow('flipped', !!item.flipped, (val) => {
            patchItem({ flipped: val ? true : null });
        }));
    }

    // -- positioning --
    wrap.appendChild(sectionSeparator('positioning'));
    wrap.appendChild(selectRow('position', POSITION_OPTIONS, item.position ?? '', (val) => {
        patchItem({ position: val === '' ? null : val });
    }));
    const siblingIds = Object.keys(def.content || {}).filter(k => k !== componentEditState.target);
    wrap.appendChild(selectRow('previous', ['', ...siblingIds], item.previous ?? '', (val) => {
        patchItem({ previous: val === '' ? null : val });
    }));
    if (advancedMode) {
        wrap.appendChild(pairRow(
            shapeNumberRow('x', item.x, (val) => patchItem({ x: val })),
            shapeNumberRow('y', item.y, (val) => patchItem({ y: val })),
        ));
    }

    // -- styling --
    wrap.appendChild(sectionSeparator('styling'));
    wrap.appendChild(pairRow(
        shapeNumberRow('width', item.width, (val) => patchItem({ width: val })),
        shapeNumberRow('height', item.height, (val) => patchItem({ height: val })),
    ));
    if (advancedMode) {
        wrap.appendChild(pairRow(
            plainNumberRow('count', item.count, (val) => patchItem({ count: val })),
            opacityRow(item.opacity, (val) => patchItem({ opacity: val })),
        ));
        wrap.appendChild(pairRow(
            shapeNumberRow('xSpacing', item.xSpacing, (val) => patchItem({ xSpacing: val })),
            shapeNumberRow('ySpacing', item.ySpacing, (val) => patchItem({ ySpacing: val })),
        ));
    }
    wrap.appendChild(shapeNumberRow('separation', item.separation, (val) => patchItem({ separation: val })));
    if (item.shape === 'trapezoid') {
        wrap.appendChild(plainNumberRow('shortSide', item.shortSide, (val) => patchItem({ shortSide: val })));
    }

    // -- content --
    wrap.appendChild(sectionSeparator('content'));
    wrap.appendChild(fieldRow('description', 'textarea', item.description ?? '', (val) => {
        patchItem({ description: val === '' ? null : val });
    }));
    if (advancedMode) {
        wrap.appendChild(selectRow('details', detailsOptions(item.details), item.details ?? '', (val) => {
            patchItem({ details: val === '' ? null : val });
        }, 'none'));
    }
    wrap.appendChild(renderReferencesEditor(
        item.references || [],
        (next) => patchItem({ references: next })
    ));
    wrap.appendChild(renderTextEntries(item.text, (next) => patchItem({ text: next })));
    wrap.appendChild(renderArrowEntries(item));

    return wrap;
}

// Renders a "Text" subgroup that reads from a text array and writes back via
// onChange. Same primitive is used for both item.text and arrow[i].text — the
// rplib data model treats them identically (arrows.js:129 iterates segment.text
// the same way text on shapes is handled).
function renderTextEntries(textValue, onChange) {
    const wrap = document.createElement('div');
    wrap.className = 'ce-subgroup';
    const heading = document.createElement('div');
    heading.className = 'ce-subheading';
    heading.textContent = 'Text';
    wrap.appendChild(heading);

    const entries = normalizeArray(textValue);
    // Empty payload commits as null so consumers don't end up with `text: []`.
    const commit = (next) => onChange(next && next.length ? next : null);
    entries.forEach((entry, idx) => wrap.appendChild(renderTextEntry(entry, idx, entries, commit)));

    const add = document.createElement('button');
    add.textContent = '+ add text';
    add.addEventListener('click', (e) => {
        e.stopPropagation();
        commit([...entries, { text: '' }]);
    });
    wrap.appendChild(add);
    return wrap;
}

function renderTextEntry(entry, idx, entries, commit) {
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
        commit(next);
    });
    latexRadio.input.addEventListener('change', () => {
        const next = [...entries];
        next[idx] = { ...entry, latexText: entry.latexText ?? entry.text ?? '' };
        delete next[idx].text;
        commit(next);
    });
    modeRow.appendChild(plainRadio.label);
    modeRow.appendChild(latexRadio.label);
    wrap.appendChild(modeRow);

    const fieldName = isLatex ? 'latexText' : 'text';
    wrap.appendChild(fieldRow(fieldName, 'text', entry[fieldName] ?? '', (val) => {
        const next = [...entries];
        next[idx] = { ...entry, [fieldName]: val };
        commit(next);
    }));
    wrap.appendChild(selectRow('position', TEXT_POSITIONS, entry.position ?? '', (val) => {
        const next = [...entries];
        next[idx] = { ...entry };
        if (val === '') delete next[idx].position; else next[idx].position = val;
        commit(next);
    }));
    if (advancedMode) {
        wrap.appendChild(pairRow(
            shapeNumberRow('xOffset', entry.xOffset, (val) => {
                const next = [...entries]; next[idx] = { ...entry };
                if (val == null) delete next[idx].xOffset; else next[idx].xOffset = val;
                commit(next);
            }),
            shapeNumberRow('yOffset', entry.yOffset, (val) => {
                const next = [...entries]; next[idx] = { ...entry };
                if (val == null) delete next[idx].yOffset; else next[idx].yOffset = val;
                commit(next);
            }),
        ));
        wrap.appendChild(fieldRow('color', 'text', entry.color ?? '', (val) => {
            const next = [...entries]; next[idx] = { ...entry };
            if (val === '') delete next[idx].color;
            else next[idx].color = isNaN(Number(val)) ? val : Number(val);
            commit(next);
        }));
        wrap.appendChild(fieldRow('description', 'textarea', entry.description ?? '', (val) => {
            const next = [...entries]; next[idx] = { ...entry };
            if (val === '') delete next[idx].description; else next[idx].description = val;
            commit(next);
        }));
        wrap.appendChild(selectRow('details', detailsOptions(entry.details), entry.details ?? '', (val) => {
            const next = [...entries]; next[idx] = { ...entry };
            if (val === '') delete next[idx].details; else next[idx].details = val;
            commit(next);
        }, 'none'));
        wrap.appendChild(renderReferencesEditor(entry.references || [], (refs) => {
            const next = [...entries]; next[idx] = { ...entry };
            if (refs && refs.length) next[idx].references = refs; else delete next[idx].references;
            commit(next);
        }));
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
    wrap.appendChild(renderTextEntries(entry.text, (textVal) => {
        const next = [...entries]; next[idx] = { ...entry };
        if (textVal == null) delete next[idx].text; else next[idx].text = textVal;
        patchItem({ arrow: next });
    }));
    if (advancedMode) {
        wrap.appendChild(pairRow(
            shapeNumberRow('xOffset', entry.xOffset, (val) => {
                const next = [...entries]; next[idx] = { ...entry };
                if (val == null) delete next[idx].xOffset; else next[idx].xOffset = val;
                patchItem({ arrow: next });
            }),
            shapeNumberRow('yOffset', entry.yOffset, (val) => {
                const next = [...entries]; next[idx] = { ...entry };
                if (val == null) delete next[idx].yOffset; else next[idx].yOffset = val;
                patchItem({ arrow: next });
            }),
        ));
        wrap.appendChild(plainNumberRow('extraLength', entry.extraLength, (val) => {
            const next = [...entries]; next[idx] = { ...entry };
            if (val == null) delete next[idx].extraLength; else next[idx].extraLength = val;
            patchItem({ arrow: next });
        }));
        wrap.appendChild(checkboxRow('noHead', !!entry.noHead, (val) => {
            const next = [...entries]; next[idx] = { ...entry };
            if (val) next[idx].noHead = true; else delete next[idx].noHead;
            patchItem({ arrow: next });
        }));
        wrap.appendChild(fieldRow('description', 'textarea', entry.description ?? '', (val) => {
            const next = [...entries]; next[idx] = { ...entry };
            if (val === '') delete next[idx].description; else next[idx].description = val;
            patchItem({ arrow: next });
        }));
        wrap.appendChild(selectRow('details', detailsOptions(entry.details), entry.details ?? '', (val) => {
            const next = [...entries]; next[idx] = { ...entry };
            if (val === '') delete next[idx].details; else next[idx].details = val;
            patchItem({ arrow: next });
        }, 'none'));
        wrap.appendChild(renderReferencesEditor(entry.references || [], (refs) => {
            const next = [...entries]; next[idx] = { ...entry };
            if (refs && refs.length) next[idx].references = refs; else delete next[idx].references;
            patchItem({ arrow: next });
        }));
    }

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

function renderBottomButtons() {
    const row = document.createElement('div');
    row.className = 'ce-bottom-row';

    const exportBtn = document.createElement('button');
    exportBtn.textContent = 'Export';
    exportBtn.addEventListener('click', (e) => { e.stopPropagation(); exportComponent(); });

    const advBtn = document.createElement('button');
    advBtn.textContent = 'Advanced';
    if (advancedMode) advBtn.classList.add('ce-advanced-active');
    advBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        advancedMode = !advancedMode;
        renderInfoPanel();
    });

    row.appendChild(exportBtn);
    row.appendChild(advBtn);
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

// Plain numeric field — text input (no spinner arrows), accepts any number.
function plainNumberRow(name, value, onCommit) {
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
function shapeNumberRow(name, value, onCommit) {
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
function opacityRow(value, onCommit) {
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

function parseShapeNumeric(raw, basis) {
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
function pairRow(left, right) {
    const row = document.createElement('div');
    row.className = 'ce-row ce-pair';
    left.classList.add('ce-pair-half');
    right.classList.add('ce-pair-half');
    row.appendChild(left);
    row.appendChild(right);
    return row;
}

function sectionSeparator(text) {
    const sep = document.createElement('div');
    sep.className = 'ce-section-sep';
    const label = document.createElement('span');
    label.textContent = text;
    sep.appendChild(label);
    return sep;
}

function selectRow(name, options, value, onCommit, emptyLabel = '(default)') {
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
    // With no target (component-level mode) append at the end and anchor on
    // the last existing key; with a target, splice in immediately after it.
    const keys = Object.keys(def.content);
    const anchor = target && keys.includes(target) ? target : keys[keys.length - 1];
    const next = {};
    if (!anchor) {
        next[newId] = { shape: 'box' };
    } else {
        for (const [k, v] of Object.entries(def.content)) {
            next[k] = v;
            if (k === anchor) next[newId] = { shape: 'box', previous: anchor, position: 'right' };
        }
    }
    canvas.updateComponent(name, { content: next });
    componentEditState.target = newId;
    componentEditState.targetIsImported = false;
    componentEditState.importedGroupPrefix = null;
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

    // Re-anchor any items whose `previous` pointed at the removed item to its
    // own `previous` (or drop the field entirely if it had none). Without this
    // the dangling reference breaks layout and the renderer warns about it.
    const removedPrev = def.content[target]?.previous;
    const nextContent = {};
    for (const [k, v] of Object.entries(def.content)) {
        if (k === target) continue;
        if (v?.previous === target) {
            const rewritten = { ...v };
            if (removedPrev) rewritten.previous = removedPrev;
            else delete rewritten.previous;
            nextContent[k] = rewritten;
        } else {
            nextContent[k] = v;
        }
    }

    canvas.updateComponent(name, { content: nextContent });
    const remaining = Object.keys(nextContent);
    componentEditState.target = remaining[0];
    componentEditState.targetIsImported = !!nextContent[remaining[0]]?.component;
    componentEditState.importedGroupPrefix = null;
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

function renderImportSelect(label) {
    const select = document.createElement('select');
    select.className = 'ce-import-select';

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = label;
    placeholder.disabled = true;
    placeholder.selected = true;
    select.appendChild(placeholder);

    const choices = Object.keys(appManager.canvas.components)
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
        importComponent(choice);
    });
    return select;
}

function importComponent(choice) {
    const canvas = appManager.canvas;
    if (!canvas.components[choice]) return;

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
        componentEditState.importedGroupPrefix = null;
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

// Components available as a `details` target. The parser's handleDetails path
// only resolves names that exist in `canvas.components` (architectures in
// abstractDefinitions aren't supported as detail targets), so the dropdown
// mirrors that. Excludes the currently-edited component to prevent
// self-referential cycles, and preserves an out-of-list current value so
// pre-existing data isn't silently dropped on render.
function detailsOptions(currentValue) {
    const opts = new Set(['']);
    for (const name of Object.keys(appManager.canvas.components)) {
        if (name === componentEditState.name) continue;
        opts.add(name);
    }
    if (currentValue && !opts.has(currentValue)) opts.add(currentValue);
    return Array.from(opts);
}

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
    // IMPORTANT: do not use a `_\d+$` suffix here — the parser strips that
    // pattern when resolving component refs (parseIntermediateFormat.js:86),
    // so `new_component_1` would resolve back to `new_component` and pick up
    // whatever stale definition lives under that name. Letter suffixes are
    // safe because the strip regex only matches digits.
    const taken = new Set(Object.keys(appManager.canvas.components));
    if (!taken.has(base)) return base;
    for (let i = 0; i < 26; i++) {
        const candidate = `${base}_${String.fromCharCode(97 + i)}`;
        if (!taken.has(candidate)) return candidate;
    }
    // Fall back to a timestamp suffix — extremely unlikely path.
    return `${base}_t${Date.now()}`;
}

function validateComponentName(name) {
    if (!name) return 'Name cannot be empty.';
    if (/_\d+$/.test(name)) return 'Name cannot end with _<number> (reserved by parser).';
    if (name === componentEditState.name) return null;
    if (appManager.canvas.components[name]) return `A component named "${name}" already exists.`;
    return null;
}
