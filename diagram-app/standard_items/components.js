// Test components for exercising rplib-editor features.
// These are not domain components — they're shape/arrow/text feature demos.
import * as DEFAULTS from 'rplib-editor/defaults.js';

export const testText = {
    settings: [{ label: 'Hide Text', id: 'hide-text', property: 'hideText' }],
    references: {
        "Test 0": {
            authors: [
                "Test McTesty",
                "Tester McTestface",
                "Testy McTesterson",
            ],
            link: "https://google.com",
            description: "This is a test reference",
            refType: "Website"
        },
    },
    content: {
        box: {
            width: DEFAULTS.SHAPE.height * 2, height: DEFAULTS.SHAPE.height * 2,
            description: "Sample box 1 description", shape: 'box',
            text: [
                { text: 'Box', position: 'center' },
                { text: 'Top', hideText: true },
                { text: 'Bottom', position: 'bottom', hideText: true, color: 1 },
                { text: 'Left', position: 'left', hideText: true, color: 2 },
                { text: 'Right', position: 'right', hideText: true, color: 3 },
                { text: 'Left Upper', position: 'left-top', hideText: true, color: 4 },
                { text: 'Right Upper', position: 'right-top', hideText: true },
                { text: 'Left Lower', position: 'left-bottom', hideText: true },
                { text: 'Right Lower', position: 'right-bottom', hideText: true },
                { text: 'Left Upper', position: 'top-left', hideText: true },
                { text: 'Right Upper', position: 'top-right', hideText: true },
                { text: 'Left Lower', position: 'bottom-left', hideText: true },
                { text: 'Right Lower', position: 'bottom-right', hideText: true },
            ],
        },
        placeholder_id: { component: 'testLatex', class: 'swappable' }
    }
}

export const testLatex = {
    settings: [{ label: 'Hide Text', id: 'hide-text', property: 'hideText' }],
    references: {
        "Test 1": {
            authors: ["Testerson Testers"],
            link: "https://github.com",
            description: "This is another test reference",
            refType: "Github"
        },
    },
    content: {
        box: {
            position: 'below',
            width: DEFAULTS.SHAPE.height * 2, height: DEFAULTS.SHAPE.height * 2,
            description: "Sample box 2 description", shape: 'box',
            text: [
                { latexText: 'Latex Box', position: 'center' },
                { latexText: 'Top', hideText: true },
                { latexText: 'Bottom', position: 'bottom', hideText: true },
                { latexText: 'Left', position: 'left', hideText: true },
                { latexText: 'Right', position: 'right', hideText: true },
                { latexText: 'Left Upper', position: 'left-top', hideText: true },
                { latexText: 'Right Upper', position: 'right-top', hideText: true },
                { latexText: 'Left Lower', position: 'left-bottom', hideText: true },
                { latexText: 'Right Lower', position: 'right-bottom', hideText: true },
                { latexText: 'Left Upper', position: 'top-left', hideText: true },
                { latexText: 'Right Upper', position: 'top-right', hideText: true },
                { latexText: 'Left Lower', position: 'bottom-left', hideText: true },
                { latexText: 'Right Lower', position: 'bottom-right', hideText: true },
            ],
        },
    }
}

export const testEverything = {
    settings: [
        { label: 'Hide Arrows', id: 'hide-arrow', property: 'hideArrows', noRedraw: false },
        { label: 'Hide Trapezoids', id: 'hide-trapezoids', property: 'hideTrapezoids' },
    ],
    content: {
        everything: {
            y: -200, separation: 550, // In the testing abstract, the above box_2 is the previous, so this needs to be moved up a little and over a lot.
            // x and position are implicit. They are excluded for the sake of component stitching.
            width: DEFAULTS.SHAPE.width * 2, height: DEFAULTS.SHAPE.height,
            description: "Every Possible Setting except arrow, which require a previous.\n\nShape color and stroke are theme based and not overridable, at least for now. They could easily be, though.",
            shape: 'box',
            details: 'testSegmentedArrows',
            opacity: 0.8,
            count: 3, xSpacing: DEFAULTS.SHAPE.width / 4, ySpacing: -DEFAULTS.SHAPE.width / 8,
            text: {
                latexText: 'box_{everything}',
                position: 'center',
                xOffset: -DEFAULTS.SHAPE.width / 8,
                yOffset: -DEFAULTS.SHAPE.width / 16,
                description: "Info Override",
                color: "#00ffff",
                references: {
                    "Reference Override": {}
                },
            },
            references: {
                "Test Reference": {
                    authors: [
                        "John Doe"
                    ],
                    link: "https://arxiv.org/pdf/genericarxivlink",
                    description: "Some text that should show in the info box",
                    refType: "PDF"
                }
            },
        },

        // Left of 'everything'
        everything_trapezoid_1: {
            position: 'left',
            // width and height pull from default
            // shortSide is inferred from height
            shape: 'trapezoid',
            previous: 'everything', hideTrapezoids: true,
            text: { text: 'Left', position: 'center', color: "#00ffff" },
            arrow: {
                // inferred direction: 'left' from position
                hideArrows: true,
                text: [{ text: 'Left Arrow' }],
                // More optional overrides:
                // xOffset, yOffset, noHead, reversed, extraLength
                // description, references, details
            },
        },

        // Right of 'everything'
        everything_trapezoid_2: {
            // implicit position = right
            // width and height pull from default
            // shortSide is inferred from height
            flipped: true,
            shape: 'trapezoid',
            previous: 'everything', hideTrapezoids: true,
            text: { text: 'Right', position: 'center', color: "#00ffff" },
            arrow: {
                // inferred direction: 'right' as default
                hideArrows: true,
                text: [{ text: 'Right Arrow', position: 'bottom' }],
            },
        },

        // Above 'everything'
        everything_triangle_1: {
            position: 'above',
            width: DEFAULTS.SHAPE.width * 2,
            shape: 'triangle',
            previous: 'everything',
            count: 3,
            text: {
                text: 'Above',
                position: 'center',
                color: "#00ffff",
                xOffset: -DEFAULTS.SHAPE.width / 4,
                yOffset: DEFAULTS.SHAPE.height / 16,
            },
            arrow: {
                // inferred direction: 'up' from position
                hideArrows: true,
                text: [{ text: 'Up Arrow', position: 'left' }],
            },
        },

        // Below 'everything'
        everything_triangle_2: {
            position: 'below',
            width: DEFAULTS.SHAPE.width * 2,
            shape: 'triangle',
            previous: 'everything',
            count: 3, xSpacing: -DEFAULTS.SHAPE.width / 4, ySpacing: -DEFAULTS.SHAPE.width / 8,
            flipped: true,
            text: {
                text: 'Below',
                position: 'center',
                color: "#00ffff",
                xOffset: DEFAULTS.SHAPE.width / 4,
                yOffset: DEFAULTS.SHAPE.height / 16,
            },
            arrow: {
                // inferred direction: 'down' from position
                hideArrows: true,
                text: [{ text: 'Down Arrow', position: 'right' }],
                extraLength: DEFAULTS.SHAPE.height / 2 - DEFAULTS.SHAPE.width / 2,
            },
        },
    }
}

export const testSwappable = {
    content: {
        swap: {
            width: DEFAULTS.SHAPE.width * 2, height: DEFAULTS.SHAPE.height,
            description: "Test nested component swapping.",
            shape: 'box',
            opacity: 0.8,
            text: {
                latexText: 'box_{swap}',
                position: 'center',
            },
        },
    }
}

export const testSegmentedArrows = {
    content: {
        centerBox: {
            x: 700, y: 150,
            width: DEFAULTS.SHAPE.width * 2,
            shape: 'box',
            text: {
                latexText: 'box_{center}',
                position: 'center',
            },
        },
        leftBox: {
            position: 'left',
            shape: 'box',
            previous: 'centerBox',
            count: 3, ySpacing: DEFAULTS.SHAPE.width / 8,
            arrow: {}
        },
        aboveBox: {
            position: 'above',
            width: DEFAULTS.SHAPE.width * 2, height: DEFAULTS.SHAPE.height / 2,
            shape: 'box',
            previous: 'centerBox',
            count: 3, xSpacing: -DEFAULTS.SHAPE.width / 4, ySpacing: DEFAULTS.SHAPE.width / 8,
            arrow: [
                {},
                {
                    segments: [
                        { direction: 'up' },
                        { direction: 'right' },
                    ],
                    previous: 'leftBox',
                },
                {
                    segments: [
                        { direction: 'left', extraLength: DEFAULTS.SHAPE.width / 4 },
                        { direction: 'up', extraLength: DEFAULTS.SHAPE.height + DEFAULTS.SHAPE.separation + DEFAULTS.SHAPE.width / 4 },
                        { direction: 'right' },
                        { direction: 'down' },
                    ],
                    previous: 'leftBox',
                },
                {
                    segments: [
                        { direction: 'right', extraLength: DEFAULTS.SHAPE.width / 4, yOffset: -DEFAULTS.SHAPE.width / 4 },
                        { direction: 'up' },
                        { direction: 'right' },
                        { direction: 'up', extraLength: DEFAULTS.SHAPE.width / 4, xOffset: -DEFAULTS.SHAPE.width / 4 },
                    ],
                    previous: 'leftBox',
                }
            ]
        },
        rightBox: {
            shape: 'box',
            previous: 'centerBox',
            count: 3, xSpacing: -DEFAULTS.SHAPE.width / 4,
            arrow: [
                {},
                {
                    segments: [
                        { direction: 'right' },
                        { direction: 'down' },
                    ],
                    previous: 'aboveBox',
                },
                {
                    segments: [
                        { direction: 'down', extraLength: DEFAULTS.SHAPE.width / 4, xOffset: DEFAULTS.SHAPE.width / 4 },
                        { direction: 'right' },
                        { direction: 'down' },
                        { direction: 'right', extraLength: DEFAULTS.SHAPE.width / 4, yOffset: -DEFAULTS.SHAPE.width / 4 },
                    ],
                    previous: 'aboveBox',
                },
                {
                    segments: [
                        { direction: 'up', extraLength: DEFAULTS.SHAPE.width / 4, xOffset: DEFAULTS.SHAPE.width / 4 },
                        { direction: 'right', extraLength: DEFAULTS.SHAPE.width * 2 + DEFAULTS.SHAPE.separation },
                        { direction: 'down' },
                        { direction: 'left', yOffset: -DEFAULTS.SHAPE.width / 4 },
                    ],
                    previous: 'aboveBox',
                }
            ]
        },
        belowBox: {
            position: 'below',
            width: DEFAULTS.SHAPE.width * 2, height: DEFAULTS.SHAPE.height / 2,
            shape: 'box',
            previous: 'centerBox',
            count: 3,
            arrow: [
                {},
                {
                    segments: [
                        { direction: 'down' },
                        { direction: 'left' },
                    ],
                    previous: 'rightBox',
                },
                {
                    segments: [
                        { direction: 'right', extraLength: DEFAULTS.SHAPE.width / 4 },
                        { direction: 'down', extraLength: DEFAULTS.SHAPE.height + DEFAULTS.SHAPE.separation + DEFAULTS.SHAPE.width / 4 },
                        { direction: 'left' },
                        { direction: 'up' },
                    ],
                    previous: 'rightBox',
                },
                {
                    segments: [
                        { direction: 'left', extraLength: DEFAULTS.SHAPE.width / 4, yOffset: DEFAULTS.SHAPE.width / 4 },
                        { direction: 'down' },
                        { direction: 'left' },
                        { direction: 'down', extraLength: DEFAULTS.SHAPE.width / 4, xOffset: DEFAULTS.SHAPE.width / 4 },
                    ],
                    previous: 'rightBox',
                }
            ]
        },

        centerBox2: {
            x: 700, y: 800,
            width: DEFAULTS.SHAPE.width * 2,
            shape: 'box',
            text: {
                latexText: 'box_{center}',
                position: 'center',
            },
        },
        belowBox2: {
            position: 'below',
            width: DEFAULTS.SHAPE.width * 2, height: DEFAULTS.SHAPE.height / 2,
            shape: 'box',
            previous: 'centerBox2',
            count: 3,
            arrow: {}
        },
        leftBox2: {
            position: 'left',
            shape: 'box',
            previous: 'centerBox2',
            count: 3, ySpacing: DEFAULTS.SHAPE.width / 8,
            arrow: [
                {},
                {
                    segments: [
                        { direction: 'left' },
                        { direction: 'up' },
                    ],
                    previous: 'belowBox2',
                },
                {
                    segments: [
                        { direction: 'up', extraLength: DEFAULTS.SHAPE.width / 4, xOffset: -DEFAULTS.SHAPE.width / 4 },
                        { direction: 'left' },
                        { direction: 'up' },
                        { direction: 'left', extraLength: DEFAULTS.SHAPE.width / 4, yOffset: DEFAULTS.SHAPE.width / 4 },
                    ],
                    previous: 'belowBox2',
                },
                {
                    segments: [
                        { direction: 'down', extraLength: DEFAULTS.SHAPE.width / 4 },
                        { direction: 'left', extraLength: DEFAULTS.SHAPE.width * 2 + DEFAULTS.SHAPE.separation + DEFAULTS.SHAPE.width / 4 },
                        { direction: 'up' },
                        { direction: 'right' },
                    ],
                    previous: 'belowBox2',
                }
            ]
        },
    }
}
