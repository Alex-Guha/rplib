import { createEditor } from 'rplib-editor';
import * as components from './standard_items/components.js';

window.onload = async () => {
    const manager = await createEditor({
        components,
        dataSource: './standard_items/architectures.txt',
        labels: {
            abstract: { singular: 'Architecture', plural: 'Architectures' },
        },
    });
    manager.restoreView('test');
};
