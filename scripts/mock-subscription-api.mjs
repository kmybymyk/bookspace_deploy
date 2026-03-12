#!/usr/bin/env node
import http from 'node:http'
import { createHash, randomBytes } from 'node:crypto'
import {
  verifyPortoneWebhookSignature,
  verifyStripeWebhookSignature,
} from '../shared/billingWebhookSignatures.ts'
import {
  parseAppendTextDraftFromPrompt,
  parseFindReplaceDraftFromPrompt,
  parseSaveProjectDraftFromPrompt,
} from '../shared/copilotP0PromptParser.ts'
import {
  parseRenameChapterDraftFromPrompt,
  parseMoveChapterDraftFromPrompt,
  parseSetChapterTypeDraftFromPrompt,
  parseSetTypographyDraftFromPrompt,
  parseSetPageBackgroundDraftFromPrompt,
  parseApplyThemeDraftFromPrompt,
  parseUpdateBookInfoDraftFromPrompt,
  parseSetCoverAssetDraftFromPrompt,
  parseExportProjectDraftFromPrompt,
  parseRestoreSnapshotDraftFromPrompt,
} from '../shared/copilotP1P2PromptParser.ts'

const port = Number(process.env.SUBSCRIPTION_MOCK_PORT ?? 8787)
const host = process.env.SUBSCRIPTION_MOCK_HOST ?? '127.0.0.1'
const STRIPE_WEBHOOK_SIGNING_SECRET = String(process.env.SUBSCRIPTION_MOCK_STRIPE_WEBHOOK_SECRET ?? '').trim()
const PORTONE_WEBHOOK_SIGNING_SECRET = String(
  process.env.SUBSCRIPTION_MOCK_PORTONE_WEBHOOK_SECRET ?? '',
).trim()
const MOCK_AUTH_TOKEN = String(process.env.SUBSCRIPTION_MOCK_AUTH_TOKEN ?? '').trim()
const MOCK_AUTH_HEADER = 'x-bookspace-mock-token'
const AUTH_SESSION_HEADER = 'x-bookspace-session-token'
const STRIPE_SIGNATURE_HEADER = 'stripe-signature'
const PORTONE_WEBHOOK_ID_HEADER = 'webhook-id'
const PORTONE_WEBHOOK_TIMESTAMP_HEADER = 'webhook-timestamp'
const PORTONE_WEBHOOK_SIGNATURE_HEADER = 'webhook-signature'
const STRIPE_WEBHOOK_TOLERANCE_SECONDS = Math.max(
  1,
  Math.floor(Number(process.env.SUBSCRIPTION_MOCK_STRIPE_TOLERANCE_SECONDS ?? 300)),
)
const PORTONE_WEBHOOK_TOLERANCE_SECONDS = Math.max(
  1,
  Math.floor(Number(process.env.SUBSCRIPTION_MOCK_PORTONE_TOLERANCE_SECONDS ?? 300)),
)
const MAX_REQUEST_BODY_BYTES = Math.max(
  1024,
  Math.floor(Number(process.env.SUBSCRIPTION_MOCK_MAX_BODY_BYTES ?? 256 * 1024)),
)

const CORE_FEATURES = new Set([
  'core.project.create',
  'core.project.open',
  'core.project.save',
  'core.editor.write',
  'core.editor.rewrite_manual',
  'core.chapter.manage',
  'core.preview.reflow',
  'core.preview.spread',
  'core.import.epub',
  'core.import.docx',
  'core.export.epub',
  'core.export.docx',
  'core.history.versioning',
  'core.autosave',
])

const AI_FEATURES = new Set([
  'ai.chat.ask',
  'ai.rewrite.selection',
  'ai.feedback.chapter',
  'ai.chapter.create',
  'ai.table.insert',
  'ai.illustration.insert_uploaded',
  'ai.illustration.generate',
  'ai.fast_apply',
])

const ALL_FEATURES = new Set([...CORE_FEATURES, ...AI_FEATURES])
const ALLOWED_PLANS = new Set(['FREE', 'PRO_LITE', 'PRO'])
const COPILOT_INTENTS = new Set([
  'rewrite_selection',
  'append_text',
  'find_replace',
  'save_project',
  'rename_chapter',
  'delete_chapter',
  'move_chapter',
  'set_chapter_type',
  'set_typography',
  'set_page_background',
  'apply_theme',
  'update_book_info',
  'set_cover_asset',
  'export_project',
  'restore_snapshot',
  'create_chapter',
  'feedback_report',
  'insert_table',
  'insert_illustration',
])
const BILLING_PROVIDER_VALUES = new Set(['portone', 'stripe'])
const AI_COMMAND_SCHEMA_VERSION = '1.1.0'
const STRIPE_SUBSCRIPTION_EVENTS = new Set([
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
])
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DEFAULT_GUEST_USER_ID =
  String(process.env.SUBSCRIPTION_MOCK_GUEST_USER_ID ?? 'guest-local').trim() || 'guest-local'
const INITIAL_PLAN = normalizePlan(process.env.SUBSCRIPTION_MOCK_PLAN) ?? 'FREE'
const INITIAL_AI_CREDITS = parseCredits(process.env.SUBSCRIPTION_MOCK_AI_CREDITS)
const CORS_ALLOWED_HEADERS = [
  'Content-Type',
  'Accept',
  'X-Bookspace-Mock-Token',
  'X-Bookspace-Session-Token',
  'Stripe-Signature',
  'Webhook-Id',
  'Webhook-Timestamp',
  'Webhook-Signature',
]
const CORS_EXPOSE_HEADERS = ['X-Bookspace-Session-Token']

if (!STRIPE_WEBHOOK_SIGNING_SECRET && !PORTONE_WEBHOOK_SIGNING_SECRET) {
  throw new Error(
    'SUBSCRIPTION_MOCK_PORTONE_WEBHOOK_SECRET or SUBSCRIPTION_MOCK_STRIPE_WEBHOOK_SECRET is required',
  )
}
if (!MOCK_AUTH_TOKEN) {
  throw new Error('SUBSCRIPTION_MOCK_AUTH_TOKEN is required')
}

const billingWebhookEvents = new Map()
const boundUserByCustomerId = new Map()
const boundUserBySubscriptionId = new Map()
const authSessionByToken = new Map()
const authUserIdByEmail = new Map()
const userStateByUserId = new Map()
const IDEM_TTL_MS = 24 * 60 * 60 * 1000

function parseCredits(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return null
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return null
  return Math.max(0, Math.floor(parsed))
}

function normalizePlan(raw) {
  if (typeof raw !== 'string') return null
  const normalized = raw.trim().toUpperCase()
  return ALLOWED_PLANS.has(normalized) ? normalized : null
}

function resolveDefaultAiCredits(plan) {
  if (plan === 'PRO') return 300
  if (plan === 'PRO_LITE') return 100
  return 0
}

function nowIso() {
  return new Date().toISOString()
}

function json(res, statusCode, payload, extraHeaders = {}) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders,
  })
  res.end(JSON.stringify(payload))
}

function applyCorsHeaders(req, res) {
  const requestOrigin = getHeaderValue(req, 'origin')
  const allowOrigin = requestOrigin || '*'
  res.setHeader('Access-Control-Allow-Origin', allowOrigin)
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', CORS_ALLOWED_HEADERS.join(', '))
  res.setHeader('Access-Control-Expose-Headers', CORS_EXPOSE_HEADERS.join(', '))
  if (requestOrigin) {
    res.setHeader('Access-Control-Allow-Credentials', 'true')
  }
}

function createInitialSnapshot() {
  return {
    plan: INITIAL_PLAN,
    enabledFeatures: {},
    disabledFeatures: {},
    aiCreditsRemaining: INITIAL_AI_CREDITS,
  }
}

function cloneSnapshot(snapshot) {
  return {
    ...snapshot,
    enabledFeatures: { ...(snapshot?.enabledFeatures ?? {}) },
    disabledFeatures: { ...(snapshot?.disabledFeatures ?? {}) },
  }
}

function planAllowsFeature(plan, featureId) {
  if (CORE_FEATURES.has(featureId)) return true
  if (AI_FEATURES.has(featureId)) return plan !== 'FREE'
  return false
}

function hasFeature(snapshot, featureId) {
  if (snapshot.disabledFeatures?.[featureId] === true) return false
  if (snapshot.enabledFeatures?.[featureId] === true) return true
  return planAllowsFeature(snapshot.plan, featureId)
}

function pruneIdemCache() {
  const now = Date.now()
  for (const [, state] of userStateByUserId.entries()) {
    for (const [key, entry] of state.idemCache.entries()) {
      if (entry.expiresAtMs <= now) state.idemCache.delete(key)
    }
  }
}

async function readJsonBody(req) {
  const raw = await readRawBody(req)
  if (!raw) return {}
  return JSON.parse(raw)
}

function createRequestError(statusCode, message, code = 'invalid-request') {
  const error = new Error(message)
  error.statusCode = statusCode
  error.code = code
  return error
}

async function readRawBody(req, limitBytes = MAX_REQUEST_BODY_BYTES) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > limitBytes) {
      throw createRequestError(413, `request body too large (max ${limitBytes} bytes)`, 'body-too-large')
    }
    chunks.push(buffer)
  }
  if (chunks.length === 0) return ''
  return Buffer.concat(chunks).toString('utf-8')
}

function getHeaderValue(req, headerName) {
  const raw = req.headers?.[headerName]
  if (Array.isArray(raw)) return raw[0] ? String(raw[0]).trim() : ''
  return raw ? String(raw).trim() : ''
}

function normalizeUuidOrNull(raw) {
  const value = String(raw ?? '').trim().toLowerCase()
  if (!value) return null
  if (!UUID_PATTERN.test(value)) return null
  return value
}

function normalizeBindingId(raw) {
  const value = String(raw ?? '').trim()
  return value || null
}

function normalizeEmail(raw) {
  const value = String(raw ?? '').trim().toLowerCase()
  if (!value || !value.includes('@') || value.length > 320) return null
  return value
}

function normalizeDisplayName(raw) {
  const value = String(raw ?? '').trim()
  if (!value) return null
  return value.slice(0, 120)
}

function createGoogleUserId(email) {
  const digest = createHash('sha256').update(`google:${email}`).digest('hex')
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`
}

function resolveGoogleUserId(email) {
  const existing = authUserIdByEmail.get(email)
  if (existing) return existing
  const next = createGoogleUserId(email)
  authUserIdByEmail.set(email, next)
  return next
}

function createSessionToken() {
  return `bs_${randomBytes(24).toString('hex')}`
}

function buildGuestSessionSnapshot() {
  return {
    user: null,
    isAuthenticated: false,
    fetchedAt: nowIso(),
  }
}

function buildAuthenticatedSessionSnapshot(session) {
  return {
    user: {
      userId: session.userId,
      provider: 'google',
      email: session.email,
      displayName: session.displayName,
      avatarUrl: session.avatarUrl ?? undefined,
    },
    isAuthenticated: true,
    fetchedAt: nowIso(),
  }
}

function getAuthSessionFromRequest(req) {
  const token = getHeaderValue(req, AUTH_SESSION_HEADER)
  if (!token) return null
  return authSessionByToken.get(token) ?? null
}

function resolveRequestUserId(req) {
  const session = getAuthSessionFromRequest(req)
  return session?.userId ?? DEFAULT_GUEST_USER_ID
}

function getUserState(userId) {
  const normalizedUserId = String(userId ?? '').trim() || DEFAULT_GUEST_USER_ID
  let state = userStateByUserId.get(normalizedUserId)
  if (!state) {
    state = {
      snapshot: createInitialSnapshot(),
      idemCache: new Map(),
    }
    userStateByUserId.set(normalizedUserId, state)
  }
  return state
}

function getSessionResponseHeaders(token) {
  if (!token) return {}
  return {
    'X-Bookspace-Session-Token': token,
  }
}

function isLoopbackAddress(rawAddress) {
  const value = String(rawAddress ?? '').trim().toLowerCase()
  if (!value) return false
  if (value === '127.0.0.1' || value === '::1') return true
  if (value.startsWith('::ffff:')) {
    return value.slice('::ffff:'.length) === '127.0.0.1'
  }
  return false
}

function isAuthPath(pathname) {
  return pathname === '/v1/auth/google/sign-in' || pathname === '/v1/auth/sign-out'
}

function requireStateMutationAuth(req, res, pathname) {
  if (!isLoopbackAddress(req.socket?.remoteAddress)) {
    json(res, 403, { error: 'state-changing requests are allowed only from loopback' })
    return false
  }
  if (isAuthPath(pathname)) return true

  const token = getHeaderValue(req, MOCK_AUTH_HEADER)
  if (!token) {
    json(res, 401, { error: `${MOCK_AUTH_HEADER} header required` })
    return false
  }
  if (token !== MOCK_AUTH_TOKEN) {
    json(res, 403, { error: 'invalid mock auth token' })
    return false
  }
  return true
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null
}

function normalizeWebhookSubscriptionStatusOrNull(raw) {
  const status = String(raw ?? '').trim().toLowerCase()
  if (status === 'active' || status === 'trialing') return 'active'
  if (status === 'past_due' || status === 'unpaid' || status === 'incomplete') return 'past_due'
  if (status === 'canceled' || status === 'incomplete_expired') return 'canceled'
  return null
}

function normalizeWebhookSubscriptionStatus(raw) {
  const normalized = normalizeWebhookSubscriptionStatusOrNull(raw)
  if (normalized) return normalized
  return 'active'
}

function normalizeSubscriptionStatusFromPortoneEventType(eventType) {
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

function normalizeIntegerOrNull(raw) {
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return null
  return Math.max(0, Math.floor(parsed))
}

function normalizeTextOrNull(raw) {
  const text = String(raw ?? '').trim()
  return text || null
}

function resolveStripeCustomerId(raw) {
  if (typeof raw === 'string') return normalizeBindingId(raw)
  const asObj = asRecord(raw)
  if (!asObj) return null
  return normalizeBindingId(asObj.id)
}

function seedInitialBillingBinding() {
  const userId = normalizeUuidOrNull(process.env.SUBSCRIPTION_MOCK_BOUND_USER_ID)
  const customerId = normalizeBindingId(
    process.env.SUBSCRIPTION_MOCK_BOUND_PORTONE_CUSTOMER_ID ??
      process.env.SUBSCRIPTION_MOCK_BOUND_STRIPE_CUSTOMER_ID,
  )
  const subscriptionId = normalizeBindingId(
    process.env.SUBSCRIPTION_MOCK_BOUND_PORTONE_SUBSCRIPTION_ID ??
      process.env.SUBSCRIPTION_MOCK_BOUND_PORTONE_BILLING_KEY ??
      process.env.SUBSCRIPTION_MOCK_BOUND_STRIPE_SUBSCRIPTION_ID,
  )

  if (!userId) return
  if (!customerId && !subscriptionId) {
    throw new Error(
      'SUBSCRIPTION_MOCK_BOUND_USER_ID requires SUBSCRIPTION_MOCK_BOUND_PORTONE_CUSTOMER_ID or SUBSCRIPTION_MOCK_BOUND_PORTONE_SUBSCRIPTION_ID',
    )
  }
  if (customerId) boundUserByCustomerId.set(customerId, userId)
  if (subscriptionId) boundUserBySubscriptionId.set(subscriptionId, userId)
}

function resolveBoundUserForBillingEvent(event) {
  const customerUserId = event.providerCustomerId
    ? boundUserByCustomerId.get(event.providerCustomerId) ?? null
    : null
  const subscriptionUserId = event.providerSubscriptionId
    ? boundUserBySubscriptionId.get(event.providerSubscriptionId) ?? null
    : null

  if (customerUserId && subscriptionUserId && customerUserId !== subscriptionUserId) {
    return { userId: null, reason: 'binding conflict between customer and subscription ids' }
  }

  const resolvedUserId = customerUserId ?? subscriptionUserId
  if (!resolvedUserId) {
    return { userId: null, reason: 'binding not found for provider identifiers' }
  }

  if (event.userId && event.userId !== resolvedUserId) {
    return { userId: null, reason: 'metadata user_id mismatch with bound account' }
  }

  return { userId: resolvedUserId, reason: null }
}

function parseStripeSubscriptionWebhook(rawBody) {
  const parsed = JSON.parse(rawBody)
  const eventId = normalizeTextOrNull(parsed?.id)
  const eventType = normalizeTextOrNull(parsed?.type)
  if (!eventId) throw new Error('stripe event id is required')
  if (!eventType) throw new Error('stripe event type is required')
  if (!STRIPE_SUBSCRIPTION_EVENTS.has(eventType)) {
    throw new Error(`unsupported stripe event type: ${eventType}`)
  }

  const data = asRecord(parsed?.data)
  const subscription = asRecord(data?.object)
  if (!subscription) {
    throw new Error('stripe event.data.object is required')
  }

  const metadata = asRecord(subscription.metadata) ?? {}
  const plan = normalizePlan(metadata.bookspace_plan ?? metadata.bookspacePlan) ?? 'FREE'
  const subscriptionStatus = normalizeWebhookSubscriptionStatus(subscription.status)
  const providerCustomerId = resolveStripeCustomerId(subscription.customer)
  const providerSubscriptionId = normalizeBindingId(subscription.id)

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
    userId: normalizeUuidOrNull(metadata.bookspace_user_id ?? metadata.bookspaceUserId),
    providerCustomerId,
    providerSubscriptionId,
    plan,
    subscriptionStatus,
    aiCreditsMonthly,
    aiCreditsRemaining,
    payload: parsed,
  }
}

function parsePortoneBillingWebhook(rawBody, webhookId) {
  const parsed = JSON.parse(rawBody)
  const eventType = normalizeTextOrNull(parsed?.type)
  if (!eventType) throw new Error('portone webhook type is required')

  const data = asRecord(parsed?.data) ?? {}
  const metadata = asRecord(data?.metadata) ?? {}
  const plan = normalizePlan(data?.plan ?? metadata?.bookspace_plan ?? metadata?.bookspacePlan)
  const statusFromPayload = normalizeWebhookSubscriptionStatusOrNull(
    data?.subscriptionStatus ?? data?.subscription_status,
  )
  const providerCustomerId = normalizeBindingId(
    data?.customerId ??
      data?.customer_id ??
      data?.providerCustomerId ??
      data?.provider_customer_id,
  )
  const providerSubscriptionId = normalizeBindingId(
    data?.billingKey ??
      data?.billing_key ??
      data?.providerSubscriptionId ??
      data?.provider_subscription_id ??
      data?.subscriptionId,
  )
  const aiCreditsMonthly =
    normalizeIntegerOrNull(
      data?.aiCreditsMonthly ??
        data?.ai_credits_monthly ??
        metadata?.bookspace_ai_credits_monthly ??
        metadata?.bookspaceAiCreditsMonthly,
    ) ?? (plan ? resolveDefaultAiCredits(plan) : null)
  const aiCreditsRemaining = normalizeIntegerOrNull(
    data?.aiCreditsRemaining ??
      data?.ai_credits_remaining ??
      metadata?.bookspace_ai_credits_remaining ??
      metadata?.bookspaceAiCreditsRemaining,
  )

  return {
    provider: 'portone',
    eventId: normalizeTextOrNull(parsed?.id) ?? webhookId,
    eventType,
    userId: normalizeUuidOrNull(
      data?.userId ??
        data?.user_id ??
        metadata?.bookspace_user_id ??
        metadata?.bookspaceUserId,
    ),
    providerCustomerId,
    providerSubscriptionId,
    plan,
    subscriptionStatus: statusFromPayload ?? normalizeSubscriptionStatusFromPortoneEventType(eventType),
    aiCreditsMonthly,
    aiCreditsRemaining,
    payload: parsed,
  }
}

function applyBillingWebhookEvent(event) {
  const existing = billingWebhookEvents.get(event.eventId)
  if (existing) {
    return {
      eventId: event.eventId,
      status: 'duplicate',
      applied: false,
      processedAt: existing.processedAt,
    }
  }

  const processedAt = nowIso()
  let status = 'ignored'
  let applied = false
  const bindingResolution = resolveBoundUserForBillingEvent(event)

  if (bindingResolution.userId) {
    if (event.providerCustomerId) {
      boundUserByCustomerId.set(event.providerCustomerId, bindingResolution.userId)
    }
    if (event.providerSubscriptionId) {
      boundUserBySubscriptionId.set(event.providerSubscriptionId, bindingResolution.userId)
    }

    const userState = getUserState(bindingResolution.userId)
    const isCanceled = event.subscriptionStatus === 'canceled'
    const nextPlan = isCanceled ? 'FREE' : event.plan ?? userState.snapshot.plan
    const nextCredits =
      nextPlan === 'FREE'
        ? null
        : event.aiCreditsRemaining ??
          event.aiCreditsMonthly ??
          userState.snapshot.aiCreditsRemaining ??
          resolveDefaultAiCredits(nextPlan)

    userState.snapshot = {
      ...userState.snapshot,
      plan: nextPlan,
      aiCreditsRemaining: nextCredits,
    }
    userState.idemCache.clear()
    status = 'processed'
    applied = true
  } else {
    status = 'ignored'
  }

  billingWebhookEvents.set(event.eventId, {
    eventId: event.eventId,
    status,
    applied,
    processedAt,
    reason: bindingResolution.reason ?? undefined,
  })

  return {
    eventId: event.eventId,
    status,
    applied,
    processedAt,
    reason: bindingResolution.reason ?? undefined,
  }
}

function applyStripeSubscriptionWebhook(event) {
  return applyBillingWebhookEvent(event)
}

function applyPortoneBillingWebhook(event) {
  return applyBillingWebhookEvent(event)
}

function badRequest(res, message) {
  json(res, 400, { error: message })
}

function conflict(res, message) {
  json(res, 409, { error: message })
}

function methodNotAllowed(res) {
  json(res, 405, { error: 'method not allowed' })
}

function notFound(res) {
  json(res, 404, { error: 'not found' })
}

seedInitialBillingBinding()

const server = http.createServer(async (req, res) => {
  try {
    applyCorsHeaders(req, res)
    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      return res.end()
    }

    pruneIdemCache()
    const url = new URL(req.url ?? '/', `http://${host}:${port}`)
    const path = url.pathname
    const requestMethod = String(req.method ?? 'GET').toUpperCase()
    const authSession = getAuthSessionFromRequest(req)
    const requestUserId = resolveRequestUserId(req)
    const requestUserState = getUserState(requestUserId)

    if (path === '/healthz') {
      return json(res, 200, {
        ok: true,
        at: nowIso(),
        activeUsers: userStateByUserId.size,
        activeSessions: authSessionByToken.size,
      })
    }

    if (path === '/v1/auth/session') {
      if (requestMethod !== 'GET') return methodNotAllowed(res)
      if (!authSession) {
        return json(res, 200, buildGuestSessionSnapshot())
      }
      return json(res, 200, buildAuthenticatedSessionSnapshot(authSession), getSessionResponseHeaders(authSession.token))
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      if (!requireStateMutationAuth(req, res, path)) return
    }

    if (path === '/v1/auth/google/sign-in') {
      if (requestMethod !== 'POST') return methodNotAllowed(res)
      const body = await readJsonBody(req)

      const email =
        normalizeEmail(body?.email) ||
        normalizeEmail(process.env.BOOKSPACE_DEV_GOOGLE_EMAIL) ||
        'dev.google@bookspace.local'
      const displayName =
        normalizeDisplayName(body?.displayName) ||
        normalizeDisplayName(process.env.BOOKSPACE_DEV_GOOGLE_NAME) ||
        'Google User'
      const avatarUrl = normalizeTextOrNull(body?.avatarUrl)
      const userId = resolveGoogleUserId(email)
      const token = createSessionToken()

      const session = {
        token,
        userId,
        email,
        displayName,
        avatarUrl,
        createdAt: nowIso(),
      }
      authSessionByToken.set(token, session)
      getUserState(userId)

      return json(
        res,
        200,
        {
          success: true,
          mode: 'development-stub',
          session: buildAuthenticatedSessionSnapshot(session),
          message: 'development stub session created',
        },
        getSessionResponseHeaders(token),
      )
    }

    if (path === '/v1/auth/sign-out') {
      if (requestMethod !== 'POST') return methodNotAllowed(res)
      const sessionToken = getHeaderValue(req, AUTH_SESSION_HEADER)
      if (sessionToken) {
        authSessionByToken.delete(sessionToken)
      }
      return json(res, 200, {
        success: true,
        session: buildGuestSessionSnapshot(),
        signedOutAt: nowIso(),
      })
    }

    if (path === '/v1/subscription/entitlements') {
      if (requestMethod !== 'GET') return methodNotAllowed(res)
      return json(res, 200, {
        snapshot: cloneSnapshot(requestUserState.snapshot),
        fetchedAt: nowIso(),
      })
    }

    if (path === '/v1/subscription/plan/set') {
      if (requestMethod !== 'POST') return methodNotAllowed(res)
      const body = await readJsonBody(req)
      const plan = normalizePlan(body?.plan)
      if (!plan) return badRequest(res, 'invalid plan')

      requestUserState.snapshot = {
        ...requestUserState.snapshot,
        plan,
        aiCreditsRemaining:
          plan === 'FREE'
            ? null
            : requestUserState.snapshot.aiCreditsRemaining ?? (plan === 'PRO' ? 300 : 100),
      }
      requestUserState.idemCache.clear()
      return json(res, 200, {
        success: true,
        snapshot: cloneSnapshot(requestUserState.snapshot),
        updatedAt: nowIso(),
      })
    }

    if (path === '/v1/subscription/gate/check') {
      if (requestMethod !== 'POST') return methodNotAllowed(res)
      const body = await readJsonBody(req)
      const requestId = String(body?.requestId ?? '').trim()
      const featureId = String(body?.featureId ?? '').trim()
      const consumeCredit = Boolean(body?.consumeCredit)
      const requiredCredits = Math.max(1, Math.floor(Number(body?.requiredCredits ?? 1) || 1))
      const idempotencyKey = String(body?.idempotencyKey ?? '').trim() || undefined

      if (!requestId) return badRequest(res, 'requestId required')
      if (!ALL_FEATURES.has(featureId)) return badRequest(res, 'featureId invalid')

      if (consumeCredit && idempotencyKey && requestUserState.idemCache.has(idempotencyKey)) {
        const cached = requestUserState.idemCache.get(idempotencyKey)
        if (cached.featureId !== featureId || cached.requiredCredits !== requiredCredits) {
          return badRequest(res, 'idempotencyKey reused with different parameters')
        }
        return json(res, 200, {
          ...cached.response,
          requestId,
          checkedAt: nowIso(),
        })
      }

      let allowed = true
      let reason = 'plan-allows-feature'
      let consumedCredits = 0

      if (!hasFeature(requestUserState.snapshot, featureId)) {
        allowed = false
        reason =
          requestUserState.snapshot.disabledFeatures?.[featureId] === true
            ? 'feature-disabled-by-flag'
            : 'plan-does-not-allow-feature'
      }

      if (allowed && consumeCredit && AI_FEATURES.has(featureId)) {
        const remaining = requestUserState.snapshot.aiCreditsRemaining
        if (remaining !== null && remaining !== undefined && remaining < requiredCredits) {
          allowed = false
          reason = 'insufficient-ai-credits'
        }
      }

      if (allowed && consumeCredit && AI_FEATURES.has(featureId)) {
        const remaining = requestUserState.snapshot.aiCreditsRemaining
        if (remaining !== null && remaining !== undefined) {
          consumedCredits = Math.min(remaining, requiredCredits)
          requestUserState.snapshot = {
            ...requestUserState.snapshot,
            aiCreditsRemaining: Math.max(0, remaining - requiredCredits),
          }
        }
      }

      const response = {
        requestId,
        allowed,
        reason,
        plan: requestUserState.snapshot.plan,
        aiCreditsRemaining: requestUserState.snapshot.aiCreditsRemaining ?? null,
        checkedAt: nowIso(),
      }

      if (consumeCredit && idempotencyKey && allowed) {
        requestUserState.idemCache.set(idempotencyKey, {
          featureId,
          requiredCredits,
          consumedCredits,
          refunded: false,
          expiresAtMs: Date.now() + IDEM_TTL_MS,
          response,
        })
      }

      return json(res, 200, response)
    }

    if (path === '/v1/subscription/credits/refund') {
      if (requestMethod !== 'POST') return methodNotAllowed(res)
      const body = await readJsonBody(req)
      const requestId = String(body?.requestId ?? '').trim()
      const idempotencyKey = String(body?.idempotencyKey ?? '').trim()

      if (!requestId) return badRequest(res, 'requestId required')
      if (!idempotencyKey) return badRequest(res, 'idempotencyKey required')

      const cached = requestUserState.idemCache.get(idempotencyKey)
      if (!cached) {
        return json(res, 200, {
          requestId,
          status: 'not-found',
          refundedCredits: 0,
          aiCreditsRemaining: requestUserState.snapshot.aiCreditsRemaining ?? null,
          refundedAt: nowIso(),
        })
      }

      if (cached.refunded) {
        return json(res, 200, {
          requestId,
          status: 'already-refunded',
          refundedCredits: 0,
          aiCreditsRemaining: requestUserState.snapshot.aiCreditsRemaining ?? null,
          refundedAt: nowIso(),
        })
      }

      let refundedCredits = 0
      if (cached.consumedCredits > 0) {
        const remaining = requestUserState.snapshot.aiCreditsRemaining
        if (remaining !== null && remaining !== undefined) {
          refundedCredits = cached.consumedCredits
          requestUserState.snapshot = {
            ...requestUserState.snapshot,
            aiCreditsRemaining: remaining + cached.consumedCredits,
          }
        }
      }

      requestUserState.idemCache.set(idempotencyKey, {
        ...cached,
        refunded: true,
      })

      return json(res, 200, {
        requestId,
        status: 'refunded',
        refundedCredits,
        aiCreditsRemaining: requestUserState.snapshot.aiCreditsRemaining ?? null,
        refundedAt: nowIso(),
      })
    }

    if (path === '/v1/billing/bindings/register') {
      if (requestMethod !== 'POST') return methodNotAllowed(res)
      const body = await readJsonBody(req)
      const provider = String(body?.provider ?? 'portone').trim().toLowerCase()
      const userId = normalizeUuidOrNull(body?.userId)
      const providerCustomerId = normalizeBindingId(body?.providerCustomerId)
      const providerSubscriptionId = normalizeBindingId(body?.providerSubscriptionId)

      if (!BILLING_PROVIDER_VALUES.has(provider)) return badRequest(res, 'provider invalid')
      if (!userId) return badRequest(res, 'userId invalid')
      if (!providerCustomerId && !providerSubscriptionId) {
        return badRequest(res, 'providerCustomerId or providerSubscriptionId required')
      }

      const customerUserId = providerCustomerId
        ? boundUserByCustomerId.get(providerCustomerId) ?? null
        : null
      const subscriptionUserId = providerSubscriptionId
        ? boundUserBySubscriptionId.get(providerSubscriptionId) ?? null
        : null

      if (customerUserId && customerUserId !== userId) {
        return conflict(res, 'providerCustomerId already bound to another user')
      }
      if (subscriptionUserId && subscriptionUserId !== userId) {
        return conflict(res, 'providerSubscriptionId already bound to another user')
      }
      if (customerUserId && subscriptionUserId && customerUserId !== subscriptionUserId) {
        return conflict(res, 'binding conflict between customer and subscription ids')
      }

      if (providerCustomerId) boundUserByCustomerId.set(providerCustomerId, userId)
      if (providerSubscriptionId) boundUserBySubscriptionId.set(providerSubscriptionId, userId)
      getUserState(userId)

      return json(res, 200, {
        provider,
        userId,
        providerCustomerId,
        providerSubscriptionId,
        registered: true,
        registeredAt: nowIso(),
      })
    }

    if (path === '/v1/billing/webhooks/stripe') {
      if (requestMethod !== 'POST') return methodNotAllowed(res)

      const signatureHeader = getHeaderValue(req, STRIPE_SIGNATURE_HEADER)
      if (!signatureHeader) return badRequest(res, 'stripe-signature header required')

      let rawBody = ''
      try {
        rawBody = await readRawBody(req)
      } catch (error) {
        if (error instanceof Error && Number.isFinite(error.statusCode)) {
          return json(res, Number(error.statusCode), {
            error: error.message,
            code: error.code ?? 'invalid-request',
          })
        }
        throw error
      }

      try {
        verifyStripeWebhookSignature({
          rawBody,
          signatureHeader,
          signingSecret: STRIPE_WEBHOOK_SIGNING_SECRET,
          toleranceSeconds: STRIPE_WEBHOOK_TOLERANCE_SECONDS,
        })
      } catch (error) {
        return badRequest(res, error instanceof Error ? error.message : String(error))
      }

      let event
      try {
        event = parseStripeSubscriptionWebhook(rawBody)
      } catch (error) {
        return badRequest(res, error instanceof Error ? error.message : String(error))
      }

      const result = applyStripeSubscriptionWebhook(event)
      return json(res, 200, {
        provider: 'stripe',
        ...result,
      })
    }

    if (path === '/v1/billing/webhooks/portone') {
      if (requestMethod !== 'POST') return methodNotAllowed(res)

      const webhookId = getHeaderValue(req, PORTONE_WEBHOOK_ID_HEADER)
      const webhookTimestamp = getHeaderValue(req, PORTONE_WEBHOOK_TIMESTAMP_HEADER)
      const webhookSignature = getHeaderValue(req, PORTONE_WEBHOOK_SIGNATURE_HEADER)

      if (!webhookId) return badRequest(res, 'webhook-id header required')
      if (!webhookTimestamp) return badRequest(res, 'webhook-timestamp header required')
      if (!webhookSignature) return badRequest(res, 'webhook-signature header required')

      let rawBody = ''
      try {
        rawBody = await readRawBody(req)
      } catch (error) {
        if (error instanceof Error && Number.isFinite(error.statusCode)) {
          return json(res, Number(error.statusCode), {
            error: error.message,
            code: error.code ?? 'invalid-request',
          })
        }
        throw error
      }

      try {
        verifyPortoneWebhookSignature({
          rawBody,
          headers: {
            [PORTONE_WEBHOOK_ID_HEADER]: webhookId,
            [PORTONE_WEBHOOK_TIMESTAMP_HEADER]: webhookTimestamp,
            [PORTONE_WEBHOOK_SIGNATURE_HEADER]: webhookSignature,
          },
          signingSecret: PORTONE_WEBHOOK_SIGNING_SECRET,
          toleranceSeconds: PORTONE_WEBHOOK_TOLERANCE_SECONDS,
          allowNormalizedBase64: true,
        })
      } catch (error) {
        return badRequest(res, error instanceof Error ? error.message : String(error))
      }

      let event
      try {
        event = parsePortoneBillingWebhook(rawBody, webhookId)
      } catch (error) {
        return badRequest(res, error instanceof Error ? error.message : String(error))
      }

      const result = applyPortoneBillingWebhook(event)
      return json(res, 200, {
        provider: 'portone',
        ...result,
      })
    }

    if (path === '/v1/ai/requests') {
      if (requestMethod !== 'POST') return methodNotAllowed(res)
      const body = await readJsonBody(req)
      const requestId = String(body?.requestId ?? '').trim()
      const intent = String(body?.intent ?? '').trim()
      const idempotencyKey = String(body?.idempotencyKey ?? '').trim() || `mock-${Date.now()}`
      const baseProjectRevision = String(body?.baseProjectRevision ?? '').trim() || 'rev_mock_preview'
      const chapterId = String(body?.context?.chapterId ?? '').trim() || 'chapter-active'
      const selectedText = String(body?.context?.selectedText ?? '').trim()
      const userPrompt = String(body?.context?.userPrompt ?? '').trim()
      const preview = body?.preview !== false

      if (!requestId) return badRequest(res, 'requestId required')
      if (!COPILOT_INTENTS.has(intent)) return badRequest(res, 'intent invalid')

      if (intent === 'rewrite_selection' && !selectedText) {
        return json(res, 200, {
          requestId,
          status: 'needs-context',
          validation: {
            code: 'NEEDS_CONTEXT',
            errors: [],
            warnings: ['rewrite_selection intent requires selectedText context'],
            previewOnly: true,
          },
          generatedAt: nowIso(),
          error: 'selectedText required',
        })
      }

      let summary = 'AI command preview generated.'
      let commands = []
      if (intent === 'rewrite_selection') {
        summary = 'Selected text rewrite preview generated.'
        const rewritten = selectedText.replace(/\s+/g, ' ').trim()
        commands = [
          {
            type: 'rewrite_selection',
            target: {
              chapterId,
              range: {
                from: 1,
                to: Math.max(2, rewritten.length + 1),
              },
            },
            payload: {
              text: rewritten.endsWith('.') ? rewritten : `${rewritten}.`,
              tone: 'clear',
              lengthPolicy: 'shorter',
            },
            preview,
          },
        ]
      } else if (intent === 'append_text') {
        const draft = parseAppendTextDraftFromPrompt(String(userPrompt || ''))
        summary = 'Append text preview generated.'
        commands = [
          {
            type: 'append_text',
            target: {
              chapterId,
              position: draft.position,
            },
            payload: {
              text: draft.text,
              tone: 'clear',
              lengthPolicy: 'medium',
            },
            preview,
          },
        ]
      } else if (intent === 'find_replace') {
        const draft = parseFindReplaceDraftFromPrompt(String(userPrompt || ''))
        summary = 'Find and replace preview generated.'
        commands = [
          {
            type: 'find_replace',
            target: {
              scope: 'chapter',
              chapterId,
            },
            payload: {
              find: draft.find,
              replace: draft.replace,
              mode: draft.mode,
              matchCase: draft.matchCase,
            },
            preview,
          },
        ]
      } else if (intent === 'save_project') {
        const draft = parseSaveProjectDraftFromPrompt(String(userPrompt || ''))
        summary = 'Save project preview generated.'
        commands = [
          {
            type: 'save_project',
            target: {
              mode: draft.mode,
            },
            payload: {
              suggestedPath: draft.suggestedPath,
            },
            preview,
          },
        ]
      } else if (intent === 'rename_chapter') {
        const draft = parseRenameChapterDraftFromPrompt(String(userPrompt || ''))
        summary = 'Rename chapter preview generated.'
        commands = [
          {
            type: 'rename_chapter',
            target: {
              chapterId,
            },
            payload: {
              title: draft.title,
            },
            preview,
          },
        ]
      } else if (intent === 'delete_chapter') {
        summary = 'Delete chapter preview generated.'
        commands = [
          {
            type: 'delete_chapter',
            target: {
              chapterId,
            },
            payload: {},
            preview,
          },
        ]
      } else if (intent === 'move_chapter') {
        const draft = parseMoveChapterDraftFromPrompt(String(userPrompt || ''))
        summary = 'Move chapter preview generated.'
        commands = [
          {
            type: 'move_chapter',
            target: {
              chapterId,
            },
            payload: {
              toIndex: draft.toIndex,
              parentId: draft.parentId,
            },
            preview,
          },
        ]
      } else if (intent === 'set_chapter_type') {
        const draft = parseSetChapterTypeDraftFromPrompt(String(userPrompt || ''))
        summary = 'Chapter type preview generated.'
        commands = [
          {
            type: 'set_chapter_type',
            target: {
              chapterId,
            },
            payload: {
              chapterType: draft.chapterType,
              chapterKind: draft.chapterKind,
            },
            preview,
          },
        ]
      } else if (intent === 'set_typography') {
        const draft = parseSetTypographyDraftFromPrompt(String(userPrompt || ''))
        summary = 'Typography change preview generated.'
        commands = [
          {
            type: 'set_typography',
            target: {
              section: draft.section,
            },
            payload: {
              slot: draft.slot,
              fontFamily: draft.fontFamily,
              fontScale: draft.fontScale,
              lineHeight: draft.lineHeight,
              letterSpacing: draft.letterSpacing,
              textIndent: draft.textIndent,
            },
            preview,
          },
        ]
      } else if (intent === 'set_page_background') {
        const draft = parseSetPageBackgroundDraftFromPrompt(String(userPrompt || ''))
        summary = 'Page background preview generated.'
        commands = [
          {
            type: 'set_page_background',
            target: {
              chapterId,
            },
            payload: {
              color: draft.color,
            },
            preview,
          },
        ]
      } else if (intent === 'apply_theme') {
        const draft = parseApplyThemeDraftFromPrompt(String(userPrompt || ''))
        summary = 'Theme change preview generated.'
        commands = [
          {
            type: 'apply_theme',
            target: {
              scope: 'project',
            },
            payload: {
              theme: draft.theme,
            },
            preview,
          },
        ]
      } else if (intent === 'update_book_info') {
        const draft = parseUpdateBookInfoDraftFromPrompt(String(userPrompt || ''))
        summary = 'Book info update preview generated.'
        commands = [
          {
            type: 'update_book_info',
            target: {
              scope: 'project',
            },
            payload: draft,
            preview,
          },
        ]
      } else if (intent === 'set_cover_asset') {
        const draft = parseSetCoverAssetDraftFromPrompt(String(userPrompt || ''))
        summary = 'Cover asset update preview generated.'
        commands = [
          {
            type: 'set_cover_asset',
            target: {
              assetType: draft.assetType,
            },
            payload: {
              source: draft.source,
              value: draft.value || 'generated://cover-asset',
            },
            preview,
          },
        ]
      } else if (intent === 'export_project') {
        const draft = parseExportProjectDraftFromPrompt(String(userPrompt || ''))
        summary = 'Export project preview generated.'
        commands = [
          {
            type: 'export_project',
            target: {
              format: draft.format,
            },
            payload: {
              embedFonts: draft.embedFonts,
            },
            preview,
          },
        ]
      } else if (intent === 'restore_snapshot') {
        const draft = parseRestoreSnapshotDraftFromPrompt(String(userPrompt || ''))
        summary = 'Restore snapshot preview generated.'
        commands = [
          {
            type: 'restore_snapshot',
            target: {
              snapshotId: draft.snapshotId || 'latest',
            },
            payload: {
              mode: draft.mode,
            },
            preview,
          },
        ]
      } else if (intent === 'create_chapter') {
        summary = 'Chapter draft preview generated.'
        commands = [
          {
            type: 'create_chapter',
            target: {
              afterChapterId: chapterId,
            },
            payload: {
              title: userPrompt.slice(0, 40) || '새 챕터',
              blocks: [
                {
                  type: 'paragraph',
                  text: userPrompt || '새로운 챕터 시작 문단입니다.',
                },
              ],
            },
            preview,
          },
        ]
      } else if (intent === 'insert_table') {
        summary = 'Table insertion preview generated.'
        commands = [
          {
            type: 'insert_table',
            target: {
              chapterId,
              position: 1,
            },
            payload: {
              headers: ['항목', '값'],
              rows: [
                ['예시 1', '내용 1'],
                ['예시 2', '내용 2'],
              ],
              style: 'default',
            },
            preview,
          },
        ]
      } else if (intent === 'insert_illustration') {
        summary = 'Illustration insertion preview generated.'
        commands = [
          {
            type: 'insert_illustration',
            target: {
              chapterId,
              position: 1,
            },
            payload: {
              imageSource: 'generated://mock-image',
              alt: userPrompt || '생성된 일러스트',
              caption: 'AI 생성 일러스트(미리보기)',
            },
            preview,
          },
        ]
      } else {
        summary = 'Feedback report preview generated.'
        commands = [
          {
            type: 'feedback_report',
            target: {
              chapterId,
            },
            payload: {
              items: [
                {
                  issue: '문단 길이가 길 수 있습니다.',
                  evidence: '한 문단에 문장이 과도하게 밀집되어 있습니다.',
                  suggestion: '문단을 분리해 가독성을 높이세요.',
                },
              ],
            },
            preview: true,
          },
        ]
      }

      const envelope = {
        schemaVersion: AI_COMMAND_SCHEMA_VERSION,
        requestId,
        idempotencyKey,
        intent,
        baseProjectRevision,
        generatedAt: nowIso(),
        summary,
        warnings: [],
        commands,
        meta: {
          modelId: 'mock-copilot',
          modelVersion: 'v1',
          userId: requestUserId,
        },
      }

      return json(res, 200, {
        requestId,
        status: 'ok',
        envelope,
        validation: {
          code: 'OK',
          errors: [],
          warnings: [],
          previewOnly: false,
        },
        generatedAt: nowIso(),
      })
    }

    return notFound(res)
  } catch (error) {
    return json(res, 500, {
      error: error instanceof Error ? error.message : String(error),
    })
  }
})

server.listen(port, host, () => {
  console.log(`[subscription-mock] listening on http://${host}:${port}`)
  console.log('[subscription-mock] endpoints:')
  console.log(' - GET  /healthz')
  console.log(' - GET  /v1/auth/session')
  console.log(' - POST /v1/auth/google/sign-in')
  console.log(' - POST /v1/auth/sign-out')
  console.log(' - GET  /v1/subscription/entitlements')
  console.log(' - POST /v1/subscription/gate/check')
  console.log(' - POST /v1/subscription/credits/refund')
  console.log(' - POST /v1/subscription/plan/set')
  console.log(' - POST /v1/billing/bindings/register')
  console.log(' - POST /v1/billing/webhooks/portone')
  console.log(' - POST /v1/billing/webhooks/stripe')
  console.log(' - POST /v1/ai/requests')
  console.log(`[subscription-mock] auth header: ${AUTH_SESSION_HEADER}`)
  console.log(`[subscription-mock] protected methods require loopback + header ${MOCK_AUTH_HEADER}`)
})
