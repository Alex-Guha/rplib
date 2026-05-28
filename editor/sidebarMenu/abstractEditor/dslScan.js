// Line-level DSL analysis shared by autocomplete, lint, and decorations.
//
// The abstract DSL is indentation-significant. We scan top to bottom keeping a
// stack of "parents" (component names whose nested block we're inside). For
// each line we emit a record describing its semantic role plus the parent
// component (if any), which downstream features use to look up override slots.
//
// We intentionally do NOT call `parseAbstractContent` here — that parser
// throws on the first error, whereas these features want a best-effort view of
// an in-progress document.

const SECTION_KEYWORDS = new Set(['properties', 'generics']);

const indentOf = (line) => {
    let i = 0;
    while (i < line.length && line[i] === ' ') i++;
    return i;
};

const isBlank = (line) => line.trim().length === 0;

/**
 * Analyze a single line in isolation. Returns null for blank lines.
 * Ranges are 0-indexed column offsets relative to the line start.
 */
export function analyzeLine(line) {
    if (isBlank(line)) return null;
    const indent = indentOf(line);
    const body = line.slice(indent);
    const trimmedEnd = line.replace(/\s+$/, '');
    const trimmed = body.trim();

    // Section keyword: `properties:`, `generics:`
    const sectionMatch = /^(properties|generics):\s*$/.exec(trimmed);
    if (sectionMatch) {
        return {
            kind: 'section',
            indent,
            keyword: sectionMatch[1],
            keywordRange: [indent, indent + sectionMatch[1].length],
        };
    }

    // Header (line ends with `:` and has no other colon in the name portion).
    const headerMatch = /^([\w.-]+):\s*$/.exec(trimmed);
    if (headerMatch) {
        const name = headerMatch[1];
        return {
            kind: indent === 0 ? 'archHeader' : 'componentHeader',
            indent,
            name,
            nameRange: [indent, indent + name.length],
        };
    }

    // Class override: `className: componentName`
    const overrideMatch = /^([\w.-]+)\s*:\s*([\w.-]+)\s*$/.exec(trimmed);
    if (overrideMatch) {
        const [, className, componentName] = overrideMatch;
        const classStart = indent;
        const colonRel = body.indexOf(':');
        const compStart = indent + body.indexOf(componentName, colonRel + 1);
        return {
            kind: 'override',
            indent,
            className,
            componentName,
            classRange: [classStart, classStart + className.length],
            componentRange: [compStart, compStart + componentName.length],
        };
    }

    // Property/value line inside a properties: section — treated by the
    // caller; we only flag it here when we can't classify it otherwise.
    const propMatch = /^([\w.-]+)\s*:\s*(.+?)\s*$/.exec(trimmed);
    if (propMatch) {
        const [, key, value] = propMatch;
        const keyStart = indent;
        const valStart = indent + body.indexOf(value, body.indexOf(':') + 1);
        return {
            kind: 'keyValue',
            indent,
            key,
            value,
            keyRange: [keyStart, keyStart + key.length],
            valueRange: [valStart, valStart + value.length],
        };
    }

    // Bare token: a single identifier on its own line — a component ref.
    if (/^[\w.-]+$/.test(trimmed)) {
        return {
            kind: 'bareRef',
            indent,
            name: trimmed,
            nameRange: [indent, indent + trimmed.length],
        };
    }

    return { kind: 'unknown', indent, raw: body };
}

/**
 * Walk the document and emit one record per line. Each record gets an extra
 * `parent` field: the component name whose nested block this line lives in,
 * or null if the line is at arch top level. Lines inside a `properties:` or
 * `generics:` section get `inSection: 'properties' | 'generics' | ...`.
 *
 * `lines` is `string[]`, indexed by 0.
 */
export function scanDocument(lines) {
    const records = new Array(lines.length).fill(null);
    // Stack of frames the line at indent > frame.indent belongs to.
    // frame = { indent, kind, name } where kind ∈ {'arch', 'component', 'section'}.
    const stack = [];

    for (let i = 0; i < lines.length; i++) {
        const info = analyzeLine(lines[i]);
        if (!info) continue;

        // Pop frames whose indent is >= ours (we're outside their block).
        while (stack.length && stack[stack.length - 1].indent >= info.indent) {
            stack.pop();
        }

        const top = stack[stack.length - 1] || null;
        const parent = top && top.kind === 'component' ? top.name : null;
        const inSection = (() => {
            for (let j = stack.length - 1; j >= 0; j--) {
                if (stack[j].kind === 'section') return stack[j].name;
            }
            return null;
        })();

        records[i] = { ...info, parent, inSection, line: i };

        // Push new frames for headers/sections so the next-level children can
        // resolve their parent.
        if (info.kind === 'archHeader') {
            stack.length = 0;
            stack.push({ indent: info.indent, kind: 'arch', name: info.name });
        } else if (info.kind === 'componentHeader') {
            stack.push({ indent: info.indent, kind: 'component', name: info.name });
        } else if (info.kind === 'section') {
            stack.push({ indent: info.indent, kind: 'section', name: info.keyword });
        } else if (info.kind === 'override') {
            // Override line can also introduce a nested block. We use the
            // componentName as the parent for indented children.
            stack.push({ indent: info.indent, kind: 'component', name: info.componentName });
        }
    }

    return records;
}

/**
 * Collect override-slot classNames declared inside a component's `content`.
 * `componentsRegistry` is `manager.canvas.components`.
 */
export function overrideSlotsFor(componentsRegistry, componentName) {
    const comp = componentsRegistry?.[componentName];
    const slots = new Map(); // className -> default componentName
    if (!comp || !comp.content) return slots;
    for (const [, entry] of Object.entries(comp.content)) {
        if (entry && typeof entry === 'object' && entry.class && entry.component) {
            slots.set(entry.class, entry.component);
        }
    }
    return slots;
}

export { SECTION_KEYWORDS };
