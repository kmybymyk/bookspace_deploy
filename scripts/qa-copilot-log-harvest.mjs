#!/usr/bin/env node
import fs from 'node:fs/promises'
import fssync from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const ROOT = process.cwd()
const OUTPUT_DIR = path.join(ROOT, 'reports/qa')
const OUTPUT_JSON = path.join(OUTPUT_DIR, 'copilot-log-harvest.latest.json')
const OUTPUT_MD = path.join(OUTPUT_DIR, 'copilot-log-harvest.latest.md')
const HARVESTED_FIXTURE_PATH = path.join(OUTPUT_DIR, 'copilot-live-regression.harvested.json')
const FIXTURE_PATH = path.join(ROOT, 'scripts/fixtures/copilot-live-regression.v1.json')

function resolveDiagnosticsDirs() {
  const home = os.homedir()
  return [
    path.join(home, 'Library', 'Application Support', 'bookspace', 'diagnostics'),
    path.join(home, 'Library', 'Application Support', 'BookSpace', 'diagnostics'),
    path.join(process.env.APPDATA ?? '', 'BookSpace', 'diagnostics'),
    path.join(home, '.config', 'BookSpace', 'diagnostics'),
  ].filter(Boolean)
}

function anonymizeText(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  return raw
    .replace(/https?:\/\/[^\s)]+/gi, '[url]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/\b(?:\+?\d[\d\s().-]{6,}\d)\b/g, '[phone]')
    .replace(/\b(?:\d[ -]?){13,19}\b/g, '[long-number]')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, '[uuid]')
    .replace(/\b(?:gsk|sk|pk)-[A-Za-z0-9_-]{16,}\b/g, '[secret]')
    .replace(/\s+/g, ' ')
    .slice(0, 240)
}

function parseLine(line) {
  try {
    return JSON.parse(line)
  } catch {
    return null
  }
}

async function readNdjsonRows(filePath) {
  if (!filePath || !fssync.existsSync(filePath)) return []
  const raw = await fs.readFile(filePath, 'utf-8')
  return raw
    .split(/\r?\n/)
    .filter(Boolean)
    .map(parseLine)
    .filter(Boolean)
}

function withinLookback(row, sinceMs) {
  const ts = Date.parse(String(row?.ts ?? row?.timestamp ?? ''))
  return Number.isFinite(ts) && ts >= sinceMs
}

function buildCaseId(prefix, signature, index) {
  const seed = String(signature ?? '').trim() || `row-${index + 1}`
  return `${prefix}-${seed}-${index + 1}`
}

async function main() {
  const lookbackDays = Number(process.env.QA_COPILOT_HARVEST_DAYS ?? '30')
  const maxCases = Number(process.env.QA_COPILOT_HARVEST_MAX_CASES ?? '120')
  const updateRepoFixture = ['1', 'true', 'on'].includes(
    String(process.env.QA_COPILOT_HARVEST_UPDATE_FIXTURE ?? '').toLowerCase().trim(),
  )
  const now = Date.now()
  const sinceMs = now - Math.max(1, lookbackDays) * 24 * 60 * 60 * 1000
  const diagnosticsDirs = resolveDiagnosticsDirs()

  const requestRows = []
  const chatRows = []
  const logPaths = []
  for (const dir of diagnosticsDirs) {
    const requestPath = path.join(dir, 'copilot-requests.ndjson')
    const chatPath = path.join(dir, 'copilot-chat.ndjson')
    if (fssync.existsSync(requestPath)) {
      logPaths.push(requestPath)
      requestRows.push(...await readNdjsonRows(requestPath))
    }
    if (fssync.existsSync(chatPath)) {
      logPaths.push(chatPath)
      chatRows.push(...await readNdjsonRows(chatPath))
    }
  }

  const requestCases = requestRows
    .filter((row) => withinLookback(row, sinceMs))
    .map((row, index) => {
      const prompt = anonymizeText(row.promptAnonymized)
      if (!prompt) return null
      return {
        id: buildCaseId('live-req', row.promptSignature, index),
        prompt,
        hasSelection: Boolean(row.hasSelection),
        expectedRoute: 'command',
        expectedIntent: String(row.intent ?? '').trim() || null,
        source: 'copilot-requests',
      }
    })
    .filter(Boolean)

  const chatCases = chatRows
    .filter((row) => withinLookback(row, sinceMs))
    .map((row, index) => {
      const prompt = anonymizeText(row.promptAnonymized)
      if (!prompt) return null
      return {
        id: buildCaseId('live-chat', row.promptSignature, index),
        prompt,
        hasSelection: false,
        expectedRoute: 'chat',
        expectedIntent: null,
        source: 'copilot-chat',
      }
    })
    .filter(Boolean)

  const merged = [...requestCases, ...chatCases]
  const existingCases = []
  const existingPaths = [HARVESTED_FIXTURE_PATH, FIXTURE_PATH]
  for (const fixturePath of existingPaths) {
    try {
      const existingFixture = JSON.parse(await fs.readFile(fixturePath, 'utf-8'))
      const cases = Array.isArray(existingFixture?.cases) ? existingFixture.cases : []
      existingCases.push(...cases)
    } catch {
      // ignore missing fixture
    }
  }
  const dedupMap = new Map()
  for (const item of [...merged, ...existingCases]) {
    if (!item || typeof item !== 'object') continue
    if (!item.prompt || !item.expectedRoute) continue
    const key = [
      item.prompt,
      item.expectedRoute,
      item.expectedIntent ?? 'none',
      item.hasSelection ? 'sel' : 'nosel',
    ].join('|')
    if (!dedupMap.has(key)) dedupMap.set(key, item)
  }
  const dedupedCases = [...dedupMap.values()].slice(0, Math.max(1, maxCases))

  const fixture = {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    source: {
      harvestedRequestRows: requestCases.length,
      harvestedChatRows: chatCases.length,
      lookbackDays,
      logFiles: [...new Set(logPaths.map((item) => path.basename(item)))],
    },
    cases: dedupedCases,
  }

  await fs.mkdir(OUTPUT_DIR, { recursive: true })
  await fs.writeFile(HARVESTED_FIXTURE_PATH, `${JSON.stringify(fixture, null, 2)}\n`, 'utf-8')
  if (updateRepoFixture) {
    await fs.mkdir(path.dirname(FIXTURE_PATH), { recursive: true })
    await fs.writeFile(FIXTURE_PATH, `${JSON.stringify(fixture, null, 2)}\n`, 'utf-8')
  }

  const report = {
    generatedAt: new Date().toISOString(),
    lookbackDays,
    requestRows: requestRows.length,
    chatRows: chatRows.length,
    harvestedRequestCases: requestCases.length,
    harvestedChatCases: chatCases.length,
    finalCases: dedupedCases.length,
    harvestedFixturePath: HARVESTED_FIXTURE_PATH,
    repoFixturePath: FIXTURE_PATH,
    repoFixtureUpdated: updateRepoFixture,
    logFiles: [...new Set(logPaths.map((item) => path.basename(item)))],
    failures: [],
    warnings: [],
  }

  if (logPaths.length === 0) {
    report.warnings.push('copilot diagnostics logs not found')
  }
  if (dedupedCases.length === 0) {
    report.warnings.push('no anonymized samples harvested during lookback window')
  }

  await fs.writeFile(OUTPUT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf-8')
  const md = [
    '# Copilot Log Harvest QA',
    '',
    `- generatedAt: ${report.generatedAt}`,
    `- lookbackDays: ${report.lookbackDays}`,
    `- requestRows: ${report.requestRows}`,
    `- chatRows: ${report.chatRows}`,
    `- harvestedRequestCases: ${report.harvestedRequestCases}`,
    `- harvestedChatCases: ${report.harvestedChatCases}`,
    `- finalCases: ${report.finalCases}`,
    `- harvestedFixturePath: ${report.harvestedFixturePath}`,
    `- repoFixtureUpdated: ${report.repoFixtureUpdated}`,
    '',
    report.warnings.length > 0 ? '## Warnings' : '## Warnings (none)',
    ...report.warnings.map((item) => `- ${item}`),
    '',
    '## Result: PASS',
    '',
  ]
  await fs.writeFile(OUTPUT_MD, `${md.join('\n')}\n`, 'utf-8')

  console.log('[qa:copilot:harvest] passed')
  console.log(` - ${OUTPUT_JSON}`)
  console.log(` - ${OUTPUT_MD}`)
  console.log(` - harvested fixture: ${HARVESTED_FIXTURE_PATH}`)
  if (updateRepoFixture) {
    console.log(` - repo fixture updated: ${FIXTURE_PATH}`)
  }
}

main().catch((error) => {
  console.error('[qa:copilot:harvest] failed')
  console.error(error)
  process.exit(1)
})
