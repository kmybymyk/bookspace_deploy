import { createHistorySnapshot } from './historyManager'
import type { HistorySnapshotReason } from '../types/history'

export interface SnapshotOptions {
    required?: boolean
    logTag?: string
}

export async function createSnapshotSafe(
    projectPath: string,
    data: string,
    reason: HistorySnapshotReason,
    options: SnapshotOptions = {},
): Promise<string | null> {
    try {
        const result = await createHistorySnapshot(projectPath, data, reason)
        return result.id
    } catch (error) {
        if (options.required) throw error
        const tag = options.logTag ?? 'history'
        console.warn(`[${tag}] snapshot create failed:`, error)
        return null
    }
}

