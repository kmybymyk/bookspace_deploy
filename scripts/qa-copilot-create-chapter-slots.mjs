#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { parseCreateChapterDraftFromPrompt } from '../shared/createChapterPromptParser.ts'

const ROOT = process.cwd()
const FIXTURE_PATH = path.join(ROOT, 'scripts/fixtures/copilot-create-chapter-slots.v1.json')
const OUTPUT_DIR = path.join(ROOT, 'reports/qa')
const OUTPUT_JSON = path.join(OUTPUT_DIR, 'copilot-create-chapter-slots.latest.json')
const OUTPUT_MD = path.join(OUTPUT_DIR, 'copilot-create-chapter-slots.latest.md')

async function main() {
  const fixture = JSON.parse(await fs.readFile(FIXTURE_PATH, 'utf-8'))
  const checks = []
  const failures = []

  for (const testCase of fixture.cases ?? []) {
    const parsed = parseCreateChapterDraftFromPrompt(String(testCase.prompt ?? ''))
    const expected = testCase.expected ?? {}

    const typeOk = !expected.chapterType || parsed.chapterType === expected.chapterType
    const kindOk = expected.chapterKind === undefined || parsed.chapterKind === expected.chapterKind
    const titleOk = !expected.title || parsed.title === expected.title
    const blocksOk =
      typeof expected.minBlocks !== 'number' ||
      (Array.isArray(parsed.blocks) && parsed.blocks.length >= expected.minBlocks)

    checks.push({ name: `${testCase.id}/chapterType`, ok: typeOk })
    checks.push({ name: `${testCase.id}/chapterKind`, ok: kindOk })
    checks.push({ name: `${testCase.id}/title`, ok: titleOk })
    checks.push({ name: `${testCase.id}/blocks`, ok: blocksOk })

    if (!typeOk) failures.push(`${testCase.id}: expected chapterType ${expected.chapterType}, got ${parsed.chapterType}`)
    if (!kindOk) failures.push(`${testCase.id}: expected chapterKind ${expected.chapterKind}, got ${parsed.chapterKind}`)
    if (!titleOk) failures.push(`${testCase.id}: expected title ${expected.title}, got ${parsed.title}`)
    if (!blocksOk) failures.push(`${testCase.id}: expected at least ${expected.minBlocks} blocks`)
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
    '# Copilot Create Chapter Slot QA',
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
    console.error('[qa:copilot:chapter-slots] failed')
    failures.forEach((item) => console.error(` - ${item}`))
    process.exit(1)
  }
  console.log('[qa:copilot:chapter-slots] passed')
  console.log(` - ${OUTPUT_JSON}`)
  console.log(` - ${OUTPUT_MD}`)
}

main().catch((error) => {
  console.error('[qa:copilot:chapter-slots] failed')
  console.error(error)
  process.exit(1)
})
