import type { Editor } from '@tiptap/core'
import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type Dispatch,
    type MouseEvent as ReactMouseEvent,
    type RefObject,
    type SetStateAction,
} from 'react'
import type { BlockHandleState, BlockMenuState } from '../components/BlockControlsOverlay'
import { getBlockElementFromPos, resolveEventTargetElement } from '../utils/editorHelpers'

interface UseBlockHandleControllerInput {
    editor: Editor | null
    editorCardRef: RefObject<HTMLDivElement | null>
    blockMenu: BlockMenuState
    setBlockMenu: Dispatch<SetStateAction<BlockMenuState>>
    pickBlockElement: (target: HTMLElement | null) => HTMLElement | null
    updateFloatingToolbarPosition: () => void
    cleanupDragPreview: () => void
}

export function useBlockHandleController({
    editor,
    editorCardRef,
    blockMenu,
    setBlockMenu,
    pickBlockElement,
    updateFloatingToolbarPosition,
    cleanupDragPreview,
}: UseBlockHandleControllerInput) {
    const [blockHandle, setBlockHandle] = useState<BlockHandleState>({
        visible: false,
        top: 0,
        blockPos: 0,
    })
    const hideHandleTimerRef = useRef<number | null>(null)
    const didDragHandleRef = useRef(false)

    const resolveBlockMenuPosition = useCallback(
        (blockEl: HTMLElement) => {
            const cardEl = editorCardRef.current
            const blockRect = blockEl.getBoundingClientRect()
            const cardRect = cardEl?.getBoundingClientRect()
            const estimatedMenuHeight = 220
            const top = Math.max(
                12,
                Math.min(blockRect.top + 18, window.innerHeight - estimatedMenuHeight - 12),
            )
            const left = Math.max(
                12,
                Math.min((cardRect?.left ?? blockRect.left) + 54, window.innerWidth - 220),
            )
            return { top, left }
        },
        [editorCardRef],
    )

    const closeBlockMenu = useCallback(() => {
        setBlockMenu((prev) => ({ ...prev, visible: false }))
    }, [setBlockMenu])

    const clearHideHandleTimer = useCallback(() => {
        if (hideHandleTimerRef.current !== null) {
            window.clearTimeout(hideHandleTimerRef.current)
            hideHandleTimerRef.current = null
        }
    }, [])

    const scheduleHideHandle = useCallback(() => {
        clearHideHandleTimer()
        hideHandleTimerRef.current = window.setTimeout(() => {
            if (!blockMenu.visible) {
                setBlockHandle((prev) => ({ ...prev, visible: false }))
            }
            hideHandleTimerRef.current = null
        }, 140)
    }, [blockMenu.visible, clearHideHandleTimer])

    const updateBlockHandleAt = useCallback(
        (blockEl: HTMLElement | null) => {
            if (!editor) return
            const cardEl = editorCardRef.current
            if (!cardEl) return
            if (!blockEl) {
                setBlockHandle((prev) => ({ ...prev, visible: false }))
                return
            }
            const cardRect = cardEl.getBoundingClientRect()
            const blockRect = blockEl.getBoundingClientRect()
            const top = blockRect.top - cardRect.top + 2
            const blockPos = editor.view.posAtDOM(blockEl, 0)
            setBlockHandle({ visible: true, top, blockPos })
        },
        [editor, editorCardRef],
    )

    const handleEditorMouseMove = useCallback(
        (e: ReactMouseEvent<HTMLDivElement>) => {
            if (blockMenu.visible) return
            const target = resolveEventTargetElement(e.target)
            if (target?.closest('[data-block-handle="true"]') || target?.closest('[data-block-menu="true"]')) {
                clearHideHandleTimer()
                return
            }
            clearHideHandleTimer()
            const blockEl = pickBlockElement(target)
            if (!blockEl) return
            updateBlockHandleAt(blockEl)
        },
        [blockMenu.visible, clearHideHandleTimer, pickBlockElement, updateBlockHandleAt],
    )

    const handleEditorMouseLeave = useCallback((e: ReactMouseEvent<HTMLDivElement>) => {
        if (blockMenu.visible) return
        const nextTarget = resolveEventTargetElement(e.relatedTarget)
        if (nextTarget?.closest('[data-block-handle="true"]') || nextTarget?.closest('[data-block-menu="true"]')) return
        scheduleHideHandle()
    }, [blockMenu.visible, scheduleHideHandle])

    const handleEditorScroll = useCallback(() => {
        requestAnimationFrame(() => updateFloatingToolbarPosition())
        clearHideHandleTimer()
        const trackedPos =
            blockMenu.visible && blockMenu.blockPos > 0 ? blockMenu.blockPos : blockHandle.blockPos
        const blockEl = trackedPos && editor ? getBlockElementFromPos(trackedPos, editor) : null

        if (blockEl) {
            if (blockHandle.visible || !blockMenu.visible) {
                updateBlockHandleAt(blockEl)
            }
            if (blockMenu.visible) {
                const nextMenuPosition = resolveBlockMenuPosition(blockEl)
                setBlockMenu((prev) =>
                    prev.visible
                        ? {
                              ...prev,
                              top: nextMenuPosition.top,
                              left: nextMenuPosition.left,
                          }
                        : prev,
                )
            }
        } else if (!blockMenu.visible) {
            setBlockHandle((prev) => ({ ...prev, visible: false }))
        }
    }, [blockHandle.blockPos, blockHandle.visible, blockMenu.blockPos, blockMenu.visible, clearHideHandleTimer, editor, resolveBlockMenuPosition, setBlockMenu, updateBlockHandleAt, updateFloatingToolbarPosition])

    useEffect(() => {
        const onDown = (e: MouseEvent) => {
            const target = resolveEventTargetElement(e.target)
            if (!target) return
            if (target.closest('[data-block-menu="true"]')) return
            if (target.closest('[data-block-handle="true"]')) return
            closeBlockMenu()
        }
        document.addEventListener('mousedown', onDown)
        return () => document.removeEventListener('mousedown', onDown)
    }, [closeBlockMenu])

    useEffect(
        () => () => {
            clearHideHandleTimer()
            cleanupDragPreview()
        },
        [clearHideHandleTimer, cleanupDragPreview],
    )

    return {
        blockHandle,
        didDragHandleRef,
        closeBlockMenu,
        clearHideHandleTimer,
        scheduleHideHandle,
        handleEditorMouseMove,
        handleEditorMouseLeave,
        handleEditorScroll,
        resolveBlockMenuPosition,
    }
}
