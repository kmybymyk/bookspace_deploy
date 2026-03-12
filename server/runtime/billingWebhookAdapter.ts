import type { SubscriptionPlan } from '../../shared/entitlements'
import {
  verifyPortoneWebhookSignature,
  verifyStripeWebhookSignature,
  type PortoneWebhookVerificationInput,
  type StripeWebhookVerificationInput,
} from '../../shared/billingWebhookSignatures'
import type { RuntimeDbClient } from './subscriptionRuntimeAdapter'
export type {
  PortoneWebhookVerificationInput,
  PortoneWebhookVerificationResult,
  StripeWebhookVerificationInput,
} from '../../shared/billingWebhookSignatures'

export type BillingProvider = 'portone' | 'stripe'

export type BillingWebhookApplyStatus = 'processed' | 'ignored' | 'duplicate'

export type BillingSubscriptionStatus = 'active' | 'past_due' | 'canceled'

interface BillingWebhookEventBase {
  provider: BillingProvider
  eventId: string
  eventType: string
  userId: string | null
  plan: SubscriptionPlan | null
  subscriptionStatus: BillingSubscriptionStatus | null
  providerCustomerId: string | null
  providerSubscriptionId: string | null
  periodStartAt: string | null
  periodEndAt: string | null
  aiCreditsMonthly: number | null
  aiCreditsRemaining: number | null
  payload: unknown
}

export interface StripeBillingWebhookEvent extends BillingWebhookEventBase {
  provider: 'stripe'
}

export interface PortoneBillingWebhookEvent extends BillingWebhookEventBase {
  provider: 'portone'
}

export type BillingWebhookEvent = StripeBillingWebhookEvent | PortoneBillingWebhookEvent

export interface BillingWebhookApplyResult {
  eventId: string
  status: BillingWebhookApplyStatus
  applied: boolean
  processedAt: string
}

interface BillingWebhookApplyRow {
  event_id: string
  result: string
  applied: boolean
  processed_at: string | Date
}

const PLAN_VALUES = new Set<SubscriptionPlan>(['FREE', 'PRO_LITE', 'PRO'])
const APPLY_STATUS_VALUES = new Set<BillingWebhookApplyStatus>(['processed', 'ignored', 'duplicate'])
const STRIPE_SUBSCRIPTION_EVENTS = new Set([
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
])
const PORTONE_WEBHOOK_EVENT_TYPES = new Set([
  'Transaction.Ready',
  'Transaction.Paid',
  'Transaction.VirtualAccountIssued',
  'Transaction.PartialCancelled',
  'Transaction.Cancelled',
  'Transaction.Failed',
  'Transaction.PayPending',
  'Transaction.CancelPending',
  'Transaction.DisputeCreated',
  'Transaction.DisputeResolved',
  'BillingKey.Ready',
  'BillingKey.Issued',
  'BillingKey.Failed',
  'BillingKey.Deleted',
  'BillingKey.Updated',
])
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const SQL_APPLY_BILLING_WEBHOOK = `
select
  event_id,
  result,
  applied,
  processed_at
from public.bookspace_apply_billing_webhook(
  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
)
`

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function normalizePlanOrNull(value: unknown): SubscriptionPlan | null {
  const normalized = String(value ?? '')
    .trim()
    .toUpperCase()
  if (PLAN_VALUES.has(normalized as SubscriptionPlan)) {
    return normalized as SubscriptionPlan
  }
  return null
}

function normalizePlan(value: unknown): SubscriptionPlan {
  return normalizePlanOrNull(value) ?? 'FREE'
}

function normalizeSubscriptionStatusOrNull(value: unknown): BillingSubscriptionStatus | null {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
  if (normalized === 'active' || normalized === 'trialing') return 'active'
  if (normalized === 'past_due' || normalized === 'unpaid' || normalized === 'incomplete') {
    return 'past_due'
  }
  if (normalized === 'canceled' || normalized === 'incomplete_expired') return 'canceled'
  return null
}

function normalizeSubscriptionStatus(value: unknown): BillingSubscriptionStatus {
  return normalizeSubscriptionStatusOrNull(value) ?? 'active'
}

function normalizeSubscriptionStatusFromPortoneType(
  eventType: string,
): BillingSubscriptionStatus | null {
  if (
    eventType === 'Transaction.Paid' ||
    eventType === 'BillingKey.Issued' ||
    eventType === 'BillingKey.Updated'
  ) {
    return 'active'
  }
  if (eventType === 'Transaction.Cancelled' || eventType === 'BillingKey.Deleted') return 'canceled'
  if (
    eventType === 'Transaction.Failed' ||
    eventType === 'Transaction.PayPending' ||
    eventType === 'Transaction.CancelPending' ||
    eventType === 'BillingKey.Failed'
  ) {
    return 'past_due'
  }
  return null
}

function normalizeUuidOrNull(value: unknown): string | null {
  const text = String(value ?? '').trim()
  if (!text) return null
  if (!UUID_PATTERN.test(text)) return null
  return text.toLowerCase()
}

function normalizeTextOrNull(value: unknown): string | null {
  const text = String(value ?? '').trim()
  return text || null
}

function normalizeIntegerOrNull(value: unknown): number | null {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  return Math.max(0, Math.floor(parsed))
}

function toIsoFromUnixSeconds(value: unknown): string | null {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  return new Date(Math.floor(parsed) * 1000).toISOString()
}

function toIsoFromDateLike(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return toIsoFromUnixSeconds(value)
  const parsed = Date.parse(String(value))
  if (!Number.isFinite(parsed)) return null
  return new Date(parsed).toISOString()
}

function resolveStripeCustomerId(input: unknown): string | null {
  if (typeof input === 'string') return normalizeTextOrNull(input)
  const asObj = asRecord(input)
  if (!asObj) return null
  return normalizeTextOrNull(asObj.id)
}

function resolveDefaultAiCredits(plan: SubscriptionPlan): number {
  if (plan === 'PRO') return 300
  if (plan === 'PRO_LITE') return 100
  return 0
}

export function parseStripeSubscriptionWebhook(rawBody: string): StripeBillingWebhookEvent {
  const parsed = JSON.parse(rawBody) as Record<string, unknown>
  const eventId = normalizeTextOrNull(parsed.id)
  const eventType = normalizeTextOrNull(parsed.type)
  if (!eventId) throw new Error('stripe event id is required')
  if (!eventType) throw new Error('stripe event type is required')
  if (!STRIPE_SUBSCRIPTION_EVENTS.has(eventType)) {
    throw new Error(`unsupported stripe event type: ${eventType}`)
  }

  const data = asRecord(parsed.data)
  const subscription = asRecord(data?.object)
  if (!subscription) {
    throw new Error('stripe event.data.object is required')
  }

  const metadata = asRecord(subscription.metadata) ?? {}
  const plan = normalizePlan(metadata.bookspace_plan ?? metadata.bookspacePlan)
  const subscriptionStatus = normalizeSubscriptionStatus(subscription.status)
  const userId = normalizeUuidOrNull(metadata.bookspace_user_id ?? metadata.bookspaceUserId)
  const providerCustomerId = resolveStripeCustomerId(subscription.customer)
  const providerSubscriptionId = normalizeTextOrNull(subscription.id)
  const periodStartAt = toIsoFromUnixSeconds(subscription.current_period_start)
  const periodEndAt = toIsoFromUnixSeconds(subscription.current_period_end)
  const aiCreditsMonthly =
    normalizeIntegerOrNull(metadata.bookspace_ai_credits_monthly ?? metadata.bookspaceAiCreditsMonthly) ??
    resolveDefaultAiCredits(plan)
  const aiCreditsRemaining = normalizeIntegerOrNull(
    metadata.bookspace_ai_credits_remaining ?? metadata.bookspaceAiCreditsRemaining,
  )

  return {
    provider: 'stripe',
    eventId,
    eventType,
    userId,
    plan,
    subscriptionStatus,
    providerCustomerId,
    providerSubscriptionId,
    periodStartAt,
    periodEndAt,
    aiCreditsMonthly,
    aiCreditsRemaining,
    payload: parsed,
  }
}

export function parsePortoneBillingWebhook(
  rawBody: string,
  webhookId: string,
): PortoneBillingWebhookEvent {
  const parsed = JSON.parse(rawBody) as Record<string, unknown>
  const eventType = normalizeTextOrNull(parsed.type)
  if (!eventType) throw new Error('portone webhook type is required')
  if (!PORTONE_WEBHOOK_EVENT_TYPES.has(eventType)) {
    // Forward compatibility: unknown event type is treated as ignored downstream.
    // Keep parsing permissive so caller can decide ignore policy.
  }

  const data = asRecord(parsed.data) ?? {}
  const metadata = asRecord(data.metadata) ?? {}

  const plan = normalizePlanOrNull(
    data.plan ??
      metadata.bookspace_plan ??
      metadata.bookspacePlan,
  )
  const statusFromPayload = normalizeSubscriptionStatusOrNull(
    data.subscriptionStatus ?? data.subscription_status,
  )

  const providerCustomerId = normalizeTextOrNull(
    data.customerId ??
      data.customer_id ??
      data.providerCustomerId ??
      data.provider_customer_id,
  )
  const providerSubscriptionId = normalizeTextOrNull(
    data.billingKey ??
      data.billing_key ??
      data.providerSubscriptionId ??
      data.provider_subscription_id ??
      data.subscriptionId,
  )

  const aiCreditsMonthly =
    normalizeIntegerOrNull(
      data.aiCreditsMonthly ??
        data.ai_credits_monthly ??
        metadata.bookspace_ai_credits_monthly ??
        metadata.bookspaceAiCreditsMonthly,
    ) ?? (plan ? resolveDefaultAiCredits(plan) : null)
  const aiCreditsRemaining = normalizeIntegerOrNull(
    data.aiCreditsRemaining ??
      data.ai_credits_remaining ??
      metadata.bookspace_ai_credits_remaining ??
      metadata.bookspaceAiCreditsRemaining,
  )

  return {
    provider: 'portone',
    eventId: normalizeTextOrNull(parsed.id) ?? webhookId,
    eventType,
    userId: normalizeUuidOrNull(
      data.userId ??
        data.user_id ??
        metadata.bookspace_user_id ??
        metadata.bookspaceUserId,
    ),
    plan,
    subscriptionStatus: statusFromPayload ?? normalizeSubscriptionStatusFromPortoneType(eventType),
    providerCustomerId,
    providerSubscriptionId,
    periodStartAt: toIsoFromDateLike(data.periodStartAt ?? data.period_start_at),
    periodEndAt: toIsoFromDateLike(data.periodEndAt ?? data.period_end_at),
    aiCreditsMonthly,
    aiCreditsRemaining,
    payload: parsed,
  }
}

function normalizeApplyStatus(value: string): BillingWebhookApplyStatus {
  if (APPLY_STATUS_VALUES.has(value as BillingWebhookApplyStatus)) {
    return value as BillingWebhookApplyStatus
  }
  return 'ignored'
}

function normalizeIsoTime(value: string | Date): string {
  if (value instanceof Date) return value.toISOString()
  const parsed = Date.parse(String(value ?? ''))
  if (Number.isFinite(parsed)) return new Date(parsed).toISOString()
  return new Date().toISOString()
}

export async function applyBillingWebhookEvent(
  db: RuntimeDbClient,
  event: BillingWebhookEvent,
): Promise<BillingWebhookApplyResult> {
  const result = await db.query<BillingWebhookApplyRow>(SQL_APPLY_BILLING_WEBHOOK, [
    event.provider,
    event.eventId,
    event.eventType,
    event.userId,
    event.plan,
    event.subscriptionStatus,
    event.providerCustomerId,
    event.providerSubscriptionId,
    event.periodStartAt,
    event.periodEndAt,
    event.aiCreditsMonthly,
    event.aiCreditsRemaining,
    JSON.stringify(event.payload ?? {}),
  ])

  const row = result.rows[0]
  if (!row) {
    throw new Error('bookspace_apply_billing_webhook returned no rows')
  }

  return {
    eventId: String(row.event_id ?? event.eventId),
    status: normalizeApplyStatus(String(row.result ?? 'ignored')),
    applied: Boolean(row.applied),
    processedAt: normalizeIsoTime(row.processed_at),
  }
}

export async function applyStripeBillingWebhookEvent(
  db: RuntimeDbClient,
  event: StripeBillingWebhookEvent,
): Promise<BillingWebhookApplyResult> {
  return applyBillingWebhookEvent(db, event)
}

export async function applyPortoneBillingWebhookEvent(
  db: RuntimeDbClient,
  event: PortoneBillingWebhookEvent,
): Promise<BillingWebhookApplyResult> {
  return applyBillingWebhookEvent(db, event)
}

export function verifyAndParseStripeBillingWebhook(
  input: StripeWebhookVerificationInput,
): StripeBillingWebhookEvent {
  verifyStripeWebhookSignature(input)
  return parseStripeSubscriptionWebhook(input.rawBody)
}

export function verifyAndParsePortoneBillingWebhook(
  input: PortoneWebhookVerificationInput,
): PortoneBillingWebhookEvent {
  const verified = verifyPortoneWebhookSignature(input)
  return parsePortoneBillingWebhook(input.rawBody, verified.webhookId)
}
