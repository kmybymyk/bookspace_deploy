import { useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import DesignPanel from '../../features/design-panel/DesignPanel'
import { useChapterStore } from '../../features/chapters/useChapterStore'
import { useProjectStore } from '../../store'
import type { InspectorTool } from './inspectorTool'

interface InspectorPanelProps {
    activeTool: InspectorTool
    onChangeTool: (tool: InspectorTool) => void
    onRequestOpenStructure: () => void
}

function countMissingImageAlt(chapters: ReturnType<typeof useChapterStore.getState>['chapters']) {
    let missing = 0
    for (const chapter of chapters) {
        if (chapter.chapterContentType !== 'image') continue
        const first = chapter.content?.content?.find((node) => node.type === 'image')
        if (!first) {
            missing += 1
            continue
        }
        const alt = String(first.attrs?.alt ?? '').trim()
        if (!alt) missing += 1
    }
    return missing
}

export default function InspectorPanel({ activeTool, onChangeTool, onRequestOpenStructure }: InspectorPanelProps) {
    const { t } = useTranslation()
    const activeChapterId = useChapterStore((state) => state.activeChapterId)
    const chapters = useChapterStore((state) => state.chapters)
    const setChapterContentType = useChapterStore((state) => state.setChapterContentType)
    const activeChapter = activeChapterId ? chapters.find((chapter) => chapter.id === activeChapterId) : undefined
    const contentType = activeChapter?.chapterContentType === 'image' ? 'image' : 'text'
    const { metadata, setCoverImage, setBackCoverImage, setPublisherLogo } = useProjectStore()
    const missingImageAltCount = useMemo(() => countMissingImageAlt(chapters), [chapters])

    const coverInputRef = useRef<HTMLInputElement | null>(null)
    const backCoverInputRef = useRef<HTMLInputElement | null>(null)
    const logoInputRef = useRef<HTMLInputElement | null>(null)

    const readImageFile = (file: File | undefined, callback: (dataUrl: string) => void) => {
        if (!file) return
        const reader = new FileReader()
        reader.onload = () => {
            const value = String(reader.result ?? '')
            if (!value) return
            callback(value)
        }
        reader.readAsDataURL(file)
    }

    if (activeTool === 'design') {
        return <DesignPanel />
    }

    if (activeTool === 'content') {
        return (
            <div className="flex-1 min-h-0 overflow-auto [scrollbar-gutter:stable] px-3 py-3 space-y-3">
                <div className="rounded-lg border border-neutral-700 bg-neutral-800/40 p-3">
                    <div className="text-xs text-neutral-400">{t('rightPane.content.pageTitle')}</div>
                    <div className="mt-1 text-sm text-neutral-100 truncate">
                        {activeChapter?.title?.trim() || t('editor.untitled')}
                    </div>
                </div>
                <div className="rounded-lg border border-neutral-700 bg-neutral-800/40 p-3">
                    <div className="text-xs text-neutral-400 mb-2">{t('rightPane.content.contentType')}</div>
                    <div className="inline-flex rounded-md border border-neutral-700 bg-neutral-900 p-0.5">
                        <button
                            type="button"
                            onClick={() => activeChapter && setChapterContentType(activeChapter.id, 'text')}
                            className={`px-2.5 py-1 text-xs rounded ${
                                contentType === 'text' ? 'bg-neutral-700 text-white' : 'text-neutral-400 hover:text-neutral-200'
                            }`}
                        >
                            {t('chapterList.contentTypes.text')}
                        </button>
                        <button
                            type="button"
                            onClick={() => activeChapter && setChapterContentType(activeChapter.id, 'image')}
                            className={`px-2.5 py-1 text-xs rounded ${
                                contentType === 'image' ? 'bg-neutral-700 text-white' : 'text-neutral-400 hover:text-neutral-200'
                            }`}
                        >
                            {t('chapterList.contentTypes.image')}
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    if (activeTool === 'assets') {
        return (
            <div className="flex-1 min-h-0 overflow-auto [scrollbar-gutter:stable] px-3 py-3 space-y-3">
                <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => readImageFile(e.target.files?.[0], setCoverImage)} />
                <input ref={backCoverInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => readImageFile(e.target.files?.[0], setBackCoverImage)} />
                <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => readImageFile(e.target.files?.[0], setPublisherLogo)} />
                <div className="rounded-lg border border-neutral-700 bg-neutral-800/40 p-3 space-y-2">
                    <div className="text-xs text-neutral-400">{t('leftPane.cover')}</div>
                    <button type="button" onClick={() => coverInputRef.current?.click()} className="rounded-md border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-xs text-neutral-200 hover:bg-neutral-700">{metadata.coverImage ? t('leftPane.changeCover') : t('leftPane.addCover')}</button>
                </div>
                <div className="rounded-lg border border-neutral-700 bg-neutral-800/40 p-3 space-y-2">
                    <div className="text-xs text-neutral-400">{t('leftPane.backCover')}</div>
                    <button type="button" onClick={() => backCoverInputRef.current?.click()} className="rounded-md border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-xs text-neutral-200 hover:bg-neutral-700">{metadata.backCoverImage ? t('leftPane.changeBackCover') : t('leftPane.addBackCover')}</button>
                </div>
                <div className="rounded-lg border border-neutral-700 bg-neutral-800/40 p-3 space-y-2">
                    <div className="text-xs text-neutral-400">{t('leftPane.publisherLogo')}</div>
                    <button type="button" onClick={() => logoInputRef.current?.click()} className="rounded-md border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-xs text-neutral-200 hover:bg-neutral-700">{metadata.publisherLogo ? t('leftPane.changeLogo') : t('leftPane.addLogo')}</button>
                </div>
            </div>
        )
    }

    if (activeTool === 'inspect') {
        return (
            <div className="flex-1 min-h-0 overflow-auto [scrollbar-gutter:stable] px-3 py-3 space-y-3">
                <div className="rounded-lg border border-neutral-700 bg-neutral-800/40 p-3 text-xs text-neutral-300">
                    <div className="font-semibold text-neutral-100 mb-1">{t('rightPane.inspect.exportReadiness')}</div>
                    <ul className="space-y-1 text-neutral-400">
                        <li>{metadata.title?.trim() ? t('rightPane.inspect.okTitle') : t('rightPane.inspect.missingTitle')}</li>
                        <li>{(metadata.authors ?? []).some((a) => (a.name ?? '').trim()) ? t('rightPane.inspect.okAuthor') : t('rightPane.inspect.missingAuthor')}</li>
                        <li>
                            {missingImageAltCount === 0
                                ? t('rightPane.inspect.okImageAlt')
                                : t('rightPane.inspect.missingImageAlt', { count: missingImageAltCount })}
                        </li>
                    </ul>
                </div>
            </div>
        )
    }

    return (
        <div className="flex-1 min-h-0 overflow-auto [scrollbar-gutter:stable] px-3 py-3 space-y-3">
            <div className="rounded-lg border border-neutral-700 bg-neutral-800/40 p-3">
                <div className="text-sm text-neutral-100">{t('rightPane.structure.openHint')}</div>
                <button
                    type="button"
                    onClick={() => {
                        onChangeTool('structure')
                        onRequestOpenStructure()
                    }}
                    className="mt-2 rounded-md border border-neutral-700 bg-neutral-800 px-2.5 py-1.5 text-xs text-neutral-200 hover:bg-neutral-700"
                >
                    {t('rightPane.structure.openButton')}
                </button>
            </div>
        </div>
    )
}
