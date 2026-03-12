import { useCallback, useEffect, useRef, useState } from 'react'

interface PageFlipApi {
    flip: (pageIndex: number) => void
    flipNext: () => void
    flipPrev: () => void
}

interface FlipbookRef {
    pageFlip?: () => PageFlipApi | null
}

interface PreviewPresetSizing {
    viewportWidth: number
    viewportHeight: number
}

interface Size {
    width: number
    height: number
}

interface UsePreviewLayoutStateArgs {
    embedded: boolean
    isSpreadView: boolean
    previewPreset: PreviewPresetSizing
    initialDeviceSize: Size
    initialSpreadSize: Size
    activeChapterId?: string
    viewMode: 'reflow' | 'spread'
}

export function usePreviewLayoutState({
    embedded,
    isSpreadView,
    previewPreset,
    initialDeviceSize,
    initialSpreadSize,
    activeChapterId,
    viewMode,
}: UsePreviewLayoutStateArgs) {
    const [currentPage, setCurrentPage] = useState(1)
    const flipbookRef = useRef<FlipbookRef | null>(null)
    const previewShellRef = useRef<HTMLDivElement | null>(null)
    const [devicePageSize, setDevicePageSize] = useState(() => initialDeviceSize)
    const [spreadPageSize, setSpreadPageSize] = useState(() => initialSpreadSize)

    const safeFlip = useCallback((direction: 'next' | 'prev') => {
        const api = flipbookRef.current?.pageFlip?.()
        if (!api) return
        if (direction === 'next') {
            api.flipNext()
        } else {
            api.flipPrev()
        }
    }, [])

    useEffect(() => {
        setCurrentPage(1)
    }, [activeChapterId, viewMode])

    useEffect(() => {
        const shell = previewShellRef.current
        if (!shell) return

        const updatePageSize = () => {
            const rect = shell.getBoundingClientRect()
            if (!rect.width || !rect.height) return

            const horizontalChrome = embedded ? 44 : 92
            const verticalChrome = embedded ? 44 : 92
            const usableWidth = Math.max(420, rect.width - horizontalChrome)
            const usableHeight = Math.max(360, rect.height - verticalChrome)

            if (isSpreadView) {
                const maxPageWidthByWidth = usableWidth / 2
                const maxPageWidthByHeight = usableHeight / Math.SQRT2
                const pageWidth = Math.max(340, Math.floor(Math.min(maxPageWidthByWidth, maxPageWidthByHeight)))
                const pageHeight = Math.round(pageWidth * Math.SQRT2)
                setSpreadPageSize((prev) =>
                    prev.width === pageWidth && prev.height === pageHeight
                        ? prev
                        : { width: pageWidth, height: pageHeight },
                )
                return
            }

            const ratio = previewPreset.viewportWidth / previewPreset.viewportHeight
            const maxWidthByHeight = usableHeight * ratio
            const pageWidth = Math.max(280, Math.floor(Math.min(usableWidth, maxWidthByHeight)))
            const pageHeight = Math.round(pageWidth / ratio)
            setDevicePageSize((prev) =>
                prev.width === pageWidth && prev.height === pageHeight
                    ? prev
                    : { width: pageWidth, height: pageHeight },
            )
        }

        updatePageSize()

        if (typeof ResizeObserver === 'undefined') {
            window.addEventListener('resize', updatePageSize)
            return () => window.removeEventListener('resize', updatePageSize)
        }

        const observer = new ResizeObserver(updatePageSize)
        observer.observe(shell)
        window.addEventListener('resize', updatePageSize)
        return () => {
            observer.disconnect()
            window.removeEventListener('resize', updatePageSize)
        }
    }, [
        embedded,
        isSpreadView,
        previewPreset.viewportHeight,
        previewPreset.viewportWidth,
    ])

    useEffect(() => {
        if (embedded) return
        const onKey = (e: KeyboardEvent) => {
            if (e.repeat) return

            const target = e.target
            if (target instanceof Element) {
                const tag = target.tagName
                if (
                    target.isContentEditable ||
                    tag === 'INPUT' ||
                    tag === 'TEXTAREA' ||
                    tag === 'SELECT' ||
                    tag === 'OPTION'
                ) {
                    return
                }
            }

            if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
                safeFlip('next')
                e.preventDefault()
            }
            if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
                safeFlip('prev')
                e.preventDefault()
            }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [embedded, safeFlip])

    return {
        currentPage,
        setCurrentPage,
        flipbookRef,
        previewShellRef,
        devicePageSize,
        spreadPageSize,
        safeFlip,
    }
}
