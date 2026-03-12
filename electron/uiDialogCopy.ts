export type UiLocale = 'ko' | 'en'
export type UnsavedDialogContext = 'continue' | 'quit'

type DialogCopy = {
    title: string
    message: string
    detail: string
    buttons: [string, string, string]
}

const UNSAVED_DIALOG_COPY: Record<UiLocale, Record<UnsavedDialogContext, DialogCopy>> = {
    ko: {
        continue: {
            title: 'BookSpace',
            message: '저장되지 않은 변경사항이 있습니다.',
            detail: '계속하기 전에 저장할까요?',
            buttons: ['저장 후 계속', '저장 안 함', '취소'],
        },
        quit: {
            title: 'BookSpace',
            message: '저장되지 않은 변경사항이 있습니다.',
            detail: '종료 전에 저장할까요?',
            buttons: ['저장 후 종료', '저장 안 함', '취소'],
        },
    },
    en: {
        continue: {
            title: 'BookSpace',
            message: 'You have unsaved changes.',
            detail: 'Do you want to save before continuing?',
            buttons: ['Save and Continue', "Don't Save", 'Cancel'],
        },
        quit: {
            title: 'BookSpace',
            message: 'You have unsaved changes.',
            detail: 'Do you want to save before quitting?',
            buttons: ['Save and Quit', "Don't Save", 'Cancel'],
        },
    },
}

export function resolveUiLocale(rawLocale: string | undefined): UiLocale {
    return String(rawLocale ?? '').toLowerCase().startsWith('ko') ? 'ko' : 'en'
}

export function getUnsavedDialogCopy(locale: UiLocale, context: UnsavedDialogContext): DialogCopy {
    return UNSAVED_DIALOG_COPY[locale][context]
}
