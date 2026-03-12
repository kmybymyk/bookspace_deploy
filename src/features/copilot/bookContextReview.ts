import type { ChapterType } from '../../types/project'
import { buildPageStructureSnapshot, findPromptReferencedPages, resolvePromptPageReference } from './pageReferenceResolver.ts'

export interface BookContextReviewPageDescriptor {
  id: string
  title: string
  order: number
  parentId?: string | null
  chapterType?: ChapterType
  chapterKind?: string
  structureSummary?: string
}

export interface BookContextReviewSnapshot {
  outline: string[]
  evidence: string[]
  confidence: 'low' | 'medium' | 'high'
}

function buildOutlineLabel(page: BookContextReviewPageDescriptor): string {
  const kindLabel =
    page.chapterKind === 'prologue'
      ? 'prologue'
      : page.chapterKind === 'epilogue'
        ? 'epilogue'
        : page.chapterType ?? 'chapter'
  return `${page.order + 1}. ${page.title || '(untitled)'} [${kindLabel}]`
}

function buildEvidenceLabel(page: BookContextReviewPageDescriptor): string {
  return `${page.title || '(untitled)'} -> ${page.structureSummary || 'summary unavailable'}`
}

function hasBookScopeCue(prompt: string): boolean {
  return /(책\s*전체|전체\s*흐름|전체\s*구조|앞부분|초반부|중반부|후반부|결말|설정|세계관|복선|주인공|인물|캐릭터|일관성|충돌|반복|페이싱|pacing|비교|같이\s*봐|다른\s*페이지|다른\s*챕터|다른\s*장)/i.test(
    prompt,
  )
}

function pickPageByIndex(pages: BookContextReviewPageDescriptor[], index: number): BookContextReviewPageDescriptor | null {
  if (pages.length === 0) return null
  if (index < 0) return pages[0] ?? null
  if (index >= pages.length) return pages[pages.length - 1] ?? null
  return pages[index] ?? null
}

function pushUnique(target: BookContextReviewPageDescriptor[], page: BookContextReviewPageDescriptor | null) {
  if (!page) return
  if (target.some((item) => item.id === page.id)) return
  target.push(page)
}

export function buildBookContextReviewSnapshot(args: {
  prompt: string
  activeChapterId?: string | null
  pages: BookContextReviewPageDescriptor[]
}): BookContextReviewSnapshot {
  const sortedPages = args.pages
    .slice()
    .sort((left, right) => left.order - right.order)
  const normalizedPrompt = String(args.prompt ?? '').trim()

  if (!normalizedPrompt || sortedPages.length === 0) {
    return {
      outline: [],
      evidence: [],
      confidence: 'low',
    }
  }

  const structure = buildPageStructureSnapshot({
    chapters: sortedPages.map((page) => ({
      id: page.id,
      title: page.title,
      order: page.order,
      parentId: page.parentId ?? null,
      chapterType: page.chapterType ?? 'chapter',
      chapterKind: page.chapterKind,
    })),
    activeChapterId: args.activeChapterId ?? null,
  })
  const resolvedReference = resolvePromptPageReference(normalizedPrompt, structure)
  const referencedPages = findPromptReferencedPages(normalizedPrompt, structure)
  const selectedPages: BookContextReviewPageDescriptor[] = []

  referencedPages.forEach((referencedPage) => {
    const referencedIndex = sortedPages.findIndex((page) => page.id === referencedPage.id)
    if (referencedIndex >= 0) {
      pushUnique(selectedPages, pickPageByIndex(sortedPages, referencedIndex))
    }
  })

  const referencedIndex = resolvedReference.targetChapterId
    ? sortedPages.findIndex((page) => page.id === resolvedReference.targetChapterId)
    : -1
  const hasExplicitReference = referencedIndex >= 0
  if (referencedIndex >= 0) {
    pushUnique(selectedPages, pickPageByIndex(sortedPages, referencedIndex - 1))
    pushUnique(selectedPages, pickPageByIndex(sortedPages, referencedIndex))
    pushUnique(selectedPages, pickPageByIndex(sortedPages, referencedIndex + 1))
  }

  const activeIndex = args.activeChapterId
    ? sortedPages.findIndex((page) => page.id === args.activeChapterId)
    : -1
  if (activeIndex >= 0) {
    pushUnique(selectedPages, pickPageByIndex(sortedPages, activeIndex))
  }

  if (hasBookScopeCue(normalizedPrompt) || selectedPages.length < 2) {
    pushUnique(selectedPages, pickPageByIndex(sortedPages, 0))
    pushUnique(selectedPages, pickPageByIndex(sortedPages, Math.floor(sortedPages.length / 2)))
    pushUnique(selectedPages, pickPageByIndex(sortedPages, sortedPages.length - 1))
  }

  const outline =
    sortedPages.length <= 6
      ? sortedPages.map(buildOutlineLabel)
      : [
          buildOutlineLabel(sortedPages[0]),
          buildOutlineLabel(sortedPages[1]),
          '...',
          buildOutlineLabel(sortedPages[Math.floor(sortedPages.length / 2)]),
          '...',
          buildOutlineLabel(sortedPages[sortedPages.length - 2]),
          buildOutlineLabel(sortedPages[sortedPages.length - 1]),
        ]

  const evidence = selectedPages.slice(0, 4).map(buildEvidenceLabel)
  const confidence =
    hasExplicitReference && evidence.length >= 3
      ? 'high'
      : evidence.length >= 2
        ? 'medium'
        : 'low'

  return {
    outline,
    evidence,
    confidence,
  }
}
