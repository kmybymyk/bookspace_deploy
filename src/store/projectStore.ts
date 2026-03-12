import { nanoid } from 'nanoid'
import { create } from 'zustand'
import type { BookMetadata } from '../types/project'

const DEFAULT_METADATA: BookMetadata = {
    title: '',
    subtitle: '',
    authors: [{ id: nanoid(), name: '', role: 'author' }],
    identifierType: 'isbn',
    identifier: '',
    language: 'ko',
    publisher: '',
    isbn: '',
    link: '',
    description: '',
}

interface ProjectStore {
    projectPath: string | null
    projectSessionId: string
    isDirty: boolean
    metadata: BookMetadata
    setProjectPath: (path: string | null) => void
    rotateProjectSessionId: () => string
    setDirty: (dirty: boolean) => void
    setMetadata: (metadata: BookMetadata) => void
    updateMetadata: (patch: Partial<BookMetadata>) => void
    setCoverImage: (coverImage: string | undefined) => void
    setBackCoverImage: (backCoverImage: string | undefined) => void
    setPublisherLogo: (publisherLogo: string | undefined) => void
}

export const useProjectStore = create<ProjectStore>((set) => ({
    projectPath: null,
    projectSessionId: nanoid(),
    isDirty: false,
    metadata: DEFAULT_METADATA,
    setProjectPath: (path) => set({ projectPath: path }),
    rotateProjectSessionId: () => {
        const next = nanoid()
        set({ projectSessionId: next })
        return next
    },
    setDirty: (dirty) => set({ isDirty: dirty }),
    setMetadata: (metadata) => set(() => ({ metadata: { ...metadata }, isDirty: true })),
    updateMetadata: (patch) =>
        set((state) => ({ metadata: { ...state.metadata, ...patch }, isDirty: true })),
    setCoverImage: (coverImage) =>
        set((state) => ({ metadata: { ...state.metadata, coverImage }, isDirty: true })),
    setBackCoverImage: (backCoverImage) =>
        set((state) => ({ metadata: { ...state.metadata, backCoverImage }, isDirty: true })),
    setPublisherLogo: (publisherLogo) =>
        set((state) => ({ metadata: { ...state.metadata, publisherLogo }, isDirty: true })),
}))
