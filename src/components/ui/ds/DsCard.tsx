import type { ReactNode } from 'react'

interface DsCardProps {
    title?: string
    action?: ReactNode
    className?: string
    children: ReactNode
}

export default function DsCard({ title, action, className = '', children }: DsCardProps) {
    return (
        <section className={`ds-card ${className}`}>
            {title || action ? (
                <div className="mb-3 flex items-center justify-between gap-3">
                    {title ? <h3 className="ds-card-title">{title}</h3> : <span />}
                    {action}
                </div>
            ) : null}
            {children}
        </section>
    )
}
