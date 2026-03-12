import type { Dialog, IpcMain, IpcMainInvokeEvent } from 'electron'
import type { UiErrorKey } from '../uiErrorCopy'

export interface RegisterCoreIpcHandlersDeps {
    ipcMain: IpcMain
    dialog: Pick<Dialog, 'showSaveDialog' | 'showOpenDialog' | 'showMessageBox'>
    fs: Pick<typeof import('fs/promises'), 'readFile'>
    existsSync: (filePath: string) => boolean
    assertTrustedSender: (event: IpcMainInvokeEvent) => void
    assertIpcPathAllowed: (filePath: string) => string
    resolveReadablePath: (filePath: string) => string
    atomicWriteFileUtf8: (filePath: string, data: string) => Promise<void>
    atomicWriteFileBinary: (filePath: string, data: Uint8Array) => Promise<void>
    addRecentProjectDocument: (filePath: string) => void
    consumeQaDialogPath: (kind: 'open' | 'save') => string | null
    isQaDialogMode: boolean
    isSupportedBookPath: (filePath: string) => boolean
    approvePath: (filePath: string) => void
    setHasUnsavedChanges: (dirty: boolean) => void
    appendErrorReport: (payload: {
        level?: 'error' | 'warn'
        message: string
        stack?: string
        source?: string
        extra?: string
    }) => Promise<string>
    getDiagnosticsDir: () => string
    getUnsavedDialogCopy: (context: 'continue') => {
        title: string
        message: string
        detail: string
        buttons: [string, string, string]
    }
    getUiErrorCopy: (key: UiErrorKey) => string
}

export function registerCoreIpcHandlers(deps: RegisterCoreIpcHandlersDeps) {
    const {
        ipcMain,
        dialog,
        fs,
        existsSync,
        assertTrustedSender,
        assertIpcPathAllowed,
        resolveReadablePath,
        atomicWriteFileUtf8,
        atomicWriteFileBinary,
        addRecentProjectDocument,
        consumeQaDialogPath,
        isQaDialogMode,
        isSupportedBookPath,
        approvePath,
        setHasUnsavedChanges,
        appendErrorReport,
        getDiagnosticsDir,
        getUnsavedDialogCopy,
        getUiErrorCopy,
    } = deps

    ipcMain.handle('file:save', async (event, data: string, filePath: string) => {
        assertTrustedSender(event)
        const safePath = assertIpcPathAllowed(filePath)
        await atomicWriteFileUtf8(safePath, data)
        addRecentProjectDocument(safePath)
        return { success: true }
    })

    ipcMain.handle(
        'file:saveBinary',
        async (event, data: ArrayBuffer | Uint8Array, filePath: string) => {
            assertTrustedSender(event)
            const safePath = assertIpcPathAllowed(filePath)
            const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
            await atomicWriteFileBinary(safePath, bytes)
            return { success: true }
        },
    )

    ipcMain.handle('file:read', async (event, filePath: string) => {
        assertTrustedSender(event)
        const safePath = resolveReadablePath(filePath)
        return fs.readFile(safePath, 'utf-8')
    })

    ipcMain.handle('file:readBinary', async (event, filePath: string) => {
        assertTrustedSender(event)
        const safePath = resolveReadablePath(filePath)
        const buffer = await fs.readFile(safePath)
        return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
    })

    ipcMain.handle('dialog:save', async (event, options) => {
        assertTrustedSender(event)
        const qaPath = consumeQaDialogPath('save')
        if (qaPath) {
            if (!isSupportedBookPath(qaPath)) throw new Error(getUiErrorCopy('invalidFileType'))
            approvePath(qaPath)
            return qaPath
        }
        if (isQaDialogMode) return null
        const result = await dialog.showSaveDialog(options)
        if (result.canceled || !result.filePath) return null
        if (!isSupportedBookPath(result.filePath)) throw new Error(getUiErrorCopy('invalidFileType'))
        approvePath(result.filePath)
        return result.filePath
    })

    ipcMain.handle('dialog:open', async (event, options) => {
        assertTrustedSender(event)
        const qaPath = consumeQaDialogPath('open')
        if (qaPath) {
            if (!isSupportedBookPath(qaPath)) throw new Error(getUiErrorCopy('invalidFileType'))
            if (!existsSync(qaPath)) throw new Error(getUiErrorCopy('fileNotFound'))
            approvePath(qaPath)
            return qaPath
        }
        if (isQaDialogMode) return null
        const result = await dialog.showOpenDialog(options)
        const selected = result.canceled ? null : result.filePaths[0]
        if (!selected) return null
        if (!isSupportedBookPath(selected)) throw new Error(getUiErrorCopy('invalidFileType'))
        approvePath(selected)
        addRecentProjectDocument(selected)
        return selected
    })

    ipcMain.handle('app:setDirty', async (event, dirty: boolean) => {
        assertTrustedSender(event)
        setHasUnsavedChanges(Boolean(dirty))
        return { success: true }
    })

    ipcMain.handle(
        'app:reportError',
        async (
            event,
            payload: {
                level?: 'error' | 'warn'
                message: string
                stack?: string
                source?: string
                extra?: string
            },
        ) => {
            assertTrustedSender(event)
            const logPath = await appendErrorReport(payload)
            return { success: true, logPath }
        },
    )

    ipcMain.handle('app:getDiagnosticsPath', async (event) => {
        assertTrustedSender(event)
        return getDiagnosticsDir()
    })

    ipcMain.handle('app:confirmUnsavedChanges', async (event) => {
        assertTrustedSender(event)
        const copy = getUnsavedDialogCopy('continue')
        const result = await dialog.showMessageBox({
            type: 'warning',
            buttons: copy.buttons,
            defaultId: 0,
            cancelId: 2,
            title: copy.title,
            message: copy.message,
            detail: copy.detail,
            noLink: true,
        })
        if (result.response === 0) return 'save'
        if (result.response === 1) return 'discard'
        return 'cancel'
    })
}
