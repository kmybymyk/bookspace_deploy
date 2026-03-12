import type { BookMetadata } from '../../types/project'
import type { CopilotThreadState } from './rightPaneTypes'
import { normalizePersistedThread } from './rightPaneThreadStorageNormalizers'

const COPILOT_THREADS_KEY_PREFIX = 'bookspace_copilot_threads'
const COPILOT_ACTIVE_THREAD_KEY_PREFIX = 'bookspace_copilot_active_thread'

export const COPILOT_MAX_THREADS = 20

export function nowIso(): string {
    return new Date().toISOString()
}

export function newId(prefix: string): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return `${prefix}-${crypto.randomUUID()}`
    }
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function buildThreadTitle(raw: string, fallback: string): string {
    const trimmed = raw.trim()
    if (!trimmed) return fallback
    return trimmed.length > 36 ? `${trimmed.slice(0, 36)}...` : trimmed
}

export function createEmptyThread(initialTitle: string): CopilotThreadState {
    const timestamp = nowIso()
    return {
        id: newId('thread'),
        appServerThreadKey: newId('appserver-thread'),
        appServerThreadId: null,
        appServerTurnId: null,
        title: initialTitle,
        createdAt: timestamp,
        updatedAt: timestamp,
        draft: '',
        turnState: 'idle',
        turnError: null,
        messages: [],
        planDraft: null,
        previewEnvelope: null,
        previewCollapsed: false,
        collapsedCommandIndexes: [],
        applySafetyConfirmed: false,
        applyDangerConfirmed: false,
        streamSoftLimitNotified: false,
        lastIntentConfidence: null,
        lastTokenUsage: null,
        lastRecoveryHint: null,
        lastCheckpointId: null,
        lastGeneratedDraft: null,
        pendingProposal: null,
        latestHandoff: null,
        latestArtifact: null,
        recentHandoffs: [],
        recentArtifacts: [],
        workingMemoryNotes: [],
        bookMemoryNotes: [],
        contextSummary: null,
        contextPins: [],
        agentGoal: null,
        agentSteps: [],
        agentTasks: [],
        currentRun: null,
        recentRuns: [],
        memoryNotes: [],
        sessionMemory: {
            preferredTone: null,
            lastApprovedIntent: null,
            pendingFollowUps: [],
            unresolvedChecks: [],
        },
        lastCheck: null,
        lastEvaluation: null,
        lastRuntimeStatus: null,
        lastGuardrailStatus: null,
        activity: [],
    }
}

export function isDraftThread(thread: CopilotThreadState): boolean {
    return (
        thread.messages.length === 0 &&
        !thread.planDraft &&
        !thread.previewEnvelope &&
        !thread.pendingProposal &&
        !thread.latestHandoff &&
        !thread.latestArtifact &&
        thread.recentHandoffs.length === 0 &&
        thread.recentArtifacts.length === 0 &&
        thread.workingMemoryNotes.length === 0 &&
        thread.bookMemoryNotes.length === 0 &&
        !thread.agentGoal &&
        thread.agentTasks.length === 0 &&
        !thread.currentRun &&
        thread.recentRuns.length === 0 &&
        thread.draft.trim().length === 0
    )
}

export function hasStartedConversation(thread: CopilotThreadState): boolean {
    return (
        thread.messages.length > 0 ||
        Boolean(thread.planDraft) ||
        Boolean(thread.previewEnvelope) ||
        Boolean(thread.pendingProposal) ||
        Boolean(thread.latestHandoff) ||
        Boolean(thread.latestArtifact) ||
        thread.recentHandoffs.length > 0 ||
        thread.recentArtifacts.length > 0 ||
        thread.workingMemoryNotes.length > 0 ||
        thread.bookMemoryNotes.length > 0 ||
        Boolean(thread.agentGoal) ||
        thread.agentTasks.length > 0
        || Boolean(thread.currentRun)
        || thread.recentRuns.length > 0
    )
}

export function buildCopilotStorageScope(
    projectPath: string | null,
    projectSessionId: string,
    metadata?: BookMetadata | null,
): string {
    const normalizedPath = projectPath?.trim()
    if (normalizedPath) {
        return encodeURIComponent(`file:${normalizedPath}`)
    }

    const normalizedSessionId = String(projectSessionId ?? '').trim()
    if (normalizedSessionId) {
        return encodeURIComponent(`draft-session:${normalizedSessionId}`)
    }

    const primaryAuthorId = String(metadata?.authors?.[0]?.id ?? '').trim()
    if (primaryAuthorId) {
        return encodeURIComponent(`draft-author:${primaryAuthorId}`)
    }

    const fallbackIdentity = [
        String(metadata?.title ?? '').trim(),
        String(metadata?.subtitle ?? '').trim(),
        String(metadata?.language ?? '').trim(),
        String(metadata?.identifier ?? metadata?.isbn ?? '').trim(),
        String(metadata?.publisher ?? '').trim(),
    ]
        .filter(Boolean)
        .join('|')
    const base = fallbackIdentity ? `draft-meta:${fallbackIdentity}` : 'draft:global'
    return encodeURIComponent(base)
}

export function buildCopilotThreadsStorageKey(scope: string): string {
    return `${COPILOT_THREADS_KEY_PREFIX}:${scope}`
}

export function buildCopilotActiveThreadStorageKey(scope: string): string {
    return `${COPILOT_ACTIVE_THREAD_KEY_PREFIX}:${scope}`
}

export function migrateLegacyCopilotStorage(
    targetThreadsStorageKey: string,
    targetActiveThreadStorageKey: string,
    projectPath: string | null,
    projectSessionId: string,
    metadata?: BookMetadata | null,
) {
    try {
        const hasTargetThreads = Boolean(localStorage.getItem(targetThreadsStorageKey))
        const hasTargetActive = Boolean(localStorage.getItem(targetActiveThreadStorageKey))

        const sourceKeys: Array<{ threads: string; active: string }> = []
        sourceKeys.push({
            threads: COPILOT_THREADS_KEY_PREFIX,
            active: COPILOT_ACTIVE_THREAD_KEY_PREFIX,
        })

        const draftGlobalScope = encodeURIComponent('draft:global')
        sourceKeys.push({
            threads: buildCopilotThreadsStorageKey(draftGlobalScope),
            active: buildCopilotActiveThreadStorageKey(draftGlobalScope),
        })

        const authorScope = encodeURIComponent(`draft-author:${String(metadata?.authors?.[0]?.id ?? '').trim()}`)
        if (!projectPath && String(metadata?.authors?.[0]?.id ?? '').trim()) {
            sourceKeys.push({
                threads: buildCopilotThreadsStorageKey(authorScope),
                active: buildCopilotActiveThreadStorageKey(authorScope),
            })
        }

        const fallbackIdentity = [
            String(metadata?.title ?? '').trim(),
            String(metadata?.subtitle ?? '').trim(),
            String(metadata?.language ?? '').trim(),
            String(metadata?.identifier ?? metadata?.isbn ?? '').trim(),
            String(metadata?.publisher ?? '').trim(),
        ]
            .filter(Boolean)
            .join('|')
        if (!projectPath && fallbackIdentity) {
            const metaScope = encodeURIComponent(`draft-meta:${fallbackIdentity}`)
            sourceKeys.push({
                threads: buildCopilotThreadsStorageKey(metaScope),
                active: buildCopilotActiveThreadStorageKey(metaScope),
            })
        }

        for (const source of sourceKeys) {
            if (source.threads === targetThreadsStorageKey) continue
            const legacyThreads = localStorage.getItem(source.threads)
            const legacyActive = localStorage.getItem(source.active)
            if (!hasTargetThreads && legacyThreads) {
                localStorage.setItem(targetThreadsStorageKey, legacyThreads)
            }
            if (!hasTargetActive && legacyActive) {
                localStorage.setItem(targetActiveThreadStorageKey, legacyActive)
            }
            if (legacyThreads && source.threads !== targetThreadsStorageKey) {
                localStorage.removeItem(source.threads)
            }
            if (legacyActive && source.active !== targetActiveThreadStorageKey) {
                localStorage.removeItem(source.active)
            }
        }

        const keysToRemove: string[] = []
        for (let index = 0; index < localStorage.length; index += 1) {
            const key = localStorage.key(index)
            if (!key) continue
            if (!key.startsWith(`${COPILOT_THREADS_KEY_PREFIX}:draft-session:`)) continue
            const decoded = decodeURIComponent(key.split(':').slice(1).join(':'))
            if (!decoded.startsWith('draft-session:')) continue
            const session = decoded.replace('draft-session:', '')
            if (session !== projectSessionId) {
                keysToRemove.push(key)
            }
        }
        for (const key of keysToRemove) {
            localStorage.removeItem(key)
        }
    } catch {
        // ignore migration failures
    }
}

export function loadThreads(storageKey: string, defaultTitle: string): CopilotThreadState[] {
    try {
        const raw = localStorage.getItem(storageKey)
        if (!raw) return [createEmptyThread(defaultTitle)]
        const parsed = JSON.parse(raw)
        if (!Array.isArray(parsed) || parsed.length === 0) return [createEmptyThread(defaultTitle)]

        const normalized: CopilotThreadState[] = parsed
            .map((item) =>
                normalizePersistedThread(item, {
                    defaultTitle,
                    newId,
                    nowIso,
                }),
            )
            .filter((thread): thread is CopilotThreadState => Boolean(thread))
            .slice(0, COPILOT_MAX_THREADS)

        return normalized.length > 0 ? normalized : [createEmptyThread(defaultTitle)]
    } catch {
        return [createEmptyThread(defaultTitle)]
    }
}
