import type { RuntimeDbClient } from './subscriptionRuntimeAdapter'

export type BillingBindingProvider = 'portone' | 'stripe'

export interface BillingBindingRegisterRequest {
  provider: BillingBindingProvider
  userId: string
  providerCustomerId?: string | null
  providerSubscriptionId?: string | null
  context?: unknown
}

export interface BillingBindingRegisterResult {
  userId: string
  provider: BillingBindingProvider
  providerCustomerId: string | null
  providerSubscriptionId: string | null
  registered: boolean
  registeredAt: string
}

interface BillingBindingRegisterRow {
  user_id: string
  provider: string
  provider_customer_id: string | null
  provider_subscription_id: string | null
  registered: boolean
  registered_at: string | Date
}

const SQL_REGISTER_BILLING_BINDING = `
select
  user_id,
  provider,
  provider_customer_id,
  provider_subscription_id,
  registered,
  registered_at
from public.bookspace_register_billing_binding($1, $2, $3, $4, $5)
`

const BILLING_PROVIDER_VALUES = new Set<BillingBindingProvider>(['portone', 'stripe'])
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function normalizeProvider(value: unknown): BillingBindingProvider {
  const provider = String(value ?? '')
    .trim()
    .toLowerCase()
  if (!BILLING_PROVIDER_VALUES.has(provider as BillingBindingProvider)) {
    throw new Error(`invalid billing provider: ${value}`)
  }
  return provider as BillingBindingProvider
}

function normalizeUuid(value: unknown, fieldName: string): string {
  const text = String(value ?? '').trim().toLowerCase()
  if (!text) throw new Error(`${fieldName} is required`)
  if (!UUID_PATTERN.test(text)) throw new Error(`${fieldName} is invalid`)
  return text
}

function normalizeBindingId(value: unknown): string | null {
  const text = String(value ?? '').trim()
  return text || null
}

function normalizeIsoTime(value: string | Date): string {
  if (value instanceof Date) return value.toISOString()
  const parsed = Date.parse(String(value ?? ''))
  if (Number.isFinite(parsed)) return new Date(parsed).toISOString()
  return new Date().toISOString()
}

function normalizeContextJson(value: unknown): string {
  if (value === undefined || value === null) return '{}'
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return '{}'
    try {
      const parsed = JSON.parse(trimmed)
      return JSON.stringify(parsed)
    } catch {
      return JSON.stringify({ raw: trimmed })
    }
  }
  return JSON.stringify(value)
}

export async function registerBillingBinding(
  db: RuntimeDbClient,
  request: BillingBindingRegisterRequest,
): Promise<BillingBindingRegisterResult> {
  const provider = normalizeProvider(request.provider)
  const userId = normalizeUuid(request.userId, 'userId')
  const providerCustomerId = normalizeBindingId(request.providerCustomerId)
  const providerSubscriptionId = normalizeBindingId(request.providerSubscriptionId)

  if (!providerCustomerId && !providerSubscriptionId) {
    throw new Error('providerCustomerId or providerSubscriptionId is required')
  }

  const result = await db.query<BillingBindingRegisterRow>(SQL_REGISTER_BILLING_BINDING, [
    provider,
    userId,
    providerCustomerId,
    providerSubscriptionId,
    normalizeContextJson(request.context),
  ])

  const row = result.rows[0]
  if (!row) {
    throw new Error('bookspace_register_billing_binding returned no rows')
  }

  return {
    userId: normalizeUuid(row.user_id ?? userId, 'userId'),
    provider: normalizeProvider(row.provider ?? provider),
    providerCustomerId: normalizeBindingId(row.provider_customer_id),
    providerSubscriptionId: normalizeBindingId(row.provider_subscription_id),
    registered: Boolean(row.registered),
    registeredAt: normalizeIsoTime(row.registered_at),
  }
}
