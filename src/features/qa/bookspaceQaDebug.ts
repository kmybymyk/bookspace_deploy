import { useChapterStore } from '../chapters/useChapterStore'
import { readPageById } from '../copilot/editorToolAdapter'
import { buildPageStructureSnapshot, resolvePromptPageReference } from '../copilot/pageReferenceResolver'

export interface BookspaceQaDebugApi {
    getChapterSnapshot: () => Array<{
        id: string
        title: string
        chapterType?: string
        chapterKind?: string
    }>
    getPageStructure: () => ReturnType<typeof buildPageStructureSnapshot>
    getPageText: (chapterId: string) => string
    resolvePromptPageReference: (prompt: string) => ReturnType<typeof resolvePromptPageReference>
}

function createBookspaceQaDebugApi(): BookspaceQaDebugApi {
    return {
        getChapterSnapshot: () =>
            useChapterStore.getState().chapters.map((chapter) => ({
                id: chapter.id,
                title: chapter.title,
                chapterType: chapter.chapterType,
                chapterKind: chapter.chapterKind,
            })),
        getPageStructure: () => {
            const chapterState = useChapterStore.getState()
            return buildPageStructureSnapshot({
                chapters: chapterState.chapters,
                activeChapterId: chapterState.activeChapterId,
            })
        },
        getPageText: (chapterId: string) => readPageById(chapterId)?.text ?? '',
        resolvePromptPageReference: (prompt: string) => {
            const chapterState = useChapterStore.getState()
            return resolvePromptPageReference(
                prompt,
                buildPageStructureSnapshot({
                    chapters: chapterState.chapters,
                    activeChapterId: chapterState.activeChapterId,
                }),
            )
        },
    }
}

export function shouldEnableBookspaceQaDebug() {
    return import.meta.env.DEV || window.electronAPI.isQaDebugEnabled()
}

export function registerBookspaceQaDebug() {
    if (!shouldEnableBookspaceQaDebug()) {
        return () => undefined
    }
    const qaWindow = window as Window & {
        __bookspaceQaDebug?: BookspaceQaDebugApi | undefined
    }
    qaWindow.__bookspaceQaDebug = createBookspaceQaDebugApi()
    return () => {
        qaWindow.__bookspaceQaDebug = undefined
    }
}
