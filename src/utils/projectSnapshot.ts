import { useChapterStore } from '../features/chapters/useChapterStore'
import { useDesignStore } from '../features/design-panel/useDesignStore'
import { useProjectStore } from '../store'
import type { ProjectFile } from '../types/project'
import { deserializeProject, serializeProject } from './projectManager'

export const DRAFT_STORAGE_KEY = 'bookspace_draft_v1'

type DraftEnvelope = {
    updatedAt: string
    payload: string
}

export function createProjectSnapshot(): ProjectFile {
    const { chapters } = useChapterStore.getState()
    const { settings } = useDesignStore.getState()
    const { metadata } = useProjectStore.getState()
    return {
        version: '0.1.0',
        metadata,
        chapters,
        designSettings: settings,
    }
}

export function serializeCurrentProject(): string {
    return serializeProject(createProjectSnapshot())
}

export function saveDraftToLocal(): void {
    const envelope: DraftEnvelope = {
        updatedAt: new Date().toISOString(),
        payload: serializeCurrentProject(),
    }
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(envelope))
}

export function getDraftInfo(): { updatedAt: string } | null {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY)
    if (!raw) return null
    try {
        const parsed = JSON.parse(raw) as Partial<DraftEnvelope>
        if (!parsed || typeof parsed !== 'object' || typeof parsed.updatedAt !== 'string') {
            return null
        }
        return { updatedAt: parsed.updatedAt }
    } catch {
        return null
    }
}

export function restoreDraftFromLocal(): ProjectFile | null {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY)
    if (!raw) return null
    try {
        const parsed = JSON.parse(raw) as Partial<DraftEnvelope>
        if (!parsed || typeof parsed !== 'object' || typeof parsed.payload !== 'string') {
            return null
        }
        return deserializeProject(parsed.payload)
    } catch {
        return null
    }
}

export function clearDraftFromLocal(): void {
    localStorage.removeItem(DRAFT_STORAGE_KEY)
}
