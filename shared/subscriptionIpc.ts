import type {
  EntitlementDecisionReason,
  EntitlementsSnapshot,
  FeatureId,
  SubscriptionPlan,
} from './entitlements'

export interface SubscriptionEntitlementsResponse {
  snapshot: EntitlementsSnapshot
  fetchedAt: string
}

export interface SubscriptionGateCheckRequest {
  requestId: string
  featureId: FeatureId
  requiredCredits?: number
  consumeCredit?: boolean
  idempotencyKey?: string
}

export interface SubscriptionGateCheckResponse {
  requestId: string
  allowed: boolean
  reason: EntitlementDecisionReason
  plan: SubscriptionPlan
  aiCreditsRemaining: number | null
  checkedAt: string
}

export interface SubscriptionSetPlanResponse {
  success: boolean
  snapshot: EntitlementsSnapshot
  updatedAt: string
}

export type SubscriptionCreditRefundReason =
  | 'execution-failed'
  | 'policy-blocked'
  | 'manual-adjustment'

export interface SubscriptionCreditsRefundRequest {
  requestId: string
  idempotencyKey: string
  reason: SubscriptionCreditRefundReason
}

export interface SubscriptionCreditsRefundResponse {
  requestId: string
  status: 'refunded' | 'not-found' | 'already-refunded'
  refundedCredits: number
  aiCreditsRemaining: number | null
  refundedAt: string
}
