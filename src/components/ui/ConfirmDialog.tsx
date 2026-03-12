import { useModalA11y } from '../../hooks/useModalA11y'
import i18n from '../../i18n'
import DsButton from './ds/DsButton'

interface ConfirmDialogProps {
    open: boolean
    title: string
    description?: string
    confirmLabel?: string
    cancelLabel?: string
    onConfirm: () => void
    onCancel: () => void
}

export default function ConfirmDialog({
    open,
    title,
    description,
    confirmLabel = i18n.t('common.confirm'),
    cancelLabel = i18n.t('common.cancel'),
    onConfirm,
    onCancel,
}: ConfirmDialogProps) {
    const { rootRef, dialogRef } = useModalA11y(open, onCancel)

    if (!open) return null

    return (
        <div
            ref={rootRef}
            data-bookspace-modal-root="true"
            className="ds-overlay fixed inset-0 z-[120] flex items-center justify-center p-4"
            onClick={onCancel}
        >
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-label={title}
                tabIndex={-1}
                className="ds-modal w-full max-w-md overflow-hidden shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="px-4 pt-4">
                    <h3 className="text-sm font-semibold text-[var(--ds-text-neutral-primary)]">{title}</h3>
                </div>
                {description ? (
                    <div className="px-4 pt-2">
                        <p className="whitespace-pre-line text-sm text-[var(--ds-text-neutral-secondary)]">{description}</p>
                    </div>
                ) : null}
                <div className="flex gap-2 px-4 pb-4 pt-4">
                    <DsButton onClick={onCancel} variant="secondary" className="flex-1">
                        {cancelLabel}
                    </DsButton>
                    <DsButton onClick={onConfirm} variant="primary" className="flex-1">
                        {confirmLabel}
                    </DsButton>
                </div>
            </div>
        </div>
    )
}
