import { forwardRef, type TextareaHTMLAttributes } from 'react'

const DsTextarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function DsTextarea(
    { className = '', ...props },
    ref,
) {
    return <textarea ref={ref} className={`ds-control ds-textarea ${className}`} {...props} />
})

export default DsTextarea
