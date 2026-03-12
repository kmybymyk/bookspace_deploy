export function normalizeAnchorToken(raw: string, maxLength = 20): string {
    const normalized = (raw || '')
        .normalize('NFKC')
        .trim()
        .toLowerCase()
        .replace(/[\s\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+/g, '-')
        .replace(/[^\p{L}\p{N}._-]+/gu, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '')
    if (!normalized) return 'section'
    if (maxLength <= 0) return 'section'
    return normalized.slice(0, maxLength)
}

export function makeChapterHeadingAnchor(chapterId: string, headingTitle: string, maxLength = 20): string {
    const chapter = (chapterId || '').trim() || 'chapter'
    const token = normalizeAnchorToken(headingTitle, maxLength)
    return `${chapter}-${token}`
}
