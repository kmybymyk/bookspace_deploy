import type { JSONContent } from '@tiptap/core'

export interface MatchPreview {
    text: string
    highlightStart: number
    highlightEnd: number
}

export interface FindMatch {
    chapterId: string
    occurrenceInChapter: number
    preview: MatchPreview
    from?: number
    to?: number
}

function buildPreview(text: string, start: number, end: number): MatchPreview {
    const contextWindow = 18
    const from = Math.max(0, start - contextWindow)
    const to = Math.min(text.length, end + contextWindow)
    const snippet = text.slice(from, to)
    const highlightStart = start - from
    const highlightEnd = end - from
    return {
        text: snippet,
        highlightStart,
        highlightEnd,
    }
}

function forEachTextNode(node: JSONContent | undefined, cb: (textNode: { text: string; set: (next: string) => void }) => void) {
    if (!node || typeof node !== 'object') return
    if (node.type === 'text' && typeof node.text === 'string') {
        cb({
            text: node.text,
            set: (next: string) => {
                node.text = next
            },
        })
    }
    if (!Array.isArray(node.content)) return
    for (const child of node.content) {
        forEachTextNode(child, cb)
    }
}

function cloneContent(content: JSONContent): JSONContent {
    return JSON.parse(JSON.stringify(content)) as JSONContent
}

function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function buildProjectMatchesFromContent(
    chapterId: string,
    content: JSONContent,
    query: string,
    matchCase = false,
): FindMatch[] {
    const needleRaw = query.trim()
    const needle = matchCase ? needleRaw : needleRaw.toLocaleLowerCase()
    if (!needle) return []
    const found: FindMatch[] = []
    let occurrenceInChapter = 0

    forEachTextNode(content, ({ text }) => {
        const source = matchCase ? text : text.toLocaleLowerCase()
        let cursor = 0
        while (cursor <= source.length - needle.length) {
            const foundIndex = source.indexOf(needle, cursor)
            if (foundIndex < 0) break
            const start = foundIndex
            const end = foundIndex + needle.length
            found.push({
                chapterId,
                occurrenceInChapter,
                preview: buildPreview(text, start, end),
            })
            occurrenceInChapter += 1
            cursor = foundIndex + Math.max(needle.length, 1)
        }
    })

    return found
}

export function replaceNthOccurrenceInContent(
    content: JSONContent,
    query: string,
    replaceText: string,
    targetOccurrence: number,
    matchCase = false,
) {
    const needleRaw = query.trim()
    const needle = matchCase ? needleRaw : needleRaw.toLocaleLowerCase()
    if (!needle) return { content, replaced: false }

    const next = cloneContent(content)
    let occurrence = 0
    let replaced = false

    forEachTextNode(next, ({ text, set }) => {
        if (replaced) return
        const source = matchCase ? text : text.toLocaleLowerCase()
        let cursor = 0
        while (cursor <= source.length - needle.length) {
            const foundIndex = source.indexOf(needle, cursor)
            if (foundIndex < 0) break
            if (occurrence === targetOccurrence) {
                const updated = text.slice(0, foundIndex) + replaceText + text.slice(foundIndex + needle.length)
                set(updated)
                replaced = true
                return
            }
            occurrence += 1
            cursor = foundIndex + Math.max(needle.length, 1)
        }
    })

    return { content: next, replaced }
}

export function replaceAllOccurrencesInContent(
    content: JSONContent,
    query: string,
    replaceText: string,
    matchCase = false,
) {
    const needle = query.trim()
    if (!needle) return { content, count: 0 }

    const next = cloneContent(content)
    const pattern = new RegExp(escapeRegExp(needle), matchCase ? 'g' : 'gi')
    let count = 0

    forEachTextNode(next, ({ text, set }) => {
        let localCount = 0
        const updated = text.replace(pattern, () => {
            localCount += 1
            return replaceText
        })
        if (localCount > 0) {
            set(updated)
            count += localCount
        }
    })

    return { content: next, count }
}
