import { createHmac, timingSafeEqual } from 'node:crypto'

export interface StripeWebhookVerificationInput {
  rawBody: string
  signatureHeader: string
  signingSecret: string
  nowMs?: number
  toleranceSeconds?: number
}

export interface PortoneWebhookVerificationInput {
  rawBody: string
  headers: Record<string, string | string[] | undefined>
  signingSecret: string
  nowMs?: number
  toleranceSeconds?: number
  decodeWhsecSecret?: boolean
  allowNormalizedBase64?: boolean
}

export interface PortoneWebhookVerificationResult {
  webhookId: string
  timestamp: number
}

export type BillingWebhookSignatureErrorCode =
  | 'stripe-webhook-body-required'
  | 'stripe-signature-header-required'
  | 'stripe-signing-secret-required'
  | 'stripe-signature-header-invalid'
  | 'stripe-signature-expired'
  | 'stripe-signature-mismatch'
  | 'portone-webhook-body-required'
  | 'portone-signing-secret-required'
  | 'portone-header-webhook-id-required'
  | 'portone-header-webhook-timestamp-required'
  | 'portone-header-webhook-signature-required'
  | 'portone-header-webhook-timestamp-invalid'
  | 'portone-header-webhook-signature-invalid'
  | 'portone-signature-expired'
  | 'portone-signature-mismatch'

export interface BillingWebhookSignatureError extends Error {
  code: BillingWebhookSignatureErrorCode
}

const BILLING_WEBHOOK_SIGNATURE_ERROR_CODES = new Set<BillingWebhookSignatureErrorCode>([
  'stripe-webhook-body-required',
  'stripe-signature-header-required',
  'stripe-signing-secret-required',
  'stripe-signature-header-invalid',
  'stripe-signature-expired',
  'stripe-signature-mismatch',
  'portone-webhook-body-required',
  'portone-signing-secret-required',
  'portone-header-webhook-id-required',
  'portone-header-webhook-timestamp-required',
  'portone-header-webhook-signature-required',
  'portone-header-webhook-timestamp-invalid',
  'portone-header-webhook-signature-invalid',
  'portone-signature-expired',
  'portone-signature-mismatch',
])

interface StripeSignatureParts {
  timestamp: number
  signatures: string[]
}

interface PortoneSignatureParts {
  webhookId: string
  timestamp: number
  signatures: string[]
}

function createSignatureError(
  code: BillingWebhookSignatureErrorCode,
  message: string,
): BillingWebhookSignatureError {
  const error = new Error(message) as BillingWebhookSignatureError
  error.name = 'BillingWebhookSignatureError'
  error.code = code
  return error
}

export function isBillingWebhookSignatureError(
  value: unknown,
): value is BillingWebhookSignatureError {
  if (!value || typeof value !== 'object') return false
  const code = (value as { code?: unknown }).code
  return typeof code === 'string' && BILLING_WEBHOOK_SIGNATURE_ERROR_CODES.has(code as BillingWebhookSignatureErrorCode)
}

function normalizeHeaderValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ? String(value[0]).trim() : ''
  }
  return value ? String(value).trim() : ''
}

function readHeader(
  headers: Record<string, string | string[] | undefined>,
  headerName: string,
): string {
  const direct = normalizeHeaderValue(headers[headerName])
  if (direct) return direct
  const lowerKey = headerName.toLowerCase()
  return normalizeHeaderValue(headers[lowerKey])
}

function normalizeStripeSignatureParts(signatureHeader: string): StripeSignatureParts {
  const chunks = signatureHeader
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

  let timestamp = 0
  const signatures: string[] = []
  for (const chunk of chunks) {
    const [key, value] = chunk.split('=', 2)
    if (!key || !value) continue
    if (key === 't') {
      const parsed = Number(value)
      if (Number.isFinite(parsed) && parsed > 0) timestamp = parsed
      continue
    }
    if (key === 'v1') {
      signatures.push(value.toLowerCase())
    }
  }

  if (!timestamp) {
    throw createSignatureError(
      'stripe-signature-header-invalid',
      'invalid stripe signature header: missing timestamp',
    )
  }
  if (signatures.length === 0) {
    throw createSignatureError(
      'stripe-signature-header-invalid',
      'invalid stripe signature header: missing v1 signature',
    )
  }
  return { timestamp, signatures }
}

function normalizePortoneSignatureParts(
  headers: Record<string, string | string[] | undefined>,
): PortoneSignatureParts {
  const webhookId = readHeader(headers, 'webhook-id')
  const timestampText = readHeader(headers, 'webhook-timestamp')
  const signatureHeader = readHeader(headers, 'webhook-signature')

  if (!webhookId) {
    throw createSignatureError(
      'portone-header-webhook-id-required',
      'invalid portone signature header: missing webhook-id',
    )
  }
  if (!timestampText) {
    throw createSignatureError(
      'portone-header-webhook-timestamp-required',
      'invalid portone signature header: missing webhook-timestamp',
    )
  }
  if (!signatureHeader) {
    throw createSignatureError(
      'portone-header-webhook-signature-required',
      'invalid portone signature header: missing webhook-signature',
    )
  }

  const parsedTimestamp = Number(timestampText)
  if (!Number.isFinite(parsedTimestamp) || parsedTimestamp <= 0) {
    throw createSignatureError(
      'portone-header-webhook-timestamp-invalid',
      'invalid portone signature header: invalid webhook-timestamp',
    )
  }

  const signatures: string[] = []
  const regex = /v1[=,]([A-Za-z0-9+/=_-]+)/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(signatureHeader)) !== null) {
    if (match[1]) signatures.push(match[1].trim())
  }
  if (signatures.length === 0 && signatureHeader) {
    signatures.push(signatureHeader.trim())
  }
  if (signatures.length === 0) {
    throw createSignatureError(
      'portone-header-webhook-signature-invalid',
      'invalid portone signature header: missing v1 signature',
    )
  }

  return {
    webhookId,
    timestamp: Math.floor(parsedTimestamp),
    signatures,
  }
}

function secureTextEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(String(left ?? ''), 'utf8')
  const rightBuffer = Buffer.from(String(right ?? ''), 'utf8')
  if (leftBuffer.length === 0 || rightBuffer.length === 0) return false
  if (leftBuffer.length !== rightBuffer.length) return false
  return timingSafeEqual(leftBuffer, rightBuffer)
}

function secureHexEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(String(left ?? ''), 'hex')
  const rightBuffer = Buffer.from(String(right ?? ''), 'hex')
  if (leftBuffer.length === 0 || rightBuffer.length === 0) return false
  if (leftBuffer.length !== rightBuffer.length) return false
  return timingSafeEqual(leftBuffer, rightBuffer)
}

function normalizeBase64Padding(raw: string): string {
  const text = String(raw ?? '').trim().replace(/-/g, '+').replace(/_/g, '/')
  if (!text) return ''
  const remainder = text.length % 4
  if (remainder === 0) return text
  return `${text}${'='.repeat(4 - remainder)}`
}

function decodeWebhookSecretKey(signingSecret: string, decodeWhsecSecret: boolean): Buffer {
  const secret = String(signingSecret ?? '').trim()
  if (!secret) return Buffer.from('', 'utf8')
  if (!decodeWhsecSecret || !secret.startsWith('whsec_')) {
    return Buffer.from(secret, 'utf8')
  }

  const encoded = secret.slice('whsec_'.length).trim()
  if (!encoded) return Buffer.from(secret, 'utf8')

  try {
    const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/')
    const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4))
    const decoded = Buffer.from(`${normalized}${padding}`, 'base64')
    if (decoded.length > 0) return decoded
  } catch {
    // Fallback to utf-8 secret handling below.
  }

  return Buffer.from(secret, 'utf8')
}

export function verifyStripeWebhookSignature(input: StripeWebhookVerificationInput): void {
  const rawBody = String(input.rawBody ?? '')
  const signatureHeader = String(input.signatureHeader ?? '').trim()
  const signingSecret = String(input.signingSecret ?? '').trim()
  const nowMs = Number.isFinite(input.nowMs ?? NaN) ? Number(input.nowMs) : Date.now()
  const toleranceSeconds = Math.max(1, Math.floor(Number(input.toleranceSeconds ?? 300)))

  if (!rawBody) {
    throw createSignatureError('stripe-webhook-body-required', 'stripe webhook raw body is required')
  }
  if (!signatureHeader) {
    throw createSignatureError('stripe-signature-header-required', 'stripe signature header is required')
  }
  if (!signingSecret) {
    throw createSignatureError('stripe-signing-secret-required', 'stripe signing secret is required')
  }

  const parsed = normalizeStripeSignatureParts(signatureHeader)
  const ageSeconds = Math.floor(Math.abs(nowMs - parsed.timestamp * 1000) / 1000)
  if (ageSeconds > toleranceSeconds) {
    throw createSignatureError('stripe-signature-expired', 'stripe webhook signature expired')
  }

  const signedPayload = `${parsed.timestamp}.${rawBody}`
  const expectedSignature = createHmac('sha256', signingSecret)
    .update(signedPayload, 'utf8')
    .digest('hex')
    .toLowerCase()

  const matched = parsed.signatures.some((candidate) => secureHexEqual(candidate, expectedSignature))
  if (!matched) {
    throw createSignatureError('stripe-signature-mismatch', 'stripe webhook signature mismatch')
  }
}

export function verifyPortoneWebhookSignature(
  input: PortoneWebhookVerificationInput,
): PortoneWebhookVerificationResult {
  const rawBody = String(input.rawBody ?? '')
  const signingSecret = String(input.signingSecret ?? '').trim()
  const nowMs = Number.isFinite(input.nowMs ?? NaN) ? Number(input.nowMs) : Date.now()
  const toleranceSeconds = Math.max(1, Math.floor(Number(input.toleranceSeconds ?? 300)))
  const decodeWhsecSecret = input.decodeWhsecSecret === true
  const allowNormalizedBase64 = input.allowNormalizedBase64 === true

  if (!rawBody) {
    throw createSignatureError('portone-webhook-body-required', 'portone webhook raw body is required')
  }
  if (!signingSecret) {
    throw createSignatureError('portone-signing-secret-required', 'portone webhook signing secret is required')
  }

  const parsed = normalizePortoneSignatureParts(input.headers ?? {})
  const ageSeconds = Math.floor(Math.abs(nowMs - parsed.timestamp * 1000) / 1000)
  if (ageSeconds > toleranceSeconds) {
    throw createSignatureError('portone-signature-expired', 'portone webhook signature expired')
  }

  const signedPayload = `${parsed.webhookId}.${parsed.timestamp}.${rawBody}`
  const signingKey = decodeWebhookSecretKey(signingSecret, decodeWhsecSecret)
  const expectedBase64 = createHmac('sha256', signingKey).update(signedPayload, 'utf8').digest('base64')
  const expectedBase64Url = expectedBase64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')

  const normalizedExpectedBase64 = allowNormalizedBase64 ? normalizeBase64Padding(expectedBase64) : ''
  const matched = parsed.signatures.some((candidate) => {
    const normalized = String(candidate ?? '').trim()
    if (!normalized) return false
    if (secureTextEqual(normalized, expectedBase64)) return true
    if (secureTextEqual(normalized, expectedBase64Url)) return true
    if (!allowNormalizedBase64) return false
    return secureTextEqual(normalizeBase64Padding(normalized), normalizedExpectedBase64)
  })

  if (!matched) {
    throw createSignatureError('portone-signature-mismatch', 'portone webhook signature mismatch')
  }

  return {
    webhookId: parsed.webhookId,
    timestamp: parsed.timestamp,
  }
}
