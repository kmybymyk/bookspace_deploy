import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { createInterface, type Interface as ReadLineInterface } from 'readline'
import type { CopilotAppServerStreamEvent } from '../../shared/copilotIpc'

interface JsonRpcErrorPayload {
    code: number
    message: string
    data?: unknown
}

interface JsonRpcSuccessMessage {
    id: number
    result: unknown
}

interface JsonRpcErrorMessage {
    id: number
    error: JsonRpcErrorPayload
}

interface PendingRpcRequest {
    method: string
    resolve: (value: unknown) => void
    reject: (error: Error) => void
    timer: NodeJS.Timeout
}

interface TurnWaiter {
    resolve: (value: TurnCompletionSnapshot) => void
    reject: (error: Error) => void
    timer: NodeJS.Timeout
}

interface TurnCompletionSnapshot {
    status: 'completed' | 'interrupted' | 'failed' | 'inProgress'
    errorMessage?: string
}

interface CodexTurnErrorMetadata {
    threadId?: string
    turnId?: string
    turnStatus?: 'interrupted' | 'failed'
}

interface ThreadStartResult {
    thread?: {
        id?: string
    }
}

interface TurnStartResult {
    turn?: {
        id?: string
    }
}

interface ThreadReadResult {
    thread?: {
        turns?: Array<Record<string, unknown>>
    }
}

export interface CodexAppServerServiceOptions {
    appVersion: string
    command?: string
    defaultModel?: string
    rpcTimeoutMs?: number
    turnTimeoutMs?: number
}

export interface CodexAppServerTurnRequest {
    threadKey: string
    prompt: string
    systemPrompt?: string
    model?: string
    modelClass?: 'chat_simple' | 'command_generate'
    outputSchema?: Record<string, unknown>
    streamEnabled?: boolean
    operationKey?: string
    rpcTimeoutMs?: number
    turnTimeoutMs?: number
}

export interface CodexAppServerTurnResult {
    threadId: string
    turnId: string
    text: string
    tokenUsage: CodexAppServerTokenUsageSnapshot
}

export interface CodexAppServerTokenUsageSnapshot {
    inputTokens: number
    outputTokens: number
    totalTokens: number
    threadTotalTokens: number
    userTotalTokens: number
    threadBudgetTokens: number
    userBudgetTokens: number
    threadBudgetExceeded: boolean
    userBudgetExceeded: boolean
}

export type CodexAppServerStreamListener = (event: CopilotAppServerStreamEvent) => void

function buildTurnError(
    message: string,
    metadata: CodexTurnErrorMetadata,
): Error & CodexTurnErrorMetadata {
    const error = new Error(message) as Error & CodexTurnErrorMetadata
    if (metadata.threadId) error.threadId = metadata.threadId
    if (metadata.turnId) error.turnId = metadata.turnId
    if (metadata.turnStatus) error.turnStatus = metadata.turnStatus
    return error
}

export function readTurnErrorMetadata(error: unknown): CodexTurnErrorMetadata {
    if (!error || typeof error !== 'object') {
        return {}
    }
    const record = error as Record<string, unknown>
    const threadId = String(record.threadId ?? '').trim() || undefined
    const turnId = String(record.turnId ?? '').trim() || undefined
    const turnStatusRaw = String(record.turnStatus ?? '').trim()
    const turnStatus =
        turnStatusRaw === 'interrupted' || turnStatusRaw === 'failed'
            ? turnStatusRaw
            : undefined
    return {
        threadId,
        turnId,
        turnStatus,
    }
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null
}

function normalizeError(error: unknown): Error {
    if (error instanceof Error) return error
    return new Error(String(error))
}

function extractAgentText(turn: Record<string, unknown>): string {
    const itemsRaw = turn.items
    if (!Array.isArray(itemsRaw)) return ''
    for (let index = itemsRaw.length - 1; index >= 0; index -= 1) {
        const item = asRecord(itemsRaw[index])
        if (!item) continue
        if (String(item.type ?? '') !== 'agentMessage') continue
        const text = String(item.text ?? '').trim()
        if (text) return text
        const content = item.content
        if (Array.isArray(content)) {
            const textBlocks = content
                .map((entry) => asRecord(entry))
                .filter((entry): entry is Record<string, unknown> => Boolean(entry))
                .map((entry) => String(entry.text ?? '').trim())
                .filter(Boolean)
            if (textBlocks.length > 0) return textBlocks.join('\n')
        }
    }
    return ''
}

function readNumber(value: unknown): number {
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed < 0) return 0
    return parsed
}

function readTokenCountFromRecord(record: Record<string, unknown> | null): number {
    if (!record) return 0
    const directCandidates = [
        record.totalTokens,
        record.total_tokens,
        record.total,
        record.tokens,
    ]
    for (const candidate of directCandidates) {
        const numeric = readNumber(candidate)
        if (numeric > 0) return numeric
    }

    const nestedCandidates = [
        asRecord(record.totals),
        asRecord(record.usage),
        asRecord(record.tokenUsage),
        asRecord(record.current),
        asRecord(record.primary),
        asRecord(record.secondary),
    ]
    for (const nested of nestedCandidates) {
        const nestedCount = readTokenCountFromRecord(nested)
        if (nestedCount > 0) return nestedCount
    }
    return 0
}

function safeJsonParse(line: string): Record<string, unknown> | null {
    const trimmed = line.trim()
    if (!trimmed) return null
    try {
        const parsed = JSON.parse(trimmed)
        return asRecord(parsed)
    } catch {
        return null
    }
}

export function createCodexAppServerService(options: CodexAppServerServiceOptions) {
    const command = String(options.command ?? 'codex').trim() || 'codex'
    const defaultModel = String(options.defaultModel ?? process.env.BOOKSPACE_CODEX_MODEL ?? 'gpt-5.1-codex').trim()
    const chatModel =
        String(process.env.BOOKSPACE_CODEX_MODEL_CHAT ?? '').trim() || defaultModel
    const generateModel =
        String(process.env.BOOKSPACE_CODEX_MODEL_GENERATE ?? '').trim() || defaultModel
    const defaultRpcTimeoutMs = Math.max(1000, options.rpcTimeoutMs ?? 20_000)
    const defaultTurnTimeoutMs = Math.max(1000, options.turnTimeoutMs ?? 90_000)
    const compactEveryTurns = Math.max(
        4,
        Number(process.env.BOOKSPACE_CODEX_COMPACT_EVERY_TURNS ?? '12') || 12,
    )
    const threadTokenBudget = Math.max(
        20_000,
        Number(process.env.BOOKSPACE_CODEX_THREAD_BUDGET_TOKENS ?? '220000') || 220_000,
    )
    const userTokenBudget = Math.max(
        threadTokenBudget,
        Number(process.env.BOOKSPACE_CODEX_USER_BUDGET_TOKENS ?? '800000') || 800_000,
    )

    let processRef: ChildProcessWithoutNullStreams | null = null
    let stdoutReader: ReadLineInterface | null = null
    let nextRequestId = 1
    let startupPromise: Promise<void> | null = null
    let initialized = false
    let disposed = false

    const pendingRequests = new Map<number, PendingRpcRequest>()
    const turnWaiters = new Map<string, TurnWaiter>()
    const threadIdsByKey = new Map<string, string>()
    const threadKeysById = new Map<string, string>()
    const inFlightTurnsByOperationKey = new Map<
        string,
        { threadId: string; turnId: string; threadKey: string; streamEnabled: boolean }
    >()
    const operationKeysByTurnId = new Map<string, string>()
    const threadIdsByTurnId = new Map<string, string>()
    const turnIdsByItemId = new Map<string, string>()
    const streamTextByTurnId = new Map<string, string>()
    const streamListeners = new Set<CodexAppServerStreamListener>()
    const turnCountsByThreadId = new Map<string, number>()
    const threadTokenTotals = new Map<string, number>()
    let userTokenTotal = 0
    const recentStderr: string[] = []

    function pushStderr(chunk: string) {
        const text = String(chunk ?? '').trim()
        if (!text) return
        recentStderr.push(text)
        while (recentStderr.length > 20) {
            recentStderr.shift()
        }
    }

    function buildDebugSuffix() {
        if (recentStderr.length === 0) return ''
        const joined = recentStderr.slice(-3).join(' | ')
        return ` (stderr: ${joined})`
    }

    function emitStreamEvent(event: CopilotAppServerStreamEvent) {
        for (const listener of streamListeners) {
            try {
                listener(event)
            } catch {
                // ignore listener failures
            }
        }
    }

    function cleanupTurnStreamState(turnId: string) {
        const normalizedTurnId = String(turnId ?? '').trim()
        if (!normalizedTurnId) return
        operationKeysByTurnId.delete(normalizedTurnId)
        threadIdsByTurnId.delete(normalizedTurnId)
        streamTextByTurnId.delete(normalizedTurnId)
        for (const [itemId, mappedTurnId] of turnIdsByItemId.entries()) {
            if (mappedTurnId !== normalizedTurnId) continue
            turnIdsByItemId.delete(itemId)
        }
    }

    function rejectAllPending(error: Error) {
        for (const [id, request] of pendingRequests.entries()) {
            clearTimeout(request.timer)
            pendingRequests.delete(id)
            request.reject(error)
        }
        for (const [turnId, waiter] of turnWaiters.entries()) {
            clearTimeout(waiter.timer)
            turnWaiters.delete(turnId)
            waiter.reject(error)
        }
    }

    function handleProcessClosed(reason: string) {
        const error = new Error(`Codex app-server is unavailable: ${reason}${buildDebugSuffix()}`)
        initialized = false
        startupPromise = null
        threadIdsByKey.clear()
        threadKeysById.clear()
        inFlightTurnsByOperationKey.clear()
        operationKeysByTurnId.clear()
        threadIdsByTurnId.clear()
        turnIdsByItemId.clear()
        streamTextByTurnId.clear()
        turnCountsByThreadId.clear()
        threadTokenTotals.clear()
        userTokenTotal = 0
        if (stdoutReader) {
            stdoutReader.removeAllListeners()
            stdoutReader.close()
            stdoutReader = null
        }
        if (processRef) {
            processRef.removeAllListeners()
            processRef = null
        }
        rejectAllPending(error)
    }

    function handleNotification(method: string, params: Record<string, unknown> | null) {
        if (method === 'thread/tokenUsage/updated') {
            const threadId = String(params?.threadId ?? '').trim()
            if (!threadId) return
            const tokenCount = readTokenCountFromRecord(params)
            const previous = threadTokenTotals.get(threadId) ?? 0
            const next = Math.max(previous, tokenCount)
            if (next !== previous) {
                threadTokenTotals.set(threadId, next)
                userTokenTotal = Math.max(0, userTokenTotal - previous + next)
            }
            return
        }

        if (method === 'turn/started') {
            const turn = asRecord(params?.turn)
            const turnId = String(turn?.id ?? params?.turnId ?? '').trim()
            if (!turnId) return
            const operationKey = operationKeysByTurnId.get(turnId)
            const operationEntry = operationKey
                ? inFlightTurnsByOperationKey.get(operationKey)
                : undefined
            const threadId =
                String(
                    params?.threadId ??
                        turn?.threadId ??
                        operationEntry?.threadId ??
                        threadIdsByTurnId.get(turnId) ??
                        '',
                ).trim() || undefined
            if (threadId) {
                threadIdsByTurnId.set(turnId, threadId)
            }
            if (operationEntry && !operationEntry.streamEnabled) return
            emitStreamEvent({
                type: 'turn_started',
                threadId,
                threadKey:
                    operationEntry?.threadKey ??
                    (threadId ? threadKeysById.get(threadId) ?? undefined : undefined),
                turnId,
                status: 'inProgress',
            })
            return
        }

        if (method === 'item/started') {
            const item = asRecord(params?.item)
            if (!item) return
            if (String(item.type ?? '').trim() !== 'agentMessage') return
            const itemId = String(item.id ?? '').trim()
            if (!itemId) return
            const fallbackTurnId =
                inFlightTurnsByOperationKey.size === 1
                    ? [...inFlightTurnsByOperationKey.values()][0]?.turnId
                    : undefined
            const turnId = String(params?.turnId ?? fallbackTurnId ?? '').trim()
            if (!turnId) return
            turnIdsByItemId.set(itemId, turnId)
            const initialText = String(item.text ?? '').trim()
            if (initialText) {
                streamTextByTurnId.set(turnId, initialText)
            }
            return
        }

        if (method === 'item/agentMessage/delta') {
            const fallbackTurnId =
                inFlightTurnsByOperationKey.size === 1
                    ? [...inFlightTurnsByOperationKey.values()][0]?.turnId
                    : undefined
            const itemId = String(params?.itemId ?? '').trim()
            const turnId = String(
                params?.turnId ??
                    (itemId ? turnIdsByItemId.get(itemId) : '') ??
                    fallbackTurnId ??
                    '',
            ).trim()
            const operationKey = turnId ? operationKeysByTurnId.get(turnId) : undefined
            const operationEntry = operationKey
                ? inFlightTurnsByOperationKey.get(operationKey)
                : undefined
            const deltaValue = params?.delta ?? params?.textDelta ?? ''
            const delta = typeof deltaValue === 'string' ? deltaValue : String(deltaValue)
            if (!delta) return
            const threadId =
                String(
                    params?.threadId ??
                        operationEntry?.threadId ??
                        (turnId ? threadIdsByTurnId.get(turnId) : '') ??
                        '',
                ).trim() || undefined
            if (operationEntry && !operationEntry.streamEnabled) return
            let text: string | undefined
            if (turnId) {
                const currentText = streamTextByTurnId.get(turnId) ?? ''
                text = `${currentText}${delta}`
                streamTextByTurnId.set(turnId, text)
            }
            emitStreamEvent({
                type: 'delta',
                threadId,
                threadKey:
                    operationEntry?.threadKey ??
                    (threadId ? threadKeysById.get(threadId) ?? undefined : undefined),
                turnId: turnId || undefined,
                itemId: itemId || undefined,
                status: 'inProgress',
                delta,
                text,
            })
            return
        }

        if (method === 'turn/completed') {
            const turn = asRecord(params?.turn)
            const turnId = String(turn?.id ?? '').trim()
            if (!turnId) return
            const waiter = turnWaiters.get(turnId)
            if (!waiter) return
            clearTimeout(waiter.timer)
            turnWaiters.delete(turnId)

            const statusRaw = String(turn?.status ?? 'failed').trim()
            const status =
                statusRaw === 'completed' || statusRaw === 'interrupted' || statusRaw === 'inProgress'
                    ? statusRaw
                    : 'failed'
            const errorRecord = asRecord(turn?.error)
            const errorMessage = String(errorRecord?.message ?? '').trim() || undefined
            const operationKey = operationKeysByTurnId.get(turnId)
            const operationEntry = operationKey
                ? inFlightTurnsByOperationKey.get(operationKey)
                : undefined
            const threadId =
                String(
                    params?.threadId ??
                        turn?.threadId ??
                        operationEntry?.threadId ??
                        threadIdsByTurnId.get(turnId) ??
                        '',
                ).trim() || undefined
            if (!operationEntry || operationEntry.streamEnabled) {
                emitStreamEvent({
                    type: 'turn_completed',
                    threadId,
                    threadKey:
                        operationEntry?.threadKey ??
                        (threadId ? threadKeysById.get(threadId) ?? undefined : undefined),
                    turnId,
                    status: status === 'inProgress' ? 'completed' : status,
                    text: streamTextByTurnId.get(turnId),
                    error: errorMessage,
                })
            }
            cleanupTurnStreamState(turnId)
            waiter.resolve({
                status,
                errorMessage,
            })
        }
    }

    function handleStdoutLine(line: string) {
        const message = safeJsonParse(line)
        if (!message) return

        const messageId = message.id
        if (typeof messageId === 'number') {
            const pending = pendingRequests.get(messageId)
            if (!pending) return
            clearTimeout(pending.timer)
            pendingRequests.delete(messageId)

            const rpcError = asRecord(message.error) as JsonRpcErrorPayload | null
            if (rpcError && typeof rpcError.message === 'string') {
                pending.reject(
                    new Error(
                        `[Codex RPC:${pending.method}] ${rpcError.message}${buildDebugSuffix()}`,
                    ),
                )
                return
            }
            pending.resolve(message.result)
            return
        }

        const method = String(message.method ?? '').trim()
        if (!method) return
        handleNotification(method, asRecord(message.params))
    }

    function writeRpcMessage(payload: Record<string, unknown>) {
        if (!processRef?.stdin || !processRef.stdin.writable) {
            throw new Error(`Codex app-server stdin is not writable${buildDebugSuffix()}`)
        }
        processRef.stdin.write(`${JSON.stringify(payload)}\n`)
    }

    function callRpc<T>(
        method: string,
        params: Record<string, unknown> = {},
        timeoutMs = defaultRpcTimeoutMs,
    ): Promise<T> {
        if (disposed) {
            return Promise.reject(new Error('Codex app-server service is already disposed'))
        }

        const id = nextRequestId
        nextRequestId += 1

        return new Promise<T>((resolve, reject) => {
            const timer = setTimeout(() => {
                pendingRequests.delete(id)
                reject(new Error(`[Codex RPC:${method}] timeout after ${timeoutMs}ms`))
            }, timeoutMs)

            pendingRequests.set(id, {
                method,
                resolve: (value) => resolve(value as T),
                reject,
                timer,
            })

            try {
                writeRpcMessage({ method, id, params })
            } catch (error) {
                clearTimeout(timer)
                pendingRequests.delete(id)
                reject(normalizeError(error))
            }
        })
    }

    function notifyRpc(method: string, params: Record<string, unknown> = {}) {
        writeRpcMessage({ method, params })
    }

    async function startProcess() {
        if (disposed) {
            throw new Error('Codex app-server service is already disposed')
        }
        if (processRef) return

        const child = spawn(command, ['app-server'], {
            stdio: ['pipe', 'pipe', 'pipe'],
            env: process.env,
        })
        processRef = child

        child.stderr.on('data', (chunk) => {
            pushStderr(String(chunk ?? ''))
        })

        child.on('error', (error) => {
            handleProcessClosed(error instanceof Error ? error.message : String(error))
        })

        child.on('exit', (code, signal) => {
            const reason = `exit code=${String(code)} signal=${String(signal ?? 'none')}`
            handleProcessClosed(reason)
        })

        stdoutReader = createInterface({ input: child.stdout })
        stdoutReader.on('line', handleStdoutLine)

        await callRpc('initialize', {
            clientInfo: {
                name: 'bookspace_desktop',
                title: 'BookSpace Desktop',
                version: options.appVersion,
            },
        })
        notifyRpc('initialized', {})
        initialized = true
    }

    async function ensureReady() {
        if (initialized && processRef) return
        if (!startupPromise) {
            startupPromise = startProcess().catch((error) => {
                startupPromise = null
                throw error
            })
        }
        await startupPromise
    }

    async function ensureThreadId(threadKey: string, model?: string) {
        await ensureReady()
        const normalizedThreadKey = threadKey.trim() || 'bookspace-default-thread'
        const cached = threadIdsByKey.get(normalizedThreadKey)
        if (cached) return cached

        const threadStart = await callRpc<ThreadStartResult>('thread/start', {
            model: String(model ?? defaultModel).trim() || defaultModel,
        })
        const threadId = String(threadStart?.thread?.id ?? '').trim()
        if (!threadId) {
            throw new Error('Codex app-server thread/start returned empty thread id')
        }
        threadIdsByKey.set(normalizedThreadKey, threadId)
        threadKeysById.set(threadId, normalizedThreadKey)
        return threadId
    }

    function waitForTurnCompletion(turnId: string, timeoutMs = defaultTurnTimeoutMs) {
        return new Promise<TurnCompletionSnapshot>((resolve, reject) => {
            const timer = setTimeout(() => {
                turnWaiters.delete(turnId)
                reject(new Error(`[Codex turn:${turnId}] timeout after ${timeoutMs}ms`))
            }, timeoutMs)
            turnWaiters.set(turnId, {
                resolve,
                reject,
                timer,
            })
        })
    }

    async function readTurnText(threadId: string, turnId: string, timeoutMs = defaultRpcTimeoutMs) {
        const threadRead = await callRpc<ThreadReadResult>(
            'thread/read',
            {
                threadId,
                includeTurns: true,
            },
            timeoutMs,
        )
        const turns = Array.isArray(threadRead?.thread?.turns) ? threadRead.thread?.turns ?? [] : []
        const turn = turns.find((entry) => String(asRecord(entry)?.id ?? '').trim() === turnId)
        if (!turn) return ''
        return extractAgentText(asRecord(turn) ?? {})
    }

    function resolveModelForRequest(request: CodexAppServerTurnRequest): string {
        const explicitModel = String(request.model ?? '').trim()
        if (explicitModel) return explicitModel
        if (request.modelClass === 'chat_simple') return chatModel
        if (request.modelClass === 'command_generate') return generateModel
        return defaultModel
    }

    function buildTokenUsageSnapshot(threadId: string): CodexAppServerTokenUsageSnapshot {
        const threadTotalTokens = threadTokenTotals.get(threadId) ?? 0
        return {
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            threadTotalTokens,
            userTotalTokens: userTokenTotal,
            threadBudgetTokens: threadTokenBudget,
            userBudgetTokens: userTokenBudget,
            threadBudgetExceeded: threadTotalTokens >= threadTokenBudget,
            userBudgetExceeded: userTokenTotal >= userTokenBudget,
        }
    }

    function assertTokenBudget(threadId: string) {
        const usage = buildTokenUsageSnapshot(threadId)
        if (usage.threadBudgetExceeded) {
            throw new Error(
                `Codex token budget exceeded for thread (${usage.threadTotalTokens}/${usage.threadBudgetTokens})`,
            )
        }
        if (usage.userBudgetExceeded) {
            throw new Error(
                `Codex token budget exceeded for user (${usage.userTotalTokens}/${usage.userBudgetTokens})`,
            )
        }
    }

    async function maybeCompactThread(threadId: string) {
        const turnCount = turnCountsByThreadId.get(threadId) ?? 0
        if (turnCount <= 0 || turnCount % compactEveryTurns !== 0) return
        try {
            await callRpc('thread/compact/start', { threadId }, defaultRpcTimeoutMs)
        } catch {
            // compaction failure should not block requests
        }
    }

    async function runTurnText(request: CodexAppServerTurnRequest): Promise<CodexAppServerTurnResult> {
        const model = resolveModelForRequest(request)
        const threadId = await ensureThreadId(request.threadKey, model)
        const prompt = String(request.prompt ?? '').trim()
        if (!prompt) {
            throw new Error('prompt is required for Codex app-server turn')
        }
        assertTokenBudget(threadId)
        await maybeCompactThread(threadId)
        const beforeThreadTokenTotal = threadTokenTotals.get(threadId) ?? 0

        const systemPrompt = String(request.systemPrompt ?? '').trim()
        const mergedPrompt = systemPrompt
            ? `${systemPrompt}\n\nUser:\n${prompt}`
            : prompt
        const outputSchema = request.outputSchema && typeof request.outputSchema === 'object'
            ? request.outputSchema
            : undefined

        const turnStart = await callRpc<TurnStartResult>(
            'turn/start',
            {
                threadId,
                model,
                input: [
                    {
                        type: 'text',
                        text: mergedPrompt,
                    },
                ],
                ...(outputSchema ? { outputSchema } : {}),
            },
            request.rpcTimeoutMs ?? defaultRpcTimeoutMs,
        )
        const turnId = String(turnStart?.turn?.id ?? '').trim()
        if (!turnId) {
            throw new Error('Codex app-server turn/start returned empty turn id')
        }

        const operationKey = String(request.operationKey ?? '').trim()
        if (operationKey) {
            inFlightTurnsByOperationKey.set(operationKey, {
                threadId,
                turnId,
                threadKey: request.threadKey,
                streamEnabled: request.streamEnabled !== false,
            })
            operationKeysByTurnId.set(turnId, operationKey)
        }
        threadIdsByTurnId.set(turnId, threadId)

        try {
            const completion = await waitForTurnCompletion(turnId, request.turnTimeoutMs ?? defaultTurnTimeoutMs)
            if (completion.status === 'failed') {
                throw buildTurnError(
                    completion.errorMessage ?? `Codex turn failed (${turnId})`,
                    {
                        threadId,
                        turnId,
                        turnStatus: 'failed',
                    },
                )
            }
            if (completion.status === 'interrupted') {
                throw buildTurnError(`Codex turn interrupted (${turnId})`, {
                    threadId,
                    turnId,
                    turnStatus: 'interrupted',
                })
            }

            const text = await readTurnText(threadId, turnId, request.rpcTimeoutMs ?? defaultRpcTimeoutMs)
            turnCountsByThreadId.set(threadId, (turnCountsByThreadId.get(threadId) ?? 0) + 1)
            let usageSnapshot = buildTokenUsageSnapshot(threadId)
            if (usageSnapshot.threadTotalTokens <= beforeThreadTokenTotal) {
                const estimatedTurnTokens = Math.max(
                    1,
                    Math.ceil((prompt.length + String(text ?? '').length) / 3),
                )
                const nextThreadTotal = beforeThreadTokenTotal + estimatedTurnTokens
                threadTokenTotals.set(threadId, nextThreadTotal)
                userTokenTotal = Math.max(0, userTokenTotal + estimatedTurnTokens)
                usageSnapshot = buildTokenUsageSnapshot(threadId)
            }
            const turnTotalTokens = Math.max(0, usageSnapshot.threadTotalTokens - beforeThreadTokenTotal)
            const approximateInputTokens = Math.max(1, Math.ceil(prompt.length / 4))
            return {
                threadId,
                turnId,
                text,
                tokenUsage: {
                    ...usageSnapshot,
                    inputTokens: approximateInputTokens,
                    totalTokens: turnTotalTokens,
                    outputTokens: Math.max(0, turnTotalTokens - approximateInputTokens),
                },
            }
        } finally {
            if (operationKey) {
                inFlightTurnsByOperationKey.delete(operationKey)
            }
            cleanupTurnStreamState(turnId)
        }
    }

    async function interruptTurnByOperationKey(operationKey: string) {
        const normalizedOperationKey = String(operationKey ?? '').trim()
        if (!normalizedOperationKey) return false
        const entry = inFlightTurnsByOperationKey.get(normalizedOperationKey)
        if (!entry) return false
        await ensureReady()
        await callRpc(
            'turn/interrupt',
            {
                threadId: entry.threadId,
                turnId: entry.turnId,
            },
            defaultRpcTimeoutMs,
        )
        return true
    }

    async function steerTurnByOperationKey(
        operationKey: string,
        steerPrompt: string,
        expectedTurnId?: string,
    ) {
        const normalizedOperationKey = String(operationKey ?? '').trim()
        if (!normalizedOperationKey) {
            throw new Error('operationKey is required')
        }
        const entry = inFlightTurnsByOperationKey.get(normalizedOperationKey)
        if (!entry) {
            throw new Error('No active turn is in progress for this thread.')
        }
        const prompt = String(steerPrompt ?? '').trim()
        if (!prompt) {
            throw new Error('steer prompt is required')
        }
        if (expectedTurnId && entry.turnId !== expectedTurnId) {
            throw new Error('Active turn id mismatch for steer request.')
        }
        await ensureReady()
        const result = await callRpc<{ turnId?: string }>(
            'turn/steer',
            {
                threadId: entry.threadId,
                expectedTurnId: entry.turnId,
                input: [{ type: 'text', text: prompt }],
            },
            defaultRpcTimeoutMs,
        )
        const turnId = String(result?.turnId ?? entry.turnId).trim() || entry.turnId
        if (turnId !== entry.turnId) {
            cleanupTurnStreamState(entry.turnId)
        }
        inFlightTurnsByOperationKey.set(normalizedOperationKey, {
            threadId: entry.threadId,
            turnId,
            threadKey: entry.threadKey,
            streamEnabled: entry.streamEnabled,
        })
        operationKeysByTurnId.set(turnId, normalizedOperationKey)
        threadIdsByTurnId.set(turnId, entry.threadId)
        return {
            threadId: entry.threadId,
            turnId,
        }
    }

    function getInFlightTurnByOperationKey(operationKey: string) {
        const normalizedOperationKey = String(operationKey ?? '').trim()
        if (!normalizedOperationKey) return null
        const entry = inFlightTurnsByOperationKey.get(normalizedOperationKey)
        if (!entry) return null
        return {
            threadId: entry.threadId,
            turnId: entry.turnId,
        }
    }

    function getTokenUsageSnapshotByThreadId(threadId: string | null | undefined) {
        const normalizedThreadId = String(threadId ?? '').trim()
        if (!normalizedThreadId) return null
        return buildTokenUsageSnapshot(normalizedThreadId)
    }

    function onStreamEvent(listener: CodexAppServerStreamListener) {
        streamListeners.add(listener)
        return () => {
            streamListeners.delete(listener)
        }
    }

    function getThreadIdByThreadKey(threadKey: string) {
        const normalizedThreadKey = String(threadKey ?? '').trim()
        if (!normalizedThreadKey) return null
        return threadIdsByKey.get(normalizedThreadKey) ?? null
    }

    function forgetThreadKey(threadKey: string) {
        const normalizedThreadKey = String(threadKey ?? '').trim()
        if (!normalizedThreadKey) return
        const threadId = threadIdsByKey.get(normalizedThreadKey)
        threadIdsByKey.delete(normalizedThreadKey)
        if (threadId) {
            threadKeysById.delete(threadId)
            turnCountsByThreadId.delete(threadId)
            const prevTokens = threadTokenTotals.get(threadId) ?? 0
            if (prevTokens > 0) {
                userTokenTotal = Math.max(0, userTokenTotal - prevTokens)
            }
            threadTokenTotals.delete(threadId)
            for (const [turnId, mappedThreadId] of threadIdsByTurnId.entries()) {
                if (mappedThreadId !== threadId) continue
                cleanupTurnStreamState(turnId)
            }
        }
    }

    function clearThreadKeyCache() {
        threadIdsByKey.clear()
        threadKeysById.clear()
        inFlightTurnsByOperationKey.clear()
        operationKeysByTurnId.clear()
        threadIdsByTurnId.clear()
        turnIdsByItemId.clear()
        streamTextByTurnId.clear()
        turnCountsByThreadId.clear()
        threadTokenTotals.clear()
        userTokenTotal = 0
    }

    function setThreadIdForThreadKey(threadKey: string, threadId: string) {
        const normalizedThreadKey = String(threadKey ?? '').trim()
        const normalizedThreadId = String(threadId ?? '').trim()
        if (!normalizedThreadKey || !normalizedThreadId) return
        threadIdsByKey.set(normalizedThreadKey, normalizedThreadId)
        threadKeysById.set(normalizedThreadId, normalizedThreadKey)
    }

    async function ensureThreadFromExistingId(threadKey: string, threadId: string) {
        const normalizedThreadKey = String(threadKey ?? '').trim()
        const normalizedThreadId = String(threadId ?? '').trim()
        if (!normalizedThreadKey || !normalizedThreadId) {
            return null
        }
        await ensureReady()
        try {
            const result = await callRpc<ThreadReadResult>(
                'thread/read',
                {
                    threadId: normalizedThreadId,
                    includeTurns: false,
                },
                defaultRpcTimeoutMs,
            )
            const resolvedThreadId = String(result?.thread ? normalizedThreadId : '').trim()
            if (!resolvedThreadId) return null
            threadIdsByKey.set(normalizedThreadKey, resolvedThreadId)
            threadKeysById.set(resolvedThreadId, normalizedThreadKey)
            return resolvedThreadId
        } catch {
            return null
        }
    }

    function dispose() {
        if (disposed) return
        disposed = true
        const currentProcess = processRef
        if (currentProcess && !currentProcess.killed) {
            currentProcess.kill('SIGTERM')
        }
        handleProcessClosed('dispose called')
    }

    return {
        runTurnText,
        interruptTurnByOperationKey,
        steerTurnByOperationKey,
        onStreamEvent,
        getInFlightTurnByOperationKey,
        getTokenUsageSnapshotByThreadId,
        getThreadIdByThreadKey,
        forgetThreadKey,
        clearThreadKeyCache,
        setThreadIdForThreadKey,
        ensureThreadFromExistingId,
        dispose,
    }
}
