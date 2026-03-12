import type {
    AiCommandEnvelope,
    AppendTextCommand,
    ApplyThemeCommand,
    CreateChapterCommand,
    DeleteChapterCommand,
    ExportProjectCommand,
    FindReplaceCommand,
    InsertIllustrationCommand,
    InsertTableCommand,
    MoveChapterCommand,
    RenameChapterCommand,
    RestoreSnapshotCommand,
    RewriteSelectionCommand,
    SaveProjectCommand,
    SetChapterTypeCommand,
    SetCoverAssetCommand,
    SetPageBackgroundCommand,
    SetTypographyCommand,
    UpdateBookInfoCommand,
} from '../../../shared/aiCommandSchema'
import { validateAiCommandEnvelope } from '../../../shared/aiCommandSchema'
import { useChapterStore } from '../chapters/useChapterStore'
import { useEditorStore } from '../chapters/useEditorStore'
import type { Chapter, BookMetadata, ExportFormat, LayoutSection } from '../../types/project'
import type { JSONContent } from '@tiptap/core'
import { nanoid } from 'nanoid'
import { buildProjectMatchesFromContent, replaceAllOccurrencesInContent, replaceNthOccurrenceInContent } from '../chapters/findReplaceCore'
import { saveProjectPayload } from '../../utils/projectSave'
import { clearDraftFromLocal, serializeCurrentProject } from '../../utils/projectSnapshot'
import { useDesignStore, useProjectStore } from '../../store'
import i18n from '../../i18n'
import { exportProjectPayload } from '../../utils/projectExport'
import { restoreSnapshotToWorkspace } from '../../utils/projectRestore'
import { listHistorySnapshots } from '../../utils/historyManager'
import {
    appendToCurrentPage,
    createPageAfter,
    movePage,
    readCurrentBlock,
    readCurrentPage,
    replacePageTitleField,
    replaceCurrentPageContent,
    replaceSelectionInCurrentPage,
    setPageType,
} from './editorToolAdapter'

export interface ApplyCopilotEnvelopeResult {
    appliedCommands: number
    warnings: string[]
}

const DELETE_RATIO_WARN = 0.4
const DELETE_RATIO_BLOCK = 0.7

function validateDocRange(
    from: number,
    to: number,
    docSize: number,
): { from: number; to: number } {
    const maxPos = Math.max(1, Math.floor(docSize))
    const normalizedFrom = Math.floor(from)
    const normalizedTo = Math.floor(to)

    if (!Number.isFinite(normalizedFrom) || !Number.isFinite(normalizedTo)) {
        throw new Error('rewrite_selection 명령의 적용 범위가 숫자가 아닙니다.')
    }
    if (normalizedFrom < 1 || normalizedTo < 1) {
        throw new Error('rewrite_selection 명령의 적용 범위는 1 이상이어야 합니다.')
    }
    if (normalizedFrom >= normalizedTo) {
        throw new Error('rewrite_selection 명령의 적용 범위가 유효하지 않습니다.')
    }
    if (normalizedFrom > maxPos || normalizedTo > maxPos) {
        throw new Error('rewrite_selection 명령의 적용 범위가 현재 문서 좌표를 벗어났습니다.')
    }

    return { from: normalizedFrom, to: normalizedTo }
}

function applyRewriteSelectionCommand(
    command: RewriteSelectionCommand,
): string | null {
    const editor = useEditorStore.getState().editor
    const activeChapterId = useChapterStore.getState().activeChapterId
    if (!editor) throw new Error('편집기가 준비되지 않았습니다.')
    if (!activeChapterId) throw new Error('활성 챕터가 없습니다.')
    if (activeChapterId !== command.target.chapterId) {
        throw new Error('현재 활성 챕터와 명령 대상 챕터가 다릅니다.')
    }

    const textState = editor.state
    const text = String(command.payload.text ?? '')
    if (!text.trim()) {
        throw new Error('rewrite_selection 명령의 payload.text가 비어 있습니다.')
    }

    const pageSnapshot = readCurrentPage()
    const docSize = pageSnapshot?.docSize ?? textState.doc.content.size
    const range = validateDocRange(
        command.target.range.from,
        command.target.range.to,
        docSize,
    )
    const originalText = textState.doc.textBetween(range.from, range.to, '\n', '\n')
    const originalChars = originalText.length
    const removedChars = Math.max(0, originalChars - text.length)
    const deleteRatio = removedChars / Math.max(1, originalChars)
    if (deleteRatio > DELETE_RATIO_BLOCK) {
        throw new Error(
            `rewrite_selection 명령이 과도한 삭제로 차단되었습니다 (${Math.round(deleteRatio * 100)}%).`,
        )
    }

    const executed = replaceSelectionInCurrentPage({
        chapterId: command.target.chapterId,
        from: range.from,
        to: range.to,
        text,
    })

    if (!executed) {
        throw new Error('rewrite_selection 명령 적용에 실패했습니다.')
    }

    if (deleteRatio > DELETE_RATIO_WARN) {
        return `rewrite_selection 삭제 비율 경고: ${Math.round(deleteRatio * 100)}%`
    }
    return null
}

function applyAppendTextCommand(command: AppendTextCommand): string | null {
    const chapterState = useChapterStore.getState()
    const editor = useEditorStore.getState().editor
    const activeChapterId = chapterState.activeChapterId
    const text = String(command.payload.text ?? '').trim()
    if (!text) {
        throw new Error('append_text 명령의 payload.text가 비어 있습니다.')
    }

    const targetChapter = chapterState.chapters.find((chapter) => chapter.id === command.target.chapterId)
    if (!targetChapter) {
        throw new Error('append_text 명령의 대상 챕터를 찾을 수 없습니다.')
    }

    if (editor && activeChapterId === command.target.chapterId) {
        const currentPage = readCurrentPage()
        const currentBlock = readCurrentBlock()
        if ((command.target.position ?? 'end') === 'end' && currentPage?.isEmpty) {
            const replaced = replaceCurrentPageContent({
                chapterId: command.target.chapterId,
                text,
            })
            if (!replaced) throw new Error('append_text 명령 적용에 실패했습니다.')
            return null
        }
        if (
            (command.target.position ?? 'end') === 'end' &&
            currentPage &&
            currentPage.blocks.length > 0 &&
            currentPage.blocks.every((block) => block.type === 'heading')
        ) {
            const inserted = appendToCurrentPage({
                chapterId: command.target.chapterId,
                text,
                position: 'after_first_heading',
            })
            if (!inserted) throw new Error('append_text 명령 적용에 실패했습니다.')
            return null
        }
        if (
            (command.target.position ?? 'end') === 'end' &&
            currentBlock?.type === 'paragraph' &&
            !currentPage?.isEmpty
        ) {
            const inserted = appendToCurrentPage({
                chapterId: command.target.chapterId,
                text,
                position: 'current_block_after',
            })
            if (!inserted) throw new Error('append_text 명령 적용에 실패했습니다.')
            return null
        }
        const executed = appendToCurrentPage({
            chapterId: command.target.chapterId,
            text,
            position: command.target.position ?? 'end',
        })
        if (!executed) throw new Error('append_text 명령 적용에 실패했습니다.')
        return null
    }

    appendTextParagraphToChapter(command.target.chapterId, text)
    if (command.target.position && command.target.position !== 'end') {
        return 'append_text 명령이 정밀 위치 대신 대상 챕터 끝에 추가되었습니다.'
    }
    return null
}

function createChapterContentFromBlocks(blocks: unknown[]): JSONContent {
    const content: JSONContent[] = []
    for (const block of blocks) {
        if (!block || typeof block !== 'object') continue
        const record = block as Record<string, unknown>
        const type = String(record.type ?? '').trim().toLowerCase()
        const text = String(record.text ?? record.content ?? '').trim()
        if (!text) continue
        if (type === 'heading' || type === 'title') {
            content.push({
                type: 'heading',
                attrs: { level: 1 },
                content: [{ type: 'text', text }],
            })
            continue
        }
        content.push({
            type: 'paragraph',
            content: [{ type: 'text', text }],
        })
    }
    if (content.length === 0) {
        content.push({ type: 'paragraph' })
    }
    return { type: 'doc', content }
}

function applyCreateChapterCommand(
    command: CreateChapterCommand,
    createdChapterRefs: Map<string, string>,
): string {
    const chapterState = useChapterStore.getState()
    const title = String(command.payload.title ?? '').trim() || '새 페이지'
    const payloadType = String(command.payload.chapterType ?? '').trim()
    const payloadKind = String(command.payload.chapterKind ?? '').trim()
    const chapterType =
        payloadType === 'front' ||
        payloadType === 'part' ||
        payloadType === 'chapter' ||
        payloadType === 'divider' ||
        payloadType === 'back' ||
        payloadType === 'uncategorized'
            ? payloadType
            : 'chapter'
    const id = nanoid()
    const newChapter: Chapter = {
        id,
        title,
        content: createChapterContentFromBlocks(command.payload.blocks),
        order: chapterState.chapters.length,
        fileName: `chapter-${id}.xhtml`,
        chapterType,
        chapterKind: payloadKind || chapterType,
        parentId:
            command.target.parentChapterId ??
            (command.target.parentCommandRef
                ? createdChapterRefs.get(command.target.parentCommandRef) ?? null
                : null),
    }

    createPageAfter({
        afterChapterId:
            command.target.afterChapterId ??
            (command.target.afterCommandRef
                ? createdChapterRefs.get(command.target.afterCommandRef) ?? null
                : null),
        chapter: newChapter,
    })
    if (command.target.commandRef) {
        createdChapterRefs.set(command.target.commandRef, id)
    }
    if (!command.target.commandRef) {
        createdChapterRefs.set(title, id)
    }
    return id
}

function makeTableLines(command: InsertTableCommand): string[] {
    const headers = command.payload.headers.length > 0 ? command.payload.headers : ['항목', '값']
    const headerLine = `| ${headers.join(' | ')} |`
    const separatorLine = `| ${headers.map(() => '---').join(' | ')} |`
    const rows = command.payload.rows.length > 0 ? command.payload.rows : [['', '']]
    const rowLines = rows.map((row) => `| ${row.map((cell) => String(cell ?? '')).join(' | ')} |`)
    return [headerLine, separatorLine, ...rowLines]
}

function appendTextParagraphToChapter(chapterId: string, text: string) {
    const chapterState = useChapterStore.getState()
    const chapter = chapterState.chapters.find((item) => item.id === chapterId)
    if (!chapter) throw new Error('명령 대상 챕터를 찾을 수 없습니다.')
    const current = Array.isArray(chapter.content?.content) ? chapter.content.content : []
    const nextContent: JSONContent[] = [
        ...current,
        {
            type: 'paragraph',
            content: [{ type: 'text', text }],
        },
    ]
    chapterState.updateContent(chapterId, { type: 'doc', content: nextContent })
}

function applyContentToChapter(chapterId: string, content: JSONContent) {
    const chapterState = useChapterStore.getState()
    const editor = useEditorStore.getState().editor
    const activeChapterId = chapterState.activeChapterId
    if (editor && activeChapterId === chapterId) {
        editor.commands.setContent(content, { emitUpdate: false })
    }
    chapterState.updateContent(chapterId, content)
}

function applyFindReplaceCommand(command: FindReplaceCommand): string | null {
    const chapterState = useChapterStore.getState()
    const query = String(command.payload.find ?? '').trim()
    const replace = String(command.payload.replace ?? '')
    if (!query) {
        throw new Error('find_replace 명령의 payload.find가 비어 있습니다.')
    }

    const scope = command.target.scope
    const targetChapterId = command.target.chapterId ?? chapterState.activeChapterId ?? undefined
    if (scope === 'chapter') {
        if (!targetChapterId) throw new Error('find_replace 명령에 chapterId가 필요합니다.')
        const chapter = chapterState.chapters.find((item) => item.id === targetChapterId)
        if (!chapter) throw new Error('find_replace 명령의 대상 챕터를 찾을 수 없습니다.')
        const sourceContent = chapter.content
        if (command.payload.mode === 'all') {
            const replaced = replaceAllOccurrencesInContent(sourceContent, query, replace, command.payload.matchCase === true)
            if (replaced.count <= 0) {
                return 'find_replace 명령의 일치 항목이 없어 변경되지 않았습니다.'
            }
            applyContentToChapter(chapter.id, replaced.content)
            return `find_replace ${replaced.count}건을 적용했습니다.`
        }
        const matches = buildProjectMatchesFromContent(chapter.id, sourceContent, query, command.payload.matchCase === true)
        if (matches.length === 0) {
            return 'find_replace 명령의 일치 항목이 없어 변경되지 않았습니다.'
        }
        const replaced = replaceNthOccurrenceInContent(sourceContent, query, replace, 0, command.payload.matchCase === true)
        if (!replaced.replaced) {
            return 'find_replace 명령의 일치 항목이 없어 변경되지 않았습니다.'
        }
        applyContentToChapter(chapter.id, replaced.content)
        return null
    }

    const sortedChapters = [...chapterState.chapters].sort((a, b) => a.order - b.order)
    if (command.payload.mode === 'all') {
        let totalCount = 0
        for (const chapter of sortedChapters) {
            const replaced = replaceAllOccurrencesInContent(chapter.content, query, replace, command.payload.matchCase === true)
            if (replaced.count <= 0) continue
            totalCount += replaced.count
            applyContentToChapter(chapter.id, replaced.content)
        }
        if (totalCount <= 0) {
            return 'find_replace 명령의 일치 항목이 없어 변경되지 않았습니다.'
        }
        return `find_replace ${totalCount}건을 프로젝트 범위에 적용했습니다.`
    }

    for (const chapter of sortedChapters) {
        const matches = buildProjectMatchesFromContent(chapter.id, chapter.content, query, command.payload.matchCase === true)
        if (matches.length === 0) continue
        const replaced = replaceNthOccurrenceInContent(chapter.content, query, replace, 0, command.payload.matchCase === true)
        if (!replaced.replaced) continue
        applyContentToChapter(chapter.id, replaced.content)
        return `find_replace 1건을 ${chapter.title || '대상 챕터'}에 적용했습니다.`
    }

    return 'find_replace 명령의 일치 항목이 없어 변경되지 않았습니다.'
}

async function applySaveProjectCommand(command: SaveProjectCommand): Promise<string | null> {
    const projectStore = useProjectStore.getState()
    const payload = serializeCurrentProject()
    const result = await saveProjectPayload({
        payload,
        projectPath: projectStore.projectPath,
        t: i18n.t.bind(i18n),
        forceChoosePath: command.target.mode === 'save_as',
    })
    if (result.cancelled || !result.savePath) {
        return 'save_project 명령이 취소되어 저장하지 않았습니다.'
    }
    projectStore.setProjectPath(result.savePath)
    projectStore.setDirty(false)
    clearDraftFromLocal()
    return `프로젝트를 저장했습니다: ${result.savePath}`
}

function requireChapter(commandName: string, chapterId: string): Chapter {
    const chapter = useChapterStore.getState().chapters.find((item) => item.id === chapterId)
    if (!chapter) {
        throw new Error(`${commandName} 명령의 대상 챕터를 찾을 수 없습니다.`)
    }
    return chapter
}

function applyRenameChapterCommand(command: RenameChapterCommand): null {
    const title = String(command.payload.title ?? '').trim()
    if (!title) throw new Error('rename_chapter 명령의 payload.title이 비어 있습니다.')
    requireChapter('rename_chapter', command.target.chapterId)
    const renamed = replacePageTitleField({
        chapterId: command.target.chapterId,
        title,
    })
    if (!renamed) {
        throw new Error('rename_chapter 명령 적용에 실패했습니다.')
    }
    return null
}

function applyDeleteChapterCommand(command: DeleteChapterCommand): string | null {
    const chapterState = useChapterStore.getState()
    requireChapter('delete_chapter', command.target.chapterId)
    if (chapterState.chapters.length <= 1) {
        throw new Error('마지막 챕터는 삭제할 수 없습니다.')
    }
    chapterState.deleteChapter(command.target.chapterId)
    return command.payload.reason ? `delete_chapter 사유: ${command.payload.reason}` : null
}

function applyMoveChapterCommand(command: MoveChapterCommand): null {
    requireChapter('move_chapter', command.target.chapterId)
    const moved = movePage({
        chapterId: command.target.chapterId,
        toIndex: Math.max(0, Math.floor(command.payload.toIndex)),
        parentId: command.payload.parentId ?? null,
    })
    if (!moved) {
        throw new Error('move_chapter 명령 적용에 실패했습니다.')
    }
    return null
}

function applySetChapterTypeCommand(command: SetChapterTypeCommand): null {
    requireChapter('set_chapter_type', command.target.chapterId)
    const applied = setPageType({
        chapterId: command.target.chapterId,
        chapterType: command.payload.chapterType,
        chapterKind: command.payload.chapterKind,
    })
    if (!applied) {
        throw new Error('set_chapter_type 명령 적용에 실패했습니다.')
    }
    return null
}

function applySetTypographyCommand(command: SetTypographyCommand): string | null {
    const designStore = useDesignStore.getState()
    const chapterState = useChapterStore.getState()
    const payload = command.payload

    if (command.target.section === 'active_chapter') {
        const activeChapterId = chapterState.activeChapterId
        if (!activeChapterId) throw new Error('활성 챕터가 없습니다.')
        const patch: Partial<Chapter> = {}
        const unsupportedFields: string[] = []
        if (payload.fontFamily) {
            if (payload.slot === 'body') patch.fontFamily = payload.fontFamily
            else if (payload.slot === 'h1') patch.titleFontFamily = payload.fontFamily
            else patch.subheadFontFamily = payload.fontFamily
        }
        if (payload.fontScale !== undefined) {
            const baseSize = 16
            const nextSize = Math.max(8, Math.round(baseSize * payload.fontScale))
            if (payload.slot === 'body') patch.bodyFontSize = nextSize
            else if (payload.slot === 'h1') patch.titleFontSize = nextSize
            else patch.subheadFontSize = nextSize
        }
        if (payload.textIndent !== undefined) unsupportedFields.push('textIndent')
        if (payload.lineHeight !== undefined) unsupportedFields.push('lineHeight')
        if (payload.letterSpacing !== undefined) unsupportedFields.push('letterSpacing')
        chapterState.setChapterStyle(activeChapterId, patch)
        return unsupportedFields.length > 0
            ? `set_typography(active_chapter)에서 ${unsupportedFields.join(', ')}는 현재 지원되지 않아 무시되었습니다.`
            : null
    }

    const section = command.target.section as LayoutSection
    const sectionPatch: Record<string, unknown> = {}
    if (payload.fontFamily) {
        sectionPatch[`${payload.slot}FontFamily`] = payload.fontFamily
        if (payload.slot === 'body') {
            designStore.updateSetting('fontFamily', payload.fontFamily)
        }
    }
    if (payload.fontScale !== undefined) {
        const baseSize = payload.slot === 'body' ? designStore.settings.fontSize : designStore.settings.sectionTypography[section][`${payload.slot}FontSize` as keyof typeof designStore.settings.sectionTypography[typeof section]] as number
        const nextSize = Math.max(8, Math.round(Number(baseSize || 16) * payload.fontScale))
        if (payload.slot === 'body') {
            designStore.updateSetting('fontSize', nextSize)
        } else {
            sectionPatch[`${payload.slot}FontSize`] = nextSize
        }
    }
    if (Object.keys(sectionPatch).length > 0) {
        designStore.updateSectionTypography(section, sectionPatch)
    }
    if (payload.lineHeight !== undefined) {
        designStore.updateSetting('lineHeight', payload.lineHeight)
    }
    if (payload.letterSpacing !== undefined) {
        designStore.updateSetting('letterSpacing', payload.letterSpacing)
    }
    if (payload.textIndent !== undefined) {
        designStore.updateSetting('textIndent', payload.textIndent)
    }
    return null
}

function applySetPageBackgroundCommand(command: SetPageBackgroundCommand): null {
    requireChapter('set_page_background', command.target.chapterId)
    useChapterStore.getState().setChapterPageBackground(command.target.chapterId, command.payload.color)
    return null
}

function applyApplyThemeCommand(command: ApplyThemeCommand): null {
    useDesignStore.getState().applyTheme(command.payload.theme)
    return null
}

function normalizeAuthorsForMetadata(authors: UpdateBookInfoCommand['payload']['authors']): BookMetadata['authors'] | undefined {
    if (!authors || authors.length === 0) return undefined
    return authors.map((author) => ({
        id: nanoid(),
        name: author.name,
        role: (author.role as BookMetadata['authors'][number]['role']) || 'author',
    }))
}

function applyUpdateBookInfoCommand(command: UpdateBookInfoCommand): null {
    const projectStore = useProjectStore.getState()
    const patch: Partial<BookMetadata> = {}
    if (command.payload.title !== undefined) patch.title = command.payload.title
    if (command.payload.subtitle !== undefined) patch.subtitle = command.payload.subtitle
    if (command.payload.language !== undefined) patch.language = command.payload.language
    if (command.payload.publisher !== undefined) patch.publisher = command.payload.publisher
    if (command.payload.link !== undefined) patch.link = command.payload.link
    if (command.payload.description !== undefined) patch.description = command.payload.description
    const authors = normalizeAuthorsForMetadata(command.payload.authors)
    if (authors) patch.authors = authors
    projectStore.updateMetadata(patch)
    return null
}

function inferMimeTypeFromValue(value: string): string {
    const lowered = value.toLowerCase()
    if (lowered.endsWith('.png')) return 'image/png'
    if (lowered.endsWith('.webp')) return 'image/webp'
    return 'image/jpeg'
}

async function resolveAssetValue(command: SetCoverAssetCommand): Promise<string> {
    const value = String(command.payload.value ?? '').trim()
    if (!value) throw new Error('set_cover_asset 명령의 payload.value가 비어 있습니다.')
    if (value.startsWith('data:')) return value
    if (command.payload.source === 'local_path') {
        const binary = await window.electronAPI.readFileBinary(value)
        const bytes = new Uint8Array(binary)
        let binaryString = ''
        for (const byte of bytes) binaryString += String.fromCharCode(byte)
        const base64 = btoa(binaryString)
        return `data:${inferMimeTypeFromValue(value)};base64,${base64}`
    }
    return value
}

async function applySetCoverAssetCommand(command: SetCoverAssetCommand): Promise<string | null> {
    const projectStore = useProjectStore.getState()
    const resolved = await resolveAssetValue(command)
    if (command.target.assetType === 'cover') {
        projectStore.setCoverImage(resolved)
    } else if (command.target.assetType === 'back_cover') {
        projectStore.setBackCoverImage(resolved)
    } else {
        projectStore.setPublisherLogo(resolved)
    }
    if (!resolved.startsWith('data:')) {
        return 'set_cover_asset 명령이 data URL이 아닌 자산 값을 저장했습니다.'
    }
    return null
}

async function applyExportProjectCommand(command: ExportProjectCommand): Promise<string | null> {
    const result = await exportProjectPayload(useProjectStore.getState().metadata, {
        format: command.target.format === 'docx' ? 'docx' : 'epub3' as ExportFormat,
        embedFonts: command.payload.embedFonts === true,
    })
    if (result.cancelled || !result.savePath) {
        return 'export_project 명령이 취소되어 내보내지 않았습니다.'
    }
    if (result.warnings.length > 0) {
        return `내보내기 경고 ${result.warnings.length}건: ${result.warnings[0]}`
    }
    return `프로젝트를 내보냈습니다: ${result.savePath}`
}

async function resolveSnapshotId(snapshotId: string): Promise<string> {
    const projectPath = useProjectStore.getState().projectPath
    if (!projectPath) throw new Error('저장된 프로젝트에서만 스냅샷 복원을 실행할 수 있습니다.')
    if (snapshotId !== 'latest') return snapshotId
    const snapshots = await listHistorySnapshots(projectPath)
    const latest = snapshots[0]
    if (!latest) throw new Error('복원 가능한 스냅샷이 없습니다.')
    return latest.id
}

async function applyRestoreSnapshotCommand(command: RestoreSnapshotCommand): Promise<string | null> {
    const projectPath = useProjectStore.getState().projectPath
    if (!projectPath) {
        throw new Error('저장된 프로젝트에서만 restore_snapshot 명령을 사용할 수 있습니다.')
    }
    const snapshotId = await resolveSnapshotId(command.target.snapshotId)
    const result = await restoreSnapshotToWorkspace(
        projectPath,
        snapshotId,
        command.payload.mode === 'new_file' ? 'new_file' : 'replace',
    )
    if (result.cancelled) {
        return 'restore_snapshot 명령이 취소되었습니다.'
    }
    return result.restoredPath ? `스냅샷을 복원했습니다: ${result.restoredPath}` : null
}

function applyInsertTableCommand(command: InsertTableCommand): null {
    const editor = useEditorStore.getState().editor
    const activeChapterId = useChapterStore.getState().activeChapterId
    const tableLines = makeTableLines(command)
    const tableText = tableLines.join('\n')
    if (editor && activeChapterId === command.target.chapterId) {
        const position = Math.max(1, Math.floor(command.target.position || editor.state.selection.to))
        const executed = editor
            .chain()
            .focus()
            .insertContentAt(position, `${tableText}\n`)
            .run()
        if (!executed) throw new Error('insert_table 명령 적용에 실패했습니다.')
        return null
    }
    appendTextParagraphToChapter(command.target.chapterId, tableText)
    return null
}

function applyInsertIllustrationCommand(command: InsertIllustrationCommand): null {
    const editor = useEditorStore.getState().editor
    const activeChapterId = useChapterStore.getState().activeChapterId
    const alt = String(command.payload.alt ?? '').trim() || '삽화'
    const source = String(command.payload.imageSource ?? '').trim()
    const caption = String(command.payload.caption ?? '').trim()

    if (editor && activeChapterId === command.target.chapterId) {
        const chain = editor.chain().focus()
        if (source) {
            chain.insertContent({
                type: 'image',
                attrs: {
                    src: source,
                    alt,
                    caption: caption || null,
                    captionVisible: Boolean(caption),
                    title: caption || null,
                },
            })
        } else {
            chain.insertContent(`${alt}\n`)
        }
        const executed = chain.run()
        if (!executed) throw new Error('insert_illustration 명령 적용에 실패했습니다.')
        return null
    }

    const summary = source
        ? `[이미지] ${alt}${caption ? ` - ${caption}` : ''}\n${source}`
        : `[이미지] ${alt}${caption ? ` - ${caption}` : ''}`
    appendTextParagraphToChapter(command.target.chapterId, summary)
    return null
}

type SupportedCopilotCommand = AiCommandEnvelope['commands'][number]

interface DispatchResult {
    applied: boolean
    warning?: string
}

type IrreversibleWorkflowCommandType = 'save_project' | 'export_project' | 'restore_snapshot'

function cloneJsonValue<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T
}

function isIrreversibleWorkflowCommand(
    command: SupportedCopilotCommand,
): command is Extract<SupportedCopilotCommand, { type: IrreversibleWorkflowCommandType }> {
    return (
        command.type === 'save_project' ||
        command.type === 'export_project' ||
        command.type === 'restore_snapshot'
    )
}

function validateEnvelopeTransactionSafety(commands: SupportedCopilotCommand[]) {
    const irreversibleCommands = commands.filter(isIrreversibleWorkflowCommand)
    if (irreversibleCommands.length === 0 || commands.length === 1) return
    throw new Error(
        `비가역 워크플로우 명령(${irreversibleCommands.map((command) => command.type).join(', ')})은 다른 명령과 함께 적용할 수 없습니다.`,
    )
}

const commandDispatchers = {
    rewrite_selection: (command: RewriteSelectionCommand): DispatchResult => {
        const warning = applyRewriteSelectionCommand(command)
        return warning ? { applied: true, warning } : { applied: true }
    },
    create_chapter: (): DispatchResult => {
        throw new Error('create_chapter는 dispatchCopilotCommand 경유로만 적용할 수 있습니다.')
    },
    insert_table: (command: InsertTableCommand): DispatchResult => {
        applyInsertTableCommand(command)
        return { applied: true }
    },
    insert_illustration: (command: InsertIllustrationCommand): DispatchResult => {
        applyInsertIllustrationCommand(command)
        return { applied: true }
    },
    append_text: (command: AppendTextCommand): DispatchResult => {
        const warning = applyAppendTextCommand(command)
        return warning ? { applied: true, warning } : { applied: true }
    },
    find_replace: (command: FindReplaceCommand): DispatchResult => {
        const warning = applyFindReplaceCommand(command)
        return warning ? { applied: true, warning } : { applied: true }
    },
    save_project: async (command: SaveProjectCommand): Promise<DispatchResult> => {
        const warning = await applySaveProjectCommand(command)
        return warning ? { applied: true, warning } : { applied: true }
    },
    rename_chapter: (command: RenameChapterCommand): DispatchResult => {
        applyRenameChapterCommand(command)
        return { applied: true }
    },
    delete_chapter: (command: DeleteChapterCommand): DispatchResult => {
        const warning = applyDeleteChapterCommand(command)
        return warning ? { applied: true, warning } : { applied: true }
    },
    move_chapter: (command: MoveChapterCommand): DispatchResult => {
        applyMoveChapterCommand(command)
        return { applied: true }
    },
    set_chapter_type: (command: SetChapterTypeCommand): DispatchResult => {
        applySetChapterTypeCommand(command)
        return { applied: true }
    },
    set_typography: (command: SetTypographyCommand): DispatchResult => {
        const warning = applySetTypographyCommand(command)
        return warning ? { applied: true, warning } : { applied: true }
    },
    set_page_background: (command: SetPageBackgroundCommand): DispatchResult => {
        applySetPageBackgroundCommand(command)
        return { applied: true }
    },
    apply_theme: (command: ApplyThemeCommand): DispatchResult => {
        applyApplyThemeCommand(command)
        return { applied: true }
    },
    update_book_info: (command: UpdateBookInfoCommand): DispatchResult => {
        applyUpdateBookInfoCommand(command)
        return { applied: true }
    },
    set_cover_asset: async (command: SetCoverAssetCommand): Promise<DispatchResult> => {
        const warning = await applySetCoverAssetCommand(command)
        return warning ? { applied: true, warning } : { applied: true }
    },
    export_project: async (command: ExportProjectCommand): Promise<DispatchResult> => {
        const warning = await applyExportProjectCommand(command)
        return warning ? { applied: true, warning } : { applied: true }
    },
    restore_snapshot: async (command: RestoreSnapshotCommand): Promise<DispatchResult> => {
        const warning = await applyRestoreSnapshotCommand(command)
        return warning ? { applied: true, warning } : { applied: true }
    },
    feedback_report: (): DispatchResult => ({
        applied: false,
        warning: 'feedback_report 명령은 문서를 직접 수정하지 않아 요약만 반영됩니다.',
    }),
} satisfies {
    [K in SupportedCopilotCommand['type']]: (
        command: Extract<SupportedCopilotCommand, { type: K }>,
    ) => DispatchResult | Promise<DispatchResult>
}

async function dispatchCopilotCommand(
    command: SupportedCopilotCommand,
    createdChapterRefs: Map<string, string>,
): Promise<DispatchResult> {
    if (command.type === 'create_chapter') {
        applyCreateChapterCommand(command, createdChapterRefs)
        return { applied: true }
    }
    const handler = commandDispatchers[command.type] as (
        input: SupportedCopilotCommand,
    ) => DispatchResult | Promise<DispatchResult>
    return await handler(command)
}

export async function applyCopilotEnvelope(
    envelope: AiCommandEnvelope,
): Promise<ApplyCopilotEnvelopeResult> {
    const validation = validateAiCommandEnvelope(envelope)
    if (!validation.ok || !validation.normalized) {
        throw new Error(`AI 명령 스키마 검증 실패: ${validation.errors.join('; ') || 'unknown error'}`)
    }
    if (validation.previewOnly) {
        throw new Error('AI 명령에 적용 필수 컨텍스트가 부족합니다. 다시 생성해주세요.')
    }

    const normalized = validation.normalized
    if (!normalized.commands || normalized.commands.length === 0) {
        throw new Error('적용할 명령이 없습니다.')
    }
    validateEnvelopeTransactionSafety(normalized.commands)

    const editor = useEditorStore.getState().editor

    const rollbackSnapshot = editor?.getJSON() ?? null
    const chapterState = useChapterStore.getState()
    const rollbackChapters = JSON.parse(JSON.stringify(chapterState.chapters)) as Chapter[]
    const rollbackActiveChapterId = chapterState.activeChapterId
    const projectState = useProjectStore.getState()
    const rollbackProjectPath = projectState.projectPath
    const rollbackProjectSessionId = projectState.projectSessionId
    const rollbackIsDirty = projectState.isDirty
    const rollbackMetadata = cloneJsonValue(projectState.metadata)
    const rollbackDesignSettings = cloneJsonValue(useDesignStore.getState().settings)
    let appliedCommands = 0
    const warnings: string[] = [...validation.warnings]
    const createdChapterRefs = new Map<string, string>()

    try {
        for (const command of normalized.commands) {
            const result = await dispatchCopilotCommand(command, createdChapterRefs)
            if (result.warning) warnings.push(result.warning)
            if (result.applied) appliedCommands += 1
        }
    } catch (error) {
        try {
            if (editor && rollbackSnapshot) {
                editor.commands.setContent(rollbackSnapshot, { emitUpdate: false })
            }
            chapterState.setChapters(rollbackChapters)
            if (rollbackActiveChapterId) {
                chapterState.setActiveChapter(rollbackActiveChapterId)
            }
            useProjectStore.setState((state) => ({
                ...state,
                projectPath: rollbackProjectPath,
                projectSessionId: rollbackProjectSessionId,
                isDirty: rollbackIsDirty,
                metadata: rollbackMetadata,
            }))
            useDesignStore.setState((state) => ({
                ...state,
                settings: rollbackDesignSettings,
            }))
        } catch (rollbackError) {
            console.warn('[Copilot] rollback failed after apply error:', rollbackError)
        }
        throw error
    }

    return {
        appliedCommands,
        warnings,
    }
}
