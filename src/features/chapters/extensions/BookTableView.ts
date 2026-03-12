import { TableView } from '@tiptap/extension-table'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

const TABLE_MIN_VISIBLE_CELL_WIDTH = 72

function normalizeClassName(value: unknown): string {
    if (typeof value !== 'string') return ''
    return value.trim()
}

function normalizeFont(value: unknown): 'serif' | 'sans' | '' {
    if (value === 'serif' || value === 'sans') return value
    return ''
}

export class BookTableView extends TableView {
    private currentNode: ProseMirrorNode
    private resizeObserver: ResizeObserver | null = null

    constructor(node: ProseMirrorNode, cellMinWidth: number) {
        super(node, cellMinWidth)
        this.currentNode = node
        this.applyNodeVisualAttrs(node)
        this.attachResizeObserver()
    }

    update(node: ProseMirrorNode) {
        const updated = super.update(node)
        if (!updated) return false
        this.currentNode = node
        this.applyNodeVisualAttrs(node)
        return true
    }

    destroy() {
        this.resizeObserver?.disconnect()
        this.resizeObserver = null
        super.destroy()
    }

    private applyNodeVisualAttrs(node: ProseMirrorNode) {
        const className = normalizeClassName(node.attrs?.class)
        if (className) {
            this.table.className = className
        } else {
            this.table.removeAttribute('class')
        }

        const blockFont = normalizeFont(node.attrs?.dataBlockFont)
        if (blockFont) {
            this.table.setAttribute('data-block-font', blockFont)
        } else {
            this.table.removeAttribute('data-block-font')
        }

        this.updateOversetState(node)
    }

    private attachResizeObserver() {
        if (typeof ResizeObserver !== 'function') return
        this.resizeObserver = new ResizeObserver(() => {
            this.updateOversetState(this.currentNode)
        })
        this.resizeObserver.observe(this.dom)
    }

    private getColumnCount(node: ProseMirrorNode): number {
        let firstRow: ProseMirrorNode | null = null
        for (let index = 0; index < node.content.childCount; index += 1) {
            const child = node.content.child(index)
            if (child.type.name === 'tableRow') {
                firstRow = child
                break
            }
        }
        if (!firstRow) return 0
        let count = 0
        for (let index = 0; index < firstRow.content.childCount; index += 1) {
            const cell = firstRow.content.child(index)
            const colspan = Number(cell.attrs?.colspan ?? 1)
            count += Number.isFinite(colspan) && colspan > 0 ? colspan : 1
        }
        return count
    }

    private getFrameWidth(): number {
        const domRectWidth = this.dom.getBoundingClientRect().width
        if (Number.isFinite(domRectWidth) && domRectWidth > 0) return domRectWidth
        const tableRectWidth = this.table.getBoundingClientRect().width
        if (Number.isFinite(tableRectWidth) && tableRectWidth > 0) return tableRectWidth
        return 0
    }

    private updateOversetState(node: ProseMirrorNode) {
        const columnCount = this.getColumnCount(node)
        const frameWidth = this.getFrameWidth()
        const hasFrame = frameWidth > 0
        const minRequiredWidth = columnCount * TABLE_MIN_VISIBLE_CELL_WIDTH
        const overset = hasFrame && minRequiredWidth > frameWidth + 0.5

        // ProseMirror table resizing may set inline pixel widths.
        // Clamp visual table width to the editor frame to prevent horizontal scroll spill.
        this.table.style.width = '100%'
        this.table.style.maxWidth = '100%'
        this.table.style.minWidth = '0'

        this.dom.setAttribute('data-table-overset', overset ? 'true' : 'false')
        this.table.setAttribute('data-table-overset', overset ? 'true' : 'false')
    }
}
