// ==============================
// custom text format -> JSON
// ==============================

/**
 * Fetch a `.txt` abstract-definition file and parse it. Browser-only (uses `fetch`).
 * @param {string} filePath
 * @returns {Promise<Object>} Map of `{ [definitionName]: definitionStructure }`.
 */
export function parseAbstractDefinitionFile(filePath) {
    return new Promise((resolve, reject) => {
        fetch(filePath)
            .then(response => response.text())
            .then(content => {
                try {
                    const parsedAbstractDefinition = parseAbstractContent(content);
                    resolve(parsedAbstractDefinition);
                } catch (error) {
                    reject(error);
                }
            })
            .catch(error => reject(error));
    });
}

/**
 * Fetch and parse multiple `.txt` abstract-definition files in parallel, then
 * merge them into a single definitions map. Last-write-wins on key collision.
 * @param {string[]} filePaths
 * @returns {Promise<Object>} Merged map of `{ [definitionName]: definitionStructure }`.
 */
export async function parseAbstractDefinitionFiles(filePaths) {
    const parsed = await Promise.all(filePaths.map(parseAbstractDefinitionFile));
    return Object.assign({}, ...parsed);
}

/**
 * Parse abstract-definition source text into the intermediate JSON format.
 * @param {string} content
 * @returns {Object} `{ [definitionName]: definitionStructure }`.
 */
export function parseAbstractContent(content) {
    // Split content into lines and remove empty lines
    const lines = content.split('\n')
        .map(line => line.trimEnd())
        .filter(line => line.trim().length > 0);

    if (lines.length === 0) {
        throw new Error('Empty abstract definition');
    } else if (lines.length === 1) {
        throw new Error('Abstract definition must have contents');
    }

    const startIndices = findStartIndices(lines);

    const result = {};

    for (let i = 0; i < startIndices.length; i++) {
        const startIndex = startIndices[i];
        const endIndex = i < startIndices.length - 1
            ? startIndices[i + 1]
            : lines.length;

        const parsedAbstractDefinition = parseAbstractSection(lines.slice(startIndex, endIndex));

        // Merge into result
        Object.assign(result, parsedAbstractDefinition);
    }

    return result;
}

function findStartIndices(lines) {
    const indices = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        // A definition starts with a name followed by a colon
        // and is either at the beginning of the file or after a blank line
        if (line.endsWith(':') && (i === 0 || countIndent(lines[i]) === 0)) {
            indices.push(i);
        }
    }

    return indices;
}

function parseAbstractSection(lines) {
    if (lines.length === 0) {
        throw new Error('Empty abstract section');
    }

    // Extract name from first line
    const firstLine = lines[0];
    if (!firstLine.endsWith(':')) {
        throw new Error('Abstract definition must start with a name followed by a colon');
    }

    const name = firstLine.slice(0, -1).trim();

    // Parse the abstract structure
    const abstract = {};
    const stack = [{ obj: abstract, indent: -1 }];
    let i = 1;
    while (i < lines.length) {
        const line = lines[i];
        const indent = countIndent(line);
        const content = line.trim();

        // Find the appropriate parent in the stack
        while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
            stack.pop();
        }

        const parent = stack[stack.length - 1].obj;

        // Handle special sections
        if (content === 'generics:') {
            const [genSections, newIndex] = parseGenericSections(lines, i, indent);
            Object.assign(parent, genSections);
            i = newIndex;
            continue;
        } else if (content === 'properties:') {
            const [propsSection, newIndex] = parsePropertiesSection(lines, i, indent);
            parent.properties = propsSection;
            i = newIndex;
            continue;
        }

        // Ensure content object exists for normal sections
        if (!parent.content) {
            parent.content = {};
        }

        if (content.endsWith(':')) {
            // This is a component with children
            const componentName = content.slice(0, -1).trim();
            parent.content[componentName] = {};
            stack.push({ obj: parent.content[componentName], indent });
        } else if (content.includes(':')) {
            // This is a class component (className: componentName)
            const [className, componentName] = content.split(':').map(part => part.trim());

            // Check if the next line has a greater indent (indicating nested components)
            const hasChildren = (i + 1 < lines.length) && (countIndent(lines[i + 1]) > indent);

            if (hasChildren) {
                parent.content[className] = [componentName, {}];
                stack.push({ obj: parent.content[className][1], indent });
            } else {
                parent.content[className] = [componentName, null];
            }
        } else {
            // This is a simple component
            parent.content[content] = null;
        }

        i++;
    }

    return { [name]: abstract };
}


/**
 * Parse generic (user-defined) sections into an object mapping section names to section bodies.
 * Infers whether the contents should be an array or an object based on if the first item ends with a colon.
 * @param {string[]} lines All lines in the file
 * @param {number} startIndex Start index of the generics section
 * @param {number} sectionIndent Indentation level of the generics section
 * @returns {[Object, number]} Section names mapped to their contents, and the new line index
 */
function parseGenericSections(lines, startIndex, sectionIndent) {
    const sections = {};
    let i = startIndex + 1;

    while (i < lines.length) {
        const line = lines[i];
        const indent = countIndent(line);

        // If we encounter a line with same or less indent than the generics section,
        // we've reached the end of the generics section
        if (indent <= sectionIndent) {
            break;
        }

        // Title lines have one level more indent than the section and end with colon
        if (indent === sectionIndent + 4 && line.trim().endsWith(':')) {
            // Extract reference title (remove quotes and colon)
            let title = line.trim();
            if (title.endsWith(':')) {
                title = title.slice(0, -1).trim();
            }
            if (title.startsWith('"') && title.endsWith('"')) {
                title = title.slice(1, -1);
            }

            // Parse generic section
            const [section, newIndex] = parseGenericSectionContent(lines, i + 1, indent);
            sections[title] = section;
            i = newIndex;
        } else {
            i++;
        }
    }

    return [sections, i];
}

/**
 * Parse contents of a generic section
 * @param {string[]} lines All lines in the file
 * @param {number} startIndex Start index of the generic section
 * @param {number} titleIndent Indentation level of the section title
 * @returns {[Object, number]|[Array, number]} Section content object or array and the new line index
 */
function parseGenericSectionContent(lines, startIndex, titleIndent) {
    let section;
    let i = startIndex;

    // Scan all direct children (same indent as first child) and treat the section as an
    // object if any of them is a `key: value` line. Otherwise it's a plain array. This
    // avoids the bug where a colon-less first child misclassified the whole section.
    const firstChildIndent = countIndent(lines[i]);
    section = [];
    for (let j = i; j < lines.length; j++) {
        const childIndent = countIndent(lines[j]);
        if (childIndent <= titleIndent) break;
        if (childIndent === firstChildIndent && lines[j].trim().includes(':')) {
            section = {};
            break;
        }
    }


    while (i < lines.length) {
        const line = lines[i];
        const indent = countIndent(line);

        if (indent <= titleIndent) {
            break;
        }

        const content = line.trim();

        // Check if contents are an object or an array
        if (Array.isArray(section)) {
            section.push(content);
        } else if (typeof section === 'object') {
            const [sectionName, ...valueParts] = content.split(':');
            const sectionNameTrimmed = sectionName.trim();
            let value = valueParts.join(':').trim();

            if (value) {

                // Handle quoted values
                if (value.startsWith('"') && value.endsWith('"')) {
                    value = value.slice(1, -1);

                    // XXX Might be prone to issues, as this won't happen if `value` doesn't start and/or end with quotes
                    // Check for multi-line strings
                    if (i + 1 < lines.length && countIndent(lines[i + 1]) > indent) {
                        const [multilineValue, newIndex] = parseMultilineString(lines, i + 1, indent);
                        value += multilineValue;
                        i = newIndex - 1; // -1 because we'll increment i at the end of the loop
                    }

                    // Process escape sequences in the string
                    value = evaluateEscapeSequences(value);
                    section[sectionNameTrimmed] = value;
                } else {
                    section[sectionNameTrimmed] = value;
                }
            } else {
                const [sectionContent, newIndex] = parseGenericSectionContent(lines, i + 1, indent);
                section[sectionNameTrimmed] = sectionContent;
                i = newIndex - 1; // -1 because we'll increment i at the end of the loop
            }
        } else {
            throw new Error('Invalid generic section type: ' + typeof section);
        }

        i++;
    }

    return [section, i];
}

/**
 * Parse properties section into an object
 * @param {string[]} lines All lines in the file
 * @param {number} startIndex Start index of the properties section
 * @param {number} sectionIndent Indentation level of the properties section
 * @returns {[Object, number]} Properties object and the new line index
 */
function parsePropertiesSection(lines, startIndex, sectionIndent) {
    const properties = {};
    let i = startIndex + 1;

    while (i < lines.length) {
        const line = lines[i];
        const indent = countIndent(line);

        // If we encounter a line with same or less indent than the section,
        // we've reached the end of the properties section
        if (indent <= sectionIndent) {
            break;
        }

        const content = line.trim();

        // Check for property lines (property: value)
        if (content.includes(':')) {
            const [property, ...valueParts] = content.split(':');
            const propName = property.trim();
            let value = valueParts.join(':').trim();

            // Convert numeric values to actual numbers
            if (!isNaN(value) && value !== '') {
                // Check if it's a float or integer
                if (value.includes('.')) {
                    properties[propName] = parseFloat(value);
                } else {
                    properties[propName] = parseInt(value, 10);
                }
            } else {
                // Handle quoted values
                if (value.startsWith('"') && value.endsWith('"')) {
                    value = evaluateEscapeSequences(value.slice(1, -1));
                }
                properties[propName] = value;
            }
        }

        i++;
    }

    return [properties, i];
}

/**
 * Evaluate escape sequences in a string
 * @param {string} str The string with escape sequences
 * @returns {string} String with evaluated escape sequences
 */
function evaluateEscapeSequences(str) {
    return str
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\r/g, '\r')
        .replace(/\\"/g, '"')
        .replace(/\\'/g, "'")
        .replace(/\\\\/g, '\\');
}

/**
 * Parse a multi-line string
 * @param {string[]} lines All lines in the file
 * @param {number} startIndex Start index of the multi-line string
 * @param {number} propertyIndent Indentation level of the property
 * @returns {[string, number]} Parsed string and the new line index
 */
function parseMultilineString(lines, startIndex, propertyIndent) {
    let result = '';
    let i = startIndex;

    while (i < lines.length) {
        const line = lines[i];
        const indent = countIndent(line);

        // If we encounter a line with same or less indent than the property,
        // we've reached the end of the multi-line string
        if (indent <= propertyIndent) {
            break;
        }

        // Add line content to the result
        if (result) {
            result += '\n';
        }
        result += line.trim();

        i++;
    }

    return [result, i];
}

function countIndent(line) {
    let count = 0;
    for (let i = 0; i < line.length; i++) {
        if (line[i] === ' ') {
            count++;
        } else {
            break;
        }
    }
    return count;
}
