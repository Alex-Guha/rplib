import { createEditor } from '@alexguha/rplib-editor';
import { referencesPanel } from './referencesPanel.js';

window.onload = async () => {
    const manager = await createEditor({
        dataDir: './data',
        panels: [referencesPanel],
    });
    manager.restoreView('test');
};
