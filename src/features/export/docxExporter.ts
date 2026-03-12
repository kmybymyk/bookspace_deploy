import type { JSONContent } from '@tiptap/core'
import JSZip from 'jszip'
import type { BookMetadata, Chapter, Contributor } from '../../types/project'

type DocxTranslate = (key: string, options?: Record<string, unknown>) => string

type RunStyle = {
    bold?: boolean
    italic?: boolean
    underline?: boolean
    strike?: boolean
    vertAlign?: 'superscript' | 'subscript'
    link?: string
}

type RunToken =
    | { type: 'text'; text: string; style: RunStyle }
    | { type: 'lineBreak' }
    | { type: 'image'; relId: string; widthEmu: number; heightEmu: number; alt: string }

type ParagraphSpec = {
    runs: RunToken[]
    styleId?: string
    align?: 'left' | 'center' | 'right'
    indentLeftTwip?: number
    numbering?: { numId: number; ilvl: number }
}

type TableCellSpec = {
    paragraphs: ParagraphSpec[]
    colspan?: number
    rowspan?: number
    isHeader?: boolean
}

type TableSpec = {
    rows: TableCellSpec[][]
}

type DocBlock =
    | { kind: 'paragraph'; paragraph: ParagraphSpec }
    | { kind: 'table'; table: TableSpec }

type EmbeddedImage = {
    relId: string
    target: string
    fileName: string
    contentType: string
    bytes: Uint8Array
}

type ExportContext = {
    images: EmbeddedImage[]
    nextImageId: number
    listInstances: Array<{ numId: number; ordered: boolean }>
    nextListNumId: number
    translate?: DocxTranslate
}

const PX_TO_EMU = 9525
const MAX_IMAGE_WIDTH_EMU = Math.round(6.2 * 914400) // page width minus margins
const SUPPORTED_IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/gif'])

function resolveTranslatedText(
    translate: DocxTranslate | undefined,
    key: string,
    defaultValue: string,
    options?: Record<string, unknown>,
): string {
    if (!translate) return defaultValue
    const translated = translate(key, { ...options, defaultValue })
    return typeof translated === 'string' && translated.length > 0 ? translated : defaultValue
}

function escapeXml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;')
}

function toIsoDate(value: string): string {
    const date = new Date(value)
    if (!Number.isNaN(date.getTime())) {
        return date.toISOString().replace(/\.\d{3}Z$/, 'Z')
    }
    return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
}

function contributorsText(authors: Contributor[] = []): string {
    const names = authors.map((author) => author.name.trim()).filter(Boolean)
    return names.length > 0 ? names.join(', ') : 'Unknown'
}

function chapterTypePriority(chapter: Chapter): number {
    const type = chapter.chapterType ?? 'chapter'
    if (type === 'front') return 0
    if (type === 'part') return 1
    if (type === 'chapter') return 2
    if (type === 'divider') return 3
    if (type === 'back') return 4
    return 5
}

function sortChapters(chapters: Chapter[]): Chapter[] {
    return [...chapters].sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order
        const byType = chapterTypePriority(a) - chapterTypePriority(b)
        if (byType !== 0) return byType
        return a.title.localeCompare(b.title, 'ko')
    })
}

function textRunXml(text: string, style: RunStyle): string {
    const escaped = escapeXml(text)
    const preserveSpace = /^\s|\s$/.test(text)
    const styleParts: string[] = []
    if (style.bold) styleParts.push('<w:b/>')
    if (style.italic) styleParts.push('<w:i/>')
    if (style.underline || style.link) styleParts.push('<w:u w:val="single"/>')
    if (style.strike) styleParts.push('<w:strike/>')
    if (style.vertAlign) styleParts.push(`<w:vertAlign w:val="${style.vertAlign}"/>`)
    if (style.link) styleParts.push('<w:color w:val="2F5496"/>')
    const rPr = styleParts.length > 0 ? `<w:rPr>${styleParts.join('')}</w:rPr>` : ''
    const t = preserveSpace ? `<w:t xml:space="preserve">${escaped}</w:t>` : `<w:t>${escaped}</w:t>`
    return `<w:r>${rPr}${t}</w:r>`
}

function imageRunXml(token: Extract<RunToken, { type: 'image' }>, drawingId: number): string {
    const docPrId = drawingId + 1000
    return `<w:r>
  <w:drawing>
    <wp:inline distT="0" distB="0" distL="0" distR="0">
      <wp:extent cx="${token.widthEmu}" cy="${token.heightEmu}"/>
      <wp:effectExtent l="0" t="0" r="0" b="0"/>
      <wp:docPr id="${docPrId}" name="Picture ${drawingId}" descr="${escapeXml(token.alt || 'image')}"/>
      <wp:cNvGraphicFramePr>
        <a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/>
      </wp:cNvGraphicFramePr>
      <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
        <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
          <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
            <pic:nvPicPr>
              <pic:cNvPr id="${drawingId}" name="Picture ${drawingId}"/>
              <pic:cNvPicPr/>
            </pic:nvPicPr>
            <pic:blipFill>
              <a:blip r:embed="${token.relId}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>
              <a:stretch><a:fillRect/></a:stretch>
            </pic:blipFill>
            <pic:spPr>
              <a:xfrm>
                <a:off x="0" y="0"/>
                <a:ext cx="${token.widthEmu}" cy="${token.heightEmu}"/>
              </a:xfrm>
              <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
            </pic:spPr>
          </pic:pic>
        </a:graphicData>
      </a:graphic>
    </wp:inline>
  </w:drawing>
</w:r>`
}

function runTokensToXml(tokens: RunToken[], drawIdRef: { value: number }): string {
    if (tokens.length === 0) {
        return '<w:r><w:t/></w:r>'
    }
    return tokens
        .map((token) => {
            if (token.type === 'lineBreak') return '<w:r><w:br/></w:r>'
            if (token.type === 'image') {
                drawIdRef.value += 1
                return imageRunXml(token, drawIdRef.value)
            }
            return textRunXml(token.text, token.style)
        })
        .join('')
}

function paragraphXml(paragraph: ParagraphSpec, drawIdRef: { value: number }): string {
    const props: string[] = []
    if (paragraph.styleId) props.push(`<w:pStyle w:val="${paragraph.styleId}"/>`)
    if (paragraph.align) {
        const map = paragraph.align === 'center' ? 'center' : paragraph.align === 'right' ? 'right' : 'left'
        props.push(`<w:jc w:val="${map}"/>`)
    }
    if (paragraph.indentLeftTwip && paragraph.indentLeftTwip > 0) {
        props.push(`<w:ind w:left="${Math.round(paragraph.indentLeftTwip)}"/>`)
    }
    if (paragraph.numbering) {
        const ilvl = Math.max(0, Math.min(8, Math.floor(paragraph.numbering.ilvl)))
        const numId = Math.max(1, Math.floor(paragraph.numbering.numId))
        props.push(`<w:numPr><w:ilvl w:val="${ilvl}"/><w:numId w:val="${numId}"/></w:numPr>`)
    }
    const pPr = props.length > 0 ? `<w:pPr>${props.join('')}</w:pPr>` : ''
    return `<w:p>${pPr}${runTokensToXml(paragraph.runs, drawIdRef)}</w:p>`
}

function tableXml(table: TableSpec, drawIdRef: { value: number }): string {
    if (table.rows.length === 0) {
        return ''
    }
    const maxCols = Math.max(...table.rows.map((row) => row.length), 1)
    const colWidth = Math.floor(9000 / maxCols)

    const rowsXml = table.rows
        .map((row) => {
            const cellsXml = row
                .map((cell) => {
                    const tcPrParts: string[] = [
                        `<w:tcW w:w="${colWidth}" w:type="dxa"/>`,
                        '<w:vAlign w:val="top"/>',
                    ]
                    if (cell.isHeader) {
                        tcPrParts.push('<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/>')
                    }
                    if (cell.colspan && cell.colspan > 1) {
                        tcPrParts.push(`<w:gridSpan w:val="${Math.floor(cell.colspan)}"/>`)
                    }
                    if (cell.rowspan && cell.rowspan > 1) {
                        tcPrParts.push(`<w:vMerge w:val="restart"/>`)
                    }
                    const paragraphs =
                        cell.paragraphs.length > 0
                            ? cell.paragraphs
                                .map((p) => paragraphXml(cell.isHeader ? asHeaderParagraph(p) : p, drawIdRef))
                                .join('')
                            : '<w:p><w:r><w:t/></w:r></w:p>'
                    return `<w:tc><w:tcPr>${tcPrParts.join('')}</w:tcPr>${paragraphs}</w:tc>`
                })
                .join('')
            return `<w:tr>${cellsXml}</w:tr>`
        })
        .join('')

    const gridXml = Array.from({ length: maxCols })
        .map(() => `<w:gridCol w:w="${colWidth}"/>`)
        .join('')

    return `<w:tbl>
  <w:tblPr>
    <w:tblW w:w="0" w:type="auto"/>
    <w:tblBorders>
      <w:top w:val="single" w:sz="8" w:space="0" w:color="BFBFBF"/>
      <w:left w:val="single" w:sz="8" w:space="0" w:color="BFBFBF"/>
      <w:bottom w:val="single" w:sz="8" w:space="0" w:color="BFBFBF"/>
      <w:right w:val="single" w:sz="8" w:space="0" w:color="BFBFBF"/>
      <w:insideH w:val="single" w:sz="6" w:space="0" w:color="D9D9D9"/>
      <w:insideV w:val="single" w:sz="6" w:space="0" w:color="D9D9D9"/>
    </w:tblBorders>
  </w:tblPr>
  <w:tblGrid>${gridXml}</w:tblGrid>
  ${rowsXml}
</w:tbl>`
}

function parseImageDataUrl(dataUrl: string): { mime: string; bytes: Uint8Array } | null {
    const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/)
    if (!match) return null
    const mime = match[1].toLowerCase()
    if (!SUPPORTED_IMAGE_MIME.has(mime)) return null
    const b64 = match[2]
    const binary = atob(b64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i)
    }
    return { mime, bytes }
}

function imageMimeToExtension(mime: string): string {
    if (mime === 'image/png') return 'png'
    if (mime === 'image/jpeg' || mime === 'image/jpg') return 'jpeg'
    if (mime === 'image/gif') return 'gif'
    return 'bin'
}

function imageMimeContentType(mime: string): string {
    if (mime === 'image/png') return 'image/png'
    if (mime === 'image/jpeg' || mime === 'image/jpg') return 'image/jpeg'
    if (mime === 'image/gif') return 'image/gif'
    return 'application/octet-stream'
}

function readPx(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase().replace(/px$/, '')
        const parsed = Number(normalized)
        if (Number.isFinite(parsed) && parsed > 0) return parsed
    }
    return null
}

function registerImageRun(node: JSONContent, context: ExportContext): RunToken | null {
    const src = typeof node.attrs?.src === 'string' ? node.attrs.src : ''
    if (!src.startsWith('data:')) return null

    const parsed = parseImageDataUrl(src)
    if (!parsed) return null

    context.nextImageId += 1
    const relId = `rIdImage${context.nextImageId}`
    const ext = imageMimeToExtension(parsed.mime)
    const fileName = `image-${context.nextImageId}.${ext}`
    const target = `media/${fileName}`

    context.images.push({
        relId,
        target,
        fileName,
        contentType: imageMimeContentType(parsed.mime),
        bytes: parsed.bytes,
    })

    const rawWidthPx = readPx(node.attrs?.width) ?? 480
    const rawHeightPx = readPx(node.attrs?.height) ?? 320
    const rawWidthEmu = Math.round(rawWidthPx * PX_TO_EMU)
    const rawHeightEmu = Math.round(rawHeightPx * PX_TO_EMU)
    const scale = rawWidthEmu > MAX_IMAGE_WIDTH_EMU ? MAX_IMAGE_WIDTH_EMU / rawWidthEmu : 1
    const finalWidthEmu = Math.max(120000, Math.round(rawWidthEmu * scale))
    const finalHeightEmu = Math.max(120000, Math.round(rawHeightEmu * scale))

    return {
        type: 'image',
        relId,
        widthEmu: finalWidthEmu,
        heightEmu: finalHeightEmu,
        alt: String(node.attrs?.alt ?? 'image'),
    }
}

function mergeStyle(base: RunStyle, extra: RunStyle): RunStyle {
    return {
        bold: base.bold || extra.bold,
        italic: base.italic || extra.italic,
        underline: base.underline || extra.underline,
        strike: base.strike || extra.strike,
        vertAlign: extra.vertAlign ?? base.vertAlign,
        link: extra.link ?? base.link,
    }
}

function marksToStyle(marks: JSONContent['marks']): RunStyle {
    const style: RunStyle = {}
    for (const mark of marks ?? []) {
        if (mark.type === 'bold') style.bold = true
        if (mark.type === 'italic') style.italic = true
        if (mark.type === 'underline') style.underline = true
        if (mark.type === 'strike') style.strike = true
        if (mark.type === 'superscript') style.vertAlign = 'superscript'
        if (mark.type === 'subscript') style.vertAlign = 'subscript'
        if (mark.type === 'link' && typeof mark.attrs?.href === 'string') {
            style.link = mark.attrs.href
        }
    }
    return style
}

function inlineRuns(nodes: JSONContent[] = [], inherited: RunStyle = {}): RunToken[] {
    const out: RunToken[] = []

    for (const node of nodes) {
        if (node.type === 'hardBreak') {
            out.push({ type: 'lineBreak' })
            continue
        }

        const nextStyle = mergeStyle(inherited, marksToStyle(node.marks))

        if (typeof node.text === 'string') {
            out.push({ type: 'text', text: node.text, style: nextStyle })
            continue
        }

        if (Array.isArray(node.content)) {
            out.push(...inlineRuns(node.content, nextStyle))
        }
    }

    return out
}

function plainInlineText(nodes: JSONContent[] = []): string {
    return nodes
        .map((node) => {
            if (typeof node.text === 'string') return node.text
            if (node.type === 'hardBreak') return '\n'
            if (Array.isArray(node.content)) return plainInlineText(node.content)
            return ''
        })
        .join('')
}

function paragraphFromInline(nodes: JSONContent[] = []): ParagraphSpec {
    const runs = inlineRuns(nodes)
    return { runs: runs.length > 0 ? runs : [{ type: 'text', text: '', style: {} }] }
}

function allocateListNumId(context: ExportContext, ordered: boolean): number {
    const numId = context.nextListNumId
    context.nextListNumId += 1
    context.listInstances.push({ numId, ordered })
    return numId
}

function listBlocks(
    node: JSONContent,
    ordered: boolean,
    context: ExportContext,
    depth = 0,
    numId = allocateListNumId(context, ordered),
): DocBlock[] {
    const blocks: DocBlock[] = []

    for (const item of node.content ?? []) {
        if (item.type !== 'listItem') continue

        const childNodes = item.content ?? []
        const paragraphs = childNodes.filter((n) => n.type === 'paragraph')
        const nested = childNodes.filter((n) => n.type === 'bulletList' || n.type === 'orderedList')

        for (const paragraph of paragraphs) {
            const runs: RunToken[] = inlineRuns(paragraph.content ?? [])
            blocks.push({
                kind: 'paragraph',
                paragraph: {
                    runs: runs.length > 0 ? runs : [{ type: 'text', text: '', style: {} }],
                    numbering: { numId, ilvl: depth },
                },
            })
        }

        for (const nestedList of nested) {
            const nestedOrdered = nestedList.type === 'orderedList'
            const nestedNumId = nestedOrdered === ordered ? numId : allocateListNumId(context, nestedOrdered)
            blocks.push(...listBlocks(nestedList, nestedOrdered, context, depth + 1, nestedNumId))
        }
    }

    return blocks
}

function asHeaderParagraph(paragraph: ParagraphSpec): ParagraphSpec {
    const runs = paragraph.runs.map((run) => {
        if (run.type !== 'text') return run
        return {
            ...run,
            style: { ...run.style, bold: true },
        }
    })
    return {
        ...paragraph,
        runs,
    }
}

function extractParagraphsFromBlocks(blocks: DocBlock[]): ParagraphSpec[] {
    const out: ParagraphSpec[] = []
    for (const block of blocks) {
        if (block.kind === 'paragraph') {
            out.push(block.paragraph)
            continue
        }
        // Keep table content readable when nested tables appear inside cells.
        for (const row of block.table.rows) {
            const text = row
                .map((cell) =>
                    cell.paragraphs
                        .map((p) =>
                            p.runs
                                .filter((run): run is Extract<RunToken, { type: 'text' }> => run.type === 'text')
                                .map((run) => run.text)
                                .join(''),
                        )
                        .join(' '),
                )
                .join(' | ')
            out.push({ runs: [{ type: 'text', text, style: {} }] })
        }
    }
    return out
}

function tableBlock(node: JSONContent, context: ExportContext): DocBlock | null {
    if (!Array.isArray(node.content) || node.content.length === 0) return null

    const rows: TableCellSpec[][] = []
    for (const row of node.content) {
        if (row.type !== 'tableRow') continue

        const cells: TableCellSpec[] = []
        for (const cell of row.content ?? []) {
            if (cell.type !== 'tableCell' && cell.type !== 'tableHeader') continue

            const childBlocks = (cell.content ?? []).flatMap((child) => nodeToBlocks(child, context))
            const paragraphs = extractParagraphsFromBlocks(childBlocks)

            cells.push({
                paragraphs: paragraphs.length > 0 ? paragraphs : [{ runs: [{ type: 'text', text: '', style: {} }] }],
                colspan: Number(cell.attrs?.colspan ?? 1) || undefined,
                rowspan: Number(cell.attrs?.rowspan ?? 1) || undefined,
                isHeader: cell.type === 'tableHeader',
            })
        }

        if (cells.length > 0) rows.push(cells)
    }

    if (rows.length === 0) return null
    return { kind: 'table', table: { rows } }
}

function nodeToBlocks(node: JSONContent, context: ExportContext): DocBlock[] {
    if (node.type === 'heading') {
        const level = Math.max(1, Math.min(Number(node.attrs?.level ?? 1), 6))
        return [
            {
                kind: 'paragraph',
                paragraph: {
                    styleId: `Heading${level}`,
                    runs: inlineRuns(node.content ?? []),
                },
            },
        ]
    }

    if (node.type === 'paragraph') {
        return [{ kind: 'paragraph', paragraph: paragraphFromInline(node.content ?? []) }]
    }

    if (node.type === 'blockquote') {
        const text = plainInlineText((node.content ?? []).flatMap((child) => child.content ?? []))
        return [
            {
                kind: 'paragraph',
                paragraph: {
                    runs: [{ type: 'text', text, style: {} }],
                    indentLeftTwip: 720,
                },
            },
        ]
    }

    if (node.type === 'horizontalRule') {
        return [
            {
                kind: 'paragraph',
                paragraph: {
                    runs: [{ type: 'text', text: '────────────', style: {} }],
                    align: 'center',
                },
            },
        ]
    }

    if (node.type === 'image') {
        const imageRun = registerImageRun(node, context)
        if (!imageRun) {
            return [
                {
                    kind: 'paragraph',
                    paragraph: {
                        runs: [{
                            type: 'text',
                            text: resolveTranslatedText(context.translate, 'docxExporter.fallbackImage', '[Image]'),
                            style: { italic: true },
                        }],
                    },
                },
            ]
        }
        return [
            {
                kind: 'paragraph',
                paragraph: {
                    runs: [imageRun],
                    align: 'center',
                },
            },
        ]
    }

    if (node.type === 'bulletList') {
        return listBlocks(node, false, context)
    }

    if (node.type === 'orderedList') {
        return listBlocks(node, true, context)
    }

    if (node.type === 'table') {
        const tbl = tableBlock(node, context)
        return tbl ? [tbl] : []
    }

    return []
}

function chapterToBlocks(chapter: Chapter, index: number, context: ExportContext): DocBlock[] {
    const blocks: DocBlock[] = []
    const title = chapter.title?.trim() || resolveTranslatedText(
        context.translate,
        'docxExporter.chapterTitleFallback',
        `Chapter ${index + 1}`,
        { index: index + 1 },
    )
    blocks.push({
        kind: 'paragraph',
        paragraph: {
            styleId: 'Heading1',
            runs: [{ type: 'text', text: title, style: {} }],
        },
    })

    for (const node of chapter.content?.content ?? []) {
        blocks.push(...nodeToBlocks(node, context))
    }

    blocks.push({ kind: 'paragraph', paragraph: { runs: [{ type: 'text', text: '', style: {} }] } })
    return blocks
}

function buildDocumentXml(metadata: BookMetadata, chapters: Chapter[], context: ExportContext): string {
    const sortedChapters = sortChapters(chapters)
    const blocks: DocBlock[] = []

    if (metadata.title?.trim()) {
        blocks.push({
            kind: 'paragraph',
            paragraph: {
                styleId: 'Heading1',
                runs: [{ type: 'text', text: metadata.title.trim(), style: {} }],
            },
        })
    }
    if (metadata.subtitle?.trim()) {
        blocks.push({
            kind: 'paragraph',
            paragraph: {
                styleId: 'Heading2',
                runs: [{ type: 'text', text: metadata.subtitle.trim(), style: {} }],
            },
        })
    }
    if (metadata.authors?.length) {
        blocks.push({
            kind: 'paragraph',
            paragraph: {
                runs: [{ type: 'text', text: contributorsText(metadata.authors), style: {} }],
            },
        })
    }
    if (metadata.title || metadata.subtitle || metadata.authors?.length) {
        blocks.push({ kind: 'paragraph', paragraph: { runs: [{ type: 'text', text: '', style: {} }] } })
    }

    sortedChapters.forEach((chapter, idx) => {
        blocks.push(...chapterToBlocks(chapter, idx, context))
    })

    const drawIdRef = { value: 0 }
    const bodyXml = blocks
        .map((block) => {
            if (block.kind === 'paragraph') return paragraphXml(block.paragraph, drawIdRef)
            return tableXml(block.table, drawIdRef)
        })
        .join('')

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
 xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
 xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
 xmlns:v="urn:schemas-microsoft-com:vml"
 xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing"
 xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
 xmlns:w10="urn:schemas-microsoft-com:office:word"
 xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
 xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"
 xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"
 xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk"
 xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml"
 xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"
 mc:Ignorable="w14 wp14">
  <w:body>
    ${bodyXml}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
      <w:cols w:space="720"/>
      <w:docGrid w:linePitch="360"/>
    </w:sectPr>
  </w:body>
</w:document>`
}

function buildStylesXml(): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:lang w:val="ko-KR"/>
      </w:rPr>
    </w:rPrDefault>
    <w:pPrDefault>
      <w:pPr>
        <w:spacing w:after="180" w:line="300" w:lineRule="auto"/>
      </w:pPr>
    </w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:qFormat/>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:qFormat/>
    <w:rPr><w:b/><w:sz w:val="42"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:qFormat/>
    <w:rPr><w:b/><w:sz w:val="34"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading3">
    <w:name w:val="heading 3"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:qFormat/>
    <w:rPr><w:b/><w:sz w:val="30"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading4">
    <w:name w:val="heading 4"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:qFormat/>
    <w:rPr><w:b/><w:sz w:val="26"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading5">
    <w:name w:val="heading 5"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:qFormat/>
    <w:rPr><w:b/><w:sz w:val="24"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading6">
    <w:name w:val="heading 6"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:qFormat/>
    <w:rPr><w:b/><w:sz w:val="22"/></w:rPr>
  </w:style>
</w:styles>`
}

function buildCorePropsXml(metadata: BookMetadata, translate?: DocxTranslate): string {
    const now = toIsoDate(new Date().toISOString())
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
 xmlns:dc="http://purl.org/dc/elements/1.1/"
 xmlns:dcterms="http://purl.org/dc/terms/"
 xmlns:dcmitype="http://purl.org/dc/dcmitype/"
 xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${escapeXml((metadata.title || '').trim() || resolveTranslatedText(translate, 'editor.untitled', 'Untitled'))}</dc:title>
  <dc:creator>${escapeXml(contributorsText(metadata.authors))}</dc:creator>
  <cp:lastModifiedBy>BookSpace</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`
}

function buildAppPropsXml(): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"
 xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>BookSpace</Application>
  <DocSecurity>0</DocSecurity>
  <ScaleCrop>false</ScaleCrop>
  <Company>BookSpace</Company>
  <LinksUpToDate>false</LinksUpToDate>
  <SharedDoc>false</SharedDoc>
  <HyperlinksChanged>false</HyperlinksChanged>
  <AppVersion>1.0</AppVersion>
</Properties>`
}

function buildContentTypesXml(images: EmbeddedImage[]): string {
    const defaults = [
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
        '<Default Extension="xml" ContentType="application/xml"/>',
    ]

    const seenExt = new Set<string>()
    for (const image of images) {
        const ext = image.fileName.split('.').pop()?.toLowerCase()
        if (!ext || seenExt.has(ext)) continue
        seenExt.add(ext)
        defaults.push(`<Default Extension="${ext}" ContentType="${image.contentType}"/>`)
    }

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  ${defaults.join('')}
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`
}

function buildDocumentRelsXml(images: EmbeddedImage[]): string {
    const rels = images
        .map(
            (image) =>
                `<Relationship Id="${image.relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${image.target}"/>`,
        )
        .join('')

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rIdNumbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
  ${rels}
</Relationships>`
}

function buildNumberingXml(context: ExportContext): string {
    const abstractDecimalId = 0
    const abstractBulletId = 1
    const decimalLevels = Array.from({ length: 9 })
        .map((_, idx) => {
            const pattern = Array.from({ length: idx + 1 })
                .map((__, i) => `%${i + 1}`)
                .join('.')
            return `<w:lvl w:ilvl="${idx}"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="${pattern}."/><w:lvlJc w:val="left"/></w:lvl>`
        })
        .join('')
    const bulletChars = ['•', '◦', '▪', '•', '◦', '▪', '•', '◦', '▪']
    const bulletLevels = Array.from({ length: 9 })
        .map(
            (_, idx) =>
                `<w:lvl w:ilvl="${idx}"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="${bulletChars[idx]}"/><w:lvlJc w:val="left"/></w:lvl>`,
        )
        .join('')
    const nums = context.listInstances
        .map(
            (item) =>
                `<w:num w:numId="${item.numId}"><w:abstractNumId w:val="${item.ordered ? abstractDecimalId : abstractBulletId}"/></w:num>`,
        )
        .join('')
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="${abstractDecimalId}">
    <w:multiLevelType w:val="hybridMultilevel"/>
    ${decimalLevels}
  </w:abstractNum>
  <w:abstractNum w:abstractNumId="${abstractBulletId}">
    <w:multiLevelType w:val="hybridMultilevel"/>
    ${bulletLevels}
  </w:abstractNum>
  ${nums}
</w:numbering>`
}

export async function exportDocx(
    chapters: Chapter[],
    metadata: BookMetadata,
    translate?: DocxTranslate,
): Promise<Blob> {
    const zip = new JSZip()
    const context: ExportContext = {
        images: [],
        nextImageId: 0,
        listInstances: [],
        nextListNumId: 10,
        translate,
    }

    const documentXml = buildDocumentXml(metadata, chapters, context)

    zip.file('[Content_Types].xml', buildContentTypesXml(context.images))

    zip.folder('_rels')?.file(
        '.rels',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`,
    )

    zip.folder('docProps')?.file('core.xml', buildCorePropsXml(metadata, translate))
    zip.folder('docProps')?.file('app.xml', buildAppPropsXml())

    const wordFolder = zip.folder('word')
    wordFolder?.file('document.xml', documentXml)
    wordFolder?.file('styles.xml', buildStylesXml())
    wordFolder?.file('numbering.xml', buildNumberingXml(context))
    wordFolder?.folder('_rels')?.file('document.xml.rels', buildDocumentRelsXml(context.images))

    const mediaFolder = wordFolder?.folder('media')
    for (const image of context.images) {
        mediaFolder?.file(image.fileName, image.bytes)
    }

    return zip.generateAsync({
        type: 'blob',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })
}
