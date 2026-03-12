import { DEFAULT_SETTINGS } from '../features/design-panel/useDesignStore'
import { Chapter, ChapterContentType, ChapterType, ContributorRole, ProjectFile, TypographyPreset } from '../types/project'
import { nanoid } from 'nanoid'
import i18n from '../i18n'

type LegacyProjectMetadata = ProjectFile['metadata'] & { author?: string }
const CONTRIBUTOR_ROLES: ContributorRole[] = [
    'author',
    'co-author',
    'editor',
    'translator',
    'illustrator',
    'narrator',
    'compiler',
    'adapter',
    'other',
]
const CHAPTER_TYPES: ChapterType[] = ['front', 'part', 'chapter', 'divider', 'back', 'uncategorized']
const CHAPTER_CONTENT_TYPES: ChapterContentType[] = ['text', 'image']
const CHAPTER_TITLE_ALIGN = ['left', 'center', 'right'] as const
const SCENE_BREAK_STYLES = ['line', 'star', 'diamond'] as const
const THEMES = ['novel', 'essay', 'custom'] as const
const FONT_EMBED_MODES = ['none', 'selected'] as const
const IMAGE_ASSET_URI_PREFIX = 'bookspace-asset://'

function isObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function asString(value: unknown, fallback = ''): string {
    return typeof value === 'string' ? value : fallback
}

function asOptionalString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined
}

function asNumber(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function asOptionalNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function asBoolean(value: unknown, fallback: boolean): boolean {
    return typeof value === 'boolean' ? value : fallback
}

function asEnum<T extends readonly string[]>(value: unknown, candidates: T, fallback: T[number]): T[number] {
    return typeof value === 'string' && (candidates as readonly string[]).includes(value)
        ? (value as T[number])
        : fallback
}

function normalizeTypographyPreset(input: unknown, fallback: TypographyPreset): TypographyPreset {
    const raw = isObject(input) ? input : {}
    return {
        h1FontFamily: asString(raw.h1FontFamily, fallback.h1FontFamily),
        h2FontFamily: asString(raw.h2FontFamily, fallback.h2FontFamily),
        h3FontFamily: asString(raw.h3FontFamily, fallback.h3FontFamily),
        h4FontFamily: asString(raw.h4FontFamily, fallback.h4FontFamily),
        h5FontFamily: asString(raw.h5FontFamily, fallback.h5FontFamily),
        h6FontFamily: asString(raw.h6FontFamily, fallback.h6FontFamily),
        h1FontSize: asNumber(raw.h1FontSize, fallback.h1FontSize),
        h2FontSize: asNumber(raw.h2FontSize, fallback.h2FontSize),
        h3FontSize: asNumber(raw.h3FontSize, fallback.h3FontSize),
        h4FontSize: asNumber(raw.h4FontSize, fallback.h4FontSize),
        h5FontSize: asNumber(raw.h5FontSize, fallback.h5FontSize),
        h6FontSize: asNumber(raw.h6FontSize, fallback.h6FontSize),
    }
}

function normalizeDesignSettings(input: unknown): ProjectFile['designSettings'] {
    if (!isObject(input)) {
        throw new Error(i18n.t('projectManager.errors.invalidDesignSettings'))
    }
    const raw = input
    const sectionTypography = isObject(raw.sectionTypography) ? raw.sectionTypography : {}
    return {
        ...DEFAULT_SETTINGS,
        fontFamily: asString(raw.fontFamily, DEFAULT_SETTINGS.fontFamily),
        fontEmbedMode: asEnum(raw.fontEmbedMode, FONT_EMBED_MODES, DEFAULT_SETTINGS.fontEmbedMode),
        h1FontFamily: asString(raw.h1FontFamily, DEFAULT_SETTINGS.h1FontFamily),
        h2FontFamily: asString(raw.h2FontFamily, DEFAULT_SETTINGS.h2FontFamily),
        h3FontFamily: asString(raw.h3FontFamily, DEFAULT_SETTINGS.h3FontFamily),
        h4FontFamily: asString(raw.h4FontFamily, DEFAULT_SETTINGS.h4FontFamily),
        h5FontFamily: asString(raw.h5FontFamily, DEFAULT_SETTINGS.h5FontFamily),
        h6FontFamily: asString(raw.h6FontFamily, DEFAULT_SETTINGS.h6FontFamily),
        h1FontSize: asNumber(raw.h1FontSize, DEFAULT_SETTINGS.h1FontSize),
        h2FontSize: asNumber(raw.h2FontSize, DEFAULT_SETTINGS.h2FontSize),
        h3FontSize: asNumber(raw.h3FontSize, DEFAULT_SETTINGS.h3FontSize),
        h4FontSize: asNumber(raw.h4FontSize, DEFAULT_SETTINGS.h4FontSize),
        h5FontSize: asNumber(raw.h5FontSize, DEFAULT_SETTINGS.h5FontSize),
        h6FontSize: asNumber(raw.h6FontSize, DEFAULT_SETTINGS.h6FontSize),
        pageBackgroundColor: asString(raw.pageBackgroundColor, DEFAULT_SETTINGS.pageBackgroundColor),
        fontSize: asNumber(raw.fontSize, DEFAULT_SETTINGS.fontSize),
        lineHeight: asNumber(raw.lineHeight, DEFAULT_SETTINGS.lineHeight),
        letterSpacing: asNumber(raw.letterSpacing, DEFAULT_SETTINGS.letterSpacing),
        paragraphSpacing: asNumber(raw.paragraphSpacing, DEFAULT_SETTINGS.paragraphSpacing),
        textIndent: asNumber(raw.textIndent, DEFAULT_SETTINGS.textIndent),
        suppressFirstParagraphIndent: asBoolean(raw.suppressFirstParagraphIndent, DEFAULT_SETTINGS.suppressFirstParagraphIndent),
        chapterTitleAlign: asEnum(raw.chapterTitleAlign, CHAPTER_TITLE_ALIGN, DEFAULT_SETTINGS.chapterTitleAlign),
        chapterTitleSpacing: asNumber(raw.chapterTitleSpacing, DEFAULT_SETTINGS.chapterTitleSpacing),
        chapterTitleDivider: asBoolean(raw.chapterTitleDivider, DEFAULT_SETTINGS.chapterTitleDivider),
        sceneBreakStyle: asEnum(raw.sceneBreakStyle, SCENE_BREAK_STYLES, DEFAULT_SETTINGS.sceneBreakStyle),
        imageMaxWidth: asNumber(raw.imageMaxWidth, DEFAULT_SETTINGS.imageMaxWidth),
        theme: asEnum(raw.theme, THEMES, DEFAULT_SETTINGS.theme),
        sectionTypography: {
            front: normalizeTypographyPreset(sectionTypography.front, DEFAULT_SETTINGS.sectionTypography.front),
            body: normalizeTypographyPreset(sectionTypography.body, DEFAULT_SETTINGS.sectionTypography.body),
            back: normalizeTypographyPreset(sectionTypography.back, DEFAULT_SETTINGS.sectionTypography.back),
        },
    }
}

function normalizeChapters(input: unknown): Chapter[] {
    if (!Array.isArray(input)) {
        throw new Error(i18n.t('projectManager.errors.missingChapters'))
    }
    return input.map((item, index) => {
        if (!isObject(item)) {
            throw new Error(i18n.t('projectManager.errors.invalidChapter', { index }))
        }
        const chapterType = asString(item.chapterType)
        const chapterContentType = asString(item.chapterContentType)
        const chapterTitleAlign = asString(item.chapterTitleAlign)
        return {
            id: asString(item.id, nanoid()),
            title: asString(item.title, i18n.t('editor.untitled')),
            content: isObject(item.content) ? item.content : { type: 'doc', content: [{ type: 'paragraph' }] },
            order: asNumber(item.order, index),
            fileName: asString(item.fileName, `chapter-${index + 1}.xhtml`),
            chapterType: CHAPTER_TYPES.includes(chapterType as ChapterType) ? (chapterType as ChapterType) : undefined,
            chapterKind: asOptionalString(item.chapterKind),
            chapterContentType: CHAPTER_CONTENT_TYPES.includes(chapterContentType as ChapterContentType)
                ? (chapterContentType as ChapterContentType)
                : undefined,
            parentId: typeof item.parentId === 'string' ? item.parentId : null,
            pageBackgroundColor: asOptionalString(item.pageBackgroundColor),
            fontFamily: asOptionalString(item.fontFamily),
            subheadFontFamily: asOptionalString(item.subheadFontFamily),
            titleFontFamily: asOptionalString(item.titleFontFamily),
            bodyFontSize: asOptionalNumber(item.bodyFontSize),
            subheadFontSize: asOptionalNumber(item.subheadFontSize),
            titleFontSize: asOptionalNumber(item.titleFontSize),
            chapterTitleAlign: CHAPTER_TITLE_ALIGN.includes(chapterTitleAlign as 'left' | 'center' | 'right')
                ? (chapterTitleAlign as 'left' | 'center' | 'right')
                : undefined,
            chapterTitleSpacing: asOptionalNumber(item.chapterTitleSpacing),
        }
    })
}

function normalizeMetadata(input: LegacyProjectMetadata | undefined): ProjectFile['metadata'] {
    const raw = input ?? { title: '', language: 'ko' }
    const normalizedIdentifierType =
        raw.identifierType === 'isbn' ||
        raw.identifierType === 'issn' ||
        raw.identifierType === 'uuid' ||
        raw.identifierType === 'asin' ||
        raw.identifierType === 'doi'
            ? raw.identifierType
            : 'isbn'
    const normalizedIdentifier = (raw.identifier ?? raw.isbn ?? '').trim()
    const authors =
        Array.isArray(raw.authors) && raw.authors.length > 0
            ? raw.authors
            : [
                {
                    id: nanoid(),
                    name: raw.author ?? '',
                    role: 'author' as const,
                },
            ]
    return {
        title: raw.title ?? '',
        subtitle: raw.subtitle ?? '',
        authors: authors.map((a) => ({
            id: a.id ?? nanoid(),
            name: a.name ?? '',
            role: CONTRIBUTOR_ROLES.includes(a.role) ? a.role : 'author',
            customRole: a.customRole ?? '',
        })),
        identifierType: normalizedIdentifierType,
        identifier: normalizedIdentifier,
        language: raw.language ?? 'ko',
        publisher: raw.publisher ?? '',
        isbn: normalizedIdentifierType === 'isbn' ? normalizedIdentifier : raw.isbn ?? '',
        publishDate: raw.publishDate ?? '',
        coverImage: raw.coverImage,
        backCoverImage: raw.backCoverImage,
        publisherLogo: raw.publisherLogo,
        link: raw.link ?? '',
        description: raw.description ?? '',
        imageAssets: isObject(raw.imageAssets)
            ? Object.fromEntries(
                Object.entries(raw.imageAssets)
                    .filter(([key, value]) => typeof key === 'string' && typeof value === 'string')
                    .map(([key, value]) => [key, value]),
            )
            : undefined,
    }
}

function isImageDataUrl(value: string): boolean {
    return value.startsWith('data:image/')
}

function isImageAssetRef(value: string): boolean {
    return value.startsWith(IMAGE_ASSET_URI_PREFIX)
}

function buildImageAssetRef(assetId: string): string {
    return `${IMAGE_ASSET_URI_PREFIX}${assetId}`
}

function parseImageAssetId(value: string): string | null {
    if (!isImageAssetRef(value)) return null
    const assetId = value.slice(IMAGE_ASSET_URI_PREFIX.length).trim()
    return assetId || null
}

function replaceImageDataUrlsWithRefs(
    node: unknown,
    resolveAssetId: (dataUrl: string) => string,
    markAssetRef: (assetId: string) => void,
): unknown {
    if (!isObject(node)) return node
    const nextNode: Record<string, unknown> = { ...node }
    if (nextNode.type === 'image' && isObject(nextNode.attrs) && typeof nextNode.attrs.src === 'string') {
        const src = nextNode.attrs.src
        if (isImageDataUrl(src)) {
            const assetId = resolveAssetId(src)
            nextNode.attrs = { ...nextNode.attrs, src: buildImageAssetRef(assetId) }
        } else {
            const assetId = parseImageAssetId(src)
            if (assetId) {
                markAssetRef(assetId)
            }
        }
    }
    if (Array.isArray(nextNode.content)) {
        nextNode.content = nextNode.content.map((child) =>
            replaceImageDataUrlsWithRefs(child, resolveAssetId, markAssetRef),
        )
    }
    if (Array.isArray(nextNode.marks)) {
        nextNode.marks = nextNode.marks.map((mark) =>
            replaceImageDataUrlsWithRefs(mark, resolveAssetId, markAssetRef),
        )
    }
    return nextNode
}

function resolveImageAssetRefs(node: unknown, assets: Record<string, string>): unknown {
    if (!isObject(node)) return node
    const nextNode: Record<string, unknown> = { ...node }
    if (nextNode.type === 'image' && isObject(nextNode.attrs) && typeof nextNode.attrs.src === 'string') {
        const assetId = parseImageAssetId(nextNode.attrs.src)
        if (assetId && typeof assets[assetId] === 'string') {
            nextNode.attrs = { ...nextNode.attrs, src: assets[assetId] }
        }
    }
    if (Array.isArray(nextNode.content)) {
        nextNode.content = nextNode.content.map((child) => resolveImageAssetRefs(child, assets))
    }
    if (Array.isArray(nextNode.marks)) {
        nextNode.marks = nextNode.marks.map((mark) => resolveImageAssetRefs(mark, assets))
    }
    return nextNode
}

function packImageAssets(project: ProjectFile): ProjectFile {
    const dataUrlToAssetId = new Map<string, string>()
    const existingAssets = isObject(project.metadata.imageAssets) ? project.metadata.imageAssets : {}
    const existingDataUrlToAssetId = new Map<string, string>()
    for (const [assetId, dataUrl] of Object.entries(existingAssets)) {
        if (
            typeof assetId === 'string' &&
            typeof dataUrl === 'string' &&
            isImageDataUrl(dataUrl) &&
            !existingDataUrlToAssetId.has(dataUrl)
        ) {
            existingDataUrlToAssetId.set(dataUrl, assetId)
        }
    }

    const resolveAssetId = (dataUrl: string): string => {
        const existing = dataUrlToAssetId.get(dataUrl)
        if (existing) return existing
        const reused = existingDataUrlToAssetId.get(dataUrl)
        const next = reused ?? nanoid()
        dataUrlToAssetId.set(dataUrl, next)
        return next
    }

    const markAssetRef = (assetId: string) => {
        const dataUrl = existingAssets[assetId]
        if (typeof dataUrl === 'string' && isImageDataUrl(dataUrl) && !dataUrlToAssetId.has(dataUrl)) {
            dataUrlToAssetId.set(dataUrl, assetId)
        }
    }

    const chapters = project.chapters.map((chapter) => {
        const nextContent = replaceImageDataUrlsWithRefs(
            chapter.content,
            resolveAssetId,
            markAssetRef,
        ) as Chapter['content']
        return { ...chapter, content: nextContent }
    })

    const assets: Record<string, string> = {}
    for (const [dataUrl, assetId] of dataUrlToAssetId.entries()) {
        assets[assetId] = dataUrl
    }

    return {
        ...project,
        metadata: {
            ...project.metadata,
            imageAssets: Object.keys(assets).length > 0 ? assets : undefined,
        },
        chapters,
    }
}

function unpackImageAssets(project: ProjectFile): ProjectFile {
    const assets = isObject(project.metadata.imageAssets) ? project.metadata.imageAssets : {}
    if (Object.keys(assets).length === 0) return project
    return {
        ...project,
        chapters: project.chapters.map((chapter) => ({
            ...chapter,
            content: resolveImageAssetRefs(chapter.content, assets) as Chapter['content'],
        })),
    }
}

export function serializeProject(data: ProjectFile): string {
    const packed = packImageAssets({ ...data, version: '0.1.0' })
    return JSON.stringify(packed, null, 2)
}

export function deserializeProject(raw: string): ProjectFile {
    const parsed = JSON.parse(raw) as Partial<ProjectFile>
    if (!parsed || typeof parsed !== 'object') {
        throw new Error(i18n.t('projectManager.errors.invalidProjectFormat'))
    }
    const chapters = normalizeChapters(parsed.chapters)
    const designSettings = normalizeDesignSettings(parsed.designSettings)

    const normalizedProject: ProjectFile = {
        version: parsed.version ?? '0.1.0',
        metadata: normalizeMetadata(parsed.metadata as LegacyProjectMetadata | undefined),
        chapters,
        designSettings,
    }
    return unpackImageAssets(normalizedProject)
}
