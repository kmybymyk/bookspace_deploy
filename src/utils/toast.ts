export type ToastKind = 'info' | 'success' | 'error'

type ToastPayload = {
    message: string
    kind?: ToastKind
}

const TOAST_EVENT = 'bookspace:toast'

export function showToast(message: string, kind: ToastKind = 'info') {
    const payload: ToastPayload = { message, kind }
    window.dispatchEvent(new CustomEvent<ToastPayload>(TOAST_EVENT, { detail: payload }))
}

export function onToast(listener: (payload: ToastPayload) => void) {
    const handler = (event: Event) => {
        const customEvent = event as CustomEvent<ToastPayload>
        if (!customEvent.detail?.message) return
        listener(customEvent.detail)
    }
    window.addEventListener(TOAST_EVENT, handler)
    return () => window.removeEventListener(TOAST_EVENT, handler)
}
