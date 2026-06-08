// Translucent full-app overlay shown by the info button. Surfaces a quick
// orientation for editor users: nav-button callouts and a tabbed reference for
// the DSL bits that are easy to get wrong (text-property replacement, etc.).
//
// Heavier content lives in `docs.html` next to this file; the overlay links out
// to it rather than embedding the full thing.

const OVERLAY_ID = 'info-overlay';

// Each annotated nav button gets a label tethered to it by an arrow. The label
// sits at the tail end; the arrow head touches the button.
const NAV_CALLOUTS = [
    { id: 'views-button', text: 'Views — pick a diagram from the abstract → view hierarchy.' },
    { id: 'back-button', text: 'Back / forward through view history. In component-edit mode these become edit undo/redo.' },
    { id: 'reset-button', text: 'Reset pan & zoom.' },
    { id: 'settings-button', text: 'Per-view toggles (from the component\'s `settings` array).' },
    { id: 'edit-button', text: 'Edit mode — abstract editor + component editor. Arrows turn into edit undo/redo.' },
];

const TABS = [
    { id: 'nav', label: 'Using the app', render: renderNavTab },
    { id: 'dsl', label: 'DSL basics', render: renderDslTab },
    { id: 'props', label: 'Text properties', render: renderPropsTab },
    { id: 'edit', label: 'References & edit mode', render: renderEditTab },
    // { id: 'keys', label: 'Keyboard shortcuts', render: renderKeysTab },
];

export const showInfoOverlay = (event) => {
    event?.stopPropagation();

    if (document.getElementById(OVERLAY_ID)) {
        hideInfoOverlay();
        return;
    }

    const container = document.getElementById('main-container') || document.body;

    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;

    const calloutLayer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    calloutLayer.classList.add('info-overlay-callouts');
    overlay.appendChild(calloutLayer);

    const panel = document.createElement('div');
    panel.className = 'info-overlay-panel';

    panel.appendChild(buildHeader());
    const tabBar = document.createElement('div');
    tabBar.className = 'info-tabs';
    const content = document.createElement('div');
    content.className = 'info-tab-content';

    let activeTabId = TABS[0].id;
    const selectTab = (id) => {
        activeTabId = id;
        Array.from(tabBar.children).forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.tabId === id);
        });
        const tab = TABS.find((t) => t.id === id);
        content.innerHTML = '';
        content.appendChild(tab.render());
    };

    TABS.forEach((tab) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'info-tab';
        btn.dataset.tabId = tab.id;
        btn.textContent = tab.label;
        btn.addEventListener('click', () => selectTab(tab.id));
        tabBar.appendChild(btn);
    });
    panel.appendChild(tabBar);
    panel.appendChild(content);
    panel.appendChild(buildFooter());

    selectTab(activeTabId);

    overlay.appendChild(panel);

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay || e.target === calloutLayer) hideInfoOverlay();
    });

    container.appendChild(overlay);

    const onKey = (e) => {
        if (e.key === 'Escape') {
            e.stopPropagation();
            hideInfoOverlay();
        }
    };
    document.addEventListener('keydown', onKey);
    overlay.dataset.keyHandler = '1';
    overlay._onKey = onKey;

    requestAnimationFrame(() => drawCallouts(overlay, calloutLayer));

    // Re-draw on resize so arrows continue to track the buttons.
    const onResize = () => drawCallouts(overlay, calloutLayer);
    window.addEventListener('resize', onResize);
    overlay._onResize = onResize;
};

export const hideInfoOverlay = () => {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;
    if (overlay._onKey) document.removeEventListener('keydown', overlay._onKey);
    if (overlay._onResize) window.removeEventListener('resize', overlay._onResize);
    overlay.remove();
};

const buildHeader = () => {
    const header = document.createElement('div');
    header.className = 'info-header';
    const title = document.createElement('div');
    title.className = 'info-title';
    title.textContent = 'Quick guide';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'info-close';
    close.setAttribute('aria-label', 'Close');
    close.textContent = '×';
    close.addEventListener('click', hideInfoOverlay);
    header.appendChild(title);
    header.appendChild(close);
    return header;
};

const buildFooter = () => {
    const footer = document.createElement('div');
    footer.className = 'info-footer';
    const hint = document.createElement('span');
    hint.className = 'info-hint';
    hint.textContent = 'Esc or click outside to dismiss.';
    const docsLink = document.createElement('a');
    docsLink.className = 'info-docs-link';
    docsLink.textContent = 'Open full docs →';
    docsLink.href = new URL('../docs.html', import.meta.url).href;
    docsLink.target = '_blank';
    docsLink.rel = 'noopener';
    footer.appendChild(hint);
    footer.appendChild(docsLink);
    return footer;
};

// ----- Tab content -------------------------------------------------------

function el(tag, opts = {}, children = []) {
    const node = document.createElement(tag);
    if (opts.className) node.className = opts.className;
    if (opts.html != null) node.innerHTML = opts.html;
    else if (opts.text != null) node.textContent = opts.text;
    children.forEach((c) => node.appendChild(c));
    return node;
}

function renderNavTab() {
    const frag = document.createDocumentFragment();
    frag.appendChild(el('p', { text: 'The arrows on the canvas point at each nav button. The essentials in text:' }));
    const ul = el('ul');
    ul.appendChild(el('li', { html: '<b>Drag</b> to pan, <b>scroll</b> to zoom, <b>reset</b> to recenter.' }));
    ul.appendChild(el('li', { html: '<b>Hover</b> or <b>click</b> a diagram item — info + references populate the sidebar.' }));
    ul.appendChild(el('li', { html: '<b>Double-click</b> an item with a <code>details</code> ref to drill into a sub-component. Back/forward retrace the view history.' }));
    ul.appendChild(el('li', { html: '<b>Edit mode</b> silently re-purposes the back/forward arrows as edit undo/redo for the session.' }));
    frag.appendChild(ul);
    return frag;
}

function renderDslTab() {
    const frag = document.createDocumentFragment();
    frag.appendChild(el('p', { html: '<b>Abstracts</b> stitch together existing <b>components</b>. You\'ll usually author abstracts; components are the reusable building blocks.' }));
    frag.appendChild(el('p', { text: 'Minimal abstract:' }));
    frag.appendChild(el('pre', {
        text:
            `myArchitecture:
    componentA
    componentB:
        slotClass: alternativeComponent
    properties:
        modelName: GPT` }));
    const ul = el('ul');
    ul.appendChild(el('li', { html: '<code>references:</code> attaches sources; <code>properties:</code> feeds text replacement (see next tab); <code>className: componentName</code> swaps a slot for an alternative component.' }));
    ul.appendChild(el('li', { html: 'IDs must be unique across abstracts + components, and cannot end with <code>_&lt;int&gt;</code> (reserved by the parser).' }));
    frag.appendChild(ul);
    return frag;
}

function renderPropsTab() {
    const frag = document.createDocumentFragment();
    frag.appendChild(el('p', { html: 'Inside any <code>text</code> or <code>info</code> string in a component, <code>{{propertyName|default}}</code> is replaced by the abstract\'s <code>properties:</code> value (falling back to <code>default</code>).' }));
    frag.appendChild(el('pre', {
        text:
            `# in the component
text: "{{modelName|Model}} layer"

# in the abstract
properties:
    modelName: GPT

# renders as
GPT layer` }));
    frag.appendChild(el('p', { html: 'Note: a component\'s <code>settings</code> array (used by the settings menu to toggle visibility) is a <i>different</i> mechanism from <code>properties:</code> — don\'t conflate them.' }));
    return frag;
}

function renderEditTab() {
    const frag = document.createDocumentFragment();
    frag.appendChild(el('p', { html: '<b>Sidebar:</b> hovering or clicking a diagram item fills <code>#info</code> (description) and the <code>#panels</code> region (configured panels, e.g. references). <code>info</code> / <code>references</code> / <code>details</code> can be set at the component level (a default for everything inside) or overridden per-item / per-text / per-arrow.' }));
    frag.appendChild(el('p', { html: '<b>Edit mode:</b> the edit button unlocks the abstract editor and component editor. Edit-history undo/redo uses the same arrow buttons as view-history — but only one set of history is live at a time.' }));
    frag.appendChild(el('p', { html: 'Clicking another nav button while the abstract editor is open auto-exits edit mode and restores the previous view — so it looks like data loss, but the abstract text is preserved.' }));
    return frag;
}

// Commented out placeholder for when shortcuts get added.
// function renderKeysTab() {
//     const frag = document.createDocumentFragment();
//     frag.appendChild(el('p', { text: 'No keyboard shortcuts are wired up yet.' }));
//     return frag;
// }

// ----- Callouts ----------------------------------------------------------

function drawCallouts(overlay, layer) {
    while (layer.firstChild) layer.removeChild(layer.firstChild);

    const overlayRect = overlay.getBoundingClientRect();
    layer.setAttribute('width', overlayRect.width);
    layer.setAttribute('height', overlayRect.height);

    const present = NAV_CALLOUTS
        .map((c) => {
            const node = document.getElementById(c.id);
            if (!node) return null;
            const r = node.getBoundingClientRect();
            return {
                ...c,
                buttonCx: r.left + r.width / 2 - overlayRect.left,
                buttonBottom: r.bottom - overlayRect.top,
            };
        })
        .filter(Boolean);

    if (!present.length) return;

    // Arrows are L-shaped: down from each button, then a fixed-length
    // horizontal turn rightward to the label. Labels stagger downward so the
    // first label (longest arrow) sits at the bottom, last at the top.
    const labelW = 380;
    const labelH = 40;
    const stepY = 46;
    const turnLength = 22;
    const tailSpacer = 8;
    const cornerR = 6;
    const baseY = Math.max(...present.map((p) => p.buttonBottom)) + 36;

    ensureArrowDef(layer);

    const n = present.length;
    present.forEach((p, i) => {
        const labelY = baseY + (n - 1 - i) * stepY;
        const labelX = clamp(p.buttonCx + turnLength + tailSpacer, 8, overlayRect.width - labelW - 8);

        const fo = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
        fo.setAttribute('x', labelX);
        fo.setAttribute('y', labelY - labelH / 2);
        fo.setAttribute('width', labelW);
        fo.setAttribute('height', labelH);
        const div = document.createElement('div');
        div.className = 'info-callout-label align-left';
        div.textContent = p.text;
        fo.appendChild(div);
        layer.appendChild(fo);

        // Path: starts just left of the label, runs leftward to the elbow,
        // rounds the corner, then runs up to the button's bottom edge.
        const startX = labelX - tailSpacer;
        const startY = labelY;
        const elbowX = p.buttonCx;
        const headY = p.buttonBottom + 4;
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        line.setAttribute('d',
            `M${startX},${startY} ` +
            `L${elbowX + cornerR},${startY} ` +
            `Q${elbowX},${startY} ${elbowX},${startY - cornerR} ` +
            `L${elbowX},${headY}`);
        line.setAttribute('class', 'info-callout-arrow');
        line.setAttribute('marker-end', 'url(#info-arrowhead)');
        layer.appendChild(line);
    });
}

function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
}

function ensureArrowDef(layer) {
    const NS = 'http://www.w3.org/2000/svg';
    const defs = document.createElementNS(NS, 'defs');
    const marker = document.createElementNS(NS, 'marker');
    marker.setAttribute('id', 'info-arrowhead');
    marker.setAttribute('viewBox', '0 0 10 10');
    marker.setAttribute('refX', '8');
    marker.setAttribute('refY', '5');
    marker.setAttribute('markerWidth', '7');
    marker.setAttribute('markerHeight', '7');
    marker.setAttribute('orient', 'auto-start-reverse');
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', 'M0,0 L10,5 L0,10 z');
    path.setAttribute('fill', '#ffd24a');
    marker.appendChild(path);
    defs.appendChild(marker);
    layer.appendChild(defs);
}
