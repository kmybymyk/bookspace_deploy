#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveAgentV3ChatMode, resolveAgentV3PriorityRoute } from '../src/features/copilot/agentV3Routing.ts'
import { buildBookContextReviewSnapshot } from '../src/features/copilot/bookContextReview.ts'
import { buildBookspaceChatContextBlock } from '../shared/copilotServiceProfile.ts'
import { formatCopilotFeatureGuideReply } from '../shared/copilotFeatureGuides.ts'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '..')

const FIXTURE_PATH = path.join(root, 'scripts/fixtures/agent-v3-launch-readiness.v1.json')
const OUTPUT_DIR = path.join(root, 'reports/qa')
const OUTPUT_JSON = path.join(OUTPUT_DIR, 'agent-v3-launch-readiness.latest.json')

const samplePages = [
  { id: 'front-1', title: '프롤로그', order: 0, chapterType: 'front', chapterKind: 'prologue', structureSummary: 'title=프롤로그, headings=1, paragraphs=4, words=420' },
  { id: 'chapter-1', title: '1장 첫 만남', order: 1, chapterType: 'chapter', structureSummary: 'title=1장 첫 만남, headings=2, paragraphs=11, words=1250' },
  { id: 'chapter-2', title: '2장 균열', order: 2, chapterType: 'chapter', structureSummary: 'title=2장 균열, headings=1, paragraphs=13, words=1490' },
  { id: 'chapter-3', title: '3장 회수', order: 3, chapterType: 'chapter', structureSummary: 'title=3장 회수, headings=1, paragraphs=10, words=1180' },
  { id: 'back-1', title: '에필로그', order: 4, chapterType: 'back', chapterKind: 'epilogue', structureSummary: 'title=에필로그, headings=1, paragraphs=5, words=510' }
]

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true })

  const fixture = JSON.parse(await fs.readFile(FIXTURE_PATH, 'utf-8'))
  const failures = []
  const results = []

  for (const testCase of fixture.cases ?? []) {
    const route = resolveAgentV3PriorityRoute({
      prompt: testCase.prompt,
      hasSelection: false,
    })
    const mode = resolveAgentV3ChatMode(testCase.prompt)
    const routePass = (route?.route ?? 'fallthrough') === testCase.expectedRoute
    const modePass = mode === testCase.expectedMode
    if (!routePass) failures.push(`${testCase.id}: expected route ${testCase.expectedRoute}, got ${route?.route ?? 'fallthrough'}`)
    if (!modePass) failures.push(`${testCase.id}: expected mode ${testCase.expectedMode}, got ${mode}`)

    if (mode === 'product_guidance') {
      const reply = formatCopilotFeatureGuideReply(testCase.prompt) ?? ''
      if (!reply.startsWith('있습니다.') && !reply.includes('특정하지 못했습니다')) {
        failures.push(`${testCase.id}: product guidance reply missing supported/unknown status`)
      }
    }

    if (mode === 'book_context_review' || mode === 'release_editorial_check') {
      const snapshot = buildBookContextReviewSnapshot({
        prompt: testCase.prompt,
        activeChapterId: 'chapter-2',
        pages: samplePages,
      })
      const contextBlock = buildBookspaceChatContextBlock({
        scope: 'project',
        chapterId: 'chapter-2',
        projectTitle: '테스트 장편',
        chapterCount: samplePages.length,
        activePageTitle: '2장 균열',
        activePageType: 'chapter',
        activePageSummary: 'title=2장 균열, headings=1, paragraphs=13, words=1490',
        requestedMode: mode,
        bookContextOutline: snapshot.outline,
        bookContextEvidence: snapshot.evidence,
        bookContextConfidence: snapshot.confidence,
      })
      if (!contextBlock.includes('[Stage:BookContextReview]')) {
        failures.push(`${testCase.id}: book context stage missing from context block`)
      }
    }

    if (mode === 'editorial_support') {
      const contextBlock = buildBookspaceChatContextBlock({
        scope: 'chapter',
        chapterId: 'chapter-2',
        projectTitle: '테스트 장편',
        chapterCount: samplePages.length,
        activePageTitle: '2장 균열',
        activePageType: 'chapter',
        activePageSummary: 'title=2장 균열, headings=1, paragraphs=13, words=1490',
        requestedMode: mode,
      })
      if (!contextBlock.includes('Start with one-line judgment.')) {
        failures.push(`${testCase.id}: editorial support contract missing`)
      }
    }

    results.push({
      id: testCase.id,
      mode,
      route: route?.route ?? 'fallthrough',
      pass: routePass && modePass,
    })
  }

  const report = {
    generatedAt: new Date().toISOString(),
    fixtureVersion: fixture.version ?? 'unknown',
    ok: failures.length === 0,
    failures,
    results,
  }
  await fs.writeFile(OUTPUT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf-8')

  if (!report.ok) {
    console.error('[qa-agent-v3-launch-readiness] failed')
    failures.forEach((item) => console.error(` - ${item}`))
    process.exit(1)
  }

  console.log('[qa-agent-v3-launch-readiness] passed')
  console.log(` - ${OUTPUT_JSON}`)
}

main().catch((error) => {
  console.error('[qa-agent-v3-launch-readiness] failed')
  console.error(error)
  process.exit(1)
})
