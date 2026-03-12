import fs from 'node:fs/promises'
import path from 'node:path'
import JSZip from 'jszip'

function usage() {
  console.log('Usage: npm run check:epub -- /absolute/or/relative/file.epub')
}

function normalizePath(p) {
  return p.replace(/\\/g, '/').replace(/^\/+/, '')
}

function dirname(p) {
  const n = normalizePath(p)
  const i = n.lastIndexOf('/')
  return i === -1 ? '' : n.slice(0, i)
}

function resolveHref(baseDir, href) {
  if (!href) return ''
  if (href.startsWith('/')) return normalizePath(href)
  const raw = baseDir ? `${baseDir}/${href}` : href
  const parts = raw.split('/')
  const stack = []
  for (const part of parts) {
    if (!part || part === '.') continue
    if (part === '..') {
      stack.pop()
      continue
    }
    stack.push(part)
  }
  return stack.join('/')
}

function matchAttr(tag, attr) {
  const re = new RegExp(`${attr}\\s*=\\s*["']([^"']+)["']`, 'i')
  const m = tag.match(re)
  return m?.[1] ?? ''
}

function parseManifest(opfXml) {
  const map = new Map()
  const itemTags = opfXml.match(/<item\b[^>]*>/gi) ?? []
  for (const tag of itemTags) {
    const id = matchAttr(tag, 'id')
    const href = matchAttr(tag, 'href')
    if (!id || !href) continue
    map.set(id, {
      href,
      mediaType: matchAttr(tag, 'media-type'),
      properties: matchAttr(tag, 'properties'),
    })
  }
  return map
}

function parseSpine(opfXml) {
  const refs = []
  const itemRefTags = opfXml.match(/<itemref\b[^>]*>/gi) ?? []
  for (const tag of itemRefTags) {
    const idRef = matchAttr(tag, 'idref')
    if (idRef) refs.push(idRef)
  }
  return refs
}

function parseRootfile(containerXml) {
  const m = containerXml.match(/<rootfile\b[^>]*full-path\s*=\s*["']([^"']+)["']/i)
  return m?.[1] ?? ''
}

async function run() {
  const epubPath = process.argv[2]
  if (!epubPath || epubPath === '--help' || epubPath === '-h') {
    usage()
    process.exit(epubPath ? 0 : 1)
  }

  const fullPath = path.resolve(epubPath)
  const file = await fs.readFile(fullPath)
  const zip = await JSZip.loadAsync(file)

  const container = zip.file('META-INF/container.xml')
  let opfPath = ''
  if (container) {
    const xml = await container.async('string')
    opfPath = parseRootfile(xml)
  }
  if (!opfPath) {
    const fallback = Object.keys(zip.files).find((name) => name.endsWith('.opf'))
    opfPath = fallback ?? ''
  }
  if (!opfPath) {
    console.error('[ERROR] OPF file not found')
    process.exit(2)
  }

  const opfEntry = zip.file(normalizePath(opfPath))
  if (!opfEntry) {
    console.error(`[ERROR] OPF entry missing in zip: ${opfPath}`)
    process.exit(2)
  }

  const opfXml = await opfEntry.async('string')
  const manifest = parseManifest(opfXml)
  const spine = parseSpine(opfXml)
  const opfDir = dirname(opfPath)

  const ordered = []
  for (const idRef of spine) {
    const item = manifest.get(idRef)
    if (!item) {
      console.warn(`[WARN] idref not found in manifest: ${idRef}`)
      continue
    }
    const resolved = resolveHref(opfDir, item.href)
    const props = (item.properties || '').split(/\s+/).filter(Boolean)
    const isNav = props.includes('nav')
    const isHtml = /x?html/i.test(item.mediaType || '') || /\.x?html$/i.test(item.href)
    if (isNav || !isHtml) continue
    ordered.push(resolved)
  }

  const allHtml = Object.keys(zip.files)
    .filter((name) => /\.x?html$/i.test(name))
    .filter((name) => !/\/?nav\.xhtml$/i.test(name) && !/\/?toc\.xhtml$/i.test(name))
    .map((name) => normalizePath(name))
    .sort((a, b) => a.localeCompare(b))

  const missingFromSpine = allHtml.filter((name) => !ordered.includes(name))

  console.log(`EPUB: ${fullPath}`)
  console.log(`OPF: ${normalizePath(opfPath)}`)
  console.log(`Spine chapters: ${ordered.length}`)
  for (const [idx, name] of ordered.entries()) {
    console.log(`  ${String(idx + 1).padStart(2, '0')}. ${name}`)
  }
  if (missingFromSpine.length) {
    console.log(`Fallback-only html files (${missingFromSpine.length}):`)
    for (const name of missingFromSpine) {
      console.log(`  - ${name}`)
    }
  }
}

run().catch((err) => {
  console.error('[ERROR]', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
