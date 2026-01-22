import drawText from "./utils/text.js";
import drawSubcomponent from "./utils/shapes.js";
import drawConnection from "./utils/arrows.js";
import resetZoom from './utils/zoom.js';
import renderElements from "./renderView.js";

import { loadAbstractDefinitions, saveAbstractDefinitions, clearAbstractDefinitions, loadRootView, saveRootView } from "./utils/storage.js";

import { parseAbstractDefinition, parseComponentView } from "./parser/parseIntermediateFormat.js";
import { parseAbstractDefinitionFile, parseAbstractContent } from "./parser/parseAbstractFile.js";
import serializeAbstractDefinition from "./parser/serializeAbstractFormat.js";

export default class RPCanvasManager {
    constructor(svgDOM, defaults, components, eventListenerTargets, elementToggleCallback) {
        this.svgDOM = svgDOM;
        this.canvasDOM = this.svgDOM.append("g").attr("id", "content");

        this.components = components;
        this.eventListenerTargets = eventListenerTargets;
        this.elementToggleCallback = elementToggleCallback;

        this.currentView = null;
        this.rootView = null;

        // Stores the intermediate architecture structures (so the file doesn't need to be parsed every time)
        this.abstractDefinitions = {}; // These objects may have a `properties` field, which text rendering uses to replace {{property}} placeholders.

        // Stores views so they don't need to be rebuilt every time
        this.views = {};

        // Used to display the view nav menu in the sidebar
        // TODO This is only used for one thing and should be refactored out of the library. The wrapping app can generate the desired viewStructure on the fly instead of during parsing
        this.viewStructures = {};

        // TODO? Refactor shape size and arrow size out (see todo in components.js), pass default view in as a parameter, and assume an inherent default theme
        this.defaults = defaults;

        // Theme should be unified with the parent app, so it should always be passed in as a parameter
        // Mandatory ARROW_COLOR, OPACITY, SHAPE_FILL, SHAPE_STROKE, TEXT_COLOR
        this.theme = defaults.THEME;

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
        if (this.undoHistory.length <= 0) return;
        this.redoHistory.push(this.currentView);
        const view = this.undoHistory.pop();
        if (this.abstractDefinitions[view])
            this.rootView = view;
        this.setCurrentView(view);
    };

    redoViewChange = () => {
        if (this.redoHistory.length <= 0) return;
        this.undoHistory.push(this.currentView);
        const view = this.redoHistory.pop();
        if (this.abstractDefinitions[view])
            this.rootView = view;
        this.setCurrentView(view);
    };

    // Any time the view changes, these other functions also occur
    // XXX When the view stays the same but this is called, it would be better to iterate the existing DOM and update colors rather than redrawing everything
    setCurrentView(view) {
        this.currentView = view;
        this.currentRenderId++;
        this.clearCanvas();
        this.resetZoom();
        this.renderElements();
        this.saveRootView();
    }


    // `callback` (optional) should accept an instance of `item` and return true if the text should be skipped
    drawText = (textObject, item, callback) => drawText(this, textObject, item, callback);
    drawSubcomponent = (item) => drawSubcomponent(this, item);
    // `callback` (optional) should accept an instance of `arrow` and return true if the arrow should be skipped
    drawConnection = (arrow, previousItem, item, callback) => drawConnection(this, arrow, previousItem, item, callback);

    renderElements() {
        const renderId = this.currentRenderId;
        renderElements(this, renderId, this.elementToggleCallback);
    }

    findHeirarchicalElementProperty = (id, property) => {
        //console.log(`${id}, ${property}`);
        //console.log(this.views[this.currentView].content);
        const idSegments = id.split('.') ?? [];
        while (idSegments.length > 0) {
            let result = this.views[this.currentView].content;
            idSegments.forEach((segment, index) => {
                const match = segment.match(/^(.*)_(\d+)$/);
                if (index > 0 && match) {
                    result = result[match[1]][match[2]];
                } else {
                    result = result?.[segment];
                }
            });
            if (result && Object.hasOwn(result, property)) {
                return result[property];
            }
            idSegments.pop();
        }
        return this.views[this.currentView].content?.[id]?.[property];
    }


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
    parseAbstractContent = (content) => parseAbstractContent(content);
    serializeAbstractDefinition = (abstractName, structure) => serializeAbstractDefinition(abstractName, structure);


    parseAbstractDefinition = (abstractName) => parseAbstractDefinition(this, abstractName);
    parseComponentView = (viewName, parentComponentChain = [], overrides = null) => parseComponentView(this, viewName, parentComponentChain, overrides);
}