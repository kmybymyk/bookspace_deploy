#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveAgentV3PriorityRoute } from '../src/features/copilot/agentV3Routing.ts'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '..')

const FIXTURE_PATH = path.join(root, 'scripts/fixtures/agent-v3-routing-fixtures.v1.json')
const OUTPUT_DIR = path.join(root, 'reports/qa')
const OUTPUT_JSON = path.join(OUTPUT_DIR, 'agent-v3-routing.latest.json')
const OUTPUT_MD = path.join(OUTPUT_DIR, 'agent-v3-routing.latest.md')

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true })
  const fixture = JSON.parse(await fs.readFile(FIXTURE_PATH, 'utf-8'))
  const cases = Array.isArray(fixture.cases) ? fixture.cases : []
  const failures = []

  const results = cases.map((testCase) => {
    const resolved = resolveAgentV3PriorityRoute({
      prompt: testCase.prompt,
      hasSelection: Boolean(testCase.hasSelection),
    }) ?? { route: 'fallthrough', intent: null, reason: 'no-agent-v3-priority-route' }
    const routeOk = resolved.route === testCase.expectedRoute
    const intentOk = (resolved.intent ?? null) === (testCase.expectedIntent ?? null)
    if (!routeOk) failures.push(`${testCase.id}/route: expected ${testCase.expectedRoute}, got ${resolved.route}`)
    if (!intentOk) failures.push(`${testCase.id}/intent: expected ${testCase.expectedIntent}, got ${resolved.intent}`)
    return {
      id: testCase.id,
      prompt: testCase.prompt,
      expectedRoute: testCase.expectedRoute,
      expectedIntent: testCase.expectedIntent ?? null,
      resolvedRoute: resolved.route,
      resolvedIntent: resolved.intent ?? null,
      reason: resolved.reason,
      pass: routeOk && intentOk,
    }
  })

  const report = {
    generatedAt: new Date().toISOString(),
    fixtureVersion: fixture.version ?? 'unknown',
    ok: failures.length === 0,
    failures,
    results,
  }

  await fs.writeFile(OUTPUT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf-8')
  const md = [
    '# Agent V3 Routing QA',
    '',
    `- generatedAt: ${report.generatedAt}`,
    `- fixtureVersion: ${report.fixtureVersion}`,
    `- cases: ${results.length}`,
    `- failures: ${failures.length}`,
    '',
    '## Case Results',
    ...results.map((item) =>
      `- ${item.pass ? 'PASS' : 'FAIL'} ${item.id}: expected(${item.expectedRoute}/${item.expectedIntent}) resolved(${item.resolvedRoute}/${item.resolvedIntent})`,
    ),
    '',
    report.ok ? '## Result: PASS' : '## Result: FAIL',
    ...failures.map((item) => `- ${item}`),
    '',
  ]
  await fs.writeFile(OUTPUT_MD, `${md.join('\n')}\n`, 'utf-8')

  if (!report.ok) {
    console.error('[qa-agent-v3-routing] failed')
    failures.forEach((item) => console.error(` - ${item}`))
    process.exit(1)
  }

  console.log('[qa-agent-v3-routing] passed')
  console.log(` - ${OUTPUT_JSON}`)
  console.log(` - ${OUTPUT_MD}`)
}

main().catch((error) => {
  console.error('[qa-agent-v3-routing] failed')
  console.error(error)
  process.exit(1)
})
