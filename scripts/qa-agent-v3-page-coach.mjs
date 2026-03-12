#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildBookspaceChatContextBlock,
  buildBookspaceChatSystemPrompt,
} from '../shared/copilotServiceProfile.ts'
import { resolveAgentV3ChatMode } from '../src/features/copilot/agentV3Routing.ts'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '..')

const OUTPUT_DIR = path.join(root, 'reports/qa')
const OUTPUT_JSON = path.join(OUTPUT_DIR, 'agent-v3-page-coach.latest.json')

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true })

  const prompt = '이 페이지 흐름이 어때?'
  const mode = resolveAgentV3ChatMode(prompt)
  const systemPrompt = buildBookspaceChatSystemPrompt()
  const contextBlock = buildBookspaceChatContextBlock({
    scope: 'chapter',
    chapterId: 'chapter-1',
    projectTitle: '테스트 책',
    chapterCount: 12,
    activePageTitle: '프롤로그',
    activePageType: 'chapter',
    activePageSummary: 'title=프롤로그, headings=1, paragraphs=6, words=820',
    selectedText: '첫 문단입니다. 둘째 문단입니다.',
    requestedMode: mode ?? undefined,
  })

  const failures = []
  if (mode !== 'editorial_support') failures.push(`expected editorial_support mode, got ${mode}`)
  if (!systemPrompt.includes('digital editorial team')) failures.push('system prompt missing V3 role')
  if (!contextBlock.includes('[Stage:RequestedMode]')) failures.push('context block missing requested mode stage')
  if (!contextBlock.includes('Mode=editorial_support')) failures.push('context block missing editorial_support mode')
  if (!contextBlock.includes('[Stage:ResponseContract]')) failures.push('context block missing response contract')
  if (!contextBlock.includes('Start with one-line judgment.')) failures.push('context block missing one-line judgment contract')

  const referencedPageContextBlock = buildBookspaceChatContextBlock({
    scope: 'chapter',
    chapterId: 'front-1',
    projectTitle: '테스트 책',
    chapterCount: 12,
    activePageTitle: '프롤로그',
    activePageType: 'front',
    activePageSummary: 'title=프롤로그, headings=2, paragraphs=4, words=640',
    requestedMode: 'editorial_support',
  })
  if (!referencedPageContextBlock.includes('ChapterId=front-1')) failures.push('referenced page context should keep target chapter id')
  if (!referencedPageContextBlock.includes('ActivePageTitle=프롤로그')) failures.push('referenced page context missing target page title')

  const report = {
    generatedAt: new Date().toISOString(),
    ok: failures.length === 0,
    failures,
    mode,
  }
  await fs.writeFile(OUTPUT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf-8')

  if (failures.length > 0) {
    console.error('[qa-agent-v3-page-coach] failed')
    failures.forEach((item) => console.error(` - ${item}`))
    process.exit(1)
  }

  console.log('[qa-agent-v3-page-coach] passed')
  console.log(` - ${OUTPUT_JSON}`)
}

main().catch((error) => {
  console.error('[qa-agent-v3-page-coach] failed')
  console.error(error)
  process.exit(1)
})
