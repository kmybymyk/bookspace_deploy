import { create } from 'zustand'

export type SaveErrorSource = 'manual' | 'autosave'

interface SaveFeedbackState {
    errorMessage: string | null
    errorSource: SaveErrorSource | null
    updatedAt: string | null
    setSaveError: (message: string, source: SaveErrorSource) => void
    clearSaveError: () => void
}

export const useSaveFeedbackStore = create<SaveFeedbackState>((set) => ({
    errorMessage: null,
    errorSource: null,
    updatedAt: null,
    setSaveError: (message, source) =>
        set({
            errorMessage: message,
            errorSource: source,
            updatedAt: new Date().toISOString(),
        }),
    clearSaveError: () =>
        set({
            errorMessage: null,
            errorSource: null,
            updatedAt: null,
        }),
}))
