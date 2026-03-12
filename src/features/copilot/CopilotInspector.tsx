import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronUp, Send } from 'lucide-react'
import type { CopilotAppServerStreamEvent } from '../../../shared/copilotIpc'
import { useProjectStore } from '../../store/projectStore'
import { useChapterStore } from '../chapters/useChapterStore'
import { useEditorStore } from '../chapters/useEditorStore'
import { useDesignStore } from '../design-panel/useDesignStore'
import { useCopilotThreadState } from './useCopilotThreadState'
import { useCopilotPromptFlow } from './useCopilotPromptFlow'
import { createRightPaneCopilotActions } from './rightPaneActions'
import { RightPaneCopilotHeader } from './rightPaneCopilotHeader'
import { RightPaneThreadManager } from './rightPaneThreadManager'
import { RightPanePlanDraftCard } from './rightPanePlanDraftCard'
import { RightPanePreviewPanel } from './rightPanePreviewPanel'
import { RightPaneComposerCard } from './rightPaneComposerCard'
import {
    evaluateEnvelopeRisk,
    formatThreadUpdatedAt,
    getExplicitSelectionText,
    inferCopilotContextScope,
    resolveSelectedContext,
    shouldSkipPreviewReview,
} from './rightPaneUtils'
import { renderMessageText } from './rightPaneMessageRenderer'
import { newId } from './rightPaneThreadStorage'
import type { CopilotPlanDraft, CopilotTurnState } from './rightPaneTypes'
import { showToast } from '../../utils/toast'
import type { InspectorMode } from '../../components/layout/inspectorMode'
import { buildThreadContextSnapshot, refreshThreadContextState } from './rightPaneAgentUtils'
import { readCurrentPage, readCurrentSelection } from './editorToolAdapter'

const STREAM_SOFT_LIMIT_CHARS = 2200

interface CopilotInspectorProps {
    onRequestInspector?: (mode: Exclude<InspectorMode, 'copilot'>) => void
}

export default function CopilotInspector({ onRequestInspector }: CopilotInspectorProps) {
    const { t } = useTranslation()
    const projectPath = useProjectStore((state) => state.projectPath)
    const projectSessionId = useProjectStore((state) => state.projectSessionId)
    const metadata = useProjectStore((state) => state.metadata)
    const editor = useEditorStore((state) => state.editor)
    const chapters = useChapterStore((state) => state.chapters)
    const activeChapterId = useChapterStore((state) => state.activeChapterId)
    const designSettings = useDesignStore((state) => state.settings)
    const activeChapter = activeChapterId ? chapters.find((chapter) => chapter.id === activeChapterId) : undefined
    const composerRef = useRef<HTMLTextAreaElement | null>(null)
    const autoApplyKeyRef = useRef<string | null>(null)

    const {
        copilotThreads,
        activeThread,
        activeThreadId,
        setActiveThreadId,
        updateThreadById,
        updateActiveThread,
        createThread,
        renameThread,
        deleteThread,
    } = useCopilotThreadState({
        projectPath,
        projectSessionId,
        projectMetadata: metadata,
        untitledLabel: t('rightPane.threadNew'),
    })

    const [copilotBusy, setCopilotBusy] = useState(false)
    const [copilotApplying, setCopilotApplying] = useState(false)
    const [copilotMode] = useState<'plan' | 'apply'>('plan')
    const [threadRenamingId, setThreadRenamingId] = useState<string | null>(null)
    const [threadRenameDraft, setThreadRenameDraft] = useState('')
    const [showThreadManager, setShowThreadManager] = useState(false)
    const [attachedFiles, setAttachedFiles] = useState<string[]>([])

    const createMessage = useCallback((role: 'user' | 'assistant', text: string) => ({
        id: newId('message'),
        role,
        text,
    }), [])

    const appendAssistantMessage = (text: string) => {
        if (!activeThread) return
        updateThreadById(activeThread.id, (thread) => {
            const nextThread = {
                ...thread,
                messages: [...thread.messages, createMessage('assistant', text)],
            }
            return {
                ...nextThread,
                ...refreshThreadContextState({ thread: nextThread, t }),
            }
        })
    }

    const appendActivity = useCallback(
        (
            threadId: string,
            entry: { label: string; detail?: string | null; tone: 'neutral' | 'info' | 'success' | 'warning' | 'error' },
        ) => {
            updateThreadById(threadId, (thread) => ({
                ...thread,
                activity: [
                    ...thread.activity,
                    {
                        id: newId('activity'),
                        createdAt: new Date().toISOString(),
                        label: entry.label,
                        detail: entry.detail ?? null,
                        tone: entry.tone,
                    },
                ].slice(-20),
            }))
        },
        [updateThreadById],
    )

    const resolveCopilotContext = useCallback(
        (prompt: string, resolvedIntent?: CopilotPlanDraft['resolvedIntent'] | null) => {
            const selectionSnapshot = readCurrentSelection()
            const pageSnapshot = readCurrentPage()
            const explicitSelection = selectionSnapshot?.text ?? getExplicitSelectionText(editor)
            const selectedRange = selectionSnapshot
                ? {
                      from: selectionSnapshot.from,
                      to: selectionSnapshot.to,
                  }
                : undefined
            const scope = inferCopilotContextScope({
                prompt,
                resolvedIntent: resolvedIntent ?? null,
                hasSelection: explicitSelection.length > 0,
            })
            return {
                scope,
                selectedText: resolveSelectedContext({
                    contextScope: scope,
                    editor,
                    projectTitle: metadata.title,
                    chapterCount: chapters.length,
                    activeChapterTitle: activeChapter?.title,
                    chapterTitles: chapters
                        .slice()
                        .sort((a, b) => a.order - b.order)
                        .map((chapter) => chapter.title || ''),
                }),
                activePageSummary: pageSnapshot?.structureSummary,
                selectedRange,
                explicitSelection,
            }
        },
        [activeChapter?.title, chapters, editor, metadata.title],
    )

    const computePreviewRisk = () =>
        evaluateEnvelopeRisk({
            envelope: activeThread?.previewEnvelope ?? null,
            activeChapter,
            editor,
            t,
            deleteRatioWarn: 0.4,
            deleteRatioBlock: 0.75,
        })
    const previewRisk = useMemo(computePreviewRisk, [activeChapter, activeThread?.previewEnvelope, editor, t])
    const skipPreviewReview = useMemo(
        () =>
            shouldSkipPreviewReview({
                envelope: activeThread?.previewEnvelope ?? null,
                riskLevel: previewRisk.level,
                activeChapterId: activeChapter?.id ?? null,
            }),
        [activeChapter?.id, activeThread?.previewEnvelope, previewRisk.level],
    )
    const threadContext = activeThread ? buildThreadContextSnapshot({ thread: activeThread, t }) : null

    const copilotActions = createRightPaneCopilotActions({
        t,
        copilotBusy,
        setCopilotBusy,
        copilotApplying,
        setCopilotApplying,
        activeThread,
        getThreadById: (threadId) => copilotThreads.find((thread) => thread.id === threadId),
        activeChapter,
        chaptersCount: chapters.length,
        projectMetadataTitle: metadata.title,
        projectPath,
        threadContextSnapshot: threadContext,
        resolveCopilotContext,
        updateThreadById,
        updateActiveThread,
        createMessage,
        appendActivity,
        appendAssistantMessage,
        evaluatePreviewRisk: computePreviewRisk,
    })

    useEffect(() => {
        const previewEnvelope = activeThread?.previewEnvelope
        if (!activeThread || !previewEnvelope) {
            autoApplyKeyRef.current = null
            return
        }
        const autoPolicyOnly =
            activeThread.agentTasks.length > 0 &&
            activeThread.agentTasks.every((task) => task.policy === 'auto')
        const shouldAutoApply = (autoPolicyOnly && previewRisk.level === 'low') || skipPreviewReview
        if (!shouldAutoApply || !activeThread.applySafetyConfirmed) {
            autoApplyKeyRef.current = null
            return
        }
        if (copilotApplying) return

        const autoKey = `${activeThread.id}:${previewEnvelope.summary}:${previewEnvelope.commands.length}`
        if (autoApplyKeyRef.current === autoKey) return
        autoApplyKeyRef.current = autoKey
        void copilotActions.applyPreview()
    }, [
        activeThread,
        copilotActions,
        copilotApplying,
        previewRisk.level,
        skipPreviewReview,
    ])

    const { submitCopilotPrompt, generatePreviewFromPlan } = useCopilotPromptFlow({
        t,
        activeThread,
        copilotBusy,
        copilotMode,
        resolveCopilotContext,
        metadata,
        activeChapter,
        chapterCount: chapters.length,
        updateThreadById,
        createMessage,
        appendActivity,
        setAttachedFiles,
        runGeneralChatReply: copilotActions.runGeneralChatReply,
        runGeneratePreview: copilotActions.runGeneratePreview,
        runSteerTurn: copilotActions.runSteerTurn,
    })

    useEffect(() => {
        if (typeof window === 'undefined') return
        if (typeof window.electronAPI?.onCopilotStreamEvent !== 'function') return
        return window.electronAPI.onCopilotStreamEvent((event: CopilotAppServerStreamEvent) => {
            const eventThreadKey = String(event.threadKey ?? '').trim()
            const eventThreadId = String(event.threadId ?? '').trim()
            const eventTurnId = String(event.turnId ?? '').trim()
            const targetThread = copilotThreads.find((thread) => {
                if (eventThreadKey && thread.appServerThreadKey === eventThreadKey) return true
                if (eventThreadId && thread.appServerThreadId === eventThreadId) return true
                if (eventTurnId && thread.appServerTurnId === eventTurnId) return true
                return false
            })
            if (!targetThread) return

            if (event.type === 'delta') {
                const nextText = String(event.text ?? event.delta ?? '')
                if (!nextText) return
                updateThreadById(targetThread.id, (thread) => {
                    const thinkingText = t('centerPane.aiChatThinking')
                    const withoutThinking = thread.messages.filter(
                        (message) =>
                            !(
                                message.role === 'assistant' &&
                                String(message.text ?? '').trim() === thinkingText
                            ),
                    )
                    const last = withoutThinking[withoutThinking.length - 1]
                    const nextMessages =
                        last && last.role === 'assistant'
                            ? [
                                  ...withoutThinking.slice(0, -1),
                                  {
                                      ...last,
                                      text: nextText,
                                  },
                              ]
                            : [...withoutThinking, createMessage('assistant', nextText)]
                    const shouldWarn =
                        !thread.streamSoftLimitNotified &&
                        nextText.length >= STREAM_SOFT_LIMIT_CHARS
                    if (shouldWarn) {
                        showToast(t('rightPane.turnEarlyStopHint'), 'info')
                    }
                    return {
                        ...thread,
                        turnState: 'streaming',
                        turnError: null,
                        appServerThreadId: eventThreadId || thread.appServerThreadId,
                        appServerTurnId: eventTurnId || thread.appServerTurnId,
                        streamSoftLimitNotified: thread.streamSoftLimitNotified || shouldWarn,
                        messages: nextMessages,
                    }
                })
                return
            }

            if (event.type === 'turn_completed') {
                const status =
                    event.status === 'failed'
                        ? 'failed'
                        : event.status === 'interrupted'
                            ? 'interrupted'
                            : 'completed'
                const completedText = String(event.text ?? '').trim()
                updateThreadById(targetThread.id, (thread) => {
                    const withoutThinking = thread.messages.filter(
                        (message) =>
                            !(
                                message.role === 'assistant' &&
                                String(message.text ?? '').trim() === t('centerPane.aiChatThinking')
                            ),
                    )
                    let nextMessages = withoutThinking
                    if (completedText) {
                        const last = withoutThinking[withoutThinking.length - 1]
                        nextMessages =
                            last && last.role === 'assistant'
                                ? [
                                      ...withoutThinking.slice(0, -1),
                                      {
                                          ...last,
                                          text: completedText,
                                      },
                                  ]
                                : [...withoutThinking, createMessage('assistant', completedText)]
                    } else if (status === 'interrupted') {
                        nextMessages = [...withoutThinking, createMessage('assistant', t('rightPane.turnInterrupted'))]
                    }
                    return {
                        ...thread,
                        turnState: status,
                        turnError:
                            status === 'failed'
                                ? String(event.error ?? t('centerPane.aiGenerateFailed', { error: t('common.unknownError') }))
                                : null,
                        appServerThreadId: eventThreadId || thread.appServerThreadId,
                        appServerTurnId: eventTurnId || thread.appServerTurnId,
                        messages: nextMessages,
                    }
                })
            }
        })
    }, [copilotThreads, createMessage, t, updateThreadById])

    const riskBadgeClass =
        previewRisk.level === 'high'
            ? 'border-rose-500/45 bg-rose-950/35 text-rose-100'
            : previewRisk.level === 'medium'
                ? 'border-amber-500/45 bg-amber-950/30 text-amber-100'
                : 'border-emerald-500/45 bg-emerald-950/30 text-emerald-100'

    const canCreateNewChat = copilotThreads.length < 20
    const canSteer = copilotBusy && Boolean(activeThread.appServerThreadKey) && Boolean(activeThread.appServerTurnId)
    const canResumeInterruptedRun =
        activeThread?.turnState === 'interrupted' && Boolean(activeThread.currentRun)

    const turnStateLabelKeyByState: Record<CopilotTurnState, string> = {
        idle: 'rightPane.turnStateIdle',
        planning: 'rightPane.turnStatePlanning',
        streaming: 'rightPane.turnStateStreaming',
        completed: 'rightPane.turnStateCompleted',
        failed: 'rightPane.turnStateFailed',
        interrupted: 'rightPane.turnStateInterrupted',
    }
    const turnStateLabel = t(turnStateLabelKeyByState[activeThread.turnState])
    const emptyStateExamples = [
        t('rightPane.emptyExampleAppend'),
        t('rightPane.emptyExampleRename'),
        t('rightPane.emptyExampleTheme'),
        t('rightPane.emptyExampleExport'),
    ]
    const suggestedTasks = useMemo(() => {
        const suggestions: Array<{
            prompt: string
            inspector?: Exclude<InspectorMode, 'copilot'>
            label: string
        }> = []

        if (!metadata.title?.trim() || !(metadata.authors ?? []).some((author) => author.name?.trim())) {
            suggestions.push({
                prompt: t('rightPane.suggestedPromptBookInfo'),
                inspector: 'bookInfo',
                label: t('toolbox.bookInfo'),
            })
        }

        if (activeChapter?.id) {
            suggestions.push({
                prompt: t('rightPane.suggestedPromptActiveChapter', {
                    title: activeChapter.title || t('editor.untitled'),
                }),
                inspector: 'design',
                label: t('toolbox.design'),
            })
        }

        if (!metadata.coverImage) {
            suggestions.push({
                prompt: t('rightPane.suggestedPromptCover'),
                inspector: 'cover',
                label: t('toolbox.coverAssets'),
            })
        }

        suggestions.push({
            prompt: t('rightPane.suggestedPromptTheme', {
                theme: designSettings.theme,
            }),
            inspector: 'design',
            label: t('toolbox.design'),
        })

        suggestions.push({
            prompt: t('rightPane.suggestedPromptExport'),
            inspector: 'history',
            label: t('toolbox.versionManager'),
        })

        return suggestions.slice(0, 4)
    }, [activeChapter?.id, activeChapter?.title, designSettings.theme, metadata.authors, metadata.coverImage, metadata.title, t])
    const followUpSuggestions = useMemo(() => {
        const items: Array<{ prompt: string; inspector?: Exclude<InspectorMode, 'copilot'>; label?: string }> = []
        const previewCommands = activeThread?.previewEnvelope?.commands ?? []

        if (activeThread?.lastEvaluation?.recommendedNextAction) {
            items.push({
                prompt: activeThread.lastEvaluation.recommendedNextAction,
            })
        }

        if (previewCommands.length > 0) {
            const hasDesignChange = previewCommands.some((command) =>
                command.type === 'set_typography' ||
                command.type === 'set_page_background' ||
                command.type === 'apply_theme',
            )
            const hasMetadataChange = previewCommands.some((command) => command.type === 'update_book_info')
            const hasCoverChange = previewCommands.some((command) => command.type === 'set_cover_asset')
            const hasStructuralChange = previewCommands.some((command) =>
                command.type === 'rename_chapter' ||
                command.type === 'move_chapter' ||
                command.type === 'delete_chapter' ||
                command.type === 'create_chapter',
            )

            items.push({
                prompt: t('rightPane.followUpPromptReduceRisk'),
            })
            if (hasDesignChange) {
                items.push({
                    prompt: t('rightPane.followUpPromptDesignReview'),
                    inspector: 'design',
                    label: t('toolbox.design'),
                })
            }
            if (hasMetadataChange || hasCoverChange) {
                items.push({
                    prompt: hasCoverChange
                        ? t('rightPane.followUpPromptCoverPolish')
                        : t('rightPane.followUpPromptMetadataPolish'),
                    inspector: hasCoverChange ? 'cover' : 'bookInfo',
                    label: hasCoverChange ? t('toolbox.coverAssets') : t('toolbox.bookInfo'),
                })
            }
            if (hasStructuralChange) {
                items.push({
                    prompt: t('rightPane.followUpPromptStructureCheck'),
                    inspector: 'history',
                    label: t('toolbox.versionManager'),
                })
            }
        } else if (activeThread?.lastCheckpointId || activeThread?.lastRecoveryHint) {
            items.push({
                prompt: t('rightPane.followUpPromptSaveNow'),
            })
            items.push({
                prompt: t('rightPane.followUpPromptExportCheck'),
                inspector: 'history',
                label: t('toolbox.versionManager'),
            })
        }

        return items.slice(0, 3)
    }, [activeThread?.lastCheckpointId, activeThread?.lastEvaluation?.recommendedNextAction, activeThread?.lastRecoveryHint, activeThread?.previewEnvelope?.commands, t])
    if (!activeThread) {
        return null
    }
    const activeThreadContext = threadContext
    if (!activeThreadContext) {
        return null
    }

    const isEmptyConversation =
        activeThread.messages.length === 0 &&
        !activeThread.planDraft &&
        !activeThread.previewEnvelope &&
        activeThread.activity.length === 0 &&
        !activeThread.agentGoal
    const shouldShowThreadManager = !isEmptyConversation && showThreadManager

    return (
        <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto bg-[radial-gradient(circle_at_top,rgba(20,184,166,0.08),transparent_32%),linear-gradient(180deg,rgba(11,14,18,0.96),rgba(9,11,15,0.98))] p-3">
            {!isEmptyConversation ? (
                <RightPaneCopilotHeader
                    t={t}
                    activeThreadLabel={activeThread.title}
                    turnState={activeThread.turnState}
                    turnStateLabel={turnStateLabel}
                    copilotBusy={copilotBusy}
                    copilotApplying={copilotApplying}
                    canCreateNewChat={canCreateNewChat}
                    shouldShowThreadManager={shouldShowThreadManager}
                    canToggleThreadManager
                    onCreateThread={createThread}
                    onToggleThreadManager={() => setShowThreadManager((prev) => !prev)}
                />
            ) : null}

            <RightPaneThreadManager
                t={t}
                shouldShowThreadManager={shouldShowThreadManager}
                copilotThreads={copilotThreads}
                activeThreadId={activeThreadId}
                threadRenamingId={threadRenamingId}
                threadRenameDraft={threadRenameDraft}
                setThreadRenameDraft={setThreadRenameDraft}
                setThreadRenamingId={setThreadRenamingId}
                renameThread={renameThread}
                setActiveThreadId={setActiveThreadId}
                requestDeleteThread={(thread) => {
                    if (!window.confirm(t('rightPane.threadDelete'))) return
                    deleteThread(thread.id)
                }}
                formatThreadUpdatedAt={(value) => formatThreadUpdatedAt(value, t)}
            />

            {activeThread.lastRecoveryHint ? (
                <div className="rounded-2xl border border-neutral-800 bg-[linear-gradient(180deg,rgba(24,28,36,0.96),rgba(10,13,18,0.98))] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
                        {t('rightPane.recoveryTitle')}
                    </div>
                    <div className="mt-2 text-sm leading-5 text-neutral-200">{activeThread.lastRecoveryHint}</div>
                    {canResumeInterruptedRun ? (
                        <button
                            type="button"
                            data-testid="copilot-resume-run"
                            onClick={() => {
                                if (!copilotActions.resumeInterruptedRun()) return
                                queueMicrotask(() => composerRef.current?.focus())
                            }}
                            className="mt-3 inline-flex items-center rounded-full border border-teal-700/60 bg-teal-950/40 px-3 py-1.5 text-xs font-medium text-teal-100 transition hover:border-teal-500/70 hover:bg-teal-900/45"
                        >
                            {t('rightPane.resumeInterruptedAction')}
                        </button>
                    ) : null}
                </div>
            ) : null}

            {activeThread.pendingProposal?.kind === 'confirm_structured_create' ? (
                <div
                    data-testid="copilot-pending-proposal"
                    className="rounded-2xl border border-amber-800/70 bg-[linear-gradient(180deg,rgba(56,38,12,0.28),rgba(9,12,16,0.98))] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                >
                    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-300/80">
                        {t('rightPane.structuredConfirmationTitle')}
                    </div>
                    <div className="mt-2 text-sm font-medium leading-5 text-amber-50">
                        {activeThread.pendingProposal.summary || t('rightPane.agentEvalNeedsUserSummary')}
                    </div>
                    {activeThread.pendingProposal.detail ? (
                        <div className="mt-3 whitespace-pre-line rounded-xl border border-amber-900/50 bg-amber-950/20 px-3 py-2 text-xs leading-5 text-amber-100/85">
                            {activeThread.pendingProposal.detail}
                        </div>
                    ) : null}
                    <div className="mt-3 rounded-xl border border-neutral-800 bg-neutral-950/55 px-3 py-2 text-xs leading-5 text-neutral-200">
                        {t('rightPane.structuredConfirmationHint')}
                    </div>
                </div>
            ) : null}

            {followUpSuggestions.length > 0 ? (
                <div className="rounded-2xl border border-neutral-800 bg-[linear-gradient(180deg,rgba(18,22,30,0.96),rgba(10,13,18,0.98))] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
                        {t('rightPane.followUpTitle')}
                    </div>
                    <div className="mt-3 space-y-2">
                        {followUpSuggestions.map((item) => (
                            <button
                                key={`${item.prompt}-${item.inspector ?? 'chat'}`}
                                onClick={() =>
                                    updateActiveThread((thread) => ({
                                        ...thread,
                                        draft: item.prompt,
                                    }))
                                }
                                className="w-full rounded-xl border border-neutral-800 bg-neutral-900/75 px-3 py-2.5 text-left transition hover:border-neutral-700 hover:bg-neutral-800"
                            >
                                <div className="flex flex-col items-start gap-2">
                                    <div className="text-sm leading-5 text-neutral-100">{item.prompt}</div>
                                    {item.inspector && item.label ? (
                                        <span className="shrink-0 whitespace-nowrap rounded-full border border-neutral-700 bg-neutral-950 px-2 py-0.5 text-[10px] text-neutral-400">
                                            {item.label}
                                        </span>
                                    ) : null}
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            ) : null}

            {isEmptyConversation ? (
                <div className="flex flex-1 flex-col justify-center gap-4">
                    {copilotThreads.length > 1 ? (
                        <div className="flex justify-end">
                            <button
                                type="button"
                                onClick={() => setShowThreadManager((prev) => !prev)}
                                title={shouldShowThreadManager ? t('common.close') : t('rightPane.threadListLabel')}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-900/80 text-neutral-300 transition hover:border-neutral-600 hover:bg-neutral-800 hover:text-white"
                            >
                                {shouldShowThreadManager ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                            </button>
                        </div>
                    ) : null}

                    <div className="space-y-2">
                        <p className="max-w-[26ch] text-2xl font-semibold leading-9 text-neutral-50">
                            {t('rightPane.emptyStateTitle')}
                        </p>
                        <p className="max-w-[34ch] text-sm leading-6 text-neutral-400">{t('rightPane.emptyStateHelper')}</p>
                    </div>

                    <RightPaneComposerCard
                        t={t}
                        composerRef={composerRef}
                        draft={activeThread.draft}
                        copilotBusy={copilotBusy}
                        allowInputWhileBusy={canSteer}
                        isPrimary
                        onDraftChange={(value) =>
                            updateActiveThread((thread) => ({
                                ...thread,
                                draft: value,
                            }))
                        }
                        onComposerInput={(element) => {
                            element.style.height = '96px'
                            element.style.height = `${Math.min(Math.max(element.scrollHeight, 96), 220)}px`
                        }}
                        onSubmit={() => {
                            void submitCopilotPrompt()
                        }}
                        controls={
                            <div className="flex items-center justify-end gap-2">
                                <button
                                    onClick={() => {
                                        void submitCopilotPrompt()
                                    }}
                                    data-testid="copilot-submit-button"
                                    disabled={!activeThread.draft.trim() || (copilotBusy && !canSteer)}
                                    title={copilotBusy ? t('rightPane.turnSteerSubmit') : t('centerPane.aiSend')}
                                    aria-label={copilotBusy ? t('rightPane.turnSteerSubmit') : t('centerPane.aiSend')}
                                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-teal-500/30 bg-[linear-gradient(180deg,rgba(20,184,166,0.22),rgba(15,23,42,0.7))] text-teal-50 transition hover:border-teal-400/40 hover:bg-[linear-gradient(180deg,rgba(20,184,166,0.3),rgba(15,23,42,0.82))] disabled:opacity-60"
                                >
                                    <Send size={14} />
                                </button>
                            </div>
                        }
                    />

                    <div data-testid="copilot-message-list" className="flex flex-wrap gap-2">
                        {[...suggestedTasks.slice(0, 2).map((item) => item.prompt), ...emptyStateExamples.slice(0, 2)].map((prompt) => (
                            <button
                                key={prompt}
                                onClick={() =>
                                    updateActiveThread((thread) => ({
                                        ...thread,
                                        draft: prompt,
                                    }))
                                }
                                className="rounded-full border border-neutral-700 bg-neutral-950/80 px-3 py-2 text-xs text-neutral-200 transition hover:border-neutral-600 hover:bg-neutral-900"
                            >
                                {prompt}
                            </button>
                        ))}
                    </div>
                </div>
            ) : (
                <div
                    data-testid="copilot-message-list"
                    className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-2xl border border-neutral-800 bg-[linear-gradient(180deg,rgba(19,23,31,0.92),rgba(9,12,16,0.98))] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                >
                    {activeThread.messages.map((message) => (
                        <div
                            key={message.id}
                            className={`text-sm leading-6 ${
                                message.role === 'user'
                                    ? 'rounded-2xl border border-sky-500/30 bg-[linear-gradient(180deg,rgba(14,165,233,0.16),rgba(8,47,73,0.28))] px-3 py-2.5 text-sky-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]'
                                    : String(message.text ?? '').trim() === t('centerPane.aiChatThinking')
                                      ? 'px-1 py-0.5 text-xs text-neutral-500'
                                    : 'select-text px-1 py-1 text-neutral-200'
                            }`}
                            data-testid={message.role === 'assistant' ? 'copilot-assistant-message' : undefined}
                        >
                            {renderMessageText(message.text)}
                        </div>
                    ))}
                </div>
            )}

            {!isEmptyConversation && activeThread.planDraft ? (
                <RightPanePlanDraftCard
                    t={t}
                    planDraft={activeThread.planDraft}
                    copilotBusy={copilotBusy}
                    onCancel={() =>
                        updateActiveThread((thread) => ({
                            ...thread,
                            planDraft: null,
                        }))
                    }
                    onGeneratePreview={() => {
                        void generatePreviewFromPlan()
                    }}
                />
            ) : null}

            {!isEmptyConversation &&
            activeThread.previewEnvelope &&
            (!skipPreviewReview || activeThread.turnState === 'failed') ? (
                <RightPanePreviewPanel
                    t={t}
                    activeThread={activeThread}
                    previewCommands={activeThread.previewEnvelope.commands}
                    previewWarnings={activeThread.previewEnvelope.warnings ?? []}
                    previewRisk={previewRisk}
                    riskBadgeClass={riskBadgeClass}
                    copilotApplying={copilotApplying}
                    updateActiveThread={updateActiveThread}
                    applyPreview={copilotActions.applyPreview}
                    onRequestInspector={(mode) => {
                        appendActivity(activeThread.id, {
                            label: t('rightPane.activityInspectorOpened'),
                            detail: mode,
                            tone: 'info',
                        })
                        onRequestInspector?.(mode)
                    }}
                    chapters={chapters}
                    metadata={metadata}
                    designSettings={designSettings}
                    activeChapter={activeChapter}
                />
            ) : null}

            {!isEmptyConversation ? (
                <RightPaneComposerCard
                    t={t}
                    composerRef={composerRef}
                    draft={activeThread.draft}
                    copilotBusy={copilotBusy}
                    allowInputWhileBusy={canSteer}
                    onDraftChange={(value) =>
                        updateActiveThread((thread) => ({
                            ...thread,
                            draft: value,
                        }))
                    }
                    onComposerInput={(element) => {
                        element.style.height = '36px'
                        element.style.height = `${Math.min(element.scrollHeight, 220)}px`
                    }}
                    onSubmit={() => {
                        void submitCopilotPrompt()
                    }}
                    controls={
                        <div className="flex items-center justify-end gap-2">
                            <button
                                onClick={() => {
                                    void submitCopilotPrompt()
                                }}
                                data-testid="copilot-submit-button"
                                disabled={!activeThread.draft.trim() || (copilotBusy && !canSteer)}
                                title={copilotBusy ? t('rightPane.turnSteerSubmit') : t('centerPane.aiSend')}
                                aria-label={copilotBusy ? t('rightPane.turnSteerSubmit') : t('centerPane.aiSend')}
                                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-teal-500/30 bg-[linear-gradient(180deg,rgba(20,184,166,0.22),rgba(15,23,42,0.7))] text-teal-50 transition hover:border-teal-400/40 hover:bg-[linear-gradient(180deg,rgba(20,184,166,0.3),rgba(15,23,42,0.82))] disabled:opacity-60"
                            >
                                <Send size={14} />
                            </button>
                        </div>
                    }
                />
            ) : null}

            {attachedFiles.length > 0 ? (
                <p className="text-[10px] text-neutral-500">{attachedFiles.join(', ')}</p>
            ) : null}
        </div>
    )
}
