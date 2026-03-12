import fs from 'node:fs/promises'
import path from 'node:path'
import JSZip from 'jszip'
import { exportDocx } from '../src/features/export/docxExporter.ts'

const OUTPUT_DIR = path.resolve('tmp/docx-qa')
const REPORT_DIR = path.resolve('reports/qa')
const REPORT_JSON = path.join(REPORT_DIR, 'docx.latest.json')
const REPORT_MD = path.join(REPORT_DIR, 'docx.latest.md')

const PNG_1X1_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Zq1kAAAAASUVORK5CYII='

const failures = []
const checks = []

function createMetadata(title) {
  return {
    title,
    subtitle: '',
    authors: [{ id: 'author-1', name: 'QA Bot', role: 'author' }],
    language: 'ko',
    publisher: 'BookSpace QA',
    isbn: '',
    link: '',
    description: '',
  }
}

function createBaseChapter(id, title, content) {
  return {
    id,
    title,
    content: { type: 'doc', content },
    order: 0,
    fileName: `chapter-${id}.xhtml`,
    chapterType: 'chapter',
    parentId: null,
  }
}

function listScenario() {
  return [
    createBaseChapter('list-1', '리스트 시나리오', [
      { type: 'paragraph', content: [{ type: 'text', text: '리스트 테스트 문단' }] },
      {
        type: 'orderedList',
        content: [
          {
            type: 'listItem',
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: '첫 번째 항목' }] },
              {
                type: 'bulletList',
                content: [
                  {
                    type: 'listItem',
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: '중첩 불릿 1' }] }],
                  },
                  {
                    type: 'listItem',
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: '중첩 불릿 2' }] }],
                  },
                ],
              },
            ],
          },
          {
            type: 'listItem',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: '두 번째 항목' }] }],
          },
        ],
      },
    ]),
  ]
}

function tableScenario() {
  return [
    createBaseChapter('table-1', '표 시나리오', [
      { type: 'paragraph', content: [{ type: 'text', text: '표 테스트 문단' }] },
      {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [
              {
                type: 'tableHeader',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: '헤더 A' }] }],
              },
              {
                type: 'tableHeader',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: '헤더 B' }] }],
              },
            ],
          },
          {
            type: 'tableRow',
            content: [
              {
                type: 'tableCell',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: '셀 A1' }] }],
              },
              {
                type: 'tableCell',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: '셀 B1' }] }],
              },
            ],
          },
        ],
      },
    ]),
  ]
}

function imageScenario() {
  return [
    createBaseChapter('image-1', '이미지 시나리오', [
      { type: 'paragraph', content: [{ type: 'text', text: '이미지 테스트 문단' }] },
      {
        type: 'image',
        attrs: {
          src: `data:image/png;base64,${PNG_1X1_BASE64}`,
          alt: 'qa-image',
          width: 2000,
          height: 1200,
        },
      },
    ]),
  ]
}

function expectIncludes(haystack, needle, message) {
  const ok = haystack.includes(needle)
  checks.push({ name: message, ok })
  if (!ok) failures.push(message)
}

async function validateDocx(filePath, checksForScenario) {
  const buf = await fs.readFile(filePath)
  const zip = await JSZip.loadAsync(buf)
  const documentXml = await zip.file('word/document.xml')?.async('string')
  const numberingXml = await zip.file('word/numbering.xml')?.async('string')
  const relsXml = await zip.file('word/_rels/document.xml.rels')?.async('string')

  if (!documentXml || !numberingXml || !relsXml) {
    failures.push(`core xml missing in ${path.basename(filePath)}`)
    return
  }

  for (const checkFn of checksForScenario) {
    checkFn({ zip, documentXml, numberingXml, relsXml })
  }
}

async function runScenario(name, chapters, checksForScenario) {
  const metadata = createMetadata(`DOCX QA ${name}`)
  const blob = await exportDocx(chapters, metadata)
  const outPath = path.join(OUTPUT_DIR, `${name}.docx`)
  const arrayBuffer = await blob.arrayBuffer()
  await fs.writeFile(outPath, Buffer.from(arrayBuffer))
  await validateDocx(outPath, checksForScenario)
  return outPath
}

async function writeReport(outputs) {
  await fs.mkdir(REPORT_DIR, { recursive: true })
  const report = {
    createdAt: new Date().toISOString(),
    outputs,
    checks,
    failures,
  }
  await fs.writeFile(REPORT_JSON, JSON.stringify(report, null, 2), 'utf-8')

  const md = [
    '# DOCX Scenario QA',
    '',
    `- createdAt: ${report.createdAt}`,
    `- outputs: ${outputs.length}`,
    `- checks: ${checks.length}`,
    `- failures: ${failures.length}`,
    '',
    '## Outputs',
    ...outputs.map((p) => `- ${p}`),
    '',
    '## Checks',
    ...checks.map((c) => `- ${c.ok ? 'PASS' : 'FAIL'} ${c.name}`),
    '',
    failures.length ? '## Result: FAIL' : '## Result: PASS',
    ...failures.map((f) => `- ${f}`),
    '',
  ]
  await fs.writeFile(REPORT_MD, md.join('\n'), 'utf-8')
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true })

  const outputs = []

  outputs.push(
    await runScenario('list', listScenario(), [
      ({ documentXml, numberingXml }) => {
        expectIncludes(documentXml, '<w:numPr>', 'list: native numbering in document.xml')
        expectIncludes(numberingXml, '<w:abstractNum', 'list: abstract numbering definitions')
      },
    ]),
  )

  outputs.push(
    await runScenario('table', tableScenario(), [
      ({ documentXml }) => {
        expectIncludes(documentXml, '<w:tbl>', 'table: Word table element')
        expectIncludes(documentXml, '<w:shd', 'table: header shading')
      },
    ]),
  )

  outputs.push(
    await runScenario('image', imageScenario(), [
      ({ zip, documentXml, relsXml }) => {
        expectIncludes(documentXml, '<w:drawing>', 'image: drawing element')
        expectIncludes(relsXml, 'relationships/image', 'image: relationship image')
        const mediaEntries = Object.keys(zip.files).filter((name) => name.startsWith('word/media/'))
        const ok = mediaEntries.length > 0
        checks.push({ name: 'image: media entries exist', ok })
        if (!ok) failures.push('image: expected media files in word/media/')
      },
    ]),
  )

  await writeReport(outputs)

  if (failures.length > 0) {
    console.error('[qa:docx] failed')
    failures.forEach((item) => console.error(` - ${item}`))
    process.exit(1)
  }

  console.log('[qa:docx] passed')
  for (const file of outputs) {
    console.log(` - ${file}`)
  }
  console.log(` - ${REPORT_JSON}`)
  console.log(` - ${REPORT_MD}`)
}

main().catch((error) => {
  console.error('[qa:docx] failed')
  console.error(error)
  process.exit(1)
})
