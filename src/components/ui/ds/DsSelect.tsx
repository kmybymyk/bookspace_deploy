import { forwardRef, type SelectHTMLAttributes } from 'react'

const DsSelect = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function DsSelect(
    { className = '', ...props },
    ref,
) {
    return <select ref={ref} className={`ds-control ds-select ${className}`} {...props} />
})

export default DsSelect
