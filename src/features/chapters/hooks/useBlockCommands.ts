import { useCallback } from 'react'
import type { Editor } from '@tiptap/react'
import type { TopLevelBlock } from './useEditorDragDrop'
import { TextSelection } from '@tiptap/pm/state'

export type BlockKind =
    | 'paragraph'
    | 'h2'
    | 'h3'
    | 'h4'
    | 'h5'
    | 'h6'
    | 'blockquote'
    | 'noteBox'
    | 'bulletList'
    | 'orderedList'
    | 'horizontalRule'

const DEFAULT_CONVERTIBLE_BLOCK_TYPES: BlockKind[] = [
    'paragraph',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'blockquote',
    'noteBox',
    'bulletList',
    'orderedList',
]

const getConvertibleTargets = (sourceType: string): BlockKind[] => {
    if (sourceType === 'horizontalRule') return ['paragraph']
    if (sourceType === 'table') return ['paragraph']
    return DEFAULT_CONVERTIBLE_BLOCK_TYPES
}

interface UseBlockCommandsParams {
    editor: Editor | null
    blockPos: number
    findTopLevelBlockIndex: (blockPos: number) => { blocks: TopLevelBlock[]; index: number }
    setSelectionAtBlock: (blockPos: number) => void
    closeBlockMenu: () => void
}

export function useBlockCommands({
    editor,
    blockPos,
    findTopLevelBlockIndex,
    setSelectionAtBlock,
    closeBlockMenu,
}: UseBlockCommandsParams) {
    const splitBlockAtCursor = useCallback(() => {
        if (!editor) return false
        const current = editor.state.selection.$from
        const { blocks, index } = findTopLevelBlockIndex(blockPos)
        if (index < 0) return false
        const { node, offset } = blocks[index]
        const blockStart = offset
        const blockEnd = offset + node.nodeSize
        const selectionFrom = editor.state.selection.from
        const selectionTo = editor.state.selection.to
        const selectionInsideBlock = selectionFrom >= blockStart && selectionTo <= blockEnd
        if (!selectionInsideBlock || !current.parent.isTextblock) return false
        const didSplit = editor.chain().focus().splitBlock().run()
        if (didSplit) {
            closeBlockMenu()
        }
        return didSplit
    }, [blockPos, closeBlockMenu, editor, findTopLevelBlockIndex])

    const duplicateBlock = useCallback(() => {
        if (!editor) return
        const { blocks, index } = findTopLevelBlockIndex(blockPos)
        if (index < 0) return
        const { node, offset } = blocks[index]
        const insertPos = offset + node.nodeSize
        const clone = node.type.create(node.attrs, node.content, node.marks)
        const tr = editor.state.tr.insert(insertPos, clone)
        editor.view.dispatch(tr)
        setSelectionAtBlock(insertPos)
        closeBlockMenu()
    }, [blockPos, closeBlockMenu, editor, findTopLevelBlockIndex, setSelectionAtBlock])

    const deleteBlock = useCallback(() => {
        if (!editor) return
        const { blocks, index } = findTopLevelBlockIndex(blockPos)
        if (index < 0) return
        const { node, offset } = blocks[index]
        const tr = editor.state.tr.delete(offset, offset + node.nodeSize)
        editor.view.dispatch(tr)
        const fallback = blocks[Math.max(0, index - 1)]?.offset ?? 1
        setSelectionAtBlock(fallback)
        closeBlockMenu()
    }, [blockPos, closeBlockMenu, editor, findTopLevelBlockIndex, setSelectionAtBlock])

    const insertSiblingParagraphAfterBlock = useCallback(
        (targetBlockPos: number) => {
            if (!editor) return null
            const { blocks, index } = findTopLevelBlockIndex(targetBlockPos)
            if (index < 0) return null
            const { node, offset } = blocks[index]
            const insertPos = offset + node.nodeSize
            const paragraph = editor.state.schema.nodes.paragraph?.create()
            if (!paragraph) return null
            const tr = editor.state.tr.insert(insertPos, paragraph)
            const cursorPos = Math.min(insertPos + 1, tr.doc.content.size - 1)
            const selection = TextSelection.create(tr.doc, cursorPos)
            tr.setSelection(selection)
            editor.view.dispatch(tr)
            editor.commands.focus()
            return cursorPos
        },
        [editor, findTopLevelBlockIndex],
    )

    const getCurrentBlock = useCallback(() => {
        const { blocks, index } = findTopLevelBlockIndex(blockPos)
        if (index < 0) return null
        return blocks[index]
    }, [blockPos, findTopLevelBlockIndex])

    const getAvailableBlockTypes = useCallback(() => {
        const currentBlock = getCurrentBlock()
        if (!currentBlock) return DEFAULT_CONVERTIBLE_BLOCK_TYPES
        return getConvertibleTargets(currentBlock.node.type?.name ?? '')
    }, [getCurrentBlock])

    const convertBlockType = useCallback(
        (kind: BlockKind) => {
            if (!editor) return
            const current = getCurrentBlock()
            if (!current) return
            if (!getAvailableBlockTypes().includes(kind)) return
            const { node, offset } = current
            const from = Math.max(1, offset + 1)
            const to = Math.max(from, offset + node.nodeSize - 1)
            const sourceIsBlockquote = node.type?.name === 'blockquote'

            editor.chain().focus().setTextSelection({ from, to }).run()

            if (sourceIsBlockquote && kind !== 'blockquote' && kind !== 'noteBox') {
                editor.chain().focus().setTextSelection({ from, to }).toggleCleanBlockquote().run()
            }

            if (node.type?.name === 'table' && kind === 'paragraph') {
                const paragraph = editor.state.schema.nodes.paragraph?.create()
                if (!paragraph) return
                const tr = editor.state.tr.replaceWith(offset, offset + node.nodeSize, paragraph)
                editor.view.dispatch(tr)
                setSelectionAtBlock(offset)
                closeBlockMenu()
                return
            }

            if (kind === 'horizontalRule') {
                const hr = editor.state.schema.nodes.horizontalRule?.create({ class: 'rule-solid' })
                if (!hr) return
                const tr = editor.state.tr.replaceWith(offset, offset + node.nodeSize, hr)
                editor.view.dispatch(tr)
                setSelectionAtBlock(offset)
                closeBlockMenu()
                return
            }

            const afterFrom = Math.min(from, Math.max(1, editor.state.doc.content.size))
            if (kind === 'paragraph') editor.chain().focus().setTextSelection(afterFrom).setParagraph().run()
            if (kind === 'h2') editor.chain().focus().setTextSelection(afterFrom).setHeading({ level: 2 }).run()
            if (kind === 'h3') editor.chain().focus().setTextSelection(afterFrom).setHeading({ level: 3 }).run()
            if (kind === 'h4') editor.chain().focus().setTextSelection(afterFrom).setHeading({ level: 4 }).run()
            if (kind === 'h5') editor.chain().focus().setTextSelection(afterFrom).setHeading({ level: 5 }).run()
            if (kind === 'h6') editor.chain().focus().setTextSelection(afterFrom).setHeading({ level: 6 }).run()
            if (kind === 'blockquote') {
                if (sourceIsBlockquote) {
                    editor
                        .chain()
                        .focus()
                        .setTextSelection(afterFrom)
                        .setParagraph()
                        .updateAttributes('blockquote', { class: null, dataBlockFont: 'serif' })
                        .run()
                } else {
                    editor
                        .chain()
                        .focus()
                        .setTextSelection(afterFrom)
                        .setParagraph()
                        .toggleCleanBlockquote()
                        .updateAttributes('blockquote', { class: null, dataBlockFont: 'serif' })
                        .run()
                }
            }
            if (kind === 'noteBox') {
                if (editor.isActive('blockquote')) {
                    editor
                        .chain()
                        .focus()
                        .setTextSelection(afterFrom)
                        .setParagraph()
                        .updateAttributes('blockquote', { class: 'quote-note', dataBlockFont: 'serif' })
                        .run()
                } else {
                    editor
                        .chain()
                        .focus()
                        .setTextSelection(afterFrom)
                        .setParagraph()
                        .toggleCleanBlockquote()
                        .updateAttributes('blockquote', { class: 'quote-note', dataBlockFont: 'serif' })
                        .run()
                }
            }
            if (kind === 'bulletList') editor.chain().focus().setTextSelection(afterFrom).setParagraph().toggleBulletList().run()
            if (kind === 'orderedList') editor.chain().focus().setTextSelection(afterFrom).setParagraph().toggleOrderedList().run()

            setSelectionAtBlock(offset)
            closeBlockMenu()
        },
        [getAvailableBlockTypes, closeBlockMenu, editor, getCurrentBlock, setSelectionAtBlock],
    )

    return {
        splitBlockAtCursor,
        duplicateBlock,
        deleteBlock,
        insertSiblingParagraphAfterBlock,
        convertBlockType,
        getAvailableBlockTypes,
    }
}
