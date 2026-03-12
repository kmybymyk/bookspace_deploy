#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import JSZip from 'jszip'
import { build } from 'vite'

const ROOT = process.cwd()
const OUTPUT_DIR = path.join(ROOT, 'reports/qa')
const OUTPUT_JSON = path.join(OUTPUT_DIR, 'epubcheck.latest.json')
const OUTPUT_MD = path.join(OUTPUT_DIR, 'epubcheck.latest.md')

function runCmd(command, args) {
  return spawnSync(command, args, { encoding: 'utf-8' })
}

async function createMinimalFixtureEpub(filePath, version) {
  const zip = new JSZip()
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })
  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`,
  )
  if (version === '2.0') {
    zip.file(
      'OEBPS/Text/chapter-1.xhtml',
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en" lang="en">
<head>
  <title>Chapter 1</title>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
</head>
<body>
  <h1>Chapter 1</h1>
  <p>Hello EPUB 2</p>
</body>
</html>`,
    )
    zip.file(
      'OEBPS/Text/toc.xhtml',
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en" lang="en">
<head>
  <title>Contents</title>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
</head>
<body>
  <div>
    <h1>Contents</h1>
    <ol><li><a href="chapter-1.xhtml">Chapter 1</a></li></ol>
  </div>
</body>
</html>`,
    )
    zip.file(
      'OEBPS/toc.ncx',
      `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:00000000-0000-4000-8000-000000000000"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>Fixture</text></docTitle>
  <navMap>
    <navPoint id="navPoint-1" playOrder="1">
      <navLabel><text>Chapter 1</text></navLabel>
      <content src="Text/chapter-1.xhtml"/>
    </navPoint>
  </navMap>
</ncx>`,
    )
    zip.file(
      'OEBPS/content.opf',
      `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:title>Fixture</dc:title>
    <dc:creator opf:role="aut" opf:file-as="BookSpace QA">BookSpace QA</dc:creator>
    <dc:language>en</dc:language>
    <dc:identifier id="uid">urn:uuid:00000000-0000-4000-8000-000000000000</dc:identifier>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="toc" href="Text/toc.xhtml" media-type="application/xhtml+xml"/>
    <item id="chapter-1" href="Text/chapter-1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine toc="ncx">
    <itemref idref="chapter-1"/>
  </spine>
  <guide>
    <reference type="toc" title="Contents" href="Text/toc.xhtml"/>
  </guide>
</package>`,
    )
  } else {
    zip.file(
      'OEBPS/Text/chapter-1.xhtml',
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en" lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>Chapter 1</title>
</head>
<body>
  <h1>Chapter 1</h1>
  <p>Hello EPUB 3</p>
</body>
</html>`,
    )
    zip.file(
      'OEBPS/nav.xhtml',
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en" lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>Contents</title>
</head>
<body>
  <nav epub:type="toc">
    <h1>Contents</h1>
    <ol><li><a href="Text/chapter-1.xhtml">Chapter 1</a></li></ol>
  </nav>
</body>
</html>`,
    )
    zip.file(
      'OEBPS/content.opf',
      `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Fixture</dc:title>
    <dc:creator>BookSpace QA</dc:creator>
    <dc:language>en</dc:language>
    <dc:identifier id="uid">urn:uuid:00000000-0000-4000-8000-000000000000</dc:identifier>
    <meta property="dcterms:modified">2026-01-01T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="chapter-1" href="Text/chapter-1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="chapter-1"/>
  </spine>
</package>`,
    )
  }

  const content = await zip.generateAsync({ type: 'nodebuffer', mimeType: 'application/epub+zip' })
  await fs.writeFile(filePath, content)
}

function sampleMetadata() {
  return {
    title: 'QA EPUB Export Sample',
    subtitle: 'Version check',
    authors: [{ id: 'qa-author', name: 'QA Bot', role: 'author' }],
    language: 'en',
    publisher: 'BookSpace QA',
    publishDate: '2026-03-07',
    description: 'epub export smoke fixture',
    link: '',
    isbn: '',
  }
}

function sampleChapters() {
  return [
    {
      id: 'chapter-1',
      title: 'Chapter 1',
      content: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Hello export QA.' }] },
          {
            type: 'image',
            attrs: {
              src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+XGNsAAAAASUVORK5CYII=',
              alt: 'pixel',
              caption: 'Caption sample',
              title: 'Caption sample',
              captionVisible: true,
              widthPercent: 50,
            },
          },
        ],
      },
      order: 0,
      fileName: 'chapter-1.xhtml',
      chapterType: 'chapter',
      parentId: null,
    },
  ]
}

function sampleDesignSettings() {
  const typography = {
    h1FontFamily: 'Noto Serif KR',
    h2FontFamily: 'Noto Serif KR',
    h3FontFamily: 'Noto Serif KR',
    h4FontFamily: 'Noto Serif KR',
    h5FontFamily: 'Noto Serif KR',
    h6FontFamily: 'Noto Serif KR',
    h1FontSize: 36,
    h2FontSize: 26,
    h3FontSize: 16,
    h4FontSize: 15,
    h5FontSize: 14,
    h6FontSize: 13,
  }
  return {
    fontFamily: 'Noto Serif KR',
    fontEmbedMode: 'none',
    h1FontFamily: 'Noto Serif KR',
    h2FontFamily: 'Noto Serif KR',
    h3FontFamily: 'Noto Serif KR',
    h4FontFamily: 'Noto Serif KR',
    h5FontFamily: 'Noto Serif KR',
    h6FontFamily: 'Noto Serif KR',
    h1FontSize: 36,
    h2FontSize: 26,
    h3FontSize: 16,
    h4FontSize: 15,
    h5FontSize: 14,
    h6FontSize: 13,
    pageBackgroundColor: '#ffffff',
    fontSize: 16,
    lineHeight: 1.8,
    letterSpacing: 0,
    paragraphSpacing: 1.2,
    textIndent: 0,
    suppressFirstParagraphIndent: false,
    chapterTitleAlign: 'left',
    chapterTitleSpacing: 2,
    chapterTitleDivider: true,
    sceneBreakStyle: 'line',
    imageMaxWidth: 60,
    theme: 'novel',
    sectionTypography: {
      front: { ...typography },
      body: { ...typography },
      back: { ...typography },
    },
  }
}

async function createActualExporterFixtureEpubs(tmpDir) {
  const bundleDir = path.join(tmpDir, 'exporter-bundle')
  await build({
    root: ROOT,
    configFile: false,
    logLevel: 'error',
    publicDir: false,
    build: {
      outDir: bundleDir,
      emptyOutDir: true,
      lib: {
        entry: path.join(ROOT, 'src/features/export/epubExporter.ts'),
        formats: ['es'],
        fileName: () => 'qa-epub-exporter.js',
      },
      rollupOptions: {
        external: [],
      },
      minify: false,
    },
  })

  const exporterModule = await import(pathToFileURL(path.join(bundleDir, 'qa-epub-exporter.js')).href)
  const exportEpub = exporterModule.exportEpub
  if (typeof exportEpub !== 'function') {
    throw new Error('failed to load exportEpub from qa exporter bundle')
  }

  const fixtures = []
  for (const version of ['2.0', '3.0']) {
    const { blob } = await exportEpub(sampleChapters(), sampleMetadata(), sampleDesignSettings(), { version })
    const outputPath = path.join(tmpDir, `fixture-exporter-v${version === '2.0' ? '2' : '3'}.epub`)
    await fs.writeFile(outputPath, Buffer.from(await blob.arrayBuffer()))
    fixtures.push(outputPath)
  }

  return fixtures
}

async function writeReport(report) {
  await fs.mkdir(OUTPUT_DIR, { recursive: true })
  await fs.writeFile(OUTPUT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf-8')
  const md = [
    '# EPUBCheck QA',
    '',
    `- generatedAt: ${report.generatedAt}`,
    `- status: ${report.status}`,
    `- targets: ${report.targets.length}`,
    '',
    '## Targets',
    ...report.targets.map((target) => `- ${target}`),
    '',
    report.status === 'pass' ? '## Result: PASS' : report.status === 'skipped' ? '## Result: SKIPPED' : '## Result: FAIL',
    '',
    ...report.details.map((line) => `- ${line}`),
    '',
  ]
  await fs.writeFile(OUTPUT_MD, `${md.join('\n')}\n`, 'utf-8')
}

async function main() {
  const version = runCmd('epubcheck', ['--version'])
  if (version.error) {
    const required = process.env.QA_EPUBCHECK_REQUIRED === '1'
    const report = {
      generatedAt: new Date().toISOString(),
      status: required ? 'fail' : 'skipped',
      targets: [],
      details: ['epubcheck command is not installed or not on PATH'],
    }
    await writeReport(report)
    if (required) {
      console.error('[qa:epubcheck] failed: epubcheck is required but unavailable')
      process.exit(1)
    }
    console.log('[qa:epubcheck] skipped: epubcheck not found')
    console.log(` - ${OUTPUT_JSON}`)
    console.log(` - ${OUTPUT_MD}`)
    return
  }

  const argTargets = process.argv.slice(2).filter(Boolean)
  const targets = []

  if (argTargets.length > 0) {
    for (const item of argTargets) targets.push(path.resolve(ROOT, item))
  } else {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bookspace-epubcheck-'))
    const fixtureV2Path = path.join(tmpDir, 'fixture-minimal-v2.epub')
    const fixtureV3Path = path.join(tmpDir, 'fixture-minimal-v3.epub')
    await createMinimalFixtureEpub(fixtureV2Path, '2.0')
    await createMinimalFixtureEpub(fixtureV3Path, '3.0')
    const exporterTargets = await createActualExporterFixtureEpubs(tmpDir)
    targets.push(fixtureV2Path, fixtureV3Path, ...exporterTargets)
  }

  const details = []
  let hasFailure = false
  for (const target of targets) {
    const result = runCmd('epubcheck', [target])
    if (result.status !== 0) {
      hasFailure = true
      details.push(`[FAIL] ${target}`)
      const body = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim()
      if (body) {
        const lines = body.split('\n').slice(0, 20)
        details.push(...lines.map((line) => `  ${line}`))
      }
      continue
    }
    details.push(`[PASS] ${target}`)
  }

  const report = {
    generatedAt: new Date().toISOString(),
    status: hasFailure ? 'fail' : 'pass',
    targets,
    details,
  }
  await writeReport(report)

  if (hasFailure) {
    console.error('[qa:epubcheck] failed')
    console.error(` - ${OUTPUT_JSON}`)
    console.error(` - ${OUTPUT_MD}`)
    process.exit(1)
  }

  console.log('[qa:epubcheck] passed')
  console.log(` - ${OUTPUT_JSON}`)
  console.log(` - ${OUTPUT_MD}`)
}

main().catch(async (error) => {
  const report = {
    generatedAt: new Date().toISOString(),
    status: 'fail',
    targets: [],
    details: [String(error instanceof Error ? error.message : error)],
  }
  await writeReport(report)
  console.error('[qa:epubcheck] failed')
  console.error(error)
  process.exit(1)
})
