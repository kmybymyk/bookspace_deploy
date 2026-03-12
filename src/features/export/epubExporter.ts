import JSZip from 'jszip'
import { Chapter, BookMetadata, DesignSettings } from '../../types/project'
import type { JSONContent } from '@tiptap/core'
import { generateToc } from '../../utils/tocGenerator'
import {
    FontAsset,
    getFontFamilyByCategory,
    getContrastFontCssStack,
    getContrastFontFamily,
    getFontCssStack,
    getFontPresetByFamily,
} from '../design-panel/fontCatalog'
import { chapterTypeToLayoutSection } from '../design-panel/useDesignStore'
import epubBaseCss from './templates/epubBase.css?raw'
import i18n from '../../i18n'
import { isSupportedImageMime, normalizeImageMime } from '../../utils/imagePolicy'
import { buildSharedTableCss } from '../chapters/tableStylePolicy'
import { buildTableColgroupMarkup, getFirstRowColumnWidthsFromTable } from '../chapters/tableRenderHelpers'
import { sanitizeHref } from '../preview/uriSanitizer'
import { makeChapterHeadingAnchor } from '../../utils/anchor'

function escapeXml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;')
}

function chapterItemId(id: string) {
    return `ch-${id}`.replace(/[^a-zA-Z0-9_-]/g, '_')
}

function creatorRoleToMarcRelator(role: string): string {
    if (role === 'author') return 'aut'
    if (role === 'co-author') return 'aut'
    if (role === 'editor') return 'edt'
    if (role === 'translator') return 'trl'
    if (role === 'illustrator') return 'ill'
    if (role === 'narrator') return 'nrt'
    if (role === 'compiler') return 'com'
    if (role === 'adapter') return 'adp'
    return 'oth'
}

type ExportImage = {
    id: string
    fileName: string
    mediaType: string
    bytes: Uint8Array
}

type ExportFont = {
    id: string
    familyName: string
    fileName: string
    mediaType: string
    bytes: Uint8Array
    weight: number
    style: 'normal' | 'italic'
    format: FontAsset['format']
}

type ChapterXhtmlEntry = {
    chapter: Chapter
    xhtml: string
}

type TocTreeNode = {
    title: string
    href: string
    level: number
    children: TocTreeNode[]
}

type ExportAssetInfo = {
    mime: string
    fileName: string
}

type ExportEpubOptions = {
    version?: EpubExportVersion
}

const RECOMMENDED_HTML_FILE_BYTES = 200 * 1024
const MAX_HTML_FILE_BYTES = 300 * 1024
const MAX_HTML_FILE_COUNT = 300
const RECOMMENDED_FONT_COUNT = 10
const OPF_PREFIX = 'dcterms: http://purl.org/dc/terms/ marc: http://id.loc.gov/vocabulary/relators/'

function normalizeLanguage(value: string | undefined): string {
    const trimmed = value?.trim() ?? ''
    const normalized = trimmed
        .replace(/_/g, '-')
        .replace(/\s+/g, '-')
        .toLowerCase()
        .replace(/^-+|-+$/g, '')
    return normalized || 'ko'
}

function chapterTypeOf(chapter: Chapter) {
    return chapter.chapterType ?? 'chapter'
}

function chapterMatterType(chapter: Chapter): 'frontmatter' | 'bodymatter' | 'backmatter' {
    const type = chapterTypeOf(chapter)
    if (type === 'front') return 'frontmatter'
    if (type === 'back') return 'backmatter'
    return 'bodymatter'
}

function chapterKindSemanticType(chapterKind?: string): string[] {
    switch (chapterKind) {
        case 'part':
            return ['part']
        case 'chapter':
            return ['chapter']
        case 'copyright':
            return ['copyright-page']
        case 'dedication':
            return ['dedication']
        case 'epigraph':
            return ['epigraph']
        case 'foreword':
            return ['foreword']
        case 'introduction':
            return ['introduction']
        case 'preface':
            return ['preface']
        case 'prologue':
            return ['prologue']
        case 'title-page':
            return ['titlepage', 'halftitlepage']
        case 'epilogue':
            return ['epilogue']
        case 'afterword':
            return ['afterword']
        case 'bibliography':
            return ['bibliography']
        case 'acknowledgments':
            return ['acknowledgments']
        default:
            return []
    }
}

function chapterSectionEpubType(chapter: Chapter): string {
    const tokens = [chapterMatterType(chapter), ...chapterKindSemanticType(chapter.chapterKind)]
    return [...new Set(tokens)].join(' ')
}

function mimeToExt(mime: string): string {
    const normalized = mime.toLowerCase()
    if (normalized === 'image/jpeg' || normalized === 'image/jpg') return 'jpg'
    if (normalized === 'image/png') return 'png'
    if (normalized === 'image/gif') return 'gif'
    if (normalized === 'image/webp') return 'webp'
    if (normalized === 'image/svg+xml') return 'svg'
    return 'bin'
}

function normalizePublicationDate(value?: string): string | null {
    if (!value) return null
    const trimmed = value.trim()
    if (!trimmed) return null
    if (/^\d{4}(-\d{2}){0,2}$/.test(trimmed)) return trimmed
    const parsed = new Date(trimmed)
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10)
    return null
}

function resolveBookIdentifier(metadata: BookMetadata): string {
    const type = metadata.identifierType ?? 'isbn'
    const raw = (metadata.identifier ?? metadata.isbn ?? '').trim()
    if (!raw) return `urn:uuid:${crypto.randomUUID()}`
    if (type === 'uuid') {
        const normalized = raw.replace(/^urn:uuid:/i, '')
        return `urn:uuid:${normalized}`
    }
    return raw
}

function fontMediaType(format: FontAsset['format']) {
    if (format === 'woff2') return 'font/woff2'
    if (format === 'woff') return 'font/woff'
    if (format === 'opentype') return 'font/otf'
    return 'font/ttf'
}

function fontCssFormat(format: FontAsset['format']) {
    if (format === 'woff2') return 'woff2'
    if (format === 'woff') return 'woff'
    if (format === 'opentype') return 'opentype'
    return 'truetype'
}

async function loadFontBytes(publicPath: string): Promise<Uint8Array | null> {
    try {
        const relativePath = publicPath.startsWith('/') ? publicPath.slice(1) : publicPath
        const res = await fetch(relativePath)
        if (!res.ok) return null
        const buffer = await res.arrayBuffer()
        return new Uint8Array(buffer)
    } catch {
        return null
    }
}

async function extractEmbeddedFonts(settings: DesignSettings, chapters: Chapter[]): Promise<ExportFont[]> {
    if (settings.fontEmbedMode !== 'selected') return []
    const collectBaseFamilies = (baseFamily: string) => [
        baseFamily,
        getContrastFontFamily(baseFamily),
        getFontFamilyByCategory(baseFamily, 'myeongjo'),
        getFontFamilyByCategory(baseFamily, 'gothic'),
    ]
    const families = new Set<string>()
    const globalStyleFamilies = (['front', 'body', 'back'] as const).flatMap((section) => {
        const preset = settings.sectionTypography[section]
        return [
            preset.h1FontFamily,
            preset.h2FontFamily,
            preset.h3FontFamily,
            preset.h4FontFamily,
            preset.h5FontFamily,
            preset.h6FontFamily,
        ]
    })
    for (const family of globalStyleFamilies) {
        for (const expanded of collectBaseFamilies(family)) {
            families.add(expanded)
        }
    }
    for (const chapter of chapters) {
        const chapterFamilies = [chapter.fontFamily, chapter.subheadFontFamily, chapter.titleFontFamily].filter(
            (v): v is string => Boolean(v),
        )
        for (const chapterFamily of chapterFamilies) {
            for (const family of collectBaseFamilies(chapterFamily)) {
                families.add(family)
            }
        }
    }
    const presets = [...families]
        .map((family) => getFontPresetByFamily(family))
        .filter(
            (preset, index, arr): preset is NonNullable<typeof preset> =>
                Boolean(preset) && arr.findIndex((p) => p?.fontFamily === preset?.fontFamily) === index,
        )
    if (presets.length === 0) return []

    const loadedNested = await Promise.all(
        presets.map(async (preset) =>
            Promise.all(
                preset.embedAssets.map(async (asset, index) => {
                    const bytes = await loadFontBytes(asset.publicPath)
                    if (!bytes) return null
                    return {
                        id: `font-${preset.id}-${index + 1}`,
                        familyName: preset.fontFamily,
                        fileName: asset.fileName,
                        mediaType: fontMediaType(asset.format),
                        bytes,
                        weight: asset.weight,
                        style: asset.style,
                        format: asset.format,
                    } satisfies ExportFont
                }),
            ),
        ),
    )
    return loadedNested.flat().filter((item): item is ExportFont => item !== null)
}

function parseImageDataUrl(dataUrl: string): { mime: string; bytes: Uint8Array } | null {
    const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/)
    if (!match) return null
    const mime = normalizeImageMime(match[1])
    if (!isSupportedImageMime(mime)) return null
    const b64 = match[2]
    const binary = atob(b64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i)
    }
    return { mime, bytes }
}

function extractChapterImages(chapter: Chapter): { chapter: Chapter; images: ExportImage[] } {
    let imageIndex = 0
    const images: ExportImage[] = []

    const walk = (node: JSONContent | undefined): JSONContent | undefined => {
        if (!node || typeof node !== 'object') return node

        if (node.type === 'image' && typeof node.attrs?.src === 'string' && node.attrs.src.startsWith('data:')) {
            const parsed = parseImageDataUrl(node.attrs.src)
            if (!parsed) {
                throw new Error('지원하지 않는 본문 이미지 형식입니다. JPG/PNG/WEBP/GIF만 사용할 수 있습니다.')
            }

            const ext = mimeToExt(parsed.mime)
            imageIndex += 1
            const imageId = `${chapterItemId(chapter.id)}-img-${imageIndex}`
            const fileName = `${imageId}.${ext}`
            images.push({
                id: imageId,
                fileName,
                mediaType: parsed.mime,
                bytes: parsed.bytes,
            })
            return {
                ...node,
                attrs: {
                    ...node.attrs,
                    src: `../Images/${fileName}`,
                },
            }
        }

        if (Array.isArray(node.content)) {
            return {
                ...node,
                content: node.content.map((child: JSONContent) => walk(child) as JSONContent),
            }
        }
        return node
    }

    const content = chapter.content ? walk(chapter.content) : chapter.content
    return { chapter: { ...chapter, content }, images }
}

function headingAnchorBase(chapterId: string, title: string): string {
    return makeChapterHeadingAnchor(chapterId, title)
}

function buildHeadingAnchor(chapterId: string, title: string, counts: Map<string, number>): string {
    const base = headingAnchorBase(chapterId, title)
    if (counts.has(base)) {
        const count = (counts.get(base) ?? 0) + 1
        counts.set(base, count)
        return `${base}-${count}`
    }
    counts.set(base, 1)
    return base
}

function mergeClassTokens(...values: Array<string | null | undefined>): string {
    const tokens = values
        .flatMap((value) => String(value ?? '').split(/\s+/))
        .map((token) => token.trim())
        .filter(Boolean)
    return [...new Set(tokens)].join(' ')
}

function classAttr(...values: Array<string | null | undefined>): string {
    const className = mergeClassTokens(...values)
    return className ? ` class="${escapeXml(className)}"` : ''
}

function blockFontClassName(value: unknown): string {
    if (value === 'serif') return 'book-font-serif'
    if (value === 'sans') return 'book-font-sans'
    return ''
}

function renderInlineXhtml(nodes: JSONContent[] = [], version: EpubExportVersion): string {
    return nodes
        .map((c: JSONContent) => {
            if (c.type === 'hardBreak') return '<br/>'
            let t = escapeXml(c.text ?? '')
            if (c.marks) {
                for (const m of c.marks) {
                    if (m.type === 'bold') t = `<strong>${t}</strong>`
                    if (m.type === 'italic') t = `<em>${t}</em>`
                    if (m.type === 'underline') {
                        t = version === '2.0' ? `<span class="text-underline">${t}</span>` : `<u>${t}</u>`
                    }
                    if (m.type === 'strike') {
                        t = version === '2.0' ? `<span class="text-strike">${t}</span>` : `<s>${t}</s>`
                    }
                    if (m.type === 'superscript') t = `<sup>${t}</sup>`
                    if (m.type === 'subscript') t = `<sub>${t}</sub>`
                    if (m.type === 'link' && m.attrs?.href) {
                        const safeHref = sanitizeHref(String(m.attrs.href))
                        if (!safeHref) continue
                        const href = escapeXml(safeHref)
                        const cls = href.startsWith('#') ? ' class="note-ref"' : ''
                        t = `<a href="${href}"${cls}>${t}</a>`
                    }
                }
            }
            return t
        })
        .join('')
}

function normalizeImageWidthPercent(raw: unknown): number | null {
    const width = Number(raw)
    if (!Number.isFinite(width)) return null
    return Math.max(10, Math.min(100, Math.round(width)))
}

function renderNodeXhtml(
    node: JSONContent | undefined,
    options?: {
        chapterId: string
        headingAnchorCounts: Map<string, number>
        version: EpubExportVersion
    },
): string {
    if (!node || typeof node !== 'object') return ''
    const version = options?.version ?? '3.0'
    const blockFontClass = blockFontClassName(node.attrs?.dataBlockFont)
    switch (node.type) {
        case 'heading': {
            const lvl = node.attrs?.level ?? 1
            const plainText = (node.content ?? []).map((c: JSONContent) => c.text ?? '').join('').trim()
            const headingId =
                options && plainText
                    ? buildHeadingAnchor(options.chapterId, plainText, options.headingAnchorCounts)
                    : ''
            const idAttr = headingId ? ` id="${escapeXml(headingId)}"` : ''
            return `<h${lvl}${idAttr}${classAttr(node.attrs?.class, blockFontClass)}>${renderInlineXhtml(node.content ?? [], version)}</h${lvl}>`
        }
        case 'paragraph': {
            const idAttr = node.attrs?.id ? ` id="${escapeXml(node.attrs.id)}"` : ''
            return `<p${idAttr}${classAttr(node.attrs?.class, blockFontClass)}>${renderInlineXhtml(node.content ?? [], version) || '\u00a0'}</p>`
        }
        case 'blockquote': {
            const inner = (node.content ?? [])
                .map((n: JSONContent) => renderNodeXhtml(n, options))
                .join('')
            return `<blockquote${classAttr(node.attrs?.class, blockFontClass)}>${inner}</blockquote>`
        }
        case 'horizontalRule': {
            return `<hr${classAttr(node.attrs?.class)}/>`
        }
        case 'image': {
            const src = node.attrs?.src
            if (!src) return ''
            const classToken = typeof node.attrs?.class === 'string' ? node.attrs.class : ''
            const caption = String(node.attrs?.caption ?? node.attrs?.title ?? '').trim()
            const captionVisible = typeof node.attrs?.captionVisible === 'boolean' ? node.attrs.captionVisible : caption.length > 0
            const widthPercent = normalizeImageWidthPercent(node.attrs?.widthPercent)
            if (captionVisible && caption) {
                if (version === '2.0') {
                    const wrapperStyle = widthPercent ? ` style="width:${widthPercent}%;max-width:100%;margin:1em auto;"` : ''
                    return `<div${classAttr('book-image-frame', classToken)}${wrapperStyle}><img src="${escapeXml(src)}" alt="${escapeXml(node.attrs?.alt || '')}" title="${escapeXml(caption)}" style="width:100%;max-width:100%;height:auto;display:block;"/><p class="book-image-caption">${escapeXml(caption)}</p></div>`
                }
                const figureClass = classAttr('book-image-figure', classToken)
                const figureStyle = widthPercent ? ` style="width:${widthPercent}%;max-width:100%;"` : ''
                return `<figure${figureClass}${figureStyle}><img src="${escapeXml(src)}" alt="${escapeXml(node.attrs?.alt || '')}" title="${escapeXml(caption)}" style="width:100%;max-width:100%;height:auto;"/><figcaption>${escapeXml(caption)}</figcaption></figure>`
            }
            const style = widthPercent ? ` style="width:${widthPercent}%;max-width:100%;height:auto;"` : ''
            return `<img src="${escapeXml(src)}" alt="${escapeXml(node.attrs?.alt || '')}"${classAttr(classToken)}${style}/>`
        }
        case 'table': {
            const colgroup = buildTableColgroupMarkup(getFirstRowColumnWidthsFromTable(node))
            const rows = (node.content ?? [])
                .map((row: JSONContent) => renderNodeXhtml(row, options))
                .join('')
            return `<table${classAttr(node.attrs?.class, blockFontClass)}>${colgroup}<tbody>${rows}</tbody></table>`
        }
        case 'bulletList': {
            const items = (node.content ?? [])
                .map((item: JSONContent) => renderNodeXhtml(item, options))
                .join('')
            return `<ul${classAttr(node.attrs?.class)}>${items}</ul>`
        }
        case 'orderedList': {
            const start = Number(node.attrs?.start ?? 1)
            const startAttr = start > 1 ? ` start="${start}"` : ''
            const items = (node.content ?? [])
                .map((item: JSONContent) => renderNodeXhtml(item, options))
                .join('')
            return `<ol${startAttr}>${items}</ol>`
        }
        case 'listItem': {
            const inner = (node.content ?? [])
                .map((n: JSONContent) => renderNodeXhtml(n, options))
                .join('')
            return `<li>${inner}</li>`
        }
        case 'tableRow': {
            const cells = (node.content ?? [])
                .map((cell: JSONContent) => renderNodeXhtml(cell, options))
                .join('')
            return `<tr>${cells}</tr>`
        }
        case 'tableCell':
        case 'tableHeader': {
            const tag = node.type === 'tableHeader' ? 'th' : 'td'
            const colspan = Number(node.attrs?.colspan ?? 1)
            const rowspan = Number(node.attrs?.rowspan ?? 1)
            const colwidth = Array.isArray(node.attrs?.colwidth)
                ? node.attrs.colwidth
                    .map((value: unknown) => Number(value))
                    .filter((value: number) => Number.isFinite(value) && value > 0)
                : []
            const colspanAttr = colspan > 1 ? ` colspan="${colspan}"` : ''
            const rowspanAttr = rowspan > 1 ? ` rowspan="${rowspan}"` : ''
            const colwidthAttr = colwidth.length > 0 ? ` colwidth="${colwidth.join(',')}"` : ''
            const inner = (node.content ?? [])
                .map((n: JSONContent) => renderNodeXhtml(n, options))
                .join('')
            return `<${tag}${colspanAttr}${rowspanAttr}${colwidthAttr}>${inner || '\u00a0'}</${tag}>`
        }
        default:
            return ''
    }
}

function normalizeHexColor(value?: string): string | null {
    if (!value) return null
    const trimmed = value.trim()
    return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trimmed) ? trimmed : null
}

function resolveChapterDesign(chapter: Chapter, settings: DesignSettings) {
    const layoutSection = chapterTypeToLayoutSection(chapter.chapterType)
    const preset = settings.sectionTypography[layoutSection]
    const fontFamily = preset.h3FontFamily
    const subheadFontFamily = preset.h2FontFamily
    const titleFontFamily = preset.h1FontFamily
    return {
        fontFamily,
        subheadFontFamily,
        titleFontFamily,
        style1FontFamily: preset.h4FontFamily,
        style2FontFamily: preset.h5FontFamily,
        style3FontFamily: preset.h6FontFamily,
        bodyFontSize: preset.h3FontSize,
        subheadFontSize: preset.h2FontSize,
        titleFontSize: preset.h1FontSize,
        style1FontSize: preset.h4FontSize,
        style2FontSize: preset.h5FontSize,
        style3FontSize: preset.h6FontSize,
        chapterTitleAlign: settings.chapterTitleAlign,
        chapterTitleSpacing: settings.chapterTitleSpacing,
        chapterTitleDivider: settings.chapterTitleDivider,
    }
}

function tiptapToXhtml(
    chapter: Chapter,
    language: string,
    settings: DesignSettings,
    fallbackBackground: string,
    version: EpubExportVersion,
): string {
    const nodes = chapter.content?.content ?? []
    const headingAnchorCounts = new Map<string, number>()
    const body = nodes
        .map((node: JSONContent) =>
            renderNodeXhtml(node, {
                chapterId: chapter.id,
                headingAnchorCounts,
                version,
            }),
        )
        .join('\n')
    const chapterBackground = normalizeHexColor(chapter.pageBackgroundColor) ?? normalizeHexColor(fallbackBackground) ?? '#ffffff'
    const bodyStyle = ` style="background-color: ${escapeXml(chapterBackground)};"`
    const design = resolveChapterDesign(chapter, settings)
    const fontStack = getFontCssStack(design.fontFamily)
    const contrastFontStack = getContrastFontCssStack(design.fontFamily)
    const serifFontStack = getFontCssStack('Noto Serif KR')
    const sansFontStack = getFontCssStack('Pretendard')
    const subheadFontStack = getFontCssStack(design.subheadFontFamily)
    const titleFontStack = getFontCssStack(design.titleFontFamily)
    const style1FontStack = getFontCssStack(design.style1FontFamily)
    const style2FontStack = getFontCssStack(design.style2FontFamily)
    const style3FontStack = getFontCssStack(design.style3FontFamily)
    const sectionEpubType = chapterSectionEpubType(chapter)
    const chapterCss = `
body {
  font-family: ${fontStack};
  font-size: 1em;
  line-height: ${settings.lineHeight}em;
}
h1 {
  text-align: ${design.chapterTitleAlign};
  margin-bottom: ${design.chapterTitleSpacing}em;
  font-size: ${(design.titleFontSize / Math.max(design.bodyFontSize, 1)).toFixed(4)}em;
  font-family: ${titleFontStack};
  border-bottom: ${design.chapterTitleDivider ? '1px solid #e5e7eb' : '0'};
  padding-bottom: ${design.chapterTitleDivider ? '0.45em' : '0'};
}
h2 {
  font-size: ${(design.subheadFontSize / Math.max(design.bodyFontSize, 1)).toFixed(4)}em;
  font-family: ${subheadFontStack};
}
h3 { font-size: 1em; font-family: ${fontStack}; }
h4 { font-size: ${(design.style1FontSize / Math.max(design.bodyFontSize, 1)).toFixed(4)}em; font-family: ${style1FontStack}; }
h5 { font-size: ${(design.style2FontSize / Math.max(design.bodyFontSize, 1)).toFixed(4)}em; font-family: ${style2FontStack}; }
h6 { font-size: ${(design.style3FontSize / Math.max(design.bodyFontSize, 1)).toFixed(4)}em; font-family: ${style3FontStack}; }
sup, sub { font-family: ${contrastFontStack}; }
.book-font-serif { font-family: ${serifFontStack} !important; }
.book-font-sans { font-family: ${sansFontStack} !important; }
.text-underline { text-decoration: underline; }
.text-strike { text-decoration: line-through; }
`.trim()

    if (version === '2.0') {
        return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${escapeXml(language)}" lang="${escapeXml(language)}">
<head>
  <title>${escapeXml(chapter.title)}</title>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
  <link rel="stylesheet" type="text/css" href="../styles/style.css"/>
  <style type="text/css">${chapterCss}</style>
</head>
<body${bodyStyle}>
<div${classAttr('book-section', chapterSectionEpubType(chapter).replace(/\s+/g, '-'))}>
<h1>${escapeXml(chapter.title)}</h1>
${body}
</div>
</body>
</html>`
    }

    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${escapeXml(language)}" lang="${escapeXml(language)}">
<head>
  <meta charset="UTF-8"/>
  <title>${escapeXml(chapter.title)}</title>
  <link rel="stylesheet" type="text/css" href="../styles/style.css"/>
  <style>${chapterCss}</style>
</head>
<body${bodyStyle}>
<section epub:type="${escapeXml(sectionEpubType)}">
<h1>${escapeXml(chapter.title)}</h1>
${body}
</section>
</body>
</html>`
}

function buildTocTree(items: { title: string; href: string; level: number }[]): TocTreeNode[] {
    const roots: TocTreeNode[] = []
    const stack: TocTreeNode[] = []
    for (const item of items) {
        const node: TocTreeNode = {
            title: item.title,
            href: item.href,
            level: item.level,
            children: [],
        }
        while (stack.length > 0 && stack[stack.length - 1].level >= node.level) {
            stack.pop()
        }
        if (stack.length === 0) {
            roots.push(node)
        } else {
            stack[stack.length - 1].children.push(node)
        }
        stack.push(node)
    }
    return roots
}

function renderTocTree(nodes: TocTreeNode[]): string {
    return nodes
        .map((node) => {
            const nested = node.children.length > 0 ? `<ol>${renderTocTree(node.children)}</ol>` : ''
            return `<li><a href="${escapeXml(node.href)}">${escapeXml(node.title)}</a>${nested}</li>`
        })
        .join('')
}

function remapTocTreeHrefs(nodes: TocTreeNode[], hrefMapper: (href: string) => string): TocTreeNode[] {
    return nodes.map((node) => ({
        ...node,
        href: hrefMapper(node.href),
        children: remapTocTreeHrefs(node.children, hrefMapper),
    }))
}

function validateEpubPackagingPolicy(
    chapterEntries: ChapterXhtmlEntry[],
    embeddedFonts: ExportFont[],
): string[] {
    const warnings: string[] = []
    if (chapterEntries.length >= MAX_HTML_FILE_COUNT) {
        warnings.push(`HTML chapter count is high (${chapterEntries.length}/${MAX_HTML_FILE_COUNT}).`)
        console.warn(
            `[EPUB] HTML chapter count is high (${chapterEntries.length}). Kyobo guide recommends under ${MAX_HTML_FILE_COUNT}.`,
        )
    }

    for (const entry of chapterEntries) {
        if (!/^[a-zA-Z0-9_-]+\.(xhtml|html)$/.test(entry.chapter.fileName)) {
            throw new Error(
                `HTML 파일명 정책 위반: ${entry.chapter.fileName} (영문/숫자/언더바/하이픈만 허용)`,
            )
        }
        const bytes = new TextEncoder().encode(entry.xhtml).length
        if (bytes > MAX_HTML_FILE_BYTES) {
            throw new Error(
                `HTML 용량 초과: ${entry.chapter.fileName} (${bytes} bytes, max ${MAX_HTML_FILE_BYTES} bytes)`,
            )
        }
        if (bytes > RECOMMENDED_HTML_FILE_BYTES) {
            warnings.push(
                `Large HTML file: ${entry.chapter.fileName} (${bytes} bytes > ${RECOMMENDED_HTML_FILE_BYTES} bytes recommended).`,
            )
            console.warn(
                `[EPUB] HTML file is large: ${entry.chapter.fileName} (${bytes} bytes). Recommended under ${RECOMMENDED_HTML_FILE_BYTES} bytes.`,
            )
        }
    }

    if (embeddedFonts.length > RECOMMENDED_FONT_COUNT) {
        warnings.push(`Embedded font count is high (${embeddedFonts.length}/${RECOMMENDED_FONT_COUNT}).`)
        console.warn(
            `[EPUB] Embedded font count is high (${embeddedFonts.length}). Kyobo guide recommends ${RECOMMENDED_FONT_COUNT} or fewer.`,
        )
    }
    return warnings
}

export async function exportEpub(
    chapters: Chapter[],
    metadata: BookMetadata,
    settings: DesignSettings,
    options: ExportEpubOptions = {},
): Promise<{ blob: Blob; warnings: string[] }> {
    const version = options.version ?? '3.0'
    const language = normalizeLanguage(metadata.language)
    const zip = new JSZip()
    const embeddedFonts = await extractEmbeddedFonts(settings, chapters)
    const css = generateCss(settings, embeddedFonts)
    const toc = generateToc(chapters)
    const chapterExports = chapters.map((chapter) => extractChapterImages(chapter))
    const normalizedChapters = chapterExports.map((item) => item.chapter)
    const chapterImages = chapterExports.flatMap((item) => item.images)
    const chapterXhtmlEntries = normalizedChapters.map((chapter) => ({
        chapter,
        xhtml: tiptapToXhtml(chapter, language, settings, '#ffffff', version),
    }))
    const packagingWarnings = validateEpubPackagingPolicy(chapterXhtmlEntries, embeddedFonts)
    const contributors =
        metadata.authors && metadata.authors.length > 0
            ? metadata.authors
            : [{ id: 'default-author', name: '', role: 'author' as const }]

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
    zip.file('OEBPS/styles/style.css', css)

    for (const entry of chapterXhtmlEntries) {
        zip.file(`OEBPS/Text/${entry.chapter.fileName}`, entry.xhtml)
    }
    for (const image of chapterImages) {
        zip.file(`OEBPS/Images/${image.fileName}`, image.bytes)
    }
    for (const font of embeddedFonts) {
        zip.file(`OEBPS/Fonts/${font.fileName}`, font.bytes)
    }

    const coverParsed = metadata.coverImage?.trim() ? parseImageDataUrl(metadata.coverImage.trim()) : null
    if (metadata.coverImage?.trim() && !coverParsed) {
        throw new Error('지원하지 않는 표지 이미지 형식입니다. JPG/PNG/WEBP/GIF만 사용할 수 있습니다.')
    }
    const coverInfo: ExportAssetInfo | null = coverParsed
        ? { mime: coverParsed.mime, fileName: `cover.${mimeToExt(coverParsed.mime)}` }
        : null
    if (coverParsed && coverInfo) {
        zip.file(`OEBPS/Images/${coverInfo.fileName}`, coverParsed.bytes)
        zip.file(
            'OEBPS/Text/cover.xhtml',
            version === '2.0'
                ? `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${escapeXml(language)}" lang="${escapeXml(language)}">
<head>
  <title>${escapeXml(i18n.t('epubExporter.cover.title'))}</title>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
  <style>body{margin:0;padding:0;} img{width:100%;height:auto;display:block;}</style>
</head>
<body>
  <img src="../Images/${escapeXml(coverInfo.fileName)}" alt="${escapeXml(i18n.t('epubExporter.cover.alt'))}"/>
</body>
</html>`
                : `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${escapeXml(language)}" lang="${escapeXml(language)}">
<head>
  <meta charset="UTF-8"/>
  <title>${escapeXml(i18n.t('epubExporter.cover.title'))}</title>
  <style>body{margin:0;padding:0;} img{width:100%;height:auto;display:block;}</style>
</head>
<body>
  <img src="../Images/${escapeXml(coverInfo.fileName)}" alt="${escapeXml(i18n.t('epubExporter.cover.alt'))}"/>
</body>
</html>`,
        )
    }

    const backCoverParsed = metadata.backCoverImage?.trim() ? parseImageDataUrl(metadata.backCoverImage.trim()) : null
    if (metadata.backCoverImage?.trim() && !backCoverParsed) {
        throw new Error('지원하지 않는 뒷표지 이미지 형식입니다. JPG/PNG/WEBP/GIF만 사용할 수 있습니다.')
    }
    const backCoverInfo: ExportAssetInfo | null = backCoverParsed
        ? { mime: backCoverParsed.mime, fileName: `back-cover.${mimeToExt(backCoverParsed.mime)}` }
        : null
    if (backCoverParsed && backCoverInfo) {
        zip.file(`OEBPS/Images/${backCoverInfo.fileName}`, backCoverParsed.bytes)
        zip.file(
            'OEBPS/Text/back-cover.xhtml',
            version === '2.0'
                ? `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${escapeXml(language)}" lang="${escapeXml(language)}">
<head>
  <title>${escapeXml(i18n.t('epubExporter.backCover.title'))}</title>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
  <style>body{margin:0;padding:0;} img{width:100%;height:auto;display:block;}</style>
</head>
<body>
  <img src="../Images/${escapeXml(backCoverInfo.fileName)}" alt="${escapeXml(i18n.t('epubExporter.backCover.alt'))}"/>
</body>
</html>`
                : `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${escapeXml(language)}" lang="${escapeXml(language)}">
<head>
  <meta charset="UTF-8"/>
  <title>${escapeXml(i18n.t('epubExporter.backCover.title'))}</title>
  <style>body{margin:0;padding:0;} img{width:100%;height:auto;display:block;}</style>
</head>
<body>
  <img src="../Images/${escapeXml(backCoverInfo.fileName)}" alt="${escapeXml(i18n.t('epubExporter.backCover.alt'))}"/>
</body>
</html>`,
        )
    }

    const publisherLogoParsed = metadata.publisherLogo?.trim() ? parseImageDataUrl(metadata.publisherLogo.trim()) : null
    if (metadata.publisherLogo?.trim() && !publisherLogoParsed) {
        throw new Error('지원하지 않는 출판사 로고 이미지 형식입니다. JPG/PNG/WEBP/GIF만 사용할 수 있습니다.')
    }
    const publisherLogoInfo: ExportAssetInfo | null = publisherLogoParsed
        ? { mime: publisherLogoParsed.mime, fileName: `publisher-logo.${mimeToExt(publisherLogoParsed.mime)}` }
        : null
    if (publisherLogoParsed && publisherLogoInfo) {
        zip.file(`OEBPS/Images/${publisherLogoInfo.fileName}`, publisherLogoParsed.bytes)
    }

    const chapterManifestItems = normalizedChapters
        .map(
            (chapter) =>
                `<item id="${chapterItemId(chapter.id)}" href="Text/${escapeXml(chapter.fileName)}" media-type="application/xhtml+xml"/>`,
        )
        .join('\n    ')
    const imageManifestItems = chapterImages
        .map(
            (image) =>
                `<item id="${image.id}" href="Images/${escapeXml(image.fileName)}" media-type="${escapeXml(image.mediaType)}"/>`,
        )
        .join('\n    ')
    const fontManifestItems = embeddedFonts
        .map(
            (font) =>
                `<item id="${font.id}" href="Fonts/${escapeXml(font.fileName)}" media-type="${escapeXml(font.mediaType)}"/>`,
        )
        .join('\n    ')
    const manifestItems = [chapterManifestItems, imageManifestItems, fontManifestItems].filter(Boolean).join('\n    ')
    const spineItems = normalizedChapters.map((chapter) => `<itemref idref="${chapterItemId(chapter.id)}"/>`).join('\n    ')
    const publicationDate = normalizePublicationDate(metadata.publishDate)
    const bookIdentifier = resolveBookIdentifier(metadata)

    const coverManifestItemEpub2 = coverInfo
        ? [
            `<item id="cover-img" href="Images/${escapeXml(coverInfo.fileName)}" media-type="${escapeXml(coverInfo.mime)}"/>`,
            `<item id="cover-xhtml" href="Text/cover.xhtml" media-type="application/xhtml+xml"/>`,
        ].join('\n    ')
        : ''
    const coverManifestItemEpub3 = coverInfo
        ? [
            `<item id="cover-img" href="Images/${escapeXml(coverInfo.fileName)}" media-type="${escapeXml(coverInfo.mime)}" properties="cover-image"/>`,
            `<item id="cover-xhtml" href="Text/cover.xhtml" media-type="application/xhtml+xml"/>`,
        ].join('\n    ')
        : ''
    const backCoverManifestItem = backCoverInfo
        ? [
            `<item id="back-cover-img" href="Images/${escapeXml(backCoverInfo.fileName)}" media-type="${escapeXml(backCoverInfo.mime)}"/>`,
            `<item id="back-cover-xhtml" href="Text/back-cover.xhtml" media-type="application/xhtml+xml"/>`,
        ].join('\n    ')
        : ''
    const publisherLogoManifestItem = publisherLogoInfo
        ? `<item id="publisher-logo" href="Images/${escapeXml(publisherLogoInfo.fileName)}" media-type="${escapeXml(publisherLogoInfo.mime)}"/>`
        : ''

    const tocByChapter = new Map<string, typeof toc>()
    for (const item of toc) {
        if (!tocByChapter.has(item.chapterId)) tocByChapter.set(item.chapterId, [])
        tocByChapter.get(item.chapterId)?.push(item)
    }
    const chapterNavNodes = normalizedChapters.map((chapter) => {
        const headingTree = buildTocTree(
            (tocByChapter.get(chapter.id) ?? [])
                .filter((item) => item.level > 1)
                .map((item) => ({
                    title: item.title,
                    href: `Text/${chapter.fileName}#${item.anchor}`,
                    level: item.level,
                })),
        )
        return {
            title: chapter.title,
            href: `Text/${chapter.fileName}`,
            level: 1,
            children: headingTree,
        } satisfies TocTreeNode
    })
    const tocListMarkup = renderTocTree(chapterNavNodes)

    if (version === '2.0') {
        const tocXhtmlNodes = remapTocTreeHrefs(chapterNavNodes, (href) => href.replace(/^Text\//, ''))
        const tocXhtmlListMarkup = renderTocTree(tocXhtmlNodes)
        const creatorLines =
            contributors
                .filter((author) => (author.name ?? '').trim().length > 0)
                .map((author) => {
                    const elementName =
                        author.role === 'author' || author.role === 'co-author' ? 'dc:creator' : 'dc:contributor'
                    return `<${elementName} opf:role="${escapeXml(creatorRoleToMarcRelator(author.role))}" opf:file-as="${escapeXml(author.name)}">${escapeXml(author.name)}</${elementName}>`
                })
                .join('\n    ') || `<dc:creator>${escapeXml(i18n.t('epubExporter.unknownAuthor'))}</dc:creator>`
        const guideRefs = [
            '<reference type="toc" title="Contents" href="Text/toc.xhtml"/>',
            coverInfo ? '<reference type="cover" title="Cover" href="Text/cover.xhtml"/>' : '',
        ]
            .filter(Boolean)
            .join('\n    ')
        const navPointCounter = { value: 1 }
        const renderNcxNavPoints = (nodes: TocTreeNode[]): string =>
            nodes
                .map((node) => {
                    const playOrder = navPointCounter.value
                    navPointCounter.value += 1
                    const nested = node.children.length > 0 ? `\n    ${renderNcxNavPoints(node.children)}` : ''
                    return `<navPoint id="navPoint-${playOrder}" playOrder="${playOrder}">
      <navLabel><text>${escapeXml(node.title)}</text></navLabel>
      <content src="${escapeXml(node.href)}"/>${nested}
    </navPoint>`
                })
                .join('\n    ')

        zip.file(
            'OEBPS/Text/toc.xhtml',
            `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${escapeXml(language)}" lang="${escapeXml(language)}">
<head>
  <title>${escapeXml(i18n.t('epubExporter.toc.title'))}</title>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
  <link rel="stylesheet" type="text/css" href="../styles/style.css"/>
</head>
<body>
  <div class="book-toc">
    <h1>${escapeXml(i18n.t('epubExporter.toc.title'))}</h1>
    <ol>
      ${tocXhtmlListMarkup}
    </ol>
  </div>
</body>
</html>`,
        )
        zip.file(
            'OEBPS/toc.ncx',
            `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${escapeXml(bookIdentifier)}"/>
    <meta name="dtb:depth" content="2"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle>
    <text>${escapeXml(metadata.title || i18n.t('editor.untitled'))}</text>
  </docTitle>
  <navMap>
    ${renderNcxNavPoints(chapterNavNodes)}
  </navMap>
</ncx>`,
        )
        zip.file(
            'OEBPS/content.opf',
            `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="uid" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:title>${escapeXml(metadata.title || i18n.t('editor.untitled'))}</dc:title>
    ${metadata.subtitle ? `<dc:title>${escapeXml(metadata.subtitle)}</dc:title>` : ''}
    ${creatorLines}
    <dc:language>${escapeXml(language)}</dc:language>
    <dc:publisher>${escapeXml(metadata.publisher || '')}</dc:publisher>
    ${publicationDate ? `<dc:date>${escapeXml(publicationDate)}</dc:date>` : ''}
    <dc:identifier id="uid">${escapeXml(bookIdentifier)}</dc:identifier>
    ${metadata.description ? `<dc:description>${escapeXml(metadata.description)}</dc:description>` : ''}
    ${metadata.link ? `<dc:source>${escapeXml(metadata.link)}</dc:source>` : ''}
    ${coverInfo ? '<meta name="cover" content="cover-img"/>' : ''}
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="toc-xhtml" href="Text/toc.xhtml" media-type="application/xhtml+xml"/>
    <item id="css" href="styles/style.css" media-type="text/css"/>
    ${coverManifestItemEpub2 ? coverManifestItemEpub2 + '\n    ' : ''}${backCoverManifestItem ? backCoverManifestItem + '\n    ' : ''}${publisherLogoManifestItem ? publisherLogoManifestItem + '\n    ' : ''}${manifestItems}
  </manifest>
  <spine toc="ncx">
    ${coverInfo ? '<itemref idref="cover-xhtml" linear="no"/>' : ''}
    ${spineItems}
    ${backCoverInfo ? '\n    <itemref idref="back-cover-xhtml" linear="no"/>' : ''}
  </spine>
  <guide>
    ${guideRefs}
  </guide>
</package>`,
        )
    } else {
        const firstFront = normalizedChapters.find((chapter) => chapterTypeOf(chapter) === 'front')
        const firstTitlePage = normalizedChapters.find((chapter) => chapter.chapterKind === 'title-page')
        const firstBody = normalizedChapters.find((chapter) => {
            const type = chapterTypeOf(chapter)
            return type !== 'front' && type !== 'back'
        })
        const firstBack = normalizedChapters.find((chapter) => chapterTypeOf(chapter) === 'back')
        const landmarks: string[] = []
        if (coverInfo) landmarks.push(`<li><a href="Text/cover.xhtml" epub:type="cover">${escapeXml(i18n.t('epubExporter.landmarks.cover'))}</a></li>`)
        if (firstTitlePage) landmarks.push(`<li><a href="Text/${escapeXml(firstTitlePage.fileName)}" epub:type="titlepage">${escapeXml(i18n.t('epubExporter.landmarks.titlePage'))}</a></li>`)
        if (firstFront) landmarks.push(`<li><a href="Text/${escapeXml(firstFront.fileName)}" epub:type="frontmatter">${escapeXml(i18n.t('epubExporter.landmarks.front'))}</a></li>`)
        if (firstBody) landmarks.push(`<li><a href="Text/${escapeXml(firstBody.fileName)}" epub:type="bodymatter">${escapeXml(i18n.t('epubExporter.landmarks.body'))}</a></li>`)
        if (firstBack) landmarks.push(`<li><a href="Text/${escapeXml(firstBack.fileName)}" epub:type="backmatter">${escapeXml(i18n.t('epubExporter.landmarks.back'))}</a></li>`)
        const landmarksNav = landmarks.length
            ? `
  <nav epub:type="landmarks">
    <h2>${escapeXml(i18n.t('epubExporter.landmarks.title'))}</h2>
    <ol>
      ${landmarks.join('\n      ')}
    </ol>
  </nav>`
            : ''

        zip.file(
            'OEBPS/content.opf',
            `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" prefix="${OPF_PREFIX}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title id="main-title">${escapeXml(metadata.title || i18n.t('editor.untitled'))}</dc:title>
    ${metadata.subtitle ? `<meta refines="#main-title" property="title-type">main</meta>
    <dc:title id="sub-title">${escapeXml(metadata.subtitle)}</dc:title>
    <meta refines="#sub-title" property="title-type">subtitle</meta>` : ''}
    ${contributors
            .filter((author) => (author.name ?? '').trim().length > 0)
            .map((author, index) => {
                const isPrimaryCreator = author.role === 'author' || author.role === 'co-author'
                const creatorId = `${isPrimaryCreator ? 'creator' : 'contributor'}-${index + 1}`
                const elementName = isPrimaryCreator ? 'dc:creator' : 'dc:contributor'
                const roleCode = creatorRoleToMarcRelator(author.role)
                const roleLabel = author.role === 'other' ? author.customRole ?? i18n.t('epubExporter.roles.other') : author.role
                return `<${elementName} id="${creatorId}">${escapeXml(author.name)}</${elementName}>
    <meta refines="#${creatorId}" property="role" scheme="marc:relators">${escapeXml(roleCode)}</meta>
    <meta refines="#${creatorId}" property="display-seq">${index + 1}</meta>
    <meta refines="#${creatorId}" property="file-as">${escapeXml(author.name)}</meta>
    <meta refines="#${creatorId}" property="alternate-script">${escapeXml(roleLabel)}</meta>`
            })
            .join('\n    ') || `<dc:creator>${escapeXml(i18n.t('epubExporter.unknownAuthor'))}</dc:creator>`}
    <dc:language>${escapeXml(language)}</dc:language>
    <dc:publisher>${escapeXml(metadata.publisher || '')}</dc:publisher>
    ${publicationDate ? `<dc:date>${escapeXml(publicationDate)}</dc:date>` : ''}
    <dc:identifier id="uid">${escapeXml(bookIdentifier)}</dc:identifier>
    ${metadata.description ? `<dc:description>${escapeXml(metadata.description)}</dc:description>` : ''}
    ${metadata.link ? `<dc:source>${escapeXml(metadata.link)}</dc:source>` : ''}
    <meta property="dcterms:modified">${new Date().toISOString().slice(0, 19)}Z</meta>
    ${coverInfo ? '<meta name="cover" content="cover-img"/>' : ''}
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="css" href="styles/style.css" media-type="text/css"/>
    ${coverManifestItemEpub3 ? coverManifestItemEpub3 + '\n    ' : ''}${backCoverManifestItem ? backCoverManifestItem + '\n    ' : ''}${publisherLogoManifestItem ? publisherLogoManifestItem + '\n    ' : ''}${manifestItems}
  </manifest>
  <spine>
    ${coverInfo ? '<itemref idref="cover-xhtml" linear="no"/>' : ''}
    ${spineItems}
    ${backCoverInfo ? '\n    <itemref idref="back-cover-xhtml" linear="no"/>' : ''}
  </spine>
</package>`,
        )
        zip.file(
            'OEBPS/nav.xhtml',
            `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${escapeXml(language)}" lang="${escapeXml(language)}">
<head><meta charset="UTF-8"/><title>${escapeXml(i18n.t('epubExporter.toc.title'))}</title></head>
<body>
  <nav epub:type="toc">
    <h1>${escapeXml(i18n.t('epubExporter.toc.title'))}</h1>
    <ol>
      ${tocListMarkup}
    </ol>
  </nav>
  ${landmarksNav}
</body>
</html>`,
        )
    }

    return {
        blob: await zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' }),
        warnings: packagingWarnings,
    }
}

function generateCss(settings: DesignSettings, embeddedFonts: ExportFont[]): string {
    const preset = settings.sectionTypography.body
    const fontStack = getFontCssStack(preset.h3FontFamily)
    const contrastFontStack = getContrastFontCssStack(preset.h3FontFamily)
    const serifFontStack = getFontCssStack('Noto Serif KR')
    const sansFontStack = getFontCssStack('Pretendard')
    const h1FontStack = getFontCssStack(preset.h1FontFamily)
    const h2FontStack = getFontCssStack(preset.h2FontFamily)
    const h4FontStack = getFontCssStack(preset.h4FontFamily)
    const h5FontStack = getFontCssStack(preset.h5FontFamily)
    const h6FontStack = getFontCssStack(preset.h6FontFamily)
    const fontFaceCss = embeddedFonts
        .map(
            (font) => `
@font-face {
  font-family: '${font.familyName}';
  src: url('../Fonts/${font.fileName}') format('${fontCssFormat(font.format)}');
  font-style: ${font.style};
  font-weight: ${font.weight};
}`,
        )
        .join('\n')

    const dynamicCss = `
${fontFaceCss}
body {
  font-family: ${fontStack};
  font-size: 1em;
  line-height: ${settings.lineHeight}em;
  letter-spacing: ${settings.letterSpacing}em;
}
p {
  margin-bottom: ${settings.paragraphSpacing}em;
  text-indent: ${settings.textIndent}em;
}
h1 {
  font-size: ${(preset.h1FontSize / Math.max(preset.h3FontSize, 1)).toFixed(4)}em;
  font-family: ${h1FontStack};
  margin-top: 1.5em;
  text-align: ${settings.chapterTitleAlign};
  margin-bottom: ${settings.chapterTitleSpacing}em;
  border-bottom: ${settings.chapterTitleDivider ? '1px solid #e5e7eb' : '0'};
  padding-bottom: ${settings.chapterTitleDivider ? '0.45em' : '0'};
}
h2 { font-size: ${(preset.h2FontSize / Math.max(preset.h3FontSize, 1)).toFixed(4)}em; font-family: ${h2FontStack}; margin-top: 1.2em; }
h3 { font-size: 1em; font-family: ${fontStack}; }
h4 { font-size: ${(preset.h4FontSize / Math.max(preset.h3FontSize, 1)).toFixed(4)}em; font-family: ${h4FontStack}; }
h5 { font-size: ${(preset.h5FontSize / Math.max(preset.h3FontSize, 1)).toFixed(4)}em; font-family: ${h5FontStack}; }
h6 { font-size: ${(preset.h6FontSize / Math.max(preset.h3FontSize, 1)).toFixed(4)}em; font-family: ${h6FontStack}; }
sup, sub { font-family: ${contrastFontStack}; }
.book-font-serif { font-family: ${serifFontStack} !important; }
.book-font-sans { font-family: ${sansFontStack} !important; }
.text-underline { text-decoration: underline; }
.text-strike { text-decoration: line-through; }
blockquote { font-family: ${serifFontStack}; }
blockquote p { text-indent: 0 !important; }
blockquote::before, blockquote::after { font-family: ${serifFontStack}; }
${settings.suppressFirstParagraphIndent ? 'p:first-of-type { text-indent: 0; }' : ''}
img { max-width: ${settings.imageMaxWidth}%; }
figure.book-image-figure { margin: 1em auto; }
figure.book-image-figure img { display: block; width: 100%; max-width: 100%; height: auto; }
figure.book-image-figure figcaption { margin-top: 0.5em; text-indent: 0; font-size: 0.9em; line-height: 1.5; text-align: center; color: #4b5563; }
.book-image-frame { margin: 1em auto; }
.book-image-caption { margin-top: 0.5em; text-indent: 0; font-size: 0.9em; line-height: 1.5; text-align: center; color: #4b5563; }
ul, ol { margin: 0 0 ${settings.paragraphSpacing}em 1.4em; }
${buildSharedTableCss('body', sansFontStack, 'output')}
`.trim()

    return `${epubBaseCss}\n\n${dynamicCss}`
}
