import { forwardRef, useEffect, useMemo } from 'react'
import HTMLFlipBook from 'react-pageflip'
import { useChapterStore } from '../chapters/useChapterStore'
import { useDesignStore } from '../design-panel/useDesignStore'
import { chapterTypeToLayoutSection } from '../design-panel/useDesignStore'
import { buildFontFaceCss, getContrastFontCssStack, getFontCssStack } from '../design-panel/fontCatalog'
import i18n from '../../i18n'
import { chapterToBlocks, escapeHtml, sanitizeHref } from './previewRenderer'
import { paginateBlocks } from './previewPaginator'
import { buildPreviewCommonCss } from './previewStyleBuilder'
import { usePreviewLayoutState } from './usePreviewLayoutState'

interface Props {
    onClose?: () => void
    embedded?: boolean
    viewMode?: 'reflow' | 'spread'
}

interface PreviewPreset {
    id: 'reflow' | 'spread'
    label: string
    viewportWidth: number
    viewportHeight: number
    frameColor: string
    framePadding: number
    frameRadius: number
    screenRadius: number
    pagePaddingTop: number
    pagePaddingX: number
    pagePaddingBottom: number
    charBudget: number
}

const REFLOW_PRESET: PreviewPreset = {
    id: 'reflow',
    label: 'Reflow',
    viewportWidth: 768,
    viewportHeight: 1024,
    frameColor: '#111111',
    framePadding: 16,
    frameRadius: 26,
    screenRadius: 12,
    pagePaddingTop: 34,
    pagePaddingX: 30,
    pagePaddingBottom: 50,
    charBudget: 340,
}

const SPREAD_PRESET: PreviewPreset = {
    id: 'spread',
    label: 'A-Series Spread',
    viewportWidth: 420,
    viewportHeight: Math.round(420 * Math.SQRT2),
    frameColor: '#d7d1c5',
    framePadding: 22,
    frameRadius: 18,
    screenRadius: 10,
    pagePaddingTop: 40,
    pagePaddingX: 34,
    pagePaddingBottom: 56,
    charBudget: 540,
}

function buildAnchorPageIndex(pageChunks: string[]): Map<string, number> {
    const map = new Map<string, number>()
    if (typeof DOMParser === 'undefined') return map

    for (let pageIndex = 0; pageIndex < pageChunks.length; pageIndex += 1) {
        const chunk = pageChunks[pageIndex]
        if (!chunk) continue

        try {
            const doc = new DOMParser().parseFromString(`<div>${chunk}</div>`, 'text/html')
            const elements = Array.from(doc.querySelectorAll('[id]'))
            for (const element of elements) {
                const id = element.getAttribute('id')
                if (!id) continue
                if (!map.has(id)) map.set(id, pageIndex)
            }
        } catch {
            // Ignore malformed chunks for robust navigation behavior.
        }
    }

    return map
}

function resolveAnchorIds(rawId: string): string[] {
    const trimmed = rawId.trim()
    if (!trimmed) return []

    const ids = [trimmed]
    try {
        const decoded = decodeURIComponent(trimmed)
        if (decoded !== trimmed) ids.push(decoded)
    } catch {
        // ignore
    }

    return [...new Set(ids)]
}

interface BookPageProps {
    html: string
    pageNumber: number
    onNavigate: (href: string) => void
    className?: string
}

const BookPage = forwardRef<HTMLDivElement, BookPageProps>(function BookPage(
    { html, pageNumber, onNavigate, className },
    ref,
) {
    return (
        <div
            ref={ref}
            className={`preview-book-page ${className ?? ''}`.trim()}
            onClick={(e) => {
                const target = e.target as HTMLElement | null
                const anchor = target?.closest?.('a') as HTMLAnchorElement | null
                if (!anchor) return
                const href = anchor.getAttribute('href') ?? ''
                const safeHref = sanitizeHref(href)
                if (!safeHref) {
                    e.preventDefault()
                    return
                }
                if (!safeHref.startsWith('#')) {
                    e.preventDefault()
                    window.open(safeHref, '_blank', 'noopener,noreferrer')
                    return
                }
                e.preventDefault()
                onNavigate(safeHref)
            }}
        >
            <div className="preview-book-content" dangerouslySetInnerHTML={{ __html: html }} />
            <div className="preview-book-footer">{pageNumber}</div>
        </div>
    )
})


export default function PreviewPane({ onClose, embedded = false, viewMode = 'reflow' }: Props) {
    const { chapters, activeChapterId } = useChapterStore()
    const { settings } = useDesignStore()
    const activeChapter = chapters.find((c) => c.id === activeChapterId)
    const layoutSection = chapterTypeToLayoutSection(activeChapter?.chapterType)
    const sectionTypography = settings.sectionTypography[layoutSection]
    const effectiveFontFamily = sectionTypography.h3FontFamily
    const effectiveSubheadFontFamily = sectionTypography.h2FontFamily
    const effectiveTitleFontFamily = sectionTypography.h1FontFamily
    const effectiveBodyFontSize = sectionTypography.h3FontSize
    const effectiveSubheadFontSize = sectionTypography.h2FontSize
    const effectiveTitleFontSize = sectionTypography.h1FontSize
    const effectiveTitleAlign = settings.chapterTitleAlign
    const effectiveTitleSpacing = settings.chapterTitleSpacing
    const fontCssStack = useMemo(() => getFontCssStack(effectiveFontFamily), [effectiveFontFamily])
    const contrastFontCssStack = useMemo(() => getContrastFontCssStack(effectiveFontFamily), [effectiveFontFamily])
    const serifFontCssStack = useMemo(() => getFontCssStack('Noto Serif KR'), [])
    const sansFontCssStack = useMemo(() => getFontCssStack('Pretendard'), [])
    const subheadFontCssStack = useMemo(() => getFontCssStack(effectiveSubheadFontFamily), [effectiveSubheadFontFamily])
    const titleFontCssStack = useMemo(() => getFontCssStack(effectiveTitleFontFamily), [effectiveTitleFontFamily])
    const style1FontCssStack = useMemo(() => getFontCssStack(sectionTypography.h4FontFamily), [sectionTypography.h4FontFamily])
    const style2FontCssStack = useMemo(() => getFontCssStack(sectionTypography.h5FontFamily), [sectionTypography.h5FontFamily])
    const style3FontCssStack = useMemo(() => getFontCssStack(sectionTypography.h6FontFamily), [sectionTypography.h6FontFamily])
    const previewFontFaceCss = useMemo(
        () =>
            buildFontFaceCss([
                effectiveFontFamily,
                effectiveSubheadFontFamily,
                effectiveTitleFontFamily,
                sectionTypography.h4FontFamily,
                sectionTypography.h5FontFamily,
                sectionTypography.h6FontFamily,
                'Noto Serif KR',
                'Pretendard',
            ]),
        [
            effectiveFontFamily,
            effectiveSubheadFontFamily,
            effectiveTitleFontFamily,
            sectionTypography.h4FontFamily,
            sectionTypography.h5FontFamily,
            sectionTypography.h6FontFamily,
        ],
    )
    const effectivePageBackground = activeChapter?.pageBackgroundColor ?? '#ffffff'
    const isSpreadView = viewMode === 'spread'
    const spreadInnerPaddingX = 22
    const spreadOuterPaddingX = 44
    const previewPreset = isSpreadView ? SPREAD_PRESET : REFLOW_PRESET
    const {
        currentPage,
        setCurrentPage,
        flipbookRef,
        previewShellRef,
        devicePageSize,
        spreadPageSize,
        safeFlip,
    } = usePreviewLayoutState({
        embedded,
        isSpreadView,
        previewPreset,
        initialDeviceSize: {
            width: REFLOW_PRESET.viewportWidth,
            height: REFLOW_PRESET.viewportHeight,
        },
        initialSpreadSize: {
            width: SPREAD_PRESET.viewportWidth,
            height: SPREAD_PRESET.viewportHeight,
        },
        activeChapterId: activeChapter?.id,
        viewMode,
    })

    const blocks = useMemo(() => {
        const rawTitle = (activeChapter?.title ?? '').trim()
        const hasRealTitle = rawTitle.length > 0 && rawTitle !== i18n.t('editor.untitled')
        const titleBlock = hasRealTitle ? [`<h1>${escapeHtml(rawTitle)}</h1>`] : []
        return [...titleBlock, ...chapterToBlocks(activeChapter?.content)]
    }, [activeChapter])

    const perPage = useMemo(() => {
        const pageWidth = isSpreadView ? spreadPageSize.width : devicePageSize.width
        const pageHeight = isSpreadView ? spreadPageSize.height : devicePageSize.height

        const horizontalPadding = isSpreadView
            ? spreadInnerPaddingX + spreadOuterPaddingX
            : previewPreset.pagePaddingX * 2
        const contentWidth = Math.max(180, pageWidth - horizontalPadding)
        const contentHeight = Math.max(
            200,
            pageHeight - previewPreset.pagePaddingTop - previewPreset.pagePaddingBottom - 28,
        )

        const lineHeightPx = Math.max(14, effectiveBodyFontSize * settings.lineHeight)
        const avgCharWidthPx = Math.max(8, effectiveBodyFontSize * 0.95)
        const charsPerLine = Math.max(12, Math.floor(contentWidth / avgCharWidthPx))
        const linesPerPage = Math.max(8, Math.floor(contentHeight / lineHeightPx))

        const letterFactor = 1 - Math.min(0.12, Math.max(-0.06, settings.letterSpacing * 2))
        const rawChars = Math.round(charsPerLine * linesPerPage * letterFactor)

        // Keep a safe bound to avoid over/under pagination on extreme settings.
        return Math.max(220, Math.min(4200, rawChars))
    }, [
        isSpreadView,
        spreadPageSize.width,
        spreadPageSize.height,
        devicePageSize.width,
        devicePageSize.height,
        previewPreset.pagePaddingX,
        previewPreset.pagePaddingTop,
        previewPreset.pagePaddingBottom,
        spreadInnerPaddingX,
        spreadOuterPaddingX,
        effectiveBodyFontSize,
        settings.lineHeight,
        settings.letterSpacing,
    ])

    const pageChunks = useMemo(() => paginateBlocks(blocks, perPage), [blocks, perPage])
    const anchorPageIndex = useMemo(() => buildAnchorPageIndex(pageChunks), [pageChunks])
    const renderedPages = useMemo(() => {
        if (!isSpreadView) return pageChunks
        // Spread mode is more stable with an even number of pages.
        return pageChunks.length % 2 === 0 ? pageChunks : [...pageChunks, '<p>&nbsp;</p>']
    }, [isSpreadView, pageChunks])
    const pageCount = renderedPages.length
    const previewKey = useMemo(
        () =>
            [
                activeChapter?.id ?? 'none',
                viewMode,
                previewPreset.id,
                effectiveFontFamily,
                effectiveBodyFontSize,
                effectiveSubheadFontSize,
                effectiveTitleFontSize,
                sectionTypography.h4FontFamily,
                sectionTypography.h5FontFamily,
                sectionTypography.h6FontFamily,
                sectionTypography.h4FontSize,
                sectionTypography.h5FontSize,
                sectionTypography.h6FontSize,
                settings.lineHeight,
                settings.letterSpacing,
                settings.paragraphSpacing,
                settings.textIndent,
                settings.suppressFirstParagraphIndent ? 1 : 0,
                effectiveTitleAlign,
                effectiveTitleSpacing,
                settings.chapterTitleDivider ? 1 : 0,
                settings.imageMaxWidth,
                effectivePageBackground,
                pageChunks.length,
            ].join('|'),
        [
            activeChapter?.id,
            viewMode,
            previewPreset.id,
            effectiveFontFamily,
            effectiveBodyFontSize,
            effectiveSubheadFontSize,
            effectiveTitleFontSize,
            sectionTypography.h4FontFamily,
            sectionTypography.h5FontFamily,
            sectionTypography.h6FontFamily,
            sectionTypography.h4FontSize,
            sectionTypography.h5FontSize,
            sectionTypography.h6FontSize,
            effectiveTitleAlign,
            effectiveTitleSpacing,
            settings.chapterTitleDivider,
            settings.lineHeight,
            settings.letterSpacing,
            settings.paragraphSpacing,
            settings.textIndent,
            settings.suppressFirstParagraphIndent,
            settings.imageMaxWidth,
            effectivePageBackground,
            pageChunks.length,
        ],
    )

    const commonCss = useMemo(
        () =>
            buildPreviewCommonCss({
                previewFontFaceCss,
                fontCssStack,
                contrastFontCssStack,
                serifFontCssStack,
                sansFontCssStack,
                subheadFontCssStack,
                titleFontCssStack,
                style1FontCssStack,
                style2FontCssStack,
                style3FontCssStack,
                effectiveBodyFontSize,
                effectiveSubheadFontSize,
                effectiveTitleFontSize,
                effectiveTitleAlign,
                effectiveTitleSpacing,
                h4FontSize: sectionTypography.h4FontSize,
                h5FontSize: sectionTypography.h5FontSize,
                h6FontSize: sectionTypography.h6FontSize,
                lineHeight: settings.lineHeight,
                letterSpacing: settings.letterSpacing,
                paragraphSpacing: settings.paragraphSpacing,
                textIndent: settings.textIndent,
                suppressFirstParagraphIndent: settings.suppressFirstParagraphIndent,
                chapterTitleDivider: settings.chapterTitleDivider,
                imageMaxWidth: settings.imageMaxWidth,
            }),
        [
            previewFontFaceCss,
            fontCssStack,
            contrastFontCssStack,
            serifFontCssStack,
            sansFontCssStack,
            subheadFontCssStack,
            titleFontCssStack,
            style1FontCssStack,
            style2FontCssStack,
            style3FontCssStack,
            effectiveBodyFontSize,
            effectiveSubheadFontSize,
            effectiveTitleFontSize,
            effectiveTitleAlign,
            effectiveTitleSpacing,
            sectionTypography.h4FontSize,
            sectionTypography.h5FontSize,
            sectionTypography.h6FontSize,
            settings.lineHeight,
            settings.letterSpacing,
            settings.paragraphSpacing,
            settings.textIndent,
            settings.suppressFirstParagraphIndent,
            settings.chapterTitleDivider,
            settings.imageMaxWidth,
        ],
    )

    useEffect(() => {
        setCurrentPage((p) => Math.min(Math.max(1, p), pageCount))
    }, [pageCount, setCurrentPage])

    const isPrevDisabled = currentPage <= 1
    const isNextDisabled = currentPage >= pageCount
    const pageCountLabel = `${currentPage}/${pageCount}`
    const prevPageLabel = i18n.t('previewPane.prevPage', {
        defaultValue: '이전 페이지',
    })
    const nextPageLabel = i18n.t('previewPane.nextPage', {
        defaultValue: '다음 페이지',
    })
    const closeLabel = i18n.t('common.close', { defaultValue: '닫기' })
    const viewHint = isSpreadView ? i18n.t('previewPane.spreadHint') : i18n.t('previewPane.reflowHint')

    const navigateToAnchor = (href: string) => {
        const id = href.replace(/^#/, '')
        if (!id) return

        let pageIdx = -1
        for (const anchorId of resolveAnchorIds(id)) {
            const found = anchorPageIndex.get(anchorId)
            if (found === undefined) continue
            pageIdx = found
            break
        }

        if (pageIdx < 0) return
        flipbookRef.current?.pageFlip()?.flip(pageIdx)
        setCurrentPage(pageIdx + 1)
    }

    const shellClass = embedded
        ? 'w-full h-full bg-white flex flex-col'
        : 'w-full max-w-6xl h-[88vh] bg-white rounded-xl overflow-hidden shadow-2xl flex flex-col'

    const containerClass = embedded
        ? 'w-full h-full'
        : 'fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-6'

    return (
        <div
            className={containerClass}
            onClick={() => {
                if (!embedded) onClose?.()
            }}
            onKeyDown={(event) => {
                if (embedded || !onClose) return
                if (event.key === 'Escape') {
                    event.preventDefault()
                    onClose()
                }
            }}
        >
            <div className={shellClass} onClick={(e) => e.stopPropagation()}>
                <style>{`
.preview-book-shell { height: 100%; background: ${isSpreadView ? '#d4d0c8' : '#e5e7eb'}; display: flex; align-items: center; justify-content: center; overflow: hidden; isolation: isolate; }
.preview-device-screen { background: #ffffff; overflow: hidden; }
.preview-book-page { height: 100%; background: ${effectivePageBackground}; box-sizing: border-box; padding: ${previewPreset.pagePaddingTop}px ${previewPreset.pagePaddingX}px ${previewPreset.pagePaddingBottom}px; border: 1px solid #ececec; position: relative; overflow: hidden; }
.preview-book-page.preview-spread-left { padding-left: ${spreadOuterPaddingX}px; padding-right: ${spreadInnerPaddingX}px; }
.preview-book-page.preview-spread-right { padding-left: ${spreadInnerPaddingX}px; padding-right: ${spreadOuterPaddingX}px; }
.preview-book-footer { position: absolute; left: 0; right: 0; bottom: 16px; text-align: center; font-size: 11px; color: #8a8a8a; }
.pageflip-book { overflow: hidden !important; contain: paint; }
.pageflip-book .stf__parent,
.pageflip-book .stf__block,
.pageflip-book .stf__item,
.pageflip-book .stf__wrapper {
  overflow: hidden !important;
}
.preview-spread-frame {
  position: relative;
  background: #cfc8bc;
  border: 1px solid #bfb7a8;
}
.preview-spread-frame::before {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 2px;
  background: linear-gradient(to bottom, rgba(90, 78, 60, 0.16), rgba(90, 78, 60, 0.28), rgba(90, 78, 60, 0.16));
  transform: translateX(-50%);
  pointer-events: none;
}
`}</style>
                <div
                    className="h-11 shrink-0 border-b border-[var(--ds-border-subtle)] bg-[var(--ds-surface-card)] flex items-center gap-2 px-3"
                    role="toolbar"
                    aria-label={i18n.t('common.preview', { defaultValue: '미리보기' })}
                >
                    <button
                        type="button"
                        onClick={() => safeFlip('prev')}
                        disabled={isPrevDisabled}
                        aria-label={prevPageLabel}
                        title={prevPageLabel}
                        className={`text-xs px-2.5 py-1 rounded-md transition-colors ${isPrevDisabled ? 'cursor-not-allowed bg-[var(--ds-fill-neutral-control)] text-[var(--ds-text-neutral-muted)]' : 'bg-[var(--ds-fill-neutral-control)] text-[var(--ds-text-neutral-primary)] hover:bg-[color-mix(in_srgb,var(--ds-fill-neutral-control)_75%,var(--ds-fill-neutral-card))]'}`}
                    >
                        ←
                    </button>
                    <button
                        type="button"
                        onClick={() => safeFlip('next')}
                        disabled={isNextDisabled}
                        aria-label={nextPageLabel}
                        title={nextPageLabel}
                        className={`text-xs px-2.5 py-1 rounded-md transition-colors ${isNextDisabled ? 'cursor-not-allowed bg-[var(--ds-fill-neutral-control)] text-[var(--ds-text-neutral-muted)]' : 'bg-[var(--ds-fill-neutral-control)] text-[var(--ds-text-neutral-primary)] hover:bg-[color-mix(in_srgb,var(--ds-fill-neutral-control)_75%,var(--ds-fill-neutral-card))]'}`}
                    >
                        →
                    </button>
                    <span className="text-xs text-[var(--ds-text-neutral-muted)]" aria-live="polite">
                        {pageCountLabel}
                    </span>
                    <span className="text-xs text-[var(--ds-text-neutral-muted)] ml-2 truncate">
                        {viewHint}
                    </span>
                    {!embedded ? (
                        <button
                            type="button"
                            onClick={onClose}
                            className="ml-auto inline-flex h-7 items-center rounded px-2 text-xs font-medium text-[var(--ds-text-neutral-secondary)] transition-colors hover:text-[var(--ds-text-neutral-primary)] hover:bg-[var(--ds-fill-neutral-control)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--ds-brand-500)_30%,transparent)]"
                            title={closeLabel}
                            aria-label={closeLabel}
                        >
                            {closeLabel}
                        </button>
                    ) : null}
                </div>

                <div ref={previewShellRef} className="preview-book-shell w-full flex-1">
                    <div
                        className={isSpreadView ? 'preview-device-frame preview-spread-frame' : 'preview-device-frame'}
                        style={{
                            background: isSpreadView ? '#e6e0d3' : previewPreset.frameColor,
                            padding: `${previewPreset.framePadding}px`,
                            borderRadius: `${previewPreset.frameRadius}px`,
                            boxShadow: embedded
                                ? isSpreadView
                                    ? '0 8px 24px rgba(73, 64, 50, 0.22)'
                                    : '0 10px 30px rgba(0,0,0,0.28)'
                                : isSpreadView
                                    ? '0 14px 34px rgba(73, 64, 50, 0.3)'
                                    : '0 18px 42px rgba(0,0,0,0.32)',
                        }}
                    >
                        <div
                            className="preview-device-screen"
                            style={{ borderRadius: `${previewPreset.screenRadius}px` }}
                        >
                            <HTMLFlipBook
                                key={`device-${previewKey}`}
                                ref={flipbookRef}
                                style={{}}
                                startPage={0}
                                width={isSpreadView ? spreadPageSize.width : devicePageSize.width}
                                height={isSpreadView ? spreadPageSize.height : devicePageSize.height}
                                minWidth={
                                    isSpreadView
                                        ? spreadPageSize.width
                                        : devicePageSize.width
                                }
                                maxWidth={isSpreadView ? spreadPageSize.width : devicePageSize.width}
                                minHeight={
                                    isSpreadView
                                        ? spreadPageSize.height
                                        : devicePageSize.height
                                }
                                maxHeight={isSpreadView ? spreadPageSize.height : devicePageSize.height}
                                size="fixed"
                                showCover={false}
                                drawShadow={isSpreadView}
                                flippingTime={420}
                                usePortrait={!isSpreadView}
                                showPageCorners={false}
                                disableFlipByClick={false}
                                className="pageflip-book"
                                startZIndex={1}
                                autoSize={false}
                                maxShadowOpacity={isSpreadView ? 0.2 : 0}
                                mobileScrollSupport={false}
                                clickEventForward
                                useMouseEvents
                                swipeDistance={28}
                                onInit={() => {
                                    setCurrentPage(1)
                                }}
                                onFlip={(e) => {
                                    setCurrentPage(Number(e.data) + 1)
                                }}
                            >
                                {renderedPages.map((html, idx) => (
                                    <BookPage
                                        key={`page-${idx}`}
                                        html={`<article class='preview-book-content'>${html}</article>`}
                                        pageNumber={idx + 1}
                                        onNavigate={navigateToAnchor}
                                        className={
                                            isSpreadView
                                                ? idx % 2 === 0
                                                    ? 'preview-spread-left'
                                                    : 'preview-spread-right'
                                                : ''
                                        }
                                    />
                                ))}
                            </HTMLFlipBook>
                        </div>
                    </div>
                    <style>{commonCss}</style>
                </div>
            </div>
        </div>
    )
}
