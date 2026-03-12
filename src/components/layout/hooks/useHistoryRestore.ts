import { useCallback, useEffect, useRef, useState } from 'react'
import type { TFunction } from 'i18next'
import { deserializeProject, serializeProject } from '../../../utils/projectManager'
import { readHistorySnapshot } from '../../../utils/historyManager'
import { serializeCurrentProject } from '../../../utils/projectSnapshot'
import { promoteRecentFile } from '../../../features/home/homeStorage'
import { showToast } from '../../../utils/toast'
import { PROJECT_FILE_EXTENSION, PROJECT_FILE_FILTER } from '../../../../shared/filePolicy'
import type { RestoreMode } from '../../../types/history'
import { applyProjectToWorkspace } from '../../../utils/projectWorkspace'
import { createSnapshotSafe } from '../../../utils/snapshotOps'
import { formatErrorMessage } from '../../../utils/errorMessage'

interface UseHistoryRestoreArgs {
    t: TFunction
    projectPath: string | null
    onCompleted?: () => void
    loadHistory: (path?: string | null) => Promise<void>
}

interface UseHistoryRestoreResult {
    restoreMode: RestoreMode
    showRestoreConfirm: boolean
    requestRestoreSnapshot: (snapshotId: string, mode: RestoreMode) => void
    confirmRestore: () => Promise<void>
    cancelRestore: () => void
}

export function useHistoryRestore({
    t,
    projectPath,
    onCompleted,
    loadHistory,
}: UseHistoryRestoreArgs): UseHistoryRestoreResult {
    const [restoreTargetId, setRestoreTargetId] = useState<string | null>(null)
    const [restoreMode, setRestoreMode] = useState<RestoreMode>('replace')
    const [showRestoreConfirm, setShowRestoreConfirm] = useState(false)
    const restoreRequestRef = useRef(0)
    const inProgressRef = useRef(false)
    const mountedRef = useRef(true)

    useEffect(() => {
        mountedRef.current = true
        return () => {
            mountedRef.current = false
        }
    }, [])

    const resetRestoreState = useCallback(() => {
        setShowRestoreConfirm(false)
        setRestoreTargetId(null)
        setRestoreMode('replace')
    }, [])

    const requestRestoreSnapshot = useCallback((snapshotId: string, mode: RestoreMode) => {
        setRestoreTargetId(snapshotId)
        setRestoreMode(mode)
        setShowRestoreConfirm(true)
    }, [])

    const confirmRestore = useCallback(async () => {
        if (!projectPath || !restoreTargetId) {
            resetRestoreState()
            return
        }

        const requestId = ++restoreRequestRef.current
        if (inProgressRef.current) return
        inProgressRef.current = true
        const targetProjectPath = projectPath
        const targetSnapshotId = restoreTargetId
        const targetMode = restoreMode
        const isCurrentRequest = () =>
            requestId === restoreRequestRef.current && targetProjectPath === projectPath && mountedRef.current

        try {
            const raw = await readHistorySnapshot(targetProjectPath, targetSnapshotId)
            if (!isCurrentRequest()) return
            const project = deserializeProject(raw)

            if (targetMode === 'replace') {
                const currentData = serializeCurrentProject()
                await createSnapshotSafe(targetProjectPath, currentData, 'before-restore', {
                    logTag: 'HistoryRestore',
                    required: true,
                })
                if (!isCurrentRequest()) return
                applyProjectToWorkspace(targetProjectPath, project, {
                    setDirty: true,
                })
                showToast(t('appShell.toasts.restoreCurrentCompleted'), 'success')
            } else {
                const defaultTitle = (project.metadata.title || t('appShell.defaults.restoredTitle')).trim()
                    || t('appShell.defaults.restoredTitle')
                const defaultName = `${defaultTitle}-${t('appShell.defaults.restoredSuffix')}.${PROJECT_FILE_EXTENSION}`
                const savePath = await window.electronAPI.showSaveDialog({
                    filters: [PROJECT_FILE_FILTER],
                    defaultPath: defaultName,
                })
                if (!savePath) {
                    resetRestoreState()
                    return
                }
                if (!isCurrentRequest()) return

                const currentData = serializeCurrentProject()
                await window.electronAPI.saveFile(currentData, targetProjectPath)
                await createSnapshotSafe(targetProjectPath, currentData, 'manual', { logTag: 'HistoryRestore' })
                if (!isCurrentRequest()) return
                const serialized = serializeProject(project)
                await window.electronAPI.saveFile(serialized, savePath)
                if (!isCurrentRequest()) return
                applyProjectToWorkspace(savePath, project, {
                    setDirty: false,
                    clearDraft: true,
                })
                promoteRecentFile(savePath)
                showToast(t('appShell.toasts.restoreNewFileCompleted', { path: savePath }), 'success')
                await loadHistory(savePath)
            }
            onCompleted?.()
        } catch (error) {
            if (isCurrentRequest()) {
                resetRestoreState()
                showToast(
                    t('appShell.toasts.restoreFailed', {
                        error: formatErrorMessage(error, t('common.unknownError')),
                    }),
                    'error',
                )
            }
        } finally {
            if (requestId === restoreRequestRef.current) {
                inProgressRef.current = false
                resetRestoreState()
            }
        }
    }, [
        loadHistory,
        onCompleted,
        projectPath,
        restoreMode,
        restoreTargetId,
        resetRestoreState,
        t,
    ])

    return {
        restoreMode,
        showRestoreConfirm,
        requestRestoreSnapshot,
        confirmRestore,
        cancelRestore: resetRestoreState,
    }
}
