import type { SubscriptionPlan } from '../../../shared/entitlements'
import type {
    SubscriptionCreditsRefundRequest,
    SubscriptionCreditsRefundResponse,
    SubscriptionEntitlementsResponse,
    SubscriptionGateCheckRequest,
    SubscriptionGateCheckResponse,
    SubscriptionSetPlanResponse,
} from '../../../shared/subscriptionIpc'
import { buildAuthHttpHeaders } from '../auth/authHttpSession'

type SubscriptionApiMode = 'ipc' | 'http'

interface SubscriptionApiClient {
    getEntitlementsSnapshot: () => Promise<SubscriptionEntitlementsResponse>
    checkSubscriptionGate: (
        request: SubscriptionGateCheckRequest,
    ) => Promise<SubscriptionGateCheckResponse>
    refundSubscriptionCredits: (
        request: SubscriptionCreditsRefundRequest,
    ) => Promise<SubscriptionCreditsRefundResponse>
    setSubscriptionPlan: (plan: SubscriptionPlan) => Promise<SubscriptionSetPlanResponse>
}

function resolveSubscriptionApiMode(): SubscriptionApiMode {
    const rawMode = String(import.meta.env.VITE_SUBSCRIPTION_API_MODE ?? 'ipc')
        .toLowerCase()
        .trim()
    return rawMode === 'http' ? 'http' : 'ipc'
}

function resolveHttpFallbackToIpcEnabled(): boolean {
    const defaultValue = import.meta.env.DEV ? '1' : '0'
    const raw = String(import.meta.env.VITE_SUBSCRIPTION_HTTP_FALLBACK_TO_IPC ?? defaultValue)
        .toLowerCase()
        .trim()
    return raw !== '0' && raw !== 'false' && raw !== 'off'
}

function resolveSubscriptionApiBaseUrl(): string {
    const configured = String(import.meta.env.VITE_SUBSCRIPTION_API_BASE_URL ?? '').trim()
    return configured.replace(/\/+$/, '')
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
        throw new Error(`subscription api error (${response.status}): ${details || 'unknown'}`)
    }
    return response.json() as Promise<T>
}

function buildHttpUrl(path: string): string {
    const base = resolveSubscriptionApiBaseUrl()
    if (!base) {
        throw new Error('VITE_SUBSCRIPTION_API_BASE_URL must be set when VITE_SUBSCRIPTION_API_MODE=http')
    }
    return `${base}${path}`
}

const ipcClient: SubscriptionApiClient = {
    getEntitlementsSnapshot: () => window.electronAPI.getEntitlementsSnapshot(),
    checkSubscriptionGate: (request) => window.electronAPI.checkSubscriptionGate(request),
    refundSubscriptionCredits: (request) => window.electronAPI.refundSubscriptionCredits(request),
    setSubscriptionPlan: (plan) => window.electronAPI.setSubscriptionPlan(plan),
}

const httpClient: SubscriptionApiClient = {
    async getEntitlementsSnapshot() {
        const response = await fetch(buildHttpUrl('/v1/subscription/entitlements'), {
            method: 'GET',
            headers: buildAuthHttpHeaders({
                Accept: 'application/json',
            }),
            credentials: 'include',
        })
        return parseHttpJson<SubscriptionEntitlementsResponse>(response)
    },
    async checkSubscriptionGate(request) {
        const response = await fetch(buildHttpUrl('/v1/subscription/gate/check'), {
            method: 'POST',
            headers: buildAuthHttpHeaders({
                'Content-Type': 'application/json',
                Accept: 'application/json',
            }),
            credentials: 'include',
            body: JSON.stringify(request),
        })
        return parseHttpJson<SubscriptionGateCheckResponse>(response)
    },
    async refundSubscriptionCredits(request) {
        const response = await fetch(buildHttpUrl('/v1/subscription/credits/refund'), {
            method: 'POST',
            headers: buildAuthHttpHeaders({
                'Content-Type': 'application/json',
                Accept: 'application/json',
            }),
            credentials: 'include',
            body: JSON.stringify(request),
        })
        return parseHttpJson<SubscriptionCreditsRefundResponse>(response)
    },
    async setSubscriptionPlan(plan) {
        const response = await fetch(buildHttpUrl('/v1/subscription/plan/set'), {
            method: 'POST',
            headers: buildAuthHttpHeaders({
                'Content-Type': 'application/json',
                Accept: 'application/json',
            }),
            credentials: 'include',
            body: JSON.stringify({ plan }),
        })
        return parseHttpJson<SubscriptionSetPlanResponse>(response)
    },
}

const activeMode = resolveSubscriptionApiMode()
const httpFallbackToIpcEnabled = resolveHttpFallbackToIpcEnabled()

function hasIpcBridge(): boolean {
    return typeof window !== 'undefined' && typeof window.electronAPI?.checkSubscriptionGate === 'function'
}

function canFallbackToIpc(): boolean {
    return import.meta.env.DEV && httpFallbackToIpcEnabled && hasIpcBridge()
}

export const subscriptionApi = {
    async getEntitlementsSnapshot() {
        if (activeMode !== 'http') {
            return ipcClient.getEntitlementsSnapshot()
        }
        try {
            return await httpClient.getEntitlementsSnapshot()
        } catch (error) {
            if (!canFallbackToIpc()) throw error
            console.warn('[Subscription] HTTP entitlements failed. Fallback to IPC.', error)
            return ipcClient.getEntitlementsSnapshot()
        }
    },
    async checkSubscriptionGate(request: SubscriptionGateCheckRequest) {
        if (activeMode !== 'http') {
            return ipcClient.checkSubscriptionGate(request)
        }
        try {
            return await httpClient.checkSubscriptionGate(request)
        } catch (error) {
            if (!canFallbackToIpc()) throw error
            console.warn('[Subscription] HTTP gate check failed. Fallback to IPC.', error)
            return ipcClient.checkSubscriptionGate(request)
        }
    },
    async refundSubscriptionCredits(request: SubscriptionCreditsRefundRequest) {
        if (activeMode !== 'http') {
            return ipcClient.refundSubscriptionCredits(request)
        }
        try {
            return await httpClient.refundSubscriptionCredits(request)
        } catch (error) {
            if (!canFallbackToIpc()) throw error
            console.warn('[Subscription] HTTP credits refund failed. Fallback to IPC.', error)
            return ipcClient.refundSubscriptionCredits(request)
        }
    },
    async setSubscriptionPlan(plan: SubscriptionPlan) {
        if (activeMode !== 'http') {
            return ipcClient.setSubscriptionPlan(plan)
        }
        try {
            return await httpClient.setSubscriptionPlan(plan)
        } catch (error) {
            if (!canFallbackToIpc()) throw error
            console.warn('[Subscription] HTTP plan set failed. Fallback to IPC.', error)
            return ipcClient.setSubscriptionPlan(plan)
        }
    },
}

export function createSubscriptionRequestId(prefix = 'req'): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}
