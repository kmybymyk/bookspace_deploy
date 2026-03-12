/// <reference types="vite/client" />
/// <reference types="electron" />
/* eslint-disable @typescript-eslint/no-unused-vars */
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

type HistorySnapshotReason = 'manual' | 'autosave' | 'before-restore'

interface HistorySnapshotEntry {
    id: string
    createdAt: string
    size: number
    reason: HistorySnapshotReason
}

declare global {
    interface Window {
        electronAPI: {
            isQaDebugEnabled: () => boolean
            saveFile: (data: string, filePath: string) => Promise<{ success: boolean }>
            saveFileBinary: (
                data: ArrayBuffer | Uint8Array,
                filePath: string
            ) => Promise<{ success: boolean }>
            readFile: (filePath: string) => Promise<string>
            readFileBinary: (filePath: string) => Promise<ArrayBuffer>
            showSaveDialog: (options: Electron.SaveDialogOptions) => Promise<string | null>
            showOpenDialog: (options: Electron.OpenDialogOptions) => Promise<string | null>
            setDirtyState: (dirty: boolean) => Promise<{ success: boolean }>
            consumeStartupOpenFile: () => Promise<string | null>
            confirmUnsavedChanges: () => Promise<'save' | 'discard' | 'cancel'>
            reportError: (payload: {
                level?: 'error' | 'warn'
                message: string
                stack?: string
                source?: string
                extra?: string
            }) => Promise<{ success: boolean; logPath: string }>
            getDiagnosticsPath: () => Promise<string>
            getAutoUpdateState: () => Promise<AutoUpdateState>
            checkForAppUpdates: () => Promise<AutoUpdateState>
            downloadAppUpdate: () => Promise<AutoUpdateState>
            installAppUpdate: () => Promise<AutoUpdateInstallResult>
            getAuthSession: () => Promise<AuthSessionSnapshot>
            signInWithGoogle: (
                request?: AuthGoogleSignInRequest
            ) => Promise<AuthGoogleSignInResponse>
            signOutAuthSession: () => Promise<AuthSignOutResponse>
            getEntitlementsSnapshot: () => Promise<SubscriptionEntitlementsResponse>
            checkSubscriptionGate: (
                request: SubscriptionGateCheckRequest
            ) => Promise<SubscriptionGateCheckResponse>
            refundSubscriptionCredits: (
                request: SubscriptionCreditsRefundRequest
            ) => Promise<SubscriptionCreditsRefundResponse>
            generateCopilotCommands: (
                request: CopilotGenerateRequest
            ) => Promise<CopilotGenerateResponse>
            getCopilotRuntimeConfig: () => Promise<CopilotRuntimeConfigSnapshot>
            setCopilotRuntimeConfig: (
                request: CopilotRuntimeConfigSetRequest
            ) => Promise<CopilotRuntimeConfigSnapshot>
            appServerChatCompletion: (
                request: CopilotAppServerChatRequest
            ) => Promise<CopilotAppServerChatResponse>
            appServerGenerateCopilotCommands: (
                request: CopilotAppServerGenerateRequest
            ) => Promise<CopilotGenerateResponse>
            appServerInterruptTurn: (
                request: CopilotAppServerInterruptRequest
            ) => Promise<CopilotAppServerInterruptResponse>
            appServerSteerTurn: (
                request: CopilotAppServerSteerRequest
            ) => Promise<CopilotAppServerSteerResponse>
            onCopilotStreamEvent?: (
                callback: (event: CopilotAppServerStreamEvent) => void
            ) => () => void
            setSubscriptionPlan: (plan: SubscriptionPlan) => Promise<SubscriptionSetPlanResponse>
            createHistorySnapshot: (
                projectPath: string,
                data: string,
                reason?: HistorySnapshotReason
            ) => Promise<{ id: string }>
            listHistorySnapshots: (projectPath: string) => Promise<HistorySnapshotEntry[]>
            readHistorySnapshot: (projectPath: string, snapshotId: string) => Promise<string>
            deleteHistorySnapshot: (projectPath: string, snapshotId: string) => Promise<{ success: boolean }>
            onFileOpened: (callback: (path: string) => void) => () => void
            onMenuAction?: (
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
                ) => void
            ) => () => void
            onAutoUpdateStatus?: (callback: (state: AutoUpdateState) => void) => () => void
        }
    }
}

interface ImportMetaEnv {
    readonly VITE_EDITOR_ONLY_RELEASE?: string
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}

export {}
