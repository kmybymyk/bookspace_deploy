import JSZip from 'jszip'
import { nanoid } from 'nanoid'
import type { BookMetadata, Chapter } from '../../types/project'
import i18n from '../../i18n'

interface ImportDocxResult {
    chapters: Chapter[]
    metadata: Partial<BookMetadata>
}

function chapterFileName(id: string) {
    return `chapter-${id}.xhtml`
}

function textNode(text: string) {
    return { type: 'text', text }
}

function paragraphNode(text: string) {
    const trimmed = text.replace(/\s+/g, ' ').trim()
    if (!trimmed) return { type: 'paragraph' as const }
    return {
        type: 'paragraph' as const,
        content: [textNode(trimmed)],
    }
}

function headingNode(level: number, text: string) {
    const trimmed = text.replace(/\s+/g, ' ').trim()
    if (!trimmed) return null
    return {
        type: 'heading' as const,
        attrs: { level: Math.max(1, Math.min(6, level)) },
        content: [textNode(trimmed)],
    }
}

function collectText(el: Element): string {
    const out: string[] = []
    const walker = (node: Node) => {
        if (node.nodeType === Node.TEXT_NODE) {
            const value = node.textContent ?? ''
            if (value) out.push(value)
            return
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return
        const elem = node as Element
        const tag = elem.tagName.toLowerCase()
        if (tag.endsWith(':tab') || tag === 'w:tab') {
            out.push('\t')
            return
        }
        if (tag.endsWith(':br') || tag === 'w:br') {
            out.push('\n')
            return
        }
        for (const child of Array.from(elem.childNodes)) {
            walker(child)
        }
    }
    walker(el)
    return out.join('')
}

function paragraphStyleVal(pEl: Element): string {
    const pPr = Array.from(pEl.children).find((child) => child.tagName.toLowerCase().endsWith(':ppr'))
    if (!pPr) return ''
    const pStyle = Array.from(pPr.children).find((child) => child.tagName.toLowerCase().endsWith(':pstyle'))
    if (!pStyle) return ''
    return (
        pStyle.getAttribute('w:val') ??
        pStyle.getAttribute('val') ??
        pStyle.getAttributeNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'val') ??
        ''
    )
}

function parseHeadingLevel(styleVal: string): number | null {
    if (!styleVal) return null
    const match = styleVal.match(/heading\s*([1-6])|Heading([1-6])|HEADING([1-6])/i)
    if (!match) return null
    const raw = match[1] ?? match[2] ?? match[3]
    const level = Number(raw)
    return Number.isFinite(level) ? Math.max(1, Math.min(6, level)) : null
}

function parseCoreText(xml: string | null, tagName: string): string {
    if (!xml) return ''
    const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i')
    const match = xml.match(regex)
    if (!match?.[1]) return ''
    return match[1].replace(/<[^>]+>/g, '').trim()
}

export async function importDocx(binary: ArrayBuffer): Promise<ImportDocxResult> {
    const zip = await JSZip.loadAsync(binary)
    const documentXml = await zip.file('word/document.xml')?.async('string')
    if (!documentXml) {
        throw new Error(i18n.t('docxImporter.errors.documentXmlNotFound'))
    }

    const parser = new DOMParser()
    const xmlDoc = parser.parseFromString(documentXml, 'application/xml')
    const body = xmlDoc.getElementsByTagName('w:body')[0] ?? xmlDoc.documentElement
    const paragraphs = Array.from(body.getElementsByTagName('w:p'))

    const chapters: Chapter[] = []
    let pendingTitle = ''
    let currentTitle = i18n.t('docxImporter.defaults.body')
    let currentNodes: any[] = []

    const flushChapter = () => {
        const fallbackParagraph = currentNodes.length > 0 ? currentNodes : [paragraphNode('')]
        const id = nanoid()
        chapters.push({
            id,
            title: currentTitle.trim() || i18n.t('editor.untitled'),
            content: { type: 'doc', content: fallbackParagraph },
            order: chapters.length,
            fileName: chapterFileName(id),
            chapterType: 'chapter',
            parentId: null,
        })
        currentNodes = []
    }

    for (const pEl of paragraphs) {
        const rawText = collectText(pEl)
        const text = rawText.replace(/\u00A0/g, ' ')
        if (!text.trim()) continue

        const styleVal = paragraphStyleVal(pEl)
        const headingLevel = parseHeadingLevel(styleVal)

        if (headingLevel === 1) {
            if (currentNodes.length > 0) {
                flushChapter()
            }
            currentTitle = text.trim()
            pendingTitle = currentTitle
            continue
        }

        if (!pendingTitle && chapters.length === 0) {
            pendingTitle = i18n.t('docxImporter.defaults.body')
            currentTitle = pendingTitle
        }

        if (headingLevel && headingLevel > 1) {
            const heading = headingNode(headingLevel, text)
            if (heading) currentNodes.push(heading)
            continue
        }

        currentNodes.push(paragraphNode(text))
    }

    if (currentNodes.length > 0 || chapters.length === 0) {
        flushChapter()
    }

    const coreXml = await zip.file('docProps/core.xml')?.async('string')
    const titleFromMeta = parseCoreText(coreXml ?? null, 'dc:title')
    const creatorFromMeta = parseCoreText(coreXml ?? null, 'dc:creator')

    const metadata: Partial<BookMetadata> = {}
    if (titleFromMeta) metadata.title = titleFromMeta
    if (creatorFromMeta) {
        metadata.authors = [{ id: nanoid(), name: creatorFromMeta, role: 'author' }]
    }
    if (!metadata.language) metadata.language = 'ko'

    return { chapters, metadata }
}
