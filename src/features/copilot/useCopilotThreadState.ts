import { useEffect, useMemo, useState } from 'react'
import type { BookMetadata } from '../../types/project'
import {
    buildCopilotActiveThreadStorageKey,
    buildCopilotStorageScope,
    buildCopilotThreadsStorageKey,
    COPILOT_MAX_THREADS,
    createEmptyThread,
    hasStartedConversation,
    loadThreads,
    migrateLegacyCopilotStorage,
    nowIso,
} from './rightPaneThreadStorage'
import type { CopilotThreadState } from './rightPaneTypes'

interface UseCopilotThreadStateArgs {
    projectPath: string | null
    projectSessionId: string
    projectMetadata: BookMetadata
    untitledLabel: string
}

export function useCopilotThreadState({
    projectPath,
    projectSessionId,
    projectMetadata,
    untitledLabel,
}: UseCopilotThreadStateArgs) {
    const storageScope = useMemo(
        () => buildCopilotStorageScope(projectPath, projectSessionId, projectMetadata),
        [projectPath, projectSessionId, projectMetadata],
    )
    const threadsStorageKey = useMemo(() => buildCopilotThreadsStorageKey(storageScope), [storageScope])
    const activeThreadStorageKey = useMemo(
        () => buildCopilotActiveThreadStorageKey(storageScope),
        [storageScope],
    )

    const [copilotThreads, setCopilotThreads] = useState<CopilotThreadState[]>([
        createEmptyThread('Thread 1'),
    ])
    const [activeThreadId, setActiveThreadId] = useState<string>('')

    useEffect(() => {
        migrateLegacyCopilotStorage(
            threadsStorageKey,
            activeThreadStorageKey,
            projectPath,
            projectSessionId,
            projectMetadata,
        )
        const nextThreads = loadThreads(threadsStorageKey, 'Thread 1')
        let nextActiveThreadId = ''
        try {
            nextActiveThreadId = String(localStorage.getItem(activeThreadStorageKey) ?? '')
        } catch {
            nextActiveThreadId = ''
        }
        setCopilotThreads(nextThreads)
        setActiveThreadId(nextActiveThreadId)
    }, [threadsStorageKey, activeThreadStorageKey, projectPath, projectSessionId, projectMetadata])

    useEffect(() => {
        if (copilotThreads.length === 0) {
            const fallback = createEmptyThread('Thread 1')
            setCopilotThreads([fallback])
            setActiveThreadId(fallback.id)
            return
        }
        if (!activeThreadId || !copilotThreads.some((thread) => thread.id === activeThreadId)) {
            setActiveThreadId(copilotThreads[0].id)
        }
    }, [copilotThreads, activeThreadId])

    useEffect(() => {
        if (copilotThreads.length >= COPILOT_MAX_THREADS) return
        if (copilotThreads.some((thread) => !hasStartedConversation(thread))) return
        const next = createEmptyThread(`${untitledLabel} ${copilotThreads.length + 1}`)
        setCopilotThreads((prev) => [next, ...prev].slice(0, COPILOT_MAX_THREADS))
    }, [copilotThreads, untitledLabel])

    useEffect(() => {
        try {
            localStorage.setItem(threadsStorageKey, JSON.stringify(copilotThreads))
        } catch {
            // ignore persist failure
        }
    }, [copilotThreads, threadsStorageKey])

    useEffect(() => {
        if (!activeThreadId) return
        try {
            localStorage.setItem(activeThreadStorageKey, activeThreadId)
        } catch {
            // ignore persist failure
        }
    }, [activeThreadId, activeThreadStorageKey])

    const activeThread = useMemo(
        () => copilotThreads.find((thread) => thread.id === activeThreadId) ?? copilotThreads[0],
        [copilotThreads, activeThreadId],
    )
    const recentChats = useMemo(
        () =>
            copilotThreads
                .filter((thread) => hasStartedConversation(thread))
                .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
        [copilotThreads],
    )

    const updateThreadById = (
        threadId: string,
        updater: (thread: CopilotThreadState) => CopilotThreadState,
    ) => {
        setCopilotThreads((prev) =>
            prev.map((thread) =>
                thread.id === threadId
                    ? {
                          ...updater(thread),
                          updatedAt: nowIso(),
                      }
                    : thread,
            ),
        )
    }

    const updateActiveThread = (updater: (thread: CopilotThreadState) => CopilotThreadState) => {
        if (!activeThread) return
        updateThreadById(activeThread.id, updater)
    }

    const createThread = () => {
        const title = `${untitledLabel} ${copilotThreads.length + 1}`
        const next = createEmptyThread(title)
        setCopilotThreads((prev) => [next, ...prev].slice(0, COPILOT_MAX_THREADS))
        setActiveThreadId(next.id)
    }

    const renameThread = (threadId: string, title: string) => {
        const normalized = title.trim()
        if (!normalized) return
        updateThreadById(threadId, (thread) => ({
            ...thread,
            title: normalized,
        }))
    }

    const deleteThread = (threadId: string) => {
        setCopilotThreads((prev) => {
            const next = prev.filter((thread) => thread.id !== threadId)
            if (next.length > 0 && activeThreadId === threadId) {
                setActiveThreadId(next[0].id)
            }
            return next
        })
    }

    return {
        copilotThreads,
        activeThread,
        recentChats,
        activeThreadId,
        setActiveThreadId,
        updateThreadById,
        updateActiveThread,
        createThread,
        renameThread,
        deleteThread,
    }
}
