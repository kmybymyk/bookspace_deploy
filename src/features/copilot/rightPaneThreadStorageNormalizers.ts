import type {
    CopilotActivityEntry,
    CopilotAgentGoal,
    CopilotAgentRun,
    CopilotAgentStep,
    CopilotAgentTask,
    CopilotChatMessage,
    CopilotCheckResult,
    CopilotEvaluationResult,
    CopilotGeneratedDraft,
    CopilotGuardrailStatus,
    CopilotMemoryNote,
    CopilotPlanDraft,
    CopilotRuntimeStatus,
    CopilotSessionMemory,
    CopilotSpecialistArtifact,
    CopilotSpecialistArtifactItem,
    CopilotSpecialistHandoff,
    CopilotThreadState,
} from './rightPaneTypes'
import type { CopilotIntent } from '../../../shared/copilotIpc'

type NormalizeDeps = {
    defaultTitle: string
    newId: (prefix: string) => string
    nowIso: () => string
}

type UnknownRecord = Record<string, unknown>

const SPECIALISTS = new Set([
    'researcher',
    'story_architect',
    'drafter',
    'editor_operator',
    'continuity_reviewer',
    'publishing_checker',
])

const ARTIFACT_KINDS = new Set([
    'publishing_checklist',
    'research_note',
    'structure_plan',
    'draft_page',
    'continuity_report',
])

function asRecord(value: unknown): UnknownRecord | null {
    return value && typeof value === 'object' ? (value as UnknownRecord) : null
}

function asString(value: unknown, fallback = ''): string {
    return typeof value === 'string' ? value : value == null ? fallback : String(value)
}

function asTrimmedString(value: unknown, fallback = ''): string {
    const normalized = asString(value, fallback).trim()
    return normalized || fallback
}

function asNullableString(value: unknown): string | null {
    const normalized = asTrimmedString(value)
    return normalized || null
}

function asFiniteNumber(value: unknown, fallback: number): number {
    const normalized = Number(value)
    return Number.isFinite(normalized) ? normalized : fallback
}

function normalizeStringArray(value: unknown, limit: number, sliceFromEnd = false): string[] {
    if (!Array.isArray(value)) return []
    const normalized = value.map((item) => asString(item).trim()).filter(Boolean)
    return sliceFromEnd ? normalized.slice(-limit) : normalized.slice(0, limit)
}

function normalizeEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
    return typeof value === 'string' && allowed.includes(value as T) ? (value as T) : fallback
}

function normalizeMessages(value: unknown, deps: NormalizeDeps): CopilotChatMessage[] {
    if (!Array.isArray(value)) return []
    return value
        .map((item) => asRecord(item))
        .filter(Boolean)
        .map((message) => ({
            id: asTrimmedString(message?.id, deps.newId('message')),
            role: message?.role === 'user' ? 'user' : 'assistant',
            text: asString(message?.text),
        }))
}

function normalizePlanDraft(value: unknown): CopilotPlanDraft | null {
    const planDraft = asRecord(value)
    if (!planDraft) return null
    return {
        prompt: asString(planDraft.prompt),
        normalizedPrompt: asString(planDraft.normalizedPrompt),
        resolvedIntent: (planDraft.resolvedIntent ?? 'rewrite_selection') as CopilotIntent,
        intentConfidence: Number.isFinite(Number(planDraft.intentConfidence))
            ? Number(planDraft.intentConfidence)
            : undefined,
        explicitTargetChapterId: asTrimmedString(planDraft.explicitTargetChapterId) || undefined,
        slots: asRecord(planDraft.slots) ?? undefined,
    }
}

function normalizeTokenUsage(value: unknown) {
    const record = asRecord(value)
    if (!record) return null
    return {
        inputTokens: asFiniteNumber(record.inputTokens, 0),
        outputTokens: asFiniteNumber(record.outputTokens, 0),
        totalTokens: asFiniteNumber(record.totalTokens, 0),
        threadTotalTokens: asFiniteNumber(record.threadTotalTokens, 0),
        userTotalTokens: asFiniteNumber(record.userTotalTokens, 0),
        threadBudgetTokens: asFiniteNumber(record.threadBudgetTokens, 0),
        userBudgetTokens: asFiniteNumber(record.userBudgetTokens, 0),
        threadBudgetExceeded: Boolean(record.threadBudgetExceeded),
        userBudgetExceeded: Boolean(record.userBudgetExceeded),
    }
}

function normalizeGeneratedDraft(value: unknown, deps: NormalizeDeps): CopilotGeneratedDraft | null {
    const record = asRecord(value)
    if (!record) return null
    return {
        text: asString(record.text),
        sourcePrompt: asString(record.sourcePrompt),
        createdAt: asString(record.createdAt, deps.nowIso()),
        targetChapterId: asNullableString(record.targetChapterId),
    }
}

function normalizeProposal(value: unknown) {
    const record = asRecord(value)
    if (!record) return null
    return {
        kind:
            record.kind === 'confirm_structured_create'
                ? ('confirm_structured_create' as const)
                : ('create_missing_page_then_retry' as const),
        intent: asString(record.intent, 'append_text') as CopilotIntent,
        missingLabel: asString(record.missingLabel),
        targetKind:
            record.targetKind === 'chapter' ||
            record.targetKind === 'part' ||
            record.targetKind === 'prologue' ||
            record.targetKind === 'epilogue' ||
            record.targetKind === 'title'
                ? record.targetKind
                : null,
        suggestedTitle: asNullableString(record.suggestedTitle),
        followUpPrompt: asString(record.followUpPrompt),
        parentLabel: asNullableString(record.parentLabel),
        requestedOrdinal:
            record.requestedOrdinal == null
                ? null
                : (() => {
                      const parsed = asFiniteNumber(record.requestedOrdinal, 0)
                      return parsed > 0 ? parsed : null
                  })(),
        summary: asNullableString(record.summary),
        detail: asNullableString(record.detail),
    }
}

function normalizeSpecialist(value: unknown): CopilotSpecialistHandoff['specialist'] {
    return typeof value === 'string' && SPECIALISTS.has(value)
        ? (value as CopilotSpecialistHandoff['specialist'])
        : 'publishing_checker'
}

function normalizeArtifactKind(value: unknown): CopilotSpecialistArtifact['kind'] {
    return typeof value === 'string' && ARTIFACT_KINDS.has(value)
        ? (value as CopilotSpecialistArtifact['kind'])
        : 'publishing_checklist'
}

function normalizeArtifactItems(value: unknown): CopilotSpecialistArtifactItem[] {
    if (!Array.isArray(value)) return []
    return value
        .map((item) => asRecord(item))
        .filter(Boolean)
        .map((item, index) => ({
            id: asTrimmedString(item?.id, `artifact-item-${index + 1}`),
            label: asString(item?.label),
            detail: asString(item?.detail),
            severity:
                item?.severity === 'warning' || item?.severity === 'blocking'
                    ? item.severity
                    : 'info',
        }))
        .slice(0, 6)
}

function normalizeHandoff(value: unknown, deps: NormalizeDeps, fallbackId: string): CopilotSpecialistHandoff | null {
    const record = asRecord(value)
    if (!record) return null
    return {
        id: asTrimmedString(record.id, fallbackId),
        leadSummary: asString(record.leadSummary),
        specialist: normalizeSpecialist(record.specialist),
        reason: asString(record.reason),
        status: normalizeEnum(record.status, ['planned', 'completed', 'blocked'], 'completed'),
        goal: asString(record.goal),
        scope: asString(record.scope),
        createdAt: asString(record.createdAt, deps.nowIso()),
        summary: asString(record.summary),
        constraints: normalizeStringArray(record.constraints, 6),
        artifactKinds: normalizeStringArray(record.artifactKinds, 4),
        recommendedNextAction: asNullableString(record.recommendedNextAction),
    }
}

function normalizeArtifact(value: unknown, deps: NormalizeDeps, fallbackId: string): CopilotSpecialistArtifact | null {
    const record = asRecord(value)
    if (!record) return null
    return {
        id: asTrimmedString(record.id, fallbackId),
        specialist: normalizeSpecialist(record.specialist),
        kind: normalizeArtifactKind(record.kind),
        title: asString(record.title, 'Specialist Artifact'),
        summary: asString(record.summary),
        createdAt: asString(record.createdAt, deps.nowIso()),
        items: normalizeArtifactItems(record.items),
        recommendedNextAction: asNullableString(record.recommendedNextAction),
    }
}

function normalizeMemoryNotes(value: unknown, prefix: string): CopilotMemoryNote[] {
    if (!Array.isArray(value)) return []
    return value
        .map((item) => asRecord(item))
        .filter(Boolean)
        .map((note, index) => ({
            id: asTrimmedString(note?.id, `${prefix}-${index + 1}`),
            label: asString(note?.label),
            detail: asString(note?.detail),
        }))
        .filter((note) => note.label || note.detail)
        .slice(0, 6)
}

function normalizeAgentGoal(value: unknown): CopilotAgentGoal | null {
    const record = asRecord(value)
    if (!record) return null
    return {
        summary: asString(record.summary),
        outcome: asString(record.outcome),
    }
}

function normalizeAgentSteps(value: unknown, deps: NormalizeDeps): CopilotAgentStep[] {
    if (!Array.isArray(value)) return []
    return value
        .map((item) => asRecord(item))
        .filter(Boolean)
        .map((step) => ({
            id: asTrimmedString(step?.id, deps.newId('agent-step')),
            title: asString(step?.title),
            detail: asString(step?.detail),
            status: normalizeEnum(step?.status, ['pending', 'in_progress', 'ready', 'completed', 'blocked'], 'pending'),
            requiresApproval: Boolean(step?.requiresApproval),
        }))
}

function normalizeAgentTasks(value: unknown, deps: NormalizeDeps): CopilotAgentTask[] {
    if (!Array.isArray(value)) return []
    return value
        .map((item) => asRecord(item))
        .filter(Boolean)
        .map((task) => ({
            id: asTrimmedString(task?.id, deps.newId('agent-task')),
            title: asString(task?.title),
            detail: asString(task?.detail),
            type: normalizeEnum(task?.type, ['read', 'write', 'validate', 'ask_user'], 'read'),
            status: normalizeEnum(task?.status, ['pending', 'in_progress', 'ready', 'completed', 'blocked'], 'pending'),
            toolIds: normalizeStringArray(task?.toolIds, 24),
            dependsOn: normalizeStringArray(task?.dependsOn, 24),
            requiresApproval: Boolean(task?.requiresApproval),
            policy: normalizeEnum(task?.policy, ['auto', 'review_required', 'explicit_high_risk', 'ask_user'], 'auto'),
        }))
}

function normalizeRun(value: unknown, deps: NormalizeDeps, fallbackId: string): CopilotAgentRun | null {
    const record = asRecord(value)
    if (!record) return null
    return {
        id: asTrimmedString(record.id, fallbackId),
        goalSummary: asString(record.goalSummary),
        status: normalizeEnum(record.status, ['in_progress', 'completed', 'blocked'], 'in_progress'),
        phase: normalizeEnum(record.phase, ['planning', 'review', 'apply', 'verify', 'completed', 'blocked'], 'planning'),
        startedAt: asString(record.startedAt, deps.nowIso()),
        updatedAt: asString(record.updatedAt, deps.nowIso()),
        completedAt: asNullableString(record.completedAt),
        taskIds: normalizeStringArray(record.taskIds, 8),
        lastEvaluationSummary: asNullableString(record.lastEvaluationSummary),
        checkpointId: asNullableString(record.checkpointId),
    }
}

function normalizeSessionMemory(value: unknown): CopilotSessionMemory {
    const record = asRecord(value)
    if (!record) {
        return {
            preferredTone: null,
            lastApprovedIntent: null,
            pendingFollowUps: [],
            unresolvedChecks: [],
        }
    }
    return {
        preferredTone: asNullableString(record.preferredTone),
        lastApprovedIntent: asNullableString(record.lastApprovedIntent),
        pendingFollowUps: normalizeStringArray(record.pendingFollowUps, 5, true),
        unresolvedChecks: normalizeStringArray(record.unresolvedChecks, 5, true),
    }
}

function normalizeLastCheck(value: unknown): CopilotCheckResult | null {
    const record = asRecord(value)
    if (!record) return null
    return {
        status: normalizeEnum(record.status, ['pending', 'passed', 'warning'], 'pending'),
        summary: asString(record.summary),
        detail: asNullableString(record.detail),
    }
}

function normalizeLastEvaluation(value: unknown): CopilotEvaluationResult | null {
    const record = asRecord(value)
    if (!record) return null
    return {
        status: normalizeEnum(record.status, ['pass', 'warn', 'fail', 'needs_user'], 'pass'),
        summary: asString(record.summary),
        detail: asNullableString(record.detail),
        recommendedNextAction: asNullableString(record.recommendedNextAction),
    }
}

function normalizeRuntimeStatus(value: unknown, deps: NormalizeDeps): CopilotRuntimeStatus | null {
    const record = asRecord(value)
    if (!record) return null
    return {
        mode: normalizeEnum(record.mode, ['appserver', 'direct', 'http', 'ipc'], 'appserver'),
        source: normalizeEnum(record.source, ['chat', 'preview', 'apply'], 'chat'),
        providerLabel: asString(record.providerLabel),
        modelLabel: asNullableString(record.modelLabel),
        status: normalizeEnum(record.status, ['ready', 'warning', 'error'], 'ready'),
        detail: asString(record.detail),
        recommendedAction: asNullableString(record.recommendedAction),
        lastUsedAt: asString(record.lastUsedAt, deps.nowIso()),
    }
}

function normalizeGuardrailStatus(value: unknown, deps: NormalizeDeps): CopilotGuardrailStatus | null {
    const record = asRecord(value)
    if (!record) return null
    return {
        featureId: asString(record.featureId, 'ai.chat.ask'),
        allowed: Boolean(record.allowed),
        plan: normalizeEnum(record.plan, ['FREE', 'PRO_LITE', 'PRO'], 'FREE'),
        aiCreditsRemaining: Number.isFinite(Number(record.aiCreditsRemaining))
            ? Number(record.aiCreditsRemaining)
            : null,
        reason: normalizeEnum(
            record.reason,
            ['plan-allows-feature', 'plan-does-not-allow-feature', 'feature-disabled-by-flag', 'insufficient-ai-credits'],
            'plan-allows-feature',
        ),
        detail: asString(record.detail),
        recommendedAction: asNullableString(record.recommendedAction),
        checkedAt: asString(record.checkedAt, deps.nowIso()),
    }
}

function normalizeActivity(value: unknown, deps: NormalizeDeps): CopilotActivityEntry[] {
    if (!Array.isArray(value)) return []
    return value
        .map((item) => asRecord(item))
        .filter(Boolean)
        .map((entry) => ({
            id: asTrimmedString(entry?.id, deps.newId('activity')),
            createdAt: asString(entry?.createdAt, deps.nowIso()),
            label: asString(entry?.label),
            detail: asNullableString(entry?.detail),
            tone: normalizeEnum(entry?.tone, ['neutral', 'info', 'success', 'warning', 'error'], 'neutral'),
        }))
        .slice(-20)
}

export function normalizePersistedThread(item: unknown, deps: NormalizeDeps): CopilotThreadState | null {
    const thread = asRecord(item)
    if (!thread) return null

    const createdAt = asString(thread.createdAt, deps.nowIso())
    const updatedAt = asString(thread.updatedAt, createdAt)

    return {
        id: asTrimmedString(thread.id, deps.newId('thread')),
        appServerThreadKey: asTrimmedString(thread.appServerThreadKey, deps.newId('appserver-thread')),
        appServerThreadId: asNullableString(thread.appServerThreadId),
        appServerTurnId: asNullableString(thread.appServerTurnId),
        title: asTrimmedString(thread.title, deps.defaultTitle),
        createdAt,
        updatedAt,
        draft: asString(thread.draft),
        turnState: normalizeEnum(
            thread.turnState,
            ['idle', 'planning', 'streaming', 'completed', 'failed', 'interrupted'],
            'idle',
        ),
        turnError: asNullableString(thread.turnError),
        messages: normalizeMessages(thread.messages, deps),
        planDraft: normalizePlanDraft(thread.planDraft),
        previewEnvelope: (thread.previewEnvelope as CopilotThreadState['previewEnvelope']) ?? null,
        previewCollapsed: Boolean(thread.previewCollapsed),
        collapsedCommandIndexes: Array.isArray(thread.collapsedCommandIndexes)
            ? thread.collapsedCommandIndexes.filter((index) => Number.isInteger(index)) as number[]
            : [],
        applySafetyConfirmed: Boolean(thread.applySafetyConfirmed),
        applyDangerConfirmed: Boolean(thread.applyDangerConfirmed),
        streamSoftLimitNotified: Boolean(thread.streamSoftLimitNotified),
        lastIntentConfidence: Number.isFinite(Number(thread.lastIntentConfidence))
            ? Number(thread.lastIntentConfidence)
            : null,
        lastTokenUsage: normalizeTokenUsage(thread.lastTokenUsage),
        lastRecoveryHint: asNullableString(thread.lastRecoveryHint),
        lastCheckpointId: asNullableString(thread.lastCheckpointId),
        lastGeneratedDraft: normalizeGeneratedDraft(thread.lastGeneratedDraft, deps),
        pendingProposal: normalizeProposal(thread.pendingProposal),
        latestHandoff: normalizeHandoff(thread.latestHandoff, deps, deps.newId('handoff')),
        latestArtifact: normalizeArtifact(thread.latestArtifact, deps, deps.newId('artifact')),
        recentHandoffs: Array.isArray(thread.recentHandoffs)
            ? thread.recentHandoffs
                  .map((handoff, index) => normalizeHandoff(handoff, deps, `handoff-${index + 1}`))
                  .filter((handoff): handoff is CopilotSpecialistHandoff => Boolean(handoff))
                  .slice(0, 8)
            : [],
        recentArtifacts: Array.isArray(thread.recentArtifacts)
            ? thread.recentArtifacts
                  .map((artifact, index) => normalizeArtifact(artifact, deps, `artifact-${index + 1}`))
                  .filter((artifact): artifact is CopilotSpecialistArtifact => Boolean(artifact))
                  .slice(0, 8)
            : [],
        workingMemoryNotes: normalizeMemoryNotes(thread.workingMemoryNotes, 'working-memory'),
        bookMemoryNotes: normalizeMemoryNotes(thread.bookMemoryNotes, 'book-memory'),
        contextSummary: asNullableString(thread.contextSummary),
        contextPins: normalizeStringArray(thread.contextPins, 6, true),
        agentGoal: normalizeAgentGoal(thread.agentGoal),
        agentSteps: normalizeAgentSteps(thread.agentSteps, deps),
        agentTasks: normalizeAgentTasks(thread.agentTasks, deps),
        currentRun: normalizeRun(thread.currentRun, deps, deps.newId('run')),
        recentRuns: Array.isArray(thread.recentRuns)
            ? thread.recentRuns
                  .map((run, index) => normalizeRun(run, deps, `run-${index + 1}`))
                  .filter((run): run is CopilotAgentRun => Boolean(run))
                  .slice(0, 8)
            : [],
        memoryNotes: Array.isArray(thread.memoryNotes)
            ? thread.memoryNotes
                  .map((note, index) => {
                      const normalized = normalizeMemoryNotes([note], `memory-${index + 1}`)
                      return normalized[0] ?? null
                  })
                  .filter((note): note is CopilotMemoryNote => Boolean(note))
            : [],
        sessionMemory: normalizeSessionMemory(thread.sessionMemory),
        lastCheck: normalizeLastCheck(thread.lastCheck),
        lastEvaluation: normalizeLastEvaluation(thread.lastEvaluation),
        lastRuntimeStatus: normalizeRuntimeStatus(thread.lastRuntimeStatus, deps),
        lastGuardrailStatus: normalizeGuardrailStatus(thread.lastGuardrailStatus, deps),
        activity: normalizeActivity(thread.activity, deps),
    }
}
