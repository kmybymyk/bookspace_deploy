import type {
  EntitlementDecisionReason,
  FeatureId,
  SubscriptionPlan,
} from '../../shared/entitlements'
import type {
  SubscriptionCreditsRefundRequest,
  SubscriptionCreditsRefundResponse,
  SubscriptionGateCheckRequest,
  SubscriptionGateCheckResponse,
} from '../../shared/subscriptionIpc'

export interface RuntimeDbQueryResult<Row> {
  rows: Row[]
}

export interface RuntimeDbClient {
  query<Row = unknown>(text: string, values?: unknown[]): Promise<RuntimeDbQueryResult<Row>>
}

export interface SubscriptionGateRuntimeResponse extends SubscriptionGateCheckResponse {
  consumedCredits: number
  replayed: boolean
}

interface SubscriptionGateCheckRow {
  request_id: string
  allowed: boolean
  reason: string
  plan: string
  ai_credits_remaining: number | null
  consumed_credits: number
  replayed: boolean
  checked_at: string | Date
}

interface SubscriptionCreditRefundRow {
  request_id: string
  status: string
  refunded_credits: number
  ai_credits_remaining: number | null
  refunded_at: string | Date
}

const GATE_REASON_VALUES = new Set<EntitlementDecisionReason>([
  'plan-allows-feature',
  'plan-does-not-allow-feature',
  'feature-disabled-by-flag',
  'insufficient-ai-credits',
])

const PLAN_VALUES = new Set<SubscriptionPlan>(['FREE', 'PRO_LITE', 'PRO'])

const REFUND_STATUS_VALUES = new Set<SubscriptionCreditsRefundResponse['status']>([
  'refunded',
  'not-found',
  'already-refunded',
])

function normalizeFeatureId(featureId: string): FeatureId {
  const normalized = featureId.trim().toLowerCase()
  if (!normalized || !/^(core|ai)\.[a-z0-9._-]+$/.test(normalized)) {
    throw new Error(`invalid featureId: ${featureId}`)
  }
  return normalized as FeatureId
}

function normalizeReason(reason: string): EntitlementDecisionReason {
  if (GATE_REASON_VALUES.has(reason as EntitlementDecisionReason)) {
    return reason as EntitlementDecisionReason
  }
  return 'plan-does-not-allow-feature'
}

function normalizePlan(plan: string): SubscriptionPlan {
  if (PLAN_VALUES.has(plan as SubscriptionPlan)) {
    return plan as SubscriptionPlan
  }
  return 'FREE'
}

function normalizeRefundStatus(status: string): SubscriptionCreditsRefundResponse['status'] {
  if (REFUND_STATUS_VALUES.has(status as SubscriptionCreditsRefundResponse['status'])) {
    return status as SubscriptionCreditsRefundResponse['status']
  }
  return 'not-found'
}

function normalizeIsoTime(value: string | Date): string {
  if (value instanceof Date) return value.toISOString()
  const parsed = Date.parse(String(value ?? ''))
  if (Number.isFinite(parsed)) return new Date(parsed).toISOString()
  return new Date().toISOString()
}

function normalizeCredits(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null
  if (!Number.isFinite(value)) return null
  return Math.max(0, Math.floor(value))
}

function normalizeRequiredCredits(request: SubscriptionGateCheckRequest): number {
  const raw = Number(request.requiredCredits ?? 1)
  if (!Number.isFinite(raw)) return 1
  return Math.max(1, Math.floor(raw))
}

const SQL_GATE_CHECK_AND_CONSUME = `
select
  request_id,
  allowed,
  reason,
  plan,
  ai_credits_remaining,
  consumed_credits,
  replayed,
  checked_at
from public.bookspace_gate_check_and_consume($1, $2, $3, $4, $5, $6, $7)
`

const SQL_CREDIT_REFUND = `
select
  request_id,
  status,
  refunded_credits,
  ai_credits_remaining,
  refunded_at
from public.bookspace_credit_refund($1, $2, $3, $4, $5)
`

export async function runSubscriptionGateCheck(
  db: RuntimeDbClient,
  userId: string,
  request: SubscriptionGateCheckRequest,
): Promise<SubscriptionGateRuntimeResponse> {
  const requestId = String(request.requestId ?? '').trim()
  if (!requestId) throw new Error('requestId is required')
  const featureId = normalizeFeatureId(String(request.featureId ?? ''))

  const result = await db.query<SubscriptionGateCheckRow>(SQL_GATE_CHECK_AND_CONSUME, [
    userId,
    requestId,
    featureId,
    normalizeRequiredCredits(request),
    Boolean(request.consumeCredit),
    request.idempotencyKey ?? null,
    '{}',
  ])

  const row = result.rows[0]
  if (!row) {
    throw new Error('bookspace_gate_check_and_consume returned no rows')
  }

  return {
    requestId: String(row.request_id ?? requestId),
    allowed: Boolean(row.allowed),
    reason: normalizeReason(String(row.reason ?? 'plan-does-not-allow-feature')),
    plan: normalizePlan(String(row.plan ?? 'FREE')),
    aiCreditsRemaining: normalizeCredits(row.ai_credits_remaining),
    checkedAt: normalizeIsoTime(row.checked_at),
    consumedCredits: Math.max(0, Math.floor(Number(row.consumed_credits ?? 0) || 0)),
    replayed: Boolean(row.replayed),
  }
}

export async function runSubscriptionCreditsRefund(
  db: RuntimeDbClient,
  userId: string,
  request: SubscriptionCreditsRefundRequest,
): Promise<SubscriptionCreditsRefundResponse> {
  const requestId = String(request.requestId ?? '').trim()
  if (!requestId) throw new Error('requestId is required')
  const idempotencyKey = String(request.idempotencyKey ?? '').trim()
  if (!idempotencyKey) throw new Error('idempotencyKey is required')

  const result = await db.query<SubscriptionCreditRefundRow>(SQL_CREDIT_REFUND, [
    userId,
    requestId,
    idempotencyKey,
    request.reason,
    '{}',
  ])

  const row = result.rows[0]
  if (!row) {
    throw new Error('bookspace_credit_refund returned no rows')
  }

  return {
    requestId: String(row.request_id ?? requestId),
    status: normalizeRefundStatus(String(row.status ?? 'not-found')),
    refundedCredits: Math.max(0, Math.floor(Number(row.refunded_credits ?? 0) || 0)),
    aiCreditsRemaining: normalizeCredits(row.ai_credits_remaining),
    refundedAt: normalizeIsoTime(row.refunded_at),
  }
}
