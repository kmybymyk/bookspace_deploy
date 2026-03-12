#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildBookContextReviewSnapshot } from '../src/features/copilot/bookContextReview.ts'
import {
  buildBookspaceChatContextBlock,
} from '../shared/copilotServiceProfile.ts'
import { resolveAgentV3ChatMode } from '../src/features/copilot/agentV3Routing.ts'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '..')

const OUTPUT_DIR = path.join(root, 'reports/qa')
const OUTPUT_JSON = path.join(OUTPUT_DIR, 'agent-v3-book-context.latest.json')

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true })

  const prompt = '주인공 말투가 책 전체에서 일관돼?'
  const mode = resolveAgentV3ChatMode(prompt)
  const snapshot = buildBookContextReviewSnapshot({
    prompt,
    activeChapterId: 'chapter-2',
    pages: [
      { id: 'front-1', title: '프롤로그', order: 0, chapterType: 'front', chapterKind: 'prologue', structureSummary: 'title=프롤로그, headings=1, paragraphs=4, words=420' },
      { id: 'chapter-1', title: '1장 첫 만남', order: 1, chapterType: 'chapter', structureSummary: 'title=1장 첫 만남, headings=2, paragraphs=11, words=1250' },
      { id: 'chapter-2', title: '2장 균열', order: 2, chapterType: 'chapter', structureSummary: 'title=2장 균열, headings=1, paragraphs=13, words=1490' },
      { id: 'chapter-3', title: '3장 회수', order: 3, chapterType: 'chapter', structureSummary: 'title=3장 회수, headings=1, paragraphs=10, words=1180' },
      { id: 'back-1', title: '에필로그', order: 4, chapterType: 'back', chapterKind: 'epilogue', structureSummary: 'title=에필로그, headings=1, paragraphs=5, words=510' },
    ],
  })

  const contextBlock = buildBookspaceChatContextBlock({
    scope: 'project',
    chapterId: 'chapter-2',
    projectTitle: '테스트 장편',
    chapterCount: 5,
    activePageTitle: '2장 균열',
    activePageType: 'chapter',
    activePageSummary: 'title=2장 균열, headings=1, paragraphs=13, words=1490',
    requestedMode: mode ?? undefined,
    bookContextOutline: snapshot.outline,
    bookContextEvidence: snapshot.evidence,
    bookContextConfidence: snapshot.confidence,
  })

  const failures = []
  if (mode !== 'book_context_review') failures.push(`expected book_context_review mode, got ${mode}`)
  if (snapshot.outline.length < 3) failures.push('expected outline entries for book context review')
  if (snapshot.evidence.length < 3) failures.push('expected evidence entries for book context review')
  if (!contextBlock.includes('[Stage:BookContextReview]')) failures.push('context block missing book context review stage')
  if (!contextBlock.includes('Confidence=medium')) failures.push('context block missing confidence level')
  if (!contextBlock.includes('Evidence:')) failures.push('context block missing evidence lines')

  const report = {
    generatedAt: new Date().toISOString(),
    ok: failures.length === 0,
    failures,
    mode,
    confidence: snapshot.confidence,
  }

  await fs.writeFile(OUTPUT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf-8')

  if (failures.length > 0) {
    console.error('[qa-agent-v3-book-context] failed')
    failures.forEach((item) => console.error(` - ${item}`))
    process.exit(1)
  }

  console.log('[qa-agent-v3-book-context] passed')
  console.log(` - ${OUTPUT_JSON}`)
}

main().catch((error) => {
  console.error('[qa-agent-v3-book-context] failed')
  console.error(error)
  process.exit(1)
})
