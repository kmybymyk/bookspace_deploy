import type { TFunction } from 'i18next'
import type { MouseEvent as ReactMouseEvent, RefObject } from 'react'
import { useCallback, useRef, useState } from 'react'
import { useModalA11y } from '../../../hooks/useModalA11y'

interface FindReplacePanelProps {
    t: TFunction
    findInputRef: RefObject<HTMLInputElement | null>
    findQuery: string
    replaceText: string
    findStatus: string
    countCurrent: number
    countTotal: number
    pendingReplaceAllConfirm: boolean
    scope: 'chapter' | 'project'
    hasSelectionScope: boolean
    matchPreviews: Array<{ text: string; highlightStart: number; highlightEnd: number }>
    onClose: () => void
    onFindQueryChange: (value: string) => void
    onSearch: () => void
    onReplaceTextChange: (value: string) => void
    onScopeChange: (scope: 'chapter' | 'project') => void
    onFindPrev: () => void
    onFindNext: () => void
    onReplaceOne: () => void
    onReplaceAll: () => void
}

export default function FindReplacePanel({
    t,
    findInputRef,
    findQuery,
    replaceText,
    findStatus,
    countCurrent,
    countTotal,
    pendingReplaceAllConfirm,
    scope,
    hasSelectionScope,
    matchPreviews,
    onClose,
    onFindQueryChange,
    onSearch,
    onReplaceTextChange,
    onScopeChange,
    onFindPrev,
    onFindNext,
    onReplaceOne,
    onReplaceAll,
}: FindReplacePanelProps) {
    const { rootRef, dialogRef } = useModalA11y(true, onClose)
    const [offset, setOffset] = useState({ x: 0, y: 0 })
    const dragStateRef = useRef<{ active: boolean; startX: number; startY: number; baseX: number; baseY: number }>({
        active: false,
        startX: 0,
        startY: 0,
        baseX: 0,
        baseY: 0,
    })

    const handleHeaderMouseDown = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
        if (event.button !== 0) return
        const target = event.target as HTMLElement | null
        if (target?.closest('button,input,textarea,select,[role="button"]')) return
        event.preventDefault()

        dragStateRef.current = {
            active: true,
            startX: event.clientX,
            startY: event.clientY,
            baseX: offset.x,
            baseY: offset.y,
        }

        const handleMouseMove = (moveEvent: MouseEvent) => {
            const deltaX = moveEvent.clientX - dragStateRef.current.startX
            const deltaY = moveEvent.clientY - dragStateRef.current.startY
            setOffset({
                x: dragStateRef.current.baseX + deltaX,
                y: dragStateRef.current.baseY + deltaY,
            })
        }

        const handleMouseUp = () => {
            dragStateRef.current.active = false
            window.removeEventListener('mousemove', handleMouseMove)
            window.removeEventListener('mouseup', handleMouseUp)
        }

        window.addEventListener('mousemove', handleMouseMove)
        window.addEventListener('mouseup', handleMouseUp)
    }, [offset.x, offset.y])

    return (
        <div
            ref={rootRef}
            data-bookspace-modal-root="true"
            className="ds-overlay fixed inset-0 z-[120] flex items-center justify-center p-4"
            onClick={onClose}
            role="presentation"
        >
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-label={t('findReplace.title')}
                tabIndex={-1}
                className="ds-modal w-full max-w-[620px] p-5 shadow-2xl"
                style={{
                    transform: `translate(${offset.x}px, ${offset.y}px)`,
                }}
                onClick={(event) => event.stopPropagation()}
            >
                <div className="mb-4 flex cursor-move select-none items-center justify-between" onMouseDown={handleHeaderMouseDown}>
                    <div className="text-xl font-bold text-[var(--ds-text-secondary)]">{t('findReplace.title')}</div>
                    <button
                        className="rounded-md px-2.5 py-1.5 text-sm text-[var(--ds-text-muted)] transition-colors hover:bg-[var(--ds-surface-control)] hover:text-[var(--ds-text-secondary)]"
                        onClick={onClose}
                    >
                        {t('common.close')}
                    </button>
                </div>
                <div className="space-y-3.5">
                    <div>
                        <label className="mb-1.5 block text-sm font-medium text-[var(--ds-text-muted)]">{t('findReplace.find')}</label>
                        <div className="flex items-center gap-2">
                            <input
                                ref={findInputRef}
                                value={findQuery}
                                onChange={(e) => onFindQueryChange(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault()
                                        onSearch()
                                    }
                                }}
                                className="h-11 flex-1 rounded-lg border border-[var(--ds-border-default)] bg-[var(--ds-surface-control)] px-3.5 text-base text-[var(--ds-text-primary)] outline-none transition-colors focus:border-[var(--ds-border-brand-default)]"
                                placeholder={t('findReplace.findPlaceholder')}
                            />
                            <button
                                className="h-11 shrink-0 rounded-md border border-[var(--ds-border-default)] bg-[var(--ds-surface-control)] px-4 text-sm font-semibold text-[var(--ds-text-secondary)] transition-colors hover:bg-[var(--ds-surface-control-hover)]"
                                onClick={onSearch}
                            >
                                {t('findReplace.search')}
                            </button>
                        </div>
                    </div>
                    <div className="flex items-center justify-end">
                        <div className="inline-flex rounded-md border border-[var(--ds-border-default)] bg-[var(--ds-surface-control)] p-0.5">
                            <button
                                className={`rounded px-3 py-1.5 text-xs ${
                                    scope === 'chapter'
                                        ? 'bg-[var(--ds-surface-panel)] text-[var(--ds-text-secondary)]'
                                        : 'text-[var(--ds-text-muted)]'
                                }`}
                                onClick={() => onScopeChange('chapter')}
                            >
                                {t('findReplace.scopeChapter')}
                            </button>
                            <button
                                className={`rounded px-3 py-1.5 text-xs ${
                                    scope === 'project'
                                        ? 'bg-[var(--ds-surface-panel)] text-[var(--ds-text-secondary)]'
                                        : 'text-[var(--ds-text-muted)]'
                                } ${hasSelectionScope ? '' : 'opacity-50'}`}
                                onClick={() => onScopeChange('project')}
                                disabled={!hasSelectionScope}
                            >
                                {t('findReplace.scopeSelection')}
                            </button>
                        </div>
                    </div>
                    <div>
                        <label className="mb-1.5 block text-sm font-medium text-[var(--ds-text-muted)]">{t('findReplace.replace')}</label>
                        <input
                            value={replaceText}
                            onChange={(e) => onReplaceTextChange(e.target.value)}
                            className="h-11 w-full rounded-lg border border-[var(--ds-border-default)] bg-[var(--ds-surface-control)] px-3.5 text-base text-[var(--ds-text-primary)] outline-none transition-colors focus:border-[var(--ds-border-brand-default)]"
                            placeholder={t('findReplace.replacePlaceholder')}
                        />
                    </div>
                </div>
                <div className="mt-4 flex items-center justify-between rounded-lg border border-[var(--ds-border-subtle)] bg-[var(--ds-surface-canvas)] px-3 py-2.5">
                    <div className="text-sm font-medium text-[var(--ds-text-muted)]">
                        {countTotal > 0 ? t('findReplace.resultCount', { current: countCurrent, total: countTotal }) : t('findReplace.noResultCount')}
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            className="rounded-md border border-[var(--ds-border-default)] bg-[var(--ds-surface-control)] px-3 py-1.5 text-xs font-medium text-[var(--ds-text-secondary)] transition-colors hover:bg-[var(--ds-surface-control-hover)]"
                            onClick={onFindPrev}
                            title={t('findReplace.findPrev')}
                            aria-label={t('findReplace.findPrev')}
                        >
                            {'<'}
                        </button>
                        <button
                            className="rounded-md border border-[var(--ds-border-default)] bg-[var(--ds-surface-control)] px-3 py-1.5 text-xs font-medium text-[var(--ds-text-secondary)] transition-colors hover:bg-[var(--ds-surface-control-hover)]"
                            onClick={onFindNext}
                            title={t('findReplace.findNext')}
                            aria-label={t('findReplace.findNext')}
                        >
                            {'>'}
                        </button>
                    </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2.5">
                    <button
                        className="rounded-md border border-[var(--ds-border-default)] bg-[var(--ds-surface-control)] px-4 py-2 text-sm font-semibold text-[var(--ds-text-secondary)] transition-colors hover:bg-[var(--ds-surface-control-hover)]"
                        onClick={onReplaceOne}
                    >
                        {t('findReplace.replaceOne')}
                    </button>
                    <button
                        className="rounded-md border border-[var(--ds-border-brand-weak)] bg-[var(--ds-fill-brand-weak)] px-4 py-2 text-sm font-bold text-[var(--ds-text-info-default)] transition-colors hover:bg-[var(--ds-fill-info-weak)]"
                        onClick={onReplaceAll}
                    >
                        {pendingReplaceAllConfirm ? t('findReplace.confirmReplaceAll') : t('findReplace.replaceAll')}
                    </button>
                </div>
                {pendingReplaceAllConfirm && matchPreviews.length > 0 ? (
                    <div className="mt-3 space-y-1.5 rounded-md border border-[var(--ds-border-subtle)] bg-[var(--ds-surface-canvas)] p-3">
                        <p className="text-xs font-semibold text-[var(--ds-text-muted)]">{t('findReplace.previewTitle')}</p>
                        <div className="space-y-1">
                            {matchPreviews.map((preview, index) => (
                                <p key={`${preview.text}-${index}`} className="truncate text-xs text-[var(--ds-text-muted)]">
                                    <span>{preview.text.slice(0, preview.highlightStart)}</span>
                                    <mark className="rounded bg-[var(--ds-fill-warning-weak)] px-0.5 text-[var(--ds-text-secondary)]">
                                        {preview.text.slice(preview.highlightStart, preview.highlightEnd)}
                                    </mark>
                                    <span>{preview.text.slice(preview.highlightEnd)}</span>
                                </p>
                            ))}
                        </div>
                    </div>
                ) : null}
                {findStatus && <div className="mt-3 text-sm text-[var(--ds-text-muted)]">{findStatus}</div>}
            </div>
        </div>
    )
}
