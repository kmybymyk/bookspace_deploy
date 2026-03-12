#!/usr/bin/env node
import fs from 'node:fs/promises'
import fssync from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const OUTPUT_DIR = path.resolve('reports/qa')
const OUTPUT_JSON = path.join(OUTPUT_DIR, 'runtime-errors.latest.json')
const OUTPUT_MD = path.join(OUTPUT_DIR, 'runtime-errors.latest.md')

function resolveDefaultDiagnosticsPath() {
  const home = os.homedir()
  const candidates = [
    path.join(home, 'Library', 'Application Support', 'bookspace', 'diagnostics', 'runtime-errors.ndjson'),
    path.join(home, 'Library', 'Application Support', 'BookSpace', 'diagnostics', 'runtime-errors.ndjson'),
    path.join(process.env.APPDATA ?? '', 'BookSpace', 'diagnostics', 'runtime-errors.ndjson'),
    path.join(home, '.config', 'BookSpace', 'diagnostics', 'runtime-errors.ndjson'),
  ].filter(Boolean)

  for (const candidate of candidates) {
    if (fssync.existsSync(candidate)) return candidate
  }
  return candidates[0] ?? ''
}

function parseJsonLine(line) {
  try {
    return JSON.parse(line)
  } catch {
    return null
  }
}

function topMessages(rows, limit = 5) {
  const counts = new Map()
  for (const row of rows) {
    const msg = String(row.message ?? '').trim() || '(empty)'
    counts.set(msg, (counts.get(msg) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([message, count]) => ({ message, count }))
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true })

  const logPath = process.env.QA_DIAGNOSTICS_LOG_PATH || resolveDefaultDiagnosticsPath()
  const maxErrors24h = Number(process.env.QA_MAX_RUNTIME_ERRORS_24H ?? '0')
  const maxWarns24h = Number(process.env.QA_MAX_RUNTIME_WARNS_24H ?? '20')

  const report = {
    createdAt: new Date().toISOString(),
    logPath,
    exists: false,
    parseErrors: 0,
    totalRows: 0,
    last24h: { total: 0, errors: 0, warns: 0 },
    topMessages: [],
    failures: [],
    warnings: [],
  }

  if (!logPath || !fssync.existsSync(logPath)) {
    report.warnings.push('runtime error log file not found (skip parsing)')
  } else {
    report.exists = true
    const raw = await fs.readFile(logPath, 'utf-8')
    const lines = raw.split(/\r?\n/).filter(Boolean)
    const rows = []

    for (const line of lines) {
      const parsed = parseJsonLine(line)
      if (!parsed) {
        report.parseErrors += 1
        continue
      }
      rows.push(parsed)
    }

    report.totalRows = rows.length
    const now = Date.now()
    const oneDayAgo = now - 24 * 60 * 60 * 1000
    const recent = rows.filter((row) => {
      const ts = Date.parse(String(row.ts ?? row.timestamp ?? ''))
      return Number.isFinite(ts) && ts >= oneDayAgo
    })

    const recentErrors = recent.filter((row) => String(row.level ?? 'error') === 'error')
    const recentWarns = recent.filter((row) => String(row.level ?? 'error') === 'warn')

    report.last24h = {
      total: recent.length,
      errors: recentErrors.length,
      warns: recentWarns.length,
    }
    report.topMessages = topMessages(recent)

    if (report.parseErrors > 0) {
      report.failures.push(`invalid json lines: ${report.parseErrors}`)
    }
    if (recentErrors.length > maxErrors24h) {
      report.failures.push(`last24h errors ${recentErrors.length} > ${maxErrors24h}`)
    }
    if (recentWarns.length > maxWarns24h) {
      report.failures.push(`last24h warns ${recentWarns.length} > ${maxWarns24h}`)
    }
  }

  await fs.writeFile(OUTPUT_JSON, JSON.stringify(report, null, 2), 'utf-8')
  const md = [
    '# Runtime Errors QA',
    '',
    `- createdAt: ${report.createdAt}`,
    `- logPath: ${report.logPath || '(none)'}`,
    `- exists: ${report.exists}`,
    `- parseErrors: ${report.parseErrors}`,
    `- totalRows: ${report.totalRows}`,
    `- last24h: total=${report.last24h.total}, errors=${report.last24h.errors}, warns=${report.last24h.warns}`,
    '',
    report.topMessages.length > 0 ? '## Top Messages (24h)' : '## Top Messages (24h) - none',
    ...report.topMessages.map((item) => `- [${item.count}] ${item.message}`),
    '',
    report.warnings.length > 0 ? '## Warnings' : '## Warnings (none)',
    ...report.warnings.map((w) => `- ${w}`),
    '',
    report.failures.length > 0 ? '## Result: FAIL' : '## Result: PASS',
    ...report.failures.map((f) => `- ${f}`),
    '',
  ]
  await fs.writeFile(OUTPUT_MD, md.join('\n'), 'utf-8')

  if (report.failures.length > 0) {
    console.error('[qa:runtime] failed')
    report.failures.forEach((item) => console.error(` - ${item}`))
    process.exit(1)
  }

  console.log('[qa:runtime] passed')
  console.log(` - ${OUTPUT_JSON}`)
  console.log(` - ${OUTPUT_MD}`)
}

main().catch((error) => {
  console.error('[qa:runtime] failed')
  console.error(error)
  process.exit(1)
})
