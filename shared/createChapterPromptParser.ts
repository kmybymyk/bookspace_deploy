type ChapterType = 'front' | 'part' | 'chapter' | 'divider' | 'back' | 'uncategorized'

export interface ParsedCreateChapterDraft {
  title: string
  chapterType: ChapterType
  chapterKind?: string
  parentLabel?: string
  requestedOrdinal?: number | null
  requiresStructuredConfirmation?: boolean
  blocks: Array<{ type: 'paragraph'; text: string }>
}

export interface ParsedCreateChapterBundle {
  parent: ParsedCreateChapterDraft
  children: ParsedCreateChapterDraft[]
}

export function looksLikeStructuredCreateRequest(prompt: string): boolean {
  const rawPrompt = normalizeText(prompt)
  if (!rawPrompt) return false
  return (
    /(만들|만들어|생성|추가|create|add)/i.test(rawPrompt) &&
    /(챕터|chapter|\d+\s*장|페이지|page)/i.test(rawPrompt) &&
    /(안에|아래에|밑에|inside|under|제목은|title|순서|번째|part\s*\d+|파트\s*\d+)/i.test(rawPrompt)
  )
}

function normalizeText(value: unknown): string {
  return String(value ?? '').trim()
}

function normalizeCompact(value: unknown): string {
  return normalizeText(value).toLowerCase().replace(/\s+/g, '')
}

function extractQuotedValues(prompt: string): string[] {
  return [...prompt.matchAll(/["'“”‘’]([^"'“”‘’]+)["'“”‘’]/g)]
    .map((match) => normalizeText(match[1]))
    .filter(Boolean)
}

function pickChapterType(raw: string): { chapterType: ChapterType; chapterKind?: string } {
  const text = normalizeText(raw).toLowerCase()
  if (!text) return { chapterType: 'chapter' }
  if (/프롤로그|prologue|서문|preface/.test(text)) return { chapterType: 'front', chapterKind: 'prologue' }
  if (/에필로그|epilogue|후기|맺음/.test(text)) return { chapterType: 'back', chapterKind: 'epilogue' }
  if (/파트|part/.test(text)) return { chapterType: 'part', chapterKind: 'part' }
  if (/구분|divider|분할/.test(text)) return { chapterType: 'divider', chapterKind: 'divider' }
  if (/front|앞표지|front matter/.test(text)) return { chapterType: 'front' }
  if (/back|뒤표지|back matter/.test(text)) return { chapterType: 'back' }
  if (/uncategorized|기타/.test(text)) return { chapterType: 'uncategorized' }
  return { chapterType: 'chapter' }
}

function extractField(prompt: string, labels: string[]): string {
  const escaped = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  const pattern = new RegExp(
    `(?:${escaped})\\s*(?:은|는|이|가|을|를|:)?\\s*([^\\n\\.,，]+?)(?=\\s*(?:으로|로)\\s*(?:해|해줘|작성|만들|생성|설정|바꿔)|\\s*(?:해줘|작성해줘|만들어줘|생성해줘|설정해줘)|$|[\\.,，])`,
    'i',
  )
  const matched = prompt.match(pattern)
  return normalizeText(matched?.[1] ?? '')
}

function extractParentLabel(prompt: string): string {
  const insideMatch =
    prompt.match(/((?:파트|part)\s*[0-9A-Za-z가-힣]+)\s*(?:안에|아래에|밑에|내부에|under|inside)/i) ??
    prompt.match(/(?:안에|아래에|밑에|내부에|under|inside)\s*([^\\n,.，]+)$/i)
  if (insideMatch?.[1]) {
    return normalizeText(insideMatch[1])
      .replace(/\s*(?:안에|아래에|밑에|내부에)$/i, '')
      .trim()
  }
  return ''
}

function extractRequestedOrdinal(prompt: string): number | null {
  const match =
    prompt.match(/(?:챕터|chapter)\s*(\d+)/i) ??
    prompt.match(/(\d+)\s*장/i)
  if (!match?.[1]) return null
  const parsed = Number(match[1])
  return Number.isFinite(parsed) ? parsed : null
}

function inferRequestedTypeSource(prompt: string) {
  const rawPrompt = normalizeText(prompt)
  if (/프롤로그|prologue|서문|preface/i.test(rawPrompt)) return 'prologue'
  if (/에필로그|epilogue|후기|맺음/i.test(rawPrompt)) return 'epilogue'
  if (/간지|divider|구분/i.test(rawPrompt)) return 'divider'
  if (/(?:새\s*)?(?:챕터|chapter|\d+\s*장|페이지)/i.test(rawPrompt)) return 'chapter'
  if (/(?:새\s*)?(?:파트|part)/i.test(rawPrompt) && !extractParentLabel(rawPrompt)) return 'part'
  return rawPrompt
}

function canonicalPartLabel(value: string): string | null {
  const match = normalizeText(value).match(/(?:파트|part)\s*([0-9A-Za-z가-힣]+)/i)
  return match?.[1] ? normalizeCompact(match[1]) : null
}

export interface CreateChapterPlacementPage {
  id: string
  title: string
  order: number
  parentId: string | null
  chapterType: ChapterType
  chapterKind?: string
}

export function resolveCreateChapterPlacement(args: {
  draft: ParsedCreateChapterDraft
  pages: CreateChapterPlacementPage[]
  fallbackAfterChapterId?: string | null
}) {
  const { draft, pages, fallbackAfterChapterId = null } = args
  const sortedPages = pages.slice().sort((a, b) => a.order - b.order)
  const normalizedParentLabel = normalizeText(draft.parentLabel ?? '')
  if (!normalizedParentLabel) {
    return {
      parentChapterId: null,
      afterChapterId: fallbackAfterChapterId,
      parentPage: null,
    }
  }

  const requestedPartToken = canonicalPartLabel(normalizedParentLabel)
  const parentPage =
    sortedPages.find((page) => normalizeCompact(page.title) === normalizeCompact(normalizedParentLabel)) ??
    sortedPages.find(
      (page) =>
        page.chapterType === 'part' &&
        requestedPartToken &&
        canonicalPartLabel(page.title) === requestedPartToken,
    ) ??
    null

  if (!parentPage) {
    return {
      parentChapterId: null,
      afterChapterId: fallbackAfterChapterId,
      parentPage: null,
    }
  }

  const children = sortedPages
    .filter((page) => page.parentId === parentPage.id)
    .sort((a, b) => a.order - b.order)

  let afterChapterId: string | null = parentPage.id
  if ((draft.requestedOrdinal ?? null) && draft.requestedOrdinal! > 1) {
    const insertAfterIndex = Math.min(
      Math.max(0, draft.requestedOrdinal! - 2),
      Math.max(0, children.length - 1),
    )
    afterChapterId = children[insertAfterIndex]?.id ?? parentPage.id
  } else if (children.length > 0) {
    afterChapterId = children[children.length - 1]?.id ?? parentPage.id
  }

  return {
    parentChapterId: parentPage.chapterType === 'part' ? parentPage.id : null,
    afterChapterId,
    parentPage,
  }
}

function splitContentLines(content: string, maxLines: number): string[] {
  const normalized = normalizeText(content)
  if (!normalized) return []
  const byLines = normalized
    .split(/\n+/)
    .map((line) => normalizeText(line))
    .filter(Boolean)
  if (byLines.length >= maxLines) return byLines.slice(0, maxLines)

  const bySentences = normalized
    .split(/(?<=[.!?。！？])\s+|\s*\/\s*/)
    .map((line) => normalizeText(line))
    .filter(Boolean)
  if (bySentences.length > 0) return bySentences.slice(0, maxLines)
  return [normalized]
}

export function parseCreateChapterDraftFromPrompt(prompt: string): ParsedCreateChapterDraft {
  const rawPrompt = normalizeText(prompt)
  const quoted = extractQuotedValues(rawPrompt)
  const requestedType = extractField(rawPrompt, ['종류', '타입', 'type', 'kind'])
  const requestedTitle = extractField(rawPrompt, ['제목', 'title']) || quoted[0] || ''
  const parentLabel = extractParentLabel(rawPrompt)
  const requestedOrdinal = extractRequestedOrdinal(rawPrompt)

  let content = extractField(rawPrompt, ['내용', '본문', 'content'])
  if (!content) {
    const contentAfterKeyword = rawPrompt.match(/(?:내용|본문|content)\s*(?:은|는|:)?\s*([\s\S]+)$/i)
    content = normalizeText(contentAfterKeyword?.[1] ?? '')
  }

  const shortTwoLinesRequested = /두줄|2줄|두 줄|2 lines|two lines?/i.test(rawPrompt)
  const maxLines = shortTwoLinesRequested ? 2 : 4
  const lines = splitContentLines(content, maxLines)
  const blocks = (lines.length > 0 ? lines : ['새 페이지 초안입니다.'])
    .map((line) => ({ type: 'paragraph' as const, text: line }))

  const typeSource = requestedType || inferRequestedTypeSource(rawPrompt)
  const typeInfo = pickChapterType(typeSource)
  const fallbackTitle = typeInfo.chapterKind === 'prologue'
    ? '프롤로그'
    : typeInfo.chapterKind === 'epilogue'
      ? '에필로그'
      : '새 페이지'

  return {
    title: requestedTitle || fallbackTitle,
    chapterType: typeInfo.chapterType,
    chapterKind: typeInfo.chapterKind,
    parentLabel: parentLabel || undefined,
    requestedOrdinal,
    requiresStructuredConfirmation: Boolean(parentLabel || requestedOrdinal),
    blocks,
  }
}

export function parseCreateChapterBundleFromPrompt(prompt: string): ParsedCreateChapterBundle | null {
  const rawPrompt = normalizeText(prompt)
  if (!rawPrompt) return null

  const normalizedParentTitle = extractField(rawPrompt, ['부모 제목', 'parent title'])
  const normalizedChildCount = Number(extractField(rawPrompt, ['하위 챕터 수', 'child chapter count']))
  const partMatch =
    rawPrompt.match(/(?:파트|part)\s*([0-9A-Za-z가-힣]+)/i) ??
    rawPrompt.match(/([0-9A-Za-z가-힣]+)\s*(?:파트|part)/i)
  const childCountMatch =
    rawPrompt.match(/(?:하위\s*챕터|챕터|chapter)\s*(\d+)\s*개/i) ??
    rawPrompt.match(/(\d+)\s*개\s*(?:하위\s*챕터|챕터|chapter)/i)

  const childCount = normalizedChildCount || Number(childCountMatch?.[1] ?? 0)
  const rawPartLabel = normalizedParentTitle || normalizeText(partMatch?.[1] ?? '')
  if (!rawPartLabel || !Number.isFinite(childCount) || childCount < 2) return null

  const parentTitle = /^파트|^part/i.test(rawPartLabel) ? rawPartLabel : `파트 ${rawPartLabel}`
  const parent: ParsedCreateChapterDraft = {
    title: parentTitle,
    chapterType: 'part',
    chapterKind: 'part',
    blocks: [{ type: 'paragraph', text: `${parentTitle} 아래에 이어질 장 구성을 준비했습니다.` }],
  }

  const children = Array.from({ length: Math.min(childCount, 12) }, (_, index) => ({
    title: `${parentTitle} - 챕터 ${index + 1}`,
    chapterType: 'chapter' as const,
    chapterKind: 'chapter',
    blocks: [{ type: 'paragraph' as const, text: `${parentTitle}의 ${index + 1}번째 장 초안입니다.` }],
  }))

  return {
    parent,
    children,
  }
}

function chapterTypeLabel(draft: ParsedCreateChapterDraft): string {
  if (draft.chapterKind === 'prologue') return '프롤로그'
  if (draft.chapterKind === 'epilogue') return '에필로그'
  if (draft.chapterType === 'part') return '파트'
  if (draft.chapterType === 'divider') return '구분'
  if (draft.chapterType === 'front') return 'front'
  if (draft.chapterType === 'back') return 'back'
  if (draft.chapterType === 'uncategorized') return 'uncategorized'
  return 'chapter'
}

export function buildNormalizedCreateChapterPrompt(draft: ParsedCreateChapterDraft): string {
  const lines = draft.blocks
    .map((block) => normalizeText(block.text))
    .filter(Boolean)
    .slice(0, 4)
  const content = lines.join('\n')

  return [
    `종류: ${chapterTypeLabel(draft)}`,
    `제목: ${normalizeText(draft.title) || '새 페이지'}`,
    draft.parentLabel ? `부모 페이지: ${normalizeText(draft.parentLabel)}` : null,
    draft.requestedOrdinal ? `원하는 순서: ${draft.requestedOrdinal}` : null,
    '내용:',
    content || '새 페이지 초안입니다.',
  ].filter(Boolean).join('\n')
}

export function buildNormalizedCreateChapterBundlePrompt(bundle: ParsedCreateChapterBundle): string {
  return [
    `종류: 파트 묶음`,
    `부모 제목: ${normalizeText(bundle.parent.title) || '새 파트'}`,
    `하위 챕터 수: ${bundle.children.length}`,
    '하위 제목:',
    ...bundle.children.slice(0, 12).map((child) => `- ${normalizeText(child.title) || '새 챕터'}`),
  ].join('\n')
}
