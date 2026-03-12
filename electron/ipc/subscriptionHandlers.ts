import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import type { FeatureId, SubscriptionPlan } from '../../shared/entitlements'
import type { UiErrorKey } from '../uiErrorCopy'
import type {
    SubscriptionCreditRefundReason,
    SubscriptionCreditsRefundRequest,
    SubscriptionCreditsRefundResponse,
    SubscriptionEntitlementsResponse,
    SubscriptionGateCheckRequest,
    SubscriptionGateCheckResponse,
    SubscriptionSetPlanResponse,
} from '../../shared/subscriptionIpc'
import type {
    NormalizedSubscriptionGateCheckRequest,
    SubscriptionGateRuntime,
} from '../../shared/subscriptionGateRuntime'

export interface RegisterSubscriptionIpcHandlersDeps {
    ipcMain: IpcMain
    assertTrustedSender: (event: IpcMainInvokeEvent) => void
    isDevelopment: boolean
    getActiveSubscriptionRuntime: () => SubscriptionGateRuntime
    resolveActiveUserId: () => string
    normalizeGateCheckRequest: (
        input: SubscriptionGateCheckRequest,
        options?: {
            getUiErrorCopy?: (key: UiErrorKey) => string
        },
    ) => NormalizedSubscriptionGateCheckRequest
    normalizeCreditsRefundRequest: (
        input: SubscriptionCreditsRefundRequest,
        options?: {
            getUiErrorCopy?: (key: UiErrorKey) => string
        },
    ) => {
        requestId: string
        idempotencyKey: string
        reason: SubscriptionCreditRefundReason
    }
    appendSubscriptionGateAuditLog: (payload: {
        userId: string
        requestId: string
        featureId: FeatureId
        allowed: boolean
        reason: string
        plan: SubscriptionPlan
        requiredCredits: number
        consumeCredit: boolean
        idempotencyKey?: string
        replayed: boolean
        consumedCredits: number
        aiCreditsRemaining: number | null
    }) => Promise<void>
    appendSubscriptionCreditsRefundAuditLog: (payload: {
        userId: string
        requestId: string
        idempotencyKey: string
        reason: SubscriptionCreditRefundReason
        status: SubscriptionCreditsRefundResponse['status']
        refundedCredits: number
        aiCreditsRemaining: number | null
    }) => Promise<void>
    parseSubscriptionPlan: (value: unknown) => SubscriptionPlan | null
    getUiErrorCopy: (key: UiErrorKey) => string
}

export function registerSubscriptionIpcHandlers(deps: RegisterSubscriptionIpcHandlersDeps) {
    const {
        ipcMain,
        assertTrustedSender,
        isDevelopment,
        getActiveSubscriptionRuntime,
        resolveActiveUserId,
        normalizeGateCheckRequest,
        normalizeCreditsRefundRequest,
        appendSubscriptionGateAuditLog,
        appendSubscriptionCreditsRefundAuditLog,
        parseSubscriptionPlan,
        getUiErrorCopy,
    } = deps

    ipcMain.handle(
        'subscription:entitlements:get',
        async (event): Promise<SubscriptionEntitlementsResponse> => {
            assertTrustedSender(event)
            const runtime = getActiveSubscriptionRuntime()
            return {
                snapshot: runtime.getSnapshot(),
                fetchedAt: new Date().toISOString(),
            }
        },
    )

    ipcMain.handle(
        'subscription:gate:check',
        async (event, request: SubscriptionGateCheckRequest): Promise<SubscriptionGateCheckResponse> => {
            assertTrustedSender(event)
            const userId = resolveActiveUserId()
            const runtime = getActiveSubscriptionRuntime()
            const {
                requestId,
                featureId,
                requiredCredits,
                consumeCredit,
                idempotencyKey,
            } = normalizeGateCheckRequest(request, { getUiErrorCopy })

            const gateResult = runtime.check({
                requestId,
                featureId,
                requiredCredits,
                consumeCredit,
                idempotencyKey,
            })
            const response = gateResult.response

            void appendSubscriptionGateAuditLog({
                userId,
                requestId,
                featureId,
                allowed: response.allowed,
                reason: response.reason,
                plan: response.plan,
                requiredCredits,
                consumeCredit,
                idempotencyKey,
                replayed: gateResult.replayed,
                consumedCredits: gateResult.consumedCredits,
                aiCreditsRemaining: response.aiCreditsRemaining,
            }).catch((error) => {
                console.warn('[Subscription] gate audit log failed:', error)
            })

            return response
        },
    )

    ipcMain.handle(
        'subscription:credits:refund',
        async (event, request: SubscriptionCreditsRefundRequest): Promise<SubscriptionCreditsRefundResponse> => {
            assertTrustedSender(event)
            const userId = resolveActiveUserId()
            const runtime = getActiveSubscriptionRuntime()
            const { requestId, idempotencyKey, reason } = normalizeCreditsRefundRequest(request, { getUiErrorCopy })
            const result = runtime.refundByIdempotencyKey(idempotencyKey)
            const response: SubscriptionCreditsRefundResponse = {
                requestId,
                status: result.status,
                refundedCredits: result.refundedCredits,
                aiCreditsRemaining: result.snapshot.aiCreditsRemaining ?? null,
                refundedAt: new Date().toISOString(),
            }
            void appendSubscriptionCreditsRefundAuditLog({
                userId,
                requestId,
                idempotencyKey,
                reason,
                status: response.status,
                refundedCredits: response.refundedCredits,
                aiCreditsRemaining: response.aiCreditsRemaining,
            }).catch((error) => {
                console.warn('[Subscription] credits refund audit log failed:', error)
            })
            return response
        },
    )

    ipcMain.handle(
        'subscription:plan:set',
        async (event, plan: SubscriptionPlan): Promise<SubscriptionSetPlanResponse> => {
            assertTrustedSender(event)
            if (!isDevelopment) {
                throw new Error(getUiErrorCopy('devOnlyPlanChange'))
            }
            const runtime = getActiveSubscriptionRuntime()

            const parsedPlan = parseSubscriptionPlan(plan)
            if (!parsedPlan) {
                throw new Error(getUiErrorCopy('unsupportedPlan'))
            }

            const currentSnapshot = runtime.getSnapshot()
            const nextAiCredits =
                parsedPlan === 'FREE'
                    ? null
                    : currentSnapshot.aiCreditsRemaining ??
                      (parsedPlan === 'PRO' ? 300 : 100)

            runtime.setSnapshot({
                ...currentSnapshot,
                plan: parsedPlan,
                aiCreditsRemaining: nextAiCredits,
            })
            runtime.resetIdempotencyCache()

            return {
                success: true,
                snapshot: runtime.getSnapshot(),
                updatedAt: new Date().toISOString(),
            }
        },
    )
}
