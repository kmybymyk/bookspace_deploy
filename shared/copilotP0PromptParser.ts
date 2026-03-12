export interface ParsedAppendTextDraft {
  text: string
  position: number | 'end' | 'selection_after' | 'current_block_after' | 'after_first_heading'
  mode: 'literal' | 'generate'
  generationPrompt?: string
}

export interface ParsedFindReplaceDraft {
  find: string
  replace: string
  mode: 'one' | 'all'
  matchCase?: boolean
}

export interface ParsedSaveProjectDraft {
  mode: 'save' | 'save_as'
  suggestedPath?: string
}

function normalizeText(value: unknown): string {
  return String(value ?? '').trim()
}

function extractQuotedValues(prompt: string): string[] {
  return [...prompt.matchAll(/["'“”‘’]([^"'“”‘’]+)["'“”‘’]/g)].map((match) => normalizeText(match[1])).filter(Boolean)
}

export function parseAppendTextDraftFromPrompt(prompt: string): ParsedAppendTextDraft {
  const rawPrompt = normalizeText(prompt)
  const quoted = extractQuotedValues(rawPrompt)
  const explicitAppendPattern = /^(append|append text|이어\s*써|이어써|덧붙여|추가\s*문단|문단\s*추가|뒤에\s*추가)\s*/i
  const stripped = normalizeText(
    rawPrompt
      .replace(explicitAppendPattern, '')
      .replace(/(해줘|해주세요|추가해줘|붙여줘|써줘)$/i, ''),
  )
  const generationPattern =
    /(작성해|작성해줘|작성해 줘|써줘|써 줘|만들어줘|만들어 줘|생성해줘|생성해 줘|compose|draft|write)/i
  const looksLikeGeneratedDraft =
    quoted.length === 0 &&
    generationPattern.test(rawPrompt) &&
    /(페이지|chapter|page|xhtml|본문|글|문단|문장|원고|paragraph|content|text)/i.test(rawPrompt)
  const text =
    quoted[0] ||
    (!looksLikeGeneratedDraft ? stripped : '') ||
    '사용자 요청을 반영한 추가 문단입니다.'

  const lowered = rawPrompt.toLowerCase()
  const position =
    lowered.includes('selection_after') ||
    lowered.includes('선택 뒤') ||
    lowered.includes('선택 다음')
      ? 'selection_after'
      : lowered.includes('after_first_heading') ||
          lowered.includes('첫 heading 아래') ||
          lowered.includes('첫 제목 아래') ||
          lowered.includes('제목 아래') ||
          lowered.includes('heading 아래')
        ? 'after_first_heading'
        : lowered.includes('current_block_after') ||
            lowered.includes('현재 블록 아래') ||
            lowered.includes('이 블록 아래') ||
            lowered.includes('현재 문단 아래') ||
            lowered.includes('cursor 아래')
          ? 'current_block_after'
      : 'end'

  return {
    text: looksLikeGeneratedDraft ? '' : text,
    position,
    mode: looksLikeGeneratedDraft ? 'generate' : 'literal',
    generationPrompt: looksLikeGeneratedDraft ? rawPrompt : undefined,
  }
}

export function parseFindReplaceDraftFromPrompt(prompt: string): ParsedFindReplaceDraft {
  const rawPrompt = normalizeText(prompt)
  const quoted = extractQuotedValues(rawPrompt)

  let find = quoted[0] || ''
  let replace = quoted[1] || ''

  if (!find || !replace) {
    const koreanMatch = rawPrompt.match(/(.+?)(?:을|를)\s+(.+?)(?:으로|로)\s+바꿔/i)
    if (koreanMatch) {
      find = find || normalizeText(koreanMatch[1])
      replace = replace || normalizeText(koreanMatch[2])
    }
  }

  const lowered = rawPrompt.toLowerCase()
  const mode =
    lowered.includes('모두') ||
    lowered.includes('전부') ||
    lowered.includes('replace all')
      ? 'all'
      : 'one'

  return {
    find: find || '기존 텍스트',
    replace: replace || '새 텍스트',
    mode,
    matchCase: lowered.includes('대소문자') || lowered.includes('match case') ? true : undefined,
  }
}

export function parseSaveProjectDraftFromPrompt(prompt: string): ParsedSaveProjectDraft {
  const rawPrompt = normalizeText(prompt)
  const lowered = rawPrompt.toLowerCase()
  const mode =
    lowered.includes('save as') || rawPrompt.includes('다른 이름') || rawPrompt.includes('새 파일명')
      ? 'save_as'
      : 'save'
  const pathMatch = rawPrompt.match(/([^\s]+\.bksp)\b/i)
  return {
    mode,
    suggestedPath: normalizeText(pathMatch?.[1] ?? '') || undefined,
  }
}

export function buildNormalizedAppendTextPrompt(draft: ParsedAppendTextDraft): string {
  return [
    `형식: ${draft.mode === 'generate' ? '현재 페이지 본문 작성' : '본문 덧붙이기'}`,
    `위치: ${draft.position}`,
    draft.mode === 'generate'
      ? `지시: ${draft.generationPrompt ?? ''}`
      : `본문: ${draft.text}`,
  ].join('\n')
}

export function buildNormalizedFindReplacePrompt(draft: ParsedFindReplaceDraft): string {
  return [
    '형식: 찾아 바꾸기',
    `찾기: ${draft.find}`,
    `바꾸기: ${draft.replace}`,
    `모드: ${draft.mode}`,
    `대소문자 구분: ${draft.matchCase ? 'yes' : 'no'}`,
  ].join('\n')
}

export function buildNormalizedSaveProjectPrompt(draft: ParsedSaveProjectDraft): string {
  return [
    '형식: 프로젝트 저장',
    `모드: ${draft.mode}`,
    `경로: ${draft.suggestedPath ?? ''}`,
  ].join('\n')
}
