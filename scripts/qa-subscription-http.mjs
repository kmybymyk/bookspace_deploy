#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { createHmac } from 'node:crypto'

const OUTPUT_DIR = path.resolve('reports/qa')
const OUTPUT_JSON = path.join(OUTPUT_DIR, 'subscription-http.latest.json')
const OUTPUT_MD = path.join(OUTPUT_DIR, 'subscription-http.latest.md')
const MOCK_PORTONE_WEBHOOK_SECRET = 'portone_whsec_qa_subscription_http'
const MOCK_AUTH_TOKEN = 'qa-mock-auth-token'
const MOCK_BOUND_PORTONE_CUSTOMER_ID = 'customer_qa_bound_001'
const MOCK_BOUND_PORTONE_SUBSCRIPTION_ID = 'billing-key-qa-bound-001'
const AUTH_SESSION_HEADER = 'x-bookspace-session-token'

const checks = []
const failures = []
const warnings = []

function check(ok, name, details) {
  checks.push({ name, ok, details })
  if (!ok) failures.push(`${name}: ${details}`)
}

function warn(ok, name, details) {
  if (!ok) warnings.push(`${name}: ${details}`)
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function buildPortoneWebhookHeaders(
  rawBody,
  signingSecret,
  {
    webhookId = `wh_qa_${Date.now()}`,
    timestamp = Math.floor(Date.now() / 1000),
  } = {},
) {
  const payload = `${webhookId}.${timestamp}.${rawBody}`
  const digest = createHmac('sha256', signingSecret).update(payload, 'utf8').digest('base64')
  return {
    webhookId,
    headers: {
      'Webhook-Id': webhookId,
      'Webhook-Timestamp': String(timestamp),
      'Webhook-Signature': `v1=${digest}`,
    },
  }
}

function buildAuthHeaders(sessionToken, extraHeaders = {}, includeMockToken = false) {
  const headers = {
    ...extraHeaders,
  }
  if (includeMockToken) {
    headers['X-Bookspace-Mock-Token'] = MOCK_AUTH_TOKEN
  }
  if (sessionToken) {
    headers['X-Bookspace-Session-Token'] = sessionToken
  }
  return headers
}

function buildProtectedJsonHeaders(sessionToken, extraHeaders = {}) {
  return buildAuthHeaders(
    sessionToken,
    {
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
    true,
  )
}

function readHeader(response, headerName) {
  return String(response.headers?.get?.(headerName) ?? '').trim()
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options)
  const text = await response.text()
  let body = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  return {
    ok: response.ok,
    status: response.status,
    headers: response.headers,
    body,
  }
}

async function waitForHealth(baseUrl, timeoutMs = 5000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetchJson(`${baseUrl}/healthz`)
      if (response.ok) return true
    } catch {
      // retry until timeout
    }
    await delay(150)
  }
  return false
}

function createMockServerProcess(port) {
  const output = {
    stdout: [],
    stderr: [],
  }
  const child = spawn(process.execPath, ['scripts/mock-subscription-api.mjs'], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      SUBSCRIPTION_MOCK_PORT: String(port),
      SUBSCRIPTION_MOCK_HOST: '127.0.0.1',
      SUBSCRIPTION_MOCK_PLAN: 'FREE',
      SUBSCRIPTION_MOCK_AI_CREDITS: '10',
      SUBSCRIPTION_MOCK_AUTH_TOKEN: MOCK_AUTH_TOKEN,
      SUBSCRIPTION_MOCK_PORTONE_WEBHOOK_SECRET: MOCK_PORTONE_WEBHOOK_SECRET,
      SUBSCRIPTION_MOCK_STRIPE_WEBHOOK_SECRET: 'whsec_legacy_not_used',
    },
  })
  child.stdout?.on('data', (chunk) => {
    output.stdout.push(String(chunk))
  })
  child.stderr?.on('data', (chunk) => {
    output.stderr.push(String(chunk))
  })
  return { child, output }
}

async function runScenario(baseUrl) {
  const guestSession = await fetchJson(`${baseUrl}/v1/auth/session`, {
    method: 'GET',
    headers: buildAuthHeaders(null, { Accept: 'application/json' }),
  })
  check(guestSession.ok, 'subscription-http/auth-session-guest', `status=${guestSession.status}`)
  check(
    guestSession.body?.isAuthenticated === false,
    'subscription-http/auth-session-guest-state',
    `expected false, got ${guestSession.body?.isAuthenticated}`,
  )

  const signInPrimary = await fetchJson(`${baseUrl}/v1/auth/google/sign-in`, {
    method: 'POST',
    headers: buildProtectedJsonHeaders(null),
    body: JSON.stringify({
      email: 'primary.qa@bookspace.local',
      displayName: 'Primary QA',
    }),
  })
  check(signInPrimary.ok, 'subscription-http/auth-google-sign-in-primary', `status=${signInPrimary.status}`)
  const primarySessionToken = readHeader(signInPrimary, AUTH_SESSION_HEADER)
  check(
    Boolean(primarySessionToken),
    'subscription-http/auth-session-token-primary',
    `expected token in ${AUTH_SESSION_HEADER} response header`,
  )
  const primaryUserId = String(signInPrimary.body?.session?.user?.userId ?? '').trim()
  check(Boolean(primaryUserId), 'subscription-http/auth-user-id-primary', 'primary userId missing from session')

  const primarySession = await fetchJson(`${baseUrl}/v1/auth/session`, {
    method: 'GET',
    headers: buildAuthHeaders(primarySessionToken, { Accept: 'application/json' }),
  })
  check(primarySession.ok, 'subscription-http/auth-session-primary', `status=${primarySession.status}`)
  check(
    primarySession.body?.isAuthenticated === true,
    'subscription-http/auth-session-primary-state',
    `expected true, got ${primarySession.body?.isAuthenticated}`,
  )
  check(
    primarySession.body?.user?.userId === primaryUserId,
    'subscription-http/auth-session-primary-user',
    `expected ${primaryUserId}, got ${primarySession.body?.user?.userId}`,
  )

  const entitlements = await fetchJson(`${baseUrl}/v1/subscription/entitlements`, {
    method: 'GET',
    headers: buildAuthHeaders(primarySessionToken, { Accept: 'application/json' }),
  })
  check(entitlements.ok, 'subscription-http/entitlements', `status=${entitlements.status}`)
  check(entitlements.body?.snapshot?.plan === 'FREE', 'subscription-http/initial-plan', `expected FREE, got ${entitlements.body?.snapshot?.plan}`)

  const planSet = await fetchJson(`${baseUrl}/v1/subscription/plan/set`, {
    method: 'POST',
    headers: buildProtectedJsonHeaders(primarySessionToken),
    body: JSON.stringify({ plan: 'PRO_LITE' }),
  })
  check(planSet.ok, 'subscription-http/plan-set', `status=${planSet.status}`)
  check(planSet.body?.snapshot?.plan === 'PRO_LITE', 'subscription-http/plan-set-result', `expected PRO_LITE, got ${planSet.body?.snapshot?.plan}`)

  const aiNeedsContext = await fetchJson(`${baseUrl}/v1/ai/requests`, {
    method: 'POST',
    headers: buildProtectedJsonHeaders(primarySessionToken),
    body: JSON.stringify({
      requestId: 'qa-sub-http-ai-0',
      intent: 'rewrite_selection',
      baseProjectRevision: 'rev_mock_preview',
      context: {
        chapterId: 'chapter-1',
        selectedText: '',
      },
      preview: true,
    }),
  })
  check(aiNeedsContext.ok, 'subscription-http/ai-needs-context-request', `status=${aiNeedsContext.status}`)
  check(aiNeedsContext.body?.status === 'needs-context', 'subscription-http/ai-needs-context', `expected needs-context, got ${aiNeedsContext.body?.status}`)

  const aiRequest = await fetchJson(`${baseUrl}/v1/ai/requests`, {
    method: 'POST',
    headers: buildProtectedJsonHeaders(primarySessionToken),
    body: JSON.stringify({
      requestId: 'qa-sub-http-ai-1',
      idempotencyKey: 'qa-http-ai-idem-1',
      intent: 'rewrite_selection',
      baseProjectRevision: 'rev_mock_preview',
      context: {
        chapterId: 'chapter-1',
        selectedText: '이 문장을 더 간결하게 바꿔주세요',
        userPrompt: '간결하게',
      },
      preview: true,
    }),
  })
  check(aiRequest.ok, 'subscription-http/ai-request', `status=${aiRequest.status}`)
  check(aiRequest.body?.status === 'ok', 'subscription-http/ai-status', `expected ok, got ${aiRequest.body?.status}`)
  check(aiRequest.body?.envelope?.schemaVersion === '1.1.0', 'subscription-http/ai-schema-version', `expected 1.1.0, got ${aiRequest.body?.envelope?.schemaVersion}`)
  check(Array.isArray(aiRequest.body?.envelope?.commands), 'subscription-http/ai-commands-array', 'expected commands array in envelope')
  check(aiRequest.body?.envelope?.commands?.[0]?.type === 'rewrite_selection', 'subscription-http/ai-command-type', `expected rewrite_selection, got ${aiRequest.body?.envelope?.commands?.[0]?.type}`)

  const gateConsume = await fetchJson(`${baseUrl}/v1/subscription/gate/check`, {
    method: 'POST',
    headers: buildProtectedJsonHeaders(primarySessionToken),
    body: JSON.stringify({
      requestId: 'qa-sub-http-1',
      featureId: 'ai.chat.ask',
      requiredCredits: 1,
      consumeCredit: true,
      idempotencyKey: 'qa-http-idem-1',
    }),
  })
  check(gateConsume.ok, 'subscription-http/gate-consume', `status=${gateConsume.status}`)
  check(gateConsume.body?.allowed === true, 'subscription-http/gate-consume-allowed', `expected true, got ${gateConsume.body?.allowed}`)
  check(gateConsume.body?.aiCreditsRemaining === 9, 'subscription-http/gate-consume-balance', `expected 9, got ${gateConsume.body?.aiCreditsRemaining}`)

  const gateReplay = await fetchJson(`${baseUrl}/v1/subscription/gate/check`, {
    method: 'POST',
    headers: buildProtectedJsonHeaders(primarySessionToken),
    body: JSON.stringify({
      requestId: 'qa-sub-http-2',
      featureId: 'ai.chat.ask',
      requiredCredits: 1,
      consumeCredit: true,
      idempotencyKey: 'qa-http-idem-1',
    }),
  })
  check(gateReplay.ok, 'subscription-http/gate-replay', `status=${gateReplay.status}`)
  check(gateReplay.body?.aiCreditsRemaining === 9, 'subscription-http/gate-replay-balance', `expected 9, got ${gateReplay.body?.aiCreditsRemaining}`)

  const gateConflict = await fetchJson(`${baseUrl}/v1/subscription/gate/check`, {
    method: 'POST',
    headers: buildProtectedJsonHeaders(primarySessionToken),
    body: JSON.stringify({
      requestId: 'qa-sub-http-3',
      featureId: 'ai.chat.ask',
      requiredCredits: 2,
      consumeCredit: true,
      idempotencyKey: 'qa-http-idem-1',
    }),
  })
  check(gateConflict.status === 400, 'subscription-http/gate-conflict', `expected 400, got ${gateConflict.status}`)

  const refund = await fetchJson(`${baseUrl}/v1/subscription/credits/refund`, {
    method: 'POST',
    headers: buildProtectedJsonHeaders(primarySessionToken),
    body: JSON.stringify({
      requestId: 'qa-sub-http-4',
      idempotencyKey: 'qa-http-idem-1',
      reason: 'execution-failed',
    }),
  })
  check(refund.ok, 'subscription-http/refund', `status=${refund.status}`)
  check(refund.body?.status === 'refunded', `subscription-http/refund-status`, `expected refunded, got ${refund.body?.status}`)
  check(refund.body?.refundedCredits === 1, 'subscription-http/refund-amount', `expected 1, got ${refund.body?.refundedCredits}`)
  check(refund.body?.aiCreditsRemaining === 10, 'subscription-http/refund-balance', `expected 10, got ${refund.body?.aiCreditsRemaining}`)

  const refundAgain = await fetchJson(`${baseUrl}/v1/subscription/credits/refund`, {
    method: 'POST',
    headers: buildProtectedJsonHeaders(primarySessionToken),
    body: JSON.stringify({
      requestId: 'qa-sub-http-5',
      idempotencyKey: 'qa-http-idem-1',
      reason: 'execution-failed',
    }),
  })
  check(refundAgain.ok, 'subscription-http/refund-again', `status=${refundAgain.status}`)
  check(refundAgain.body?.status === 'already-refunded', 'subscription-http/refund-again-status', `expected already-refunded, got ${refundAgain.body?.status}`)

  const refundMissing = await fetchJson(`${baseUrl}/v1/subscription/credits/refund`, {
    method: 'POST',
    headers: buildProtectedJsonHeaders(primarySessionToken),
    body: JSON.stringify({
      requestId: 'qa-sub-http-6',
      idempotencyKey: 'qa-http-idem-missing',
      reason: 'execution-failed',
    }),
  })
  check(refundMissing.ok, 'subscription-http/refund-missing', `status=${refundMissing.status}`)
  check(refundMissing.body?.status === 'not-found', 'subscription-http/refund-missing-status', `expected not-found, got ${refundMissing.body?.status}`)

  const gateInsufficient = await fetchJson(`${baseUrl}/v1/subscription/gate/check`, {
    method: 'POST',
    headers: buildProtectedJsonHeaders(primarySessionToken),
    body: JSON.stringify({
      requestId: 'qa-sub-http-7',
      featureId: 'ai.chat.ask',
      requiredCredits: 99,
      consumeCredit: true,
      idempotencyKey: 'qa-http-idem-2',
    }),
  })
  check(gateInsufficient.ok, 'subscription-http/insufficient-request', `status=${gateInsufficient.status}`)
  check(gateInsufficient.body?.allowed === false, 'subscription-http/insufficient-block', `expected false, got ${gateInsufficient.body?.allowed}`)
  check(gateInsufficient.body?.reason === 'insufficient-ai-credits', 'subscription-http/insufficient-reason', `expected insufficient-ai-credits, got ${gateInsufficient.body?.reason}`)

  const signInSecondary = await fetchJson(`${baseUrl}/v1/auth/google/sign-in`, {
    method: 'POST',
    headers: buildProtectedJsonHeaders(null),
    body: JSON.stringify({
      email: 'secondary.qa@bookspace.local',
      displayName: 'Secondary QA',
    }),
  })
  check(signInSecondary.ok, 'subscription-http/auth-google-sign-in-secondary', `status=${signInSecondary.status}`)
  const secondarySessionToken = readHeader(signInSecondary, AUTH_SESSION_HEADER)
  check(
    Boolean(secondarySessionToken),
    'subscription-http/auth-session-token-secondary',
    `expected token in ${AUTH_SESSION_HEADER} response header`,
  )
  const secondaryUserId = String(signInSecondary.body?.session?.user?.userId ?? '').trim()
  check(Boolean(secondaryUserId), 'subscription-http/auth-user-id-secondary', 'secondary userId missing from session')
  check(
    secondaryUserId !== primaryUserId,
    'subscription-http/auth-user-isolated',
    `expected primary/secondary users to differ, got ${primaryUserId} and ${secondaryUserId}`,
  )

  const secondaryEntitlements = await fetchJson(`${baseUrl}/v1/subscription/entitlements`, {
    method: 'GET',
    headers: buildAuthHeaders(secondarySessionToken, { Accept: 'application/json' }),
  })
  check(secondaryEntitlements.ok, 'subscription-http/entitlements-secondary', `status=${secondaryEntitlements.status}`)
  check(
    secondaryEntitlements.body?.snapshot?.plan === 'FREE',
    'subscription-http/entitlements-secondary-plan',
    `expected FREE, got ${secondaryEntitlements.body?.snapshot?.plan}`,
  )

  const primaryEntitlementsAfterSecondary = await fetchJson(`${baseUrl}/v1/subscription/entitlements`, {
    method: 'GET',
    headers: buildAuthHeaders(primarySessionToken, { Accept: 'application/json' }),
  })
  check(
    primaryEntitlementsAfterSecondary.body?.snapshot?.plan === 'PRO_LITE',
    'subscription-http/entitlements-primary-isolated-plan',
    `expected PRO_LITE, got ${primaryEntitlementsAfterSecondary.body?.snapshot?.plan}`,
  )

  const bindingRegister = await fetchJson(`${baseUrl}/v1/billing/bindings/register`, {
    method: 'POST',
    headers: buildProtectedJsonHeaders(primarySessionToken),
    body: JSON.stringify({
      provider: 'portone',
      userId: primaryUserId,
      providerCustomerId: MOCK_BOUND_PORTONE_CUSTOMER_ID,
      providerSubscriptionId: MOCK_BOUND_PORTONE_SUBSCRIPTION_ID,
    }),
  })
  check(bindingRegister.ok, 'subscription-http/billing-binding-register', `status=${bindingRegister.status}`)
  check(
    bindingRegister.body?.registered === true,
    'subscription-http/billing-binding-register-flag',
    `expected true, got ${bindingRegister.body?.registered}`,
  )

  const bindingConflict = await fetchJson(`${baseUrl}/v1/billing/bindings/register`, {
    method: 'POST',
    headers: buildProtectedJsonHeaders(primarySessionToken),
    body: JSON.stringify({
      provider: 'portone',
      userId: secondaryUserId || '0f743509-bc50-4db7-b03b-cfdaf4f3fe9d',
      providerCustomerId: MOCK_BOUND_PORTONE_CUSTOMER_ID,
    }),
  })
  check(
    bindingConflict.status === 409,
    'subscription-http/billing-binding-register-conflict',
    `expected 409, got ${bindingConflict.status}`,
  )

  const portonePayload = JSON.stringify({
    type: 'BillingKey.Issued',
    timestamp: new Date().toISOString(),
    data: {
      storeId: 'store_qa',
      billingKey: MOCK_BOUND_PORTONE_SUBSCRIPTION_ID,
      customerId: MOCK_BOUND_PORTONE_CUSTOMER_ID,
      userId: primaryUserId,
      plan: 'PRO',
      aiCreditsMonthly: 300,
      aiCreditsRemaining: 287,
    },
  })

  const portoneSignature = buildPortoneWebhookHeaders(portonePayload, MOCK_PORTONE_WEBHOOK_SECRET, {
    webhookId: 'wh_qa_sub_http_001',
  })
  const portoneWebhook = await fetchJson(`${baseUrl}/v1/billing/webhooks/portone`, {
    method: 'POST',
    headers: buildProtectedJsonHeaders(primarySessionToken, portoneSignature.headers),
    body: portonePayload,
  })
  check(portoneWebhook.ok, 'subscription-http/webhook-portone', `status=${portoneWebhook.status}`)
  check(
    portoneWebhook.body?.status === 'processed',
    'subscription-http/webhook-portone-processed',
    `expected processed, got ${portoneWebhook.body?.status}`,
  )
  check(
    portoneWebhook.body?.applied === true,
    'subscription-http/webhook-portone-applied',
    `expected true, got ${portoneWebhook.body?.applied}`,
  )

  const entitlementsAfterWebhook = await fetchJson(`${baseUrl}/v1/subscription/entitlements`, {
    method: 'GET',
    headers: buildAuthHeaders(primarySessionToken, { Accept: 'application/json' }),
  })
  check(entitlementsAfterWebhook.ok, 'subscription-http/webhook-entitlements', `status=${entitlementsAfterWebhook.status}`)
  check(
    entitlementsAfterWebhook.body?.snapshot?.plan === 'PRO',
    'subscription-http/webhook-plan-sync',
    `expected PRO, got ${entitlementsAfterWebhook.body?.snapshot?.plan}`,
  )
  check(
    entitlementsAfterWebhook.body?.snapshot?.aiCreditsRemaining === 287,
    'subscription-http/webhook-credits-sync',
    `expected 287, got ${entitlementsAfterWebhook.body?.snapshot?.aiCreditsRemaining}`,
  )

  const portoneWebhookDuplicate = await fetchJson(`${baseUrl}/v1/billing/webhooks/portone`, {
    method: 'POST',
    headers: buildProtectedJsonHeaders(primarySessionToken, portoneSignature.headers),
    body: portonePayload,
  })
  check(portoneWebhookDuplicate.ok, 'subscription-http/webhook-portone-duplicate', `status=${portoneWebhookDuplicate.status}`)
  check(
    portoneWebhookDuplicate.body?.status === 'duplicate',
    'subscription-http/webhook-portone-duplicate-status',
    `expected duplicate, got ${portoneWebhookDuplicate.body?.status}`,
  )

  const unknownBindingPayload = JSON.stringify({
    type: 'BillingKey.Issued',
    timestamp: new Date().toISOString(),
    data: {
      storeId: 'store_qa',
      billingKey: 'billing-key-qa-unbound-001',
      customerId: 'customer_qa_unbound_001',
      userId: primaryUserId,
      plan: 'PRO',
      aiCreditsMonthly: 300,
      aiCreditsRemaining: 299,
    },
  })
  const unknownBindingSignature = buildPortoneWebhookHeaders(
    unknownBindingPayload,
    MOCK_PORTONE_WEBHOOK_SECRET,
    {
      webhookId: 'wh_qa_sub_http_unbound_001',
    },
  )
  const unknownBindingWebhook = await fetchJson(`${baseUrl}/v1/billing/webhooks/portone`, {
    method: 'POST',
    headers: buildProtectedJsonHeaders(primarySessionToken, unknownBindingSignature.headers),
    body: unknownBindingPayload,
  })
  check(unknownBindingWebhook.ok, 'subscription-http/webhook-portone-unknown-binding', `status=${unknownBindingWebhook.status}`)
  check(
    unknownBindingWebhook.body?.status === 'ignored',
    'subscription-http/webhook-portone-unknown-binding-status',
    `expected ignored, got ${unknownBindingWebhook.body?.status}`,
  )

  const entitlementsAfterUnknownBinding = await fetchJson(`${baseUrl}/v1/subscription/entitlements`, {
    method: 'GET',
    headers: buildAuthHeaders(primarySessionToken, { Accept: 'application/json' }),
  })
  check(
    entitlementsAfterUnknownBinding.body?.snapshot?.plan === 'PRO' &&
      entitlementsAfterUnknownBinding.body?.snapshot?.aiCreditsRemaining === 287,
    'subscription-http/webhook-unknown-binding-no-state-change',
    `expected plan=PRO and aiCreditsRemaining=287, got plan=${entitlementsAfterUnknownBinding.body?.snapshot?.plan} credits=${entitlementsAfterUnknownBinding.body?.snapshot?.aiCreditsRemaining}`,
  )

  const invalidSignatureWebhook = await fetchJson(`${baseUrl}/v1/billing/webhooks/portone`, {
    method: 'POST',
    headers: buildProtectedJsonHeaders(primarySessionToken, {
      ...portoneSignature.headers,
      'Webhook-Signature': 'v1=invalid-signature',
    }),
    body: portonePayload,
  })
  check(
    invalidSignatureWebhook.status === 400,
    'subscription-http/webhook-portone-invalid-signature',
    `expected 400, got ${invalidSignatureWebhook.status}`,
  )

  const expiredTimestamp = Math.floor(Date.now() / 1000) - 3600
  const expiredSignature = buildPortoneWebhookHeaders(
    portonePayload,
    MOCK_PORTONE_WEBHOOK_SECRET,
    {
      webhookId: 'wh_qa_sub_http_expired_001',
      timestamp: expiredTimestamp,
    },
  )
  const expiredWebhook = await fetchJson(`${baseUrl}/v1/billing/webhooks/portone`, {
    method: 'POST',
    headers: buildProtectedJsonHeaders(primarySessionToken, expiredSignature.headers),
    body: portonePayload,
  })
  check(
    expiredWebhook.status === 400,
    'subscription-http/webhook-portone-expired-signature',
    `expected 400, got ${expiredWebhook.status}`,
  )

  const signOutPrimary = await fetchJson(`${baseUrl}/v1/auth/sign-out`, {
    method: 'POST',
    headers: buildProtectedJsonHeaders(primarySessionToken),
    body: JSON.stringify({}),
  })
  check(signOutPrimary.ok, 'subscription-http/auth-sign-out-primary', `status=${signOutPrimary.status}`)
  check(
    signOutPrimary.body?.session?.isAuthenticated === false,
    'subscription-http/auth-sign-out-primary-state',
    `expected false, got ${signOutPrimary.body?.session?.isAuthenticated}`,
  )

  const sessionAfterSignOut = await fetchJson(`${baseUrl}/v1/auth/session`, {
    method: 'GET',
    headers: buildAuthHeaders(primarySessionToken, { Accept: 'application/json' }),
  })
  check(sessionAfterSignOut.ok, 'subscription-http/auth-session-after-sign-out', `status=${sessionAfterSignOut.status}`)
  check(
    sessionAfterSignOut.body?.isAuthenticated === false,
    'subscription-http/auth-session-after-sign-out-state',
    `expected false, got ${sessionAfterSignOut.body?.isAuthenticated}`,
  )

  const missingTokenPlanSet = await fetchJson(`${baseUrl}/v1/subscription/plan/set`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan: 'FREE' }),
  })
  check(
    missingTokenPlanSet.status === 401,
    'subscription-http/auth-missing-token',
    `expected 401, got ${missingTokenPlanSet.status}`,
  )

  warn(refundAgain.body?.refundedCredits === 0, 'subscription-http/refund-again-credit', `expected 0, got ${refundAgain.body?.refundedCredits}`)
}

async function writeReport() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true })

  const report = {
    createdAt: new Date().toISOString(),
    checks,
    warnings,
    failures,
  }

  await fs.writeFile(OUTPUT_JSON, JSON.stringify(report, null, 2), 'utf-8')

  const md = [
    '# Subscription HTTP QA Report',
    '',
    `- createdAt: ${report.createdAt}`,
    `- checks: ${checks.length}`,
    `- failures: ${failures.length}`,
    `- warnings: ${warnings.length}`,
    '',
    '## Checks',
    ...checks.map((item) => `- ${item.ok ? 'PASS' : 'FAIL'} ${item.name}: ${item.details}`),
    '',
    warnings.length ? '## Warnings' : '## Warnings (none)',
    ...warnings.map((message) => `- ${message}`),
    '',
    failures.length ? '## Result: FAIL' : '## Result: PASS',
    ...failures.map((message) => `- ${message}`),
    '',
  ]

  await fs.writeFile(OUTPUT_MD, md.join('\n'), 'utf-8')
}

async function main() {
  const port = Number(process.env.QA_SUBSCRIPTION_HTTP_PORT ?? 8797)
  const baseUrl = `http://127.0.0.1:${port}`
  const { child, output } = createMockServerProcess(port)
  let skipped = false

  let healthy = false
  try {
    healthy = await waitForHealth(baseUrl)
    if (!healthy) {
      const stderrText = output.stderr.join('\n')
      const unsupportedBind =
        /listen E(PERM|ACCES)/.test(stderrText) ||
        /operation not permitted/.test(stderrText) ||
        /permission denied/i.test(stderrText)
      if (unsupportedBind) {
        skipped = true
        warn(false, 'subscription-http/skipped', 'local bind permission is unavailable in this environment')
      } else {
        check(false, 'subscription-http/healthz', 'mock server boot timeout')
      }
    } else {
      check(true, 'subscription-http/healthz', 'mock server ready')
    }

    if (skipped) {
      await writeReport()
      console.log('[qa:subscription:http] skipped')
      console.log(` - ${OUTPUT_JSON}`)
      console.log(` - ${OUTPUT_MD}`)
      return
    }

    if (!healthy) {
      throw new Error('subscription mock server did not become healthy in time')
    }

    await runScenario(baseUrl)
  } catch (error) {
    failures.push(`exception: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    child.kill('SIGTERM')
  }

  await writeReport()

  if (warnings.length > 0) {
    console.log('[qa:subscription:http] warnings:')
    for (const message of warnings) console.log(` - ${message}`)
  }

  if (failures.length > 0) {
    console.error('[qa:subscription:http] failed')
    for (const message of failures) console.error(` - ${message}`)
    process.exit(1)
  }

  console.log('[qa:subscription:http] passed')
  console.log(` - ${OUTPUT_JSON}`)
  console.log(` - ${OUTPUT_MD}`)
}

main().catch((error) => {
  console.error('[qa:subscription:http] failed')
  console.error(error)
  process.exit(1)
})
