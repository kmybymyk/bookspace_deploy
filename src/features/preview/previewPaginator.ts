import { escapeHtml } from './previewRenderer'

function plainTextLen(html: string): number {
    return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().length
}

function splitParagraphBlock(blockHtml: string, headTargetChars: number): [string, string] | null {
    const match = blockHtml.match(/^<p([^>]*)>([\s\S]*)<\/p>$/i)
    if (!match) return null
    const attrs = match[1] ?? ''
    const inner = match[2] ?? ''
    // Keep inline markup blocks atomic to avoid broken tags in preview pagination.
    if (/<[^>]+>/.test(inner)) return null

    const text = inner
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .trim()
    if (!text) return null

    const target = Math.max(24, Math.min(text.length - 24, headTargetChars))
    const puncts = ['. ', '! ', '? ', '。', '！', '？', '.\n', '!\n', '?\n']
    let splitAt = -1

    for (let i = target; i >= Math.max(16, target - 120); i -= 1) {
        const around = text.slice(i - 1, i + 2)
        if (puncts.some((p) => around.includes(p))) {
            splitAt = i
            break
        }
    }
    if (splitAt < 0) {
        const ws = text.lastIndexOf(' ', target)
        if (ws > 20) splitAt = ws
    }
    if (splitAt < 0) return null

    const head = escapeHtml(text.slice(0, splitAt).trim())
    const tail = escapeHtml(text.slice(splitAt).trim())
    if (!head || !tail) return null
    return [`<p${attrs}>${head}</p>`, `<p${attrs}>${tail}</p>`]
}

export function paginateBlocks(blocks: string[], maxCharsPerPage: number): string[] {
    const pages: string[] = []
    let current: string[] = []
    let currentLen = 0

    for (const block of blocks) {
        const blockLen = Math.max(1, plainTextLen(block))
        if (currentLen > 0 && currentLen + blockLen > maxCharsPerPage) {
            const remain = maxCharsPerPage - currentLen
            const canTrySplit = remain >= Math.round(maxCharsPerPage * 0.2) && blockLen > remain + 40
            if (canTrySplit) {
                const split = splitParagraphBlock(block, remain)
                if (split) {
                    const [head, tail] = split
                    current.push(head)
                    pages.push(current.join(''))
                    current = [tail]
                    currentLen = Math.max(1, plainTextLen(tail))
                    continue
                }
            }
            pages.push(current.join(''))
            current = [block]
            currentLen = blockLen
        } else {
            current.push(block)
            currentLen += blockLen
        }
    }

    if (current.length > 0) pages.push(current.join(''))
    return pages.length > 0 ? pages : ['<p>&nbsp;</p>']
}
