import { useTranslation } from 'react-i18next'
import { BookOpenText, Bot, Download, History, Image, ListOrdered, Palette, Search, Upload, Asterisk } from 'lucide-react'
import type { InspectorMode } from './inspectorMode'
import type { Ref } from 'react'
import { useEffect, useRef, useState } from 'react'

interface VerticalToolboxProps {
    activeMode: InspectorMode
    onChangeMode: (mode: InspectorMode) => void
    centerMode: 'edit' | 'preview'
    onImportFile: (format: 'epub' | 'docx' | 'md') => void
    onExport: () => void
    onAddFootnote: () => void
    onAddEndnote: () => void
    onOpenFindReplace: () => void
    notesDisabled?: boolean
    showWritingTools?: boolean
    showHistoryTool?: boolean
    showAiTool?: boolean
    anchorRef?: Ref<HTMLDivElement>
}

export default function VerticalToolbox({
    activeMode,
    onChangeMode,
    centerMode,
    onImportFile,
    onExport,
    onAddFootnote,
    onAddEndnote,
    onOpenFindReplace,
    notesDisabled = false,
    showWritingTools = true,
    showHistoryTool = true,
    showAiTool = true,
    anchorRef,
}: VerticalToolboxProps) {
    const { t } = useTranslation()
    const [showImportPicker, setShowImportPicker] = useState(false)
    const [hoveredId, setHoveredId] = useState<string | null>(null)
    const importPickerRef = useRef<HTMLDivElement | null>(null)
    const tooltipClass =
        'pointer-events-none absolute left-12 top-1/2 z-20 -translate-y-1/2 whitespace-nowrap rounded-md border border-[var(--ds-border-subtle)] bg-[var(--ds-surface-card)] px-2 py-1 text-[11px] font-medium text-[var(--ds-text-secondary)] shadow-lg'
    const items: Array<{ id: InspectorMode; label: string; icon: JSX.Element }> = [
        { id: 'design', label: t('toolbox.design'), icon: <Palette size={16} /> },
        ...(showAiTool ? [{ id: 'copilot' as const, label: t('centerPane.aiCopilot'), icon: <Bot size={16} /> }] : []),
        { id: 'cover', label: t('toolbox.coverAssets'), icon: <Image size={16} /> },
        { id: 'bookInfo', label: t('toolbox.bookInfo'), icon: <BookOpenText size={16} /> },
        ...(showHistoryTool ? [{ id: 'history' as const, label: t('toolbox.versionManager'), icon: <History size={16} /> }] : []),
    ]
    useEffect(() => {
        if (!showImportPicker) return
        const onPointerDown = (event: MouseEvent) => {
            const target = event.target as Node | null
            if (!target) return
            if (importPickerRef.current?.contains(target)) return
            setShowImportPicker(false)
        }
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setShowImportPicker(false)
        }
        document.addEventListener('mousedown', onPointerDown)
        document.addEventListener('keydown', onKeyDown)
        return () => {
            document.removeEventListener('mousedown', onPointerDown)
            document.removeEventListener('keydown', onKeyDown)
        }
    }, [showImportPicker])

    return (
        <aside
            ref={anchorRef}
            data-vertical-toolbox="true"
            className="ds-panel ds-panel--left relative flex w-14 min-w-14 flex-col items-center gap-2 py-3"
        >
            {items.map((item) => {
                const active = activeMode === item.id
                return (
                    <div key={item.id} className="relative">
                        <button
                            onClick={() => onChangeMode(item.id)}
                            onMouseEnter={() => setHoveredId(item.id)}
                            onMouseLeave={() => setHoveredId((prev) => (prev === item.id ? null : prev))}
                            onFocus={() => setHoveredId(item.id)}
                            onBlur={() => setHoveredId((prev) => (prev === item.id ? null : prev))}
                            className={`ds-icon-button h-10 w-10 ${active ? 'ring-1 ring-[var(--ds-border-info-weak)] bg-[var(--ds-fill-info-weak)] text-[var(--ds-text-info-default)]' : ''}`}
                            data-active={active}
                            aria-pressed={active}
                            data-testid={`vertical-tool-${item.id}`}
                            title={item.label}
                            aria-label={item.label}
                        >
                            {item.icon}
                        </button>
                        {hoveredId === item.id && (
                            <div className={tooltipClass}>
                                {item.label}
                            </div>
                        )}
                    </div>
                )
            })}
            <div className="my-1 h-px w-8 bg-[var(--ds-border-neutral-subtle)]" />
            <div className="relative" ref={importPickerRef}>
                <button
                    onClick={() => setShowImportPicker((prev) => !prev)}
                    onMouseEnter={() => setHoveredId('import')}
                    onMouseLeave={() => setHoveredId((prev) => (prev === 'import' ? null : prev))}
                    onFocus={() => setHoveredId('import')}
                    onBlur={() => setHoveredId((prev) => (prev === 'import' ? null : prev))}
                    className="ds-icon-button h-10 w-10"
                    title={t('centerPane.import')}
                    aria-label={t('centerPane.import')}
                >
                    <Download size={16} />
                </button>
                {hoveredId === 'import' && !showImportPicker ? (
                    <div className={tooltipClass}>
                        {t('centerPane.import')}
                    </div>
                ) : null}
                {showImportPicker ? (
                    <div className="absolute left-12 top-0 z-30 w-44 rounded-lg border border-[var(--ds-border-subtle)] bg-[var(--ds-surface-card)] p-1 shadow-xl">
                        <button
                            onClick={() => {
                                setShowImportPicker(false)
                                onImportFile('epub')
                            }}
                            className="w-full rounded-md px-2.5 py-2 text-left text-xs text-[var(--ds-text-secondary)] transition-colors hover:bg-[var(--ds-surface-control)]"
                        >
                            {t('centerPane.importEpub')}
                        </button>
                        <button
                            onClick={() => {
                                setShowImportPicker(false)
                                onImportFile('docx')
                            }}
                            className="w-full rounded-md px-2.5 py-2 text-left text-xs text-[var(--ds-text-secondary)] transition-colors hover:bg-[var(--ds-surface-control)]"
                        >
                            {t('centerPane.importDocx')}
                        </button>
                        <button
                            onClick={() => {
                                setShowImportPicker(false)
                                onImportFile('md')
                            }}
                            className="w-full rounded-md px-2.5 py-2 text-left text-xs text-[var(--ds-text-secondary)] transition-colors hover:bg-[var(--ds-surface-control)]"
                        >
                            {t('centerPane.importMarkdown')}
                        </button>
                    </div>
                ) : null}
            </div>
            <div className="relative">
                <button
                    onClick={onExport}
                    onMouseEnter={() => setHoveredId('export')}
                    onMouseLeave={() => setHoveredId((prev) => (prev === 'export' ? null : prev))}
                    onFocus={() => setHoveredId('export')}
                    onBlur={() => setHoveredId((prev) => (prev === 'export' ? null : prev))}
                    className="ds-icon-button h-10 w-10"
                    title={t('centerPane.export')}
                    aria-label={t('centerPane.export')}
                >
                    <Upload size={16} />
                </button>
                {hoveredId === 'export' ? (
                    <div className={tooltipClass}>
                        {t('centerPane.export')}
                    </div>
                ) : null}
            </div>
            {showWritingTools ? (
                <>
                    <div className="my-1 h-px w-8 bg-[var(--ds-border-neutral-subtle)]" />
                    <div className="relative">
                        <button
                            onClick={onAddFootnote}
                            onMouseEnter={() => setHoveredId('footnote')}
                            onMouseLeave={() => setHoveredId((prev) => (prev === 'footnote' ? null : prev))}
                            onFocus={() => setHoveredId('footnote')}
                            onBlur={() => setHoveredId((prev) => (prev === 'footnote' ? null : prev))}
                            className="ds-icon-button h-10 w-10"
                            title={t('centerPane.addFootnote')}
                            aria-label={t('centerPane.addFootnote')}
                            disabled={centerMode !== 'edit' || notesDisabled}
                        >
                            <Asterisk size={16} />
                        </button>
                        {hoveredId === 'footnote' ? (
                            <div className={tooltipClass}>
                                {t('centerPane.addFootnote')}
                            </div>
                        ) : null}
                    </div>
                    <div className="relative">
                        <button
                            onClick={onAddEndnote}
                            onMouseEnter={() => setHoveredId('endnote')}
                            onMouseLeave={() => setHoveredId((prev) => (prev === 'endnote' ? null : prev))}
                            onFocus={() => setHoveredId('endnote')}
                            onBlur={() => setHoveredId((prev) => (prev === 'endnote' ? null : prev))}
                            className="ds-icon-button h-10 w-10"
                            title={t('centerPane.addEndnote')}
                            aria-label={t('centerPane.addEndnote')}
                            disabled={centerMode !== 'edit' || notesDisabled}
                        >
                            <ListOrdered size={16} />
                        </button>
                        {hoveredId === 'endnote' ? (
                            <div className={tooltipClass}>
                                {t('centerPane.addEndnote')}
                            </div>
                        ) : null}
                    </div>
                    <div className="relative">
                        <button
                            onClick={onOpenFindReplace}
                            onMouseEnter={() => setHoveredId('find')}
                            onMouseLeave={() => setHoveredId((prev) => (prev === 'find' ? null : prev))}
                            onFocus={() => setHoveredId('find')}
                            onBlur={() => setHoveredId((prev) => (prev === 'find' ? null : prev))}
                            className="ds-icon-button h-10 w-10"
                            title={t('toolbox.findReplace')}
                            aria-label={t('toolbox.findReplace')}
                            disabled={centerMode !== 'edit'}
                        >
                            <Search size={16} />
                        </button>
                        {hoveredId === 'find' ? (
                            <div className={tooltipClass}>
                                {t('toolbox.findReplace')}
                            </div>
                        ) : null}
                    </div>
                </>
            ) : null}
        </aside>
    )
}
