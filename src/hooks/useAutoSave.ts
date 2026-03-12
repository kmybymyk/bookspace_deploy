import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useProjectStore } from '../store'
import { useChapterStore } from '../features/chapters/useChapterStore'
import { serializeCurrentProject } from '../utils/projectSnapshot'
import { showToast } from '../utils/toast'
import { createSnapshotSafe } from '../utils/snapshotOps'
import { useSaveFeedbackStore } from '../store/saveFeedbackStore'

const AUTO_SAVE_INTERVAL_MS = 30_000 // 30초
const AUTO_HISTORY_INTERVAL_MS = 10 * 60_000 // 10분

export function useAutoSave(projectPath: string | null) {
    const { t } = useTranslation()
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const savingRef = useRef(false)
    const pendingRef = useRef(false)
    const disposedRef = useRef(false)
    const saveRunRef = useRef(0)
    const lastAutoHistoryAtRef = useRef(0)

    useEffect(() => {
        if (!projectPath) {
            disposedRef.current = true
            savingRef.current = false
            lastAutoHistoryAtRef.current = 0
            return () => {
                disposedRef.current = true
                savingRef.current = false
                if (timerRef.current) clearInterval(timerRef.current)
                timerRef.current = null
                pendingRef.current = false
            }
        }

        disposedRef.current = false
        savingRef.current = false
        pendingRef.current = false
        saveRunRef.current += 1
        lastAutoHistoryAtRef.current = 0
        const runId = saveRunRef.current

        const runSave = async () => {
            const activeRun = runId
            if (disposedRef.current || saveRunRef.current !== runId || savingRef.current) {
                pendingRef.current = true
                return
            }
            savingRef.current = true
            try {
                const { isDirty } = useProjectStore.getState()
                if (!isDirty) return
                const { chapters } = useChapterStore.getState()
                // Skip autosave when no pages exist yet; users can explicitly save once content starts.
                if (chapters.length === 0) return
                const data = serializeCurrentProject()
                const targetPath = useProjectStore.getState().projectPath
                if (!targetPath) return
                if (disposedRef.current || saveRunRef.current !== activeRun) return
                if (useProjectStore.getState().projectPath !== targetPath) {
                    return
                }

                const { setDirty } = useProjectStore.getState()
                await window.electronAPI.saveFile(data, targetPath)
                if (disposedRef.current || saveRunRef.current !== activeRun) return
                if (useProjectStore.getState().projectPath !== targetPath) return
                const now = Date.now()
                if (now - lastAutoHistoryAtRef.current >= AUTO_HISTORY_INTERVAL_MS) {
                    const snapshotId = await createSnapshotSafe(targetPath, data, 'autosave', {
                        logTag: 'AutoSave',
                    })
                    if (snapshotId) {
                        lastAutoHistoryAtRef.current = now
                    }
                }
                if (disposedRef.current || saveRunRef.current !== activeRun) return

                setDirty(false)
                if (disposedRef.current || saveRunRef.current !== activeRun) return
                showToast(t('common.autoSaved'), 'success')
                useSaveFeedbackStore.getState().clearSaveError()
            } catch (e) {
                console.error('[AutoSave] failed:', e)
                useSaveFeedbackStore
                    .getState()
                    .setSaveError(t('centerPane.autoSaveErrorPinned'), 'autosave')
            } finally {
                savingRef.current = false
                if (!disposedRef.current && saveRunRef.current === activeRun) {
                    if (pendingRef.current && !disposedRef.current) {
                        pendingRef.current = false
                        void runSave()
                    }
                }
            }
        }

        timerRef.current = setInterval(() => {
            void runSave()
        }, AUTO_SAVE_INTERVAL_MS)

        return () => {
            disposedRef.current = true
            savingRef.current = false
            saveRunRef.current += 1
            if (timerRef.current) clearInterval(timerRef.current)
            timerRef.current = null
            pendingRef.current = false
        }
    }, [projectPath, t])
}
