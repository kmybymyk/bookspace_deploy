import Paragraph from '@tiptap/extension-paragraph'

export const CustomParagraph = Paragraph.extend({
    name: 'paragraph',

    addAttributes() {
        return {
            id: {
                default: null,
                parseHTML: (element) => element.getAttribute('id'),
                renderHTML: (attributes) => ({
                    id: attributes.id,
                }),
            },
            dataNotePlaceholder: {
                default: null,
                parseHTML: (element) => element.getAttribute('data-note-placeholder'),
                renderHTML: (attributes) => ({
                    'data-note-placeholder': attributes.dataNotePlaceholder,
                }),
            },
            class: {
                default: null,
                parseHTML: (element) => element.getAttribute('class'),
                renderHTML: (attributes) => {
                    return {
                        class: attributes.class,
                    }
                },
            },
            dataBlockFont: {
                default: null,
                parseHTML: (element) => element.getAttribute('data-block-font'),
                renderHTML: (attributes) => ({
                    'data-block-font': attributes.dataBlockFont,
                }),
            },
        }
    },
})
