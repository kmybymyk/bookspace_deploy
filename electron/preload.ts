import { contextBridge, ipcRenderer } from 'electron'
import type { SubscriptionPlan } from '../shared/entitlements'
import type {
    AuthGoogleSignInRequest,
    AuthGoogleSignInResponse,
    AuthSessionSnapshot,
    AuthSignOutResponse,
} from '../shared/authIpc'
import type {
    CopilotAppServerChatRequest,
    CopilotAppServerChatResponse,
    CopilotAppServerGenerateRequest,
    CopilotAppServerInterruptRequest,
    CopilotAppServerInterruptResponse,
    CopilotAppServerStreamEvent,
    CopilotAppServerSteerRequest,
    CopilotAppServerSteerResponse,
    CopilotGenerateRequest,
    CopilotGenerateResponse,
    CopilotRuntimeConfigSetRequest,
    CopilotRuntimeConfigSnapshot,
} from '../shared/copilotIpc'
import type {
    SubscriptionCreditsRefundRequest,
    SubscriptionCreditsRefundResponse,
    SubscriptionEntitlementsResponse,
    SubscriptionGateCheckRequest,
    SubscriptionGateCheckResponse,
    SubscriptionSetPlanResponse,
} from '../shared/subscriptionIpc'
import type { AutoUpdateInstallResult, AutoUpdateState } from '../shared/autoUpdateIpc'

function hasCliFlag(flagName: string) {
    const prefix = `${flagName}=`
    return process.argv.some((arg) => arg === flagName || arg.startsWith(prefix))
}

contextBridge.exposeInMainWorld('electronAPI', {
    isQaDebugEnabled: () =>
        process.env.NODE_ENV === 'development' ||
        process.env.BOOKSPACE_QA_DEBUG === '1' ||
        process.env.QA_E2E_AUTORUN === '1' ||
        process.env.QA_E2E_DIALOG_MODE === '1' ||
        hasCliFlag('--qa-e2e-autorun') ||
        hasCliFlag('--qa-e2e-dialog-mode'),
    // 파일 시스템
    saveFile: (data: string, filePath: string) =>
        ipcRenderer.invoke('file:save', data, filePath),
    saveFileBinary: (data: ArrayBuffer | Uint8Array, filePath: string) =>
        ipcRenderer.invoke('file:saveBinary', data, filePath),
    readFile: (filePath: string) =>
        ipcRenderer.invoke('file:read', filePath),
    readFileBinary: (filePath: string) =>
        ipcRenderer.invoke('file:readBinary', filePath),
    // 네이티브 다이얼로그
    showSaveDialog: (options: Electron.SaveDialogOptions) =>
        ipcRenderer.invoke('dialog:save', options),
    showOpenDialog: (options: Electron.OpenDialogOptions) =>
        ipcRenderer.invoke('dialog:open', options),
    setDirtyState: (dirty: boolean) =>
        ipcRenderer.invoke('app:setDirty', dirty),
    consumeStartupOpenFile: (): Promise<string | null> =>
        ipcRenderer.invoke('app:consumeStartupOpenFile'),
    confirmUnsavedChanges: (): Promise<'save' | 'discard' | 'cancel'> =>
        ipcRenderer.invoke('app:confirmUnsavedChanges'),
    reportError: (payload: {
        level?: 'error' | 'warn'
        message: string
        stack?: string
        source?: string
        extra?: string
    }) => ipcRenderer.invoke('app:reportError', payload),
    getDiagnosticsPath: () => ipcRenderer.invoke('app:getDiagnosticsPath'),
    getAutoUpdateState: (): Promise<AutoUpdateState> => ipcRenderer.invoke('app:update:getState'),
    checkForAppUpdates: (): Promise<AutoUpdateState> => ipcRenderer.invoke('app:update:check'),
    downloadAppUpdate: (): Promise<AutoUpdateState> => ipcRenderer.invoke('app:update:download'),
    installAppUpdate: (): Promise<AutoUpdateInstallResult> => ipcRenderer.invoke('app:update:install'),
    getAuthSession: (): Promise<AuthSessionSnapshot> =>
        ipcRenderer.invoke('auth:session:get'),
    signInWithGoogle: (
        request?: AuthGoogleSignInRequest,
    ): Promise<AuthGoogleSignInResponse> =>
        ipcRenderer.invoke('auth:google:signIn', request),
    signOutAuthSession: (): Promise<AuthSignOutResponse> =>
        ipcRenderer.invoke('auth:signOut'),
    getEntitlementsSnapshot: (): Promise<SubscriptionEntitlementsResponse> =>
        ipcRenderer.invoke('subscription:entitlements:get'),
    checkSubscriptionGate: (
        request: SubscriptionGateCheckRequest,
    ): Promise<SubscriptionGateCheckResponse> =>
        ipcRenderer.invoke('subscription:gate:check', request),
    refundSubscriptionCredits: (
        request: SubscriptionCreditsRefundRequest,
    ): Promise<SubscriptionCreditsRefundResponse> =>
        ipcRenderer.invoke('subscription:credits:refund', request),
    generateCopilotCommands: (
        request: CopilotGenerateRequest,
    ): Promise<CopilotGenerateResponse> =>
        ipcRenderer.invoke('copilot:commands:generate', request),
    getCopilotRuntimeConfig: (): Promise<CopilotRuntimeConfigSnapshot> =>
        ipcRenderer.invoke('copilot:runtimeConfig:get'),
    setCopilotRuntimeConfig: (
        request: CopilotRuntimeConfigSetRequest,
    ): Promise<CopilotRuntimeConfigSnapshot> =>
        ipcRenderer.invoke('copilot:runtimeConfig:set', request),
    appServerChatCompletion: (
        request: CopilotAppServerChatRequest,
    ): Promise<CopilotAppServerChatResponse> =>
        ipcRenderer.invoke('copilot:chat:appserver', request),
    appServerGenerateCopilotCommands: (
        request: CopilotAppServerGenerateRequest,
    ): Promise<CopilotGenerateResponse> =>
        ipcRenderer.invoke('copilot:commands:generate:appserver', request),
    appServerInterruptTurn: (
        request: CopilotAppServerInterruptRequest,
    ): Promise<CopilotAppServerInterruptResponse> =>
        ipcRenderer.invoke('copilot:turn:interrupt:appserver', request),
    appServerSteerTurn: (
        request: CopilotAppServerSteerRequest,
    ): Promise<CopilotAppServerSteerResponse> =>
        ipcRenderer.invoke('copilot:turn:steer:appserver', request),
    onCopilotStreamEvent: (callback: (event: CopilotAppServerStreamEvent) => void) => {
        const handler = (_event: Electron.IpcRendererEvent, payload: CopilotAppServerStreamEvent) =>
            callback(payload)
        ipcRenderer.on('copilot:stream:event', handler)
        return () => ipcRenderer.removeListener('copilot:stream:event', handler)
    },
    setSubscriptionPlan: (plan: SubscriptionPlan): Promise<SubscriptionSetPlanResponse> =>
        ipcRenderer.invoke('subscription:plan:set', plan),
    createHistorySnapshot: (projectPath: string, data: string, reason?: string) =>
        ipcRenderer.invoke('history:create', projectPath, data, reason),
    listHistorySnapshots: (projectPath: string) =>
        ipcRenderer.invoke('history:list', projectPath),
    readHistorySnapshot: (projectPath: string, snapshotId: string) =>
        ipcRenderer.invoke('history:read', projectPath, snapshotId),
    deleteHistorySnapshot: (projectPath: string, snapshotId: string) =>
        ipcRenderer.invoke('history:delete', projectPath, snapshotId),
    // 이벤트 리스너
    onFileOpened: (callback: (path: string) => void) => {
        const handler = (_event: Electron.IpcRendererEvent, path: string) => callback(path)
        ipcRenderer.on('file-opened', handler)
        return () => ipcRenderer.removeListener('file-opened', handler)
    },
    onMenuAction: (
        callback: (
            action:
                | 'new-project'
                | 'save-project'
                | 'save-project-as'
                | 'import-epub'
                | 'import-docx'
                | 'import-md'
                | 'open-export'
                | 'open-version-manager'
                | 'view-edit'
                | 'view-preview-reflow'
                | 'view-preview-spread'
                | 'toggle-left-pane'
                | 'toggle-right-pane'
                | 'open-find-replace'
                | 'find-next'
                | 'find-prev'
                | 'check-for-updates'
                | 'dev-ai-enable'
                | 'dev-ai-disable'
                | 'dev-plan-free'
                | 'dev-plan-pro-lite'
                | 'dev-plan-pro'
                | 'dev-lang-ko'
                | 'dev-lang-en'
                | 'update-test-reset'
                | 'update-test-available'
                | 'update-test-not-available'
                | 'update-test-downloading'
                | 'update-test-downloaded'
                | 'update-test-error'
                | 'open-help'
        ) => void,
    ) => {
        const handler = (_event: Electron.IpcRendererEvent, action: string) =>
            callback(
                action as
                    | 'new-project'
                    | 'save-project'
                    | 'save-project-as'
                    | 'import-epub'
                    | 'import-docx'
                    | 'import-md'
                    | 'open-export'
                    | 'open-version-manager'
                    | 'view-edit'
                    | 'view-preview-reflow'
                    | 'view-preview-spread'
                    | 'toggle-left-pane'
                    | 'toggle-right-pane'
                    | 'open-find-replace'
                    | 'find-next'
                    | 'find-prev'
                    | 'check-for-updates'
                    | 'dev-ai-enable'
                    | 'dev-ai-disable'
                    | 'dev-plan-free'
                    | 'dev-plan-pro-lite'
                    | 'dev-plan-pro'
                    | 'dev-lang-ko'
                    | 'dev-lang-en'
                    | 'update-test-reset'
                    | 'update-test-available'
                    | 'update-test-not-available'
                    | 'update-test-downloading'
                    | 'update-test-downloaded'
                    | 'update-test-error'
                    | 'open-help',
            )
        ipcRenderer.on('menu-action', handler)
        return () => ipcRenderer.removeListener('menu-action', handler)
    },
    onAutoUpdateStatus: (callback: (state: AutoUpdateState) => void) => {
        const handler = (_event: Electron.IpcRendererEvent, state: AutoUpdateState) => callback(state)
        ipcRenderer.on('app:update:status', handler)
        return () => ipcRenderer.removeListener('app:update:status', handler)
    },
})
