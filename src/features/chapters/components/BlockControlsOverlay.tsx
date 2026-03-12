import type { Editor } from '@tiptap/react'
import { Plus, GripVertical } from 'lucide-react'
import type { Dispatch, RefObject, SetStateAction } from 'react'
import type { BlockKind } from '../hooks/useBlockCommands'
import i18n from '../../../i18n'
import { resolveEventTargetElement } from '../utils/editorHelpers'

export interface BlockHandleState {
    visible: boolean
    top: number
    blockPos: number
}

export interface BlockMenuState {
    visible: boolean
    top: number
    left: number
    blockPos: number
}

export interface BlockDragState {
    dragging: boolean
    sourcePos: number | null
    targetPos: number | null
    placement: 'before' | 'after'
    indicatorTop: number | null
}

interface BlockControlsOverlayProps {
    editor: Editor
    blockHandle: BlockHandleState
    blockMenu: BlockMenuState
    blockDrag: BlockDragState
    showBlockTypeMenu: boolean
    didDragHandleRef: RefObject<boolean>
    clearHideHandleTimer: () => void
    scheduleHideHandle: () => void
    insertSiblingParagraphAfterBlock: (blockPos: number) => number | null
    toggleSlashMenu: (isOpen: boolean, pos?: { top: number; left: number }) => void
    attachDragPreview: (blockPos: number, dataTransfer: DataTransfer) => void
    setSelectionAtBlock: (blockPos: number) => void
    setBlockMenu: Dispatch<SetStateAction<BlockMenuState>>
    closeBlockMenu: () => void
    setBlockDrag: Dispatch<SetStateAction<BlockDragState>>
    cleanupDragPreview: () => void
    setShowBlockTypeMenu: Dispatch<SetStateAction<boolean>>
    convertBlockType: (kind: BlockKind) => void
    splitBlockAtCursor: () => boolean
    duplicateBlock: () => void
    deleteBlock: () => void
    availableBlockTypes: BlockKind[]
}

export default function BlockControlsOverlay({
    editor,
    blockHandle,
    blockMenu,
    blockDrag,
    showBlockTypeMenu,
    didDragHandleRef,
    clearHideHandleTimer,
    scheduleHideHandle,
    insertSiblingParagraphAfterBlock,
    toggleSlashMenu,
    attachDragPreview,
    setSelectionAtBlock,
    setBlockMenu,
    closeBlockMenu,
    setBlockDrag,
    cleanupDragPreview,
    setShowBlockTypeMenu,
    convertBlockType,
    splitBlockAtCursor,
    availableBlockTypes,
    duplicateBlock,
    deleteBlock,
}: BlockControlsOverlayProps) {
    const blockTypeOptions: Array<[BlockKind, string]> = [
        ['paragraph', i18n.t('blockControls.types.paragraph')],
        ['h2', i18n.t('blockControls.types.h2')],
        ['h3', i18n.t('blockControls.types.h3')],
        ['h4', i18n.t('blockControls.types.h4')],
        ['h5', i18n.t('blockControls.types.h5')],
        ['h6', i18n.t('blockControls.types.h6')],
        ['blockquote', i18n.t('blockControls.types.blockquote')],
        ['noteBox', i18n.t('blockControls.types.noteBox')],
        ['bulletList', i18n.t('blockControls.types.bulletList')],
        ['orderedList', i18n.t('blockControls.types.orderedList')],
        ['horizontalRule', i18n.t('blockControls.types.horizontalRule')],
    ]

    return (
        <>
            {editor && blockHandle.visible && (
                <div
                    data-block-handle="true"
                    className="absolute left-4 z-20 flex items-center gap-1.5 transition-all duration-150 ease-out"
                    style={{ top: blockHandle.top }}
                    onMouseEnter={() => clearHideHandleTimer()}
                    onMouseLeave={(e) => {
                        if (blockMenu.visible) return
                        const nextTarget = resolveEventTargetElement(e.relatedTarget)
                        if (nextTarget?.closest('[data-block-menu="true"]')) return
                        scheduleHideHandle()
                    }}
                >
                    <button
                        type="button"
                        className="flex h-8 w-8 items-center justify-center rounded-md text-xl leading-none text-[var(--ds-text-neutral-muted)] transition-colors hover:bg-[var(--ds-fill-neutral-control)] hover:text-[var(--ds-text-neutral-primary)]"
                        title={i18n.t('blockControls.insertBlock')}
                        onMouseDown={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            closeBlockMenu()
                            setShowBlockTypeMenu(false)
                            insertSiblingParagraphAfterBlock(blockHandle.blockPos)
                            const buttonRect = e.currentTarget.getBoundingClientRect()
                            toggleSlashMenu(true, {
                                top: buttonRect.bottom + 6,
                                left: buttonRect.left + 8,
                            })
                        }}
                    >
                        <Plus size={16} />
                    </button>
                    <button
                        type="button"
                        draggable
                        className="flex h-8 w-8 cursor-grab items-center justify-center rounded-md text-base leading-none text-[var(--ds-text-neutral-muted)] transition-colors hover:bg-[var(--ds-fill-neutral-control)] hover:text-[var(--ds-text-neutral-primary)] active:cursor-grabbing"
                        title={i18n.t('blockControls.blockActions')}
                        onDragStart={(e) => {
                            didDragHandleRef.current = true
                            e.dataTransfer.effectAllowed = 'move'
                            e.dataTransfer.setData('application/x-epub-block-move', '1')
                            attachDragPreview(blockHandle.blockPos, e.dataTransfer)
                            setSelectionAtBlock(blockHandle.blockPos)
                            setBlockDrag({
                                dragging: true,
                                sourcePos: blockHandle.blockPos,
                                targetPos: blockHandle.blockPos,
                                placement: 'after',
                                indicatorTop: null,
                            })
                            closeBlockMenu()
                        }}
                        onDragEnd={() => {
                            cleanupDragPreview()
                            window.setTimeout(() => {
                                didDragHandleRef.current = false
                            }, 0)
                            setBlockDrag({
                                dragging: false,
                                sourcePos: null,
                                targetPos: null,
                                placement: 'after',
                                indicatorTop: null,
                            })
                        }}
                        onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            if (didDragHandleRef.current) return
                            const triggerRect = e.currentTarget.getBoundingClientRect()
                            const estimatedMenuHeight = showBlockTypeMenu ? 360 : 220
                            const top = Math.max(
                                12,
                                Math.min(triggerRect.top + 18, window.innerHeight - estimatedMenuHeight - 12),
                            )
                            const left = Math.max(12, Math.min(triggerRect.left + 12, window.innerWidth - 220))
                            setBlockMenu({
                                visible: !blockMenu.visible || blockMenu.blockPos !== blockHandle.blockPos,
                                top,
                                left,
                                blockPos: blockHandle.blockPos,
                            })
                            setShowBlockTypeMenu(false)
                            setSelectionAtBlock(blockHandle.blockPos)
                        }}
                    >
                        <GripVertical size={16} />
                    </button>
                </div>
            )}

            {editor && blockMenu.visible && (
                <div
                    data-block-menu="true"
                    className="fixed z-30 w-48 max-h-[min(72vh,420px)] overflow-y-auto rounded-md border border-[var(--ds-border-neutral-default)] bg-[var(--ds-fill-neutral-panel)] p-1.5 shadow-xl transition-all duration-150 ease-out"
                    style={{ top: blockMenu.top, left: blockMenu.left }}
                    onMouseEnter={() => clearHideHandleTimer()}
                    onMouseLeave={(e) => {
                        const nextTarget = resolveEventTargetElement(e.relatedTarget)
                        if (nextTarget?.closest('[data-block-handle="true"]')) return
                        if (!blockMenu.visible) scheduleHideHandle()
                    }}
                    onMouseDown={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                    }}
                >
                    <div
                        className="flex flex-row items-center px-2 py-1.5 text-xs font-medium text-[var(--ds-text-neutral-muted)]"
                        style={{ fontFamily: "'Pretendard', 'Noto Sans KR', sans-serif" }}
                    >
                        <GripVertical size={12} className="mb-0.5 mr-1 inline-block text-[var(--ds-text-neutral-muted)]" /> {i18n.t('blockControls.dragToMove')}
                    </div>
                    <button
                        className="w-full rounded px-2 py-1 text-left text-xs text-[var(--ds-text-neutral-secondary)] hover:bg-[var(--ds-fill-neutral-control)]"
                        style={{ fontFamily: "'Pretendard', 'Noto Sans KR', sans-serif" }}
                        onMouseDown={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            setShowBlockTypeMenu(false)
                            const didSplit = splitBlockAtCursor()
                            if (!didSplit) {
                                insertSiblingParagraphAfterBlock(blockMenu.blockPos)
                                closeBlockMenu()
                            }
                        }}
                    >
                        {i18n.t('blockControls.splitHere')}
                    </button>
                    <button
                        className="w-full rounded px-2 py-1 text-left text-xs text-[var(--ds-text-neutral-secondary)] hover:bg-[var(--ds-fill-neutral-control)]"
                        style={{ fontFamily: "'Pretendard', 'Noto Sans KR', sans-serif" }}
                        onMouseDown={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            setShowBlockTypeMenu((prev) => !prev)
                        }}
                    >
                        {i18n.t('blockControls.changeType')}
                    </button>
                    {showBlockTypeMenu && (
                        <div className="mb-1 mt-1 border-t border-[var(--ds-border-neutral-subtle)] pt-1">
                            {blockTypeOptions
                                .filter(([kind]) => availableBlockTypes.includes(kind))
                                .map(([kind, label]) => (
                                <button
                                    key={kind}
                                    className="w-full rounded px-2 py-1 text-left text-xs text-[var(--ds-text-neutral-secondary)] hover:bg-[var(--ds-fill-neutral-control)]"
                                    style={{ fontFamily: "'Pretendard', 'Noto Sans KR', sans-serif" }}
                                    onMouseDown={(e) => {
                                        e.preventDefault()
                                        e.stopPropagation()
                                        setShowBlockTypeMenu(false)
                                        convertBlockType(kind)
                                    }}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    )}
                    <button
                        className="w-full rounded px-2 py-1 text-left text-xs text-[var(--ds-text-neutral-secondary)] hover:bg-[var(--ds-fill-neutral-control)]"
                        style={{ fontFamily: "'Pretendard', 'Noto Sans KR', sans-serif" }}
                        onMouseDown={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            setShowBlockTypeMenu(false)
                            duplicateBlock()
                        }}
                    >
                        {i18n.t('blockControls.duplicate')}
                    </button>
                    <button
                        className="w-full rounded px-2 py-1 text-left text-xs text-[var(--ds-text-danger-default)] hover:bg-[var(--ds-fill-danger-weak)]"
                        style={{ fontFamily: "'Pretendard', 'Noto Sans KR', sans-serif" }}
                        onMouseDown={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            setShowBlockTypeMenu(false)
                            deleteBlock()
                        }}
                    >
                        {i18n.t('common.delete')}
                    </button>
                </div>
            )}

            {editor && blockDrag.dragging && blockDrag.indicatorTop !== null && (
                <div
                    className="absolute left-16 right-16 z-20 pointer-events-none"
                    style={{ top: blockDrag.indicatorTop }}
                >
                    <div className="h-[3px] rounded-full bg-[var(--ds-text-info-default)] shadow-[0_0_0_1px_rgba(125,211,252,0.35)]" />
                </div>
            )}
        </>
    )
}
