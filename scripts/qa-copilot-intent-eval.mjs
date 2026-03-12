#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '..')

const RULEMAP_PATH = path.join(root, 'shared/copilotIntentRuleMap.v1.json')
const FIXTURE_PATH = path.join(root, 'scripts/fixtures/copilot-intent-fixtures.v1.json')
const OUTPUT_DIR = path.join(root, 'reports/qa')
const OUTPUT_JSON = path.join(OUTPUT_DIR, 'copilot-intent-eval.latest.json')
const OUTPUT_MD = path.join(OUTPUT_DIR, 'copilot-intent-eval.latest.md')

const failures = []
const warnings = []
const checks = []

function check(ok, name, details) {
  checks.push({ name, ok, details })
  if (!ok) failures.push(`${name}: ${details}`)
}

function warn(ok, name, details) {
  if (!ok) warnings.push(`${name}: ${details}`)
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

  const anyPass =
    anyKeywords.length === 0 || anyKeywords.some((keyword) => includesKeyword(prompt, keyword))
  const allPass =
    allKeywords.length === 0 || allKeywords.every((keyword) => includesKeyword(prompt, keyword))
  return anyPass && allPass
}

function resolveIntent(ruleMap, { prompt, hasSelection }) {
  const normalizedPrompt = normalizePrompt(prompt)
  if (!normalizedPrompt) {
    return { route: 'chat', intent: null, reason: 'empty-prompt' }
  }

  const sortedRules = [...ruleMap.intents].sort(
    (a, b) => Number(b.priority ?? 0) - Number(a.priority ?? 0),
  )
  const matched = sortedRules.find((rule) => matchesRule(normalizedPrompt, rule))
  if (!matched) {
    return { route: 'chat', intent: null, reason: 'no-intent-match' }
  }
  if (matched.intent === 'rewrite_selection' && !hasSelection) {
    return { route: 'chat', intent: null, reason: 'rewrite-missing-selection' }
  }
  return { route: 'command', intent: matched.intent, reason: 'intent-match' }
}

function validateRuleMap(ruleMap) {
  check(typeof ruleMap.version === 'string' && ruleMap.version.length > 0, 'rulemap/version', 'rulemap.version required')
  check(ruleMap.defaultRoute === 'chat', 'rulemap/default-route', 'defaultRoute should be chat')
  check(Array.isArray(ruleMap.intents) && ruleMap.intents.length > 0, 'rulemap/intents', 'intents should not be empty')
  const seenIntents = new Set()
  for (const intentRule of ruleMap.intents) {
    const intent = String(intentRule.intent ?? '')
    check(Boolean(intent), `rulemap/intent/${intent || 'unknown'}`, 'intent is required')
    warn(!seenIntents.has(intent), `rulemap/duplicate/${intent}`, 'duplicate intent rule found')
    seenIntents.add(intent)
    check(
      Number.isFinite(Number(intentRule.priority)),
      `rulemap/priority/${intent}`,
      'priority should be numeric',
    )
  }
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true })
  const ruleMap = JSON.parse(await fs.readFile(RULEMAP_PATH, 'utf-8'))
  const fixture = JSON.parse(await fs.readFile(FIXTURE_PATH, 'utf-8'))

  validateRuleMap(ruleMap)

  const cases = Array.isArray(fixture.cases) ? fixture.cases : []
  check(cases.length > 0, 'fixture/cases', 'fixture cases should not be empty')

  const results = cases.map((testCase) => {
    const resolved = resolveIntent(ruleMap, {
      prompt: testCase.prompt,
      hasSelection: Boolean(testCase.hasSelection),
    })
    const routeOk = resolved.route === testCase.expectedRoute
    const intentOk = (resolved.intent ?? null) === (testCase.expectedIntent ?? null)
    check(routeOk, `case/${testCase.id}/route`, `expected ${testCase.expectedRoute}, got ${resolved.route}`)
    check(intentOk, `case/${testCase.id}/intent`, `expected ${testCase.expectedIntent}, got ${resolved.intent}`)
    return {
      id: testCase.id,
      prompt: testCase.prompt,
      hasSelection: Boolean(testCase.hasSelection),
      expectedRoute: testCase.expectedRoute,
      expectedIntent: testCase.expectedIntent ?? null,
      resolvedRoute: resolved.route,
      resolvedIntent: resolved.intent ?? null,
      reason: resolved.reason,
      pass: routeOk && intentOk,
    }
  })

  const report = {
    createdAt: new Date().toISOString(),
    ruleMapVersion: ruleMap.version,
    fixtureVersion: fixture.version,
    summary: {
      totalCases: results.length,
      passedCases: results.filter((item) => item.pass).length,
      failedCases: results.filter((item) => !item.pass).length,
      warnings: warnings.length,
      failures: failures.length,
    },
    checks,
    warnings,
    failures,
    results,
  }

  await fs.writeFile(OUTPUT_JSON, JSON.stringify(report, null, 2), 'utf-8')

  const md = [
    '# Copilot Intent Eval Report',
    '',
    `- createdAt: ${report.createdAt}`,
    `- ruleMapVersion: ${report.ruleMapVersion}`,
    `- fixtureVersion: ${report.fixtureVersion}`,
    `- totalCases: ${report.summary.totalCases}`,
    `- failedCases: ${report.summary.failedCases}`,
    '',
    '## Case Results',
    ...results.map((item) =>
      `- ${item.pass ? 'PASS' : 'FAIL'} ${item.id}: expected(${item.expectedRoute}/${item.expectedIntent}) resolved(${item.resolvedRoute}/${item.resolvedIntent})`,
    ),
    '',
    warnings.length > 0 ? '## Warnings' : '## Warnings (none)',
    ...warnings.map((item) => `- ${item}`),
    '',
    failures.length > 0 ? '## Result: FAIL' : '## Result: PASS',
    ...failures.map((item) => `- ${item}`),
    '',
  ]
  await fs.writeFile(OUTPUT_MD, md.join('\n'), 'utf-8')

  if (failures.length > 0) {
    console.error('[qa:copilot:eval] failed')
    failures.forEach((item) => console.error(` - ${item}`))
    process.exit(1)
  }

  console.log('[qa:copilot:eval] passed')
  console.log(` - ${OUTPUT_JSON}`)
  console.log(` - ${OUTPUT_MD}`)
}

main().catch((error) => {
  console.error('[qa:copilot:eval] failed')
  console.error(error)
  process.exit(1)
})

