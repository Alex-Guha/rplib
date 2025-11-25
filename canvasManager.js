import drawText from "./drawingUtils/text.js";
import drawSubcomponent from "./drawingUtils/shapes.js";
import drawConnection from "./drawingUtils/arrows.js";
import { parseAbstractDefinition, parseComponentView } from "./parser.js";

import * as components from '../../standard_items/components.js';

export class RPCanvasManager {
    constructor(canvasDOM, theme) {
        this.canvasDOM = canvasDOM; // d3.select("#content");
        this.currentView = null;
        this.rootView = null; // currentArchitecture
        this.abstractDefinitions = {}; // architectures. These objects may have a `properties` field, which text rendering uses to replace {{property}} placeholders.
        this.views = {};
        this.viewStructures = {};
        this.theme = theme;
        this.components = components;
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
    }

    changeDefaults = (ARROW, SHAPE) => {
        if (ARROW) {
            this.defaults.ARROW = ARROW;
        }
        if (SHAPE) {
            this.defaults.SHAPE = SHAPE;
        }
    }

    // `callback` (optional) should accept an instance of `item` and return true if the text should be skipped
    drawText = (item, callback) => drawText(this, item, callback); // import { checkSettingsToggle } from '../../utils/settings.js';

    drawSubcomponent = (item) => drawSubcomponent(this, item);

    // `callback` (optional) should accept an instance of `arrow` and return true if the arrow should be skipped
    drawConnection = (arrow, previousItem, item, callback) => drawConnection(this, arrow, previousItem, item, callback); // import { checkSettingsToggle } from '../../utils/settings.js';

    parseAbstractDefinition = (abstractName) => parseAbstractDefinition(this, abstractName);

    parseComponentView = (viewName, parentComponentChain = [], overrides = null) => parseComponentView(this, viewName, parentComponentChain, overrides);

}