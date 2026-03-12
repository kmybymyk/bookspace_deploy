import { useEffect, useRef } from 'react'

const MODAL_ROOT_SELECTOR = '[data-bookspace-modal-root="true"]'
const FOCUSABLE_SELECTOR = [
    'button:not([disabled])',
    '[href]',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(', ')

let openModalCount = 0
let previousBodyOverflow = ''

function getFocusableElements(container: HTMLElement): HTMLElement[] {
    return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
}

function isTopMostModal(root: HTMLElement) {
    const roots = Array.from(document.querySelectorAll<HTMLElement>(MODAL_ROOT_SELECTOR))
    return roots.length > 0 && roots[roots.length - 1] === root
}

export function useModalA11y(open: boolean, onClose: () => void) {
    const rootRef = useRef<HTMLDivElement | null>(null)
    const dialogRef = useRef<HTMLDivElement | null>(null)
    const onCloseRef = useRef(onClose)

    useEffect(() => {
        onCloseRef.current = onClose
    }, [onClose])

    useEffect(() => {
        if (!open) return

        const rootEl = rootRef.current
        const dialogEl = dialogRef.current
        if (!rootEl || !dialogEl) return

        openModalCount += 1
        if (openModalCount === 1) {
            previousBodyOverflow = document.body.style.overflow
            document.body.style.overflow = 'hidden'
        }

        const previousActive = document.activeElement as HTMLElement | null
        const focusables = getFocusableElements(dialogEl)
        const initialTarget = focusables[0] ?? dialogEl
        initialTarget.focus()

        const handleKeyDown = (event: KeyboardEvent) => {
            if (!isTopMostModal(rootEl)) return

            if (event.key === 'Escape') {
                event.preventDefault()
                onCloseRef.current()
                return
            }

            if (event.key !== 'Tab') return

            const currentFocusable = getFocusableElements(dialogEl)
            if (currentFocusable.length === 0) {
                event.preventDefault()
                dialogEl.focus()
                return
            }

            const first = currentFocusable[0]
            const last = currentFocusable[currentFocusable.length - 1]
            const active = document.activeElement as HTMLElement | null

            if (event.shiftKey) {
                if (!active || active === first || !dialogEl.contains(active)) {
                    event.preventDefault()
                    last.focus()
                }
                return
            }

            if (!active || active === last || !dialogEl.contains(active)) {
                event.preventDefault()
                first.focus()
            }
        }

        document.addEventListener('keydown', handleKeyDown)

        return () => {
            document.removeEventListener('keydown', handleKeyDown)
            if (openModalCount > 0) openModalCount -= 1
            if (openModalCount === 0) {
                document.body.style.overflow = previousBodyOverflow
            }
            previousActive?.focus?.()
        }
    }, [open])

    return { rootRef, dialogRef }
}
