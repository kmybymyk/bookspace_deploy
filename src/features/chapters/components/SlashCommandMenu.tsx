import { useEffect, useMemo, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import {
    Heading2,
    Heading3,
    Heading4,
    Heading5,
    Heading6,
    Minus,
    MinusSquare,
    Spline,
    Image as ImageIcon,
    List,
    ListOrdered,
    Quote,
    SquarePen,
} from 'lucide-react'
import i18n from '../../../i18n'
import { showToast } from '../../../utils/toast'
import {
    isPreferredImageMime,
    isSupportedImageMime,
    loadImageDimensions,
    MAX_IMAGE_FILE_BYTES,
    MAX_IMAGE_DIMENSION_PX,
    resolveFileMime,
    SUPPORTED_IMAGE_MIME,
} from '../../../utils/imagePolicy'

type CommandSection = 'block' | 'extra'

interface Command {
    id: string
    icon: React.ReactNode
    label: string
    description: string
    section: CommandSection
    keywords?: string[]
    action: (editor: Editor) => void
}

const SECTION_LABEL: Record<CommandSection, string> = {
    block: i18n.t('slashCommand.sections.block'),
    extra: i18n.t('slashCommand.sections.extra'),
}

const BODY_IMAGE_MIN_WIDTH = 800
const BODY_IMAGE_MIN_HEIGHT = 800

const COMMAND_ALIAS_KEYWORDS: Record<string, string[]> = {
    h2: ['소제목', '헤딩', '제목'],
    h3: ['본문', '헤딩', '제목'],
    h4: ['스타일1', '스타일 1', '헤딩'],
    h5: ['스타일2', '스타일 2', '헤딩'],
    h6: ['스타일3', '스타일 3', '헤딩'],
    'ornamental-break': ['구분선', '라인', '선'],
    'ornamental-break-dotted': ['점선', '구분선'],
    'ornamental-break-double': ['이중선', '구분선'],
    image: ['이미지', '사진'],
    'list-bullet': ['글머리', '목록', '불릿'],
    'list-number': ['번호', '목록', '리스트'],
    'block-quotation': ['인용', '인용문'],
    'written-note': ['메모', '노트', '박스'],
}

function normalizeSearchToken(value: string): string {
    return value.toLocaleLowerCase().replace(/\s+/g, '').trim()
}

function requestImageAlt(promptMessage: string): string {
    try {
        if (typeof window.prompt !== 'function') return ''
        return window.prompt(promptMessage, '') ?? ''
    } catch {
        return ''
    }
}

const COMMANDS: Command[] = [
    {
        id: 'h2',
        icon: <Heading2 size={16} />,
        label: i18n.t('slashCommand.items.h2.label'),
        description: i18n.t('slashCommand.items.h2.description'),
        section: 'block',
        keywords: [i18n.t('slashCommand.items.h2.keyword1'), i18n.t('slashCommand.items.h2.keyword2'), 'h2', 'heading'],
        action: (editor) => editor.chain().focus().setNode('heading', { level: 2 }).run(),
    },
    {
        id: 'h3',
        icon: <Heading3 size={16} />,
        label: i18n.t('slashCommand.items.h3.label'),
        description: i18n.t('slashCommand.items.h3.description'),
        section: 'block',
        keywords: [i18n.t('slashCommand.items.h3.keyword1'), 'h3', 'heading'],
        action: (editor) => editor.chain().focus().setNode('heading', { level: 3 }).run(),
    },
    {
        id: 'h4',
        icon: <Heading4 size={16} />,
        label: i18n.t('slashCommand.items.h4.label'),
        description: i18n.t('slashCommand.items.h4.description'),
        section: 'block',
        keywords: [i18n.t('slashCommand.items.h4.keyword1'), i18n.t('slashCommand.items.h4.keyword2'), i18n.t('slashCommand.items.h4.keyword3'), 'h4', 'heading'],
        action: (editor) => editor.chain().focus().setNode('heading', { level: 4 }).run(),
    },
    {
        id: 'h5',
        icon: <Heading5 size={16} />,
        label: i18n.t('slashCommand.items.h5.label'),
        description: i18n.t('slashCommand.items.h5.description'),
        section: 'block',
        keywords: [i18n.t('slashCommand.items.h5.keyword1'), i18n.t('slashCommand.items.h5.keyword2'), i18n.t('slashCommand.items.h5.keyword3'), 'h5', 'heading'],
        action: (editor) => editor.chain().focus().setNode('heading', { level: 5 }).run(),
    },
    {
        id: 'h6',
        icon: <Heading6 size={16} />,
        label: i18n.t('slashCommand.items.h6.label'),
        description: i18n.t('slashCommand.items.h6.description'),
        section: 'block',
        keywords: [i18n.t('slashCommand.items.h6.keyword1'), i18n.t('slashCommand.items.h6.keyword2'), i18n.t('slashCommand.items.h6.keyword3'), 'h6', 'heading'],
        action: (editor) => editor.chain().focus().setNode('heading', { level: 6 }).run(),
    },
    {
        id: 'ornamental-break',
        icon: <Minus size={16} />,
        label: i18n.t('slashCommand.items.ruleSolid.label'),
        description: i18n.t('slashCommand.items.ruleSolid.description'),
        section: 'block',
        keywords: [i18n.t('slashCommand.items.ruleSolid.keyword1'), i18n.t('slashCommand.items.ruleSolid.keyword2'), 'line', 'hr'],
        action: (editor) =>
            editor
                .chain()
                .focus()
                .insertContent([
                    { type: 'horizontalRule', attrs: { class: 'rule-solid' } },
                    { type: 'paragraph' },
                ])
                .run(),
    },
    {
        id: 'ornamental-break-dotted',
        icon: <MinusSquare size={16} />,
        label: i18n.t('slashCommand.items.ruleDotted.label'),
        description: i18n.t('slashCommand.items.ruleDotted.description'),
        section: 'block',
        keywords: [i18n.t('slashCommand.items.ruleDotted.keyword1'), i18n.t('slashCommand.items.ruleDotted.keyword2'), 'dotted', 'hr'],
        action: (editor) =>
            editor
                .chain()
                .focus()
                .insertContent([
                    { type: 'horizontalRule', attrs: { class: 'rule-dotted' } },
                    { type: 'paragraph' },
                ])
                .run(),
    },
    {
        id: 'ornamental-break-double',
        icon: <Spline size={16} />,
        label: i18n.t('slashCommand.items.ruleDouble.label'),
        description: i18n.t('slashCommand.items.ruleDouble.description'),
        section: 'block',
        keywords: [i18n.t('slashCommand.items.ruleDouble.keyword1'), i18n.t('slashCommand.items.ruleDouble.keyword2'), 'double', 'hr'],
        action: (editor) =>
            editor
                .chain()
                .focus()
                .insertContent([
                    { type: 'horizontalRule', attrs: { class: 'rule-double' } },
                    { type: 'paragraph' },
                ])
                .run(),
    },
    {
        id: 'image',
        icon: <ImageIcon size={16} />,
        label: i18n.t('slashCommand.items.image.label'),
        description: i18n.t('slashCommand.items.image.description'),
        section: 'block',
        keywords: ['img', i18n.t('slashCommand.items.image.keyword1')],
        action: (editor) => {
            const input = document.createElement('input')
            input.type = 'file'
            input.accept = SUPPORTED_IMAGE_MIME.join(',')
            input.onchange = () => {
                const file = input.files?.[0]
                if (!file) return
                if (file.size > MAX_IMAGE_FILE_BYTES) {
                    showToast(
                        i18n.t('rightPane.imageMaxFileSize', {
                            sizeMB: Math.floor(MAX_IMAGE_FILE_BYTES / (1024 * 1024)),
                        }),
                        'error',
                    )
                    return
                }
                const mime = resolveFileMime(file)
                if (!mime || !isSupportedImageMime(mime)) {
                    showToast(i18n.t('rightPane.unsupportedImageType'), 'error')
                    return
                }
                if (!isPreferredImageMime(mime)) {
                    showToast(i18n.t('rightPane.imagePreferredFormatHint'), 'info')
                }
                void loadImageDimensions(file).then((size) => {
                    if (!size) {
                        showToast(i18n.t('rightPane.unsupportedImageType'), 'error')
                        return
                    }
                    if (size.width > MAX_IMAGE_DIMENSION_PX || size.height > MAX_IMAGE_DIMENSION_PX) {
                        showToast(
                            i18n.t('rightPane.imageMaxDimensions', {
                                width: size.width,
                                height: size.height,
                                max: MAX_IMAGE_DIMENSION_PX,
                            }),
                            'error',
                        )
                        return
                    }
                    if (size.width < BODY_IMAGE_MIN_WIDTH || size.height < BODY_IMAGE_MIN_HEIGHT) {
                        showToast(
                            i18n.t('rightPane.imageMinDimensions', {
                                label: i18n.t('slashCommand.items.image.label'),
                                width: size.width,
                                height: size.height,
                                minWidth: BODY_IMAGE_MIN_WIDTH,
                                minHeight: BODY_IMAGE_MIN_HEIGHT,
                            }),
                            'info',
                        )
                    }
                    const reader = new FileReader()
                    reader.onload = () => {
                        const src = String(reader.result ?? '')
                        if (!src) return
                        const alt = requestImageAlt(
                            i18n.t('bookEditor.imageAltPrompt', {
                                defaultValue: '이미지 설명(대체 텍스트)을 입력하세요. 필요 없으면 비워두세요.',
                            }),
                        )
                        const imageAttrs = { src, alt: alt.trim(), widthPercent: 100 }
                        const inserted = editor
                            .chain()
                            .focus()
                            .setImage(imageAttrs)
                            .run()
                        if (!inserted) {
                            const fallbackInserted = editor
                                .chain()
                                .focus('end')
                                .insertContent({ type: 'image', attrs: imageAttrs })
                                .run()
                            if (!fallbackInserted) {
                                showToast(
                                    i18n.t('bookEditor.imageInsertCommandFailed', {
                                        defaultValue:
                                            '이미지 삽입 위치를 찾지 못했습니다. 커서를 본문에 두고 다시 시도해 주세요.',
                                    }),
                                    'error',
                                )
                            }
                        }
                    }
                    reader.readAsDataURL(file)
                })
            }
            input.click()
        },
    },
    {
        id: 'list-bullet',
        icon: <List size={16} />,
        label: i18n.t('slashCommand.items.listBullet.label'),
        description: i18n.t('slashCommand.items.listBullet.description'),
        section: 'block',
        keywords: ['list', i18n.t('slashCommand.items.listBullet.keyword1'), i18n.t('slashCommand.items.listBullet.keyword2'), 'bullet'],
        action: (editor) => editor.chain().focus().toggleBulletList().updateAttributes('bulletList', { class: null }).run(),
    },
    {
        id: 'list-number',
        icon: <ListOrdered size={16} />,
        label: i18n.t('slashCommand.items.listNumber.label'),
        description: i18n.t('slashCommand.items.listNumber.description'),
        section: 'block',
        keywords: ['list', i18n.t('slashCommand.items.listNumber.keyword1'), i18n.t('slashCommand.items.listNumber.keyword2'), 'number', 'ordered'],
        action: (editor) => editor.chain().focus().toggleOrderedList().run(),
    },
    {
        id: 'block-quotation',
        icon: <Quote size={16} />,
        label: i18n.t('slashCommand.items.blockquote.label'),
        description: i18n.t('slashCommand.items.blockquote.description'),
        section: 'block',
        keywords: ['quote', 'blockquote', i18n.t('slashCommand.items.blockquote.keyword1')],
        action: (editor) => {
            editor
                .chain()
                .focus()
                .setParagraph()
                .toggleCleanBlockquote()
                .updateAttributes('blockquote', { class: null, dataBlockFont: 'serif' })
                .run()
        },
    },
    {
        id: 'written-note',
        icon: <SquarePen size={16} />,
        label: i18n.t('slashCommand.items.note.label'),
        description: i18n.t('slashCommand.items.note.description'),
        section: 'block',
        keywords: ['note', i18n.t('slashCommand.items.note.keyword1'), i18n.t('slashCommand.items.note.keyword2')],
        action: (editor) => {
            editor
                .chain()
                .focus()
                .setParagraph()
                .toggleCleanBlockquote()
                .updateAttributes('blockquote', { class: 'quote-note', dataBlockFont: 'serif' })
                .run()
        },
    },
]

interface Props {
    editor: Editor
    visible: boolean
    position: { top: number; left: number }
    query: string
    onClose: () => void
}

export default function SlashCommandMenu({ editor, visible, position, query, onClose }: Props) {
    const [activeIndex, setActiveIndex] = useState(0)
    const containerRef = useRef<HTMLDivElement>(null)

    const filtered = useMemo(
        () =>
            COMMANDS.filter((c) => {
                if (query === '') return true
                const q = normalizeSearchToken(query)
                if (!q) return true
                const searchPool = [
                    c.label,
                    c.description,
                    c.id,
                    ...(c.keywords ?? []),
                    ...(COMMAND_ALIAS_KEYWORDS[c.id] ?? []),
                ]
                return searchPool.some((value) => normalizeSearchToken(value).includes(q))
            }),
        [query],
    )

    const getSlashCommandRange = () => {
        const { selection } = editor.state
        const { from, empty } = selection
        if (!empty) return null
        const $from = editor.state.doc.resolve(from)
        const textBeforeCursor = $from.parent.textBetween(0, $from.parentOffset, '\n', '\n')
        const slashIndex = textBeforeCursor.lastIndexOf('/')

        if (slashIndex < 0) return null
        if (slashIndex > 0 && !/\s/.test(textBeforeCursor[slashIndex - 1] ?? '')) return null

        const slashQuery = textBeforeCursor.slice(slashIndex + 1)
        if (slashQuery.includes(' ') || slashQuery.includes('\n')) return null

        const slashFrom = from - (slashQuery.length + 1)
        if (!Number.isFinite(slashFrom) || slashFrom < 1 || slashFrom > from) return null

        return { from: slashFrom, to: from }
    }

    const executeCommand = (command: Command) => {
        const slashRange = getSlashCommandRange()
        if (!slashRange && query.length > 0) {
            onClose()
            return
        }

        if (slashRange) {
            editor.chain().focus().deleteRange(slashRange).run()
        } else {
            editor.chain().focus().run()
        }

        command.action(editor)
        onClose()
    }

    useEffect(() => {
        setActiveIndex(0)
    }, [query])

    useEffect(() => {
        if (!visible) return
        const container = containerRef.current
        if (!container) return
        const activeEl = container.querySelector<HTMLElement>(`[data-menu-index="${activeIndex}"]`)
        activeEl?.scrollIntoView({ block: 'nearest' })
    }, [activeIndex, filtered.length, visible])

    useEffect(() => {
        if (!visible) return
        const handleKey = (e: KeyboardEvent) => {
            if (e.isComposing || (e as KeyboardEvent & { keyCode?: number }).keyCode === 229) return

            if (filtered.length === 0) {
                if (e.key === 'Escape') {
                    e.preventDefault()
                    onClose()
                }
                return
            }

            if (e.key === 'Escape') {
                e.preventDefault()
                onClose()
                return
            }
            if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActiveIndex((i) => (i + 1) % filtered.length)
                return
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActiveIndex((i) => (i - 1 + filtered.length) % filtered.length)
                return
            }
            if (e.key === 'Enter' && filtered[activeIndex]) {
                e.preventDefault()
                executeCommand(filtered[activeIndex])
            }
        }

        window.addEventListener('keydown', handleKey, true)
        return () => window.removeEventListener('keydown', handleKey, true)
    }, [activeIndex, filtered, onClose, visible]) // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!visible) return
        const handleClick = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) onClose()
        }
        document.addEventListener('mousedown', handleClick)
        return () => document.removeEventListener('mousedown', handleClick)
    }, [onClose, visible])

    if (!visible) return null
    if (filtered.length === 0) return null

    const topPos = Math.min(position.top + 4, window.innerHeight - 320)
    const leftPos = Math.min(position.left, window.innerWidth - 280)

    return (
        <div
            role="listbox"
            aria-label={i18n.t('slashCommand.insertBlock')}
            ref={containerRef}
            className="fixed z-50 w-64 bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl overflow-hidden py-1 max-h-[340px] overflow-y-auto custom-scrollbar"
            style={{ top: topPos, left: leftPos }}
        >
            <div className="px-3 py-1.5 text-xs text-neutral-400 font-medium border-b border-neutral-800">{i18n.t('slashCommand.insertBlock')}</div>
            {filtered.map((cmd, index) => {
                const prev = filtered[index - 1]
                const showSection = index === 0 || prev.section !== cmd.section
                return (
                    <div key={cmd.id}>
                        {showSection && (
                            <div className="px-3 pt-2 pb-1 text-xs font-semibold text-neutral-500 border-t border-neutral-800/70 first:border-t-0">
                                {SECTION_LABEL[cmd.section]}
                            </div>
                        )}
                        <button
                            role="option"
                            aria-selected={index === activeIndex}
                            tabIndex={index === activeIndex ? 0 : -1}
                            onClick={() => executeCommand(cmd)}
                            onMouseEnter={() => setActiveIndex(index)}
                            data-menu-index={index}
                            className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${index === activeIndex ? 'bg-brand-500/10 text-brand-400' : 'text-neutral-300 hover:bg-neutral-800'
                                }`}
                        >
                            <span className="w-7 h-7 flex items-center justify-center rounded-md bg-neutral-800 text-xs text-neutral-400 flex-shrink-0">
                                {cmd.icon}
                            </span>
                            <div className="text-xs font-medium leading-tight">{cmd.label}</div>
                        </button>
                    </div>
                )
            })}
        </div>
    )
}
