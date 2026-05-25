// Translucent full-app overlay shown by the info button.
// Content is intentionally a placeholder for now.

const OVERLAY_ID = 'info-overlay';

export const showInfoOverlay = (event) => {
    event?.stopPropagation();

    if (document.getElementById(OVERLAY_ID)) {
        hideInfoOverlay();
        return;
    }

    const container = document.getElementById('main-container') || document.body;

    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;

    const panel = document.createElement('div');
    panel.className = 'info-overlay-panel';
    panel.textContent = 'Info';

    overlay.appendChild(panel);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) hideInfoOverlay();
    });

    container.appendChild(overlay);
};

export const hideInfoOverlay = () => {
    document.getElementById(OVERLAY_ID)?.remove();
};
