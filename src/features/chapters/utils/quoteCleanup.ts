import type { Command } from '@tiptap/core'

const LEADING_QUOTES = /^[\s"'`“”‘’«»「」『』]+/
const TRAILING_QUOTES = /[\s"'`“”‘’«»「」『』]+$/

export const cleanQuotesCommand: Command = ({ tr, dispatch }) => {
    const { $from } = tr.selection
    let quoteDepth = -1
    for (let d = $from.depth; d >= 0; d -= 1) {
        if ($from.node(d).type.name === 'blockquote') {
            quoteDepth = d
            break
        }
    }

    let from, to
    if (quoteDepth < 0) {
        from = tr.selection.from
        to = tr.selection.to
    } else {
        from = $from.start(quoteDepth)
        to = $from.end(quoteDepth)
    }

    if (from >= to) return true

    const refs: { first: { from: number; to: number; text: string } | null, last: { from: number; to: number; text: string } | null } = { first: null, last: null }

    tr.doc.nodesBetween(from, to, (node, pos) => {
        if (!node.isText) return
        const text = String(node.text ?? '')
        if (!text.trim()) return
        const ref = { from: pos, to: pos + node.nodeSize, text }
        if (!refs.first) refs.first = ref
        refs.last = ref
    })

    const first = refs.first
    const last = refs.last

    if (!first || !last) return true

    const sameNode = first.from === last.from && first.to === last.to

    if (dispatch) {
        if (sameNode) {
            const cleaned = first.text.replace(LEADING_QUOTES, '').replace(TRAILING_QUOTES, '')
            if (cleaned !== first.text) tr.insertText(cleaned, first.from, first.to)
        } else {
            const cleanedLast = last.text.replace(TRAILING_QUOTES, '')
            if (cleanedLast !== last.text) tr.insertText(cleanedLast, last.from, last.to)

            const cleanedFirst = first.text.replace(LEADING_QUOTES, '')
            if (cleanedFirst !== first.text) tr.insertText(cleanedFirst, first.from, first.to)
        }
    }

    return true
}
