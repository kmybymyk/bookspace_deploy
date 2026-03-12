import fs from 'node:fs/promises'
import path from 'node:path'

const OUTPUT_DIR = path.resolve('reports/qa')
const OUTPUT_MD = path.join(OUTPUT_DIR, 'latest.md')
const OUTPUT_JSON = path.join(OUTPUT_DIR, 'latest.json')

async function readJsonIfExists(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf-8')
    const stat = await fs.stat(filePath)
    return {
      data: JSON.parse(raw),
      mtimeMs: stat.mtimeMs,
      filePath,
    }
  } catch {
    return null
  }
}

function sectionStatus(sectionReport, nowMs, maxAgeMs) {
  if (!sectionReport) return { status: 'MISSING', failures: ['missing report'], ageHours: null }
  const section = sectionReport.data
  const failures = [...(section.failures ?? [])]

  const createdAtRaw = section.createdAt ?? section.generatedAt ?? null
  const createdAtMs = createdAtRaw ? Date.parse(String(createdAtRaw)) : NaN
  const effectiveTimestampMs = Number.isFinite(createdAtMs) ? createdAtMs : sectionReport.mtimeMs
  const ageMs = Number.isFinite(effectiveTimestampMs) ? Math.max(0, nowMs - effectiveTimestampMs) : Number.POSITIVE_INFINITY
  const ageHours = Number.isFinite(ageMs) ? Number((ageMs / (1000 * 60 * 60)).toFixed(2)) : null

  if (!Number.isFinite(ageMs) || ageMs > maxAgeMs) {
    const currentAge = ageHours === null ? 'unknown' : `${ageHours}h`
    const threshold = `${(maxAgeMs / (1000 * 60 * 60)).toFixed(2)}h`
    failures.push(`stale report (${currentAge} > ${threshold})`)
  }

  return { status: failures.length === 0 ? 'PASS' : 'FAIL', failures, ageHours }
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true })
  const nowMs = Date.now()
  const maxAgeHours = Number(process.env.QA_REPORT_MAX_AGE_HOURS ?? '36')
  const maxAgeMs = Math.max(1, maxAgeHours) * 60 * 60 * 1000

  const assertions = await readJsonIfExists(path.resolve('reports/qa/assertions.latest.json'))
  const serverSchema = await readJsonIfExists(path.resolve('reports/qa/server-schema.latest.json'))
  const serverRuntime = await readJsonIfExists(path.resolve('reports/qa/server-runtime.latest.json'))
  const docx = await readJsonIfExists(path.resolve('reports/qa/docx.latest.json'))
  const functional = await readJsonIfExists(path.resolve('reports/qa/functional.latest.json'))
  const copilotHarvest = await readJsonIfExists(path.resolve('reports/qa/copilot-log-harvest.latest.json'))
  const copilotLive = await readJsonIfExists(path.resolve('reports/qa/copilot-live-regression.latest.json'))
  const copilotMetrics = await readJsonIfExists(path.resolve('reports/qa/copilot-metrics.latest.json'))
  const subscriptionHttp = await readJsonIfExists(path.resolve('reports/qa/subscription-http.latest.json'))
  const e2e = await readJsonIfExists(path.resolve('reports/qa/e2e.latest.json'))
  const runtime = await readJsonIfExists(path.resolve('reports/qa/runtime-errors.latest.json'))
  const perf = await readJsonIfExists(path.resolve('reports/perf/latest.json'))

  const sections = {
    assertions: sectionStatus(assertions, nowMs, maxAgeMs),
    serverSchema: sectionStatus(serverSchema, nowMs, maxAgeMs),
    serverRuntime: sectionStatus(serverRuntime, nowMs, maxAgeMs),
    docx: sectionStatus(docx, nowMs, maxAgeMs),
    functional: sectionStatus(functional, nowMs, maxAgeMs),
    copilotHarvest: sectionStatus(copilotHarvest, nowMs, maxAgeMs),
    copilotLive: sectionStatus(copilotLive, nowMs, maxAgeMs),
    copilotMetrics: sectionStatus(copilotMetrics, nowMs, maxAgeMs),
    subscriptionHttp: sectionStatus(subscriptionHttp, nowMs, maxAgeMs),
    e2e: sectionStatus(e2e, nowMs, maxAgeMs),
    runtime: sectionStatus(runtime, nowMs, maxAgeMs),
    perf: sectionStatus(perf, nowMs, maxAgeMs),
  }

  const allFailures = Object.entries(sections).flatMap(([name, section]) =>
    section.failures.map((msg) => `[${name}] ${msg}`),
  )

  const report = {
    createdAt: new Date().toISOString(),
    freshness: {
      maxAgeHours,
    },
    sections,
    perfScenarios: perf?.data?.scenarios?.map((s) => ({
      name: s.metrics?.scenario?.name,
      exportMs: s.metrics?.exportDocx?.durationMs,
      parseMs: s.metrics?.parseDocx?.durationMs,
      exportHeapDeltaMB: s.metrics?.memory?.exportHeapDeltaMB,
    })) ?? [],
    runtimeLast24h: runtime?.data?.last24h ?? null,
    warnings: [
      ...(assertions?.data?.warnings ?? []).map((w) => `[assertions] ${w}`),
      ...(serverSchema?.data?.warnings ?? []).map((w) => `[serverSchema] ${w}`),
      ...(serverRuntime?.data?.warnings ?? []).map((w) => `[serverRuntime] ${w}`),
      ...(functional?.data?.warnings ?? []).map((w) => `[functional] ${w}`),
      ...(copilotHarvest?.data?.warnings ?? []).map((w) => `[copilotHarvest] ${w}`),
      ...(copilotLive?.data?.warnings ?? []).map((w) => `[copilotLive] ${w}`),
      ...(copilotMetrics?.data?.warnings ?? []).map((w) => `[copilotMetrics] ${w}`),
      ...(subscriptionHttp?.data?.warnings ?? []).map((w) => `[subscriptionHttp] ${w}`),
      ...(runtime?.data?.warnings ?? []).map((w) => `[runtime] ${w}`),
    ],
    failures: allFailures,
  }

  await fs.writeFile(OUTPUT_JSON, JSON.stringify(report, null, 2), 'utf-8')

  const lines = [
    '# QA Summary',
    '',
    `- createdAt: ${report.createdAt}`,
    `- freshness maxAgeHours: ${report.freshness.maxAgeHours}`,
    `- assertions: ${sections.assertions.status}`,
    `- serverSchema: ${sections.serverSchema.status}`,
    `- serverRuntime: ${sections.serverRuntime.status}`,
    `- functional: ${sections.functional.status}`,
    `- copilotHarvest: ${sections.copilotHarvest.status}`,
    `- copilotLive: ${sections.copilotLive.status}`,
    `- copilotMetrics: ${sections.copilotMetrics.status}`,
    `- subscriptionHttp: ${sections.subscriptionHttp.status}`,
    `- e2e: ${sections.e2e.status}`,
    `- docx: ${sections.docx.status}`,
    `- perf: ${sections.perf.status}`,
    `- runtime: ${sections.runtime.status}`,
    runtime?.data?.last24h
      ? `- runtime(24h): total=${runtime.data.last24h.total}, errors=${runtime.data.last24h.errors}, warns=${runtime.data.last24h.warns}`
      : '- runtime(24h): (no data)',
    '',
    '## Perf Scenarios',
    ...(report.perfScenarios.length > 0
      ? report.perfScenarios.map((s) => `- ${s.name}: export=${s.exportMs}ms, parse=${s.parseMs}ms, exportHeapDelta=${s.exportHeapDeltaMB}MB`)
      : ['- (no data)']),
    '',
    '## Copilot Metrics',
    `- intentAccuracy: ${
      Number.isFinite(Number(copilotMetrics?.data?.metrics?.intentAccuracy))
        ? `${(Number(copilotMetrics.data.metrics.intentAccuracy) * 100).toFixed(2)}%`
        : '(no data)'
    }`,
    `- applySuccessRate: ${
      Number.isFinite(Number(copilotMetrics?.data?.metrics?.applySuccessRate))
        ? `${(Number(copilotMetrics.data.metrics.applySuccessRate) * 100).toFixed(2)}%`
        : '(no data)'
    }`,
    `- retryRate: ${
      Number.isFinite(Number(copilotMetrics?.data?.metrics?.retryRate))
        ? `${(Number(copilotMetrics.data.metrics.retryRate) * 100).toFixed(2)}%`
        : '(no data)'
    }`,
    `- avgTokensPerTurn: ${
      Number.isFinite(Number(copilotMetrics?.data?.metrics?.avgTokensPerTurn))
        ? Number(copilotMetrics.data.metrics.avgTokensPerTurn).toFixed(2)
        : '(no data)'
    }`,
    '',
    report.warnings.length ? '## Warnings' : '## Warnings (none)',
    ...report.warnings.map((w) => `- ${w}`),
    '',
    report.failures.length === 0 ? '## Result: PASS' : '## Result: FAIL',
    ...report.failures.map((f) => `- ${f}`),
    '',
  ]

  await fs.writeFile(OUTPUT_MD, lines.join('\n'), 'utf-8')
  console.log(`[qa:report] generated ${OUTPUT_MD}`)

  if (report.failures.length > 0) {
    process.exit(1)
  }
}

main().catch((error) => {
  console.error('[qa:report] failed')
  console.error(error)
  process.exit(1)
})
