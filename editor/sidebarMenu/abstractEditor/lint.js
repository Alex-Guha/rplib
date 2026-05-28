// Linter wrapping `parseAbstractContent` plus a name-collision diagnostic.
// Surface parse errors inline so the autosave path doesn't need to throw modals
// while the user is mid-typing. The modal stays on manual Apply.

import { linter } from '@codemirror/lint';
import { parseAbstractContent } from 'rplib/parser';
import { scanDocument, overrideSlotsFor } from './dslScan.js';

/**
 * @param {Object} getters
 * @param {() => string|null} getters.getCommittedName  the name we're editing in place
 * @param {() => Object} getters.getComponents
 * @param {() => Object} getters.getAbstractDefs
 */
export function makeDslLinter({ getCommittedName, getComponents, getAbstractDefs }) {
    return linter((view) => {
        const diagnostics = [];
        const doc = view.state.doc;
        const text = doc.toString();

        // Try a parse; if it throws, surface as a single doc-level diagnostic.
        let parsed = null;
        try {
            parsed = parseAbstractContent(text);
        } catch (e) {
            diagnostics.push({
                from: 0,
                to: Math.min(doc.length, doc.line(1).to),
                severity: 'error',
                message: e?.message || 'Parse error',
            });
        }

        // Name-collision warning when the parsed name doesn't match the
        // committed name AND it collides with another existing arch/component.
        if (parsed) {
            const parsedName = Object.keys(parsed)[0];
            const committed = getCommittedName?.();
            if (parsedName && parsedName !== committed) {
                const taken =
                    parsedName in (getAbstractDefs() || {}) ||
                    parsedName in (getComponents() || {});
                if (taken) {
                    // Underline the name on line 1.
                    const line1 = doc.line(1);
                    const m = /^([\w.-]+):/.exec(line1.text);
                    if (m) {
                        diagnostics.push({
                            from: line1.from,
                            to: line1.from + m[1].length,
                            severity: 'warning',
                            message: `"${parsedName}" is already used by another abstract or component`,
                        });
                    }
                }
            }
        }

        // Unknown-slot warnings: for each override line, if the parent
        // declares slots but our className isn't one of them, flag it.
        const components = getComponents() || {};
        const lines = [];
        for (let i = 1; i <= doc.lines; i++) lines.push(doc.line(i).text);
        const records = scanDocument(lines);
        for (let i = 0; i < records.length; i++) {
            const rec = records[i];
            if (!rec || rec.kind !== 'override' || !rec.parent) continue;
            const slots = overrideSlotsFor(components, rec.parent);
            if (slots.size === 0) continue;
            if (slots.has(rec.className)) continue;
            const lineStart = doc.line(i + 1).from;
            diagnostics.push({
                from: lineStart + rec.classRange[0],
                to: lineStart + rec.classRange[1],
                severity: 'warning',
                message:
                    `"${rec.className}" is not a declared slot on ${rec.parent}. ` +
                    `Known slots: ${Array.from(slots.keys()).join(', ') || '(none)'}`,
            });
        }

        return diagnostics;
    }, { delay: 250 });
}
