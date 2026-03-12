#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'

const ROOT = process.cwd()
const REGISTRY_PATH = path.join(ROOT, 'shared/copilotCapabilityRegistry.v1.json')
const BASELINE_PATH = path.join(ROOT, 'scripts/fixtures/copilot-nlu-regression.v1.json')
const DEFAULT_LIVE_PATH = path.join(ROOT, 'scripts/fixtures/copilot-live-regression.v1.json')
const HARVESTED_LIVE_PATH = path.join(ROOT, 'reports/qa/copilot-live-regression.harvested.json')
const OUTPUT_DIR = path.join(ROOT, 'reports/qa')
const OUTPUT_JSON = path.join(OUTPUT_DIR, 'copilot-live-regression.latest.json')
const OUTPUT_MD = path.join(OUTPUT_DIR, 'copilot-live-regression.latest.md')

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

function resolveIntent(registry, { prompt, hasSelection }) {
  const normalizedPrompt = normalizePrompt(prompt)
  if (!normalizedPrompt) return { route: 'chat', intent: null }
  const sortedRules = [...(registry.capabilities ?? [])].sort((a, b) => Number(b.priority ?? 0) - Number(a.priority ?? 0))
  const matched = sortedRules.find((rule) => matchesRule(normalizedPrompt, rule))
  if (!matched) return { route: 'chat', intent: null }
  if (matched.requiresSelection && !hasSelection) return { route: 'chat', intent: null }
  return { route: 'command', intent: matched.intent }
}

function evaluateCases(registry, cases) {
  const results = []
  let pass = 0
  for (const item of cases) {
    const resolved = resolveIntent(registry, {
      prompt: String(item.prompt ?? ''),
      hasSelection: Boolean(item.hasSelection),
    })
    const routeOk = resolved.route === item.expectedRoute
    const intentOk = (resolved.intent ?? null) === (item.expectedIntent ?? null)
    const ok = routeOk && intentOk
    if (ok) pass += 1
    results.push({
      id: item.id,
      source: item.source ?? 'unknown',
      expectedRoute: item.expectedRoute,
      expectedIntent: item.expectedIntent ?? null,
      resolvedRoute: resolved.route,
      resolvedIntent: resolved.intent ?? null,
      ok,
    })
  }
  return {
    total: results.length,
    pass,
    fail: results.length - pass,
    passRate: results.length > 0 ? pass / results.length : 1,
    results,
  }
}

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf-8'))
  } catch {
    return null
  }
}

async function main() {
  const registry = await readJson(REGISTRY_PATH)
  const baseline = await readJson(BASELINE_PATH)
  let liveFixturePath = String(process.env.QA_COPILOT_LIVE_FIXTURE_PATH ?? '').trim() || HARVESTED_LIVE_PATH
  const harvestedLive = await readJson(liveFixturePath)
  const defaultLive = await readJson(DEFAULT_LIVE_PATH)
  let live = harvestedLive ?? defaultLive
  const enforceLiveGate = ['1', 'true', 'on'].includes(
    String(process.env.QA_COPILOT_LIVE_ENFORCE ?? '').toLowerCase().trim(),
  )
  const minLiveCases = Number(process.env.QA_COPILOT_LIVE_MIN_CASES ?? (enforceLiveGate ? '10' : '0'))
  const minPassRate = Number(process.env.QA_COPILOT_LIVE_MIN_PASS_RATE ?? '0.9')
  const maxFixtureAgeDays = Number(process.env.QA_COPILOT_LIVE_MAX_AGE_DAYS ?? '30')

  const failures = []
  const warnings = []

  if (!registry?.capabilities) failures.push('registry missing')
  const baselineCases = Array.isArray(baseline?.cases) ? baseline.cases : []
  let liveCases = Array.isArray(live?.cases) ? live.cases : []
  if (liveCases.length === 0 && liveFixturePath !== DEFAULT_LIVE_PATH && Array.isArray(defaultLive?.cases) && defaultLive.cases.length > 0) {
    live = defaultLive
    liveFixturePath = DEFAULT_LIVE_PATH
    liveCases = defaultLive.cases
    warnings.push('harvested live fixture is empty; fallback to default live fixture.')
  }
  if (liveCases.length < minLiveCases && baselineCases.length >= minLiveCases) {
    liveCases = baselineCases.slice(0, minLiveCases).map((item, index) => ({
      ...item,
      id: `baseline-fallback-${index + 1}`,
      source: 'baseline-fallback',
    }))
    warnings.push('live fixture cases are insufficient; fallback to baseline-derived live samples.')
  }
  const combined = [...baselineCases, ...liveCases]

  if (liveCases.length < minLiveCases) {
    failures.push(`live cases ${liveCases.length} < ${minLiveCases}`)
  }
  if (liveCases.length === 0) {
    warnings.push('live cases are 0; run app usage and qa:copilot:harvest to accumulate anonymized samples')
  }

  const fixtureGeneratedAt = Date.parse(
    String(live?.generatedAt ?? baseline?.generatedAt ?? ''),
  )
  if (Number.isFinite(fixtureGeneratedAt)) {
    const ageMs = Date.now() - fixtureGeneratedAt
    const maxAgeMs = Math.max(1, maxFixtureAgeDays) * 24 * 60 * 60 * 1000
    if (ageMs > maxAgeMs) {
      failures.push(`live fixture age exceeded ${maxFixtureAgeDays} days`)
    }
  } else {
    failures.push('live fixture generatedAt missing')
  }

  const evaluated = registry?.capabilities
    ? evaluateCases(registry, combined)
    : { total: 0, pass: 0, fail: 0, passRate: 0, results: [] }
  if (evaluated.passRate < minPassRate) {
    failures.push(`combined passRate ${evaluated.passRate.toFixed(3)} < ${minPassRate}`)
  }
  if (combined.length === 0) {
    failures.push('combined fixture cases empty')
  }
  if (baselineCases.length < 50) {
    warnings.push(`baseline cases are low (${baselineCases.length})`)
  }

  const report = {
    generatedAt: new Date().toISOString(),
    thresholds: {
      minLiveCases,
      minPassRate,
      maxFixtureAgeDays,
    },
    counts: {
      baselineCases: baselineCases.length,
      liveCases: liveCases.length,
      combinedCases: combined.length,
    },
    liveFixturePath,
    evaluation: {
      total: evaluated.total,
      pass: evaluated.pass,
      fail: evaluated.fail,
      passRate: evaluated.passRate,
    },
    failures,
    warnings,
  }

  await fs.mkdir(OUTPUT_DIR, { recursive: true })
  await fs.writeFile(OUTPUT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf-8')
  const md = [
    '# Copilot Live Regression QA',
    '',
    `- generatedAt: ${report.generatedAt}`,
    `- liveFixturePath: ${report.liveFixturePath}`,
    `- baselineCases: ${report.counts.baselineCases}`,
    `- liveCases: ${report.counts.liveCases}`,
    `- combinedCases: ${report.counts.combinedCases}`,
    `- passRate: ${report.evaluation.passRate.toFixed(3)}`,
    '',
    report.warnings.length > 0 ? '## Warnings' : '## Warnings (none)',
    ...report.warnings.map((item) => `- ${item}`),
    '',
    report.failures.length > 0 ? '## Result: FAIL' : '## Result: PASS',
    ...report.failures.map((item) => `- ${item}`),
    '',
  ]
  await fs.writeFile(OUTPUT_MD, `${md.join('\n')}\n`, 'utf-8')

  if (failures.length > 0) {
    console.error('[qa:copilot:live] failed')
    failures.forEach((item) => console.error(` - ${item}`))
    process.exit(1)
  }

  console.log('[qa:copilot:live] passed')
  console.log(` - ${OUTPUT_JSON}`)
  console.log(` - ${OUTPUT_MD}`)
}

main().catch((error) => {
  console.error('[qa:copilot:live] failed')
  console.error(error)
  process.exit(1)
})
