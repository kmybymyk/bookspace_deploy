#!/usr/bin/env node
import fs from 'node:fs/promises'
import fssync from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const ROOT = process.cwd()
const OUTPUT_DIR = path.join(ROOT, 'reports/qa')
const OUTPUT_JSON = path.join(OUTPUT_DIR, 'copilot-metrics.latest.json')
const OUTPUT_MD = path.join(OUTPUT_DIR, 'copilot-metrics.latest.md')
const INTENT_REPORT_PATH = path.join(OUTPUT_DIR, 'copilot-intent-eval.latest.json')
const ACTION_REPORT_PATH = path.join(OUTPUT_DIR, 'copilot-action-eval.latest.json')
const DIAGNOSTIC_FILES = {
  requests: 'copilot-requests.ndjson',
  chat: 'copilot-chat.ndjson',
}

const MIN_INTENT_ACCURACY = Number.parseFloat(process.env.QA_COPILOT_INTENT_ACCURACY_MIN ?? '0.92')
const MIN_APPLY_SUCCESS_RATE = Number.parseFloat(process.env.QA_COPILOT_APPLY_SUCCESS_MIN ?? '0.9')
const MAX_RETRY_RATE = Number.parseFloat(process.env.QA_COPILOT_RETRY_RATE_MAX ?? '0.35')
const MAX_AVG_TOKENS_PER_TURN = Number.parseFloat(process.env.QA_COPILOT_AVG_TOKENS_MAX ?? '5000')
const REQUIRED = process.env.QA_COPILOT_METRICS_REQUIRED === '1'

function resolveDiagnosticsDirs() {
  const home = os.homedir()
  return [
    path.join(home, 'Library', 'Application Support', 'bookspace', 'diagnostics'),
    path.join(home, 'Library', 'Application Support', 'BookSpace', 'diagnostics'),
    path.join(process.env.APPDATA ?? '', 'BookSpace', 'diagnostics'),
    path.join(home, '.config', 'BookSpace', 'diagnostics'),
  ].filter(Boolean)
}

async function readJsonIfExists(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function parseNdjson(raw) {
  return raw
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line)
      } catch {
        return null
      }
    })
    .filter(Boolean)
}

async function readDiagnosticsRows(fileName) {
  const dirs = resolveDiagnosticsDirs()
  const rows = []
  for (const dir of dirs) {
    const filePath = path.join(dir, fileName)
    if (!fssync.existsSync(filePath)) continue
    const raw = await fs.readFile(filePath, 'utf-8')
    rows.push(...parseNdjson(raw))
  }
  return rows
}

function asNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function safeRate(numerator, denominator) {
  if (!Number.isFinite(denominator) || denominator <= 0) return null
  return numerator / denominator
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true })
  const failures = []
  const warnings = []

  const intentReport = await readJsonIfExists(INTENT_REPORT_PATH)
  const actionReport = await readJsonIfExists(ACTION_REPORT_PATH)
  const requestRows = await readDiagnosticsRows(DIAGNOSTIC_FILES.requests)
  const chatRows = await readDiagnosticsRows(DIAGNOSTIC_FILES.chat)

  const intentPassed = asNumber(intentReport?.summary?.passedCases)
  const intentTotal = asNumber(intentReport?.summary?.totalCases)
  const intentAccuracy = safeRate(intentPassed, intentTotal)
  if (intentAccuracy === null) {
    warnings.push('intent accuracy source is missing.')
  } else if (intentAccuracy < MIN_INTENT_ACCURACY) {
    failures.push(
      `intent accuracy ${(intentAccuracy * 100).toFixed(2)}% < ${(MIN_INTENT_ACCURACY * 100).toFixed(2)}%`,
    )
  }

  const appserverRequests = requestRows.filter((row) => String(row?.source ?? 'appserver') === 'appserver')
  const requestTotal = appserverRequests.length
  const requestSuccess = appserverRequests.filter((row) => String(row?.status ?? '') === 'ok').length
  let applySuccessRate = safeRate(requestSuccess, requestTotal)
  if (applySuccessRate === null && actionReport) {
    const actionFailures = Array.isArray(actionReport.failures) ? actionReport.failures.length : 0
    applySuccessRate = actionFailures === 0 ? 1 : 0
    warnings.push('apply success rate used fallback source (copilot action eval).')
  }
  if (applySuccessRate === null) {
    warnings.push('apply success rate source is missing.')
  } else if (applySuccessRate < MIN_APPLY_SUCCESS_RATE) {
    failures.push(
      `apply success rate ${(applySuccessRate * 100).toFixed(2)}% < ${(MIN_APPLY_SUCCESS_RATE * 100).toFixed(2)}%`,
    )
  }

  const retryCount = appserverRequests.reduce((acc, row) => acc + asNumber(row?.retryCount), 0)
  const retryRateComputed = safeRate(retryCount, requestTotal)
  const retryRate = retryRateComputed ?? 0
  if (retryRateComputed === null) {
    warnings.push('retry rate source is missing. defaulted to 0.')
  }
  if (retryRate > MAX_RETRY_RATE) {
    failures.push(`retry rate ${(retryRate * 100).toFixed(2)}% > ${(MAX_RETRY_RATE * 100).toFixed(2)}%`)
  }

  const tokenSamples = [...appserverRequests, ...chatRows]
    .map((row) => asNumber(row?.tokenTotal))
    .filter((value) => value > 0)
  const avgTokensPerTurnComputed =
    tokenSamples.length > 0
      ? tokenSamples.reduce((acc, value) => acc + value, 0) / tokenSamples.length
      : null
  const avgTokensPerTurn = avgTokensPerTurnComputed ?? 0
  if (avgTokensPerTurn > MAX_AVG_TOKENS_PER_TURN) {
    failures.push(`avg tokens/turn ${avgTokensPerTurn.toFixed(2)} > ${MAX_AVG_TOKENS_PER_TURN.toFixed(2)}`)
  }

  if (REQUIRED) {
    if (intentAccuracy === null) failures.push('intent accuracy metric is required.')
    if (applySuccessRate === null) failures.push('apply success rate metric is required.')
  }

  const report = {
    generatedAt: new Date().toISOString(),
    thresholds: {
      minIntentAccuracy: MIN_INTENT_ACCURACY,
      minApplySuccessRate: MIN_APPLY_SUCCESS_RATE,
      maxRetryRate: MAX_RETRY_RATE,
      maxAvgTokensPerTurn: MAX_AVG_TOKENS_PER_TURN,
    },
    metrics: {
      intentAccuracy,
      applySuccessRate,
      retryRate,
      avgTokensPerTurn,
      sampleSizes: {
        intentCases: intentTotal,
        requestRows: requestTotal,
        tokenSamples: tokenSamples.length,
      },
    },
    warnings,
    failures,
    ok: failures.length === 0,
  }

  await fs.writeFile(OUTPUT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf-8')
  const md = [
    '# Copilot Metrics QA',
    '',
    `- generatedAt: ${report.generatedAt}`,
    `- intentAccuracy: ${
      intentAccuracy === null ? '(no data)' : `${(intentAccuracy * 100).toFixed(2)}%`
    }`,
    `- applySuccessRate: ${
      applySuccessRate === null ? '(no data)' : `${(applySuccessRate * 100).toFixed(2)}%`
    }`,
    `- retryRate: ${retryRate === null ? '(no data)' : `${(retryRate * 100).toFixed(2)}%`}`,
    `- avgTokensPerTurn: ${avgTokensPerTurn === null ? '(no data)' : avgTokensPerTurn.toFixed(2)}`,
    '',
    warnings.length > 0 ? '## Warnings' : '## Warnings (none)',
    ...warnings.map((item) => `- ${item}`),
    '',
    failures.length > 0 ? '## Result: FAIL' : '## Result: PASS',
    ...failures.map((item) => `- ${item}`),
    '',
  ]
  await fs.writeFile(OUTPUT_MD, `${md.join('\n')}\n`, 'utf-8')

  if (failures.length > 0) {
    console.error('[qa:copilot:metrics] failed')
    failures.forEach((item) => console.error(` - ${item}`))
    process.exit(1)
  }

  console.log('[qa:copilot:metrics] passed')
  console.log(` - ${OUTPUT_JSON}`)
  console.log(` - ${OUTPUT_MD}`)
}

main().catch((error) => {
  console.error('[qa:copilot:metrics] failed')
  console.error(error)
  process.exit(1)
})
