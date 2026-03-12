import { TextSelection } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { useMemo, useRef } from 'react'

export function useBookEditorProps() {
    const imeComposingRef = useRef(false)
    const imeCompositionEndedAtRef = useRef(0)

    const editorProps = useMemo(
        () => ({
            attributes: {
                class: 'prose max-w-none w-full focus:outline-none py-4 pr-8',
                spellcheck: 'false',
                autocorrect: 'off',
                autocapitalize: 'off',
            },
            handleDOMEvents: {
                beforeinput: (view: EditorView, event: InputEvent) => {
                    if (
                        event?.inputType === 'insertText' &&
                        (event.data === '"' || event.data === '“' || event.data === '”')
                    ) {
                        event.preventDefault()
                        const { from, to } = view.state.selection
                        const prevChar =
                            from > 1 ? view.state.doc.textBetween(from - 1, from, '\n', '\n') : ''
                        const isOpening = !prevChar || /[\s([{\-—–“‘«「『]/.test(prevChar)
                        const quoteChar = isOpening ? '“' : '”'
                        view.dispatch(view.state.tr.insertText(quoteChar, from, to))
                        return true
                    }

                    const { from } = view.state.selection
                    const node = view.state.doc.resolve(from).parent
                    if (node?.type?.name !== 'paragraph') return false
                    if (node?.attrs?.dataNotePlaceholder !== 'true') return false

                    const pos = view.state.selection.$from.before()
                    const tr = view.state.tr
                        .setNodeMarkup(pos, undefined, {
                            ...node.attrs,
                            dataNotePlaceholder: null,
                        })
                        .delete(view.state.selection.$from.start(), view.state.selection.$from.end())
                    view.dispatch(tr)
                    return false
                },
                compositionstart: () => {
                    imeComposingRef.current = true
                    return false
                },
                compositionend: () => {
                    imeComposingRef.current = false
                    imeCompositionEndedAtRef.current = Date.now()
                    return false
                },
            },
            handleTextInput: (view: EditorView, from: number, to: number, text: string) => {
                if (text !== '"' && text !== '“' && text !== '”') return false
                const prevChar = from > 1 ? view.state.doc.textBetween(from - 1, from, '\n', '\n') : ''
                const isOpening = !prevChar || /[\s([{\-—–“‘«「『]/.test(prevChar)
                const quoteChar = isOpening ? '“' : '”'
                view.dispatch(view.state.tr.insertText(quoteChar, from, to))
                return true
            },
            handleKeyDown: (view: EditorView, event: KeyboardEvent) => {
                if (event.key !== 'Enter' || event.isComposing || imeComposingRef.current) {
                    return false
                }

                const justEndedComposition = Date.now() - imeCompositionEndedAtRef.current < 300
                if (!justEndedComposition || view.state.selection.empty) {
                    return false
                }

                // Korean IME can leave the last syllable selected on Enter.
                // Collapse to cursor first so default Enter behavior splits line instead of deleting selection.
                const tr = view.state.tr.setSelection(
                    TextSelection.create(view.state.doc, view.state.selection.to)
                )
                view.dispatch(tr)
                return false
            },
        }),
        [],
    )

    return {
        editorProps,
        imeComposingRef,
    }
}
