// Autocomplete for the abstract DSL.
//
// Suggestions come from three pools, intersected with the cursor's context:
//   - component IDs from `manager.canvas.components`
//   - abstract names from `manager.canvas.store.abstractDefinitions`
//   - override slots declared on the parent component at this indent level
//
// We re-scan the document on each request — the doc is short (a few hundred
// lines max) so this is well within the autocomplete budget.

import { scanDocument, overrideSlotsFor, SECTION_KEYWORDS } from './dslScan.js';

const wordPattern = /[\w.-]+/;

/**
 * Build a CompletionSource closed over a live components registry getter.
 * Abstract definitions are intentionally not surfaced — nesting an abstract
 * inside another abstract isn't supported by the parser/resolver.
 *
 * @param {Object} getters
 * @param {() => Object} getters.getComponents      `manager.canvas.components`
 */
export function makeCompletionSource({ getComponents }) {
    return (context) => {
        const word = context.matchBefore(wordPattern);
        if (!word) return null;
        if (word.from === word.to && !context.explicit) return null;

        const components = getComponents() || {};

        const doc = context.state.doc;
        const lineObj = doc.lineAt(context.pos);
        const lineText = lineObj.text;
        const colInLine = context.pos - lineObj.from;
        const beforeCursor = lineText.slice(0, colInLine);

        // Build scan up to this line for parent context.
        const lines = [];
        for (let i = 1; i <= doc.lines; i++) lines.push(doc.line(i).text);
        const records = scanDocument(lines);

        // Walk backwards to find the most recent line that establishes a
        // parent at indent <= our indent.
        const ourIndent = beforeCursor.match(/^ */)[0].length;
        let parent = null;
        let inSection = null;
        for (let i = lineObj.number - 2; i >= 0; i--) {
            const rec = records[i];
            if (!rec) continue;
            if (rec.indent >= ourIndent) continue;
            if (rec.kind === 'componentHeader') { parent = rec.name; break; }
            if (rec.kind === 'override') { parent = rec.componentName; break; }
            if (rec.kind === 'section') { inSection = rec.keyword; break; }
            if (rec.kind === 'archHeader') break;
        }

        const componentIds = Object.keys(components);
        const slots = parent ? overrideSlotsFor(components, parent) : null;

        // Detect "after-colon" context: `foo: ▏` → component suggestions only.
        const afterColon = /:\s*[\w.-]*$/.test(beforeCursor);

        const options = [];
        const seen = new Set();
        const push = (label, type, info, boost) => {
            if (seen.has(label)) return;
            seen.add(label);
            options.push(boost != null ? { label, type, info, boost } : { label, type, info });
        };

        if (inSection) {
            // Inside properties/references/generics: don't surface component
            // names — those would be misleading. Bail out cleanly so the
            // caller can fall through to whatever default exists.
            return null;
        }

        if (afterColon) {
            for (const id of componentIds) push(id, 'class', 'component', 0);
        } else {
            if (slots && slots.size > 0) {
                for (const [slotName, defaultComp] of slots) {
                    push(slotName, 'property', `override slot on ${parent} (default: ${defaultComp})`, 2);
                }
            }
            for (const id of componentIds) push(id, 'class', 'component', 0);
            for (const kw of SECTION_KEYWORDS) push(`${kw}:`, 'keyword', 'section', -2);
        }

        return {
            from: word.from,
            to: word.to,
            options,
            validFor: wordPattern,
        };
    };
}
