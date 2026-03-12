import type { TFunction } from 'i18next'
import { PROJECT_FILE_EXTENSION, PROJECT_FILE_FILTER } from '../../shared/filePolicy'
import { createSnapshotSafe } from './snapshotOps'
import { promoteRecentFile, setLastManualSaveProject } from '../features/home/homeStorage'

interface SaveProjectPayloadOptions {
    payload: string
    projectPath: string | null
    t: TFunction
    forceChoosePath?: boolean
}

interface SaveProjectPayloadResult {
    cancelled: boolean
    savePath: string | null
    savedAt: string | null
}

export async function saveProjectPayload({
    payload,
    projectPath,
    t,
    forceChoosePath = false,
}: SaveProjectPayloadOptions): Promise<SaveProjectPayloadResult> {
    let savePath = projectPath

    if (savePath && !forceChoosePath) {
        let sourceExists = true
        try {
            await window.electronAPI.readFile(savePath)
        } catch {
            sourceExists = false
        }

        if (!sourceExists) {
            const recreate = window.confirm(t('appShell.confirm.missingOriginalFilePrompt'))
            if (!recreate) {
                const chosen = await window.electronAPI.showSaveDialog({
                    filters: [PROJECT_FILE_FILTER],
                    defaultPath: `${t('appShell.defaults.newBookFileName')}.${PROJECT_FILE_EXTENSION}`,
                })
                if (!chosen) return { cancelled: true, savePath: null, savedAt: null }
                savePath = chosen
            }
        }
    }

    if (!savePath || forceChoosePath) {
        const chosen = await window.electronAPI.showSaveDialog({
            filters: [PROJECT_FILE_FILTER],
            defaultPath: `${t('appShell.defaults.newBookFileName')}.${PROJECT_FILE_EXTENSION}`,
        })
        if (!chosen) return { cancelled: true, savePath: null, savedAt: null }
        savePath = chosen
    }

    await window.electronAPI.saveFile(payload, savePath)
    await createSnapshotSafe(savePath, payload, 'manual', { logTag: 'ProjectSave' })

    const savedAt = new Date().toISOString()
    promoteRecentFile(savePath)
    setLastManualSaveProject(savePath, savedAt)
    return { cancelled: false, savePath, savedAt }
}
