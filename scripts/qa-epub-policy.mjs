#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '..')

const failures = []
const warnings = []

function check(ok, message) {
  if (!ok) failures.push(message)
}

function warn(ok, message) {
  if (!ok) warnings.push(message)
}

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), 'utf-8')
}

function checkSourcePolicies() {
  const exporter = read('src/features/export/epubExporter.ts')
  const chapterStore = read('src/features/chapters/useChapterStore.ts')

  check(
    exporter.includes('MAX_HTML_FILE_COUNT = 300') &&
      exporter.includes('MAX_HTML_FILE_BYTES = 300 * 1024') &&
      exporter.includes('RECOMMENDED_HTML_FILE_BYTES = 200 * 1024'),
    'EPUB policy constants are missing (HTML file count/size).',
  )

  check(
    exporter.includes('RECOMMENDED_FONT_COUNT = 10'),
    'EPUB policy constant is missing (recommended embedded font count).',
  )

  check(
    exporter.includes("if (!/^[a-zA-Z0-9_-]+\\.(xhtml|html)$/.test(entry.chapter.fileName))"),
    'EPUB filename validation is missing in exporter.',
  )

  check(
    chapterStore.includes('function sanitizeChapterFileName') &&
      chapterStore.includes(".replace(/[^a-zA-Z0-9_-]+/g, '-')") &&
      chapterStore.includes('return `${safeBase}.xhtml`'),
    'Chapter filename sanitizer is missing or incomplete.',
  )

  check(
    exporter.includes('font-size: 1em;') &&
      exporter.includes('line-height: ${settings.lineHeight}em;') &&
      exporter.includes('/ Math.max(design.bodyFontSize, 1)).toFixed(4)}em;'),
    'em-based typography conversion is missing in chapter CSS.',
  )

  check(
    exporter.includes('/ Math.max(preset.h3FontSize, 1)).toFixed(4)}em;'),
    'em-based typography conversion is missing in global CSS.',
  )

  check(
    exporter.includes('buildTocTree') &&
      exporter.includes('renderTocTree') &&
      exporter.includes('.filter((item) => item.level > 1)'),
    'Nested heading TOC generation is missing in nav.xhtml flow.',
  )

  check(
    exporter.includes("<spine>") &&
      exporter.includes("${hasCover ? '<itemref idref=\"cover-xhtml\"/>' : ''}") &&
      !exporter.includes('linear="no"'),
    'Spine cover policy check failed (cover itemref should not use linear="no").',
  )

  const declaredRoots = ['mimetype', 'META-INF/container.xml', 'OEBPS/content.opf', 'OEBPS/nav.xhtml']
  for (const rel of declaredRoots) {
    check(exporter.includes(`'${rel}'`) || exporter.includes(`"${rel}"`), `Exporter output missing expected file: ${rel}`)
  }

  warn(
    exporter.includes('console.warn('),
    'No warning path found for recommendation-level policy violations.',
  )
}

function main() {
  checkSourcePolicies()

  if (warnings.length > 0) {
    console.log('EPUB policy warnings:')
    for (const message of warnings) console.log(`- ${message}`)
  }

  if (failures.length > 0) {
    console.error('EPUB policy QA failed:')
    for (const message of failures) console.error(`- ${message}`)
    process.exit(1)
  }

  console.log('EPUB policy QA passed.')
}

main()
