import type { ReactNode } from 'react'

interface DsFieldProps {
    label: string
    htmlFor?: string
    hint?: string
    error?: string
    children: ReactNode
    className?: string
}

export default function DsField({ label, htmlFor, hint, error, children, className = '' }: DsFieldProps) {
    return (
        <label className={`ds-field ${className}`} htmlFor={htmlFor}>
            <span className="ds-label">{label}</span>
            {children}
            {error ? <span className="ds-error">{error}</span> : null}
            {!error && hint ? <span className="ds-hint">{hint}</span> : null}
        </label>
    )
}
