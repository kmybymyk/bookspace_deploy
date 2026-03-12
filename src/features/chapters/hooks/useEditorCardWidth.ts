import { useEffect, useState, type RefObject } from 'react'

export function useEditorCardWidth(
    targetRef: RefObject<HTMLDivElement | null>,
    initialWidth = 760,
) {
    const [singleCardWidth, setSingleCardWidth] = useState<number>(initialWidth)

    useEffect(() => {
        const target = targetRef.current
        if (!target) return

        const updateCardWidth = () => {
            const width = target.clientWidth
            if (!width) return
            setSingleCardWidth(width)
        }

        updateCardWidth()

        if (typeof ResizeObserver === 'undefined') {
            window.addEventListener('resize', updateCardWidth)
            return () => window.removeEventListener('resize', updateCardWidth)
        }

        const observer = new ResizeObserver(() => updateCardWidth())
        observer.observe(target)
        return () => observer.disconnect()
    }, [targetRef])

    return singleCardWidth
}
