import type {
    CopilotRuntimeConfigSetRequest,
    CopilotRuntimeConfigSnapshot,
    CopilotRuntimeMode,
} from '../../../shared/copilotIpc'

const LEGACY_RUNTIME_CONFIG_KEY = 'bookspace_copilot_runtime_config'

export interface CopilotRuntimeConfig {
    mode: CopilotRuntimeMode
    httpBaseUrl: string
    directBaseUrl: string
    directApiKey: string
    directModel: string
    hasDirectApiKey: boolean
}

interface LegacyRuntimeConfig {
    mode?: unknown
    httpBaseUrl?: unknown
    directBaseUrl?: unknown
    directApiKey?: unknown
    directModel?: unknown
}

const DEFAULT_CONFIG: CopilotRuntimeConfig = {
    mode: 'appserver',
    httpBaseUrl: '',
    directBaseUrl: '',
    directApiKey: '',
    directModel: '',
    hasDirectApiKey: false,
}

let migrationPromise: Promise<void> | null = null
let migrationChecked = false

function normalizeMode(value: unknown): CopilotRuntimeMode {
    const raw = String(value ?? '').trim().toLowerCase()
    if (raw === 'http') return 'http'
    if (raw === 'direct') return 'direct'
    if (raw === 'appserver') return 'appserver'
    return 'ipc'
}

function normalizeText(value: unknown): string {
    return String(value ?? '').trim()
}

function hasRuntimeConfigBridge() {
    return (
        typeof window !== 'undefined' &&
        typeof window.electronAPI?.getCopilotRuntimeConfig === 'function' &&
        typeof window.electronAPI?.setCopilotRuntimeConfig === 'function'
    )
}

function fromSnapshot(snapshot: CopilotRuntimeConfigSnapshot): CopilotRuntimeConfig {
    return {
        mode: normalizeMode(snapshot.mode),
        httpBaseUrl: normalizeText(snapshot.httpBaseUrl),
        directBaseUrl: normalizeText(snapshot.directBaseUrl),
        directApiKey: '',
        directModel: normalizeText(snapshot.directModel),
        hasDirectApiKey: Boolean(snapshot.hasDirectApiKey),
    }
}

function readLegacyRuntimeConfig(): LegacyRuntimeConfig | null {
    try {
        const raw = localStorage.getItem(LEGACY_RUNTIME_CONFIG_KEY)
        if (!raw) return null
        const parsed = JSON.parse(raw) as LegacyRuntimeConfig
        return parsed && typeof parsed === 'object' ? parsed : null
    } catch {
        return null
    }
}

function clearLegacyRuntimeConfig() {
    try {
        localStorage.removeItem(LEGACY_RUNTIME_CONFIG_KEY)
    } catch {
        // ignore
    }
}

function buildMigrationRequest(legacy: LegacyRuntimeConfig): CopilotRuntimeConfigSetRequest {
    return {
        mode: normalizeMode(legacy.mode),
        httpBaseUrl: normalizeText(legacy.httpBaseUrl),
        directBaseUrl: normalizeText(legacy.directBaseUrl),
        directModel: normalizeText(legacy.directModel),
        directApiKey: normalizeText(legacy.directApiKey) || undefined,
        clearDirectApiKey: false,
    }
}

export async function ensureCopilotRuntimeConfigMigrated(): Promise<void> {
    if (!hasRuntimeConfigBridge()) return
    if (migrationChecked && !migrationPromise) return
    if (!migrationPromise) {
        migrationPromise = (async () => {
            const legacy = readLegacyRuntimeConfig()
            if (!legacy) {
                migrationChecked = true
                return
            }
            try {
                await window.electronAPI.setCopilotRuntimeConfig(buildMigrationRequest(legacy))
                clearLegacyRuntimeConfig()
            } catch (error) {
                console.warn('[Copilot] failed to migrate runtime config from localStorage:', error)
            }
            migrationChecked = true
        })().finally(() => {
            migrationPromise = null
        })
    }
    await migrationPromise
}

export function createDefaultCopilotRuntimeConfig(): CopilotRuntimeConfig {
    return { ...DEFAULT_CONFIG }
}

export async function loadCopilotRuntimeConfig(): Promise<CopilotRuntimeConfig> {
    await ensureCopilotRuntimeConfigMigrated()
    if (!hasRuntimeConfigBridge()) return createDefaultCopilotRuntimeConfig()
    try {
        const snapshot = await window.electronAPI.getCopilotRuntimeConfig()
        return fromSnapshot(snapshot)
    } catch (error) {
        console.warn('[Copilot] failed to load runtime config:', error)
        return createDefaultCopilotRuntimeConfig()
    }
}

export async function saveCopilotRuntimeConfig(
    patch: Partial<CopilotRuntimeConfig>,
    options?: { clearDirectApiKey?: boolean },
): Promise<CopilotRuntimeConfig> {
    await ensureCopilotRuntimeConfigMigrated()
    const current = await loadCopilotRuntimeConfig()
    const nextMode = patch.mode ? normalizeMode(patch.mode) : current.mode
    const nextHttpBaseUrl =
        patch.httpBaseUrl !== undefined ? normalizeText(patch.httpBaseUrl) : current.httpBaseUrl
    const nextDirectBaseUrl =
        patch.directBaseUrl !== undefined ? normalizeText(patch.directBaseUrl) : current.directBaseUrl
    const nextDirectModel =
        patch.directModel !== undefined ? normalizeText(patch.directModel) : current.directModel
    if (!hasRuntimeConfigBridge()) {
        return {
            ...current,
            mode: nextMode,
            httpBaseUrl: nextHttpBaseUrl,
            directBaseUrl: nextDirectBaseUrl,
            directApiKey: '',
            directModel: nextDirectModel,
            hasDirectApiKey: Boolean(normalizeText(patch.directApiKey)),
        }
    }
    const request: CopilotRuntimeConfigSetRequest = {
        mode: nextMode,
        httpBaseUrl: nextHttpBaseUrl,
        directBaseUrl: nextDirectBaseUrl,
        directModel: nextDirectModel,
        directApiKey:
            options?.clearDirectApiKey === true
                ? undefined
                : (normalizeText(patch.directApiKey) || undefined),
        clearDirectApiKey: options?.clearDirectApiKey === true,
    }
    try {
        const snapshot = await window.electronAPI.setCopilotRuntimeConfig(request)
        return fromSnapshot(snapshot)
    } catch (error) {
        console.warn('[Copilot] failed to save runtime config:', error)
        return createDefaultCopilotRuntimeConfig()
    }
}
