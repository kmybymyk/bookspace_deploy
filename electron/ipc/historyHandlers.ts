import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import type { Dirent } from 'fs'
import type { UiErrorKey } from '../uiErrorCopy'

interface HistorySnapshotListItem {
    id: string
    createdAt: string
    size: number
    reason: string
}

export interface RegisterHistoryIpcHandlersDeps {
    ipcMain: IpcMain
    assertTrustedSender: (event: IpcMainInvokeEvent) => void
    assertIpcPathAllowed: (projectPath: string) => string
    resolveHistoryDir: (projectPath: string, ensureDir?: boolean) => Promise<string>
    timestampId: () => string
    sanitizeHistoryReason: (reason?: string) => string
    historyFileExtension: string
    atomicWriteFileUtf8: (filePath: string, contents: string) => Promise<void>
    pruneHistorySnapshots: (historyDir: string) => Promise<void>
    existsSync: (filePath: string) => boolean
    fs: Pick<typeof import('fs/promises'), 'readdir' | 'stat' | 'readFile' | 'unlink'>
    path: Pick<typeof import('path'), 'join' | 'resolve' | 'sep'>
    historyReasonLabel: (reason: string) => string
    validateSnapshotId: (snapshotId: string) => void
    reasonFromSnapshotId: (snapshotId: string) => string
    getUiErrorCopy: (key: UiErrorKey) => string
}

export function registerHistoryIpcHandlers(deps: RegisterHistoryIpcHandlersDeps) {
    const {
        ipcMain,
        assertTrustedSender,
        assertIpcPathAllowed,
        resolveHistoryDir,
        timestampId,
        sanitizeHistoryReason,
        historyFileExtension,
        atomicWriteFileUtf8,
        pruneHistorySnapshots,
        existsSync,
        fs,
        path,
        historyReasonLabel,
        validateSnapshotId,
        reasonFromSnapshotId,
        getUiErrorCopy,
    } = deps

    ipcMain.handle(
        'history:create',
        async (event, projectPath: string, data: string, reason?: string) => {
            assertTrustedSender(event)
            const safeProjectPath = assertIpcPathAllowed(projectPath)
            const historyDir = await resolveHistoryDir(safeProjectPath, true)
            const snapshotId = `${timestampId()}-${sanitizeHistoryReason(reason)}${historyFileExtension}`
            const snapshotPath = path.join(historyDir, snapshotId)
            await atomicWriteFileUtf8(snapshotPath, data)
            await pruneHistorySnapshots(historyDir)
            return { id: snapshotId }
        },
    )

    ipcMain.handle('history:list', async (event, projectPath: string): Promise<HistorySnapshotListItem[]> => {
        assertTrustedSender(event)
        const safeProjectPath = assertIpcPathAllowed(projectPath)
        const historyDir = await resolveHistoryDir(safeProjectPath)
        if (!existsSync(historyDir)) return []
        const entries = await fs.readdir(historyDir, { withFileTypes: true })
        const snapshots = await Promise.all(
            entries
                .filter((entry: Dirent) => entry.isFile() && entry.name.endsWith(historyFileExtension))
                .map(async (entry: Dirent) => {
                    const stat = await fs.stat(path.join(historyDir, entry.name))
                    return {
                        id: entry.name,
                        createdAt: stat.mtime.toISOString(),
                        size: stat.size,
                        reason: historyReasonLabel(reasonFromSnapshotId(entry.name)),
                    }
                }),
        )
        snapshots.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        return snapshots
    })

    ipcMain.handle('history:read', async (event, projectPath: string, snapshotId: string) => {
        assertTrustedSender(event)
        validateSnapshotId(snapshotId)
        const safeProjectPath = assertIpcPathAllowed(projectPath)
        const historyDir = await resolveHistoryDir(safeProjectPath)
        const snapshotPath = path.resolve(historyDir, snapshotId)
        const historyDirResolved = path.resolve(historyDir) + path.sep
        if (!snapshotPath.startsWith(historyDirResolved)) {
            throw new Error(getUiErrorCopy('disallowedHistoryPath'))
        }
        if (!existsSync(snapshotPath)) {
            throw new Error(getUiErrorCopy('historyFileNotFound'))
        }
        return fs.readFile(snapshotPath, 'utf-8')
    })

    ipcMain.handle('history:delete', async (event, projectPath: string, snapshotId: string) => {
        assertTrustedSender(event)
        validateSnapshotId(snapshotId)
        const safeProjectPath = assertIpcPathAllowed(projectPath)
        const historyDir = await resolveHistoryDir(safeProjectPath)
        const snapshotPath = path.resolve(historyDir, snapshotId)
        const historyDirResolved = path.resolve(historyDir) + path.sep
        if (!snapshotPath.startsWith(historyDirResolved)) {
            throw new Error(getUiErrorCopy('disallowedHistoryPath'))
        }
        if (!existsSync(snapshotPath)) {
            throw new Error(getUiErrorCopy('historyFileNotFound'))
        }
        const reason = reasonFromSnapshotId(snapshotId)
        if (reason !== 'autosave') {
            throw new Error(getUiErrorCopy('autosaveOnlyDelete'))
        }
        await fs.unlink(snapshotPath)
        return { success: true }
    })
}
