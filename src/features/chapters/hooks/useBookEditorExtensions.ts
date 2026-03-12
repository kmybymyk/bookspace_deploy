import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import Placeholder from '@tiptap/extension-placeholder'
import Link from '@tiptap/extension-link'
import Superscript from '@tiptap/extension-superscript'
import Subscript from '@tiptap/extension-subscript'
import { TableRow, TableCell, TableHeader } from '@tiptap/extension-table'
import { useMemo } from 'react'
import type { TFunction } from 'i18next'
import { CustomImage } from '../extensions/CustomImage'
import { SelectionDivider } from '../extensions/SelectionDivider'
import { CustomBlockquote } from '../extensions/CustomBlockquote'
import { CustomBulletList } from '../extensions/CustomBulletList'
import { CustomParagraph } from '../extensions/CustomParagraph'
import { CustomTable } from '../extensions/CustomTable'
import { CustomHeading } from '../extensions/CustomHeading'
import { BookTableView } from '../extensions/BookTableView'

export function useBookEditorExtensions(t: TFunction) {
    return useMemo(
        () => [
            StarterKit.configure({
                paragraph: false,
                blockquote: false,
                heading: false,
                horizontalRule: false,
                bulletList: false,
                link: false,
                underline: false,
                gapcursor: false,
            }),
            CustomParagraph,
            CustomBlockquote,
            CustomHeading,
            CustomBulletList,
            SelectionDivider,
            Underline,
            TextAlign.configure({ types: ['heading', 'paragraph', 'blockquote'] }),
            Placeholder.configure({
                showOnlyCurrent: false,
                placeholder: ({ node }) => {
                    if (node.type.name === 'heading') {
                        const level = Number(node.attrs?.level ?? 0)
                        if (level === 2) return t('designPanel.slot.h2')
                        if (level === 3) return t('designPanel.slot.h3')
                        if (level === 4) return t('designPanel.slot.h4')
                        if (level === 5) return t('designPanel.slot.h5')
                        if (level === 6) return t('designPanel.slot.h6')
                    }
                    return ''
                },
            }),
            CustomImage.configure({ inline: false }),
            Link.configure({ openOnClick: false }),
            Superscript,
            Subscript,
            CustomTable.configure({
                resizable: true,
                cellMinWidth: 72,
                lastColumnResizable: false,
                allowTableNodeSelection: true,
                View: BookTableView,
            }),
            TableRow,
            TableHeader,
            TableCell,
        ],
        [t],
    )
}
