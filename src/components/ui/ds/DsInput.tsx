import { forwardRef, type InputHTMLAttributes } from 'react'

const DsInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function DsInput(
    { className = '', ...props },
    ref,
) {
    return <input ref={ref} className={`ds-control ${className}`} {...props} />
})

export default DsInput
