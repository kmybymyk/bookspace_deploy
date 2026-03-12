import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { onToast, type ToastKind } from '../../utils/toast'
import DsButton from './ds/DsButton'

type ToastItem = {
    id: string
    message: string
    kind: ToastKind
}

export default function ToastViewport() {
    const { t } = useTranslation()
    const [items, setItems] = useState<ToastItem[]>([])
    const dismissTimeoutsRef = useRef(new Map<string, number>())

    const dismissToast = useCallback((id: string) => {
        setItems((prev) => prev.filter((item) => item.id !== id))
        const timeoutId = dismissTimeoutsRef.current.get(id)
        if (timeoutId !== undefined) {
            window.clearTimeout(timeoutId)
            dismissTimeoutsRef.current.delete(id)
        }
    }, [])

    useEffect(() => {
        const timeoutMap = dismissTimeoutsRef.current
        const unsubscribe = onToast(({ message, kind = 'info' }) => {
            const id = `${Date.now()}-${Math.random()}`
            setItems((prev) => [...prev, { id, message, kind }])
            const durationMs = kind === 'error' ? 6500 : kind === 'success' ? 3200 : 4200
            const timeoutId = window.setTimeout(() => {
                setItems((prev) => prev.filter((item) => item.id !== id))
                dismissTimeoutsRef.current.delete(id)
            }, durationMs)
            dismissTimeoutsRef.current.set(id, timeoutId)
        })
        return () => {
            unsubscribe()
            for (const timeoutId of timeoutMap.values()) {
                window.clearTimeout(timeoutId)
            }
            timeoutMap.clear()
        }
    }, [dismissToast])

    if (items.length === 0) return null

    return (
        <div className="fixed top-12 right-4 z-[90] flex flex-col gap-2 pointer-events-none">
            {items.map((item) => {
                const colorClass =
                    item.kind === 'success'
                        ? 'ds-toast--success'
                        : item.kind === 'error'
                            ? 'ds-toast--error'
                            : 'ds-toast'
                return (
                    <div
                        key={item.id}
                        className={`pointer-events-auto min-w-64 max-w-[28rem] border px-3 py-2 shadow-xl text-sm whitespace-pre-line ${colorClass}`}
                        role={item.kind === 'error' ? 'alert' : 'status'}
                    >
                        <div className="flex items-start gap-2">
                            <div className="flex-1">{item.message}</div>
                            <DsButton
                                onClick={() => dismissToast(item.id)}
                                variant="ghost"
                                size="sm"
                                className="shrink-0 px-1.5 py-0.5"
                                aria-label={t('toast.close')}
                                title={t('common.close')}
                            >
                                ×
                            </DsButton>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
