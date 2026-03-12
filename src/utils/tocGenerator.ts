import { Chapter } from '../types/project'
import type { JSONContent } from '@tiptap/core'
import { makeChapterHeadingAnchor } from './anchor'

export interface TocItem {
    chapterId: string
    title: string
    level: number
    anchor: string
}

function getNodeText(node: JSONContent | undefined): string {
    if (!node || typeof node !== 'object') return ''
    if (typeof node.text === 'string') return node.text
    if (Array.isArray(node.content)) {
        return node.content.map((child: JSONContent) => getNodeText(child)).join('')
    }
    return ''
}

function collectHeadings(
    chapterId: string,
    nodes: JSONContent[] | undefined,
    anchorCounts: Map<string, number>,
    items: TocItem[],
) {
    if (!Array.isArray(nodes)) return

    for (const node of nodes) {
        if (!node || typeof node !== 'object') continue

        if (node.type === 'heading' && node.attrs?.level) {
            const headingLevel = Number(node.attrs.level)
            if (!Number.isFinite(headingLevel)) continue
            const text = getNodeText(node).trim()
            if (text) {
                const baseAnchor = makeChapterHeadingAnchor(chapterId, text)
                let anchor = baseAnchor

                if (anchorCounts.has(baseAnchor)) {
                    const count = (anchorCounts.get(baseAnchor) ?? 0) + 1
                    anchor = `${baseAnchor}-${count}`
                    anchorCounts.set(baseAnchor, count)
                } else {
                    anchorCounts.set(baseAnchor, 1)
                }

                items.push({
                    chapterId,
                    title: text,
                    level: headingLevel + 1,
                    anchor,
                })
            }
        }

        collectHeadings(chapterId, node.content as JSONContent[] | undefined, anchorCounts, items)
    }
}

/**
 * 챕터 목록에서 TOC(Table of Contents)를 자동으로 생성합니다.
 * Tiptap JSON의 heading 노드를 파싱해 계층 구조를 반환합니다.
 */
export function generateToc(chapters: Chapter[]): TocItem[] {
    const items: TocItem[] = []
    const anchorCounts = new Map<string, number>()

    for (const chapter of chapters) {
        // 챕터 자체를 최상위 TOC 항목으로 추가
        const chapterAnchor = `chapter-${chapter.id}`
        anchorCounts.set(chapterAnchor, 1)

        items.push({
            chapterId: chapter.id,
            title: chapter.title,
            level: 1,
            anchor: chapterAnchor,
        })

        // 챕터 내 heading 노드 파싱
        collectHeadings(chapter.id, chapter.content?.content, anchorCounts, items)
    }

    return items
}
