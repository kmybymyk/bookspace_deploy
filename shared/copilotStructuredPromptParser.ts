export interface ParsedInsertTableDraft {
  headers: string[]
  rows: string[][]
  style?: string
  position: number
}

export interface ParsedInsertIllustrationDraft {
  imageSource: string
  alt: string
  caption?: string
  width?: number
  position: number
}

function normalizeText(value: unknown): string {
  return String(value ?? '').trim()
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, Math.floor(value)))
}

function extractField(prompt: string, labels: string[]): string {
  const escaped = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  const pattern = new RegExp(`(?:${escaped})\\s*(?:은|는|:)?\\s*([^\\n\\.,，]+)`, 'i')
  const matched = prompt.match(pattern)
  return normalizeText(matched?.[1] ?? '')
}

function extractLineField(prompt: string, labels: string[]): string {
  const escaped = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  const pattern = new RegExp(`(?:${escaped})\\s*(?:은|는|:)?\\s*([^\\n]+)`, 'i')
  const matched = prompt.match(pattern)
  return normalizeText(matched?.[1] ?? '')
}

function parseCsvLike(input: string): string[] {
  return normalizeText(input)
    .split(/[|,\/]/)
    .map((item) => normalizeText(item).replace(/[.,;:]+$/g, '').trim())
    .filter(Boolean)
}

function sanitizeHeaderField(input: string): string {
  const raw = normalizeText(input)
  if (!raw) return ''
  const cut = raw.split(/\s*(?:스타일|style|위치|position)\s*(?:은|는|:)?\s*/i)[0]
  return normalizeText(cut)
}

function pickTableSize(prompt: string): { cols: number; rows: number } {
  const raw = normalizeText(prompt).toLowerCase()
  let cols = 2
  let rows = 2

  const colMatch = raw.match(/(\d+)\s*(?:열|컬럼|column|col)/i)
  const rowMatch = raw.match(/(\d+)\s*(?:행|row)/i)
  if (colMatch) cols = clampInteger(Number(colMatch[1]), 1, 8)
  if (rowMatch) rows = clampInteger(Number(rowMatch[1]), 1, 12)

  const matrixMatch = raw.match(/(\d+)\s*[xX]\s*(\d+)/)
  if (matrixMatch) {
    cols = clampInteger(Number(matrixMatch[1]), 1, 8)
    rows = clampInteger(Number(matrixMatch[2]), 1, 12)
  }

  return { cols, rows }
}

function buildDefaultHeaders(cols: number): string[] {
  return Array.from({ length: cols }, (_, index) => `항목 ${index + 1}`)
}

export function parseInsertTableDraftFromPrompt(prompt: string): ParsedInsertTableDraft {
  const rawPrompt = normalizeText(prompt)
  const { cols, rows } = pickTableSize(rawPrompt)
  const styleText = extractField(rawPrompt, ['스타일', 'style'])
  const positionRaw = extractField(rawPrompt, ['위치', 'position'])
  const headersRaw = extractLineField(rawPrompt, ['헤더', 'header', 'headers'])

  const headers = parseCsvLike(sanitizeHeaderField(headersRaw))
  const effectiveCols = clampInteger(Math.max(cols, headers.length || 0), 1, 8)
  const normalizedHeaders =
    headers.length > 0
      ? headers.slice(0, effectiveCols)
      : buildDefaultHeaders(effectiveCols)
  while (normalizedHeaders.length < effectiveCols) {
    normalizedHeaders.push(`항목 ${normalizedHeaders.length + 1}`)
  }

  const rowsData = Array.from({ length: rows }, (_, rowIndex) =>
    normalizedHeaders.map((header, colIndex) => `${header} ${rowIndex + 1}-${colIndex + 1}`),
  )

  const normalizedStyle = styleText ? styleText.toLowerCase() : 'default'
  const positionNumber = clampInteger(Number(positionRaw), 0, 99999)

  return {
    headers: normalizedHeaders,
    rows: rowsData,
    style: normalizedStyle,
    position: positionNumber,
  }
}

function extractUrl(prompt: string): string {
  const matched = normalizeText(prompt).match(/https?:\/\/[^\s)]+/i)
  return normalizeText(matched?.[0] ?? '')
}

export function parseInsertIllustrationDraftFromPrompt(prompt: string): ParsedInsertIllustrationDraft {
  const rawPrompt = normalizeText(prompt)
  const imageSource = extractUrl(rawPrompt) || 'generated://stub-image'
  const alt = extractField(rawPrompt, ['대체텍스트', '대체 텍스트', 'alt']) || '삽화'
  const caption = extractField(rawPrompt, ['캡션', 'caption']) || undefined
  const widthRaw = extractField(rawPrompt, ['너비', '폭', 'width'])
  const positionRaw = extractField(rawPrompt, ['위치', 'position'])

  const widthMatched = widthRaw.match(/(\d+)/)
  const width = widthMatched ? clampInteger(Number(widthMatched[1]), 40, 2400) : undefined
  const position = clampInteger(Number(positionRaw), 0, 99999)

  return {
    imageSource,
    alt,
    caption,
    width,
    position,
  }
}

export function buildNormalizedInsertTablePrompt(draft: ParsedInsertTableDraft): string {
  const headerLine = draft.headers.join(' | ')
  const rowCount = Array.isArray(draft.rows) ? draft.rows.length : 0
  return [
    `형식: 표 삽입`,
    `열: ${draft.headers.length}`,
    `행: ${rowCount}`,
    `헤더: ${headerLine}`,
    `스타일: ${draft.style || 'default'}`,
    `위치: ${draft.position}`,
  ].join('\n')
}

export function buildNormalizedInsertIllustrationPrompt(draft: ParsedInsertIllustrationDraft): string {
  return [
    `형식: 삽화 삽입`,
    `소스: ${draft.imageSource}`,
    `alt: ${draft.alt}`,
    `caption: ${draft.caption || ''}`,
    `width: ${draft.width ?? ''}`,
    `위치: ${draft.position}`,
  ].join('\n')
}
