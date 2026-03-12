import type {
    AuthGoogleSignInRequest,
    AuthGoogleSignInResponse,
    AuthSessionSnapshot,
    AuthSignOutResponse,
} from '../../../shared/authIpc'
import {
    buildAuthHttpHeaders,
    readAuthHttpSessionTokenFromResponse,
    setAuthHttpSessionToken,
} from './authHttpSession'

type AuthApiMode = 'ipc' | 'http'

interface AuthApiClient {
    getAuthSession: () => Promise<AuthSessionSnapshot>
    signInWithGoogle: (request?: AuthGoogleSignInRequest) => Promise<AuthGoogleSignInResponse>
    signOutAuthSession: () => Promise<AuthSignOutResponse>
}

function resolveAuthApiMode(): AuthApiMode {
    const rawMode = String(import.meta.env.VITE_AUTH_API_MODE ?? 'ipc')
        .toLowerCase()
        .trim()
    return rawMode === 'http' ? 'http' : 'ipc'
}

function resolveAuthHttpFallbackToIpcEnabled(): boolean {
    const defaultValue = import.meta.env.DEV ? '1' : '0'
    const raw = String(import.meta.env.VITE_AUTH_HTTP_FALLBACK_TO_IPC ?? defaultValue)
        .toLowerCase()
        .trim()
    return raw !== '0' && raw !== 'false' && raw !== 'off'
}

function resolveAuthApiBaseUrl(): string {
    const configured = String(import.meta.env.VITE_AUTH_API_BASE_URL ?? '').trim()
    return configured.replace(/\/+$/, '')
}

function buildHttpUrl(path: string): string {
    const base = resolveAuthApiBaseUrl()
    if (!base) {
        throw new Error('VITE_AUTH_API_BASE_URL must be set when VITE_AUTH_API_MODE=http')
    }
    return `${base}${path}`
}

async function parseHttpJson<T>(response: Response): Promise<T> {
    if (!response.ok) {
        let details = ''
        try {
            const body = await response.json() as Record<string, unknown>
            details = String(body?.message ?? body?.error ?? '')
        } catch {
            details = response.statusText
        }
        throw new Error(`auth api error (${response.status}): ${details || 'unknown'}`)
    }
    return response.json() as Promise<T>
}

const ipcClient: AuthApiClient = {
    getAuthSession: () => window.electronAPI.getAuthSession(),
    signInWithGoogle: (request) => window.electronAPI.signInWithGoogle(request),
    signOutAuthSession: () => window.electronAPI.signOutAuthSession(),
}

const httpClient: AuthApiClient = {
    async getAuthSession() {
        const response = await fetch(buildHttpUrl('/v1/auth/session'), {
            method: 'GET',
            headers: buildAuthHttpHeaders({
                Accept: 'application/json',
            }),
            credentials: 'include',
        })
        const payload = await parseHttpJson<AuthSessionSnapshot>(response)
        const sessionToken = readAuthHttpSessionTokenFromResponse(response)
        if (sessionToken) {
            setAuthHttpSessionToken(sessionToken)
        } else if (!payload.isAuthenticated) {
            setAuthHttpSessionToken(null)
        }
        return payload
    },
    async signInWithGoogle(request) {
        const response = await fetch(buildHttpUrl('/v1/auth/google/sign-in'), {
            method: 'POST',
            headers: buildAuthHttpHeaders({
                'Content-Type': 'application/json',
                Accept: 'application/json',
            }),
            credentials: 'include',
            body: JSON.stringify(request ?? {}),
        })
        const payload = await parseHttpJson<AuthGoogleSignInResponse>(response)
        if (payload.success && payload.session.isAuthenticated) {
            const sessionToken = readAuthHttpSessionTokenFromResponse(response)
            setAuthHttpSessionToken(sessionToken)
        } else if (!payload.session.isAuthenticated) {
            setAuthHttpSessionToken(null)
        }
        return payload
    },
    async signOutAuthSession() {
        const response = await fetch(buildHttpUrl('/v1/auth/sign-out'), {
            method: 'POST',
            headers: buildAuthHttpHeaders({
                'Content-Type': 'application/json',
                Accept: 'application/json',
            }),
            credentials: 'include',
            body: JSON.stringify({}),
        })
        const payload = await parseHttpJson<AuthSignOutResponse>(response)
        setAuthHttpSessionToken(null)
        return payload
    },
}

const activeMode = resolveAuthApiMode()
const httpFallbackToIpcEnabled = resolveAuthHttpFallbackToIpcEnabled()

function hasIpcBridge(): boolean {
    return typeof window !== 'undefined' && typeof window.electronAPI?.getAuthSession === 'function'
}

function canFallbackToIpc(): boolean {
    return import.meta.env.DEV && httpFallbackToIpcEnabled && hasIpcBridge()
}

export const authApi = {
    async getAuthSession() {
        if (activeMode !== 'http') {
            return ipcClient.getAuthSession()
        }
        try {
            return await httpClient.getAuthSession()
        } catch (error) {
            if (!canFallbackToIpc()) throw error
            console.warn('[Auth] HTTP session fetch failed. Fallback to IPC.', error)
            return ipcClient.getAuthSession()
        }
    },
    async signInWithGoogle(request?: AuthGoogleSignInRequest) {
        if (activeMode !== 'http') {
            return ipcClient.signInWithGoogle(request)
        }
        try {
            return await httpClient.signInWithGoogle(request)
        } catch (error) {
            if (!canFallbackToIpc()) throw error
            console.warn('[Auth] HTTP Google sign-in failed. Fallback to IPC.', error)
            return ipcClient.signInWithGoogle(request)
        }
    },
    async signOutAuthSession() {
        if (activeMode !== 'http') {
            return ipcClient.signOutAuthSession()
        }
        try {
            return await httpClient.signOutAuthSession()
        } catch (error) {
            if (!canFallbackToIpc()) throw error
            console.warn('[Auth] HTTP sign-out failed. Fallback to IPC.', error)
            return ipcClient.signOutAuthSession()
        }
    },
}
