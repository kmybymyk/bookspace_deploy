import type { TFunction } from 'i18next'
import type { AiCommandEnvelope } from '../../../shared/aiCommandSchema'
import type { InspectorMode } from '../../components/layout/inspectorMode'
import { commandOutcomeSummary, commandReviewSummary, commandScopeSummary, commandTitleKey, riskLabelKey } from './rightPaneMessageRenderer'
import type { CopilotRiskLevel, CopilotThreadState } from './rightPaneTypes'
import type { BookMetadata, Chapter, DesignSettings, LayoutSection } from '../../types/project'
import { chapterTypeToLayoutSection } from '../design-panel/useDesignStore'
import type { JSONContent } from '@tiptap/core'

interface RightPanePreviewPanelProps {
    t: TFunction
    activeThread: CopilotThreadState
    previewCommands: AiCommandEnvelope['commands']
    previewWarnings: string[]
    previewRisk: { level: CopilotRiskLevel; reasons: string[] }
    riskBadgeClass: string
    copilotApplying: boolean
    updateActiveThread: (updater: (thread: CopilotThreadState) => CopilotThreadState) => void
    applyPreview: () => Promise<void>
    onRequestInspector: (mode: Exclude<InspectorMode, 'copilot'>) => void
    chapters: Chapter[]
    metadata: BookMetadata
    designSettings: DesignSettings
    activeChapter?: Chapter
}

interface ComparisonRow {
    label: string
    before: string
    after: string
}

function valueLabel(value: unknown): string {
    if (value === null || value === undefined || value === '') return '-'
    if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : '-'
    return String(value)
}

function getNodeText(node: JSONContent | undefined): string {
    if (!node || typeof node !== 'object') return ''
    if (typeof node.text === 'string') return node.text
    if (Array.isArray(node.content)) {
        return node.content.map((child) => getNodeText(child as JSONContent)).join('')
    }
    return ''
}

function chapterPlainText(chapter?: Chapter): string {
    return getNodeText(chapter?.content).replace(/\s+/g, ' ').trim()
}

function excerpt(text: string, max = 120): string {
    const normalized = text.replace(/\s+/g, ' ').trim()
    if (!normalized) return '-'
    return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized
}

function sectionForTypography(
    command: AiCommandEnvelope['commands'][number],
    activeChapter?: Chapter,
): LayoutSection | null {
    if (command.type !== 'set_typography') return null
    if (command.target.section === 'active_chapter') {
        return chapterTypeToLayoutSection(activeChapter?.chapterType)
    }
    return command.target.section
}

function comparisonRowsForCommand(
    command: AiCommandEnvelope['commands'][number],
    options: {
        t: TFunction
        chapters: Chapter[]
        metadata: BookMetadata
        designSettings: DesignSettings
        activeChapter?: Chapter
    },
): ComparisonRow[] {
    const { t, chapters, metadata, designSettings, activeChapter } = options
    const chapter = 'chapterId' in command.target
        ? chapters.find((item) => item.id === command.target.chapterId)
        : undefined

    if (command.type === 'rename_chapter') {
        return [
            {
                label: t('rightPane.preview.fieldTitle'),
                before: valueLabel(chapter?.title),
                after: valueLabel(command.payload.title),
            },
        ]
    }
    if (command.type === 'rewrite_selection') {
        const targetChapter = chapters.find((item) => item.id === command.target.chapterId)
        const plain = chapterPlainText(targetChapter)
        const before = plain.slice(command.target.range.from, command.target.range.to)
        return [
            {
                label: t('rightPane.preview.rewriteTo'),
                before: excerpt(before),
                after: excerpt(command.payload.text),
            },
        ]
    }
    if (command.type === 'append_text') {
        const targetChapter = chapters.find((item) => item.id === command.target.chapterId)
        const plain = chapterPlainText(targetChapter)
        const before = plain ? excerpt(plain.slice(Math.max(0, plain.length - 120))) : '-'
        const appended = excerpt(command.payload.text)
        return [
            {
                label: t('rightPane.preview.appendText'),
                before,
                after: before === '-' ? appended : `${before} + ${appended}`,
            },
        ]
    }
    if (command.type === 'find_replace') {
        const targetChapter =
            command.target.scope === 'chapter' ? chapters.find((item) => item.id === command.target.chapterId) : undefined
        const plain = command.target.scope === 'chapter'
            ? chapterPlainText(targetChapter)
            : chapters.map((item) => chapterPlainText(item)).filter(Boolean).join(' ')
        const source = command.payload.matchCase ? plain : plain.toLowerCase()
        const needle = command.payload.matchCase ? command.payload.find : command.payload.find.toLowerCase()
        const matchIndex = source.indexOf(needle)
        const before = matchIndex >= 0 ? plain.slice(matchIndex, matchIndex + command.payload.find.length) : command.payload.find
        return [
            {
                label: t('rightPane.preview.find'),
                before: excerpt(before),
                after: excerpt(command.payload.replace),
            },
        ]
    }
    if (command.type === 'delete_chapter') {
        return [
            {
                label: t('rightPane.preview.chapter'),
                before: valueLabel(chapter?.title ?? command.target.chapterId),
                after: t('rightPane.reviewDeletedState'),
            },
        ]
    }
    if (command.type === 'move_chapter') {
        const currentIndex = chapter ? chapters.findIndex((item) => item.id === chapter.id) : -1
        return [
            {
                label: t('rightPane.reviewComparePosition'),
                before: currentIndex >= 0 ? String(currentIndex) : '-',
                after: String(command.payload.toIndex),
            },
        ]
    }
    if (command.type === 'set_chapter_type') {
        return [
            {
                label: t('rightPane.preview.chapterType'),
                before: valueLabel(chapter?.chapterType ?? 'chapter'),
                after: valueLabel(command.payload.chapterType),
            },
        ]
    }
    if (command.type === 'set_page_background') {
        return [
            {
                label: t('rightPane.preview.pageBackground'),
                before: valueLabel(chapter?.pageBackgroundColor ?? designSettings.pageBackgroundColor),
                after: valueLabel(command.payload.color),
            },
        ]
    }
    if (command.type === 'apply_theme') {
        return [
            {
                label: t('rightPane.preview.theme'),
                before: valueLabel(designSettings.theme),
                after: valueLabel(command.payload.theme),
            },
        ]
    }
    if (command.type === 'update_book_info') {
        const rows: ComparisonRow[] = []
        if (command.payload.title !== undefined) {
            rows.push({ label: t('rightPane.preview.fieldTitle'), before: valueLabel(metadata.title), after: valueLabel(command.payload.title) })
        }
        if (command.payload.subtitle !== undefined) {
            rows.push({ label: t('rightPane.preview.fieldSubtitle'), before: valueLabel(metadata.subtitle), after: valueLabel(command.payload.subtitle) })
        }
        if (command.payload.language !== undefined) {
            rows.push({ label: t('rightPane.preview.fieldLanguage'), before: valueLabel(metadata.language), after: valueLabel(command.payload.language) })
        }
        if (command.payload.publisher !== undefined) {
            rows.push({ label: t('rightPane.preview.fieldPublisher'), before: valueLabel(metadata.publisher), after: valueLabel(command.payload.publisher) })
        }
        if (command.payload.link !== undefined) {
            rows.push({ label: t('rightPane.preview.fieldLink'), before: valueLabel(metadata.link), after: valueLabel(command.payload.link) })
        }
        if (command.payload.description !== undefined) {
            rows.push({ label: t('rightPane.preview.fieldDescription'), before: valueLabel(metadata.description), after: valueLabel(command.payload.description) })
        }
        if (command.payload.authors !== undefined) {
            rows.push({
                label: t('rightPane.preview.fieldAuthors'),
                before: valueLabel((metadata.authors ?? []).map((author) => author.name).filter(Boolean)),
                after: valueLabel((command.payload.authors ?? []).map((author) => author.name).filter(Boolean)),
            })
        }
        return rows
    }
    if (command.type === 'set_cover_asset') {
        const beforeValue =
            command.target.assetType === 'cover'
                ? metadata.coverImage
                : command.target.assetType === 'back_cover'
                    ? metadata.backCoverImage
                    : metadata.publisherLogo
        return [
            {
                label: t('rightPane.preview.assetType'),
                before: beforeValue ? t('rightPane.reviewAssetPresent') : t('rightPane.reviewAssetMissing'),
                after: `${t('rightPane.preview.assetSource')}: ${command.payload.source}`,
            },
        ]
    }
    if (command.type === 'set_typography') {
        const section = sectionForTypography(command, activeChapter)
        if (!section) return []
        const rows: ComparisonRow[] = []
        if (command.payload.fontFamily !== undefined) {
            const before =
                command.target.section === 'active_chapter'
                    ? command.payload.slot === 'body'
                        ? activeChapter?.fontFamily ?? designSettings.fontFamily
                        : command.payload.slot === 'h1'
                            ? activeChapter?.titleFontFamily ?? designSettings.sectionTypography[section].h1FontFamily
                            : activeChapter?.subheadFontFamily ?? designSettings.sectionTypography[section][`${command.payload.slot}FontFamily` as keyof typeof designSettings.sectionTypography[typeof section]]
                    : command.payload.slot === 'body'
                        ? designSettings.fontFamily
                        : designSettings.sectionTypography[section][`${command.payload.slot}FontFamily` as keyof typeof designSettings.sectionTypography[typeof section]]
            rows.push({
                label: t('rightPane.preview.fontFamily'),
                before: valueLabel(before),
                after: valueLabel(command.payload.fontFamily),
            })
        }
        if (command.payload.fontScale !== undefined) {
            const before =
                command.target.section === 'active_chapter'
                    ? command.payload.slot === 'body'
                        ? activeChapter?.bodyFontSize ?? designSettings.fontSize
                        : command.payload.slot === 'h1'
                            ? activeChapter?.titleFontSize ?? designSettings.sectionTypography[section].h1FontSize
                            : activeChapter?.subheadFontSize ?? designSettings.sectionTypography[section][`${command.payload.slot}FontSize` as keyof typeof designSettings.sectionTypography[typeof section]]
                    : command.payload.slot === 'body'
                        ? designSettings.fontSize
                        : designSettings.sectionTypography[section][`${command.payload.slot}FontSize` as keyof typeof designSettings.sectionTypography[typeof section]]
            const after =
                command.target.section === 'active_chapter'
                    ? Math.max(8, Math.round(16 * command.payload.fontScale))
                    : Math.max(8, Math.round(Number(before || 16) * command.payload.fontScale))
            rows.push({
                label: t('rightPane.preview.fontScale'),
                before: valueLabel(before),
                after: valueLabel(after),
            })
        }
        if (command.payload.lineHeight !== undefined) {
            rows.push({
                label: t('rightPane.preview.lineHeight'),
                before: valueLabel(designSettings.lineHeight),
                after: valueLabel(command.payload.lineHeight),
            })
        }
        if (command.payload.letterSpacing !== undefined) {
            rows.push({
                label: t('rightPane.preview.letterSpacing'),
                before: valueLabel(designSettings.letterSpacing),
                after: valueLabel(command.payload.letterSpacing),
            })
        }
        if (command.payload.textIndent !== undefined) {
            rows.push({
                label: t('rightPane.preview.textIndent'),
                before: valueLabel(designSettings.textIndent),
                after: valueLabel(command.payload.textIndent),
            })
        }
        return rows
    }
    return []
}

function commandInspectorMode(
    command: AiCommandEnvelope['commands'][number],
): Exclude<InspectorMode, 'copilot'> | null {
    if (
        command.type === 'set_typography' ||
        command.type === 'set_page_background' ||
        command.type === 'apply_theme'
    ) {
        return 'design'
    }
    if (command.type === 'update_book_info') {
        return 'bookInfo'
    }
    if (command.type === 'set_cover_asset') {
        return 'cover'
    }
    if (command.type === 'restore_snapshot') {
        return 'history'
    }
    return null
}

function commandInspectorLabel(
    t: TFunction,
    mode: Exclude<InspectorMode, 'copilot'>,
): string {
    if (mode === 'design') return t('toolbox.design')
    if (mode === 'bookInfo') return t('toolbox.bookInfo')
    if (mode === 'cover') return t('toolbox.coverAssets')
    return t('toolbox.versionManager')
}

function commandRiskTone(
    command: AiCommandEnvelope['commands'][number],
): CopilotRiskLevel {
    if (command.type === 'delete_chapter' || command.type === 'restore_snapshot') return 'high'
    if (
        command.type === 'find_replace' ||
        command.type === 'move_chapter' ||
        command.type === 'set_chapter_type' ||
        command.type === 'set_typography' ||
        command.type === 'set_page_background' ||
        command.type === 'apply_theme' ||
        command.type === 'update_book_info' ||
        command.type === 'set_cover_asset' ||
        command.type === 'export_project' ||
        command.type === 'save_project'
    ) {
        return 'medium'
    }
    return 'low'
}

function commandRiskClass(level: CopilotRiskLevel): string {
    if (level === 'high') return 'border-rose-600/45 bg-rose-950/25 text-rose-100'
    if (level === 'medium') return 'border-amber-600/45 bg-amber-950/25 text-amber-100'
    return 'border-emerald-600/45 bg-emerald-950/25 text-emerald-100'
}

export function RightPanePreviewPanel({
    t,
    activeThread,
    previewCommands,
    previewWarnings,
    previewRisk,
    riskBadgeClass,
    copilotApplying,
    updateActiveThread,
    applyPreview,
    onRequestInspector,
    chapters,
    metadata,
    designSettings,
    activeChapter,
}: RightPanePreviewPanelProps) {
    const shouldRequireExplicitApproval = previewRisk.level === 'high'
    const applyBlockedReason =
        previewCommands.length === 0
            ? t('rightPane.applyBlockedNoCommands')
            : shouldRequireExplicitApproval && !activeThread.applyDangerConfirmed
                    ? t('rightPane.applyBlockedDangerConfirm')
                    : null

    return (
        <div
            data-testid="copilot-preview-panel"
            className="space-y-3 rounded-2xl border border-neutral-800 bg-[linear-gradient(180deg,rgba(22,27,35,0.96),rgba(10,13,18,0.98))] px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_12px_28px_rgba(0,0,0,0.18)]"
        >
            <div className="flex items-center justify-between gap-2">
                <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
                        {t('centerPane.aiPreviewTitle')}
                    </div>
                    <div className="mt-1 text-sm text-neutral-200">
                        {t('centerPane.aiPreviewSummary')}: <span className="text-neutral-50">{activeThread.previewEnvelope?.summary}</span>
                    </div>
                </div>
                <button
                    onClick={() =>
                        updateActiveThread((thread) => ({
                            ...thread,
                            previewCollapsed: !thread.previewCollapsed,
                        }))
                    }
                    className="rounded-lg border border-neutral-700 bg-neutral-900/80 px-2.5 py-1.5 text-xs text-neutral-300 transition hover:bg-neutral-800"
                >
                    {t('centerPane.aiPreviewTitle')}
                    {' · '}
                    {activeThread.previewCollapsed
                        ? t('rightPane.previewExpand')
                        : t('rightPane.previewCollapse')}
                </button>
            </div>
            {previewRisk.level !== 'low' ? (
                <div className={`rounded-2xl border px-3 py-2.5 ${riskBadgeClass}`}>
                    <div className="text-xs font-semibold">
                        {t('rightPane.riskLevelLabel')}: {t(riskLabelKey(previewRisk.level))}
                    </div>
                    {previewRisk.reasons[0] ? (
                        <div className="mt-1 text-xs leading-5">
                            {previewRisk.reasons[0]}
                        </div>
                    ) : null}
                </div>
            ) : null}

            {!activeThread.previewCollapsed ? (
                <div className="max-h-52 space-y-2 overflow-auto pr-1">
                    {previewCommands.map((command, index) => {
                        const inspectorMode = commandInspectorMode(command)
                        const commandRisk = commandRiskTone(command)
                        const comparisonRows = comparisonRowsForCommand(command, {
                            t,
                            chapters,
                            metadata,
                            designSettings,
                            activeChapter,
                        })
                        return (
                            <div
                                key={`${command.type}-${index}`}
                                className="rounded-2xl border border-neutral-700/80 bg-[linear-gradient(180deg,rgba(32,38,49,0.88),rgba(14,17,24,0.96))] px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                            >
                                <div className="min-w-0">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="text-sm font-semibold text-neutral-50">
                                                {t(commandTitleKey(command))}
                                            </div>
                                            <div className="mt-1 text-sm leading-5 text-neutral-300">
                                                {commandReviewSummary(command, t)}
                                            </div>
                                        </div>
                                        {inspectorMode ? (
                                            <button
                                                onClick={() => onRequestInspector(inspectorMode)}
                                                className="shrink-0 rounded-lg border border-neutral-700 bg-neutral-900/80 px-2.5 py-1.5 text-[11px] text-neutral-200 transition hover:border-neutral-600 hover:bg-neutral-800"
                                            >
                                                {commandInspectorLabel(t, inspectorMode)}
                                            </button>
                                        ) : null}
                                    </div>
                                    <div className="mt-3 rounded-xl border border-neutral-800 bg-neutral-950/55 px-2.5 py-2">
                                        <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-500">
                                            {t('rightPane.reviewOutcomeLabel')}
                                        </div>
                                        <div className="mt-1 text-sm leading-5 text-neutral-100">
                                            {commandOutcomeSummary(command, t)}
                                        </div>
                                    </div>
                                    {comparisonRows.length > 0 ? (
                                        <div className="mt-3 space-y-2">
                                            {comparisonRows.slice(0, 2).map((row) => (
                                                <div key={`${command.type}-${row.label}`} className="rounded-xl border border-neutral-800 bg-neutral-950/55 px-2.5 py-2">
                                                    <div className="text-[11px] text-neutral-400">{row.label}</div>
                                                    <div className="mt-1.5 grid grid-cols-2 gap-2 text-xs">
                                                        <div>
                                                            <div className="text-[10px] uppercase tracking-[0.08em] text-neutral-500">
                                                                {t('rightPane.reviewBeforeLabel')}
                                                            </div>
                                                            <div className="mt-0.5 text-neutral-300">{row.before}</div>
                                                        </div>
                                                        <div>
                                                            <div className="text-[10px] uppercase tracking-[0.08em] text-neutral-500">
                                                                {t('rightPane.reviewAfterLabel')}
                                                            </div>
                                                            <div className="mt-0.5 text-neutral-100">{row.after}</div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : null}
                                    <div className="mt-3 flex flex-wrap gap-1.5">
                                        <span className="rounded-full border border-neutral-700 bg-neutral-900/80 px-2 py-0.5 text-[11px] text-neutral-300">
                                            {commandScopeSummary(command, t)}
                                        </span>
                                        {commandRisk !== 'low' ? (
                                            <span className={`rounded-full border px-2 py-0.5 text-[11px] ${commandRiskClass(commandRisk)}`}>
                                                {t(riskLabelKey(commandRisk))}
                                            </span>
                                        ) : null}
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            ) : (
                <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 px-3 py-2 text-xs text-neutral-500">
                    {t('rightPane.previewCollapsedSummary', {
                        count: previewCommands.length,
                    })}
                </div>
            )}

            {!activeThread.previewCollapsed && previewWarnings.length > 0 && (
                <div className="rounded-2xl border border-amber-600/40 bg-amber-950/30 px-3 py-2.5">
                    <div className="text-xs font-semibold text-amber-200">
                        {t('centerPane.aiPreviewWarningsLabel')}
                    </div>
                    {previewWarnings.map((warning, index) => (
                        <div key={`warning-${index}`} className="mt-1 text-xs leading-5 text-amber-100/90">
                            - {warning}
                        </div>
                    ))}
                </div>
            )}

            <div className="space-y-2 rounded-2xl border border-neutral-700 bg-[linear-gradient(180deg,rgba(16,20,28,0.96),rgba(9,11,15,1))] px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                {previewRisk.level === 'high' ? (
                    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
                        {t('rightPane.applyChecklistTitle')}
                    </div>
                ) : null}
                {previewRisk.level === 'high' ? (
                    <label className="flex items-start gap-2 text-xs text-rose-200">
                        <input
                            type="checkbox"
                            checked={activeThread.applyDangerConfirmed}
                            onChange={(event) =>
                                updateActiveThread((thread) => ({
                                    ...thread,
                                    applyDangerConfirmed: event.target.checked,
                                }))
                            }
                            disabled={copilotApplying}
                            className="mt-0.5 h-3.5 w-3.5 rounded border border-rose-600 bg-rose-950/40"
                        />
                        <span>{t('rightPane.applyDangerConfirm')}</span>
                    </label>
                ) : null}
                <div className="text-[11px] text-neutral-400">
                    {applyBlockedReason ?? (previewRisk.level === 'high' ? t('rightPane.applyReady') : t('rightPane.applySimpleReady'))}
                </div>
                <div className="flex justify-end gap-2">
                    <button
                        onClick={() =>
                            updateActiveThread((thread) => ({
                                ...thread,
                                previewEnvelope: null,
                                applySafetyConfirmed: false,
                                applyDangerConfirmed: false,
                            }))
                        }
                        disabled={copilotApplying}
                        className="rounded-lg border border-neutral-700 bg-neutral-900/80 px-2.5 py-1.5 text-xs text-neutral-200 transition hover:bg-neutral-800 disabled:opacity-60"
                    >
                        {t('common.close')}
                    </button>
                    <button
                        onClick={() => {
                            void applyPreview()
                        }}
                        data-testid="copilot-apply-button"
                        disabled={
                            copilotApplying ||
                            previewCommands.length === 0 ||
                            (shouldRequireExplicitApproval && !activeThread.applyDangerConfirmed)
                        }
                        className="rounded-lg border border-teal-500/30 bg-[linear-gradient(180deg,rgba(20,184,166,0.28),rgba(13,148,136,0.88))] px-3 py-1.5 text-xs font-medium text-white transition hover:bg-[linear-gradient(180deg,rgba(20,184,166,0.36),rgba(13,148,136,0.96))] disabled:opacity-60"
                    >
                        {copilotApplying
                            ? t('centerPane.aiPreviewApplying')
                            : t('centerPane.aiPreviewApply')}
                    </button>
                </div>
            </div>
        </div>
    )
}
