import type { Editor } from '@tiptap/core'
import { NodeSelection } from '@tiptap/pm/state'
import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type RefObject,
} from 'react'

export interface FloatingToolbarState {
    visible: boolean
    left: number
    top: number
    placement: 'above' | 'below'
}

interface UseFloatingToolbarInput {
    editor: Editor | null
    editorScrollRef: RefObject<HTMLDivElement | null>
}

export function useFloatingToolbar({
    editor,
    editorScrollRef,
}: UseFloatingToolbarInput) {
    const [floatingToolbar, setFloatingToolbar] = useState<FloatingToolbarState>({
        visible: false,
        left: 0,
        top: 0,
        placement: 'above',
    })
    const floatingToolbarRef = useRef<HTMLDivElement | null>(null)

    const hasTableContext = useCallback(() => {
        if (!editor) return false
        const { selection } = editor.state
        if (selection instanceof NodeSelection && selection.node?.type?.name === 'table') {
            return true
        }
        const checkResolvedPos = (resolvedPos: typeof selection.$from) => {
            for (let depth = resolvedPos.depth; depth >= 0; depth--) {
                if (resolvedPos.node(depth)?.type?.name === 'table') return true
            }
            return false
        }
        return checkResolvedPos(selection.$from) || checkResolvedPos(selection.$to)
    }, [editor])

    const updateFloatingToolbarPosition = useCallback(() => {
        if (!editor) return
        const scrollEl = editorScrollRef.current
        if (!scrollEl) return
        const selection = editor.state.selection
        const { from, to, empty } = selection
        const isHorizontalRuleSelection =
            selection instanceof NodeSelection && selection.node?.type?.name === 'horizontalRule'
        const $from = editor.state.doc.resolve(from)
        const fromBeforeIsRule = $from.nodeBefore?.type?.name === 'horizontalRule'
        const fromAfterIsRule = $from.nodeAfter?.type?.name === 'horizontalRule'
        const isTableContext = hasTableContext()
        const activeElement = document.activeElement as HTMLElement | null
        const toolbarHasFocus = Boolean(
            activeElement && floatingToolbarRef.current?.contains(activeElement),
        )
        const shouldHideForEmptySelection = empty && !isTableContext
        if (
            isHorizontalRuleSelection ||
            fromBeforeIsRule ||
            fromAfterIsRule ||
            shouldHideForEmptySelection ||
            (!editor.isFocused && !toolbarHasFocus)
        ) {
            setFloatingToolbar((prev) => (prev.visible ? { ...prev, visible: false } : prev))
            return
        }

        let fromCoords: { left: number; right: number; top: number; bottom: number }
        let toCoords: { left: number; right: number; top: number; bottom: number }
        try {
            fromCoords = editor.view.coordsAtPos(from)
            toCoords = empty ? fromCoords : editor.view.coordsAtPos(to)
        } catch {
            setFloatingToolbar((prev) => (prev.visible ? { ...prev, visible: false } : prev))
            return
        }
        const toolbarEl = floatingToolbarRef.current
        const toolbarWidth = toolbarEl?.offsetWidth ?? 520
        const gutter = 12
        const toolbarHeight = toolbarEl?.offsetHeight ?? 42
        const viewportMinLeft = gutter + toolbarWidth / 2
        const viewportMaxLeft = window.innerWidth - gutter - toolbarWidth / 2

        if (isTableContext) {
            let tableElement: HTMLElement | null = null
            try {
                const domAtSelection = editor.view.domAtPos(from).node
                const domElement =
                    domAtSelection instanceof HTMLElement
                        ? domAtSelection
                        : domAtSelection.parentElement
                tableElement = domElement?.closest('table') ?? null
            } catch {
                tableElement = null
            }

            if (tableElement) {
                const tableRect = tableElement.getBoundingClientRect()
                const centerX = (tableRect.left + tableRect.right) / 2
                let left = centerX
                if (viewportMinLeft <= viewportMaxLeft) {
                    left = Math.min(Math.max(left, viewportMinLeft), viewportMaxLeft)
                }

                const tableTop = tableRect.top
                const tableBottom = tableRect.bottom
                const topRoom = tableTop
                const placeAbove = topRoom > toolbarHeight + 14

                setFloatingToolbar({
                    visible: true,
                    left,
                    top: placeAbove ? tableTop - 8 : tableBottom + 8,
                    placement: placeAbove ? 'above' : 'below',
                })
                return
            }
        }

        const selectionLeft = Math.min(fromCoords.left, toCoords.left)
        const selectionRight = Math.max(fromCoords.right, toCoords.right)
        const centerX = (selectionLeft + selectionRight) / 2
        let left = centerX
        if (viewportMinLeft <= viewportMaxLeft) {
            left = Math.min(Math.max(left, viewportMinLeft), viewportMaxLeft)
        }

        const selectionTop = Math.min(fromCoords.top, toCoords.top)
        const selectionBottom = Math.max(fromCoords.bottom, toCoords.bottom)
        const topRoom = selectionTop
        const placeAbove = topRoom > toolbarHeight + 14

        setFloatingToolbar({
            visible: true,
            left,
            top: placeAbove ? selectionTop - 8 : selectionBottom + 8,
            placement: placeAbove ? 'above' : 'below',
        })
    }, [editor, editorScrollRef, hasTableContext])

    useEffect(() => {
        if (!editor) {
            setFloatingToolbar((prev) => (prev.visible ? { ...prev, visible: false } : prev))
            return
        }
        const refresh = () => requestAnimationFrame(() => updateFloatingToolbarPosition())
        refresh()
        editor.on('selectionUpdate', refresh)
        editor.on('transaction', refresh)
        editor.on('focus', refresh)
        editor.on('blur', refresh)
        window.addEventListener('resize', refresh)
        return () => {
            editor.off('selectionUpdate', refresh)
            editor.off('transaction', refresh)
            editor.off('focus', refresh)
            editor.off('blur', refresh)
            window.removeEventListener('resize', refresh)
        }
    }, [editor, updateFloatingToolbarPosition])

    return {
        floatingToolbar,
        floatingToolbarRef,
        updateFloatingToolbarPosition,
    }
}
