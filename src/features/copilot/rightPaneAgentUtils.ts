import type { TFunction } from 'i18next'
import type { CopilotAppServerTokenUsage, CopilotIntent, CopilotRuntimeMode } from '../../../shared/copilotIpc'
import { COPILOT_TOOL_REGISTRY, resolveIntentToolIds } from '../../../shared/copilotToolRegistry'
import type { Chapter, BookMetadata } from '../../types/project'
import type {
    CopilotAgentGoal,
    CopilotAgentRun,
    CopilotAgentStep,
    CopilotAgentStepStatus,
    CopilotAgentTask,
    CopilotAgentTaskStatus,
    CopilotCheckResult,
    CopilotEvaluationResult,
    CopilotMemoryNote,
    CopilotSessionMemory,
    CopilotApprovalPolicy,
    CopilotGuardrailStatus,
    CopilotRuntimeStatus,
    CopilotThreadState,
} from './rightPaneTypes'

export type CopilotContextStatus = 'fresh' | 'watch' | 'tight'

function runtimeProviderLabel(mode: CopilotRuntimeMode, modelHint?: string | null, baseUrl?: string | null): string {
    const normalizedModel = String(modelHint ?? '').trim().toLowerCase()
    const normalizedBaseUrl = String(baseUrl ?? '').trim().toLowerCase()
    if (mode === 'direct') {
        if (normalizedBaseUrl.includes('groq') || normalizedModel.includes('llama') || normalizedModel.includes('mixtral')) {
            return 'Direct · Groq'
        }
        if (normalizedBaseUrl.includes('openai') || normalizedModel.includes('gpt') || normalizedModel.includes('oai')) {
            return 'Direct · OpenAI'
        }
        return 'Direct Provider'
    }
    if (mode === 'http') return 'HTTP Runtime'
    if (mode === 'ipc') return 'IPC Runtime'
    return 'Codex App Server'
}

function runtimeRecommendedAction(args: {
    mode: CopilotRuntimeMode
    errorText?: string | null
    tokenUsage?: CopilotAppServerTokenUsage | null
    hasDirectApiKey?: boolean
}): string | null {
    const normalizedError = String(args.errorText ?? '').trim().toLowerCase()
    if (args.tokenUsage?.threadBudgetExceeded || args.tokenUsage?.userBudgetExceeded) {
        return '새 스레드를 시작하거나 대화를 압축한 뒤 다시 시도하세요.'
    }
    if (normalizedError.includes('네트워크') || normalizedError.includes('network')) {
        return '네트워크 연결이나 runtime endpoint 상태를 확인한 뒤 다시 시도하세요.'
    }
    if (normalizedError.includes('인증') || normalizedError.includes('unauthorized') || normalizedError.includes('api key')) {
        return args.mode === 'direct'
            ? 'direct provider API 키와 모델 설정을 확인하세요.'
            : 'runtime 인증 설정을 확인한 뒤 다시 시도하세요.'
    }
    if (args.mode === 'direct' && !args.hasDirectApiKey) {
        return 'direct provider API 키를 설정하거나 app-server 경로를 사용하세요.'
    }
    return null
}

export function buildRuntimeStatus(args: {
    mode: CopilotRuntimeMode
    source: CopilotRuntimeStatus['source']
    modelHint?: string | null
    directBaseUrl?: string | null
    hasDirectApiKey?: boolean
    errorText?: string | null
    tokenUsage?: CopilotAppServerTokenUsage | null
    now?: string
}): CopilotRuntimeStatus {
    const lastUsedAt = args.now ?? new Date().toISOString()
    const tokenUsage = args.tokenUsage ?? null
    const errorText = String(args.errorText ?? '').trim() || null
    const budgetExceeded = Boolean(tokenUsage?.threadBudgetExceeded || tokenUsage?.userBudgetExceeded)
    const status: CopilotRuntimeStatus['status'] = errorText ? 'error' : budgetExceeded ? 'warning' : 'ready'
    const detail = errorText
        ? errorText
        : budgetExceeded
          ? `Token budget ${tokenUsage?.threadTotalTokens ?? 0}/${tokenUsage?.threadBudgetTokens ?? 0} (thread)`
          : args.source === 'apply'
            ? 'Preview apply and post-check completed in editor.'
            : args.source === 'preview'
              ? 'Preview generated and waiting for review/apply.'
              : 'Chat response completed normally.'
    return {
        mode: args.mode,
        source: args.source,
        providerLabel: runtimeProviderLabel(args.mode, args.modelHint, args.directBaseUrl),
        modelLabel: String(args.modelHint ?? '').trim() || null,
        status,
        detail,
        recommendedAction: runtimeRecommendedAction({
            mode: args.mode,
            errorText,
            tokenUsage,
            hasDirectApiKey: args.hasDirectApiKey,
        }),
        lastUsedAt,
    }
}

export function buildGuardrailStatus(args: {
    featureId: string
    allowed: boolean
    plan: 'FREE' | 'PRO_LITE' | 'PRO'
    aiCreditsRemaining: number | null
    reason:
        | 'plan-allows-feature'
        | 'plan-does-not-allow-feature'
        | 'feature-disabled-by-flag'
        | 'insufficient-ai-credits'
    checkedAt?: string
}): CopilotGuardrailStatus {
    const checkedAt = args.checkedAt ?? new Date().toISOString()
    const detail =
        args.allowed
            ? `Plan ${args.plan}${args.aiCreditsRemaining != null ? ` / credits=${args.aiCreditsRemaining}` : ''}`
            : args.reason === 'insufficient-ai-credits'
                ? `AI credits exhausted (${args.aiCreditsRemaining ?? 0} remaining)`
                : args.reason === 'feature-disabled-by-flag'
                    ? `Feature ${args.featureId} is disabled by flag`
                    : `Plan ${args.plan} does not allow ${args.featureId}`
    const recommendedAction =
        args.allowed
            ? null
            : args.reason === 'insufficient-ai-credits'
                ? '크레딧을 충전하거나 더 적은 범위로 다시 시도하세요.'
                : '유료 플랜 상태와 entitlements 설정을 확인하세요.'
    return {
        featureId: args.featureId,
        allowed: args.allowed,
        plan: args.plan,
        aiCreditsRemaining: args.aiCreditsRemaining,
        reason: args.reason,
        detail,
        recommendedAction,
        checkedAt,
    }
}

export interface CopilotThreadContextSnapshot {
    goal: string | null
    summary: string | null
    rollingSummary: string | null
    pins: string[]
    sessionMemory: string[]
    bookMemory: string[]
    recentArtifacts: string[]
    status: CopilotContextStatus
    usageRatio: number | null
    recentMessageCount: number
    compactedMessageCount: number
}

function intentLabel(intent: CopilotIntent, t: TFunction): string {
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

function step(id: string, title: string, detail: string, status: CopilotAgentStepStatus, requiresApproval = false): CopilotAgentStep {
    return { id, title, detail, status, requiresApproval }
}

function task(
    id: string,
    title: string,
    detail: string,
    type: CopilotAgentTask['type'],
    status: CopilotAgentTaskStatus,
    policy: CopilotApprovalPolicy,
    toolIds: string[],
    dependsOn?: string[],
    requiresApproval = false,
): CopilotAgentTask {
    return { id, title, detail, type, status, policy, toolIds, dependsOn, requiresApproval }
}

export function resolveApprovalPolicy(intent: CopilotIntent): CopilotApprovalPolicy {
    if (intent === 'delete_chapter' || intent === 'restore_snapshot') return 'explicit_high_risk'
    if (
        intent === 'find_replace' ||
        intent === 'move_chapter' ||
        intent === 'set_typography' ||
        intent === 'set_page_background' ||
        intent === 'apply_theme' ||
        intent === 'update_book_info' ||
        intent === 'set_cover_asset' ||
        intent === 'export_project'
    ) {
        return 'review_required'
    }
    return 'auto'
}

export function buildAgentGoal(intent: CopilotIntent, prompt: string, t: TFunction): CopilotAgentGoal {
    return {
        summary: intentLabel(intent, t),
        outcome: t('rightPane.agentGoalOutcome', { prompt }),
    }
}

export function buildAgentSteps(intent: CopilotIntent, t: TFunction): CopilotAgentStep[] {
    const label = intentLabel(intent, t)
    const policy = resolveApprovalPolicy(intent)
    const requiresApproval = policy === 'review_required' || policy === 'explicit_high_risk'

    return [
        step('understand', t('rightPane.agentStepUnderstandTitle'), t('rightPane.agentStepUnderstandDetail', { intent: label }), 'completed'),
        step('plan', t('rightPane.agentStepPlanTitle'), t('rightPane.agentStepPlanDetail'), 'in_progress'),
        step('review', t('rightPane.agentStepReviewTitle'), t('rightPane.agentStepReviewDetail'), 'pending', requiresApproval),
        step('apply', t('rightPane.agentStepApplyTitle'), t('rightPane.agentStepApplyDetail'), 'pending', requiresApproval),
        step('check', t('rightPane.agentStepCheckTitle'), t('rightPane.agentStepCheckDetail'), 'pending'),
    ]
}

export function buildAgentTasks(intent: CopilotIntent, t: TFunction): CopilotAgentTask[] {
    const label = intentLabel(intent, t)
    const policy = resolveApprovalPolicy(intent)
    const requiresApproval = policy === 'review_required' || policy === 'explicit_high_risk'
    const toolIds = resolveIntentToolIds(intent)

    return [
        task(
            'read_context',
            t('rightPane.agentTaskReadTitle'),
            t('rightPane.agentTaskReadDetail', { intent: label }),
            'read',
            'completed',
            'auto',
            toolIds.filter((id) => COPILOT_TOOL_REGISTRY[id]?.kind === 'read'),
        ),
        task(
            'prepare_preview',
            t('rightPane.agentTaskPreviewTitle'),
            t('rightPane.agentTaskPreviewDetail'),
            'validate',
            'in_progress',
            'auto',
            toolIds.filter((id) => id === 'command_planner'),
            ['read_context'],
        ),
        task(
            'review_changes',
            t('rightPane.agentTaskReviewTitle'),
            t('rightPane.agentTaskReviewDetail'),
            requiresApproval ? 'ask_user' : 'validate',
            'pending',
            policy,
            toolIds.filter((id) => id === 'review_gate'),
            ['prepare_preview'],
            requiresApproval,
        ),
        task(
            'apply_changes',
            t('rightPane.agentTaskApplyTitle'),
            t('rightPane.agentTaskApplyDetail'),
            'write',
            'pending',
            policy,
            toolIds.filter((id) => id === 'snapshot_checkpoint' || id === 'command_apply'),
            ['review_changes'],
            requiresApproval,
        ),
        task(
            'verify_result',
            t('rightPane.agentTaskVerifyTitle'),
            t('rightPane.agentTaskVerifyDetail'),
            'validate',
            'pending',
            'auto',
            toolIds.filter((id) => id === 'post_apply_check'),
            ['apply_changes'],
        ),
    ]
}

export function advanceAgentSteps(
    steps: CopilotAgentStep[],
    patch: Partial<Record<CopilotAgentStep['id'], CopilotAgentStepStatus>>,
): CopilotAgentStep[] {
    return steps.map((item) => ({
        ...item,
        status: patch[item.id] ?? item.status,
    }))
}

export function advanceAgentTasks(
    tasks: CopilotAgentTask[],
    patch: Partial<Record<CopilotAgentTask['id'], CopilotAgentTaskStatus>>,
): CopilotAgentTask[] {
    return tasks.map((item) => ({
        ...item,
        status: patch[item.id] ?? item.status,
    }))
}

export function startAgentRun(args: {
    goalSummary: string
    taskIds: string[]
    now?: string
}): CopilotAgentRun {
    const timestamp = args.now ?? new Date().toISOString()
    return {
        id: `run-${timestamp}`,
        goalSummary: args.goalSummary,
        status: 'in_progress',
        phase: 'planning',
        startedAt: timestamp,
        updatedAt: timestamp,
        completedAt: null,
        taskIds: args.taskIds.slice(0, 8),
        lastEvaluationSummary: null,
        checkpointId: null,
    }
}

export function updateAgentRun(
    run: CopilotAgentRun | null,
    patch: Partial<Omit<CopilotAgentRun, 'id' | 'startedAt' | 'taskIds'>>,
    now?: string,
): CopilotAgentRun | null {
    if (!run) return null
    const timestamp = now ?? new Date().toISOString()
    return {
        ...run,
        ...patch,
        updatedAt: timestamp,
    }
}

export function closeAgentRun(
    run: CopilotAgentRun | null,
    args: {
        status: 'completed' | 'blocked'
        phase?: CopilotAgentRun['phase']
        lastEvaluationSummary?: string | null
        checkpointId?: string | null
        now?: string
    },
): CopilotAgentRun | null {
    if (!run) return null
    const timestamp = args.now ?? new Date().toISOString()
    return {
        ...run,
        status: args.status,
        phase: args.phase ?? (args.status === 'completed' ? 'completed' : 'blocked'),
        updatedAt: timestamp,
        completedAt: timestamp,
        lastEvaluationSummary: args.lastEvaluationSummary ?? run.lastEvaluationSummary ?? null,
        checkpointId: args.checkpointId ?? run.checkpointId ?? null,
    }
}

export function markAgentRunInterrupted(
    run: CopilotAgentRun | null,
    args?: {
        lastEvaluationSummary?: string | null
        now?: string
    },
): CopilotAgentRun | null {
    if (!run) return null
    const timestamp = args?.now ?? new Date().toISOString()
    return {
        ...run,
        phase: 'review',
        updatedAt: timestamp,
        lastEvaluationSummary: args?.lastEvaluationSummary ?? run.lastEvaluationSummary ?? null,
    }
}

export function buildInterruptedRunResumePrompt(
    thread: Pick<
        CopilotThreadState,
        'currentRun' | 'lastEvaluation' | 'latestArtifact' | 'latestHandoff' | 'lastRecoveryHint'
    >,
    t: TFunction,
): string {
    return (
        thread.lastEvaluation?.recommendedNextAction?.trim() ||
        thread.latestArtifact?.recommendedNextAction?.trim() ||
        thread.latestHandoff?.recommendedNextAction?.trim() ||
        thread.lastRecoveryHint?.trim() ||
        thread.currentRun?.lastEvaluationSummary?.trim() ||
        t('rightPane.resumeInterruptedDefaultPrompt')
    )
}

export function buildOpenRunContinuePrompt(
    thread: Pick<
        CopilotThreadState,
        'currentRun' | 'lastCheck' | 'lastEvaluation' | 'latestArtifact' | 'latestHandoff' | 'lastRecoveryHint'
    >,
    t: TFunction,
): string {
    if (thread.currentRun?.phase === 'verify') {
        return (
            thread.lastEvaluation?.recommendedNextAction?.trim() ||
            thread.latestArtifact?.recommendedNextAction?.trim() ||
            thread.lastCheck?.detail?.trim() ||
            t('rightPane.verifyRunDefaultPrompt')
        )
    }

    return (
        thread.lastEvaluation?.recommendedNextAction?.trim() ||
        thread.latestArtifact?.recommendedNextAction?.trim() ||
        thread.latestHandoff?.recommendedNextAction?.trim() ||
        thread.lastRecoveryHint?.trim() ||
        thread.currentRun?.lastEvaluationSummary?.trim() ||
        t('rightPane.resumeInterruptedDefaultPrompt')
    )
}

export function buildMemoryNotes(args: {
    metadata: BookMetadata
    activeChapter?: Chapter
    selectedContext?: string
    chapterCount: number
    t: TFunction
}): CopilotMemoryNote[] {
    const { metadata, activeChapter, selectedContext, chapterCount, t } = args
    const notes: CopilotMemoryNote[] = []

    if (metadata.title?.trim()) {
        notes.push({ id: 'title', label: t('rightPane.memoryTitleBook'), detail: metadata.title.trim() })
    }
    if (activeChapter?.title?.trim()) {
        notes.push({ id: 'chapter', label: t('rightPane.memoryTitleChapter'), detail: activeChapter.title.trim() })
    }
    if (selectedContext?.trim()) {
        notes.push({
            id: 'selection',
            label: t('rightPane.memoryTitleSelection'),
            detail: selectedContext.trim().slice(0, 120),
        })
    }
    notes.push({
        id: 'chapters',
        label: t('rightPane.memoryTitleStructure'),
        detail: t('rightPane.memoryDetailStructure', { count: chapterCount }),
    })

    return notes.slice(0, 3)
}

export function buildWorkingMemoryNotes(args: {
    prompt: string
    selectedContext?: string
    latestHandoffSummary?: string | null
    latestArtifactSummary?: string | null
    t: TFunction
}): CopilotMemoryNote[] {
    const { prompt, selectedContext, latestHandoffSummary, latestArtifactSummary, t } = args
    return uniqueStrings(
        [
            prompt ? `${t('rightPane.agentStepUnderstandTitle')}: ${compactMessageText(prompt, 72)}` : null,
            selectedContext ? `${t('rightPane.memoryTitleSelection')}: ${compactMessageText(selectedContext, 72)}` : null,
            latestHandoffSummary ? `specialist: ${compactMessageText(latestHandoffSummary, 72)}` : null,
            latestArtifactSummary ? `artifact: ${compactMessageText(latestArtifactSummary, 72)}` : null,
        ],
        4,
    ).map((value, index) => ({
        id: `working-memory-${index + 1}`,
        label: index === 0 ? 'Working Memory' : `Working Memory ${index + 1}`,
        detail: value,
    }))
}

export function buildBookMemoryNotes(args: {
    previous?: CopilotMemoryNote[] | null
    metadata: BookMetadata
    sessionMemory: CopilotSessionMemory
    t: TFunction
}): CopilotMemoryNote[] {
    const { previous, metadata, sessionMemory, t } = args
    const values = uniqueStrings(
        [
            metadata.title?.trim() ? `${t('rightPane.memoryTitleBook')}: ${metadata.title.trim()}` : null,
            sessionMemory.preferredTone
                ? t('rightPane.contextPinTone', { tone: sessionMemory.preferredTone })
                : null,
            ...(previous ?? []).map((note) => note.detail),
        ],
        4,
    )
    return values.map((value, index) => ({
        id: `book-memory-${index + 1}`,
        label: index === 0 ? 'Book Memory' : `Book Memory ${index + 1}`,
        detail: value,
    }))
}

function extractPreferredTone(prompt: string): string | null {
    const normalized = String(prompt ?? '').trim()
    if (!normalized) return null
    const match = normalized.match(/(차분|따뜻|강렬|부드럽|dark|light|novel|essay|paper|minimal)/i)
    return match ? match[0] : null
}

export function buildSessionMemory(args: {
    previous?: CopilotSessionMemory | null
    prompt: string
    lastCheck?: CopilotCheckResult | null
}): CopilotSessionMemory {
    const { previous, prompt, lastCheck } = args
    const preferredTone = extractPreferredTone(prompt) ?? previous?.preferredTone ?? null
    const unresolvedChecks =
        lastCheck?.status === 'warning'
            ? Array.from(new Set([...(previous?.unresolvedChecks ?? []), lastCheck.summary])).slice(-3)
            : (previous?.unresolvedChecks ?? []).slice(-3)

    return {
        preferredTone,
        lastApprovedIntent: previous?.lastApprovedIntent ?? null,
        pendingFollowUps: (previous?.pendingFollowUps ?? []).slice(-3),
        unresolvedChecks,
    }
}

export function buildEvaluationResult(args: {
    check: CopilotCheckResult
    intent: CopilotIntent | null
    t: TFunction
}): CopilotEvaluationResult {
    const { check, intent, t } = args
    const nextAction =
        check.status === 'warning'
            ? intent === 'export_project'
                ? t('rightPane.agentEvalNextExport')
                : t('rightPane.agentEvalNextReview')
            : intent === 'save_project'
                ? t('rightPane.agentEvalNextContinue')
                : t('rightPane.agentEvalNextPolish')

    return {
        status: check.status === 'warning' ? 'warn' : 'pass',
        summary:
            check.status === 'warning'
                ? t('rightPane.agentEvalWarnSummary')
                : t('rightPane.agentEvalPassSummary'),
        detail: check.detail ?? check.summary,
        recommendedNextAction: nextAction,
    }
}

export function buildFailureEvaluation(args: {
    error: string
    needsUser?: boolean
    t: TFunction
}): CopilotEvaluationResult {
    const { error, needsUser = false, t } = args
    return {
        status: needsUser ? 'needs_user' : 'fail',
        summary: needsUser
            ? t('rightPane.agentEvalNeedsUserSummary')
            : t('rightPane.agentEvalFailSummary'),
        detail: error,
        recommendedNextAction: needsUser
            ? t('rightPane.agentEvalNextClarify')
            : t('rightPane.agentEvalNextRecover'),
    }
}

export function buildCheckResult(args: {
    appliedCommands: number
    warnings: string[]
    checkpointId?: string | null
    t: TFunction
}): CopilotCheckResult {
    const { appliedCommands, warnings, checkpointId, t } = args
    if (warnings.length > 0) {
        return {
            status: 'warning',
            summary: t('rightPane.agentCheckWarningSummary', { count: warnings.length }),
            detail: checkpointId
                ? t('rightPane.agentCheckWarningDetailWithCheckpoint', { checkpointId })
                : t('rightPane.agentCheckWarningDetail'),
        }
    }
    return {
        status: 'passed',
        summary: t('rightPane.agentCheckPassedSummary', { count: appliedCommands }),
        detail: checkpointId
            ? t('rightPane.agentCheckPassedDetailWithCheckpoint', { checkpointId })
            : t('rightPane.agentCheckPassedDetail'),
    }
}

function compactMessageText(text: string, max = 88): string {
    const normalized = String(text ?? '').replace(/\s+/g, ' ').trim()
    if (!normalized) return ''
    return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized
}

function uniqueStrings(values: Array<string | null | undefined>, limit: number): string[] {
    const result: string[] = []
    for (const value of values) {
        const normalized = String(value ?? '').trim()
        if (!normalized || result.includes(normalized)) continue
        result.push(normalized)
        if (result.length >= limit) break
    }
    return result
}

export function buildThreadContextSnapshot(args: {
    thread: CopilotThreadState
    t: TFunction
}): CopilotThreadContextSnapshot {
    const { thread, t } = args
    const meaningfulMessages = thread.messages.filter((message) => {
        const text = String(message.text ?? '').trim()
        return text.length > 0 && text !== t('centerPane.aiChatThinking')
    })
    const recentMessages = meaningfulMessages.slice(-6)
    const compactedMessages = meaningfulMessages.slice(0, -6)
    const usageRatioRaw =
        thread.lastTokenUsage?.threadBudgetTokens && thread.lastTokenUsage.threadBudgetTokens > 0
            ? thread.lastTokenUsage.threadTotalTokens / thread.lastTokenUsage.threadBudgetTokens
            : null
    const usageRatio =
        usageRatioRaw != null && Number.isFinite(usageRatioRaw)
            ? Math.max(0, Math.min(1, usageRatioRaw))
            : null

    const status: CopilotContextStatus =
        usageRatio != null
            ? usageRatio >= 0.8
                ? 'tight'
                : usageRatio >= 0.55
                    ? 'watch'
                    : 'fresh'
            : meaningfulMessages.length >= 18
                ? 'tight'
                : meaningfulMessages.length >= 10
                    ? 'watch'
                    : 'fresh'

    const summaryParts = uniqueStrings(
        [
            thread.contextSummary ? compactMessageText(thread.contextSummary, 120) : null,
            thread.agentGoal?.outcome ? compactMessageText(thread.agentGoal.outcome, 96) : null,
            ...compactedMessages.slice(-3).map((message) =>
                `${message.role === 'user' ? t('rightPane.contextSummaryUser') : t('rightPane.contextSummaryAssistant')}: ${compactMessageText(message.text, 72)}`,
            ),
            thread.previewEnvelope?.summary ? compactMessageText(thread.previewEnvelope.summary, 96) : null,
            thread.lastEvaluation?.summary ? compactMessageText(thread.lastEvaluation.summary, 96) : null,
            thread.latestHandoff?.summary ? compactMessageText(thread.latestHandoff.summary, 96) : null,
            thread.latestArtifact?.summary ? compactMessageText(thread.latestArtifact.summary, 96) : null,
            thread.lastRuntimeStatus?.detail ? compactMessageText(thread.lastRuntimeStatus.detail, 96) : null,
            ...thread.recentHandoffs.slice(0, 2).map((handoff) => compactMessageText(handoff.summary, 96)),
            ...thread.recentArtifacts.slice(0, 2).map((artifact) => compactMessageText(artifact.summary, 96)),
            ...thread.workingMemoryNotes.slice(0, 2).map((note) => compactMessageText(note.detail, 96)),
            ...thread.bookMemoryNotes.slice(0, 2).map((note) => compactMessageText(note.detail, 96)),
        ],
        5,
    )
    const rollingSummary = summaryParts.length > 0 ? summaryParts.join(' / ') : null
    const sessionMemory = uniqueStrings(
        [
            thread.sessionMemory.preferredTone ? `tone=${thread.sessionMemory.preferredTone}` : null,
            thread.sessionMemory.lastApprovedIntent ? `last_approved=${thread.sessionMemory.lastApprovedIntent}` : null,
            ...thread.sessionMemory.pendingFollowUps.map((item) => `follow_up=${compactMessageText(item, 64)}`),
            ...thread.sessionMemory.unresolvedChecks.map((item) => `check=${compactMessageText(item, 64)}`),
        ],
        4,
    )
    const bookMemory = uniqueStrings(
        [
            ...thread.bookMemoryNotes.map((note) => compactMessageText(note.detail, 80)),
            ...thread.memoryNotes
                .filter((note) => note.id === 'title' || note.id === 'chapter')
                .map((note) => `${note.label}: ${compactMessageText(note.detail, 64)}`),
        ],
        4,
    )
    const recentArtifacts = uniqueStrings(
        [
            ...thread.recentArtifacts.slice(0, 3).map((artifact) => `${artifact.title}: ${compactMessageText(artifact.summary, 64)}`),
            thread.latestArtifact ? `${thread.latestArtifact.title}: ${compactMessageText(thread.latestArtifact.summary, 64)}` : null,
        ],
        3,
    )

    const pins = uniqueStrings(
        [
            ...(thread.contextPins ?? []),
            thread.sessionMemory.preferredTone
                ? t('rightPane.contextPinTone', { tone: thread.sessionMemory.preferredTone })
                : null,
            thread.sessionMemory.lastApprovedIntent
                ? t('rightPane.contextPinApproved', { item: thread.sessionMemory.lastApprovedIntent })
                : null,
            ...thread.sessionMemory.pendingFollowUps.map((item) => t('rightPane.contextPinFollowUp', { item })),
            ...thread.sessionMemory.unresolvedChecks.map((item) => t('rightPane.contextPinCheck', { item })),
            ...thread.memoryNotes.map((note) => `${note.label}: ${compactMessageText(note.detail, 48)}`),
            ...thread.workingMemoryNotes.map((note) => compactMessageText(note.detail, 48)),
            ...thread.bookMemoryNotes.map((note) => compactMessageText(note.detail, 48)),
            ...thread.recentHandoffs.slice(0, 2).map((handoff) => `${handoff.leadSummary} -> ${handoff.specialist}`),
            ...thread.recentArtifacts.slice(0, 2).map((artifact) => `${artifact.title}: ${compactMessageText(artifact.summary, 48)}`),
            thread.latestHandoff
                ? `${thread.latestHandoff.leadSummary} -> ${thread.latestHandoff.specialist}: ${compactMessageText(thread.latestHandoff.reason, 48)}`
                : null,
            thread.latestArtifact
                ? `${thread.latestArtifact.title}: ${compactMessageText(thread.latestArtifact.summary, 48)}`
                : null,
            thread.lastRuntimeStatus
                ? `${thread.lastRuntimeStatus.providerLabel}: ${compactMessageText(thread.lastRuntimeStatus.detail, 48)}`
                : null,
            thread.lastGuardrailStatus
                ? `plan=${thread.lastGuardrailStatus.plan}: ${compactMessageText(thread.lastGuardrailStatus.detail, 48)}`
                : null,
        ],
        4,
    )

    return {
        goal: thread.agentGoal?.summary ? compactMessageText(thread.agentGoal.summary, 64) : null,
        summary: rollingSummary,
        rollingSummary,
        pins,
        sessionMemory,
        bookMemory,
        recentArtifacts,
        status,
        usageRatio,
        recentMessageCount: recentMessages.length,
        compactedMessageCount: compactedMessages.length,
    }
}

export function refreshThreadContextState(args: {
    thread: CopilotThreadState
    t: TFunction
}): Pick<CopilotThreadState, 'contextSummary' | 'contextPins'> {
    const snapshot = buildThreadContextSnapshot(args)
    return {
        contextSummary: snapshot.summary,
        contextPins: snapshot.pins,
    }
}
