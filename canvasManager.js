import drawText from "./drawingUtils/text.js";
import drawSubcomponent from "./drawingUtils/shapes.js";
import drawConnection from "./drawingUtils/arrows.js";
import { parseAbstractDefinition, parseComponentView } from "./parser.js";
import resetZoom from './utils/zoom.js';
import renderElements from "./renderView.js";
import { loadAbstractDefinitions, saveAbstractDefinitions, clearAbstractDefinitions, loadRootView, saveRootView } from "./utils/storage.js";
import { parseAbstractDefinitionFile } from "./parseAbstractFormat.js";

// TODO Separate out a lower level RPDiagramManager that this inherits from
export default class RPCanvasManager {
    constructor(svgDOM, defaults, components, eventListenerTargets, elementCallback) {
        this.svgDOM = svgDOM;
        this.canvasDOM = this.svgDOM.append("g").attr("id", "content");

        this.components = components;
        this.eventListenerTargets = eventListenerTargets;
        this.elementCallback = elementCallback;

        this.currentView = null;
        this.rootView = null;

        // Stores the intermediate architecture structures (so the file doesn't need to be parsed every time)
        this.abstractDefinitions = {}; // These objects may have a `properties` field, which text rendering uses to replace {{property}} placeholders.
        // Stores views so they don't need to be rebuilt every time
        this.views = {};

        // Used to display the view nav menu in the sidebar - This is only used for one thing and could be rewritten to generate the desired viewStructure on the fly instead of during parsing
        this.viewStructures = {};

        this.defaults = defaults;
        this.theme = defaults.THEME; // Mandatory ARROW_COLOR, OPACITY, SHAPE_FILL, SHAPE_STROKE, TEXT_COLOR

        this.renderDelay = false;
        this.currentRenderId = 0;

        this.undoHistory = [];
        this.redoHistory = [];
    };

    resetZoom = () => resetZoom(this.svgDOM, this.canvasDOM);
    clearCanvas = () => { this.canvasDOM.selectAll('*').remove(); };
    toggleRenderDelay = () => { this.renderDelay = !this.renderDelay; };


    changeViews = (view) => {
        let error = null;
        if (!this.views[view]) {
            if (this.abstractDefinitions[view]) {
                this.views[view] = this.parseAbstractDefinition(view);
                this.rootView = view;
            } else if (this.components[view])
                this.views[view] = this.parseComponentView(view);
            else {
                error = new Error(`Failed to Change Views\nView ${view} not found.\nFalling back to default.`);
                view = this.defaults.VIEW;
            }
        } else if (this.abstractDefinitions[view]) {
            this.rootView = view;
        }
        this.undoHistory.push(this.currentView);
        this.redoHistory = [];
        this.setCurrentView(view);
        if (error) throw error;
    };

    undoViewChange = () => {
        if (this.undoHistory.length <= 0) return false;
        this.redoHistory.push(this.currentView);
        const view = this.undoHistory.pop();
        if (this.abstractDefinitions[view])
            this.rootView = view;
        this.setCurrentView(view);
        return true;
    };

    redoViewChange = () => {
        if (this.redoHistory.length <= 0) return false;
        this.undoHistory.push(this.currentView);
        const view = this.redoHistory.pop();
        if (this.abstractDefinitions[view])
            this.rootView = view;
        this.setCurrentView(view);
        return true;
    };

    // Any time the view changes, these other functions also occur
    setCurrentView = (view) => {
        this.currentView = view;
        this.incrementRenderId();
        this.clearCanvas();
        this.resetZoom();
        this.renderElements();
        this.saveRootView();
    };


    // `callback` (optional) should accept an instance of `item` and return true if the text should be skipped
    drawText = (item, callback) => drawText(this, item, callback);
    drawSubcomponent = (item) => drawSubcomponent(this, item);
    // `callback` (optional) should accept an instance of `arrow` and return true if the arrow should be skipped
    drawConnection = (arrow, previousItem, item, callback) => drawConnection(this, arrow, previousItem, item, callback);


    parseAbstractDefinition = (abstractName) => parseAbstractDefinition(this, abstractName);
    parseComponentView = (viewName, parentComponentChain = [], overrides = null) => parseComponentView(this, viewName, parentComponentChain, overrides);


    incrementRenderId = () => { this.currentRenderId++; };
    renderElements = () => {
        const renderId = this.currentRenderId;
        renderElements(this, renderId, this.eventListenerTargets, this.elementCallback);
    };


    loadAbstractDefinitions = () => loadAbstractDefinitions(this);
    saveAbstractDefinitions = () => saveAbstractDefinitions(this);
    clearAbstractDefinitions = () => clearAbstractDefinitions(this);
    loadRootView = () => loadRootView(this);
    saveRootView = () => saveRootView(this);

    parseAbstractDefinitionFile = async (filePath) => {
        try {
            this.abstractDefinitions = await parseAbstractDefinitionFile(filePath);
        } catch (error) {
            console.error('Error parsing architecture:', error);
        }
    };
}