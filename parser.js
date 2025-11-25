/**
This file contains functions to parse json definitions of architectures provided by parseArchitecture.js.
As such, it also contains functions to parse details and components, since they are used in architectures.

When rendering, the view needs to strictly consist of subcomponents with their graph-like organization defined.
parseArchitecture handles converting the abstract architecture definitions, which consist of components,
    to this expected flat view structure by recursively unrolling the components and their content.
Additionally, when parsing the architecture, we also build the views for any details that are referenced in architecture components.
*/

// Parses architectures and creates the corresponding view
export function parseAbstractDefinition(self, abstractName) {

    // The flat view structure
    const rootView = {
        settings: [],
        references: [],
        properties: {},
        content: {},
    }

    if (!self.abstractDefinitions[abstractName]) {
        console.error(`Abstract definition "${abstractName}" not found.`);
        return rootView;
    }

    // Used to display the view nav menu in the sidebar
    // This will contain pointers to detail views
    self.viewStructures[abstractName] = [];

    // Stitch together content
    // See architectures.js for what componentID and swapModules look like
    Object.entries(self.abstractDefinitions[abstractName]).forEach(([componentID, swapModules]) => {
        // If the component is 'settings' or 'references', we handle it differently
        if (componentID === 'settings' || componentID === 'references') {
            // In this case, swapModules is actually the settings or references array
            rootView[componentID] = [...(rootView[componentID] ?? []), ...(swapModules ?? [])];
            return;
        } else if (componentID === 'properties') {
            rootView.properties = (swapModules ?? {});
            return;
        }

        // Otherwise, we build the component (which gets added to rootView.content)
        buildComponent(self, componentID, rootView, abstractName, undefined, swapModules);
    });
    return rootView;
}

// Parses details and creates the corresponding view
// Essentially a wrapper on buildComponent
export function parseComponentView(self, viewName, parentComponentChain = [], overrides = null) {
    //console.debug(`Building view ${viewName}`);

    // The flat view structure
    const view = {
        settings: [],
        references: [],
        content: {},
    }

    // Used to display the view nav menu in the sidebar
    self.viewStructures[viewName] = [];

    buildComponent(self, viewName, view, viewName, parentComponentChain, overrides);

    return view;
}

// Recursively builds the component and adds it to viewDetails. Used for both architectures and details.
function buildComponent(self, componentID, viewDetails, viewName, parentComponentChain = [], swapModules = null) {
    //console.debug(`Building component ${componentID}`);

    // Remove any suffixes like _1, _2, etc. to get the base component ID
    // Why: So that components can be used multiple times in the same architecture
    // This generally shouldn't happen, though.
    const cleanedComponentID = componentID.replace(/_\d+$/, '');

    const targetComponent = self.components[cleanedComponentID];
    if (!targetComponent) {
        console.error(`Component ${componentID} not found.`);
        return;
    }

    // Prevents recursive definition loops, either as self-references or cyclical references
    if (parentComponentChain.includes(componentID)) {
        console.error(`Cyclical reference detected at component ${componentID}. Parents: ${parentComponentChain.join(' -> ')}`);
        return;
    }
    const componentChain = [...parentComponentChain, componentID];

    // Handle component-level detail specification
    handleDetails(self, targetComponent, viewName, componentChain, swapModules);

    // Because we change item id, we need to also change any future references to it
    // So, we map the old id to the new id, and update the previous property if it exists
    // Why do we change item id? So that subcomponents don't all have to have unique ids across the entire application.
    const idMap = {}; // XXX This might need to be passed in the buildComponent recursion chain

    // Stitch together content
    // See components.js for what itemID and item look like
    Object.entries(targetComponent.content).forEach(([itemID, item], index) => {

        // This if-block handles when the item is a component that needs to be unrolled
        // i.e. an entry in 'content' like: `label: { component: 'componentName', class: 'className' }`
        //      where 'label' is unused, 'componentName' must exist in components.js,
        //      and 'className' is the unique identifier making the component overridable by the architecture specification
        // Note that the className is optional, so the component can be used without being swappable
        // swapModules contains entries like: `className: ['componentName', { className: ['componentName', null] }]`
        if (item.component) {
            const componentClass = item.class;

            // If there are swappable modules specified in the architecture, and the component is swappable
            if (swapModules && componentClass) {

                // check if the swappable modules has a swap for this component
                const swapComponent = swapModules[componentClass];
                if (swapComponent) {
                    console.debug(`Swapping internal component ${itemID} with class ${componentClass} to ${swapComponent.at(0)}`);
                    buildComponent(
                        self,
                        swapComponent.at(0), // 'componentName'
                        viewDetails,
                        viewName,
                        componentChain, // cycle tracker
                        swapComponent.at(1) // `{ className: ['componentName', null] }` or `null`
                    );
                    return;
                }
            }

            // Architecture did not specify a swap or this component is not swappable, build normally
            buildComponent(self, item.component, viewDetails, viewName, componentChain, swapModules);
            return;
        }

        // The below code handles the case where the item is a simple object, not a component

        // Allows for different components to use the same id for two items
        let newItemID = `${componentID}_${itemID}`;

        // Search for an unused id for the item
        let i = 1;
        while (viewDetails.content[newItemID]) {
            newItemID = `${componentID}_${i}_${itemID}`;
            i++;
        }
        idMap[itemID] = newItemID;

        // Add the subcomponent to the view using the new id
        // We use JSON.parse(JSON.stringify(item)) to create a deep copy of the item
        // This is necessary to avoid mutating the original item in the detail definition,
        //     which would otherwise happen both when we set the previous property below
        //     and when we calculate positioning during rendering.
        viewDetails.content[newItemID] = JSON.parse(JSON.stringify(item));

        // point the first element being added here to the last element in the previous component using 'previous'
        if (index === 0 && Object.keys(viewDetails.content).length > 1) {
            if (viewDetails.content[newItemID].previous)
                console.log(`Warning: First item ${newItemID} in ${componentID} had a previous element ${viewDetails.content[newItemID].previous}`);
            viewDetails.content[newItemID].previous = Object.keys(viewDetails.content).at(-2);

            // Otherwise, update the item's previous property to use the new id, if there was a previous.
        } else if (viewDetails.content[newItemID].previous) {
            viewDetails.content[newItemID].previous = idMap[item.previous];
        }

        // We also need to check the arrows, since they can also have a previous property
        if (Array.isArray(item.arrow) && item.arrow.length > 0) {
            for (const arrow of viewDetails.content[newItemID].arrow)
                if (arrow.previous) {
                    arrow.previous = idMap[arrow.previous];
                }
        } else if (item.arrow && item.arrow.previous) {
            viewDetails.content[newItemID].arrow.previous = idMap[item.arrow.previous];
        }

        // Allow subcomponents to inherit the component's details, if specified
        if (targetComponent.details && !item.details)
            viewDetails.content[newItemID].details = targetComponent.details;

        // Same for info
        if (targetComponent.info && !item.info)
            viewDetails.content[newItemID].info = targetComponent.info;

        // Handle constructing details if specified and not already built
        handleDetails(self, item, viewName, parentComponentChain, swapModules);

        // Similar to the above item detail handling, we also check the arrows for details.
        if (Array.isArray(item.arrow) && item.arrow.length > 0) {
            for (const arrow of item.arrow)
                handleDetails(self, arrow, viewName, parentComponentChain, swapModules);
        } else if (item.arrow) {
            handleDetails(self, item.arrow, viewName, parentComponentChain, swapModules);
        }
    });

    // If the component had settings or references, we add them to the viewDetails' settings and references arrays.
    // These mimic 'sets' so that only new settings and references are added
    viewDetails.settings.push(
        ...(self.components[cleanedComponentID].settings ?? []).filter(
            (newSetting) => !viewDetails.settings.some((existingSetting) => existingSetting.id === newSetting.id)
        )
    );
    viewDetails.references.push(
        ...(self.components[cleanedComponentID].references ?? []).filter(
            (newReference) => !viewDetails.references.some((existingReference) => existingReference.title === newReference.title)
        )
    );
}

function handleDetails(self, targetItem, viewName, parentComponentChain, swapModules) {
    if (targetItem.details && !self.views[targetItem.details] && (swapModules == null || Object.keys(swapModules).length === 0)) {
        // The detail is generic and hasn't been made yet

        // Add the new view to the nav menu view tracker
        self.viewStructures[viewName].push(targetItem.details);

        self.views[targetItem.details] = parseDetail(targetItem.details, parentComponentChain, null);

    } else if (targetItem.details && self.views[targetItem.details] && (swapModules == null || Object.keys(swapModules).length === 0)) {
        // The detail is generic and already exists

        self.viewStructures[viewName].push(targetItem.details);

    } else if (targetItem.details) {
        // The detail is unique/architecture-specific

        // This code will result in never reusing any detail, i.e. always creating a new view
        let newDetailName = `${targetItem.details}`;
        let i = 1;
        while (self.views[newDetailName]) {
            newDetailName = `${targetItem.details}_${i}`;
            i++;
        }

        // overrides here is used to pass in any architecture-specific overrides for the component
        //     This is specifically used for abstract components
        self.views[newDetailName] = parseDetail(targetItem.details, parentComponentChain, swapModules);

        targetItem.details = newDetailName;
        self.viewStructures[viewName].push(newDetailName);
    }
}