import { nanoid } from 'nanoid'
import type { JSONContent } from '@tiptap/core'
import type { BookMetadata, Chapter } from '../../types/project'
import i18n from '../../i18n'

interface SourceLine {
    text: string
    line: number
}

interface MarkdownSection {
    title: string
    headingLine: number
    lines: SourceLine[]
}

export interface ImportMarkdownWarning {
    line: number
    chapterTitle?: string
    message: string
}

interface ImportMarkdownResult {
    chapters: Chapter[]
    metadata: Partial<BookMetadata>
    warnings: ImportMarkdownWarning[]
}

type Mark = { type: string; attrs?: Record<string, unknown> }

type MarkdownNode = JSONContent

function chapterFileName(id: string) {
    return `chapter-${id}.xhtml`
}

function textNode(text: string, marks: Mark[] = []) {
    if (!marks.length) return { type: 'text', text }
    return { type: 'text', text, marks }
}

function mergeMarks(base: Mark[], extra: Mark): Mark[] {
    const key = JSON.stringify(extra)
    if (base.some((mark) => JSON.stringify(mark) === key)) return base
    return [...base, extra]
}

function paragraphFromInline(content: JSONContent[]): JSONContent {
    return content.length > 0 ? { type: 'paragraph', content } : { type: 'paragraph' }
}

function headingNode(level: number, text: string) {
    const content = parseInline(text.trim())
    if (!content.length) return null
    return {
        type: 'heading' as const,
        attrs: { level: Math.max(1, Math.min(6, level)) },
        content,
    }
}

function countIndent(raw: string): number {
    let count = 0
    for (const ch of raw) {
        if (ch === ' ') count += 1
        else if (ch === '\t') count += 4
        else break
    }
    return count
}

function normalizeFrontmatterValue(value: string): string {
    const trimmed = value.trim()
    if (!trimmed) return ''
    if (
        (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
        return trimmed.slice(1, -1).trim()
    }
    return trimmed
}

function parseYamlScalar(raw: string): string {
    const normalized = normalizeFrontmatterValue(raw)
    if (normalized === 'null') return ''
    return normalized
}

function parseYamlLike(lines: string[]): Record<string, string | string[]> {
    const out: Record<string, string | string[]> = {}

    let index = 0
    while (index < lines.length) {
        const line = lines[index]
        if (!line.trim() || line.trim().startsWith('#')) {
            index += 1
            continue
        }

        const keyMatch = line.match(/^([A-Za-z][\w-]*)\s*:\s*(.*)$/)
        if (!keyMatch) {
            index += 1
            continue
        }

        const key = keyMatch[1].toLowerCase()
        const rawValue = keyMatch[2] ?? ''
        const trimmedValue = rawValue.trim()

        if (!trimmedValue) {
            const nestedLines: string[] = []
            index += 1
            while (index < lines.length) {
                const nested = lines[index]
                if (!nested.trim()) {
                    nestedLines.push('')
                    index += 1
                    continue
                }
                if (/^\s+/.test(nested)) {
                    nestedLines.push(nested.replace(/^\s+/, ''))
                    index += 1
                    continue
                }
                break
            }

            const listItems = nestedLines
                .filter((item) => item.trim().startsWith('- '))
                .map((item) => parseYamlScalar(item.trim().replace(/^-\s+/, '')))
                .filter(Boolean)

            if (listItems.length > 0 && listItems.length === nestedLines.filter((item) => item.trim()).length) {
                out[key] = listItems
            } else {
                const block = nestedLines.join('\n').trim()
                if (block) out[key] = block
            }
            continue
        }

        if (trimmedValue === '|' || trimmedValue === '>') {
            const blockLines: string[] = []
            index += 1
            while (index < lines.length) {
                const nested = lines[index]
                if (/^\s+/.test(nested)) {
                    blockLines.push(nested.replace(/^\s+/, ''))
                    index += 1
                    continue
                }
                if (!nested.trim()) {
                    blockLines.push('')
                    index += 1
                    continue
                }
                break
            }
            const joined = trimmedValue === '>'
                ? blockLines.map((item) => item.trim()).filter(Boolean).join(' ')
                : blockLines.join('\n')
            if (joined.trim()) out[key] = joined.trim()
            continue
        }

        if (trimmedValue.startsWith('[') && trimmedValue.endsWith(']')) {
            const inner = trimmedValue.slice(1, -1)
            out[key] = inner
                .split(',')
                .map((item) => parseYamlScalar(item))
                .filter(Boolean)
            index += 1
            continue
        }

        out[key] = parseYamlScalar(trimmedValue)
        index += 1
    }

    return out
}

function canonicalizeLanguageTag(tag: string): string | null {
    const normalized = tag.trim()
    if (!normalized) return null
    try {
        const canonical = Intl.getCanonicalLocales(normalized)
        return canonical[0] ?? null
    } catch {
        return null
    }
}

function parseFrontmatter(rawMarkdown: string): {
    bodyLines: SourceLine[]
    metadata: Partial<BookMetadata>
    warnings: ImportMarkdownWarning[]
} {
    const markdown = rawMarkdown.replace(/\uFEFF/g, '')
    const lines = markdown.replace(/\r\n/g, '\n').split('\n')
    const warnings: ImportMarkdownWarning[] = []

    if (lines[0]?.trim() !== '---') {
        return {
            bodyLines: lines.map((text, idx) => ({ text, line: idx + 1 })),
            metadata: {},
            warnings,
        }
    }

    let endIndex = -1
    for (let i = 1; i < lines.length; i += 1) {
        if (lines[i].trim() === '---') {
            endIndex = i
            break
        }
    }

    if (endIndex < 0) {
        return {
            bodyLines: lines.map((text, idx) => ({ text, line: idx + 1 })),
            metadata: {},
            warnings,
        }
    }

    const yamlObject = parseYamlLike(lines.slice(1, endIndex))
    const metadata: Partial<BookMetadata> = {}

    const title = yamlObject.title
    if (typeof title === 'string' && title.trim()) metadata.title = title.trim()

    const subtitle = yamlObject.subtitle
    if (typeof subtitle === 'string' && subtitle.trim()) metadata.subtitle = subtitle.trim()

    const publisher = yamlObject.publisher
    if (typeof publisher === 'string' && publisher.trim()) metadata.publisher = publisher.trim()

    const description = yamlObject.description ?? yamlObject.summary
    if (typeof description === 'string' && description.trim()) metadata.description = description.trim()

    const publishDate = yamlObject.date ?? yamlObject.publishdate
    if (typeof publishDate === 'string' && publishDate.trim()) metadata.publishDate = publishDate.trim()

    const authorRaw = yamlObject.authors ?? yamlObject.author
    if (Array.isArray(authorRaw)) {
        const authors = authorRaw
            .map((item) => parseYamlScalar(String(item)))
            .filter(Boolean)
        if (authors.length > 0) {
            metadata.authors = authors.map((name) => ({ id: nanoid(), name, role: 'author' as const }))
        }
    } else if (typeof authorRaw === 'string') {
        const names = authorRaw
            .split(',')
            .map((item) => parseYamlScalar(item))
            .filter(Boolean)
        if (names.length > 0) {
            metadata.authors = names.map((name) => ({ id: nanoid(), name, role: 'author' as const }))
        }
    }

    const langRaw = yamlObject.language ?? yamlObject.lang
    if (typeof langRaw === 'string') {
        const canonical = canonicalizeLanguageTag(langRaw)
        if (canonical) {
            metadata.language = canonical
        } else {
            warnings.push({
                line: 1,
                message: `Invalid language tag in frontmatter: ${langRaw}`,
            })
        }
    }

    const bodyLines = lines
        .slice(endIndex + 1)
        .map((text, idx) => ({ text, line: endIndex + 2 + idx }))

    return { bodyLines, metadata, warnings }
}

function isHorizontalRule(trimmed: string): boolean {
    return /^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)
}

function isTableDivider(trimmed: string): boolean {
    if (!trimmed.includes('|')) return false
    const cells = splitTableCells(trimmed)
    return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()))
}

function isListLine(raw: string): boolean {
    return /^(\s*)([-+*]|\d+\.)\s+/.test(raw)
}

function isBlockStart(raw: string): boolean {
    const trimmed = raw.trim()
    if (!trimmed) return true
    return (
        trimmed.startsWith('```') ||
        /^#{1,6}\s+/.test(trimmed) ||
        isHorizontalRule(trimmed) ||
        isListLine(raw) ||
        trimmed.startsWith('>') ||
        isImageLine(trimmed) ||
        trimmed.includes('|')
    )
}

function splitTableCells(raw: string): string[] {
    const line = raw.trim().replace(/^\|/, '').replace(/\|$/, '')
    const cells: string[] = []
    let current = ''
    let escaped = false

    for (const ch of line) {
        if (escaped) {
            current += ch
            escaped = false
            continue
        }
        if (ch === '\\') {
            escaped = true
            continue
        }
        if (ch === '|') {
            cells.push(current.trim())
            current = ''
            continue
        }
        current += ch
    }

    cells.push(current.trim())
    return cells
}

function parseInline(text: string, activeMarks: Mark[] = []): JSONContent[] {
    const out: JSONContent[] = []
    let index = 0

    const pushText = (value: string) => {
        if (!value) return
        out.push(textNode(value, activeMarks))
    }

    while (index < text.length) {
        const slice = text.slice(index)

        if (slice.startsWith('\\') && slice.length > 1) {
            pushText(slice[1])
            index += 2
            continue
        }

        if (slice.startsWith('`')) {
            const end = text.indexOf('`', index + 1)
            if (end > index + 1) {
                const codeText = text.slice(index + 1, end)
                out.push(textNode(codeText, mergeMarks(activeMarks, { type: 'code' })))
                index = end + 1
                continue
            }
        }

        if (slice.startsWith('[')) {
            const closeBracket = text.indexOf(']', index + 1)
            if (closeBracket > index + 1 && text[closeBracket + 1] === '(') {
                const closeParen = text.indexOf(')', closeBracket + 2)
                if (closeParen > closeBracket + 2) {
                    const label = text.slice(index + 1, closeBracket)
                    const href = text.slice(closeBracket + 2, closeParen).trim()
                    if (href) {
                        const linkMarks = mergeMarks(activeMarks, { type: 'link', attrs: { href } })
                        out.push(...parseInline(label, linkMarks))
                        index = closeParen + 1
                        continue
                    }
                }
            }
        }

        if (slice.startsWith('<')) {
            const end = text.indexOf('>', index + 1)
            if (end > index + 1) {
                const rawUrl = text.slice(index + 1, end).trim()
                if (/^https?:\/\//i.test(rawUrl)) {
                    const linkMarks = mergeMarks(activeMarks, { type: 'link', attrs: { href: rawUrl } })
                    out.push(textNode(rawUrl, linkMarks))
                    index = end + 1
                    continue
                }
            }
        }

        const strongMarker = slice.startsWith('**') ? '**' : slice.startsWith('__') ? '__' : null
        if (strongMarker) {
            const end = text.indexOf(strongMarker, index + strongMarker.length)
            if (end > index + strongMarker.length) {
                const inner = text.slice(index + strongMarker.length, end)
                out.push(...parseInline(inner, mergeMarks(activeMarks, { type: 'bold' })))
                index = end + strongMarker.length
                continue
            }
        }

        if (slice.startsWith('~~')) {
            const end = text.indexOf('~~', index + 2)
            if (end > index + 2) {
                const inner = text.slice(index + 2, end)
                out.push(...parseInline(inner, mergeMarks(activeMarks, { type: 'strike' })))
                index = end + 2
                continue
            }
        }

        const emMarker = slice.startsWith('*') ? '*' : slice.startsWith('_') ? '_' : null
        if (emMarker) {
            const end = text.indexOf(emMarker, index + emMarker.length)
            if (end > index + emMarker.length) {
                const inner = text.slice(index + emMarker.length, end)
                out.push(...parseInline(inner, mergeMarks(activeMarks, { type: 'italic' })))
                index = end + emMarker.length
                continue
            }
        }

        const nextSpecial = (() => {
            const candidates = ['\\', '`', '[', '<', '*', '_', '~']
                .map((ch) => text.indexOf(ch, index + 1))
                .filter((pos) => pos >= 0)
            return candidates.length ? Math.min(...candidates) : -1
        })()

        if (nextSpecial < 0) {
            pushText(text.slice(index))
            break
        }

        pushText(text.slice(index, nextSpecial))
        index = nextSpecial
    }

    return out
}

function parseCodeBlock(lines: SourceLine[], startIndex: number): { node: MarkdownNode; nextIndex: number } {
    const fence = lines[startIndex].text.trim()
    const language = fence.replace(/^```/, '').trim()
    let index = startIndex + 1
    const codeLines: string[] = []

    while (index < lines.length) {
        const line = lines[index].text
        if (line.trim().startsWith('```')) {
            index += 1
            break
        }
        codeLines.push(line)
        index += 1
    }

    const codeText = codeLines.join('\n')
    const node: MarkdownNode = {
        type: 'codeBlock',
    }
    if (language) node.attrs = { language }
    if (codeText) node.content = [{ type: 'text', text: codeText }]

    return { node, nextIndex: index }
}

function parseImageToken(trimmed: string): { alt: string; src: string; title?: string } | null {
    const match = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/)
    if (!match) return null
    const alt = (match[1] ?? '').trim()
    const body = (match[2] ?? '').trim()
    const srcMatch = body.match(/^(\S+)(?:\s+"([^"]+)")?$/)
    if (!srcMatch) return null
    const src = srcMatch[1]
    const title = srcMatch[2]
    return { alt, src, ...(title ? { title } : {}) }
}

function isImageLine(trimmed: string): boolean {
    return /^!\[[^\]]*\]\([^)]+\)$/.test(trimmed)
}

function parseTable(lines: SourceLine[], startIndex: number): { node: MarkdownNode; nextIndex: number } {
    const headerCells = splitTableCells(lines[startIndex].text)
    let index = startIndex + 2
    const bodyRows: string[][] = []

    while (index < lines.length) {
        const raw = lines[index].text
        if (!raw.trim() || !raw.includes('|') || isHorizontalRule(raw.trim())) break
        bodyRows.push(splitTableCells(raw))
        index += 1
    }

    const headerRow = {
        type: 'tableRow',
        content: headerCells.map((cell) => ({
            type: 'tableHeader',
            content: [paragraphFromInline(parseInline(cell))],
        })),
    }

    const rows = bodyRows.map((row) => ({
        type: 'tableRow',
        content: row.map((cell) => ({
            type: 'tableCell',
            content: [paragraphFromInline(parseInline(cell))],
        })),
    }))

    return {
        node: {
            type: 'table',
            content: [headerRow, ...rows],
        },
        nextIndex: index,
    }
}

function parseListMarker(raw: string): { indent: number; ordered: boolean; text: string } | null {
    const match = raw.match(/^(\s*)([-+*]|\d+\.)\s+(.*)$/)
    if (!match) return null
    return {
        indent: countIndent(match[1]),
        ordered: /\d+\./.test(match[2]),
        text: match[3] ?? '',
    }
}

function parseList(lines: SourceLine[], startIndex: number, baseIndent: number, ordered: boolean): { node: MarkdownNode; nextIndex: number } {
    const items: MarkdownNode[] = []
    let index = startIndex

    while (index < lines.length) {
        const marker = parseListMarker(lines[index].text)
        if (!marker) break
        if (marker.indent < baseIndent) break

        if (marker.indent > baseIndent) {
            const lastItem = items[items.length - 1]
            if (!lastItem) break
            const nested = parseList(lines, index, marker.indent, marker.ordered)
            lastItem.content.push(nested.node)
            index = nested.nextIndex
            continue
        }

        if (marker.ordered !== ordered) break

        let itemText = marker.text.trim()
        const checkboxMatch = itemText.match(/^\[( |x|X)\]\s+(.*)$/)
        if (checkboxMatch) {
            const checked = checkboxMatch[1].toLowerCase() === 'x' ? 'x' : ' '
            itemText = `[${checked}] ${checkboxMatch[2]}`
        }

        const paragraph = paragraphFromInline(parseInline(itemText))
        const listItem: MarkdownNode = { type: 'listItem', content: [paragraph] }
        items.push(listItem)
        index += 1

        while (index < lines.length) {
            const nextRaw = lines[index].text
            if (!nextRaw.trim()) {
                index += 1
                continue
            }

            const nextMarker = parseListMarker(nextRaw)
            if (nextMarker && nextMarker.indent <= baseIndent) break

            if (nextMarker && nextMarker.indent > baseIndent) {
                const nested = parseList(lines, index, nextMarker.indent, nextMarker.ordered)
                listItem.content.push(nested.node)
                index = nested.nextIndex
                continue
            }

            if (countIndent(nextRaw) > baseIndent) {
                const continuation = nextRaw.trim()
                const existingParagraph = listItem.content?.find(
                    (node): node is MarkdownNode & { type: 'paragraph'; content?: MarkdownNode[] } =>
                        node.type === 'paragraph'
                )
                if (existingParagraph) {
                    const merged = [
                        ...(existingParagraph.content ?? []),
                        textNode(' '),
                        ...parseInline(continuation),
                    ]
                    existingParagraph.content = merged
                }
                index += 1
                continue
            }

            break
        }
    }

    return {
        node: {
            type: ordered ? 'orderedList' : 'bulletList',
            content: items,
        },
        nextIndex: index,
    }
}

function parseParagraph(lines: SourceLine[], startIndex: number): { node: MarkdownNode; nextIndex: number } {
    let index = startIndex
    const chunks: string[] = []

    while (index < lines.length) {
        const current = lines[index].text
        if (!current.trim()) break
        if (index > startIndex && isBlockStart(current)) break
        chunks.push(current.trim())
        index += 1
    }

    return {
        node: paragraphFromInline(parseInline(chunks.join(' '))),
        nextIndex: index,
    }
}

function parseBlockquote(lines: SourceLine[], startIndex: number): { node: MarkdownNode; nextIndex: number } {
    const quoteLines: SourceLine[] = []
    let index = startIndex

    while (index < lines.length) {
        const raw = lines[index].text
        if (!raw.trim()) {
            quoteLines.push({ text: '', line: lines[index].line })
            index += 1
            continue
        }
        if (!raw.trim().startsWith('>')) break
        quoteLines.push({
            text: raw.replace(/^\s*>\s?/, ''),
            line: lines[index].line,
        })
        index += 1
    }

    const content = parseBlocks(quoteLines)
    return {
        node: {
            type: 'blockquote',
            content: content.length > 0 ? content : [paragraphFromInline([])],
        },
        nextIndex: index,
    }
}

function parseBlocks(lines: SourceLine[]): MarkdownNode[] {
    const nodes: MarkdownNode[] = []
    let index = 0

    while (index < lines.length) {
        const source = lines[index]
        const raw = source.text
        const trimmed = raw.trim()

        if (!trimmed) {
            index += 1
            continue
        }

        if (trimmed.startsWith('```')) {
            const codeBlock = parseCodeBlock(lines, index)
            nodes.push(codeBlock.node)
            index = codeBlock.nextIndex
            continue
        }

        const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/)
        if (headingMatch) {
            const level = headingMatch[1].length
            if (level > 1) {
                const heading = headingNode(level, headingMatch[2])
                if (heading) nodes.push(heading)
                index += 1
                continue
            }
        }

        if (isHorizontalRule(trimmed)) {
            nodes.push({ type: 'horizontalRule' })
            index += 1
            continue
        }

        if (isImageLine(trimmed)) {
            const token = parseImageToken(trimmed)
            if (token) {
                nodes.push({
                    type: 'image',
                    attrs: {
                        src: token.src,
                        alt: token.alt,
                        ...(token.title ? { title: token.title } : {}),
                    },
                })
                index += 1
                continue
            }
        }

        const listMarker = parseListMarker(raw)
        if (listMarker) {
            const parsed = parseList(lines, index, listMarker.indent, listMarker.ordered)
            nodes.push(parsed.node)
            index = parsed.nextIndex
            continue
        }

        if (trimmed.startsWith('>')) {
            const quote = parseBlockquote(lines, index)
            nodes.push(quote.node)
            index = quote.nextIndex
            continue
        }

        if (index + 1 < lines.length && trimmed.includes('|') && isTableDivider(lines[index + 1].text.trim())) {
            const table = parseTable(lines, index)
            nodes.push(table.node)
            index = table.nextIndex
            continue
        }

        const paragraph = parseParagraph(lines, index)
        nodes.push(paragraph.node)
        index = paragraph.nextIndex
    }

    return nodes
}

function splitSections(lines: SourceLine[], fallbackTitle: string): MarkdownSection[] {
    const sections: MarkdownSection[] = []
    let currentTitle = fallbackTitle
    let headingLine = lines[0]?.line ?? 1
    let currentLines: SourceLine[] = []
    let seenHeading = false

    const flush = () => {
        sections.push({
            title: currentTitle.trim() || fallbackTitle,
            headingLine,
            lines: currentLines,
        })
        currentLines = []
    }

    for (const line of lines) {
        const match = line.text.trim().match(/^#\s+(.+)$/)
        if (match) {
            if (seenHeading || currentLines.length > 0) flush()
            currentTitle = match[1].trim() || fallbackTitle
            headingLine = line.line
            seenHeading = true
            continue
        }
        currentLines.push(line)
    }

    if (sections.length === 0 || currentLines.length > 0 || seenHeading) flush()
    return sections
}

export function importMarkdown(rawMarkdown: string): ImportMarkdownResult {
    const frontmatter = parseFrontmatter(rawMarkdown)
    const warnings: ImportMarkdownWarning[] = [...frontmatter.warnings]
    const metadata: Partial<BookMetadata> = { ...frontmatter.metadata }

    const defaultLanguage = metadata.language?.trim() ? metadata.language : 'ko'
    const canonicalLanguage = canonicalizeLanguageTag(defaultLanguage)
    metadata.language = canonicalLanguage ?? 'ko'

    if (defaultLanguage && !canonicalLanguage) {
        warnings.push({
            line: 1,
            message: `Invalid language tag: ${defaultLanguage}. Fallback to ko.`,
        })
    }

    const fallbackTitle = metadata.title?.trim() || i18n.t('editor.untitled')
    const sections = splitSections(frontmatter.bodyLines, fallbackTitle)

    const chapters: Chapter[] = sections.map((section, order) => {
        const id = nanoid()
        const content = parseBlocks(section.lines)

        if (content.length === 0) {
            warnings.push({
                line: section.headingLine,
                chapterTitle: section.title,
                message: 'Chapter has no parsable body content. Created an empty paragraph.',
            })
        }

        return {
            id,
            title: section.title || i18n.t('editor.untitled'),
            content: {
                type: 'doc',
                content: content.length > 0 ? content : [paragraphFromInline([])],
            },
            order,
            fileName: chapterFileName(id),
            chapterType: 'chapter',
            parentId: null,
        }
    })

    return {
        chapters,
        metadata,
        warnings,
    }
}
