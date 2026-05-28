import { createEditor } from '@alexguha/rplib-editor';
import * as components from './standard_items/components.js';

window.onload = async () => {
    const manager = await createEditor({
        components,
        dataSource: './standard_items/abstract_diagrams.txt',
    });
    manager.restoreView('test');
};
