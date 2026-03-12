import { Fragment, type ReactNode } from 'react'
import type { TFunction } from 'i18next'
import type { AiCommand } from '../../../shared/aiCommandSchema'
import type { CopilotRiskLevel } from './rightPaneTypes'
import i18n from '../../i18n'

export function commandTitleKey(command: AiCommand): string {
    if (command.type === 'rewrite_selection') return 'rightPane.intent.rewriteSelection'
    if (command.type === 'append_text') return 'rightPane.intent.appendText'
    if (command.type === 'find_replace') return 'rightPane.intent.findReplace'
    if (command.type === 'save_project') return 'rightPane.intent.saveProject'
    if (command.type === 'rename_chapter') return 'rightPane.intent.renameChapter'
    if (command.type === 'delete_chapter') return 'rightPane.intent.deleteChapter'
    if (command.type === 'move_chapter') return 'rightPane.intent.moveChapter'
    if (command.type === 'set_chapter_type') return 'rightPane.intent.setChapterType'
    if (command.type === 'set_typography') return 'rightPane.intent.setTypography'
    if (command.type === 'set_page_background') return 'rightPane.intent.setPageBackground'
    if (command.type === 'apply_theme') return 'rightPane.intent.applyTheme'
    if (command.type === 'update_book_info') return 'rightPane.intent.updateBookInfo'
    if (command.type === 'set_cover_asset') return 'rightPane.intent.setCoverAsset'
    if (command.type === 'export_project') return 'rightPane.intent.exportProject'
    if (command.type === 'restore_snapshot') return 'rightPane.intent.restoreSnapshot'
    if (command.type === 'create_chapter') return 'rightPane.intent.createChapter'
    if (command.type === 'insert_table') return 'rightPane.intent.insertTable'
    if (command.type === 'insert_illustration') return 'rightPane.intent.insertIllustration'
    return 'rightPane.intent.feedbackReport'
}

export function commandPreview(command: AiCommand, t?: TFunction): string {
    const label = (key: string, fallback: string) => (t ? t(key) : fallback)
    const lines = (...items: Array<string | null | undefined>) => items.filter(Boolean).join('\n')

    if (command.type === 'rewrite_selection') {
        const from = command.target.range.from
        const to = command.target.range.to
        const text = String(command.payload.text ?? '').trim()
        const shortened = text.length > 400 ? `${text.slice(0, 400)}...` : text
        return lines(
            `${label('rightPane.preview.chapter', 'Chapter')}: ${command.target.chapterId}`,
            `${label('rightPane.preview.range', 'Range')}: ${from} - ${to}`,
            `${label('rightPane.preview.rewriteTo', 'Rewrite to')}: ${shortened}`,
        )
    }
    if (command.type === 'append_text') {
        const text = String(command.payload.text ?? '').trim()
        const shortened = text.length > 400 ? `${text.slice(0, 400)}...` : text
        return lines(
            `${label('rightPane.preview.chapter', 'Chapter')}: ${command.target.chapterId}`,
            `${label('rightPane.preview.position', 'Position')}: ${String(command.target.position ?? 'end')}`,
            `${label('rightPane.preview.appendText', 'Append text')}: ${shortened}`,
        )
    }
    if (command.type === 'find_replace') {
        return lines(
            `${label('rightPane.preview.scope', 'Scope')}: ${command.target.scope}`,
            command.target.chapterId
                ? `${label('rightPane.preview.chapter', 'Chapter')}: ${command.target.chapterId}`
                : null,
            `${label('rightPane.preview.find', 'Find')}: ${command.payload.find}`,
            `${label('rightPane.preview.replace', 'Replace with')}: ${command.payload.replace}`,
            `${label('rightPane.preview.mode', 'Mode')}: ${command.payload.mode}`,
            `${label('rightPane.preview.matchCase', 'Match case')}: ${command.payload.matchCase ? label('common.yes', 'Yes') : label('common.no', 'No')}`,
        )
    }
    if (command.type === 'save_project') {
        return lines(
            `${label('rightPane.preview.saveMode', 'Save mode')}: ${command.target.mode}`,
            command.payload.suggestedPath
                ? `${label('rightPane.preview.suggestedPath', 'Suggested path')}: ${command.payload.suggestedPath}`
                : null,
        )
    }
    if (command.type === 'rename_chapter') {
        return lines(
            `${label('rightPane.preview.chapter', 'Chapter')}: ${command.target.chapterId}`,
            `${label('rightPane.preview.newTitle', 'New title')}: ${command.payload.title}`,
        )
    }
    if (command.type === 'delete_chapter') {
        return lines(
            `${label('rightPane.preview.chapter', 'Chapter')}: ${command.target.chapterId}`,
            `${label('rightPane.preview.action', 'Action')}: ${label('rightPane.intent.deleteChapter', 'Delete chapter')}`,
        )
    }
    if (command.type === 'move_chapter') {
        return lines(
            `${label('rightPane.preview.chapter', 'Chapter')}: ${command.target.chapterId}`,
            `${label('rightPane.preview.moveTo', 'Move to')}: ${command.payload.toIndex}`,
            command.payload.parentId
                ? `${label('rightPane.preview.parentChapter', 'Parent chapter')}: ${command.payload.parentId}`
                : null,
        )
    }
    if (command.type === 'set_chapter_type') {
        return lines(
            `${label('rightPane.preview.chapter', 'Chapter')}: ${command.target.chapterId}`,
            `${label('rightPane.preview.chapterType', 'Chapter type')}: ${command.payload.chapterType}`,
            command.payload.chapterKind
                ? `${label('rightPane.preview.chapterKind', 'Chapter kind')}: ${command.payload.chapterKind}`
                : null,
        )
    }
    if (command.type === 'set_typography') {
        return lines(
            `${label('rightPane.preview.section', 'Section')}: ${command.target.section}`,
            `${label('rightPane.preview.typographySlot', 'Typography slot')}: ${command.payload.slot}`,
            command.payload.fontFamily
                ? `${label('rightPane.preview.fontFamily', 'Font family')}: ${command.payload.fontFamily}`
                : null,
            command.payload.fontScale !== undefined
                ? `${label('rightPane.preview.fontScale', 'Font scale')}: ${command.payload.fontScale}`
                : null,
            command.payload.lineHeight !== undefined
                ? `${label('rightPane.preview.lineHeight', 'Line height')}: ${command.payload.lineHeight}`
                : null,
            command.payload.letterSpacing !== undefined
                ? `${label('rightPane.preview.letterSpacing', 'Letter spacing')}: ${command.payload.letterSpacing}`
                : null,
            command.payload.textIndent !== undefined
                ? `${label('rightPane.preview.textIndent', 'Text indent')}: ${command.payload.textIndent}`
                : null,
        )
    }
    if (command.type === 'set_page_background') {
        return lines(
            `${label('rightPane.preview.chapter', 'Chapter')}: ${command.target.chapterId}`,
            `${label('rightPane.preview.pageBackground', 'Page background')}: ${command.payload.color}`,
        )
    }
    if (command.type === 'apply_theme') {
        return `${label('rightPane.preview.theme', 'Theme')}: ${command.payload.theme}`
    }
    if (command.type === 'update_book_info') {
        const changed = [
            command.payload.title ? label('rightPane.preview.fieldTitle', 'Title') : null,
            command.payload.subtitle ? label('rightPane.preview.fieldSubtitle', 'Subtitle') : null,
            command.payload.language ? label('rightPane.preview.fieldLanguage', 'Language') : null,
            command.payload.publisher ? label('rightPane.preview.fieldPublisher', 'Publisher') : null,
            command.payload.link ? label('rightPane.preview.fieldLink', 'Link') : null,
            command.payload.description ? label('rightPane.preview.fieldDescription', 'Description') : null,
            command.payload.authors?.length ? label('rightPane.preview.fieldAuthors', 'Authors') : null,
        ].filter(Boolean)
        return lines(
            `${label('rightPane.preview.scope', 'Scope')}: ${command.target.scope}`,
            `${label('rightPane.preview.changedFields', 'Changed fields')}: ${changed.join(', ') || '-'}`,
        )
    }
    if (command.type === 'set_cover_asset') {
        return lines(
            `${label('rightPane.preview.assetType', 'Asset type')}: ${command.target.assetType}`,
            `${label('rightPane.preview.assetSource', 'Asset source')}: ${command.payload.source}`,
            `${label('rightPane.preview.assetValue', 'Asset value')}: ${command.payload.value}`,
        )
    }
    if (command.type === 'export_project') {
        return lines(
            `${label('rightPane.preview.exportFormat', 'Export format')}: ${command.target.format}`,
            `${label('rightPane.preview.embedFonts', 'Embed fonts')}: ${command.payload.embedFonts ? label('common.yes', 'Yes') : label('common.no', 'No')}`,
        )
    }
    if (command.type === 'restore_snapshot') {
        return lines(
            `${label('rightPane.preview.snapshotId', 'Snapshot')}: ${command.target.snapshotId}`,
            `${label('rightPane.preview.restoreMode', 'Restore mode')}: ${command.payload.mode}`,
        )
    }
    return JSON.stringify(
        {
            target: command.target,
            payload: command.payload,
        },
        null,
        2,
    )
}

export function commandReviewSummary(command: AiCommand, t?: TFunction): string {
    const label = (key: string, fallback: string, values?: Record<string, unknown>) =>
        t ? t(key, values) : fallback

    if (command.type === 'rewrite_selection') {
        return label('rightPane.reviewSummaryRewriteSelection', '선택한 문장을 새 문안으로 교체합니다.')
    }
    if (command.type === 'append_text') {
        return label('rightPane.reviewSummaryAppendText', '대상 챕터 끝이나 지정 위치에 새 텍스트를 덧붙입니다.')
    }
    if (command.type === 'find_replace') {
        return label('rightPane.reviewSummaryFindReplace', '지정한 범위에서 문자열을 찾아 바꿉니다.')
    }
    if (command.type === 'save_project') {
        return label('rightPane.reviewSummarySaveProject', '현재 프로젝트 파일을 저장합니다.')
    }
    if (command.type === 'rename_chapter') {
        return label('rightPane.reviewSummaryRenameChapter', '챕터 이름을 새 제목으로 바꿉니다.')
    }
    if (command.type === 'delete_chapter') {
        return label('rightPane.reviewSummaryDeleteChapter', '대상 챕터를 구조와 본문에서 삭제합니다.')
    }
    if (command.type === 'move_chapter') {
        return label('rightPane.reviewSummaryMoveChapter', '챕터 순서를 옮겨 문서 구조를 재배치합니다.')
    }
    if (command.type === 'set_chapter_type') {
        return label('rightPane.reviewSummarySetChapterType', '챕터 유형을 바꿔 구획 스타일과 렌더링을 조정합니다.')
    }
    if (command.type === 'set_typography') {
        return label('rightPane.reviewSummarySetTypography', '타이포그래피 값을 조정해 읽기 톤을 바꿉니다.')
    }
    if (command.type === 'set_page_background') {
        return label('rightPane.reviewSummarySetPageBackground', '페이지 배경 색상을 바꿉니다.')
    }
    if (command.type === 'apply_theme') {
        return label('rightPane.reviewSummaryApplyTheme', '책 전반에 새 테마를 적용합니다.')
    }
    if (command.type === 'update_book_info') {
        return label('rightPane.reviewSummaryUpdateBookInfo', '책 메타데이터를 업데이트합니다.')
    }
    if (command.type === 'set_cover_asset') {
        return label('rightPane.reviewSummarySetCoverAsset', '표지 또는 로고 같은 자산을 교체합니다.')
    }
    if (command.type === 'export_project') {
        return label('rightPane.reviewSummaryExportProject', '현재 프로젝트를 배포용 파일로 내보냅니다.')
    }
    if (command.type === 'restore_snapshot') {
        return label('rightPane.reviewSummaryRestoreSnapshot', '선택한 스냅샷 시점으로 작업 상태를 되돌립니다.')
    }
    if (command.type === 'create_chapter') {
        return label('rightPane.reviewSummaryCreateChapter', '새 챕터를 추가합니다.')
    }
    if (command.type === 'insert_table') {
        return label('rightPane.reviewSummaryInsertTable', '현재 문맥에 표를 삽입합니다.')
    }
    if (command.type === 'insert_illustration') {
        return label('rightPane.reviewSummaryInsertIllustration', '현재 문맥에 삽화를 삽입합니다.')
    }
    return label('rightPane.reviewSummaryFeedbackReport', '분석 결과를 리포트로 정리합니다.')
}

export function commandOutcomeSummary(command: AiCommand, t?: TFunction): string {
    const label = (key: string, fallback: string, values?: Record<string, unknown>) =>
        t ? t(key, values) : fallback

    if (command.type === 'rewrite_selection') {
        return label('rightPane.reviewOutcomeRewriteSelection', '선택 영역의 문장이 새 문안으로 바뀝니다.')
    }
    if (command.type === 'append_text') {
        return label('rightPane.reviewOutcomeAppendText', '대상 챕터에 새 문단이 추가됩니다.')
    }
    if (command.type === 'find_replace') {
        return label('rightPane.reviewOutcomeFindReplace', '지정한 범위의 일치 항목이 새 표현으로 바뀝니다.')
    }
    if (command.type === 'save_project') {
        return label('rightPane.reviewOutcomeSaveProject', '현재 상태가 프로젝트 파일로 저장됩니다.')
    }
    if (command.type === 'rename_chapter') {
        return label('rightPane.reviewOutcomeRenameChapter', `새 제목: ${command.payload.title}`, {
            title: command.payload.title,
        })
    }
    if (command.type === 'delete_chapter') {
        return label('rightPane.reviewOutcomeDeleteChapter', '대상 챕터가 문서 구조에서 제거됩니다.')
    }
    if (command.type === 'move_chapter') {
        return label('rightPane.reviewOutcomeMoveChapter', `새 위치: ${command.payload.toIndex}`, {
            toIndex: command.payload.toIndex,
        })
    }
    if (command.type === 'set_chapter_type') {
        return label('rightPane.reviewOutcomeSetChapterType', `새 유형: ${command.payload.chapterType}`, {
            chapterType: command.payload.chapterType,
        })
    }
    if (command.type === 'set_typography') {
        return label('rightPane.reviewOutcomeSetTypography', `대상 슬롯: ${command.payload.slot}`, {
            slot: command.payload.slot,
        })
    }
    if (command.type === 'set_page_background') {
        return label('rightPane.reviewOutcomeSetPageBackground', `새 배경: ${command.payload.color}`, {
            color: command.payload.color,
        })
    }
    if (command.type === 'apply_theme') {
        return label('rightPane.reviewOutcomeApplyTheme', `새 테마: ${command.payload.theme}`, {
            theme: command.payload.theme,
        })
    }
    if (command.type === 'update_book_info') {
        return label('rightPane.reviewOutcomeUpdateBookInfo', '메타데이터 필드가 새 값으로 저장됩니다.')
    }
    if (command.type === 'set_cover_asset') {
        return label('rightPane.reviewOutcomeSetCoverAsset', `교체 자산: ${command.target.assetType}`, {
            assetType: command.target.assetType,
        })
    }
    if (command.type === 'export_project') {
        return label('rightPane.reviewOutcomeExportProject', `내보내기 형식: ${command.target.format}`, {
            format: command.target.format,
        })
    }
    if (command.type === 'restore_snapshot') {
        return label('rightPane.reviewOutcomeRestoreSnapshot', `복원 스냅샷: ${command.target.snapshotId}`, {
            snapshotId: command.target.snapshotId,
        })
    }
    if (command.type === 'create_chapter') {
        return label('rightPane.reviewOutcomeCreateChapter', '새 챕터가 문서 구조에 추가됩니다.')
    }
    if (command.type === 'insert_table') {
        return label('rightPane.reviewOutcomeInsertTable', '현재 문맥에 표 블록이 추가됩니다.')
    }
    if (command.type === 'insert_illustration') {
        return label('rightPane.reviewOutcomeInsertIllustration', '현재 문맥에 삽화 블록이 추가됩니다.')
    }
    return label('rightPane.reviewOutcomeFeedbackReport', '리포트 메시지가 대화에 추가됩니다.')
}

export function commandRecoverySummary(command: AiCommand, t?: TFunction): string {
    const label = (key: string, fallback: string) => (t ? t(key) : fallback)
    if (command.type === 'delete_chapter' || command.type === 'restore_snapshot') {
        return label('rightPane.reviewRecoveryHistory', '버전 관리에서 복구할 수 있습니다.')
    }
    if (command.type === 'export_project') {
        return label('rightPane.reviewRecoveryFileOutput', '내보내기 결과 파일은 재생성할 수 있습니다.')
    }
    return label('rightPane.reviewRecoveryStandard', '적용 전 복구 지점이 저장되면 되돌릴 수 있습니다.')
}

export function commandScopeSummary(command: AiCommand, t?: TFunction): string {
    const label = (key: string, fallback: string, values?: Record<string, unknown>) =>
        t ? t(key, values) : fallback

    if (command.type === 'rewrite_selection' || command.type === 'append_text') {
        return label('rightPane.reviewScopeChapter', `챕터 ${command.target.chapterId}`, {
            chapterId: command.target.chapterId,
        })
    }
    if (command.type === 'find_replace') {
        return label('rightPane.reviewScopeFindReplace', `범위 ${command.target.scope}`, {
            scope: command.target.scope,
        })
    }
    if (command.type === 'rename_chapter' || command.type === 'delete_chapter' || command.type === 'move_chapter' || command.type === 'set_chapter_type' || command.type === 'set_page_background') {
        return label('rightPane.reviewScopeChapter', `챕터 ${command.target.chapterId}`, {
            chapterId: command.target.chapterId,
        })
    }
    if (command.type === 'set_typography') {
        return label('rightPane.reviewScopeSection', `섹션 ${command.target.section}`, {
            section: command.target.section,
        })
    }
    if (command.type === 'apply_theme') {
        return label('rightPane.reviewScopeTheme', '책 전체 디자인', {})
    }
    if (command.type === 'update_book_info') {
        return label('rightPane.reviewScopeMetadata', '책 정보', {})
    }
    if (command.type === 'set_cover_asset') {
        return label('rightPane.reviewScopeCoverAsset', `자산 ${command.target.assetType}`, {
            assetType: command.target.assetType,
        })
    }
    if (command.type === 'export_project') {
        return label('rightPane.reviewScopeExport', `내보내기 ${command.target.format}`, {
            format: command.target.format,
        })
    }
    if (command.type === 'restore_snapshot') {
        return label('rightPane.reviewScopeHistory', '버전 관리', {})
    }
    if (command.type === 'save_project') {
        return label('rightPane.reviewScopeProject', '현재 프로젝트', {})
    }
    if (command.type === 'create_chapter') {
        return label('rightPane.reviewScopeStructure', '문서 구조', {})
    }
    if (command.type === 'insert_table' || command.type === 'insert_illustration') {
        return label('rightPane.reviewScopeCurrentContext', '현재 편집 위치', {})
    }
    return label('rightPane.reviewScopeProject', '현재 프로젝트', {})
}

export function riskLabelKey(level: CopilotRiskLevel): string {
    if (level === 'high') return 'rightPane.riskHighLabel'
    if (level === 'medium') return 'rightPane.riskMediumLabel'
    return 'rightPane.riskLowLabel'
}

const INLINE_COMMAND_LABELS = {
    rewrite_selection: 'rightPane.intent.rewriteSelection',
    append_text: 'rightPane.intent.appendText',
    find_replace: 'rightPane.intent.findReplace',
    save_project: 'rightPane.intent.saveProject',
    rename_chapter: 'rightPane.intent.renameChapter',
    delete_chapter: 'rightPane.intent.deleteChapter',
    move_chapter: 'rightPane.intent.moveChapter',
    set_chapter_type: 'rightPane.intent.setChapterType',
    set_typography: 'rightPane.intent.setTypography',
    set_page_background: 'rightPane.intent.setPageBackground',
    apply_theme: 'rightPane.intent.applyTheme',
    update_book_info: 'rightPane.intent.updateBookInfo',
    set_cover_asset: 'rightPane.intent.setCoverAsset',
    export_project: 'rightPane.intent.exportProject',
    restore_snapshot: 'rightPane.intent.restoreSnapshot',
    create_chapter: 'rightPane.intent.createChapter',
    insert_table: 'rightPane.intent.insertTable',
    insert_illustration: 'rightPane.intent.insertIllustration',
    feedback_report: 'rightPane.intent.feedbackReport',
} as const

function replaceCommandTokensInPlainText(text: string): string {
    let output = String(text ?? '')
    for (const [token, labelKey] of Object.entries(INLINE_COMMAND_LABELS)) {
        const translated = i18n.t(labelKey)
        if (!translated || translated === labelKey) continue
        const pattern = new RegExp(`\\b${token.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\b`, 'g')
        output = output.replace(pattern, translated)
    }
    return output
}

function humanizeInlineCode(code: string): string {
    const raw = String(code ?? '').trim()
    if (!raw) return raw

    const labelKey = INLINE_COMMAND_LABELS[raw as keyof typeof INLINE_COMMAND_LABELS]
    if (labelKey) return i18n.t(labelKey)

    if (/^[a-z]+(?:_[a-z0-9]+)+$/.test(raw)) {
        return raw.replace(/_/g, ' ')
    }

    return raw
}

function renderInlineMarkdown(text: string, keyPrefix: string): ReactNode[] {
    const source = replaceCommandTokensInPlainText(text)
    const tokenPattern =
        /(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|~~([^~]+)~~|\*([^*\n]+)\*|_([^_\n]+)_)/g
    const parts: ReactNode[] = []
    let lastIndex = 0
    let match: RegExpExecArray | null
    let tokenIndex = 0

    while ((match = tokenPattern.exec(source)) !== null) {
        const start = match.index
        const end = tokenPattern.lastIndex

        if (start > lastIndex) {
            parts.push(
                <span key={`${keyPrefix}-text-${tokenIndex}`}>{source.slice(lastIndex, start)}</span>,
            )
        }

        if (match[2] && match[3]) {
            parts.push(
                <a
                    key={`${keyPrefix}-link-${tokenIndex}`}
                    href={match[3]}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="underline text-sky-300 hover:text-sky-200"
                >
                    {match[2]}
                </a>,
            )
        } else if (match[4]) {
            parts.push(
                <code
                    key={`${keyPrefix}-code-${tokenIndex}`}
                    className="rounded bg-neutral-900 px-1 py-0.5 text-xs text-amber-200"
                >
                    {humanizeInlineCode(match[4])}
                </code>,
            )
        } else if (match[5]) {
            parts.push(
                <strong key={`${keyPrefix}-bold-${tokenIndex}`} className="font-semibold text-white">
                    {match[5]}
                </strong>,
            )
        } else if (match[6]) {
            parts.push(
                <del key={`${keyPrefix}-strike-${tokenIndex}`} className="text-neutral-400">
                    {match[6]}
                </del>,
            )
        } else if (match[7] || match[8]) {
            parts.push(
                <em key={`${keyPrefix}-italic-${tokenIndex}`} className="italic">
                    {match[7] ?? match[8]}
                </em>,
            )
        }

        lastIndex = end
        tokenIndex += 1
    }

    if (lastIndex < source.length) {
        parts.push(<span key={`${keyPrefix}-tail`}>{source.slice(lastIndex)}</span>)
    }
    if (parts.length === 0) {
        parts.push(<span key={`${keyPrefix}-empty`}>{source}</span>)
    }
    return parts
}

type ParsedBlock =
    | { kind: 'spacer' }
    | { kind: 'code'; language: string; lines: string[] }
    | { kind: 'hr' }
    | { kind: 'table'; headers: string[]; rows: string[][] }
    | { kind: 'heading'; level: 1 | 2 | 3; text: string }
    | { kind: 'unordered'; items: Array<{ text: string; indent: number; checked?: boolean }> }
    | { kind: 'ordered'; items: string[] }
    | { kind: 'quote'; lines: string[] }
    | { kind: 'paragraph'; lines: string[] }

function parseMessageBlocks(text: string): ParsedBlock[] {
    const lines = String(text ?? '').split('\n')
    const blocks: ParsedBlock[] = []
    let i = 0

    const isHeading = (line: string) => /^#{1,3}\s+/.test(line)
    const isUnordered = (line: string) => /^\s*[-*]\s+/.test(line)
    const isOrdered = (line: string) => /^\s*\d+\.\s+/.test(line)
    const isQuote = (line: string) => /^\s*>\s+/.test(line)
    const isFence = (line: string) => /^```/.test(line.trim())
    const isHr = (line: string) => /^([-*_]\s*){3,}$/.test(line.trim())
    const isTableLine = (line: string) => {
        const trimmed = line.trim()
        return trimmed.includes('|') && !/^```/.test(trimmed)
    }
    const parseTableCells = (line: string) =>
        line
            .trim()
            .replace(/^\|/, '')
            .replace(/\|$/, '')
            .split('|')
            .map((cell) => cell.trim())
    const isTableSeparator = (line: string) =>
        parseTableCells(line).every((cell) => /^:?-{3,}:?$/.test(cell))

    while (i < lines.length) {
        const rawLine = lines[i]
        const line = rawLine.trimEnd()
        const trimmed = line.trim()

        if (!trimmed) {
            blocks.push({ kind: 'spacer' })
            i += 1
            continue
        }

        if (isFence(trimmed)) {
            const language = trimmed.replace(/^```/, '').trim() || 'text'
            const codeLines: string[] = []
            let cursor = i + 1
            while (cursor < lines.length && !isFence(lines[cursor])) {
                codeLines.push(lines[cursor])
                cursor += 1
            }
            blocks.push({ kind: 'code', language, lines: codeLines })
            i = cursor < lines.length ? cursor + 1 : cursor
            continue
        }

        if (isHr(trimmed)) {
            blocks.push({ kind: 'hr' })
            i += 1
            continue
        }

        if (
            i + 1 < lines.length &&
            isTableLine(lines[i]) &&
            isTableLine(lines[i + 1]) &&
            isTableSeparator(lines[i + 1])
        ) {
            const headerCells = parseTableCells(lines[i])
            const bodyRows: string[][] = []
            let cursor = i + 2
            while (cursor < lines.length && isTableLine(lines[cursor])) {
                bodyRows.push(parseTableCells(lines[cursor]))
                cursor += 1
            }
            blocks.push({ kind: 'table', headers: headerCells, rows: bodyRows })
            i = cursor
            continue
        }

        const headingMatch = trimmed.match(/^(#{1,3})\s+(.*)$/)
        if (headingMatch) {
            blocks.push({
                kind: 'heading',
                level: headingMatch[1].length as 1 | 2 | 3,
                text: headingMatch[2],
            })
            i += 1
            continue
        }

        if (isUnordered(trimmed)) {
            const items: Array<{ text: string; indent: number; checked?: boolean }> = []
            let cursor = i
            while (cursor < lines.length && isUnordered(lines[cursor])) {
                const raw = lines[cursor]
                const indent = Math.max(0, Math.floor((raw.match(/^\s*/)?.[0]?.length ?? 0) / 2))
                const checklistMatch = raw.match(/^\s*[-*]\s+\[(x|X| )\]\s+(.*)$/)
                if (checklistMatch) {
                    items.push({
                        indent,
                        checked: checklistMatch[1].toLowerCase() === 'x',
                        text: checklistMatch[2],
                    })
                } else {
                    items.push({
                        indent,
                        text: raw.replace(/^\s*[-*]\s+/, ''),
                    })
                }
                cursor += 1
            }
            blocks.push({ kind: 'unordered', items })
            i = cursor
            continue
        }

        if (isOrdered(trimmed)) {
            const items: string[] = []
            let cursor = i
            while (cursor < lines.length && isOrdered(lines[cursor])) {
                items.push(lines[cursor].replace(/^\s*\d+\.\s+/, ''))
                cursor += 1
            }
            blocks.push({ kind: 'ordered', items })
            i = cursor
            continue
        }

        if (isQuote(trimmed)) {
            const quoteLines: string[] = []
            let cursor = i
            while (cursor < lines.length && isQuote(lines[cursor])) {
                quoteLines.push(lines[cursor].replace(/^\s*>\s+/, ''))
                cursor += 1
            }
            blocks.push({ kind: 'quote', lines: quoteLines })
            i = cursor
            continue
        }

        const paragraphLines: string[] = [line]
        let cursor = i + 1
        while (cursor < lines.length) {
            const next = lines[cursor]
            const nextTrimmed = next.trim()
            if (
                !nextTrimmed ||
                isHeading(nextTrimmed) ||
                isUnordered(next) ||
                isOrdered(next) ||
                isQuote(next) ||
                isFence(nextTrimmed) ||
                isHr(nextTrimmed)
            ) {
                break
            }
            paragraphLines.push(next)
            cursor += 1
        }

        blocks.push({ kind: 'paragraph', lines: paragraphLines })
        i = cursor
    }

    return blocks
}

function renderMessageBlock(block: ParsedBlock, blockIndex: number): ReactNode {
    if (block.kind === 'spacer') {
        return <div key={`spacer-${blockIndex}`} className="h-1" />
    }

    if (block.kind === 'code') {
        return (
            <div key={`code-${blockIndex}`} className="rounded border border-neutral-700 bg-neutral-950/80 overflow-hidden">
                <div className="border-b border-neutral-800 px-2 py-1 text-xs text-neutral-400">
                    {block.language}
                </div>
                <pre className="px-2 py-2 text-xs text-neutral-200 whitespace-pre-wrap break-words leading-5">
                    <code>{block.lines.join('\n')}</code>
                </pre>
            </div>
        )
    }

    if (block.kind === 'hr') {
        return <hr key={`hr-${blockIndex}`} className="border-neutral-700" />
    }

    if (block.kind === 'table') {
        return (
            <div key={`table-${blockIndex}`} className="overflow-x-auto rounded border border-neutral-700">
                <table className="min-w-full border-collapse text-xs">
                    <thead className="bg-neutral-800/80">
                        <tr>
                            {block.headers.map((cell, cellIndex) => (
                                <th key={`th-${blockIndex}-${cellIndex}`} className="border-b border-neutral-700 px-2 py-1 text-left text-neutral-100">
                                    {renderInlineMarkdown(cell, `th-${blockIndex}-${cellIndex}`)}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {block.rows.map((row, rowIndex) => (
                            <tr key={`tr-${blockIndex}-${rowIndex}`} className="odd:bg-neutral-900/60 even:bg-neutral-900/30">
                                {block.headers.map((_, cellIndex) => (
                                    <td key={`td-${blockIndex}-${rowIndex}-${cellIndex}`} className="border-t border-neutral-800 px-2 py-1 text-neutral-200">
                                        {renderInlineMarkdown(row[cellIndex] ?? '', `td-${blockIndex}-${rowIndex}-${cellIndex}`)}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )
    }

    if (block.kind === 'heading') {
        const headingClass =
            block.level === 1
                ? 'text-base font-semibold'
                : block.level === 2
                    ? 'text-sm font-semibold'
                    : 'text-xs font-semibold'
        return (
            <div key={`heading-${blockIndex}`} className={headingClass}>
                {renderInlineMarkdown(block.text, `heading-${blockIndex}`)}
            </div>
        )
    }

    if (block.kind === 'unordered') {
        return (
            <ul key={`ul-${blockIndex}`} className="list-disc pl-5 space-y-1">
                {block.items.map((item, itemIndex) => (
                    <li key={`ul-${blockIndex}-${itemIndex}`} style={{ marginLeft: `${item.indent * 12}px` }}>
                        {item.checked !== undefined ? (
                            <span className="inline-flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={item.checked}
                                    readOnly
                                    className="h-3.5 w-3.5 rounded border border-neutral-600 bg-neutral-800"
                                />
                                <span>{renderInlineMarkdown(item.text, `ul-${blockIndex}-${itemIndex}`)}</span>
                            </span>
                        ) : (
                            renderInlineMarkdown(item.text, `ul-${blockIndex}-${itemIndex}`)
                        )}
                    </li>
                ))}
            </ul>
        )
    }

    if (block.kind === 'ordered') {
        return (
            <ol key={`ol-${blockIndex}`} className="list-decimal pl-5 space-y-1">
                {block.items.map((item, itemIndex) => (
                    <li key={`ol-${blockIndex}-${itemIndex}`}>
                        {renderInlineMarkdown(item, `ol-${blockIndex}-${itemIndex}`)}
                    </li>
                ))}
            </ol>
        )
    }

    if (block.kind === 'quote') {
        return (
            <blockquote key={`quote-${blockIndex}`} className="border-l-2 border-neutral-500 pl-3 text-neutral-300 space-y-1">
                {block.lines.map((quoteLine, lineIndex) => (
                    <div key={`quote-${blockIndex}-${lineIndex}`}>
                        {renderInlineMarkdown(quoteLine, `quote-${blockIndex}-${lineIndex}`)}
                    </div>
                ))}
            </blockquote>
        )
    }

    return (
        <p key={`p-${blockIndex}`} className="whitespace-pre-wrap">
            {block.lines.map((paragraphLine, lineIndex) => (
                <Fragment key={`p-${blockIndex}-${lineIndex}`}>
                    {renderInlineMarkdown(paragraphLine, `p-${blockIndex}-${lineIndex}`)}
                    {lineIndex < block.lines.length - 1 ? <br /> : null}
                </Fragment>
            ))}
        </p>
    )
}

export function renderMessageText(text: string) {
    const blocks = parseMessageBlocks(text)
    return <div className="space-y-2">{blocks.map((block, index) => renderMessageBlock(block, index))}</div>
}
