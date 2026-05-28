import { showViews } from '../sidebarMenu/viewMenu.js';
import { createSettings } from '../sidebarMenu/settingsMenu.js';
import { showInfoOverlay } from './infoOverlay.js';
import { displayError } from '../utils/error.js';
import { setSidebarState } from '../utils/state.js';

// Handles changing views
export const navigateTo = (manager, view) => {
    try {
        manager.canvas.changeViews(view);
    } catch (error) {
        displayError(error.message, manager);
    }
};

// Per-button visual configuration. `default` is used for any id not listed.
const BUTTON_CONFIG = {
    'settings-button': { strokeWidth: 1.2, fillOnHover: true },
    'views-button': { strokeWidth: 1, fillOnHover: true },
    'info-button': { strokeWidth: 1.2, fillOnHover: true },
    'default': { strokeWidth: 2, fillOnHover: false }
};

const getButtonConfig = (id) => BUTTON_CONFIG[id] || BUTTON_CONFIG.default;

const getButtonStates = (manager, isEnabled, config) => {
    const theme = manager.currentTheme;
    return {
        normal: {
            fill: isEnabled ? theme.BUTTON_FILL : theme.DISABLED_BUTTON_FILL,
            border: isEnabled ? theme.BUTTON_BORDER : theme.DISABLED_BUTTON_BORDER,
            pathStroke: isEnabled ? theme.BUTTON_SYMBOL_COLOR : theme.DISABLED_BUTTON_SYMBOL_COLOR,
            pathFill: 'none'
        },
        hover: {
            fill: theme.BUTTON_HOVER_FILL,
            border: theme.BUTTON_BORDER,
            pathStroke: theme.BUTTON_HOVER_SYMBOL_COLOR,
            pathFill: config.fillOnHover ? theme.BUTTON_HOVER_SYMBOL_COLOR : 'none'
        }
    };
};

export const drawNavigation = (manager) => {
    const svg_paths = {
        back: "M7.5-10-7.5 0l15 10Z",
        forward: "M-7.5-10 7.5 0-7.5 10Z",
        reset: "M0-10A10 10 0 100 10 10 10 0 100-10",
        settings: "M11 0l-.165 1.914-3.3.539-.803 1.738L8.426 7.073 7.073 8.426 4.191 6.732l-1.738.803-.539 3.3L0 11-1.111 7.854-2.959 7.359-5.5 9.526l-1.573-1.1 1.177-3.124-1.1-1.573-3.344.033-.495-1.848L-7.92.264-7.755-1.639-10.34-3.762-9.526-5.5l3.289.616L-4.884-6.237-5.5-9.526-3.762-10.34-1.639-7.755.264-7.92l1.65-2.915 1.848.495-.033 3.344 1.573 1.1L8.426-7.073 9.526-5.5 7.359-2.959l.495 1.848zM5.5 0a5.5 5.5 90 100 .0154z",
        dropdown: "M9 .375c.75 0 .75-.75 0-.75H-9c-.75 0-.75.75 0 .75Zm-18-7c-.75 0-.75-.75 0-.75H9c.75 0 .75.75 0 .75Zm0 13.25c-.75 0-.75.75 0 .75H9c.75 0 .75-.75 0-.75Z",
        info: "M0-11a1.1 1.1 90 000 4.4 1.1 1.1 90 000-4.4zM-2.2-1.1c0-3.3 4.4-3.3 4.4 0v9.9c0 3.3-4.4 3.3-4.4 0z"
    };

    const navigation = d3.select("#navigation");
    navigation.selectAll('.nav-button').remove();
    drawButton(manager, 'views-button', 0, svg_paths.dropdown, (e) => showViews(e, manager), true, { menu: true });
    drawButton(manager, 'back-button', 50, svg_paths.back, manager.canvas.undoViewChange, manager.canvas.store.undoHistory.length > 0);
    drawButton(manager, 'forward-button', 100, svg_paths.forward, manager.canvas.redoViewChange, manager.canvas.store.redoHistory.length > 0);
    drawButton(manager, 'reset-button', 150, svg_paths.reset, manager.canvas.resetZoom, true);
    drawButton(manager, 'settings-button', 200, svg_paths.settings, (e) => createSettings(e, manager), true, { menu: true });
    drawButton(manager, 'info-button', 250, svg_paths.info, showInfoOverlay, true);
};

function drawButton(manager, id, x, shape, clickHandler, isEnabled, opts = {}) {
    const config = getButtonConfig(id);
    const isMenu = !!opts.menu;
    const navigation = d3.select("#navigation");

    const group = navigation.append('g')
        .attr('class', 'nav-button')
        .attr('id', id)
        .attr('transform', `translate(${x + 5}, 5)`)
        .style('cursor', isEnabled ? 'pointer' : 'default');

    group.on('mousedown', (event) => event.stopPropagation());

    const states = getButtonStates(manager, isEnabled, config);

    const initialState = (manager.sidebarState === id) && isEnabled
        ? states.hover
        : states.normal;

    const buttonRect = group.append('rect')
        .attr('width', 40)
        .attr('height', 40)
        .attr('rx', 5)
        .attr('ry', 5)
        .attr('fill', initialState.fill)
        .attr('stroke', initialState.border);

    const buttonIcon = group.append('path')
        .attr('d', shape)
        .attr('fill', initialState.pathFill)
        .attr('stroke', initialState.pathStroke)
        .attr('stroke-width', config.strokeWidth)
        .attr('stroke-linecap', 'round')
        .attr('stroke-linejoin', 'round')
        .attr('transform', 'translate(20, 20)');

    if (isEnabled) {
        group.on('click', function (event) {
            if (isMenu) {
                setSidebarState(manager, id);
                clickHandler(event);
            } else {
                setSidebarState(manager, null);
                clickHandler();
            }
        });

        group.on('mouseover', function () {
            if (manager.sidebarState !== id) {
                buttonRect.attr('fill', states.hover.fill);
                buttonIcon
                    .attr('stroke', states.hover.pathStroke)
                    .attr('fill', states.hover.pathFill);
            }
        });

        group.on('mouseout', function () {
            if (manager.sidebarState !== id) {
                buttonRect.attr('fill', states.normal.fill);
                buttonIcon
                    .attr('stroke', states.normal.pathStroke)
                    .attr('fill', states.normal.pathFill);
            }
        });
    }
}

export function updateButtonState(manager, buttonId) {
    const buttonGroup = d3.select(`#${buttonId}`);
    if (buttonGroup.empty()) return;

    const buttonRect = buttonGroup.select('rect');
    const buttonIcon = buttonGroup.select('path');

    const states = getButtonStates(manager, true, getButtonConfig(buttonId));
    const targetState = (manager.sidebarState === buttonId)
        ? states.hover
        : states.normal;

    buttonRect
        .attr('fill', targetState.fill)
        .attr('stroke', targetState.border);

    buttonIcon
        .attr('stroke', targetState.pathStroke)
        .attr('fill', targetState.pathFill);
}
