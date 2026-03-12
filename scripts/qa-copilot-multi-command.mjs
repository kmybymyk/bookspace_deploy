#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'

const ROOT = process.cwd()
const FIXTURE_PATH = path.join(ROOT, 'scripts/fixtures/copilot-multi-command.v1.json')
const REGISTRY_PATH = path.join(ROOT, 'shared/copilotCapabilityRegistry.v1.json')
const MAIN_PATH = path.join(ROOT, 'electron/main.ts')
const COPILOT_RUNTIME_PATH = path.join(ROOT, 'electron/services/copilotRuntimeService.ts')
const RUNTIME_PATH = path.join(ROOT, 'scripts/subscription-runtime-api.mjs')
const OUTPUT_DIR = path.join(ROOT, 'reports/qa')
const OUTPUT_JSON = path.join(OUTPUT_DIR, 'copilot-multi-command.latest.json')
const OUTPUT_MD = path.join(OUTPUT_DIR, 'copilot-multi-command.latest.md')

function arraysEqual(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false
  if (a.length !== b.length) return false
  return a.every((value, index) => String(value) === String(b[index]))
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

function resolvePlan(registry, { prompt, hasSelection }) {
  const normalized = normalizePrompt(prompt)
  if (!normalized) {
    return { route: 'chat', intent: null, matchedIntents: [] }
  }
  const sortedRules = [...(registry.capabilities ?? [])].sort((a, b) => Number(b.priority ?? 0) - Number(a.priority ?? 0))
  const matched = sortedRules.filter((rule) => matchesRule(normalized, rule))
  const allowed = matched.filter((rule) => !rule.requiresSelection || hasSelection)
  if (allowed.length === 0) {
    return { route: 'chat', intent: null, matchedIntents: [] }
  }
  const intents = allowed.map((rule) => rule.intent)
  return { route: 'command', intent: intents[0] ?? null, matchedIntents: intents }
}

async function main() {
  const fixture = JSON.parse(await fs.readFile(FIXTURE_PATH, 'utf-8'))
  const registry = JSON.parse(await fs.readFile(REGISTRY_PATH, 'utf-8'))
  const mainSource = await fs.readFile(MAIN_PATH, 'utf-8')
  const copilotRuntimeSource = await fs.readFile(COPILOT_RUNTIME_PATH, 'utf-8')
  const runtimeSource = await fs.readFile(RUNTIME_PATH, 'utf-8')
  const checks = []
  const failures = []

  for (const testCase of fixture.cases ?? []) {
    const resolved = resolvePlan(registry, {
      prompt: String(testCase.prompt ?? ''),
      hasSelection: Boolean(testCase.hasSelection),
    })
    const routeOk = resolved.route === testCase.expectedRoute
    const primaryOk = (resolved.intent ?? null) === (testCase.expectedPrimaryIntent ?? null)
    const intentsOk = arraysEqual(resolved.matchedIntents, testCase.expectedIntents ?? [])

    checks.push({ name: `${testCase.id}/route`, ok: routeOk })
    checks.push({ name: `${testCase.id}/primary`, ok: primaryOk })
    checks.push({ name: `${testCase.id}/intents`, ok: intentsOk })

    if (!routeOk) failures.push(`${testCase.id}: expected route ${testCase.expectedRoute}, got ${resolved.route}`)
    if (!primaryOk) failures.push(`${testCase.id}: expected primary ${testCase.expectedPrimaryIntent}, got ${resolved.intent}`)
    if (!intentsOk) failures.push(`${testCase.id}: expected intents ${JSON.stringify(testCase.expectedIntents)}, got ${JSON.stringify(resolved.matchedIntents)}`)
  }

  const mainIntegrated =
    mainSource.includes('resolveCopilotIntentPlan({') ||
    copilotRuntimeSource.includes('resolveCopilotIntentPlan({')
  const runtimeIntegrated = runtimeSource.includes('resolveCopilotIntentPlan({')
  checks.push({ name: 'integration/main', ok: mainIntegrated })
  checks.push({ name: 'integration/runtime', ok: runtimeIntegrated })
  if (!mainIntegrated) failures.push('integration/main: resolveCopilotIntentPlan not found')
  if (!runtimeIntegrated) failures.push('integration/runtime: resolveCopilotIntentPlan not found')

  const report = {
    generatedAt: new Date().toISOString(),
    ok: failures.length === 0,
    checks,
    failures,
  }
  await fs.mkdir(OUTPUT_DIR, { recursive: true })
  await fs.writeFile(OUTPUT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf-8')
  const md = [
    '# Copilot Multi Command QA',
    '',
    `- generatedAt: ${report.generatedAt}`,
    `- checks: ${checks.length}`,
    `- failures: ${failures.length}`,
    '',
    report.ok ? '## Result: PASS' : '## Result: FAIL',
    ...failures.map((item) => `- ${item}`),
    '',
  ]
  await fs.writeFile(OUTPUT_MD, `${md.join('\n')}\n`, 'utf-8')

  if (!report.ok) {
    console.error('[qa:copilot:multi] failed')
    failures.forEach((item) => console.error(` - ${item}`))
    process.exit(1)
  }
  console.log('[qa:copilot:multi] passed')
  console.log(` - ${OUTPUT_JSON}`)
  console.log(` - ${OUTPUT_MD}`)
}

main().catch((error) => {
  console.error('[qa:copilot:multi] failed')
  console.error(error)
  process.exit(1)
})
