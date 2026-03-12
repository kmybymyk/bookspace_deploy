import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import type { AiCommandEnvelope } from '../../shared/aiCommandSchema'
import { parseAppendTextDraftFromPrompt } from '../../shared/copilotP0PromptParser'
import type {
    CopilotAppServerChatRequest,
    CopilotAppServerChatResponse,
    CopilotAppServerGenerateRequest,
    CopilotAppServerInterruptRequest,
    CopilotAppServerInterruptResponse,
    CopilotAppServerSteerRequest,
    CopilotAppServerSteerResponse,
    CopilotAppServerTurnStatus,
    CopilotDirectChatResponse,
    CopilotGenerateRequest,
    CopilotGenerateResponse,
    CopilotIntent,
    CopilotRuntimeMode,
} from '../../shared/copilotIpc'
import type { UiErrorKey, UiLocale } from '../uiErrorCopy'

export interface NormalizedCopilotGenerateRequestLike {
    requestId: string
    idempotencyKey: string
    intent: CopilotIntent
    baseProjectRevision?: string
    preview: boolean
    context: {
        chapterId?: string
        targetChapterId?: string
        selectedText?: string
        selectedRange?: {
            from?: number
            to?: number
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
}

interface EnvelopeValidationResult {
    ok: boolean
    normalized?: AiCommandEnvelope
    code: CopilotGenerateResponse['validation']['code']
    errors: string[]
    warnings: string[]
    previewOnly: boolean
}

interface CopilotRequestAuditPayload {
    userId: string
    requestId: string
    idempotencyKey: string
    intent: CopilotIntent
    status: CopilotGenerateResponse['status']
    validationCode: CopilotGenerateResponse['validation']['code']
    commandCount: number
    previewOnly: boolean
    promptAnonymized?: string
    promptSignature?: string
    hasSelection?: boolean
    selectedTextLength?: number
    source?: 'ipc' | 'appserver'
    threadId?: string
    turnId?: string
    turnStatus?: CopilotAppServerTurnStatus
    tokenTotal?: number
    threadTokenTotal?: number
    userTokenTotal?: number
    retryCount?: number
    error?: string
}

interface CopilotChatAuditPayload {
    userId: string
    requestId: string
    model: string
    status: 'ok' | 'error'
    promptAnonymized?: string
    promptSignature?: string
    errorCode?: string
    threadId?: string
    turnId?: string
    turnStatus?: CopilotAppServerTurnStatus
    tokenTotal?: number
    threadTokenTotal?: number
    userTokenTotal?: number
    error?: string
}

interface ResolveCopilotIntentPlanResult {
    matchedIntents: CopilotIntent[]
}

export interface RegisterCopilotIpcHandlersDeps {
    ipcMain: IpcMain
    assertTrustedSender: (event: IpcMainInvokeEvent) => void
    normalizeCopilotGenerateRequest: (
        request: CopilotGenerateRequest,
        options?: {
            locale?: UiLocale
            getUiErrorCopy?: (key: UiErrorKey) => string
        },
    ) => NormalizedCopilotGenerateRequestLike
    buildStubCopilotEnvelope: (
        request: NormalizedCopilotGenerateRequestLike,
    ) => AiCommandEnvelope | null
    validateAiCommandEnvelope: (envelope: AiCommandEnvelope) => EnvelopeValidationResult
    runAppServerCompletion: (
        request: CopilotAppServerChatRequest,
    ) => Promise<CopilotAppServerChatResponse>
    runAppServerInterrupt: (
        request: CopilotAppServerInterruptRequest,
    ) => Promise<CopilotAppServerInterruptResponse>
    runAppServerSteer: (
        request: CopilotAppServerSteerRequest,
    ) => Promise<CopilotAppServerSteerResponse>
    resolveCopilotIntentPlan: (input: {
        prompt: string
        hasSelection: boolean
        fallbackIntent?: CopilotIntent
    }) => ResolveCopilotIntentPlanResult
    parseJsonObject: (text: string) => Record<string, unknown> | null
    buildDirectRewriteEnvelope: (
        request: NormalizedCopilotGenerateRequestLike,
        rewrittenText: string,
    ) => AiCommandEnvelope
    runDirectCompletion: (request: {
        baseUrl: string
        apiKey: string
        model: string
        prompt: string
        contextHint?: string
        systemPrompt?: string
    }) => Promise<CopilotDirectChatResponse>
    getCopilotRuntimeConfigState: () => Promise<{
        mode: CopilotRuntimeMode
        directBaseUrl: string
        directModel: string
        directApiKey: string
    }>
    appendCopilotRequestAuditLog: (payload: CopilotRequestAuditPayload) => Promise<void>
    appendCopilotChatAuditLog: (payload: CopilotChatAuditPayload) => Promise<void>
    resolveActiveUserId: () => string
    anonymizePromptForAudit: (value: unknown) => string
    buildPromptSignature: (value: unknown) => string | undefined
    getUiErrorCopy: (key: UiErrorKey) => string
}

export function registerCopilotIpcHandlers(deps: RegisterCopilotIpcHandlersDeps) {
    const {
        ipcMain,
        assertTrustedSender,
        normalizeCopilotGenerateRequest,
        buildStubCopilotEnvelope,
        validateAiCommandEnvelope,
        runAppServerCompletion,
        runAppServerInterrupt,
        runAppServerSteer,
        resolveCopilotIntentPlan,
        parseJsonObject,
        buildDirectRewriteEnvelope,
        runDirectCompletion,
        getCopilotRuntimeConfigState,
        appendCopilotRequestAuditLog,
        appendCopilotChatAuditLog,
        resolveActiveUserId,
        anonymizePromptForAudit,
        buildPromptSignature,
        getUiErrorCopy,
    } = deps

    const loadDirectRuntimeConfig = async (): Promise<{
        baseUrl: string
        model: string
        apiKey: string
    } | null> => {
        const config = await getCopilotRuntimeConfigState()
        if (config.mode !== 'direct') return null
        const baseUrl = String(config.directBaseUrl ?? '').trim()
        const model = String(config.directModel ?? '').trim()
        const apiKey = String(config.directApiKey ?? '').trim()
        if (!baseUrl || !model || !apiKey) return null
        return { baseUrl, model, apiKey }
    }

    const inferAppServerTurnStatus = (value: unknown): CopilotAppServerTurnStatus | undefined => {
        const text = String(value ?? '').toLowerCase().trim()
        if (!text) return undefined
        if (text.includes('interrupted') || text.includes('cancel')) return 'interrupted'
        if (text.includes('failed') || text.includes('error')) return 'failed'
        return undefined
    }

    const rewriteOutputSchema = {
        type: 'object',
        properties: {
            rewrittenText: { type: 'string' },
            summary: { type: 'string' },
        },
        required: ['rewrittenText'],
        additionalProperties: false,
    } as const

    const buildAppendGenerationEnvelope = (
        request: NormalizedCopilotGenerateRequestLike,
        generatedText: string,
    ): AiCommandEnvelope | null => {
        const fallbackEnvelope = buildStubCopilotEnvelope(request)
        if (!fallbackEnvelope) return null
        const normalizedText = String(generatedText ?? '').trim()
        if (!normalizedText) return null
        return {
            ...fallbackEnvelope,
            summary: 'Generated page draft preview prepared.',
            commands: fallbackEnvelope.commands.map((command) =>
                command.type === 'append_text'
                    ? {
                          ...command,
                          payload: {
                              ...command.payload,
                              text: normalizedText,
                          },
                      }
                    : command,
            ),
        }
    }

    ipcMain.handle(
        'copilot:commands:generate',
        async (event, request: CopilotGenerateRequest): Promise<CopilotGenerateResponse> => {
            assertTrustedSender(event)

            const fallbackRequestId = String(request?.requestId ?? '').trim() || 'copilot-request'
            let requestIdForAudit = fallbackRequestId
            let idempotencyKeyForAudit = ''
            let intentForAudit: CopilotIntent = 'rewrite_selection'
            let promptForAudit = ''
            let selectionLengthForAudit = 0
            let response: CopilotGenerateResponse

            try {
                const normalizedRequest = normalizeCopilotGenerateRequest(request, { getUiErrorCopy })
                requestIdForAudit = normalizedRequest.requestId
                idempotencyKeyForAudit = normalizedRequest.idempotencyKey
                intentForAudit = normalizedRequest.intent
                promptForAudit = normalizedRequest.context.userPrompt ?? ''
                selectionLengthForAudit = String(normalizedRequest.context.selectedText ?? '').length

                const envelope = buildStubCopilotEnvelope(normalizedRequest)

                if (!envelope) {
                    response = {
                        requestId: normalizedRequest.requestId,
                        status: 'needs-context',
                        validation: {
                            code: 'NEEDS_CONTEXT',
                            errors: [],
                            warnings: ['rewrite_selection intent requires selectedText context'],
                            previewOnly: true,
                        },
                        generatedAt: new Date().toISOString(),
                            error: getUiErrorCopy('copilotMissingSelectionContext'),
                    }
                } else {
                    const validation = validateAiCommandEnvelope(envelope)
                    if (!validation.ok) {
                        response = {
                            requestId: normalizedRequest.requestId,
                            status: 'error',
                            validation: {
                                code: validation.code,
                                errors: [...validation.errors],
                                warnings: [...validation.warnings],
                                previewOnly: validation.previewOnly,
                            },
                            generatedAt: new Date().toISOString(),
                            error: validation.errors[0] ?? getUiErrorCopy('copilotSchemaValidationFailed'),
                        }
                    } else {
                        response = {
                            requestId: normalizedRequest.requestId,
                            status: validation.code === 'NEEDS_CONTEXT' ? 'needs-context' : 'ok',
                            envelope: validation.normalized,
                            validation: {
                                code: validation.code,
                                errors: [...validation.errors],
                                warnings: [...validation.warnings],
                                previewOnly: validation.previewOnly,
                            },
                            generatedAt: new Date().toISOString(),
                        }
                    }
                }
            } catch (error) {
                response = {
                    requestId: fallbackRequestId,
                    status: 'error',
                    validation: {
                        code: 'VALIDATION_ERROR',
                        errors: [error instanceof Error ? error.message : String(error)],
                        warnings: [],
                        previewOnly: true,
                    },
                    generatedAt: new Date().toISOString(),
                    error: error instanceof Error ? error.message : String(error),
                }
            }

            void appendCopilotRequestAuditLog({
                userId: resolveActiveUserId(),
                requestId: requestIdForAudit,
                idempotencyKey: idempotencyKeyForAudit,
                intent: intentForAudit,
                status: response.status,
                validationCode: response.validation.code,
                commandCount: response.envelope?.commands.length ?? 0,
                previewOnly: response.validation.previewOnly,
                promptAnonymized: anonymizePromptForAudit(promptForAudit),
                promptSignature: buildPromptSignature(promptForAudit),
                hasSelection: selectionLengthForAudit > 0,
                selectedTextLength: selectionLengthForAudit,
                source: 'ipc',
                error: response.error,
            }).catch((error) => {
                console.warn('[Copilot] request audit log failed:', error)
            })

            return response
        },
    )

    ipcMain.handle(
        'copilot:commands:generate:appserver',
        async (event, payload: CopilotAppServerGenerateRequest): Promise<CopilotGenerateResponse> => {
            assertTrustedSender(event)
            const fallbackRequestId = String(payload?.request?.requestId ?? '').trim() || 'copilot-appserver-request'
            let requestIdForAudit = fallbackRequestId
            let idempotencyKeyForAudit = ''
            let intentForAudit: CopilotIntent = 'rewrite_selection'
            let promptForAudit = ''
            let selectionLengthForAudit = 0

            const withAudit = (response: CopilotGenerateResponse): CopilotGenerateResponse => {
                void appendCopilotRequestAuditLog({
                    userId: resolveActiveUserId(),
                    requestId: requestIdForAudit,
                    idempotencyKey: idempotencyKeyForAudit,
                    intent: intentForAudit,
                    status: response.status,
                    validationCode: response.validation.code,
                    commandCount: response.envelope?.commands.length ?? 0,
                    previewOnly: response.validation.previewOnly,
                    promptAnonymized: anonymizePromptForAudit(promptForAudit),
                    promptSignature: buildPromptSignature(promptForAudit),
                    hasSelection: selectionLengthForAudit > 0,
                    selectedTextLength: selectionLengthForAudit,
                    source: 'appserver',
                    threadId: response.threadId,
                    turnId: response.turnId,
                    turnStatus: response.turnStatus,
                    tokenTotal: response.tokenUsage?.totalTokens,
                    threadTokenTotal: response.tokenUsage?.threadTotalTokens,
                    userTokenTotal: response.tokenUsage?.userTotalTokens,
                    retryCount: Array.isArray(response.validation?.warnings)
                        ? response.validation.warnings.filter((warning) =>
                              String(warning ?? '').toLowerCase().includes('fallback retry#'),
                          ).length
                        : 0,
                    error: response.error,
                }).catch((error) => {
                    console.warn('[Copilot] appserver request audit log failed:', error)
                })
                return response
            }

            try {
                const normalizedRequest = normalizeCopilotGenerateRequest(payload.request, { getUiErrorCopy })
                requestIdForAudit = normalizedRequest.requestId
                idempotencyKeyForAudit = normalizedRequest.idempotencyKey
                intentForAudit = normalizedRequest.intent
                promptForAudit = normalizedRequest.context.userPrompt ?? ''
                selectionLengthForAudit = String(normalizedRequest.context.selectedText ?? '').length

                const directConfig = await loadDirectRuntimeConfig()
                if (directConfig) {
                    const appendDraft =
                        normalizedRequest.intent === 'append_text'
                            ? parseAppendTextDraftFromPrompt(normalizedRequest.context.userPrompt ?? '')
                            : null
                    const hasRewriteIntent = normalizedRequest.intent === 'rewrite_selection'
                    const needsAppendGeneration =
                        normalizedRequest.intent === 'append_text' && appendDraft?.mode === 'generate'

                    if (needsAppendGeneration) {
                        const directResult = await runDirectCompletion({
                            baseUrl: directConfig.baseUrl,
                            apiKey: directConfig.apiKey,
                            model: directConfig.model,
                            prompt: appendDraft?.generationPrompt || normalizedRequest.context.userPrompt || '현재 페이지용 짧은 본문을 작성해 주세요.',
                            contextHint: [
                                `Scope=${normalizedRequest.context.scope ?? 'chapter'}`,
                                `ProjectTitle=${normalizedRequest.context.projectTitle ?? '(unknown)'}`,
                                `ChapterId=${normalizedRequest.context.targetChapterId ?? normalizedRequest.context.chapterId ?? 'chapter-active'}`,
                                `ActivePageTitle=${normalizedRequest.context.activePageTitle ?? '(unknown)'}`,
                                normalizedRequest.context.activePageSummary
                                    ? `ActivePageSummary=${normalizedRequest.context.activePageSummary}`
                                    : null,
                                normalizedRequest.context.threadGoal ? `Goal=${normalizedRequest.context.threadGoal}` : null,
                                normalizedRequest.context.threadSummary ? `Summary=${normalizedRequest.context.threadSummary}` : null,
                                Array.isArray(normalizedRequest.context.contextPins) && normalizedRequest.context.contextPins.length > 0
                                    ? `Pins=${normalizedRequest.context.contextPins.join(' | ')}`
                                    : null,
                            ].filter(Boolean).join('\n'),
                            systemPrompt:
                                'Write manuscript prose for the current BookSpace page. Return only the prose body in Korean, with no markdown, no labels, and no explanations.',
                        })
                        if (!directResult.ok || !String(directResult.text ?? '').trim()) {
                            return withAudit({
                                requestId: normalizedRequest.requestId,
                                status: 'error',
                                validation: {
                                    code: 'VALIDATION_ERROR',
                                    errors: [String(directResult.error ?? 'direct append generate failed')],
                                    warnings: [],
                                    previewOnly: true,
                                },
                                generatedAt: new Date().toISOString(),
                                error: String(directResult.error ?? 'direct append generate failed'),
                            })
                        }

                        const envelope = buildAppendGenerationEnvelope(normalizedRequest, String(directResult.text ?? '').trim())
                        if (!envelope) {
                            return withAudit({
                                requestId: normalizedRequest.requestId,
                                status: 'error',
                                validation: {
                                    code: 'VALIDATION_ERROR',
                                    errors: ['direct append envelope build failed'],
                                    warnings: [],
                                    previewOnly: true,
                                },
                                generatedAt: new Date().toISOString(),
                                error: 'direct append envelope build failed',
                            })
                        }
                        const validation = validateAiCommandEnvelope(envelope)
                        if (!validation.ok || !validation.normalized) {
                            return withAudit({
                                requestId: normalizedRequest.requestId,
                                status: 'error',
                                validation: {
                                    code: validation.code,
                                    errors: [...validation.errors],
                                    warnings: [...validation.warnings],
                                    previewOnly: validation.previewOnly,
                                },
                                generatedAt: new Date().toISOString(),
                                error: validation.errors[0] ?? 'direct append validation failed',
                            })
                        }
                        return withAudit({
                            requestId: normalizedRequest.requestId,
                            status: 'ok',
                            envelope: validation.normalized,
                            validation: {
                                code: validation.code,
                                errors: [...validation.errors],
                                warnings: [...validation.warnings],
                                previewOnly: validation.previewOnly,
                            },
                            generatedAt: new Date().toISOString(),
                        })
                    }

                    if (!hasRewriteIntent) {
                        const fallbackEnvelope = buildStubCopilotEnvelope(normalizedRequest)
                        if (!fallbackEnvelope) {
                            return withAudit({
                                requestId: normalizedRequest.requestId,
                                status: 'needs-context',
                                validation: {
                                    code: 'NEEDS_CONTEXT',
                                    errors: [],
                                    warnings: ['direct mode fallback requires additional context'],
                                    previewOnly: true,
                                },
                                generatedAt: new Date().toISOString(),
                                error: 'context required',
                            })
                        }
                        const fallbackValidation = validateAiCommandEnvelope(fallbackEnvelope)
                        if (!fallbackValidation.ok || !fallbackValidation.normalized) {
                            return withAudit({
                                requestId: normalizedRequest.requestId,
                                status: 'error',
                                validation: {
                                    code: fallbackValidation.code,
                                    errors: [...fallbackValidation.errors],
                                    warnings: [...fallbackValidation.warnings],
                                    previewOnly: fallbackValidation.previewOnly,
                                },
                                generatedAt: new Date().toISOString(),
                                error: fallbackValidation.errors[0] ?? 'direct fallback validation failed',
                            })
                        }
                        return withAudit({
                            requestId: normalizedRequest.requestId,
                            status: 'ok',
                            envelope: fallbackValidation.normalized,
                            validation: {
                                code: fallbackValidation.code,
                                errors: [...fallbackValidation.errors],
                                warnings: [
                                    ...fallbackValidation.warnings,
                                    'direct mode used rule-based command generator (rewrite not requested)',
                                ],
                                previewOnly: fallbackValidation.previewOnly,
                            },
                            generatedAt: new Date().toISOString(),
                        })
                    }

                    if (
                        !normalizedRequest.context.selectedText?.trim() ||
                        !Number.isFinite(Number(normalizedRequest.context.selectedRange?.from)) ||
                        !Number.isFinite(Number(normalizedRequest.context.selectedRange?.to))
                    ) {
                        return withAudit({
                            requestId: normalizedRequest.requestId,
                            status: 'needs-context',
                            validation: {
                                code: 'NEEDS_CONTEXT',
                                errors: [],
                                warnings: ['rewrite_selection intent requires selectedText context'],
                                previewOnly: true,
                            },
                            generatedAt: new Date().toISOString(),
                            error: 'selectedText required',
                        })
                    }

                    const directResult = await runDirectCompletion({
                        baseUrl: directConfig.baseUrl,
                        apiKey: directConfig.apiKey,
                        model: directConfig.model,
                        prompt:
                            normalizedRequest.context.userPrompt || 'Rewrite naturally and concisely.',
                        contextHint: [
                            `Scope=${normalizedRequest.context.scope ?? 'chapter'}`,
                            `ProjectTitle=${normalizedRequest.context.projectTitle ?? '(unknown)'}`,
                                `ChapterId=${normalizedRequest.context.targetChapterId ?? normalizedRequest.context.chapterId ?? 'chapter-active'}`,
                            `ActivePageTitle=${normalizedRequest.context.activePageTitle ?? '(unknown)'}`,
                            normalizedRequest.context.activePageSummary
                                ? `ActivePageSummary=${normalizedRequest.context.activePageSummary}`
                                : null,
                            `ContextStatus=${normalizedRequest.context.contextStatus ?? 'fresh'}`,
                            normalizedRequest.context.threadGoal
                                ? `Goal=${normalizedRequest.context.threadGoal}`
                                : null,
                            normalizedRequest.context.threadSummary
                                ? `Summary=${normalizedRequest.context.threadSummary}`
                                : null,
                            Array.isArray(normalizedRequest.context.contextPins) && normalizedRequest.context.contextPins.length > 0
                                ? `Pins=${normalizedRequest.context.contextPins.join(' | ')}`
                                : null,
                            `SelectedText:\n${normalizedRequest.context.selectedText}`,
                        ].filter(Boolean).join('\n'),
                        systemPrompt:
                            'Rewrite the selected text safely. Return only the rewritten text without quotes or JSON.',
                    })

                    if (!directResult.ok || !String(directResult.text ?? '').trim()) {
                        return withAudit({
                            requestId: normalizedRequest.requestId,
                            status: 'error',
                            validation: {
                                code: 'VALIDATION_ERROR',
                                errors: [String(directResult.error ?? 'direct generate failed')],
                                warnings: [],
                                previewOnly: true,
                            },
                            generatedAt: new Date().toISOString(),
                            error: String(directResult.error ?? 'direct generate failed'),
                        })
                    }

                    const envelope = buildDirectRewriteEnvelope(
                        normalizedRequest,
                        String(directResult.text ?? '').trim(),
                    )
                    const validation = validateAiCommandEnvelope(envelope)
                    if (!validation.ok || !validation.normalized) {
                        return withAudit({
                            requestId: normalizedRequest.requestId,
                            status: 'error',
                            validation: {
                                code: validation.code,
                                errors: [...validation.errors],
                                warnings: [...validation.warnings],
                                previewOnly: validation.previewOnly,
                            },
                            generatedAt: new Date().toISOString(),
                            error: validation.errors[0] ?? 'direct generate validation failed',
                        })
                    }

                    return withAudit({
                        requestId: normalizedRequest.requestId,
                        status: 'ok',
                        envelope: validation.normalized,
                        validation: {
                            code: validation.code,
                            errors: [...validation.errors],
                            warnings: [...validation.warnings],
                            previewOnly: validation.previewOnly,
                        },
                        generatedAt: new Date().toISOString(),
                    })
                }

                const appendDraft =
                    normalizedRequest.intent === 'append_text'
                        ? parseAppendTextDraftFromPrompt(normalizedRequest.context.userPrompt ?? '')
                        : null
                const hasRewriteIntent = normalizedRequest.intent === 'rewrite_selection'
                const needsAppendGeneration =
                    normalizedRequest.intent === 'append_text' && appendDraft?.mode === 'generate'

                if (needsAppendGeneration) {
                    const rewriteThreadKey =
                        String(payload?.threadKey ?? '').trim() ||
                        `copilot:${resolveActiveUserId()}:append`
                    const result = await runAppServerCompletion({
                        requestId: normalizedRequest.requestId,
                        systemPrompt:
                            'Write manuscript prose for the current BookSpace page. Output only the body text in Korean with no markdown or labels.',
                        prompt: appendDraft?.generationPrompt || normalizedRequest.context.userPrompt || '현재 페이지용 짧은 본문을 작성해 주세요.',
                        contextHint: [
                            '[Stage:ProjectMeta]',
                            `Scope=${normalizedRequest.context.scope ?? 'chapter'}`,
                            `ProjectTitle=${normalizedRequest.context.projectTitle ?? '(unknown)'}`,
                            '[Stage:ChapterMeta]',
                            `ChapterId=${normalizedRequest.context.targetChapterId ?? normalizedRequest.context.chapterId ?? 'chapter-active'}`,
                            `ActivePageTitle=${normalizedRequest.context.activePageTitle ?? '(unknown)'}`,
                            `ActivePageType=${normalizedRequest.context.activePageType ?? '(unknown)'}`,
                            normalizedRequest.context.activePageSummary
                                ? `ActivePageSummary=${normalizedRequest.context.activePageSummary}`
                                : null,
                            '[Stage:WorkingMemory]',
                            `ContextStatus=${normalizedRequest.context.contextStatus ?? 'fresh'}`,
                            normalizedRequest.context.threadGoal ? `Goal=${normalizedRequest.context.threadGoal}` : null,
                            normalizedRequest.context.threadSummary ? `Summary=${normalizedRequest.context.threadSummary}` : null,
                            Array.isArray(normalizedRequest.context.contextPins) && normalizedRequest.context.contextPins.length > 0
                                ? `Pins=${normalizedRequest.context.contextPins.join(' | ')}`
                                : null,
                        ].filter(Boolean).join('\n'),
                        threadKey: rewriteThreadKey,
                        threadId: String(payload?.threadId ?? '').trim() || undefined,
                        modelClass: 'chat_simple',
                        streamEvents: false,
                    })
                    if (!result.ok || !String(result.text ?? '').trim()) {
                        return withAudit({
                            requestId: normalizedRequest.requestId,
                            status: 'error',
                            threadId: result.threadId,
                            turnId: result.turnId,
                            turnStatus: result.turnStatus ?? inferAppServerTurnStatus(result.error),
                            validation: {
                                code: 'VALIDATION_ERROR',
                                errors: [result.error ?? 'app-server append generate failed'],
                                warnings: [],
                                previewOnly: true,
                            },
                            generatedAt: new Date().toISOString(),
                            tokenUsage: result.tokenUsage,
                            error: result.error ?? 'app-server append generate failed',
                        })
                    }
                    const envelope = buildAppendGenerationEnvelope(normalizedRequest, String(result.text ?? '').trim())
                    if (!envelope) {
                        return withAudit({
                            requestId: normalizedRequest.requestId,
                            status: 'error',
                            validation: {
                                code: 'VALIDATION_ERROR',
                                errors: ['app-server append envelope build failed'],
                                warnings: [],
                                previewOnly: true,
                            },
                            generatedAt: new Date().toISOString(),
                            error: 'app-server append envelope build failed',
                        })
                    }
                    const validation = validateAiCommandEnvelope(envelope)
                    if (!validation.ok || !validation.normalized) {
                        return withAudit({
                            requestId: normalizedRequest.requestId,
                            status: 'error',
                            validation: {
                                code: validation.code,
                                errors: [...validation.errors],
                                warnings: [...validation.warnings],
                                previewOnly: validation.previewOnly,
                            },
                            generatedAt: new Date().toISOString(),
                            error: validation.errors[0] ?? 'app-server append validation failed',
                        })
                    }
                    return withAudit({
                        requestId: normalizedRequest.requestId,
                        status: 'ok',
                        envelope: validation.normalized,
                        threadId: result.threadId,
                        turnId: result.turnId,
                        turnStatus: result.turnStatus ?? 'completed',
                        tokenUsage: result.tokenUsage,
                        validation: {
                            code: validation.code,
                            errors: [...validation.errors],
                            warnings: [...validation.warnings],
                            previewOnly: validation.previewOnly,
                        },
                        generatedAt: new Date().toISOString(),
                    })
                }

                if (!hasRewriteIntent) {
                    const fallbackEnvelope = buildStubCopilotEnvelope(normalizedRequest)
                    if (!fallbackEnvelope) {
                        return withAudit({
                            requestId: normalizedRequest.requestId,
                            status: 'needs-context',
                            validation: {
                                code: 'NEEDS_CONTEXT',
                                errors: [],
                                warnings: ['app-server fallback requires additional context'],
                                previewOnly: true,
                            },
                            generatedAt: new Date().toISOString(),
                            error: 'context required',
                        })
                    }
                    const fallbackValidation = validateAiCommandEnvelope(fallbackEnvelope)
                    if (!fallbackValidation.ok || !fallbackValidation.normalized) {
                        return withAudit({
                            requestId: normalizedRequest.requestId,
                            status: 'error',
                            validation: {
                                code: fallbackValidation.code,
                                errors: [...fallbackValidation.errors],
                                warnings: [...fallbackValidation.warnings],
                                previewOnly: fallbackValidation.previewOnly,
                            },
                            generatedAt: new Date().toISOString(),
                            error: fallbackValidation.errors[0] ?? 'app-server fallback validation failed',
                        })
                    }
                    return withAudit({
                        requestId: normalizedRequest.requestId,
                        status: 'ok',
                        envelope: fallbackValidation.normalized,
                        validation: {
                            code: fallbackValidation.code,
                            errors: [...fallbackValidation.errors],
                            warnings: [
                                ...fallbackValidation.warnings,
                                'app-server mode used stub command generator (rewrite not requested)',
                            ],
                            previewOnly: fallbackValidation.previewOnly,
                        },
                        generatedAt: new Date().toISOString(),
                    })
                }

                if (
                    !normalizedRequest.context.selectedText?.trim() ||
                    !Number.isFinite(Number(normalizedRequest.context.selectedRange?.from)) ||
                    !Number.isFinite(Number(normalizedRequest.context.selectedRange?.to))
                ) {
                    return withAudit({
                        requestId: normalizedRequest.requestId,
                        status: 'needs-context',
                        validation: {
                            code: 'NEEDS_CONTEXT',
                            errors: [],
                            warnings: ['rewrite_selection intent requires selectedText context'],
                            previewOnly: true,
                        },
                        generatedAt: new Date().toISOString(),
                        error: 'selectedText required',
                    })
                }

                const baseInstruction =
                    normalizedRequest.context.userPrompt || 'Rewrite naturally and concisely.'
                const stagedContextHint = [
                    '[Stage:ProjectMeta]',
                    `Scope=${normalizedRequest.context.scope ?? 'chapter'}`,
                    `ProjectTitle=${normalizedRequest.context.projectTitle ?? '(unknown)'}`,
                    `ChapterCount=${Number.isFinite(Number(normalizedRequest.context.chapterCount)) ? Number(normalizedRequest.context.chapterCount) : 0}`,
                    '[Stage:ChapterMeta]',
                    `ChapterId=${normalizedRequest.context.targetChapterId ?? normalizedRequest.context.chapterId ?? 'chapter-active'}`,
                    `ActivePageTitle=${normalizedRequest.context.activePageTitle ?? '(unknown)'}`,
                    `ActivePageType=${normalizedRequest.context.activePageType ?? '(unknown)'}`,
                    normalizedRequest.context.activePageSummary
                        ? `ActivePageSummary=${normalizedRequest.context.activePageSummary}`
                        : null,
                    '[Stage:WorkingMemory]',
                    `ContextStatus=${normalizedRequest.context.contextStatus ?? 'fresh'}`,
                    normalizedRequest.context.threadGoal
                        ? `Goal=${normalizedRequest.context.threadGoal}`
                        : null,
                    normalizedRequest.context.threadSummary
                        ? `Summary=${normalizedRequest.context.threadSummary}`
                        : null,
                    Array.isArray(normalizedRequest.context.contextPins) && normalizedRequest.context.contextPins.length > 0
                        ? `Pins=${normalizedRequest.context.contextPins.join(' | ')}`
                        : null,
                    '[Stage:Selection]',
                    `SelectedTextLength=${String(normalizedRequest.context.selectedText ?? '').length}`,
                ].filter(Boolean).join('\n')
                const rewriteAttempts = [
                    baseInstruction,
                    `${baseInstruction}\n\n재요청: JSON 스키마를 반드시 지키고 rewrittenText에는 결과 본문만 넣어주세요.`,
                    `${baseInstruction}\n\n재요청: 의미를 유지하면서 더 짧게(약 20~30% 축약) 다시 작성해주세요.`,
                ]
                const rewriteWarnings: string[] = []
                const rewriteThreadKey =
                    String(payload?.threadKey ?? '').trim() ||
                    `copilot:${resolveActiveUserId()}:rewrite`
                let currentThreadId = String(payload?.threadId ?? '').trim() || undefined
                let finalAppServerResult: CopilotAppServerChatResponse | null = null
                let parsed: Record<string, unknown> | null = null
                let rewrittenText = ''

                for (let attemptIndex = 0; attemptIndex < rewriteAttempts.length; attemptIndex += 1) {
                    const instruction = rewriteAttempts[attemptIndex]
                    const result = await runAppServerCompletion({
                        requestId: normalizedRequest.requestId,
                        systemPrompt:
                            'Rewrite text safely. Output must follow the provided JSON schema only.',
                        prompt: `Original:\n${normalizedRequest.context.selectedText}\n\nInstruction:\n${instruction}`,
                        contextHint: stagedContextHint,
                        threadKey: rewriteThreadKey,
                        threadId: currentThreadId,
                        modelClass: 'command_generate',
                        outputSchema: rewriteOutputSchema,
                        streamEvents: false,
                    })
                    finalAppServerResult = result
                    currentThreadId = String(result.threadId ?? '').trim() || currentThreadId

                    if (!result.ok) {
                        const retryable = result.turnStatus !== 'interrupted' && attemptIndex < rewriteAttempts.length - 1
                        if (retryable) {
                            rewriteWarnings.push(`rewrite fallback retry#${attemptIndex + 1}: ${result.error ?? 'unknown'}`)
                            continue
                        }
                        return withAudit({
                            requestId: normalizedRequest.requestId,
                            status: 'error',
                            threadId: result.threadId,
                            turnId: result.turnId,
                            turnStatus: result.turnStatus ?? inferAppServerTurnStatus(result.error),
                            validation: {
                                code: 'VALIDATION_ERROR',
                                errors: [result.error ?? 'app-server generate failed'],
                                warnings: rewriteWarnings,
                                previewOnly: true,
                            },
                            generatedAt: new Date().toISOString(),
                            tokenUsage: result.tokenUsage,
                            error: result.error ?? 'app-server generate failed',
                        })
                    }

                    parsed = parseJsonObject(result.text ?? '')
                    rewrittenText = String(parsed?.rewrittenText ?? '').trim()
                    if (!rewrittenText) {
                        const plainText = String(result.text ?? '').trim()
                        if (plainText && !plainText.startsWith('{')) {
                            rewrittenText = plainText
                            rewriteWarnings.push('rewrite fallback: non-json response body was used as rewrittenText')
                        }
                    }
                    if (rewrittenText) {
                        break
                    }
                    if (attemptIndex < rewriteAttempts.length - 1) {
                        rewriteWarnings.push(`rewrite fallback retry#${attemptIndex + 1}: empty rewrittenText`)
                    }
                }

                if (!finalAppServerResult) {
                    return withAudit({
                        requestId: normalizedRequest.requestId,
                        status: 'error',
                        validation: {
                            code: 'VALIDATION_ERROR',
                            errors: ['app-server generate failed: no response'],
                            warnings: rewriteWarnings,
                            previewOnly: true,
                        },
                        generatedAt: new Date().toISOString(),
                        error: 'app-server generate failed: no response',
                    })
                }

                if (!rewrittenText) {
                    rewrittenText = String(normalizedRequest.context.selectedText ?? '')
                    rewriteWarnings.push('rewrite fallback: original selected text was reused')
                }
                const aiRewriteEnvelope = buildDirectRewriteEnvelope(normalizedRequest, rewrittenText)
                const fallbackEnvelope = buildStubCopilotEnvelope(normalizedRequest)
                const envelope = fallbackEnvelope
                    ? {
                          ...fallbackEnvelope,
                          summary:
                              fallbackEnvelope.commands.length > 1
                                  ? `복합 작업 미리보기를 생성했습니다. (${fallbackEnvelope.commands.length}개 명령)`
                                  : aiRewriteEnvelope.summary,
                          commands: fallbackEnvelope.commands.map((command) =>
                              command.type === 'rewrite_selection'
                                  ? aiRewriteEnvelope.commands[0]
                                  : command,
                          ),
                          meta: {
                              ...(aiRewriteEnvelope.meta ?? {}),
                              modelId: `${aiRewriteEnvelope.meta?.modelId ?? 'app-server'}+stub`,
                          },
                      }
                    : aiRewriteEnvelope

                const validation = validateAiCommandEnvelope(envelope)
                if (!validation.ok || !validation.normalized) {
                    return withAudit({
                        requestId: normalizedRequest.requestId,
                        status: 'error',
                        validation: {
                            code: validation.code,
                            errors: [...validation.errors],
                            warnings: [...validation.warnings],
                            previewOnly: validation.previewOnly,
                        },
                        generatedAt: new Date().toISOString(),
                        error: validation.errors[0] ?? 'app-server generate validation failed',
                    })
                }

                return withAudit({
                    requestId: normalizedRequest.requestId,
                    status: 'ok',
                    envelope: validation.normalized,
                    threadId: finalAppServerResult.threadId,
                    turnId: finalAppServerResult.turnId,
                    turnStatus: finalAppServerResult.turnStatus ?? 'completed',
                    tokenUsage: finalAppServerResult.tokenUsage,
                    validation: {
                        code: validation.code,
                        errors: [...validation.errors],
                        warnings: [...validation.warnings, ...rewriteWarnings],
                        previewOnly: validation.previewOnly,
                    },
                    generatedAt: new Date().toISOString(),
                })
            } catch (error) {
                return withAudit({
                    requestId: fallbackRequestId,
                    status: 'error',
                    turnStatus: inferAppServerTurnStatus(
                        error instanceof Error ? error.message : String(error),
                    ),
                    validation: {
                        code: 'VALIDATION_ERROR',
                        errors: [error instanceof Error ? error.message : String(error)],
                        warnings: [],
                        previewOnly: true,
                    },
                    generatedAt: new Date().toISOString(),
                    error: error instanceof Error ? error.message : String(error),
                })
            }
        },
    )

    ipcMain.handle(
        'copilot:chat:appserver',
        async (event, request: CopilotAppServerChatRequest): Promise<CopilotAppServerChatResponse> => {
            assertTrustedSender(event)
            const requestId = String(request?.requestId ?? '').trim() || `copilot-chat-${Date.now()}`
            const directConfig = await loadDirectRuntimeConfig()
            const response: CopilotAppServerChatResponse = directConfig
                ? await runDirectCompletion({
                      baseUrl: directConfig.baseUrl,
                      apiKey: directConfig.apiKey,
                      model: directConfig.model,
                      prompt: String(request?.prompt ?? '').trim(),
                      contextHint: String(request?.contextHint ?? '').trim() || undefined,
                      systemPrompt: String(request?.systemPrompt ?? '').trim() || undefined,
                  }).then((result) => ({
                      ok: result.ok,
                      text: result.text,
                      error: result.error,
                      threadId: undefined,
                      turnId: undefined,
                      turnStatus: result.ok ? 'completed' : undefined,
                      tokenUsage: undefined,
                  }))
                : await runAppServerCompletion({
                      ...request,
                      modelClass: request?.modelClass ?? 'chat_simple',
                      threadKey:
                          String(request?.threadKey ?? '').trim() ||
                          `copilot:${resolveActiveUserId()}:chat`,
                  })

            void appendCopilotChatAuditLog({
                userId: resolveActiveUserId(),
                requestId,
                model: directConfig ? `direct:${directConfig.model}` : 'codex-app-server',
                status: response.ok ? 'ok' : 'error',
                promptAnonymized: anonymizePromptForAudit(request?.prompt),
                promptSignature: buildPromptSignature(request?.prompt),
                threadId: response.threadId,
                turnId: response.turnId,
                turnStatus:
                    response.turnStatus ??
                    (response.ok ? 'completed' : inferAppServerTurnStatus(response.error)),
                tokenTotal: response.tokenUsage?.totalTokens,
                threadTokenTotal: response.tokenUsage?.threadTotalTokens,
                userTokenTotal: response.tokenUsage?.userTotalTokens,
                error: response.ok ? undefined : response.error,
            }).catch((error) => {
                console.warn('[Copilot] app-server chat audit log failed:', error)
            })

            return response
        },
    )

    ipcMain.handle(
        'copilot:turn:interrupt:appserver',
        async (
            event,
            request: CopilotAppServerInterruptRequest,
        ): Promise<CopilotAppServerInterruptResponse> => {
            assertTrustedSender(event)
            return runAppServerInterrupt(request)
        },
    )

    ipcMain.handle(
        'copilot:turn:steer:appserver',
        async (
            event,
            request: CopilotAppServerSteerRequest,
        ): Promise<CopilotAppServerSteerResponse> => {
            assertTrustedSender(event)
            return runAppServerSteer(request)
        },
    )
}
