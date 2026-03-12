import type { Editor } from '@tiptap/core'
import type { TFunction } from 'i18next'
import type { AiCommandEnvelope } from '../../../shared/aiCommandSchema'
import type { Chapter } from '../../types/project'
import type { CopilotRiskLevel } from './rightPaneTypes'
import type { CopilotIntent } from '../../../shared/copilotIpc'
import { readCurrentPage, readCurrentSelection } from './editorToolAdapter.ts'
export { shouldSkipPreviewReview } from './previewPolicy.ts'

export function evaluateEnvelopeRisk(input: {
    envelope: AiCommandEnvelope | null
    activeChapter: Chapter | undefined
    editor: Editor | null
    t: TFunction
    deleteRatioWarn: number
    deleteRatioBlock: number
}): { level: CopilotRiskLevel; reasons: string[] } {
    const {
        envelope,
        activeChapter,
        editor,
        t,
        deleteRatioWarn,
        deleteRatioBlock,
    } = input

    if (!envelope || envelope.commands.length === 0) {
        return { level: 'low', reasons: [t('rightPane.riskReasonNoCommands')] }
    }

    let level: CopilotRiskLevel = 'low'
    const reasons: string[] = []
    const structuralCommands = envelope.commands.filter(
        (command) =>
            command.type === 'append_text' ||
            command.type === 'find_replace' ||
            command.type === 'save_project' ||
            command.type === 'rename_chapter' ||
            command.type === 'delete_chapter' ||
            command.type === 'move_chapter' ||
            command.type === 'set_chapter_type' ||
            command.type === 'set_typography' ||
            command.type === 'set_page_background' ||
            command.type === 'apply_theme' ||
            command.type === 'update_book_info' ||
            command.type === 'set_cover_asset' ||
            command.type === 'export_project' ||
            command.type === 'restore_snapshot' ||
            command.type === 'create_chapter' ||
            command.type === 'insert_table' ||
            command.type === 'insert_illustration',
    )
    if (structuralCommands.length >= 3) {
        level = 'high'
        reasons.push(t('rightPane.riskReasonStructureHigh'))
    } else if (structuralCommands.length >= 2) {
        if (level !== 'high') level = 'medium'
        reasons.push(t('rightPane.riskReasonStructureMedium'))
    }
    for (const command of envelope.commands) {
        if (command.type === 'feedback_report') {
            reasons.push(t('rightPane.riskReasonLowDefault'))
            continue
        }
        if (command.type === 'save_project') {
            reasons.push(
                t('rightPane.riskReasonSaveProjectDetail', {
                    mode: command.target.mode,
                }),
            )
            continue
        }
        if (command.type === 'delete_chapter' || command.type === 'restore_snapshot') {
            level = 'high'
            reasons.push(
                command.type === 'delete_chapter'
                    ? t('rightPane.riskReasonDeleteChapterDetail')
                    : t('rightPane.riskReasonRestoreSnapshotDetail', {
                        mode: command.payload.mode,
                    }),
            )
            continue
        }
        if (command.type === 'rename_chapter' || command.type === 'move_chapter' || command.type === 'set_chapter_type') {
            reasons.push(
                command.type === 'rename_chapter'
                    ? t('rightPane.riskReasonRenameChapterDetail')
                    : command.type === 'move_chapter'
                        ? t('rightPane.riskReasonMoveChapterDetail', {
                            toIndex: command.payload.toIndex,
                        })
                        : t('rightPane.riskReasonSetChapterTypeDetail', {
                            chapterType: command.payload.chapterType,
                        }),
            )
            continue
        }
        if (command.type === 'set_typography' || command.type === 'set_page_background' || command.type === 'apply_theme') {
            if (level === 'low') level = 'medium'
            reasons.push(
                command.type === 'set_typography'
                    ? t('rightPane.riskReasonSetTypographyDetail', {
                        section: command.target.section,
                        slot: command.payload.slot,
                    })
                    : command.type === 'set_page_background'
                        ? t('rightPane.riskReasonSetPageBackgroundDetail', {
                            color: command.payload.color,
                        })
                        : t('rightPane.riskReasonApplyThemeDetail', {
                            theme: command.payload.theme,
                        }),
            )
            continue
        }
        if (command.type === 'update_book_info' || command.type === 'set_cover_asset' || command.type === 'export_project') {
            if (level === 'low') level = 'medium'
            reasons.push(
                command.type === 'update_book_info'
                    ? t('rightPane.riskReasonUpdateBookInfoDetail')
                    : command.type === 'set_cover_asset'
                        ? t('rightPane.riskReasonSetCoverAssetDetail', {
                            assetType: command.target.assetType,
                        })
                        : t('rightPane.riskReasonExportProjectDetail', {
                            format: command.target.format,
                        }),
            )
            continue
        }
        if (command.type === 'append_text') {
            reasons.push(t('rightPane.riskReasonInsertContent'))
            if (level === 'low') level = 'medium'
            continue
        }
        if (command.type === 'find_replace') {
            if (command.target.scope === 'project' || command.payload.mode === 'all') {
                if (level !== 'high') level = 'medium'
                reasons.push(t('rightPane.riskReasonFindReplaceBulk'))
            } else {
                reasons.push(t('rightPane.riskReasonFindReplace'))
            }
            continue
        }
        if (command.type === 'create_chapter') {
            reasons.push(t('rightPane.riskReasonCreateChapter'))
            if (level === 'low') level = 'medium'
            continue
        }
        if (command.type === 'insert_table' || command.type === 'insert_illustration') {
            reasons.push(t('rightPane.riskReasonInsertContent'))
            if (level === 'low') level = 'medium'
            continue
        }
        if (command.type !== 'rewrite_selection') continue

        if (!activeChapter || command.target.chapterId !== activeChapter.id) {
            level = 'high'
            reasons.push(t('rightPane.riskReasonChapterMismatch'))
            continue
        }

        if (!editor) {
            level = 'medium'
            reasons.push(t('rightPane.riskReasonEditorMissing'))
            continue
        }

        const doc = editor.state.doc
        const from = Math.floor(command.target.range.from)
        const to = Math.floor(command.target.range.to)
        if (from < 1 || to <= from || to > doc.content.size) {
            level = 'high'
            reasons.push(t('rightPane.riskReasonInvalidRange'))
            continue
        }

        const originalText = doc.textBetween(from, to, '\n', '\n')
        const originalChars = originalText.length
        const nextText = String(command.payload.text ?? '')
        const removedChars = Math.max(0, originalChars - nextText.length)
        const deleteRatio = removedChars / Math.max(1, originalChars)

        if (deleteRatio > deleteRatioBlock) {
            level = 'high'
            reasons.push(
                t('rightPane.riskReasonDeleteHigh', {
                    percent: Math.round(deleteRatio * 100),
                }),
            )
            continue
        }
        if (deleteRatio > deleteRatioWarn) {
            if (level !== 'high') level = 'medium'
            reasons.push(
                t('rightPane.riskReasonDeleteMedium', {
                    percent: Math.round(deleteRatio * 100),
                }),
            )
        }
    }

    const rewriteCommands = envelope.commands.filter((command) => command.type === 'rewrite_selection')
    if (rewriteCommands.length >= 3 && level !== 'high') {
        level = 'medium'
        reasons.push(t('rightPane.riskReasonBulkRewrite'))
    }

    if (reasons.length === 0) reasons.push(t('rightPane.riskReasonLowDefault'))
    return { level, reasons }
}

export function formatThreadUpdatedAt(value: string, t: TFunction): string {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    const diffMs = Date.now() - date.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    if (diffMin < 1) return t('rightPane.threadUpdated.now')
    if (diffMin < 60) return t('rightPane.threadUpdated.minutes', { count: diffMin })
    const diffHour = Math.floor(diffMin / 60)
    if (diffHour < 24) return t('rightPane.threadUpdated.hours', { count: diffHour })
    const diffDay = Math.floor(diffHour / 24)
    return t('rightPane.threadUpdated.days', { count: diffDay })
}

export function resolveSelectedContext(input: {
    contextScope: 'selection' | 'chapter' | 'project'
    editor: Editor | null
    projectTitle: string | undefined
    chapterCount: number
    activeChapterTitle: string | undefined
    chapterTitles?: string[]
}): string {
    const {
        contextScope,
        editor,
        projectTitle,
        chapterCount,
        activeChapterTitle,
        chapterTitles,
    } = input

    const selectionSnapshot = contextScope !== 'project' ? readCurrentSelection() : null
    if (selectionSnapshot) return selectionSnapshot.text
    if (contextScope === 'project') {
        const summary = projectTitle?.trim()
            ? `${projectTitle} (${chapterCount} chapters)`
            : `${chapterCount} chapters`
        const titles = (chapterTitles ?? []).map((title) => title.trim()).filter(Boolean).slice(0, 12)
        return titles.length > 0 ? `${summary}\n${titles.join(' | ')}` : summary
    }
    const pageSnapshot = readCurrentPage()
    if (pageSnapshot?.text) return pageSnapshot.text
    if (editor) {
        const pageText = editor.state.doc.textBetween(1, editor.state.doc.content.size, '\n', '\n').trim()
        if (pageText) return pageText
    }
    return activeChapterTitle?.trim() || ''
}

const PROJECT_SCOPE_INTENTS = new Set<CopilotIntent>([
    'save_project',
    'rename_chapter',
    'delete_chapter',
    'move_chapter',
    'set_chapter_type',
    'apply_theme',
    'update_book_info',
    'set_cover_asset',
    'export_project',
    'restore_snapshot',
    'create_chapter',
])

const PROJECT_SCOPE_PROMPT_PATTERN =
    /(?:전체\s*(?:프로젝트|책|원고|문서|페이지|챕터)|책\s*전체|프로젝트\s*전체|전\s*(?:챕터|페이지)|모든\s*(?:챕터|페이지|문단|본문|섹션)|전체적으로|전반적으로|across the (?:book|project|manuscript)|whole (?:book|project|manuscript)|entire (?:book|project|manuscript)|all (?:chapters|pages|sections|paragraphs)|book[- ]wide|project[- ]wide)/i

export function inferCopilotContextScope(input: {
    prompt: string
    resolvedIntent?: CopilotIntent | null
    hasSelection: boolean
}): 'selection' | 'chapter' | 'project' {
    const { prompt, resolvedIntent, hasSelection } = input
    if (hasSelection) return 'selection'
    if (resolvedIntent && PROJECT_SCOPE_INTENTS.has(resolvedIntent)) return 'project'
    return PROJECT_SCOPE_PROMPT_PATTERN.test(String(prompt ?? '')) ? 'project' : 'chapter'
}

export function getExplicitSelectionText(editor: Editor | null): string {
    const selectionSnapshot = readCurrentSelection()
    if (selectionSnapshot) return selectionSnapshot.text
    if (!editor) return ''
    const { from, to } = editor.state.selection
    if (to <= from) return ''
    return editor.state.doc.textBetween(from, to, '\n', '\n').trim()
}
