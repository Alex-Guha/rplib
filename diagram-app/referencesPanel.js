// Consumer-owned references panel. Core no longer ships a references renderer;
// this is the canonical "how do I get references back" recipe, wired via
// `createEditor({ panels: [referencesPanel] })` / `createViewer({ ... })`.
//
// Shared by the editor demo (diagram-app) and the viewer demo (diagram-viewer).
import { definePanel } from '@alexguha/rplib/panel';

export const referencesPanel = definePanel({
    name: 'references',
    title: 'References',
    property: 'references',                 // → ctx.resolveProperty('references')
    showWhen: (data) => !!data && Object.keys(data).length > 0,

    // Editability: references is stored as an object keyed by title, so the
    // component editor renders a list whose `title` field doubles as that key.
    itemKey: 'title',
    itemFields: {
        title: 'text',
        link: 'text',
        info: 'textarea',
        authors: 'list',
        refType: 'text',
    },

    render(container, refs, ctx) {
        const list = document.createElement('ul');
        list.id = 'references-list';
        Object.entries(refs).forEach(([title, ref]) => {
            const a = document.createElement('a');
            a.href = ref.link || '#';
            a.target = '_blank';
            a.textContent = (title || 'Untitled') + (ref.refType ? ` (${ref.refType})` : '');
            a.dataset.info =
                (ref.title ? `**Reference Name:** ${ref.title}\n\n` : '') +
                (ref.info ? `**Description:** ${ref.info}\n\n` : '') +
                (ref.authors?.length ? `**Authors:**\n${ref.authors.map((x) => `• ${x}`).join('\n')}\n\n` : '') +
                (ref.refType ? `**Link type:** ${ref.refType}\n\n` : '');
            ctx.attachHoverPreview(a);
            const li = document.createElement('li');
            li.appendChild(a);
            list.appendChild(li);
        });
        container.appendChild(list);
    },
});
