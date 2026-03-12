import { useModalA11y } from '../../hooks/useModalA11y'
import DsButton from './ds/DsButton'

interface ThreeWayConfirmDialogProps {
    open: boolean
    title: string
    description?: string
    primaryLabel: string
    secondaryLabel: string
    cancelLabel: string
    onPrimary: () => void
    onSecondary: () => void
    onCancel: () => void
}

export default function ThreeWayConfirmDialog({
    open,
    title,
    description,
    primaryLabel,
    secondaryLabel,
    cancelLabel,
    onPrimary,
    onSecondary,
    onCancel,
}: ThreeWayConfirmDialogProps) {
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
                onClick={(event) => event.stopPropagation()}
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
                    <DsButton onClick={onCancel} variant="ghost" className="flex-1">
                        {cancelLabel}
                    </DsButton>
                    <DsButton onClick={onSecondary} variant="secondary" className="flex-1">
                        {secondaryLabel}
                    </DsButton>
                    <DsButton onClick={onPrimary} variant="primary" className="flex-1">
                        {primaryLabel}
                    </DsButton>
                </div>
            </div>
        </div>
    )
}
