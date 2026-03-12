import type { TFunction } from 'i18next'
import type { PageStructureSnapshot } from './editorToolAdapter'
import type { CopilotIntent } from '../../../shared/copilotIpc'
import type { CopilotActionProposal } from './rightPaneTypes'
import { parseRenameChapterDraftFromPrompt } from '../../../shared/copilotP1P2PromptParser.ts'
import type { Chapter } from '../../types/project'

type PageReferenceKind = 'chapter' | 'part' | 'prologue' | 'epilogue' | 'title'

export interface ResolvedPageReference {
    kind: PageReferenceKind | null
    label: string | null
    targetChapterId: string | null
    missingLabel: string | null
}

function normalizeText(value: string): string {
    return String(value ?? '').trim().toLowerCase()
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function findPageByTitle(structure: PageStructureSnapshot, title: string | null | undefined) {
    const normalizedTitle = normalizeText(String(title ?? ''))
    if (!normalizedTitle) return null
    return (
        structure.pages.find((page) => normalizeText(page.title) === normalizedTitle) ??
        structure.pages.find(
            (page) =>
                (normalizedTitle === '프롤로그' || normalizedTitle === '서문' || normalizedTitle === 'prologue' || normalizedTitle === 'preface') &&
                (
                    page.chapterKind === 'prologue' ||
                    page.chapterType === 'front' ||
                    isSpecialTitleMatch(page.title, ['프롤로그', 'prologue', '서문', 'preface'])
                ),
        ) ??
        structure.pages.find(
            (page) =>
                (normalizedTitle === '에필로그' || normalizedTitle === '후기' || normalizedTitle === 'epilogue') &&
                (
                    page.chapterKind === 'epilogue' ||
                    page.chapterType === 'back' ||
                    isSpecialTitleMatch(page.title, ['에필로그', 'epilogue', '후기', '맺음'])
                ),
        ) ??
        null
    )
}

function findReferencedPageByPromptTitle(prompt: string, structure: PageStructureSnapshot) {
    const normalizedPrompt = normalizeText(prompt)
    const pages = structure.pages
        .slice()
        .filter((page) => normalizeText(page.title).length >= 2)
        .sort((a, b) => normalizeText(b.title).length - normalizeText(a.title).length)

    return (
        pages.find((page) => {
            const normalizedTitle = normalizeText(page.title)
            if (!normalizedTitle) return false
            const pattern = new RegExp(
                `(?:^|\\s|["'“”‘’])${escapeRegExp(normalizedTitle)}(?:\\s*(?:페이지|챕터|chapter|page))?(?:[은는이가을를에의도만과와로으로]|\\b)`,
                'iu',
            )
            return pattern.test(normalizedPrompt)
        }) ?? null
    )
}

function inferNamedReferenceKind(label: string | null | undefined): PageReferenceKind {
    const normalizedLabel = normalizeText(String(label ?? ''))
    if (
        normalizedLabel === '프롤로그' ||
        normalizedLabel === '서문' ||
        normalizedLabel === 'prologue' ||
        normalizedLabel === 'preface'
    ) {
        return 'prologue'
    }
    if (
        normalizedLabel === '에필로그' ||
        normalizedLabel === '후기' ||
        normalizedLabel === 'epilogue' ||
        normalizedLabel === '맺음'
    ) {
        return 'epilogue'
    }
    return 'title'
}

function extractNamedPageLabel(prompt: string, renameSourceTitle?: string): string | null {
    if (normalizeText(String(renameSourceTitle ?? ''))) {
        return String(renameSourceTitle ?? '').trim()
    }
    const directNamedMatch = prompt.match(
        /^(.+?)(?:\s*(?:페이지|챕터))?\s*(?:제목|이름)(?:을|를)?\s+.+?(?:으로|로)\s+바꿔(?:줘)?$/i,
    )
    if (directNamedMatch?.[1]) return String(directNamedMatch[1]).trim()
    const englishNamedMatch = prompt.match(
        /^(?:rename\s+)?(.+?)\s+(?:chapter|page)\s+(?:title|name)\s+(?:to|as)\s+.+$/i,
    )
    if (englishNamedMatch?.[1]) return String(englishNamedMatch[1]).trim()
    return null
}

function extractQuotedTitle(prompt: string): string | null {
    const match = String(prompt ?? '').match(/["'“”‘’]([^"'“”‘’]+)["'“”‘’]/)
    return match?.[1]?.trim() || null
}

function sortedPages(structure: PageStructureSnapshot) {
    return structure.pages.slice().sort((left, right) => left.order - right.order)
}

function resolveRelativePageReference(
    prompt: string,
    structure: PageStructureSnapshot,
): ResolvedPageReference | null {
    const normalized = normalizeText(prompt)
    const pages = sortedPages(structure)
    const activeIndex = structure.activeChapterId
        ? pages.findIndex((page) => page.id === structure.activeChapterId)
        : -1
    if (activeIndex < 0) return null

    const chapterPages = pages.filter((page) => page.chapterType === 'chapter')
    const activeChapterIndex = structure.activeChapterId
        ? chapterPages.findIndex((page) => page.id === structure.activeChapterId)
        : -1

    const previousPagePattern = /(이전\s*페이지|앞\s*페이지|직전\s*페이지|바로\s*전\s*페이지|previous\s+page)/i
    const nextPagePattern = /(다음\s*페이지|뒤\s*페이지|next\s+page)/i
    const previousChapterPattern = /(이전\s*장|앞\s*장|직전\s*장|바로\s*전\s*장|previous\s+chapter)/i
    const nextChapterPattern = /(다음\s*장|뒤\s*장|next\s+chapter)/i

    if (previousPagePattern.test(normalized)) {
        const target = pages[activeIndex - 1] ?? null
        return {
            kind: target?.chapterType === 'part' ? 'part' : 'title',
            label: target?.title ?? '이전 페이지',
            targetChapterId: target?.id ?? null,
            missingLabel: target ? null : '이전 페이지',
        }
    }
    if (nextPagePattern.test(normalized)) {
        const target = pages[activeIndex + 1] ?? null
        return {
            kind: target?.chapterType === 'part' ? 'part' : 'title',
            label: target?.title ?? '다음 페이지',
            targetChapterId: target?.id ?? null,
            missingLabel: target ? null : '다음 페이지',
        }
    }
    if (previousChapterPattern.test(normalized)) {
        const target = activeChapterIndex >= 0 ? chapterPages[activeChapterIndex - 1] ?? null : null
        return {
            kind: 'chapter',
            label: target?.title ?? '이전 장',
            targetChapterId: target?.id ?? null,
            missingLabel: target ? null : '이전 장',
        }
    }
    if (nextChapterPattern.test(normalized)) {
        const target = activeChapterIndex >= 0 ? chapterPages[activeChapterIndex + 1] ?? null : null
        return {
            kind: 'chapter',
            label: target?.title ?? '다음 장',
            targetChapterId: target?.id ?? null,
            missingLabel: target ? null : '다음 장',
        }
    }

    return null
}

function isSpecialTitleMatch(pageTitle: string, aliases: string[]): boolean {
    const normalizedTitle = normalizeText(pageTitle)
    return aliases.some((alias) => normalizedTitle === normalizeText(alias))
}

export function buildPageStructureSnapshot(args: {
    chapters: Chapter[]
    activeChapterId?: string | null
}): PageStructureSnapshot {
    const { chapters, activeChapterId } = args
    return {
        activeChapterId: activeChapterId ?? null,
        pages: chapters
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

export function resolvePromptPageReference(
    prompt: string,
    structure: PageStructureSnapshot,
): ResolvedPageReference {
    const normalized = String(prompt ?? '').trim()
    if (!normalized) {
        return { kind: null, label: null, targetChapterId: null, missingLabel: null }
    }

    const chapterMatch = normalized.match(
        /(?:^|\s)(?:(?:챕터|chapter|ch\.?)\s*(\d+)|(\d+)\s*장)(?:[은는이가을를에의도만과와로으로]+)?(?=\s|$|[^\p{L}\p{N}_])/iu,
    )
    if (chapterMatch) {
        const index = Number(chapterMatch[1] || chapterMatch[2])
        const chapters = structure.pages.filter((page) => page.chapterType === 'chapter')
        const target = Number.isFinite(index) ? chapters[index - 1] : null
        return {
            kind: 'chapter',
            label: `${index}장`,
            targetChapterId: target?.id ?? null,
            missingLabel: target ? null : `${index}장`,
        }
    }

    const relativeReference = resolveRelativePageReference(normalized, structure)
    if (relativeReference) {
        return relativeReference
    }

    const renameDraft = parseRenameChapterDraftFromPrompt(normalized)
    const namedLabel = extractNamedPageLabel(normalized, renameDraft.sourceTitle)
    const namedTarget = findPageByTitle(structure, namedLabel)
    if (namedTarget || namedLabel) {
        return {
            kind: namedTarget
                ? namedTarget.chapterType === 'part'
                    ? 'part'
                    : namedTarget.chapterKind === 'prologue'
                      ? 'prologue'
                      : namedTarget.chapterKind === 'epilogue'
                        ? 'epilogue'
                        : 'title'
                : inferNamedReferenceKind(namedLabel),
            label: namedTarget?.title ?? namedLabel ?? null,
            targetChapterId: namedTarget?.id ?? null,
            missingLabel: namedTarget ? null : namedLabel ?? null,
        }
    }

    const referencedByTitle = findReferencedPageByPromptTitle(normalized, structure)
    if (referencedByTitle) {
        return {
            kind:
                referencedByTitle.chapterType === 'part'
                    ? 'part'
                    : referencedByTitle.chapterKind === 'prologue'
                      ? 'prologue'
                      : referencedByTitle.chapterKind === 'epilogue'
                        ? 'epilogue'
                        : 'title',
            label: referencedByTitle.title,
            targetChapterId: referencedByTitle.id,
            missingLabel: null,
        }
    }

    const partMatch = normalized.match(/(?:part|파트)\s*(\d+)/i)
    if (partMatch) {
        const index = Number(partMatch[1])
        const parts = structure.pages.filter((page) => page.chapterType === 'part')
        const target = Number.isFinite(index) ? parts[index - 1] : null
        return {
            kind: 'part',
            label: `Part ${index}`,
            targetChapterId: target?.id ?? null,
            missingLabel: target ? null : `Part ${index}`,
        }
    }

    if (/프롤로그|prologue/i.test(normalized)) {
        const target = structure.pages.find(
            (page) =>
                page.chapterKind === 'prologue' ||
                page.chapterType === 'front' ||
                isSpecialTitleMatch(page.title, ['프롤로그', 'prologue', '서문', 'preface']),
        )
        return {
            kind: 'prologue',
            label: '프롤로그',
            targetChapterId: target?.id ?? null,
            missingLabel: target ? null : '프롤로그',
        }
    }

    if (/에필로그|epilogue/i.test(normalized)) {
        const target = structure.pages.find(
            (page) =>
                page.chapterKind === 'epilogue' ||
                page.chapterType === 'back' ||
                isSpecialTitleMatch(page.title, ['에필로그', 'epilogue', '후기', '맺음']),
        )
        return {
            kind: 'epilogue',
            label: '에필로그',
            targetChapterId: target?.id ?? null,
            missingLabel: target ? null : '에필로그',
        }
    }

    const quotedTitle = extractQuotedTitle(normalized)
    if (quotedTitle) {
        const target = findPageByTitle(structure, quotedTitle)
        return {
            kind: 'title',
            label: quotedTitle,
            targetChapterId: target?.id ?? null,
            missingLabel: target ? null : quotedTitle,
        }
    }

    return { kind: null, label: null, targetChapterId: null, missingLabel: null }
}

export function findPromptReferencedPages(
    prompt: string,
    structure: PageStructureSnapshot,
): Array<PageStructureSnapshot['pages'][number]> {
    const normalizedPrompt = normalizeText(prompt)
    if (!normalizedPrompt) return []

    const pages = sortedPages(structure)
    const seen = new Set<string>()
    const matches: Array<PageStructureSnapshot['pages'][number]> = []
    const pushUnique = (page: PageStructureSnapshot['pages'][number] | null | undefined) => {
        if (!page || seen.has(page.id)) return
        seen.add(page.id)
        matches.push(page)
    }

    const chapterRegex = /(?:챕터|chapter|ch\.?)\s*(\d+)|(\d+)\s*장/giu
    for (const match of normalizedPrompt.matchAll(chapterRegex)) {
        const index = Number(match[1] || match[2])
        const chapterPages = pages.filter((page) => page.chapterType === 'chapter')
        if (Number.isFinite(index)) pushUnique(chapterPages[index - 1] ?? null)
    }

    const partRegex = /(?:part|파트)\s*(\d+)/giu
    for (const match of normalizedPrompt.matchAll(partRegex)) {
        const index = Number(match[1])
        const partPages = pages.filter((page) => page.chapterType === 'part')
        if (Number.isFinite(index)) pushUnique(partPages[index - 1] ?? null)
    }

    const titleMatches = pages
        .filter((page) => normalizeText(page.title).length >= 2)
        .sort((left, right) => normalizeText(right.title).length - normalizeText(left.title).length)
        .filter((page) => {
            const normalizedTitle = normalizeText(page.title)
            const pattern = new RegExp(
                `(?:^|\\s|["'“”‘’])${escapeRegExp(normalizedTitle)}(?:\\s*(?:페이지|챕터|chapter|page))?(?:[은는이가을를에의도만과와로으로]|\\b)`,
                'iu',
            )
            return pattern.test(normalizedPrompt)
        })
    titleMatches.forEach((page) => pushUnique(page))

    const relativeReference = resolveRelativePageReference(normalizedPrompt, structure)
    if (relativeReference?.targetChapterId) {
        pushUnique(pages.find((page) => page.id === relativeReference.targetChapterId) ?? null)
    }

    if (/프롤로그|prologue/i.test(normalizedPrompt)) {
        pushUnique(
            pages.find(
                (page) =>
                    page.chapterKind === 'prologue' ||
                    page.chapterType === 'front' ||
                    isSpecialTitleMatch(page.title, ['프롤로그', 'prologue', '서문', 'preface']),
            ) ?? null,
        )
    }
    if (/에필로그|epilogue/i.test(normalizedPrompt)) {
        pushUnique(
            pages.find(
                (page) =>
                    page.chapterKind === 'epilogue' ||
                    page.chapterType === 'back' ||
                    isSpecialTitleMatch(page.title, ['에필로그', 'epilogue', '후기', '맺음']),
            ) ?? null,
        )
    }

    return matches
}

export function buildMissingPageSuggestion(args: {
    prompt: string
    intent: CopilotIntent
    missingLabel: string
    t: TFunction
}): string {
    const { prompt, intent, missingLabel, t } = args
    if (intent === 'delete_chapter') {
        return `${missingLabel} 페이지가 없어 삭제할 대상을 찾지 못했습니다. 페이지 이름이나 순서를 다시 확인해 주세요.`
    }
    if (intent === 'rename_chapter') {
        const renameDraft = parseRenameChapterDraftFromPrompt(prompt)
        if (renameDraft.title) {
            return t('rightPane.missingChapterSuggestCreateAndRename', {
                chapter: missingLabel,
                title: renameDraft.title,
            })
        }
    }
    return t('rightPane.missingChapterSuggestCreate', {
        chapter: missingLabel,
    })
}

export function buildMissingPageFollowUpPrompt(args: {
    prompt: string
    intent: CopilotIntent
    missingLabel: string
    kind?: PageReferenceKind | null
}): string | null {
    const { prompt, intent, missingLabel, kind = null } = args
    const baseCreatePrompt =
        kind === 'prologue'
            ? '프롤로그 페이지를 새로 만들어줘'
            : kind === 'epilogue'
              ? '에필로그 페이지를 새로 만들어줘'
              : kind === 'part'
                ? `${missingLabel} 파트를 새로 만들어줘`
                : `${missingLabel} 페이지를 새로 만들어줘`
    if (intent === 'rename_chapter') {
        const renameDraft = parseRenameChapterDraftFromPrompt(prompt)
        if (renameDraft.title) {
            return `${baseCreatePrompt}. 만든 뒤 제목을 "${renameDraft.title}"로 지정해줘.`
        }
        return `${baseCreatePrompt}. 만든 뒤 제목도 바꿔줘.`
    }
    if (intent === 'move_chapter') {
        return `${baseCreatePrompt}. 만든 뒤 원래 요청대로 구조 이동까지 이어서 처리해줘.`
    }
    if (intent === 'append_text' || intent === 'rewrite_selection' || intent === 'find_replace') {
        return `${baseCreatePrompt}. 만든 뒤 원래 요청대로 이어서 처리해줘. 원래 요청: ${prompt}`
    }
    if (intent === 'set_chapter_type') {
        return `${baseCreatePrompt}. 만든 뒤 원하는 유형으로 지정해줘.`
    }
    return null
}

export function buildMissingPageProposal(args: {
    prompt: string
    intent: CopilotIntent
    missingLabel: string
    kind?: PageReferenceKind | null
}): CopilotActionProposal | null {
    const { prompt, intent, missingLabel, kind = null } = args
    const followUpPrompt = buildMissingPageFollowUpPrompt({
        prompt,
        intent,
        missingLabel,
        kind,
    })
    if (!followUpPrompt) return null
    const renameDraft = intent === 'rename_chapter' ? parseRenameChapterDraftFromPrompt(prompt) : null
    return {
        kind: 'create_missing_page_then_retry',
        intent,
        missingLabel,
        targetKind: kind,
        suggestedTitle: renameDraft?.title ?? null,
        followUpPrompt,
    }
}
