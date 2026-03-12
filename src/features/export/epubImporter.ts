import JSZip from 'jszip'
import type { JSONContent } from '@tiptap/core'
import type { BookMetadata, Chapter } from '../../types/project'
import i18n from '../../i18n'
import { buildEpubImportPlan, parseEpubPackageInfo } from './epubImportStructure'

const BLOCK_TAGS = new Set([
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'p',
    'blockquote',
    'hr',
    'img',
    'ul',
    'ol',
    'li',
    'table',
    'thead',
    'tbody',
    'tfoot',
    'tr',
    'td',
    'th',
    'div',
    'section',
    'article',
    'figure',
    'figcaption',
])

type EpubMark = {
    type: string
    attrs?: Record<string, unknown>
}

type EpubNode = JSONContent & {
    type: string
    attrs?: Record<string, unknown>
    content?: EpubNode[]
    marks?: EpubMark[]
}

function mergeMarks(base: EpubMark[], extra: EpubMark[]): EpubMark[] {
    if (extra.length === 0) return base
    const merged = [...base]
    for (const mark of extra) {
        const key = JSON.stringify(mark)
        if (!merged.some((m) => JSON.stringify(m) === key)) {
            merged.push(mark)
        }
    }
    return merged
}

function marksForElement(el: Element): EpubMark[] {
    const tag = el.tagName.toLowerCase()
    if (tag === 'strong' || tag === 'b') return [{ type: 'bold' }]
    if (tag === 'em' || tag === 'i') return [{ type: 'italic' }]
    if (tag === 'u') return [{ type: 'underline' }]
    if (tag === 's' || tag === 'strike' || tag === 'del') return [{ type: 'strike' }]
    if (tag === 'sup') return [{ type: 'superscript' }]
    if (tag === 'sub') return [{ type: 'subscript' }]
    if (tag === 'a') {
        const href = el.getAttribute('href') ?? ''
        return href ? [{ type: 'link', attrs: { href } }] : []
    }
    return []
}

function isInlineElement(el: Element): boolean {
    return !BLOCK_TAGS.has(el.tagName.toLowerCase())
}

function parseInlineNodes(nodes: ChildNode[], activeMarks: EpubMark[] = []): EpubNode[] {
    const result: EpubNode[] = []

    for (const node of nodes) {
        if (node.nodeType === Node.TEXT_NODE) {
            const value = node.textContent ?? ''
            if (!value) continue
            const textNode: EpubNode = { type: 'text', text: value }
            if (activeMarks.length > 0) textNode.marks = activeMarks
            result.push(textNode)
            continue
        }

        if (node.nodeType !== Node.ELEMENT_NODE) continue
        const el = node as Element
        const tag = el.tagName.toLowerCase()
        if (tag === 'br') {
            result.push({ type: 'hardBreak' })
            continue
        }

        const nextMarks = mergeMarks(activeMarks, marksForElement(el))
        result.push(...parseInlineNodes(Array.from(el.childNodes), nextMarks))
    }

    return result
}

function paragraphAttrs(el: Element): Record<string, string> | undefined {
    const attrs: Record<string, string> = {}
    const id = el.getAttribute('id')
    const className = el.getAttribute('class')
    const placeholder = el.getAttribute('data-note-placeholder')

    if (id) attrs.id = id
    if (className) attrs.class = className
    if (placeholder) attrs.dataNotePlaceholder = placeholder

    return Object.keys(attrs).length > 0 ? attrs : undefined
}

function parseParagraphFromInlineNodes(nodes: ChildNode[]): EpubNode {
    const content = parseInlineNodes(nodes)
    return content.length > 0 ? { type: 'paragraph', content } : { type: 'paragraph' }
}

function parseWidthPercentFromElement(el: Element): number | undefined {
    const dataValue = el.getAttribute('data-width-percent')
    if (dataValue) {
        const width = Number(dataValue)
        if (Number.isFinite(width)) return Math.max(10, Math.min(100, Math.round(width)))
    }
    const styleValue = (el.getAttribute('style') ?? '').match(/width\s*:\s*(\d+(?:\.\d+)?)%/i)
    if (!styleValue) return undefined
    const width = Number(styleValue[1])
    if (!Number.isFinite(width)) return undefined
    return Math.max(10, Math.min(100, Math.round(width)))
}

function normalizeClassTokens(value: string | null | undefined): string[] {
    return String(value ?? '')
        .split(/\s+/)
        .map((token) => token.trim())
        .filter(Boolean)
}

function mergeImageClassTokens(...values: Array<string | null | undefined>): string | undefined {
    const seen = new Set<string>()
    const tokens: string[] = []

    for (const value of values) {
        for (const token of normalizeClassTokens(value)) {
            if (token === 'book-image-figure' || seen.has(token)) continue
            seen.add(token)
            tokens.push(token)
        }
    }

    return tokens.length > 0 ? tokens.join(' ') : undefined
}

function parseImageAttrsFromElement(el: Element): Record<string, unknown> | null {
    const src = el.getAttribute('src') ?? ''
    if (!src) return null
    const attrs: Record<string, unknown> = {
        src,
        alt: el.getAttribute('alt') ?? '',
    }
    const className = el.getAttribute('class')
    if (className) attrs.class = className
    const widthPercent = parseWidthPercentFromElement(el)
    if (typeof widthPercent === 'number') attrs.widthPercent = widthPercent
    const caption = (el.getAttribute('data-caption') ?? el.getAttribute('title') ?? '').trim()
    if (caption) {
        attrs.caption = caption
        attrs.title = caption
    }
    return attrs
}

function findDescendantElementByTag(root: Element, tagName: string): Element | null {
    const normalizedTag = tagName.toLowerCase()
    const queue = Array.from(root.children)

    while (queue.length > 0) {
        const current = queue.shift()
        if (!current) continue
        const currentTag = current.tagName.toLowerCase()
        if (currentTag === normalizedTag) return current
        if (currentTag === 'figcaption') continue
        queue.push(...Array.from(current.children))
    }

    return null
}

function parseFigureElement(el: Element): EpubNode[] {
    const imageElement = findDescendantElementByTag(el, 'img')
    if (!imageElement) {
        const fallback = parseBlockChildren(el)
        return fallback.length > 0 ? fallback : []
    }

    const attrs = parseImageAttrsFromElement(imageElement)
    if (!attrs) return []

    const figureClass = el.getAttribute('class')
    const mergedClassName = mergeImageClassTokens(
        typeof attrs.class === 'string' ? attrs.class : null,
        figureClass,
    )
    if (mergedClassName) {
        attrs.class = mergedClassName
    } else {
        delete attrs.class
    }
    const figureWidthPercent = parseWidthPercentFromElement(el)
    if (typeof figureWidthPercent === 'number') attrs.widthPercent = figureWidthPercent

    const figcaptionElement = findDescendantElementByTag(el, 'figcaption')
    if (figcaptionElement) {
        const caption = (figcaptionElement.textContent ?? '').trim()
        if (caption) {
            attrs.caption = caption
            attrs.title = caption
        }
    }

    return [{ type: 'image', attrs }]
}

function parseBookImageFrameElement(el: Element): EpubNode[] {
    const imageElement = findDescendantElementByTag(el, 'img')
    if (!imageElement) return []

    const attrs = parseImageAttrsFromElement(imageElement)
    if (!attrs) return []

    const wrapperClass = el.getAttribute('class')
    const mergedClassName = mergeImageClassTokens(
        typeof attrs.class === 'string' ? attrs.class : null,
        wrapperClass,
    )
    if (mergedClassName) {
        attrs.class = mergedClassName
    } else {
        delete attrs.class
    }

    const wrapperWidthPercent = parseWidthPercentFromElement(el)
    if (typeof wrapperWidthPercent === 'number') attrs.widthPercent = wrapperWidthPercent

    const captionElement = Array.from(el.children).find((child) => {
        const tag = child.tagName.toLowerCase()
        return (tag === 'p' || tag === 'div') && normalizeClassTokens(child.getAttribute('class')).includes('book-image-caption')
    })
    if (captionElement) {
        const caption = (captionElement.textContent ?? '').trim()
        if (caption) {
            attrs.caption = caption
            attrs.title = caption
        }
    }

    return [{ type: 'image', attrs }]
}

function parseTableCell(el: Element, colgroupWidths: number[], startCol: number): EpubNode {
    const type = el.tagName.toLowerCase() === 'th' ? 'tableHeader' : 'tableCell'
    const content = parseBlockChildren(el)
    const attrs: Record<string, unknown> = {}

    const colspan = Number(el.getAttribute('colspan') ?? '1')
    const rowspan = Number(el.getAttribute('rowspan') ?? '1')
    if (Number.isFinite(colspan) && colspan > 1) attrs.colspan = colspan
    if (Number.isFinite(rowspan) && rowspan > 1) attrs.rowspan = rowspan
    const colwidthRaw = el.getAttribute('colwidth')
    if (colwidthRaw) {
        const parsed = colwidthRaw
            .split(',')
            .map((value) => Number(value.trim()))
            .filter((value) => Number.isFinite(value) && value > 0)
        if (parsed.length > 0) attrs.colwidth = parsed
    }

    if (!attrs.colwidth) {
        const colspan = Math.max(1, Number(attrs.colspan ?? 1))
        const fallback = colgroupWidths.slice(startCol, startCol + colspan)
        const fallbackColwidth = Array.from({ length: colspan }, (_, index) => fallback[index] ?? 0)
        if (fallbackColwidth.some((value) => value > 0)) {
            attrs.colwidth = fallbackColwidth
        }
    }

    const node: EpubNode = { type, content: content.length > 0 ? content : [{ type: 'paragraph' }] }
    if (Object.keys(attrs).length > 0) node.attrs = attrs
    return node
}

function parseTableRow(rowEl: Element, colgroupWidths: number[]): EpubNode {
    let startCol = 0
    const cells = Array.from(rowEl.children)
        .filter((child) => {
            const tag = child.tagName.toLowerCase()
            return tag === 'td' || tag === 'th'
        })
        .map((cell) => {
            const parsedCell = parseTableCell(cell, colgroupWidths, startCol)
            const colspan = Math.max(1, Number(parsedCell.attrs?.colspan ?? 1))
            startCol += colspan
            return parsedCell
        })

    return {
        type: 'tableRow',
        content: cells.length > 0 ? cells : [{ type: 'tableCell', content: [{ type: 'paragraph' }] }],
    }
}

function parseColgroupWidths(tableEl: Element): number[] {
    const colgroup = Array.from(tableEl.children).find((node) => node.tagName.toLowerCase() === 'colgroup')
    if (!colgroup) return []

    const toPositiveWidth = (raw: string | null): number => {
        if (!raw) return 0
        const normalized = raw.trim()
        const fromAttr = Number(normalized)
        if (Number.isFinite(fromAttr) && fromAttr > 0) return fromAttr

        const pxMatch = normalized.match(/([0-9]+(?:\.[0-9]+)?)\s*px/)
        const numberMatch = normalized.match(/([0-9]+(?:\.[0-9]+)?)/)
        const matched = pxMatch ?? numberMatch
        if (!matched) return 0
        const parsed = Number(matched[1])
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
    }

    return Array.from(colgroup.children).map((col) => {
        const widthAttr = col.getAttribute('width')
        const styleAttr = col.getAttribute('style')
        return toPositiveWidth(widthAttr ?? styleAttr)
    })
}

function parseListItem(liEl: Element): EpubNode {
    const content = parseBlockChildren(liEl)
    return {
        type: 'listItem',
        content: content.length > 0 ? content : [{ type: 'paragraph' }],
    }
}

function parseList(el: Element): EpubNode {
    const ordered = el.tagName.toLowerCase() === 'ol'
    const items = Array.from(el.children)
        .filter((child) => child.tagName.toLowerCase() === 'li')
        .map((li) => parseListItem(li))

    const node: EpubNode = {
        type: ordered ? 'orderedList' : 'bulletList',
        content: items,
    }

    if (ordered) {
        const start = Number(el.getAttribute('start') ?? '1')
        if (Number.isFinite(start) && start > 1) {
            node.attrs = { start }
        }
    } else {
        const className = el.getAttribute('class')
        if (className) {
            node.attrs = { class: className }
        }
    }

    return node
}

function parseTable(tableEl: Element): EpubNode {
    const colgroupWidths = parseColgroupWidths(tableEl)
    const rows: EpubNode[] = []
    for (const child of Array.from(tableEl.children)) {
        const tag = child.tagName.toLowerCase()
        if (tag === 'tr') {
            rows.push(parseTableRow(child, colgroupWidths))
            continue
        }
        if (tag === 'thead' || tag === 'tbody' || tag === 'tfoot') {
            for (const row of Array.from(child.children)) {
                if (row.tagName.toLowerCase() === 'tr') {
                    rows.push(parseTableRow(row, colgroupWidths))
                }
            }
        }
    }

    const node: EpubNode = {
        type: 'table',
        content: rows.length > 0 ? rows : [{ type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'paragraph' }] }] }],
    }
    const className = tableEl.getAttribute('class')
    const dataBlockFont = tableEl.getAttribute('data-block-font')
    const attrs: Record<string, string> = {}
    if (className) attrs.class = className
    if (dataBlockFont === 'serif' || dataBlockFont === 'sans') attrs.dataBlockFont = dataBlockFont
    if (Object.keys(attrs).length > 0) node.attrs = attrs
    return node
}

function parseBlockElement(el: Element): EpubNode[] {
    const tag = el.tagName.toLowerCase()

    if (/^h[1-6]$/.test(tag)) {
        const level = Math.max(1, Math.min(Number(tag[1]), 6))
        const content = parseInlineNodes(Array.from(el.childNodes))
        return [
            {
                type: 'heading',
                attrs: { level },
                ...(content.length > 0 ? { content } : {}),
            },
        ]
    }

    if (tag === 'p') {
        const content = parseInlineNodes(Array.from(el.childNodes))
        const attrs = paragraphAttrs(el)
        return [
            {
                type: 'paragraph',
                ...(attrs ? { attrs } : {}),
                ...(content.length > 0 ? { content } : {}),
            },
        ]
    }

    if (tag === 'blockquote') {
        const inner = parseBlockChildren(el)
        const className = el.getAttribute('class')
        const attrs = className ? { class: className } : undefined
        return [
            {
                type: 'blockquote',
                ...(attrs ? { attrs } : {}),
                content: inner.length > 0 ? inner : [{ type: 'paragraph' }],
            },
        ]
    }

    if (tag === 'hr') {
        const className = el.getAttribute('class')
        return [{ type: 'horizontalRule', ...(className ? { attrs: { class: className } } : {}) }]
    }

    if (tag === 'img') {
        const attrs = parseImageAttrsFromElement(el)
        return attrs ? [{ type: 'image', attrs }] : []
    }

    if (tag === 'figure') {
        return parseFigureElement(el)
    }

    if (
        tag === 'div' &&
        normalizeClassTokens(el.getAttribute('class')).includes('book-image-frame') &&
        findDescendantElementByTag(el, 'img')
    ) {
        return parseBookImageFrameElement(el)
    }

    if (tag === 'ul' || tag === 'ol') {
        return [parseList(el)]
    }

    if (tag === 'table') {
        return [parseTable(el)]
    }

    if (tag === 'li') {
        return [parseListItem(el)]
    }

    if (tag === 'div' || tag === 'section' || tag === 'article') {
        const blocks = parseBlockChildren(el)
        if (blocks.length > 0) return blocks
        return [parseParagraphFromInlineNodes(Array.from(el.childNodes))]
    }

    if (isInlineElement(el)) {
        return [parseParagraphFromInlineNodes([el])]
    }

    const fallback = parseBlockChildren(el)
    return fallback.length > 0 ? fallback : [parseParagraphFromInlineNodes(Array.from(el.childNodes))]
}

function parseBlockChildren(container: Element): EpubNode[] {
    const blocks: EpubNode[] = []
    let inlineBuffer: ChildNode[] = []

    const flushInlineBuffer = () => {
        if (inlineBuffer.length === 0) return
        const inline = parseInlineNodes(inlineBuffer)
        if (inline.length > 0) blocks.push({ type: 'paragraph', content: inline })
        inlineBuffer = []
    }

    for (const child of Array.from(container.childNodes)) {
        if (child.nodeType === Node.TEXT_NODE) {
            const value = child.textContent ?? ''
            if (value.trim().length > 0) {
                inlineBuffer.push(child)
            }
            continue
        }

        if (child.nodeType !== Node.ELEMENT_NODE) continue
        const el = child as Element
        if (isInlineElement(el)) {
            inlineBuffer.push(child)
            continue
        }

        flushInlineBuffer()
        blocks.push(...parseBlockElement(el))
    }

    flushInlineBuffer()
    return blocks
}

function parseBody(body: Element): EpubNode {
    const content = parseBlockChildren(body)
    return { type: 'doc', content: content.length > 0 ? content : [{ type: 'paragraph' }] }
}

function titleFromPath(path: string) {
    const fileName = path.split('/').pop() ?? path
    return fileName.replace(/\.[^.]+$/, '')
}

function normalizePath(path: string): string {
    const cleaned = path.replace(/\\/g, '/')
    const parts = cleaned.split('/')
    const stack: string[] = []
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

function dirname(path: string): string {
    const normalized = normalizePath(path)
    const idx = normalized.lastIndexOf('/')
    return idx === -1 ? '' : normalized.slice(0, idx)
}

function resolveHref(baseDir: string, href: string): string {
    if (!href) return ''
    if (href.startsWith('/')) return normalizePath(href.slice(1))
    return normalizePath(baseDir ? `${baseDir}/${href}` : href)
}

function stripFragmentAndQuery(href: string): string {
    return href.replace(/[?#].*$/, '')
}

function isExternalUrl(src: string): boolean {
    return /^(https?:)?\/\//i.test(src) || /^file:/i.test(src)
}

function guessMimeType(path: string): string {
    const lower = path.toLowerCase()
    if (lower.endsWith('.png')) return 'image/png'
    if (lower.endsWith('.gif')) return 'image/gif'
    if (lower.endsWith('.webp')) return 'image/webp'
    if (lower.endsWith('.svg')) return 'image/svg+xml'
    if (lower.endsWith('.bmp')) return 'image/bmp'
    if (lower.endsWith('.avif')) return 'image/avif'
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
    return 'application/octet-stream'
}

async function uint8ToDataUrl(bytes: Uint8Array, mimeType: string): Promise<string> {
    return await new Promise<string>((resolve, reject) => {
        const blob = new Blob([bytes], { type: mimeType })
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result ?? ''))
        reader.onerror = () => reject(reader.error ?? new Error(i18n.t('epubImporter.errors.imageConvertFailed')))
        reader.readAsDataURL(blob)
    })
}

function basename(path: string): string {
    const normalized = normalizePath(path)
    const idx = normalized.lastIndexOf('/')
    return idx === -1 ? normalized : normalized.slice(idx + 1)
}

function isNavDocumentPath(path: string): boolean {
    const name = basename(path).toLowerCase()
    return name === 'nav.xhtml' || name === 'toc.xhtml'
}

function mergeContentDocs(contents: JSONContent[]): EpubNode {
    const merged = contents.flatMap((content) => (Array.isArray(content.content) ? content.content : [])) as EpubNode[]
    return { type: 'doc', content: merged.length > 0 ? merged : [{ type: 'paragraph' }] }
}

async function resolveImageSource(
    src: string,
    chapterPath: string,
    zip: JSZip,
    mediaTypeByPath: Map<string, string>,
    cache: Map<string, string>,
): Promise<string> {
    if (!src) return src
    if (src.startsWith('data:')) return src
    if (isExternalUrl(src) || src.startsWith('#')) return src

    const cleanedSrc = stripFragmentAndQuery(src).trim()
    if (!cleanedSrc) return src

    const fullPath = resolveHref(dirname(chapterPath), cleanedSrc)
    if (!fullPath) return src

    const cacheHit = cache.get(fullPath)
    if (cacheHit) return cacheHit

    const candidatePaths = [fullPath]
    try {
        const decoded = decodeURIComponent(fullPath)
        if (!candidatePaths.includes(decoded)) candidatePaths.push(decoded)
    } catch {
        // noop
    }
    try {
        const encoded = encodeURI(fullPath)
        if (!candidatePaths.includes(encoded)) candidatePaths.push(encoded)
    } catch {
        // noop
    }

    const fileEntry =
        candidatePaths
            .map((p) => zip.file(p))
            .find((entry): entry is NonNullable<typeof entry> => Boolean(entry)) ?? null
    if (!fileEntry) return src

    const bytes = await fileEntry.async('uint8array')
    const normalizedEntryPath = normalizePath(fileEntry.name)
    const mimeType =
        mediaTypeByPath.get(normalizedEntryPath) ??
        mediaTypeByPath.get(fullPath) ??
        guessMimeType(normalizedEntryPath)
    const dataUrl = await uint8ToDataUrl(bytes, mimeType)
    cache.set(fullPath, dataUrl)
    return dataUrl
}

async function hydrateImageSources(
    contentDoc: EpubNode,
    chapterPath: string,
    zip: JSZip,
    mediaTypeByPath: Map<string, string>,
    cache: Map<string, string>,
) {
    const stack: EpubNode[] = [contentDoc]
    const imageNodes: EpubNode[] = []

    while (stack.length > 0) {
        const node = stack.pop()
        if (!node) continue
        if (node.type === 'image' && node.attrs?.src) imageNodes.push(node)
        for (const child of node.content ?? []) {
            stack.push(child)
        }
    }

    for (const imageNode of imageNodes) {
        const currentSrc = String(imageNode.attrs?.src ?? '')
        const resolvedSrc = await resolveImageSource(
            currentSrc,
            chapterPath,
            zip,
            mediaTypeByPath,
            cache,
        )
        if (resolvedSrc && resolvedSrc !== currentSrc) {
            imageNode.attrs = { ...(imageNode.attrs ?? {}), src: resolvedSrc }
        }
    }
}

export interface ImportEpubResult {
    chapters: Chapter[]
    metadata: Partial<BookMetadata>
    diagnostics: {
        tocSource: 'ncx' | 'nav' | 'heuristic' | 'spine-only'
        warnings: string[]
    }
}

export async function importEpub(file: ArrayBuffer): Promise<ImportEpubResult> {
    const zip = await JSZip.loadAsync(file)
    const packageInfo = await parseEpubPackageInfo(zip)
    const mediaTypeByPath = packageInfo.manifestMediaTypes
    const imageDataUrlCache = new Map<string, string>()
    const spineOrderedPaths = packageInfo.spinePaths
    const spineSet = new Set(spineOrderedPaths.map((p) => normalizePath(p)))

    const fallbackPaths = Object.values(zip.files)
        .map((entry) => entry.name)
        .filter((name) => /\.x?html$/i.test(name))
        .map((name) => normalizePath(name))
        .filter((name) => !isNavDocumentPath(name))
        .filter((name) => !spineSet.has(name))
        .sort((a, b) => a.localeCompare(b))

    const orderedPaths = [...spineOrderedPaths, ...fallbackPaths]
    const titleByPath = new Map<string, string>()
    const parsedContentByPath = new Map<string, EpubNode>()

    for (const path of orderedPaths) {
        const entry = zip.file(path)
        if (!entry) continue
        const xml = await entry.async('string')
        const doc = new DOMParser().parseFromString(xml, 'application/xhtml+xml')
        const body = doc.querySelector('body')
        const title = doc.querySelector('title')?.textContent?.trim() || titleFromPath(entry.name)
        const content = body ? parseBody(body) : { type: 'doc', content: [{ type: 'paragraph' }] }
        await hydrateImageSources(
            content,
            normalizePath(entry.name),
            zip,
            mediaTypeByPath,
            imageDataUrlCache,
        )
        titleByPath.set(normalizePath(entry.name), title)
        parsedContentByPath.set(normalizePath(entry.name), content)
    }

    const importPlan = buildEpubImportPlan({
        packageInfo,
        orderedPaths,
        titleByPath,
    })

    const keyToId = new Map<string, string>()
    const chapters: Chapter[] = importPlan.items.map((item, index) => {
        const id = crypto.randomUUID()
        keyToId.set(item.key, id)
        const mergedContent = mergeContentDocs(
            item.sourcePaths
                .map((path) => parsedContentByPath.get(path))
                .filter((content): content is EpubNode => Boolean(content)),
        )
        return {
            id,
            title: item.title,
            content: mergedContent,
            order: index,
            fileName: `${basename(item.sourcePaths[0] || item.title || id).replace(/\.[^.]+$/, '')}.xhtml`,
            chapterType: item.chapterType,
            chapterKind: item.chapterKind,
            parentId: null,
        }
    })

    for (let index = 0; index < chapters.length; index += 1) {
        const parentKey = importPlan.items[index]?.parentKey
        if (!parentKey) continue
        chapters[index].parentId = keyToId.get(parentKey) ?? null
    }

    return {
        chapters,
        metadata: importPlan.metadata,
        diagnostics: importPlan.diagnostics,
    }
}
