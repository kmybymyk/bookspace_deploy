export type AutoUpdatePhase =
    | 'unsupported'
    | 'idle'
    | 'checking'
    | 'available'
    | 'not-available'
    | 'downloading'
    | 'downloaded'
    | 'error'

export interface AutoUpdateState {
    phase: AutoUpdatePhase
    currentVersion: string
    availableVersion: string | null
    downloadedVersion: string | null
    progressPercent: number | null
    message: string | null
    checkedAt: string | null
}

export interface AutoUpdateInstallResult {
    success: boolean
    reason?: 'unsupported' | 'not-ready' | 'dirty-state'
}
