#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  parseInsertIllustrationDraftFromPrompt,
  parseInsertTableDraftFromPrompt,
} from '../shared/copilotStructuredPromptParser.ts'

const ROOT = process.cwd()
const FIXTURE_PATH = path.join(ROOT, 'scripts/fixtures/copilot-structured-slots.v1.json')
const OUTPUT_DIR = path.join(ROOT, 'reports/qa')
const OUTPUT_JSON = path.join(OUTPUT_DIR, 'copilot-structured-slots.latest.json')
const OUTPUT_MD = path.join(OUTPUT_DIR, 'copilot-structured-slots.latest.md')

function equalsArray(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false
  if (a.length !== b.length) return false
  return a.every((item, index) => String(item) === String(b[index]))
}

async function main() {
  const fixture = JSON.parse(await fs.readFile(FIXTURE_PATH, 'utf-8'))
  const checks = []
  const failures = []

  for (const testCase of fixture.cases ?? []) {
    const expected = testCase.expected ?? {}
    const prompt = String(testCase.prompt ?? '')
    if (testCase.type === 'insert_table') {
      const parsed = parseInsertTableDraftFromPrompt(prompt)
      const headersLengthOk =
        typeof expected.headersLength !== 'number' || parsed.headers.length === expected.headersLength
      const rowsLengthOk =
        typeof expected.rowsLength !== 'number' || parsed.rows.length === expected.rowsLength
      const headersOk = !Array.isArray(expected.headers) || equalsArray(parsed.headers, expected.headers)
      const styleOk = !expected.style || parsed.style === expected.style
      const positionOk = typeof expected.position !== 'number' || parsed.position === expected.position

      checks.push({ name: `${testCase.id}/headersLength`, ok: headersLengthOk })
      checks.push({ name: `${testCase.id}/rowsLength`, ok: rowsLengthOk })
      checks.push({ name: `${testCase.id}/headers`, ok: headersOk })
      checks.push({ name: `${testCase.id}/style`, ok: styleOk })
      checks.push({ name: `${testCase.id}/position`, ok: positionOk })

      if (!headersLengthOk) failures.push(`${testCase.id}: expected headersLength ${expected.headersLength}, got ${parsed.headers.length}`)
      if (!rowsLengthOk) failures.push(`${testCase.id}: expected rowsLength ${expected.rowsLength}, got ${parsed.rows.length}`)
      if (!headersOk) failures.push(`${testCase.id}: expected headers ${JSON.stringify(expected.headers)}, got ${JSON.stringify(parsed.headers)}`)
      if (!styleOk) failures.push(`${testCase.id}: expected style ${expected.style}, got ${parsed.style}`)
      if (!positionOk) failures.push(`${testCase.id}: expected position ${expected.position}, got ${parsed.position}`)
      continue
    }

    if (testCase.type === 'insert_illustration') {
      const parsed = parseInsertIllustrationDraftFromPrompt(prompt)
      const sourceOk = !expected.imageSource || parsed.imageSource === expected.imageSource
      const altOk = !expected.alt || parsed.alt === expected.alt
      const captionOk = !expected.caption || parsed.caption === expected.caption
      const widthOk = typeof expected.width !== 'number' || parsed.width === expected.width
      const positionOk = typeof expected.position !== 'number' || parsed.position === expected.position

      checks.push({ name: `${testCase.id}/imageSource`, ok: sourceOk })
      checks.push({ name: `${testCase.id}/alt`, ok: altOk })
      checks.push({ name: `${testCase.id}/caption`, ok: captionOk })
      checks.push({ name: `${testCase.id}/width`, ok: widthOk })
      checks.push({ name: `${testCase.id}/position`, ok: positionOk })

      if (!sourceOk) failures.push(`${testCase.id}: expected imageSource ${expected.imageSource}, got ${parsed.imageSource}`)
      if (!altOk) failures.push(`${testCase.id}: expected alt ${expected.alt}, got ${parsed.alt}`)
      if (!captionOk) failures.push(`${testCase.id}: expected caption ${expected.caption}, got ${parsed.caption}`)
      if (!widthOk) failures.push(`${testCase.id}: expected width ${expected.width}, got ${parsed.width}`)
      if (!positionOk) failures.push(`${testCase.id}: expected position ${expected.position}, got ${parsed.position}`)
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    ok: failures.length === 0,
    checks,
    failures,
  }

  await fs.mkdir(OUTPUT_DIR, { recursive: true })
  await fs.writeFile(OUTPUT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf-8')
  const md = [
    '# Copilot Structured Slot QA',
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
    console.error('[qa:copilot:structured-slots] failed')
    failures.forEach((item) => console.error(` - ${item}`))
    process.exit(1)
  }
  console.log('[qa:copilot:structured-slots] passed')
  console.log(` - ${OUTPUT_JSON}`)
  console.log(` - ${OUTPUT_MD}`)
}

main().catch((error) => {
  console.error('[qa:copilot:structured-slots] failed')
  console.error(error)
  process.exit(1)
})
