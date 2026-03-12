import type { Chapter } from '../../types/project'
import type { ImportMarkdownWarning } from './markdownImporter'

function stripQueryAndHash(src: string): string {
    const noHash = src.split('#')[0] ?? src
    return noHash.split('?')[0] ?? noHash
}

function safeDecode(value: string): string {
    try {
        return decodeURIComponent(value)
    } catch {
        return value
    }
}

function isAbsolutePath(value: string): boolean {
    const src = value.trim()
    return src.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(src) || src.startsWith('\\\\')
}

export function isRelativeImageSource(src: string): boolean {
    const normalized = src.trim()
    if (!normalized) return false
    if (
        normalized.startsWith('http://') ||
        normalized.startsWith('https://') ||
        normalized.startsWith('data:') ||
        normalized.startsWith('blob:') ||
        normalized.startsWith('#')
    ) {
        return false
    }
    return !isAbsolutePath(normalized)
}

function dirnameFromPath(filePath: string): string {
    const normalized = filePath.replace(/\\/g, '/')
    const index = normalized.lastIndexOf('/')
    if (index <= 0) return normalized
    return normalized.slice(0, index)
}

function normalizeSegments(baseDir: string, relativeSrc: string): string {
    const normalizedBase = baseDir.replace(/\\/g, '/')
    const source = safeDecode(stripQueryAndHash(relativeSrc)).replace(/\\/g, '/')
    const chunks = source.split('/').filter((segment) => segment.length > 0)

    const stack = normalizedBase.split('/').filter((segment) => segment.length > 0)
    const isAbsoluteBase = normalizedBase.startsWith('/')
    const windowsDrive = /^[a-zA-Z]:$/.test(stack[0] ?? '')

    for (const chunk of chunks) {
        if (chunk === '.') continue
        if (chunk === '..') {
            if (stack.length > (windowsDrive ? 1 : 0)) {
                stack.pop()
            }
            continue
        }
        stack.push(chunk)
    }

    if (windowsDrive) return stack.join('/')
    return `${isAbsoluteBase ? '/' : ''}${stack.join('/')}`
}

function detectMimeType(filePath: string): string {
    const ext = filePath.toLowerCase().split('.').pop() ?? ''
    if (ext === 'png') return 'image/png'
    if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
    if (ext === 'webp') return 'image/webp'
    if (ext === 'gif') return 'image/gif'
    if (ext === 'svg') return 'image/svg+xml'
    if (ext === 'avif') return 'image/avif'
    if (ext === 'bmp') return 'image/bmp'
    return 'application/octet-stream'
}

function toBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer)
    if (typeof btoa === 'function') {
        let binary = ''
        const chunkSize = 0x8000
        for (let offset = 0; offset < bytes.length; offset += chunkSize) {
            const chunk = bytes.subarray(offset, offset + chunkSize)
            binary += String.fromCharCode(...chunk)
        }
        return btoa(binary)
    }
    // Node test/runtime fallback
    const NodeBuffer = (globalThis as any).Buffer
    if (NodeBuffer) {
        return NodeBuffer.from(bytes).toString('base64')
    }
    throw new Error('No base64 encoder available in this runtime.')
}

function walkNode(node: any, visit: (node: any) => Promise<void> | void): Promise<void> {
    const run = async (current: any) => {
        if (!current || typeof current !== 'object') return
        await visit(current)
        if (Array.isArray(current.content)) {
            for (const child of current.content) {
                await run(child)
            }
        }
    }
    return run(node)
}

export async function resolveMarkdownImageSources(
    chapters: Chapter[],
    markdownFilePath: string,
    readBinary: (filePath: string) => Promise<ArrayBuffer>,
): Promise<ImportMarkdownWarning[]> {
    const warnings: ImportMarkdownWarning[] = []
    const baseDir = dirnameFromPath(markdownFilePath)

    for (const chapter of chapters) {
        await walkNode(chapter.content, async (node) => {
            if (node?.type !== 'image') return
            const src = String(node.attrs?.src ?? '').trim()
            if (!isRelativeImageSource(src)) return

            const resolvedPath = normalizeSegments(baseDir, src)
            try {
                const binary = await readBinary(resolvedPath)
                const mime = detectMimeType(resolvedPath)
                node.attrs = {
                    ...(node.attrs ?? {}),
                    src: `data:${mime};base64,${toBase64(binary)}`,
                }
            } catch {
                warnings.push({
                    line: 0,
                    chapterTitle: chapter.title,
                    message: `Relative image path could not be loaded: ${src}`,
                })
            }
        })
    }

    return warnings
}
