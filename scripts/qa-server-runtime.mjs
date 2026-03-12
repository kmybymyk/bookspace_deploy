#!/usr/bin/env node
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '..')

const OUTPUT_DIR = path.join(root, 'reports/qa')
const OUTPUT_JSON = path.join(OUTPUT_DIR, 'server-runtime.latest.json')
const OUTPUT_MD = path.join(OUTPUT_DIR, 'server-runtime.latest.md')
const SUBSCRIPTION_ADAPTER_FILE = 'server/runtime/subscriptionRuntimeAdapter.ts'
const BILLING_ADAPTER_FILE = 'server/runtime/billingWebhookAdapter.ts'
const BILLING_BINDING_ADAPTER_FILE = 'server/runtime/billingBindingAdapter.ts'
const BILLING_WEBHOOK_SIGNATURES_FILE = 'shared/billingWebhookSignatures.ts'

const checks = []
const failures = []

function check(ok, name, details) {
  checks.push({ name, ok, details })
  if (!ok) failures.push(`${name}: ${details}`)
}

function exists(relPath) {
  return fs.existsSync(path.join(root, relPath))
}

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), 'utf-8')
}

async function writeReport() {
  await fsp.mkdir(OUTPUT_DIR, { recursive: true })
  const report = {
    createdAt: new Date().toISOString(),
    adapterFiles: [
      SUBSCRIPTION_ADAPTER_FILE,
      BILLING_ADAPTER_FILE,
      BILLING_BINDING_ADAPTER_FILE,
      BILLING_WEBHOOK_SIGNATURES_FILE,
    ],
    checks,
    failures,
  }
  await fsp.writeFile(OUTPUT_JSON, JSON.stringify(report, null, 2), 'utf-8')

  const md = [
    '# QA Server Runtime',
    '',
    `- createdAt: ${report.createdAt}`,
    `- adapterFile: ${SUBSCRIPTION_ADAPTER_FILE}`,
    `- adapterFile: ${BILLING_ADAPTER_FILE}`,
    `- adapterFile: ${BILLING_BINDING_ADAPTER_FILE}`,
    `- adapterFile: ${BILLING_WEBHOOK_SIGNATURES_FILE}`,
    `- checks: ${checks.length}`,
    `- failures: ${failures.length}`,
    '',
    '## Checks',
    ...checks.map((item) => `- ${item.ok ? 'PASS' : 'FAIL'} ${item.name}: ${item.details}`),
    '',
    failures.length ? '## Result: FAIL' : '## Result: PASS',
    ...failures.map((item) => `- ${item}`),
    '',
  ]

  await fsp.writeFile(OUTPUT_MD, md.join('\n'), 'utf-8')
}

async function main() {
  check(exists(SUBSCRIPTION_ADAPTER_FILE), 'server-runtime/file-exists:subscription', `missing ${SUBSCRIPTION_ADAPTER_FILE}`)
  check(exists(BILLING_ADAPTER_FILE), 'server-runtime/file-exists:billing', `missing ${BILLING_ADAPTER_FILE}`)
  check(exists(BILLING_BINDING_ADAPTER_FILE), 'server-runtime/file-exists:billing-binding', `missing ${BILLING_BINDING_ADAPTER_FILE}`)
  check(exists(BILLING_WEBHOOK_SIGNATURES_FILE), 'server-runtime/file-exists:billing-signatures', `missing ${BILLING_WEBHOOK_SIGNATURES_FILE}`)
  if (!exists(SUBSCRIPTION_ADAPTER_FILE) || !exists(BILLING_ADAPTER_FILE) || !exists(BILLING_BINDING_ADAPTER_FILE) || !exists(BILLING_WEBHOOK_SIGNATURES_FILE)) {
    await writeReport()
    process.exit(1)
  }

  const subscriptionAdapter = read(SUBSCRIPTION_ADAPTER_FILE)
  const billingAdapter = read(BILLING_ADAPTER_FILE)
  const billingBindingAdapter = read(BILLING_BINDING_ADAPTER_FILE)
  const billingSignatures = read(BILLING_WEBHOOK_SIGNATURES_FILE)

  check(
    subscriptionAdapter.includes("from '../../shared/subscriptionIpc'") &&
      subscriptionAdapter.includes("from '../../shared/entitlements'"),
    'server-runtime/shared-contract-imports',
    'adapter should import shared subscription contracts',
  )

  check(
    subscriptionAdapter.includes('runSubscriptionGateCheck') &&
      subscriptionAdapter.includes('bookspace_gate_check_and_consume') &&
      subscriptionAdapter.includes('SQL_GATE_CHECK_AND_CONSUME'),
    'server-runtime/gate-function-wiring',
    'gate function SQL wiring missing',
  )

  check(
    subscriptionAdapter.includes('runSubscriptionCreditsRefund') &&
      subscriptionAdapter.includes('bookspace_credit_refund') &&
      subscriptionAdapter.includes('SQL_CREDIT_REFUND'),
    'server-runtime/refund-function-wiring',
    'refund function SQL wiring missing',
  )

  check(
    subscriptionAdapter.includes('normalizeReason') &&
      subscriptionAdapter.includes('normalizePlan') &&
      subscriptionAdapter.includes('normalizeRefundStatus'),
    'server-runtime/response-normalization',
    'response normalization guards missing',
  )

  check(
    subscriptionAdapter.includes('invalid featureId') &&
      subscriptionAdapter.includes('requestId is required') &&
      subscriptionAdapter.includes('idempotencyKey is required'),
    'server-runtime/request-validation',
    'request validation guards missing',
  )

  check(
    billingAdapter.includes('verifyPortoneWebhookSignature') &&
      billingAdapter.includes('parsePortoneBillingWebhook') &&
      billingAdapter.includes('applyPortoneBillingWebhookEvent') &&
      billingAdapter.includes('applyBillingWebhookEvent'),
    'server-runtime/billing-webhook-entrypoints',
    'billing webhook adapter should export verify/parse/apply functions',
  )

  check(
    billingAdapter.includes("from '../../shared/billingWebhookSignatures'") &&
      billingSignatures.includes('createHmac') &&
      billingSignatures.includes('timingSafeEqual') &&
      billingSignatures.includes('portone webhook signature mismatch') &&
      billingSignatures.includes('stripe webhook signature mismatch'),
    'server-runtime/billing-webhook-signature-check',
    'billing webhook adapter should wire shared verifier, and shared verifier should enforce timing-safe signature checks',
  )

  check(
    billingAdapter.includes('bookspace_apply_billing_webhook') &&
      billingAdapter.includes('SQL_APPLY_BILLING_WEBHOOK') &&
      billingAdapter.includes('bookspace_apply_billing_webhook returned no rows'),
    'server-runtime/billing-webhook-sql-wiring',
    'billing webhook adapter SQL wiring missing',
  )

  check(
    billingAdapter.includes('providerCustomerId') &&
      billingAdapter.includes('providerSubscriptionId') &&
      billingAdapter.includes('normalizeUuidOrNull'),
    'server-runtime/billing-webhook-binding-fields',
    'billing webhook adapter should normalize provider binding identifiers and user uuid',
  )

  check(
    billingBindingAdapter.includes('registerBillingBinding') &&
      billingBindingAdapter.includes('bookspace_register_billing_binding') &&
      billingBindingAdapter.includes('SQL_REGISTER_BILLING_BINDING'),
    'server-runtime/billing-binding-sql-wiring',
    'billing binding adapter SQL wiring missing',
  )

  check(
    billingBindingAdapter.includes('providerCustomerId or providerSubscriptionId is required') &&
      billingBindingAdapter.includes('bookspace_register_billing_binding returned no rows') &&
      billingBindingAdapter.includes('invalid billing provider'),
    'server-runtime/billing-binding-validation',
    'billing binding adapter validation guards missing',
  )

  const runtimeHttp = read('scripts/subscription-runtime-api.mjs')
  check(
    runtimeHttp.includes('SUBSCRIPTION_API_TRUST_PROXY_FORWARDED_FOR') &&
      runtimeHttp.includes('RATE_LIMIT_MAX_KEYS') &&
      runtimeHttp.includes('cleanupRateLimitStore'),
    'server-runtime/runtime-http-rate-limit-hardening',
    'runtime http entry should include proxy trust toggle and rate-limit store cleanup',
  )

  await writeReport()

  if (failures.length > 0) {
    console.error('QA server runtime failed:')
    for (const message of failures) console.error(`- ${message}`)
    process.exit(1)
  }

  console.log('QA server runtime passed.')
  console.log(` - ${path.relative(root, OUTPUT_JSON)}`)
  console.log(` - ${path.relative(root, OUTPUT_MD)}`)
}

main().catch((error) => {
  console.error('QA server runtime failed with exception:')
  console.error(error)
  process.exit(1)
})
