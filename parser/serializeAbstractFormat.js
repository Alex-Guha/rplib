// LLM generated, it just works idk

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

    const indentStr = ' '.repeat(indent);
    let result = '';

    // Process all other keys
    for (const [key, value] of Object.entries(structure)) {
        if (key === 'references' || key === 'properties') {
            continue; // Already processed
        }

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
    if (structure.references) { // XXX
        result += `${indentStr}references:\n`;
        result += serializeReferences(structure.references, indent + 4);
    }

    return result;
}

// XXX
/**
 * Serializes references section
 * @param {Array} references Array of reference objects
 * @param {number} indent The current indentation level
 * @returns {string} Serialized references
 */
function serializeReferences(references, indent) {
    if (!Array.isArray(references)) {
        return '';
    }

    const indentStr = ' '.repeat(indent);
    let result = '';

    for (const ref of references) {
        if (!ref.title) continue;

        // Serialize reference title
        result += `${indentStr}"${ref.title}":\n`;

        // Serialize reference properties
        const refIndent = indent + 4;
        const refIndentStr = ' '.repeat(refIndent);

        // Process authors specially
        if (ref.authors && Array.isArray(ref.authors)) {
            result += `${refIndentStr}authors:\n`;
            for (const author of ref.authors) {
                result += `${' '.repeat(refIndent + 4)}${author}\n`;
            }
        }

        // Process other properties
        for (const [key, value] of Object.entries(ref)) {
            if (key === 'title' || key === 'authors') {
                continue; // Already processed
            }            // Special handling for all string values
            if (typeof value === 'string') {
                // Escape newlines in the string value
                const escapedValue = escapeString(value);
                result += `${refIndentStr}${key}: "${escapedValue}"\n`;
            } else {
                // Non-string properties
                result += `${refIndentStr}${key}: ${value}\n`;
            }
        }
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