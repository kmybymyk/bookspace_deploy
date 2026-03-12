import type { JSONContent } from '@tiptap/core'
import { sanitizeHref as sanitizeHrefFromUri, sanitizeImageSrc as sanitizeImageSrcFromUri } from './uriSanitizer'
import { buildTableColgroupMarkup, getFirstRowColumnWidthsFromTable } from '../chapters/tableRenderHelpers'

export function escapeHtml(text: string) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

export function sanitizeHref(raw: string): string | null {
    return sanitizeHrefFromUri(raw)
}

export function sanitizeImageSrc(raw: string): string | null {
    return sanitizeImageSrcFromUri(raw)
}

interface PreviewMark {
    type: string
    attrs?: Record<string, unknown>
}

type PreviewNode = JSONContent & {
    type: string
    attrs?: Record<string, unknown>
    content?: PreviewNode[]
    marks?: PreviewMark[]
}

function asPreviewNode(node: JSONContent): PreviewNode {
    return node as PreviewNode
}

function asSafeNode(node: unknown): PreviewNode | null {
    if (!node || typeof node !== 'object') return null
    const candidate = node as PreviewNode
    if (typeof candidate.type !== 'string') return null
    return candidate
}

function renderNodeChildren(nodes: unknown): string {
    const normalizedNodes = Array.isArray(nodes) ? nodes : []
    return normalizedNodes
        .map((node) => {
            const safeNode = asSafeNode(node)
            if (!safeNode) return ''
            return renderNode(safeNode)
        })
        .join('')
}

function normalizeImageWidthPercent(raw: unknown): number | null {
    const width = Number(raw)
    if (!Number.isFinite(width)) return null
    return Math.max(10, Math.min(100, Math.round(width)))
}

function renderImageNode(node: PreviewNode): string {
    const safeSrc = sanitizeImageSrc(String(node.attrs?.src ?? ''))
    const alt = escapeHtml(String(node.attrs?.alt ?? ''))
    const caption = String(node.attrs?.caption ?? node.attrs?.title ?? '').trim()
    const captionVisible = typeof node.attrs?.captionVisible === 'boolean' ? node.attrs.captionVisible : caption.length > 0
    const title = caption ? ` title="${escapeHtml(caption)}"` : ''
    const classToken = node.attrs?.class ? escapeHtml(String(node.attrs.class)) : ''
    const className = classToken ? ` class="${classToken}"` : ''
    const widthPercent = normalizeImageWidthPercent(node.attrs?.widthPercent)
    const widthAttr = widthPercent ? ` data-width-percent="${widthPercent}"` : ''

    if (!safeSrc) {
        if (caption) return `<p>${escapeHtml(caption)}</p>`
        return alt ? `<p>${alt}</p>` : '<p>&nbsp;</p>'
    }

    if (captionVisible && caption) {
        const figureClass = classToken ? ` class="book-image-figure ${classToken}"` : ' class="book-image-figure"'
        const figureStyle = widthPercent ? ` style="width:${widthPercent}%;max-width:100%;"` : ''
        return `<figure${figureClass}${widthAttr}${figureStyle}><img src="${escapeHtml(safeSrc)}" alt="${alt}"${title} loading="lazy" decoding="async" style="width:100%;max-width:100%;height:auto;"/><figcaption>${escapeHtml(caption)}</figcaption></figure>`
    }

    const style = widthPercent ? ` style="width:${widthPercent}%;max-width:100%;height:auto;"` : ''
    return `<img src="${escapeHtml(safeSrc)}"${className}${widthAttr}${style} alt="${alt}"${title} loading="lazy" decoding="async"/>`
}

function renderInline(nodes: JSONContent[] = []): string {
    return nodes
        .map((rawNode) => {
            const node = asSafeNode(rawNode)
            if (!node) return ''
            if (node.type === 'hardBreak') return '<br/>'

            let text = escapeHtml(node.text ?? '')
            const marks = Array.isArray(node.marks) ? node.marks : []

            for (const mark of marks) {
                if (!mark || typeof mark !== 'object') continue
                const safeMark = mark as PreviewMark
                if (safeMark.type === 'bold') text = `<strong>${text}</strong>`
                if (safeMark.type === 'italic') text = `<em>${text}</em>`
                if (safeMark.type === 'underline') text = `<u>${text}</u>`
                if (safeMark.type === 'strike') text = `<s>${text}</s>`
                if (safeMark.type === 'superscript') text = `<sup>${text}</sup>`
                if (safeMark.type === 'subscript') text = `<sub>${text}</sub>`
                if (safeMark.type === 'link' && safeMark.attrs && typeof safeMark.attrs.href === 'string') {
                    const safeHref = sanitizeHref(safeMark.attrs.href)
                    if (!safeHref) continue
                    const href = escapeHtml(safeHref)
                    const cls = href.startsWith('#') ? ' class="note-ref"' : ''
                    text = `<a href="${href}"${cls}>${text}</a>`
                }
            }

            return text
        })
        .join('')
}

function renderNode(node: PreviewNode): string {
    const dataBlockFont =
        node.attrs?.dataBlockFont === 'serif' || node.attrs?.dataBlockFont === 'sans'
            ? ` data-block-font="${escapeHtml(String(node.attrs.dataBlockFont))}"`
            : ''

    if (node.type === 'heading') {
        const level = Math.max(1, Math.min(Number(node.attrs?.level ?? 1), 6))
        const className = node.attrs?.class ? ` class="${escapeHtml(String(node.attrs.class))}"` : ''
        return `<h${level}${className}${dataBlockFont}>${renderInline(node.content ?? [])}</h${level}>`
    }

    if (node.type === 'paragraph') {
        const className = node.attrs?.class ? ` class="${escapeHtml(String(node.attrs.class))}"` : ''
        const idAttr = node.attrs?.id ? ` id="${escapeHtml(String(node.attrs.id))}"` : ''
        return `<p${idAttr}${className}${dataBlockFont}>${renderInline(node.content ?? []) || '&nbsp;'}</p>`
    }

    if (node.type === 'blockquote') {
        const className = node.attrs?.class ? ` class="${escapeHtml(String(node.attrs.class))}"` : ''
        return `<blockquote${className}${dataBlockFont}>${renderNodeChildren(node.content ?? [])}</blockquote>`
    }

    if (node.type === 'image') {
        return renderImageNode(node)
    }

    if (node.type === 'horizontalRule') {
        const className = node.attrs?.class ? ` class="${escapeHtml(String(node.attrs.class))}"` : ''
        return `<hr${className}/>`
    }

    if (node.type === 'table') {
        const className = node.attrs?.class ? ` class="${escapeHtml(String(node.attrs.class))}"` : ''
        const tableBlockFont =
            node.attrs?.dataBlockFont === 'serif' || node.attrs?.dataBlockFont === 'sans'
                ? ` data-block-font="${escapeHtml(String(node.attrs.dataBlockFont))}"`
                : ''
        const colgroup = buildTableColgroupMarkup(getFirstRowColumnWidthsFromTable(node))
        const rows = renderNodeChildren(node.content ?? [])
        return `<table${className}${tableBlockFont}>${colgroup}<tbody>${rows}</tbody></table>`
    }

    if (node.type === 'bulletList') {
        const className = node.attrs?.class ? ` class="${escapeHtml(String(node.attrs.class))}"` : ''
        return `<ul${className}>${renderNodeChildren(node.content ?? [])}</ul>`
    }

    if (node.type === 'orderedList') {
        const start = Number(node.attrs?.start ?? 1)
        const startAttr = start > 1 ? ` start="${start}"` : ''
        return `<ol${startAttr}>${renderNodeChildren(node.content ?? [])}</ol>`
    }

    if (node.type === 'listItem') {
        return `<li>${renderNodeChildren(node.content ?? [])}</li>`
    }

    if (node.type === 'tableRow') {
        return `<tr>${renderNodeChildren(node.content ?? [])}</tr>`
    }

    if (node.type === 'tableCell' || node.type === 'tableHeader') {
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
        const inner = renderNodeChildren(node.content ?? [])
        return `<${tag}${colspanAttr}${rowspanAttr}${colwidthAttr}>${inner || '&nbsp;'}</${tag}>`
    }

    return ''
}

export function chapterToBlocks(content: JSONContent | null | undefined): string[] {
    const nodes = content?.content
    if (!nodes || !Array.isArray(nodes)) return []
    return nodes.map((node) => renderNode(asPreviewNode(node))).filter(Boolean)
}
