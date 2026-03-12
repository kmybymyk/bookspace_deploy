import type { JSONContent } from '@tiptap/core'
import type { Editor } from '@tiptap/react'
import type { BookMetadata } from '../../../types/project'
import i18n from '../../../i18n'

export const EMPTY_EDITOR_DOC: JSONContent = {
    type: 'doc',
    content: [{ type: 'paragraph' }],
}

export function isDefaultEmptyContent(content: JSONContent | undefined): boolean {
    const nodes = content?.content
    if (!Array.isArray(nodes)) return true
    if (nodes.length === 0) return true
    if (nodes.length !== 1) return false
    const first = nodes[0]
    return first?.type === 'paragraph' && (!Array.isArray(first.content) || first.content.length === 0)
}

export function buildCopyrightPresetContent(metadata: BookMetadata): JSONContent {
    const currentYear = new Date().getFullYear()
    const titleText = (metadata.title ?? '').trim() || i18n.t('editor.untitled')
    const subtitleText = (metadata.subtitle ?? '').trim()
    const primaryAuthor = (metadata.authors ?? []).find((a) => (a.name ?? '').trim().length > 0)?.name?.trim() ?? ''
    const publisherText = (metadata.publisher ?? '').trim()
    const isbnText = (metadata.isbn ?? '').trim()
    const linkText = (metadata.link ?? '').trim()
    const safeAuthor = primaryAuthor || i18n.t('editorHelpers.defaults.author')
    const safePublisher = publisherText || i18n.t('editorHelpers.defaults.publisher')
    const safeIsbn = isbnText || i18n.t('editorHelpers.defaults.isbn')
    const safeLink = linkText || i18n.t('editorHelpers.defaults.link')

    const lines: string[] = [
        `${titleText}${subtitleText ? ` : ${subtitleText}` : ''}`,
        i18n.t('editorHelpers.lines.author', { value: safeAuthor }),
        i18n.t('editorHelpers.lines.publisherRep', { value: safePublisher }),
        i18n.t('editorHelpers.lines.publisher', { value: safePublisher }),
        i18n.t('editorHelpers.lines.firstPublished', { year: currentYear }),
        i18n.t('editorHelpers.lines.isbn', { value: safeIsbn }),
        i18n.t('editorHelpers.lines.contact', { value: safeLink }),
        `Copyright © ${currentYear} ${safePublisher}. All rights reserved.`,
        i18n.t('editorHelpers.lines.copyrightNotice'),
    ]

    return {
        type: 'doc',
        content: lines.map((line) => ({
            type: 'paragraph',
            content: [{ type: 'text', text: line }],
        })),
    }
}

export function getBlockElementFromPos(blockPos: number, editorInstance: Editor): HTMLElement | null {
    const viewDom = editorInstance.view.dom as HTMLElement
    const domNode = editorInstance.view.nodeDOM(blockPos)
    const el = domNode instanceof HTMLElement ? domNode : domNode instanceof Node ? domNode.parentElement : null
    return resolveTopLevelBlockElement(el, viewDom)
}

export function resolveEventTargetElement(target: EventTarget | null): Element | null {
    if (target instanceof Element) return target
    if (target instanceof Node) return target.parentElement
    return null
}

export function resolveTopLevelBlockElement(
    start: HTMLElement | null,
    viewDom: HTMLElement,
): HTMLElement | null {
    if (!start || !viewDom.contains(start)) return null

    let current: HTMLElement | null = start
    while (current && current !== viewDom) {
        if (current.parentElement === viewDom) {
            return current
        }
        current = current.parentElement
    }

    return null
}
