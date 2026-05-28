import { EditorState } from '@codemirror/state';
import {
    EditorView,
    keymap,
    lineNumbers,
    drawSelection,
    rectangularSelection,
    crosshairCursor,
    highlightActiveLine,
    highlightActiveLineGutter,
} from '@codemirror/view';
import {
    indentOnInput,
    bracketMatching,
    foldGutter,
    foldKeymap,
    syntaxHighlighting,
    HighlightStyle,
    indentUnit,
} from '@codemirror/language';
import {
    defaultKeymap,
    history,
    historyKeymap,
    indentWithTab,
} from '@codemirror/commands';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import {
    completionKeymap,
    closeBrackets,
    closeBracketsKeymap,
} from '@codemirror/autocomplete';
import { lintKeymap } from '@codemirror/lint';
import { tags as t } from '@lezer/highlight';

// Highlight style for the abstract DSL. Pairs with tag-emitting decorations in
// dslHighlight.js and StreamLanguage-style tokens if/when added.
const dslHighlightStyle = HighlightStyle.define([
    { tag: t.heading, color: 'var(--text-default-color)', fontWeight: 'bold' },
    { tag: t.keyword, color: 'var(--text-default-color)', fontStyle: 'italic', opacity: 0.85 },
    { tag: t.definition(t.name), color: 'var(--text-default-color)', fontWeight: '600' },
    { tag: t.className, color: 'var(--arrow-stroke-color, #b07cff)' },
    { tag: t.typeName, color: 'var(--text-default-color)' },
    { tag: t.variableName, color: 'var(--text-default-color)' },
    { tag: t.propertyName, color: 'var(--text-default-color)', opacity: 0.8 },
    { tag: t.string, color: 'var(--text-default-color)', opacity: 0.7 },
    { tag: t.punctuation, color: 'var(--text-default-color)', opacity: 0.5 },
]);

const editorTheme = EditorView.theme({
    '&': {
        height: '100%',
        backgroundColor: 'var(--shape-fill-color)',
        color: 'var(--text-default-color)',
        borderRadius: '10px',
        fontSize: '13px',
    },
    '.cm-scroller': {
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        lineHeight: '1.5',
        padding: '6px 0',
    },
    '.cm-content': { caretColor: 'var(--text-default-color)' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--text-default-color)' },
    '&.cm-focused .cm-selectionBackground, ::selection': {
        background: 'var(--button-hover-fill-color)',
    },
    '.cm-gutters': {
        backgroundColor: 'transparent',
        color: 'var(--text-default-color)',
        opacity: 0.4,
        border: 'none',
    },
    '.cm-activeLine': { backgroundColor: 'rgba(255,255,255,0.03)' },
    '.cm-activeLineGutter': { backgroundColor: 'transparent' },
    '.cm-tooltip': {
        backgroundColor: 'var(--shape-fill-color)',
        color: 'var(--text-default-color)',
        border: '1px solid var(--text-default-color)',
        borderRadius: '6px',
    },
    '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': {
        backgroundColor: 'var(--button-hover-fill-color)',
    },
    // Swappable-slot decoration classes (driven by dslHighlight.js).
    '.cm-swappable-slot': {
        textDecoration: 'underline dashed',
        textUnderlineOffset: '3px',
    },
    '.cm-unknown-slot': {
        textDecoration: 'underline wavy',
        textDecorationColor: '#e0a060',
        textUnderlineOffset: '3px',
    },
}, { dark: true });

/**
 * Build a CodeMirror 6 EditorView wired with the standard extensions plus the
 * caller-supplied DSL extensions. The view is mounted into `parent`.
 *
 * @param {Object}   opts
 * @param {Element}  opts.parent
 * @param {string}   opts.doc                    initial document
 * @param {(view: EditorView) => void} [opts.onApply]   Ctrl/Cmd+S handler
 * @param {Array}    [opts.dslExtensions]        e.g. language, lint, autocomplete, decorations
 * @returns {EditorView}
 */
export function buildEditor({ parent, doc, onApply, dslExtensions = [] }) {
    const applyKey = keymap.of([{
        key: 'Mod-s',
        preventDefault: true,
        run: (view) => { onApply?.(view); return true; },
    }]);

    const state = EditorState.create({
        doc,
        extensions: [
            lineNumbers(),
            highlightActiveLineGutter(),
            history(),
            foldGutter(),
            drawSelection(),
            EditorState.allowMultipleSelections.of(true),
            indentOnInput(),
            indentUnit.of('    '),
            syntaxHighlighting(dslHighlightStyle, { fallback: true }),
            bracketMatching(),
            closeBrackets(),
            rectangularSelection(),
            crosshairCursor(),
            highlightActiveLine(),
            highlightSelectionMatches(),
            keymap.of([
                ...closeBracketsKeymap,
                ...defaultKeymap,
                ...searchKeymap,
                ...historyKeymap,
                ...foldKeymap,
                ...completionKeymap,
                ...lintKeymap,
                indentWithTab,
            ]),
            applyKey,
            editorTheme,
            EditorView.lineWrapping,
            ...dslExtensions,
        ],
    });

    return new EditorView({ state, parent });
}
