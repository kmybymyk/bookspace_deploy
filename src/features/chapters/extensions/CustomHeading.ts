import Heading from '@tiptap/extension-heading'

export const CustomHeading = Heading.extend({
    name: 'heading',

    addAttributes() {
        return {
            ...this.parent?.(),
            class: {
                default: null,
                parseHTML: (element) => element.getAttribute('class'),
                renderHTML: (attributes) => ({
                    class: attributes.class,
                }),
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
