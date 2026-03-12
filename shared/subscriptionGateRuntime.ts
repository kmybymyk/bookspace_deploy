import {
    checkEntitlement,
    requiresAiCredit,
    type EntitlementsSnapshot,
    type FeatureId,
} from './entitlements'
import type { SubscriptionGateCheckResponse } from './subscriptionIpc'

export const DEFAULT_IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000
export const DEFAULT_IDEMPOTENCY_MAX_ENTRIES = 5000

export interface NormalizedSubscriptionGateCheckRequest {
    requestId: string
    featureId: FeatureId
    requiredCredits: number
    consumeCredit: boolean
    idempotencyKey?: string
}

export interface SubscriptionGateExecutionResult {
    response: SubscriptionGateCheckResponse
    replayed: boolean
    consumedCredits: number
}

export interface SubscriptionCreditsRefundResult {
    status: 'refunded' | 'not-found' | 'already-refunded'
    refundedCredits: number
    snapshot: EntitlementsSnapshot
}

interface CachedGateResult {
    featureId: FeatureId
    requiredCredits: number
    consumedCredits: number
    refunded: boolean
    response: SubscriptionGateCheckResponse
    expiresAtMs: number
}

interface SubscriptionGateRuntimeOptions {
    now?: () => number
    idempotencyTtlMs?: number
    idempotencyMaxEntries?: number
}

function cloneSnapshot(snapshot: EntitlementsSnapshot): EntitlementsSnapshot {
    return {
        ...snapshot,
        enabledFeatures: snapshot.enabledFeatures ? { ...snapshot.enabledFeatures } : undefined,
        disabledFeatures: snapshot.disabledFeatures ? { ...snapshot.disabledFeatures } : undefined,
    }
}

function cloneResponse(response: SubscriptionGateCheckResponse): SubscriptionGateCheckResponse {
    return { ...response }
}

export class SubscriptionGateRuntime {
    private snapshot: EntitlementsSnapshot
    private readonly now: () => number
    private readonly idempotencyTtlMs: number
    private readonly idempotencyMaxEntries: number
    private readonly idempotencyCache = new Map<string, CachedGateResult>()

    constructor(initialSnapshot: EntitlementsSnapshot, options?: SubscriptionGateRuntimeOptions) {
        this.snapshot = cloneSnapshot(initialSnapshot)
        this.now = options?.now ?? Date.now
        this.idempotencyTtlMs = Math.max(1, options?.idempotencyTtlMs ?? DEFAULT_IDEMPOTENCY_TTL_MS)
        this.idempotencyMaxEntries = Math.max(1, options?.idempotencyMaxEntries ?? DEFAULT_IDEMPOTENCY_MAX_ENTRIES)
    }

    getSnapshot(): EntitlementsSnapshot {
        return cloneSnapshot(this.snapshot)
    }

    setSnapshot(snapshot: EntitlementsSnapshot): void {
        this.snapshot = cloneSnapshot(snapshot)
    }

    resetIdempotencyCache(): void {
        this.idempotencyCache.clear()
    }

    check(request: NormalizedSubscriptionGateCheckRequest): SubscriptionGateExecutionResult {
        const nowMs = this.now()
        const checkedAt = new Date(nowMs).toISOString()
        this.pruneExpired(nowMs)

        if (request.consumeCredit && request.idempotencyKey) {
            const cached = this.idempotencyCache.get(request.idempotencyKey)
            if (cached) {
                if (
                    cached.featureId !== request.featureId ||
                    cached.requiredCredits !== request.requiredCredits
                ) {
                    throw new Error('idempotencyKey가 다른 요청 파라미터로 재사용되었습니다.')
                }
                return {
                    response: {
                        ...cloneResponse(cached.response),
                        requestId: request.requestId,
                        checkedAt,
                    },
                    replayed: true,
                    consumedCredits: 0,
                }
            }
        }

        const decision = checkEntitlement(this.snapshot, request.featureId, {
            consumeCredit: request.consumeCredit,
            requiredCredits: request.requiredCredits,
        })

        let consumedCredits = 0

        if (decision.allowed && request.consumeCredit && requiresAiCredit(request.featureId)) {
            const remaining = this.snapshot.aiCreditsRemaining
            if (remaining !== null && remaining !== undefined) {
                consumedCredits = Math.min(remaining, request.requiredCredits)
                this.snapshot = {
                    ...this.snapshot,
                    aiCreditsRemaining: Math.max(0, remaining - request.requiredCredits),
                }
            }
        }

        const response: SubscriptionGateCheckResponse = {
            requestId: request.requestId,
            allowed: decision.allowed,
            reason: decision.reason,
            plan: this.snapshot.plan,
            aiCreditsRemaining: this.snapshot.aiCreditsRemaining ?? null,
            checkedAt,
        }

        if (request.consumeCredit && request.idempotencyKey && response.allowed) {
            this.pruneOverflow()
            this.idempotencyCache.set(request.idempotencyKey, {
                featureId: request.featureId,
                requiredCredits: request.requiredCredits,
                consumedCredits,
                refunded: false,
                response: cloneResponse(response),
                expiresAtMs: nowMs + this.idempotencyTtlMs,
            })
        }

        return {
            response,
            replayed: false,
            consumedCredits,
        }
    }

    refundByIdempotencyKey(idempotencyKey: string): SubscriptionCreditsRefundResult {
        const nowMs = this.now()
        this.pruneExpired(nowMs)

        const entry = this.idempotencyCache.get(idempotencyKey)
        if (!entry) {
            return {
                status: 'not-found',
                refundedCredits: 0,
                snapshot: this.getSnapshot(),
            }
        }

        if (entry.refunded) {
            return {
                status: 'already-refunded',
                refundedCredits: 0,
                snapshot: this.getSnapshot(),
            }
        }

        let refundedCredits = 0
        if (entry.consumedCredits > 0) {
            const remaining = this.snapshot.aiCreditsRemaining
            if (remaining !== null && remaining !== undefined) {
                refundedCredits = entry.consumedCredits
                this.snapshot = {
                    ...this.snapshot,
                    aiCreditsRemaining: remaining + entry.consumedCredits,
                }
            }
        }

        entry.refunded = true
        this.idempotencyCache.set(idempotencyKey, entry)

        return {
            status: 'refunded',
            refundedCredits,
            snapshot: this.getSnapshot(),
        }
    }

    private pruneExpired(nowMs: number): void {
        for (const [key, value] of this.idempotencyCache.entries()) {
            if (value.expiresAtMs <= nowMs) {
                this.idempotencyCache.delete(key)
            }
        }
    }

    private pruneOverflow(): void {
        while (this.idempotencyCache.size >= this.idempotencyMaxEntries) {
            const oldestKey = this.idempotencyCache.keys().next().value
            if (!oldestKey) break
            this.idempotencyCache.delete(oldestKey)
        }
    }
}
