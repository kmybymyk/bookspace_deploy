import capabilityRegistryJson from './copilotCapabilityRegistry.v1.json'
import type { CopilotIntent } from './copilotIpc'

interface CapabilityRule {
  intent: CopilotIntent
  priority: number
  requiresSelection: boolean
  keywordsAny: string[]
  keywordsAll: string[]
}

interface CapabilityRegistry {
  version: string
  defaultRoute: 'chat' | 'command'
  capabilities: CapabilityRule[]
}

export interface ResolveCopilotIntentPlanInput {
  prompt: string
  hasSelection: boolean
  fallbackIntent?: CopilotIntent
}

export interface ResolveCopilotIntentPlanResult {
  route: 'chat' | 'command'
  reason: string
  version: string
  intent: CopilotIntent | null
  matchedIntents: CopilotIntent[]
  confidence: number
}

const capabilityRegistry = capabilityRegistryJson as CapabilityRegistry

export const COMMAND_CONFIDENCE_THRESHOLD = 0.62
const COMMAND_FALLBACK_RATIO = 0.85
const COMMAND_FALLBACK_CONFIDENCE_THRESHOLD = COMMAND_CONFIDENCE_THRESHOLD * COMMAND_FALLBACK_RATIO

function normalizePrompt(prompt: string): string {
  return String(prompt ?? '').toLowerCase().trim()
}

function isWordLikeChar(char: string | undefined): boolean {
  if (!char) return false
  return /[\p{L}\p{N}_]/u.test(char)
}

function isSingleHangulKeyword(keyword: string): boolean {
  return /^[가-힣]$/u.test(keyword)
}

function isAllowedHangulSuffix(char: string | undefined): boolean {
  if (!char) return true
  return /[은는이가을를와과도의로만에에서부터까지나랑]/u.test(char)
}

function includesKeyword(prompt: string, keyword: string): boolean {
  const normalizedKeyword = String(keyword ?? '').toLowerCase().trim()
  if (!normalizedKeyword) return false
  if (!isSingleHangulKeyword(normalizedKeyword)) {
    return prompt.includes(normalizedKeyword)
  }

  let fromIndex = 0
  while (fromIndex < prompt.length) {
    const matchIndex = prompt.indexOf(normalizedKeyword, fromIndex)
    if (matchIndex === -1) return false

    const before = prompt[matchIndex - 1]
    const after = prompt[matchIndex + normalizedKeyword.length]
    const beforePass = !isWordLikeChar(before)
    const afterPass = !isWordLikeChar(after) || isAllowedHangulSuffix(after)

    if (beforePass && afterPass) {
      return true
    }

    fromIndex = matchIndex + normalizedKeyword.length
  }

  return false
}

function matchesRule(prompt: string, rule: CapabilityRule): boolean {
  const anyKeywords = Array.isArray(rule.keywordsAny) ? rule.keywordsAny : []
  const allKeywords = Array.isArray(rule.keywordsAll) ? rule.keywordsAll : []
  const anyPass = anyKeywords.length === 0 || anyKeywords.some((keyword) => includesKeyword(prompt, keyword))
  const allPass = allKeywords.length === 0 || allKeywords.every((keyword) => includesKeyword(prompt, keyword))
  return anyPass && allPass
}

function scoreRule(prompt: string, rule: CapabilityRule): number {
  const anyKeywords = Array.isArray(rule.keywordsAny) ? rule.keywordsAny : []
  const allKeywords = Array.isArray(rule.keywordsAll) ? rule.keywordsAll : []
  const matchedAnyCount = anyKeywords.filter((keyword) => includesKeyword(prompt, keyword)).length
  const matchedAllCount = allKeywords.filter((keyword) => includesKeyword(prompt, keyword)).length
  const anyCoverage = anyKeywords.length > 0 ? matchedAnyCount / anyKeywords.length : 1
  const allCoverage = allKeywords.length > 0 ? matchedAllCount / allKeywords.length : 1
  const priorityScore = Math.min(1, Math.max(0, Number(rule.priority ?? 0) / 100))
  const composite = priorityScore * 0.5 + anyCoverage * 0.4 + allCoverage * 0.1
  return Number(composite.toFixed(4))
}

export function resolveCopilotIntentPlan(
  input: ResolveCopilotIntentPlanInput,
): ResolveCopilotIntentPlanResult {
  const prompt = normalizePrompt(input.prompt)
  if (!prompt) {
    const fallback = input.fallbackIntent ?? null
    return {
      route: fallback ? 'command' : 'chat',
      reason: fallback ? 'fallback-intent' : 'empty-prompt',
      version: capabilityRegistry.version,
      intent: fallback,
      matchedIntents: fallback ? [fallback] : [],
      confidence: fallback ? 0.5 : 1,
    }
  }

  const sortedRules = [...capabilityRegistry.capabilities].sort((a, b) => b.priority - a.priority)
  const matchedRules = sortedRules.filter((rule) => matchesRule(prompt, rule))
  const allowedRules = matchedRules.filter((rule) => !rule.requiresSelection || input.hasSelection)
  const scoredAllowedRules = allowedRules
    .map((rule) => ({ rule, score: scoreRule(prompt, rule) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return b.rule.priority - a.rule.priority
    })
  const matchedIntents = scoredAllowedRules.map((entry) => entry.rule.intent)
  const topScore = scoredAllowedRules[0]?.score ?? 0

  if (matchedIntents.length > 0 && topScore >= COMMAND_CONFIDENCE_THRESHOLD) {
    return {
      route: 'command',
      reason: 'intent-match',
      version: capabilityRegistry.version,
      intent: matchedIntents[0],
      matchedIntents,
      confidence: topScore,
    }
  }

  if (input.fallbackIntent) {
    return {
      route: topScore >= COMMAND_FALLBACK_CONFIDENCE_THRESHOLD ? 'command' : 'chat',
      reason:
        matchedRules.length > 0
          ? topScore >= COMMAND_FALLBACK_CONFIDENCE_THRESHOLD
            ? 'selection-restricted-fallback'
            : 'low-confidence'
          : 'fallback-intent',
      version: capabilityRegistry.version,
      intent: topScore >= COMMAND_FALLBACK_CONFIDENCE_THRESHOLD ? input.fallbackIntent : null,
      matchedIntents: topScore >= COMMAND_FALLBACK_CONFIDENCE_THRESHOLD ? [input.fallbackIntent] : [],
      confidence: Number(topScore.toFixed(4)),
    }
  }

  return {
    route: 'chat',
    reason: matchedRules.length > 0 ? 'selection-required' : 'no-intent-match',
    version: capabilityRegistry.version,
    intent: null,
    matchedIntents: [],
    confidence: Number(topScore.toFixed(4)),
  }
}
