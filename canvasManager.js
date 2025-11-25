import drawText from "./drawingUtils/text.js";
import drawSubcomponent from "./drawingUtils/shapes.js";
import drawConnection from "./drawingUtils/arrows.js";
import { parseAbstractDefinition, parseComponentView } from "./parser.js";
import resetZoom from './utils/zoom.js';
import renderElements from "./renderView.js";
import { loadAbstractDefinitions, saveAbstractDefinitions, clearAbstractDefinitions, loadRootView, saveRootView } from "./utils/storage.js";
import { parseAbstractDefinitionFile } from "./parseAbstractFormat.js";

import * as components from '../../standard_items/components.js';

/*
    views: {}, // Stores views so they don't need to be rebuilt every time
    currentView: null, // Contains the name of the current view
    currentArchitecture: null, // Contains the name of the current architecture
    currentTheme: THEME, // This can also be found by looking up THEMES[settings['theme-selector'].state]
    viewStructure: {}, // Used to display the view nav menu in the sidebar - This is only used for one thing and could be rewritten to generate the desired viewStructure on the fly instead of during parsing
    architectures: {}, // Stores the intermediate architecture structures (so the file doesn't need to be parsed every time)
*/

export default class RPCanvasManager {
    constructor(svgDOM, theme) {
        this.svgDOM = svgDOM; // d3.select("#svg");
        this.canvasDOM = this.svgDOM.append("g").attr("id", "content");
        this.currentView = null;
        this.rootView = null; // currentArchitecture
        this.abstractDefinitions = {}; // architectures. These objects may have a `properties` field, which text rendering uses to replace {{property}} placeholders.
        this.views = {};
        this.viewStructures = {};
        this.theme = theme;
        this.components = components;
        this.renderDelay = false;
        this.currentRenderId = 0;
        this.defaults = {
            ARROW: {
                headSize: 10,
                width: 2,
            },
            SHAPE: {
                width: 100,
                height: 200,
                separation: 150
            }
        };
    };

    resetZoom = () => resetZoom(this.svgDOM, this.canvasDOM);
    clearCanvas = () => { this.canvasDOM.selectAll('*').remove(); };
    toggleRenderDelay = () => { this.renderDelay = !this.renderDelay; };


    changeDefaults = (ARROW, SHAPE) => {
        if (ARROW) {
            this.defaults.ARROW = ARROW;
        }
        if (SHAPE) {
            this.defaults.SHAPE = SHAPE;
        }
    };


    // `callback` (optional) should accept an instance of `item` and return true if the text should be skipped
    drawText = (item, callback) => drawText(this, item, callback);
    drawSubcomponent = (item) => drawSubcomponent(this, item);
    // `callback` (optional) should accept an instance of `arrow` and return true if the arrow should be skipped
    drawConnection = (arrow, previousItem, item, callback) => drawConnection(this, arrow, previousItem, item, callback);


    parseAbstractDefinition = (abstractName) => parseAbstractDefinition(this, abstractName);
    parseComponentView = (viewName, parentComponentChain = [], overrides = null) => parseComponentView(this, viewName, parentComponentChain, overrides);


    incrementRenderId = () => { this.currentRenderId++; };
    renderElements = (eventListenerTargets, elementCallback) => {
        const renderId = this.currentRenderId;
        renderElements(this, renderId, eventListenerTargets, elementCallback);
    };


    loadAbstractDefinitions = () => loadAbstractDefinitions(this);
    saveAbstractDefinitions = () => saveAbstractDefinitions(this);
    clearAbstractDefinitions = () => clearAbstractDefinitions(this); // Expected to be followed by initializeApp block
    loadRootView = (defaultView) => loadRootView(this, defaultView);
    saveRootView = () => saveRootView(this);

    parseAbstractDefinitionFile = async (filePath) => {
        try {
            this.abstractDefinitions = await parseAbstractDefinitionFile(filePath);
        } catch (error) {
            console.error('Error parsing architecture:', error);
        }
    };
}