import { deserializeProject } from './projectManager'
import { clearDraftFromLocal } from './projectSnapshot'
import { useChapterStore } from '../features/chapters/useChapterStore'
import { useDesignStore } from '../features/design-panel/useDesignStore'
import { useProjectStore } from '../store'
import type { ProjectFile } from '../types/project'

export type ProjectApplyOptions = {
    setDirty?: boolean
    clearDraft?: boolean
    rotateSession?: boolean
}

export async function loadProjectFromPath(projectPath: string): Promise<ProjectFile> {
    const raw = await window.electronAPI.readFile(projectPath)
    return deserializeProject(raw)
}

export function applyProjectToWorkspace(
    projectPath: string | null,
    project: ProjectFile,
    options: ProjectApplyOptions = {},
): void {
    const { setDirty, clearDraft, rotateSession = true } = options
    if (rotateSession) {
        useProjectStore.getState().rotateProjectSessionId()
    }
    useProjectStore.getState().setProjectPath(projectPath)
    useProjectStore.getState().setMetadata(project.metadata)
    useChapterStore.getState().setChapters(project.chapters)
    useDesignStore.getState().setSettings(project.designSettings)
    useProjectStore.getState().setDirty(Boolean(setDirty))
    if (clearDraft) clearDraftFromLocal()
}

