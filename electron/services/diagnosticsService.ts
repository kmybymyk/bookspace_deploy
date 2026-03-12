import path from 'path'
import fs from 'fs/promises'
import type {
    SubscriptionCreditRefundReason,
    SubscriptionCreditsRefundResponse,
} from '../../shared/subscriptionIpc'
import type {
    CopilotAppServerTurnStatus,
    CopilotGenerateResponse,
    CopilotIntent,
} from '../../shared/copilotIpc'
import type {
    FeatureId,
    SubscriptionPlan,
} from '../../shared/entitlements'

const SUBSCRIPTION_GATE_LOG_FILE = 'subscription-gate.ndjson'
const COPILOT_REQUEST_LOG_FILE = 'copilot-requests.ndjson'
const COPILOT_CHAT_LOG_FILE = 'copilot-chat.ndjson'
const RUNTIME_ERROR_LOG_FILE = 'runtime-errors.ndjson'
const DIAGNOSTIC_LOG_MAX_BYTES = 5 * 1024 * 1024
const DIAGNOSTIC_LOG_BACKUP_COUNT = 2

interface CreateDiagnosticsServiceDeps {
    getUserDataPath: () => string
    getAppVersion: () => string
    platform: string
}

export function createDiagnosticsService(deps: CreateDiagnosticsServiceDeps) {
    const { getUserDataPath, getAppVersion, platform } = deps

    function getDiagnosticsDir() {
        return path.join(getUserDataPath(), 'diagnostics')
    }

    async function rotateDiagnosticsLogIfNeeded(logPath: string) {
        try {
            const stat = await fs.stat(logPath)
            if (stat.size < DIAGNOSTIC_LOG_MAX_BYTES) return
        } catch (error) {
            const record = error as NodeJS.ErrnoException
            if (record.code === 'ENOENT') return
            throw error
        }

        for (let index = DIAGNOSTIC_LOG_BACKUP_COUNT; index >= 1; index -= 1) {
            const source = `${logPath}.${index}`
            const destination = `${logPath}.${index + 1}`
            try {
                await fs.rename(source, destination)
            } catch (error) {
                const record = error as NodeJS.ErrnoException
                if (record.code !== 'ENOENT') throw error
            }
        }

        await fs.rename(logPath, `${logPath}.1`)
    }

    async function appendDiagnosticsRow(logFileName: string, row: Record<string, unknown>) {
        const diagnosticsDir = getDiagnosticsDir()
        await fs.mkdir(diagnosticsDir, { recursive: true })
        const logPath = path.join(diagnosticsDir, logFileName)
        await rotateDiagnosticsLogIfNeeded(logPath)
        await fs.appendFile(logPath, `${JSON.stringify(row)}\n`, 'utf-8')
        return logPath
    }

    async function appendErrorReport(payload: {
        level?: 'error' | 'warn'
        message: string
        stack?: string
        source?: string
        extra?: string
    }) {
        const row = {
            ts: new Date().toISOString(),
            level: payload.level ?? 'error',
            message: payload.message,
            stack: payload.stack ?? '',
            source: payload.source ?? '',
            extra: payload.extra ?? '',
            appVersion: getAppVersion(),
            platform,
        }
        return appendDiagnosticsRow(RUNTIME_ERROR_LOG_FILE, row)
    }

    async function appendSubscriptionGateAuditLog(payload: {
        userId: string
        requestId: string
        featureId: FeatureId
        allowed: boolean
        reason: string
        plan: SubscriptionPlan
        requiredCredits: number
        consumeCredit: boolean
        idempotencyKey?: string
        replayed: boolean
        consumedCredits: number
        aiCreditsRemaining: number | null
    }) {
        const row = {
            ts: new Date().toISOString(),
            ...payload,
            appVersion: getAppVersion(),
            platform,
        }
        await appendDiagnosticsRow(SUBSCRIPTION_GATE_LOG_FILE, row)
    }

    async function appendSubscriptionCreditsRefundAuditLog(payload: {
        userId: string
        requestId: string
        idempotencyKey: string
        reason: SubscriptionCreditRefundReason
        status: SubscriptionCreditsRefundResponse['status']
        refundedCredits: number
        aiCreditsRemaining: number | null
    }) {
        const row = {
            ts: new Date().toISOString(),
            eventType: 'credits-refund',
            ...payload,
            appVersion: getAppVersion(),
            platform,
        }
        await appendDiagnosticsRow(SUBSCRIPTION_GATE_LOG_FILE, row)
    }

    async function appendCopilotRequestAuditLog(payload: {
        userId: string
        requestId: string
        idempotencyKey: string
        intent: CopilotIntent
        status: CopilotGenerateResponse['status']
        validationCode: CopilotGenerateResponse['validation']['code']
        commandCount: number
        previewOnly: boolean
        promptAnonymized?: string
        promptSignature?: string
        hasSelection?: boolean
        selectedTextLength?: number
        source?: 'ipc' | 'direct' | 'appserver'
        threadId?: string
        turnId?: string
        turnStatus?: CopilotAppServerTurnStatus
        tokenTotal?: number
        threadTokenTotal?: number
        userTokenTotal?: number
        retryCount?: number
        error?: string
    }) {
        const row = {
            ts: new Date().toISOString(),
            ...payload,
            appVersion: getAppVersion(),
            platform,
        }
        await appendDiagnosticsRow(COPILOT_REQUEST_LOG_FILE, row)
    }

    async function appendCopilotChatAuditLog(payload: {
        userId: string
        requestId: string
        model: string
        status: 'ok' | 'error'
        promptAnonymized?: string
        promptSignature?: string
        errorCode?: string
        threadId?: string
        turnId?: string
        turnStatus?: CopilotAppServerTurnStatus
        tokenTotal?: number
        threadTokenTotal?: number
        userTokenTotal?: number
        error?: string
    }) {
        const row = {
            ts: new Date().toISOString(),
            ...payload,
            appVersion: getAppVersion(),
            platform,
        }
        await appendDiagnosticsRow(COPILOT_CHAT_LOG_FILE, row)
    }

    return {
        getDiagnosticsDir,
        appendErrorReport,
        appendSubscriptionGateAuditLog,
        appendSubscriptionCreditsRefundAuditLog,
        appendCopilotRequestAuditLog,
        appendCopilotChatAuditLog,
    }
}
