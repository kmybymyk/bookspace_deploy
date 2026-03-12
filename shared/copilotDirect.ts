import type {
  CopilotDirectErrorInfo,
} from './copilotIpc'

export interface DirectCompletionFetchConfig {
  baseUrl: string
  apiKey: string
  model: string
  prompt: string
  systemPrompt: string
  temperature: number
}

export function buildDirectCompletionUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/chat/completions`
}

export function buildDirectCompletionBody(config: DirectCompletionFetchConfig): Record<string, unknown> {
  return {
    model: config.model,
    temperature: config.temperature,
    messages: [
      { role: 'system', content: config.systemPrompt },
      { role: 'user', content: config.prompt },
    ],
  }
}

function trimText(value: unknown): string {
  return String(value ?? '').trim()
}

export function readDirectCompletionText(payload: unknown): string {
  const object = payload as Record<string, unknown> | null
  if (!object || typeof object !== 'object') return ''
  const choices = object.choices as Array<Record<string, unknown>> | undefined
  const first = choices?.[0]
  const message = first?.message as Record<string, unknown> | undefined
  return trimText(message?.content)
}

export function classifyDirectError(error: unknown, status?: number): CopilotDirectErrorInfo {
  if (typeof status === 'number') {
    if (status === 401) return { code: 'UNAUTHORIZED', status, message: 'API key is invalid or missing.' }
    if (status === 403) return { code: 'FORBIDDEN', status, message: 'Request is forbidden by provider policy.' }
    if (status === 404) return { code: 'NOT_FOUND', status, message: 'Model or endpoint was not found.' }
    if (status === 408) return { code: 'TIMEOUT', status, message: 'The request timed out.' }
    if (status === 429) return { code: 'RATE_LIMITED', status, message: 'Rate limit exceeded. Retry later.' }
    if (status >= 500) return { code: 'SERVER_ERROR', status, message: 'Provider server error.' }
    if (status >= 400) return { code: 'INVALID_REQUEST', status, message: 'Provider rejected the request.' }
  }

  if (error instanceof DOMException && error.name === 'AbortError') {
    return { code: 'TIMEOUT', message: 'The request timed out.' }
  }
  const raw = trimText(error instanceof Error ? error.message : error)
  if (/failed to fetch|fetch failed|networkerror|enotfound|econnrefused|eai_again/i.test(raw)) {
    return { code: 'NETWORK_FETCH_FAILED', message: 'Network request failed before a response was received.' }
  }
  if (/timeout|aborted/i.test(raw)) {
    return { code: 'TIMEOUT', message: 'The request timed out.' }
  }
  return {
    code: 'UNKNOWN',
    message: raw || 'Unknown direct API error.',
  }
}

export function formatDirectError(info: CopilotDirectErrorInfo): string {
  const statusPart = typeof info.status === 'number' ? ` (${info.status})` : ''
  return `${info.code}${statusPart}: ${info.message}`
}
