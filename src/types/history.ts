export type HistorySnapshotReason = 'manual' | 'autosave' | 'before-restore'

export type RestoreMode = 'replace' | 'new-file'

export interface HistorySnapshotEntry {
    id: string
    createdAt: string
    size: number
    reason: HistorySnapshotReason
}
