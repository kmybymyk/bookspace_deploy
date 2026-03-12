import { PROJECT_FILE_EXTENSION, PROJECT_FILE_FILTER } from '../../shared/filePolicy'
import i18n from '../i18n'
import { promoteRecentFile } from '../features/home/homeStorage'
import { deserializeProject, serializeProject } from './projectManager'
import { readHistorySnapshot } from './historyManager'
import { serializeCurrentProject } from './projectSnapshot'
import { applyProjectToWorkspace } from './projectWorkspace'
import { createSnapshotSafe } from './snapshotOps'

export async function restoreSnapshotToWorkspace(
    projectPath: string,
    snapshotId: string,
    mode: 'replace' | 'new_file',
): Promise<{ restoredPath: string | null; cancelled: boolean }> {
    const raw = await readHistorySnapshot(projectPath, snapshotId)
    const project = deserializeProject(raw)

    if (mode === 'replace') {
        const currentData = serializeCurrentProject()
        await createSnapshotSafe(projectPath, currentData, 'before-restore', {
            logTag: 'CopilotRestore',
            required: true,
        })
        applyProjectToWorkspace(projectPath, project, { setDirty: true })
        return { restoredPath: projectPath, cancelled: false }
    }

    const defaultTitle = (project.metadata.title || i18n.t('appShell.defaults.restoredTitle')).trim()
        || i18n.t('appShell.defaults.restoredTitle')
    const defaultName = `${defaultTitle}-${i18n.t('appShell.defaults.restoredSuffix')}.${PROJECT_FILE_EXTENSION}`
    const savePath = await window.electronAPI.showSaveDialog({
        filters: [PROJECT_FILE_FILTER],
        defaultPath: defaultName,
    })
    if (!savePath) {
        return { restoredPath: null, cancelled: true }
    }

    const currentData = serializeCurrentProject()
    await window.electronAPI.saveFile(currentData, projectPath)
    await createSnapshotSafe(projectPath, currentData, 'manual', { logTag: 'CopilotRestore' })
    const serialized = serializeProject(project)
    await window.electronAPI.saveFile(serialized, savePath)
    applyProjectToWorkspace(savePath, project, { setDirty: false, clearDraft: true })
    promoteRecentFile(savePath)
    return { restoredPath: savePath, cancelled: false }
}
