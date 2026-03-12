#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  buildDirectCompletionBody,
  buildDirectCompletionUrl,
  classifyDirectError,
} from '../shared/copilotDirect.ts'

const OUTPUT_DIR = path.resolve('reports/qa')
const OUTPUT_JSON = path.join(OUTPUT_DIR, 'copilot-stability.latest.json')
const OUTPUT_MD = path.join(OUTPUT_DIR, 'copilot-stability.latest.md')
const NLU_FIXTURE_PATH = path.resolve('scripts/fixtures/copilot-nlu-regression.v1.json')
const REGISTRY_PATH = path.resolve('shared/copilotCapabilityRegistry.v1.json')

const STRICT = process.env.QA_COPILOT_STABILITY_REQUIRED === '1'
const ENABLED = process.env.QA_COPILOT_LIVE_RUN === '1' || STRICT
const ITERATIONS = Number.parseInt(process.env.QA_COPILOT_LIVE_ITERATIONS ?? '20', 10)
const TARGET_SUCCESS_RATE = Number.parseFloat(process.env.QA_COPILOT_TARGET_SUCCESS_RATE ?? '0.98')

const baseUrl = String(
  process.env.COPILOT_DIRECT_API_BASE_URL ??
  process.env.VITE_COPILOT_DIRECT_API_BASE_URL ??
  'https://api.groq.com/openai/v1',
).trim()
const apiKey = String(
  process.env.COPILOT_DIRECT_API_KEY ??
  process.env.VITE_COPILOT_DIRECT_API_KEY ??
  '',
).trim()
const model = String(
  process.env.COPILOT_DIRECT_MODEL ??
  process.env.VITE_COPILOT_DIRECT_MODEL ??
  'openai/gpt-oss-120b',
).trim()

function nowIso() {
  return new Date().toISOString()
}

function normalizePrompt(prompt) {
  return String(prompt ?? '').toLowerCase().trim()
}

function includesKeyword(prompt, keyword) {
  const normalized = String(keyword ?? '').toLowerCase().trim()
  if (!normalized) return false
  return prompt.includes(normalized)
}

function matchesRule(prompt, rule) {
  const anyKeywords = Array.isArray(rule.keywordsAny) ? rule.keywordsAny : []
  const allKeywords = Array.isArray(rule.keywordsAll) ? rule.keywordsAll : []
  const anyPass = anyKeywords.length === 0 || anyKeywords.some((keyword) => includesKeyword(prompt, keyword))
  const allPass = allKeywords.length === 0 || allKeywords.every((keyword) => includesKeyword(prompt, keyword))
  return anyPass && allPass
}

async function writeReport(payload) {
  await fs.mkdir(OUTPUT_DIR, { recursive: true })
  await fs.writeFile(OUTPUT_JSON, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8')
  const md = [
    '# Copilot Live Stability QA',
    '',
    `- generatedAt: ${payload.generatedAt}`,
    `- enabled: ${payload.enabled}`,
    `- strict: ${payload.strict}`,
    `- iterations: ${payload.iterations}`,
    `- successRate: ${(payload.summary.successRate * 100).toFixed(2)}%`,
    `- target: ${(payload.summary.targetSuccessRate * 100).toFixed(2)}%`,
    '',
    '## Error Breakdown',
    ...Object.entries(payload.summary.errorCounts).map(([key, value]) => `- ${key}: ${value}`),
    '',
    payload.ok ? '## Result: PASS' : '## Result: FAIL',
    ...(payload.failures ?? []).map((item) => `- ${item}`),
    '',
  ]
  await fs.writeFile(OUTPUT_MD, `${md.join('\n')}\n`, 'utf-8')
}

async function callOnce(index) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20_000)
  const prompt = `health-check-${index}: 짧게 응답해줘.`
  try {
    const response = await fetch(buildDirectCompletionUrl(baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(
        buildDirectCompletionBody({
          baseUrl,
          apiKey,
          model,
          prompt,
          systemPrompt: 'Reply in one short Korean sentence.',
          temperature: 0.2,
        }),
      ),
      signal: controller.signal,
    })
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      return {
        ok: false,
        errorInfo: classifyDirectError(detail || response.statusText, response.status),
      }
    }
    const payload = await response.json().catch(() => ({}))
    const content = String(
      payload?.choices?.[0]?.message?.content ?? '',
    ).trim()
    if (!content) {
      return {
        ok: false,
        errorInfo: { code: 'UNKNOWN', message: 'Empty completion content.' },
      }
    }
    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      errorInfo: classifyDirectError(error),
    }
  } finally {
    clearTimeout(timeout)
  }
}

function resolveRouteIntent(registry, prompt, hasSelection) {
  const normalized = normalizePrompt(prompt)
  if (!normalized) {
    return {
      route: 'chat',
      intent: null,
    }
  }
  const sortedRules = [...(registry.capabilities ?? [])].sort((a, b) => Number(b.priority ?? 0) - Number(a.priority ?? 0))
  const matched = sortedRules.find((rule) => matchesRule(normalized, rule))
  if (!matched) {
    return {
      route: 'chat',
      intent: null,
    }
  }
  if (matched.requiresSelection && !hasSelection) {
    return {
      route: 'chat',
      intent: null,
    }
  }
  if (matched.intent) {
    return {
      route: 'command',
      intent: matched.intent,
    }
  }
  return {
    route: 'chat',
    intent: null,
  }
}

async function runOfflineStability() {
  const registryRaw = await fs.readFile(REGISTRY_PATH, 'utf-8')
  const registry = JSON.parse(registryRaw)
  const raw = await fs.readFile(NLU_FIXTURE_PATH, 'utf-8')
  const fixture = JSON.parse(raw)
  const cases = Array.isArray(fixture?.cases) ? fixture.cases : []
  const failures = []
  if (!Array.isArray(registry?.capabilities) || registry.capabilities.length === 0) {
    failures.push('copilot capability registry is missing.')
  }
  if (cases.length === 0) {
    failures.push('copilot nlu fixture cases are empty.')
  }
  if (failures.length > 0) {
    return {
      successRate: 0,
      success: 0,
      failed: 0,
      errorCounts: {},
      failures,
    }
  }

  let success = 0
  const errorCounts = {}
  for (let index = 0; index < ITERATIONS; index += 1) {
    const current = cases[index % cases.length]
    const resolved = resolveRouteIntent(registry, current.prompt, current.hasSelection)
    const expectedRoute = String(current.expectedRoute ?? 'chat')
    const expectedIntent = current.expectedIntent ?? null
    const routeOk = resolved.route === expectedRoute
    const intentOk = (resolved.intent ?? null) === expectedIntent
    if (routeOk && intentOk) {
      success += 1
      continue
    }
    if (!routeOk) {
      errorCounts.ROUTE_MISMATCH = (errorCounts.ROUTE_MISMATCH ?? 0) + 1
    } else {
      errorCounts.INTENT_MISMATCH = (errorCounts.INTENT_MISMATCH ?? 0) + 1
    }
  }

  const successRate = ITERATIONS > 0 ? success / ITERATIONS : 0
  if (successRate < TARGET_SUCCESS_RATE) {
    failures.push(`offline successRate ${successRate.toFixed(4)} is below target ${TARGET_SUCCESS_RATE.toFixed(4)}.`)
  }
  return {
    successRate,
    success,
    failed: ITERATIONS - success,
    errorCounts,
    failures,
  }
}

async function main() {
  const failures = []
  if (!ENABLED) {
    const payload = {
      generatedAt: nowIso(),
      enabled: false,
      strict: STRICT,
      iterations: 0,
      summary: {
        successRate: 1,
        targetSuccessRate: TARGET_SUCCESS_RATE,
        errorCounts: {},
      },
      ok: true,
      failures: [],
      note: 'Set QA_COPILOT_LIVE_RUN=1 to run live stability checks.',
    }
    await writeReport(payload)
    console.log('[qa:copilot:stability] skipped')
    console.log(` - ${OUTPUT_JSON}`)
    console.log(` - ${OUTPUT_MD}`)
    return
  }

  if (!apiKey) {
    const offline = await runOfflineStability()
    const payload = {
      generatedAt: nowIso(),
      enabled: true,
      strict: STRICT,
      iterations: ITERATIONS,
      mode: 'offline-intent-regression',
      summary: {
        successRate: offline.successRate,
        targetSuccessRate: TARGET_SUCCESS_RATE,
        success: offline.success,
        failed: offline.failed,
        errorCounts: offline.errorCounts,
      },
      ok: offline.failures.length === 0,
      failures: offline.failures,
      note: 'Direct API key is missing. Ran offline intent-stability fallback for app-server-only mode.',
    }
    await writeReport(payload)
    if (offline.failures.length > 0) {
      console.error('[qa:copilot:stability] failed')
      offline.failures.forEach((item) => console.error(` - ${item}`))
      process.exit(1)
    }
    console.log('[qa:copilot:stability] passed')
    console.log(` - ${OUTPUT_JSON}`)
    console.log(` - ${OUTPUT_MD}`)
    return
  }

  let success = 0
  const errorCounts = {}
  for (let index = 0; index < ITERATIONS; index += 1) {
    const result = await callOnce(index + 1)
    if (result.ok) {
      success += 1
      continue
    }
    const code = String(result.errorInfo?.code ?? 'UNKNOWN')
    errorCounts[code] = (errorCounts[code] ?? 0) + 1
  }

  const successRate = ITERATIONS > 0 ? success / ITERATIONS : 0
  if (successRate < TARGET_SUCCESS_RATE) {
    failures.push(`successRate ${successRate.toFixed(4)} is below target ${TARGET_SUCCESS_RATE.toFixed(4)}.`)
  }

  const payload = {
    generatedAt: nowIso(),
    enabled: true,
    strict: STRICT,
    iterations: ITERATIONS,
    summary: {
      successRate,
      targetSuccessRate: TARGET_SUCCESS_RATE,
      success,
      failed: ITERATIONS - success,
      errorCounts,
    },
    ok: failures.length === 0,
    failures,
  }
  await writeReport(payload)

  if (failures.length > 0) {
    console.error('[qa:copilot:stability] failed')
    failures.forEach((item) => console.error(` - ${item}`))
    process.exit(1)
  }
  console.log('[qa:copilot:stability] passed')
  console.log(` - ${OUTPUT_JSON}`)
  console.log(` - ${OUTPUT_MD}`)
}

main().catch(async (error) => {
  const payload = {
    generatedAt: nowIso(),
    enabled: ENABLED,
    strict: STRICT,
    iterations: 0,
    summary: {
      successRate: 0,
      targetSuccessRate: TARGET_SUCCESS_RATE,
      errorCounts: {},
    },
    ok: false,
    failures: [error instanceof Error ? error.message : String(error)],
  }
  await writeReport(payload)
  console.error('[qa:copilot:stability] failed')
  console.error(error)
  process.exit(1)
})
