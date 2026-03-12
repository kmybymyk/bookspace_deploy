import type {
  AiCommandEnvelope,
  AiCommandValidationCode,
} from './aiCommandSchema'

export type CopilotIntent =
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
  | 'feedback_report'
  | 'insert_table'
  | 'insert_illustration'

export interface CopilotGenerateContext {
  chapterId?: string
  targetChapterId?: string
  pageStructure?: Array<{
    id: string
    title: string
    order: number
    parentId?: string | null
    chapterType?: string
    chapterKind?: string
  }>
  selectedText?: string
  selectedRange?: {
    from: number
    to: number
  }
  userPrompt?: string
  scope?: 'selection' | 'chapter' | 'project'
  projectTitle?: string
  chapterCount?: number
  activePageTitle?: string
  activePageType?: string
  activePageSummary?: string
  threadGoal?: string
  threadSummary?: string
  contextPins?: string[]
  contextStatus?: 'fresh' | 'watch' | 'tight'
}

export interface CopilotGenerateRequest {
  requestId: string
  idempotencyKey?: string
  intent: CopilotIntent
  baseProjectRevision?: string
  context?: CopilotGenerateContext
  preview?: boolean
}

export interface CopilotGenerateResponse {
  requestId: string
  status: 'ok' | 'needs-context' | 'error'
  envelope?: AiCommandEnvelope
  threadId?: string
  turnId?: string
  turnStatus?: CopilotAppServerTurnStatus
  tokenUsage?: CopilotAppServerTokenUsage
  validation: {
    code: AiCommandValidationCode
    errors: string[]
    warnings: string[]
    previewOnly: boolean
  }
  generatedAt: string
  error?: string
}

export interface CopilotDirectRequestConfig {
  baseUrl: string
  apiKey?: string
  model: string
}

export interface CopilotDirectErrorInfo {
  code:
    | 'NETWORK_FETCH_FAILED'
    | 'TIMEOUT'
    | 'UNAUTHORIZED'
    | 'FORBIDDEN'
    | 'NOT_FOUND'
    | 'RATE_LIMITED'
    | 'INVALID_REQUEST'
    | 'SERVER_ERROR'
    | 'UNKNOWN'
  status?: number
  message: string
}

export interface CopilotDirectChatRequest extends CopilotDirectRequestConfig {
  requestId?: string
  prompt: string
  contextHint?: string
  systemPrompt?: string
}

export interface CopilotDirectChatResponse {
  ok: boolean
  text?: string
  error?: string
  errorInfo?: CopilotDirectErrorInfo
}

export interface CopilotDirectGenerateRequest extends CopilotDirectRequestConfig {
  request: CopilotGenerateRequest
}

export interface CopilotAppServerChatRequest {
  requestId?: string
  prompt: string
  contextHint?: string
  systemPrompt?: string
  threadKey?: string
  threadId?: string
  modelClass?: CopilotAppServerModelClass
  outputSchema?: Record<string, unknown>
  streamEvents?: boolean
}

export interface CopilotAppServerTokenUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  threadTotalTokens: number
  userTotalTokens: number
  threadBudgetTokens: number
  userBudgetTokens: number
  threadBudgetExceeded: boolean
  userBudgetExceeded: boolean
}

export interface CopilotAppServerChatResponse {
  ok: boolean
  text?: string
  error?: string
  threadId?: string
  turnId?: string
  turnStatus?: CopilotAppServerTurnStatus
  tokenUsage?: CopilotAppServerTokenUsage
}

export interface CopilotAppServerGenerateRequest {
  request: CopilotGenerateRequest
  threadKey?: string
  threadId?: string
}

export interface CopilotAppServerInterruptRequest {
  threadKey: string
}

export interface CopilotAppServerInterruptResponse {
  ok: boolean
  interrupted: boolean
  error?: string
}

export interface CopilotAppServerSteerRequest {
  threadKey: string
  prompt: string
  expectedTurnId?: string
}

export interface CopilotAppServerSteerResponse {
  ok: boolean
  accepted: boolean
  threadId?: string
  turnId?: string
  error?: string
}

export type CopilotAppServerModelClass = 'chat_simple' | 'command_generate'

export type CopilotAppServerTurnStatus = 'completed' | 'interrupted' | 'failed'

export interface CopilotAppServerStreamEvent {
  type: 'turn_started' | 'delta' | 'turn_completed'
  threadKey?: string
  threadId?: string
  turnId?: string
  status?: CopilotAppServerTurnStatus | 'inProgress'
  itemId?: string
  delta?: string
  text?: string
  error?: string
}

export type CopilotRuntimeMode = 'ipc' | 'http' | 'direct' | 'appserver'

export interface CopilotRuntimeConfigSnapshot {
  mode: CopilotRuntimeMode
  httpBaseUrl: string
  directBaseUrl: string
  directModel: string
  hasDirectApiKey: boolean
}

export interface CopilotRuntimeConfigSetRequest {
  mode: CopilotRuntimeMode
  httpBaseUrl: string
  directBaseUrl: string
  directModel: string
  directApiKey?: string
  clearDirectApiKey?: boolean
}

export interface CopilotRuntimeConfigSecretSnapshot {
  directApiKey: string
}
