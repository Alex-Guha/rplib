import { createEditor } from '@alexguha/rplib-editor';

window.onload = async () => {
    const manager = await createEditor({
        dataDir: './data',
    });
    manager.restoreView('test');
};
