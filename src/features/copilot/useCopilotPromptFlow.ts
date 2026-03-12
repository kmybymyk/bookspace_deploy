import { useCallback } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { TFunction } from 'i18next'
import type { BookMetadata, Chapter } from '../../types/project'
import { useChapterStore } from '../chapters/useChapterStore'
import { resolveCopilotIntent } from './intentRouter'
import { COMMAND_CONFIDENCE_THRESHOLD } from '../../../shared/copilotIntentPlanner'
import { buildNormalizedAppendTextPrompt } from '../../../shared/copilotP0PromptParser'
import {
    buildNormalizedCreateChapterPrompt,
    looksLikeStructuredCreateRequest,
    parseCreateChapterDraftFromPrompt,
    resolveCreateChapterPlacement,
} from '../../../shared/createChapterPromptParser'
import { buildThreadTitle, hasStartedConversation } from './rightPaneThreadStorage'
import {
    buildAgentGoal,
    buildAgentSteps,
    buildAgentTasks,
    buildBookMemoryNotes,
    buildMemoryNotes,
    buildSessionMemory,
    startAgentRun,
    buildWorkingMemoryNotes,
    refreshThreadContextState,
    updateAgentRun,
} from './rightPaneAgentUtils'
import type {
    CopilotActivityEntry,
    CopilotChatMessage,
    CopilotMode,
    CopilotPlanDraft,
    CopilotThreadState,
} from './rightPaneTypes'
import {
    buildPageStructureSnapshot,
    buildMissingPageFollowUpPrompt,
    buildMissingPageProposal,
    buildMissingPageSuggestion,
    resolvePromptPageReference,
} from './pageReferenceResolver'

const INTENT_CONFIDENCE_MIN_FOR_COMMAND = COMMAND_CONFIDENCE_THRESHOLD

function isDirectApplyPrompt(prompt: string): boolean {
    return /(에디터에\s*직접\s*반영|직접\s*반영해|문서에\s*반영해|본문에\s*넣어|현재\s*페이지에\s*넣어|apply\s+to\s+(the\s+)?editor)/i.test(
        String(prompt ?? '').trim(),
    )
}

function shouldExecuteImmediately(intent: CopilotPlanDraft['resolvedIntent']): boolean {
    return intent === 'append_text' || intent === 'rewrite_selection' || intent === 'rename_chapter'
}

function isAffirmativeFollowUpPrompt(prompt: string): boolean {
    return /^(응|네|예|좋아|그래|그렇게 해|진행해|해줘|부탁해|yes|ok|okay|go ahead|do it)\b/i.test(
        String(prompt ?? '').trim(),
    )
}

function buildStructuredCreateConfirmation(args: {
    prompt: string
    title: string
    chapterType: string
    parentLabel?: string | null
    requestedOrdinal?: number | null
    resolvedParentTitle?: string | null
    resolvedParentId?: string | null
}) {
    const {
        prompt,
        title,
        chapterType,
        parentLabel,
        requestedOrdinal,
        resolvedParentTitle,
        resolvedParentId,
    } = args
    const summary = '구조 변경 전 해석 확인이 필요합니다.'
    const typeLabel =
        chapterType === 'part'
            ? '파트'
            : chapterType === 'front'
              ? '앞부분 페이지'
              : chapterType === 'back'
                ? '뒷부분 페이지'
                : '챕터'
    const detailLines = [
        `요청 해석: ${typeLabel} 페이지를 새로 만듭니다.`,
        `제목: ${title || '새 페이지'}`,
        parentLabel ? `부모 위치: ${resolvedParentTitle || parentLabel}` : null,
        requestedOrdinal ? `원하는 순서: ${requestedOrdinal}번째` : null,
        '이 작업은 구조 변경이므로 적용 전에 해석을 먼저 확인합니다.',
    ].filter(Boolean)
    const followUpPrompt = buildNormalizedCreateChapterPrompt({
        ...parseCreateChapterDraftFromPrompt(prompt),
        title,
        parentLabel: resolvedParentTitle || parentLabel || undefined,
        requestedOrdinal: requestedOrdinal ?? null,
        requiresStructuredConfirmation: false,
    })

    return {
        summary,
        detail: detailLines.join('\n'),
        followUpPrompt,
        proposal: {
            kind: 'confirm_structured_create' as const,
            intent: 'create_chapter' as const,
            missingLabel: '',
            targetKind: resolvedParentId ? 'part' as const : null,
            suggestedTitle: title || null,
            followUpPrompt,
            parentLabel: resolvedParentTitle || parentLabel || null,
            requestedOrdinal: requestedOrdinal ?? null,
            summary,
            detail: detailLines.join('\n'),
        },
    }
}

interface UseCopilotPromptFlowArgs {
    t: TFunction
    activeThread: CopilotThreadState | undefined
    copilotBusy: boolean
    copilotMode: CopilotMode
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
        explicitSelection: string
    }
    metadata: BookMetadata
    activeChapter?: Chapter
    chapterCount: number
    updateThreadById: (
        threadId: string,
        updater: (thread: CopilotThreadState) => CopilotThreadState,
    ) => void
    createMessage: (role: CopilotChatMessage['role'], text: string) => CopilotChatMessage
    appendActivity: (
        threadId: string,
        entry: Omit<CopilotActivityEntry, 'id' | 'createdAt'>,
    ) => void
    setAttachedFiles: Dispatch<SetStateAction<string[]>>
    runGeneralChatReply: (targetThreadId: string, prompt: string) => Promise<void>
    runGeneratePreview: (targetThreadId: string, targetPlan: CopilotPlanDraft) => Promise<void>
    runSteerTurn: (targetThreadId: string, prompt: string) => Promise<void>
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

export function useCopilotPromptFlow({
    t,
    activeThread,
    copilotBusy,
    copilotMode,
    resolveCopilotContext,
    metadata,
    activeChapter,
    chapterCount,
    updateThreadById,
    createMessage,
    appendActivity,
    setAttachedFiles,
    runGeneralChatReply,
    runGeneratePreview,
    runSteerTurn,
}: UseCopilotPromptFlowArgs) {
    const submitCopilotPrompt = useCallback(async () => {
        if (!activeThread) return
        const prompt = activeThread.draft.trim()
        if (!prompt) return
        const proposalFollowUpPrompt =
            activeThread.pendingProposal &&
            activeThread.lastEvaluation?.status === 'needs_user' &&
            isAffirmativeFollowUpPrompt(prompt)
                ? activeThread.pendingProposal.followUpPrompt
                : null
        const effectivePrompt =
            proposalFollowUpPrompt ??
            (activeThread.lastEvaluation?.status === 'needs_user' &&
            activeThread.lastEvaluation.recommendedNextAction &&
            isAffirmativeFollowUpPrompt(prompt)
                ? activeThread.lastEvaluation.recommendedNextAction
                : prompt)

        appendActivity(activeThread.id, {
            label: t('rightPane.activityRequestCaptured'),
            detail: effectivePrompt,
            tone: 'info',
        })

        if (copilotBusy) {
            updateThreadById(activeThread.id, (thread) => ({
                ...thread,
                draft: '',
                streamSoftLimitNotified: false,
                messages: [...thread.messages, createMessage('user', prompt)],
            }))
            setAttachedFiles([])
            await runSteerTurn(activeThread.id, effectivePrompt)
            return
        }

        const nextTitle = !hasStartedConversation(activeThread)
            ? buildThreadTitle(effectivePrompt, activeThread.title)
            : activeThread.title

        if (activeThread.lastGeneratedDraft && isDirectApplyPrompt(prompt)) {
            const draftText = activeThread.lastGeneratedDraft.text.trim()
            if (draftText) {
                const inferredContext = resolveCopilotContext(effectivePrompt, 'append_text')
                const selectedContext = inferredContext.selectedText.trim()
                const inferredAppendPosition = 'current_block_after'
                const autoPlan: CopilotPlanDraft = {
                    prompt: effectivePrompt,
                    normalizedPrompt: buildNormalizedAppendTextPrompt({
                        text: draftText,
                        position: inferredAppendPosition,
                        mode: 'literal',
                    }),
                    resolvedIntent: 'append_text',
                    intentConfidence: 0.98,
                    explicitTargetChapterId: activeThread.lastGeneratedDraft.targetChapterId ?? undefined,
                }

                updateThreadById(activeThread.id, (thread) =>
                    (() => {
                        const nextThread: CopilotThreadState = {
                            ...thread,
                            title: nextTitle,
                            draft: '',
                            turnState: 'idle',
                            turnError: null,
                            lastIntentConfidence: 0.98,
                            lastRecoveryHint:
                                thread.turnState === 'interrupted' ? thread.lastRecoveryHint : null,
                            lastCheckpointId: null,
                            streamSoftLimitNotified: false,
                            agentGoal: buildAgentGoal('append_text', prompt, t),
                            agentSteps: buildAgentSteps('append_text', t),
                            agentTasks: buildAgentTasks('append_text', t),
                            currentRun:
                                updateAgentRun(thread.currentRun, {
                                    phase: 'review',
                                }) ??
                                startAgentRun({
                                    goalSummary: intentLabel('append_text', t),
                                    taskIds: buildAgentTasks('append_text', t).map((task) => task.id),
                                }),
                            memoryNotes: buildMemoryNotes({
                                metadata,
                                activeChapter,
                                selectedContext,
                                chapterCount,
                                t,
                            }),
                            sessionMemory: buildSessionMemory({
                                previous: thread.sessionMemory,
                                prompt: effectivePrompt,
                                lastCheck: null,
                            }),
                            workingMemoryNotes: buildWorkingMemoryNotes({
                                prompt: effectivePrompt,
                                selectedContext,
                                t,
                            }),
                            bookMemoryNotes: buildBookMemoryNotes({
                                previous: thread.bookMemoryNotes,
                                metadata,
                                sessionMemory: buildSessionMemory({
                                    previous: thread.sessionMemory,
                                    prompt: effectivePrompt,
                                    lastCheck: null,
                                }),
                                t,
                            }),
                            lastCheck: null,
                            lastEvaluation: null,
                            pendingProposal: null,
                            latestHandoff: null,
                            latestArtifact: null,
                            planDraft: null,
                            messages: [...thread.messages, createMessage('user', prompt)],
                        }
                        return {
                            ...nextThread,
                            ...refreshThreadContextState({ thread: nextThread, t }),
                        }
                    })()
                )
                appendActivity(activeThread.id, {
                    label: t('rightPane.activityPlanReady'),
                    detail: `${intentLabel('append_text', t)} · 98%`,
                    tone: 'success',
                })
                setAttachedFiles([])
                void runGeneratePreview(activeThread.id, autoPlan)
                return
            }
        }

        const initialContext = resolveCopilotContext(effectivePrompt, null)
        const rawCreateDraft = parseCreateChapterDraftFromPrompt(effectivePrompt)
        const isStructuredCreateFollowUpPrompt =
            /^종류:/m.test(effectivePrompt) && /(부모 페이지:|원하는 순서:)/.test(effectivePrompt)
        const chapterState = useChapterStore.getState()
        const promptStructureSnapshot = buildPageStructureSnapshot({
            chapters: chapterState.chapters,
            activeChapterId: chapterState.activeChapterId,
        })
        const commitStructuredCreateConfirmation = (confidence: number, confirmation: ReturnType<typeof buildStructuredCreateConfirmation>) => {
            updateThreadById(activeThread.id, (thread) =>
                (() => {
                    const nextThread: CopilotThreadState = {
                        ...thread,
                        title: nextTitle,
                        draft: '',
                        turnState: 'completed',
                        turnError: null,
                        lastIntentConfidence: confidence,
                        lastRecoveryHint:
                            thread.turnState === 'interrupted' ? thread.lastRecoveryHint : null,
                        lastCheckpointId: null,
                        agentGoal: null,
                        agentSteps: [],
                        agentTasks: [],
                        currentRun: null,
                        memoryNotes: [],
                        workingMemoryNotes: [],
                        bookMemoryNotes: thread.bookMemoryNotes,
                        planDraft: null,
                        lastCheck: null,
                        pendingProposal: confirmation.proposal,
                        latestHandoff: null,
                        latestArtifact: null,
                        lastEvaluation: {
                            status: 'needs_user',
                            summary: confirmation.summary,
                            detail: confirmation.detail,
                            recommendedNextAction: confirmation.followUpPrompt,
                        },
                        streamSoftLimitNotified: false,
                        messages: [
                            ...thread.messages,
                            createMessage('user', prompt),
                            createMessage('assistant', confirmation.detail),
                        ],
                    }
                    return {
                        ...nextThread,
                        ...refreshThreadContextState({ thread: nextThread, t }),
                    }
                })()
            )
            appendActivity(activeThread.id, {
                label: t('rightPane.activityNeedConfirmation'),
                detail: confirmation.summary,
                tone: 'warning',
            })
            setAttachedFiles([])
        }
        if (
            looksLikeStructuredCreateRequest(effectivePrompt) &&
            rawCreateDraft.requiresStructuredConfirmation &&
            !isStructuredCreateFollowUpPrompt
        ) {
            const placement = resolveCreateChapterPlacement({
                draft: rawCreateDraft,
                pages: promptStructureSnapshot.pages,
                fallbackAfterChapterId: activeChapter?.id ?? null,
            })
            const confirmation = buildStructuredCreateConfirmation({
                prompt: effectivePrompt,
                title: rawCreateDraft.title,
                chapterType: rawCreateDraft.chapterType,
                parentLabel: rawCreateDraft.parentLabel,
                requestedOrdinal: rawCreateDraft.requestedOrdinal,
                resolvedParentTitle: placement.parentPage?.title ?? null,
                resolvedParentId: placement.parentPage?.id ?? null,
            })
            commitStructuredCreateConfirmation(0.93, confirmation)
            return
        }

        const resolved = resolveCopilotIntent({
            prompt: effectivePrompt,
            hasSelection: initialContext.explicitSelection.length > 0,
        })
        const resolvedIntent = resolved.intent
        const createDraft =
            resolvedIntent === 'create_chapter' ? parseCreateChapterDraftFromPrompt(effectivePrompt) : null
        const shouldResolvePageReference =
            resolvedIntent === 'rename_chapter' ||
            resolvedIntent === 'move_chapter' ||
            resolvedIntent === 'delete_chapter' ||
            resolvedIntent === 'set_chapter_type' ||
            resolvedIntent === 'create_chapter' ||
            resolvedIntent === 'append_text' ||
            resolvedIntent === 'rewrite_selection' ||
            resolvedIntent === 'find_replace'
        const referencedPage = shouldResolvePageReference
            ? resolvePromptPageReference(
                effectivePrompt,
                promptStructureSnapshot,
              )
            : { kind: null, label: null, targetChapterId: null, missingLabel: null }
        const createPlacement =
            resolvedIntent === 'create_chapter' && createDraft
                ? resolveCreateChapterPlacement({
                      draft: createDraft,
                      pages: promptStructureSnapshot.pages,
                      fallbackAfterChapterId: referencedPage.targetChapterId ?? activeChapter?.id ?? null,
                  })
                : null
        const shouldRouteChat =
            resolved.route === 'chat' ||
            !resolvedIntent ||
            resolved.confidence < INTENT_CONFIDENCE_MIN_FOR_COMMAND

        if (
            resolvedIntent === 'create_chapter' &&
            createDraft?.requiresStructuredConfirmation &&
            !isStructuredCreateFollowUpPrompt
        ) {
            const confirmation = buildStructuredCreateConfirmation({
                prompt: effectivePrompt,
                title: createDraft.title,
                chapterType: createDraft.chapterType,
                parentLabel: createDraft.parentLabel,
                requestedOrdinal: createDraft.requestedOrdinal,
                resolvedParentTitle: createPlacement?.parentPage?.title ?? null,
                resolvedParentId: createPlacement?.parentPage?.id ?? null,
            })
            commitStructuredCreateConfirmation(resolved.confidence, confirmation)
            return
        }

        if (resolvedIntent && referencedPage.missingLabel) {
            const suggestion = buildMissingPageSuggestion({
                prompt: effectivePrompt,
                intent: resolvedIntent,
                missingLabel: referencedPage.missingLabel,
                t,
            })
            const proposal = buildMissingPageProposal({
                prompt: effectivePrompt,
                intent: resolvedIntent,
                missingLabel: referencedPage.missingLabel,
                kind: referencedPage.kind,
            })
            const suggestedFollowUp =
                proposal?.followUpPrompt ??
                buildMissingPageFollowUpPrompt({
                    prompt: effectivePrompt,
                    intent: resolvedIntent,
                    missingLabel: referencedPage.missingLabel,
                    kind: referencedPage.kind,
                })

            updateThreadById(activeThread.id, (thread) =>
                (() => {
                    const nextThread: CopilotThreadState = {
                        ...thread,
                        title: nextTitle,
                        draft: '',
                        turnState: 'completed',
                        turnError: null,
                        lastIntentConfidence: resolved.confidence,
                        lastRecoveryHint:
                            thread.turnState === 'interrupted' ? thread.lastRecoveryHint : null,
                        lastCheckpointId: null,
                        agentGoal: null,
                        agentSteps: [],
                        agentTasks: [],
                        currentRun: null,
                        memoryNotes: [],
                        workingMemoryNotes: [],
                        bookMemoryNotes: thread.bookMemoryNotes,
                        planDraft: null,
                        lastCheck: null,
                        pendingProposal: proposal,
                        latestHandoff: null,
                        latestArtifact: null,
                        lastEvaluation: {
                            status: 'needs_user',
                            summary: t('rightPane.agentEvalNeedsUserSummary'),
                            detail: suggestion,
                            recommendedNextAction: suggestedFollowUp,
                        },
                        streamSoftLimitNotified: false,
                        messages: [
                            ...thread.messages,
                            createMessage('user', prompt),
                            createMessage('assistant', suggestion),
                        ],
                    }
                    return {
                        ...nextThread,
                        ...refreshThreadContextState({ thread: nextThread, t }),
                    }
                })()
            )
            appendActivity(activeThread.id, {
                label: t('rightPane.activityNeedExistingPage'),
                detail: suggestion,
                tone: 'warning',
            })
            setAttachedFiles([])
            return
        }
        const inferredContext = resolveCopilotContext(effectivePrompt, resolvedIntent)
        const selectedContext = inferredContext.selectedText.trim()

        if (shouldRouteChat) {
            updateThreadById(activeThread.id, (thread) =>
                (() => {
                    const nextThread: CopilotThreadState = {
                        ...thread,
                        title: nextTitle,
                        draft: '',
                        turnState: 'planning',
                        turnError: null,
                        lastIntentConfidence: resolved.confidence,
                        lastRecoveryHint:
                            thread.turnState === 'interrupted' ? thread.lastRecoveryHint : null,
                        lastCheckpointId: null,
                        agentGoal: null,
                        agentSteps: [],
                        agentTasks: [],
                        currentRun: null,
                        memoryNotes: [],
                        workingMemoryNotes: [],
                        bookMemoryNotes: thread.bookMemoryNotes,
                        lastCheck: null,
                        lastEvaluation: null,
                        pendingProposal: null,
                        latestHandoff: null,
                        latestArtifact: null,
                        planDraft: null,
                        streamSoftLimitNotified: false,
                        messages: [...thread.messages, createMessage('user', prompt)],
                    }
                    return {
                        ...nextThread,
                        ...refreshThreadContextState({ thread: nextThread, t }),
                    }
                })()
            )
            setAttachedFiles([])
            await runGeneralChatReply(activeThread.id, effectivePrompt)
            return
        }

        const shouldRunImmediately = shouldExecuteImmediately(resolvedIntent)

        if (copilotMode === 'apply' || shouldRunImmediately) {
            updateThreadById(activeThread.id, (thread) =>
                (() => {
                    const nextThread: CopilotThreadState = {
                        ...thread,
                        title: nextTitle,
                        draft: '',
                        turnState: 'idle',
                        turnError: null,
                        lastIntentConfidence: resolved.confidence,
                        lastRecoveryHint:
                            thread.turnState === 'interrupted' ? thread.lastRecoveryHint : null,
                        lastCheckpointId: null,
                        planDraft: null,
                        agentGoal: buildAgentGoal(resolvedIntent, effectivePrompt, t),
                        agentSteps: buildAgentSteps(resolvedIntent, t),
                        agentTasks: buildAgentTasks(resolvedIntent, t),
                        currentRun: startAgentRun({
                            goalSummary: intentLabel(resolvedIntent, t),
                            taskIds: buildAgentTasks(resolvedIntent, t).map((task) => task.id),
                        }),
                        memoryNotes: buildMemoryNotes({
                            metadata,
                            activeChapter,
                            selectedContext,
                            chapterCount,
                            t,
                        }),
                        sessionMemory: buildSessionMemory({
                            previous: thread.sessionMemory,
                            prompt: effectivePrompt,
                            lastCheck: null,
                        }),
                        workingMemoryNotes: buildWorkingMemoryNotes({
                            prompt: effectivePrompt,
                            selectedContext,
                            t,
                        }),
                        bookMemoryNotes: buildBookMemoryNotes({
                            previous: thread.bookMemoryNotes,
                            metadata,
                            sessionMemory: buildSessionMemory({
                                previous: thread.sessionMemory,
                                prompt: effectivePrompt,
                                lastCheck: null,
                            }),
                            t,
                        }),
                        lastCheck: null,
                        lastEvaluation: null,
                        pendingProposal: null,
                        latestHandoff: null,
                        latestArtifact: null,
                        streamSoftLimitNotified: false,
                        messages: [...thread.messages, createMessage('user', prompt)],
                    }
                    return {
                        ...nextThread,
                        ...refreshThreadContextState({ thread: nextThread, t }),
                    }
                })()
            )
            appendActivity(activeThread.id, {
                label: t('rightPane.activityPlanReady'),
                detail: `${intentLabel(resolvedIntent, t)} · ${Math.round(resolved.confidence * 100)}%`,
                tone: 'success',
            })
        } else {
            updateThreadById(activeThread.id, (thread) =>
                (() => {
                    const nextThread: CopilotThreadState = {
                        ...thread,
                        title: nextTitle,
                        draft: '',
                        turnState: 'idle',
                        turnError: null,
                        lastIntentConfidence: resolved.confidence,
                        lastRecoveryHint:
                            thread.turnState === 'interrupted' ? thread.lastRecoveryHint : null,
                        lastCheckpointId: null,
                        streamSoftLimitNotified: false,
                        agentGoal: buildAgentGoal(resolvedIntent, effectivePrompt, t),
                        agentSteps: buildAgentSteps(resolvedIntent, t),
                        agentTasks: buildAgentTasks(resolvedIntent, t),
                        currentRun: startAgentRun({
                            goalSummary: intentLabel(resolvedIntent, t),
                            taskIds: buildAgentTasks(resolvedIntent, t).map((task) => task.id),
                        }),
                        memoryNotes: buildMemoryNotes({
                            metadata,
                            activeChapter,
                            selectedContext,
                            chapterCount,
                            t,
                        }),
                        sessionMemory: buildSessionMemory({
                            previous: thread.sessionMemory,
                            prompt: effectivePrompt,
                            lastCheck: null,
                        }),
                        workingMemoryNotes: buildWorkingMemoryNotes({
                            prompt: effectivePrompt,
                            selectedContext,
                            t,
                        }),
                        bookMemoryNotes: buildBookMemoryNotes({
                            previous: thread.bookMemoryNotes,
                            metadata,
                            sessionMemory: buildSessionMemory({
                                previous: thread.sessionMemory,
                                prompt: effectivePrompt,
                                lastCheck: null,
                            }),
                            t,
                        }),
                        lastCheck: null,
                        lastEvaluation: null,
                        pendingProposal: null,
                        latestHandoff: null,
                        latestArtifact: null,
                        planDraft: {
                            prompt: effectivePrompt,
                            normalizedPrompt: resolved.normalizedPrompt || effectivePrompt,
                            resolvedIntent,
                            intentConfidence: resolved.confidence,
                            explicitTargetChapterId: referencedPage.targetChapterId ?? undefined,
                            slots: resolved.slots,
                        },
                        messages: [
                            ...thread.messages,
                            createMessage('user', prompt),
                            createMessage('assistant', t('rightPane.planReadyMessage')),
                        ],
                    }
                    return {
                        ...nextThread,
                        ...refreshThreadContextState({ thread: nextThread, t }),
                    }
                })()
            )
            appendActivity(activeThread.id, {
                label: t('rightPane.activityPlanReady'),
                detail: `${intentLabel(resolvedIntent, t)} · ${Math.round(resolved.confidence * 100)}%`,
                tone: 'success',
            })
        }

        setAttachedFiles([])

        if (copilotMode === 'apply' || shouldRunImmediately) {
            const autoPlan: CopilotPlanDraft = {
                prompt: effectivePrompt,
                normalizedPrompt: resolved.normalizedPrompt || effectivePrompt,
                resolvedIntent,
                intentConfidence: resolved.confidence,
                explicitTargetChapterId: referencedPage.targetChapterId ?? undefined,
                slots: resolved.slots,
            }
            void runGeneratePreview(activeThread.id, autoPlan)
        }
    }, [
        activeThread,
        appendActivity,
        copilotBusy,
        copilotMode,
        createMessage,
        resolveCopilotContext,
        runGeneralChatReply,
        runGeneratePreview,
        runSteerTurn,
        metadata,
        activeChapter,
        chapterCount,
        setAttachedFiles,
        t,
        updateThreadById,
    ])

    const generatePreviewFromPlan = useCallback(async () => {
        if (!activeThread || !activeThread.planDraft || copilotBusy) return
        await runGeneratePreview(activeThread.id, activeThread.planDraft)
    }, [activeThread, copilotBusy, runGeneratePreview])

    return {
        submitCopilotPrompt,
        generatePreviewFromPlan,
    }
}
