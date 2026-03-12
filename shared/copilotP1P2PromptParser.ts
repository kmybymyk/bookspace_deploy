type ChapterType = 'front' | 'part' | 'chapter' | 'divider' | 'back' | 'uncategorized'

function normalizeText(value: unknown): string {
  return String(value ?? '').trim()
}

function extractQuotedValues(prompt: string): string[] {
  return [...prompt.matchAll(/["'“”‘’]([^"'“”‘’]+)["'“”‘’]/g)].map((match) => normalizeText(match[1])).filter(Boolean)
}

function extractNumber(prompt: string): number | undefined {
  const matched = prompt.match(/-?\d+/)
  if (!matched) return undefined
  const parsed = Number(matched[0])
  return Number.isFinite(parsed) ? parsed : undefined
}

function extractLabeledValue(prompt: string, labels: string[]): string | undefined {
  const joinedLabels = labels.join('|')
  const quotedPattern = new RegExp(
    `(?:${joinedLabels})(?:\\s*(?:을|를|은|는|이|가|:))?\\s*["'“”‘’]([^"'“”‘’]+)["'“”‘’]`,
    'i',
  )
  const quotedMatch = prompt.match(quotedPattern)
  if (quotedMatch?.[1]) {
    return normalizeText(quotedMatch[1]) || undefined
  }

  const plainPattern = new RegExp(
    `(?:${joinedLabels})(?:\\s*(?:을|를|은|는|이|가|:))?\\s*(.+?)(?:\\s*(?:으로|로)\\s*(?:바꿔|변경|설정)|\\s*(?:설정해|설정해줘|추가해|추가해줘|입력해|입력해줘)|$)`,
    'i',
  )
  const plainMatch = prompt.match(plainPattern)
  if (!plainMatch?.[1]) return undefined

  return (
    normalizeText(
      plainMatch[1]
        .replace(/(?:으로|로)\s*(?:바꿔|변경|설정).*$/i, '')
        .replace(/(?:설정해|설정해줘|추가해|추가해줘|입력해|입력해줘).*$/i, '')
        .trim(),
    ) || undefined
  )
}

export function parseRenameChapterDraftFromPrompt(prompt: string) {
  const quoted = extractQuotedValues(prompt)
  if (quoted.length >= 2) {
    return {
      sourceTitle: quoted[0],
      title: quoted[quoted.length - 1],
    }
  }

  if (quoted[0]) {
    return {
      title: quoted[0],
    }
  }

  const rawPrompt = normalizeText(prompt)
  const koreanNamedPattern = rawPrompt.match(
    /^(.+?)(?:\s*(?:페이지|챕터))?\s*(?:제목|이름)을?\s+(.+?)(?:으로|로)\s+바꿔(?:줘)?$/i,
  )
  if (koreanNamedPattern?.[2]) {
    return {
      sourceTitle: normalizeText(koreanNamedPattern[1]) || undefined,
      title: normalizeText(koreanNamedPattern[2]) || '새 챕터 제목',
    }
  }

  const koreanPattern = rawPrompt.match(
    /(?:\d+\s*장\s*)?(?:챕터\s*)?(?:페이지\s*)?(?:제목|이름)을?\s+(.+?)(?:으로|로)\s+바꿔(?:줘)?$/i,
  )
  if (koreanPattern?.[1]) {
    return {
      title: normalizeText(koreanPattern[1]) || '새 챕터 제목',
    }
  }

  const englishPattern = rawPrompt.match(
    /rename(?:\s+(?:chapter|page|title|name))?\s+to\s+(.+)$/i,
  )
  if (englishPattern?.[1]) {
    return {
      title: normalizeText(englishPattern[1]) || '새 챕터 제목',
    }
  }

  const englishNamedPattern = rawPrompt.match(
    /^(?:rename\s+)?(.+?)\s+(?:chapter|page)\s+(?:title|name)\s+(?:to|as)\s+(.+)$/i,
  )
  if (englishNamedPattern?.[2]) {
    return {
      sourceTitle: normalizeText(englishNamedPattern[1]) || undefined,
      title: normalizeText(englishNamedPattern[2]) || '새 챕터 제목',
    }
  }

  return {
    title:
      normalizeText(rawPrompt.replace(/.*?(이름 변경|rename|제목 바꿔)\s*/i, '')) ||
      '새 챕터 제목',
  }
}

export function parseMoveChapterDraftFromPrompt(prompt: string) {
  const rawPrompt = normalizeText(prompt)
  const lowered = rawPrompt.toLowerCase()
  let toIndex = 0

  const afterMatch = rawPrompt.match(/(\d+)\s*(?:장|챕터|chapter)?\s*(?:뒤|다음|after)/i)
  const beforeMatch = rawPrompt.match(/(\d+)\s*(?:장|챕터|chapter)?\s*(?:앞|이전|before)/i)
  const ordinalMatch = rawPrompt.match(/(\d+)\s*(?:번째|번\s*(?:위치|자리)?|번으로)/i)

  if (/맨\s*앞|제일\s*앞|가장\s*앞|first|top/.test(lowered)) {
    toIndex = 0
  } else if (/맨\s*뒤|제일\s*뒤|가장\s*뒤|마지막|끝으로|last|end/.test(lowered)) {
    toIndex = 999
  } else if (afterMatch?.[1]) {
    toIndex = Math.max(0, Number(afterMatch[1]))
  } else if (beforeMatch?.[1]) {
    toIndex = Math.max(0, Number(beforeMatch[1]) - 1)
  } else if (ordinalMatch?.[1]) {
    toIndex = Math.max(0, Number(ordinalMatch[1]) - 1)
  } else {
    toIndex = Math.max(0, (extractNumber(prompt) ?? 1) - 1)
  }

  return {
    toIndex: Math.max(0, toIndex),
    parentId: null as string | null,
  }
}

export function parseSetChapterTypeDraftFromPrompt(prompt: string) {
  const lowered = normalizeText(prompt).toLowerCase()
  let chapterType: ChapterType = 'chapter'
  let chapterKind: string | undefined = 'chapter'
  if (/프롤로그|prologue|서문|preface|front\s*matter|front/.test(lowered)) {
    chapterType = 'front'
    chapterKind = 'prologue'
  } else if (/에필로그|epilogue|후기|맺음|back\s*matter|back/.test(lowered)) {
    chapterType = 'back'
    chapterKind = 'epilogue'
  } else if (lowered.includes('part') || prompt.includes('파트')) {
    chapterType = 'part'
    chapterKind = 'part'
  } else if (lowered.includes('divider') || prompt.includes('간지')) {
    chapterType = 'divider'
    chapterKind = 'divider'
  } else if (lowered.includes('빈 페이지') || lowered.includes('uncategorized')) {
    chapterType = 'uncategorized'
    chapterKind = 'uncategorized'
  }
  return {
    chapterType,
    chapterKind,
  }
}

export function parseSetTypographyDraftFromPrompt(prompt: string) {
  const lowered = normalizeText(prompt).toLowerCase()
  const number = extractNumber(prompt)
  return {
    section: (lowered.includes('front') ? 'front' : lowered.includes('back') ? 'back' : lowered.includes('active') || prompt.includes('현재 챕터') ? 'active_chapter' : 'body') as 'front' | 'body' | 'back' | 'active_chapter',
    slot: (lowered.includes('h1') ? 'h1' : lowered.includes('h2') ? 'h2' : lowered.includes('h3') ? 'h3' : lowered.includes('h4') ? 'h4' : lowered.includes('h5') ? 'h5' : lowered.includes('h6') ? 'h6' : 'body') as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'body',
    fontFamily: prompt.includes('Noto Sans') ? 'Noto Sans KR' : prompt.includes('Noto Serif') ? 'Noto Serif KR' : undefined,
    fontScale: number ? Math.max(0.5, Math.min(3, number / 100)) : undefined,
    lineHeight: lowered.includes('행간') ? (number ?? 18) / 10 : undefined,
    letterSpacing: lowered.includes('자간') ? (number ?? 0) / 100 : undefined,
    textIndent: lowered.includes('들여쓰기') ? (number ?? 0) / 10 : undefined,
  }
}

export function parseSetPageBackgroundDraftFromPrompt(prompt: string) {
  const colorMatch = prompt.match(/#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})/)
  return {
    color: colorMatch?.[0] ?? '#ffffff',
  }
}

export function parseApplyThemeDraftFromPrompt(prompt: string) {
  const lowered = normalizeText(prompt).toLowerCase()
  return {
    theme: (
      lowered.includes('essay') || lowered.includes('에세이')
        ? 'essay'
        : lowered.includes('novel') || lowered.includes('소설')
          ? 'novel'
          : 'custom'
    ) as 'novel' | 'essay' | 'custom',
  }
}

export function parseUpdateBookInfoDraftFromPrompt(prompt: string) {
  const quoted = extractQuotedValues(prompt)
  const title = extractLabeledValue(prompt, ['책\\s*제목', 'book\\s*title', 'title'])
  const subtitle = extractLabeledValue(prompt, ['부제', 'subtitle'])
  const publisher = extractLabeledValue(prompt, ['출판사', 'publisher'])
  const description = extractLabeledValue(prompt, ['책\\s*소개', '설명', 'description', '소개'])
  const authorName = extractLabeledValue(prompt, ['저자', 'author', '작성자'])
  const fallbackTitle = title ?? quoted[0]
  const fallbackSubtitle = subtitle ?? (!title ? quoted[1] : undefined)
  return {
    title: fallbackTitle || undefined,
    subtitle: fallbackSubtitle || undefined,
    language:
      prompt.includes('영문') || prompt.includes('english') || prompt.includes('영어')
        ? 'en'
        : prompt.includes('국문') || prompt.includes('korean') || prompt.includes('한국어')
          ? 'ko'
          : undefined,
    publisher: publisher ?? undefined,
    link: undefined as string | undefined,
    description: description ?? undefined,
    authors: authorName ? [{ name: authorName }] : undefined,
  }
}

export function parseSetCoverAssetDraftFromPrompt(prompt: string) {
  const quoted = extractQuotedValues(prompt)
  const lowered = normalizeText(prompt).toLowerCase()
  return {
    assetType: (lowered.includes('back') || prompt.includes('뒷표지') ? 'back_cover' : lowered.includes('logo') || prompt.includes('로고') ? 'publisher_logo' : 'cover') as 'cover' | 'back_cover' | 'publisher_logo',
    source: (lowered.includes('http') ? 'url' : lowered.includes('generated') ? 'generated' : 'local_path') as 'local_path' | 'url' | 'generated',
    value: quoted[0] || normalizeText(prompt.match(/https?:\/\/[^\s]+/)?.[0] ?? '') || '',
  }
}

export function parseExportProjectDraftFromPrompt(prompt: string) {
  const lowered = normalizeText(prompt).toLowerCase()
  return {
    format: (lowered.includes('docx') || lowered.includes('워드') ? 'docx' : 'epub') as 'epub' | 'docx',
    embedFonts: lowered.includes('폰트 포함') || lowered.includes('embed fonts') ? true : undefined,
  }
}

export function parseRestoreSnapshotDraftFromPrompt(prompt: string) {
  const quoted = extractQuotedValues(prompt)
  const snapshotId = quoted[0] || normalizeText(prompt.match(/[0-9a-zA-Z._-]+\.json|[0-9a-zA-Z._-]+\.bksp|[0-9a-zA-Z._-]+/)?.[0] ?? '')
  return {
    snapshotId,
    mode: (prompt.includes('새 파일') || prompt.toLowerCase().includes('new file') ? 'new_file' : 'replace') as 'replace' | 'new_file',
  }
}
