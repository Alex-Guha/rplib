# rplib-editor DSL reference

This document describes the abstract/component DSL consumed by `rplib-editor`'s parser. Consumers supply a `dataDir` containing `components/` (JS or JSON objects) and `abstracts/` (text in the format below); the editor stitches them into renderable views.

For a runnable example using this DSL, see [`../diagram-app/`](../diagram-app/).

## Abstracts
An abstract structure definition, designed for ease of use and prototyping.

Abstracts construct a view by stitching together existing components. When a component has swappable elements, the user can specify to override them at this level.

These are what users interact with and define new diagrams in.

## Syntax:
```
abstractName:
    componentName
    componentName:
        className: componentName
            className: componentName
        className: componentName
    componentName
    references:
        "title":
            authors:
                Name
            info: "mock info\nthis can be many lines"
            refType: Website
            link: https://www.example.com
    properties:
        propertyName: value
        propertyName: value
```



## Components
A concrete structure definition, allowing for complex diagram creation.

## Notes:
- Components can be anything from a single subcomponent (probably with a detail reference) to complex diagrams such as the attention mechanism.
- These are not intended to be created directly by the average user, instead used as building blocks to construct new diagrams via abstract specifications.
- Components can be constructed from both subcomponents and other components.
- In any text or info string, the syntax `{{propertyName|defaultValue}}` can be used to allow for dynamic text.
    - The `propertyName` gets specified in abstract properties, and if it isn't, the default value is used.

## Dimension values:
Numeric fields like `width`, `height`, `separation`, `xSpacing`, `ySpacing`, `xOffset`, `yOffset`, `extraLength`, and `shortSide` accept either a raw number or a **token string** evaluated against the canvas defaults:

| token | meaning |
| ----- | ------- |
| `h`, `y` | `DEFAULTS.SHAPE.height` |
| `w`, `x` | `DEFAULTS.SHAPE.width` |
| `s`     | `DEFAULTS.SHAPE.separation` |

Tokens compose with `+`, `-`, `*`, `/`, parens, and unary `-`. A number adjacent to an identifier means multiplication: `"2h"` is `2 * h`. Whitespace is insignificant.

Examples: `"2h"`, `"0.75w"`, `"-w/8"`, `"h + s + w/4"`, `"(h - w) / 2"`. Strings that don't fully parse as a token expression (text, positions, colors) are passed through unchanged.

## Rules:
- Each component must have a unique ID across both components and abstracts.
- Component IDs cannot end with underscore + number (e.g., _1, _2, etc.) as these have special meaning in the parser.
- The first element obviously can't have a `previous`, but also shouldn't have `position` or `x`/`y` (though they can if needed).
- The last element should be positioned on the same y level as the first element, so that component chaining has no issues.
- Naming Conventions:
    - Components that are simpler versions of other components and point to those more complex components should have the same name as the complex component, but with a suffix of _abstract.


## Properties:

### `settings` *(array of objects)* (Optional)
- Object properties:
    - `label` *(string)*: What the setting shows up as in the menu
    - `id` *(string)*: The key used in globalState
    - `property` *(string)*: The key used in the relevant subcomponent/text/arrow objects to signify that that item is affected by the setting.
- Example:
    - `settings: [{ label: 'Hide Text', id: 'hide-text', property: 'hideText' }]`
    - The relevant objects would then have `hideText: true` in them.
- If this component is used in another component, these settings will be combined into the parent component's settings


### `references` *(array of objects)* (Optional)
- Populates the references box when items in the component are hovered or clicked
- **Now just data.** As of editor/viewer `0.3.0`, references is no longer built in: the DSL contract is unchanged, but stock rplib renders it only when a consumer supplies a **references panel** via `createEditor({ panels: [...] })` / `createViewer({ panels: [...] })`. See the editor/viewer README "Panels" section and `@alexguha/rplib/panel` for the canonical `referencesPanel` recipe. The data below requires no edits.
- Object properties:
    - `title` *(string)*: The reference title to be used in the info box
    - `authors` *(array of strings)*: Relevant names/companies
    - `link` *(string)*: Link to the reference
    - `info` *(string)*: This contains an explanation about the reference, which is shown in the info box when the items in the component are hovered over or clicked
        - This can be multiple lines by using newline characters `\n`
    - `refType` *(string)*: The type of resource (i.e. website, paper, github repo, etc.)
- If this component is used in another component, these references will be combined into the parent component's references


### `details` *(string)* (Optional)
- Allows the items in the component to be double clickable, changing the diagram to the component specified here
    - This value must only be other component ids
- Specifying info at this level makes it default for all contents, unless overridden
- This is generally used either to allow for a component to have different levels of diagram complexity, or more often for complex matrix-level explanations.


### `info` *(string)* (Optional)
- This contains an explanation about the component, which is shown in the info box when the items in the component are hovered over or clicked
- This can be multiple lines by using newline characters `\n`
- Specifying info at this level makes it default for all contents, unless overridden


### `content` *(object)*
- The key value pairs specified here are read sequentially to draw the diagram.
- The keys are item ids, and used to specify relative positioning of items.
- The values are either references to other components, or subcomponent objects.

#### Item id constraints
- **Must not be integer-like.** Ids like `"0"`, `"1"`, `"42"` are rejected. The JS runtime reorders integer-string object keys ascending before any code sees them, which silently breaks declaration order and any `previous` reference that depends on it. Same rule whether the component is authored in `.txt`, `.js`, or `.json`. Any non-digit character (letter, hyphen, dot, leading zero like `"01"`) is safe.
- **Must not end with `_<number>`** (reserved by the parser's component-id suffix-strip logic).
- **Must be unique within the `content` block.**

#### Declaration order is significant
- Items are processed top-down. A `previous` reference must point at an item declared *earlier* in the same `content` block.
- Forward references (pointing at a later sibling) emit a parser warning and the `previous` is left undefined.
- A `previous` may also name the key of an earlier component reference (see below) — it resolves to that reference's unrolled **tail** (its last flattened item). It may **not** reach into a referenced component's internals; out-of-scope `previous` values emit a parser warning.
- The same scope rules apply to `arrow.previous`.

#### When a value is a reference:
- The referenced component diagram essentially gets inserted into the current component's diagram.
- Value object properties are:
    - `component` *(string)*: The id of the component to insert
    - `class` *(string)* (Optional): This allows the abstract definition to override the component reference by using the className specified here.
- The key still needs to be unique, but isn't used.
- Generally, the next item after this reference shouldn't have a `previous` set — its position will be inferred as the last item in the referenced component (the implicit head-stitch). If you do set `previous` on the post-reference item, it must name either an earlier sibling in this `content` block or an earlier component reference's key (which resolves to that reference's unrolled tail). It cannot name an internal item of the referenced component; those ids aren't in scope here and an attempt to use them will produce a parser warning.
- Ex: In the decoder component, there is: `attn: { component: 'mha', class: 'selfAttention' }`
    - This means the default attention mechanism to be drawn is the mha component
    - The abstract can use a different attention mechanism using `selfAttention: gqa` under the decoder

#### Otherwise, subcomponent object properties (these are all optional):
- `shape` *(string)*: Either 'box', 'triangle', or 'trapezoid'.
    - This is not explicitly required, to allow for flexibility, but generally expected as there is no default value.
- `previous` *(string)*: The id of the content item that this one should be positioned relative to.
    - This is not inferred and should likely be specified for everything except the first item.
    - The exception being if you want to position this item absolutely for some reason
    - **Scope:** must reference an earlier sibling in this `content` block, or the implicit tail of an immediately-preceding component reference. Forward references and references into a nested component's internals are user error and emit a parser warning (the resolved value will be `undefined`, breaking the chain).
- `position` *(string)*: Where to position this relative to the previous object.
    - Options are: 'right', 'left', 'above', or 'below'
    - Defaults to 'right'
- `width` *(float or token string)*: The width of the diagram object.
    - Prefer a token string like `"0.75w"` over a raw number (see "Dimension values" above).
    - Default is 100 (`DEFAULTS.SHAPE.width` in defaults.js).
    - For 'trapezoid' shapes, this is the distance between long and short sides.
- `height` *(float or token string)*: The height of the diagram object.
    - Prefer a token string like `"0.75h"` over a raw number (see "Dimension values" above).
    - Default is 200 (`DEFAULTS.SHAPE.height` in defaults.js).
    - For 'trapezoid' shapes, this is the long side.
- `info` *(string)*: This contains an explanation about the item, which is shown in the info box when the item is hovered over or clicked on
    - This can be multiple lines by using newline characters `\n`
- `details` *(string)*: Allows the item to be double clickable, changing the diagram to the component specified here
    - This value must only be other component ids
- `references` *(array of objects)*: 
    - Populates the references box when items in the component are hovered or clicked
    - Object properties:
        - `title` *(string)*: The reference title to be used in the info box
        - `authors` *(array of strings)*: Relevant names/companies
        - `link` *(string)*: Link to the reference
        - `info` *(string)*: How this reference contributes to the diagram
            - This can be multiple lines by using newline characters `\n`
        - `refType` *(string)*: The type of resource (i.e. website, paper, github repo, etc.)
- `text` *(object or array of objects)*: Used to draw text on the diagram.
    - This can either be a text object, or an array of them.
    - Text object properties:
        - `text` *(string)* (Required): The text to display. Wrap the value in `$...$` or `$$...$$` to render as LaTeX (via KaTeX); otherwise it renders as plain text.
        - `position` *(string)*: Two-word combination of where to position the text relative to the item.
            - Options for both words are "top", "bottom", "left", "right".
            - The first word in the text's position property is the arrangement relative to the center of the item. 'top' is default.
            - The second is relative to the side of the item. 'center' is default.
            - Examples: 'top-left', 'bottom-right', 'center'.
        - Advanced properties:
            - `color` *(int or string)*: Specifies the color of the text.
                - When this is an int, it selects from the `TEXT_COLOR` options in the current theme.
                - When this is a string, it is interpreted as color hex code
                - The default is the first option in `TEXT_COLOR` in the current theme.
            - `xOffset` *(float)*: Can be used to shift the text horizontally after relative positioning.
                - Right is positive, left is negative.
            - `yOffset` *(float)*: Can be used to shift the text vertically after relative positioning.
                - Down is positive, up is negative.
            - `info` *(string)*: Allows the text itself to override the item's info if it exists. This is the same as specified above.
            - `details` *(string)*: Allows the text itself to be double clickable, overriding the item's details if it exists. This is the same as specified above.
            - `references` *(array of objects)*: Allows the text itself to override the item's references if they exist. This is the same as specified above.
        - Settings properties can be specified here (for instance, to make some text hideable)
- `arrow` *(object or array of objects)*: Draws arrows pointing to the parent item
    - This can either be an arrow object, or an array of them.
    - A generic arrow with no text can be specified using an empty object `arrow: {}`
    - Arrow object properties:
        - `text` *(object or array of objects)*: Same as specified above.
        - `segments` *(array of objects)*: Essentially an array of arrow objects, this allows for multi-segmented arrows.
            - Non-segmented arrows cannot handle both vertical and horizontal distances at the same time.
            - Each segment object must have `direction` specified.
            - For example, a 2-segment arrow pointing from a previous item that is to the lower left of the current item would be specified as: `segments: [{ direction: 'right' }, { direction: 'up' }]` or `segments: [{ direction: 'up' }, { direction: 'right' }]`, depending on whether you want the arrow to first go right or up.
            - For more advanced behavior, more segments can be added and `extraLength` can be specified. Segments that do not have `extraLength` specified will automatically infer their length based on the net distance between items after adding in the `extraLength`s that are specified.
                - See the testarrows abstract and testSegmentedArrows component for examples of this.
                - Another example of clever usage of segmented arrows is seen at the end of the decoder_abstract component, where it is used to create a bracket shape in the diagram.
        - Advanced positioning properties:
            - `previous` *(string)*: Which item to draw the arrow from
                - Defaults to the same previous item as their parent item.
                - Same scope rules as the item-level `previous`: earlier sibling in this `content` block or the tail of a prior component reference; never into a referenced component's internals. Violations emit a parser warning.
            - `direction` *(string)*: The direction the arrow points
                - This should not be touched for normal arrows, as it's inferred from the parent item's relative position
                - Options are: "up", "down", "left", or "right"
            - `extraLength` *(float)*: Extends the arrow, after arrow length is inferred from distance between this item and the previous item.
            - `xOffset` *(float)*: Allows the start of the arrow to be manually moved horizontally.
            - `yOffset` *(float)*: Allows the start of the arrow to be manually moved vertically.
            - `noHead` *(bool)*: Whether to draw an arrowhead at the end of the arrow. Defaults to true.
            - `reversed` *(bool)*: Determines which end of the arrow to draw the arrowhead on. Defaults to false.
        - Advanced misc properties:
            - `info` *(string)*: Allows the arrow itself to override the item's info if it exists. This is the same as specified above.
            - `details` *(string)*: Allows the arrow itself to be double clickable, overriding the item's details if it exists. This is the same as specified above.
            - `references` *(array of objects)*: Allows the arrow itself to override the item's references if they exist. This is the same as specified above.
        - Settings properties can be specified here (for instance, to make some arrows or lines hideable)
- Advanced positioning (only use these if you know what you're doing):
    - `x` *(float)*: This overrides the positioning inference logic for the x-coordinate of the item, to allow for manual positioning.
        - If `previous` is specified, this value is relative to the previous item's upper left corner
        - Otherwise, this value is relative to the upper left corner of the canvas
        - Right is positive, left is negative.
    - `y` *(float)*: This overrides the positioning inference logic for the y-coordinate of the item, to allow for manual positioning.
        - If `previous` is specified, this value is relative to the previous item's upper left corner
        - Otherwise, this value is relative to the upper left corner of the canvas
        - Down is positive, up is negative.
    - `separation` *(float or token string)*: The spacing between this item and the previous item
        - Prefer a token string like `"0.66s"` over a raw number (see "Dimension values" above).
        - Default is 150 (`DEFAULTS.SHAPE.separation` in defaults.js).
- Advanced styling:
    - `opacity` *(float)*: Sets the opacity of the diagram item
        - Must be between 0 and 1, inclusive.
        - Default is specified by the theme, generally 0.5.
    - `count` *(int)*: Draws multiples of the shape in the diagram
        - Must be greater than 0, default is 1.
    - `xSpacing` *(float or token string)*: Used when `count` is greater than 1, this defines the horizontal distance between the multiples of the shape.
        - Default is `"w/4"` (25).
        - Right is positive, left is negative.
        - Prefer a token string like `"w/8"` (see "Dimension values" above).
    - `ySpacing` *(float or token string)*: Used when `count` is greater than 1, this defines the vertical distance between the multiples of the shape.
        - Default is `"-h/16"` (-12.5).
        - Down is positive, up is negative.
        - Prefer a token string like `"-h/8"` (see "Dimension values" above).
    - `flipped` *(bool)*: If `shape` is 'triangle' or 'trapezoid', this can be used to flip the shape horizontally
    - `shortSide` *(float or token string)*: If `shape` is 'trapezoid', this can be specified to override the default length of height / 2 for the shorter side of the trapezoid
        - Prefer a token string like `"0.75h"` (see "Dimension values" above).
- Settings properties can be specified here

#### Example contents to draw a square box with text and an arrow:
```js
content: {
    box: {
        shape: 'box',
        width: "2w",
        info: "Sample text that will appear in the info box",
        text: { text: 'Sample text that will appear above the box' },
        arrow: {
            text: { text: 'Sample text that will appear above the arrow, which points right from the previous item' },
        }
    }
}
```