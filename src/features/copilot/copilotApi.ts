import type {
    CopilotAppServerChatRequest,
    CopilotAppServerGenerateRequest,
    CopilotAppServerInterruptRequest,
    CopilotAppServerSteerRequest,
    CopilotAppServerTokenUsage,
    CopilotAppServerSteerResponse,
    CopilotGenerateRequest,
} from '../../../shared/copilotIpc'
import { createAiCommandIdempotencyKey } from '../../../shared/aiCommandSchema'
import {
    buildBookspaceChatContextBlock,
    buildBookspaceChatSystemPrompt,
} from '../../../shared/copilotServiceProfile'

type CopilotErrorCode =
    | 'NETWORK_FETCH_FAILED'
    | 'TIMEOUT'
    | 'UNAUTHORIZED'
    | 'FORBIDDEN'
    | 'NOT_FOUND'
    | 'RATE_LIMITED'
    | 'BUDGET_EXCEEDED'
    | 'INVALID_REQUEST'
    | 'SERVER_ERROR'
    | 'UNKNOWN'

interface CopilotErrorInfo {
    code: CopilotErrorCode
    status?: number
    message: string
}

export interface CopilotChatRequest {
    requestId: string
    prompt: string
    threadKey?: string
    threadId?: string
    modelClass?: 'chat_simple' | 'command_generate'
    context?: {
        chapterId?: string
        selectedText?: string
        selectedRange?: {
            from: number
            to: number
        }
        scope?: 'selection' | 'chapter' | 'project'
        projectTitle?: string
        chapterCount?: number
        activePageTitle?: string
        activePageType?: string
        activePageSummary?: string
        threadGoal?: string
        threadSummary?: string
        rollingSummary?: string
        contextPins?: string[]
        sessionMemory?: string[]
        bookMemory?: string[]
        recentArtifacts?: string[]
        contextStatus?: 'fresh' | 'watch' | 'tight'
        requestedMode?: 'editorial_support' | 'book_context_review' | 'product_guidance' | 'next_action_coach' | 'release_editorial_check'
        bookContextOutline?: string[]
        bookContextEvidence?: string[]
        bookContextConfidence?: 'low' | 'medium' | 'high'
    }
}

export interface CopilotChatResponse {
    requestId: string
    status: 'ok' | 'error'
    text?: string
    source?: string
    threadId?: string
    turnId?: string
    tokenUsage?: CopilotAppServerTokenUsage
    generatedAt: string
    error?: string
}

interface CopilotGenerateRuntimeRequest extends CopilotGenerateRequest {
    threadKey?: string
    threadId?: string
}

function normalizeErrorCode(raw: string): CopilotErrorCode {
    if (raw === 'NETWORK_FETCH_FAILED') return 'NETWORK_FETCH_FAILED'
    if (raw === 'TIMEOUT') return 'TIMEOUT'
    if (raw === 'UNAUTHORIZED') return 'UNAUTHORIZED'
    if (raw === 'FORBIDDEN') return 'FORBIDDEN'
    if (raw === 'NOT_FOUND') return 'NOT_FOUND'
    if (raw === 'RATE_LIMITED') return 'RATE_LIMITED'
    if (raw === 'BUDGET_EXCEEDED') return 'BUDGET_EXCEEDED'
    if (raw === 'INVALID_REQUEST') return 'INVALID_REQUEST'
    if (raw === 'SERVER_ERROR') return 'SERVER_ERROR'
    return 'UNKNOWN'
}

export function parseCopilotErrorInfo(error: unknown): CopilotErrorInfo {
    const text = String(error instanceof Error ? error.message : error ?? '').trim()
    const parsed = text.match(
        /^(NETWORK_FETCH_FAILED|TIMEOUT|UNAUTHORIZED|FORBIDDEN|NOT_FOUND|RATE_LIMITED|BUDGET_EXCEEDED|INVALID_REQUEST|SERVER_ERROR|UNKNOWN)(?:\s*\((\d{3})\))?:\s*(.+)$/i,
    )
    if (!parsed) {
        if (/token budget exceeded|budget exceeded/i.test(text)) {
            return {
                code: 'BUDGET_EXCEEDED',
                message: '토큰 예산을 초과했습니다. 새 스레드를 시작하거나 대화를 압축한 뒤 다시 시도해주세요.',
            }
        }
        if (/failed to fetch|fetch failed|network/i.test(text)) {
            return {
                code: 'NETWORK_FETCH_FAILED',
                message: 'Network request failed before a response was received.',
            }
        }
        return {
            code: 'UNKNOWN',
            message: text || 'Unknown copilot error.',
        }
    }
    return {
        code: normalizeErrorCode(parsed[1].toUpperCase()),
        status: parsed[2] ? Number(parsed[2]) : undefined,
        message: parsed[3].trim() || 'Unknown copilot error.',
    }
}

export function formatCopilotErrorForUser(error: unknown): string {
    const info = parseCopilotErrorInfo(error)
    if (info.code === 'NETWORK_FETCH_FAILED') {
        return '네트워크 연결을 확인해주세요. AI 서버에 연결하지 못했습니다.'
    }
    if (info.code === 'UNAUTHORIZED') {
        return 'API 인증에 실패했습니다. 설정을 확인해주세요.'
    }
    if (info.code === 'RATE_LIMITED') {
        return '요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.'
    }
    if (info.code === 'BUDGET_EXCEEDED') {
        return '현재 대화의 토큰 예산을 초과했습니다. 새 대화를 시작하거나 요약 후 다시 시도해주세요.'
    }
    if (info.code === 'TIMEOUT') {
        return '요청 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.'
    }
    return info.message
}

function assertAppServerBridge() {
    if (
        typeof window === 'undefined' ||
        typeof window.electronAPI?.appServerChatCompletion !== 'function' ||
        typeof window.electronAPI?.appServerGenerateCopilotCommands !== 'function'
    ) {
        throw new Error('Codex app-server bridge is not available.')
    }
}

export const copilotApi = {
    async generateCommands(request: CopilotGenerateRuntimeRequest) {
        assertAppServerBridge()
        const { threadKey, threadId, ...baseRequest } = request
        const appServerRequest: CopilotAppServerGenerateRequest = {
            request: {
                ...baseRequest,
                idempotencyKey: baseRequest.idempotencyKey || createAiCommandIdempotencyKey('appserver'),
                baseProjectRevision: baseRequest.baseProjectRevision || 'rev_appserver_local',
            },
            threadKey:
                String(threadKey ?? '').trim() ||
                `copilot-generate:${String(baseRequest.context?.chapterId ?? 'chapter-active').trim() || 'chapter-active'}`,
            threadId: String(threadId ?? '').trim() || undefined,
        }
        return window.electronAPI.appServerGenerateCopilotCommands(appServerRequest)
    },

    async chat(request: CopilotChatRequest): Promise<CopilotChatResponse> {
        assertAppServerBridge()
        try {
            const appServerRequest: CopilotAppServerChatRequest = {
                requestId: request.requestId,
                prompt: request.prompt,
                systemPrompt: buildBookspaceChatSystemPrompt(),
                contextHint: buildBookspaceChatContextBlock({
                    scope: request.context?.scope,
                    chapterId: request.context?.chapterId,
                    selectedText: request.context?.selectedText,
                    selectedRange: request.context?.selectedRange,
                    projectTitle: request.context?.projectTitle,
                    chapterCount: request.context?.chapterCount,
                    activePageTitle: request.context?.activePageTitle,
                    activePageType: request.context?.activePageType,
                    activePageSummary: request.context?.activePageSummary,
                    threadGoal: request.context?.threadGoal,
                    threadSummary: request.context?.threadSummary,
                    rollingSummary: request.context?.rollingSummary,
                    contextPins: request.context?.contextPins,
                    sessionMemory: request.context?.sessionMemory,
                    bookMemory: request.context?.bookMemory,
                    recentArtifacts: request.context?.recentArtifacts,
                    contextStatus: request.context?.contextStatus,
                    requestedMode: request.context?.requestedMode,
                    bookContextOutline: request.context?.bookContextOutline,
                    bookContextEvidence: request.context?.bookContextEvidence,
                    bookContextConfidence: request.context?.bookContextConfidence,
                }),
                threadKey:
                    String(request.threadKey ?? '').trim() ||
                    `copilot-chat:${String(request.context?.projectTitle ?? '').trim() || 'untitled'}:` +
                        `${String(request.context?.chapterId ?? 'chapter-active').trim() || 'chapter-active'}`,
                threadId: String(request.threadId ?? '').trim() || undefined,
                modelClass: request.modelClass ?? 'chat_simple',
            }
            const response = await window.electronAPI.appServerChatCompletion(appServerRequest)
            return {
                requestId: request.requestId,
                status: response.ok && String(response.text ?? '').trim() ? 'ok' : 'error',
                text: String(response.text ?? '').trim() || undefined,
                source: 'appserver',
                threadId: response.threadId,
                turnId: response.turnId,
                tokenUsage: response.tokenUsage,
                generatedAt: new Date().toISOString(),
                error: response.ok ? undefined : response.error,
            }
        } catch (error) {
            return {
                requestId: request.requestId,
                status: 'error',
                error: formatCopilotErrorForUser(error),
                generatedAt: new Date().toISOString(),
            }
        }
    },

    async interruptAppServerTurn(threadKey: string): Promise<boolean> {
        const normalizedThreadKey = String(threadKey ?? '').trim()
        if (!normalizedThreadKey) return false
        const request: CopilotAppServerInterruptRequest = {
            threadKey: normalizedThreadKey,
        }
        const response = await window.electronAPI.appServerInterruptTurn(request)
        return Boolean(response.ok && response.interrupted)
    },

    async steerAppServerTurn(
        threadKey: string,
        prompt: string,
        expectedTurnId?: string,
    ): Promise<CopilotAppServerSteerResponse> {
        const request: CopilotAppServerSteerRequest = {
            threadKey: String(threadKey ?? '').trim(),
            prompt: String(prompt ?? '').trim(),
            expectedTurnId: String(expectedTurnId ?? '').trim() || undefined,
        }
        return window.electronAPI.appServerSteerTurn(request)
    },
}

export function createCopilotRequestId(prefix = 'copilot'): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}
