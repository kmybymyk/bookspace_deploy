export const AI_COMMAND_SCHEMA_VERSION = '1.1.0'
export const LEGACY_SCHEMA_PREFIX = '1.0.'

export const MAX_COMMANDS_PER_REQUEST = 20
export const MAX_TEXT_CHARS_PER_COMMAND = 12000
export const MAX_BLOCKS_PER_CREATE_CHAPTER = 200
export const MAX_TABLE_CELL_CHARS = 2000

export type AiCommandType =
  | 'rewrite_selection'
  | 'append_text'
  | 'find_replace'
  | 'save_project'
  | 'rename_chapter'
  | 'delete_chapter'
  | 'move_chapter'
  | 'set_chapter_type'
  | 'set_typography'
  | 'set_page_background'
  | 'apply_theme'
  | 'update_book_info'
  | 'set_cover_asset'
  | 'export_project'
  | 'restore_snapshot'
  | 'create_chapter'
  | 'insert_table'
  | 'insert_illustration'
  | 'feedback_report'

export type AiCommandValidationCode =
  | 'OK'
  | 'NEEDS_CONTEXT'
  | 'VALIDATION_ERROR'

export interface AiCommandMeta {
  modelId?: string
  modelVersion?: string
  promptTemplateVersion?: string
  promptHash?: string
}

export interface AiTextRange {
  from: number
  to: number
}

export interface RewriteSelectionTarget {
  chapterId: string
  range: AiTextRange
}

export interface RewriteSelectionPayload {
  text: string
  tone?: string
  lengthPolicy?: string
}

export interface AppendTextTarget {
  chapterId: string
  position?: number | 'end' | 'selection_after' | 'current_block_after' | 'after_first_heading'
}

export interface AppendTextPayload {
  text: string
  tone?: string
  lengthPolicy?: string
}

export interface FindReplaceTarget {
  scope: 'chapter' | 'project'
  chapterId?: string
}

export interface FindReplacePayload {
  find: string
  replace: string
  mode: 'one' | 'all'
  matchCase?: boolean
}

export interface SaveProjectTarget {
  mode: 'save' | 'save_as'
}

export interface SaveProjectPayload {
  suggestedPath?: string
}

export interface RenameChapterTarget {
  chapterId: string
}

export interface RenameChapterPayload {
  title: string
}

export interface DeleteChapterTarget {
  chapterId: string
}

export interface DeleteChapterPayload {
  reason?: string
}

export interface MoveChapterTarget {
  chapterId: string
}

export interface MoveChapterPayload {
  toIndex: number
  parentId?: string | null
}

export interface SetChapterTypeTarget {
  chapterId: string
}

export interface SetChapterTypePayload {
  chapterType: 'front' | 'part' | 'chapter' | 'divider' | 'back' | 'uncategorized'
  chapterKind?: string
}

export interface SetTypographyTarget {
  section: 'front' | 'body' | 'back' | 'active_chapter'
}

export interface SetTypographyPayload {
  slot: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'body'
  fontFamily?: string
  fontScale?: number
  lineHeight?: number
  letterSpacing?: number
  textIndent?: number
}

export interface SetPageBackgroundTarget {
  chapterId: string
}

export interface SetPageBackgroundPayload {
  color: string
}

export interface ApplyThemeTarget {
  scope: 'project'
}

export interface ApplyThemePayload {
  theme: 'novel' | 'essay' | 'custom'
}

export interface UpdateBookInfoTarget {
  scope: 'project'
}

export interface UpdateBookInfoAuthor {
  name: string
  role?: string
}

export interface UpdateBookInfoPayload {
  title?: string
  subtitle?: string
  language?: string
  publisher?: string
  link?: string
  description?: string
  authors?: UpdateBookInfoAuthor[]
}

export interface SetCoverAssetTarget {
  assetType: 'cover' | 'back_cover' | 'publisher_logo'
}

export interface SetCoverAssetPayload {
  source: 'local_path' | 'url' | 'generated'
  value: string
}

export interface ExportProjectTarget {
  format: 'epub' | 'docx'
}

export interface ExportProjectPayload {
  embedFonts?: boolean
}

export interface RestoreSnapshotTarget {
  snapshotId: string
}

export interface RestoreSnapshotPayload {
  mode: 'replace' | 'new_file'
}

export interface CreateChapterTarget {
  commandRef?: string
  afterChapterId?: string
  afterCommandRef?: string
  parentChapterId?: string
  parentCommandRef?: string
}

export interface CreateChapterPayload {
  title: string
  chapterType?: 'front' | 'part' | 'chapter' | 'divider' | 'back' | 'uncategorized'
  chapterKind?: string
  blocks: unknown[]
}

export interface InsertTableTarget {
  chapterId: string
  position: number
}

export interface InsertTablePayload {
  headers: string[]
  rows: string[][]
  style?: string
}

export interface InsertIllustrationTarget {
  chapterId: string
  position: number
}

export interface InsertIllustrationPayload {
  imageSource: string
  alt: string
  caption?: string
  width?: number
}

export interface FeedbackReportTarget {
  chapterId?: string
  project?: boolean
}

export interface FeedbackReportItem {
  issue: string
  evidence: string
  suggestion: string
}

export interface FeedbackReportPayload {
  items: FeedbackReportItem[]
}

export interface AiCommandBase<T extends AiCommandType, Target, Payload> {
  type: T
  target: Target
  payload: Payload
  preview: boolean
}

export type RewriteSelectionCommand = AiCommandBase<
  'rewrite_selection',
  RewriteSelectionTarget,
  RewriteSelectionPayload
>

export type AppendTextCommand = AiCommandBase<
  'append_text',
  AppendTextTarget,
  AppendTextPayload
>

export type FindReplaceCommand = AiCommandBase<
  'find_replace',
  FindReplaceTarget,
  FindReplacePayload
>

export type SaveProjectCommand = AiCommandBase<
  'save_project',
  SaveProjectTarget,
  SaveProjectPayload
>

export type RenameChapterCommand = AiCommandBase<
  'rename_chapter',
  RenameChapterTarget,
  RenameChapterPayload
>

export type DeleteChapterCommand = AiCommandBase<
  'delete_chapter',
  DeleteChapterTarget,
  DeleteChapterPayload
>

export type MoveChapterCommand = AiCommandBase<
  'move_chapter',
  MoveChapterTarget,
  MoveChapterPayload
>

export type SetChapterTypeCommand = AiCommandBase<
  'set_chapter_type',
  SetChapterTypeTarget,
  SetChapterTypePayload
>

export type SetTypographyCommand = AiCommandBase<
  'set_typography',
  SetTypographyTarget,
  SetTypographyPayload
>

export type SetPageBackgroundCommand = AiCommandBase<
  'set_page_background',
  SetPageBackgroundTarget,
  SetPageBackgroundPayload
>

export type ApplyThemeCommand = AiCommandBase<
  'apply_theme',
  ApplyThemeTarget,
  ApplyThemePayload
>

export type UpdateBookInfoCommand = AiCommandBase<
  'update_book_info',
  UpdateBookInfoTarget,
  UpdateBookInfoPayload
>

export type SetCoverAssetCommand = AiCommandBase<
  'set_cover_asset',
  SetCoverAssetTarget,
  SetCoverAssetPayload
>

export type ExportProjectCommand = AiCommandBase<
  'export_project',
  ExportProjectTarget,
  ExportProjectPayload
>

export type RestoreSnapshotCommand = AiCommandBase<
  'restore_snapshot',
  RestoreSnapshotTarget,
  RestoreSnapshotPayload
>

export type CreateChapterCommand = AiCommandBase<
  'create_chapter',
  CreateChapterTarget,
  CreateChapterPayload
>

export type InsertTableCommand = AiCommandBase<
  'insert_table',
  InsertTableTarget,
  InsertTablePayload
>

export type InsertIllustrationCommand = AiCommandBase<
  'insert_illustration',
  InsertIllustrationTarget,
  InsertIllustrationPayload
>

export type FeedbackReportCommand = AiCommandBase<
  'feedback_report',
  FeedbackReportTarget,
  FeedbackReportPayload
>

export type AiCommand =
  | RewriteSelectionCommand
  | AppendTextCommand
  | FindReplaceCommand
  | SaveProjectCommand
  | RenameChapterCommand
  | DeleteChapterCommand
  | MoveChapterCommand
  | SetChapterTypeCommand
  | SetTypographyCommand
  | SetPageBackgroundCommand
  | ApplyThemeCommand
  | UpdateBookInfoCommand
  | SetCoverAssetCommand
  | ExportProjectCommand
  | RestoreSnapshotCommand
  | CreateChapterCommand
  | InsertTableCommand
  | InsertIllustrationCommand
  | FeedbackReportCommand

export interface AiCommandEnvelope {
  schemaVersion: string
  requestId: string
  idempotencyKey: string
  intent: string
  baseProjectRevision?: string
  generatedAt: string
  summary: string
  warnings: string[]
  commands: AiCommand[]
  meta?: AiCommandMeta
}

export interface AiCommandValidationCompatibility {
  legacySchema: boolean
  generatedIdempotencyKey: boolean
}

export interface AiCommandValidationResult {
  ok: boolean
  code: AiCommandValidationCode
  errors: string[]
  warnings: string[]
  previewOnly: boolean
  compatibility: AiCommandValidationCompatibility
  normalized?: AiCommandEnvelope
}

type AnyRecord = Record<string, unknown>

const ALLOWED_COMMAND_TYPES = new Set<AiCommandType>([
  'rewrite_selection',
  'append_text',
  'find_replace',
  'save_project',
  'rename_chapter',
  'delete_chapter',
  'move_chapter',
  'set_chapter_type',
  'set_typography',
  'set_page_background',
  'apply_theme',
  'update_book_info',
  'set_cover_asset',
  'export_project',
  'restore_snapshot',
  'create_chapter',
  'insert_table',
  'insert_illustration',
  'feedback_report',
])

function isRecord(value: unknown): value is AnyRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toStringOrEmpty(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function toOptionalString(value: unknown): string | undefined {
  const text = toStringOrEmpty(value)
  return text ? text : undefined
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function createLegacyIdempotencyKey(requestId: string): string {
  const safeRequestId = requestId.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/-+/g, '-')
  const idPart = safeRequestId || Math.random().toString(36).slice(2, 10)
  return `legacy-${idPart}`
}

function parseIsoTime(value: unknown): string | undefined {
  const raw = toStringOrEmpty(value)
  if (!raw) return undefined
  const parsed = Date.parse(raw)
  if (!Number.isFinite(parsed)) return undefined
  return new Date(parsed).toISOString()
}

function fail(
  errors: string[],
  path: string,
  message: string,
): void {
  errors.push(`${path}: ${message}`)
}

function parseCommonPreview(
  command: AnyRecord,
  errors: string[],
  pathPrefix: string,
): boolean {
  if (command.preview === undefined) return true
  if (typeof command.preview !== 'boolean') {
    fail(errors, `${pathPrefix}.preview`, 'must be boolean')
    return true
  }
  return command.preview
}

function parseRewriteSelectionCommand(
  command: AnyRecord,
  errors: string[],
  pathPrefix: string,
  preview: boolean,
): RewriteSelectionCommand | null {
  const target = isRecord(command.target) ? command.target : null
  const payload = isRecord(command.payload) ? command.payload : null
  if (!target) fail(errors, `${pathPrefix}.target`, 'must be object')
  if (!payload) fail(errors, `${pathPrefix}.payload`, 'must be object')
  if (!target || !payload) return null

  const chapterId = toStringOrEmpty(target.chapterId)
  if (!chapterId) fail(errors, `${pathPrefix}.target.chapterId`, 'required')

  const range = isRecord(target.range) ? target.range : null
  if (!range) fail(errors, `${pathPrefix}.target.range`, 'must be object')
  const from = range && isFiniteNumber(range.from) ? range.from : NaN
  const to = range && isFiniteNumber(range.to) ? range.to : NaN
  if (!Number.isFinite(from)) fail(errors, `${pathPrefix}.target.range.from`, 'must be number')
  if (!Number.isFinite(to)) fail(errors, `${pathPrefix}.target.range.to`, 'must be number')
  if (Number.isFinite(from) && Number.isFinite(to) && from >= to) {
    fail(errors, `${pathPrefix}.target.range`, 'from must be less than to')
  }

  const text = typeof payload.text === 'string' ? payload.text : ''
  if (!text.trim()) fail(errors, `${pathPrefix}.payload.text`, 'required')
  if (text.length > MAX_TEXT_CHARS_PER_COMMAND) {
    fail(errors, `${pathPrefix}.payload.text`, `must be <= ${MAX_TEXT_CHARS_PER_COMMAND} chars`)
  }

  return {
    type: 'rewrite_selection',
    target: {
      chapterId,
      range: {
        from,
        to,
      },
    },
    payload: {
      text,
      tone: toOptionalString(payload.tone),
      lengthPolicy: toOptionalString(payload.lengthPolicy),
    },
    preview,
  }
}

function parseCreateChapterCommand(
  command: AnyRecord,
  errors: string[],
  pathPrefix: string,
  preview: boolean,
): CreateChapterCommand | null {
  const target = isRecord(command.target) ? command.target : {}
  const payload = isRecord(command.payload) ? command.payload : null
  if (!payload) {
    fail(errors, `${pathPrefix}.payload`, 'must be object')
    return null
  }

  const title = toStringOrEmpty(payload.title)
  if (!title) fail(errors, `${pathPrefix}.payload.title`, 'required')

  const blocks = Array.isArray(payload.blocks) ? payload.blocks : null
  if (!blocks) fail(errors, `${pathPrefix}.payload.blocks`, 'must be array')
  if (blocks && blocks.length > MAX_BLOCKS_PER_CREATE_CHAPTER) {
    fail(errors, `${pathPrefix}.payload.blocks`, `must be <= ${MAX_BLOCKS_PER_CREATE_CHAPTER} items`)
  }

  return {
    type: 'create_chapter',
    target: {
      commandRef: toOptionalString(target.commandRef),
      afterChapterId: toOptionalString(target.afterChapterId),
      afterCommandRef: toOptionalString(target.afterCommandRef),
      parentChapterId: toOptionalString(target.parentChapterId),
      parentCommandRef: toOptionalString(target.parentCommandRef),
    },
    payload: {
      title,
      chapterType: toOptionalString(payload.chapterType) as CreateChapterPayload['chapterType'],
      chapterKind: toOptionalString(payload.chapterKind),
      blocks: blocks ?? [],
    },
    preview,
  }
}

function parseAppendTextCommand(
  command: AnyRecord,
  errors: string[],
  pathPrefix: string,
  preview: boolean,
): AppendTextCommand | null {
  const target = isRecord(command.target) ? command.target : null
  const payload = isRecord(command.payload) ? command.payload : null
  if (!target) fail(errors, `${pathPrefix}.target`, 'must be object')
  if (!payload) fail(errors, `${pathPrefix}.payload`, 'must be object')
  if (!target || !payload) return null

  const chapterId = toStringOrEmpty(target.chapterId)
  if (!chapterId) fail(errors, `${pathPrefix}.target.chapterId`, 'required')

  const rawPosition = target.position
  let position: AppendTextTarget['position']
  if (rawPosition === undefined) {
    position = 'end'
  } else if (
    rawPosition === 'end' ||
    rawPosition === 'selection_after' ||
    rawPosition === 'current_block_after' ||
    rawPosition === 'after_first_heading'
  ) {
    position = rawPosition
  } else if (isFiniteNumber(rawPosition) && rawPosition >= 0) {
    position = rawPosition
  } else {
    fail(
      errors,
      `${pathPrefix}.target.position`,
      'must be >= 0, "end", "selection_after", "current_block_after", or "after_first_heading"',
    )
    position = 'end'
  }

  const text = typeof payload.text === 'string' ? payload.text : ''
  if (!text.trim()) fail(errors, `${pathPrefix}.payload.text`, 'required')
  if (text.length > MAX_TEXT_CHARS_PER_COMMAND) {
    fail(errors, `${pathPrefix}.payload.text`, `must be <= ${MAX_TEXT_CHARS_PER_COMMAND} chars`)
  }

  return {
    type: 'append_text',
    target: {
      chapterId,
      position,
    },
    payload: {
      text,
      tone: toOptionalString(payload.tone),
      lengthPolicy: toOptionalString(payload.lengthPolicy),
    },
    preview,
  }
}

function parseFindReplaceCommand(
  command: AnyRecord,
  errors: string[],
  pathPrefix: string,
  preview: boolean,
): FindReplaceCommand | null {
  const target = isRecord(command.target) ? command.target : null
  const payload = isRecord(command.payload) ? command.payload : null
  if (!target) fail(errors, `${pathPrefix}.target`, 'must be object')
  if (!payload) fail(errors, `${pathPrefix}.payload`, 'must be object')
  if (!target || !payload) return null

  const scopeRaw = toStringOrEmpty(target.scope)
  const scope =
    scopeRaw === 'chapter' || scopeRaw === 'project'
      ? scopeRaw
      : null
  if (!scope) fail(errors, `${pathPrefix}.target.scope`, 'must be "chapter" or "project"')

  const chapterId = toOptionalString(target.chapterId)

  const find = typeof payload.find === 'string' ? payload.find : ''
  if (!find.trim()) fail(errors, `${pathPrefix}.payload.find`, 'required')

  if (typeof payload.replace !== 'string') {
    fail(errors, `${pathPrefix}.payload.replace`, 'must be string')
  }
  const replace = typeof payload.replace === 'string' ? payload.replace : ''

  const modeRaw = toStringOrEmpty(payload.mode)
  const mode =
    modeRaw === 'one' || modeRaw === 'all'
      ? modeRaw
      : null
  if (!mode) fail(errors, `${pathPrefix}.payload.mode`, 'must be "one" or "all"')

  if (payload.matchCase !== undefined && typeof payload.matchCase !== 'boolean') {
    fail(errors, `${pathPrefix}.payload.matchCase`, 'must be boolean')
  }

  return {
    type: 'find_replace',
    target: {
      scope: scope ?? 'chapter',
      chapterId,
    },
    payload: {
      find,
      replace,
      mode: mode ?? 'all',
      matchCase: typeof payload.matchCase === 'boolean' ? payload.matchCase : undefined,
    },
    preview,
  }
}

function parseSaveProjectCommand(
  command: AnyRecord,
  errors: string[],
  pathPrefix: string,
  preview: boolean,
): SaveProjectCommand | null {
  const target = isRecord(command.target) ? command.target : null
  const payload = isRecord(command.payload) ? command.payload : {}
  if (!target) fail(errors, `${pathPrefix}.target`, 'must be object')
  if (!target) return null

  const modeRaw = toStringOrEmpty(target.mode)
  const mode =
    modeRaw === 'save' || modeRaw === 'save_as'
      ? modeRaw
      : null
  if (!mode) fail(errors, `${pathPrefix}.target.mode`, 'must be "save" or "save_as"')

  return {
    type: 'save_project',
    target: {
      mode: mode ?? 'save',
    },
    payload: {
      suggestedPath: toOptionalString(payload.suggestedPath),
    },
    preview,
  }
}

function parseRenameChapterCommand(
  command: AnyRecord,
  errors: string[],
  pathPrefix: string,
  preview: boolean,
): RenameChapterCommand | null {
  const target = isRecord(command.target) ? command.target : null
  const payload = isRecord(command.payload) ? command.payload : null
  if (!target) fail(errors, `${pathPrefix}.target`, 'must be object')
  if (!payload) fail(errors, `${pathPrefix}.payload`, 'must be object')
  if (!target || !payload) return null
  const chapterId = toStringOrEmpty(target.chapterId)
  const title = toStringOrEmpty(payload.title)
  if (!chapterId) fail(errors, `${pathPrefix}.target.chapterId`, 'required')
  if (!title) fail(errors, `${pathPrefix}.payload.title`, 'required')
  return {
    type: 'rename_chapter',
    target: { chapterId },
    payload: { title },
    preview,
  }
}

function parseDeleteChapterCommand(
  command: AnyRecord,
  errors: string[],
  pathPrefix: string,
  preview: boolean,
): DeleteChapterCommand | null {
  const target = isRecord(command.target) ? command.target : null
  const payload = isRecord(command.payload) ? command.payload : {}
  if (!target) fail(errors, `${pathPrefix}.target`, 'must be object')
  if (!target) return null
  const chapterId = toStringOrEmpty(target.chapterId)
  if (!chapterId) fail(errors, `${pathPrefix}.target.chapterId`, 'required')
  return {
    type: 'delete_chapter',
    target: { chapterId },
    payload: {
      reason: toOptionalString(payload.reason),
    },
    preview,
  }
}

function parseMoveChapterCommand(
  command: AnyRecord,
  errors: string[],
  pathPrefix: string,
  preview: boolean,
): MoveChapterCommand | null {
  const target = isRecord(command.target) ? command.target : null
  const payload = isRecord(command.payload) ? command.payload : null
  if (!target) fail(errors, `${pathPrefix}.target`, 'must be object')
  if (!payload) fail(errors, `${pathPrefix}.payload`, 'must be object')
  if (!target || !payload) return null
  const chapterId = toStringOrEmpty(target.chapterId)
  if (!chapterId) fail(errors, `${pathPrefix}.target.chapterId`, 'required')
  const toIndex = isFiniteNumber(payload.toIndex) ? payload.toIndex : NaN
  if (!Number.isFinite(toIndex)) fail(errors, `${pathPrefix}.payload.toIndex`, 'must be number')
  if (Number.isFinite(toIndex) && toIndex < 0) fail(errors, `${pathPrefix}.payload.toIndex`, 'must be >= 0')
  const parentIdRaw = payload.parentId
  const parentId =
    parentIdRaw === null
      ? null
      : toOptionalString(parentIdRaw)
  return {
    type: 'move_chapter',
    target: { chapterId },
    payload: {
      toIndex: Number.isFinite(toIndex) ? Math.floor(toIndex) : 0,
      parentId,
    },
    preview,
  }
}

function parseSetChapterTypeCommand(
  command: AnyRecord,
  errors: string[],
  pathPrefix: string,
  preview: boolean,
): SetChapterTypeCommand | null {
  const target = isRecord(command.target) ? command.target : null
  const payload = isRecord(command.payload) ? command.payload : null
  if (!target) fail(errors, `${pathPrefix}.target`, 'must be object')
  if (!payload) fail(errors, `${pathPrefix}.payload`, 'must be object')
  if (!target || !payload) return null
  const chapterId = toStringOrEmpty(target.chapterId)
  const chapterType = toStringOrEmpty(payload.chapterType)
  if (!chapterId) fail(errors, `${pathPrefix}.target.chapterId`, 'required')
  if (!['front', 'part', 'chapter', 'divider', 'back', 'uncategorized'].includes(chapterType)) {
    fail(errors, `${pathPrefix}.payload.chapterType`, 'invalid chapterType')
  }
  return {
    type: 'set_chapter_type',
    target: { chapterId },
    payload: {
      chapterType: (chapterType || 'chapter') as SetChapterTypePayload['chapterType'],
      chapterKind: toOptionalString(payload.chapterKind),
    },
    preview,
  }
}

function parseSetTypographyCommand(
  command: AnyRecord,
  errors: string[],
  pathPrefix: string,
  preview: boolean,
): SetTypographyCommand | null {
  const target = isRecord(command.target) ? command.target : null
  const payload = isRecord(command.payload) ? command.payload : null
  if (!target) fail(errors, `${pathPrefix}.target`, 'must be object')
  if (!payload) fail(errors, `${pathPrefix}.payload`, 'must be object')
  if (!target || !payload) return null
  const section = toStringOrEmpty(target.section)
  if (!['front', 'body', 'back', 'active_chapter'].includes(section)) {
    fail(errors, `${pathPrefix}.target.section`, 'invalid section')
  }
  const slot = toStringOrEmpty(payload.slot)
  if (!['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'body'].includes(slot)) {
    fail(errors, `${pathPrefix}.payload.slot`, 'invalid slot')
  }
  const fontScale = payload.fontScale
  const lineHeight = payload.lineHeight
  const letterSpacing = payload.letterSpacing
  const textIndent = payload.textIndent
  if (fontScale !== undefined && !isFiniteNumber(fontScale)) fail(errors, `${pathPrefix}.payload.fontScale`, 'must be number')
  if (lineHeight !== undefined && !isFiniteNumber(lineHeight)) fail(errors, `${pathPrefix}.payload.lineHeight`, 'must be number')
  if (letterSpacing !== undefined && !isFiniteNumber(letterSpacing)) fail(errors, `${pathPrefix}.payload.letterSpacing`, 'must be number')
  if (textIndent !== undefined && !isFiniteNumber(textIndent)) fail(errors, `${pathPrefix}.payload.textIndent`, 'must be number')
  return {
    type: 'set_typography',
    target: {
      section: (section || 'body') as SetTypographyTarget['section'],
    },
    payload: {
      slot: (slot || 'body') as SetTypographyPayload['slot'],
      fontFamily: toOptionalString(payload.fontFamily),
      fontScale: isFiniteNumber(fontScale) ? fontScale : undefined,
      lineHeight: isFiniteNumber(lineHeight) ? lineHeight : undefined,
      letterSpacing: isFiniteNumber(letterSpacing) ? letterSpacing : undefined,
      textIndent: isFiniteNumber(textIndent) ? textIndent : undefined,
    },
    preview,
  }
}

function parseSetPageBackgroundCommand(
  command: AnyRecord,
  errors: string[],
  pathPrefix: string,
  preview: boolean,
): SetPageBackgroundCommand | null {
  const target = isRecord(command.target) ? command.target : null
  const payload = isRecord(command.payload) ? command.payload : null
  if (!target) fail(errors, `${pathPrefix}.target`, 'must be object')
  if (!payload) fail(errors, `${pathPrefix}.payload`, 'must be object')
  if (!target || !payload) return null
  const chapterId = toStringOrEmpty(target.chapterId)
  const color = toStringOrEmpty(payload.color)
  if (!chapterId) fail(errors, `${pathPrefix}.target.chapterId`, 'required')
  if (!color) fail(errors, `${pathPrefix}.payload.color`, 'required')
  return {
    type: 'set_page_background',
    target: { chapterId },
    payload: { color },
    preview,
  }
}

function parseApplyThemeCommand(
  command: AnyRecord,
  errors: string[],
  pathPrefix: string,
  preview: boolean,
): ApplyThemeCommand | null {
  const target = isRecord(command.target) ? command.target : null
  const payload = isRecord(command.payload) ? command.payload : null
  if (!target) fail(errors, `${pathPrefix}.target`, 'must be object')
  if (!payload) fail(errors, `${pathPrefix}.payload`, 'must be object')
  if (!target || !payload) return null
  const scope = toStringOrEmpty(target.scope)
  const theme = toStringOrEmpty(payload.theme)
  if (scope !== 'project') fail(errors, `${pathPrefix}.target.scope`, 'must be "project"')
  if (!['novel', 'essay', 'custom'].includes(theme)) fail(errors, `${pathPrefix}.payload.theme`, 'invalid theme')
  return {
    type: 'apply_theme',
    target: { scope: 'project' },
    payload: { theme: (theme || 'custom') as ApplyThemePayload['theme'] },
    preview,
  }
}

function parseUpdateBookInfoCommand(
  command: AnyRecord,
  errors: string[],
  pathPrefix: string,
  preview: boolean,
): UpdateBookInfoCommand | null {
  const target = isRecord(command.target) ? command.target : null
  const payload = isRecord(command.payload) ? command.payload : null
  if (!target) fail(errors, `${pathPrefix}.target`, 'must be object')
  if (!payload) fail(errors, `${pathPrefix}.payload`, 'must be object')
  if (!target || !payload) return null
  const scope = toStringOrEmpty(target.scope)
  if (scope !== 'project') fail(errors, `${pathPrefix}.target.scope`, 'must be "project"')
  const authorsRaw = Array.isArray(payload.authors) ? payload.authors : undefined
  const authors = authorsRaw?.map((author, index) => {
    if (!isRecord(author)) {
      fail(errors, `${pathPrefix}.payload.authors[${index}]`, 'must be object')
      return { name: '' }
    }
    const name = toStringOrEmpty(author.name)
    if (!name) fail(errors, `${pathPrefix}.payload.authors[${index}].name`, 'required')
    return {
      name,
      role: toOptionalString(author.role),
    }
  })
  return {
    type: 'update_book_info',
    target: { scope: 'project' },
    payload: {
      title: toOptionalString(payload.title),
      subtitle: toOptionalString(payload.subtitle),
      language: toOptionalString(payload.language),
      publisher: toOptionalString(payload.publisher),
      link: toOptionalString(payload.link),
      description: toOptionalString(payload.description),
      authors,
    },
    preview,
  }
}

function parseSetCoverAssetCommand(
  command: AnyRecord,
  errors: string[],
  pathPrefix: string,
  preview: boolean,
): SetCoverAssetCommand | null {
  const target = isRecord(command.target) ? command.target : null
  const payload = isRecord(command.payload) ? command.payload : null
  if (!target) fail(errors, `${pathPrefix}.target`, 'must be object')
  if (!payload) fail(errors, `${pathPrefix}.payload`, 'must be object')
  if (!target || !payload) return null
  const assetType = toStringOrEmpty(target.assetType)
  const source = toStringOrEmpty(payload.source)
  const value = toStringOrEmpty(payload.value)
  if (!['cover', 'back_cover', 'publisher_logo'].includes(assetType)) fail(errors, `${pathPrefix}.target.assetType`, 'invalid assetType')
  if (!['local_path', 'url', 'generated'].includes(source)) fail(errors, `${pathPrefix}.payload.source`, 'invalid source')
  if (!value) fail(errors, `${pathPrefix}.payload.value`, 'required')
  return {
    type: 'set_cover_asset',
    target: { assetType: (assetType || 'cover') as SetCoverAssetTarget['assetType'] },
    payload: { source: (source || 'generated') as SetCoverAssetPayload['source'], value },
    preview,
  }
}

function parseExportProjectCommand(
  command: AnyRecord,
  errors: string[],
  pathPrefix: string,
  preview: boolean,
): ExportProjectCommand | null {
  const target = isRecord(command.target) ? command.target : null
  const payload = isRecord(command.payload) ? command.payload : {}
  if (!target) fail(errors, `${pathPrefix}.target`, 'must be object')
  if (!target) return null
  const format = toStringOrEmpty(target.format)
  if (!['epub', 'docx'].includes(format)) fail(errors, `${pathPrefix}.target.format`, 'must be "epub" or "docx"')
  if (payload.embedFonts !== undefined && typeof payload.embedFonts !== 'boolean') {
    fail(errors, `${pathPrefix}.payload.embedFonts`, 'must be boolean')
  }
  return {
    type: 'export_project',
    target: { format: (format || 'epub') as ExportProjectTarget['format'] },
    payload: {
      embedFonts: typeof payload.embedFonts === 'boolean' ? payload.embedFonts : undefined,
    },
    preview,
  }
}

function parseRestoreSnapshotCommand(
  command: AnyRecord,
  errors: string[],
  pathPrefix: string,
  preview: boolean,
): RestoreSnapshotCommand | null {
  const target = isRecord(command.target) ? command.target : null
  const payload = isRecord(command.payload) ? command.payload : null
  if (!target) fail(errors, `${pathPrefix}.target`, 'must be object')
  if (!payload) fail(errors, `${pathPrefix}.payload`, 'must be object')
  if (!target || !payload) return null
  const snapshotId = toStringOrEmpty(target.snapshotId)
  const mode = toStringOrEmpty(payload.mode)
  if (!snapshotId) fail(errors, `${pathPrefix}.target.snapshotId`, 'required')
  if (!['replace', 'new_file'].includes(mode)) fail(errors, `${pathPrefix}.payload.mode`, 'invalid mode')
  return {
    type: 'restore_snapshot',
    target: { snapshotId },
    payload: { mode: (mode || 'replace') as RestoreSnapshotPayload['mode'] },
    preview,
  }
}

function parseInsertTableCommand(
  command: AnyRecord,
  errors: string[],
  pathPrefix: string,
  preview: boolean,
): InsertTableCommand | null {
  const target = isRecord(command.target) ? command.target : null
  const payload = isRecord(command.payload) ? command.payload : null
  if (!target) fail(errors, `${pathPrefix}.target`, 'must be object')
  if (!payload) fail(errors, `${pathPrefix}.payload`, 'must be object')
  if (!target || !payload) return null

  const chapterId = toStringOrEmpty(target.chapterId)
  if (!chapterId) fail(errors, `${pathPrefix}.target.chapterId`, 'required')

  const position = isFiniteNumber(target.position) ? target.position : NaN
  if (!Number.isFinite(position)) fail(errors, `${pathPrefix}.target.position`, 'must be number')
  if (Number.isFinite(position) && position < 0) fail(errors, `${pathPrefix}.target.position`, 'must be >= 0')

  const headers = Array.isArray(payload.headers) ? payload.headers : null
  if (!headers) fail(errors, `${pathPrefix}.payload.headers`, 'must be array')
  if (headers && headers.length === 0) fail(errors, `${pathPrefix}.payload.headers`, 'must not be empty')

  const normalizedHeaders = (headers ?? []).map((header, headerIndex) => {
    if (typeof header !== 'string') {
      fail(errors, `${pathPrefix}.payload.headers[${headerIndex}]`, 'must be string')
      return ''
    }
    const trimmed = header.trim()
    if (!trimmed) fail(errors, `${pathPrefix}.payload.headers[${headerIndex}]`, 'must not be empty')
    return trimmed
  })

  const rows = Array.isArray(payload.rows) ? payload.rows : null
  if (!rows) fail(errors, `${pathPrefix}.payload.rows`, 'must be array')

  const normalizedRows = (rows ?? []).map((row, rowIndex) => {
    if (!Array.isArray(row)) {
      fail(errors, `${pathPrefix}.payload.rows[${rowIndex}]`, 'must be array')
      return normalizedHeaders.map(() => '')
    }
    if (normalizedHeaders.length > 0 && row.length !== normalizedHeaders.length) {
      fail(errors, `${pathPrefix}.payload.rows[${rowIndex}]`, 'column count must match headers length')
    }
    return row.map((cell, colIndex) => {
      if (typeof cell !== 'string') {
        fail(errors, `${pathPrefix}.payload.rows[${rowIndex}][${colIndex}]`, 'must be string')
        return ''
      }
      if (cell.length > MAX_TABLE_CELL_CHARS) {
        fail(errors, `${pathPrefix}.payload.rows[${rowIndex}][${colIndex}]`, `must be <= ${MAX_TABLE_CELL_CHARS} chars`)
      }
      return cell
    })
  })

  return {
    type: 'insert_table',
    target: {
      chapterId,
      position,
    },
    payload: {
      headers: normalizedHeaders,
      rows: normalizedRows,
      style: toOptionalString(payload.style),
    },
    preview,
  }
}

function parseInsertIllustrationCommand(
  command: AnyRecord,
  errors: string[],
  pathPrefix: string,
  preview: boolean,
): InsertIllustrationCommand | null {
  const target = isRecord(command.target) ? command.target : null
  const payload = isRecord(command.payload) ? command.payload : null
  if (!target) fail(errors, `${pathPrefix}.target`, 'must be object')
  if (!payload) fail(errors, `${pathPrefix}.payload`, 'must be object')
  if (!target || !payload) return null

  const chapterId = toStringOrEmpty(target.chapterId)
  if (!chapterId) fail(errors, `${pathPrefix}.target.chapterId`, 'required')

  const position = isFiniteNumber(target.position) ? target.position : NaN
  if (!Number.isFinite(position)) fail(errors, `${pathPrefix}.target.position`, 'must be number')
  if (Number.isFinite(position) && position < 0) fail(errors, `${pathPrefix}.target.position`, 'must be >= 0')

  const imageSource = toStringOrEmpty(payload.imageSource)
  if (!imageSource) fail(errors, `${pathPrefix}.payload.imageSource`, 'required')

  const alt = toStringOrEmpty(payload.alt)
  if (!alt) fail(errors, `${pathPrefix}.payload.alt`, 'required')

  const width = payload.width
  if (width !== undefined && (!isFiniteNumber(width) || width <= 0)) {
    fail(errors, `${pathPrefix}.payload.width`, 'must be a positive number')
  }

  return {
    type: 'insert_illustration',
    target: {
      chapterId,
      position,
    },
    payload: {
      imageSource,
      alt,
      caption: toOptionalString(payload.caption),
      width: isFiniteNumber(width) ? width : undefined,
    },
    preview,
  }
}

function pickNormalizedItemField(
  item: AnyRecord,
  aliases: string[],
): string {
  for (const alias of aliases) {
    const value = toStringOrEmpty(item[alias])
    if (value) return value
  }
  return ''
}

function parseFeedbackReportCommand(
  command: AnyRecord,
  errors: string[],
  pathPrefix: string,
  preview: boolean,
): FeedbackReportCommand | null {
  const target = isRecord(command.target) ? command.target : null
  const payload = isRecord(command.payload) ? command.payload : null
  if (!target) fail(errors, `${pathPrefix}.target`, 'must be object')
  if (!payload) fail(errors, `${pathPrefix}.payload`, 'must be object')
  if (!target || !payload) return null

  const chapterId = toOptionalString(target.chapterId)
  const project = target.project === true
  if (!chapterId && !project) {
    fail(errors, `${pathPrefix}.target`, 'chapterId or project=true is required')
  }

  const itemsRaw = Array.isArray(payload.items) ? payload.items : null
  if (!itemsRaw) fail(errors, `${pathPrefix}.payload.items`, 'must be array')
  if (itemsRaw && itemsRaw.length === 0) fail(errors, `${pathPrefix}.payload.items`, 'must not be empty')

  const items = (itemsRaw ?? []).map((item, itemIndex) => {
    const itemPath = `${pathPrefix}.payload.items[${itemIndex}]`
    if (!isRecord(item)) {
      fail(errors, itemPath, 'must be object')
      return {
        issue: '',
        evidence: '',
        suggestion: '',
      }
    }

    const issue = pickNormalizedItemField(item, ['issue', 'problem'])
    const evidence = pickNormalizedItemField(item, ['evidence', 'ground', 'rationale'])
    const suggestion = pickNormalizedItemField(item, ['suggestion', 'proposal'])

    if (!issue) fail(errors, `${itemPath}.issue`, 'required')
    if (!evidence) fail(errors, `${itemPath}.evidence`, 'required')
    if (!suggestion) fail(errors, `${itemPath}.suggestion`, 'required')

    return {
      issue,
      evidence,
      suggestion,
    }
  })

  return {
    type: 'feedback_report',
    target: {
      chapterId,
      project,
    },
    payload: {
      items,
    },
    preview,
  }
}

function parseCommand(
  command: unknown,
  commandIndex: number,
  errors: string[],
): AiCommand | null {
  const pathPrefix = `commands[${commandIndex}]`
  if (!isRecord(command)) {
    fail(errors, pathPrefix, 'must be object')
    return null
  }

  const type = toStringOrEmpty(command.type)
  if (!type) {
    fail(errors, `${pathPrefix}.type`, 'required')
    return null
  }

  if (!ALLOWED_COMMAND_TYPES.has(type as AiCommandType)) {
    fail(errors, `${pathPrefix}.type`, `unsupported type "${type}"`)
    return null
  }

  const preview = parseCommonPreview(command, errors, pathPrefix)

  if (type === 'rewrite_selection') {
    return parseRewriteSelectionCommand(command, errors, pathPrefix, preview)
  }
  if (type === 'append_text') {
    return parseAppendTextCommand(command, errors, pathPrefix, preview)
  }
  if (type === 'find_replace') {
    return parseFindReplaceCommand(command, errors, pathPrefix, preview)
  }
  if (type === 'save_project') {
    return parseSaveProjectCommand(command, errors, pathPrefix, preview)
  }
  if (type === 'rename_chapter') {
    return parseRenameChapterCommand(command, errors, pathPrefix, preview)
  }
  if (type === 'delete_chapter') {
    return parseDeleteChapterCommand(command, errors, pathPrefix, preview)
  }
  if (type === 'move_chapter') {
    return parseMoveChapterCommand(command, errors, pathPrefix, preview)
  }
  if (type === 'set_chapter_type') {
    return parseSetChapterTypeCommand(command, errors, pathPrefix, preview)
  }
  if (type === 'set_typography') {
    return parseSetTypographyCommand(command, errors, pathPrefix, preview)
  }
  if (type === 'set_page_background') {
    return parseSetPageBackgroundCommand(command, errors, pathPrefix, preview)
  }
  if (type === 'apply_theme') {
    return parseApplyThemeCommand(command, errors, pathPrefix, preview)
  }
  if (type === 'update_book_info') {
    return parseUpdateBookInfoCommand(command, errors, pathPrefix, preview)
  }
  if (type === 'set_cover_asset') {
    return parseSetCoverAssetCommand(command, errors, pathPrefix, preview)
  }
  if (type === 'export_project') {
    return parseExportProjectCommand(command, errors, pathPrefix, preview)
  }
  if (type === 'restore_snapshot') {
    return parseRestoreSnapshotCommand(command, errors, pathPrefix, preview)
  }
  if (type === 'create_chapter') {
    return parseCreateChapterCommand(command, errors, pathPrefix, preview)
  }
  if (type === 'insert_table') {
    return parseInsertTableCommand(command, errors, pathPrefix, preview)
  }
  if (type === 'insert_illustration') {
    return parseInsertIllustrationCommand(command, errors, pathPrefix, preview)
  }
  return parseFeedbackReportCommand(command, errors, pathPrefix, preview)
}

export function createAiCommandIdempotencyKey(prefix = 'copilot'): string {
  const safePrefix = prefix.trim().replace(/[^a-zA-Z0-9_-]+/g, '-') || 'copilot'
  return `${safePrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function validateAiCommandEnvelope(input: unknown): AiCommandValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  const compatibility: AiCommandValidationCompatibility = {
    legacySchema: false,
    generatedIdempotencyKey: false,
  }

  if (!isRecord(input)) {
    return {
      ok: false,
      code: 'VALIDATION_ERROR',
      errors: ['root: must be object'],
      warnings,
      previewOnly: true,
      compatibility,
    }
  }

  const rawSchemaVersion = toOptionalString(input.schemaVersion) ?? '1.0.0'
  if (!toOptionalString(input.schemaVersion)) {
    compatibility.legacySchema = true
    warnings.push('schemaVersion missing: treated as legacy 1.0.0')
  }

  const isLegacySchema = rawSchemaVersion.startsWith(LEGACY_SCHEMA_PREFIX)
  if (rawSchemaVersion !== AI_COMMAND_SCHEMA_VERSION && !isLegacySchema) {
    fail(errors, 'schemaVersion', `unsupported version "${rawSchemaVersion}"`)
  }
  if (isLegacySchema) {
    compatibility.legacySchema = true
  }

  const requestId = toStringOrEmpty(input.requestId)
  if (!requestId) {
    fail(errors, 'requestId', 'required')
  }

  let idempotencyKey = toStringOrEmpty(input.idempotencyKey)
  if (!idempotencyKey) {
    if (isLegacySchema) {
      idempotencyKey = createLegacyIdempotencyKey(requestId)
      compatibility.generatedIdempotencyKey = true
      warnings.push('idempotencyKey missing on legacy request: generated automatically')
    } else {
      fail(errors, 'idempotencyKey', 'required')
    }
  }

  const intent = toStringOrEmpty(input.intent)
  if (!intent) fail(errors, 'intent', 'required')

  const generatedAt = parseIsoTime(input.generatedAt)
  if (!generatedAt) fail(errors, 'generatedAt', 'must be ISO-8601 datetime')

  const summary = toStringOrEmpty(input.summary)
  if (!summary) fail(errors, 'summary', 'required')

  const warningMessages = Array.isArray(input.warnings) ? input.warnings : null
  if (!warningMessages) {
    fail(errors, 'warnings', 'must be string[]')
  }
  const normalizedWarnings = (warningMessages ?? []).map((item, warningIndex) => {
    if (typeof item !== 'string') {
      fail(errors, `warnings[${warningIndex}]`, 'must be string')
      return ''
    }
    return item
  })

  const commandsRaw = Array.isArray(input.commands) ? input.commands : null
  if (!commandsRaw) {
    fail(errors, 'commands', 'must be array')
  }
  if (commandsRaw && commandsRaw.length === 0) {
    fail(errors, 'commands', 'must not be empty')
  }
  if (commandsRaw && commandsRaw.length > MAX_COMMANDS_PER_REQUEST) {
    fail(errors, 'commands', `must contain <= ${MAX_COMMANDS_PER_REQUEST} commands`)
  }

  const normalizedCommands: AiCommand[] = []
  for (const [commandIndex, command] of (commandsRaw ?? []).entries()) {
    const parsed = parseCommand(command, commandIndex, errors)
    if (parsed) {
      normalizedCommands.push(parsed)
    }
  }

  const baseProjectRevision = toOptionalString(input.baseProjectRevision)
  let previewOnly = false
  if (!baseProjectRevision) {
    previewOnly = true
    warnings.push('baseProjectRevision missing: force preview-only mode')
  }

  const meta = isRecord(input.meta) ? {
    modelId: toOptionalString(input.meta.modelId),
    modelVersion: toOptionalString(input.meta.modelVersion),
    promptTemplateVersion: toOptionalString(input.meta.promptTemplateVersion),
    promptHash: toOptionalString(input.meta.promptHash),
  } : undefined

  if (errors.length > 0) {
    return {
      ok: false,
      code: 'VALIDATION_ERROR',
      errors,
      warnings,
      previewOnly: true,
      compatibility,
    }
  }

  const normalized: AiCommandEnvelope = {
    schemaVersion: rawSchemaVersion,
    requestId,
    idempotencyKey,
    intent,
    baseProjectRevision,
    generatedAt: generatedAt as string,
    summary,
    warnings: normalizedWarnings,
    commands: normalizedCommands,
    meta,
  }

  return {
    ok: true,
    code: previewOnly ? 'NEEDS_CONTEXT' : 'OK',
    errors,
    warnings,
    previewOnly,
    compatibility,
    normalized,
  }
}

export function isAiCommandEnvelope(input: unknown): input is AiCommandEnvelope {
  return validateAiCommandEnvelope(input).ok
}
