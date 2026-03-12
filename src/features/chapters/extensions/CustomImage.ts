import Image from '@tiptap/extension-image'
import i18n from '../../../i18n'

function parseWidthPercent(value: unknown): number {
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) return 100
    return Math.max(10, Math.min(100, Math.round(numeric)))
}

function parseCaption(value: unknown): string | null {
    if (typeof value !== 'string') return null
    const normalized = value.replace(/\r\n/g, '\n')
    const trimmed = normalized.trim()
    return trimmed.length > 0 ? trimmed : null
}

function parseCaptionVisible(value: unknown, fallbackCaption: unknown): boolean {
    if (typeof value === 'boolean') return value
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase()
        if (normalized === 'true' || normalized === '1') return true
        if (normalized === 'false' || normalized === '0') return false
    }
    return parseCaption(fallbackCaption) !== null
}

export const CustomImage = Image.extend({
    name: 'image',

    addAttributes() {
        return {
            ...this.parent?.(),
            class: {
                default: 'img-center',
                parseHTML: (element) => element.getAttribute('class'),
                renderHTML: (attributes) => {
                    return {
                        class: attributes.class,
                    }
                },
            },
            title: {
                default: null,
                parseHTML: (element) => element.getAttribute('title'),
                renderHTML: (attributes) => {
                    return {
                        title: attributes.title,
                    }
                },
            },
            caption: {
                default: null,
                parseHTML: (element) => parseCaption(element.getAttribute('data-caption') ?? element.getAttribute('title')),
                renderHTML: (attributes) => {
                    const caption = parseCaption(attributes.caption ?? attributes.title)
                    return {
                        'data-caption': caption,
                        title: caption,
                    }
                },
            },
            captionVisible: {
                default: false,
                parseHTML: (element) =>
                    parseCaptionVisible(
                        element.getAttribute('data-caption-visible'),
                        element.getAttribute('data-caption') ?? element.getAttribute('title'),
                    ),
                renderHTML: (attributes) => ({
                    'data-caption-visible': parseCaptionVisible(attributes.captionVisible, attributes.caption) ? 'true' : null,
                }),
            },
            widthPercent: {
                default: 100,
                parseHTML: (element) => {
                    const dataValue = element.getAttribute('data-width-percent')
                    if (dataValue) return parseWidthPercent(dataValue)
                    const inlineWidth = element.style.width
                    const match = inlineWidth.match(/^(\d+(?:\.\d+)?)%$/)
                    if (match) return parseWidthPercent(match[1])
                    return 100
                },
                renderHTML: (attributes) => {
                    const widthPercent = parseWidthPercent(attributes.widthPercent)
                    return {
                        'data-width-percent': String(widthPercent),
                        style: `width:${widthPercent}%;max-width:100%;height:auto;`,
                    }
                },
            },
        }
    },

    addNodeView() {
        return ({ node, editor, getPos }) => {
            let currentNode = node
            const dom = document.createElement('figure')
            dom.className = 'book-editor-image'
            dom.contentEditable = 'false'

            const imageElement = document.createElement('img')
            imageElement.draggable = true

            const captionShell = document.createElement('figcaption')
            captionShell.className = 'book-editor-image-caption'

            const captionInput = document.createElement('textarea')
            captionInput.className = 'book-editor-image-caption-input'
            captionInput.rows = 1
            captionInput.placeholder = i18n.t('bubbleToolbar.image.captionPlaceholder', {
                defaultValue: '캡션 입력',
            })
            captionInput.setAttribute('aria-label', i18n.t('bubbleToolbar.image.captionAria', {
                defaultValue: 'Image caption',
            }))

            const autoResizeCaption = () => {
                captionInput.style.height = '0px'
                const nextHeight = Math.max(36, Math.min(captionInput.scrollHeight, 160))
                captionInput.style.height = `${nextHeight}px`
            }

            const updateNodeAttrs = (attrs: Record<string, unknown>) => {
                const pos = getPos()
                if (typeof pos !== 'number') return
                const transaction = editor.state.tr.setNodeMarkup(pos, undefined, {
                    ...currentNode.attrs,
                    ...attrs,
                })
                editor.view.dispatch(transaction)
            }

            const syncFromNode = (nextNode = currentNode) => {
                currentNode = nextNode
                const className = typeof nextNode.attrs?.class === 'string' ? nextNode.attrs.class : 'img-center'
                const src = typeof nextNode.attrs?.src === 'string' ? nextNode.attrs.src : ''
                const alt = typeof nextNode.attrs?.alt === 'string' ? nextNode.attrs.alt : ''
                const caption = String(nextNode.attrs?.caption ?? '').replace(/\r\n/g, '\n')
                const captionVisible = parseCaptionVisible(nextNode.attrs?.captionVisible, nextNode.attrs?.caption)
                const widthPercent = parseWidthPercent(nextNode.attrs?.widthPercent)

                dom.className = `book-editor-image ${className}`.trim()
                dom.style.width = `${widthPercent}%`
                dom.style.maxWidth = '100%'
                imageElement.src = src
                imageElement.alt = alt
                imageElement.style.width = '100%'
                imageElement.style.maxWidth = '100%'
                imageElement.style.height = 'auto'
                captionInput.value = caption
                captionShell.style.display = captionVisible ? 'block' : 'none'
                captionShell.dataset.empty = caption.length === 0 ? 'true' : 'false'
                autoResizeCaption()
            }

            syncFromNode()

            const handleSelect = (event: Event) => {
                event.preventDefault()
                const pos = getPos()
                if (typeof pos !== 'number') return
                editor.chain().focus().setNodeSelection(pos).run()
            }

            const handleCaptionInput = () => {
                const nextCaption = parseCaption(captionInput.value)
                captionShell.dataset.empty = nextCaption ? 'false' : 'true'
                autoResizeCaption()
                updateNodeAttrs({
                    caption: nextCaption,
                    title: nextCaption,
                    captionVisible: true,
                })
            }

            const focusCaptionInput = () => {
                const pos = getPos()
                if (typeof pos === 'number') {
                    editor.chain().focus().setNodeSelection(pos).run()
                }
                window.requestAnimationFrame(() => {
                    captionInput.focus()
                    const valueLength = captionInput.value.length
                    captionInput.setSelectionRange(valueLength, valueLength)
                })
            }

            const handleCaptionMouseDown = (event: MouseEvent) => {
                event.preventDefault()
                event.stopPropagation()
                focusCaptionInput()
            }

            const handleCaptionFocus = () => {
                captionShell.classList.add('is-editing')
            }

            const handleCaptionBlur = () => {
                captionShell.classList.remove('is-editing')
                captionShell.dataset.empty = parseCaption(captionInput.value) ? 'false' : 'true'
            }

            imageElement.addEventListener('mousedown', handleSelect)
            dom.addEventListener('mousedown', handleSelect)
            captionShell.addEventListener('mousedown', handleCaptionMouseDown)
            captionInput.addEventListener('mousedown', (event) => {
                event.stopPropagation()
            })
            captionInput.addEventListener('keydown', (event) => event.stopPropagation())
            captionInput.addEventListener('input', handleCaptionInput)
            captionInput.addEventListener('focus', handleCaptionFocus)
            captionInput.addEventListener('blur', handleCaptionBlur)

            captionShell.append(captionInput)
            dom.append(imageElement, captionShell)

            return {
                dom,
                update: (updatedNode) => {
                    if (updatedNode.type.name !== 'image') return false
                    syncFromNode(updatedNode)
                    return true
                },
                selectNode: () => {
                    dom.classList.add('ProseMirror-selectednode')
                },
                deselectNode: () => {
                    dom.classList.remove('ProseMirror-selectednode')
                },
                stopEvent: (event) => event.target === captionInput,
                ignoreMutation: (mutation) => mutation.target === captionInput,
                destroy: () => {
                    imageElement.removeEventListener('mousedown', handleSelect)
                    dom.removeEventListener('mousedown', handleSelect)
                    captionShell.removeEventListener('mousedown', handleCaptionMouseDown)
                    captionInput.removeEventListener('input', handleCaptionInput)
                    captionInput.removeEventListener('focus', handleCaptionFocus)
                    captionInput.removeEventListener('blur', handleCaptionBlur)
                },
            }
        }
    },
})
