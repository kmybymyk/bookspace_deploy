import Blockquote from '@tiptap/extension-blockquote'
import { cleanQuotesCommand } from '../utils/quoteCleanup'

declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        customBlockquote: {
            toggleCleanBlockquote: () => ReturnType
        }
    }
}

export const CustomBlockquote = Blockquote.extend({
    name: 'blockquote',

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
            dataBlockFont: {
                default: null,
                parseHTML: (element) => element.getAttribute('data-block-font'),
                renderHTML: (attributes) => ({
                    'data-block-font': attributes.dataBlockFont,
                }),
            },
        }
    },

    addCommands() {
        return {
            ...this.parent?.(),
            toggleCleanBlockquote: () => ({ chain }) => {
                return chain()
                    .toggleBlockquote()
                    .command(cleanQuotesCommand)
                    .run()
            },
        }
    },
})
