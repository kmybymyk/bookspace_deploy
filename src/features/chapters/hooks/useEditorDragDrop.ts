import { useState, useCallback, useRef } from 'react'
import type { Editor } from '@tiptap/react'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import i18n from '../../../i18n'
import { resolveTopLevelBlockElement } from '../utils/editorHelpers'

export interface BlockDragState {
    dragging: boolean
    sourcePos: number | null
    targetPos: number | null
    placement: 'before' | 'after'
    indicatorTop: number | null
}

export interface TopLevelBlock {
    node: ProseMirrorNode
    offset: number
}

export function useEditorDragDrop(
    editor: Editor | null,
    editorCardRef: React.RefObject<HTMLDivElement | null>,
    editorScrollRef: React.RefObject<HTMLDivElement | null>,
    setSelectionAtBlock: (pos: number) => void
) {
    const [blockDrag, setBlockDrag] = useState<BlockDragState>({
        dragging: false,
        sourcePos: null,
        targetPos: null,
        placement: 'after',
        indicatorTop: null,
    })

    const dragPreviewRef = useRef<HTMLDivElement | null>(null)

    const cleanupDragPreview = useCallback(() => {
        if (dragPreviewRef.current) {
            dragPreviewRef.current.remove()
            dragPreviewRef.current = null
        }
    }, [])

    const getTopLevelBlocks = useCallback(() => {
        if (!editor) return [] as TopLevelBlock[]
        const items: TopLevelBlock[] = []
        editor.state.doc.forEach((node, offset) => {
            items.push({ node, offset })
        })
        return items
    }, [editor])

    const findTopLevelBlockIndex = useCallback(
        (blockPos: number) => {
            const blocks = getTopLevelBlocks()
            const index = blocks.findIndex(({ offset, node }) => blockPos >= offset && blockPos < offset + node.nodeSize)
            return { blocks, index }
        },
        [getTopLevelBlocks],
    )

    const attachDragPreview = useCallback(
        (blockPos: number, dataTransfer: DataTransfer) => {
            const { blocks, index } = findTopLevelBlockIndex(blockPos)
            if (index < 0) return

            const block = blocks[index].node
            const rawText = (block.textContent ?? '').replace(/\s+/g, ' ').trim()
            const previewText =
                rawText.length > 0
                    ? rawText.slice(0, 72) + (rawText.length > 72 ? '…' : '')
                    : block.type?.name === 'horizontalRule'
                        ? i18n.t('editorDragDrop.preview.divider')
                        : block.type?.name === 'table'
                            ? i18n.t('editorDragDrop.preview.table')
                            : i18n.t('editorDragDrop.preview.block')

            cleanupDragPreview()
            const el = document.createElement('div')
            el.style.position = 'fixed'
            el.style.top = '-9999px'
            el.style.left = '-9999px'
            el.style.maxWidth = '420px'
            el.style.padding = '10px 12px'
            el.style.borderRadius = '10px'
            el.style.border = '1px solid rgba(148,163,184,0.4)'
            el.style.background = 'rgba(23,23,23,0.78)'
            el.style.backdropFilter = 'blur(2px)'
            el.style.color = '#f3f4f6'
            el.style.fontFamily = "'Pretendard', 'Noto Sans KR', sans-serif"
            el.style.fontSize = '13px'
            el.style.lineHeight = '1.35'
            el.style.boxShadow = '0 8px 24px rgba(0,0,0,0.3)'
            el.style.pointerEvents = 'none'
            el.textContent = previewText
            document.body.appendChild(el)
            dragPreviewRef.current = el
            dataTransfer.setDragImage(el, 18, 16)
        },
        [cleanupDragPreview, findTopLevelBlockIndex],
    )

    const moveBlockByDrop = useCallback(
        (sourcePos: number, targetPos: number, placement: 'before' | 'after') => {
            if (!editor) return
            const blocks = getTopLevelBlocks()
            const sourceIndex = blocks.findIndex(
                ({ offset, node }) => sourcePos >= offset && sourcePos < offset + node.nodeSize
            )
            const targetIndex = blocks.findIndex(
                ({ offset, node }) => targetPos >= offset && targetPos < offset + node.nodeSize
            )
            if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return

            const source = blocks[sourceIndex]
            const target = blocks[targetIndex]
            const sourceStart = source.offset
            const sourceEnd = source.offset + source.node.nodeSize

            let insertPos =
                placement === 'before'
                    ? target.offset
                    : target.offset + target.node.nodeSize

            if (sourceStart < insertPos) {
                insertPos -= source.node.nodeSize
            }
            if (insertPos === sourceStart) return

            const tr = editor.state.tr.delete(sourceStart, sourceEnd).insert(insertPos, source.node)
            editor.view.dispatch(tr)
            setSelectionAtBlock(insertPos)
        },
        [editor, getTopLevelBlocks, setSelectionAtBlock],
    )

    const pickBlockElement = useCallback(
        (target: EventTarget | null) => {
            if (!editor) return null
            const viewDom = editor.view.dom as HTMLElement

            const el =
                target instanceof HTMLElement
                    ? target
                    : target instanceof Node
                        ? target.parentElement
                        : null
            return resolveTopLevelBlockElement(el, viewDom)
        },
        [editor]
    )

    const handleEditorDragOver = useCallback(
        (e: React.DragEvent<HTMLDivElement>) => {
            if (!blockDrag.dragging || !editor) return
            e.preventDefault()
            e.stopPropagation()
            e.dataTransfer.dropEffect = 'move'
            const blockEl = pickBlockElement(e.target)
            if (!blockEl) return

            const blockRect = blockEl.getBoundingClientRect()
            const placement = e.clientY < blockRect.top + blockRect.height / 2 ? 'before' : 'after'
            const targetPos = editor.view.posAtDOM(blockEl, 0)
            const scrollEl = editorScrollRef.current
            const cardEl = editorCardRef.current
            if (!scrollEl || !cardEl) return
            const cardRect = cardEl.getBoundingClientRect()
            const indicatorTop =
                blockRect.top -
                cardRect.top +
                (placement === 'after' ? blockRect.height : 0)

            setBlockDrag((prev) => ({ ...prev, targetPos, placement, indicatorTop }))
        },
        [blockDrag.dragging, editor, pickBlockElement, editorScrollRef, editorCardRef]
    )

    const handleEditorDrop = useCallback(
        (e: React.DragEvent<HTMLDivElement>) => {
            if (!blockDrag.dragging) return
            e.preventDefault()
            e.stopPropagation()
            const sourcePos = blockDrag.sourcePos
            const targetPos = blockDrag.targetPos
            if (sourcePos !== null && targetPos !== null) {
                moveBlockByDrop(sourcePos, targetPos, blockDrag.placement)
            }
            setBlockDrag({
                dragging: false,
                sourcePos: null,
                targetPos: null,
                placement: 'after',
                indicatorTop: null,
            })
            cleanupDragPreview()
        },
        [blockDrag, cleanupDragPreview, moveBlockByDrop]
    )

    return {
        blockDrag,
        setBlockDrag,
        attachDragPreview,
        cleanupDragPreview,
        getTopLevelBlocks,
        findTopLevelBlockIndex,
        pickBlockElement,
        handleEditorDragOver,
        handleEditorDrop,
    }
}
