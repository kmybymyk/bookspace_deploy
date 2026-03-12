import type { TFunction } from 'i18next'
import type {
    CopilotActivityEntry,
    CopilotPlanDraft,
    CopilotThreadState,
    CopilotChatMessage,
    CopilotRiskLevel,
} from './rightPaneTypes'
import type { Chapter } from '../../types/project'
import { useChapterStore } from '../chapters/useChapterStore'
import { copilotApi, createCopilotRequestId, formatCopilotErrorForUser } from './copilotApi'
import { loadCopilotRuntimeConfig } from './copilotRuntimeConfig'
import {
    previewAiFeatureAccess,
    refundAiExecutionCredits,
    reserveAiExecutionCredits,
} from '../subscription/aiExecutionGate'
import { showToast } from '../../utils/toast'
import { applyCopilotEnvelope } from './applyCopilotCommands'
import { serializeCurrentProject } from '../../utils/projectSnapshot'
import { createSnapshotSafe } from '../../utils/snapshotOps'
import {
    advanceAgentSteps,
    advanceAgentTasks,
    buildBookMemoryNotes,
    buildCheckResult,
    buildEvaluationResult,
    buildFailureEvaluation,
    buildGuardrailStatus,
    buildInterruptedRunResumePrompt,
    buildOpenRunContinuePrompt,
    buildRuntimeStatus,
    buildWorkingMemoryNotes,
    closeAgentRun,
    markAgentRunInterrupted,
    refreshThreadContextState,
    startAgentRun,
    updateAgentRun,
    type CopilotThreadContextSnapshot,
} from './rightPaneAgentUtils'
import { resolveIntentToolIds } from '../../../shared/copilotToolRegistry'
import {
    readPageById,
    readHeadingTree,
    validateCurrentPageContent,
} from './editorToolAdapter'
import { shouldSkipPreviewReview } from './rightPaneUtils'
import { buildPageStructureSnapshot, resolvePromptPageReference } from './pageReferenceResolver'
import {
    buildGeneratedDraftFromSpecialistExecutions,
    buildSpecialistArtifactFromEnvelope,
    buildSpecialistExecutionRunState,
    buildSpecialistExecutionsFromChat,
    buildSpecialistHandoffFromEnvelope,
    formatSpecialistArtifactMessage,
    formatSpecialistHandoffMessage,
} from './specialistArtifacts'
import { resolveAgentV3ChatMode, type AgentV3ChatMode } from './agentV3Routing'
import { formatCopilotFeatureGuideReply } from '../../../shared/copilotFeatureGuides'
import { buildBookContextReviewSnapshot } from './bookContextReview'

interface RightPaneCopilotActionsDeps {
    t: TFunction
    copilotBusy: boolean
    setCopilotBusy: (next: boolean) => void
    copilotApplying: boolean
    setCopilotApplying: (next: boolean) => void
    activeThread: CopilotThreadState | undefined
    getThreadById: (threadId: string) => CopilotThreadState | undefined
    activeChapter: Chapter | undefined
    chaptersCount: number
    projectMetadataTitle: string | undefined
    projectPath: string | null
    threadContextSnapshot: CopilotThreadContextSnapshot | null
    resolveCopilotContext: (
        prompt: string,
        intent?: CopilotPlanDraft['resolvedIntent'] | null,
    ) => {
        scope: 'selection' | 'chapter' | 'project'
        selectedText: string
        activePageSummary?: string
        selectedRange?: {
            from: number
            to: number
        }
    }
    updateThreadById: (
        threadId: string,
        updater: (thread: CopilotThreadState) => CopilotThreadState,
    ) => void
    updateActiveThread: (updater: (thread: CopilotThreadState) => CopilotThreadState) => void
    createMessage: (role: CopilotChatMessage['role'], text: string) => CopilotChatMessage
    appendActivity: (
        threadId: string,
        entry: Omit<CopilotActivityEntry, 'id' | 'createdAt'>,
    ) => void
    appendAssistantMessage: (text: string) => void
    evaluatePreviewRisk: () => { level: CopilotRiskLevel; reasons: string[] }
}

function buildFallbackChatReply(prompt: string, t: TFunction): string {
    const text = prompt.trim().toLowerCase()
    if (/^(안녕|하이|hello|hi)\b/.test(text)) {
        return t('rightPane.chatFallbackGreeting')
    }
    if (/(기능|어떻게|어디서|있어\?|있나요|지원해|import|export|epub|docx)/i.test(text)) {
        return '지금 질문은 기능 안내로 보입니다. 원하는 작업을 한 문장으로 다시 물어보시면, 가능한지 여부와 사용 경로를 먼저 정리해드리겠습니다.'
    }
    if (/(흐름|문체|감정선|반복|톤|말투|일관성|피드백|검토|리뷰|어때)/i.test(text)) {
        return '지금 질문은 원고 상담으로 보입니다. 현재 페이지나 고민 지점을 조금만 더 붙여주시면, 판단과 근거, 수정 방향까지 짧게 정리해드리겠습니다.'
    }
    return t('rightPane.chatFallbackNoResponse')
}

function isInterruptedError(error: unknown): boolean {
    const text = String(error instanceof Error ? error.message : error ?? '').toLowerCase().trim()
    if (!text) return false
    return text.includes('interrupted') || text.includes('cancel')
}

function resolveChatModelClass(prompt: string): 'chat_simple' | 'command_generate' {
    const text = String(prompt ?? '').trim()
    if (!text) return 'chat_simple'
    const complexPattern =
        /(rewrite|교정|다듬|명령|command|챕터|create|표|table|삽화|illustration|구성|outline|플랜|plan|요약|summary)/i
    if (text.length > 160 || complexPattern.test(text)) {
        return 'command_generate'
    }
    return 'chat_simple'
}

function intentLabel(intent: CopilotPlanDraft['resolvedIntent'], t: TFunction): string {
    if (intent === 'rewrite_selection') return t('rightPane.intent.rewriteSelection')
    if (intent === 'append_text') return t('rightPane.intent.appendText')
    if (intent === 'find_replace') return t('rightPane.intent.findReplace')
    if (intent === 'save_project') return t('rightPane.intent.saveProject')
    if (intent === 'rename_chapter') return t('rightPane.intent.renameChapter')
    if (intent === 'delete_chapter') return t('rightPane.intent.deleteChapter')
    if (intent === 'move_chapter') return t('rightPane.intent.moveChapter')
    if (intent === 'set_chapter_type') return t('rightPane.intent.setChapterType')
    if (intent === 'set_typography') return t('rightPane.intent.setTypography')
    if (intent === 'set_page_background') return t('rightPane.intent.setPageBackground')
    if (intent === 'apply_theme') return t('rightPane.intent.applyTheme')
    if (intent === 'update_book_info') return t('rightPane.intent.updateBookInfo')
    if (intent === 'set_cover_asset') return t('rightPane.intent.setCoverAsset')
    if (intent === 'export_project') return t('rightPane.intent.exportProject')
    if (intent === 'restore_snapshot') return t('rightPane.intent.restoreSnapshot')
    if (intent === 'create_chapter') return t('rightPane.intent.createChapter')
    if (intent === 'insert_table') return t('rightPane.intent.insertTable')
    if (intent === 'insert_illustration') return t('rightPane.intent.insertIllustration')
    return t('rightPane.intent.feedbackReport')
}

function toolLabel(toolId: string, t: TFunction): string {
    if (toolId === 'chapter_context_scan') return t('rightPane.tool.chapterContextScan')
    if (toolId === 'page_structure_read') return t('rightPane.tool.pageStructureRead')
    if (toolId === 'current_block_read') return t('rightPane.tool.currentBlockRead')
    if (toolId === 'command_planner') return t('rightPane.tool.commandPlanner')
    if (toolId === 'review_gate') return t('rightPane.tool.reviewGate')
    if (toolId === 'command_apply') return t('rightPane.tool.commandApply')
    if (toolId === 'current_block_write') return t('rightPane.tool.currentBlockWrite')
    if (toolId === 'snapshot_checkpoint') return t('rightPane.tool.snapshotCheckpoint')
    if (toolId === 'page_content_validate') return t('rightPane.tool.pageContentValidate')
    return t('rightPane.tool.postApplyCheck')
}

function formatToolTrace(intent: CopilotPlanDraft['resolvedIntent'], t: TFunction): string {
    return resolveIntentToolIds(intent).map((toolId) => toolLabel(toolId, t)).join(' -> ')
}

function resolveContextPage(args: {
    prompt: string
    explicitTargetChapterId?: string
    activeChapter?: Chapter
}) {
    const { prompt, explicitTargetChapterId, activeChapter } = args
    const chapterState = useChapterStore.getState()
    const referencedPage = resolvePromptPageReference(
        prompt,
        buildPageStructureSnapshot({
            chapters: chapterState.chapters,
            activeChapterId: chapterState.activeChapterId,
        }),
    )
    const targetChapterId = explicitTargetChapterId || referencedPage.targetChapterId || activeChapter?.id
    const snapshot = readPageById(targetChapterId ?? null) ?? readPageById(activeChapter?.id ?? null)
    const headingSummary = targetChapterId
        ? readHeadingTree(targetChapterId)
              .slice(0, 3)
              .map((heading) => heading.text)
              .filter(Boolean)
              .join(' | ')
        : ''
    return {
        targetChapterId: explicitTargetChapterId || referencedPage.targetChapterId || undefined,
        page: snapshot
            ? {
                  ...snapshot,
                  structureSummary: headingSummary
                      ? `${snapshot.structureSummary}, headings=${headingSummary}`
                      : snapshot.structureSummary,
              }
            : snapshot,
    }
}

function prependRecentItem<T extends { id: string }>(items: T[], next: T | null, limit = 6): T[] {
    if (!next) return items.slice(0, limit)
    return [next, ...items.filter((item) => item.id !== next.id)].slice(0, limit)
}

function prependRecentItems<T extends { id: string }>(items: T[], nextItems: T[], limit = 6): T[] {
    return nextItems.reduceRight((acc, item) => prependRecentItem(acc, item, limit), items.slice(0, limit))
}

function removeThinkingMessages(messages: CopilotChatMessage[], thinkingText: string): CopilotChatMessage[] {
    return messages.filter(
        (message) =>
            !(
                message.role === 'assistant' &&
                String(message.text ?? '').trim() === thinkingText
            ),
    )
}

type ResolvedGeneralChatContext = {
    inferredContext: ReturnType<RightPaneCopilotActionsDeps['resolveCopilotContext']>
    resolvedContextPage: ReturnType<typeof resolveContextPage>
    contextChapterId: string | undefined
    requestedMode: AgentV3ChatMode | undefined
    bookContextReview: ReturnType<typeof buildBookContextReviewSnapshot> | null
}

function resolveGeneralChatContext(args: {
    prompt: string
    activeChapter: Chapter | undefined
    resolveCopilotContext: RightPaneCopilotActionsDeps['resolveCopilotContext']
}): ResolvedGeneralChatContext {
    const inferredContext = args.resolveCopilotContext(args.prompt, null)
    const resolvedContextPage = resolveContextPage({
        prompt: args.prompt,
        activeChapter: args.activeChapter,
    })
    const contextChapterId = resolvedContextPage.targetChapterId ?? args.activeChapter?.id
    const requestedMode = resolveAgentV3ChatMode(args.prompt) ?? undefined
    const bookContextReview =
        requestedMode === 'book_context_review' || requestedMode === 'release_editorial_check'
            ? buildBookContextReviewSnapshot({
                  prompt: args.prompt,
                  activeChapterId: contextChapterId ?? null,
                  pages: useChapterStore.getState().chapters.map((chapter) => {
                      const page = readPageById(chapter.id)
                      return {
                          id: chapter.id,
                          title: chapter.title,
                          order: chapter.order,
                          parentId: chapter.parentId ?? null,
                          chapterType: chapter.chapterType,
                          chapterKind: chapter.chapterKind,
                          structureSummary: page?.structureSummary,
                      }
                  }),
              })
            : null

    return {
        inferredContext,
        resolvedContextPage,
        contextChapterId,
        requestedMode,
        bookContextReview,
    }
}

function resolveProductGuideReply(prompt: string, requestedMode: AgentV3ChatMode | undefined): string | null {
    if (requestedMode !== 'product_guidance') return null
    return formatCopilotFeatureGuideReply(prompt)
}

function commitDeterministicChatReply(args: {
    thread: CopilotThreadState
    replyText: string
    createMessage: RightPaneCopilotActionsDeps['createMessage']
    t: TFunction
}): CopilotThreadState {
    const withoutThinking = removeThinkingMessages(args.thread.messages, args.t('centerPane.aiChatThinking'))
    const nextThread: CopilotThreadState = {
        ...args.thread,
        turnState: 'completed',
        turnError: null,
        messages: [...withoutThinking, args.createMessage('assistant', args.replyText)],
    }
    return {
        ...nextThread,
        ...refreshThreadContextState({ thread: nextThread, t: args.t }),
    }
}

function buildGeneralChatRequestContext(args: {
    projectMetadataTitle: string | undefined
    chaptersCount: number
    threadContextSnapshot: CopilotThreadContextSnapshot | null
    activeChapter: Chapter | undefined
    resolved: ResolvedGeneralChatContext
}): Parameters<typeof copilotApi.chat>[0]['context'] {
    const { resolved } = args
    return {
        chapterId: resolved.contextChapterId,
        selectedText: resolved.inferredContext.selectedText,
        selectedRange: resolved.inferredContext.selectedRange,
        scope: resolved.inferredContext.scope,
        projectTitle: args.projectMetadataTitle,
        chapterCount: args.chaptersCount,
        activePageTitle: resolved.resolvedContextPage.page?.title ?? args.activeChapter?.title,
        activePageType:
            resolved.resolvedContextPage.page?.chapterKind ||
            resolved.resolvedContextPage.page?.chapterType ||
            (args.activeChapter?.id === resolved.resolvedContextPage.page?.chapterId
                ? args.activeChapter.chapterKind || args.activeChapter.chapterType || 'none'
                : 'none'),
        activePageSummary:
            resolved.resolvedContextPage.page?.structureSummary ??
            resolved.inferredContext.activePageSummary,
        threadGoal: args.threadContextSnapshot?.goal ?? undefined,
        threadSummary: args.threadContextSnapshot?.summary ?? undefined,
        rollingSummary: args.threadContextSnapshot?.rollingSummary ?? undefined,
        contextPins: args.threadContextSnapshot?.pins ?? undefined,
        sessionMemory: args.threadContextSnapshot?.sessionMemory ?? undefined,
        bookMemory: args.threadContextSnapshot?.bookMemory ?? undefined,
        recentArtifacts: args.threadContextSnapshot?.recentArtifacts ?? undefined,
        contextStatus: args.threadContextSnapshot?.status ?? undefined,
        requestedMode: resolved.requestedMode,
        bookContextOutline: resolved.bookContextReview?.outline ?? undefined,
        bookContextEvidence: resolved.bookContextReview?.evidence ?? undefined,
        bookContextConfidence: resolved.bookContextReview?.confidence ?? undefined,
    }
}

function resolveChatReplyText(args: {
    reply: Awaited<ReturnType<typeof copilotApi.chat>>
    prompt: string
    t: TFunction
    latestThread: CopilotThreadState | undefined
}): {
    budgetExceeded: boolean
    budgetErrorText: string | null
    normalizedReplyText: string
    finalText: string | null
} {
    const budgetExceeded = Boolean(
        args.reply.tokenUsage?.threadBudgetExceeded || args.reply.tokenUsage?.userBudgetExceeded,
    )
    const budgetErrorText = budgetExceeded ? args.t('rightPane.tokenBudgetExceeded') : null
    const normalizedReplyText = String(args.reply.text ?? '').trim()
    const hasMeaningfulAssistantMessage = Boolean(
        args.latestThread?.messages.some((message) => {
            const text = String(message.text ?? '').trim()
            return (
                message.role === 'assistant' &&
                text.length > 0 &&
                text !== args.t('centerPane.aiChatThinking')
            )
        }),
    )
    const shouldUseNoResponseFallback =
        args.reply.status === 'ok' &&
        !budgetExceeded &&
        !normalizedReplyText &&
        !hasMeaningfulAssistantMessage
    const nextText =
        args.reply.status === 'ok' && normalizedReplyText
            ? normalizedReplyText
            : args.reply.error
                ? `${args.t('centerPane.aiGenerateFailed', { error: args.reply.error })}`
                : shouldUseNoResponseFallback
                    ? buildFallbackChatReply(args.prompt, args.t)
                    : null

    return {
        budgetExceeded,
        budgetErrorText,
        normalizedReplyText,
        finalText: budgetErrorText ?? nextText,
    }
}

export function createRightPaneCopilotActions(deps: RightPaneCopilotActionsDeps) {
    const {
        t,
        copilotBusy,
        setCopilotBusy,
        copilotApplying,
        setCopilotApplying,
        activeThread,
        getThreadById,
        activeChapter,
        chaptersCount,
        projectMetadataTitle,
        projectPath,
        threadContextSnapshot,
        resolveCopilotContext,
        updateThreadById,
        updateActiveThread,
        createMessage,
        appendActivity,
        appendAssistantMessage,
        evaluatePreviewRisk,
    } = deps

    const appendThinkingMessage = (threadId: string) => {
        updateThreadById(threadId, (thread) => ({
            ...thread,
            turnState: 'planning',
            turnError: null,
            streamSoftLimitNotified: false,
            messages: [...thread.messages, createMessage('assistant', t('centerPane.aiChatThinking'))],
        }))
    }

    const replaceThinkingMessage = (threadId: string, text: string) => {
        updateThreadById(threadId, (thread) => ({
            ...thread,
            turnState: 'completed',
            turnError: null,
            messages: (() => {
                const withoutThinking = thread.messages.filter(
                    (message) =>
                        !(
                            message.role === 'assistant' &&
                            String(message.text ?? '').trim() === t('centerPane.aiChatThinking')
                        ),
                )
                if (withoutThinking.length === 0) {
                    return [createMessage('assistant', text)]
                }
                const lastIndex = withoutThinking.length - 1
                const last = withoutThinking[lastIndex]
                if (
                    last.role === 'assistant' &&
                    (thread.turnState === 'streaming' ||
                        String(last.text ?? '').trim() === String(text ?? '').trim() ||
                        String(text ?? '').startsWith(String(last.text ?? '')))
                ) {
                    const next = [...withoutThinking]
                    next[lastIndex] = {
                        ...last,
                        text,
                    }
                    return next
                }
                return [...withoutThinking, createMessage('assistant', text)]
            })(),
        }))
    }

    const runGeneralChatReply = async (targetThreadId: string, prompt: string) => {
        if (copilotBusy) return
        setCopilotBusy(true)
        appendThinkingMessage(targetThreadId)
        appendActivity(targetThreadId, {
            label: t('rightPane.activityChatStarted'),
            detail: prompt,
            tone: 'info',
        })

        try {
            const runtimeConfig = await loadCopilotRuntimeConfig().catch(() => null)
            const resolvedChatContext = resolveGeneralChatContext({
                prompt,
                activeChapter,
                resolveCopilotContext,
            })
            const productGuideReply = resolveProductGuideReply(
                prompt,
                resolvedChatContext.requestedMode,
            )
            if (productGuideReply) {
                updateThreadById(targetThreadId, (thread) => {
                    return commitDeterministicChatReply({
                        thread,
                        replyText: productGuideReply,
                        createMessage,
                        t,
                    })
                })
                appendActivity(targetThreadId, {
                    label: t('rightPane.activityChatCompleted'),
                    detail: 'product-guide-kb',
                    tone: 'success',
                })
                return
            }
            const reply = await copilotApi.chat({
                requestId: createCopilotRequestId('copilot-chat'),
                prompt,
                threadKey: activeThread?.appServerThreadKey,
                threadId: activeThread?.appServerThreadId ?? undefined,
                modelClass: resolveChatModelClass(prompt),
                context: buildGeneralChatRequestContext({
                    projectMetadataTitle,
                    chaptersCount,
                    threadContextSnapshot,
                    activeChapter,
                    resolved: resolvedChatContext,
                }),
            })

            const latestThread = getThreadById(targetThreadId)
            const { budgetExceeded, budgetErrorText, normalizedReplyText, finalText } =
                resolveChatReplyText({
                    reply,
                    prompt,
                    t,
                    latestThread,
                })

            const specialistExecutions =
                reply.status === 'ok' && !budgetExceeded && normalizedReplyText
                    ? buildSpecialistExecutionsFromChat({
                          prompt,
                          replyText: normalizedReplyText,
                          leadSummary: threadContextSnapshot?.goal ?? 'book run',
                      })
                    : { handoffs: [], artifacts: [] }
            const specialistHandoff =
                specialistExecutions.handoffs.length > 0
                    ? specialistExecutions.handoffs[specialistExecutions.handoffs.length - 1]
                    : null
            const specialistArtifact =
                specialistExecutions.artifacts.length > 0
                    ? specialistExecutions.artifacts[specialistExecutions.artifacts.length - 1]
                    : null
            const specialistRunState = buildSpecialistExecutionRunState({
                handoffs: specialistExecutions.handoffs,
                artifacts: specialistExecutions.artifacts,
            })
            const specialistRun =
                specialistRunState && specialistRunState.keepOpen
                    ? updateAgentRun(
                          startAgentRun({
                              goalSummary: threadContextSnapshot?.goal ?? String(prompt ?? '').trim().slice(0, 48),
                              taskIds: specialistRunState.taskIds,
                          }),
                          {
                              phase: specialistRunState.phase,
                              lastEvaluationSummary: specialistRunState.summary,
                          },
                      )
                    : null
            const completedChatRun =
                specialistRunState && !specialistRunState.keepOpen
                    ? closeAgentRun(
                          startAgentRun({
                              goalSummary: threadContextSnapshot?.goal ?? String(prompt ?? '').trim().slice(0, 48),
                              taskIds: specialistRunState.taskIds,
                          }),
                          {
                              status: 'completed',
                              phase: 'completed',
                              lastEvaluationSummary: specialistRunState.summary,
                          },
                      )
                    : null
            const generatedDraftFromChain =
                reply.status === 'ok' && !budgetExceeded && normalizedReplyText
                    ? buildGeneratedDraftFromSpecialistExecutions({
                          prompt,
                          replyText: normalizedReplyText,
                          targetChapterId: resolvedChatContext.resolvedContextPage.targetChapterId ?? null,
                      })
                    : null

            updateThreadById(targetThreadId, (thread) => {
                const withoutThinking = removeThinkingMessages(
                    thread.messages,
                    t('centerPane.aiChatThinking'),
                )
                const nextMessages =
                    finalText && reply.status === 'ok' && !budgetExceeded
                        ? [
                              ...withoutThinking,
                              ...specialistExecutions.handoffs.map((handoff) =>
                                  createMessage('assistant', formatSpecialistHandoffMessage(handoff)),
                              ),
                              ...specialistExecutions.artifacts.map((artifact) =>
                                  createMessage('assistant', formatSpecialistArtifactMessage(artifact)),
                              ),
                              createMessage('assistant', finalText),
                          ]
                        : withoutThinking
                const nextSessionMemory = thread.sessionMemory
                const nextThread: CopilotThreadState = {
                    ...thread,
                    turnState:
                        reply.status === 'ok' && !budgetExceeded ? 'completed' : 'failed',
                    turnError:
                        reply.status === 'ok' && !budgetExceeded
                            ? null
                            : budgetErrorText ?? finalText ?? null,
                    appServerThreadId: reply.threadId ? String(reply.threadId) : thread.appServerThreadId,
                    appServerTurnId: reply.turnId ? String(reply.turnId) : thread.appServerTurnId,
                    lastTokenUsage: reply.tokenUsage ?? thread.lastTokenUsage,
                    lastGeneratedDraft:
                        generatedDraftFromChain ??
                        (reply.status === 'ok' && !budgetExceeded && normalizedReplyText
                            ? {
                                  text: normalizedReplyText,
                                  sourcePrompt: prompt,
                                  createdAt: new Date().toISOString(),
                                  targetChapterId:
                                      resolvedChatContext.resolvedContextPage.targetChapterId ?? null,
                              }
                            : thread.lastGeneratedDraft),
                    latestHandoff: specialistHandoff,
                    latestArtifact: specialistArtifact,
                    recentHandoffs: prependRecentItems(thread.recentHandoffs, specialistExecutions.handoffs),
                    recentArtifacts: prependRecentItems(thread.recentArtifacts, specialistExecutions.artifacts),
                    currentRun: specialistRun,
                    recentRuns: prependRecentItem(thread.recentRuns, completedChatRun),
                    workingMemoryNotes:
                        reply.status === 'ok' && !budgetExceeded
                            ? buildWorkingMemoryNotes({
                                  prompt,
                                  selectedContext: resolvedChatContext.inferredContext.selectedText,
                                  latestHandoffSummary: specialistHandoff?.summary ?? null,
                                  latestArtifactSummary: specialistArtifact?.summary ?? null,
                                  t,
                              })
                            : thread.workingMemoryNotes,
                    bookMemoryNotes: buildBookMemoryNotes({
                        previous: thread.bookMemoryNotes,
                        metadata: {
                            title: projectMetadataTitle ?? '',
                            subtitle: '',
                            authors: [],
                            language: '',
                            publisher: '',
                            isbn: '',
                            link: '',
                            description: '',
                        },
                        sessionMemory: nextSessionMemory,
                        t,
                    }),
                    lastRuntimeStatus: buildRuntimeStatus({
                        mode: runtimeConfig?.mode ?? 'appserver',
                        source: 'chat',
                        modelHint: runtimeConfig?.directModel ?? null,
                        directBaseUrl: runtimeConfig?.directBaseUrl ?? null,
                        hasDirectApiKey: runtimeConfig?.hasDirectApiKey ?? false,
                        tokenUsage: reply.tokenUsage ?? null,
                        errorText:
                            reply.status === 'ok' && !budgetExceeded
                                ? null
                                : budgetErrorText ?? finalText ?? null,
                    }),
                    messages: nextMessages,
                }
                return {
                    ...nextThread,
                    ...refreshThreadContextState({ thread: nextThread, t }),
                }
            })
            if (finalText && !(reply.status === 'ok' && !budgetExceeded)) {
                replaceThinkingMessage(targetThreadId, finalText)
            }
            appendActivity(targetThreadId, {
                label:
                    reply.status === 'ok' && !budgetExceeded
                        ? t('rightPane.activityChatCompleted')
                        : t('rightPane.activityChatFailed'),
                detail: budgetErrorText ?? null,
                tone: reply.status === 'ok' && !budgetExceeded ? 'success' : 'error',
            })
            if (reply.status !== 'ok' || budgetExceeded) {
                updateThreadById(targetThreadId, (thread) => {
                    const nextThread: CopilotThreadState = {
                        ...thread,
                        turnState: 'failed',
                        turnError: finalText ?? thread.turnError,
                    }
                    return {
                        ...nextThread,
                        ...refreshThreadContextState({ thread: nextThread, t }),
                    }
                })
            }
        } catch (error) {
            console.warn('[Copilot] general chat failed:', error)
            if (isInterruptedError(error)) {
                replaceThinkingMessage(targetThreadId, t('rightPane.turnInterrupted'))
                appendActivity(targetThreadId, {
                    label: t('rightPane.activityInterrupted'),
                    detail: null,
                    tone: 'warning',
                })
                updateThreadById(targetThreadId, (thread) => {
                    const nextThread: CopilotThreadState = {
                        ...thread,
                        turnState: 'interrupted',
                        turnError: null,
                        currentRun: markAgentRunInterrupted(thread.currentRun, {
                            lastEvaluationSummary: t('rightPane.turnInterrupted'),
                        }),
                        lastRecoveryHint: t('rightPane.turnInterrupted'),
                    }
                    return {
                        ...nextThread,
                        ...refreshThreadContextState({ thread: nextThread, t }),
                    }
                })
                return
            }
            const errorText = t('centerPane.aiGenerateFailed', {
                error: formatCopilotErrorForUser(error),
            })
            replaceThinkingMessage(targetThreadId, errorText)
            appendActivity(targetThreadId, {
                label: t('rightPane.activityChatFailed'),
                detail: errorText,
                tone: 'error',
            })
            updateThreadById(targetThreadId, (thread) => {
                const nextThread: CopilotThreadState = {
                    ...thread,
                    turnState: 'failed',
                    turnError: String(errorText),
                    lastRuntimeStatus: buildRuntimeStatus({
                        mode: 'appserver',
                        source: 'chat',
                        errorText,
                    }),
                }
                return {
                    ...nextThread,
                    ...refreshThreadContextState({ thread: nextThread, t }),
                }
            })
        } finally {
            setCopilotBusy(false)
        }
    }

    const runGeneratePreview = async (targetThreadId: string, targetPlan: CopilotPlanDraft) => {
        if (copilotBusy) return
        setCopilotBusy(true)
        const toolTrace = formatToolTrace(targetPlan.resolvedIntent, t)
        appendThinkingMessage(targetThreadId)
        appendActivity(targetThreadId, {
            label: t('rightPane.activityPreviewStarted'),
            detail: `${intentLabel(targetPlan.resolvedIntent, t)} · ${toolTrace}`,
            tone: 'info',
        })

        try {
            const runtimeConfig = await loadCopilotRuntimeConfig().catch(() => null)
            const consumeOnOpen =
                String(import.meta.env.VITE_COPILOT_OPEN_CONSUME_CREDIT ?? '').toLowerCase().trim() === '1'
            const operationId = `copilot-panel-${Date.now()}`
            let reserved:
                | {
                      operationId: string
                      idempotencyKey: string
                  }
                | null = null

            let resolvedGate: Awaited<ReturnType<typeof previewAiFeatureAccess>>
            if (consumeOnOpen) {
                const result = await reserveAiExecutionCredits({
                    featureId: 'ai.chat.ask',
                    operationId,
                    requiredCredits: 1,
                })
                resolvedGate = result.gate
                if (result.gate.allowed) {
                    reserved = {
                        operationId,
                        idempotencyKey: result.idempotencyKey,
                    }
                }
            } else {
                resolvedGate = await previewAiFeatureAccess({
                    featureId: 'ai.chat.ask',
                    requiredCredits: 1,
                })
            }

            if (!resolvedGate.allowed) {
                const lockedMessage =
                    resolvedGate.reason === 'insufficient-ai-credits'
                        ? t('centerPane.aiInsufficientCredits')
                        : t('centerPane.aiLockedPro')
                showToast(lockedMessage, 'info')
                replaceThinkingMessage(targetThreadId, lockedMessage)
                appendActivity(targetThreadId, {
                    label: t('rightPane.activityPreviewBlocked'),
                    detail: lockedMessage,
                    tone: 'warning',
                })
                updateThreadById(targetThreadId, (thread) => ({
                    ...thread,
                    turnState: 'failed',
                    turnError: lockedMessage,
                    lastGuardrailStatus: buildGuardrailStatus({
                        featureId: 'ai.chat.ask',
                        allowed: resolvedGate.allowed,
                        plan: resolvedGate.plan,
                        aiCreditsRemaining: resolvedGate.aiCreditsRemaining,
                        reason: resolvedGate.reason,
                        checkedAt: resolvedGate.checkedAt,
                    }),
                    lastRuntimeStatus: buildRuntimeStatus({
                        mode: runtimeConfig?.mode ?? 'appserver',
                        source: 'preview',
                        modelHint: runtimeConfig?.directModel ?? null,
                        directBaseUrl: runtimeConfig?.directBaseUrl ?? null,
                        hasDirectApiKey: runtimeConfig?.hasDirectApiKey ?? false,
                        errorText: lockedMessage,
                    }),
                    agentSteps: advanceAgentSteps(thread.agentSteps, {
                        plan: 'blocked',
                        review: 'blocked',
                    }),
                    agentTasks: advanceAgentTasks(thread.agentTasks, {
                        prepare_preview: 'blocked',
                        review_changes: 'blocked',
                        apply_changes: 'blocked',
                    }),
                    lastEvaluation: buildFailureEvaluation({
                        error: lockedMessage,
                        needsUser: true,
                        t,
                    }),
                }))
                return
            }

            const refundReservedCredits = async () => {
                if (!reserved) return
                const target = reserved
                reserved = null
                try {
                    const refundResult = await refundAiExecutionCredits({
                        featureId: 'ai.chat.ask',
                        operationId: target.operationId,
                        idempotencyKey: target.idempotencyKey,
                        reason: 'policy-blocked',
                    })
                    if (refundResult.status === 'not-found') {
                        showToast(t('centerPane.aiRefundFailed'), 'error')
                    }
                } catch (refundError) {
                    console.warn('[AI] copilot panel credit refund failed:', refundError)
                    showToast(t('centerPane.aiRefundFailed'), 'error')
                }
            }

            let generation: Awaited<ReturnType<typeof copilotApi.generateCommands>>
            try {
                const effectivePrompt = targetPlan.normalizedPrompt || targetPlan.prompt
                const inferredContext = resolveCopilotContext(effectivePrompt, targetPlan.resolvedIntent)
                const resolvedContextPage = resolveContextPage({
                    prompt: effectivePrompt,
                    explicitTargetChapterId: targetPlan.explicitTargetChapterId,
                    activeChapter,
                })
                generation = await copilotApi.generateCommands({
                    requestId: createCopilotRequestId('copilot-panel'),
                    idempotencyKey: reserved?.idempotencyKey,
                    intent: targetPlan.resolvedIntent,
                    baseProjectRevision: 'rev_local_preview',
                    threadKey: activeThread?.appServerThreadKey,
                    threadId: activeThread?.appServerThreadId ?? undefined,
                    context: {
                        chapterId: activeChapter?.id,
                        targetChapterId: resolvedContextPage.targetChapterId,
                        pageStructure: buildPageStructureSnapshot({
                            chapters: useChapterStore.getState().chapters,
                            activeChapterId: useChapterStore.getState().activeChapterId,
                        }).pages,
                        selectedText: inferredContext.selectedText,
                        selectedRange: inferredContext.selectedRange,
                        userPrompt: effectivePrompt,
                        scope: inferredContext.scope,
                        projectTitle: projectMetadataTitle,
                        chapterCount: chaptersCount,
                        activePageTitle: resolvedContextPage.page?.title ?? activeChapter?.title,
                        activePageType:
                            resolvedContextPage.page?.chapterKind ||
                            resolvedContextPage.page?.chapterType ||
                            (activeChapter?.id === resolvedContextPage.page?.chapterId
                                ? activeChapter.chapterKind || activeChapter.chapterType || 'none'
                                : 'none'),
                        activePageSummary:
                            resolvedContextPage.page?.structureSummary ?? inferredContext.activePageSummary,
                        threadGoal: threadContextSnapshot?.goal ?? undefined,
                        threadSummary: threadContextSnapshot?.summary ?? undefined,
                        rollingSummary: threadContextSnapshot?.rollingSummary ?? undefined,
                        contextPins: threadContextSnapshot?.pins ?? undefined,
                        sessionMemory: threadContextSnapshot?.sessionMemory ?? undefined,
                        bookMemory: threadContextSnapshot?.bookMemory ?? undefined,
                        recentArtifacts: threadContextSnapshot?.recentArtifacts ?? undefined,
                        contextStatus: threadContextSnapshot?.status ?? undefined,
                    },
                    preview: true,
                })
            } catch (generationError) {
                await refundReservedCredits()
                if (isInterruptedError(generationError)) {
                    replaceThinkingMessage(targetThreadId, t('rightPane.turnInterrupted'))
                    appendActivity(targetThreadId, {
                        label: t('rightPane.activityInterrupted'),
                        detail: null,
                        tone: 'warning',
                    })
                    updateThreadById(targetThreadId, (thread) => ({
                        ...thread,
                        turnState: 'interrupted',
                        turnError: null,
                        currentRun: markAgentRunInterrupted(thread.currentRun, {
                            lastEvaluationSummary: t('rightPane.turnInterrupted'),
                        }),
                        lastRecoveryHint: t('rightPane.turnInterrupted'),
                        lastRuntimeStatus: buildRuntimeStatus({
                            mode: runtimeConfig?.mode ?? 'appserver',
                            source: 'preview',
                            modelHint: runtimeConfig?.directModel ?? null,
                            directBaseUrl: runtimeConfig?.directBaseUrl ?? null,
                            hasDirectApiKey: runtimeConfig?.hasDirectApiKey ?? false,
                            errorText: t('rightPane.turnInterrupted'),
                        }),
                        agentSteps: advanceAgentSteps(thread.agentSteps, {
                            plan: 'blocked',
                        }),
                        agentTasks: advanceAgentTasks(thread.agentTasks, {
                            prepare_preview: 'blocked',
                        }),
                        lastEvaluation: buildFailureEvaluation({
                            error: t('rightPane.turnInterrupted'),
                            t,
                        }),
                    }))
                    return
                }
                const errorMessage = t('centerPane.aiGenerateFailed', {
                    error: formatCopilotErrorForUser(generationError),
                })
                showToast(errorMessage, 'error')
                replaceThinkingMessage(targetThreadId, errorMessage)
                appendActivity(targetThreadId, {
                    label: t('rightPane.activityPreviewFailed'),
                    detail: errorMessage,
                    tone: 'error',
                })
                updateThreadById(targetThreadId, (thread) => {
                    const nextThread: CopilotThreadState = {
                        ...thread,
                        turnState: 'failed',
                        turnError: String(errorMessage),
                        lastRuntimeStatus: buildRuntimeStatus({
                            mode: runtimeConfig?.mode ?? 'appserver',
                            source: 'preview',
                            modelHint: runtimeConfig?.directModel ?? null,
                            directBaseUrl: runtimeConfig?.directBaseUrl ?? null,
                            hasDirectApiKey: runtimeConfig?.hasDirectApiKey ?? false,
                            errorText: String(errorMessage),
                        }),
                        agentSteps: advanceAgentSteps(thread.agentSteps, {
                            plan: 'blocked',
                            review: 'blocked',
                        }),
                        agentTasks: advanceAgentTasks(thread.agentTasks, {
                            prepare_preview: 'blocked',
                            review_changes: 'blocked',
                        }),
                        lastEvaluation: buildFailureEvaluation({
                            error: String(errorMessage),
                            t,
                        }),
                    }
                    return {
                        ...nextThread,
                        ...refreshThreadContextState({ thread: nextThread, t }),
                    }
                })
                return
            }

            await refundReservedCredits()

            if (generation.status === 'needs-context') {
                const contextError = t('centerPane.aiNeedsContext')
                showToast(contextError, 'info')
                replaceThinkingMessage(targetThreadId, contextError)
                updateThreadById(targetThreadId, (thread) => {
                    const nextThread: CopilotThreadState = {
                        ...thread,
                        turnState: 'failed',
                        turnError: contextError,
                        lastRuntimeStatus: buildRuntimeStatus({
                            mode: runtimeConfig?.mode ?? 'appserver',
                            source: 'preview',
                            modelHint: runtimeConfig?.directModel ?? null,
                            directBaseUrl: runtimeConfig?.directBaseUrl ?? null,
                            hasDirectApiKey: runtimeConfig?.hasDirectApiKey ?? false,
                            errorText: contextError,
                        }),
                        agentSteps: advanceAgentSteps(thread.agentSteps, {
                            plan: 'blocked',
                            review: 'blocked',
                        }),
                        agentTasks: advanceAgentTasks(thread.agentTasks, {
                            prepare_preview: 'blocked',
                            review_changes: 'blocked',
                        }),
                        lastEvaluation: buildFailureEvaluation({
                            error: contextError,
                            needsUser: true,
                            t,
                        }),
                    }
                    return {
                        ...nextThread,
                        ...refreshThreadContextState({ thread: nextThread, t }),
                    }
                })
                return
            }

            if (generation.status === 'error') {
                const generatedError = t('centerPane.aiGenerateFailed', {
                    error: generation.error ?? 'unknown',
                })
                showToast(generatedError, 'error')
                replaceThinkingMessage(targetThreadId, generatedError)
                updateThreadById(targetThreadId, (thread) => {
                    const nextThread: CopilotThreadState = {
                        ...thread,
                        turnState: 'failed',
                        turnError: generatedError,
                        lastRuntimeStatus: buildRuntimeStatus({
                            mode: runtimeConfig?.mode ?? 'appserver',
                            source: 'preview',
                            modelHint: runtimeConfig?.directModel ?? null,
                            directBaseUrl: runtimeConfig?.directBaseUrl ?? null,
                            hasDirectApiKey: runtimeConfig?.hasDirectApiKey ?? false,
                            errorText: generatedError,
                        }),
                        agentSteps: advanceAgentSteps(thread.agentSteps, {
                            plan: 'blocked',
                            review: 'blocked',
                        }),
                        agentTasks: advanceAgentTasks(thread.agentTasks, {
                            prepare_preview: 'blocked',
                            review_changes: 'blocked',
                        }),
                        lastEvaluation: buildFailureEvaluation({
                            error: generatedError,
                            t,
                        }),
                    }
                    return {
                        ...nextThread,
                        ...refreshThreadContextState({ thread: nextThread, t }),
                    }
                })
                return
            }

            if (!generation.envelope || generation.envelope.commands.length === 0) {
                const emptyMessage = t('centerPane.aiPreviewEmpty')
                showToast(emptyMessage, 'info')
                replaceThinkingMessage(targetThreadId, emptyMessage)
                appendActivity(targetThreadId, {
                    label: t('rightPane.activityPreviewEmpty'),
                    detail: emptyMessage,
                    tone: 'warning',
                })
                updateThreadById(targetThreadId, (thread) => {
                    const nextThread: CopilotThreadState = {
                        ...thread,
                        turnState: 'failed',
                        turnError: emptyMessage,
                        lastRuntimeStatus: buildRuntimeStatus({
                            mode: runtimeConfig?.mode ?? 'appserver',
                            source: 'preview',
                            modelHint: runtimeConfig?.directModel ?? null,
                            directBaseUrl: runtimeConfig?.directBaseUrl ?? null,
                            hasDirectApiKey: runtimeConfig?.hasDirectApiKey ?? false,
                            errorText: emptyMessage,
                        }),
                        agentSteps: advanceAgentSteps(thread.agentSteps, {
                            plan: 'blocked',
                            review: 'blocked',
                        }),
                        agentTasks: advanceAgentTasks(thread.agentTasks, {
                            prepare_preview: 'blocked',
                            review_changes: 'blocked',
                        }),
                        lastEvaluation: buildFailureEvaluation({
                            error: emptyMessage,
                            t,
                        }),
                    }
                    return {
                        ...nextThread,
                        ...refreshThreadContextState({ thread: nextThread, t }),
                    }
                })
                return
            }

            updateThreadById(targetThreadId, (thread) => {
                const autoPolicyOnly = thread.agentTasks.every((task) => task.policy === 'auto')
                const nextSessionMemory = thread.sessionMemory
                const latestHandoff = buildSpecialistHandoffFromEnvelope({
                    prompt: targetPlan.prompt,
                    envelope: generation.envelope ?? null,
                    leadSummary: thread.agentGoal?.summary ?? intentLabel(targetPlan.resolvedIntent, t),
                })
                const latestArtifact = buildSpecialistArtifactFromEnvelope({
                    prompt: targetPlan.prompt,
                    envelope: generation.envelope ?? null,
                })
                const skipReviewForPreview = shouldSkipPreviewReview({
                    envelope: generation.envelope ?? null,
                    activeChapterId: activeChapter?.id ?? null,
                })
                const nextStepPatch = autoPolicyOnly
                    ? {
                          plan: 'completed' as const,
                          review: 'completed' as const,
                          apply: 'ready' as const,
                          check: 'pending' as const,
                      }
                    : {
                          plan: 'completed' as const,
                          review: 'ready' as const,
                          apply: 'pending' as const,
                          check: 'pending' as const,
                      }
                const nextTaskPatch = autoPolicyOnly
                    ? {
                          prepare_preview: 'completed' as const,
                          review_changes: 'completed' as const,
                          apply_changes: 'ready' as const,
                          verify_result: 'pending' as const,
                      }
                    : {
                          prepare_preview: 'completed' as const,
                          review_changes: 'ready' as const,
                          apply_changes: 'pending' as const,
                          verify_result: 'pending' as const,
                      }
                const nextThread: CopilotThreadState = {
                    ...thread,
                    turnState: 'completed',
                    turnError: null,
                    appServerThreadId: generation.threadId ? String(generation.threadId) : thread.appServerThreadId,
                    appServerTurnId: generation.turnId ? String(generation.turnId) : thread.appServerTurnId,
                    planDraft: null,
                    lastIntentConfidence:
                        Number.isFinite(Number(targetPlan.intentConfidence))
                            ? Number(targetPlan.intentConfidence)
                            : thread.lastIntentConfidence,
                    previewEnvelope: generation.envelope ?? null,
                    previewCollapsed: false,
                    collapsedCommandIndexes: [],
                    applySafetyConfirmed: autoPolicyOnly || skipReviewForPreview,
                    applyDangerConfirmed: false,
                    agentSteps: advanceAgentSteps(thread.agentSteps, nextStepPatch),
                    agentTasks: advanceAgentTasks(thread.agentTasks, nextTaskPatch),
                    currentRun: updateAgentRun(thread.currentRun, {
                        phase: autoPolicyOnly ? 'apply' : 'review',
                    }),
                    lastCheck: null,
                    lastEvaluation: null,
                    lastGuardrailStatus: buildGuardrailStatus({
                        featureId: 'ai.chat.ask',
                        allowed: resolvedGate.allowed,
                        plan: resolvedGate.plan,
                        aiCreditsRemaining: resolvedGate.aiCreditsRemaining,
                        reason: resolvedGate.reason,
                        checkedAt: resolvedGate.checkedAt,
                    }),
                    latestHandoff,
                    latestArtifact,
                    recentHandoffs: prependRecentItem(thread.recentHandoffs, latestHandoff),
                    recentArtifacts: prependRecentItem(thread.recentArtifacts, latestArtifact),
                    workingMemoryNotes: buildWorkingMemoryNotes({
                        prompt: targetPlan.prompt,
                        latestHandoffSummary: latestHandoff?.summary ?? null,
                        latestArtifactSummary: latestArtifact?.summary ?? null,
                        t,
                    }),
                    bookMemoryNotes: buildBookMemoryNotes({
                        previous: thread.bookMemoryNotes,
                        metadata: {
                            title: projectMetadataTitle ?? '',
                            subtitle: '',
                            authors: [],
                            language: '',
                            publisher: '',
                            isbn: '',
                            link: '',
                            description: '',
                        },
                        sessionMemory: nextSessionMemory,
                        t,
                    }),
                    streamSoftLimitNotified: false,
                    lastRuntimeStatus: buildRuntimeStatus({
                        mode: runtimeConfig?.mode ?? 'appserver',
                        source: 'preview',
                        modelHint: generation.envelope?.meta?.modelId ?? runtimeConfig?.directModel ?? null,
                        directBaseUrl: runtimeConfig?.directBaseUrl ?? null,
                        hasDirectApiKey: runtimeConfig?.hasDirectApiKey ?? false,
                        tokenUsage: generation.tokenUsage ?? null,
                    }),
                    messages: skipReviewForPreview
                        ? [
                              ...thread.messages.slice(0, -1),
                              ...(latestHandoff
                                  ? [createMessage('assistant', formatSpecialistHandoffMessage(latestHandoff))]
                                  : []),
                              ...(latestArtifact
                                  ? [createMessage('assistant', formatSpecialistArtifactMessage(latestArtifact))]
                                  : []),
                          ]
                        : [
                              ...thread.messages.slice(0, -1),
                              ...(latestHandoff
                                  ? [createMessage('assistant', formatSpecialistHandoffMessage(latestHandoff))]
                                  : []),
                              ...(latestArtifact
                                  ? [createMessage('assistant', formatSpecialistArtifactMessage(latestArtifact))]
                                  : []),
                              createMessage(
                                  'assistant',
                                  t('centerPane.aiChatPreviewReady', {
                                      summary: generation.envelope?.summary ?? '',
                                      count: generation.envelope?.commands.length ?? 0,
                                  }),
                              ),
                          ],
                }
                return {
                    ...nextThread,
                    ...refreshThreadContextState({ thread: nextThread, t }),
                }
            })
            appendActivity(targetThreadId, {
                label: t('rightPane.activityPreviewReady'),
                detail: `${intentLabel(targetPlan.resolvedIntent, t)} · ${generation.envelope?.summary ?? ''} · ${toolTrace}`.trim(),
                tone: 'success',
            })
        } catch (error) {
            const gateError = t('centerPane.aiGateCheckFailed', { error: formatCopilotErrorForUser(error) })
            showToast(gateError, 'error')
            replaceThinkingMessage(targetThreadId, gateError)
            appendActivity(targetThreadId, {
                label: t('rightPane.activityPreviewFailed'),
                detail: gateError,
                tone: 'error',
            })
            updateThreadById(targetThreadId, (thread) => {
                const nextThread: CopilotThreadState = {
                    ...thread,
                    turnState: 'failed',
                    turnError: gateError,
                    lastRuntimeStatus: buildRuntimeStatus({
                        mode: 'appserver',
                        source: 'preview',
                        errorText: gateError,
                    }),
                    agentSteps: advanceAgentSteps(thread.agentSteps, {
                        plan: 'blocked',
                        review: 'blocked',
                    }),
                    agentTasks: advanceAgentTasks(thread.agentTasks, {
                        prepare_preview: 'blocked',
                        review_changes: 'blocked',
                    }),
                    lastEvaluation: buildFailureEvaluation({
                        error: gateError,
                        t,
                    }),
                }
                return {
                    ...nextThread,
                    ...refreshThreadContextState({ thread: nextThread, t }),
                }
            })
        } finally {
            setCopilotBusy(false)
        }
    }

    const applyPreview = async () => {
        if (!activeThread || !activeThread.previewEnvelope || copilotApplying) return
        const runtimeConfig = await loadCopilotRuntimeConfig().catch(() => null)
        const latestRisk = evaluatePreviewRisk()
        if (!activeThread.applySafetyConfirmed) {
            updateActiveThread((thread) => ({
                ...thread,
                applySafetyConfirmed: true,
            }))
        }
        if (latestRisk.level === 'high' && !activeThread.applyDangerConfirmed) {
            showToast(t('rightPane.applyHighRiskConfirmRequired'), 'error')
            updateActiveThread((thread) => ({
                ...thread,
                turnError: t('rightPane.applyHighRiskConfirmRequired'),
                lastRecoveryHint: t('rightPane.recoveryHintReviewRisk'),
            }))
            return
        }
        if (latestRisk.level !== 'low') {
            showToast(
                t('rightPane.applyRiskReviewNotice', {
                    level: latestRisk.level,
                }),
                'info',
            )
        }
        setCopilotApplying(true)
        updateActiveThread((thread) => ({
            ...thread,
            agentSteps: advanceAgentSteps(thread.agentSteps, {
                apply: 'in_progress',
                check: 'pending',
            }),
            agentTasks: advanceAgentTasks(thread.agentTasks, {
                review_changes: 'completed',
                apply_changes: 'in_progress',
                verify_result: 'pending',
            }),
            currentRun: updateAgentRun(thread.currentRun, {
                phase: 'apply',
            }),
            lastCheck: null,
            lastEvaluation: null,
        }))
        appendActivity(activeThread.id, {
            label: t('rightPane.activityApplyStarted'),
            detail: `${activeThread.previewEnvelope.summary} · snapshot_checkpoint -> command_apply -> post_apply_check`,
            tone: 'info',
        })
        let snapshotCreated = false
        let checkpointId: string | null = null
        try {
            if (projectPath) {
                const snapshot = serializeCurrentProject()
                const snapshotId = await createSnapshotSafe(projectPath, snapshot, 'manual', { logTag: 'Copilot' })
                if (snapshotId) {
                    checkpointId = snapshotId
                    snapshotCreated = true
                    appendActivity(activeThread.id, {
                        label: t('rightPane.activityCheckpointCreated'),
                        detail: snapshotId,
                        tone: 'success',
                    })
                }
            }

            const result = await applyCopilotEnvelope(activeThread.previewEnvelope)
            const pageValidation = validateCurrentPageContent()
            const allWarnings = [...result.warnings, ...pageValidation.warnings]
            showToast(
                t('centerPane.aiApplySuccess', {
                    count: result.appliedCommands,
                }),
                'success',
            )
            if (allWarnings.length > 0) {
                showToast(
                    t('centerPane.aiApplyWarnings', {
                        count: allWarnings.length,
                    }),
                    'info',
                )
            }

            updateActiveThread((thread) => {
                const nextCheck = buildCheckResult({
                    appliedCommands: result.appliedCommands,
                    warnings: allWarnings,
                    checkpointId,
                    t,
                })
                const shouldKeepRunOpen = allWarnings.length > 0
                const nextRun = shouldKeepRunOpen
                    ? updateAgentRun(thread.currentRun, {
                          phase: 'verify',
                          checkpointId,
                          lastEvaluationSummary: nextCheck.summary,
                      })
                    : closeAgentRun(thread.currentRun, {
                          status: 'completed',
                          phase: 'completed',
                          lastEvaluationSummary: nextCheck.summary,
                          checkpointId,
                      })
                const nextThread: CopilotThreadState = {
                    ...thread,
                    turnState: 'completed',
                    turnError: null,
                    previewEnvelope: null,
                    applySafetyConfirmed: false,
                    applyDangerConfirmed: false,
                    lastCheckpointId: checkpointId,
                    lastRecoveryHint: snapshotCreated
                        ? t('rightPane.recoveryHintWithSnapshot')
                        : t('rightPane.recoveryHintNoSnapshot'),
                    agentSteps: advanceAgentSteps(thread.agentSteps, {
                        review: 'completed',
                        apply: 'completed',
                        check: 'completed',
                    }),
                    agentTasks: advanceAgentTasks(thread.agentTasks, {
                        review_changes: 'completed',
                        apply_changes: 'completed',
                        verify_result: 'completed',
                    }),
                    sessionMemory: {
                        ...thread.sessionMemory,
                        lastApprovedIntent:
                            thread.agentGoal?.summary ?? thread.sessionMemory.lastApprovedIntent,
                        pendingFollowUps:
                            allWarnings.length > 0
                                ? [
                                      ...(thread.sessionMemory.pendingFollowUps ?? []),
                                      t('rightPane.agentEvalNextReview'),
                                  ].slice(-4)
                                : (thread.sessionMemory.pendingFollowUps ?? []).slice(-4),
                        unresolvedChecks:
                            allWarnings.length > 0
                                ? Array.from(
                                      new Set([
                                          ...(thread.sessionMemory.unresolvedChecks ?? []),
                                          ...allWarnings,
                                      ]),
                                  ).slice(-4)
                                : [],
                    },
                    lastCheck: nextCheck,
                    lastEvaluation: buildEvaluationResult({
                        check: nextCheck,
                        intent: thread.planDraft?.resolvedIntent ?? null,
                        t,
                    }),
                    lastRuntimeStatus: buildRuntimeStatus({
                        mode: runtimeConfig?.mode ?? thread.lastRuntimeStatus?.mode ?? 'appserver',
                        source: 'apply',
                        modelHint:
                            thread.previewEnvelope?.meta?.modelId ??
                            runtimeConfig?.directModel ??
                            thread.lastRuntimeStatus?.modelLabel,
                        directBaseUrl: runtimeConfig?.directBaseUrl ?? null,
                        hasDirectApiKey: runtimeConfig?.hasDirectApiKey ?? false,
                        tokenUsage: thread.lastTokenUsage,
                    }),
                    currentRun: shouldKeepRunOpen ? nextRun : null,
                    recentRuns: shouldKeepRunOpen ? thread.recentRuns : prependRecentItem(thread.recentRuns, nextRun),
                    messages: [
                        ...thread.messages,
                        createMessage(
                            'assistant',
                            t('rightPane.copilotApplied', {
                                count: result.appliedCommands,
                            }),
                        ),
                    ],
                }
                return {
                    ...nextThread,
                    ...refreshThreadContextState({ thread: nextThread, t }),
                }
            })
            appendActivity(activeThread.id, {
                label: t('rightPane.activityApplyCompleted'),
                detail: t('rightPane.copilotApplied', {
                    count: result.appliedCommands,
                }),
                tone: 'success',
            })
            appendActivity(activeThread.id, {
                label: t('rightPane.agentCheckTitle'),
                detail: buildCheckResult({
                    appliedCommands: result.appliedCommands,
                    warnings: allWarnings,
                    checkpointId,
                    t,
                }).summary,
                tone: allWarnings.length > 0 ? 'warning' : 'success',
            })
        } catch (error) {
            const applyError = t('centerPane.aiApplyFailed', {
                error: String(error),
            })
            showToast(applyError, 'error')
            updateActiveThread((thread) => {
                const recoverySummary = checkpointId
                    ? t('rightPane.agentCheckWarningDetailWithCheckpoint', { checkpointId })
                    : applyError
                const resumableRun = updateAgentRun(thread.currentRun, {
                    phase: 'review',
                    checkpointId,
                    lastEvaluationSummary: recoverySummary,
                })
                const nextThread: CopilotThreadState = {
                    ...thread,
                    turnState: 'failed',
                    turnError: applyError,
                    lastCheckpointId: checkpointId ?? thread.lastCheckpointId,
                    lastRecoveryHint: checkpointId
                        ? t('rightPane.recoveryHintApplyFailedWithSnapshot', { checkpointId })
                        : t('rightPane.recoveryHintApplyFailedNoSnapshot'),
                    agentSteps: advanceAgentSteps(thread.agentSteps, {
                        apply: 'blocked',
                        check: 'blocked',
                    }),
                    agentTasks: advanceAgentTasks(thread.agentTasks, {
                        apply_changes: 'blocked',
                        verify_result: 'blocked',
                    }),
                    sessionMemory: {
                        ...thread.sessionMemory,
                        unresolvedChecks: Array.from(
                            new Set([...(thread.sessionMemory.unresolvedChecks ?? []), applyError]),
                        ).slice(-4),
                        pendingFollowUps: [
                            ...(thread.sessionMemory.pendingFollowUps ?? []),
                            checkpointId
                                ? t('rightPane.agentEvalNextRecover')
                                : t('rightPane.agentEvalNextClarify'),
                        ].slice(-4),
                    },
                    lastCheck: {
                        status: 'warning',
                        summary: t('rightPane.agentCheckWarningSummary', { count: 1 }),
                        detail: checkpointId
                            ? t('rightPane.agentCheckWarningDetailWithCheckpoint', { checkpointId })
                            : applyError,
                    },
                    lastEvaluation: buildFailureEvaluation({
                        error: recoverySummary,
                        t,
                    }),
                    lastRuntimeStatus: buildRuntimeStatus({
                        mode: runtimeConfig?.mode ?? thread.lastRuntimeStatus?.mode ?? 'appserver',
                        source: 'apply',
                        modelHint:
                            thread.previewEnvelope?.meta?.modelId ??
                            runtimeConfig?.directModel ??
                            thread.lastRuntimeStatus?.modelLabel,
                        directBaseUrl: runtimeConfig?.directBaseUrl ?? null,
                        hasDirectApiKey: runtimeConfig?.hasDirectApiKey ?? false,
                        errorText: applyError,
                        tokenUsage: thread.lastTokenUsage,
                    }),
                    currentRun: resumableRun,
                }
                return {
                    ...nextThread,
                    ...refreshThreadContextState({ thread: nextThread, t }),
                }
            })
            appendActivity(activeThread.id, {
                label: t('rightPane.activityApplyFailed'),
                detail: checkpointId
                    ? t('rightPane.recoveryHintApplyFailedWithSnapshot', { checkpointId })
                    : applyError,
                tone: 'error',
            })
            appendActivity(activeThread.id, {
                label: t('rightPane.agentCheckTitle'),
                detail: t('rightPane.agentCheckWarningSummary', { count: 1 }),
                tone: 'warning',
            })
            appendAssistantMessage(applyError)
        } finally {
            setCopilotApplying(false)
        }
    }

    const runSteerTurn = async (targetThreadId: string, prompt: string) => {
        const normalizedPrompt = String(prompt ?? '').trim()
        if (!normalizedPrompt) return
        if (!activeThread || activeThread.id !== targetThreadId) return
        const threadKey = String(activeThread.appServerThreadKey ?? '').trim()
        if (!threadKey) {
            const errorText = t('rightPane.turnSteerUnavailable')
            showToast(errorText, 'info')
            updateThreadById(targetThreadId, (thread) => ({
                ...thread,
                turnState: 'failed',
                turnError: errorText,
            }))
            return
        }
        try {
            const response = await copilotApi.steerAppServerTurn(
                threadKey,
                normalizedPrompt,
                activeThread.appServerTurnId ?? undefined,
            )
            if (!response.ok || !response.accepted) {
                const errorText = response.error || t('rightPane.turnSteerUnavailable')
                showToast(errorText, 'info')
                appendActivity(targetThreadId, {
                    label: t('rightPane.activitySteerRejected'),
                    detail: errorText,
                    tone: 'warning',
                })
                updateThreadById(targetThreadId, (thread) => ({
                    ...thread,
                    turnState: 'failed',
                    turnError: errorText,
                }))
                return
            }
            showToast(t('rightPane.turnSteerAccepted'), 'info')
            appendActivity(targetThreadId, {
                label: t('rightPane.activitySteerAccepted'),
                detail: normalizedPrompt,
                tone: 'info',
            })
            updateThreadById(targetThreadId, (thread) => ({
                ...thread,
                turnState: 'planning',
                turnError: null,
                appServerThreadId: response.threadId ? String(response.threadId) : thread.appServerThreadId,
                appServerTurnId: response.turnId ? String(response.turnId) : thread.appServerTurnId,
                streamSoftLimitNotified: false,
            }))
        } catch (error) {
            const errorText = t('centerPane.aiGenerateFailed', {
                error: formatCopilotErrorForUser(error),
            })
            showToast(errorText, 'error')
            appendActivity(targetThreadId, {
                label: t('rightPane.activitySteerRejected'),
                detail: errorText,
                tone: 'error',
            })
            updateThreadById(targetThreadId, (thread) => ({
                ...thread,
                turnState: 'failed',
                turnError: errorText,
            }))
        }
    }

    const interruptActiveTurn = async () => {
        if (!activeThread || !copilotBusy) return false
        const threadKey = String(activeThread.appServerThreadKey ?? '').trim()
        if (!threadKey) return false
        try {
            const interrupted = await copilotApi.interruptAppServerTurn(threadKey)
            if (interrupted) {
                updateActiveThread((thread) => ({
                    ...thread,
                    turnState: 'interrupted',
                    turnError: null,
                    currentRun: markAgentRunInterrupted(thread.currentRun, {
                        lastEvaluationSummary: t('rightPane.turnInterrupted'),
                    }),
                    lastRecoveryHint: t('rightPane.turnInterrupted'),
                    appServerTurnId: null,
                }))
                showToast(t('rightPane.turnInterrupted'), 'info')
                appendActivity(activeThread.id, {
                    label: t('rightPane.activityInterrupted'),
                    detail: null,
                    tone: 'warning',
                })
                return true
            }
            showToast(t('rightPane.turnInterruptUnavailable'), 'info')
            return false
        } catch (error) {
            const errorText = t('centerPane.aiGenerateFailed', {
                error: formatCopilotErrorForUser(error),
            })
            showToast(errorText, 'error')
            appendActivity(activeThread.id, {
                label: t('rightPane.activityInterruptFailed'),
                detail: errorText,
                tone: 'error',
            })
            updateActiveThread((thread) => ({
                ...thread,
                turnState: 'failed',
                turnError: errorText,
            }))
            return false
        }
    }

    const resumeInterruptedRun = () => {
        if (!activeThread || activeThread.turnState !== 'interrupted' || !activeThread.currentRun) return false
        const resumePrompt = buildInterruptedRunResumePrompt(activeThread, t)
        updateActiveThread((thread) => ({
            ...thread,
            draft: resumePrompt,
            turnState: 'idle',
            turnError: null,
        }))
        appendActivity(activeThread.id, {
            label: t('rightPane.activityResumePrepared'),
            detail: resumePrompt,
            tone: 'info',
        })
        showToast(t('rightPane.resumeInterruptedReady'), 'info')
        return true
    }

    const continueCurrentRun = () => {
        if (!activeThread?.currentRun) return false
        const nextPrompt = buildOpenRunContinuePrompt(activeThread, t)
        const isVerifyRun = activeThread.currentRun.phase === 'verify'
        updateActiveThread((thread) => ({
            ...thread,
            draft: nextPrompt,
            turnState: 'idle',
            turnError: null,
            agentSteps: advanceAgentSteps(thread.agentSteps, isVerifyRun ? { check: 'in_progress' } : { review: 'in_progress' }),
            agentTasks: advanceAgentTasks(
                thread.agentTasks,
                isVerifyRun
                    ? { verify_result: 'in_progress' }
                    : {
                          review_changes: 'in_progress',
                          apply_changes: 'ready',
                          verify_result: 'pending',
                      },
            ),
            sessionMemory: {
                ...thread.sessionMemory,
                pendingFollowUps: Array.from(new Set([...(thread.sessionMemory.pendingFollowUps ?? []), thread.currentRun?.goalSummary ?? '']))
                    .filter(Boolean)
                    .slice(-4),
            },
        }))
        appendActivity(activeThread.id, {
            label: t('rightPane.activityRunContinuePrepared'),
            detail: nextPrompt,
            tone: 'info',
        })
        showToast(t('rightPane.runContinueReady'), 'info')
        return true
    }

    const resolveCurrentRun = () => {
        if (!activeThread?.currentRun) return false
        const closedRun = closeAgentRun(activeThread.currentRun, {
            status: 'completed',
            phase: 'completed',
            lastEvaluationSummary:
                activeThread.currentRun.lastEvaluationSummary ??
                activeThread.lastCheck?.summary ??
                activeThread.lastEvaluation?.summary ??
                null,
            checkpointId: activeThread.currentRun.checkpointId ?? activeThread.lastCheckpointId,
        })
        const isVerifyRun = activeThread.currentRun.phase === 'verify'
        updateActiveThread((thread) => ({
            ...thread,
            currentRun: null,
            recentRuns: prependRecentItem(thread.recentRuns, closedRun),
            turnState: 'completed',
            turnError: null,
            agentSteps: advanceAgentSteps(
                thread.agentSteps,
                isVerifyRun
                    ? { check: 'completed' }
                    : {
                          review: 'completed',
                          apply: 'completed',
                          check: 'completed',
                      },
            ),
            agentTasks: advanceAgentTasks(
                thread.agentTasks,
                isVerifyRun
                    ? { verify_result: 'completed' }
                    : {
                          review_changes: 'completed',
                          apply_changes: 'completed',
                          verify_result: 'completed',
                      },
            ),
            sessionMemory: {
                ...thread.sessionMemory,
                lastApprovedIntent: thread.currentRun?.goalSummary ?? thread.sessionMemory.lastApprovedIntent,
                pendingFollowUps: (thread.sessionMemory.pendingFollowUps ?? [])
                    .filter((item) => item !== (thread.currentRun?.goalSummary ?? ''))
                    .slice(-4),
                unresolvedChecks: (thread.sessionMemory.unresolvedChecks ?? [])
                    .filter(
                        (item) =>
                            item !== (thread.currentRun?.lastEvaluationSummary ?? '') &&
                            item !== (thread.lastCheck?.summary ?? ''),
                    )
                    .slice(-4),
            },
        }))
        appendActivity(activeThread.id, {
            label: t('rightPane.activityRunResolved'),
            detail: activeThread.currentRun.goalSummary,
            tone: 'success',
        })
        showToast(t('rightPane.runResolved'), 'success')
        return true
    }

    return {
        runGeneralChatReply,
        runGeneratePreview,
        applyPreview,
        runSteerTurn,
        interruptActiveTurn,
        resumeInterruptedRun,
        continueCurrentRun,
        resolveCurrentRun,
    }
}
