import type { App, BrowserWindow } from 'electron'

interface RegisterWindowLifecycleHandlersArgs {
    app: App
    BrowserWindow: typeof BrowserWindow
    createWindow: () => void
    withActiveMainWindow: (onReady: (win: BrowserWindow) => void) => void
    findOpenableFileArg: (args: string[]) => string | null
    isSupportedBookPath: (filePath: string) => boolean
    approvePath: (filePath: string) => void
    addRecentProjectDocument: (filePath: string) => void
    setPendingFile: (filePath: string | null) => void
    setIsQuitting: (value: boolean) => void
}

export function ensureSingleInstanceLock(app: App): boolean {
    const gotTheLock = app.requestSingleInstanceLock()
    if (!gotTheLock) {
        app.quit()
    }
    return gotTheLock
}

export function registerWindowLifecycleHandlers({
    app,
    BrowserWindow,
    createWindow,
    withActiveMainWindow,
    findOpenableFileArg,
    isSupportedBookPath,
    approvePath,
    addRecentProjectDocument,
    setPendingFile,
    setIsQuitting,
}: RegisterWindowLifecycleHandlersArgs) {
    const runIfWindowAlive = (win: BrowserWindow, action: () => void) => {
        if (win.isDestroyed() || win.webContents.isDestroyed()) return
        try {
            action()
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            if (!message.includes('Object has been destroyed')) throw error
        }
    }

    app.on('before-quit', () => {
        setIsQuitting(true)
    })

    app.on('second-instance', (_event, commandLine) => {
        withActiveMainWindow((win) => {
            runIfWindowAlive(win, () => {
                if (win.isMinimized()) win.restore()
                win.focus()
            })
            const file = findOpenableFileArg(commandLine)
            if (file) {
                addRecentProjectDocument(file)
                runIfWindowAlive(win, () => {
                    if (win.webContents.isLoadingMainFrame()) {
                        setPendingFile(file)
                        return
                    }
                    win.webContents.send('file-opened', file)
                })
            }
        })
    })

    app.on('open-file', (event, filePath) => {
        event.preventDefault()
        if (!isSupportedBookPath(filePath)) return
        approvePath(filePath)
        addRecentProjectDocument(filePath)
        setPendingFile(filePath)
        withActiveMainWindow((win) => {
            runIfWindowAlive(win, () => {
                if (win.isMinimized()) win.restore()
                win.focus()
                if (win.webContents.isLoadingMainFrame()) return
                win.webContents.send('file-opened', filePath)
            })
        })
    })

    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') app.quit()
    })

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
}
