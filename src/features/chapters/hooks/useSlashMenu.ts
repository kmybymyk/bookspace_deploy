import { useState, useCallback, useRef, useEffect } from 'react'
import type { Editor } from '@tiptap/react'

export interface SlashMenuState {
    isOpen: boolean
    query: string
    position: { top: number; left: number } | null
}

export function useSlashMenu() {
    const [slashMenu, setSlashMenu] = useState<SlashMenuState>({
        isOpen: false,
        query: '',
        position: null,
    })
    const slashMenuRef = useRef(slashMenu)

    // 동기화를 위한 ref 업데이트
    useEffect(() => {
        slashMenuRef.current = slashMenu
    }, [slashMenu])

    const closeSlashMenu = useCallback(() => {
        setSlashMenu({ isOpen: false, query: '', position: null })
    }, [])

    const toggleSlashMenu = useCallback(
        (isOpen: boolean, pos?: { top: number; left: number }) => {
            if (isOpen && pos) {
                setSlashMenu({ isOpen: true, query: '', position: pos })
            } else {
                closeSlashMenu()
            }
        },
        [closeSlashMenu]
    )

    const updateSlashMenuQuery = useCallback((query: string) => {
        setSlashMenu((prev) => ({ ...prev, query }))
    }, [])

    const getSlashQuery = useCallback((editor: Editor): string | null => {
        if (!editor.view.hasFocus()) return null

        const { selection } = editor.state
        if (!selection.empty) return null
        const { $from } = selection

        // 현재 블록(문단/헤딩) 기준 커서 좌측 텍스트만 사용해 슬래시 트리거 위치를 판정.
        const textBeforeCursor = $from.parent.textBetween(0, $from.parentOffset, '\n', '\n')
        const slashIndex = textBeforeCursor.lastIndexOf('/')
        if (slashIndex < 0) return null

        const tokenBeforeSlash = textBeforeCursor[slashIndex - 1] ?? ''
        if (slashIndex > 0 && !/\s/.test(tokenBeforeSlash)) return null

        const query = textBeforeCursor.slice(slashIndex + 1)
        if (query.includes(' ') || query.includes('\n')) return null

        return query
    }, [])

    const checkSlashCommand = useCallback((editor: Editor) => {
        const query = getSlashQuery(editor)
        if (query !== null) {
            const coords = editor.view.coordsAtPos(editor.state.selection.from)
            if (slashMenuRef.current.isOpen) {
                setSlashMenu((prev) => ({ ...prev, query, position: coords }))
            } else {
                setSlashMenu({ isOpen: true, query, position: coords })
            }
            return
        }

        // 메뉴 닫기 조건 충족 시
        if (slashMenuRef.current.isOpen) {
            closeSlashMenu()
        }
    }, [closeSlashMenu, getSlashQuery])

    return {
        slashMenu,
        closeSlashMenu,
        toggleSlashMenu,
        updateSlashMenuQuery,
        checkSlashCommand,
    }
}
