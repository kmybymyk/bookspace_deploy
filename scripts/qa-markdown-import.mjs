import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { build } from 'esbuild'

const failures = []
const checks = []

function check(condition, id, detail) {
  const passed = Boolean(condition)
  checks.push({ id, passed, detail })
  if (!passed) failures.push({ id, detail })
}

function findNodes(node, predicate, out = []) {
  if (!node || typeof node !== 'object') return out
  if (predicate(node)) out.push(node)
  if (Array.isArray(node.content)) {
    for (const child of node.content) findNodes(child, predicate, out)
  }
  return out
}

function hasMarkType(doc, type) {
  const textNodes = findNodes(doc, (node) => node.type === 'text')
  return textNodes.some((node) => Array.isArray(node.marks) && node.marks.some((mark) => mark.type === type))
}

function asArrayBuffer(buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
}

async function buildBundle(entryPoint, outfile) {
  await build({
    entryPoints: [entryPoint],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile,
    define: {
      'import.meta.env.VITE_UI_LANG': '"en"',
    },
  })
  return import(`file://${outfile}`)
}

function runFixtureAssertions(result, fixtureName, expect) {
  check(result.chapters.length === expect.chapters, `${fixtureName}/chapters`, `expected ${expect.chapters}, got ${result.chapters.length}`)

  if (expect.title) check(result.metadata.title === expect.title, `${fixtureName}/meta-title`, 'title mismatch')
  if (expect.language) check(result.metadata.language === expect.language, `${fixtureName}/meta-language`, `language mismatch: ${result.metadata.language}`)

  const firstDoc = result.chapters[0]?.content
  if (!firstDoc) {
    check(false, `${fixtureName}/doc`, 'first chapter content missing')
    return
  }

  if (expect.hasBold) check(hasMarkType(firstDoc, 'bold'), `${fixtureName}/inline-bold`, 'bold mark missing')
  if (expect.hasItalic) check(hasMarkType(firstDoc, 'italic'), `${fixtureName}/inline-italic`, 'italic mark missing')
  if (expect.hasCodeMark) check(hasMarkType(firstDoc, 'code'), `${fixtureName}/inline-code`, 'code mark missing')
  if (expect.hasLink) check(hasMarkType(firstDoc, 'link'), `${fixtureName}/inline-link`, 'link mark missing')
  if (expect.hasStrike) check(hasMarkType(firstDoc, 'strike'), `${fixtureName}/inline-strike`, 'strike mark missing')
  if (expect.hasAutolink) {
    const linkText = findNodes(firstDoc, (node) => node.type === 'text').some((node) => {
      if (!Array.isArray(node.marks)) return false
      return node.text === 'https://example.org/path' && node.marks.some((mark) => mark.type === 'link')
    })
    check(linkText, `${fixtureName}/inline-autolink`, 'autolink mark missing')
  }

  if (expect.hasCodeBlock) {
    const codeBlocks = findNodes(firstDoc, (node) => node.type === 'codeBlock')
    check(codeBlocks.length > 0, `${fixtureName}/block-code`, 'codeBlock missing')
  }

  if (expect.hasNestedBullet) {
    const bulletLists = findNodes(firstDoc, (node) => node.type === 'bulletList')
    check(bulletLists.length > 1, `${fixtureName}/nested-list`, 'nested bullet list missing')
  }

  if (expect.hasTable) {
    const tables = findNodes(firstDoc, (node) => node.type === 'table')
    check(tables.length > 0, `${fixtureName}/table`, 'table missing')
  }

  if (expect.hasBlockquoteMultiParagraph) {
    const blockquotes = findNodes(firstDoc, (node) => node.type === 'blockquote')
    const paragraphCount = blockquotes.flatMap((node) => node.content ?? []).filter((node) => node?.type === 'paragraph').length
    check(paragraphCount >= 2, `${fixtureName}/blockquote-multi`, `expected >=2 paragraphs, got ${paragraphCount}`)
  }

  if (expect.hasImage) {
    const images = findNodes(firstDoc, (node) => node.type === 'image')
    check(images.length > 0, `${fixtureName}/image`, 'image missing')
  }
  if (expect.hasExternalImage) {
    const images = findNodes(firstDoc, (node) => node.type === 'image')
    const found = images.some((node) => String(node.attrs?.src ?? '').startsWith('https://example.com/'))
    check(found, `${fixtureName}/external-image`, 'external image missing')
  }
  if (expect.hasRelativeImage) {
    const images = findNodes(firstDoc, (node) => node.type === 'image')
    const found = images.some((node) => String(node.attrs?.src ?? '').startsWith('./'))
    check(found, `${fixtureName}/relative-image`, 'relative image missing before resolver')
  }
}

async function run() {
  const importerBundle = path.join('/tmp', `qa-markdown-importer-${randomUUID()}.mjs`)
  const resolverBundle = path.join('/tmp', `qa-markdown-resolver-${randomUUID()}.mjs`)

  const importerModule = await buildBundle(
    path.join(process.cwd(), 'src/features/export/markdownImporter.ts'),
    importerBundle,
  )
  const resolverModule = await buildBundle(
    path.join(process.cwd(), 'src/features/export/markdownImageResolver.ts'),
    resolverBundle,
  )

  const { importMarkdown } = importerModule
  const { resolveMarkdownImageSources } = resolverModule

  const fixtureDir = path.join(process.cwd(), 'scripts', 'fixtures', 'markdown-import')
  const manifest = JSON.parse(readFileSync(path.join(fixtureDir, 'manifest.json'), 'utf8'))

  for (const fixture of manifest) {
    const raw = readFileSync(path.join(fixtureDir, fixture.file), 'utf8')
    const result = importMarkdown(raw)
    runFixtureAssertions(result, fixture.file, fixture.expect)
  }

  const imageFixturePath = path.join(fixtureDir, 'relative-image.md')
  const imageFixtureRaw = readFileSync(imageFixturePath, 'utf8')
  const imageFixtureResult = importMarkdown(imageFixtureRaw)

  const onePixelPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7+g1kAAAAASUVORK5CYII='
  const imageBinary = Buffer.from(onePixelPngBase64, 'base64')
  const mockReadBinary = async (filePath) => {
    if (filePath.endsWith('/assets/local.png') || filePath.endsWith('\\assets\\local.png')) {
      return asArrayBuffer(imageBinary)
    }
    throw new Error(`unexpected path: ${filePath}`)
  }

  const warnings = await resolveMarkdownImageSources(imageFixtureResult.chapters, imageFixturePath, mockReadBinary)
  check(warnings.length === 0, 'resolver/warnings', `expected 0 warnings, got ${warnings.length}`)

  const imageNodesAfterResolve = findNodes(imageFixtureResult.chapters[0]?.content, (node) => node.type === 'image')
  const converted = imageNodesAfterResolve.some((node) => String(node.attrs?.src ?? '').startsWith('data:image/png;base64,'))
  check(converted, 'resolver/data-url-conversion', 'relative image was not converted to data URL')

  const outDir = path.join(process.cwd(), 'reports', 'qa')
  mkdirSync(outDir, { recursive: true })
  const report = {
    generatedAt: new Date().toISOString(),
    total: checks.length,
    failed: failures.length,
    checks,
  }
  writeFileSync(path.join(outDir, 'markdown.latest.json'), JSON.stringify(report, null, 2))

  if (failures.length > 0) {
    console.error('[qa:markdown] failed')
    for (const failure of failures) console.error(` - ${failure.id}: ${failure.detail}`)
    process.exit(1)
  }

  console.log('[qa:markdown] passed')
  console.log(` - ${path.join(outDir, 'markdown.latest.json')}`)
}

void run()
