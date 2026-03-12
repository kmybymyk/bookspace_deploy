import { createHash } from 'crypto'
import { createAiCommandIdempotencyKey } from '../shared/aiCommandSchema'
import { ALL_FEATURES, type FeatureId, type SubscriptionPlan } from '../shared/entitlements'
import type { AuthUserProfile } from '../shared/authIpc'
import type { CopilotGenerateRequest, CopilotIntent } from '../shared/copilotIpc'
import type { UiErrorKey, UiLocale } from './uiErrorCopy'
import { getUiErrorCopy } from './uiErrorCopy'
import type {
    SubscriptionCreditRefundReason,
    SubscriptionCreditsRefundRequest,
    SubscriptionGateCheckRequest,
} from '../shared/subscriptionIpc'
import type { NormalizedSubscriptionGateCheckRequest } from '../shared/subscriptionGateRuntime'

const SUBSCRIPTION_PLAN_VALUES: readonly SubscriptionPlan[] = ['FREE', 'PRO_LITE', 'PRO'] as const
const SUBSCRIPTION_REFUND_REASONS: readonly SubscriptionCreditRefundReason[] = [
    'execution-failed',
    'policy-blocked',
    'manual-adjustment',
] as const
const COPILOT_INTENT_VALUES: readonly CopilotIntent[] = [
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
] as const
const ALL_FEATURE_ID_SET = new Set<FeatureId>(ALL_FEATURES)
type UiErrorCopyResolver = (key: UiErrorKey) => string

function resolveUiErrorCopy(locale: UiLocale | undefined, copy?: UiErrorCopyResolver): UiErrorCopyResolver {
    if (copy) return copy
    const safeLocale: UiLocale = locale === 'ko' ? 'ko' : 'en'
    return (key) => getUiErrorCopy(safeLocale, key)
}

export interface NormalizedCopilotGenerateRequest {
    requestId: string
    idempotencyKey: string
    intent: CopilotIntent
    baseProjectRevision?: string
    preview: boolean
    context: {
        chapterId?: string
        targetChapterId?: string
        selectedText?: string
        selectedRange?: {
            from: number
            to: number
        }
        userPrompt?: string
        scope?: 'selection' | 'chapter' | 'project'
        projectTitle?: string
        chapterCount?: number
        activePageTitle?: string
        activePageType?: string
        activePageSummary?: string
        threadGoal?: string
        threadSummary?: string
        contextPins?: string[]
        contextStatus?: 'fresh' | 'watch' | 'tight'
    }
}

export function parseSubscriptionPlan(value: unknown): SubscriptionPlan | null {
    if (typeof value !== 'string') return null
    const normalized = value.trim().toUpperCase()
    if ((SUBSCRIPTION_PLAN_VALUES as readonly string[]).includes(normalized)) {
        return normalized as SubscriptionPlan
    }
    return null
}

export function resolveInitialSubscriptionPlan(): SubscriptionPlan {
    const explicitPlan = parseSubscriptionPlan(process.env.BOOKSPACE_PLAN)
    if (explicitPlan) return explicitPlan
    return process.env.NODE_ENV === 'development' ? 'PRO' : 'FREE'
}

export function resolveInitialAiCredits(): number | null {
    const raw = String(process.env.BOOKSPACE_AI_CREDITS ?? '').trim()
    if (!raw) return null
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) return null
    return Math.max(0, Math.floor(parsed))
}

export function normalizeEmail(value: unknown): string {
    const email = String(value ?? '').trim().toLowerCase()
    if (!email) return ''
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return ''
    return email
}

export function normalizeDisplayName(value: unknown): string {
    const text = String(value ?? '').trim()
    return text ? text.slice(0, 80) : ''
}

export function anonymizePromptForAudit(value: unknown): string {
    const raw = String(value ?? '').trim()
    if (!raw) return ''
    return raw
        .replace(/https?:\/\/[^\s)]+/gi, '[url]')
        .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
        .replace(/\b(?:\+?\d[\d\s().-]{6,}\d)\b/g, '[phone]')
        .replace(/\b(?:\d[ -]?){13,19}\b/g, '[long-number]')
        .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, '[uuid]')
        .replace(/\b(?:gsk|sk|pk)-[A-Za-z0-9_-]{16,}\b/g, '[secret]')
        .replace(/\s+/g, ' ')
        .slice(0, 240)
}

export function buildPromptSignature(value: unknown): string | undefined {
    const normalized = String(value ?? '').trim()
    if (!normalized) return undefined
    return createHash('sha256').update(normalized).digest('hex').slice(0, 16)
}

export function createGoogleUserId(email: string): string {
    const digest = createHash('sha256')
        .update(`google:${email.toLowerCase()}`)
        .digest('hex')
        .slice(0, 24)
    return `google_${digest}`
}

export function normalizeAuthUserProfile(value: unknown): AuthUserProfile | null {
    if (!value || typeof value !== 'object') return null
    const record = value as Record<string, unknown>
    const provider = String(record.provider ?? '').trim().toLowerCase()
    if (provider !== 'google') return null
    const email = normalizeEmail(record.email)
    if (!email) return null
    const userId = String(record.userId ?? '').trim() || createGoogleUserId(email)
    const displayName = normalizeDisplayName(record.displayName) || email.split('@')[0]
    const avatarUrlRaw = String(record.avatarUrl ?? '').trim()
    return {
        userId,
        provider: 'google',
        email,
        displayName,
        avatarUrl: avatarUrlRaw || undefined,
    }
}

function normalizeRequiredCredits(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 1
    return Math.max(1, Math.floor(value))
}

export function normalizeGateCheckRequest(
    input: SubscriptionGateCheckRequest,
    options?: {
        locale?: UiLocale
        getUiErrorCopy?: UiErrorCopyResolver
    },
): NormalizedSubscriptionGateCheckRequest {
    const uiError = resolveUiErrorCopy(options?.locale, options?.getUiErrorCopy)
    const requestId = String(input?.requestId ?? '').trim()
    if (!requestId) {
        throw new Error(uiError('requestIdRequired'))
    }

    const rawFeatureId = String(input?.featureId ?? '').trim()
    if (!ALL_FEATURE_ID_SET.has(rawFeatureId as FeatureId)) {
        throw new Error(uiError('unsupportedFeatureId'))
    }

    const idempotencyKeyRaw = String(input?.idempotencyKey ?? '').trim()

    return {
        requestId,
        featureId: rawFeatureId as FeatureId,
        requiredCredits: normalizeRequiredCredits(input?.requiredCredits),
        consumeCredit: Boolean(input?.consumeCredit),
        idempotencyKey: idempotencyKeyRaw.length > 0 ? idempotencyKeyRaw : undefined,
    }
}

function normalizeRefundReason(value: unknown): SubscriptionCreditRefundReason {
    const raw = String(value ?? '').trim().toLowerCase()
    if ((SUBSCRIPTION_REFUND_REASONS as readonly string[]).includes(raw)) {
        return raw as SubscriptionCreditRefundReason
    }
    return 'manual-adjustment'
}

export function normalizeCreditsRefundRequest(
    input: SubscriptionCreditsRefundRequest,
    options?: {
        locale?: UiLocale
        getUiErrorCopy?: UiErrorCopyResolver
    },
): {
    requestId: string
    idempotencyKey: string
    reason: SubscriptionCreditRefundReason
} {
    const uiError = resolveUiErrorCopy(options?.locale, options?.getUiErrorCopy)
    const requestId = String(input?.requestId ?? '').trim()
    if (!requestId) {
        throw new Error(uiError('requestIdRequired'))
    }
    const idempotencyKey = String(input?.idempotencyKey ?? '').trim()
    if (!idempotencyKey) {
        throw new Error(uiError('idempotencyKeyRequired'))
    }
    return {
        requestId,
        idempotencyKey,
        reason: normalizeRefundReason(input?.reason),
    }
}

function normalizeCopilotIntent(value: unknown, uiError: UiErrorCopyResolver): CopilotIntent {
    const raw = String(value ?? '').trim().toLowerCase()
    if ((COPILOT_INTENT_VALUES as readonly string[]).includes(raw)) {
        return raw as CopilotIntent
    }
    throw new Error(uiError('unsupportedCopilotIntent'))
}

export function normalizeCopilotGenerateRequest(
    input: CopilotGenerateRequest,
    options?: {
        locale?: UiLocale
        getUiErrorCopy?: UiErrorCopyResolver
    },
): NormalizedCopilotGenerateRequest {
    const uiError = resolveUiErrorCopy(options?.locale, options?.getUiErrorCopy)
    const requestId = String(input?.requestId ?? '').trim()
    if (!requestId) {
        throw new Error(uiError('requestIdRequired'))
    }

    const intent = normalizeCopilotIntent(input?.intent, uiError)
    const idempotencyKey =
        String(input?.idempotencyKey ?? '').trim() || createAiCommandIdempotencyKey('copilot')
    const baseProjectRevision = String(input?.baseProjectRevision ?? '').trim() || undefined
    const preview = input?.preview !== false

    const context = input?.context ?? {}
    const chapterId = String(context.chapterId ?? '').trim() || undefined
    const targetChapterId = String((context as { targetChapterId?: string }).targetChapterId ?? '').trim() || undefined
    const selectedText = String(context.selectedText ?? '').trim() || undefined
    const selectedRangeRaw = (context as { selectedRange?: { from?: unknown; to?: unknown } }).selectedRange
    const selectedRange =
        selectedRangeRaw &&
        Number.isFinite(Number(selectedRangeRaw.from)) &&
        Number.isFinite(Number(selectedRangeRaw.to))
            ? {
                  from: Math.max(1, Math.floor(Number(selectedRangeRaw.from))),
                  to: Math.max(1, Math.floor(Number(selectedRangeRaw.to))),
              }
            : undefined
    const userPrompt = String(context.userPrompt ?? '').trim() || undefined
    const scopeRaw = String(context.scope ?? '').trim().toLowerCase()
    const scope =
        scopeRaw === 'selection' || scopeRaw === 'chapter' || scopeRaw === 'project'
            ? scopeRaw
            : undefined
    const projectTitle = String(context.projectTitle ?? '').trim() || undefined
    const chapterCountRaw = Number(context.chapterCount)
    const chapterCount = Number.isFinite(chapterCountRaw) ? Math.max(0, Math.floor(chapterCountRaw)) : undefined
    const activePageTitle = String(context.activePageTitle ?? '').trim() || undefined
    const activePageType = String(context.activePageType ?? '').trim() || undefined
    const activePageSummary = String((context as { activePageSummary?: string }).activePageSummary ?? '').trim() || undefined
    const threadGoal = String((context as { threadGoal?: string }).threadGoal ?? '').trim() || undefined
    const threadSummary = String((context as { threadSummary?: string }).threadSummary ?? '').trim() || undefined
    const contextPins = Array.isArray((context as { contextPins?: string[] }).contextPins)
        ? ((context as { contextPins?: string[] }).contextPins ?? []).map((value) => String(value ?? '').trim()).filter(Boolean).slice(0, 5)
        : undefined
    const contextStatusRaw = String((context as { contextStatus?: string }).contextStatus ?? '').trim().toLowerCase()
    const contextStatus =
        contextStatusRaw === 'fresh' || contextStatusRaw === 'watch' || contextStatusRaw === 'tight'
            ? contextStatusRaw
            : undefined

    return {
        requestId,
        idempotencyKey,
        intent,
        baseProjectRevision,
        preview,
        context: {
            chapterId,
            targetChapterId,
            selectedText,
            selectedRange,
            userPrompt,
            scope,
            projectTitle,
            chapterCount,
            activePageTitle,
            activePageType,
            activePageSummary,
            threadGoal,
            threadSummary,
            contextPins,
            contextStatus,
        },
    }
}
