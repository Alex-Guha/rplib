// Panel system — the generic sidebar-content mechanism shared by rplib-editor
// and rplib-viewer. Core ships only the mechanism (PanelHost, the ctx builder,
// renderRichText, definePanel); it contains *no* built-in panel renderers.
// Consumers configure an ordered array of panel defs (e.g. a references panel)
// and pass it via `createEditor({ panels })` / `createViewer({ panels })`.
//
// Exported as `@alexguha/rplib/panel`.

// ── rich-text rendering ──────────────────────────────────────────────────────
// Append `text` to `parent`, converting newlines to <br> elements.
// `paragraphBreak: true` doubles the spacing (two <br>s per newline).
function appendMultilineText(parent, text, { paragraphBreak = false } = {}) {
    const lines = text.split('\n');
    lines.forEach((line, index) => {
        parent.appendChild(document.createTextNode(line));
        if (index < lines.length - 1) {
            parent.appendChild(document.createElement('br'));
            if (paragraphBreak) parent.appendChild(document.createElement('br'));
        }
    });
}

/**
 * Render formatted content into a target element: `**bold**`, `$$latex$$`
 * (rendered with the global `katex`), and plain text with newline handling.
 * This is the former editor/viewer `renderInfoContent`, hoisted into core so
 * both UIs — and consumer-supplied panels (e.g. the references hover preview) —
 * share one implementation.
 *
 * @param {string} content
 * @param {HTMLElement} element
 */
export function renderRichText(content, element) {
    let currentIndex = 0;
    while (currentIndex < content.length) {
        if (content.startsWith('$$', currentIndex)) {
            currentIndex = handleLaTeXContent(content, currentIndex, element);
        } else if (content.startsWith('**', currentIndex)) {
            currentIndex = handleBoldContent(content, currentIndex, element);
        } else {
            currentIndex = handlePlainText(content, currentIndex, element);
        }
    }
}

function handleLaTeXContent(content, currentIndex, element) {
    const endIndex = content.indexOf('$$', currentIndex + 2);
    if (endIndex === -1) {
        console.error('Unclosed LaTeX at position', currentIndex);
        return content.length;
    }
    const latexContent = content.slice(currentIndex + 2, endIndex);
    const span = document.createElement('span');
    katex.render(latexContent, span, {
        throwOnError: false,
        displayMode: false,
    });
    element.appendChild(span);
    return endIndex + 2;
}

function handleBoldContent(content, currentIndex, element) {
    const endIndex = content.indexOf('**', currentIndex + 2);
    if (endIndex === -1) {
        console.error('Unclosed bold at position', currentIndex);
        return content.length;
    }
    const boldContent = content.slice(currentIndex + 2, endIndex);
    const strong = document.createElement('strong');
    strong.textContent = boldContent;
    element.appendChild(strong);
    return endIndex + 2;
}

function handlePlainText(content, currentIndex, element) {
    const nextSpecialChar = Math.min(
        content.indexOf('$$', currentIndex) === -1 ? Infinity : content.indexOf('$$', currentIndex),
        content.indexOf('**', currentIndex) === -1 ? Infinity : content.indexOf('**', currentIndex)
    );
    const textContent = content.slice(currentIndex, nextSpecialChar === Infinity ? undefined : nextSpecialChar);
    appendMultilineText(element, textContent);
    return nextSpecialChar === Infinity ? content.length : nextSpecialChar;
}

// ── panel definition ─────────────────────────────────────────────────────────
/**
 * Normalize a consumer-supplied panel definition. A panel owns display + edit +
 * data-key as one unit, so an entire domain concept (e.g. "references") can live
 * entirely in the consumer with no privileged access to the library.
 *
 * Display:
 *   - `name`     {string}   unique key (required)
 *   - `title`    {string|(ctx)=>string} optional heading
 *   - `property` {string}   element/view property to resolve as the panel's data
 *   - `resolve`  {(ctx)=>any} full-control alternative to `property`
 *   - `render`   {(container, data, ctx)=>void} builds DOM from resolved data (required)
 *   - `showWhen` {(data, ctx)=>boolean} optional; hide empty panels (default: data != null)
 *   - `theme`    {{background?: string}} optional theme key(s)
 *
 * Editability (consumed by rplib-editor's component editor):
 *   - `collection` {'list'} value is an array of items
 *   - `itemFields` {Record<string, 'text'|'textarea'|'list'>} schema-driven editor
 *   - `renderEditor` {(container, value, onChange, ctx)=>void} imperative escape hatch
 *   (a panel with none of these edits as raw JSON — the automatic fallback)
 *
 * @param {object} def
 * @returns {object} the normalized def
 */
export function definePanel(def) {
    if (!def || typeof def !== 'object') {
        throw new Error('definePanel: expected a panel-definition object.');
    }
    if (!def.name || typeof def.name !== 'string') {
        throw new Error('definePanel: `name` is required and must be a string.');
    }
    if (typeof def.render !== 'function') {
        throw new Error(`definePanel("${def.name}"): \`render\` is required and must be a function.`);
    }
    if (def.property == null && typeof def.resolve !== 'function') {
        throw new Error(`definePanel("${def.name}"): supply either \`property\` or a \`resolve\` function.`);
    }
    return {
        showWhen: (data) => data != null,
        ...def,
    };
}

// ── context object ───────────────────────────────────────────────────────────
/**
 * Build the per-update context handed to every panel's `resolve`/`render`.
 * The seam that keeps panels from reaching into `manager`/`canvas` internals.
 *
 * @param {object}      opts
 * @param {object}      opts.manager  the editor/viewer AppManager
 * @param {string|null} [opts.id]     hovered element id, or null on reset
 * @param {HTMLElement} [opts.infoEl] the info pane used by `attachHoverPreview`
 *                                    (defaults to `#info`)
 * @returns {object} ctx
 */
export function buildPanelContext({ manager, id = null, infoEl } = {}) {
    const canvas = manager.canvas;
    const view = canvas.store.currentView;
    const resolvedInfoEl = infoEl ?? document.getElementById('info');

    return {
        manager,
        id,
        view,
        get viewData() { return canvas.store.views[view] ?? null; },

        // The generalized data path (element → ancestor → view-level).
        resolveProperty(property) {
            return canvas.resolveProperty(id, property);
        },

        // Bold/LaTeX/plaintext renderer (former renderInfoContent).
        renderRichText,

        // Reference-style hover preview: while hovering `linkEl`, swap the info
        // pane's content for the rich-text in `linkEl.dataset.info`, restoring
        // on mouseout. Was `attachReferenceEventListeners`.
        attachHoverPreview(linkEl) {
            attachHoverPreview(linkEl, resolvedInfoEl);
        },
    };
}

// Internal: native-event hover preview. Kept off `ctx` so the closure over the
// info element is captured once per `buildPanelContext`.
function attachHoverPreview(linkEl, infoEl) {
    let originalNodes = null;
    linkEl.style.cursor = 'pointer';
    linkEl.addEventListener('mouseover', () => {
        if (!infoEl) return;
        originalNodes = document.createDocumentFragment();
        while (infoEl.firstChild) originalNodes.appendChild(infoEl.firstChild);
        renderRichText(linkEl.dataset.info ?? '', infoEl);
    });
    linkEl.addEventListener('mouseout', () => {
        if (originalNodes !== null && infoEl) {
            infoEl.innerHTML = '';
            infoEl.appendChild(originalNodes);
            originalNodes = null;
        }
    });
}

// ── panel host ───────────────────────────────────────────────────────────────
/**
 * Owns the sidebar content region and renders an ordered array of panel defs
 * into stacked slots. Also handles transient takeover (errors / confirmations)
 * without any knowledge of the configured panels.
 */
export class PanelHost {
    /**
     * @param {HTMLElement} regionEl  the container element (e.g. `#panels`)
     * @param {object[]}    panels    ordered panel defs (may be empty)
     */
    constructor(regionEl, panels = []) {
        this.region = regionEl;
        this.panels = panels;
        this._lastCtx = null;
        this._transient = false;
    }

    /** Re-resolve and re-render all panels. Called on hover / view-change / reset. */
    update(ctx) {
        if (!this.region) return;
        this._lastCtx = ctx;
        this._transient = false;
        this._clear();

        let rendered = 0;
        for (const panel of this.panels) {
            const data = typeof panel.resolve === 'function'
                ? panel.resolve(ctx)
                : ctx.resolveProperty(panel.property);

            const show = typeof panel.showWhen === 'function' ? panel.showWhen(data, ctx) : data != null;
            if (!show) continue;

            const slot = this._makeSlot(panel.name);
            this._applyTheme(slot, panel.theme, ctx);

            const title = typeof panel.title === 'function' ? panel.title(ctx) : panel.title;
            if (title) {
                const h = document.createElement('h3');
                h.textContent = title;
                slot.appendChild(h);
            }

            panel.render(slot, data, ctx);
            this.region.appendChild(slot);
            rendered++;
        }

        // Collapse the region when nothing rendered (no panels, or all hidden via
        // showWhen) so the sibling info pane reclaims the space instead of
        // leaving a blank gap.
        this.region.style.display = rendered ? '' : 'none';
    }

    /**
     * Replace the panel content with caller-supplied transient content (errors,
     * confirmation dialogs). The renderer receives a fresh `.rplib-panel` slot.
     * @param {(slot: HTMLElement) => void} renderFn
     * @returns {HTMLElement} the slot, so callers can append controls
     */
    pushTransient(renderFn) {
        if (!this.region) return null;
        this._transient = true;
        this._clear();
        const slot = this._makeSlot('__transient__');
        renderFn(slot);
        this.region.appendChild(slot);
        return slot;
    }

    /** Re-run the normal panels, discarding any transient content. */
    restore() {
        if (this._lastCtx) this.update(this._lastCtx);
        else this._clear();
    }

    _clear() {
        this.region.innerHTML = '';
        // Drop any inline styles a previous transient takeover may have set on
        // the region itself.
        this.region.style.cssText = '';
    }

    _makeSlot(name) {
        const slot = document.createElement('div');
        slot.className = 'rplib-panel';
        slot.dataset.panel = name;
        return slot;
    }

    _applyTheme(slot, theme, ctx) {
        if (!theme) return;
        const palette = ctx?.manager?.currentTheme;
        if (theme.background && palette && palette[theme.background] != null) {
            slot.style.setProperty('background-color', palette[theme.background]);
        }
    }
}
