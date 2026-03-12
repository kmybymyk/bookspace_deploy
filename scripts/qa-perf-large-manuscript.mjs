import fs from 'node:fs/promises'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import JSZip from 'jszip'
import { exportDocx } from '../src/features/export/docxExporter.ts'

const OUTPUT_DIR = path.resolve('reports/perf')
const REPORT_JSON = path.join(OUTPUT_DIR, 'latest.json')
const REPORT_MD = path.join(OUTPUT_DIR, 'latest.md')

const scenarios = [
  { name: 'medium', chapters: 40, paragraphsPerChapter: 100, thresholds: { exportMs: 12000, parseMs: 10000, heapDeltaMB: 450 } },
  { name: 'large', chapters: 80, paragraphsPerChapter: 120, thresholds: { exportMs: 20000, parseMs: 18000, heapDeltaMB: 600 } },
  { name: 'xlarge', chapters: 120, paragraphsPerChapter: 140, thresholds: { exportMs: 35000, parseMs: 30000, heapDeltaMB: 900 } },
]

function makeParagraph(sentence, repeat) {
  return {
    type: 'paragraph',
    content: [{ type: 'text', text: `${sentence} `.repeat(repeat).trim() }],
  }
}

function makeChapter(index, paragraphCount) {
  const content = []
  content.push({
    type: 'heading',
    attrs: { level: 2 },
    content: [{ type: 'text', text: `${index + 1}장 소제목` }],
  })
  for (let i = 0; i < paragraphCount; i++) {
    content.push(makeParagraph(`대형원고 성능테스트 ${index + 1}-${i + 1}`, 14))
  }
  return {
    id: `perf-${index + 1}`,
    title: `${index + 1}장`,
    content: { type: 'doc', content },
    order: index,
    fileName: `chapter-${index + 1}.xhtml`,
    chapterType: 'chapter',
    parentId: null,
  }
}

function makeScenarioData(scenario) {
  const chapters = Array.from({ length: scenario.chapters }, (_, idx) => makeChapter(idx, scenario.paragraphsPerChapter))
  const metadata = {
    title: `대형원고 성능 시나리오 (${scenario.name})`,
    subtitle: '',
    authors: [{ id: 'perf-author', name: 'Performance Bot', role: 'author' }],
    language: 'ko',
    publisher: '',
    isbn: '',
    link: '',
    description: '',
  }
  return { chapters, metadata }
}

function toMB(bytes) {
  return Math.round((bytes / (1024 * 1024)) * 100) / 100
}

async function parseDocxXml(arrayBuffer) {
  const zip = await JSZip.loadAsync(arrayBuffer)
  const documentXml = await zip.file('word/document.xml')?.async('string')
  if (!documentXml) return { paragraphTags: 0 }
  const paragraphTags = (documentXml.match(/<w:p(>|\s)/g) ?? []).length
  return { paragraphTags }
}

async function runScenario(scenario) {
  const { chapters, metadata } = makeScenarioData(scenario)

  global.gc?.()
  const memBeforeExport = process.memoryUsage()
  const exportStarted = performance.now()
  const blob = await exportDocx(chapters, metadata)
  const exportDurationMs = Math.round((performance.now() - exportStarted) * 100) / 100
  const arrayBuffer = await blob.arrayBuffer()
  const memAfterExport = process.memoryUsage()

  global.gc?.()
  const memBeforeParse = process.memoryUsage()
  const parseStarted = performance.now()
  const parsed = await parseDocxXml(arrayBuffer)
  const parseDurationMs = Math.round((performance.now() - parseStarted) * 100) / 100
  const memAfterParse = process.memoryUsage()

  const metrics = {
    scenario: {
      name: scenario.name,
      chapters: scenario.chapters,
      paragraphsPerChapter: scenario.paragraphsPerChapter,
      approxParagraphs: scenario.chapters * scenario.paragraphsPerChapter,
    },
    exportDocx: {
      durationMs: exportDurationMs,
      outputBytes: arrayBuffer.byteLength,
      outputMB: toMB(arrayBuffer.byteLength),
    },
    parseDocx: {
      durationMs: parseDurationMs,
      paragraphTags: parsed.paragraphTags,
    },
    memory: {
      exportHeapDeltaMB: toMB(memAfterExport.heapUsed - memBeforeExport.heapUsed),
      parseHeapDeltaMB: toMB(memAfterParse.heapUsed - memBeforeParse.heapUsed),
      rssDeltaExportMB: toMB(memAfterExport.rss - memBeforeExport.rss),
      rssDeltaParseMB: toMB(memAfterParse.rss - memBeforeParse.rss),
    },
  }

  const failures = []
  if (metrics.exportDocx.durationMs > scenario.thresholds.exportMs) {
    failures.push(`[${scenario.name}] DOCX export ${metrics.exportDocx.durationMs}ms > ${scenario.thresholds.exportMs}ms`)
  }
  if (metrics.parseDocx.durationMs > scenario.thresholds.parseMs) {
    failures.push(`[${scenario.name}] DOCX parse ${metrics.parseDocx.durationMs}ms > ${scenario.thresholds.parseMs}ms`)
  }
  if (metrics.memory.exportHeapDeltaMB > scenario.thresholds.heapDeltaMB) {
    failures.push(`[${scenario.name}] export heap delta ${metrics.memory.exportHeapDeltaMB}MB > ${scenario.thresholds.heapDeltaMB}MB`)
  }
  if (metrics.parseDocx.paragraphTags === 0) {
    failures.push(`[${scenario.name}] parsed paragraph tags is 0`)
  }

  return { metrics, thresholds: scenario.thresholds, failures }
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true })

  const results = []
  const failures = []

  for (const scenario of scenarios) {
    const result = await runScenario(scenario)
    results.push(result)
    failures.push(...result.failures)
  }

  const payload = {
    createdAt: new Date().toISOString(),
    scenarios: results,
    failures,
  }

  await fs.writeFile(REPORT_JSON, JSON.stringify(payload, null, 2), 'utf-8')

  const md = [
    '# Perf Report',
    '',
    `- createdAt: ${payload.createdAt}`,
    '',
    '## Scenario Metrics',
    ...results.flatMap((item) => [
      `- [${item.metrics.scenario.name}] chapters=${item.metrics.scenario.chapters}, paragraphs/chapter=${item.metrics.scenario.paragraphsPerChapter}`,
      `  - export: ${item.metrics.exportDocx.durationMs}ms, output=${item.metrics.exportDocx.outputMB}MB`,
      `  - parse: ${item.metrics.parseDocx.durationMs}ms, paragraphTags=${item.metrics.parseDocx.paragraphTags}`,
      `  - memory: exportHeapDelta=${item.metrics.memory.exportHeapDeltaMB}MB, parseHeapDelta=${item.metrics.memory.parseHeapDeltaMB}MB`,
    ]),
    '',
    failures.length === 0 ? '## Result: PASS' : '## Result: FAIL',
    ...failures.map((item) => `- ${item}`),
    '',
  ]
  await fs.writeFile(REPORT_MD, md.join('\n'), 'utf-8')

  if (failures.length > 0) {
    console.error('[qa:perf] failed')
    failures.forEach((item) => console.error(` - ${item}`))
    process.exit(1)
  }

  console.log('[qa:perf] passed')
  console.log(` - ${REPORT_JSON}`)
  console.log(` - ${REPORT_MD}`)
}

main().catch((error) => {
  console.error('[qa:perf] failed')
  console.error(error)
  process.exit(1)
})
