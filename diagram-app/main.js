import { createEditor } from '@alexguha/rplib-editor';
import components from './standard_items/components.json' with { type: 'json' };

window.onload = async () => {
    const manager = await createEditor({
        components,
        dataSource: './standard_items/abstract_diagrams.txt',
    });
    manager.restoreView('test');
};
