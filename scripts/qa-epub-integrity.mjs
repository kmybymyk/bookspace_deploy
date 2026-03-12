#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'

const ROOT = process.cwd()
const EXPORTER_PATH = path.join(ROOT, 'src/features/export/epubExporter.ts')
const IMPORTER_PATH = path.join(ROOT, 'src/features/export/epubImporter.ts')
const CHAPTER_STORE_PATH = path.join(ROOT, 'src/features/chapters/useChapterStore.ts')
const OUTPUT_DIR = path.join(ROOT, 'reports/qa')
const OUTPUT_JSON = path.join(OUTPUT_DIR, 'epub-integrity.latest.json')
const OUTPUT_MD = path.join(OUTPUT_DIR, 'epub-integrity.latest.md')

async function main() {
  const exporterSource = await fs.readFile(EXPORTER_PATH, 'utf-8')
  const importerSource = await fs.readFile(IMPORTER_PATH, 'utf-8')
  const chapterStoreSource = await fs.readFile(CHAPTER_STORE_PATH, 'utf-8')
  const checks = []
  const failures = []

  const markers = [
    {
      name: 'chapter/xhtml-file-name-policy',
      ok: chapterStoreSource.includes('return `chapter-${id}.xhtml`'),
      reason: 'chapter fileName policy should generate .xhtml extension',
    },
    {
      name: 'epub/text-entry-write',
      ok: /zip\.file\(`OEBPS\/Text\/\$\{(?:chapter|entry\.chapter)\.fileName\}`,\s*(?:xhtml|entry\.xhtml)\)/.test(exporterSource),
      reason: 'exporter should write chapter XHTML entries',
    },
    {
      name: 'epub/manifest-xhtml',
      ok: exporterSource.includes('media-type="application/xhtml+xml"'),
      reason: 'manifest should declare chapter XHTML media type',
    },
    {
      name: 'epub/spine-itemref',
      ok: /<itemref idref="\$\{chapterItemId\((?:c|chapter)\.id\)\}"\/>/.test(exporterSource),
      reason: 'spine should include chapter itemref entries',
    },
    {
      name: 'epub/toc-nav',
      ok: exporterSource.includes("'OEBPS/nav.xhtml'"),
      reason: 'nav.xhtml should be emitted',
    },
    {
      name: 'epub/toc-ncx',
      ok: exporterSource.includes("'OEBPS/toc.ncx'"),
      reason: 'EPUB 2 export should emit toc.ncx',
    },
    {
      name: 'epub/content-opf',
      ok: exporterSource.includes("'OEBPS/content.opf'"),
      reason: 'content.opf should be emitted',
    },
    {
      name: 'epub/version-switch',
      ok: exporterSource.includes("const version = options.version ?? '3.0'"),
      reason: 'exporter should support selecting EPUB 2.0 or 3.0',
    },
    {
      name: 'epub/opf-version-2',
      ok: exporterSource.includes('version="2.0"'),
      reason: 'EPUB 2 package metadata should declare version 2.0',
    },
    {
      name: 'epub/opf-version-3',
      ok: exporterSource.includes('version="3.0"'),
      reason: 'EPUB 3 package metadata should declare version 3.0',
    },
    {
      name: 'epub/spine-toc-ncx',
      ok: exporterSource.includes('<spine toc="ncx">'),
      reason: 'EPUB 2 spine should point to ncx',
    },
    {
      name: 'epub/cover-reference-safe',
      ok: !exporterSource.includes('coverFileName'),
      reason: 'cover.xhtml image reference should not use undefined coverFileName variable',
    },
    {
      name: 'epub/publish-date-metadata',
      ok: exporterSource.includes('<dc:date>') || exporterSource.includes('publicationDate ? `<dc:date>'),
      reason: 'publishDate should be exported as dc:date when provided',
    },
    {
      name: 'epub/publisher-logo-manifest',
      ok: exporterSource.includes('publisher-logo') && exporterSource.includes('publisherLogoInfo'),
      reason: 'publisher logo should be packaged and declared in manifest',
    },
    {
      name: 'epub/import-figure-linked-image',
      ok:
        importerSource.includes("findDescendantElementByTag(el, 'img')") &&
        importerSource.includes("if (currentTag === 'figcaption') continue"),
      reason: 'figure import should recover nested linked images while skipping figcaption subtree',
    },
    {
      name: 'epub/import-figure-class-sanitized',
      ok:
        importerSource.includes("token === 'book-image-figure'") &&
        importerSource.includes('mergeImageClassTokens('),
      reason: 'figure wrapper class should not leak into image attrs during import',
    },
  ]

  for (const marker of markers) {
    checks.push({ name: marker.name, ok: marker.ok })
    if (!marker.ok) failures.push(`${marker.name}: ${marker.reason}`)
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
    '# EPUB Integrity QA',
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
    console.error('[qa:epub:integrity] failed')
    failures.forEach((item) => console.error(` - ${item}`))
    process.exit(1)
  }
  console.log('[qa:epub:integrity] passed')
  console.log(` - ${OUTPUT_JSON}`)
  console.log(` - ${OUTPUT_MD}`)
}

main().catch((error) => {
  console.error('[qa:epub:integrity] failed')
  console.error(error)
  process.exit(1)
})
