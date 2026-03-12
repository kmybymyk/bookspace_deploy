import type { Editor } from '@tiptap/react'
import { NodeSelection } from '@tiptap/pm/state'
import { useEffect, useId, useState } from 'react'
import i18n from '../../../i18n'
import { showToast } from '../../../utils/toast'

const TABLE_MIN_VISIBLE_CELL_WIDTH = 72
const TABLE_MAX_COLUMNS_FALLBACK = 8
const TABLE_FEATURE_ENABLED = false

interface Props {
    editor: Editor
}

type FormatItem = {
    label: string
    isActive: () => boolean
    action: () => void
    ariaLabel: string
    title?: string
}

type LinkEditorState = {
    open: boolean
    from: number
    to: number
    href: string
}

const IMAGE_WIDTH_PRESETS = [25, 50, 75, 100] as const

export default function BubbleToolbar({ editor }: Props) {
    const [, setSelectionVersion] = useState(0)
    const [linkEditor, setLinkEditor] = useState<LinkEditorState>({
        open: false,
        from: 0,
        to: 0,
        href: 'https://',
    })

    useEffect(() => {
        const refresh = () => setSelectionVersion((v) => v + 1)
        editor.on('selectionUpdate', refresh)
        editor.on('transaction', refresh)
        editor.on('focus', refresh)
        editor.on('blur', refresh)
        return () => {
            editor.off('selectionUpdate', refresh)
            editor.off('transaction', refresh)
            editor.off('focus', refresh)
            editor.off('blur', refresh)
        }
    }, [editor])

    const hasSelection = !editor.state.selection.empty
    const hasLinkOnSelection = hasSelection && editor.isActive('link')
    const canLink = hasSelection
    const canUnlink = hasSelection && hasLinkOnSelection
    const linkTargetInputId = useId()
    const alignLeftShort = i18n.t('bubbleToolbar.align.leftShort')
    const alignCenterShort = i18n.t('bubbleToolbar.align.centerShort')
    const alignRightShort = i18n.t('bubbleToolbar.align.rightShort')
    const alignLeftTitle = i18n.t('bubbleToolbar.align.leftTitle', {
        defaultValue: 'Align left',
    })
    const alignCenterTitle = i18n.t('bubbleToolbar.align.centerTitle', {
        defaultValue: 'Align center',
    })
    const alignRightTitle = i18n.t('bubbleToolbar.align.rightTitle', {
        defaultValue: 'Align right',
    })

    const formats: FormatItem[] = [
        {
            label: 'B',
            isActive: () => editor.isActive('bold'),
            action: () => editor.chain().focus().toggleBold().run(),
            ariaLabel: i18n.t('bubbleToolbar.bold', { defaultValue: 'Bold' }),
            title: i18n.t('bubbleToolbar.bold', { defaultValue: 'Bold' }),
        },
        {
            label: 'I',
            isActive: () => editor.isActive('italic'),
            action: () => editor.chain().focus().toggleItalic().run(),
            ariaLabel: i18n.t('bubbleToolbar.italic', { defaultValue: 'Italic' }),
            title: i18n.t('bubbleToolbar.italic', { defaultValue: 'Italic' }),
        },
        {
            label: 'S',
            isActive: () => editor.isActive('strike'),
            action: () => editor.chain().focus().toggleStrike().run(),
            ariaLabel: i18n.t('bubbleToolbar.strike', { defaultValue: 'Strike' }),
            title: i18n.t('bubbleToolbar.strike', { defaultValue: 'Strike' }),
        },
    ]

    const setAligned = (align: 'left' | 'center' | 'right') => {
        editor.chain().focus().setTextAlign(align).run()
        if (editor.isActive('blockquote')) {
            editor.chain().focus().updateAttributes('blockquote', { textAlign: align }).run()
        }
    }

    const alignments: FormatItem[] = [
        {
            label: alignLeftShort,
            isActive: () => editor.isActive({ textAlign: 'left' }),
            action: () => setAligned('left'),
            ariaLabel: alignLeftTitle,
            title: alignLeftTitle,
        },
        {
            label: alignCenterShort,
            isActive: () => editor.isActive({ textAlign: 'center' }),
            action: () => setAligned('center'),
            ariaLabel: alignCenterTitle,
            title: alignCenterTitle,
        },
        {
            label: alignRightShort,
            isActive: () => editor.isActive({ textAlign: 'right' }),
            action: () => setAligned('right'),
            ariaLabel: alignRightTitle,
            title: alignRightTitle,
        },
    ]
    const scripts: FormatItem[] = [
        {
            label: 'sup',
            isActive: () => editor.isActive('superscript'),
            action: () => editor.chain().focus().unsetSubscript().toggleSuperscript().run(),
            ariaLabel: i18n.t('bubbleToolbar.superscript', { defaultValue: 'Superscript' }),
            title: i18n.t('bubbleToolbar.superscript', { defaultValue: 'Superscript' }),
        },
        {
            label: 'sub',
            isActive: () => editor.isActive('subscript'),
            action: () => editor.chain().focus().unsetSuperscript().toggleSubscript().run(),
            ariaLabel: i18n.t('bubbleToolbar.subscript', { defaultValue: 'Subscript' }),
            title: i18n.t('bubbleToolbar.subscript', { defaultValue: 'Subscript' }),
        },
    ]

    const normalizeLinkHref = (href: string) => {
        const value = href.trim()
        if (!value) return ''
        if (/^(https?:\/\/|mailto:|tel:|#)/i.test(value)) return value
        return `https://${value}`
    }

    const applyLinkFromSelection = (from: number, to: number, href: string) => {
        if (from === to) return
        const normalized = normalizeLinkHref(href)
        if (!normalized) return
        editor
            .chain()
            .focus()
            .setTextSelection({ from, to })
            .setLink({ href: normalized })
            .run()
    }

    const getLinkHrefFromSelection = (from: number, to: number) => {
        let found = ''
        editor.state.doc.nodesBetween(from, to, (node) => {
            const linkMark = node.marks?.find((mark) => mark.type.name === 'link')
            const href = linkMark?.attrs?.href
            if (typeof href === 'string' && href.trim()) {
                found = href.trim()
                return false
            }
            return undefined
        })
        return found || 'https://'
    }

    const handleLinkMouseDown = (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        const { from, to, empty } = editor.state.selection
        if (empty) return
        setLinkEditor({
            open: true,
            from,
            to,
            href: getLinkHrefFromSelection(from, to),
        })
    }

    const handleUnlinkMouseDown = (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        const { from, to, empty } = editor.state.selection
        if (empty || !editor.isActive('link')) return
        editor
            .chain()
            .focus()
            .setTextSelection({ from, to })
            .unsetLink()
            .run()
        setLinkEditor((prev) => ({ ...prev, open: false }))
    }

    const activeClass = 'bg-[var(--ds-button-primary-bg)] text-[var(--ds-text-neutral-inverse)]'
    const inactiveClass =
        'text-[var(--ds-text-neutral-secondary)] hover:bg-[var(--ds-fill-neutral-control)] hover:text-[var(--ds-text-neutral-primary)]'
    const iconClass = 'w-3.5 h-3.5'
    const showQuoteFontControls = editor.isActive('blockquote')
    const selectedImageWidthPercent = (() => {
        const selection = editor.state.selection
        if (selection instanceof NodeSelection && selection.node.type.name === 'image') {
            const raw = Number(selection.node.attrs?.widthPercent ?? 100)
            if (Number.isFinite(raw)) {
                return Math.max(10, Math.min(100, Math.round(raw)))
            }
        }
        return 100
    })()
    const selectedImageCaption = (() => {
        const selection = editor.state.selection
        if (selection instanceof NodeSelection && selection.node.type.name === 'image') {
            const raw = selection.node.attrs?.caption ?? selection.node.attrs?.title ?? ''
            return String(raw).trim()
        }
        return ''
    })()
    const selectedImageCaptionVisible = (() => {
        const selection = editor.state.selection
        if (selection instanceof NodeSelection && selection.node.type.name === 'image') {
            if (typeof selection.node.attrs?.captionVisible === 'boolean') return selection.node.attrs.captionVisible
            return selectedImageCaption.length > 0
        }
        return false
    })()

    const getActiveTableInfo = () => {
        const { $from, $to } = editor.state.selection
        for (let depth = $from.depth; depth >= 0; depth--) {
            const node = $from.node(depth)
            if (node.type?.name === 'table') {
                return { node, pos: depth > 0 ? $from.start(depth) - 1 : 0 }
            }
        }
        for (let depth = $to.depth; depth >= 0; depth--) {
            const node = $to.node(depth)
            if (node.type?.name === 'table') {
                return { node, pos: depth > 0 ? $to.start(depth) - 1 : 0 }
            }
        }
        return null
    }
    const hasTableContext = () => Boolean(getActiveTableInfo())
    const isTableNodeSelected = () =>
        editor.state.selection instanceof NodeSelection && editor.state.selection.node.type.name === 'table'

    const selectActiveTableNode = () => {
        const tableInfo = getActiveTableInfo()
        if (!tableInfo) return
        const tr = editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, tableInfo.pos))
        editor.view.dispatch(tr)
        editor.view.focus()
    }

    const getActiveTableColumnCount = () => {
        const tableInfo = getActiveTableInfo()
        if (!tableInfo) return 0
        let firstRow: typeof tableInfo.node | null = null
        for (let index = 0; index < tableInfo.node.content.childCount; index += 1) {
            const child = tableInfo.node.content.child(index)
            if (child.type.name === 'tableRow') {
                firstRow = child
                break
            }
        }
        if (!firstRow) return 0
        let count = 0
        for (let index = 0; index < firstRow.content.childCount; index += 1) {
            const cell = firstRow.content.child(index)
            const colspan = Number(cell.attrs?.colspan ?? 1)
            count += Number.isFinite(colspan) && colspan > 0 ? colspan : 1
        }
        return count
    }

    const getActiveTableFrameWidth = () => {
        const tableInfo = getActiveTableInfo()
        if (!tableInfo) return 0
        const tableDom = editor.view.nodeDOM(tableInfo.pos)
        if (!(tableDom instanceof HTMLTableElement)) return 0
        const wrapper = tableDom.closest('.tableWrapper')
        if (wrapper instanceof HTMLElement) {
            const wrapperWidth = wrapper.getBoundingClientRect().width
            if (Number.isFinite(wrapperWidth) && wrapperWidth > 0) return wrapperWidth
        }
        const tableWidth = tableDom.getBoundingClientRect().width
        if (Number.isFinite(tableWidth) && tableWidth > 0) return tableWidth
        return 0
    }

    const getActiveTableMaxColumns = () => {
        const frameWidth = getActiveTableFrameWidth()
        if (!(Number.isFinite(frameWidth) && frameWidth > 0)) return TABLE_MAX_COLUMNS_FALLBACK
        const dynamicMax = Math.floor(frameWidth / TABLE_MIN_VISIBLE_CELL_WIDTH)
        return Math.max(1, dynamicMax)
    }

    const canAddColumnWithLimit = () => {
        const current = getActiveTableColumnCount()
        if (current <= 0) return false
        return current < getActiveTableMaxColumns()
    }

    const runAddColumnWithLimit = (direction: 'before' | 'after') => {
        const current = getActiveTableColumnCount()
        const max = getActiveTableMaxColumns()
        if (current >= max) {
            showToast(i18n.t('bubbleToolbar.table.columnLimitReached', { max }), 'warning')
            return
        }
        if (direction === 'before') {
            editor.chain().focus().addColumnBefore().run()
            return
        }
        editor.chain().focus().addColumnAfter().run()
    }

    const applyTableFont = (font: 'serif' | 'sans') => {
        const tableInfo = getActiveTableInfo()
        if (!tableInfo) return
        const tr = editor.state.tr.setNodeMarkup(tableInfo.pos, undefined, {
            ...tableInfo.node.attrs,
            dataBlockFont: font,
        })
        editor.view.dispatch(tr)
    }

    const isTableFontActive = (font: 'serif' | 'sans') => {
        const tableInfo = getActiveTableInfo()
        return Boolean(tableInfo && tableInfo.node.attrs?.dataBlockFont === font)
    }

    const getActiveBlockNodeType = () => {
        if (TABLE_FEATURE_ENABLED && hasTableContext()) return 'table' as const
        if (editor.isActive('blockquote')) return 'blockquote' as const
        if (editor.isActive('heading')) return 'heading' as const
        return 'paragraph' as const
    }

    const applyBlockFont = (font: 'serif' | 'sans') => {
        const nodeType = getActiveBlockNodeType()
        const value = font
        if (nodeType === 'table') {
            applyTableFont(value)
            return
        }
        if (nodeType === 'blockquote') {
            editor.chain().focus().updateAttributes('blockquote', { dataBlockFont: value }).run()
            return
        }
        if (nodeType === 'heading') {
            editor.chain().focus().updateAttributes('heading', { dataBlockFont: value }).run()
            return
        }
        editor.chain().focus().updateAttributes('paragraph', { dataBlockFont: value }).run()
    }

    const isBlockFontActive = (font: 'serif' | 'sans') => {
        const target = font
        const nodeType = getActiveBlockNodeType()
        if (nodeType === 'table') return isTableFontActive(target)
        if (nodeType === 'blockquote') return editor.isActive('blockquote', { dataBlockFont: target })
        if (nodeType === 'heading') return editor.isActive('heading', { dataBlockFont: target })
        return editor.isActive('paragraph', { dataBlockFont: target })
    }

    if (editor.isActive('horizontalRule')) return null

    // 이미지 선택 시 툴바
    if (editor.isActive('image')) {
        return (
            <div className="flex items-center gap-1 rounded-lg border border-[var(--ds-border-neutral-default)] bg-[var(--ds-fill-neutral-panel)] px-1.5 py-1 shadow-xl">
                <button
                    type="button"
                    onMouseDown={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                    }}
                    onClick={() => editor.chain().focus().updateAttributes('image', { class: 'img-left' }).run()}
                    className={`px-2 h-7 text-xs rounded transition-colors ${editor.isActive('image', { class: 'img-left' }) ? activeClass : inactiveClass}`}
                    aria-label={i18n.t('bubbleToolbar.align.left', { defaultValue: 'Align left' })}
                >
                    {i18n.t('bubbleToolbar.align.left')}
                </button>
                <button
                    type="button"
                    onMouseDown={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                    }}
                    onClick={() => editor.chain().focus().updateAttributes('image', { class: 'img-center' }).run()}
                    className={`px-2 h-7 text-xs rounded transition-colors ${editor.isActive('image', { class: 'img-center' }) ? activeClass : inactiveClass}`}
                    aria-label={i18n.t('bubbleToolbar.align.center', { defaultValue: 'Align center' })}
                >
                    {i18n.t('bubbleToolbar.align.center')}
                </button>
                <button
                    type="button"
                    onMouseDown={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                    }}
                    onClick={() => editor.chain().focus().updateAttributes('image', { class: 'img-right' }).run()}
                    className={`px-2 h-7 text-xs rounded transition-colors ${editor.isActive('image', { class: 'img-right' }) ? activeClass : inactiveClass}`}
                    aria-label={i18n.t('bubbleToolbar.align.right', { defaultValue: 'Align right' })}
                >
                    {i18n.t('bubbleToolbar.align.right')}
                </button>
                <div className="mx-1 h-4 w-px bg-[var(--ds-border-neutral-subtle)]" />
                <span className="px-1 text-[10px] font-semibold uppercase tracking-[0.04em] text-[var(--ds-text-neutral-muted)]">
                    {i18n.t('bubbleToolbar.image.size', { defaultValue: 'Size' })}
                </span>
                {IMAGE_WIDTH_PRESETS.map((preset) => (
                    <button
                        key={preset}
                        type="button"
                        onMouseDown={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                        }}
                        onClick={() =>
                            editor
                                .chain()
                                .focus()
                                .updateAttributes('image', { widthPercent: preset })
                                .run()
                        }
                        className={`h-7 rounded px-2 text-xs transition-colors ${selectedImageWidthPercent === preset ? activeClass : inactiveClass}`}
                        aria-label={i18n.t('bubbleToolbar.image.sizePresetAria', {
                            value: preset,
                            defaultValue: `${preset}% width`,
                        })}
                        title={i18n.t('bubbleToolbar.image.sizePresetAria', {
                            value: preset,
                            defaultValue: `${preset}% width`,
                        })}
                    >
                        {i18n.t('bubbleToolbar.image.sizePreset', {
                            value: preset,
                            defaultValue: `${preset}%`,
                        })}
                    </button>
                ))}
                <div className="mx-1 h-4 w-px bg-[var(--ds-border-neutral-subtle)]" />
                <button
                    type="button"
                    onMouseDown={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                    }}
                    onClick={() =>
                        editor
                            .chain()
                            .focus()
                            .updateAttributes('image', {
                                captionVisible: !selectedImageCaptionVisible,
                            })
                            .run()
                    }
                    className={`h-7 rounded px-2 text-xs transition-colors ${selectedImageCaptionVisible ? activeClass : inactiveClass}`}
                    aria-label={i18n.t('bubbleToolbar.image.captionToggle', {
                        defaultValue: selectedImageCaptionVisible ? '캡션 숨기기' : '캡션 추가',
                    })}
                    title={i18n.t('bubbleToolbar.image.captionToggle', {
                        defaultValue: selectedImageCaptionVisible ? '캡션 숨기기' : '캡션 추가',
                    })}
                >
                    {i18n.t('bubbleToolbar.image.captionToggle', {
                        defaultValue: selectedImageCaptionVisible ? '캡션 숨기기' : '캡션 추가',
                    })}
                </button>
                <div className="mx-1 h-4 w-px bg-[var(--ds-border-neutral-subtle)]" />
                <button
                    type="button"
                    onMouseDown={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                    }}
                    onClick={() => editor.chain().focus().deleteSelection().run()}
                    className="h-7 rounded px-2 text-xs text-[var(--ds-text-danger-default)] transition-colors hover:bg-[var(--ds-fill-danger-weak)]"
                    aria-label={i18n.t('common.delete', { defaultValue: 'Delete' })}
                >
                    {i18n.t('common.delete')}
                </button>
            </div>
        )
    }

    if (TABLE_FEATURE_ENABLED && hasTableContext()) {
        const tableButtonClass = `h-7 shrink-0 whitespace-nowrap rounded px-2 text-xs transition-colors ${inactiveClass}`
        const tableButtonDisabledClass =
            'cursor-not-allowed text-[var(--ds-text-neutral-muted)] opacity-55 hover:bg-transparent hover:text-[var(--ds-text-neutral-muted)]'
        const tableFontButtonClass = (active: boolean) =>
            `h-7 shrink-0 whitespace-nowrap rounded px-2 text-xs transition-colors ${active ? activeClass : inactiveClass}`
        const tableGroups = [
            {
                key: 'structure',
                label: i18n.t('bubbleToolbar.tableGroup.structure'),
                actions: [
                    {
                        key: 'addRowBefore',
                        label: i18n.t('bubbleToolbar.table.addRowBefore'),
                        can: () => editor.can().chain().focus().addRowBefore().run(),
                        run: () => editor.chain().focus().addRowBefore().run(),
                    },
                    {
                        key: 'addRowAfter',
                        label: i18n.t('bubbleToolbar.table.addRowAfter'),
                        can: () => editor.can().chain().focus().addRowAfter().run(),
                        run: () => editor.chain().focus().addRowAfter().run(),
                    },
                    {
                        key: 'deleteRow',
                        label: i18n.t('bubbleToolbar.table.deleteRow'),
                        can: () => editor.can().chain().focus().deleteRow().run(),
                        run: () => editor.chain().focus().deleteRow().run(),
                    },
                    {
                        key: 'addColumnBefore',
                        label: i18n.t('bubbleToolbar.table.addColumnBefore'),
                        can: () => canAddColumnWithLimit() && editor.can().chain().focus().addColumnBefore().run(),
                        run: () => runAddColumnWithLimit('before'),
                    },
                    {
                        key: 'addColumnAfter',
                        label: i18n.t('bubbleToolbar.table.addColumnAfter'),
                        can: () => canAddColumnWithLimit() && editor.can().chain().focus().addColumnAfter().run(),
                        run: () => runAddColumnWithLimit('after'),
                    },
                    {
                        key: 'deleteColumn',
                        label: i18n.t('bubbleToolbar.table.deleteColumn'),
                        can: () => editor.can().chain().focus().deleteColumn().run(),
                        run: () => editor.chain().focus().deleteColumn().run(),
                    },
                ],
            },
            {
                key: 'cell',
                label: i18n.t('bubbleToolbar.tableGroup.cell'),
                actions: [
                    {
                        key: 'mergeCells',
                        label: i18n.t('bubbleToolbar.table.mergeCells'),
                        can: () => editor.can().chain().focus().mergeCells().run(),
                        run: () => editor.chain().focus().mergeCells().run(),
                    },
                    {
                        key: 'splitCell',
                        label: i18n.t('bubbleToolbar.table.splitCell'),
                        can: () => editor.can().chain().focus().splitCell().run(),
                        run: () => editor.chain().focus().splitCell().run(),
                    },
                ],
            },
            {
                key: 'header',
                label: i18n.t('bubbleToolbar.tableGroup.header'),
                actions: [
                    {
                        key: 'toggleHeaderRow',
                        label: i18n.t('bubbleToolbar.table.toggleHeaderRow'),
                        can: () => editor.can().chain().focus().toggleHeaderRow().run(),
                        run: () => editor.chain().focus().toggleHeaderRow().run(),
                    },
                    {
                        key: 'toggleHeaderColumn',
                        label: i18n.t('bubbleToolbar.table.toggleHeaderColumn'),
                        can: () => editor.can().chain().focus().toggleHeaderColumn().run(),
                        run: () => editor.chain().focus().toggleHeaderColumn().run(),
                    },
                    {
                        key: 'toggleHeaderCell',
                        label: i18n.t('bubbleToolbar.table.toggleHeaderCell'),
                        can: () => editor.can().chain().focus().toggleHeaderCell().run(),
                        run: () => editor.chain().focus().toggleHeaderCell().run(),
                    },
                ],
            },
            {
                key: 'table',
                label: i18n.t('bubbleToolbar.tableGroup.table'),
                actions: [
                    {
                        key: 'selectTable',
                        label: i18n.t('bubbleToolbar.table.selectTable'),
                        can: () => true,
                        run: () => selectActiveTableNode(),
                        active: () => isTableNodeSelected(),
                    },
                    {
                        key: 'deleteTable',
                        label: i18n.t('bubbleToolbar.table.deleteTable'),
                        can: () => editor.can().chain().focus().deleteTable().run(),
                        run: () => editor.chain().focus().deleteTable().run(),
                    },
                ],
            },
        ] as const

        return (
            <div className="max-w-[min(92vw,760px)] overflow-x-auto overflow-y-hidden rounded-lg border border-[var(--ds-border-neutral-default)] bg-[var(--ds-fill-neutral-panel)] px-1.5 py-1 shadow-xl">
                <div className="flex min-w-max items-center gap-1">
                    {tableGroups.map((group, groupIndex) => (
                        <div key={group.key} className="flex items-center gap-1">
                            <span className="px-1 text-[10px] font-semibold uppercase tracking-[0.04em] text-[var(--ds-text-neutral-muted)]">
                                {group.label}
                            </span>
                            {group.actions.map((action) => {
                                const enabled = action.can()
                                const active = action.active?.() ?? false
                                return (
                                    <button
                                        key={action.key}
                                        type="button"
                                        onClick={() => {
                                            if (!enabled) return
                                            action.run()
                                        }}
                                        className={`${active ? activeClass : tableButtonClass} ${enabled ? '' : tableButtonDisabledClass}`}
                                        aria-label={action.label}
                                        disabled={!enabled}
                                    >
                                        {action.label}
                                    </button>
                                )
                            })}
                            {groupIndex < tableGroups.length - 1 ? (
                                <div className="mx-1 h-4 w-px shrink-0 bg-[var(--ds-border-neutral-subtle)]" />
                            ) : null}
                        </div>
                    ))}
                    <div className="mx-1 h-4 w-px shrink-0 bg-[var(--ds-border-neutral-subtle)]" />
                    <button
                        type="button"
                        onClick={() => applyBlockFont('serif')}
                        className={tableFontButtonClass(isBlockFontActive('serif'))}
                        aria-label={i18n.t('bubbleToolbar.font.serif')}
                    >
                        {i18n.t('bubbleToolbar.font.serif')}
                    </button>
                    <button
                        type="button"
                        onClick={() => applyBlockFont('sans')}
                        className={tableFontButtonClass(isBlockFontActive('sans'))}
                        aria-label={i18n.t('bubbleToolbar.font.sans')}
                    >
                        {i18n.t('bubbleToolbar.font.sans')}
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="relative flex items-center gap-0.5 rounded-lg border border-[var(--ds-border-neutral-default)] bg-[var(--ds-fill-neutral-panel)] px-1.5 py-1 shadow-xl">
            {formats.map(({ label, isActive, action, ariaLabel, title }) => (
                <button
                    key={label}
                    type="button"
                    onClick={action}
                    className={`w-7 h-7 text-xs rounded font-semibold transition-colors ${isActive() ? activeClass : inactiveClass}`}
                    aria-label={ariaLabel}
                    title={title}
                    style={
                        label === 'I'
                            ? { fontStyle: 'italic' }
                            : label === 'S'
                                ? { textDecoration: 'line-through' }
                                : {}
                    }
                >
                    {label}
                </button>
            ))}

            <div className="mx-1 h-4 w-px bg-[var(--ds-border-neutral-subtle)]" />

            {alignments.map(({ label, isActive, action, ariaLabel, title }) => (
                <button
                    key={label}
                    type="button"
                    onClick={action}
                    className={`w-7 h-7 flex items-center justify-center text-xs rounded font-semibold transition-colors ${isActive() ? activeClass : inactiveClass}`}
                    title={title}
                    aria-label={ariaLabel}
                >
                    {label === alignLeftShort && (
                        <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7h14M4 12h10M4 17h14" />
                        </svg>
                    )}
                    {label === alignCenterShort && (
                        <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 7h14M7 12h10M5 17h14" />
                        </svg>
                    )}
                    {label === alignRightShort && (
                        <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 7h14M10 12h10M6 17h14" />
                        </svg>
                    )}
                </button>
            ))}

            <div className="mx-1 h-4 w-px bg-[var(--ds-border-neutral-subtle)]" />

            <button
                type="button"
                onMouseDown={handleLinkMouseDown}
                onClick={() => {
                    const { from, to, empty } = editor.state.selection
                    if (empty) return
                    setLinkEditor({
                        open: true,
                        from,
                        to,
                        href: getLinkHrefFromSelection(from, to),
                    })
                }}
                disabled={!canLink}
                className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${canLink
                        ? editor.isActive('link')
                            ? activeClass
                            : inactiveClass
                        : 'cursor-not-allowed bg-[var(--ds-fill-neutral-control)] text-[var(--ds-text-neutral-muted)] opacity-60'
                    }`}
                title={i18n.t('bubbleToolbar.link.applyTitle')}
                aria-label={i18n.t('bubbleToolbar.link.applyTitle', { defaultValue: 'Apply link' })}
            >
                <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14a5 5 0 007.07 0l1.41-1.41a5 5 0 10-7.07-7.07L10 7M14 10a5 5 0 00-7.07 0L5.5 11.43a5 5 0 107.07 7.07L14 17" />
                </svg>
            </button>
            <button
                type="button"
                onMouseDown={handleUnlinkMouseDown}
                onClick={() => {
                    const { from, to, empty } = editor.state.selection
                    if (empty || !editor.isActive('link')) return
                    editor
                        .chain()
                        .focus()
                        .setTextSelection({ from, to })
                        .unsetLink()
                        .run()
                    setLinkEditor((prev) => ({ ...prev, open: false }))
                }}
                disabled={!canUnlink}
                className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${canUnlink ? inactiveClass : 'cursor-not-allowed bg-[var(--ds-fill-neutral-control)] text-[var(--ds-text-neutral-muted)] opacity-60'
                    }`}
                title={i18n.t('bubbleToolbar.link.removeTitle')}
                aria-label={i18n.t('bubbleToolbar.link.removeTitle', { defaultValue: 'Remove link' })}
            >
                <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.83 10.17a4 4 0 010 5.66l-2 2a4 4 0 11-5.66-5.66l1.41-1.41M10.17 13.83a4 4 0 010-5.66l2-2a4 4 0 115.66 5.66l-1.41 1.41M3 3l18 18" />
                </svg>
            </button>

            <button
                type="button"
                onClick={() => {
                    editor
                        .chain()
                        .focus()
                        .setParagraph()
                        .toggleCleanBlockquote()
                        .updateAttributes('blockquote', { class: null, dataBlockFont: 'serif' })
                        .run()
                }}
                className={`px-2 h-7 text-xs rounded transition-colors ${editor.isActive('blockquote') && !editor.isActive('blockquote', { class: 'callout' }) ? activeClass : inactiveClass}`}
                aria-label={i18n.t('bubbleToolbar.quote', { defaultValue: 'Quote' })}
                title={i18n.t('bubbleToolbar.quote')}
            >
                "
            </button>

            {showQuoteFontControls && (
                <>
                    <div className="mx-1 h-4 w-px bg-[var(--ds-border-neutral-subtle)]" />
                    <button
                        type="button"
                        onClick={() => applyBlockFont('serif')}
                        className={`px-2 h-7 text-xs rounded transition-colors ${isBlockFontActive('serif') ? activeClass : inactiveClass}`}
                        title={i18n.t('bubbleToolbar.font.serifTitle')}
                        aria-label={i18n.t('bubbleToolbar.font.serif')}
                    >
                        {i18n.t('bubbleToolbar.font.serif')}
                    </button>
                    <button
                        type="button"
                        onClick={() => applyBlockFont('sans')}
                        className={`px-2 h-7 text-xs rounded transition-colors ${isBlockFontActive('sans') ? activeClass : inactiveClass}`}
                        title={i18n.t('bubbleToolbar.font.sansTitle')}
                        aria-label={i18n.t('bubbleToolbar.font.sans')}
                    >
                        {i18n.t('bubbleToolbar.font.sans')}
                    </button>
                    <div className="mx-1 h-4 w-px bg-[var(--ds-border-neutral-subtle)]" />
                </>
            )}

            {scripts.map(({ label, isActive, action, ariaLabel, title }) => (
                <button
                    key={label}
                    type="button"
                    onClick={action}
                    className={`px-2 h-7 text-xs rounded font-semibold transition-colors ${isActive() ? activeClass : inactiveClass}`}
                    title={title}
                    aria-label={ariaLabel}
                >
                    <span aria-hidden="true">{label === 'sup' ? 'x²' : 'x₂'}</span>
                    <span className="sr-only">
                        {label === 'sup' ? i18n.t('bubbleToolbar.superscript') : i18n.t('bubbleToolbar.subscript')}
                    </span>
                </button>
            ))}

            {linkEditor.open && (
                <div
                    className="absolute left-1/2 top-full z-30 mt-2 w-72 -translate-x-1/2 rounded-md border border-[var(--ds-border-neutral-default)] bg-[var(--ds-fill-neutral-panel)] p-2 shadow-2xl"
                    onMouseDown={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                    }}
                >
                    <label htmlFor={linkTargetInputId} className="mb-1 block text-xs text-[var(--ds-text-neutral-muted)]">
                        {i18n.t('bubbleToolbar.link.target')}
                    </label>
                    <input
                        id={linkTargetInputId}
                        autoFocus
                        type="text"
                        value={linkEditor.href}
                        onChange={(e) => setLinkEditor((prev) => ({ ...prev, href: e.target.value }))}
                        onKeyDown={(e) => {
                            if (e.key === 'Escape') {
                                setLinkEditor((prev) => ({ ...prev, open: false }))
                                return
                            }
                            if (e.key === 'Enter') {
                                applyLinkFromSelection(linkEditor.from, linkEditor.to, linkEditor.href)
                                setLinkEditor((prev) => ({ ...prev, open: false }))
                            }
                        }}
                        className="h-8 w-full rounded border border-[var(--ds-border-neutral-default)] bg-[var(--ds-fill-neutral-control)] px-2 text-xs text-[var(--ds-text-neutral-secondary)] outline-none focus:border-[var(--ds-border-brand-weak)]"
                        placeholder={i18n.t('bubbleToolbar.link.placeholder')}
                    />
                    <div className="mt-2 flex justify-end gap-1">
                        <button
                            type="button"
                            onClick={() => setLinkEditor((prev) => ({ ...prev, open: false }))}
                            onMouseDown={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                setLinkEditor((prev) => ({ ...prev, open: false }))
                            }}
                            aria-label={i18n.t('common.cancel')}
                            className="h-7 rounded bg-[var(--ds-fill-neutral-control)] px-2 text-xs text-[var(--ds-text-neutral-secondary)] hover:bg-[var(--ds-fill-neutral-control-hover)]"
                        >
                            {i18n.t('common.cancel')}
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                applyLinkFromSelection(linkEditor.from, linkEditor.to, linkEditor.href)
                                setLinkEditor((prev) => ({ ...prev, open: false }))
                            }}
                            onMouseDown={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                applyLinkFromSelection(linkEditor.from, linkEditor.to, linkEditor.href)
                                setLinkEditor((prev) => ({ ...prev, open: false }))
                            }}
                            aria-label={i18n.t('common.confirm')}
                            className="h-7 rounded bg-[var(--ds-button-primary-bg)] px-2 text-xs text-[var(--ds-text-neutral-inverse)] hover:bg-[var(--ds-button-primary-bg-hover)]"
                        >
                            {i18n.t('common.confirm')}
                        </button>
                    </div>
                </div>
            )}

        </div>
    )
}
