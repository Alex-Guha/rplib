import { showEditOptions } from '../sidebarMenu/editMenu.js';
import { showViews } from '../sidebarMenu/viewMenu.js';
import { createSettings } from '../sidebarMenu/settingsMenu.js';
import { showInfoOverlay } from './infoOverlay.js';
import { displayError } from '../utils/error.js';
import { setSidebarState, componentEditState } from '../utils/state.js'

import { appManager } from '../instance.js';

const navigation = d3.select("#navigation");

// The edit button stays visually pinned for the entire component-edit session,
// regardless of which sidebar menu (settings / views / etc.) is currently active.
const isPinnedHover = (buttonId) =>
    componentEditState.active && buttonId === 'edit-button';

// Handles changing views
export const navigateTo = (view) => {
    try {
        appManager.canvas.changeViews(view);
    } catch (error) {
        displayError(error.message);
    }
};

// Per-button visual configuration. `default` is used for any id not listed.
const BUTTON_CONFIG = {
    'settings-button': { strokeWidth: 1.2, fillOnHover: true },
    'views-button': { strokeWidth: 1, fillOnHover: true },
    'edit-button': { strokeWidth: 1.4, fillOnHover: false },
    'info-button': { strokeWidth: 1.2, fillOnHover: true },
    'default': { strokeWidth: 2, fillOnHover: false }
};

const getButtonConfig = (id) => BUTTON_CONFIG[id] || BUTTON_CONFIG.default;

const getButtonStates = (isEnabled, config) => {
    const theme = appManager.currentTheme;
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

export const drawNavigation = () => {
    // https://yqnn.github.io/svg-path-editor/
    const svg_paths = {
        back: "M7.5-10-7.5 0l15 10Z",
        forward: "M-7.5-10 7.5 0-7.5 10Z",
        reset: "M0-10A10 10 0 100 10 10 10 0 100-10",
        // https://observablehq.com/@jjhembd/gear-icon-generator
        settings: "M11 0l-.165 1.914-3.3.539-.803 1.738L8.426 7.073 7.073 8.426 4.191 6.732l-1.738.803-.539 3.3L0 11-1.111 7.854-2.959 7.359-5.5 9.526l-1.573-1.1 1.177-3.124-1.1-1.573-3.344.033-.495-1.848L-7.92.264-7.755-1.639-10.34-3.762-9.526-5.5l3.289.616L-4.884-6.237-5.5-9.526-3.762-10.34-1.639-7.755.264-7.92l1.65-2.915 1.848.495-.033 3.344 1.573 1.1L8.426-7.073 9.526-5.5 7.359-2.959l.495 1.848zM5.5 0a5.5 5.5 90 100 .0154z",
        dropdown: "M9 .375c.75 0 .75-.75 0-.75H-9c-.75 0-.75.75 0 .75Zm-18-7c-.75 0-.75-.75 0-.75H9c.75 0 .75.75 0 .75Zm0 13.25c-.75 0-.75.75 0 .75H9c.75 0 .75-.75 0-.75Z",

        // Before 0.23 scaling and 45 degree rotation: M-5-52Q-18-52-18-39V37Q-18 39-17 41L-2 62Q0 64 2 62L17 41Q18 39 18 37V-39Q18-52 5-52ZM18 37Q13 29 8 37 0 47-8 37-13 29-18 37V-32H18Z
        // Old alternate version: M-5-52.5Q-18-52.5-18-39.5V36.5Q-18 38.5-17 40.5L-2 61.5Q0 63.5 2 61.5L17 40.5Q18 38.5 18 36.5V-39.5Q18-52.5 5-52.5ZM-5-46.5H5Q12-46.5 12-39.5H-12Q-12-46.5-5-46.5ZM12 32.5Q9 28.5 6 32.5 0 40.5-6 32.5-9 28.5-12 32.5V-33.5H12ZM-12 38.5Q-9 34.5-6 38.5 0 44.5 6 38.5 9 34.5 12 38.5L0 55.5Z
        edit: "M7.6438-9.2702q-2.1142-2.1142-4.2285 0L-8.9449 3.0901q-.3253.3253-.4879.8132l-.9758 5.8548q0 .6505.6505.6505l5.8548-.9758q.4879-.1626.8132-.4879L9.2702-3.4153q2.1142-2.1142 0-4.2285ZM-3.0901 8.9449q.4879-2.1142-1.6263-1.6263-2.9274.3253-2.6022-2.6022.4879-2.1142-1.6263-1.6263L2.2769-8.1317 8.1317-2.2769Z",

        // Old alternate version: M-3 9c0 5 6 5 6 0V2C3-3-3-3-3 2ZM0-11A1 1 0 010-5 1 1 0 010-11
        // M-2 6c0 3 4 3 4 0V0C2-3-2-3-2 0ZM0-8A1 1 0 010-4 1 1 0 010-8m0-4A12 12 90 110 12 12 12 90 110-12
        info: "M0-11a1.1 1.1 90 000 4.4 1.1 1.1 90 000-4.4zM-2.2-1.1c0-3.3 4.4-3.3 4.4 0v9.9c0 3.3-4.4 3.3-4.4 0z"
    };

    navigation.selectAll('.nav-button').remove();
    drawButton('views-button', 0, svg_paths.dropdown, showViews, true);
    // In component-edit mode the arrows undo/redo edit-history entries instead
    // of view navigation — view changes are suppressed during a session anyway.
    const inEdit = componentEditState.active;
    const backHandler = inEdit ? appManager.canvas.undoEdit : appManager.canvas.undoViewChange;
    const forwardHandler = inEdit ? appManager.canvas.redoEdit : appManager.canvas.redoViewChange;
    const backEnabled = inEdit
        ? appManager.canvas.canEditUndo()
        : appManager.canvas.store.undoHistory.length > 0;
    const forwardEnabled = inEdit
        ? appManager.canvas.canEditRedo()
        : appManager.canvas.store.redoHistory.length > 0;
    drawButton('back-button', 50, svg_paths.back, backHandler, backEnabled);
    drawButton('forward-button', 100, svg_paths.forward, forwardHandler, forwardEnabled);
    drawButton('reset-button', 150, svg_paths.reset, appManager.canvas.resetZoom, true);
    drawButton('edit-button', 250, svg_paths.edit, showEditOptions, true);
    // TODO Move these to the right corner of the content area
    drawButton('settings-button', 200, svg_paths.settings, createSettings, true);
    drawButton('info-button', 300, svg_paths.info, showInfoOverlay, true);
};

function drawButton(id, x, shape, clickHandler, isEnabled) {
    const config = getButtonConfig(id);

    const group = navigation.append('g')
        .attr('class', 'nav-button')
        .attr('id', id)
        .attr('transform', `translate(${x + 5}, 5)`)
        .style('cursor', isEnabled ? 'pointer' : 'default');

    // Prevent dragging when hovering over the button
    group.on('mousedown', (event) => event.stopPropagation());

    const states = getButtonStates(isEnabled, config);

    // Use hover state if button has persistent hover, otherwise use normal state
    const initialState = ((appManager.sidebarState === id) || isPinnedHover(id)) && isEnabled
        ? states.hover
        : states.normal;

    // Button background
    const buttonRect = group.append('rect')
        .attr('width', 40)
        .attr('height', 40)
        .attr('rx', 5)
        .attr('ry', 5)
        .attr('fill', initialState.fill)
        .attr('stroke', initialState.border);

    // Button icon
    const buttonIcon = group.append('path')
        .attr('d', shape)
        .attr('fill', initialState.pathFill)
        .attr('stroke', initialState.pathStroke)
        .attr('stroke-width', config.strokeWidth)
        .attr('stroke-linecap', 'round')
        .attr('stroke-linejoin', 'round')
        .attr('transform', 'translate(20, 20)');

    if (isEnabled) {
        // Click handler
        group.on('click', function (event) {

            // Set persistent hover for menu buttons
            if (clickHandler === showViews || clickHandler === createSettings || clickHandler === showEditOptions) {
                setSidebarState(id);
                clickHandler(event);
            } else {
                setSidebarState(null);
                clickHandler();
            }
        });

        // Hover effects
        group.on('mouseover', function () {
            // Only apply hover effect if not in persistent state
            if (appManager.sidebarState !== id) {
                buttonRect.attr('fill', states.hover.fill);
                buttonIcon
                    .attr('stroke', states.hover.pathStroke)
                    .attr('fill', states.hover.pathFill);
            }
        });

        group.on('mouseout', function () {
            // Only revert hover effect if not in persistent state
            if (appManager.sidebarState !== id && !isPinnedHover(id)) {
                buttonRect.attr('fill', states.normal.fill);
                buttonIcon
                    .attr('stroke', states.normal.pathStroke)
                    .attr('fill', states.normal.pathFill);
            }
        });
    }
}

// Helper function to update a button's visual state
export function updateButtonState(buttonId) {
    const buttonGroup = d3.select(`#${buttonId}`);
    if (buttonGroup.empty()) return;

    const buttonRect = buttonGroup.select('rect');
    const buttonIcon = buttonGroup.select('path');

    // updateButtonState only runs for already-drawn (enabled) buttons,
    // so pass isEnabled=true to mirror the live state options.
    const states = getButtonStates(true, getButtonConfig(buttonId));
    const targetState = ((appManager.sidebarState === buttonId) || isPinnedHover(buttonId))
        ? states.hover
        : states.normal;

    buttonRect
        .attr('fill', targetState.fill)
        .attr('stroke', targetState.border);

    buttonIcon
        .attr('stroke', targetState.pathStroke)
        .attr('fill', targetState.pathFill);
}