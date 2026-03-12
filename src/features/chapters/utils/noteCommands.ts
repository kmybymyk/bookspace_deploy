import type { Editor } from '@tiptap/react'
import i18n from '../../../i18n'

function collectNodeIds(node: any, ids: string[]) {
    if (node?.attrs?.id && typeof node.attrs.id === 'string') {
        ids.push(node.attrs.id)
    }
    for (const child of node?.content ?? []) {
        collectNodeIds(child, ids)
    }
}

function hasNoteOfType(editor: Editor, type: 'footnote' | 'endnote'): boolean {
    const idPrefix = type === 'footnote' ? 'fn-' : 'en-'
    const ids: string[] = []
    collectNodeIds(editor.getJSON(), ids)
    return ids.some((id) => id.startsWith(idPrefix))
}

function walkNode(node: any, fn: (node: any) => void) {
    fn(node)
    for (const child of node?.content ?? []) {
        walkNode(child, fn)
    }
}

function normalizeNotes(editor: Editor) {
    const doc = editor.getJSON()

    const refOrder: Record<'fn' | 'en', string[]> = { fn: [], en: [] }
    const seenRefIds = new Set<string>()

    walkNode(doc, (node) => {
        if (node?.type !== 'text') return
        for (const mark of node.marks ?? []) {
            if (mark?.type !== 'link') continue
            const href = String(mark?.attrs?.href ?? '')
            const match = href.match(/^#(fn|en)-\d+$/)
            if (!match) continue
            const kind = match[1] as 'fn' | 'en'
            const id = href.slice(1)
            if (seenRefIds.has(id)) continue
            seenRefIds.add(id)
            refOrder[kind].push(id)
        }
    })

    // Collect all existing note paragraphs to avoid ID collisions
    // when there are unreferenced notes in the document.
    const noteIdsByType: Record<'fn' | 'en', string[]> = { fn: [], en: [] }
    const seenNoteIdsByType: Record<'fn' | 'en', Set<string>> = {
        fn: new Set<string>(),
        en: new Set<string>(),
    }
    walkNode(doc, (node) => {
        if (node?.type !== 'paragraph' || typeof node?.attrs?.id !== 'string') return
        const id = String(node.attrs.id)
        if (!/^(fn|en)-\d+$/.test(id)) return
        const kind = id.startsWith('fn-') ? 'fn' : 'en'
        if (seenNoteIdsByType[kind].has(id)) return
        seenNoteIdsByType[kind].add(id)
        noteIdsByType[kind].push(id)
    })

    const idRemap = new Map<string, string>()
    for (const kind of ['fn', 'en'] as const) {
        const existing = noteIdsByType[kind]
        const existingSet = new Set(existing)
        const referenced = refOrder[kind].filter((id) => existingSet.has(id))
        const referencedSet = new Set(referenced)
        const unreferenced = existing.filter((id) => !referencedSet.has(id))
        const ordered = [...referenced, ...unreferenced]

        ordered.forEach((oldId, idx) => {
            idRemap.set(oldId, `${kind}-${idx + 1}`)
        })
    }

    walkNode(doc, (node) => {
        if (node?.type === 'text') {
            for (const mark of node.marks ?? []) {
                if (mark?.type !== 'link') continue
                const href = String(mark?.attrs?.href ?? '')
                if (!href.startsWith('#')) continue
                const oldId = href.slice(1)
                const newId = idRemap.get(oldId)
                if (!newId) continue
                mark.attrs = { ...(mark.attrs ?? {}), href: `#${newId}` }
                const kind = newId.startsWith('fn-') ? 'fn' : 'en'
                const num = Number(newId.split('-')[1] ?? '1')
                node.text = kind === 'fn' ? '*'.repeat(num) : String(num)
            }
            return
        }

        if (node?.type === 'paragraph' && typeof node?.attrs?.id === 'string') {
            const oldId = node.attrs.id as string
            const newId = idRemap.get(oldId)
            if (!newId) return

            const isFoot = newId.startsWith('fn-')
            const num = Number(newId.split('-')[1] ?? '1')
            const label = isFoot ? `${'*'.repeat(num)} ` : `${num}. `
            const startClass = isFoot ? (num === 1 ? 'footnote footnote-start' : 'footnote') : (num === 1 ? 'endnote endnote-start' : 'endnote')

            node.attrs = { ...(node.attrs ?? {}), id: newId, class: startClass }

            const firstText = node.content?.find((c: any) => c.type === 'text')
            if (!firstText) return
            const raw = String(firstText.text ?? '')
            const stripped = isFoot ? raw.replace(/^\*+\s*/, '') : raw.replace(/^\d+\.\s*/, '')
            firstText.text = `${label}${stripped}`
        }
    })

    // Reorder note paragraphs (and their spacer paragraphs) to match reference order.
    const topNodes = Array.isArray(doc.content) ? doc.content : []
    const isNoteParagraph = (node: any) =>
        node?.type === 'paragraph' &&
        typeof node?.attrs?.id === 'string' &&
        /^(fn|en)-\d+$/.test(String(node.attrs.id))
    const isSpacerParagraph = (node: any) =>
        node?.type === 'paragraph' &&
        !node?.attrs?.id &&
        !node?.attrs?.class &&
        !node?.attrs?.dataNotePlaceholder &&
        (!Array.isArray(node?.content) || node.content.length === 0)

    const noteStartIndices: number[] = []
    for (let i = 0; i < topNodes.length; i += 1) {
        if (isNoteParagraph(topNodes[i])) noteStartIndices.push(i)
    }

    type NoteBlock = { type: 'fn' | 'en'; num: number; nodes: any[]; firstIndex: number }
    const blocks: NoteBlock[] = []
    const consumed = new Set<number>()

    for (let k = 0; k < noteStartIndices.length; k += 1) {
        const noteStart = noteStartIndices[k]
        const node = topNodes[noteStart]
        if (!node) continue

        const id = String(node.attrs.id)
        const kind = id.startsWith('fn-') ? 'fn' : 'en'
        const num = Number(id.split('-')[1] ?? '0')
        let blockStart = noteStart
        if (
            noteStart > 0 &&
            !consumed.has(noteStart - 1) &&
            isSpacerParagraph(topNodes[noteStart - 1])
        ) {
            blockStart = noteStart - 1
        }

        const nextStart = noteStartIndices[k + 1] ?? topNodes.length
        // Keep the blank spacer right before the next note with the next note block.
        // This prevents separator paragraphs from drifting when notes are re-ordered.
        let blockEnd = nextStart
        if (nextStart > noteStart + 1 && isSpacerParagraph(topNodes[nextStart - 1])) {
            blockEnd = nextStart - 1
        }
        if (blockEnd <= noteStart) blockEnd = noteStart + 1

        const nodes = topNodes.slice(blockStart, blockEnd)
        for (let i = blockStart; i < blockEnd; i += 1) {
            consumed.add(i)
        }

        blocks.push({
            type: kind,
            num: Number.isFinite(num) ? num : 0,
            nodes,
            firstIndex: blockStart,
        })
    }

    if (blocks.length > 1) {
        const firstBlock = blocks.reduce((acc, cur) => (cur.firstIndex < acc.firstIndex ? cur : acc), blocks[0])
        const preferredTypeOrder: Array<'fn' | 'en'> =
            firstBlock.type === 'fn' ? ['fn', 'en'] : ['en', 'fn']

        blocks.sort((a, b) => {
            if (a.type !== b.type) return preferredTypeOrder.indexOf(a.type) - preferredTypeOrder.indexOf(b.type)
            return a.num - b.num
        })

        const firstConsumedIndex = Math.min(...Array.from(consumed))
        const reorderedBlocks = blocks.flatMap((block) => block.nodes)
        const rebuilt: any[] = []
        let inserted = false

        for (let i = 0; i < topNodes.length; i += 1) {
            if (i === firstConsumedIndex && !inserted) {
                rebuilt.push(...reorderedBlocks)
                inserted = true
            }
            if (consumed.has(i)) continue
            rebuilt.push(topNodes[i])
        }
        if (!inserted) rebuilt.push(...reorderedBlocks)

        doc.content = rebuilt
    }

    const oldFrom = editor.state.selection.from
    editor.commands.setContent(doc, { emitUpdate: false })
    const maxPos = Math.max(1, editor.state.doc.content.size)
    editor.commands.setTextSelection(Math.min(oldFrom, maxPos))
}

function getNextNoteNumber(editor: Editor, type: 'footnote' | 'endnote'): number {
    const idPrefix = type === 'footnote' ? 'fn-' : 'en-'
    const ids: string[] = []
    collectNodeIds(editor.getJSON(), ids)

    let max = 0
    for (const id of ids) {
        if (!id.startsWith(idPrefix)) continue
        const num = Number(id.slice(idPrefix.length))
        if (Number.isFinite(num)) max = Math.max(max, num)
    }
    return max + 1
}

export function insertNote(editor: Editor, type: 'footnote' | 'endnote') {
    const number = getNextNoteNumber(editor, type)
    const noteId = `${type === 'footnote' ? 'fn' : 'en'}-${number}`
    const referenceLabel = type === 'footnote' ? '*'.repeat(number) : String(number)
    const noteLabel = type === 'footnote' ? `${'*'.repeat(number)} ` : `${number}. `
    const isFirstOfType = !hasNoteOfType(editor, type)
    const noteClass = isFirstOfType ? `${type} ${type}-start` : type

    editor
        .chain()
        .focus()
        .insertContent({
            type: 'text',
            text: referenceLabel,
            marks: [
                { type: 'superscript' },
                { type: 'link', attrs: { href: `#${noteId}` } },
            ],
        })
        .run()

    const endPos = editor.state.doc.content.size
    editor
        .chain()
        .insertContentAt(endPos, [
            { type: 'paragraph' },
            {
                type: 'paragraph',
                attrs: {
                    id: noteId,
                    class: noteClass,
                    dataNotePlaceholder: 'true',
                },
                content: [{ type: 'text', text: `${noteLabel}${i18n.t('noteCommands.placeholder')}` }],
            },
        ])
        .run()

    normalizeNotes(editor)
}
