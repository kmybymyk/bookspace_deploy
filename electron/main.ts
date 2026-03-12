import { app, BrowserWindow, ipcMain, dialog, shell, session } from 'electron'
import path from 'path'
import fs from 'fs/promises'
import { appendFileSync, existsSync } from 'fs'
import { createHash } from 'crypto'
import type { IpcMainInvokeEvent } from 'electron'
import { autoUpdater } from 'electron-updater'
import { IMPORT_FILE_EXTENSIONS, PROJECT_FILE_EXTENSION } from '../shared/filePolicy'
import { validateAiCommandEnvelope } from '../shared/aiCommandSchema'
import type {
    AuthSessionSnapshot,
    AuthUserProfile,
} from '../shared/authIpc'
import type {
    CopilotAppServerChatRequest,
    CopilotAppServerChatResponse,
    CopilotAppServerInterruptRequest,
    CopilotAppServerInterruptResponse,
    CopilotAppServerSteerRequest,
    CopilotAppServerSteerResponse,
    CopilotRuntimeConfigSetRequest,
    CopilotRuntimeConfigSnapshot,
    CopilotRuntimeMode,
} from '../shared/copilotIpc'
import { resolveCopilotIntentPlan } from '../shared/copilotIntentPlanner'
import type {
    SubscriptionEntitlementsResponse,
    SubscriptionGateCheckResponse,
    SubscriptionSetPlanResponse,
} from '../shared/subscriptionIpc'
import { SubscriptionGateRuntime } from '../shared/subscriptionGateRuntime'
import { registerCopilotIpcHandlers } from './ipc/copilotHandlers'
import { registerHistoryIpcHandlers } from './ipc/historyHandlers'
import { registerAuthIpcHandlers } from './ipc/authHandlers'
import { registerSubscriptionIpcHandlers } from './ipc/subscriptionHandlers'
import { registerCoreIpcHandlers } from './ipc/coreHandlers'
import { buildApplicationMenu, type MenuAction } from './menuBuilder'
import { createCopilotRuntimeService } from './services/copilotRuntimeService'
import { createCodexAppServerService, readTurnErrorMetadata } from './services/codexAppServerService'
import { createDiagnosticsService } from './services/diagnosticsService'
import { ensureSingleInstanceLock, registerWindowLifecycleHandlers } from './windowLifecycle'
import { isQaE2ePendingQuit, maybeStartQaE2eAutorun } from './qaE2eAutorun'
import { getUnsavedDialogCopy, resolveUiLocale } from './uiDialogCopy'
import { getUiErrorCopy } from './uiErrorCopy'
import {
    anonymizePromptForAudit,
    buildPromptSignature,
    createGoogleUserId,
    normalizeAuthUserProfile,
    normalizeCopilotGenerateRequest,
    normalizeCreditsRefundRequest,
    normalizeDisplayName,
    normalizeEmail,
    normalizeGateCheckRequest,
    parseSubscriptionPlan,
    resolveInitialAiCredits,
    resolveInitialSubscriptionPlan,
} from './requestNormalizers'
import { isEditorOnlyRelease } from './appMode'
import type { AutoUpdateInstallResult, AutoUpdateState } from '../shared/autoUpdateIpc'

let mainWindow: BrowserWindow | null = null
let pendingFile: string | null = null
let startupOpenFile: string | null = null
const approvedPaths = new Set<string>()
let hasUnsavedChanges = false
let isQuitting = false
let isWaitingForCloseSave = false
let runtimeUiLanguageOverride: 'ko' | 'en' | null = null
function readCliFlagValue(flagName: string) {
    const prefix = `${flagName}=`
    const match = process.argv.find((arg) => arg.startsWith(prefix))
    return match ? match.slice(prefix.length).trim() : ''
}

const qaDialogMode =
    process.env.QA_E2E_DIALOG_MODE === '1' ||
    readCliFlagValue('--qa-e2e-dialog-mode') === '1'
const qaOpenDialogQueue = (process.env.QA_E2E_DIALOG_OPEN_QUEUE || readCliFlagValue('--qa-e2e-dialog-open-queue'))
    .split(';;')
    .map((item) => item.trim())
    .filter(Boolean)
const qaSaveDialogQueue = (process.env.QA_E2E_DIALOG_SAVE_QUEUE || readCliFlagValue('--qa-e2e-dialog-save-queue'))
    .split(';;')
    .map((item) => item.trim())
    .filter(Boolean)
const qaDialogTraceFile =
    process.env.QA_E2E_DIALOG_TRACE_FILE?.trim() || readCliFlagValue('--qa-e2e-dialog-trace-file')

const ALLOWED_FILE_EXTENSIONS = new Set([
    `.${PROJECT_FILE_EXTENSION}`,
    ...IMPORT_FILE_EXTENSIONS.map((extension) => `.${extension}`),
])
const ALLOWED_READ_IMAGE_EXTENSIONS = new Set([
    '.png',
    '.jpg',
    '.jpeg',
    '.webp',
    '.gif',
    '.svg',
    '.avif',
    '.bmp',
])
const HISTORY_FILE_EXTENSION = '.bksp'
const MAX_HISTORY_SNAPSHOTS = 120
const MAX_HISTORY_RETENTION_DAYS = 30
const MAX_HISTORY_RETENTION_MS = MAX_HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000
const HISTORY_STORAGE_DIR_NAME = 'history'
const PROD_CSP_BASE_DIRECTIVES = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
]
const HELP_ISSUES_URL = 'https://github.com/kmybymyk/bookspace/issues'
const MAX_APPROVED_PATHS = 1024
const AUTH_SESSION_FILE = 'auth-session.json'
const COPILOT_RUNTIME_CONFIG_FILE = 'copilot-runtime-config.json'
const SUBSCRIPTION_RUNTIME_IDLE_TTL_MS = 24 * 60 * 60 * 1000
const MAX_SUBSCRIPTION_RUNTIME_USERS = 512
const AUTO_UPDATE_STARTUP_DELAY_MS = 10_000
const AUTO_UPDATE_INTERVAL_MS = 6 * 60 * 60 * 1000

interface LocalCopilotRuntimeConfigState {
    mode: CopilotRuntimeMode
    httpBaseUrl: string
    directBaseUrl: string
    directModel: string
    directApiKey: string
}

function buildDefaultCopilotRuntimeConfigState(): LocalCopilotRuntimeConfigState {
    const preferredMode = String(process.env.BOOKSPACE_COPILOT_RUNTIME_MODE ?? '').trim().toLowerCase()
    const directModelOverride = String(process.env.BOOKSPACE_COPILOT_DIRECT_MODEL ?? process.env.AI_MODEL ?? '').trim()
    const groqApiKey = String(process.env.GROQ_API_KEY ?? '').trim()
    const openAiApiKey = String(process.env.OPENAI_API_KEY ?? '').trim()
    const groqBaseUrl = String(process.env.GROQ_API_BASE_URL ?? 'https://api.groq.com/openai/v1').trim()
    const openAiBaseUrl = String(process.env.OPENAI_API_BASE_URL ?? 'https://api.openai.com/v1').trim()

    if (preferredMode === 'direct') {
        if (groqApiKey) {
            return {
                mode: 'direct',
                httpBaseUrl: '',
                directBaseUrl: groqBaseUrl,
                directModel: directModelOverride || 'openai/gpt-oss-120b',
                directApiKey: groqApiKey,
            }
        }
        if (openAiApiKey) {
            return {
                mode: 'direct',
                httpBaseUrl: '',
                directBaseUrl: openAiBaseUrl,
                directModel: directModelOverride || 'gpt-4.1-mini',
                directApiKey: openAiApiKey,
            }
        }
    }

    if (groqApiKey) {
        return {
            mode: 'direct',
            httpBaseUrl: '',
            directBaseUrl: groqBaseUrl,
            directModel: directModelOverride || 'openai/gpt-oss-120b',
            directApiKey: groqApiKey,
        }
    }
    if (openAiApiKey) {
        return {
            mode: 'direct',
            httpBaseUrl: '',
            directBaseUrl: openAiBaseUrl,
            directModel: directModelOverride || 'gpt-4.1-mini',
            directApiKey: openAiApiKey,
        }
    }

    return {
        mode: preferredMode === 'http' ? 'http' : preferredMode === 'ipc' ? 'ipc' : 'appserver',
        httpBaseUrl: '',
        directBaseUrl: '',
        directModel: '',
        directApiKey: '',
    }
}

const DEFAULT_COPILOT_RUNTIME_CONFIG_STATE: LocalCopilotRuntimeConfigState =
    buildDefaultCopilotRuntimeConfigState()

let autoUpdateTimer: NodeJS.Timeout | null = null
let autoUpdateStartupTimer: NodeJS.Timeout | null = null
let autoUpdateConfigured = false
let autoUpdateState: AutoUpdateState = {
    phase: 'unsupported',
    currentVersion: app.getVersion(),
    availableVersion: null,
    downloadedVersion: null,
    progressPercent: null,
    message: null,
    checkedAt: null,
}

app.setName('BookSpace')
const editorOnlyMode = isEditorOnlyRelease()

function normalizeCliPath(arg: string): string {
    return arg.replace(/^"(.*)"$/, '$1')
}

function parseAllowedConnectOrigin(value: string): string | null {
    try {
        const parsed = new URL(value)
        if (!['https:', 'http:'].includes(parsed.protocol)) return null
        return parsed.origin
    } catch {
        return null
    }
}

function collectAllowedConnectSrc(): string[] {
    const out = new Set<string>(["'self'"])
    const defaults = [
        'https://api.groq.com',
        'https://api.openai.com',
    ]
    for (const value of defaults) {
        const origin = parseAllowedConnectOrigin(value)
        if (origin) out.add(origin)
    }
    const keys = [
        'BOOKSPACE_CONNECT_SRC',
        'BOOKSPACE_API_BASE_URL',
        'VITE_AUTH_API_BASE_URL',
        'VITE_SUBSCRIPTION_API_BASE_URL',
        'VITE_COPILOT_API_BASE_URL',
        'VITE_COPILOT_DIRECT_API_BASE_URL',
        'GROQ_API_BASE_URL',
        'OPENAI_API_BASE_URL',
    ] as const
    for (const key of keys) {
        const raw = String(process.env[key] ?? '')
            .split(/[,\s]+/)
            .map((item) => item.trim())
            .filter(Boolean)
        for (const value of raw) {
            const origin = parseAllowedConnectOrigin(value)
            if (!origin) continue
            out.add(origin)
        }
    }
    return [...out]
}

function buildProdCsp() {
    const connectSrc = collectAllowedConnectSrc()
    const directives = [...PROD_CSP_BASE_DIRECTIVES, `connect-src ${connectSrc.join(' ')}`]
    return directives.join('; ')
}

function resolveUiLanguage() {
    if (runtimeUiLanguageOverride) return runtimeUiLanguageOverride
    const forced = String(process.env.BOOKSPACE_UI_LANG ?? '')
        .toLowerCase()
        .trim()
    if (forced.startsWith('ko')) return 'ko'
    if (forced.startsWith('en')) return 'en'
    return app.getLocale().toLowerCase().startsWith('ko') ? 'ko' : 'en'
}

function getUiLocale() {
    return resolveUiLocale(resolveUiLanguage())
}

function isSupportedBookPath(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase()
    return ALLOWED_FILE_EXTENSIONS.has(ext)
}

function isSupportedReadablePath(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase()
    return ALLOWED_FILE_EXTENSIONS.has(ext) || ALLOWED_READ_IMAGE_EXTENSIONS.has(ext)
}

function isProjectFile(filePath: string): boolean {
    return path.extname(filePath).toLowerCase() === `.${PROJECT_FILE_EXTENSION}`
}

function addRecentProjectDocument(filePath: string) {
    if (!isProjectFile(filePath)) return
    app.addRecentDocument(filePath)
}

function getLegacyHistoryDir(projectPath: string) {
    return `${projectPath}.history`
}

function getHistoryProjectKey(projectPath: string) {
    return createHash('sha256')
        .update(toResolvedPath(projectPath))
        .digest('hex')
        .slice(0, 32)
}

function getHistoryDir(projectPath: string) {
    return path.join(app.getPath('userData'), HISTORY_STORAGE_DIR_NAME, getHistoryProjectKey(projectPath))
}

async function migrateLegacyHistoryDirIfNeeded(projectPath: string, historyDir: string) {
    const legacyDir = getLegacyHistoryDir(projectPath)
    if (!existsSync(legacyDir)) return
    await fs.mkdir(historyDir, { recursive: true })
    const entries = await fs.readdir(legacyDir, { withFileTypes: true })
    for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(HISTORY_FILE_EXTENSION)) continue
        const sourcePath = path.join(legacyDir, entry.name)
        const targetPath = path.join(historyDir, entry.name)
        if (existsSync(targetPath)) continue
        try {
            await fs.rename(sourcePath, targetPath)
        } catch (error) {
            const record = error as NodeJS.ErrnoException
            if (record.code === 'EXDEV') {
                await fs.copyFile(sourcePath, targetPath)
                await fs.unlink(sourcePath)
                continue
            }
            throw error
        }
    }
    await fs.rmdir(legacyDir).catch(() => undefined)
}

async function resolveHistoryDir(projectPath: string, ensureExists = false) {
    const historyDir = getHistoryDir(projectPath)
    await migrateLegacyHistoryDirIfNeeded(projectPath, historyDir)
    if (ensureExists) {
        await fs.mkdir(historyDir, { recursive: true })
    }
    return historyDir
}

function historyReasonLabel(reason: string) {
    if (reason === 'manual') return 'manual'
    if (reason === 'autosave') return 'autosave'
    if (reason === 'before-restore') return 'before-restore'
    return 'manual'
}

function reasonFromSnapshotId(snapshotId: string) {
    const withoutExt = snapshotId.endsWith(HISTORY_FILE_EXTENSION)
        ? snapshotId.slice(0, -HISTORY_FILE_EXTENSION.length)
        : snapshotId
    const firstDashIndex = withoutExt.indexOf('-')
    const reason = firstDashIndex >= 0 ? withoutExt.slice(firstDashIndex + 1) : 'manual'
    return historyReasonLabel(reason)
}

function sanitizeHistoryReason(reason: string | undefined) {
    const normalized = String(reason ?? 'manual').toLowerCase().trim()
    const cleaned = normalized.replace(/[^a-z0-9_-]/g, '-')
    return historyReasonLabel(cleaned)
}

function timestampId() {
    const iso = new Date().toISOString()
    return iso.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

function validateSnapshotId(snapshotId: string) {
    if (!/^[a-zA-Z0-9._-]+$/.test(snapshotId)) {
        throw new Error(getUiErrorCopy(getUiLocale(), 'invalidHistorySnapshotId'))
    }
    if (!snapshotId.endsWith(HISTORY_FILE_EXTENSION)) {
        throw new Error(getUiErrorCopy(getUiLocale(), 'invalidHistoryFileType'))
    }
}

function toResolvedPath(filePath: string): string {
    return path.resolve(filePath)
}

function approvePath(filePath: string) {
    const resolved = toResolvedPath(filePath)
    if (approvedPaths.has(resolved)) {
        approvedPaths.delete(resolved)
    }
    approvedPaths.add(resolved)
    while (approvedPaths.size > MAX_APPROVED_PATHS) {
        const oldest = approvedPaths.values().next().value
        if (!oldest) break
        approvedPaths.delete(oldest)
    }
}

function assertIpcPathAllowed(filePath: string) {
    if (!isSupportedBookPath(filePath)) {
        throw new Error(getUiErrorCopy(getUiLocale(), 'invalidFileType'))
    }
    const resolved = toResolvedPath(filePath)
    if (!approvedPaths.has(resolved)) {
        throw new Error(getUiErrorCopy(getUiLocale(), 'disallowedPath'))
    }
    return resolved
}

function resolveReadablePath(filePath: string) {
    if (!isSupportedReadablePath(filePath)) {
        throw new Error(getUiErrorCopy(getUiLocale(), 'invalidFileType'))
    }
    const resolved = toResolvedPath(filePath)
    if (!existsSync(resolved)) {
        throw new Error(getUiErrorCopy(getUiLocale(), 'fileNotFound'))
    }
    approvePath(resolved)
    return resolved
}

function isTrustedAppUrl(url: string) {
    if (!url) return false
    if (process.env.NODE_ENV === 'development' && /^https?:\/\/localhost:5173(\/|$)/.test(url)) return true
    try {
        const parsed = new URL(url)
        if (parsed.protocol !== 'file:') return false
        const filePath = path.normalize(decodeURIComponent(parsed.pathname))
        const distDir = resolveRendererDistDir()
        const indexPath = path.join(distDir, 'index.html')
        return filePath === indexPath || filePath.startsWith(`${distDir}${path.sep}`)
    } catch {
        return false
    }
    return false
}

function resolveRendererDistDir() {
    const candidates = [
        path.resolve(path.join(__dirname, '../../dist')),
        path.resolve(path.join(__dirname, '../dist')),
    ]
    for (const candidate of candidates) {
        if (existsSync(path.join(candidate, 'index.html'))) return candidate
    }
    return candidates[0]
}

function consumeQaDialogPath(kind: 'open' | 'save'): string | null {
    if (!qaDialogMode) return null
    const queue = kind === 'open' ? qaOpenDialogQueue : qaSaveDialogQueue
    const trace = (line: string) => {
        if (process.env.QA_E2E_DIALOG_TRACE !== '1' && !qaDialogTraceFile) return
        const text = `[qa-dialog] ${line}\n`
        if (qaDialogTraceFile) {
            try {
                appendFileSync(qaDialogTraceFile, text, { encoding: 'utf-8' })
            } catch {
                // noop
            }
        } else {
            console.log(text.trim())
        }
    }
    trace(`kind=${kind} queueLen=${queue.length} next=${queue[0] ?? '<empty>'}`)
    if (queue.length === 0) return null
    const next = queue.shift() ?? null
    trace(`kind=${kind} consumed=${next ?? '<null>'} remaining=${queue.length}`)
    return next
}

function assertTrustedSender(event: IpcMainInvokeEvent) {
    const senderUrl = event.senderFrame?.url ?? ''
    if (!isTrustedAppUrl(senderUrl)) {
        throw new Error(getUiErrorCopy(getUiLocale(), 'untrustedSender'))
    }
    const activeUrl = mainWindow?.webContents.getURL() ?? ''
    if (activeUrl && senderUrl !== activeUrl) {
        throw new Error(getUiErrorCopy(getUiLocale(), 'inactiveFrameSender'))
    }
}

function isExternalSafeUrl(rawUrl: string) {
    try {
        const parsed = new URL(rawUrl)
        return ['http:', 'https:', 'mailto:', 'tel:'].includes(parsed.protocol)
    } catch {
        return false
    }
}

async function atomicWriteFileUtf8(filePath: string, data: string) {
    const tempPath = `${filePath}.${Date.now()}.${process.pid}.tmp`
    await fs.writeFile(tempPath, data, 'utf-8')
    await fs.rename(tempPath, filePath)
}

async function atomicWriteFileBinary(filePath: string, data: Uint8Array) {
    const tempPath = `${filePath}.${Date.now()}.${process.pid}.tmp`
    await fs.writeFile(tempPath, Buffer.from(data))
    await fs.rename(tempPath, filePath)
}

const diagnosticsService = createDiagnosticsService({
    getUserDataPath: () => app.getPath('userData'),
    getAppVersion: () => app.getVersion(),
    platform: process.platform,
})
const copilotRuntimeService = createCopilotRuntimeService()
const codexAppServerService = createCodexAppServerService({
    appVersion: app.getVersion(),
    defaultModel: String(process.env.BOOKSPACE_CODEX_MODEL ?? '').trim() || 'gpt-5.1-codex',
})
const detachCodexStreamListener = codexAppServerService.onStreamEvent((streamEvent) => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.webContents.send('copilot:stream:event', streamEvent)
})

const {
    getDiagnosticsDir,
    appendErrorReport,
    appendSubscriptionGateAuditLog,
    appendSubscriptionCreditsRefundAuditLog,
    appendCopilotRequestAuditLog,
    appendCopilotChatAuditLog,
} = diagnosticsService

const {
    buildStubCopilotEnvelope,
    parseJsonObject,
    buildDirectRewriteEnvelope,
    runDirectCompletion,
} = copilotRuntimeService

async function runAppServerCompletion(
    request: CopilotAppServerChatRequest,
): Promise<CopilotAppServerChatResponse> {
    try {
        const prompt = String(request?.prompt ?? '').trim()
        const contextHint = String(request?.contextHint ?? '').trim()
        if (!prompt) {
            return {
                ok: false,
                error: 'prompt is required',
            }
        }
        const threadKey =
            String(request?.threadKey ?? '').trim() || `copilot:${resolveActiveUserId()}:chat`
        const requestedThreadId = String(request?.threadId ?? '').trim()
        if (requestedThreadId) {
            await codexAppServerService.ensureThreadFromExistingId(threadKey, requestedThreadId)
        }
        const modelClass =
            request?.modelClass === 'command_generate' ? 'command_generate' : 'chat_simple'
        const outputSchema =
            request?.outputSchema && typeof request.outputSchema === 'object'
                ? request.outputSchema
                : undefined
        const result = await codexAppServerService.runTurnText({
            threadKey,
            prompt: contextHint ? `${contextHint}\n\n${prompt}` : prompt,
            systemPrompt: String(request?.systemPrompt ?? '').trim() || undefined,
            modelClass,
            outputSchema,
            streamEnabled: request?.streamEvents !== false,
            operationKey: threadKey,
        })
        return {
            ok: true,
            text: result.text,
            threadId: result.threadId,
            turnId: result.turnId,
            turnStatus: 'completed',
            tokenUsage: result.tokenUsage,
        }
    } catch (error) {
        const metadata = readTurnErrorMetadata(error)
        return {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
            threadId: metadata.threadId,
            turnId: metadata.turnId,
            turnStatus: metadata.turnStatus,
        }
    }
}

async function runAppServerSteer(
    request: CopilotAppServerSteerRequest,
): Promise<CopilotAppServerSteerResponse> {
    const threadKey = String(request?.threadKey ?? '').trim()
    const prompt = String(request?.prompt ?? '').trim()
    if (!threadKey) {
        return {
            ok: false,
            accepted: false,
            error: 'threadKey is required',
        }
    }
    if (!prompt) {
        return {
            ok: false,
            accepted: false,
            error: 'prompt is required',
        }
    }
    try {
        const result = await codexAppServerService.steerTurnByOperationKey(
            threadKey,
            prompt,
            String(request?.expectedTurnId ?? '').trim() || undefined,
        )
        return {
            ok: true,
            accepted: true,
            threadId: result.threadId,
            turnId: result.turnId,
        }
    } catch (error) {
        return {
            ok: false,
            accepted: false,
            error: error instanceof Error ? error.message : String(error),
        }
    }
}

async function interruptAppServerTurn(
    request: CopilotAppServerInterruptRequest,
): Promise<CopilotAppServerInterruptResponse> {
    const threadKey = String(request?.threadKey ?? '').trim()
    if (!threadKey) {
        return {
            ok: false,
            interrupted: false,
            error: 'threadKey is required',
        }
    }
    try {
        const interrupted = await codexAppServerService.interruptTurnByOperationKey(threadKey)
        return {
            ok: true,
            interrupted,
        }
    } catch (error) {
        return {
            ok: false,
            interrupted: false,
            error: error instanceof Error ? error.message : String(error),
        }
    }
}

function normalizeCopilotRuntimeMode(value: unknown): CopilotRuntimeMode {
    const raw = String(value ?? '').trim().toLowerCase()
    if (raw === 'http') return 'http'
    if (raw === 'direct') return 'direct'
    if (raw === 'appserver') return 'appserver'
    return 'ipc'
}

function normalizeRuntimeConfigText(value: unknown): string {
    return String(value ?? '').trim()
}

function normalizeLocalCopilotRuntimeConfigState(
    raw: Partial<LocalCopilotRuntimeConfigState> | null | undefined,
): LocalCopilotRuntimeConfigState {
    return {
        mode: normalizeCopilotRuntimeMode(raw?.mode),
        httpBaseUrl: normalizeRuntimeConfigText(raw?.httpBaseUrl),
        directBaseUrl: normalizeRuntimeConfigText(raw?.directBaseUrl),
        directModel: normalizeRuntimeConfigText(raw?.directModel),
        directApiKey: normalizeRuntimeConfigText(raw?.directApiKey),
    }
}

function shouldPreferEnvDirectRuntime(
    stored: LocalCopilotRuntimeConfigState,
    envDefault: LocalCopilotRuntimeConfigState,
): boolean {
    if (envDefault.mode !== 'direct') return false
    if (stored.mode === 'direct' && stored.directApiKey) return false
    if (stored.mode === 'http' && stored.httpBaseUrl) return false
    if (stored.directApiKey) return false
    return stored.mode === 'appserver' || stored.mode === 'ipc' || (stored.mode === 'direct' && !stored.directApiKey)
}

let copilotRuntimeConfigState: LocalCopilotRuntimeConfigState = {
    ...DEFAULT_COPILOT_RUNTIME_CONFIG_STATE,
}
let copilotRuntimeConfigLoaded = false
let copilotRuntimeConfigLoadPromise: Promise<void> | null = null

function getCopilotRuntimeConfigPath() {
    return path.join(app.getPath('userData'), COPILOT_RUNTIME_CONFIG_FILE)
}

function buildCopilotRuntimeConfigSnapshot(): CopilotRuntimeConfigSnapshot {
    return {
        mode: copilotRuntimeConfigState.mode,
        httpBaseUrl: copilotRuntimeConfigState.httpBaseUrl,
        directBaseUrl: copilotRuntimeConfigState.directBaseUrl,
        directModel: copilotRuntimeConfigState.directModel,
        hasDirectApiKey: Boolean(copilotRuntimeConfigState.directApiKey),
    }
}

async function loadCopilotRuntimeConfigStateFromDisk() {
    const configPath = getCopilotRuntimeConfigPath()
    if (!existsSync(configPath)) {
        copilotRuntimeConfigState = { ...DEFAULT_COPILOT_RUNTIME_CONFIG_STATE }
        copilotRuntimeConfigLoaded = true
        return
    }
    try {
        const raw = await fs.readFile(configPath, 'utf-8')
        const parsed = JSON.parse(raw) as Partial<LocalCopilotRuntimeConfigState>
        const normalized = normalizeLocalCopilotRuntimeConfigState(parsed)
        const envDefault = buildDefaultCopilotRuntimeConfigState()
        copilotRuntimeConfigState =
            shouldPreferEnvDirectRuntime(normalized, envDefault)
                ? { ...envDefault }
                : normalized
    } catch {
        copilotRuntimeConfigState = { ...DEFAULT_COPILOT_RUNTIME_CONFIG_STATE }
    }
    copilotRuntimeConfigLoaded = true
}

async function ensureCopilotRuntimeConfigLoaded() {
    if (copilotRuntimeConfigLoaded) return
    if (!copilotRuntimeConfigLoadPromise) {
        copilotRuntimeConfigLoadPromise = loadCopilotRuntimeConfigStateFromDisk().finally(() => {
            copilotRuntimeConfigLoadPromise = null
        })
    }
    await copilotRuntimeConfigLoadPromise
}

async function persistCopilotRuntimeConfigState() {
    const configPath = getCopilotRuntimeConfigPath()
    await fs.mkdir(path.dirname(configPath), { recursive: true })
    await atomicWriteFileUtf8(configPath, JSON.stringify(copilotRuntimeConfigState, null, 2))
}

async function getCopilotRuntimeConfigSnapshot(): Promise<CopilotRuntimeConfigSnapshot> {
    await ensureCopilotRuntimeConfigLoaded()
    return buildCopilotRuntimeConfigSnapshot()
}

async function getCopilotRuntimeConfigState(): Promise<LocalCopilotRuntimeConfigState> {
    await ensureCopilotRuntimeConfigLoaded()
    return { ...copilotRuntimeConfigState }
}

async function setCopilotRuntimeConfig(
    request: CopilotRuntimeConfigSetRequest,
): Promise<CopilotRuntimeConfigSnapshot> {
    await ensureCopilotRuntimeConfigLoaded()
    const next: LocalCopilotRuntimeConfigState = {
        mode: normalizeCopilotRuntimeMode(request?.mode),
        httpBaseUrl: normalizeRuntimeConfigText(request?.httpBaseUrl),
        directBaseUrl: normalizeRuntimeConfigText(request?.directBaseUrl),
        directModel: normalizeRuntimeConfigText(request?.directModel),
        directApiKey: copilotRuntimeConfigState.directApiKey,
    }
    if (request?.clearDirectApiKey) {
        next.directApiKey = ''
    } else if (request?.directApiKey !== undefined) {
        next.directApiKey = normalizeRuntimeConfigText(request.directApiKey)
    }
    copilotRuntimeConfigState = next
    await persistCopilotRuntimeConfigState()
    return buildCopilotRuntimeConfigSnapshot()
}

interface LocalAuthSessionState {
    user: AuthUserProfile | null
    updatedAt: string
}

let authSessionState: LocalAuthSessionState = {
    user: null,
    updatedAt: new Date(0).toISOString(),
}

interface SubscriptionRuntimeEntry {
    runtime: SubscriptionGateRuntime
    lastAccessMs: number
}

const subscriptionRuntimeByUserId = new Map<string, SubscriptionRuntimeEntry>()

function getAuthSessionPath() {
    return path.join(app.getPath('userData'), AUTH_SESSION_FILE)
}

function buildAuthSessionSnapshot(): AuthSessionSnapshot {
    return {
        user: authSessionState.user,
        isAuthenticated: Boolean(authSessionState.user),
        fetchedAt: new Date().toISOString(),
    }
}

async function loadAuthSessionState() {
    if (process.env.NODE_ENV !== 'development') {
        authSessionState = {
            user: null,
            updatedAt: new Date(0).toISOString(),
        }
        return
    }
    const sessionPath = getAuthSessionPath()
    if (!existsSync(sessionPath)) {
        authSessionState = {
            user: null,
            updatedAt: new Date(0).toISOString(),
        }
        return
    }
    try {
        const raw = await fs.readFile(sessionPath, 'utf-8')
        const parsed = JSON.parse(raw) as Record<string, unknown>
        authSessionState = {
            user: normalizeAuthUserProfile(parsed.user),
            updatedAt: String(parsed.updatedAt ?? '').trim() || new Date().toISOString(),
        }
    } catch {
        authSessionState = {
            user: null,
            updatedAt: new Date(0).toISOString(),
        }
    }
}

async function persistAuthSessionState() {
    if (process.env.NODE_ENV !== 'development') return
    const sessionPath = getAuthSessionPath()
    await fs.mkdir(path.dirname(sessionPath), { recursive: true })
    await atomicWriteFileUtf8(sessionPath, JSON.stringify(authSessionState, null, 2))
}

function resolveActiveUserId(): string {
    return authSessionState.user?.userId ?? 'guest-local'
}

function createInitialEntitlementsSnapshot() {
    return {
        plan: resolveInitialSubscriptionPlan(),
        aiCreditsRemaining: resolveInitialAiCredits(),
    }
}

function pruneSubscriptionRuntimeCache(nowMs: number) {
    for (const [userId, entry] of subscriptionRuntimeByUserId.entries()) {
        if (nowMs - entry.lastAccessMs > SUBSCRIPTION_RUNTIME_IDLE_TTL_MS) {
            subscriptionRuntimeByUserId.delete(userId)
        }
    }

    while (subscriptionRuntimeByUserId.size > MAX_SUBSCRIPTION_RUNTIME_USERS) {
        let oldestUserId: string | null = null
        let oldestAccess = Number.POSITIVE_INFINITY
        for (const [userId, entry] of subscriptionRuntimeByUserId.entries()) {
            if (entry.lastAccessMs < oldestAccess) {
                oldestAccess = entry.lastAccessMs
                oldestUserId = userId
            }
        }
        if (!oldestUserId) break
        subscriptionRuntimeByUserId.delete(oldestUserId)
    }
}

function getSubscriptionRuntimeForUser(userId: string): SubscriptionGateRuntime {
    const nowMs = Date.now()
    pruneSubscriptionRuntimeCache(nowMs)
    const existing = subscriptionRuntimeByUserId.get(userId)
    if (existing) {
        existing.lastAccessMs = nowMs
        return existing.runtime
    }
    const runtime = new SubscriptionGateRuntime(createInitialEntitlementsSnapshot())
    subscriptionRuntimeByUserId.set(userId, {
        runtime,
        lastAccessMs: nowMs,
    })
    return runtime
}

function getActiveSubscriptionRuntime(): SubscriptionGateRuntime {
    return getSubscriptionRuntimeForUser(resolveActiveUserId())
}

async function pruneHistorySnapshots(historyDir: string) {
    const entries = await fs.readdir(historyDir, { withFileTypes: true })
    const nowMs = Date.now()
    const snapshots = await Promise.all(
        entries
            .filter((entry) => entry.isFile() && entry.name.endsWith(HISTORY_FILE_EXTENSION))
            .map(async (entry) => {
                const fullPath = path.join(historyDir, entry.name)
                const stat = await fs.stat(fullPath)
                return {
                    name: entry.name,
                    fullPath,
                    mtimeMs: stat.mtimeMs,
                }
            }),
    )
    const staleByAge = snapshots.filter((item) => nowMs - item.mtimeMs > MAX_HISTORY_RETENTION_MS)
    await Promise.all(staleByAge.map((item) => fs.unlink(item.fullPath).catch(() => undefined)))

    snapshots.sort((a, b) => b.mtimeMs - a.mtimeMs)
    const freshSnapshots = snapshots.filter((item) => nowMs - item.mtimeMs <= MAX_HISTORY_RETENTION_MS)
    const stale = freshSnapshots.slice(MAX_HISTORY_SNAPSHOTS)
    await Promise.all(stale.map((item) => fs.unlink(item.fullPath).catch(() => undefined)))
}

function findOpenableFileArg(args: string[]): string | null {
    for (const raw of args) {
        const candidate = normalizeCliPath(raw)
        if (!isSupportedBookPath(candidate)) continue
        if (existsSync(candidate)) {
            approvePath(candidate)
            return candidate
        }
    }
    return null
}

function createWindow() {
    const isDevelopment = process.env.NODE_ENV === 'development'
    const win = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1000,
        minHeight: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
        titleBarStyle: 'hiddenInset',
        backgroundColor: '#1a1a1a',
    })

    if (isDevelopment) {
        win.loadURL('http://localhost:5173')
        win.webContents.openDevTools()
    } else {
        win.loadFile(path.join(resolveRendererDistDir(), 'index.html'))
    }

    if (!isDevelopment) {
        win.webContents.on('before-input-event', (event, input) => {
            const isReloadCombo =
                (input.meta || input.control) &&
                input.key.toLowerCase() === 'r'
            const isF5 = input.key === 'F5'
            if (isReloadCombo || isF5) {
                event.preventDefault()
            }
        })
    }

    // 창 로드 완료 시 대기 중인 파일이 있으면 렌더러로 전송
    win.webContents.on('did-finish-load', () => {
        if (pendingFile) {
            win.webContents.send('file-opened', pendingFile)
            pendingFile = null
        }
    })

    win.webContents.setWindowOpenHandler(({ url }) => {
        if (isExternalSafeUrl(url)) {
            void shell.openExternal(url)
        }
        return { action: 'deny' }
    })

    win.webContents.on('will-navigate', (event, url) => {
        if (isTrustedAppUrl(url)) return
        event.preventDefault()
        if (isExternalSafeUrl(url)) {
            void shell.openExternal(url)
        }
    })

    win.on('close', (event) => {
        if (isQaE2ePendingQuit()) {
            hasUnsavedChanges = false
            isQuitting = true
            return
        }
        if (isQuitting || !hasUnsavedChanges) return
        event.preventDefault()
        if (isWaitingForCloseSave) return
        const copy = getUnsavedDialogCopy(getUiLocale(), 'quit')
        void dialog
            .showMessageBox(win, {
                type: 'warning',
                buttons: copy.buttons,
                defaultId: 0,
                cancelId: 2,
                title: copy.title,
                message: copy.message,
                detail: copy.detail,
                noLink: true,
            })
            .then(async (result) => {
                if (result.response === 1) {
                    hasUnsavedChanges = false
                    isQuitting = true
                    win.destroy()
                    return
                }
                if (result.response !== 0) return

                isWaitingForCloseSave = true
                win.webContents.send('menu-action', 'save-project')
                const deadline = Date.now() + 5000
                while (Date.now() < deadline) {
                    if (!hasUnsavedChanges) {
                        isQuitting = true
                        win.destroy()
                        return
                    }
                    await new Promise((resolve) => setTimeout(resolve, 100))
                }
            })
            .finally(() => {
                if (!isQuitting) {
                    isWaitingForCloseSave = false
                }
            })
    })

    win.on('closed', () => {
        if (mainWindow === win) {
            mainWindow = null
        }
    })

    mainWindow = win
    emitAutoUpdateStatus()
    rebuildApplicationMenu()
    maybeStartQaE2eAutorun(app, win)
}

function withActiveMainWindow(onReady: (win: BrowserWindow) => void) {
    if (!mainWindow || mainWindow.isDestroyed()) {
        createWindow()
    }
    if (!mainWindow || mainWindow.isDestroyed()) return
    onReady(mainWindow)
}

function emitMenuAction(action: MenuAction) {
    if (action === 'dev-lang-ko') {
        runtimeUiLanguageOverride = 'ko'
        rebuildApplicationMenu()
    } else if (action === 'dev-lang-en') {
        runtimeUiLanguageOverride = 'en'
        rebuildApplicationMenu()
    }
    withActiveMainWindow((win) => {
        win.webContents.send('menu-action', action)
    })
}

function runEditorCommand(command: 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'delete' | 'selectAll') {
    withActiveMainWindow((win) => {
        const wc = win.webContents
        if (command === 'undo') wc.undo()
        else if (command === 'redo') wc.redo()
        else if (command === 'cut') wc.cut()
        else if (command === 'copy') wc.copy()
        else if (command === 'paste') wc.paste()
        else if (command === 'delete') wc.delete()
        else if (command === 'selectAll') wc.selectAll()
    })
}

function runViewCommand(command: 'reload' | 'forceReload' | 'toggleDevTools' | 'resetZoom' | 'zoomIn' | 'zoomOut' | 'toggleFullscreen') {
    withActiveMainWindow((win) => {
        const wc = win.webContents
        if (command === 'reload') wc.reload()
        else if (command === 'forceReload') wc.reloadIgnoringCache()
        else if (command === 'toggleDevTools') {
            if (wc.isDevToolsOpened()) wc.closeDevTools()
            else wc.openDevTools({ mode: 'detach' })
        } else if (command === 'resetZoom') wc.setZoomLevel(0)
        else if (command === 'zoomIn') wc.setZoomLevel(wc.getZoomLevel() + 1)
        else if (command === 'zoomOut') wc.setZoomLevel(wc.getZoomLevel() - 1)
        else if (command === 'toggleFullscreen') win.setFullScreen(!win.isFullScreen())
    })
}

async function openProjectFromDialog() {
    withActiveMainWindow((win) => {
        const isKorean = resolveUiLanguage() === 'ko'
        void dialog
            .showOpenDialog(win, {
                title: isKorean ? '프로젝트 열기' : 'Open Project',
                properties: ['openFile'],
                filters: [{ name: 'BookSpace Project', extensions: [PROJECT_FILE_EXTENSION] }],
            })
            .then((result) => {
                if (result.canceled || result.filePaths.length === 0) return
                const selected = result.filePaths[0]
                if (!selected) return
                approvePath(selected)
                addRecentProjectDocument(selected)
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('file-opened', selected)
                } else {
                    pendingFile = selected
                }
            })
    })
}

function emitAutoUpdateStatus() {
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.webContents.send('app:update:status', autoUpdateState)
}

function setAutoUpdateState(next: Partial<AutoUpdateState>) {
    autoUpdateState = {
        ...autoUpdateState,
        ...next,
        currentVersion: app.getVersion(),
    }
    emitAutoUpdateStatus()
}

function isAutoUpdateSupported() {
    if (process.env.BOOKSPACE_DISABLE_AUTO_UPDATE === '1') return false
    if (process.env.NODE_ENV === 'development') return false
    return app.isPackaged
}

function setupAutoUpdater() {
    if (autoUpdateConfigured) return
    autoUpdateConfigured = true

    if (!isAutoUpdateSupported()) {
        setAutoUpdateState({
            phase: 'unsupported',
            message: null,
        })
        return
    }

    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true
    const updaterFeedUrl = String(process.env.BOOKSPACE_UPDATER_URL ?? '').trim()
    if (updaterFeedUrl) {
        autoUpdater.setFeedURL({
            provider: 'generic',
            url: updaterFeedUrl,
            channel: 'latest',
        })
    }

    autoUpdater.on('checking-for-update', () => {
        setAutoUpdateState({
            phase: 'checking',
            checkedAt: new Date().toISOString(),
            message: null,
            progressPercent: null,
        })
    })

    autoUpdater.on('update-available', (info) => {
        setAutoUpdateState({
            phase: 'available',
            availableVersion: info.version ?? null,
            downloadedVersion: null,
            progressPercent: null,
            message: null,
        })
    })

    autoUpdater.on('update-not-available', () => {
        setAutoUpdateState({
            phase: 'not-available',
            availableVersion: null,
            downloadedVersion: null,
            progressPercent: null,
            message: null,
        })
    })

    autoUpdater.on('download-progress', (progress) => {
        setAutoUpdateState({
            phase: 'downloading',
            progressPercent: progress.percent,
            message: null,
        })
    })

    autoUpdater.on('update-downloaded', (info) => {
        setAutoUpdateState({
            phase: 'downloaded',
            downloadedVersion: info.version ?? autoUpdateState.availableVersion,
            progressPercent: 100,
            message: null,
        })
    })

    autoUpdater.on('error', (error) => {
        setAutoUpdateState({
            phase: 'error',
            progressPercent: null,
            message: error?.message ?? String(error),
        })
    })

    setAutoUpdateState({
        phase: 'idle',
        message: null,
    })
}

async function checkForAppUpdates() {
    if (!isAutoUpdateSupported()) {
        setAutoUpdateState({ phase: 'unsupported' })
        return autoUpdateState
    }
    try {
        await autoUpdater.checkForUpdates()
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        setAutoUpdateState({
            phase: 'error',
            message,
        })
    }
    return autoUpdateState
}

async function downloadAppUpdate() {
    if (!isAutoUpdateSupported()) {
        setAutoUpdateState({ phase: 'unsupported' })
        return autoUpdateState
    }
    if (autoUpdateState.phase !== 'available' && autoUpdateState.phase !== 'downloading') {
        return autoUpdateState
    }
    try {
        await autoUpdater.downloadUpdate()
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        setAutoUpdateState({
            phase: 'error',
            message,
        })
    }
    return autoUpdateState
}

function installAppUpdate(): AutoUpdateInstallResult {
    if (!isAutoUpdateSupported()) {
        return { success: false, reason: 'unsupported' }
    }
    if (autoUpdateState.phase !== 'downloaded') {
        return { success: false, reason: 'not-ready' }
    }
    if (hasUnsavedChanges) {
        return { success: false, reason: 'dirty-state' }
    }
    isQuitting = true
    autoUpdater.quitAndInstall()
    return { success: true }
}

function scheduleAutoUpdateChecks() {
    if (!isAutoUpdateSupported()) return
    if (autoUpdateStartupTimer) clearTimeout(autoUpdateStartupTimer)
    if (autoUpdateTimer) clearInterval(autoUpdateTimer)

    autoUpdateStartupTimer = setTimeout(() => {
        void checkForAppUpdates()
    }, AUTO_UPDATE_STARTUP_DELAY_MS)
    autoUpdateTimer = setInterval(() => {
        void checkForAppUpdates()
    }, AUTO_UPDATE_INTERVAL_MS)
}

function rebuildApplicationMenu() {
    buildApplicationMenu({
        appName: app.name,
        isDevelopment: process.env.NODE_ENV === 'development',
        isMac: process.platform === 'darwin',
        isKorean: resolveUiLanguage() === 'ko',
        emitMenuAction,
        runEditorCommand,
        runViewCommand,
        openProjectFromDialog,
        openReportIssue: () => {
            void shell.openExternal(HELP_ISSUES_URL)
        },
        openLogFolder: () => {
            void shell.openPath(getDiagnosticsDir())
        },
    })
}

// ─── IPC 핸들러 ───────────────────────────────────────────

registerCoreIpcHandlers({
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
    isQaDialogMode: qaDialogMode,
    isSupportedBookPath,
    approvePath,
    setHasUnsavedChanges: (dirty) => {
        hasUnsavedChanges = dirty
    },
    appendErrorReport,
    getDiagnosticsDir,
    getUnsavedDialogCopy: (context) => getUnsavedDialogCopy(getUiLocale(), context),
    getUiErrorCopy: (key) => getUiErrorCopy(getUiLocale(), key),
})

ipcMain.handle('copilot:runtimeConfig:get', async (event: IpcMainInvokeEvent) => {
    assertTrustedSender(event)
    return getCopilotRuntimeConfigSnapshot()
})

ipcMain.handle(
    'copilot:runtimeConfig:set',
    async (
        event: IpcMainInvokeEvent,
        request: CopilotRuntimeConfigSetRequest,
    ): Promise<CopilotRuntimeConfigSnapshot> => {
        assertTrustedSender(event)
        return setCopilotRuntimeConfig(request)
    },
)

if (!editorOnlyMode) {
    registerAuthIpcHandlers({
        ipcMain,
        assertTrustedSender,
        isDevelopment: process.env.NODE_ENV === 'development',
        buildAuthSessionSnapshot,
        normalizeEmail,
        normalizeDisplayName,
        createGoogleUserId,
        setAuthSessionState: (next) => {
            authSessionState = next
        },
        persistAuthSessionState,
        devGoogleEmail: process.env.BOOKSPACE_DEV_GOOGLE_EMAIL,
        devGoogleName: process.env.BOOKSPACE_DEV_GOOGLE_NAME,
        getUiErrorCopy: (key) => getUiErrorCopy(getUiLocale(), key),
    })

    registerSubscriptionIpcHandlers({
        ipcMain,
        assertTrustedSender,
        isDevelopment: process.env.NODE_ENV === 'development',
        getActiveSubscriptionRuntime,
        resolveActiveUserId,
        normalizeGateCheckRequest,
        normalizeCreditsRefundRequest,
        appendSubscriptionGateAuditLog,
        appendSubscriptionCreditsRefundAuditLog,
        parseSubscriptionPlan,
        getUiErrorCopy: (key) => getUiErrorCopy(getUiLocale(), key),
    })

    registerCopilotIpcHandlers({
        ipcMain,
        assertTrustedSender,
        normalizeCopilotGenerateRequest,
        buildStubCopilotEnvelope,
        validateAiCommandEnvelope,
        runAppServerCompletion,
        runAppServerInterrupt: interruptAppServerTurn,
        runAppServerSteer,
        resolveCopilotIntentPlan,
        parseJsonObject,
        buildDirectRewriteEnvelope,
        runDirectCompletion,
        getCopilotRuntimeConfigState,
        appendCopilotRequestAuditLog,
        appendCopilotChatAuditLog,
        resolveActiveUserId,
        anonymizePromptForAudit,
        buildPromptSignature,
        getUiErrorCopy: (key) => getUiErrorCopy(getUiLocale(), key),
    })
}

registerHistoryIpcHandlers({
    ipcMain,
    assertTrustedSender,
    assertIpcPathAllowed,
    resolveHistoryDir,
    timestampId,
    sanitizeHistoryReason,
    historyFileExtension: HISTORY_FILE_EXTENSION,
    atomicWriteFileUtf8,
    pruneHistorySnapshots,
    existsSync,
    fs,
    path,
    historyReasonLabel,
    validateSnapshotId,
    reasonFromSnapshotId,
    getUiErrorCopy: (key) => getUiErrorCopy(getUiLocale(), key),
})

ipcMain.handle('app:update:getState', (_event: IpcMainInvokeEvent) => {
    assertTrustedSender(_event)
    return autoUpdateState
})

ipcMain.handle('app:update:check', async (_event: IpcMainInvokeEvent) => {
    assertTrustedSender(_event)
    return checkForAppUpdates()
})

ipcMain.handle('app:update:download', async (_event: IpcMainInvokeEvent) => {
    assertTrustedSender(_event)
    return downloadAppUpdate()
})

ipcMain.handle('app:update:install', (_event: IpcMainInvokeEvent) => {
    assertTrustedSender(_event)
    return installAppUpdate()
})

ipcMain.handle('app:consumeStartupOpenFile', (event: IpcMainInvokeEvent) => {
    assertTrustedSender(event)
    const value = startupOpenFile
    startupOpenFile = null
    return value
})

// ──────────────────────────────────────────────────────────

app.on('before-quit', () => {
    detachCodexStreamListener()
    codexAppServerService.dispose()
})

const hasInstanceLock = qaDialogMode ? true : ensureSingleInstanceLock(app)

if (hasInstanceLock) {
    registerWindowLifecycleHandlers({
        app,
        BrowserWindow,
        createWindow,
        withActiveMainWindow,
        findOpenableFileArg,
        isSupportedBookPath,
        approvePath,
        addRecentProjectDocument,
        setPendingFile: (filePath) => {
            pendingFile = filePath
        },
        setIsQuitting: (value) => {
            isQuitting = value
        },
    })

    app.whenReady().then(async () => {
        const startupFile = findOpenableFileArg(process.argv)
        if (startupFile) {
            addRecentProjectDocument(startupFile)
            startupOpenFile = startupFile
        }

        if (process.env.NODE_ENV !== 'development') {
            session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
                const headers = details.responseHeaders ?? {}
                headers['Content-Security-Policy'] = [buildProdCsp()]
                callback({ responseHeaders: headers })
            })
        }
        await loadAuthSessionState()
        await ensureCopilotRuntimeConfigLoaded()
        setupAutoUpdater()
        scheduleAutoUpdateChecks()
        createWindow()
    })
}
