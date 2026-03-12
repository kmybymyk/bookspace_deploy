import { useCallback, useEffect, useRef, useState } from 'react'
import type { HistorySnapshotEntry } from '../../../types/history'
import { listHistorySnapshots } from '../../../utils/historyManager'

interface UseHistoryLoaderResult {
    historyLoading: boolean
    historySnapshots: HistorySnapshotEntry[]
    historyLoadedAt: string | null
    loadHistory: (pathOverride?: string | null) => Promise<void>
}

export function useHistoryLoader(
    projectPath: string | null,
    onError: (message: string) => void,
): UseHistoryLoaderResult {
    const [historyLoading, setHistoryLoading] = useState(false)
    const [historySnapshots, setHistorySnapshots] = useState<HistorySnapshotEntry[]>([])
    const [historyLoadedAt, setHistoryLoadedAt] = useState<string | null>(null)
    const requestIdRef = useRef(0)
    const mountedRef = useRef(true)

    useEffect(() => {
        mountedRef.current = true
        return () => {
            mountedRef.current = false
        }
    }, [])

    const loadHistory = useCallback(async (pathOverride?: string | null) => {
        const targetPath = pathOverride ?? projectPath
        const requestId = ++requestIdRef.current

        if (!targetPath) {
            if (requestId !== requestIdRef.current || !mountedRef.current) return
            setHistorySnapshots([])
            setHistoryLoadedAt(null)
            setHistoryLoading(false)
            return
        }

        setHistoryLoading(true)
        try {
            const snapshots = await listHistorySnapshots(targetPath)
            if (requestId !== requestIdRef.current || !mountedRef.current) return
            setHistorySnapshots(snapshots)
            setHistoryLoadedAt(new Date().toISOString())
        } catch (error) {
            onError(String(error))
            if (requestId !== requestIdRef.current || !mountedRef.current) return
            setHistorySnapshots([])
            setHistoryLoadedAt(null)
        } finally {
            if (requestId === requestIdRef.current && mountedRef.current) {
                setHistoryLoading(false)
            }
        }
    }, [onError, projectPath])

    return {
        historyLoading,
        historySnapshots,
        historyLoadedAt,
        loadHistory,
    }
}
