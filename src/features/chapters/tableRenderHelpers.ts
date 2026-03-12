import type { JSONContent } from '@tiptap/core'

export type TiptapNodeContent = JSONContent | null | undefined

function asPositiveNumber(value: unknown): number | null {
    const num = Number(value)
    return Number.isFinite(num) && num > 0 ? num : null
}

function collectWidthsFromCellAttrs(cell: TiptapNodeContent): number[] {
    const span = Number(cell?.attrs?.colspan ?? 1)
    const raw = Array.isArray(cell?.attrs?.colwidth) ? cell.attrs.colwidth : []
    const widths = new Array(Math.max(1, span))
    for (let i = 0; i < widths.length; i += 1) {
        const parsed = asPositiveNumber(raw?.[i])
        widths[i] = parsed ?? 0
    }
    return widths
}

export function getFirstRowColumnWidthsFromTable(table: TiptapNodeContent): number[] {
    const rows = Array.isArray(table?.content) ? table.content : []
    if (rows.length === 0) return []
    const firstRow = rows[0]
    const cells = Array.isArray(firstRow?.content) ? firstRow.content : []
    if (cells.length === 0) return []

    const widths: number[] = []
    for (const cell of cells) {
        widths.push(...collectWidthsFromCellAttrs(cell))
    }
    return widths
}

export function buildTableColgroupMarkup(widths: number[]): string {
    if (widths.length === 0) return ''

    const normalized = widths.map((rawWidth) => {
        const width = Number.isFinite(rawWidth) && rawWidth > 0 ? rawWidth : 1
        return width
    })
    const total = normalized.reduce((sum, width) => sum + width, 0)
    if (!(Number.isFinite(total) && total > 0)) return ''

    const cols = widths
        .map((_, index) => {
            const percent = (normalized[index] / total) * 100
            return `<col style="width: ${percent.toFixed(4)}%"/>`
        })
        .join('')

    return `<colgroup>${cols}</colgroup>`
}
