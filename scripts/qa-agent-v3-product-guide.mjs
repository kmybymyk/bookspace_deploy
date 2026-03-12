#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  formatCopilotFeatureGuideReply,
  resolveCopilotFeatureGuides,
} from '../shared/copilotFeatureGuides.ts'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '..')

const OUTPUT_DIR = path.join(root, 'reports/qa')
const OUTPUT_JSON = path.join(OUTPUT_DIR, 'agent-v3-product-guide.latest.json')
const RIGHT_PANE_ACTIONS_PATH = path.join(root, 'src/features/copilot/rightPaneActions.ts')

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true })

  const failures = []

  const exportResolution = resolveCopilotFeatureGuides('EPUB 내보내기는 어떻게 해?')
  if (exportResolution.guides[0]?.id !== 'export_epub_docx') {
    failures.push(`expected export_epub_docx, got ${exportResolution.guides[0]?.id ?? 'none'}`)
  }

  const exportReply = formatCopilotFeatureGuideReply('EPUB 내보내기는 어떻게 해?') ?? ''
  if (!exportReply.startsWith('있습니다.')) failures.push('export reply should start with supported status')
  if (!exportReply.includes('왼쪽 세로 툴바의 내보내기 버튼')) failures.push('export reply missing location')
  if (!exportReply.includes('EPUB 2.0, EPUB 3.0, DOCX')) failures.push('export reply missing format coverage')

  const coverReply = formatCopilotFeatureGuideReply('표지는 어디서 바꿔?') ?? ''
  if (!coverReply.includes('기능: 표지와 로고 자산')) failures.push('cover reply missing cover guide')

  const saveReply = formatCopilotFeatureGuideReply('저장은 어떻게 해?') ?? ''
  if (!saveReply.includes('기능: 프로젝트 저장')) failures.push('save reply missing save guide')
  if (!saveReply.includes('Cmd/Ctrl + S')) failures.push('save reply missing shortcut')

  const unknownReply = formatCopilotFeatureGuideReply('가로 스크롤 타임라인 보기 있어?') ?? ''
  if (!unknownReply.includes('특정하지 못했습니다')) failures.push('unknown feature reply should say feature was not identified')

  const actionsSource = await fs.readFile(RIGHT_PANE_ACTIONS_PATH, 'utf-8')
  if (!actionsSource.includes("requestedMode === 'product_guidance'")) {
    failures.push('rightPaneActions should branch product_guidance requests')
  }
  if (!actionsSource.includes('formatCopilotFeatureGuideReply(prompt)')) {
    failures.push('rightPaneActions should use product guide formatter before appserver chat')
  }

  const report = {
    generatedAt: new Date().toISOString(),
    ok: failures.length === 0,
    failures,
  }

  await fs.writeFile(OUTPUT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf-8')

  if (failures.length > 0) {
    console.error('[qa-agent-v3-product-guide] failed')
    failures.forEach((item) => console.error(` - ${item}`))
    process.exit(1)
  }

  console.log('[qa-agent-v3-product-guide] passed')
  console.log(` - ${OUTPUT_JSON}`)
}

main().catch((error) => {
  console.error('[qa-agent-v3-product-guide] failed')
  console.error(error)
  process.exit(1)
})
