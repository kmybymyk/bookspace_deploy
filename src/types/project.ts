import type { JSONContent } from '@tiptap/core'

export type ChapterType = 'front' | 'part' | 'chapter' | 'divider' | 'back' | 'uncategorized'
export type ChapterContentType = 'text' | 'image'
export type BookIdentifierType = 'isbn' | 'issn' | 'uuid' | 'asin' | 'doi'
export type ContributorRole =
    | 'author'
    | 'co-author'
    | 'editor'
    | 'translator'
    | 'illustrator'
    | 'narrator'
    | 'compiler'
    | 'adapter'
    | 'other'
export type LayoutSection = 'front' | 'body' | 'back'
export type ExportFormat = 'docx' | 'epub2' | 'epub3'
export type EpubExportVersion = '2.0' | '3.0'

export interface Contributor {
    id: string
    name: string
    role: ContributorRole
    customRole?: string
}

export interface Chapter {
    id: string
    title: string
    content: JSONContent // Tiptap JSON
    order: number
    fileName: string // EPUB 내 파일명 (예: chapter-1.xhtml)
    chapterType?: ChapterType
    chapterKind?: string
    chapterContentType?: ChapterContentType
    parentId?: string | null
    pageBackgroundColor?: string
    fontFamily?: string
    subheadFontFamily?: string
    titleFontFamily?: string
    bodyFontSize?: number
    subheadFontSize?: number
    titleFontSize?: number
    chapterTitleAlign?: 'left' | 'center' | 'right'
    chapterTitleSpacing?: number
}

export interface BookMetadata {
    title: string
    subtitle?: string
    authors: Contributor[]
    identifierType?: BookIdentifierType
    identifier?: string
    isbn?: string
    language: string
    coverImage?: string // base64 data URL (e.g. "data:image/jpeg;base64,...")
    backCoverImage?: string // base64 data URL (e.g. "data:image/jpeg;base64,...")
    publisher?: string
    publishDate?: string
    publisherLogo?: string // base64 data URL
    link?: string
    description?: string
    imageAssets?: Record<string, string> // key: asset id, value: data URL
}

export interface DesignSettings {
    fontFamily: string
    fontEmbedMode: 'none' | 'selected'
    h1FontFamily: string
    h2FontFamily: string
    h3FontFamily: string
    h4FontFamily: string
    h5FontFamily: string
    h6FontFamily: string
    h1FontSize: number
    h2FontSize: number
    h3FontSize: number
    h4FontSize: number
    h5FontSize: number
    h6FontSize: number
    pageBackgroundColor: string
    fontSize: number
    lineHeight: number
    letterSpacing: number
    paragraphSpacing: number
    textIndent: number
    suppressFirstParagraphIndent: boolean
    chapterTitleAlign: 'left' | 'center' | 'right'
    chapterTitleSpacing: number
    chapterTitleDivider: boolean
    sceneBreakStyle: 'line' | 'star' | 'diamond'
    imageMaxWidth: number
    theme: 'novel' | 'essay' | 'custom'
    sectionTypography: Record<LayoutSection, TypographyPreset>
}

export interface TypographyPreset {
    h1FontFamily: string
    h2FontFamily: string
    h3FontFamily: string
    h4FontFamily: string
    h5FontFamily: string
    h6FontFamily: string
    h1FontSize: number
    h2FontSize: number
    h3FontSize: number
    h4FontSize: number
    h5FontSize: number
    h6FontSize: number
}

export interface ProjectFile {
    version: string
    metadata: BookMetadata
    chapters: Chapter[]
    designSettings: DesignSettings
}
