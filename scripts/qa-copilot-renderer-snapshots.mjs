#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'

const ROOT = process.cwd()
const FIXTURE_PATH = path.join(ROOT, 'scripts/fixtures/copilot-renderer-snapshots.v1.json')
const SOURCE_PATHS = [
  path.join(ROOT, 'src/components/layout/RightPane.tsx'),
  path.join(ROOT, 'src/features/copilot/rightPaneMessageRenderer.tsx'),
]
const OUTPUT_DIR = path.join(ROOT, 'reports/qa')
const OUTPUT_JSON = path.join(OUTPUT_DIR, 'copilot-renderer-snapshots.latest.json')
const OUTPUT_MD = path.join(OUTPUT_DIR, 'copilot-renderer-snapshots.latest.md')

async function main() {
  const fixture = JSON.parse(await fs.readFile(FIXTURE_PATH, 'utf-8'))
  const sources = await Promise.all(SOURCE_PATHS.map((sourcePath) => fs.readFile(sourcePath, 'utf-8')))
  const source = sources.join('\n')
  const failures = []
  const checks = []

  for (const capability of fixture.capabilities ?? []) {
    const ok = source.includes(String(capability.needle ?? ''))
    checks.push({
      id: capability.id,
      ok,
    })
    if (!ok) {
      failures.push(`${capability.id}: missing renderer capability marker`)
    }
  }

  const signature = createHash('sha256').update(source).digest('hex').slice(0, 16)
  const report = {
    generatedAt: new Date().toISOString(),
    ok: failures.length === 0,
    signature,
    checks,
    failures,
  }

  await fs.mkdir(OUTPUT_DIR, { recursive: true })
  await fs.writeFile(OUTPUT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf-8')
  const md = [
    '# Copilot Renderer Snapshot QA',
    '',
    `- generatedAt: ${report.generatedAt}`,
    `- signature: ${signature}`,
    `- checks: ${checks.length}`,
    `- failures: ${failures.length}`,
    '',
    failures.length > 0 ? '## Result: FAIL' : '## Result: PASS',
    ...failures.map((item) => `- ${item}`),
    '',
  ]
  await fs.writeFile(OUTPUT_MD, `${md.join('\n')}\n`, 'utf-8')

  if (failures.length > 0) {
    console.error('[qa:copilot:renderer] failed')
    failures.forEach((item) => console.error(` - ${item}`))
    process.exit(1)
  }
  console.log('[qa:copilot:renderer] passed')
  console.log(` - ${OUTPUT_JSON}`)
  console.log(` - ${OUTPUT_MD}`)
}

main().catch((error) => {
  console.error('[qa:copilot:renderer] failed')
  console.error(error)
  process.exit(1)
})
