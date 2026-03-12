import type { AiFeatureId } from '../../../shared/entitlements'
import type {
    SubscriptionCreditRefundReason,
    SubscriptionCreditsRefundResponse,
    SubscriptionGateCheckResponse,
} from '../../../shared/subscriptionIpc'
import { useEntitlementsStore } from './useEntitlementsStore'
import {
    createSubscriptionRequestId,
    subscriptionApi,
} from './subscriptionApi'

const MAX_OPERATION_IDEMPOTENCY_KEYS = 500

interface OperationIdempotencyEntry {
    key: string
    createdAtMs: number
}

const operationIdempotencyKeyMap = new Map<string, OperationIdempotencyEntry>()

function sanitizeIdPart(value: string): string {
    const normalized = value.trim().toLowerCase()
    const safe = normalized.replace(/[^a-z0-9_-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
    return safe || 'op'
}

function keyForOperation(featureId: AiFeatureId, operationId: string): string {
    return `${featureId}:${operationId}`
}

function buildOperationIdempotencyKey(featureId: AiFeatureId, operationId: string): string {
    return `ai-${sanitizeIdPart(featureId)}-${sanitizeIdPart(operationId)}`
}

function getOrCreateOperationIdempotencyKey(featureId: AiFeatureId, operationId: string): string {
    const opKey = keyForOperation(featureId, operationId)
    const existing = operationIdempotencyKeyMap.get(opKey)
    if (existing) {
        return existing.key
    }
    pruneIdempotencyMapIfNeeded()
    const generated = buildOperationIdempotencyKey(featureId, operationId)
    operationIdempotencyKeyMap.set(opKey, {
        key: generated,
        createdAtMs: Date.now(),
    })
    return generated
}

function resolveOperationIdempotencyKey(featureId: AiFeatureId, operationId: string): string {
    const opKey = keyForOperation(featureId, operationId)
    const existing = operationIdempotencyKeyMap.get(opKey)
    return existing?.key ?? buildOperationIdempotencyKey(featureId, operationId)
}

function pruneIdempotencyMapIfNeeded(): void {
    if (operationIdempotencyKeyMap.size < MAX_OPERATION_IDEMPOTENCY_KEYS) {
        return
    }
    const oldest = [...operationIdempotencyKeyMap.entries()].sort(
        (a, b) => a[1].createdAtMs - b[1].createdAtMs,
    )[0]
    if (!oldest) return
    operationIdempotencyKeyMap.delete(oldest[0])
}

function syncSnapshotFromGateResponse(gate: SubscriptionGateCheckResponse): void {
    useEntitlementsStore.getState().updateSnapshot({
        plan: gate.plan,
        aiCreditsRemaining: gate.aiCreditsRemaining,
    })
}

export interface PreviewAiFeatureAccessInput {
    featureId: AiFeatureId
    requiredCredits?: number
}

export interface ReserveAiExecutionCreditsInput {
    featureId: AiFeatureId
    operationId: string
    requiredCredits?: number
}

export interface ReserveAiExecutionCreditsResult {
    gate: SubscriptionGateCheckResponse
    idempotencyKey: string
}

export interface RefundAiExecutionCreditsInput {
    featureId: AiFeatureId
    operationId?: string
    idempotencyKey?: string
    reason?: SubscriptionCreditRefundReason
}

export async function previewAiFeatureAccess(
    input: PreviewAiFeatureAccessInput,
): Promise<SubscriptionGateCheckResponse> {
    const gate = await subscriptionApi.checkSubscriptionGate({
        requestId: createSubscriptionRequestId('ai-preview'),
        featureId: input.featureId,
        requiredCredits: Math.max(1, input.requiredCredits ?? 1),
        consumeCredit: false,
    })
    syncSnapshotFromGateResponse(gate)
    return gate
}

export async function reserveAiExecutionCredits(
    input: ReserveAiExecutionCreditsInput,
): Promise<ReserveAiExecutionCreditsResult> {
    const idempotencyKey = getOrCreateOperationIdempotencyKey(input.featureId, input.operationId)
    const gate = await subscriptionApi.checkSubscriptionGate({
        requestId: createSubscriptionRequestId('ai-run'),
        featureId: input.featureId,
        requiredCredits: Math.max(1, input.requiredCredits ?? 1),
        consumeCredit: true,
        idempotencyKey,
    })
    syncSnapshotFromGateResponse(gate)
    return {
        gate,
        idempotencyKey,
    }
}

export async function refundAiExecutionCredits(
    input: RefundAiExecutionCreditsInput,
): Promise<SubscriptionCreditsRefundResponse> {
    const explicitIdempotencyKey = String(input.idempotencyKey ?? '').trim()
    const resolvedIdempotencyKey =
        explicitIdempotencyKey ||
        (input.operationId
            ? resolveOperationIdempotencyKey(input.featureId, input.operationId)
            : '')

    if (!resolvedIdempotencyKey) {
        throw new Error('환불 요청에는 operationId 또는 idempotencyKey가 필요합니다.')
    }

    const response = await subscriptionApi.refundSubscriptionCredits({
        requestId: createSubscriptionRequestId('ai-refund'),
        idempotencyKey: resolvedIdempotencyKey,
        reason: input.reason ?? 'execution-failed',
    })

    useEntitlementsStore.getState().updateSnapshot({
        aiCreditsRemaining: response.aiCreditsRemaining,
    })

    if (input.operationId) {
        operationIdempotencyKeyMap.delete(keyForOperation(input.featureId, input.operationId))
    }

    return response
}

export function clearAiExecutionIdempotencyCache(): void {
    operationIdempotencyKeyMap.clear()
}
