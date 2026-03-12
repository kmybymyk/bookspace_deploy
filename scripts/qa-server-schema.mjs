#!/usr/bin/env node
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '..')

const OUTPUT_DIR = path.join(root, 'reports/qa')
const OUTPUT_JSON = path.join(OUTPUT_DIR, 'server-schema.latest.json')
const OUTPUT_MD = path.join(OUTPUT_DIR, 'server-schema.latest.md')
const SQL_FILES = [
  'server/sql/001_subscription_core.sql',
  'server/sql/002_subscription_runtime_functions.sql',
  'server/sql/003_billing_webhook_runtime.sql',
  'server/sql/004_billing_binding_runtime.sql',
]

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

function has(text, pattern) {
  return text.includes(pattern)
}

function hasRegex(text, regex) {
  return regex.test(text)
}

async function writeReport() {
  await fsp.mkdir(OUTPUT_DIR, { recursive: true })
  const report = {
    createdAt: new Date().toISOString(),
    sqlFiles: SQL_FILES,
    checks,
    failures,
  }
  await fsp.writeFile(OUTPUT_JSON, JSON.stringify(report, null, 2), 'utf-8')

  const md = [
    '# QA Server Schema',
    '',
    `- createdAt: ${report.createdAt}`,
    ...SQL_FILES.map((file) => `- sqlFile: ${file}`),
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
  for (const sqlFile of SQL_FILES) {
    check(exists(sqlFile), `server-schema/file-exists:${sqlFile}`, `missing ${sqlFile}`)
  }
  if (!SQL_FILES.every((file) => exists(file))) {
    await writeReport()
    process.exit(1)
  }

  const sqlCore = read('server/sql/001_subscription_core.sql')
  const sqlFunctions = read('server/sql/002_subscription_runtime_functions.sql')
  const sqlWebhook = read('server/sql/003_billing_webhook_runtime.sql')
  const sqlBinding = read('server/sql/004_billing_binding_runtime.sql')

  check(
    has(sqlCore, 'create table if not exists public.subscription_accounts'),
    'server-schema/table-subscription-accounts',
    'subscription_accounts table definition missing',
  )
  check(
    has(sqlCore, 'create table if not exists public.entitlement_overrides'),
    'server-schema/table-entitlement-overrides',
    'entitlement_overrides table definition missing',
  )
  check(
    has(sqlCore, 'create table if not exists public.ai_credit_ledgers'),
    'server-schema/table-ai-credit-ledgers',
    'ai_credit_ledgers table definition missing',
  )
  check(
    has(sqlCore, 'create table if not exists public.gate_audit_logs'),
    'server-schema/table-gate-audit-logs',
    'gate_audit_logs table definition missing',
  )
  check(
    has(sqlCore, 'create table if not exists public.ai_requests'),
    'server-schema/table-ai-requests',
    'ai_requests table definition missing',
  )

  check(
    has(sqlCore, 'create unique index if not exists ai_credit_ledgers_user_idempotency_reason_uniq'),
    'server-schema/index-ledger-idempotency',
    'ledger idempotency unique index missing',
  )
  check(
    has(sqlCore, 'create unique index if not exists ai_requests_user_idempotency_uniq'),
    'server-schema/index-ai-requests-idempotency',
    'ai_requests user/idempotency unique index missing',
  )
  check(
    has(sqlCore, 'create unique index if not exists gate_audit_logs_user_request_feature_uniq'),
    'server-schema/index-gate-audit-uniq',
    'gate_audit unique index missing',
  )

  check(
    has(sqlCore, 'alter table public.subscription_accounts enable row level security;') &&
      has(sqlCore, 'alter table public.entitlement_overrides enable row level security;') &&
      has(sqlCore, 'alter table public.ai_credit_ledgers enable row level security;') &&
      has(sqlCore, 'alter table public.gate_audit_logs enable row level security;') &&
      has(sqlCore, 'alter table public.ai_requests enable row level security;'),
    'server-schema/rls-enabled',
    'RLS enable statements missing for one or more tables',
  )

  check(
    has(sqlCore, 'create policy bookspace_service_all_subscription_accounts') &&
      has(sqlCore, 'create policy bookspace_service_all_entitlement_overrides') &&
      has(sqlCore, 'create policy bookspace_service_all_ai_credit_ledgers') &&
      has(sqlCore, 'create policy bookspace_service_all_gate_audit_logs') &&
      has(sqlCore, 'create policy bookspace_service_all_ai_requests'),
    'server-schema/policy-service-role',
    'service_role policy baseline missing',
  )

  check(
    has(sqlCore, 'create policy bookspace_user_select_subscription_accounts') &&
      has(sqlCore, 'create policy bookspace_user_select_entitlement_overrides') &&
      has(sqlCore, 'create policy bookspace_user_select_ai_credit_ledgers') &&
      has(sqlCore, 'create policy bookspace_user_select_gate_audit_logs') &&
      has(sqlCore, 'create policy bookspace_user_select_ai_requests'),
    'server-schema/policy-user-select',
    'user select policy baseline missing',
  )

  check(
    hasRegex(sqlCore, /create\s+type\s+public\.bookspace_ai_request_status\s+as\s+enum/s),
    'server-schema/enum-ai-request-status',
    'bookspace_ai_request_status enum missing',
  )

  check(
    has(sqlFunctions, 'create or replace function public.bookspace_gate_check_and_consume'),
    'server-schema/function-gate-check-and-consume',
    'bookspace_gate_check_and_consume function missing',
  )
  check(
    has(sqlFunctions, 'create or replace function public.bookspace_credit_refund'),
    'server-schema/function-credit-refund',
    'bookspace_credit_refund function missing',
  )
  check(
    has(sqlFunctions, 'security definer') &&
      has(sqlFunctions, 'for update') &&
      has(sqlFunctions, 'insert into public.ai_credit_ledgers') &&
      has(sqlFunctions, 'insert into public.gate_audit_logs'),
    'server-schema/function-transactional-guards',
    'runtime functions should include lock/idempotency/audit primitives',
  )

  check(
    has(sqlWebhook, 'create table if not exists public.billing_webhook_events'),
    'server-schema/table-billing-webhook-events',
    'billing_webhook_events table definition missing',
  )
  check(
    has(sqlWebhook, 'create unique index if not exists billing_webhook_events_provider_event_uniq'),
    'server-schema/index-billing-webhook-idempotency',
    'billing webhook idempotency unique index missing',
  )
  check(
    has(sqlWebhook, 'create or replace function public.bookspace_apply_billing_webhook'),
    'server-schema/function-apply-billing-webhook',
    'bookspace_apply_billing_webhook function missing',
  )
  check(
    has(sqlWebhook, 'bookspace_service_all_billing_webhook_events') &&
      has(sqlWebhook, "raise exception 'service_role claim is required'") &&
      has(sqlWebhook, 'grant execute on function public.bookspace_apply_billing_webhook'),
    'server-schema/billing-webhook-security-guards',
    'billing webhook function should enforce service-role-only execution',
  )
  check(
    has(sqlWebhook, 'provider binding not found') &&
      has(sqlWebhook, 'bookspace_user_id metadata mismatch with provider binding') &&
      has(sqlWebhook, 'where sa.provider = v_provider') &&
      has(sqlWebhook, 'sa.provider_customer_id = v_provider_customer_id') &&
      has(sqlWebhook, 'sa.provider_subscription_id = v_provider_subscription_id'),
    'server-schema/billing-webhook-binding-guards',
    'billing webhook function should update only pre-bound provider accounts',
  )

  check(
    has(sqlBinding, 'create unique index if not exists subscription_accounts_provider_customer_uniq') &&
      has(sqlBinding, 'create unique index if not exists subscription_accounts_provider_subscription_uniq'),
    'server-schema/index-billing-binding-uniqueness',
    'provider binding unique indexes are missing',
  )

  check(
    has(sqlBinding, 'create or replace function public.bookspace_register_billing_binding') &&
      has(sqlBinding, "raise exception 'provider_customer_id or provider_subscription_id is required'"),
    'server-schema/function-register-billing-binding',
    'bookspace_register_billing_binding function is missing',
  )

  check(
    has(sqlBinding, "raise exception 'service_role claim is required'") &&
      has(sqlBinding, 'grant execute on function public.bookspace_register_billing_binding'),
    'server-schema/billing-binding-security-guards',
    'billing binding registration function should enforce service-role-only execution',
  )

  await writeReport()

  if (failures.length > 0) {
    console.error('QA server schema failed:')
    for (const message of failures) console.error(`- ${message}`)
    process.exit(1)
  }

  console.log('QA server schema passed.')
  console.log(` - ${path.relative(root, OUTPUT_JSON)}`)
  console.log(` - ${path.relative(root, OUTPUT_MD)}`)
}

main().catch((error) => {
  console.error('QA server schema failed with exception:')
  console.error(error)
  process.exit(1)
})
