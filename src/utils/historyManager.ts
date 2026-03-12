import type { HistorySnapshotEntry, HistorySnapshotReason } from '../types/history'

export async function createHistorySnapshot(
    projectPath: string,
    data: string,
    reason: HistorySnapshotReason,
): Promise<{ id: string }> {
    return await window.electronAPI.createHistorySnapshot(projectPath, data, reason)
}

export async function listHistorySnapshots(projectPath: string): Promise<HistorySnapshotEntry[]> {
    return await window.electronAPI.listHistorySnapshots(projectPath)
}

export async function readHistorySnapshot(projectPath: string, snapshotId: string): Promise<string> {
    return await window.electronAPI.readHistorySnapshot(projectPath, snapshotId)
}

export async function deleteHistorySnapshot(projectPath: string, snapshotId: string): Promise<void> {
    await window.electronAPI.deleteHistorySnapshot(projectPath, snapshotId)
}
