import { create } from 'zustand'
import { nanoid } from 'nanoid'
import { Chapter, ChapterContentType, ChapterType } from '../../types/project'
import { useProjectStore } from '../../store/projectStore'
import type { JSONContent } from '@tiptap/core'
import i18n from '../../i18n'

function createChapterFileName(id: string) {
    return `chapter-${id}.xhtml`
}

function sanitizeChapterFileName(value: string | undefined, fallbackId: string): string {
    const raw = String(value ?? '').trim()
    const base = raw.replace(/\.[^.]+$/, '')
    const normalized = base
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^[-_]+|[-_]+$/g, '')
    const safeBase = normalized || `chapter-${fallbackId}`
    return `${safeBase}.xhtml`
}

function normalizeIncomingChapters(chapters: Chapter[]) {
    const usedIds = new Set<string>()
    const used = new Set<string>()
    const idMap = new Map<string, string>()
    const withUniqueIds = chapters.map((chapter, index) => {
        let id = chapter.id
        if (!id || usedIds.has(id)) {
            id = nanoid()
        }
        usedIds.add(id)
        idMap.set(chapter.id, id)
        return { ...chapter, id, order: index }
    })

    return withUniqueIds.map((chapter) => {
        let fileName = sanitizeChapterFileName(chapter.fileName, chapter.id)
        while (used.has(fileName)) {
            fileName = sanitizeChapterFileName(undefined, nanoid(10))
        }
        used.add(fileName)
        const parentId = chapter.parentId ? (idMap.get(chapter.parentId) ?? null) : null
        return { ...chapter, fileName, parentId }
    })
}

interface ChapterStore {
    chapters: Chapter[]
    activeChapterId: string | null
    // Actions
    setChapters: (chapters: Chapter[]) => void
    addChapter: (
        title?: string,
        options?: { chapterType?: ChapterType; chapterContentType?: ChapterContentType; parentId?: string | null },
    ) => void
    deleteChapter: (id: string) => void
    renameChapter: (id: string, title: string) => void
    updateContent: (id: string, content: JSONContent) => void
    setActiveChapter: (id: string) => void
    reorderChapters: (from: number, to: number) => void
    moveChapter: (chapterId: string, toIndex: number, parentId?: string | null) => void
    setChapterType: (id: string, chapterType: ChapterType) => void
    setChapterKind: (id: string, chapterKind?: string) => void
    setChapterContentType: (id: string, chapterContentType: ChapterContentType) => void
    setChapterPageBackground: (id: string, pageBackgroundColor?: string) => void
    setChapterStyle: (
        id: string,
        patch: Partial<
            Pick<
                Chapter,
                | 'fontFamily'
                | 'subheadFontFamily'
                | 'titleFontFamily'
                | 'bodyFontSize'
                | 'subheadFontSize'
                | 'titleFontSize'
                | 'chapterTitleAlign'
                | 'chapterTitleSpacing'
            >
        >,
    ) => void
}

export const useChapterStore = create<ChapterStore>((set) => ({
    chapters: [],
    activeChapterId: null,

    setChapters: (chapters) =>
        set((state) => {
            const normalized = normalizeIncomingChapters(chapters)
            const activeChapterId = normalized.some((c) => c.id === state.activeChapterId)
                ? state.activeChapterId
                : (normalized[0]?.id ?? null)
            return { chapters: normalized, activeChapterId }
        }),

    addChapter: (title = i18n.t('editor.untitled'), options) =>
        set((state) => {
            const id = nanoid()
            const chapterType = options?.chapterType ?? 'uncategorized'
            const chapterContentType = options?.chapterContentType ?? 'text'
            const newChapter: Chapter = {
                id,
                title,
                content: { type: 'doc', content: [{ type: 'paragraph' }] },
                order: state.chapters.length,
                fileName: createChapterFileName(id),
                chapterType,
                chapterContentType,
                parentId: options?.parentId ?? null,
            }
            return {
                chapters: [...state.chapters, newChapter],
                activeChapterId: newChapter.id,
            }
        }),

    deleteChapter: (id) =>
        set((state) => {
            const filtered = state.chapters
                .filter((c) => c.id !== id)
                .map((c) => (c.parentId === id ? { ...c, parentId: null } : c))
                .map((c, i) => ({ ...c, order: i }))
            const newActive =
                state.activeChapterId === id
                    ? (filtered[0]?.id ?? null)
                    : state.activeChapterId
            return { chapters: filtered, activeChapterId: newActive }
        }),

    renameChapter: (id, title) =>
        set((state) => ({
            chapters: state.chapters.map((c) => (c.id === id ? { ...c, title } : c)),
        })),

    updateContent: (id, content) =>
        set((state) => ({
            chapters: state.chapters.map((c) =>
                c.id === id ? { ...c, content } : c
            ),
        })),

    setActiveChapter: (id) => set({ activeChapterId: id }),

    reorderChapters: (from, to) =>
        set((state) => {
            const arr = [...state.chapters]
            const [moved] = arr.splice(from, 1)
            arr.splice(to, 0, moved)
            return { chapters: arr.map((c, i) => ({ ...c, order: i })) }
        }),

    moveChapter: (chapterId, toIndex, parentId = null) =>
        set((state) => {
            const sorted = [...state.chapters].sort((a, b) => a.order - b.order)
            const fromIndex = sorted.findIndex((c) => c.id === chapterId)
            if (fromIndex < 0) return state

            const [moved] = sorted.splice(fromIndex, 1)
            const clampedTo = Math.max(0, Math.min(toIndex, sorted.length))
            const parent = parentId ? sorted.find((c) => c.id === parentId) : null
            const normalizedParentId =
                parentId && parentId !== chapterId && parent && (parent.chapterType ?? 'chapter') === 'part'
                    ? parentId
                    : null
            sorted.splice(clampedTo, 0, { ...moved, parentId: normalizedParentId })
            return { chapters: sorted.map((c, i) => ({ ...c, order: i })) }
        }),

    setChapterType: (id, chapterType) =>
        set((state) => ({
            chapters: state.chapters.map((c) => (c.id === id ? { ...c, chapterType } : c)),
        })),

    setChapterKind: (id, chapterKind) =>
        set((state) => ({
            chapters: state.chapters.map((c) => (c.id === id ? { ...c, chapterKind } : c)),
        })),

    setChapterContentType: (id, chapterContentType) =>
        set((state) => ({
            chapters: state.chapters.map((c) => (c.id === id ? { ...c, chapterContentType } : c)),
        })),

    setChapterPageBackground: (id, pageBackgroundColor) =>
        set((state) => ({
            chapters: state.chapters.map((c) => (c.id === id ? { ...c, pageBackgroundColor } : c)),
        })),

    setChapterStyle: (id, patch) =>
        set((state) => ({
            chapters: state.chapters.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        })),
}))

useChapterStore.subscribe((state, prev) => {
    if (state.chapters !== prev.chapters) {
        useProjectStore.getState().setDirty(true)
    }
})
