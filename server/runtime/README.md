# Server Runtime Adapter

This folder contains backend adapter code that maps HTTP-layer subscription requests to SQL runtime functions.

Runtime HTTP entrypoint (Node script):
- `scripts/subscription-runtime-api.mjs`
- Runs via `npm run dev:subscription-runtime`
- Uses Supabase REST RPC to call the functions listed below
- Adds PortOne payment revalidation path: `POST /v1/billing/payments/{paymentId}/sync`
- Security defaults:
  - `SUBSCRIPTION_API_OPERATOR_TOKEN` required for manual sync in non-loopback environments
  - In production, runtime startup fails if dev auth stub / plan override endpoint are enabled
  - CORS allowlist via `SUBSCRIPTION_API_CORS_ALLOW_ORIGINS`
  - `X-Forwarded-For` is ignored by default (`SUBSCRIPTION_API_TRUST_PROXY_FORWARDED_FOR=0`)
  - Request rate limiting via `SUBSCRIPTION_API_RATE_LIMIT_*`
  - Dev-only endpoints (`/v1/auth/google/sign-in`, `/v1/subscription/plan/set`) can be disabled
  - Session TTL enforced via `SUBSCRIPTION_API_SESSION_TTL_SECONDS`

## File

1. `subscriptionRuntimeAdapter.ts`
- `runSubscriptionGateCheck(...)`
  - Calls `public.bookspace_gate_check_and_consume(...)`
  - Returns gate decision + `consumedCredits` + `replayed`
- `runSubscriptionCreditsRefund(...)`
  - Calls `public.bookspace_credit_refund(...)`
  - Returns refund response contract (`refunded | not-found | already-refunded`)
2. `billingWebhookAdapter.ts`
- `verifyPortoneWebhookSignature(...)`
  - Verifies PortOne(Standard Webhooks) signature headers (`webhook-id`, `webhook-timestamp`, `webhook-signature`)
  - Uses shared signature verifier module: `shared/billingWebhookSignatures.ts`
- `parsePortoneBillingWebhook(...)`
  - Normalizes PortOne webhook payload to BookSpace subscription payload
- `applyPortoneBillingWebhookEvent(...)`
  - Calls `public.bookspace_apply_billing_webhook(...)`
  - Enforces idempotent event apply (`processed | ignored | duplicate`)
  - Applies only when provider binding already exists (`provider_customer_id` or `provider_subscription_id`)
  - Legacy compatibility exports (`verifyStripeWebhookSignature`, `parseStripeSubscriptionWebhook`, `applyStripeBillingWebhookEvent`) remain available
3. `billingBindingAdapter.ts`
- `registerBillingBinding(...)`
  - Calls `public.bookspace_register_billing_binding(...)`
  - Registers provider binding (`provider_customer_id`/`provider_subscription_id`) for a known user before webhook sync

## Integration sketch

```ts
import { Pool } from 'pg'
import {
  runSubscriptionGateCheck,
  runSubscriptionCreditsRefund,
} from './subscriptionRuntimeAdapter'
import {
  verifyAndParsePortoneBillingWebhook,
  applyPortoneBillingWebhookEvent,
} from './billingWebhookAdapter'
import { registerBillingBinding } from './billingBindingAdapter'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

const gate = await runSubscriptionGateCheck(pool, userId, request)
const refund = await runSubscriptionCreditsRefund(pool, userId, request)
const binding = await registerBillingBinding(pool, {
  provider: 'portone',
  userId,
  providerCustomerId: portoneCustomerId,
  providerSubscriptionId: portoneBillingKey,
})
const webhookEvent = verifyAndParsePortoneBillingWebhook({
  rawBody,
  headers: requestHeaders,
  signingSecret: process.env.PORTONE_WEBHOOK_SECRET_PRIMARY ?? '',
})
const webhookResult = await applyPortoneBillingWebhookEvent(pool, webhookEvent)
```

`Pool` from `pg` is compatible because it exposes `query(text, values)`.
