#!/usr/bin/env node
import http from 'node:http'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import {
  isBillingWebhookSignatureError,
  verifyPortoneWebhookSignature as verifyPortoneWebhookSignatureShared,
} from '../shared/billingWebhookSignatures.ts'
import { parseCreateChapterBundleFromPrompt, parseCreateChapterDraftFromPrompt } from '../shared/createChapterPromptParser.ts'
import {
  parseInsertIllustrationDraftFromPrompt,
  parseInsertTableDraftFromPrompt,
} from '../shared/copilotStructuredPromptParser.ts'
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
import { resolveCopilotIntentPlan } from '../shared/copilotIntentPlanner.ts'

const host = String(process.env.SUBSCRIPTION_API_HOST ?? '127.0.0.1').trim() || '127.0.0.1'
const port = Number(process.env.SUBSCRIPTION_API_PORT ?? 8787)
const NODE_ENV = String(process.env.NODE_ENV ?? 'development').trim().toLowerCase()
const IS_PRODUCTION = NODE_ENV === 'production'

const SUPABASE_URL = String(process.env.SUPABASE_URL ?? '').trim().replace(/\/+$/, '')
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim()

const PORTONE_API_BASE_URL = String(process.env.PORTONE_API_BASE_URL ?? 'https://api.portone.io')
  .trim()
  .replace(/\/+$/, '')
const PORTONE_API_SECRET = String(process.env.PORTONE_API_SECRET ?? '').trim()
const PORTONE_WEBHOOK_SECRET_PRIMARY = String(process.env.PORTONE_WEBHOOK_SECRET_PRIMARY ?? '').trim()
const PORTONE_WEBHOOK_SECRET_SECONDARY = String(process.env.PORTONE_WEBHOOK_SECRET_SECONDARY ?? '').trim()
const PORTONE_WEBHOOK_TOLERANCE_SECONDS = Math.max(
  1,
  Math.floor(Number(process.env.PORTONE_WEBHOOK_TOLERANCE_SECONDS ?? 300)),
)

const AI_PROVIDER = String(process.env.AI_PROVIDER ?? 'stub').trim().toLowerCase()
const AI_MODEL = String(process.env.AI_MODEL ?? 'openai/gpt-oss-120b').trim()
const AI_REQUEST_TIMEOUT_MS = Math.max(
  1000,
  Math.floor(Number(process.env.AI_REQUEST_TIMEOUT_MS ?? 20000)),
)
const GROQ_API_BASE_URL = String(process.env.GROQ_API_BASE_URL ?? 'https://api.groq.com/openai/v1')
  .trim()
  .replace(/\/+$/, '')
const GROQ_API_KEY = String(process.env.GROQ_API_KEY ?? '').trim()
const OPENAI_API_BASE_URL = String(process.env.OPENAI_API_BASE_URL ?? 'https://api.openai.com/v1')
  .trim()
  .replace(/\/+$/, '')
const OPENAI_API_KEY = String(process.env.OPENAI_API_KEY ?? '').trim()

const OPERATOR_API_TOKEN = String(process.env.SUBSCRIPTION_API_OPERATOR_TOKEN ?? '').trim()
const ALLOW_LOOPBACK_OPERATOR_ACCESS = resolveBooleanEnv(
  process.env.SUBSCRIPTION_API_ALLOW_LOOPBACK_OPERATOR_ACCESS,
  false,
)
const ENABLE_DEV_AUTH_STUB = resolveBooleanEnv(
  process.env.SUBSCRIPTION_API_ENABLE_DEV_AUTH_STUB,
  !IS_PRODUCTION,
)
const ENABLE_PLAN_OVERRIDE_ENDPOINT = resolveBooleanEnv(
  process.env.SUBSCRIPTION_API_ENABLE_PLAN_OVERRIDE_ENDPOINT,
  !IS_PRODUCTION,
)
const SESSION_TTL_SECONDS = Math.max(
  60,
  Math.floor(Number(process.env.SUBSCRIPTION_API_SESSION_TTL_SECONDS ?? 60 * 60)),
)
const SESSION_SLIDING_RENEW = resolveBooleanEnv(
  process.env.SUBSCRIPTION_API_SESSION_SLIDING_RENEW,
  true,
)
const CORS_ALLOW_ORIGINS = parseCsvEnv(
  process.env.SUBSCRIPTION_API_CORS_ALLOW_ORIGINS ??
    (IS_PRODUCTION ? '' : 'http://127.0.0.1:5173,http://localhost:5173'),
)
const HEALTHZ_VERBOSE = resolveBooleanEnv(process.env.SUBSCRIPTION_API_HEALTHZ_VERBOSE, !IS_PRODUCTION)
const RATE_LIMIT_WINDOW_MS = Math.max(
  1000,
  Math.floor(Number(process.env.SUBSCRIPTION_API_RATE_LIMIT_WINDOW_MS ?? 60_000)),
)
const RATE_LIMIT_DEFAULT_MAX_REQUESTS = Math.max(
  1,
  Math.floor(Number(process.env.SUBSCRIPTION_API_RATE_LIMIT_DEFAULT_MAX_REQUESTS ?? 180)),
)
const RATE_LIMIT_AUTH_MAX_REQUESTS = Math.max(
  1,
  Math.floor(Number(process.env.SUBSCRIPTION_API_RATE_LIMIT_AUTH_MAX_REQUESTS ?? 30)),
)
const RATE_LIMIT_AI_MAX_REQUESTS = Math.max(
  1,
  Math.floor(Number(process.env.SUBSCRIPTION_API_RATE_LIMIT_AI_MAX_REQUESTS ?? 60)),
)
const RATE_LIMIT_WEBHOOK_MAX_REQUESTS = Math.max(
  1,
  Math.floor(Number(process.env.SUBSCRIPTION_API_RATE_LIMIT_WEBHOOK_MAX_REQUESTS ?? 120)),
)
const RATE_LIMIT_SYNC_MAX_REQUESTS = Math.max(
  1,
  Math.floor(Number(process.env.SUBSCRIPTION_API_RATE_LIMIT_SYNC_MAX_REQUESTS ?? 20)),
)
const RATE_LIMIT_MAX_KEYS = Math.max(
  100,
  Math.floor(Number(process.env.SUBSCRIPTION_API_RATE_LIMIT_MAX_KEYS ?? 20000)),
)
const RATE_LIMIT_CLEANUP_INTERVAL_MS = Math.max(
  1000,
  Math.floor(Number(process.env.SUBSCRIPTION_API_RATE_LIMIT_CLEANUP_INTERVAL_MS ?? 30_000)),
)
const TRUST_PROXY_FORWARDED_FOR = resolveBooleanEnv(
  process.env.SUBSCRIPTION_API_TRUST_PROXY_FORWARDED_FOR,
  false,
)

const MAX_REQUEST_BODY_BYTES = Math.max(
  1024,
  Math.floor(Number(process.env.SUBSCRIPTION_API_MAX_BODY_BYTES ?? 256 * 1024)),
)

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const GUEST_USER_ID =
  normalizeUuidOrNull(process.env.SUBSCRIPTION_API_GUEST_USER_ID) ??
  '00000000-0000-4000-8000-000000000000'

const SESSION_HEADER = 'x-bookspace-session-token'
const OPERATOR_HEADER = 'x-bookspace-api-token'
const PORTONE_WEBHOOK_ID_HEADER = 'webhook-id'
const PORTONE_WEBHOOK_TIMESTAMP_HEADER = 'webhook-timestamp'
const PORTONE_WEBHOOK_SIGNATURE_HEADER = 'webhook-signature'

const CORS_ALLOWED_HEADERS = [
  'Content-Type',
  'Accept',
  'X-Bookspace-Session-Token',
  'X-Bookspace-Api-Token',
  'Webhook-Id',
  'Webhook-Timestamp',
  'Webhook-Signature',
]
const CORS_EXPOSE_HEADERS = ['X-Bookspace-Session-Token']

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
const KNOWN_PORTONE_EVENT_TYPES = new Set([
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

const authSessionByToken = new Map()
const authUserIdByEmail = new Map()
const rateLimitStore = new Map()
let rateLimitLastCleanupAt = 0

if (!Number.isFinite(port) || port <= 0) {
  throw new Error('SUBSCRIPTION_API_PORT must be a valid positive number')
}
if (!SUPABASE_URL) {
  throw new Error('SUPABASE_URL is required')
}
if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')
}
if (IS_PRODUCTION && !OPERATOR_API_TOKEN) {
  throw new Error('SUBSCRIPTION_API_OPERATOR_TOKEN is required in production')
}
if (IS_PRODUCTION && ENABLE_DEV_AUTH_STUB) {
  throw new Error('SUBSCRIPTION_API_ENABLE_DEV_AUTH_STUB must be disabled in production')
}
if (IS_PRODUCTION && ENABLE_PLAN_OVERRIDE_ENDPOINT) {
  throw new Error('SUBSCRIPTION_API_ENABLE_PLAN_OVERRIDE_ENDPOINT must be disabled in production')
}
if (IS_PRODUCTION && CORS_ALLOW_ORIGINS.length === 0) {
  throw new Error('SUBSCRIPTION_API_CORS_ALLOW_ORIGINS is required in production')
}

function resolveBooleanEnv(raw, defaultValue) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return defaultValue
  const normalized = String(raw).trim().toLowerCase()
  return normalized !== '0' && normalized !== 'false' && normalized !== 'off' && normalized !== 'no'
}

function parseCsvEnv(raw) {
  const text = String(raw ?? '').trim()
  if (!text) return []
  return text
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
}

function nowIso() {
  return new Date().toISOString()
}

function createRequestError(statusCode, message, code = 'invalid-request') {
  const error = new Error(String(message || 'request failed'))
  error.statusCode = Number(statusCode) || 500
  error.code = String(code || 'invalid-request')
  return error
}

function json(res, statusCode, payload, extraHeaders = {}) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders,
  })
  res.end(JSON.stringify(payload))
}

function badRequest(res, message, code = 'invalid-request') {
  json(res, 400, { error: message, code })
}

function unauthorized(res, message = 'authentication required') {
  json(res, 401, { error: message, code: 'unauthorized' })
}

function forbidden(res, message = 'forbidden') {
  json(res, 403, { error: message, code: 'forbidden' })
}

function methodNotAllowed(res) {
  json(res, 405, { error: 'method not allowed', code: 'method-not-allowed' })
}

function notFound(res) {
  json(res, 404, { error: 'not found', code: 'not-found' })
}

function serviceUnavailable(res, message) {
  json(res, 503, { error: message, code: 'service-unavailable' })
}

function tooManyRequests(res, message = 'rate limit exceeded') {
  json(res, 429, { error: message, code: 'rate-limit-exceeded' })
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null
}

function resolveClientIdentifier(req) {
  const forwardedFor = TRUST_PROXY_FORWARDED_FOR ? readHeader(req.headers, 'x-forwarded-for') : ''
  if (forwardedFor) return forwardedFor.split(',')[0].trim()
  return String(req.socket?.remoteAddress ?? 'unknown')
}

function resolveRateLimitMaxForPath(path) {
  if (path === '/v1/auth/google/sign-in') return RATE_LIMIT_AUTH_MAX_REQUESTS
  if (path === '/v1/ai/requests') return RATE_LIMIT_AI_MAX_REQUESTS
  if (path === '/v1/ai/chat') return RATE_LIMIT_AI_MAX_REQUESTS
  if (path === '/v1/billing/webhooks/portone') return RATE_LIMIT_WEBHOOK_MAX_REQUESTS
  if (/^\/v1\/billing\/payments\/[^/]+\/sync$/.test(path)) return RATE_LIMIT_SYNC_MAX_REQUESTS
  return RATE_LIMIT_DEFAULT_MAX_REQUESTS
}

function checkAndConsumeRateLimit(req, path) {
  const now = Date.now()
  if (now - rateLimitLastCleanupAt >= RATE_LIMIT_CLEANUP_INTERVAL_MS) {
    cleanupRateLimitStore(now)
    rateLimitLastCleanupAt = now
  }
  if (!path || path === '/healthz') return { allowed: true, remaining: RATE_LIMIT_DEFAULT_MAX_REQUESTS }
  const clientId = resolveClientIdentifier(req)
  const maxRequests = resolveRateLimitMaxForPath(path)
  const key = `${path}|${clientId}`
  const existing = rateLimitStore.get(key)
  if (!existing || now >= existing.resetAt) {
    rateLimitStore.set(key, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    })
    return { allowed: true, remaining: maxRequests - 1 }
  }

  if (existing.count >= maxRequests) {
    return { allowed: false, remaining: 0, retryAfterMs: Math.max(0, existing.resetAt - now) }
  }

  existing.count += 1
  rateLimitStore.set(key, existing)
  return { allowed: true, remaining: Math.max(0, maxRequests - existing.count) }
}

function cleanupRateLimitStore(nowMs) {
  for (const [key, state] of rateLimitStore.entries()) {
    if (!state || nowMs >= Number(state.resetAt ?? 0)) {
      rateLimitStore.delete(key)
    }
  }
  if (rateLimitStore.size <= RATE_LIMIT_MAX_KEYS) return

  for (const key of rateLimitStore.keys()) {
    rateLimitStore.delete(key)
    if (rateLimitStore.size <= RATE_LIMIT_MAX_KEYS) break
  }
}

function normalizeTextOrNull(value) {
  const text = String(value ?? '').trim()
  return text || null
}

function normalizeUuidOrNull(value) {
  const text = String(value ?? '').trim().toLowerCase()
  if (!text) return null
  if (!UUID_PATTERN.test(text)) return null
  return text
}

function normalizeIntegerOrNull(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  return Math.max(0, Math.floor(parsed))
}

function normalizeIsoDateOrNull(value) {
  if (value === null || value === undefined) return null
  const parsed = Date.parse(String(value))
  if (!Number.isFinite(parsed)) return null
  return new Date(parsed).toISOString()
}

function normalizePlanOrNull(value) {
  const normalized = String(value ?? '')
    .trim()
    .toUpperCase()
  return ALLOWED_PLANS.has(normalized) ? normalized : null
}

function normalizePlan(value) {
  return normalizePlanOrNull(value) ?? 'FREE'
}

function normalizeSubscriptionStatusOrNull(value) {
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

function resolveDefaultAiCredits(plan) {
  if (plan === 'PRO') return 300
  if (plan === 'PRO_LITE') return 100
  return 0
}

function normalizeEmail(value) {
  const email = String(value ?? '').trim().toLowerCase()
  if (!email) return ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return ''
  return email
}

function normalizeDisplayName(value) {
  const name = String(value ?? '').trim()
  return name || ''
}

function readHeader(headers, headerName) {
  const direct = headers?.[headerName]
  if (Array.isArray(direct)) return String(direct[0] ?? '').trim()
  if (direct) return String(direct).trim()
  const lower = headers?.[headerName.toLowerCase()]
  if (Array.isArray(lower)) return String(lower[0] ?? '').trim()
  if (lower) return String(lower).trim()
  return ''
}

function applyCorsHeaders(req, res) {
  const origin = readHeader(req.headers, 'origin')
  const allowOrigin = origin && CORS_ALLOW_ORIGINS.includes(origin) ? origin : ''
  if (allowOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowOrigin)
    res.setHeader('Access-Control-Allow-Credentials', 'true')
  }
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', CORS_ALLOWED_HEADERS.join(', '))
  res.setHeader('Access-Control-Expose-Headers', CORS_EXPOSE_HEADERS.join(', '))
  return !origin || Boolean(allowOrigin)
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

async function readJsonBody(req, limitBytes = MAX_REQUEST_BODY_BYTES) {
  const raw = await readRawBody(req, limitBytes)
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return asRecord(parsed) ?? {}
  } catch {
    throw createRequestError(400, 'invalid json body', 'invalid-json')
  }
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

function createSessionExpiresAt() {
  return new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString()
}

function getSessionResponseHeaders(token) {
  return {
    'X-Bookspace-Session-Token': token,
  }
}

function createSessionToken() {
  return `sess_${randomBytes(18).toString('base64url')}`
}

function stableUuidFromText(text) {
  const seed = createHash('sha256').update(String(text)).digest('hex')
  return `${seed.slice(0, 8)}-${seed.slice(8, 12)}-4${seed.slice(13, 16)}-a${seed.slice(17, 20)}-${seed.slice(20, 32)}`
}

function resolveGoogleUserId(email) {
  const normalizedEmail = normalizeEmail(email)
  if (!normalizedEmail) {
    return stableUuidFromText(`google:${randomBytes(8).toString('hex')}`)
  }
  const cached = authUserIdByEmail.get(normalizedEmail)
  if (cached) return cached
  const created = stableUuidFromText(`google:${normalizedEmail}`)
  authUserIdByEmail.set(normalizedEmail, created)
  return created
}

function getAuthSessionFromRequest(req) {
  const token = readHeader(req.headers, SESSION_HEADER)
  if (!token) return null
  const session = authSessionByToken.get(token) ?? null
  if (!session) return null
  const expiresAt = Date.parse(String(session.expiresAt ?? ''))
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    authSessionByToken.delete(token)
    return null
  }
  if (SESSION_SLIDING_RENEW) {
    session.expiresAt = createSessionExpiresAt()
  }
  return session
}

function requireAuthenticatedSession(res, authSession) {
  if (!authSession) {
    unauthorized(res)
    return false
  }
  return true
}

function isLoopbackAddress(address) {
  const normalized = String(address ?? '').trim().toLowerCase()
  return (
    normalized === '127.0.0.1' ||
    normalized === '::1' ||
    normalized === '::ffff:127.0.0.1' ||
    normalized.startsWith('::ffff:127.')
  )
}

function requireOperatorAccess(req, res) {
  const token = readHeader(req.headers, OPERATOR_HEADER)
  if (OPERATOR_API_TOKEN) {
    if (secureTextEqual(token, OPERATOR_API_TOKEN)) return true
    forbidden(res, `${OPERATOR_HEADER} header is invalid`)
    return false
  }

  if (!ALLOW_LOOPBACK_OPERATOR_ACCESS || IS_PRODUCTION) {
    forbidden(res, 'operator token is required')
    return false
  }

  const remoteAddress = req.socket?.remoteAddress
  if (isLoopbackAddress(remoteAddress)) return true
  forbidden(res, 'operator endpoint is loopback-only')
  return false
}

function buildSupabaseRequestHeaders(extraHeaders = {}) {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    Accept: 'application/json',
    ...extraHeaders,
  }
}

function parseJsonText(text) {
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function extractSupabaseErrorMessage(payload, fallbackStatusText) {
  if (asRecord(payload)) {
    return String(payload.message ?? payload.error_description ?? payload.error ?? fallbackStatusText ?? 'request failed')
  }
  if (typeof payload === 'string' && payload.trim()) return payload.trim()
  return String(fallbackStatusText || 'request failed')
}

async function supabaseRequest(method, path, options = {}) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${String(path ?? '').replace(/^\/+/, '')}`)
  const query = asRecord(options.query)
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue
      url.searchParams.set(key, String(value))
    }
  }

  const headers = buildSupabaseRequestHeaders(options.headers ?? {})
  const requestInit = {
    method,
    headers,
  }
  if (options.body !== undefined) {
    requestInit.body = JSON.stringify(options.body)
    requestInit.headers = {
      ...headers,
      'Content-Type': 'application/json',
    }
  }

  const response = await fetch(url, requestInit)
  const text = await response.text()
  const payload = parseJsonText(text) ?? text
  if (!response.ok) {
    throw createRequestError(
      502,
      `supabase request failed (${response.status}): ${extractSupabaseErrorMessage(payload, response.statusText)}`,
      'supabase-error',
    )
  }
  return payload
}

async function supabaseRpc(functionName, params) {
  const payload = await supabaseRequest('POST', `rpc/${functionName}`, {
    body: params,
  })
  if (Array.isArray(payload)) return payload
  if (payload === null || payload === '') return []
  return [payload]
}

async function fetchSubscriptionAccount(userId) {
  const payload = await supabaseRequest('GET', 'subscription_accounts', {
    query: {
      select: 'user_id,plan,status,ai_credits_monthly,ai_credits_remaining',
      user_id: `eq.${userId}`,
      limit: 1,
    },
  })
  return Array.isArray(payload) && payload[0] ? payload[0] : null
}

async function fetchEntitlementOverrides(userId) {
  const payload = await supabaseRequest('GET', 'entitlement_overrides', {
    query: {
      select: 'feature_id,enabled,is_active,expires_at',
      user_id: `eq.${userId}`,
      limit: 2000,
    },
  })
  return Array.isArray(payload) ? payload : []
}

async function ensureSubscriptionAccount(userId) {
  const existing = await fetchSubscriptionAccount(userId)
  if (existing) return existing

  const inserted = await supabaseRequest('POST', 'subscription_accounts', {
    headers: {
      Prefer: 'return=representation',
    },
    body: {
      user_id: userId,
      plan: 'FREE',
      status: 'active',
      ai_credits_monthly: 0,
      ai_credits_remaining: null,
    },
  })
  if (Array.isArray(inserted) && inserted[0]) return inserted[0]
  return await fetchSubscriptionAccount(userId)
}

function isOverrideActive(row, nowMs) {
  const record = asRecord(row)
  if (!record) return false
  if (record.is_active !== true) return false
  const expiresAt = normalizeIsoDateOrNull(record.expires_at)
  if (!expiresAt) return true
  return Date.parse(expiresAt) > nowMs
}

function normalizeFeatureIdOrNull(value) {
  const featureId = String(value ?? '').trim().toLowerCase()
  if (!featureId) return null
  if (!/^(core|ai)\.[a-z0-9._-]+$/.test(featureId)) return null
  return featureId
}

async function buildEntitlementsSnapshot(userId) {
  const account = await ensureSubscriptionAccount(userId)
  const overrides = await fetchEntitlementOverrides(userId)
  const nowMs = Date.now()

  const enabledFeatures = {}
  const disabledFeatures = {}
  for (const row of overrides) {
    if (!isOverrideActive(row, nowMs)) continue
    const featureId = normalizeFeatureIdOrNull(row.feature_id)
    if (!featureId) continue
    if (row.enabled === true) enabledFeatures[featureId] = true
    if (row.enabled === false) disabledFeatures[featureId] = true
  }

  return {
    plan: normalizePlan(account?.plan),
    enabledFeatures,
    disabledFeatures,
    aiCreditsRemaining: normalizeIntegerOrNull(account?.ai_credits_remaining),
  }
}

async function setSubscriptionPlanForUser(userId, plan) {
  const normalizedPlan = normalizePlanOrNull(plan)
  if (!normalizedPlan) {
    throw createRequestError(400, 'invalid plan', 'invalid-plan')
  }

  const account = await ensureSubscriptionAccount(userId)
  const existingRemaining = normalizeIntegerOrNull(account?.ai_credits_remaining)
  const aiCreditsMonthly = normalizedPlan === 'FREE' ? 0 : resolveDefaultAiCredits(normalizedPlan)
  const aiCreditsRemaining = normalizedPlan === 'FREE' ? null : existingRemaining ?? aiCreditsMonthly

  await supabaseRequest('PATCH', 'subscription_accounts', {
    query: {
      user_id: `eq.${userId}`,
    },
    headers: {
      Prefer: 'return=representation',
    },
    body: {
      plan: normalizedPlan,
      status: 'active',
      ai_credits_monthly: aiCreditsMonthly,
      ai_credits_remaining: aiCreditsRemaining,
    },
  })

  const snapshot = await buildEntitlementsSnapshot(userId)
  return {
    success: true,
    snapshot,
    updatedAt: nowIso(),
  }
}

async function runSubscriptionGateCheck(userId, body) {
  const requestId = String(body?.requestId ?? '').trim()
  const featureId = String(body?.featureId ?? '').trim().toLowerCase()
  const requiredCredits = Math.max(1, Math.floor(Number(body?.requiredCredits ?? 1) || 1))
  const consumeCredit = Boolean(body?.consumeCredit)
  const idempotencyKey = String(body?.idempotencyKey ?? '').trim() || null

  if (!requestId) {
    throw createRequestError(400, 'requestId required', 'request-id-required')
  }
  if (!/^(core|ai)\.[a-z0-9._-]+$/.test(featureId)) {
    throw createRequestError(400, 'featureId invalid', 'feature-id-invalid')
  }

  const rows = await supabaseRpc('bookspace_gate_check_and_consume', {
    p_user_id: userId,
    p_request_id: requestId,
    p_feature_id: featureId,
    p_required_credits: requiredCredits,
    p_consume_credit: consumeCredit,
    p_idempotency_key: idempotencyKey,
    p_context: {},
  })
  const row = rows[0]
  if (!asRecord(row)) {
    throw createRequestError(502, 'bookspace_gate_check_and_consume returned no rows', 'runtime-empty-row')
  }

  return {
    requestId: String(row.request_id ?? requestId),
    allowed: Boolean(row.allowed),
    reason: String(row.reason ?? 'plan-does-not-allow-feature'),
    plan: normalizePlan(row.plan),
    aiCreditsRemaining: normalizeIntegerOrNull(row.ai_credits_remaining),
    checkedAt: normalizeIsoDateOrNull(row.checked_at) ?? nowIso(),
  }
}

async function runSubscriptionCreditsRefund(userId, body) {
  const requestId = String(body?.requestId ?? '').trim()
  const idempotencyKey = String(body?.idempotencyKey ?? '').trim()
  const reason = String(body?.reason ?? '').trim()

  if (!requestId) {
    throw createRequestError(400, 'requestId required', 'request-id-required')
  }
  if (!idempotencyKey) {
    throw createRequestError(400, 'idempotencyKey required', 'idempotency-key-required')
  }
  if (!reason) {
    throw createRequestError(400, 'reason required', 'reason-required')
  }

  const rows = await supabaseRpc('bookspace_credit_refund', {
    p_user_id: userId,
    p_request_id: requestId,
    p_idempotency_key: idempotencyKey,
    p_reason: reason,
    p_context: {},
  })
  const row = rows[0]
  if (!asRecord(row)) {
    throw createRequestError(502, 'bookspace_credit_refund returned no rows', 'runtime-empty-row')
  }

  return {
    requestId: String(row.request_id ?? requestId),
    status: String(row.status ?? 'not-found'),
    refundedCredits: normalizeIntegerOrNull(row.refunded_credits) ?? 0,
    aiCreditsRemaining: normalizeIntegerOrNull(row.ai_credits_remaining),
    refundedAt: normalizeIsoDateOrNull(row.refunded_at) ?? nowIso(),
  }
}

function normalizeBillingProvider(value) {
  const provider = String(value ?? '')
    .trim()
    .toLowerCase()
  if (provider !== 'portone' && provider !== 'stripe') {
    throw createRequestError(400, 'provider invalid', 'provider-invalid')
  }
  return provider
}

async function registerBillingBindingForUser(userId, body) {
  const provider = normalizeBillingProvider(body?.provider ?? 'portone')
  const providerCustomerId = normalizeTextOrNull(body?.providerCustomerId)
  const providerSubscriptionId = normalizeTextOrNull(body?.providerSubscriptionId)
  if (!providerCustomerId && !providerSubscriptionId) {
    throw createRequestError(
      400,
      'providerCustomerId or providerSubscriptionId required',
      'binding-id-required',
    )
  }

  const rows = await supabaseRpc('bookspace_register_billing_binding', {
    p_provider: provider,
    p_user_id: userId,
    p_provider_customer_id: providerCustomerId,
    p_provider_subscription_id: providerSubscriptionId,
    p_context: {
      source: 'subscription-runtime-api',
      at: nowIso(),
    },
  })

  const row = rows[0]
  if (!asRecord(row)) {
    throw createRequestError(502, 'bookspace_register_billing_binding returned no rows', 'runtime-empty-row')
  }

  return {
    provider: String(row.provider ?? provider),
    userId: String(row.user_id ?? userId),
    providerCustomerId: normalizeTextOrNull(row.provider_customer_id),
    providerSubscriptionId: normalizeTextOrNull(row.provider_subscription_id),
    registered: Boolean(row.registered),
    registeredAt: normalizeIsoDateOrNull(row.registered_at) ?? nowIso(),
  }
}

function normalizeApplyEvent(event) {
  if (!asRecord(event)) {
    throw createRequestError(400, 'billing event object required', 'billing-event-required')
  }
  const provider = normalizeBillingProvider(event.provider ?? 'portone')
  const eventId = normalizeTextOrNull(event.eventId)
  const eventType = normalizeTextOrNull(event.eventType)
  if (!eventId) {
    throw createRequestError(400, 'eventId required', 'event-id-required')
  }
  if (!eventType) {
    throw createRequestError(400, 'eventType required', 'event-type-required')
  }

  return {
    provider,
    eventId,
    eventType,
    userId: normalizeUuidOrNull(event.userId),
    plan: normalizePlanOrNull(event.plan),
    subscriptionStatus: normalizeSubscriptionStatusOrNull(event.subscriptionStatus),
    providerCustomerId: normalizeTextOrNull(event.providerCustomerId),
    providerSubscriptionId: normalizeTextOrNull(event.providerSubscriptionId),
    periodStartAt: normalizeIsoDateOrNull(event.periodStartAt),
    periodEndAt: normalizeIsoDateOrNull(event.periodEndAt),
    aiCreditsMonthly: normalizeIntegerOrNull(event.aiCreditsMonthly),
    aiCreditsRemaining: normalizeIntegerOrNull(event.aiCreditsRemaining),
    payload: asRecord(event.payload) ?? event.payload ?? {},
  }
}

async function applyBillingWebhookEvent(event) {
  const normalized = normalizeApplyEvent(event)
  const rows = await supabaseRpc('bookspace_apply_billing_webhook', {
    p_provider: normalized.provider,
    p_event_id: normalized.eventId,
    p_event_type: normalized.eventType,
    p_user_id: normalized.userId,
    p_plan: normalized.plan,
    p_subscription_status: normalized.subscriptionStatus,
    p_provider_customer_id: normalized.providerCustomerId,
    p_provider_subscription_id: normalized.providerSubscriptionId,
    p_period_start_at: normalized.periodStartAt,
    p_period_end_at: normalized.periodEndAt,
    p_ai_credits_monthly: normalized.aiCreditsMonthly,
    p_ai_credits_remaining: normalized.aiCreditsRemaining,
    p_payload: normalized.payload,
  })

  const row = rows[0]
  if (!asRecord(row)) {
    throw createRequestError(
      502,
      'bookspace_apply_billing_webhook returned no rows',
      'runtime-empty-row',
    )
  }

  return {
    eventId: String(row.event_id ?? normalized.eventId),
    status: String(row.result ?? 'ignored'),
    applied: Boolean(row.applied),
    processedAt: normalizeIsoDateOrNull(row.processed_at) ?? nowIso(),
  }
}

function secureTextEqual(left, right) {
  const leftBuffer = Buffer.from(String(left ?? ''), 'utf8')
  const rightBuffer = Buffer.from(String(right ?? ''), 'utf8')
  if (leftBuffer.length === 0 || rightBuffer.length === 0) return false
  if (leftBuffer.length !== rightBuffer.length) return false
  return timingSafeEqual(leftBuffer, rightBuffer)
}

function normalizePortoneVerificationError(error) {
  if (isBillingWebhookSignatureError(error)) {
    switch (error.code) {
      case 'portone-webhook-body-required':
        return createRequestError(400, 'portone webhook raw body is required', 'webhook-body-required')
      case 'portone-signing-secret-required':
        return createRequestError(503, 'portone webhook signing secret is missing', 'webhook-secret-missing')
      case 'portone-header-webhook-id-required':
        return createRequestError(400, 'webhook-id header required', 'webhook-id-required')
      case 'portone-header-webhook-timestamp-required':
        return createRequestError(400, 'webhook-timestamp header required', 'webhook-timestamp-required')
      case 'portone-header-webhook-signature-required':
        return createRequestError(400, 'webhook-signature header required', 'webhook-signature-required')
      case 'portone-header-webhook-timestamp-invalid':
        return createRequestError(400, 'invalid webhook-timestamp header', 'invalid-webhook-timestamp')
      case 'portone-header-webhook-signature-invalid':
        return createRequestError(400, 'invalid webhook-signature header', 'invalid-webhook-signature')
      case 'portone-signature-expired':
        return createRequestError(400, 'portone webhook signature expired', 'webhook-signature-expired')
      case 'portone-signature-mismatch':
      default:
        return createRequestError(400, 'portone webhook signature mismatch', 'webhook-signature-mismatch')
    }
  }

  return createRequestError(400, 'portone webhook signature mismatch', 'webhook-signature-mismatch')
}

function verifyPortoneWebhookSignature({ rawBody, headers, signingSecret, toleranceSeconds, nowMs }) {
  try {
    return verifyPortoneWebhookSignatureShared({
      rawBody,
      headers,
      signingSecret,
      toleranceSeconds,
      nowMs,
      decodeWhsecSecret: true,
    })
  } catch (error) {
    throw normalizePortoneVerificationError(error)
  }
}

function verifyPortoneWebhookWithRotation({ rawBody, headers }) {
  const secrets = [PORTONE_WEBHOOK_SECRET_PRIMARY, PORTONE_WEBHOOK_SECRET_SECONDARY].filter(Boolean)
  if (secrets.length === 0) {
    throw createRequestError(503, 'PORTONE_WEBHOOK_SECRET_PRIMARY is required', 'webhook-secret-not-configured')
  }

  let lastError = null
  for (const [index, secret] of secrets.entries()) {
    try {
      const verified = verifyPortoneWebhookSignature({
        rawBody,
        headers,
        signingSecret: secret,
        toleranceSeconds: PORTONE_WEBHOOK_TOLERANCE_SECONDS,
      })
      return {
        ...verified,
        secretSlot: index === 0 ? 'primary' : 'secondary',
      }
    } catch (error) {
      lastError = error
    }
  }

  throw lastError ?? createRequestError(400, 'portone webhook signature mismatch', 'webhook-signature-mismatch')
}

function normalizePortoneTypeToSubscriptionStatus(eventType) {
  if (
    eventType === 'Transaction.Paid' ||
    eventType === 'BillingKey.Issued' ||
    eventType === 'BillingKey.Updated'
  ) {
    return 'active'
  }
  if (eventType === 'Transaction.Cancelled' || eventType === 'BillingKey.Deleted') {
    return 'canceled'
  }
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

function extractBookspaceMetadata(data, metadata) {
  return {
    userId: normalizeUuidOrNull(
      data.userId ??
        data.user_id ??
        metadata.bookspace_user_id ??
        metadata.bookspaceUserId ??
        metadata.user_id ??
        metadata.userId,
    ),
    plan: normalizePlanOrNull(
      data.plan ??
        data.bookspacePlan ??
        metadata.bookspace_plan ??
        metadata.bookspacePlan ??
        metadata.plan,
    ),
    aiCreditsMonthly: normalizeIntegerOrNull(
      data.aiCreditsMonthly ??
        data.ai_credits_monthly ??
        metadata.bookspace_ai_credits_monthly ??
        metadata.bookspaceAiCreditsMonthly ??
        metadata.aiCreditsMonthly,
    ),
    aiCreditsRemaining: normalizeIntegerOrNull(
      data.aiCreditsRemaining ??
        data.ai_credits_remaining ??
        metadata.bookspace_ai_credits_remaining ??
        metadata.bookspaceAiCreditsRemaining ??
        metadata.aiCreditsRemaining,
    ),
    periodStartAt: normalizeIsoDateOrNull(
      data.periodStartAt ??
        data.period_start_at ??
        metadata.bookspace_period_start_at ??
        metadata.bookspacePeriodStartAt,
    ),
    periodEndAt: normalizeIsoDateOrNull(
      data.periodEndAt ??
        data.period_end_at ??
        metadata.bookspace_period_end_at ??
        metadata.bookspacePeriodEndAt,
    ),
  }
}

function parsePortoneWebhook(rawBody, webhookId) {
  let parsed
  try {
    parsed = JSON.parse(rawBody)
  } catch {
    throw createRequestError(400, 'invalid webhook json body', 'invalid-json')
  }

  const root = asRecord(parsed) ?? {}
  const data = asRecord(root.data) ?? {}
  const metadata = asRecord(data.metadata) ?? {}
  const eventType = normalizeTextOrNull(root.type)
  if (!eventType) {
    throw createRequestError(400, 'portone webhook type is required', 'webhook-type-required')
  }
  const mapped = extractBookspaceMetadata(data, metadata)
  const providerCustomerId = normalizeTextOrNull(
    data.customerId ?? data.customer_id ?? data.providerCustomerId ?? data.provider_customer_id,
  )
  const providerSubscriptionId = normalizeTextOrNull(
    data.billingKey ??
      data.billing_key ??
      data.providerSubscriptionId ??
      data.provider_subscription_id ??
      data.subscriptionId,
  )
  const paymentId = normalizeTextOrNull(data.paymentId ?? data.payment_id ?? root.paymentId)

  if (!KNOWN_PORTONE_EVENT_TYPES.has(eventType)) {
    // Forward compatibility: keep processing path permissive.
  }

  return {
    provider: 'portone',
    eventId: normalizeTextOrNull(root.id) ?? webhookId,
    eventType,
    userId: mapped.userId,
    plan: mapped.plan,
    subscriptionStatus:
      normalizeSubscriptionStatusOrNull(data.subscriptionStatus ?? data.subscription_status) ??
      normalizePortoneTypeToSubscriptionStatus(eventType),
    providerCustomerId,
    providerSubscriptionId,
    periodStartAt: mapped.periodStartAt,
    periodEndAt: mapped.periodEndAt,
    aiCreditsMonthly: mapped.aiCreditsMonthly ?? (mapped.plan ? resolveDefaultAiCredits(mapped.plan) : null),
    aiCreditsRemaining: mapped.aiCreditsRemaining,
    payload: root,
    paymentId,
  }
}

function mapPortonePaymentStatusToEventType(status) {
  if (status === 'PAID') return 'Transaction.Paid'
  if (status === 'FAILED') return 'Transaction.Failed'
  if (status === 'PARTIAL_CANCELLED' || status === 'CANCELLED') return 'Transaction.Cancelled'
  if (status === 'PENDING' || status === 'PAY_PENDING') return 'Transaction.PayPending'
  if (status === 'VIRTUAL_ACCOUNT_ISSUED') return 'Transaction.VirtualAccountIssued'
  return 'Transaction.Ready'
}

function mapPortonePaymentStatusToSubscriptionStatus(status) {
  if (status === 'PAID') return 'active'
  if (status === 'PARTIAL_CANCELLED' || status === 'CANCELLED') return 'canceled'
  if (
    status === 'FAILED' ||
    status === 'PENDING' ||
    status === 'PAY_PENDING' ||
    status === 'READY' ||
    status === 'VIRTUAL_ACCOUNT_ISSUED'
  ) {
    return 'past_due'
  }
  return null
}

function parseCustomDataObject(customData) {
  if (customData === null || customData === undefined) return {}
  if (typeof customData === 'string') {
    const trimmed = customData.trim()
    if (!trimmed) return {}
    try {
      const parsed = JSON.parse(trimmed)
      return asRecord(parsed) ?? {}
    } catch {
      return {}
    }
  }
  return asRecord(customData) ?? {}
}

function eventFromPortonePayment(payment, options = {}) {
  const record = asRecord(payment) ?? {}
  const customData = parseCustomDataObject(record.customData)
  const customer = asRecord(record.customer) ?? {}

  const metadata = extractBookspaceMetadata(customData, customData)
  const paymentStatus = String(record.status ?? '').trim().toUpperCase()
  const paymentId = normalizeTextOrNull(record.id)
  const transactionId = normalizeTextOrNull(record.transactionId)
  const eventId =
    normalizeTextOrNull(options.eventId) ??
    `payment-sync:${paymentId ?? 'unknown'}:${transactionId ?? Date.now().toString()}`

  const eventType =
    normalizeTextOrNull(options.eventType) ?? mapPortonePaymentStatusToEventType(paymentStatus)
  const resolvedPlan = metadata.plan

  return {
    provider: 'portone',
    eventId,
    eventType,
    userId: metadata.userId,
    plan: resolvedPlan,
    subscriptionStatus: mapPortonePaymentStatusToSubscriptionStatus(paymentStatus),
    providerCustomerId: normalizeTextOrNull(customer.id),
    providerSubscriptionId: normalizeTextOrNull(record.billingKey),
    periodStartAt: metadata.periodStartAt ?? normalizeIsoDateOrNull(record.requestedAt),
    periodEndAt: metadata.periodEndAt,
    aiCreditsMonthly:
      metadata.aiCreditsMonthly ?? (resolvedPlan ? resolveDefaultAiCredits(resolvedPlan) : null),
    aiCreditsRemaining: metadata.aiCreditsRemaining,
    payload: {
      payment: record,
      source: options.source ?? 'portone-payment-sync',
    },
    paymentId,
  }
}

function mergeWebhookEventWithPayment(webhookEvent, payment) {
  const fromPayment = eventFromPortonePayment(payment, {
    eventId: webhookEvent.eventId,
    eventType: webhookEvent.eventType,
    source: 'portone-webhook+payment-verify',
  })
  return {
    ...webhookEvent,
    userId: webhookEvent.userId ?? fromPayment.userId,
    plan: webhookEvent.plan ?? fromPayment.plan,
    subscriptionStatus: webhookEvent.subscriptionStatus ?? fromPayment.subscriptionStatus,
    providerCustomerId: webhookEvent.providerCustomerId ?? fromPayment.providerCustomerId,
    providerSubscriptionId: webhookEvent.providerSubscriptionId ?? fromPayment.providerSubscriptionId,
    periodStartAt: webhookEvent.periodStartAt ?? fromPayment.periodStartAt,
    periodEndAt: webhookEvent.periodEndAt ?? fromPayment.periodEndAt,
    aiCreditsMonthly: webhookEvent.aiCreditsMonthly ?? fromPayment.aiCreditsMonthly,
    aiCreditsRemaining: webhookEvent.aiCreditsRemaining ?? fromPayment.aiCreditsRemaining,
    payload: {
      webhook: webhookEvent.payload,
      payment: asRecord(payment) ?? payment,
    },
  }
}

async function fetchPortonePayment(paymentId, storeId) {
  const normalizedPaymentId = normalizeTextOrNull(paymentId)
  if (!normalizedPaymentId) {
    throw createRequestError(400, 'paymentId required', 'payment-id-required')
  }
  if (!PORTONE_API_SECRET) {
    throw createRequestError(503, 'PORTONE_API_SECRET is required for payment revalidation', 'portone-secret-missing')
  }

  const url = new URL(`${PORTONE_API_BASE_URL}/payments/${encodeURIComponent(normalizedPaymentId)}`)
  if (storeId) {
    url.searchParams.set('storeId', String(storeId))
  }

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `PortOne ${PORTONE_API_SECRET}`,
      Accept: 'application/json',
    },
  })
  const text = await response.text()
  const payload = parseJsonText(text) ?? text
  if (!response.ok) {
    const error = createRequestError(
      502,
      `portone get payment failed (${response.status}): ${extractSupabaseErrorMessage(payload, response.statusText)}`,
      'portone-get-payment-failed',
    )
    error.upstreamStatus = Number(response.status) || null
    throw error
  }
  const record = asRecord(payload)
  if (!record) {
    throw createRequestError(502, 'portone payment response is invalid', 'portone-response-invalid')
  }
  return record
}

function resolveCopilotSummary(intent, commandCount = 1) {
  if (commandCount > 1) return `Composite preview generated (${commandCount} commands).`
  if (intent === 'rewrite_selection') return 'Selected text rewrite preview generated.'
  if (intent === 'append_text') return 'Append text preview generated.'
  if (intent === 'find_replace') return 'Find and replace preview generated.'
  if (intent === 'save_project') return 'Save project preview generated.'
  if (intent === 'rename_chapter') return 'Rename chapter preview generated.'
  if (intent === 'delete_chapter') return 'Delete chapter preview generated.'
  if (intent === 'move_chapter') return 'Move chapter preview generated.'
  if (intent === 'set_chapter_type') return 'Chapter type preview generated.'
  if (intent === 'set_typography') return 'Typography change preview generated.'
  if (intent === 'set_page_background') return 'Page background preview generated.'
  if (intent === 'apply_theme') return 'Theme change preview generated.'
  if (intent === 'update_book_info') return 'Book info update preview generated.'
  if (intent === 'set_cover_asset') return 'Cover asset update preview generated.'
  if (intent === 'export_project') return 'Export project preview generated.'
  if (intent === 'restore_snapshot') return 'Restore snapshot preview generated.'
  if (intent === 'create_chapter') return 'Chapter draft preview generated.'
  if (intent === 'feedback_report') return 'Feedback report preview generated.'
  if (intent === 'insert_table') return 'Table insert preview generated.'
  if (intent === 'insert_illustration') return 'Illustration insert preview generated.'
  return 'AI command preview generated.'
}

function buildBookspaceChatSystemPrompt() {
  return [
    'You are the official BookSpace Copilot for a desktop EPUB editor.',
    'Always answer in Korean, concise and practical.',
    'Never present yourself as a book recommendation or reading assistant.',
    'Do not invent unsupported capabilities.',
    'If required context is missing, ask one short clarifying question.',
    'BookSpace capabilities: rewrite selection, create XHTML page(chapter), insert table, insert illustration, feedback report, and guide EPUB/DOCX import/export/version flow.',
  ].join('\n')
}

function buildBookspaceRewriteSystemPrompt() {
  return [
    'You rewrite manuscript text for BookSpace.',
    'Return only rewritten Korean text.',
    'No explanations, no markdown, no code fences.',
    'Preserve meaning and improve readability.',
  ].join('\n')
}

function buildBookspaceChatContextBlock({
  scope,
  chapterId,
  selectedText,
  selectedRange,
  projectTitle,
  chapterCount,
  activePageTitle,
  activePageType,
}) {
  const normalizedSelection = String(selectedText ?? '').trim()
  const lines = [
    `Scope: ${String(scope ?? 'chapter')}`,
    `ChapterId: ${String(chapterId ?? 'chapter-active')}`,
    `ProjectTitle: ${String(projectTitle ?? '').trim() || '(unknown)'}`,
    `ChapterCount: ${Number.isFinite(Number(chapterCount)) ? Number(chapterCount) : 0}`,
    `ActivePageTitle: ${String(activePageTitle ?? '').trim() || '(unknown)'}`,
    `ActivePageType: ${String(activePageType ?? '').trim() || '(unknown)'}`,
    'AvailableActions: rewrite_selection, append_text, find_replace, save_project, rename_chapter, delete_chapter, move_chapter, set_chapter_type, set_typography, set_page_background, apply_theme, update_book_info, set_cover_asset, export_project, restore_snapshot, create_chapter, insert_table, insert_illustration, feedback_report',
    'DomainTerm: "빈 페이지" means new XHTML chapter page.',
  ]
  if (normalizedSelection) {
    lines.push(`SelectedText:\n${normalizedSelection}`)
  }
  if (selectedRange && Number.isFinite(Number(selectedRange.from)) && Number.isFinite(Number(selectedRange.to))) {
    lines.push(`SelectedRange=${Number(selectedRange.from)}-${Number(selectedRange.to)}`)
  }
  return lines.join('\n\n')
}

function buildCopilotCommands({ intent, chapterId, selectedText, selectedRange, userPrompt, preview }) {
  const planned = resolveCopilotIntentPlan({
    prompt: String(userPrompt || ''),
    hasSelection: String(selectedText || '').trim().length > 0,
    fallbackIntent: intent,
  })
  void planned
  const intents = [intent]
  const commands = []

  for (const plannedIntent of intents) {
    if (plannedIntent === 'rewrite_selection') {
      const rewritten = selectedText.replace(/\s+/g, ' ').trim()
      const from = Math.max(1, Math.floor(Number(selectedRange?.from ?? 0)))
      const to = Math.max(1, Math.floor(Number(selectedRange?.to ?? 0)))
      if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
        return []
      }
      commands.push({
        type: 'rewrite_selection',
        target: {
          chapterId,
          range: {
            from,
            to,
          },
        },
        payload: {
          text: rewritten.endsWith('.') ? rewritten : `${rewritten}.`,
          tone: 'clear',
          lengthPolicy: 'shorter',
        },
        preview,
      })
      continue
    }

    if (plannedIntent === 'append_text') {
      const draft = parseAppendTextDraftFromPrompt(String(userPrompt || ''))
      commands.push({
        type: 'append_text',
        target: {
          chapterId,
          position: draft.position,
        },
        payload: {
          text: draft.mode === 'generate' ? '사용자 요청을 반영한 새 본문 초안입니다.' : draft.text,
          tone: 'clear',
          lengthPolicy: 'medium',
        },
        preview,
      })
      continue
    }

    if (plannedIntent === 'find_replace') {
      const draft = parseFindReplaceDraftFromPrompt(String(userPrompt || ''))
      commands.push({
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
      })
      continue
    }

    if (plannedIntent === 'save_project') {
      const draft = parseSaveProjectDraftFromPrompt(String(userPrompt || ''))
      commands.push({
        type: 'save_project',
        target: {
          mode: draft.mode,
        },
        payload: {
          suggestedPath: draft.suggestedPath,
        },
        preview,
      })
      continue
    }

    if (plannedIntent === 'rename_chapter') {
      const draft = parseRenameChapterDraftFromPrompt(String(userPrompt || ''))
      commands.push({
        type: 'rename_chapter',
        target: {
          chapterId,
        },
        payload: {
          title: draft.title,
        },
        preview,
      })
      continue
    }

    if (plannedIntent === 'delete_chapter') {
      commands.push({
        type: 'delete_chapter',
        target: {
          chapterId,
        },
        payload: {},
        preview,
      })
      continue
    }

    if (plannedIntent === 'move_chapter') {
      const draft = parseMoveChapterDraftFromPrompt(String(userPrompt || ''))
      commands.push({
        type: 'move_chapter',
        target: {
          chapterId,
        },
        payload: {
          toIndex: draft.toIndex,
          parentId: draft.parentId,
        },
        preview,
      })
      continue
    }

    if (plannedIntent === 'set_chapter_type') {
      const draft = parseSetChapterTypeDraftFromPrompt(String(userPrompt || ''))
      commands.push({
        type: 'set_chapter_type',
        target: {
          chapterId,
        },
        payload: {
          chapterType: draft.chapterType,
          chapterKind: draft.chapterKind,
        },
        preview,
      })
      continue
    }

    if (plannedIntent === 'set_typography') {
      const draft = parseSetTypographyDraftFromPrompt(String(userPrompt || ''))
      commands.push({
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
      })
      continue
    }

    if (plannedIntent === 'set_page_background') {
      const draft = parseSetPageBackgroundDraftFromPrompt(String(userPrompt || ''))
      commands.push({
        type: 'set_page_background',
        target: {
          chapterId,
        },
        payload: {
          color: draft.color,
        },
        preview,
      })
      continue
    }

    if (plannedIntent === 'apply_theme') {
      const draft = parseApplyThemeDraftFromPrompt(String(userPrompt || ''))
      commands.push({
        type: 'apply_theme',
        target: {
          scope: 'project',
        },
        payload: {
          theme: draft.theme,
        },
        preview,
      })
      continue
    }

    if (plannedIntent === 'update_book_info') {
      const draft = parseUpdateBookInfoDraftFromPrompt(String(userPrompt || ''))
      commands.push({
        type: 'update_book_info',
        target: {
          scope: 'project',
        },
        payload: draft,
        preview,
      })
      continue
    }

    if (plannedIntent === 'set_cover_asset') {
      const draft = parseSetCoverAssetDraftFromPrompt(String(userPrompt || ''))
      commands.push({
        type: 'set_cover_asset',
        target: {
          assetType: draft.assetType,
        },
        payload: {
          source: draft.source,
          value: draft.value || 'generated://cover-asset',
        },
        preview,
      })
      continue
    }

    if (plannedIntent === 'export_project') {
      const draft = parseExportProjectDraftFromPrompt(String(userPrompt || ''))
      commands.push({
        type: 'export_project',
        target: {
          format: draft.format,
        },
        payload: {
          embedFonts: draft.embedFonts,
        },
        preview,
      })
      continue
    }

    if (plannedIntent === 'restore_snapshot') {
      const draft = parseRestoreSnapshotDraftFromPrompt(String(userPrompt || ''))
      commands.push({
        type: 'restore_snapshot',
        target: {
          snapshotId: draft.snapshotId || 'latest',
        },
        payload: {
          mode: draft.mode,
        },
        preview,
      })
      continue
    }

    if (plannedIntent === 'create_chapter') {
      const bundle = parseCreateChapterBundleFromPrompt(String(userPrompt || ''))
      if (bundle) {
        const parentRef = 'create-part-1'
        commands.push({
          type: 'create_chapter',
          target: {
            commandRef: parentRef,
            afterChapterId: chapterId,
          },
          payload: {
            title: bundle.parent.title,
            chapterType: bundle.parent.chapterType,
            chapterKind: bundle.parent.chapterKind,
            blocks: bundle.parent.blocks,
          },
          preview: request.preview,
        })
        for (let index = 0; index < bundle.children.length; index += 1) {
          const child = bundle.children[index]
          const childRef = `create-child-${index + 1}`
          commands.push({
            type: 'create_chapter',
            target: {
              commandRef: childRef,
              afterCommandRef: index === 0 ? parentRef : `create-child-${index}`,
              parentCommandRef: parentRef,
            },
            payload: {
              title: child.title,
              chapterType: child.chapterType,
              chapterKind: child.chapterKind,
              blocks: child.blocks,
            },
            preview: request.preview,
          })
        }
        continue
      }
      const draft = parseCreateChapterDraftFromPrompt(String(userPrompt || ''))
      commands.push({
        type: 'create_chapter',
        target: {
          afterChapterId: chapterId,
        },
        payload: {
          title: draft.title,
          chapterType: draft.chapterType,
          chapterKind: draft.chapterKind,
          blocks: draft.blocks,
        },
        preview,
      })
      continue
    }

    if (plannedIntent === 'insert_table') {
      const draft = parseInsertTableDraftFromPrompt(String(userPrompt || ''))
      commands.push({
        type: 'insert_table',
        target: {
          chapterId,
          position: draft.position,
        },
        payload: {
          headers: draft.headers,
          rows: draft.rows,
          style: draft.style,
        },
        preview,
      })
      continue
    }

    if (plannedIntent === 'insert_illustration') {
      const draft = parseInsertIllustrationDraftFromPrompt(String(userPrompt || ''))
      commands.push({
        type: 'insert_illustration',
        target: {
          chapterId,
          position: draft.position,
        },
        payload: {
          imageSource: draft.imageSource,
          alt: draft.alt,
          caption: draft.caption || 'AI generated illustration preview',
          width: draft.width,
        },
        preview,
      })
      continue
    }

    commands.push({
      type: 'feedback_report',
      target: {
        chapterId,
      },
      payload: {
        items: [
          {
            issue: 'Long paragraph may reduce readability.',
            evidence: 'Some sentences are dense and carry multiple ideas.',
            suggestion: 'Split the paragraph by one core idea per sentence group.',
          },
        ],
      },
      preview,
    })
  }
  return commands
}

async function requestChatCompletion({
  provider,
  model,
  apiBaseUrl,
  apiKey,
  systemPrompt,
  userPrompt,
  temperature = 0.4,
}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(`${apiBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
      signal: controller.signal,
    })
    if (!response.ok) {
      const details = await response.text().catch(() => '')
      throw createRequestError(
        502,
        `${provider} chat completion failed (${response.status}): ${details || 'upstream error'}`,
        'ai-upstream-failed',
      )
    }
    const data = await response.json()
    const content = String(data?.choices?.[0]?.message?.content ?? '').trim()
    if (!content) {
      throw createRequestError(502, `${provider} returned empty completion`, 'ai-upstream-empty')
    }
    return content
  } finally {
    clearTimeout(timeout)
  }
}

async function buildCopilotCommandsWithAi({
  intent,
  chapterId,
  selectedText,
  selectedRange,
  userPrompt,
  preview,
}) {
  const stubCommands = buildCopilotCommands({ intent, chapterId, selectedText, selectedRange, userPrompt, preview })
  const hasRewrite = stubCommands.some((command) => command.type === 'rewrite_selection')
  const appendDraft = intent === 'append_text' ? parseAppendTextDraftFromPrompt(String(userPrompt || '')) : null
  const needsAppendGeneration = appendDraft?.mode === 'generate'

  if (!hasRewrite && !needsAppendGeneration) {
    return {
      commands: stubCommands,
      source: 'stub',
    }
  }

  try {
    if (AI_PROVIDER === 'groq') {
      if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY missing')
      if (needsAppendGeneration) {
        const generatedText = await requestChatCompletion({
          provider: 'groq',
          model: AI_MODEL,
          apiBaseUrl: GROQ_API_BASE_URL,
          apiKey: GROQ_API_KEY,
          systemPrompt: 'Write manuscript prose for the current BookSpace page. Return only the prose body in Korean.',
          userPrompt: appendDraft?.generationPrompt || userPrompt || '현재 페이지용 짧은 본문을 작성해 주세요.',
        })
        return {
          commands: stubCommands.map((command) =>
            command.type === 'append_text'
              ? {
                  ...command,
                  payload: { ...command.payload, text: generatedText },
                }
              : command,
          ),
          source: 'groq',
        }
      }
      const rewritten = await requestChatCompletion({
        provider: 'groq',
        model: AI_MODEL,
        apiBaseUrl: GROQ_API_BASE_URL,
        apiKey: GROQ_API_KEY,
        systemPrompt: buildBookspaceRewriteSystemPrompt(),
        userPrompt: `Original:\n${selectedText}\n\nInstruction:\n${userPrompt || '문장을 자연스럽고 간결하게 다듬어 주세요.'}`,
      })
      return {
        commands: [
          {
            type: 'rewrite_selection',
            target: {
              chapterId,
              range: {
                from: Math.max(1, Math.floor(Number(selectedRange?.from ?? 1))),
                to: Math.max(
                  Math.max(1, Math.floor(Number(selectedRange?.from ?? 1))) + 1,
                  Math.floor(Number(selectedRange?.to ?? selectedText.length + 1)),
                ),
              },
            },
            payload: { text: rewritten, tone: 'clear', lengthPolicy: 'shorter' },
            preview,
          },
          ...stubCommands.filter((command) => command.type !== 'rewrite_selection'),
        ],
        source: 'groq',
      }
    }

    if (AI_PROVIDER === 'openai') {
      if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY missing')
      if (needsAppendGeneration) {
        const generatedText = await requestChatCompletion({
          provider: 'openai',
          model: AI_MODEL,
          apiBaseUrl: OPENAI_API_BASE_URL,
          apiKey: OPENAI_API_KEY,
          systemPrompt: 'Write manuscript prose for the current BookSpace page. Return only the prose body in Korean.',
          userPrompt: appendDraft?.generationPrompt || userPrompt || '현재 페이지용 짧은 본문을 작성해 주세요.',
        })
        return {
          commands: stubCommands.map((command) =>
            command.type === 'append_text'
              ? {
                  ...command,
                  payload: { ...command.payload, text: generatedText },
                }
              : command,
          ),
          source: 'openai',
        }
      }
      const rewritten = await requestChatCompletion({
        provider: 'openai',
        model: AI_MODEL,
        apiBaseUrl: OPENAI_API_BASE_URL,
        apiKey: OPENAI_API_KEY,
        systemPrompt: buildBookspaceRewriteSystemPrompt(),
        userPrompt: `Original:\n${selectedText}\n\nInstruction:\n${userPrompt || '문장을 자연스럽고 간결하게 다듬어 주세요.'}`,
      })
      return {
        commands: [
          {
            type: 'rewrite_selection',
            target: {
              chapterId,
              range: {
                from: Math.max(1, Math.floor(Number(selectedRange?.from ?? 1))),
                to: Math.max(
                  Math.max(1, Math.floor(Number(selectedRange?.from ?? 1))) + 1,
                  Math.floor(Number(selectedRange?.to ?? selectedText.length + 1)),
                ),
              },
            },
            payload: { text: rewritten, tone: 'clear', lengthPolicy: 'shorter' },
            preview,
          },
          ...stubCommands.filter((command) => command.type !== 'rewrite_selection'),
        ],
        source: 'openai',
      }
    }
  } catch (error) {
    console.warn('[subscription-runtime] ai provider fallback to stub', {
      provider: AI_PROVIDER,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  return {
    commands: stubCommands,
    source: 'stub',
  }
}

async function buildGeneralChatReplyWithAi({
  prompt,
  selectedText,
  scope,
  chapterId,
  projectTitle,
  chapterCount,
  activePageTitle,
  activePageType,
}) {
  const normalizedPrompt = String(prompt ?? '').trim()
  const normalizedSelection = String(selectedText ?? '').trim()
  const normalizedScope = String(scope ?? '').trim() || 'chapter'
  const normalizedChapterId = String(chapterId ?? '').trim() || 'chapter-active'

  if (!normalizedPrompt) {
    return {
      text: '질문을 한 줄로 알려주시면 바로 도와드릴게요.',
      source: 'stub',
    }
  }

  const userMessage = [
    buildBookspaceChatContextBlock({
      scope: normalizedScope,
      chapterId: normalizedChapterId,
      selectedText: normalizedSelection,
      projectTitle,
      chapterCount,
      activePageTitle,
      activePageType,
    }),
    `UserPrompt:\n${normalizedPrompt}`,
  ].join('\n\n')

  try {
    if (AI_PROVIDER === 'groq') {
      if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY missing')
      const text = await requestChatCompletion({
        provider: 'groq',
        model: AI_MODEL,
        apiBaseUrl: GROQ_API_BASE_URL,
        apiKey: GROQ_API_KEY,
        systemPrompt: buildBookspaceChatSystemPrompt(),
        userPrompt: userMessage,
        temperature: 0.5,
      })
      return { text, source: 'groq' }
    }

    if (AI_PROVIDER === 'openai') {
      if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY missing')
      const text = await requestChatCompletion({
        provider: 'openai',
        model: AI_MODEL,
        apiBaseUrl: OPENAI_API_BASE_URL,
        apiKey: OPENAI_API_KEY,
        systemPrompt: buildBookspaceChatSystemPrompt(),
        userPrompt: userMessage,
        temperature: 0.5,
      })
      return { text, source: 'openai' }
    }
  } catch (error) {
    console.warn('[subscription-runtime] chat provider fallback to stub', {
      provider: AI_PROVIDER,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  const lower = normalizedPrompt.toLowerCase()
  if (/^(안녕|하이|hello|hi)\b/.test(lower)) {
    return {
      text: '안녕하세요. 현재 문맥 기준으로 집필/수정/구조화 작업을 바로 도와드릴 수 있어요.',
      source: 'stub',
    }
  }
  if (/(뭘 할 수|무엇을 할 수|뭐 할 수|할 수 있어|what can you do|capabilit)/i.test(lower)) {
    return {
      text: [
        'BookSpace 코파일럿으로 가능한 작업입니다.',
        '- 선택 문장 교정/다듬기',
        '- 새 페이지(XHTML 챕터) 생성',
        '- 표 삽입',
        '- 삽화/이미지 삽입',
        '- 원고 피드백 리포트',
        '- EPUB/DOCX 가져오기·내보내기 및 버전 복원 흐름 안내',
      ].join('\n'),
      source: 'stub',
    }
  }
  return {
    text: `요청을 확인했습니다. "${normalizedPrompt}" 기준으로 다음 작업부터 시작할까요?`,
    source: 'stub',
  }
}

const server = http.createServer(async (req, res) => {
  let requestPath = '/'
  let requestMethod = String(req.method ?? 'GET').toUpperCase()
  try {
    if (!applyCorsHeaders(req, res)) {
      return forbidden(res, 'origin not allowed')
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    const url = new URL(req.url ?? '/', `http://${host}:${port}`)
    const path = url.pathname
    requestPath = path
    requestMethod = String(req.method ?? 'GET').toUpperCase()
    const rateLimit = checkAndConsumeRateLimit(req, path)
    if (!rateLimit.allowed) {
      const retryAfterSeconds = Math.max(1, Math.ceil((rateLimit.retryAfterMs ?? RATE_LIMIT_WINDOW_MS) / 1000))
      res.setHeader('Retry-After', String(retryAfterSeconds))
      return tooManyRequests(res)
    }
    const authSession = getAuthSessionFromRequest(req)

    if (path === '/healthz') {
      if (requestMethod !== 'GET') return methodNotAllowed(res)
      if (!HEALTHZ_VERBOSE) {
        return json(res, 200, {
          ok: true,
          at: nowIso(),
        })
      }
      return json(res, 200, {
        ok: true,
        at: nowIso(),
        host,
        port,
        supabaseConfigured: Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY),
        portoneWebhookConfigured: Boolean(PORTONE_WEBHOOK_SECRET_PRIMARY),
        portoneApiConfigured: Boolean(PORTONE_API_SECRET),
        activeSessions: authSessionByToken.size,
      })
    }

    if (path === '/v1/auth/session') {
      if (requestMethod !== 'GET') return methodNotAllowed(res)
      if (!authSession) {
        return json(res, 200, buildGuestSessionSnapshot())
      }
      return json(
        res,
        200,
        buildAuthenticatedSessionSnapshot(authSession),
        getSessionResponseHeaders(authSession.token),
      )
    }

    if (path === '/v1/auth/google/sign-in') {
      if (!ENABLE_DEV_AUTH_STUB) return notFound(res)
      if (requestMethod !== 'POST') return methodNotAllowed(res)
      const body = await readJsonBody(req)
      const email =
        normalizeEmail(body.email) ||
        normalizeEmail(process.env.BOOKSPACE_DEV_GOOGLE_EMAIL) ||
        'dev.google@bookspace.local'
      const displayName =
        normalizeDisplayName(body.displayName) ||
        normalizeDisplayName(process.env.BOOKSPACE_DEV_GOOGLE_NAME) ||
        'Google User'
      const avatarUrl = normalizeTextOrNull(body.avatarUrl)
      const userId = resolveGoogleUserId(email)
      const token = createSessionToken()

      const session = {
        token,
        userId,
        email,
        displayName,
        avatarUrl,
        createdAt: nowIso(),
        expiresAt: createSessionExpiresAt(),
      }
      authSessionByToken.set(token, session)
      await ensureSubscriptionAccount(userId)

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
      const sessionToken = readHeader(req.headers, SESSION_HEADER)
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
      const userId = authSession?.userId ?? GUEST_USER_ID
      const snapshot = await buildEntitlementsSnapshot(userId)
      return json(res, 200, {
        snapshot,
        fetchedAt: nowIso(),
      })
    }

    if (path === '/v1/subscription/plan/set') {
      if (!ENABLE_PLAN_OVERRIDE_ENDPOINT) return notFound(res)
      if (requestMethod !== 'POST') return methodNotAllowed(res)
      if (!requireAuthenticatedSession(res, authSession)) return
      const body = await readJsonBody(req)
      const result = await setSubscriptionPlanForUser(authSession.userId, body.plan)
      return json(res, 200, result)
    }

    if (path === '/v1/subscription/gate/check') {
      if (requestMethod !== 'POST') return methodNotAllowed(res)
      if (!requireAuthenticatedSession(res, authSession)) return
      const body = await readJsonBody(req)
      const response = await runSubscriptionGateCheck(authSession.userId, body)
      return json(res, 200, response)
    }

    if (path === '/v1/subscription/credits/refund') {
      if (requestMethod !== 'POST') return methodNotAllowed(res)
      if (!requireAuthenticatedSession(res, authSession)) return
      const body = await readJsonBody(req)
      const response = await runSubscriptionCreditsRefund(authSession.userId, body)
      return json(res, 200, response)
    }

    if (path === '/v1/billing/bindings/register') {
      if (requestMethod !== 'POST') return methodNotAllowed(res)
      if (!requireAuthenticatedSession(res, authSession)) return
      const body = await readJsonBody(req)

      const explicitUserId = normalizeUuidOrNull(body.userId)
      if (explicitUserId && explicitUserId !== authSession.userId) {
        return forbidden(res, 'userId mismatch with authenticated session')
      }

      const response = await registerBillingBindingForUser(authSession.userId, body)
      return json(res, 200, response)
    }

    if (path === '/v1/billing/webhooks/portone') {
      if (requestMethod !== 'POST') return methodNotAllowed(res)
      if (!PORTONE_WEBHOOK_SECRET_PRIMARY && !PORTONE_WEBHOOK_SECRET_SECONDARY) {
        return serviceUnavailable(res, 'portone webhook secret is not configured')
      }

      const rawBody = await readRawBody(req)
      const verified = verifyPortoneWebhookWithRotation({
        rawBody,
        headers: req.headers,
      })
      const webhookEvent = parsePortoneWebhook(rawBody, verified.webhookId)

      let runtimeEvent = webhookEvent
      let payment = null
      let revalidationSkippedReason = null
      if (webhookEvent.paymentId) {
        try {
          payment = await fetchPortonePayment(
            webhookEvent.paymentId,
            normalizeTextOrNull(asRecord(webhookEvent.payload)?.storeId),
          )
          runtimeEvent = mergeWebhookEventWithPayment(webhookEvent, payment)
        } catch (error) {
          if (
            error instanceof Error &&
            error.code === 'portone-get-payment-failed' &&
            Number(error.upstreamStatus) === 404
          ) {
            revalidationSkippedReason = 'payment-not-found'
            console.warn('[subscription-runtime] webhook payment revalidation skipped', {
              paymentId: webhookEvent.paymentId,
              reason: revalidationSkippedReason,
            })
          } else {
            throw error
          }
        }
      }

      const applyResult = await applyBillingWebhookEvent(runtimeEvent)
      return json(res, 200, {
        provider: 'portone',
        verifiedWith: verified.secretSlot,
        revalidated: Boolean(payment),
        revalidationSkippedReason,
        paymentId: webhookEvent.paymentId ?? null,
        ...applyResult,
      })
    }

    const paymentSyncMatch = path.match(/^\/v1\/billing\/payments\/([^/]+)\/sync$/)
    if (paymentSyncMatch) {
      if (requestMethod !== 'POST') return methodNotAllowed(res)
      if (!requireOperatorAccess(req, res)) return
      const paymentId = decodeURIComponent(paymentSyncMatch[1] ?? '')
      const body = await readJsonBody(req)
      const payment = await fetchPortonePayment(paymentId, normalizeTextOrNull(body.storeId))
      const syncEvent = eventFromPortonePayment(payment, {
        eventId: normalizeTextOrNull(body.eventId) ?? `manual-sync:${paymentId}:${Date.now()}`,
        eventType: normalizeTextOrNull(body.eventType),
        source: 'manual-sync-endpoint',
      })

      const applyResult = await applyBillingWebhookEvent(syncEvent)
      return json(res, 200, {
        provider: 'portone',
        paymentId,
        paymentStatus: normalizeTextOrNull(payment.status),
        ...applyResult,
      })
    }

    if (path === '/v1/ai/requests') {
      if (requestMethod !== 'POST') return methodNotAllowed(res)
      if (!requireAuthenticatedSession(res, authSession)) return

      const body = await readJsonBody(req)
      const requestId = String(body.requestId ?? '').trim()
      const intent = String(body.intent ?? '').trim()
      const chapterId = String(body?.context?.chapterId ?? '').trim() || 'chapter-active'
      const selectedText = String(body?.context?.selectedText ?? '').trim()
      const userPrompt = String(body?.context?.userPrompt ?? '').trim()
      const preview = body.preview !== false

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

      const generated = await buildCopilotCommandsWithAi({
        intent,
        chapterId,
        selectedText,
        selectedRange: body?.context?.selectedRange,
        userPrompt,
        preview,
      })

      return json(res, 200, {
        requestId,
        status: 'ok',
        envelope: {
          schemaVersion: '1.1.0',
          requestId,
          intent,
          summary: resolveCopilotSummary(intent, generated.commands.length),
          warnings: [],
          baseProjectRevision:
            String(body.baseProjectRevision ?? '').trim() || `rev_${Date.now().toString(36)}`,
          commands: generated.commands,
          idempotencyKey: String(body.idempotencyKey ?? '').trim() || `idemp_${Date.now().toString(36)}`,
          generatedAt: nowIso(),
          meta: {
            modelId: AI_MODEL,
            promptTemplateVersion: 'runtime-http-v1',
            modelVersion: generated.source,
          },
        },
        validation: {
          code: 'OK',
          errors: [],
          warnings: [],
          previewOnly: false,
        },
        generatedAt: nowIso(),
      })
    }

    if (path === '/v1/ai/chat') {
      if (requestMethod !== 'POST') return methodNotAllowed(res)
      if (!requireAuthenticatedSession(res, authSession)) return

      const body = await readJsonBody(req)
      const requestId = String(body.requestId ?? '').trim()
      const prompt = String(body.prompt ?? '').trim()
      const chapterId = String(body?.context?.chapterId ?? '').trim() || 'chapter-active'
      const selectedText = String(body?.context?.selectedText ?? '').trim()
      const scope = String(body?.context?.scope ?? '').trim() || 'chapter'
      const projectTitle = String(body?.context?.projectTitle ?? '').trim()
      const chapterCount = Number(body?.context?.chapterCount ?? 0)
      const activePageTitle = String(body?.context?.activePageTitle ?? '').trim()
      const activePageType = String(body?.context?.activePageType ?? '').trim()

      if (!requestId) return badRequest(res, 'requestId required')
      if (!prompt) return badRequest(res, 'prompt required')

      const reply = await buildGeneralChatReplyWithAi({
        prompt,
        selectedText,
        scope,
        chapterId,
        projectTitle,
        chapterCount,
        activePageTitle,
        activePageType,
      })

      return json(res, 200, {
        requestId,
        status: 'ok',
        text: reply.text,
        source: reply.source,
        generatedAt: nowIso(),
      })
    }

    return notFound(res)
  } catch (error) {
    if (error instanceof Error && Number.isFinite(error.statusCode)) {
      if (requestPath === '/v1/billing/webhooks/portone') {
        console.warn('[subscription-runtime] webhook rejected', {
          method: requestMethod,
          path: requestPath,
          code: error.code ?? 'runtime-error',
          message: error.message,
        })
      }
      const statusCode = Number(error.statusCode)
      const exposeMessage = statusCode >= 400 && statusCode < 500
      return json(res, statusCode, {
        error: exposeMessage ? error.message : 'request failed',
        code: error.code ?? 'runtime-error',
      })
    }
    console.error('[subscription-runtime] unexpected error', error)
    return json(res, 500, {
      error: error instanceof Error ? error.message : 'internal server error',
      code: 'internal-error',
    })
  }
})

server.listen(port, host, () => {
  if (!OPERATOR_API_TOKEN) {
    console.warn('[subscription-runtime] WARNING: SUBSCRIPTION_API_OPERATOR_TOKEN is not configured')
  }
  console.log(`[subscription-runtime] listening on http://${host}:${port}`)
  console.log('[subscription-runtime] endpoints:')
  console.log(' - GET  /healthz')
  console.log(' - GET  /v1/auth/session')
  if (ENABLE_DEV_AUTH_STUB) console.log(' - POST /v1/auth/google/sign-in')
  console.log(' - POST /v1/auth/sign-out')
  console.log(' - GET  /v1/subscription/entitlements')
  if (ENABLE_PLAN_OVERRIDE_ENDPOINT) console.log(' - POST /v1/subscription/plan/set')
  console.log(' - POST /v1/subscription/gate/check')
  console.log(' - POST /v1/subscription/credits/refund')
  console.log(' - POST /v1/billing/bindings/register')
  console.log(' - POST /v1/billing/webhooks/portone')
  console.log(' - POST /v1/billing/payments/{paymentId}/sync')
  console.log(' - POST /v1/ai/requests')
  console.log(' - POST /v1/ai/chat')
  if (OPERATOR_API_TOKEN) {
    console.log(`[subscription-runtime] operator token header: ${OPERATOR_HEADER}`)
  } else {
    console.log(
      `[subscription-runtime] operator endpoint guard: loopback-only=${ALLOW_LOOPBACK_OPERATOR_ACCESS}`,
    )
  }
  console.log(`[subscription-runtime] session header: ${SESSION_HEADER}`)
  console.log(`[subscription-runtime] session ttl seconds: ${SESSION_TTL_SECONDS}`)
  console.log(`[subscription-runtime] cors allow origins: ${CORS_ALLOW_ORIGINS.join(',') || '(none)'}`)
  console.log(`[subscription-runtime] trust x-forwarded-for: ${TRUST_PROXY_FORWARDED_FOR}`)
  console.log(`[subscription-runtime] rate-limit max keys: ${RATE_LIMIT_MAX_KEYS}`)
  console.log(`[subscription-runtime] env: ${NODE_ENV}`)
  console.log(`[subscription-runtime] guest user id: ${GUEST_USER_ID}`)
})
