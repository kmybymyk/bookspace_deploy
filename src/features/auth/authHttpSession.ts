const AUTH_HTTP_SESSION_TOKEN_STORAGE_KEY = 'bookspace_http_session_token'
const AUTH_HTTP_SESSION_HEADER = 'X-Bookspace-Session-Token'
const AUTH_HTTP_SESSION_HEADER_LOWER = 'x-bookspace-session-token'
const MOCK_AUTH_HEADER = 'X-Bookspace-Mock-Token'

let cachedSessionToken: string | null = null

function normalizeToken(value: unknown): string | null {
    const token = String(value ?? '').trim()
    return token || null
}

function safeReadTokenFromStorage(): string | null {
    if (typeof window === 'undefined') return null
    try {
        return normalizeToken(window.localStorage.getItem(AUTH_HTTP_SESSION_TOKEN_STORAGE_KEY))
    } catch {
        return null
    }
}

function safeWriteTokenToStorage(token: string | null): void {
    if (typeof window === 'undefined') return
    try {
        if (token) {
            window.localStorage.setItem(AUTH_HTTP_SESSION_TOKEN_STORAGE_KEY, token)
        } else {
            window.localStorage.removeItem(AUTH_HTTP_SESSION_TOKEN_STORAGE_KEY)
        }
    } catch {
        // Ignore storage failures in restricted environments.
    }
}

export function getAuthHttpSessionToken(): string | null {
    if (cachedSessionToken !== null) return cachedSessionToken
    cachedSessionToken = safeReadTokenFromStorage()
    return cachedSessionToken
}

export function setAuthHttpSessionToken(token: string | null): void {
    cachedSessionToken = normalizeToken(token)
    safeWriteTokenToStorage(cachedSessionToken)
}

export function readAuthHttpSessionTokenFromResponse(response: Response): string | null {
    return normalizeToken(
        response.headers.get(AUTH_HTTP_SESSION_HEADER) ??
            response.headers.get(AUTH_HTTP_SESSION_HEADER_LOWER),
    )
}

export function getConfiguredMockAuthToken(): string | null {
    return normalizeToken(import.meta.env.VITE_SUBSCRIPTION_MOCK_AUTH_TOKEN)
}

export function buildAuthHttpHeaders(
    headers: Record<string, string> = {},
): Record<string, string> {
    const nextHeaders: Record<string, string> = { ...headers }
    const sessionToken = getAuthHttpSessionToken()
    if (sessionToken) {
        nextHeaders[AUTH_HTTP_SESSION_HEADER] = sessionToken
    }

    const mockAuthToken = getConfiguredMockAuthToken()
    if (mockAuthToken) {
        nextHeaders[MOCK_AUTH_HEADER] = mockAuthToken
    }

    return nextHeaders
}
