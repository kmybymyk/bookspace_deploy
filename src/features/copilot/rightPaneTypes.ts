import type { AiCommandEnvelope } from '../../../shared/aiCommandSchema'
import type { CopilotIntent } from '../../../shared/copilotIpc'
import type { CopilotAppServerTokenUsage } from '../../../shared/copilotIpc'
import type { ParsedCreateChapterDraft } from '../../../shared/createChapterPromptParser'
import type {
    ParsedInsertIllustrationDraft,
    ParsedInsertTableDraft,
} from '../../../shared/copilotStructuredPromptParser'

export type CopilotRiskLevel = 'low' | 'medium' | 'high'
export type CopilotMode = 'plan' | 'apply'
export type CopilotTurnState = 'idle' | 'planning' | 'streaming' | 'completed' | 'failed' | 'interrupted'

export type CopilotActivityTone = 'neutral' | 'info' | 'success' | 'warning' | 'error'
export type CopilotAgentStepStatus = 'pending' | 'in_progress' | 'ready' | 'completed' | 'blocked'
export type CopilotAgentTaskType = 'read' | 'write' | 'validate' | 'ask_user'
export type CopilotAgentTaskStatus = 'pending' | 'in_progress' | 'ready' | 'completed' | 'blocked'
export type CopilotApprovalPolicy = 'auto' | 'review_required' | 'explicit_high_risk' | 'ask_user'

export interface CopilotAgentGoal {
    summary: string
    outcome: string
}

export interface CopilotAgentStep {
    id: string
    title: string
    detail: string
    status: CopilotAgentStepStatus
    requiresApproval?: boolean
}

export interface CopilotMemoryNote {
    id: string
    label: string
    detail: string
}

export interface CopilotAgentTask {
    id: string
    title: string
    detail: string
    type: CopilotAgentTaskType
    status: CopilotAgentTaskStatus
    toolIds?: string[]
    dependsOn?: string[]
    requiresApproval?: boolean
    policy: CopilotApprovalPolicy
}

export interface CopilotAgentRun {
    id: string
    goalSummary: string
    status: 'in_progress' | 'completed' | 'blocked'
    phase: 'planning' | 'review' | 'apply' | 'verify' | 'completed' | 'blocked'
    startedAt: string
    updatedAt: string
    completedAt?: string | null
    taskIds: string[]
    lastEvaluationSummary?: string | null
    checkpointId?: string | null
}

export interface CopilotSessionMemory {
    preferredTone: string | null
    lastApprovedIntent: string | null
    pendingFollowUps: string[]
    unresolvedChecks: string[]
}

export interface CopilotCheckResult {
    status: 'pending' | 'passed' | 'warning'
    summary: string
    detail?: string | null
}

export interface CopilotGeneratedDraft {
    text: string
    sourcePrompt: string
    createdAt: string
    targetChapterId?: string | null
}

export interface CopilotActionProposal {
    kind: 'create_missing_page_then_retry' | 'confirm_structured_create'
    intent: CopilotIntent
    missingLabel: string
    targetKind?: 'chapter' | 'part' | 'prologue' | 'epilogue' | 'title' | null
    suggestedTitle?: string | null
    followUpPrompt: string
    parentLabel?: string | null
    requestedOrdinal?: number | null
    summary?: string | null
    detail?: string | null
}

export type CopilotSpecialist =
    | 'researcher'
    | 'story_architect'
    | 'drafter'
    | 'editor_operator'
    | 'continuity_reviewer'
    | 'publishing_checker'

export interface CopilotSpecialistHandoff {
    id: string
    leadSummary: string
    specialist: CopilotSpecialist
    reason: string
    status: 'planned' | 'completed' | 'blocked'
    goal: string
    scope: string
    createdAt: string
    summary: string
    constraints: string[]
    artifactKinds: string[]
    recommendedNextAction?: string | null
}

export interface CopilotSpecialistArtifactItem {
    id: string
    label: string
    detail: string
    severity: 'info' | 'warning' | 'blocking'
}

export interface CopilotSpecialistArtifact {
    id: string
    specialist: CopilotSpecialist
    kind: 'publishing_checklist' | 'research_note' | 'structure_plan' | 'draft_page' | 'continuity_report'
    title: string
    summary: string
    createdAt: string
    items: CopilotSpecialistArtifactItem[]
    recommendedNextAction?: string | null
}

export interface CopilotEvaluationResult {
    status: 'pass' | 'warn' | 'fail' | 'needs_user'
    summary: string
    detail?: string | null
    recommendedNextAction?: string | null
}

export interface CopilotRuntimeStatus {
    mode: 'appserver' | 'direct' | 'http' | 'ipc'
    source: 'chat' | 'preview' | 'apply'
    providerLabel: string
    modelLabel: string | null
    status: 'ready' | 'warning' | 'error'
    detail: string
    recommendedAction?: string | null
    lastUsedAt: string
}

export interface CopilotGuardrailStatus {
    featureId: string
    allowed: boolean
    plan: 'FREE' | 'PRO_LITE' | 'PRO'
    aiCreditsRemaining: number | null
    reason:
        | 'plan-allows-feature'
        | 'plan-does-not-allow-feature'
        | 'feature-disabled-by-flag'
        | 'insufficient-ai-credits'
    detail: string
    recommendedAction?: string | null
    checkedAt: string
}

export interface CopilotActivityEntry {
    id: string
    createdAt: string
    label: string
    detail?: string | null
    tone: CopilotActivityTone
}

export interface CopilotChatMessage {
    id: string
    role: 'user' | 'assistant'
    text: string
}

export interface CopilotPlanDraft {
    prompt: string
    normalizedPrompt?: string
    resolvedIntent: CopilotIntent
    intentConfidence?: number
    explicitTargetChapterId?: string
    slots?: {
        createChapter?: ParsedCreateChapterDraft
        insertTable?: ParsedInsertTableDraft
        insertIllustration?: ParsedInsertIllustrationDraft
    }
}

export interface CopilotThreadState {
    id: string
    appServerThreadKey: string
    appServerThreadId: string | null
    appServerTurnId: string | null
    title: string
    createdAt: string
    updatedAt: string
    draft: string
    turnState: CopilotTurnState
    turnError: string | null
    messages: CopilotChatMessage[]
    planDraft: CopilotPlanDraft | null
    previewEnvelope: AiCommandEnvelope | null
    previewCollapsed: boolean
    collapsedCommandIndexes: number[]
    applySafetyConfirmed: boolean
    applyDangerConfirmed: boolean
    streamSoftLimitNotified: boolean
    lastIntentConfidence: number | null
    lastTokenUsage: CopilotAppServerTokenUsage | null
    lastRecoveryHint: string | null
    lastCheckpointId: string | null
    lastGeneratedDraft: CopilotGeneratedDraft | null
    pendingProposal: CopilotActionProposal | null
    latestHandoff: CopilotSpecialistHandoff | null
    latestArtifact: CopilotSpecialistArtifact | null
    recentHandoffs: CopilotSpecialistHandoff[]
    recentArtifacts: CopilotSpecialistArtifact[]
    workingMemoryNotes: CopilotMemoryNote[]
    bookMemoryNotes: CopilotMemoryNote[]
    contextSummary: string | null
    contextPins: string[]
    agentGoal: CopilotAgentGoal | null
    agentSteps: CopilotAgentStep[]
    agentTasks: CopilotAgentTask[]
    currentRun: CopilotAgentRun | null
    recentRuns: CopilotAgentRun[]
    memoryNotes: CopilotMemoryNote[]
    sessionMemory: CopilotSessionMemory
    lastCheck: CopilotCheckResult | null
    lastEvaluation: CopilotEvaluationResult | null
    lastRuntimeStatus: CopilotRuntimeStatus | null
    lastGuardrailStatus: CopilotGuardrailStatus | null
    activity: CopilotActivityEntry[]
}
