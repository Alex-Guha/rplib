import { setViewStructure, addDetailView } from "./viewStructures.js";

/**
This file contains functions to parse json definitions of abstracts provided by parseAbstractFile.js.
As such, it also contains functions to parse details and components, since they are used in abstracts.

When rendering, the view needs to strictly consist of subcomponents with their graph-like organization defined.
parseAbstractDefinition handles converting the abstract definitions, which consist of components,
    to this expected flat view structure by recursively unrolling the components and their content.
Additionally, when parsing the abstract, we also build the views for any details that are referenced in abstract components.
*/

/**
 * Resolve a top-level abstract definition into a flat view (root view).
 * Recursively unrolls components in `store.abstractDefinitions[abstractName]`.
 * Side effect: registers view structure for sidebar enumeration via `setViewStructure`.
 * @param {Object} store - ViewStore-shaped; needs `.abstractDefinitions`, `.views`, `.reporter`.
 * @param {Object<string, Object>} components - Component map keyed by component id.
 * @param {string} abstractName
 * @returns {{ properties: Object, content: Object<string, Object> }} Resolved view.
 */
export function parseAbstractDefinition(store, components, abstractName) {

    // The flat view structure
    const rootView = {
        properties: {},
        content: {},
    }

    if (!store.abstractDefinitions[abstractName]) {
        store.reporter.error(`Abstract definition "${abstractName}" not found.`);
        return rootView;
    }

    // Used to display the view nav menu in the sidebar
    // This will contain pointers to detail views
    setViewStructure(abstractName, []);

    Object.entries(store.abstractDefinitions[abstractName]).forEach(([sectionName, sectionContents]) => {
        if (sectionName !== 'properties' && sectionName !== 'content') rootView[sectionName] = sectionContents;
    });
    Object.assign(rootView, store.abstractDefinitions[abstractName].generics ?? {});
    Object.assign(rootView.properties, store.abstractDefinitions[abstractName].properties ?? {});

    // Stitch together content
    // See the abstract definitions file for what componentID and swapModules look like
    Object.entries(store.abstractDefinitions[abstractName].content).forEach(([componentID, swapModules]) => {
        buildComponent(store, components, componentID, rootView, abstractName, undefined, swapModules?.content ?? null);
    });
    return rootView;
}

/**
 * Resolve a component (detail view) into a flat view. Used by the default
 * resolver for non-root navigation targets.
 * @param {Object} store
 * @param {Object<string, Object>} components
 * @param {string} viewName - Component id to resolve.
 * @param {string[]} [parentComponentChain] - Used internally to detect cyclical refs.
 * @param {Object} [overrides] - Reserved.
 * @returns {{ content: Object<string, Object> }} Resolved view.
 */
export function parseComponentView(store, components, viewName, parentComponentChain = [], overrides = null) {
    //console.debug(`Building view ${viewName}`);

    // The flat view structure
    const view = {
        content: {},
    }

    // Used to display the view nav menu in the sidebar
    setViewStructure(viewName, []);

    buildComponent(store, components, viewName, view, viewName, parentComponentChain, overrides);

    return view;
}

// Recursively builds the component and adds it to viewDetails. Used for both abstracts and details.
function buildComponent(store, components, componentID, viewDetails, viewName, parentComponentChain = [], swapModules = null) {
    //console.debug(`Building component ${componentID}`);

    // Remove any suffixes like _1, _2, etc. to get the base component ID
    // Why: So that components can be used multiple times in the same abstract
    // This generally shouldn't happen, though.
    const cleanedComponentID = componentID.replace(/_\d+$/, '');

    const targetComponent = components[cleanedComponentID];
    if (!targetComponent) {
        store.reporter.error(`Component ${componentID} not found.`);
        return;
    }

    // Prevents recursive definition loops, either as self-references or cyclical references
    if (parentComponentChain.includes(componentID)) {
        store.reporter.error(`Cyclical reference detected at component ${componentID}. Parents: ${parentComponentChain.join(' -> ')}`);
        return;
    }
    const componentChain = [...parentComponentChain, componentID];

    // Handle component-level detail specification
    handleDetails(store, components, targetComponent, viewName, componentChain, swapModules);

    // Because we change item id, we need to also change any future references to it
    // So, we map the old id to the new id, and update the previous property if it exists
    // Why do we change item id? So that subcomponents don't all have to have unique ids across the entire application.
    const idMap = {}; // XXX This might need to be passed in the buildComponent recursion chain

    // Stitch together content
    // See components.js for what itemID and item look like
    Object.entries(targetComponent.content).forEach(([itemID, item], index) => {

        // This if-block handles when the item is a component that needs to be unrolled
        if (item.component) {
            const componentClass = item.class;

            if (swapModules && componentClass) {
                const swapComponent = swapModules[componentClass];
                if (swapComponent) {
                    console.debug(`Swapping internal component ${itemID} with class ${componentClass} to ${swapComponent.at(0)}`);
                    buildComponent(
                        store,
                        components,
                        swapComponent.at(0),
                        viewDetails,
                        viewName,
                        componentChain,
                        swapComponent.at(1)?.content ?? null
                    );
                    return;
                }
            }

            buildComponent(store, components, item.component, viewDetails, viewName, componentChain, swapModules);
            return;
        }

        // Allows for different components to use the same id for two items
        let newItemID = `${componentID}_${itemID}`;

        let i = 1;
        while (viewDetails.content[newItemID]) {
            newItemID = `${componentID}_${i}_${itemID}`;
            i++;
        }
        idMap[itemID] = newItemID;

        viewDetails.content[newItemID] = JSON.parse(JSON.stringify(item));

        if (index === 0 && Object.keys(viewDetails.content).length > 1) {
            if (viewDetails.content[newItemID].previous)
                store.reporter.warn(`First item ${newItemID} in ${componentID} had a previous element ${viewDetails.content[newItemID].previous}`);
            viewDetails.content[newItemID].previous = Object.keys(viewDetails.content).at(-2);

        } else if (viewDetails.content[newItemID].previous) {
            viewDetails.content[newItemID].previous = idMap[item.previous];
        }

        if (Array.isArray(item.arrow) && item.arrow.length > 0) {
            for (const arrow of viewDetails.content[newItemID].arrow)
                if (arrow.previous) {
                    arrow.previous = idMap[arrow.previous];
                }
        } else if (item.arrow && item.arrow.previous) {
            viewDetails.content[newItemID].arrow.previous = idMap[item.arrow.previous];
        }

        if (targetComponent.details && !item.details)
            viewDetails.content[newItemID].details = targetComponent.details;

        if (targetComponent.description && !item.description)
            viewDetails.content[newItemID].description = targetComponent.description;

        handleDetails(store, components, item, viewName, parentComponentChain, swapModules);

        if (Array.isArray(item.arrow) && item.arrow.length > 0) {
            for (const arrow of item.arrow)
                handleDetails(store, components, arrow, viewName, parentComponentChain, swapModules);
        } else if (item.arrow) {
            handleDetails(store, components, item.arrow, viewName, parentComponentChain, swapModules);
        }
    });

    // If the component had settings or references, we add them to the viewDetails' settings and references arrays.
    // These mimic 'sets' so that only new settings and references are added
    Object.entries(components[cleanedComponentID]).forEach(([key, value]) => {
        if (key !== 'content' && key !== 'details' && key !== 'description') {
            if (Array.isArray(value)) {
                if (!viewDetails[key])
                    viewDetails[key] = [...value];
                else if (!Array.isArray(viewDetails[key]))
                    throw new Error(`Component property ${key} is an array, but viewDetails property is not.`);
                else {
                    // Set-like merge: skip entries whose `id` already exists. Falls back to
                    // reference-equality for primitives or entries without an id.
                    const existingIds = new Set(
                        viewDetails[key].map(entry => entry && typeof entry === 'object' ? entry.id : entry)
                    );
                    for (const entry of value) {
                        const key2 = entry && typeof entry === 'object' ? entry.id : entry;
                        if (key2 !== undefined && existingIds.has(key2)) continue;
                        viewDetails[key].push(entry);
                        if (key2 !== undefined) existingIds.add(key2);
                    }
                }
            } else {
                if (viewDetails[key])
                    Object.assign(viewDetails[key], value);
                else
                    viewDetails[key] = value;
            }
        }
    });
}

function handleDetails(store, components, targetItem, viewName, parentComponentChain, swapModules) {
    if (targetItem.details && !store.views[targetItem.details] && (swapModules == null || Object.keys(swapModules).length === 0)) {
        // The detail is generic and hasn't been made yet
        addDetailView(viewName, targetItem.details);
        store.views[targetItem.details] = parseComponentView(store, components, targetItem.details, parentComponentChain, null);

    } else if (targetItem.details && store.views[targetItem.details] && (swapModules == null || Object.keys(swapModules).length === 0)) {
        // The detail is generic and already exists
        addDetailView(viewName, targetItem.details);

    } else if (targetItem.details) {
        // The detail is unique/abstract-specific
        let newDetailName = `${targetItem.details}`;
        let i = 1;
        while (store.views[newDetailName]) {
            newDetailName = `${targetItem.details}_${i}`;
            i++;
        }

        store.views[newDetailName] = parseComponentView(store, components, targetItem.details, parentComponentChain, swapModules);

        targetItem.details = newDetailName;
        addDetailView(viewName, newDetailName);
    }
}
