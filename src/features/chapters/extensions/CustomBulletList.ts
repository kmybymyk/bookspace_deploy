import BulletList from '@tiptap/extension-bullet-list'

export const CustomBulletList = BulletList.extend({
    name: 'bulletList',

    addAttributes() {
        return {
            class: {
                default: null,
                parseHTML: (element) => element.getAttribute('class'),
                renderHTML: (attributes) => ({
                    class: attributes.class,
                }),
            },
        }
    },
})

