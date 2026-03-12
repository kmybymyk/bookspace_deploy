import HorizontalRule from '@tiptap/extension-horizontal-rule'

export const SelectionDivider = HorizontalRule.extend({
    name: 'horizontalRule',

    addAttributes() {
        return {
            class: {
                default: null,
                parseHTML: (element) => element.getAttribute('class'),
                renderHTML: (attributes) => {
                    return {
                        class: attributes.class,
                    }
                },
            },
        }
    },
})
