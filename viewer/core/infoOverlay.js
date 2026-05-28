// Translucent full-app overlay shown by the info button. Surfaces a quick
// orientation for viewer users: nav-button callouts and a short navigation
// cheat sheet. Authoring concerns (DSL, properties, references) belong in
// rplib-editor's overlay, not here.

const OVERLAY_ID = 'info-overlay';

const NAV_CALLOUTS = [
    { id: 'views-button', text: 'Views — pick a diagram from the abstract → view hierarchy.' },
    { id: 'back-button', text: 'Back / forward through view history.' },
    { id: 'reset-button', text: 'Reset pan & zoom.' },
    { id: 'settings-button', text: 'Theme and per-view toggles.' },
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

    const content = document.createElement('div');
    content.className = 'info-tab-content';
    content.appendChild(renderNavContent());
    panel.appendChild(content);

    panel.appendChild(buildFooter());

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
    footer.appendChild(hint);
    return footer;
};

function el(tag, opts = {}, children = []) {
    const node = document.createElement(tag);
    if (opts.className) node.className = opts.className;
    if (opts.html != null) node.innerHTML = opts.html;
    else if (opts.text != null) node.textContent = opts.text;
    children.forEach((c) => node.appendChild(c));
    return node;
}

function renderNavContent() {
    const frag = document.createDocumentFragment();
    frag.appendChild(el('p', { text: 'The arrows on the canvas point at each nav button. The essentials in text:' }));
    const ul = el('ul');
    ul.appendChild(el('li', { html: '<b>Drag</b> to pan, <b>scroll</b> to zoom, <b>reset</b> to recenter.' }));
    ul.appendChild(el('li', { html: '<b>Hover</b> or <b>click</b> a diagram item — info + references populate the sidebar.' }));
    ul.appendChild(el('li', { html: '<b>Double-click</b> an item with a <code>details</code> ref to drill into a sub-component. Back/forward retrace the view history.' }));
    frag.appendChild(ul);
    return frag;
}

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
