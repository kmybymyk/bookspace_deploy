import type { Editor, JSONContent } from '@tiptap/core'
import { useChapterStore } from '../chapters/useChapterStore'
import { useEditorStore } from '../chapters/useEditorStore'
import type { Chapter, ChapterType } from '../../types/project'

export interface EditorSelectionSnapshot {
    chapterId: string
    from: number
    to: number
    text: string
}

export interface EditorPageSnapshot {
    chapterId: string
    title: string
    chapterType: ChapterType
    chapterKind?: string
    text: string
    docSize: number
    blocks: PageBlockSnapshot[]
    structureSummary: string
    isEmpty: boolean
}

export interface EditorBlockSnapshot {
    chapterId: string
    from: number
    to: number
    type: string
    text: string
    depth: number
}

export interface PageStructureSnapshot {
    activeChapterId: string | null
    pages: Array<{
        id: string
        title: string
        order: number
        parentId: string | null
        chapterType: ChapterType
        chapterKind?: string
    }>
}

export interface PageValidationResult {
    ok: boolean
    warnings: string[]
}

export interface PageBlockSnapshot {
    index: number
    type: string
    textPreview: string
}

export interface HeadingTreeNode {
    text: string
    level: number
    chapterId: string
    index: number
}

function getActiveEditorState(): { editor: Editor; chapterId: string } | null {
    const editor = useEditorStore.getState().editor
    const chapterId = useChapterStore.getState().activeChapterId
    if (!editor || !chapterId) return null
    return { editor, chapterId }
}

function buildParagraphNodesFromText(text: string) {
    return String(text ?? '')
        .split(/\n{2,}/)
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => ({
            type: 'paragraph',
            content: [{ type: 'text', text: part }],
        }))
}

function walkContentNodes(
    node: JSONContent | undefined,
    visit: (node: JSONContent, depth: number) => void,
    depth = 0,
) {
    if (!node || typeof node !== 'object') return
    visit(node, depth)
    if (!Array.isArray(node.content)) return
    for (const child of node.content) {
        walkContentNodes(child as JSONContent, visit, depth + 1)
    }
}

function buildStoredPageSnapshot(chapter: Chapter): EditorPageSnapshot {
    const blocks: PageBlockSnapshot[] = []
    const textParts: string[] = []
    let headings = 0
    let paragraphs = 0

    walkContentNodes(chapter.content, (node, depth) => {
        const type = String(node.type ?? '').trim()
        if (!type || type === 'doc' || type === 'text') return

        const directText = String(node.text ?? '').trim()
        const inlineText = Array.isArray(node.content)
            ? node.content
                  .map((child) => String((child as JSONContent)?.text ?? '').trim())
                  .filter(Boolean)
                  .join(' ')
            : ''
        const textPreview = (directText || inlineText).replace(/\s+/g, ' ').slice(0, 80)

        if (type === 'heading') headings += 1
        if (type === 'paragraph') paragraphs += 1
        if (textPreview) textParts.push(textPreview)

        if (depth === 1) {
            blocks.push({
                index: blocks.length,
                type,
                textPreview,
            })
        }
    })

    const text = textParts.join('\n').trim()
    const wordCount = text.length > 0 ? text.split(/\s+/).filter(Boolean).length : 0
    const blockSummary = blocks
        .slice(0, 3)
        .map((block) => (block.textPreview ? `${block.type}:${block.textPreview}` : `${block.type}`))
        .join(' | ')
    const structureSummary = [
        chapter.title ? `title=${chapter.title}` : null,
        `headings=${headings}`,
        `paragraphs=${paragraphs}`,
        `words=${wordCount}`,
        blockSummary ? `blocks=${blockSummary}` : null,
    ]
        .filter(Boolean)
        .join(', ')

    return {
        chapterId: chapter.id,
        title: chapter.title,
        chapterType: chapter.chapterType,
        chapterKind: chapter.chapterKind,
        text,
        docSize: text.length,
        blocks,
        structureSummary,
        isEmpty: text.length === 0,
    }
}

function buildStoredHeadingTree(chapter: Chapter): HeadingTreeNode[] {
    const headings: HeadingTreeNode[] = []
    walkContentNodes(chapter.content, (node) => {
        if (String(node.type ?? '') !== 'heading') return
        const level = Number((node.attrs as { level?: number } | undefined)?.level ?? 1)
        const text = Array.isArray(node.content)
            ? node.content
                  .map((child) => String((child as JSONContent)?.text ?? '').trim())
                  .filter(Boolean)
                  .join(' ')
            : ''
        if (!text) return
        headings.push({
            text,
            level,
            chapterId: chapter.id,
            index: headings.length,
        })
    })
    return headings
}

function resolveCurrentBlock(editor: Editor): Omit<EditorBlockSnapshot, 'chapterId'> | null {
    const { selection, doc } = editor.state
    const $from = selection.$from
    for (let depth = $from.depth; depth >= 1; depth -= 1) {
        const node = $from.node(depth)
        if (!node || !node.isBlock || node.type.name === 'doc') continue
        const from = $from.before(depth)
        const to = $from.after(depth)
        return {
            from,
            to,
            type: node.type.name,
            text: node.textContent.trim(),
            depth,
        }
    }

    let fallback: Omit<EditorBlockSnapshot, 'chapterId'> | null = null
    doc.descendants((node, pos) => {
        if (fallback || !node.isBlock || node.type.name === 'doc') return false
        fallback = {
            from: pos,
            to: pos + node.nodeSize,
            type: node.type.name,
            text: node.textContent.trim(),
            depth: 1,
        }
        return false
    })
    return fallback
}

export function readCurrentSelection(): EditorSelectionSnapshot | null {
    const state = getActiveEditorState()
    if (!state) return null
    const { editor, chapterId } = state
    const { from, to } = editor.state.selection
    if (to <= from) return null
    const text = editor.state.doc.textBetween(from, to, '\n', '\n').trim()
    if (!text) return null
    return { chapterId, from, to, text }
}

export function readCurrentPage(): EditorPageSnapshot | null {
    const state = getActiveEditorState()
    if (!state) return null
    const { editor, chapterId } = state
    const chapter = useChapterStore.getState().chapters.find((item) => item.id === chapterId)
    const docSize = editor.state.doc.content.size
    const text = editor.state.doc.textBetween(1, docSize, '\n', '\n').trim()
    const blocks: PageBlockSnapshot[] = []
    editor.state.doc.forEach((node, _offset, index) => {
        const textPreview = node.textContent.trim().replace(/\s+/g, ' ').slice(0, 80)
        blocks.push({
            index,
            type: node.type.name,
            textPreview,
        })
    })
    const headingCount = editor.state.doc.descendants
        ? (() => {
              let headings = 0
              let paragraphs = 0
              editor.state.doc.descendants((node) => {
                  if (node.type.name === 'heading') headings += 1
                  if (node.type.name === 'paragraph') paragraphs += 1
              })
              return { headings, paragraphs }
          })()
        : { headings: 0, paragraphs: 0 }
    const wordCount = text.length > 0 ? text.split(/\s+/).filter(Boolean).length : 0
    const blockSummary = blocks
        .slice(0, 3)
        .map((block) =>
            block.textPreview
                ? `${block.type}:${block.textPreview}`
                : `${block.type}`,
        )
        .join(' | ')
    const structureSummary = [
        chapter?.title ? `title=${chapter.title}` : null,
        `headings=${headingCount.headings}`,
        `paragraphs=${headingCount.paragraphs}`,
        `words=${wordCount}`,
        blockSummary ? `blocks=${blockSummary}` : null,
    ]
        .filter(Boolean)
        .join(', ')
    return {
        chapterId,
        title: chapter?.title ?? '',
        chapterType: chapter?.chapterType ?? 'chapter',
        chapterKind: chapter?.chapterKind,
        text,
        docSize,
        blocks,
        structureSummary,
        isEmpty: text.length === 0,
    }
}

export function readPageById(chapterId: string | null | undefined): EditorPageSnapshot | null {
    const normalizedId = String(chapterId ?? '').trim()
    if (!normalizedId) return null
    const currentPage = readCurrentPage()
    if (currentPage && currentPage.chapterId === normalizedId) return currentPage
    const chapter = useChapterStore.getState().chapters.find((item) => item.id === normalizedId)
    if (!chapter) return null
    return buildStoredPageSnapshot(chapter)
}

export function readCurrentBlock(): EditorBlockSnapshot | null {
    const state = getActiveEditorState()
    if (!state) return null
    const block = resolveCurrentBlock(state.editor)
    if (!block) return null
    return {
        chapterId: state.chapterId,
        ...block,
    }
}

export function readHeadingTree(chapterId?: string | null): HeadingTreeNode[] {
    const normalizedId = String(chapterId ?? '').trim()
    const state = getActiveEditorState()
    if (normalizedId && state && state.chapterId === normalizedId) {
        const headings: HeadingTreeNode[] = []
        state.editor.state.doc.descendants((node) => {
            if (node.type.name !== 'heading') return true
            const text = node.textContent.trim()
            if (!text) return true
            headings.push({
                text,
                level: Number(node.attrs.level ?? 1),
                chapterId: state.chapterId,
                index: headings.length,
            })
            return true
        })
        return headings
    }
    const targetChapterId = normalizedId || useChapterStore.getState().activeChapterId
    if (!targetChapterId) return []
    const chapter = useChapterStore.getState().chapters.find((item) => item.id === targetChapterId)
    if (!chapter) return []
    return buildStoredHeadingTree(chapter)
}

export function readPageStructure(): PageStructureSnapshot {
    const chapterState = useChapterStore.getState()
    return {
        activeChapterId: chapterState.activeChapterId,
        pages: chapterState.chapters
            .slice()
            .sort((a, b) => a.order - b.order)
            .map((chapter) => ({
                id: chapter.id,
                title: chapter.title,
                order: chapter.order,
                parentId: chapter.parentId ?? null,
                chapterType: chapter.chapterType,
                chapterKind: chapter.chapterKind,
            })),
    }
}

export function validateCurrentPageContent(): PageValidationResult {
    const page = readCurrentPage()
    if (!page) {
        return {
            ok: false,
            warnings: ['현재 페이지 문맥을 확인할 수 없습니다.'],
        }
    }
    const warnings: string[] = []
    const length = page.text.trim().length
    if (length === 0) {
        warnings.push('현재 페이지 본문이 비어 있습니다.')
    } else if (length < 40) {
        warnings.push('현재 페이지 본문이 매우 짧아 초안이 불완전할 수 있습니다.')
    }
    const paragraphBlocks = page.blocks.filter((block) => block.type === 'paragraph')
    if (page.blocks.length > 0 && paragraphBlocks.length === 0) {
        warnings.push('현재 페이지에 본문 문단이 없어 구조가 불안정할 수 있습니다.')
    }
    if (page.blocks.length >= 8 && length < 120) {
        warnings.push('블록 수에 비해 본문 길이가 짧아 구조만 많고 내용이 비어 있을 수 있습니다.')
    }
    return {
        ok: warnings.length === 0,
        warnings,
    }
}

export function replaceSelectionInCurrentPage(input: {
    chapterId: string
    from: number
    to: number
    text: string
}): boolean {
    const state = getActiveEditorState()
    if (!state || state.chapterId !== input.chapterId) return false
    return state.editor
        .chain()
        .focus()
        .insertContentAt({ from: input.from, to: input.to }, input.text)
        .run()
}

export function replaceCurrentPageContent(input: {
    chapterId: string
    text: string
}): boolean {
    const state = getActiveEditorState()
    if (!state || state.chapterId !== input.chapterId) return false
    return state.editor
        .chain()
        .focus()
        .setContent({
            type: 'doc',
            content: (() => {
                const paragraphs = buildParagraphNodesFromText(input.text)
                return paragraphs.length > 0 ? paragraphs : [{ type: 'paragraph' }]
            })(),
        })
        .run()
}

export function replaceCurrentBlockContent(input: {
    chapterId: string
    text: string
}): boolean {
    const state = getActiveEditorState()
    if (!state || state.chapterId !== input.chapterId) return false
    const block = resolveCurrentBlock(state.editor)
    if (!block) return false
    const paragraphs = buildParagraphNodesFromText(input.text)
    if (paragraphs.length === 0) return false
    return state.editor
        .chain()
        .focus()
        .insertContentAt({ from: block.from, to: block.to }, paragraphs)
        .run()
}

export function insertParagraphAfterCurrentBlock(input: {
    chapterId: string
    text: string
}): boolean {
    const state = getActiveEditorState()
    if (!state || state.chapterId !== input.chapterId) return false
    const block = resolveCurrentBlock(state.editor)
    if (!block) return false
    const paragraphs = buildParagraphNodesFromText(input.text)
    if (paragraphs.length === 0) return false
    return state.editor
        .chain()
        .focus()
        .insertContentAt(block.to, paragraphs)
        .run()
}

export function insertParagraphAfterFirstHeading(input: {
    chapterId: string
    text: string
}): boolean {
    const state = getActiveEditorState()
    if (!state || state.chapterId !== input.chapterId) return false
    let insertPos: number | null = null
    state.editor.state.doc.descendants((node, pos) => {
        if (node.type.name !== 'heading') return true
        insertPos = pos + node.nodeSize
        return false
    })
    if (insertPos == null) return false
    const paragraphs = buildParagraphNodesFromText(input.text)
    if (paragraphs.length === 0) return false
    return state.editor
        .chain()
        .focus()
        .insertContentAt(insertPos, paragraphs)
        .run()
}

export function appendToCurrentPage(input: {
    chapterId: string
    text: string
    position?: 'selection_after' | 'end' | 'current_block_after' | 'after_first_heading' | number
}): boolean {
    const state = getActiveEditorState()
    if (!state || state.chapterId !== input.chapterId) return false
    const { editor } = state
    const position = input.position ?? 'end'
    if (position === 'selection_after') {
        return editor.chain().focus().insertContentAt(editor.state.selection.to, `\n${input.text}`).run()
    }
    if (typeof position === 'number') {
        return editor
            .chain()
            .focus()
            .insertContentAt(Math.max(1, Math.floor(position)), `${input.text}\n`)
            .run()
    }
    if (position === 'current_block_after') {
        return insertParagraphAfterCurrentBlock({
            chapterId: input.chapterId,
            text: input.text,
        })
    }
    if (position === 'after_first_heading') {
        return insertParagraphAfterFirstHeading({
            chapterId: input.chapterId,
            text: input.text,
        })
    }
    return editor.chain().focus().insertContent(`${input.text}\n`).run()
}

export function createPageAfter(input: { afterChapterId?: string | null; chapter: Chapter }): string {
    const chapterState = useChapterStore.getState()
    const chapters = [...chapterState.chapters]
    const insertIndex = input.afterChapterId
        ? Math.max(0, chapters.findIndex((chapter) => chapter.id === input.afterChapterId) + 1)
        : chapters.length
    chapters.splice(insertIndex, 0, input.chapter)
    const normalized = chapters.map((chapter, order) => ({ ...chapter, order }))
    chapterState.setChapters(normalized)
    chapterState.setActiveChapter(input.chapter.id)
    return input.chapter.id
}

export function renamePage(input: { chapterId: string; title: string }): boolean {
    const chapterState = useChapterStore.getState()
    if (!chapterState.chapters.some((chapter) => chapter.id === input.chapterId)) return false
    chapterState.renameChapter(input.chapterId, input.title)
    return true
}

export function replacePageTitleField(input: { chapterId: string; title: string }): boolean {
    return renamePage(input)
}

export function movePage(input: { chapterId: string; toIndex: number; parentId?: string | null }): boolean {
    const chapterState = useChapterStore.getState()
    if (!chapterState.chapters.some((chapter) => chapter.id === input.chapterId)) return false
    chapterState.moveChapter(input.chapterId, input.toIndex, input.parentId ?? null)
    return true
}

export function setPageType(input: {
    chapterId: string
    chapterType: ChapterType
    chapterKind?: string
}): boolean {
    const chapterState = useChapterStore.getState()
    if (!chapterState.chapters.some((chapter) => chapter.id === input.chapterId)) return false
    chapterState.setChapterType(input.chapterId, input.chapterType)
    if (input.chapterKind) {
        chapterState.setChapterKind(input.chapterId, input.chapterKind)
    }
    return true
}

export function insertParagraphAfterSpecificHeading(input: {
    chapterId: string
    headingText: string
    text: string
}): boolean {
    const state = getActiveEditorState()
    if (!state || state.chapterId !== input.chapterId) return false
    const normalizedHeading = String(input.headingText ?? '').trim().toLowerCase()
    if (!normalizedHeading) return false
    let insertPos: number | null = null
    state.editor.state.doc.descendants((node, pos) => {
        if (node.type.name !== 'heading') return true
        const headingText = node.textContent.trim().toLowerCase()
        if (headingText !== normalizedHeading) return true
        insertPos = pos + node.nodeSize
        return false
    })
    if (insertPos == null) return false
    const paragraphs = buildParagraphNodesFromText(input.text)
    if (paragraphs.length === 0) return false
    return state.editor
        .chain()
        .focus()
        .insertContentAt(insertPos, paragraphs)
        .run()
}
