// ViewPlugin that paints DSL syntax + swappable-slot indicators by scanning
// the document as plain text. We use Decorations rather than a StreamLanguage
// because (a) the DSL is line-based, (b) we need cross-line context (parent
// component) to decide what a className means, and (c) the swappable lookup
// is already cheapest in the same pass.

import { ViewPlugin, Decoration, hoverTooltip } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import { scanDocument, overrideSlotsFor } from './dslScan.js';

const headerMark = Decoration.mark({ class: 'cm-dsl-header', attributes: { 'data-token': 'heading' } });
const sectionMark = Decoration.mark({ class: 'cm-dsl-section', attributes: { 'data-token': 'keyword' } });
const componentHeaderMark = Decoration.mark({ class: 'cm-dsl-comp-header' });
const componentRefMark = Decoration.mark({ class: 'cm-dsl-comp-ref' });
const propertyKeyMark = Decoration.mark({ class: 'cm-dsl-prop-key' });
const propertyValueMark = Decoration.mark({ class: 'cm-dsl-prop-value' });

const swappableMark = (defaultComponent) => Decoration.mark({
    class: 'cm-swappable-slot',
    attributes: { 'data-default-component': defaultComponent || '' },
});
const unknownSlotMark = Decoration.mark({ class: 'cm-unknown-slot' });

/**
 * Build a ViewPlugin that decorates the visible viewport.
 *
 * @param {() => Object} getComponents  returns manager.canvas.components
 */
export function makeDslHighlighter(getComponents) {
    return ViewPlugin.fromClass(class {
        constructor(view) { this.decorations = this.build(view); }
        update(u) {
            if (u.docChanged || u.viewportChanged) {
                this.decorations = this.build(u.view);
            }
        }
        build(view) {
            const builder = new RangeSetBuilder();
            const doc = view.state.doc;
            const components = getComponents() || {};

            // We must scan the whole doc to keep the indent stack consistent;
            // we only emit decorations for lines within the viewport.
            const lines = [];
            for (let i = 1; i <= doc.lines; i++) lines.push(doc.line(i).text);
            const records = scanDocument(lines);

            const visible = new Set();
            for (const { from, to } of view.visibleRanges) {
                const fromLine = doc.lineAt(from).number;
                const toLine = doc.lineAt(to).number;
                for (let n = fromLine; n <= toLine; n++) visible.add(n);
            }

            for (let i = 0; i < records.length; i++) {
                const rec = records[i];
                if (!rec) continue;
                const lineNum = i + 1;
                if (!visible.has(lineNum)) continue;
                const lineStart = doc.line(lineNum).from;
                const at = (range) => [lineStart + range[0], lineStart + range[1]];

                switch (rec.kind) {
                    case 'archHeader': {
                        const [a, b] = at(rec.nameRange);
                        builder.add(a, b, headerMark);
                        break;
                    }
                    case 'section': {
                        const [a, b] = at(rec.keywordRange);
                        builder.add(a, b, sectionMark);
                        break;
                    }
                    case 'componentHeader': {
                        const [a, b] = at(rec.nameRange);
                        builder.add(a, b, componentHeaderMark);
                        break;
                    }
                    case 'override': {
                        // Highlight the className relative to its parent's slots.
                        const slots = rec.parent ? overrideSlotsFor(components, rec.parent) : null;
                        const [ca, cb] = at(rec.classRange);
                        if (slots && slots.size > 0) {
                            if (slots.has(rec.className)) {
                                builder.add(ca, cb, swappableMark(slots.get(rec.className)));
                            } else {
                                builder.add(ca, cb, unknownSlotMark);
                            }
                        } else {
                            builder.add(ca, cb, componentHeaderMark);
                        }
                        const [va, vb] = at(rec.componentRange);
                        builder.add(va, vb, componentRefMark);
                        break;
                    }
                    case 'bareRef': {
                        const [a, b] = at(rec.nameRange);
                        builder.add(a, b, componentRefMark);
                        break;
                    }
                    case 'keyValue': {
                        if (rec.inSection === 'properties') {
                            const [ka, kb] = at(rec.keyRange);
                            builder.add(ka, kb, propertyKeyMark);
                            const [va, vb] = at(rec.valueRange);
                            builder.add(va, vb, propertyValueMark);
                        }
                        break;
                    }
                    default:
                        break;
                }
            }

            return builder.finish();
        }
    }, { decorations: (v) => v.decorations });
}

/**
 * Hover tooltip on swappable / unknown class tokens.
 */
export function makeDslHoverTooltip(getComponents) {
    return hoverTooltip((view, pos) => {
        const doc = view.state.doc;
        const lineObj = doc.lineAt(pos);
        const lines = [];
        for (let i = 1; i <= doc.lines; i++) lines.push(doc.line(i).text);
        const records = scanDocument(lines);
        const rec = records[lineObj.number - 1];
        if (!rec || rec.kind !== 'override') return null;
        const lineStart = lineObj.from;
        const [ca, cb] = [lineStart + rec.classRange[0], lineStart + rec.classRange[1]];
        if (pos < ca || pos > cb) return null;
        const slots = rec.parent ? overrideSlotsFor(getComponents() || {}, rec.parent) : null;
        if (!slots) return null;

        const create = () => {
            const dom = document.createElement('div');
            dom.style.padding = '6px 10px';
            if (slots.has(rec.className)) {
                dom.textContent = `Override slot on ${rec.parent} — default: ${slots.get(rec.className)}`;
            } else if (slots.size === 0) {
                dom.textContent = `${rec.parent} declares no override slots`;
            } else {
                const known = Array.from(slots.keys()).join(', ');
                dom.textContent = `Unknown slot "${rec.className}" on ${rec.parent}. Known: ${known}`;
            }
            return { dom };
        };

        return { pos: ca, end: cb, above: true, create };
    });
}

