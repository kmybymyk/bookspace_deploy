import type { ButtonHTMLAttributes } from 'react'

type DsButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger-ghost'
type DsButtonSize = 'sm' | 'md'

interface DsButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: DsButtonVariant
    size?: DsButtonSize
    loading?: boolean
}

export default function DsButton({
    className = '',
    variant = 'secondary',
    size = 'md',
    type = 'button',
    loading = false,
    disabled,
    ...props
}: DsButtonProps) {
    const sizeClass = size === 'sm' ? 'ds-button--sm' : ''
    return (
        <button
            type={type}
            className={`ds-button ds-button--${variant} ${sizeClass} ${className}`}
            data-loading={loading ? 'true' : 'false'}
            aria-busy={loading}
            disabled={disabled || loading}
            {...props}
        />
    )
}
