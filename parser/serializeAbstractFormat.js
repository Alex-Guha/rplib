// TODO Write test cases

// ==============================
// JSON -> custom text format
// ==============================

/**
 * Converts a JavaScript abstract object back to its text representation format
 * @param {Object} abstract The abstract object to serialize
 * @returns {string} Text representation of the abstract
 */
export default function serializeAbstractDefinition(abstractName, structure) {
    if (!structure || typeof structure !== 'object') {
        throw new Error('Invalid abstract object');
    }

    let result = '';

    // Add abstract name
    result += `${abstractName}:\n`;

    // Serialize the structure
    result += serializeStructure(structure, 4); // Start with 4 spaces indentation

    return result;
}

/**
 * Recursively serializes an architecture structure
 * @param {Object} structure The structure object to serialize
 * @param {number} indent The current indentation level
 * @returns {string} Serialized structure
 */
function serializeStructure(structure, indent) {
    if (!structure || typeof structure !== 'object') {
        return '';
    }

    let indentStr = ' '.repeat(indent);
    let result = '';

    // Process all other keys
    for (const [key, value] of Object.entries(structure.content)) {
        if (value === null) {
            // Simple component
            result += `${indentStr}${key}\n`;
        } else if (Array.isArray(value)) {
            // Class component with optional children (className: componentName)
            const [componentName, children] = value;
            result += `${indentStr}${key}: ${componentName}\n`;

            if (children) {
                result += serializeStructure(children, indent + 4);
            }
        } else if (typeof value === 'object') {
            // Component with children
            result += `${indentStr}${key}:\n`;
            result += serializeStructure(value, indent + 4);
        }
    }

    // Handle special sections
    if (structure.properties) {
        result += `${indentStr}properties:\n`;
        result += serializeProperties(structure.properties, indent + 4);
    }
    
    // Handle user defined generic sections
    let newIndent = indent;
    for (const [key, value] of Object.entries(structure)) {
        if (key === 'properties' || key === 'content') continue;

        if (newIndent === indent) {
            result += `${indentStr}generics:\n`;
            newIndent = indent + 4;
            indentStr = ' '.repeat(newIndent);
        }
        result += `${indentStr}${key}:\n`;
        result += serializeGenericSection(value, newIndent + 4);
    }

    return result;
}

/**
 * Serializes user defined sections
 * @param {Array} sectionContents The contents of the generic section
 * @param {number} indent The current indentation level
 * @returns {string} Serialized user defined sections
 */
function serializeGenericSection(sectionContents, indent) {
    const indentStr = ' '.repeat(indent);
    let result = '';

    if (Array.isArray(sectionContents)) {
        // Non-flat lists are not supported in this format
        for (const element of sectionContents) {
            result += `${indentStr}${element}\n`;
        }
    } else if (typeof sectionContents === 'object') {
        for (const [key, value] of Object.entries(sectionContents)) {
            result += `${indentStr}${key}:`;

            if (Array.isArray(value) || typeof value === 'object') {
                result += `\n`;
                result += serializeGenericSection(value, indent + 4);
            } else if (typeof value === 'string') {
                // Escape newlines in the string value
                const escapedValue = escapeString(value);
                result += ` "${escapedValue}"\n`;
            } else {
                // Non-string properties
                result += ` ${value}\n`;
            }
        }
    } else {
        // Shouldn't ever come up in practice as this serializing function is written in conjunction with the parser,
        // and the parser always creates either arrays or objects for generic sections
        throw new Error('Invalid generic section contents type: ' + typeof sectionContents);
    }

    return result;
}

/**
 * Serializes properties section
 * @param {Object} properties Properties object
 * @param {number} indent The current indentation level
 * @returns {string} Serialized properties
 */
function serializeProperties(properties, indent) {
    if (!properties || typeof properties !== 'object') {
        return '';
    }

    const indentStr = ' '.repeat(indent);
    let result = ''; for (const [key, value] of Object.entries(properties)) {
        if (typeof value === 'string') {
            // String property (with proper escaping for multi-line strings)
            const escapedValue = escapeString(value);
            result += `${indentStr}${key}: "${escapedValue}"\n`;
        } else {
            // Numeric or other property
            result += `${indentStr}${key}: ${value}\n`;
        }
    }

    return result;
}

/**
 * Escapes special characters in a string
 * @param {string} str The string to escape
 * @returns {string} Escaped string
 */
function escapeString(str) {
    return str
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\t/g, '\\t')
        .replace(/\r/g, '\\r');
}